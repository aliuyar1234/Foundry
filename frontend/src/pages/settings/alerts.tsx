/**
 * Alert Settings Page
 * Configure alert subscriptions and notification preferences
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import {
  useAlertSubscriptions,
  useCreateSubscription,
  useUpdateSubscription,
  useDeleteSubscription,
  useTestSubscription,
  AlertSubscription,
  SubscriptionChannel,
  AlertFilter,
  AlertSchedule,
  NotificationChannel,
  AlertType,
  AlertSeverity,
} from '../../hooks/useAlerts';

const alertTypeOptions: AlertType[] = [
  'burnout_warning',
  'process_degradation',
  'team_conflict',
  'bus_factor_risk',
  'data_quality_issue',
  'compliance_alert',
  'system_alert',
];

const severityOptions: AlertSeverity[] = ['info', 'warning', 'error', 'critical'];

const channelLabels: Record<NotificationChannel, string> = {
  email: 'Email',
  slack: 'Slack',
  teams: 'Microsoft Teams',
  webhook: 'Webhook',
  in_app: 'In-App',
};

export function AlertSettingsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: subscriptions, isLoading } = useAlertSubscriptions();
  const createSubscription = useCreateSubscription();
  const deleteSubscription = useDeleteSubscription();
  const testSubscription = useTestSubscription();

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this subscription?')) {
      await deleteSubscription.mutateAsync(id);
    }
  };

  const handleTest = async (id: string) => {
    const result = await testSubscription.mutateAsync(id);
    if (result.results.every((r) => r.success)) {
      alert('All channels tested successfully!');
    } else {
      const failures = result.results.filter((r) => !r.success);
      alert(`Some channels failed: ${failures.map((f) => f.channel).join(', ')}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/discovery/insights"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to Insights
          </Link>
          <h1 className="text-2xl font-bold mt-2">Alert Settings</h1>
          <p className="text-gray-500">
            Configure how and when you receive notifications
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          Create Subscription
        </Button>
      </div>

      {/* Existing Subscriptions */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6">
                  <div className="h-6 w-48 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 w-full bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : subscriptions && subscriptions.length > 0 ? (
          subscriptions.map((subscription) => (
            <SubscriptionCard
              key={subscription.id}
              subscription={subscription}
              onEdit={() => setEditingId(subscription.id)}
              onDelete={() => handleDelete(subscription.id)}
              onTest={() => handleTest(subscription.id)}
              isTesting={testSubscription.isPending}
            />
          ))
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No alert subscriptions
                </h3>
                <p className="text-gray-500 mb-4">
                  Create a subscription to receive notifications about organizational insights
                </p>
                <Button onClick={() => setShowCreateForm(true)}>
                  Create Your First Subscription
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Form Modal */}
      {(showCreateForm || editingId) && (
        <SubscriptionFormModal
          subscription={editingId ? subscriptions?.find((s) => s.id === editingId) : undefined}
          onClose={() => {
            setShowCreateForm(false);
            setEditingId(null);
          }}
          onSave={async (data) => {
            if (editingId) {
              // Update existing
            } else {
              await createSubscription.mutateAsync(data);
            }
            setShowCreateForm(false);
            setEditingId(null);
          }}
          isSaving={createSubscription.isPending}
        />
      )}
    </div>
  );
}

interface SubscriptionCardProps {
  subscription: AlertSubscription;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  isTesting: boolean;
}

function SubscriptionCard({
  subscription,
  onEdit,
  onDelete,
  onTest,
  isTesting,
}: SubscriptionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{subscription.name}</CardTitle>
            {subscription.description && (
              <p className="text-sm text-gray-500">{subscription.description}</p>
            )}
          </div>
          <Badge variant={subscription.isActive ? 'default' : 'secondary'}>
            {subscription.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Channels */}
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Notification Channels</p>
          <div className="flex gap-2">
            {subscription.channels.map((channel, i) => (
              <Badge key={i} variant="outline">
                {channelLabels[channel.type]}
              </Badge>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Filters</p>
          <div className="flex flex-wrap gap-1">
            {subscription.filters.severities?.map((severity) => (
              <Badge key={severity} variant="outline" className="text-xs">
                {severity}
              </Badge>
            ))}
            {subscription.filters.types?.map((type) => (
              <Badge key={type} variant="outline" className="text-xs">
                {type.replace('_', ' ')}
              </Badge>
            ))}
            {!subscription.filters.severities?.length &&
              !subscription.filters.types?.length && (
                <span className="text-xs text-gray-400">All alerts</span>
              )}
          </div>
        </div>

        {/* Schedule */}
        {subscription.schedule && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Schedule</p>
            <p className="text-sm text-gray-600">
              {subscription.schedule.type === 'immediate'
                ? 'Immediate notifications'
                : subscription.schedule.type === 'digest'
                ? `${subscription.schedule.digestFrequency} digest at ${subscription.schedule.digestTime || 'default time'}`
                : 'Scheduled'}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onTest}
            disabled={isTesting}
          >
            {isTesting ? 'Testing...' : 'Test'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface SubscriptionFormModalProps {
  subscription?: AlertSubscription;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description?: string;
    channels: SubscriptionChannel[];
    filters: AlertFilter;
    schedule?: AlertSchedule;
  }) => Promise<void>;
  isSaving: boolean;
}

function SubscriptionFormModal({
  subscription,
  onClose,
  onSave,
  isSaving,
}: SubscriptionFormModalProps) {
  const [name, setName] = useState(subscription?.name || '');
  const [description, setDescription] = useState(subscription?.description || '');
  const [selectedChannel, setSelectedChannel] = useState<NotificationChannel>('email');
  const [channelEmail, setChannelEmail] = useState('');
  const [channelWebhook, setChannelWebhook] = useState('');
  const [channels, setChannels] = useState<SubscriptionChannel[]>(
    subscription?.channels || []
  );
  const [selectedTypes, setSelectedTypes] = useState<AlertType[]>(
    subscription?.filters.types || []
  );
  const [selectedSeverities, setSelectedSeverities] = useState<AlertSeverity[]>(
    subscription?.filters.severities || []
  );
  const [scheduleType, setScheduleType] = useState<'immediate' | 'digest'>(
    subscription?.schedule?.type === 'digest' ? 'digest' : 'immediate'
  );
  const [digestFrequency, setDigestFrequency] = useState<'hourly' | 'daily' | 'weekly'>(
    subscription?.schedule?.digestFrequency || 'daily'
  );

  const addChannel = () => {
    let config = {};
    if (selectedChannel === 'email' && channelEmail) {
      config = { email: channelEmail };
    } else if (selectedChannel === 'slack' && channelWebhook) {
      config = { webhookUrl: channelWebhook };
    } else if (selectedChannel === 'teams' && channelWebhook) {
      config = { teamsWebhookUrl: channelWebhook };
    } else {
      return;
    }

    setChannels([...channels, { type: selectedChannel, config }]);
    setChannelEmail('');
    setChannelWebhook('');
  };

  const removeChannel = (index: number) => {
    setChannels(channels.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name || channels.length === 0) return;

    await onSave({
      name,
      description: description || undefined,
      channels,
      filters: {
        types: selectedTypes.length > 0 ? selectedTypes : undefined,
        severities: selectedSeverities.length > 0 ? selectedSeverities : undefined,
      },
      schedule:
        scheduleType === 'digest'
          ? { type: 'digest', digestFrequency }
          : { type: 'immediate' },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-6">
            {subscription ? 'Edit Subscription' : 'Create Subscription'}
          </h2>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Critical Alerts to Slack"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>

            {/* Channels */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notification Channels *
              </label>
              {channels.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {channels.map((channel, i) => (
                    <Badge key={i} variant="secondary" className="pr-1">
                      {channelLabels[channel.type]}
                      <button
                        className="ml-1 text-gray-400 hover:text-gray-600"
                        onClick={() => removeChannel(i)}
                      >
                        x
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value as NotificationChannel)}
                >
                  <option value="email">Email</option>
                  <option value="slack">Slack</option>
                  <option value="teams">Microsoft Teams</option>
                </select>
                {selectedChannel === 'email' && (
                  <Input
                    type="email"
                    value={channelEmail}
                    onChange={(e) => setChannelEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1"
                  />
                )}
                {(selectedChannel === 'slack' || selectedChannel === 'teams') && (
                  <Input
                    value={channelWebhook}
                    onChange={(e) => setChannelWebhook(e.target.value)}
                    placeholder="Webhook URL"
                    className="flex-1"
                  />
                )}
                <Button variant="outline" size="sm" onClick={addChannel}>
                  Add
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Alert Filters
              </label>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Severities (leave empty for all)</p>
                  <div className="flex flex-wrap gap-1">
                    {severityOptions.map((severity) => (
                      <Badge
                        key={severity}
                        variant="outline"
                        className={`cursor-pointer ${
                          selectedSeverities.includes(severity)
                            ? 'bg-blue-100 border-blue-500'
                            : ''
                        }`}
                        onClick={() => {
                          if (selectedSeverities.includes(severity)) {
                            setSelectedSeverities(selectedSeverities.filter((s) => s !== severity));
                          } else {
                            setSelectedSeverities([...selectedSeverities, severity]);
                          }
                        }}
                      >
                        {severity}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Alert Types (leave empty for all)</p>
                  <div className="flex flex-wrap gap-1">
                    {alertTypeOptions.map((type) => (
                      <Badge
                        key={type}
                        variant="outline"
                        className={`cursor-pointer text-xs ${
                          selectedTypes.includes(type)
                            ? 'bg-blue-100 border-blue-500'
                            : ''
                        }`}
                        onClick={() => {
                          if (selectedTypes.includes(type)) {
                            setSelectedTypes(selectedTypes.filter((t) => t !== type));
                          } else {
                            setSelectedTypes([...selectedTypes, type]);
                          }
                        }}
                      >
                        {type.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Schedule
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={scheduleType === 'immediate'}
                    onChange={() => setScheduleType('immediate')}
                  />
                  <span className="text-sm">Immediate</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={scheduleType === 'digest'}
                    onChange={() => setScheduleType('digest')}
                  />
                  <span className="text-sm">Digest</span>
                </label>
              </div>
              {scheduleType === 'digest' && (
                <div className="mt-2">
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={digestFrequency}
                    onChange={(e) =>
                      setDigestFrequency(e.target.value as 'hourly' | 'daily' | 'weekly')
                    }
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-8 pt-4 border-t">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name || channels.length === 0 || isSaving}
            >
              {isSaving ? 'Saving...' : subscription ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AlertSettingsPage;
