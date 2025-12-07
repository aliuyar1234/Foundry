/**
 * Alerts Hooks
 * TanStack Query hooks for alert management and subscriptions
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export type AlertType =
  | 'burnout_warning'
  | 'process_degradation'
  | 'team_conflict'
  | 'bus_factor_risk'
  | 'data_quality_issue'
  | 'compliance_alert'
  | 'system_alert';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export type AlertStatus = 'pending' | 'sent' | 'acknowledged' | 'resolved' | 'expired';

export type NotificationChannel = 'email' | 'slack' | 'teams' | 'webhook' | 'in_app';

export interface Alert {
  id: string;
  organizationId: string;
  insightId: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  actionUrl?: string;
  metadata: Record<string, unknown>;
  notificationsSent: NotificationRecord[];
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  channel: NotificationChannel;
  recipient: string;
  sentAt: string;
  status: 'sent' | 'failed' | 'delivered';
  error?: string;
}

export interface AlertSubscription {
  id: string;
  organizationId: string;
  userId?: string;
  name: string;
  description?: string;
  isActive: boolean;
  channels: SubscriptionChannel[];
  filters: AlertFilter;
  schedule?: AlertSchedule;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionChannel {
  type: NotificationChannel;
  config: ChannelConfig;
}

export interface ChannelConfig {
  email?: string;
  webhookUrl?: string;
  channel?: string;
  teamsWebhookUrl?: string;
  url?: string;
  headers?: Record<string, string>;
}

export interface AlertFilter {
  types?: AlertType[];
  severities?: AlertSeverity[];
  categories?: Array<'people' | 'process' | 'risk' | 'opportunity'>;
  entityTypes?: string[];
  minScore?: number;
}

export interface AlertSchedule {
  type: 'immediate' | 'digest' | 'scheduled';
  digestFrequency?: 'hourly' | 'daily' | 'weekly';
  digestTime?: string;
  digestDays?: number[];
  timezone?: string;
}

export interface CreateSubscriptionInput {
  name: string;
  description?: string;
  channels: SubscriptionChannel[];
  filters: AlertFilter;
  schedule?: AlertSchedule;
}

export interface AlertQueryOptions {
  types?: AlertType[];
  severities?: AlertSeverity[];
  statuses?: AlertStatus[];
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// Query keys
export const alertsKeys = {
  all: ['alerts'] as const,
  list: (filters?: AlertQueryOptions) => [...alertsKeys.all, 'list', filters] as const,
  pending: () => [...alertsKeys.all, 'pending'] as const,
  detail: (id: string) => [...alertsKeys.all, id] as const,
  subscriptions: () => [...alertsKeys.all, 'subscriptions'] as const,
  subscription: (id: string) => [...alertsKeys.subscriptions(), id] as const,
};

/**
 * Fetch alerts with filtering
 */
export function useAlerts(options?: AlertQueryOptions) {
  return useQuery({
    queryKey: alertsKeys.list(options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.types) params.append('types', options.types.join(','));
      if (options?.severities) params.append('severities', options.severities.join(','));
      if (options?.statuses) params.append('statuses', options.statuses.join(','));
      if (options?.from) params.append('from', options.from);
      if (options?.to) params.append('to', options.to);
      if (options?.limit) params.append('limit', String(options.limit));
      if (options?.offset) params.append('offset', String(options.offset));

      const response = await apiClient.get<{ success: boolean; data: Alert[] }>(
        `/alerts?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch pending alerts
 */
export function usePendingAlerts(limit = 50) {
  return useQuery({
    queryKey: alertsKeys.pending(),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: Alert[] }>(
        `/alerts/pending?limit=${limit}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch single alert
 */
export function useAlert(id: string) {
  return useQuery({
    queryKey: alertsKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: Alert }>(
        `/alerts/${id}`
      );
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Acknowledge an alert
 */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<{ success: boolean; data: Alert }>(
        `/alerts/${id}/acknowledge`
      );
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: alertsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: alertsKeys.list() });
      queryClient.invalidateQueries({ queryKey: alertsKeys.pending() });
    },
  });
}

/**
 * Resolve an alert
 */
export function useResolveAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<{ success: boolean; data: Alert }>(
        `/alerts/${id}/resolve`
      );
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: alertsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: alertsKeys.list() });
      queryClient.invalidateQueries({ queryKey: alertsKeys.pending() });
    },
  });
}

/**
 * Fetch alert subscriptions
 */
export function useAlertSubscriptions() {
  return useQuery({
    queryKey: alertsKeys.subscriptions(),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: AlertSubscription[] }>(
        '/alerts/subscriptions'
      );
      return response.data;
    },
  });
}

/**
 * Create alert subscription
 */
export function useCreateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSubscriptionInput) => {
      const response = await apiClient.post<{ success: boolean; data: AlertSubscription }>(
        '/alerts/subscribe',
        input
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertsKeys.subscriptions() });
    },
  });
}

/**
 * Update alert subscription
 */
export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<CreateSubscriptionInput>;
    }) => {
      const response = await apiClient.patch<{ success: boolean; data: AlertSubscription }>(
        `/alerts/subscriptions/${id}`,
        updates
      );
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: alertsKeys.subscription(id) });
      queryClient.invalidateQueries({ queryKey: alertsKeys.subscriptions() });
    },
  });
}

/**
 * Delete alert subscription
 */
export function useDeleteSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/alerts/subscriptions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertsKeys.subscriptions() });
    },
  });
}

/**
 * Test subscription channels
 */
export function useTestSubscription() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<{
        success: boolean;
        data: {
          results: Array<{
            channel: NotificationChannel;
            success: boolean;
            error?: string;
          }>;
          message: string;
        };
      }>(`/alerts/subscriptions/${id}/test`);
      return response.data;
    },
  });
}
