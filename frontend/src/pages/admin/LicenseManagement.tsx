// =============================================================================
// License Management Page
// SCALE Tier - Task T186-T190
//
// Admin interface for license management and monitoring
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Alert,
  AlertTitle,
  Grid,
  LinearProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
  Paper,
} from '@mui/material';
import {
  Key as KeyIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  CloudOff as CloudOffIcon,
  CloudDone as CloudDoneIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Timer as TimerIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Inventory as ProcessIcon,
  Check as FeatureEnabledIcon,
  Close as FeatureDisabledIcon,
} from '@mui/icons-material';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface LicenseStatus {
  status: 'active' | 'expired' | 'missing' | 'invalid';
  type?: string;
  organization?: string;
  expiresAt?: string;
  daysRemaining?: number;
  features?: Record<string, boolean | number>;
  usage?: {
    users: { current: number; limit: number };
    entities: { current: number; limit: number };
    processes: { current: number; limit: number };
  };
}

interface OfflineStatus {
  isOffline: boolean;
  lastOnline: string | null;
  offlineSince: string | null;
  syncPending: boolean;
  pendingChanges: number;
  aiCacheStatus: {
    modelsAvailable: boolean;
    lastUpdated: string | null;
    cachedPrompts: number;
    cachedResponses: number;
  };
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export const LicenseManagement: React.FC = () => {
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hardwareFingerprint, setHardwareFingerprint] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchLicenseStatus = async () => {
    try {
      const response = await fetch('/api/license/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setLicenseStatus(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch license status:', err);
    }
  };

  const fetchOfflineStatus = async () => {
    try {
      const response = await fetch('/api/license/offline/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setOfflineStatus(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch offline status:', err);
    }
  };

  const fetchHardwareFingerprint = async () => {
    try {
      const response = await fetch('/api/license/hardware-fingerprint', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setHardwareFingerprint(data.data.fingerprint);
      }
    } catch (err) {
      console.error('Failed to fetch hardware fingerprint:', err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchLicenseStatus(),
        fetchOfflineStatus(),
        fetchHardwareFingerprint(),
      ]);
      setLoading(false);
    };
    loadData();
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleActivate = async () => {
    setActivating(true);
    setError(null);

    try {
      const response = await fetch('/api/license/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ licenseKey }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('License activated successfully!');
        setActivateDialogOpen(false);
        setLicenseKey('');
        await fetchLicenseStatus();
      } else {
        setError(data.errors?.join(', ') || 'Failed to activate license');
      }
    } catch (err) {
      setError('Failed to activate license');
    } finally {
      setActivating(false);
    }
  };

  const copyFingerprint = () => {
    if (hardwareFingerprint) {
      navigator.clipboard.writeText(hardwareFingerprint);
      setSuccess('Hardware fingerprint copied to clipboard');
    }
  };

  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'expired':
        return 'error';
      case 'missing':
        return 'warning';
      default:
        return 'error';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircleIcon color="success" />;
      case 'expired':
        return <ErrorIcon color="error" />;
      case 'missing':
        return <WarningIcon color="warning" />;
      default:
        return <ErrorIcon color="error" />;
    }
  };

  const renderUsageBar = (
    label: string,
    current: number,
    limit: number,
    icon: React.ReactNode
  ) => {
    const percentage = limit === -1 ? 0 : (current / limit) * 100;
    const isUnlimited = limit === -1;

    return (
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {icon}
          <Typography variant="body2" sx={{ ml: 1, flexGrow: 1 }}>
            {label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {current} / {isUnlimited ? '∞' : limit}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={isUnlimited ? 0 : Math.min(percentage, 100)}
          color={percentage > 90 ? 'error' : percentage > 70 ? 'warning' : 'primary'}
        />
      </Box>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading license information...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <KeyIcon sx={{ mr: 2, fontSize: 32 }} />
        <Typography variant="h4">License Management</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton onClick={() => {
          setLoading(true);
          Promise.all([fetchLicenseStatus(), fetchOfflineStatus()]).then(() => {
            setLoading(false);
          });
        }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* License Status Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                {licenseStatus && getStatusIcon(licenseStatus.status)}
                <Typography variant="h6" sx={{ ml: 1 }}>
                  License Status
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Chip
                  label={licenseStatus?.status?.toUpperCase() || 'UNKNOWN'}
                  color={getStatusColor(licenseStatus?.status || '')}
                  size="small"
                />
              </Box>

              {licenseStatus?.status === 'active' ? (
                <>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="License Type"
                        secondary={licenseStatus.type}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Organization"
                        secondary={licenseStatus.organization}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Expires"
                        secondary={
                          licenseStatus.expiresAt
                            ? new Date(licenseStatus.expiresAt).toLocaleDateString()
                            : 'N/A'
                        }
                      />
                      {licenseStatus.daysRemaining !== undefined && (
                        <Chip
                          icon={<TimerIcon />}
                          label={`${licenseStatus.daysRemaining} days`}
                          size="small"
                          color={licenseStatus.daysRemaining <= 30 ? 'warning' : 'default'}
                        />
                      )}
                    </ListItem>
                  </List>
                </>
              ) : (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    {licenseStatus?.status === 'missing'
                      ? 'No license found. Please activate a license.'
                      : licenseStatus?.status === 'expired'
                      ? 'Your license has expired. Please renew.'
                      : 'Invalid license. Please contact support.'}
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<KeyIcon />}
                    onClick={() => setActivateDialogOpen(true)}
                  >
                    Activate License
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Usage Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Usage
              </Typography>

              {licenseStatus?.usage ? (
                <>
                  {renderUsageBar(
                    'Users',
                    licenseStatus.usage.users.current,
                    licenseStatus.usage.users.limit,
                    <PersonIcon color="action" />
                  )}
                  {renderUsageBar(
                    'Entities',
                    licenseStatus.usage.entities.current,
                    licenseStatus.usage.entities.limit,
                    <BusinessIcon color="action" />
                  )}
                  {renderUsageBar(
                    'Processes',
                    licenseStatus.usage.processes.current,
                    licenseStatus.usage.processes.limit,
                    <ProcessIcon color="action" />
                  )}
                </>
              ) : (
                <Typography color="text.secondary">
                  Usage data not available
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Features Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Licensed Features
              </Typography>

              {licenseStatus?.features ? (
                <Grid container spacing={1}>
                  {Object.entries(licenseStatus.features)
                    .filter(([key]) => typeof licenseStatus.features![key] === 'boolean')
                    .map(([key, value]) => (
                      <Grid item xs={6} key={key}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {value ? (
                            <FeatureEnabledIcon color="success" fontSize="small" />
                          ) : (
                            <FeatureDisabledIcon color="disabled" fontSize="small" />
                          )}
                          <Typography
                            variant="body2"
                            sx={{ ml: 1 }}
                            color={value ? 'text.primary' : 'text.disabled'}
                          >
                            {key
                              .replace(/([A-Z])/g, ' $1')
                              .replace(/^./, (str) => str.toUpperCase())}
                          </Typography>
                        </Box>
                      </Grid>
                    ))}
                </Grid>
              ) : (
                <Typography color="text.secondary">
                  No feature information available
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Offline Status Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                {offlineStatus?.isOffline ? (
                  <CloudOffIcon color="warning" />
                ) : (
                  <CloudDoneIcon color="success" />
                )}
                <Typography variant="h6" sx={{ ml: 1 }}>
                  Connectivity
                </Typography>
              </Box>

              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Status"
                    secondary={offlineStatus?.isOffline ? 'Offline' : 'Online'}
                  />
                </ListItem>
                {offlineStatus?.lastOnline && (
                  <ListItem>
                    <ListItemText
                      primary="Last Online"
                      secondary={new Date(offlineStatus.lastOnline).toLocaleString()}
                    />
                  </ListItem>
                )}
                {offlineStatus?.syncPending && (
                  <ListItem>
                    <ListItemText
                      primary="Pending Changes"
                      secondary={`${offlineStatus.pendingChanges} changes waiting to sync`}
                    />
                  </ListItem>
                )}
              </List>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                AI Cache Status
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {offlineStatus?.aiCacheStatus.modelsAvailable
                  ? 'Local AI models available'
                  : 'No local AI models'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {offlineStatus?.aiCacheStatus.cachedResponses || 0} cached responses
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Hardware Fingerprint Card */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Installation Information
              </Typography>

              <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Hardware Fingerprint
                  </Typography>
                  <Typography variant="body1" fontFamily="monospace">
                    {hardwareFingerprint || 'Loading...'}
                  </Typography>
                </Box>
                <Tooltip title="Copy to clipboard">
                  <IconButton onClick={copyFingerprint}>
                    <CopyIcon />
                  </IconButton>
                </Tooltip>
              </Paper>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Provide this fingerprint when requesting a hardware-bound license.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Activate License Dialog */}
      <Dialog
        open={activateDialogOpen}
        onClose={() => setActivateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Activate License</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter your license key to activate Foundry. You can obtain a license
            key from your account manager or the Foundry portal.
          </Typography>

          <TextField
            label="License Key"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            fullWidth
            multiline
            rows={4}
            placeholder="Paste your license key here..."
            sx={{ fontFamily: 'monospace' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActivateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleActivate}
            disabled={!licenseKey || activating}
          >
            {activating ? 'Activating...' : 'Activate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LicenseManagement;
