/**
 * Workload Components
 * US6 - Workload management frontend components
 *
 * Provides team workload visualization, burnout risk tracking,
 * and redistribution tools
 */

// Main Page
export { WorkloadPage } from './WorkloadPage';

// Dashboard Components
export { BurnoutRiskPanel, TeamBurnoutSummary, BurnoutRiskGauge } from './BurnoutRiskPanel';
export { TeamLoadChart } from './TeamLoadChart';
export { RedistributionPanel, QuickSuggestions } from './RedistributionPanel';

// Availability & Scheduling
export { AvailabilityView, MeetingScheduler } from './AvailabilityView';

// Warnings & Notifications
export { WarningsList, WarningBadge } from './WarningsList';
export { NotificationCenter, NotificationBadge } from './NotificationCenter';

// Analysis & Planning
export { MeetingAnalysis } from './MeetingAnalysis';
export { CapacityPlanner } from './CapacityPlanner';
export { ForecastView } from './ForecastView';

// Settings
export { WorkloadSettings } from './WorkloadSettings';

// Re-export types
export type {
  EarlyWarning,
  WarningType,
  WarningSignal,
  SuggestedAction,
} from './WarningsList';
