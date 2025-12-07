/**
 * Microsoft Graph API Client Wrapper
 * Provides typed access to Graph API endpoints
 */

import { Client, PageCollection } from '@microsoft/microsoft-graph-client';

export interface GraphClientConfig {
  accessToken: string;
}

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  department?: string;
  jobTitle?: string;
}

export interface GraphMessage {
  id: string;
  subject: string;
  from?: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  receivedDateTime: string;
  sentDateTime: string;
  hasAttachments: boolean;
  importance: string;
  isRead: boolean;
  conversationId: string;
}

export interface GraphEvent {
  id: string;
  subject: string;
  organizer?: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    status?: {
      response: string;
    };
  }>;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  isAllDay: boolean;
  isCancelled: boolean;
  isOnlineMeeting: boolean;
  recurrence?: unknown;
}

export interface DeltaResponse<T> {
  value: T[];
  deltaLink?: string;
  nextLink?: string;
}

/**
 * Create a Microsoft Graph client
 */
export function createGraphClient(config: GraphClientConfig): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, config.accessToken);
    },
  });
}

/**
 * Graph API client wrapper class
 */
export class GraphApiClient {
  private client: Client;

  constructor(accessToken: string) {
    this.client = createGraphClient({ accessToken });
  }

  /**
   * Get current user profile
   */
  async getMe(): Promise<GraphUser> {
    return this.client.api('/me').get();
  }

  /**
   * Get all users in the organization
   */
  async getUsers(select?: string[]): Promise<GraphUser[]> {
    const selectFields = select || ['id', 'displayName', 'mail', 'userPrincipalName', 'department', 'jobTitle'];

    const response = await this.client
      .api('/users')
      .select(selectFields)
      .top(999)
      .get();

    return this.collectAllPages<GraphUser>(response);
  }

  /**
   * Get messages with delta support
   */
  async getMessagesDelta(
    userId: string,
    deltaToken?: string,
    lookbackDate?: Date
  ): Promise<DeltaResponse<GraphMessage>> {
    let request = this.client.api(`/users/${userId}/mailFolders/inbox/messages/delta`);

    if (deltaToken) {
      // Use delta token for incremental sync
      request = this.client.api(deltaToken);
    } else if (lookbackDate) {
      // Initial sync with date filter
      request = request.filter(`receivedDateTime ge ${lookbackDate.toISOString()}`);
    }

    request = request
      .select([
        'id',
        'subject',
        'from',
        'toRecipients',
        'ccRecipients',
        'receivedDateTime',
        'sentDateTime',
        'hasAttachments',
        'importance',
        'isRead',
        'conversationId',
      ])
      .top(100);

    const response = await request.get();

    return {
      value: response.value || [],
      deltaLink: response['@odata.deltaLink'],
      nextLink: response['@odata.nextLink'],
    };
  }

  /**
   * Get sent messages with delta support
   */
  async getSentMessagesDelta(
    userId: string,
    deltaToken?: string,
    lookbackDate?: Date
  ): Promise<DeltaResponse<GraphMessage>> {
    let request = this.client.api(`/users/${userId}/mailFolders/sentitems/messages/delta`);

    if (deltaToken) {
      request = this.client.api(deltaToken);
    } else if (lookbackDate) {
      request = request.filter(`sentDateTime ge ${lookbackDate.toISOString()}`);
    }

    request = request
      .select([
        'id',
        'subject',
        'from',
        'toRecipients',
        'ccRecipients',
        'receivedDateTime',
        'sentDateTime',
        'hasAttachments',
        'importance',
        'conversationId',
      ])
      .top(100);

    const response = await request.get();

    return {
      value: response.value || [],
      deltaLink: response['@odata.deltaLink'],
      nextLink: response['@odata.nextLink'],
    };
  }

  /**
   * Get calendar events with delta support
   */
  async getCalendarEventsDelta(
    userId: string,
    deltaToken?: string,
    lookbackDate?: Date
  ): Promise<DeltaResponse<GraphEvent>> {
    let request = this.client.api(`/users/${userId}/calendar/events/delta`);

    if (deltaToken) {
      request = this.client.api(deltaToken);
    } else if (lookbackDate) {
      request = request.filter(`start/dateTime ge '${lookbackDate.toISOString()}'`);
    }

    request = request
      .select([
        'id',
        'subject',
        'organizer',
        'attendees',
        'start',
        'end',
        'isAllDay',
        'isCancelled',
        'isOnlineMeeting',
        'recurrence',
      ])
      .top(100);

    const response = await request.get();

    return {
      value: response.value || [],
      deltaLink: response['@odata.deltaLink'],
      nextLink: response['@odata.nextLink'],
    };
  }

  /**
   * Follow next link for pagination
   */
  async followNextLink<T>(nextLink: string): Promise<DeltaResponse<T>> {
    const response = await this.client.api(nextLink).get();

    return {
      value: response.value || [],
      deltaLink: response['@odata.deltaLink'],
      nextLink: response['@odata.nextLink'],
    };
  }

  /**
   * Collect all pages from a paged response
   */
  private async collectAllPages<T>(response: PageCollection): Promise<T[]> {
    const items: T[] = [...(response.value || [])];
    let nextLink = response['@odata.nextLink'];

    while (nextLink) {
      const nextResponse = await this.client.api(nextLink).get();
      items.push(...(nextResponse.value || []));
      nextLink = nextResponse['@odata.nextLink'];
    }

    return items;
  }

  /**
   * Test connection by getting current user
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getMe();
      return true;
    } catch {
      return false;
    }
  }
}
