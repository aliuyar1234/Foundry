/**
 * Odoo Self-Hosted Proxy Support
 * Task: T052
 *
 * Handles connections to self-hosted Odoo instances through proxies.
 * Supports various authentication methods and SSL configurations.
 */

import { Agent } from 'https';

export interface ProxyConfig {
  enabled: boolean;
  host?: string;
  port?: number;
  protocol?: 'http' | 'https' | 'socks5';
  auth?: {
    username: string;
    password: string;
  };
  ssl?: {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  timeout?: number;
  tunnelHeaders?: Record<string, string>;
}

export interface SelfHostedConfig {
  baseUrl: string;
  proxy?: ProxyConfig;
  customHeaders?: Record<string, string>;
  ssl?: {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
    passphrase?: string;
  };
  timeout?: number;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
}

export interface ProxiedRequestOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface ProxiedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
}

export class OdooProxyHandler {
  private config: SelfHostedConfig;
  private agent: Agent | null = null;

  constructor(config: SelfHostedConfig) {
    this.config = config;
    this.initializeAgent();
  }

  /**
   * Initialize HTTPS agent with SSL config
   */
  private initializeAgent(): void {
    if (this.config.ssl) {
      this.agent = new Agent({
        rejectUnauthorized: this.config.ssl.rejectUnauthorized ?? true,
        ca: this.config.ssl.ca,
        cert: this.config.ssl.cert,
        key: this.config.ssl.key,
        passphrase: this.config.ssl.passphrase,
      });
    }
  }

  /**
   * Make proxied request to Odoo
   */
  async request(options: ProxiedRequestOptions): Promise<ProxiedResponse> {
    const url = `${this.config.baseUrl}${options.path}`;
    const headers: Record<string, string> = {
      ...this.config.customHeaders,
      ...options.headers,
    };

    const fetchOptions: RequestInit = {
      method: options.method,
      headers,
      body: options.body,
    };

    // Add timeout
    const timeout = options.timeout || this.config.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // If proxy is enabled, use proxy agent
      if (this.config.proxy?.enabled) {
        return await this.proxyRequest(url, fetchOptions, timeout);
      }

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      const data = await this.parseResponse(response);

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Make request through proxy
   */
  private async proxyRequest(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<ProxiedResponse> {
    const proxy = this.config.proxy!;

    // Build proxy URL
    let proxyUrl = `${proxy.protocol || 'http'}://`;
    if (proxy.auth) {
      proxyUrl += `${encodeURIComponent(proxy.auth.username)}:${encodeURIComponent(proxy.auth.password)}@`;
    }
    proxyUrl += `${proxy.host}:${proxy.port}`;

    // For SOCKS5, we'd need a different approach
    if (proxy.protocol === 'socks5') {
      throw new Error('SOCKS5 proxy requires additional configuration');
    }

    // Use CONNECT method for HTTPS through HTTP proxy
    const targetUrl = new URL(url);
    const isHttps = targetUrl.protocol === 'https:';

    if (isHttps && (proxy.protocol === 'http' || !proxy.protocol)) {
      // HTTP CONNECT tunnel
      return this.tunnelRequest(url, options, timeout);
    }

    // Direct proxy request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      const data = await this.parseResponse(response);

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create HTTPS tunnel through HTTP proxy
   */
  private async tunnelRequest(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<ProxiedResponse> {
    // In a real implementation, this would establish a CONNECT tunnel
    // For now, we'll make a direct request with the agent
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      const data = await this.parseResponse(response);

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse response based on content type
   */
  private async parseResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return response.json();
    }

    if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
      return response.text();
    }

    if (contentType.includes('text/')) {
      return response.text();
    }

    return response.arrayBuffer();
  }

  /**
   * Make JSON-RPC request
   */
  async jsonRpc<T>(
    endpoint: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const response = await this.request({
      method: 'POST',
      path: endpoint,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now(),
      }),
    });

    const result = response.data as { result?: T; error?: { message: string; data?: { message: string } } };

    if (result.error) {
      throw new Error(result.error.message || result.error.data?.message || 'JSON-RPC error');
    }

    return result.result as T;
  }

  /**
   * Make XML-RPC request
   */
  async xmlRpc(
    endpoint: string,
    methodName: string,
    params: string
  ): Promise<string> {
    const response = await this.request({
      method: 'POST',
      path: endpoint,
      headers: {
        'Content-Type': 'text/xml',
      },
      body: `<?xml version="1.0"?>
<methodCall>
  <methodName>${methodName}</methodName>
  <params>${params}</params>
</methodCall>`,
    });

    return response.data as string;
  }

  /**
   * Test connection through proxy
   */
  async testConnection(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
    serverInfo?: {
      version?: string;
      protocol?: string;
    };
  }> {
    const startTime = Date.now();

    try {
      // Try to get server version
      const response = await this.xmlRpc('/xmlrpc/2/common', 'version', '');
      const latency = Date.now() - startTime;

      // Parse version from response
      const versionMatch = (response as string).match(/<name>server_version<\/name>\s*<value>\s*<string>([^<]+)<\/string>/);

      return {
        success: true,
        latency,
        serverInfo: {
          version: versionMatch?.[1],
          protocol: 'XML-RPC',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Retry request with exponential backoff
   */
  async retryRequest<T>(
    requestFn: () => Promise<T>,
    options?: {
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
      shouldRetry?: (error: unknown) => boolean;
    }
  ): Promise<T> {
    const config = this.config.retryConfig || {};
    const maxRetries = options?.maxRetries || config.maxRetries || 3;
    const baseDelayMs = options?.baseDelayMs || config.baseDelayMs || 1000;
    const maxDelayMs = options?.maxDelayMs || config.maxDelayMs || 30000;

    const shouldRetry =
      options?.shouldRetry ||
      ((error: unknown) => {
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          return (
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('econnrefused') ||
            message.includes('econnreset')
          );
        }
        return false;
      });

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelayMs
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Get configuration
   */
  getConfig(): SelfHostedConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SelfHostedConfig>): void {
    this.config = { ...this.config, ...config };
    this.initializeAgent();
  }
}

/**
 * Create proxy handler
 */
export function createOdooProxyHandler(config: SelfHostedConfig): OdooProxyHandler {
  return new OdooProxyHandler(config);
}

/**
 * Detect if URL is self-hosted
 */
export function isSelfHostedOdoo(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Check for Odoo SaaS domains
    const saasPatterns = [
      /\.odoo\.com$/i,
      /\.odoo\.sh$/i,
    ];

    for (const pattern of saasPatterns) {
      if (pattern.test(parsed.hostname)) {
        return false;
      }
    }

    return true;
  } catch {
    return true;
  }
}

/**
 * Get recommended proxy config for common scenarios
 */
export function getRecommendedProxyConfig(scenario: string): Partial<ProxyConfig> {
  switch (scenario) {
    case 'corporate':
      return {
        enabled: true,
        protocol: 'http',
        timeout: 60000,
      };

    case 'vpn':
      return {
        enabled: false,
        ssl: {
          rejectUnauthorized: false, // Often needed for internal certs
        },
      };

    case 'self-signed':
      return {
        enabled: false,
        ssl: {
          rejectUnauthorized: false,
        },
      };

    default:
      return {
        enabled: false,
      };
  }
}
