// =============================================================================
// SSO Configuration Page
// SCALE Tier - Task T306-T309
//
// Admin interface for enterprise SSO configuration
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
  Tabs,
  Tab,
  FormControlLabel,
  Switch,
  Divider,
  Chip,
  Paper,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Key as KeyIcon,
  Verified as VerifiedIcon,
  Sync as SyncIcon,
  Person as PersonIcon,
  Group as GroupIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

interface SamlConfig {
  enabled: boolean;
  idpEntityId: string;
  idpSsoUrl: string;
  idpSloUrl?: string;
  idpCertificate: string;
  spEntityId: string;
  spAcsUrl: string;
  attributeMapping: {
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string;
  };
}

interface OidcConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

interface ScimSyncLog {
  id: string;
  operation: string;
  resourceType: string;
  externalId: string;
  success: boolean;
  errorMessage?: string;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// TabPanel Component
// -----------------------------------------------------------------------------

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export const SsoConfiguration: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  // SAML State
  const [samlConfig, setSamlConfig] = useState<SamlConfig>({
    enabled: false,
    idpEntityId: '',
    idpSsoUrl: '',
    idpCertificate: '',
    spEntityId: '',
    spAcsUrl: '',
    attributeMapping: {
      email: 'email',
      firstName: 'firstName',
      lastName: 'lastName',
    },
  });

  // OIDC State
  const [oidcConfig, setOidcConfig] = useState<OidcConfig>({
    enabled: false,
    issuer: '',
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    scopes: ['openid', 'profile', 'email'],
  });

  // SCIM State
  const [scimEnabled, setScimEnabled] = useState(false);
  const [scimLogs, setScimLogs] = useState<ScimSyncLog[]>([]);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/sso/config', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await response.json();

        if (data.success) {
          if (data.data.saml) {
            setSamlConfig({
              ...data.data.saml,
              idpCertificate: '', // Don't show existing cert
            });
          }
          if (data.data.oidc) {
            setOidcConfig({
              ...data.data.oidc,
              clientSecret: '', // Don't show existing secret
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch SSO config:', err);
      }
      setLoading(false);
    };

    fetchConfig();
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSaveSaml = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/sso/saml/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(samlConfig),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('SAML configuration saved successfully');
      } else {
        setError(data.errors?.join(', ') || 'Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save SAML configuration');
    }

    setSaving(false);
  };

  const handleSaveOidc = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/sso/oidc/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(oidcConfig),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('OIDC configuration saved successfully');
      } else {
        setError(data.errors?.join(', ') || 'Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save OIDC configuration');
    }

    setSaving(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard');
  };

  const downloadMetadata = async () => {
    try {
      const response = await fetch(`/api/sso/saml/metadata?org=current`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const xml = await response.text();

      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sp-metadata.xml';
      a.click();
    } catch (err) {
      setError('Failed to download metadata');
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading SSO configuration...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <SecurityIcon sx={{ mr: 2, fontSize: 32 }} />
        <Typography variant="h4">SSO Configuration</Typography>
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

      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab icon={<KeyIcon />} label="SAML 2.0" />
          <Tab icon={<VerifiedIcon />} label="OpenID Connect" />
          <Tab icon={<SyncIcon />} label="SCIM Provisioning" />
        </Tabs>
      </Paper>

      {/* SAML Configuration */}
      <TabPanel value={activeTab} index={0}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">SAML 2.0 Configuration</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <FormControlLabel
                control={
                  <Switch
                    checked={samlConfig.enabled}
                    onChange={(e) =>
                      setSamlConfig({ ...samlConfig, enabled: e.target.checked })
                    }
                  />
                }
                label="Enabled"
              />
            </Box>

            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Identity Provider (IdP) Settings
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  label="IdP Entity ID"
                  value={samlConfig.idpEntityId}
                  onChange={(e) =>
                    setSamlConfig({ ...samlConfig, idpEntityId: e.target.value })
                  }
                  fullWidth
                  placeholder="https://idp.example.com/saml"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  label="IdP SSO URL"
                  value={samlConfig.idpSsoUrl}
                  onChange={(e) =>
                    setSamlConfig({ ...samlConfig, idpSsoUrl: e.target.value })
                  }
                  fullWidth
                  placeholder="https://idp.example.com/sso"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="IdP Certificate"
                  value={samlConfig.idpCertificate}
                  onChange={(e) =>
                    setSamlConfig({ ...samlConfig, idpCertificate: e.target.value })
                  }
                  fullWidth
                  multiline
                  rows={4}
                  placeholder="-----BEGIN CERTIFICATE-----"
                />
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Service Provider (SP) Settings
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  label="SP Entity ID"
                  value={samlConfig.spEntityId}
                  onChange={(e) =>
                    setSamlConfig({ ...samlConfig, spEntityId: e.target.value })
                  }
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(samlConfig.spEntityId)}
                      >
                        <CopyIcon />
                      </IconButton>
                    ),
                  }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  label="ACS URL"
                  value={samlConfig.spAcsUrl}
                  onChange={(e) =>
                    setSamlConfig({ ...samlConfig, spAcsUrl: e.target.value })
                  }
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(samlConfig.spAcsUrl)}
                      >
                        <CopyIcon />
                      </IconButton>
                    ),
                  }}
                />
              </Grid>

              <Grid item xs={12}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={downloadMetadata}
                >
                  Download SP Metadata
                </Button>
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Attribute Mapping
                </Typography>
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  label="Email Attribute"
                  value={samlConfig.attributeMapping.email}
                  onChange={(e) =>
                    setSamlConfig({
                      ...samlConfig,
                      attributeMapping: {
                        ...samlConfig.attributeMapping,
                        email: e.target.value,
                      },
                    })
                  }
                  fullWidth
                  size="small"
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  label="First Name Attribute"
                  value={samlConfig.attributeMapping.firstName || ''}
                  onChange={(e) =>
                    setSamlConfig({
                      ...samlConfig,
                      attributeMapping: {
                        ...samlConfig.attributeMapping,
                        firstName: e.target.value,
                      },
                    })
                  }
                  fullWidth
                  size="small"
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  label="Last Name Attribute"
                  value={samlConfig.attributeMapping.lastName || ''}
                  onChange={(e) =>
                    setSamlConfig({
                      ...samlConfig,
                      attributeMapping: {
                        ...samlConfig.attributeMapping,
                        lastName: e.target.value,
                      },
                    })
                  }
                  fullWidth
                  size="small"
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleSaveSaml}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button
                variant="outlined"
                onClick={() => setTestDialogOpen(true)}
              >
                Test Connection
              </Button>
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* OIDC Configuration */}
      <TabPanel value={activeTab} index={1}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">OpenID Connect Configuration</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <FormControlLabel
                control={
                  <Switch
                    checked={oidcConfig.enabled}
                    onChange={(e) =>
                      setOidcConfig({ ...oidcConfig, enabled: e.target.checked })
                    }
                  />
                }
                label="Enabled"
              />
            </Box>

            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  label="Issuer URL"
                  value={oidcConfig.issuer}
                  onChange={(e) =>
                    setOidcConfig({ ...oidcConfig, issuer: e.target.value })
                  }
                  fullWidth
                  placeholder="https://login.microsoftonline.com/{tenant}/v2.0"
                  helperText="The OpenID Connect discovery endpoint will be fetched automatically"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  label="Client ID"
                  value={oidcConfig.clientId}
                  onChange={(e) =>
                    setOidcConfig({ ...oidcConfig, clientId: e.target.value })
                  }
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  label="Client Secret"
                  value={oidcConfig.clientSecret}
                  onChange={(e) =>
                    setOidcConfig({ ...oidcConfig, clientSecret: e.target.value })
                  }
                  fullWidth
                  type="password"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Redirect URI"
                  value={oidcConfig.redirectUri}
                  onChange={(e) =>
                    setOidcConfig({ ...oidcConfig, redirectUri: e.target.value })
                  }
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(oidcConfig.redirectUri)}
                      >
                        <CopyIcon />
                      </IconButton>
                    ),
                  }}
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Scopes
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {oidcConfig.scopes.map((scope) => (
                    <Chip key={scope} label={scope} size="small" />
                  ))}
                </Box>
              </Grid>
            </Grid>

            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleSaveOidc}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button variant="outlined" onClick={() => setTestDialogOpen(true)}>
                Test Connection
              </Button>
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* SCIM Provisioning */}
      <TabPanel value={activeTab} index={2}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">SCIM 2.0 Provisioning</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <FormControlLabel
                control={
                  <Switch
                    checked={scimEnabled}
                    onChange={(e) => setScimEnabled(e.target.checked)}
                  />
                }
                label="Enabled"
              />
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
              SCIM (System for Cross-domain Identity Management) enables automatic
              user and group provisioning from your identity provider.
            </Alert>

            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  SCIM Endpoint
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography fontFamily="monospace">
                    {window.location.origin}/api/sso/scim/v2
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() =>
                      copyToClipboard(`${window.location.origin}/api/sso/scim/v2`)
                    }
                  >
                    <CopyIcon />
                  </IconButton>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Supported Resources
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Chip icon={<PersonIcon />} label="Users" color="primary" />
                  <Chip icon={<GroupIcon />} label="Groups" color="primary" />
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle2">Recent Sync Activity</Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <IconButton size="small">
                    <RefreshIcon />
                  </IconButton>
                </Box>

                <List dense>
                  {scimLogs.length === 0 ? (
                    <ListItem>
                      <ListItemText
                        primary="No sync activity yet"
                        secondary="Activity will appear here once SCIM provisioning is configured"
                      />
                    </ListItem>
                  ) : (
                    scimLogs.map((log) => (
                      <ListItem key={log.id}>
                        <ListItemIcon>
                          {log.success ? (
                            <CheckCircleIcon color="success" />
                          ) : (
                            <ErrorIcon color="error" />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={`${log.operation} ${log.resourceType}`}
                          secondary={`${log.externalId} - ${new Date(log.timestamp).toLocaleString()}`}
                        />
                      </ListItem>
                    ))
                  )}
                </List>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Test Connection Dialog */}
      <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)}>
        <DialogTitle>Test SSO Connection</DialogTitle>
        <DialogContent>
          <Typography>
            Click the button below to test your SSO configuration. This will open
            a new window to authenticate with your identity provider.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const testUrl =
                activeTab === 0
                  ? '/api/sso/saml/login?org=test'
                  : '/api/sso/oidc/login?org=test';
              window.open(testUrl, '_blank', 'width=500,height=600');
              setTestDialogOpen(false);
            }}
          >
            Test Login
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SsoConfiguration;
