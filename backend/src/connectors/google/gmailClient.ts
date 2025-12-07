/**
 * Gmail API Client Wrapper
 * Provides typed access to Gmail API endpoints
 */

export interface GmailClientConfig {
  accessToken: string;
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailMessageHeader[];
  body: {
    size: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: GmailMessagePart;
  sizeEstimate: number;
  raw?: string;
}

export interface GmailMessageMetadata {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  subject?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  date?: string;
  messageId?: string;
  hasAttachments: boolean;
}

export interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

export interface GmailHistoryRecord {
  id: string;
  messages?: Array<{ id: string; threadId: string }>;
  messagesAdded?: Array<{
    message: { id: string; threadId: string; labelIds: string[] };
  }>;
  messagesDeleted?: Array<{
    message: { id: string; threadId: string; labelIds: string[] };
  }>;
  labelsAdded?: Array<{
    message: { id: string; threadId: string; labelIds: string[] };
    labelIds: string[];
  }>;
  labelsRemoved?: Array<{
    message: { id: string; threadId: string; labelIds: string[] };
    labelIds: string[];
  }>;
}

export interface GmailListResponse<T> {
  messages?: T[];
  threads?: T[];
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
  historyId?: string;
}

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

/**
 * Gmail API client wrapper class
 */
export class GmailApiClient {
  private accessToken: string;

  constructor(config: GmailClientConfig) {
    this.accessToken = config.accessToken;
  }

  /**
   * Make authenticated request to Gmail API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${GMAIL_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Gmail API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get user's Gmail profile
   */
  async getProfile(userId = 'me'): Promise<GmailProfile> {
    return this.request<GmailProfile>(`/users/${userId}/profile`);
  }

  /**
   * List labels
   */
  async listLabels(userId = 'me'): Promise<GmailLabel[]> {
    const response = await this.request<{ labels: GmailLabel[] }>(
      `/users/${userId}/labels`
    );
    return response.labels || [];
  }

  /**
   * List messages
   */
  async listMessages(
    userId = 'me',
    options: {
      maxResults?: number;
      pageToken?: string;
      q?: string;
      labelIds?: string[];
      includeSpamTrash?: boolean;
    } = {}
  ): Promise<GmailListResponse<{ id: string; threadId: string }>> {
    const params = new URLSearchParams();

    if (options.maxResults) {
      params.set('maxResults', options.maxResults.toString());
    }
    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }
    if (options.q) {
      params.set('q', options.q);
    }
    if (options.labelIds?.length) {
      options.labelIds.forEach((id) => params.append('labelIds', id));
    }
    if (options.includeSpamTrash !== undefined) {
      params.set('includeSpamTrash', options.includeSpamTrash.toString());
    }

    const query = params.toString();
    return this.request(`/users/${userId}/messages${query ? `?${query}` : ''}`);
  }

  /**
   * Get a single message
   */
  async getMessage(
    messageId: string,
    userId = 'me',
    format: 'full' | 'metadata' | 'minimal' | 'raw' = 'metadata'
  ): Promise<GmailMessage> {
    return this.request<GmailMessage>(
      `/users/${userId}/messages/${messageId}?format=${format}`
    );
  }

  /**
   * Get message metadata (optimized for event extraction)
   */
  async getMessageMetadata(
    messageId: string,
    userId = 'me'
  ): Promise<GmailMessageMetadata> {
    const message = await this.getMessage(messageId, userId, 'metadata');
    return this.parseMessageMetadata(message);
  }

  /**
   * Batch get message metadata
   */
  async batchGetMessageMetadata(
    messageIds: string[],
    userId = 'me'
  ): Promise<GmailMessageMetadata[]> {
    // Gmail API supports batch requests, but for simplicity we'll use parallel requests
    const results = await Promise.all(
      messageIds.map((id) => this.getMessageMetadata(id, userId))
    );
    return results;
  }

  /**
   * Get history (incremental changes since historyId)
   */
  async getHistory(
    startHistoryId: string,
    userId = 'me',
    options: {
      maxResults?: number;
      pageToken?: string;
      labelId?: string;
      historyTypes?: Array<'messageAdded' | 'messageDeleted' | 'labelAdded' | 'labelRemoved'>;
    } = {}
  ): Promise<GmailListResponse<GmailHistoryRecord>> {
    const params = new URLSearchParams({
      startHistoryId,
    });

    if (options.maxResults) {
      params.set('maxResults', options.maxResults.toString());
    }
    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }
    if (options.labelId) {
      params.set('labelId', options.labelId);
    }
    if (options.historyTypes?.length) {
      options.historyTypes.forEach((type) => params.append('historyTypes', type));
    }

    return this.request(`/users/${userId}/history?${params.toString()}`);
  }

  /**
   * Parse message headers into metadata object
   */
  private parseMessageMetadata(message: GmailMessage): GmailMessageMetadata {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string): string | undefined => {
      const header = headers.find(
        (h) => h.name.toLowerCase() === name.toLowerCase()
      );
      return header?.value;
    };

    const parseAddresses = (value: string | undefined): string[] => {
      if (!value) return [];
      // Simple parsing - handles "Name <email>" and "email" formats
      return value.split(',').map((addr) => {
        const match = addr.match(/<([^>]+)>/);
        return (match ? match[1] : addr).trim();
      });
    };

    const hasAttachments = this.checkForAttachments(message.payload);

    return {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds || [],
      snippet: message.snippet,
      internalDate: message.internalDate,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      to: parseAddresses(getHeader('To')),
      cc: parseAddresses(getHeader('Cc')),
      date: getHeader('Date'),
      messageId: getHeader('Message-ID'),
      hasAttachments,
    };
  }

  /**
   * Check if message has attachments
   */
  private checkForAttachments(payload: GmailMessagePart): boolean {
    if (payload.filename && payload.body?.attachmentId) {
      return true;
    }
    if (payload.parts) {
      return payload.parts.some((part) => this.checkForAttachments(part));
    }
    return false;
  }

  /**
   * Test connection by getting profile
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getProfile();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Gmail client instance
 */
export function createGmailClient(accessToken: string): GmailApiClient {
  return new GmailApiClient({ accessToken });
}
