/**
 * Google API Client Factory
 * Task: T017
 *
 * Creates Google API clients with credential injection.
 * Supports Gmail, Calendar, Drive, and Admin SDK APIs.
 */

import { google, gmail_v1, calendar_v3, drive_v3, admin_directory_v1 } from 'googleapis';
import { OAuth2Client, Credentials, JWT } from 'google-auth-library';
import { OAuthTokens } from '../base/oauthTokenManager';

export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
  tokens?: OAuthTokens;
  serviceAccountKey?: ServiceAccountKey;
  delegateEmail?: string; // For domain-wide delegation
}

export interface ServiceAccountKey {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

export interface GoogleClients {
  gmail: gmail_v1.Gmail;
  calendar: calendar_v3.Calendar;
  drive: drive_v3.Drive;
  admin: admin_directory_v1.Admin;
  oauth2Client: OAuth2Client;
}

export class GoogleClientFactory {
  private config: GoogleClientConfig;
  private oauth2Client: OAuth2Client | null = null;
  private jwtClient: JWT | null = null;

  constructor(config: GoogleClientConfig) {
    this.config = config;
  }

  /**
   * Create all Google API clients
   */
  createClients(): GoogleClients {
    const auth = this.getAuthClient();

    return {
      gmail: google.gmail({ version: 'v1', auth }),
      calendar: google.calendar({ version: 'v3', auth }),
      drive: google.drive({ version: 'v3', auth }),
      admin: google.admin({ version: 'directory_v1', auth }),
      oauth2Client: auth instanceof OAuth2Client ? auth : this.createOAuth2Client(),
    };
  }

  /**
   * Create Gmail client only
   */
  createGmailClient(): gmail_v1.Gmail {
    return google.gmail({ version: 'v1', auth: this.getAuthClient() });
  }

  /**
   * Create Calendar client only
   */
  createCalendarClient(): calendar_v3.Calendar {
    return google.calendar({ version: 'v3', auth: this.getAuthClient() });
  }

  /**
   * Create Drive client only
   */
  createDriveClient(): drive_v3.Drive {
    return google.drive({ version: 'v3', auth: this.getAuthClient() });
  }

  /**
   * Create Admin SDK client only
   */
  createAdminClient(): admin_directory_v1.Admin {
    return google.admin({ version: 'directory_v1', auth: this.getAuthClient() });
  }

  /**
   * Update credentials on existing clients
   */
  updateCredentials(tokens: OAuthTokens): void {
    this.config.tokens = tokens;

    if (this.oauth2Client) {
      this.oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: tokens.expiresAt.getTime(),
        token_type: tokens.tokenType,
        id_token: tokens.idToken,
        scope: tokens.scope,
      });
    }
  }

  /**
   * Get OAuth2 client for token refresh
   */
  getOAuth2Client(): OAuth2Client {
    if (!this.oauth2Client) {
      this.oauth2Client = this.createOAuth2Client();
    }
    return this.oauth2Client;
  }

  // Private methods

  private getAuthClient(): OAuth2Client | JWT {
    // Prefer service account with domain-wide delegation if configured
    if (this.config.serviceAccountKey && this.config.delegateEmail) {
      return this.getJWTClient();
    }

    // Otherwise use OAuth2
    return this.getOAuth2ClientWithCredentials();
  }

  private getOAuth2ClientWithCredentials(): OAuth2Client {
    if (!this.oauth2Client) {
      this.oauth2Client = this.createOAuth2Client();
    }

    if (this.config.tokens) {
      this.oauth2Client.setCredentials({
        access_token: this.config.tokens.accessToken,
        refresh_token: this.config.tokens.refreshToken,
        expiry_date: this.config.tokens.expiresAt.getTime(),
        token_type: this.config.tokens.tokenType,
        id_token: this.config.tokens.idToken,
        scope: this.config.tokens.scope,
      });
    }

    return this.oauth2Client;
  }

  private createOAuth2Client(): OAuth2Client {
    return new OAuth2Client(
      this.config.clientId,
      this.config.clientSecret
    );
  }

  private getJWTClient(): JWT {
    if (!this.jwtClient) {
      const key = this.config.serviceAccountKey!;

      this.jwtClient = new JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/admin.directory.user.readonly',
        ],
        subject: this.config.delegateEmail,
      });
    }

    return this.jwtClient;
  }
}

/**
 * Create Google client factory
 */
export function createGoogleClientFactory(
  config: GoogleClientConfig
): GoogleClientFactory {
  return new GoogleClientFactory(config);
}

/**
 * Helper to create clients from tokens directly
 */
export function createGoogleClientsFromTokens(
  clientId: string,
  clientSecret: string,
  tokens: OAuthTokens
): GoogleClients {
  const factory = new GoogleClientFactory({
    clientId,
    clientSecret,
    tokens,
  });

  return factory.createClients();
}

/**
 * Helper to create clients for domain-wide delegation
 */
export function createGoogleClientsWithDelegation(
  serviceAccountKey: ServiceAccountKey,
  delegateEmail: string
): GoogleClients {
  const factory = new GoogleClientFactory({
    clientId: serviceAccountKey.client_id,
    clientSecret: '', // Not needed for service account
    serviceAccountKey,
    delegateEmail,
  });

  return factory.createClients();
}
