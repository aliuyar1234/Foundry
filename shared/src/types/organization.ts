/**
 * Organization Types
 */

export const Tier = {
  STARTER: 'STARTER',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE',
} as const;

export type Tier = (typeof Tier)[keyof typeof Tier];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  industry?: string;
  employeeCount?: number;
  region: string;
  tier: Tier;
  settings: OrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationSettings {
  dataRetentionMonths?: number;
  contentAnalysisEnabled?: boolean;
  notificationChannels?: NotificationChannel[];
  timezone?: string;
  locale?: string;
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'teams';
  enabled: boolean;
  config: Record<string, string>;
}

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
  industry?: string;
  employeeCount?: number;
  region?: string;
  tier?: Tier;
}

export interface UpdateOrganizationRequest {
  name?: string;
  industry?: string;
  employeeCount?: number;
  region?: string;
  tier?: Tier;
  settings?: Partial<OrganizationSettings>;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  tier: Tier;
  dataSourceCount: number;
  userCount: number;
}

export interface OrganizationStats {
  totalEvents: number;
  totalProcesses: number;
  totalPeople: number;
  lastSyncAt?: Date;
  healthScore: number;
}
