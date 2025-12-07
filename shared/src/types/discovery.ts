/**
 * Discovery Types (Process, ProcessStep, Person, Network)
 */

export interface Person {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  department?: string;
  title?: string;
  isExternal: boolean;
  busFactorScore?: number;
  influenceScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Process {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  discoveredFrom: string;
  variantCount: number;
  avgCycleTime?: Duration;
  avgWaitTime?: Duration;
  bottleneckStep?: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessStep {
  id: string;
  processId: string;
  name: string;
  description?: string;
  stepOrder: number;
  avgDuration?: Duration;
  participantCount: number;
  isBottleneck: boolean;
  isOptional: boolean;
}

export interface Duration {
  value: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days';
}

export interface ProcessWithSteps extends Process {
  steps: ProcessStep[];
  participants: PersonSummary[];
}

export interface PersonSummary {
  id: string;
  email: string;
  name: string;
  department?: string;
  role?: string;
}

export interface ProcessVariant {
  id: string;
  processId: string;
  stepSequence: string[];
  frequency: number;
  avgCycleTime?: Duration;
  isHappyPath: boolean;
}

export interface ProcessMetrics {
  totalCases: number;
  avgCycleTime: Duration;
  medianCycleTime: Duration;
  p95CycleTime: Duration;
  avgWaitTime: Duration;
  bottlenecks: Bottleneck[];
  completionRate: number;
}

export interface Bottleneck {
  stepId: string;
  stepName: string;
  avgWaitTime: Duration;
  caseCount: number;
  severity: 'low' | 'medium' | 'high';
}

// Network types
export interface NetworkNode {
  id: string;
  email: string;
  name: string;
  department?: string;
  isExternal: boolean;
  metrics: NodeMetrics;
}

export interface NodeMetrics {
  degree: number;
  inDegree: number;
  outDegree: number;
  betweenness?: number;
  pageRank?: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  emailCount: number;
  meetingCount: number;
  lastInteraction?: Date;
  avgResponseTime?: Duration;
}

export interface OrganizationalNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  metrics: NetworkMetrics;
}

export interface NetworkMetrics {
  nodeCount: number;
  edgeCount: number;
  density: number;
  avgDegree: number;
  clustering: number;
  communities: Community[];
}

export interface Community {
  id: string;
  name?: string;
  memberIds: string[];
  size: number;
}

// Discovery API types
export interface DiscoveryRequest {
  lookbackMonths?: number;
  minFrequency?: number;
  includeExternal?: boolean;
}

export interface DiscoveryStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress?: number;
  startedAt?: Date;
  completedAt?: Date;
  processCount?: number;
  personCount?: number;
  eventCount?: number;
  error?: string;
}

export interface NetworkViewOptions {
  view: 'formal' | 'informal' | 'combined';
  department?: string;
  minWeight?: number;
  includeExternal?: boolean;
}
