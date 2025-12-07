/**
 * Slack OAuth and API Client
 * Web API client for Slack workspace
 */

export interface SlackAuthConfig {
  clientId: string;
  clientSecret: string;
  signingSecret?: string;
}

export interface SlackTokens {
  accessToken: string;
  botUserId: string;
  teamId: string;
  teamName: string;
  scope: string;
  tokenType: string;
}

export interface SlackPaginatedResult<T> {
  ok: boolean;
  members?: T[];
  channels?: T[];
  messages?: T[];
  response_metadata?: {
    next_cursor?: string;
  };
}

// Common Slack objects
export interface SlackUser {
  id: string;
  team_id: string;
  name: string;
  deleted: boolean;
  real_name?: string;
  tz?: string;
  tz_label?: string;
  profile: {
    title?: string;
    phone?: string;
    email?: string;
    display_name?: string;
    real_name?: string;
    status_text?: string;
    status_emoji?: string;
    image_original?: string;
    image_48?: string;
    image_72?: string;
  };
  is_admin?: boolean;
  is_owner?: boolean;
  is_primary_owner?: boolean;
  is_restricted?: boolean;
  is_ultra_restricted?: boolean;
  is_bot?: boolean;
  updated?: number;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  is_archived: boolean;
  is_general?: boolean;
  is_shared?: boolean;
  is_org_shared?: boolean;
  is_member?: boolean;
  creator?: string;
  created?: number;
  topic?: {
    value: string;
    creator: string;
    last_set: number;
  };
  purpose?: {
    value: string;
    creator: string;
    last_set: number;
  };
  num_members?: number;
}

export interface SlackMessage {
  type: string;
  subtype?: string;
  text: string;
  user?: string;
  bot_id?: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  reply_users_count?: number;
  latest_reply?: string;
  reactions?: Array<{
    name: string;
    count: number;
    users: string[];
  }>;
  files?: Array<{
    id: string;
    name: string;
    mimetype: string;
    size: number;
    url_private?: string;
  }>;
  attachments?: Array<{
    fallback: string;
    text?: string;
    pretext?: string;
    title?: string;
    title_link?: string;
  }>;
}

export interface SlackTeamInfo {
  id: string;
  name: string;
  domain: string;
  email_domain?: string;
  icon?: {
    image_34?: string;
    image_44?: string;
    image_68?: string;
    image_original?: string;
  };
}

// OAuth endpoints
const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_API_URL = 'https://slack.com/api';

// Required scopes
export const SLACK_SCOPES = [
  'channels:read',
  'channels:history',
  'groups:read',
  'groups:history',
  'im:read',
  'im:history',
  'mpim:read',
  'mpim:history',
  'users:read',
  'users:read.email',
  'team:read',
  'files:read',
  'reactions:read',
];

/**
 * Get Slack authorization URL
 */
export function getAuthorizationUrl(
  config: SlackAuthConfig,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: SLACK_SCOPES.join(','),
    state: state,
  });

  return `${SLACK_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  config: SlackAuthConfig,
  code: string,
  redirectUri: string
): Promise<SlackTokens> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack token exchange failed: ${data.error}`);
  }

  return {
    accessToken: data.access_token,
    botUserId: data.bot_user_id,
    teamId: data.team.id,
    teamName: data.team.name,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

/**
 * Slack Web API client
 */
export class SlackClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    method: string,
    params: Record<string, string | number | undefined> = {}
  ): Promise<T> {
    const url = new URL(`${SLACK_API_URL}/${method}`);

    // Add params as query string for GET, or as form data for POST
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined)
    ) as Record<string, string>;

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(cleanParams).toString(),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data as T;
  }

  /**
   * Get team info
   */
  async getTeamInfo(): Promise<SlackTeamInfo> {
    const result = await this.request<{ team: SlackTeamInfo }>('team.info');
    return result.team;
  }

  /**
   * Get users
   */
  async getUsers(options: {
    cursor?: string;
    limit?: number;
  } = {}): Promise<SlackPaginatedResult<SlackUser>> {
    return this.request<SlackPaginatedResult<SlackUser>>('users.list', {
      cursor: options.cursor,
      limit: options.limit || 200,
    });
  }

  /**
   * Get all users (handles pagination)
   */
  async getAllUsers(): Promise<SlackUser[]> {
    const allUsers: SlackUser[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.getUsers({ cursor });
      if (result.members) {
        allUsers.push(...result.members);
      }
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    return allUsers;
  }

  /**
   * Get channels
   */
  async getChannels(options: {
    cursor?: string;
    limit?: number;
    types?: string;
  } = {}): Promise<SlackPaginatedResult<SlackChannel>> {
    return this.request<SlackPaginatedResult<SlackChannel>>('conversations.list', {
      cursor: options.cursor,
      limit: options.limit || 200,
      types: options.types || 'public_channel,private_channel',
      exclude_archived: 'false',
    });
  }

  /**
   * Get all channels (handles pagination)
   */
  async getAllChannels(): Promise<SlackChannel[]> {
    const allChannels: SlackChannel[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.getChannels({ cursor });
      if (result.channels) {
        allChannels.push(...result.channels);
      }
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    return allChannels;
  }

  /**
   * Get channel history
   */
  async getChannelHistory(options: {
    channel: string;
    cursor?: string;
    limit?: number;
    oldest?: string;
    latest?: string;
  }): Promise<SlackPaginatedResult<SlackMessage>> {
    return this.request<SlackPaginatedResult<SlackMessage>>('conversations.history', {
      channel: options.channel,
      cursor: options.cursor,
      limit: options.limit || 200,
      oldest: options.oldest,
      latest: options.latest,
    });
  }

  /**
   * Get all messages in a channel (handles pagination)
   */
  async getAllChannelMessages(
    channelId: string,
    options: { oldest?: string; latest?: string } = {}
  ): Promise<SlackMessage[]> {
    const allMessages: SlackMessage[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.getChannelHistory({
        channel: channelId,
        cursor,
        oldest: options.oldest,
        latest: options.latest,
      });
      if (result.messages) {
        allMessages.push(...result.messages);
      }
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    return allMessages;
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('auth.test');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Slack client
 */
export function createSlackClient(accessToken: string): SlackClient {
  return new SlackClient(accessToken);
}

/**
 * Validate Slack configuration
 */
export function validateSlackConfig(config: Partial<SlackAuthConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.clientId) {
    errors.push('Missing clientId');
  }

  if (!config.clientSecret) {
    errors.push('Missing clientSecret');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
