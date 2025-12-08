// =============================================================================
// Benchmark Dashboard Page
// SCALE Tier - Task T236-T240
//
// Cross-company benchmarking dashboard with industry comparisons
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Alert,
  AlertTitle,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Security as SecurityIcon,
  Assessment as AssessmentIcon,
  Lightbulb as LightbulbIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface MetricComparison {
  metricName: string;
  yourValue: number;
  benchmarkAvg: number;
  benchmarkMedian: number;
  percentile: number;
  status: 'above' | 'at' | 'below';
  difference: number;
  differencePercent: number;
}

interface IndustryTrend {
  metricName: string;
  direction: 'improving' | 'declining' | 'stable';
  changePercent: number;
  period: string;
}

interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  metric: string;
  currentValue: number;
  targetValue: number;
  improvement: string;
  impact: string;
}

interface Segment {
  id: string;
  name: string;
  participantCount: number;
  lastUpdated: string;
}

interface OptInStatus {
  optedIn: boolean;
  segments: Array<{
    segmentId: string;
    industry: string;
    companySize: string;
    region: string;
    active: boolean;
  }>;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export const BenchmarkDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [optInStatus, setOptInStatus] = useState<OptInStatus | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [comparisons, setComparisons] = useState<MetricComparison[]>([]);
  const [trends, setTrends] = useState<IndustryTrend[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [optInDialogOpen, setOptInDialogOpen] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch opt-in status
      const statusRes = await fetch('/api/benchmark/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const statusData = await statusRes.json();
      if (statusData.success) {
        setOptInStatus(statusData.data);
      }

      // If opted in, fetch dashboard data
      if (statusData.data?.optedIn) {
        const dashboardRes = await fetch('/api/benchmark/dashboard', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const dashboardData = await dashboardRes.json();

        if (dashboardData.success) {
          setSegments(dashboardData.data.eligibleSegments || []);
          setComparisons(dashboardData.data.yourPerformance || []);
          setTrends(dashboardData.data.industryTrends || []);
          setRecommendations(dashboardData.data.recommendations || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch benchmark data:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ---------------------------------------------------------------------------
  // Opt-In Handler
  // ---------------------------------------------------------------------------

  const handleOptIn = async () => {
    try {
      const response = await fetch('/api/benchmark/opt-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          segments: [
            {
              industry: selectedIndustry || undefined,
              companySize: selectedSize || undefined,
              region: selectedRegion || undefined,
            },
          ],
          consent: {
            acceptedTerms: termsAccepted,
            acceptedPrivacyPolicy: privacyAccepted,
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setOptInDialogOpen(false);
        fetchData();
      }
    } catch (error) {
      console.error('Failed to opt in:', error);
    }
  };

  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'above':
        return 'success';
      case 'below':
        return 'error';
      default:
        return 'warning';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'above':
        return 'Above Average';
      case 'below':
        return 'Below Average';
      default:
        return 'At Average';
    }
  };

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'improving':
        return <TrendingUpIcon color="success" />;
      case 'declining':
        return <TrendingDownIcon color="error" />;
      default:
        return <TrendingFlatIcon color="warning" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      default:
        return 'info';
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading benchmark data...</Typography>
      </Box>
    );
  }

  // Not opted in - show opt-in prompt
  if (!optInStatus?.optedIn) {
    return (
      <Box sx={{ p: 3 }}>
        <Card sx={{ maxWidth: 800, mx: 'auto' }}>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <AssessmentIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
              <Typography variant="h4" gutterBottom>
                Cross-Company Benchmarking
              </Typography>
              <Typography color="text.secondary" paragraph>
                Compare your process performance against industry peers with complete privacy.
              </Typography>

              <Grid container spacing={3} sx={{ mt: 3, textAlign: 'left' }}>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <SecurityIcon sx={{ mr: 1, color: 'success.main' }} />
                    <Box>
                      <Typography variant="subtitle2">Privacy Protected</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Minimum 10 participants per segment (k-anonymity)
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <CheckCircleIcon sx={{ mr: 1, color: 'success.main' }} />
                    <Box>
                      <Typography variant="subtitle2">Aggregated Only</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Only statistical aggregates shared, never raw data
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <InfoIcon sx={{ mr: 1, color: 'success.main' }} />
                    <Box>
                      <Typography variant="subtitle2">GDPR Compliant</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Full data export and deletion rights
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>

              <Button
                variant="contained"
                size="large"
                sx={{ mt: 4 }}
                onClick={() => setOptInDialogOpen(true)}
              >
                Opt In to Benchmarking
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Opt-In Dialog */}
        <Dialog open={optInDialogOpen} onClose={() => setOptInDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Join Cross-Company Benchmarking</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" paragraph>
              Select which segments you'd like to participate in:
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Industry</InputLabel>
                  <Select
                    value={selectedIndustry}
                    label="Industry"
                    onChange={(e) => setSelectedIndustry(e.target.value)}
                  >
                    <MenuItem value="">All Industries</MenuItem>
                    <MenuItem value="manufacturing">Manufacturing</MenuItem>
                    <MenuItem value="financial-services">Financial Services</MenuItem>
                    <MenuItem value="healthcare">Healthcare</MenuItem>
                    <MenuItem value="retail">Retail</MenuItem>
                    <MenuItem value="technology">Technology</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Company Size</InputLabel>
                  <Select
                    value={selectedSize}
                    label="Company Size"
                    onChange={(e) => setSelectedSize(e.target.value)}
                  >
                    <MenuItem value="">All Sizes</MenuItem>
                    <MenuItem value="small">Small (1-100 employees)</MenuItem>
                    <MenuItem value="medium">Medium (101-1000 employees)</MenuItem>
                    <MenuItem value="large">Large (1001-10000 employees)</MenuItem>
                    <MenuItem value="enterprise">Enterprise (10000+ employees)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Region</InputLabel>
                  <Select
                    value={selectedRegion}
                    label="Region"
                    onChange={(e) => setSelectedRegion(e.target.value)}
                  >
                    <MenuItem value="">Global</MenuItem>
                    <MenuItem value="north-america">North America</MenuItem>
                    <MenuItem value="europe">Europe</MenuItem>
                    <MenuItem value="asia-pacific">Asia Pacific</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Alert severity="info" sx={{ mb: 2 }}>
              <AlertTitle>Privacy Guarantee</AlertTitle>
              Your data will only be included in aggregated statistics when at least 10
              organizations participate in your segment.
            </Alert>

            <FormControlLabel
              control={
                <Checkbox checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
              }
              label="I accept the terms and conditions"
            />
            <FormControlLabel
              control={
                <Checkbox checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} />
              }
              label="I accept the privacy policy for benchmarking"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOptInDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleOptIn}
              disabled={!termsAccepted || !privacyAccepted}
            >
              Join Benchmarking
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // Opted in - show dashboard
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <AssessmentIcon sx={{ mr: 2, fontSize: 32 }} />
        <Typography variant="h4">Benchmark Dashboard</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="Refresh data">
          <IconButton onClick={fetchData}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {segments.length === 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Not enough participants yet</AlertTitle>
          Your segment needs at least 10 organizations to generate benchmarks. Keep participating!
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Performance Comparison */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Your Performance vs. Industry
              </Typography>

              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Metric</TableCell>
                      <TableCell align="right">Your Value</TableCell>
                      <TableCell align="right">Industry Avg</TableCell>
                      <TableCell align="right">Industry Median</TableCell>
                      <TableCell align="center">Percentile</TableCell>
                      <TableCell align="center">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {comparisons.map((comparison) => (
                      <TableRow key={comparison.metricName}>
                        <TableCell>{comparison.metricName}</TableCell>
                        <TableCell align="right">{comparison.yourValue.toFixed(2)}</TableCell>
                        <TableCell align="right">{comparison.benchmarkAvg.toFixed(2)}</TableCell>
                        <TableCell align="right">{comparison.benchmarkMedian.toFixed(2)}</TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <LinearProgress
                              variant="determinate"
                              value={comparison.percentile}
                              sx={{ width: 60, mr: 1 }}
                            />
                            <Typography variant="body2">{comparison.percentile}%</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={getStatusLabel(comparison.status)}
                            size="small"
                            color={getStatusColor(comparison.status)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {comparisons.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          <Typography color="text.secondary">
                            No comparison data available yet
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Industry Trends */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Industry Trends
              </Typography>

              {trends.map((trend) => (
                <Box key={trend.metricName} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  {getTrendIcon(trend.direction)}
                  <Box sx={{ ml: 2, flexGrow: 1 }}>
                    <Typography variant="body1">{trend.metricName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {trend.changePercent > 0 ? '+' : ''}
                      {trend.changePercent}% ({trend.period})
                    </Typography>
                  </Box>
                </Box>
              ))}

              {trends.length === 0 && (
                <Typography color="text.secondary">
                  Trend data will be available after more data is collected
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recommendations */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <LightbulbIcon sx={{ mr: 1 }} />
                <Typography variant="h6">Recommendations</Typography>
              </Box>

              {recommendations.map((rec, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip
                      label={rec.priority.toUpperCase()}
                      size="small"
                      color={getPriorityColor(rec.priority)}
                      sx={{ mr: 1 }}
                    />
                    <Typography variant="subtitle2">{rec.metric}</Typography>
                  </Box>
                  <Typography variant="body2">{rec.improvement}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Impact: {rec.impact}
                  </Typography>
                </Paper>
              ))}

              {recommendations.length === 0 && (
                <Typography color="text.secondary">
                  Great job! You're performing at or above industry standards.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Participating Segments */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Your Benchmark Segments
              </Typography>

              <Grid container spacing={2}>
                {segments.map((segment) => (
                  <Grid item xs={12} md={4} key={segment.id}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle1">{segment.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {segment.participantCount} participants
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Last updated: {new Date(segment.lastUpdated).toLocaleDateString()}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default BenchmarkDashboard;
