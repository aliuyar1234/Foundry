/**
 * Real-Time Metrics Hook
 * T126 - Create real-time metrics updater with SSE
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  subscribeToUpdates,
  getOverview,
  getAlerts,
  type AggregatedMetrics,
  type Alert,
} from '../services/commandCenterApi';

export interface RealTimeState {
  metrics: AggregatedMetrics | null;
  alerts: Alert[];
  isConnected: boolean;
  lastUpdate: Date | null;
  error: string | null;
}

export interface UseRealTimeMetricsOptions {
  channels?: string[];
  refreshInterval?: number; // Fallback polling interval in ms
  autoConnect?: boolean;
}

export function useRealTimeMetrics(options: UseRealTimeMetricsOptions = {}) {
  const {
    channels = ['metrics', 'alerts'],
    refreshInterval = 60000,
    autoConnect = true,
  } = options;

  const [state, setState] = useState<RealTimeState>({
    metrics: null,
    alerts: [],
    isConnected: false,
    lastUpdate: null,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    try {
      const [metricsData, alertsData] = await Promise.all([
        getOverview(),
        getAlerts({ status: ['active', 'acknowledged'] }),
      ]);

      setState(prev => ({
        ...prev,
        metrics: metricsData,
        alerts: alertsData.alerts,
        lastUpdate: new Date(),
        error: null,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to load data',
      }));
    }
  }, []);

  // Handle SSE messages
  const handleMessage = useCallback((event: { type: string; data: unknown }) => {
    const { type, data } = event;

    setState(prev => {
      switch (type) {
        case 'connected':
          return { ...prev, isConnected: true, error: null };

        case 'metrics_update':
          return {
            ...prev,
            metrics: data as AggregatedMetrics,
            lastUpdate: new Date(),
          };

        case 'alerts_update':
          return {
            ...prev,
            alerts: (data as { alerts: Alert[] }).alerts,
            lastUpdate: new Date(),
          };

        case 'alert_created':
        case 'alert_updated':
          const updatedAlert = data as Alert;
          return {
            ...prev,
            alerts: prev.alerts.some(a => a.id === updatedAlert.id)
              ? prev.alerts.map(a => a.id === updatedAlert.id ? updatedAlert : a)
              : [updatedAlert, ...prev.alerts],
            lastUpdate: new Date(),
          };

        case 'alert_resolved':
          const resolvedAlert = data as Alert;
          return {
            ...prev,
            alerts: prev.alerts.filter(a => a.id !== resolvedAlert.id),
            lastUpdate: new Date(),
          };

        case 'heartbeat':
          return { ...prev, isConnected: true };

        default:
          return prev;
      }
    });
  }, []);

  // Handle SSE errors
  const handleError = useCallback(() => {
    setState(prev => ({
      ...prev,
      isConnected: false,
      error: 'Connection lost. Reconnecting...',
    }));

    // Attempt to reconnect after 5 seconds
    setTimeout(() => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      connect();
    }, 5000);
  }, []);

  // Connect to SSE
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    eventSourceRef.current = subscribeToUpdates(channels, handleMessage, handleError);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [channels, handleMessage, handleError]);

  // Disconnect from SSE
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  // Manual refresh
  const refresh = useCallback(async () => {
    await loadInitialData();
  }, [loadInitialData]);

  // Setup polling fallback
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(() => {
      if (!state.isConnected) {
        loadInitialData();
      }
    }, refreshInterval);
  }, [refreshInterval, state.isConnected, loadInitialData]);

  // Initialize
  useEffect(() => {
    loadInitialData();

    if (autoConnect) {
      connect();
      startPolling();
    }

    return () => {
      disconnect();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    refresh,
  };
}

/**
 * Hook for specific metric subscriptions
 */
export function useMetricSubscription<T>(
  metricKey: keyof AggregatedMetrics,
  selector?: (metrics: AggregatedMetrics) => T
) {
  const { metrics, isConnected, lastUpdate, error } = useRealTimeMetrics({
    channels: ['metrics'],
  });

  const value = metrics
    ? selector
      ? selector(metrics)
      : metrics[metricKey]
    : null;

  return {
    value: value as T | null,
    isConnected,
    lastUpdate,
    error,
  };
}

/**
 * Hook for alert subscriptions
 */
export function useAlertSubscription(options: {
  status?: ('active' | 'acknowledged')[];
  severity?: ('info' | 'warning' | 'error' | 'critical')[];
  maxAlerts?: number;
} = {}) {
  const { alerts, isConnected, lastUpdate, error, refresh } = useRealTimeMetrics({
    channels: ['alerts'],
  });

  const { status, severity, maxAlerts = 100 } = options;

  let filteredAlerts = alerts;

  if (status && status.length > 0) {
    filteredAlerts = filteredAlerts.filter(a => status.includes(a.status as 'active' | 'acknowledged'));
  }

  if (severity && severity.length > 0) {
    filteredAlerts = filteredAlerts.filter(a => severity.includes(a.severity));
  }

  return {
    alerts: filteredAlerts.slice(0, maxAlerts),
    totalCount: filteredAlerts.length,
    isConnected,
    lastUpdate,
    error,
    refresh,
  };
}

export default useRealTimeMetrics;
