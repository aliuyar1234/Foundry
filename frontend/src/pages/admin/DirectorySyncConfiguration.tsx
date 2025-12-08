// =============================================================================
// Directory Sync Configuration Page
// SCALE Tier - Task T281-T290
//
// Admin interface for directory synchronization configuration
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  Tooltip,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Sync as SyncIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon,
  Cloud as CloudIcon,
} from '@mui/icons-material';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface DirectorySyncConfig {
  id: string;
  name: string;
  sourceType: 'scim' | 'ldap' | 'azure-ad' | 'okta' | 'google';
  sourceConfig: Record<string, unknown>;
  syncUsers: boolean;
  syncGroups: boolean;
  syncRoles: boolean;
  scheduleEnabled: boolean;
  scheduleInterval: number;
  enabled: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  lastSyncError?: string;
}

interface SyncJob {
  id: string;
  configId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  type: 'full' | 'incremental';
  startedAt?: string;
  completedAt?: string;
  stats: {
    usersProcessed: number;
    usersCreated: number;
    usersUpdated: number;
    usersDeactivated: number;
    groupsProcessed: number;
    groupsCreated: number;
    groupsUpdated: number;
    duration: number;
  };
  errors: Array<{
    type: string;
    message: string;
    entityId?: string;
  }>;
}

const SOURCE_TYPES = [
  { value: 'scim', label: 'SCIM 2.0', description: 'Standard SCIM endpoint' },
  { value: 'azure-ad', label: 'Azure AD', description: 'Microsoft Azure Active Directory' },
  { value: 'okta', label: 'Okta', description: 'Okta Universal Directory' },
  { value: 'google', label: 'Google Workspace', description: 'Google Cloud Identity' },
  { value: 'ldap', label: 'LDAP', description: 'LDAP/Active Directory' },
];

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export const DirectorySyncConfiguration: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [configs, setConfigs] = useState<DirectorySyncConfig[]>([]);
  const [jobs, setJobs] = useState<Record<string, SyncJob[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<DirectorySyncConfig | null>(null);
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<DirectorySyncConfig>>({
    name: '',
    sourceType: 'scim',
    sourceConfig: {},
    syncUsers: true,
    syncGroups: true,
    syncRoles: true,
    scheduleEnabled: false,
    scheduleInterval: 60,
    enabled: true,
  });

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/sso/directory-sync', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await response.json();

      if (data.success) {
        setConfigs(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch directory sync configs:', err);
    }
    setLoading(false);
  };

  const fetchJobs = async (configId: string) => {
    try {
      const response = await fetch(`/api/sso/directory-sync/${configId}/jobs`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await response.json();

      if (data.success) {
        setJobs((prev) => ({ ...prev, [configId]: data.data }));
      }
    } catch (err) {
      console.error('Failed to fetch sync jobs:', err);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  useEffect(() => {
    if (expandedConfig) {
      fetchJobs(expandedConfig);
    }
  }, [expandedConfig]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleOpenDialog = (config?: DirectorySyncConfig) => {
    if (config) {
      setEditingConfig(config);
      setFormData(config);
    } else {
      setEditingConfig(null);
      setFormData({
        name: '',
        sourceType: 'scim',
        sourceConfig: {},
        syncUsers: true,
        syncGroups: true,
        syncRoles: true,
        scheduleEnabled: false,
        scheduleInterval: 60,
        enabled: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingConfig(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const url = editingConfig
        ? `/api/sso/directory-sync/${editingConfig.id}`
        : '/api/sso/directory-sync';
      const method = editingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(editingConfig ? 'Configuration updated' : 'Configuration created');
        handleCloseDialog();
        fetchConfigs();
      } else {
        setError(data.errors?.join(', ') || 'Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save configuration');
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sync configuration?')) return;

    try {
      const response = await fetch(`/api/sso/directory-sync/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        setSuccess('Configuration deleted');
        fetchConfigs();
      } else {
        setError('Failed to delete configuration');
      }
    } catch (err) {
      setError('Failed to delete configuration');
    }
  };

  const handleRunSync = async (configId: string, type: 'full' | 'incremental') => {
    try {
      const response = await fetch(`/api/sso/directory-sync/${configId}/run?type=${type}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`${type === 'full' ? 'Full' : 'Incremental'} sync started`);
        fetchJobs(configId);
      } else {
        setError('Failed to start sync');
      }
    } catch (err) {
      setError('Failed to start sync');
    }
  };

  const handleToggleEnabled = async (config: DirectorySyncConfig) => {
    try {
      const response = await fetch(`/api/sso/directory-sync/${config.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ enabled: !config.enabled }),
      });

      const data = await response.json();

      if (data.success) {
        fetchConfigs();
      }
    } catch (err) {
      setError('Failed to update configuration');
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'success':
      case 'completed':
        return 'success';
      case 'partial':
        return 'warning';
      case 'failed':
        return 'error';
      case 'running':
        return 'info';
      default:
        return 'default';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading directory sync configuration...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <CloudIcon sx={{ mr: 2, fontSize: 32 }} />
        <Typography variant="h4">Directory Sync</Typography>
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

      <Alert severity="info" sx={{ mb: 3 }}>
        Directory sync automatically synchronizes users and groups from your identity provider.
        Configure scheduled syncs or run them manually as needed.
      </Alert>

      <Box sx={{ mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Sync Configuration
        </Button>
      </Box>

      {configs.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              No directory sync configurations. Add a configuration to get started.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        configs.map((config) => (
          <Accordion
            key={config.id}
            expanded={expandedConfig === config.id}
            onChange={() =>
              setExpandedConfig(expandedConfig === config.id ? null : config.id)
            }
            sx={{ mb: 2 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pr: 2 }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle1">{config.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {SOURCE_TYPES.find((s) => s.value === config.sourceType)?.label} |{' '}
                    {config.scheduleEnabled
                      ? `Every ${config.scheduleInterval} minutes`
                      : 'Manual sync only'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {config.lastSyncAt && (
                    <Chip
                      size="small"
                      label={`Last: ${new Date(config.lastSyncAt).toLocaleString()}`}
                      color={getStatusColor(config.lastSyncStatus) as any}
                    />
                  )}
                  <Chip
                    size="small"
                    label={config.enabled ? 'Enabled' : 'Disabled'}
                    color={config.enabled ? 'success' : 'default'}
                  />
                </Box>
              </Box>
            </AccordionSummary>

            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" gutterBottom>
                        Configuration
                      </Typography>
                      <List dense>
                        <ListItem>
                          <ListItemText
                            primary="Source Type"
                            secondary={SOURCE_TYPES.find((s) => s.value === config.sourceType)?.label}
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText
                            primary="Sync Options"
                            secondary={[
                              config.syncUsers && 'Users',
                              config.syncGroups && 'Groups',
                              config.syncRoles && 'Roles',
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText
                            primary="Schedule"
                            secondary={
                              config.scheduleEnabled
                                ? `Every ${config.scheduleInterval} minutes`
                                : 'Disabled'
                            }
                          />
                        </ListItem>
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" gutterBottom>
                        Actions
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PlayIcon />}
                          onClick={() => handleRunSync(config.id, 'incremental')}
                        >
                          Run Incremental
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<SyncIcon />}
                          onClick={() => handleRunSync(config.id, 'full')}
                        >
                          Run Full Sync
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EditIcon />}
                          onClick={() => handleOpenDialog(config)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color={config.enabled ? 'warning' : 'success'}
                          onClick={() => handleToggleEnabled(config)}
                        >
                          {config.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleDelete(config.id)}
                        >
                          Delete
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <HistoryIcon sx={{ mr: 1 }} />
                        <Typography variant="subtitle2">Recent Sync Jobs</Typography>
                        <Box sx={{ flexGrow: 1 }} />
                        <IconButton size="small" onClick={() => fetchJobs(config.id)}>
                          <RefreshIcon />
                        </IconButton>
                      </Box>

                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Type</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell>Started</TableCell>
                              <TableCell>Duration</TableCell>
                              <TableCell>Results</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {!jobs[config.id] || jobs[config.id].length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} align="center">
                                  <Typography variant="body2" color="text.secondary">
                                    No sync jobs yet
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              jobs[config.id].map((job) => (
                                <TableRow key={job.id}>
                                  <TableCell>
                                    <Chip
                                      size="small"
                                      label={job.type}
                                      variant="outlined"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Chip
                                      size="small"
                                      label={job.status}
                                      color={getStatusColor(job.status) as any}
                                      icon={
                                        job.status === 'completed' ? (
                                          <CheckCircleIcon />
                                        ) : job.status === 'failed' ? (
                                          <ErrorIcon />
                                        ) : undefined
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    {job.startedAt
                                      ? new Date(job.startedAt).toLocaleString()
                                      : '-'}
                                  </TableCell>
                                  <TableCell>
                                    {job.stats?.duration
                                      ? formatDuration(job.stats.duration)
                                      : '-'}
                                  </TableCell>
                                  <TableCell>
                                    {job.stats && (
                                      <Typography variant="caption">
                                        {job.stats.usersCreated} created,{' '}
                                        {job.stats.usersUpdated} updated
                                        {job.errors?.length > 0 && (
                                          <Chip
                                            size="small"
                                            label={`${job.errors.length} errors`}
                                            color="error"
                                            sx={{ ml: 1 }}
                                          />
                                        )}
                                      </Typography>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        ))
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingConfig ? 'Edit Sync Configuration' : 'Create Sync Configuration'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                fullWidth
                required
                placeholder="e.g., Azure AD Sync"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Source Type</InputLabel>
                <Select
                  value={formData.sourceType || 'scim'}
                  label="Source Type"
                  onChange={(e) =>
                    setFormData({ ...formData, sourceType: e.target.value as any })
                  }
                >
                  {SOURCE_TYPES.map((source) => (
                    <MenuItem key={source.value} value={source.value}>
                      <Box>
                        <Typography>{source.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {source.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="Schedule Interval (minutes)"
                type="number"
                value={formData.scheduleInterval || 60}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    scheduleInterval: parseInt(e.target.value) || 60,
                  })
                }
                fullWidth
                inputProps={{ min: 5 }}
                disabled={!formData.scheduleEnabled}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" gutterBottom>
                Sync Options
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.syncUsers !== false}
                    onChange={(e) =>
                      setFormData({ ...formData, syncUsers: e.target.checked })
                    }
                  />
                }
                label="Sync Users"
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.syncGroups !== false}
                    onChange={(e) =>
                      setFormData({ ...formData, syncGroups: e.target.checked })
                    }
                  />
                }
                label="Sync Groups"
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.syncRoles !== false}
                    onChange={(e) =>
                      setFormData({ ...formData, syncRoles: e.target.checked })
                    }
                  />
                }
                label="Apply Role Mappings"
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.scheduleEnabled === true}
                    onChange={(e) =>
                      setFormData({ ...formData, scheduleEnabled: e.target.checked })
                    }
                  />
                }
                label="Enable Scheduled Sync"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled !== false}
                    onChange={(e) =>
                      setFormData({ ...formData, enabled: e.target.checked })
                    }
                  />
                }
                label="Configuration Enabled"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DirectorySyncConfiguration;
