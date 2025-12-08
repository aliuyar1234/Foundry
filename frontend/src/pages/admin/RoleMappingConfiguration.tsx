// =============================================================================
// Role Mapping Configuration Page
// SCALE Tier - Task T271-T280
//
// Admin interface for SSO role mapping configuration
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
  Menu,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  SwapHoriz as SwapIcon,
  Sync as SyncIcon,
  AutoAwesome as AutoIcon,
  MoreVert as MoreIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RoleMapping {
  id: string;
  name: string;
  description?: string;
  sourceType: 'group' | 'role' | 'attribute';
  sourceValue: string;
  sourcePattern?: string;
  targetRole: string;
  targetPermissions?: string[];
  priority: number;
  enabled: boolean;
}

interface PresetOption {
  value: string;
  label: string;
  description: string;
}

const PRESETS: PresetOption[] = [
  { value: 'azure-ad', label: 'Azure AD', description: 'Microsoft Azure Active Directory' },
  { value: 'okta', label: 'Okta', description: 'Okta Identity Cloud' },
  { value: 'google', label: 'Google Workspace', description: 'Google Cloud Identity' },
  { value: 'onelogin', label: 'OneLogin', description: 'OneLogin Identity Platform' },
];

const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN', label: 'Super Admin', color: 'error' },
  { value: 'ADMIN', label: 'Admin', color: 'warning' },
  { value: 'MANAGER', label: 'Manager', color: 'info' },
  { value: 'ANALYST', label: 'Analyst', color: 'primary' },
  { value: 'USER', label: 'User', color: 'default' },
  { value: 'VIEWER', label: 'Viewer', color: 'default' },
];

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export const RoleMappingConfiguration: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mappings, setMappings] = useState<RoleMapping[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<RoleMapping | null>(null);
  const [presetMenuAnchor, setPresetMenuAnchor] = useState<null | HTMLElement>(null);
  const [syncing, setSyncing] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<RoleMapping>>({
    name: '',
    description: '',
    sourceType: 'group',
    sourceValue: '',
    sourcePattern: '',
    targetRole: 'USER',
    priority: 10,
    enabled: true,
  });

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchMappings = async () => {
    try {
      const response = await fetch('/api/sso/role-mappings', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await response.json();

      if (data.success) {
        setMappings(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch role mappings:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleOpenDialog = (mapping?: RoleMapping) => {
    if (mapping) {
      setEditingMapping(mapping);
      setFormData(mapping);
    } else {
      setEditingMapping(null);
      setFormData({
        name: '',
        description: '',
        sourceType: 'group',
        sourceValue: '',
        sourcePattern: '',
        targetRole: 'USER',
        priority: 10,
        enabled: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingMapping(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const url = editingMapping
        ? `/api/sso/role-mappings/${editingMapping.id}`
        : '/api/sso/role-mappings';
      const method = editingMapping ? 'PUT' : 'POST';

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
        setSuccess(editingMapping ? 'Mapping updated successfully' : 'Mapping created successfully');
        handleCloseDialog();
        fetchMappings();
      } else {
        setError(data.errors?.join(', ') || 'Failed to save mapping');
      }
    } catch (err) {
      setError('Failed to save role mapping');
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return;

    try {
      const response = await fetch(`/api/sso/role-mappings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        setSuccess('Mapping deleted successfully');
        fetchMappings();
      } else {
        setError('Failed to delete mapping');
      }
    } catch (err) {
      setError('Failed to delete mapping');
    }
  };

  const handleToggleEnabled = async (mapping: RoleMapping) => {
    try {
      const response = await fetch(`/api/sso/role-mappings/${mapping.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ enabled: !mapping.enabled }),
      });

      const data = await response.json();

      if (data.success) {
        fetchMappings();
      }
    } catch (err) {
      setError('Failed to update mapping');
    }
  };

  const handleApplyPreset = async (preset: string) => {
    setPresetMenuAnchor(null);
    setSaving(true);

    try {
      const response = await fetch(`/api/sso/role-mappings/presets/${preset}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`${PRESETS.find((p) => p.value === preset)?.label} preset applied successfully`);
        fetchMappings();
      } else {
        setError('Failed to apply preset');
      }
    } catch (err) {
      setError('Failed to apply preset');
    }

    setSaving(false);
  };

  const handleSyncRoles = async () => {
    setSyncing(true);

    try {
      const response = await fetch('/api/sso/role-mappings/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(
          `Role sync completed: ${data.data.updated} users updated, ${data.data.errors} errors`
        );
      } else {
        setError('Failed to sync roles');
      }
    } catch (err) {
      setError('Failed to sync roles');
    }

    setSyncing(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading role mappings...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <SwapIcon sx={{ mr: 2, fontSize: 32 }} />
        <Typography variant="h4">Role Mapping</Typography>
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
        Role mappings automatically assign application roles to users based on their SSO
        groups, roles, or attributes. Mappings are evaluated in priority order (lower number = higher priority).
      </Alert>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              Add Mapping
            </Button>

            <Button
              variant="outlined"
              startIcon={<AutoIcon />}
              onClick={(e) => setPresetMenuAnchor(e.currentTarget)}
            >
              Apply Preset
            </Button>

            <Menu
              anchorEl={presetMenuAnchor}
              open={Boolean(presetMenuAnchor)}
              onClose={() => setPresetMenuAnchor(null)}
            >
              {PRESETS.map((preset) => (
                <MenuItem
                  key={preset.value}
                  onClick={() => handleApplyPreset(preset.value)}
                >
                  <Box>
                    <Typography>{preset.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {preset.description}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Menu>

            <Box sx={{ flexGrow: 1 }} />

            <Button
              variant="outlined"
              startIcon={<SyncIcon />}
              onClick={handleSyncRoles}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync All Users'}
            </Button>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Target Role</TableCell>
                  <TableCell align="center">Priority</TableCell>
                  <TableCell align="center">Enabled</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="text.secondary" sx={{ py: 4 }}>
                        No role mappings configured. Add a mapping or apply a preset to get started.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  mappings
                    .sort((a, b) => a.priority - b.priority)
                    .map((mapping) => (
                      <TableRow key={mapping.id} hover>
                        <TableCell>
                          <Typography fontWeight="medium">{mapping.name}</Typography>
                          {mapping.description && (
                            <Typography variant="caption" color="text.secondary">
                              {mapping.description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={mapping.sourceType}
                            size="small"
                            variant="outlined"
                            sx={{ mr: 1 }}
                          />
                          <Typography variant="body2" component="span">
                            {mapping.sourcePattern ? (
                              <Tooltip title="Regex pattern">
                                <code>{mapping.sourcePattern}</code>
                              </Tooltip>
                            ) : (
                              mapping.sourceValue
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={ROLE_OPTIONS.find((r) => r.value === mapping.targetRole)?.label || mapping.targetRole}
                            size="small"
                            color={ROLE_OPTIONS.find((r) => r.value === mapping.targetRole)?.color as any || 'default'}
                          />
                        </TableCell>
                        <TableCell align="center">{mapping.priority}</TableCell>
                        <TableCell align="center">
                          <Switch
                            checked={mapping.enabled}
                            onChange={() => handleToggleEnabled(mapping)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenDialog(mapping)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(mapping.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingMapping ? 'Edit Role Mapping' : 'Create Role Mapping'}
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
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Source Type</InputLabel>
                <Select
                  value={formData.sourceType || 'group'}
                  label="Source Type"
                  onChange={(e) =>
                    setFormData({ ...formData, sourceType: e.target.value as any })
                  }
                >
                  <MenuItem value="group">Group</MenuItem>
                  <MenuItem value="role">Role</MenuItem>
                  <MenuItem value="attribute">Attribute</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="Source Value"
                value={formData.sourceValue || ''}
                onChange={(e) => setFormData({ ...formData, sourceValue: e.target.value })}
                fullWidth
                placeholder={
                  formData.sourceType === 'group'
                    ? 'e.g., Administrators'
                    : formData.sourceType === 'role'
                    ? 'e.g., admin'
                    : 'e.g., department'
                }
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Pattern (Optional)"
                value={formData.sourcePattern || ''}
                onChange={(e) => setFormData({ ...formData, sourcePattern: e.target.value })}
                fullWidth
                placeholder="e.g., ^.*-managers$"
                helperText="Regex pattern for matching. Leave empty for exact match."
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Target Role</InputLabel>
                <Select
                  value={formData.targetRole || 'USER'}
                  label="Target Role"
                  onChange={(e) => setFormData({ ...formData, targetRole: e.target.value })}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <MenuItem key={role.value} value={role.value}>
                      {role.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="Priority"
                type="number"
                value={formData.priority || 10}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) || 10 })
                }
                fullWidth
                inputProps={{ min: 0 }}
                helperText="Lower = higher priority"
              />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled !== false}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  />
                }
                label="Enabled"
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

export default RoleMappingConfiguration;
