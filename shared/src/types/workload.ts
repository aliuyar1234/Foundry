/**
 * Workload Types for OPERATE Tier
 * T022 - Define WorkloadMetric types
 */

// =============================================================================
// Workload Metrics Types
// =============================================================================

export interface WorkloadMetrics {
  personId: string;
  personName: string;
  organizationId: string;
  timestamp: Date;

  // Task metrics
  activeTasks: number;
  pendingTasks: number;
  completedTasksToday: number;

  // Communication metrics
  emailsReceived: number;
  emailsSent: number;
  messagesReceived: number;
  messagesSent: number;
  meetingsAttended: number;
  meetingHours: number;

  // Response metrics
  avgResponseTimeMs?: number;
  medianResponseTimeMs?: number;

  // Capacity metrics
  workloadScore: number; // 0-100 scale
  capacityRemaining: number; // percentage
  burnoutRiskScore: number; // 0-100 scale

  // Context
  department?: string;
  team?: string;
  role?: string;
}

export interface WorkloadSnapshot {
  personId: string;
  timestamp: Date;
  workloadScore: number;
  burnoutRiskScore: number;
  activeTasks: number;
  meetingLoad: number;
  communicationVolume: number;
}

// =============================================================================
// Burnout Risk Types
// =============================================================================

export interface BurnoutRiskAssessment {
  personId: string;
  personName: string;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  factors: BurnoutRiskFactor[];
  trend: 'improving' | 'stable' | 'worsening';
  recommendedActions: string[];
  lastAssessedAt: Date;
}

export interface BurnoutRiskFactor {
  factor: string;
  score: number;
  weight: number;
  description: string;
  trend: 'up' | 'down' | 'stable';
}

export type BurnoutRiskFactorType =
  | 'work_hours'
  | 'meeting_overload'
  | 'communication_volume'
  | 'task_overload'
  | 'response_time_pressure'
  | 'after_hours_work'
  | 'insufficient_breaks'
  | 'workload_variance';

// =============================================================================
// Capacity Planning Types
// =============================================================================

export interface CapacityForecast {
  personId: string;
  personName: string;
  currentCapacity: number; // percentage
  forecasts: CapacityForecastPoint[];
  bottleneckPrediction?: BottleneckPrediction;
}

export interface CapacityForecastPoint {
  date: Date;
  predictedWorkload: number;
  predictedCapacity: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
}

export interface BottleneckPrediction {
  predictedDate: Date;
  severity: 'minor' | 'moderate' | 'severe';
  causes: string[];
  recommendations: string[];
}

// =============================================================================
// Team Workload Types
// =============================================================================

export interface TeamWorkload {
  teamId: string;
  teamName: string;
  memberCount: number;
  metrics: {
    avgWorkloadScore: number;
    maxWorkloadScore: number;
    avgBurnoutRisk: number;
    highRiskMembers: number;
    totalActiveTasks: number;
    totalMeetingHours: number;
  };
  distribution: TeamMemberWorkload[];
}

export interface TeamMemberWorkload {
  personId: string;
  personName: string;
  workloadScore: number;
  burnoutRiskScore: number;
  activeTasks: number;
  capacityRemaining: number;
}

// =============================================================================
// Task Redistribution Types
// =============================================================================

export interface RedistributionSuggestion {
  id: string;
  fromPersonId: string;
  fromPersonName: string;
  toPersonId: string;
  toPersonName: string;
  tasks: TaskToRedistribute[];
  reason: string;
  expectedImpact: {
    fromWorkloadReduction: number;
    toWorkloadIncrease: number;
    burnoutRiskReduction: number;
  };
  confidence: number;
}

export interface TaskToRedistribute {
  taskId: string;
  taskName: string;
  estimatedHours: number;
  priority: 'low' | 'medium' | 'high';
  skills: string[];
}

export interface RedistributionRequest {
  fromPersonId: string;
  taskIds: string[];
  reason?: string;
}

// =============================================================================
// Workload Alerts Types
// =============================================================================

export interface WorkloadAlert {
  id: string;
  type: WorkloadAlertType;
  severity: 'info' | 'warning' | 'critical';
  personId?: string;
  personName?: string;
  teamId?: string;
  teamName?: string;
  message: string;
  details: Record<string, unknown>;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

export type WorkloadAlertType =
  | 'burnout_risk_high'
  | 'burnout_risk_critical'
  | 'capacity_exceeded'
  | 'meeting_overload'
  | 'response_time_degraded'
  | 'workload_imbalance'
  | 'team_capacity_warning';
