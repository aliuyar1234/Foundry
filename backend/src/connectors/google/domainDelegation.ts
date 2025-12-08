/**
 * Google Domain-Wide Delegation Support
 * Task: T018
 *
 * Implements domain-wide delegation for Google Workspace admin operations.
 * Allows accessing data on behalf of any user in the domain.
 */

import { google, admin_directory_v1 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { ServiceAccountKey, GoogleClientFactory } from './clientFactory';

export interface DomainDelegationConfig {
  serviceAccountKey: ServiceAccountKey;
  adminEmail: string; // Admin email for impersonation
  domain: string;
}

export interface DomainUser {
  id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
  isSuspended: boolean;
  lastLoginTime?: Date;
  creationTime: Date;
  orgUnitPath?: string;
}

export interface DomainGroup {
  id: string;
  email: string;
  name: string;
  description?: string;
  memberCount?: number;
}

export interface UserIteratorOptions {
  query?: string;
  orderBy?: 'email' | 'familyName' | 'givenName';
  pageSize?: number;
  includeSuspended?: boolean;
}

export class DomainDelegationService {
  private config: DomainDelegationConfig;
  private adminClient: admin_directory_v1.Admin | null = null;
  private userClientCache: Map<string, GoogleClientFactory> = new Map();

  constructor(config: DomainDelegationConfig) {
    this.config = config;
  }

  /**
   * Get Admin SDK client for domain administration
   */
  getAdminClient(): admin_directory_v1.Admin {
    if (!this.adminClient) {
      const jwtClient = this.createJWTClient(this.config.adminEmail, [
        'https://www.googleapis.com/auth/admin.directory.user.readonly',
        'https://www.googleapis.com/auth/admin.directory.group.readonly',
        'https://www.googleapis.com/auth/admin.directory.domain.readonly',
      ]);

      this.adminClient = google.admin({ version: 'directory_v1', auth: jwtClient });
    }

    return this.adminClient;
  }

  /**
   * Get client factory for impersonating a specific user
   */
  getClientForUser(userEmail: string, scopes: string[]): GoogleClientFactory {
    const cacheKey = `${userEmail}:${scopes.join(',')}`;

    if (!this.userClientCache.has(cacheKey)) {
      const factory = new GoogleClientFactory({
        clientId: this.config.serviceAccountKey.client_id,
        clientSecret: '',
        serviceAccountKey: this.config.serviceAccountKey,
        delegateEmail: userEmail,
      });

      this.userClientCache.set(cacheKey, factory);
    }

    return this.userClientCache.get(cacheKey)!;
  }

  /**
   * List all users in the domain
   */
  async listUsers(options: UserIteratorOptions = {}): Promise<DomainUser[]> {
    const admin = this.getAdminClient();
    const users: DomainUser[] = [];
    let pageToken: string | undefined;

    do {
      const response = await admin.users.list({
        domain: this.config.domain,
        maxResults: options.pageSize || 100,
        pageToken,
        query: options.query,
        orderBy: options.orderBy,
        showDeleted: 'false',
      });

      if (response.data.users) {
        for (const user of response.data.users) {
          if (!options.includeSuspended && user.suspended) {
            continue;
          }

          users.push({
            id: user.id!,
            email: user.primaryEmail!,
            name: user.name?.fullName,
            isAdmin: user.isAdmin || false,
            isSuspended: user.suspended || false,
            lastLoginTime: user.lastLoginTime
              ? new Date(user.lastLoginTime)
              : undefined,
            creationTime: new Date(user.creationTime!),
            orgUnitPath: user.orgUnitPath,
          });
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return users;
  }

  /**
   * Iterate over users with async generator
   */
  async *iterateUsers(
    options: UserIteratorOptions = {}
  ): AsyncGenerator<DomainUser, void, unknown> {
    const admin = this.getAdminClient();
    let pageToken: string | undefined;

    do {
      const response = await admin.users.list({
        domain: this.config.domain,
        maxResults: options.pageSize || 100,
        pageToken,
        query: options.query,
        orderBy: options.orderBy,
        showDeleted: 'false',
      });

      if (response.data.users) {
        for (const user of response.data.users) {
          if (!options.includeSuspended && user.suspended) {
            continue;
          }

          yield {
            id: user.id!,
            email: user.primaryEmail!,
            name: user.name?.fullName,
            isAdmin: user.isAdmin || false,
            isSuspended: user.suspended || false,
            lastLoginTime: user.lastLoginTime
              ? new Date(user.lastLoginTime)
              : undefined,
            creationTime: new Date(user.creationTime!),
            orgUnitPath: user.orgUnitPath,
          };
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
  }

  /**
   * Get a specific user by email
   */
  async getUser(email: string): Promise<DomainUser | null> {
    const admin = this.getAdminClient();

    try {
      const response = await admin.users.get({
        userKey: email,
      });

      const user = response.data;

      return {
        id: user.id!,
        email: user.primaryEmail!,
        name: user.name?.fullName,
        isAdmin: user.isAdmin || false,
        isSuspended: user.suspended || false,
        lastLoginTime: user.lastLoginTime
          ? new Date(user.lastLoginTime)
          : undefined,
        creationTime: new Date(user.creationTime!),
        orgUnitPath: user.orgUnitPath,
      };
    } catch {
      return null;
    }
  }

  /**
   * List all groups in the domain
   */
  async listGroups(): Promise<DomainGroup[]> {
    const admin = this.getAdminClient();
    const groups: DomainGroup[] = [];
    let pageToken: string | undefined;

    do {
      const response = await admin.groups.list({
        domain: this.config.domain,
        maxResults: 200,
        pageToken,
      });

      if (response.data.groups) {
        for (const group of response.data.groups) {
          groups.push({
            id: group.id!,
            email: group.email!,
            name: group.name!,
            description: group.description,
            memberCount: group.directMembersCount
              ? parseInt(group.directMembersCount)
              : undefined,
          });
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return groups;
  }

  /**
   * Get group members
   */
  async getGroupMembers(groupEmail: string): Promise<string[]> {
    const admin = this.getAdminClient();
    const members: string[] = [];
    let pageToken: string | undefined;

    do {
      const response = await admin.members.list({
        groupKey: groupEmail,
        maxResults: 200,
        pageToken,
      });

      if (response.data.members) {
        for (const member of response.data.members) {
          if (member.email) {
            members.push(member.email);
          }
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return members;
  }

  /**
   * Check if domain-wide delegation is properly configured
   */
  async validateConfiguration(): Promise<{
    valid: boolean;
    error?: string;
    details?: {
      canAccessAdmin: boolean;
      canListUsers: boolean;
      domain: string;
    };
  }> {
    try {
      // Try to access admin API
      const admin = this.getAdminClient();

      // Try to list a single user to verify access
      const response = await admin.users.list({
        domain: this.config.domain,
        maxResults: 1,
      });

      return {
        valid: true,
        details: {
          canAccessAdmin: true,
          canListUsers: response.data.users !== undefined,
          domain: this.config.domain,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';

      return {
        valid: false,
        error: message,
      };
    }
  }

  /**
   * Get active user count
   */
  async getActiveUserCount(): Promise<number> {
    const users = await this.listUsers({ includeSuspended: false });
    return users.length;
  }

  /**
   * Get domain info
   */
  async getDomainInfo(): Promise<{
    domain: string;
    verified: boolean;
    primary: boolean;
  } | null> {
    try {
      const admin = this.getAdminClient();
      const response = await admin.domains.get({
        customer: 'my_customer',
        domainName: this.config.domain,
      });

      return {
        domain: response.data.domainName!,
        verified: response.data.verified || false,
        primary: response.data.isPrimary || false,
      };
    } catch {
      return null;
    }
  }

  // Private methods

  private createJWTClient(subjectEmail: string, scopes: string[]): JWT {
    return new JWT({
      email: this.config.serviceAccountKey.client_email,
      key: this.config.serviceAccountKey.private_key,
      scopes,
      subject: subjectEmail,
    });
  }

  /**
   * Clear cached clients
   */
  clearCache(): void {
    this.userClientCache.clear();
    this.adminClient = null;
  }
}

/**
 * Create domain delegation service
 */
export function createDomainDelegationService(
  config: DomainDelegationConfig
): DomainDelegationService {
  return new DomainDelegationService(config);
}
