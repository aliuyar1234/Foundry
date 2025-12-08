/**
 * Notification Center Component
 * T236 - Workload and burnout notification management
 *
 * Displays notifications with actions to read, dismiss, or take action
 */

import React, { useState, useEffect, useCallback } from 'react';

// Types
interface WorkloadNotification {
  id: string;
  type: NotificationType;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  message: string;
  personId?: string;
  personName?: string;
  teamId?: string;
  warningId?: string;
  data?: Record<string, unknown>;
  actions: NotificationAction[];
  createdAt: string;
  readAt?: string;
  actionedAt?: string;
  dismissedAt?: string;
}

type NotificationType =
  | 'burnout_warning'
  | 'workload_spike'
  | 'deadline_risk'
  | 'capacity_alert'
  | 'redistribution_suggested'
  | 'warning_escalation'
  | 'weekly_summary'
  | 'action_required';

interface NotificationAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'danger';
  action: string; // API endpoint or action identifier
}

interface NotificationPreferences {
  channels: {
    inApp: boolean;
    email: boolean;
    slack: boolean;
    teams: boolean;
    sms: boolean;
  };
  priorities: {
    low: boolean;
    medium: boolean;
    high: boolean;
    urgent: boolean;
  };
  types: Record<NotificationType, boolean>;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  digestFrequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
}

interface NotificationCenterProps {
  userId: string;
  onNotificationClick?: (notification: WorkloadNotification) => void;
  compact?: boolean;
}

const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  burnout_warning: '🔥',
  workload_spike: '📈',
  deadline_risk: '📅',
  capacity_alert: '👥',
  redistribution_suggested: '🔄',
  warning_escalation: '⚠️',
  weekly_summary: '📊',
  action_required: '❗',
};

const PRIORITY_COLORS = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444',
};

export function NotificationCenter({
  userId,
  onNotificationClick,
  compact = false,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<WorkloadNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'actionable'>('unread');
  const [showPreferences, setShowPreferences] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/workload/notifications?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');
      const data = await response.json();
      setNotifications(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (notificationId: string) => {
    try {
      await fetch(`/api/workload/notifications/${notificationId}/read`, {
        method: 'POST',
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n
        )
      );
    } catch {
      // Ignore
    }
  };

  const handleDismiss = async (notificationId: string) => {
    try {
      await fetch(`/api/workload/notifications/${notificationId}/dismiss`, {
        method: 'POST',
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, dismissedAt: new Date().toISOString() } : n
        )
      );
    } catch {
      // Ignore
    }
  };

  const handleAction = async (notificationId: string, action: NotificationAction) => {
    try {
      await fetch(`/api/workload/notifications/${notificationId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: action.id }),
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, actionedAt: new Date().toISOString() } : n
        )
      );
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch(`/api/workload/notifications/mark-all-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      );
    } catch {
      // Ignore
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (n.dismissedAt) return false;
    if (filter === 'unread') return !n.readAt;
    if (filter === 'actionable') return n.actions.length > 0 && !n.actionedAt;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.readAt && !n.dismissedAt).length;
  const urgentCount = notifications.filter(
    (n) => n.priority === 'urgent' && !n.readAt && !n.dismissedAt
  ).length;

  if (loading && notifications.length === 0) {
    return (
      <div className={`notification-center ${compact ? 'compact' : ''} loading`}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className={`notification-center ${compact ? 'compact' : ''}`}>
      {/* Header */}
      <div className="center-header">
        <div className="header-info">
          <h3>Notifications</h3>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount} unread</span>
          )}
          {urgentCount > 0 && (
            <span className="urgent-badge">{urgentCount} urgent</span>
          )}
        </div>
        <div className="header-actions">
          {unreadCount > 0 && (
            <button className="btn btn-text btn-small" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          )}
          <button
            className="btn btn-outline btn-small"
            onClick={() => setShowPreferences(!showPreferences)}
          >
            ⚙️
          </button>
          <button className="btn btn-outline btn-small" onClick={fetchNotifications}>
            ↻
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`tab ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Unread
        </button>
        <button
          className={`tab ${filter === 'actionable' ? 'active' : ''}`}
          onClick={() => setFilter('actionable')}
        >
          Action Required
        </button>
        <button
          className={`tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
      </div>

      {/* Preferences Panel */}
      {showPreferences && (
        <NotificationPreferencesPanel userId={userId} onClose={() => setShowPreferences(false)} />
      )}

      {/* Notifications List */}
      <div className="notifications-list">
        {filteredNotifications.length === 0 ? (
          <div className="empty-state">
            <span className="icon">✓</span>
            <p>
              {filter === 'unread'
                ? 'All caught up!'
                : filter === 'actionable'
                ? 'No actions required'
                : 'No notifications'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              compact={compact}
              onClick={() => {
                if (!notification.readAt) handleMarkRead(notification.id);
                onNotificationClick?.(notification);
              }}
              onDismiss={() => handleDismiss(notification.id)}
              onAction={(action) => handleAction(notification.id, action)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Notification Card
interface NotificationCardProps {
  notification: WorkloadNotification;
  compact: boolean;
  onClick: () => void;
  onDismiss: () => void;
  onAction: (action: NotificationAction) => void;
}

function NotificationCard({
  notification,
  compact,
  onClick,
  onDismiss,
  onAction,
}: NotificationCardProps) {
  const isUnread = !notification.readAt;
  const isActioned = !!notification.actionedAt;

  return (
    <div
      className={`notification-card ${notification.priority} ${isUnread ? 'unread' : ''} ${isActioned ? 'actioned' : ''}`}
      onClick={onClick}
    >
      <div className="card-indicator" style={{ backgroundColor: PRIORITY_COLORS[notification.priority] }} />

      <div className="card-icon">{NOTIFICATION_ICONS[notification.type] || '📬'}</div>

      <div className="card-content">
        <div className="card-header">
          <span className="notification-title">{notification.title}</span>
          <span className="notification-time">{formatTimeAgo(new Date(notification.createdAt))}</span>
        </div>

        <p className="notification-message">{notification.message}</p>

        {notification.personName && (
          <span className="related-person">👤 {notification.personName}</span>
        )}

        {!compact && notification.actions.length > 0 && !isActioned && (
          <div className="card-actions" onClick={(e) => e.stopPropagation()}>
            {notification.actions.map((action) => (
              <button
                key={action.id}
                className={`btn btn-small ${action.type === 'primary' ? 'btn-primary' : action.type === 'danger' ? 'btn-danger' : 'btn-outline'}`}
                onClick={() => onAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {isActioned && (
          <div className="actioned-indicator">✓ Action taken</div>
        )}
      </div>

      <button
        className="dismiss-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// Notification Preferences Panel
interface NotificationPreferencesPanelProps {
  userId: string;
  onClose: () => void;
}

function NotificationPreferencesPanel({ userId, onClose }: NotificationPreferencesPanelProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const response = await fetch(`/api/workload/notifications/preferences?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          setPreferences(data.data);
        }
      } catch {
        // Use defaults
        setPreferences(getDefaultPreferences());
      } finally {
        setLoading(false);
      }
    };
    fetchPreferences();
  }, [userId]);

  const handleSave = async () => {
    if (!preferences) return;
    setSaving(true);
    try {
      await fetch(`/api/workload/notifications/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, preferences }),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const updateChannel = (channel: keyof NotificationPreferences['channels'], value: boolean) => {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      channels: { ...preferences.channels, [channel]: value },
    });
  };

  const updatePriority = (priority: keyof NotificationPreferences['priorities'], value: boolean) => {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      priorities: { ...preferences.priorities, [priority]: value },
    });
  };

  if (loading || !preferences) {
    return (
      <div className="preferences-panel loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="preferences-panel">
      <div className="panel-header">
        <h4>Notification Preferences</h4>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="panel-content">
        {/* Channels */}
        <div className="preferences-section">
          <h5>Notification Channels</h5>
          <div className="checkbox-group">
            {Object.entries(preferences.channels).map(([channel, enabled]) => (
              <label key={channel} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    updateChannel(channel as keyof NotificationPreferences['channels'], e.target.checked)
                  }
                />
                <span>{formatChannelName(channel)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Priorities */}
        <div className="preferences-section">
          <h5>Priority Levels</h5>
          <div className="checkbox-group">
            {Object.entries(preferences.priorities).map(([priority, enabled]) => (
              <label key={priority} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    updatePriority(priority as keyof NotificationPreferences['priorities'], e.target.checked)
                  }
                />
                <span
                  className="priority-label"
                  style={{ color: PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] }}
                >
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="preferences-section">
          <h5>Quiet Hours</h5>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preferences.quietHours.enabled}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  quietHours: { ...preferences.quietHours, enabled: e.target.checked },
                })
              }
            />
            <span>Enable quiet hours</span>
          </label>
          {preferences.quietHours.enabled && (
            <div className="time-range">
              <input
                type="time"
                value={preferences.quietHours.start}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    quietHours: { ...preferences.quietHours, start: e.target.value },
                  })
                }
              />
              <span>to</span>
              <input
                type="time"
                value={preferences.quietHours.end}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    quietHours: { ...preferences.quietHours, end: e.target.value },
                  })
                }
              />
            </div>
          )}
        </div>

        {/* Digest Frequency */}
        <div className="preferences-section">
          <h5>Summary Digest</h5>
          <select
            value={preferences.digestFrequency}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                digestFrequency: e.target.value as NotificationPreferences['digestFrequency'],
              })
            }
            className="digest-select"
          >
            <option value="immediate">Immediate (no digest)</option>
            <option value="hourly">Hourly digest</option>
            <option value="daily">Daily digest</option>
            <option value="weekly">Weekly digest</option>
          </select>
        </div>
      </div>

      <div className="panel-footer">
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}

// Helper Functions
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function formatChannelName(channel: string): string {
  const names: Record<string, string> = {
    inApp: 'In-App',
    email: 'Email',
    slack: 'Slack',
    teams: 'Microsoft Teams',
    sms: 'SMS',
  };
  return names[channel] || channel;
}

function getDefaultPreferences(): NotificationPreferences {
  return {
    channels: {
      inApp: true,
      email: true,
      slack: false,
      teams: false,
      sms: false,
    },
    priorities: {
      low: false,
      medium: true,
      high: true,
      urgent: true,
    },
    types: {
      burnout_warning: true,
      workload_spike: true,
      deadline_risk: true,
      capacity_alert: true,
      redistribution_suggested: true,
      warning_escalation: true,
      weekly_summary: true,
      action_required: true,
    },
    quietHours: {
      enabled: true,
      start: '22:00',
      end: '08:00',
    },
    digestFrequency: 'daily',
  };
}

// Notification Badge for header/nav
interface NotificationBadgeProps {
  userId: string;
  onClick?: () => void;
}

export function NotificationBadge({ userId, onClick }: NotificationBadgeProps) {
  const [count, setCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const response = await fetch(`/api/workload/notifications/count?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          setCount(data.data?.unread || 0);
          setUrgentCount(data.data?.urgent || 0);
        }
      } catch {
        // Ignore
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, [userId]);

  if (count === 0) return null;

  return (
    <button className="notification-badge-btn" onClick={onClick}>
      <span className="bell-icon">🔔</span>
      <span className={`badge-count ${urgentCount > 0 ? 'urgent' : ''}`}>
        {count}
      </span>
    </button>
  );
}

export default NotificationCenter;
