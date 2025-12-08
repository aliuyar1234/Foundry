/**
 * SAP B1 Session Management
 * Task: T059
 *
 * Manages SAP B1 Service Layer sessions with automatic refresh.
 * Handles session pooling and timeout management.
 */

import { SapB1AuthHandler, SapB1AuthConfig, SapB1AuthResult } from './auth';

export interface SessionInfo {
  sessionId: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  version: string;
  companyDb: string;
}

export interface SessionManagerConfig extends SapB1AuthConfig {
  sessionTimeout?: number; // minutes
  maxRetries?: number;
  refreshThreshold?: number; // minutes before expiry to refresh
}

export class SapB1SessionManager {
  private config: SessionManagerConfig;
  private authHandler: SapB1AuthHandler;
  private session: SessionInfo | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing = false;

  constructor(config: SessionManagerConfig) {
    this.config = {
      sessionTimeout: 30,
      maxRetries: 3,
      refreshThreshold: 5,
      ...config,
    };
    this.authHandler = new SapB1AuthHandler(config);
  }

  /**
   * Get or create session
   */
  async getSession(): Promise<SessionInfo> {
    // Check if session exists and is valid
    if (this.session && this.isSessionValid()) {
      this.session.lastUsedAt = new Date();
      return this.session;
    }

    // Wait if already refreshing
    if (this.isRefreshing) {
      await this.waitForRefresh();
      if (this.session) {
        return this.session;
      }
    }

    // Create new session
    return this.createSession();
  }

  /**
   * Get session ID for API calls
   */
  async getSessionId(): Promise<string> {
    const session = await this.getSession();
    return session.sessionId;
  }

  /**
   * Create new session
   */
  private async createSession(): Promise<SessionInfo> {
    this.isRefreshing = true;

    try {
      const result = await this.authHandler.authenticate();

      if (!result.success || !result.sessionId) {
        throw new Error(result.error || 'Failed to create session');
      }

      const now = new Date();
      const timeout = result.sessionTimeout || this.config.sessionTimeout!;

      this.session = {
        sessionId: result.sessionId,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + timeout * 60 * 1000),
        version: result.version || 'unknown',
        companyDb: this.config.companyDb,
      };

      // Schedule session refresh
      this.scheduleRefresh();

      return this.session;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Check if session is valid
   */
  private isSessionValid(): boolean {
    if (!this.session) return false;

    const now = new Date();
    const threshold = this.config.refreshThreshold! * 60 * 1000;

    return this.session.expiresAt.getTime() - now.getTime() > threshold;
  }

  /**
   * Schedule session refresh
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.session) return;

    const now = new Date();
    const threshold = this.config.refreshThreshold! * 60 * 1000;
    const refreshTime = this.session.expiresAt.getTime() - now.getTime() - threshold;

    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(() => this.refreshSession(), refreshTime);
    }
  }

  /**
   * Refresh session
   */
  private async refreshSession(): Promise<void> {
    if (this.isRefreshing) return;

    try {
      // Logout old session
      if (this.session) {
        await this.authHandler.logout(this.session.sessionId);
      }

      // Create new session
      await this.createSession();
    } catch (error) {
      console.error('Failed to refresh session:', error);
      this.session = null;
    }
  }

  /**
   * Wait for refresh to complete
   */
  private async waitForRefresh(): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const checkInterval = 100; // 100ms
    let waited = 0;

    while (this.isRefreshing && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
  }

  /**
   * Execute with session (handles session errors and retries)
   */
  async executeWithSession<T>(
    fn: (sessionId: string) => Promise<T>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries!; attempt++) {
      try {
        const sessionId = await this.getSessionId();
        return await fn(sessionId);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if session error
        if (this.isSessionError(lastError)) {
          // Invalidate session and retry
          this.session = null;
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Check if error is session-related
   */
  private isSessionError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('session') ||
      message.includes('unauthorized') ||
      message.includes('401') ||
      message.includes('login') ||
      message.includes('authentication')
    );
  }

  /**
   * Manually invalidate session
   */
  async invalidateSession(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.session) {
      try {
        await this.authHandler.logout(this.session.sessionId);
      } catch {
        // Ignore logout errors
      }
      this.session = null;
    }
  }

  /**
   * Get current session info
   */
  getCurrentSession(): SessionInfo | null {
    return this.session;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.session !== null && this.isSessionValid();
  }

  /**
   * Dispose manager and clean up
   */
  async dispose(): Promise<void> {
    await this.invalidateSession();
  }
}

/**
 * Create session manager
 */
export function createSapB1SessionManager(
  config: SessionManagerConfig
): SapB1SessionManager {
  return new SapB1SessionManager(config);
}
