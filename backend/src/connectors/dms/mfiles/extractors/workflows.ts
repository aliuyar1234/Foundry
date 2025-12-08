/**
 * M-Files Workflow State Extractor
 * T172: Extract workflow states and state transition history
 */

import {
  MFilesClient,
  MFilesWorkflow,
  MFilesWorkflowState,
  MFilesObjectVersion,
  MFilesPropertyValue,
} from '../mfilesClient.js';
import { ExtractedEvent } from '../../../base/connector.js';

export interface WorkflowMetadata {
  workflowId: number;
  workflowName: string;
  objectClass: number;
  states: WorkflowStateInfo[];
}

export interface WorkflowStateInfo {
  stateId: number;
  stateName: string;
  workflowId: number;
}

export interface ObjectWorkflowState {
  objectId: number;
  objectType: number;
  title: string;
  displayId: string;
  currentStateId?: number;
  currentStateName?: string;
  workflowId?: number;
  workflowName?: string;
  lastModifiedDate?: Date;
}

export interface WorkflowTransition {
  objectId: number;
  objectType: number;
  fromStateId?: number;
  fromStateName?: string;
  toStateId: number;
  toStateName: string;
  workflowId: number;
  workflowName: string;
  transitionDate: Date;
  version: number;
}

/**
 * Built-in M-Files property definition IDs
 */
const PROPERTY_DEF_WORKFLOW = 38; // Workflow property
const PROPERTY_DEF_STATE = 39; // State property

/**
 * Extract workflow metadata with all states
 */
export async function extractWorkflowMetadata(
  client: MFilesClient,
  workflowId: number
): Promise<WorkflowMetadata> {
  const workflow = await client.getWorkflow(workflowId);
  const states = await client.getWorkflowStates(workflowId);

  return {
    workflowId: workflow.ID,
    workflowName: workflow.Name,
    objectClass: workflow.ObjectClass,
    states: states.map((state) => ({
      stateId: state.ID,
      stateName: state.Name,
      workflowId: state.Workflow,
    })),
  };
}

/**
 * Extract all workflows in vault
 */
export async function extractAllWorkflows(
  client: MFilesClient,
  vaultGuid: string,
  organizationId: string
): Promise<{
  workflows: WorkflowMetadata[];
  events: ExtractedEvent[];
}> {
  const events: ExtractedEvent[] = [];
  const workflowsList = await client.getWorkflows();

  const workflows: WorkflowMetadata[] = [];

  for (const workflow of workflowsList) {
    const metadata = await extractWorkflowMetadata(client, workflow.ID);
    workflows.push(metadata);

    // Create workflow discovery event
    events.push({
      type: 'dms_workflow_discovered',
      timestamp: new Date(),
      metadata: {
        workflowId: workflow.ID,
        workflowName: workflow.Name,
        objectClass: workflow.ObjectClass,
        stateCount: metadata.states.length,
        vaultGuid,
      },
      rawData: {
        workflow: metadata,
        organizationId,
      },
    });

    // Create events for each state
    for (const state of metadata.states) {
      events.push({
        type: 'dms_workflow_state_discovered',
        timestamp: new Date(),
        metadata: {
          stateId: state.stateId,
          stateName: state.stateName,
          workflowId: state.workflowId,
          workflowName: workflow.Name,
          vaultGuid,
        },
        rawData: {
          state,
          organizationId,
        },
      });
    }
  }

  return {
    workflows,
    events,
  };
}

/**
 * Extract workflow state from object properties
 */
function extractWorkflowStateFromProperties(
  properties: MFilesPropertyValue[],
  workflowLookup?: Map<number, string>,
  stateLookup?: Map<number, string>
): {
  workflowId?: number;
  workflowName?: string;
  stateId?: number;
  stateName?: string;
} {
  let workflowId: number | undefined;
  let stateId: number | undefined;

  // Find workflow property
  const workflowProp = properties.find((p) => p.PropertyDef === PROPERTY_DEF_WORKFLOW);
  if (workflowProp?.TypedValue.HasValue && workflowProp.TypedValue.Lookup) {
    workflowId = workflowProp.TypedValue.Lookup.Item;
  }

  // Find state property
  const stateProp = properties.find((p) => p.PropertyDef === PROPERTY_DEF_STATE);
  if (stateProp?.TypedValue.HasValue && stateProp.TypedValue.Lookup) {
    stateId = stateProp.TypedValue.Lookup.Item;
  }

  return {
    workflowId,
    workflowName: workflowId ? workflowLookup?.get(workflowId) : undefined,
    stateId,
    stateName: stateId ? stateLookup?.get(stateId) : undefined,
  };
}

/**
 * Extract current workflow state for objects
 */
export async function extractObjectWorkflowStates(
  client: MFilesClient,
  objectTypeId: number,
  vaultGuid: string,
  organizationId: string,
  options: {
    modifiedSince?: Date;
    workflowId?: number;
  } = {}
): Promise<{
  objectStates: ObjectWorkflowState[];
  events: ExtractedEvent[];
}> {
  const events: ExtractedEvent[] = [];

  // Get objects
  const objects = await client.getObjectsByType(objectTypeId, options);

  // Build workflow and state lookup maps
  const workflows = await client.getWorkflows();
  const workflowLookup = new Map<number, string>();
  const stateLookup = new Map<number, string>();

  for (const workflow of workflows) {
    workflowLookup.set(workflow.ID, workflow.Name);
    const states = await client.getWorkflowStates(workflow.ID);
    states.forEach((state) => {
      stateLookup.set(state.ID, state.Name);
    });
  }

  // Extract workflow states
  const objectStates: ObjectWorkflowState[] = [];

  for (const obj of objects) {
    const workflowState = extractWorkflowStateFromProperties(
      obj.Properties || [],
      workflowLookup,
      stateLookup
    );

    const objectState: ObjectWorkflowState = {
      objectId: obj.ObjVer.ID,
      objectType: obj.ObjVer.Type,
      title: obj.Title,
      displayId: obj.DisplayID,
      currentStateId: workflowState.stateId,
      currentStateName: workflowState.stateName,
      workflowId: workflowState.workflowId,
      workflowName: workflowState.workflowName,
      lastModifiedDate: obj.LastModifiedUtc ? new Date(obj.LastModifiedUtc) : undefined,
    };

    objectStates.push(objectState);

    // Create workflow state event if object is in a workflow
    if (objectState.currentStateId && objectState.workflowId) {
      events.push({
        type: 'dms_object_workflow_state',
        timestamp: objectState.lastModifiedDate || new Date(),
        targetId: `${objectState.objectType}-${objectState.objectId}`,
        metadata: {
          objectId: objectState.objectId,
          objectType: objectState.objectType,
          title: objectState.title,
          displayId: objectState.displayId,
          workflowId: objectState.workflowId,
          workflowName: objectState.workflowName,
          stateId: objectState.currentStateId,
          stateName: objectState.currentStateName,
          vaultGuid,
        },
        rawData: {
          objectState,
          organizationId,
        },
      });
    }
  }

  return {
    objectStates,
    events,
  };
}

/**
 * Extract workflow state transitions from version history
 */
export async function extractWorkflowTransitions(
  client: MFilesClient,
  objectTypeId: number,
  objectId: number,
  vaultGuid: string,
  organizationId: string
): Promise<{
  transitions: WorkflowTransition[];
  events: ExtractedEvent[];
}> {
  const events: ExtractedEvent[] = [];

  // Get version history
  const versions = await client.getObjectVersions(objectTypeId, objectId);

  // Build workflow and state lookup maps
  const workflows = await client.getWorkflows();
  const workflowLookup = new Map<number, string>();
  const stateLookup = new Map<number, string>();

  for (const workflow of workflows) {
    workflowLookup.set(workflow.ID, workflow.Name);
    const states = await client.getWorkflowStates(workflow.ID);
    states.forEach((state) => {
      stateLookup.set(state.ID, state.Name);
    });
  }

  // Track state changes between versions
  const transitions: WorkflowTransition[] = [];
  let previousState: { stateId?: number; workflowId?: number } = {};

  for (const version of versions) {
    const workflowState = extractWorkflowStateFromProperties(
      version.Properties || [],
      workflowLookup,
      stateLookup
    );

    // Check if state changed
    if (
      workflowState.stateId &&
      workflowState.workflowId &&
      (workflowState.stateId !== previousState.stateId ||
        workflowState.workflowId !== previousState.workflowId)
    ) {
      const transition: WorkflowTransition = {
        objectId: version.ObjVer.ID,
        objectType: version.ObjVer.Type,
        fromStateId: previousState.stateId,
        fromStateName: previousState.stateId
          ? stateLookup.get(previousState.stateId)
          : undefined,
        toStateId: workflowState.stateId,
        toStateName: workflowState.stateName || '',
        workflowId: workflowState.workflowId,
        workflowName: workflowState.workflowName || '',
        transitionDate: version.LastModifiedUtc
          ? new Date(version.LastModifiedUtc)
          : new Date(),
        version: version.ObjVer.Version,
      };

      transitions.push(transition);

      // Create transition event
      events.push({
        type: 'dms_workflow_state_transition',
        timestamp: transition.transitionDate,
        targetId: `${transition.objectType}-${transition.objectId}`,
        metadata: {
          objectId: transition.objectId,
          objectType: transition.objectType,
          fromStateId: transition.fromStateId,
          fromStateName: transition.fromStateName,
          toStateId: transition.toStateId,
          toStateName: transition.toStateName,
          workflowId: transition.workflowId,
          workflowName: transition.workflowName,
          version: transition.version,
          vaultGuid,
        },
        rawData: {
          transition,
          organizationId,
        },
      });
    }

    previousState = {
      stateId: workflowState.stateId,
      workflowId: workflowState.workflowId,
    };
  }

  return {
    transitions,
    events,
  };
}

/**
 * Get workflow statistics
 */
export function getWorkflowStatistics(objectStates: ObjectWorkflowState[]): {
  totalInWorkflow: number;
  notInWorkflow: number;
  byWorkflow: Record<string, number>;
  byState: Record<string, number>;
} {
  const byWorkflow: Record<string, number> = {};
  const byState: Record<string, number> = {};

  let inWorkflow = 0;

  objectStates.forEach((obj) => {
    if (obj.workflowId && obj.currentStateId) {
      inWorkflow++;

      const workflowName = obj.workflowName || `Workflow ${obj.workflowId}`;
      byWorkflow[workflowName] = (byWorkflow[workflowName] || 0) + 1;

      const stateName = obj.currentStateName || `State ${obj.currentStateId}`;
      byState[stateName] = (byState[stateName] || 0) + 1;
    }
  });

  return {
    totalInWorkflow: inWorkflow,
    notInWorkflow: objectStates.length - inWorkflow,
    byWorkflow,
    byState,
  };
}

/**
 * Create workflow summary event
 */
export function createWorkflowSummaryEvent(
  vaultGuid: string,
  organizationId: string,
  workflows: WorkflowMetadata[],
  statistics: ReturnType<typeof getWorkflowStatistics>
): ExtractedEvent {
  return {
    type: 'dms_workflow_summary',
    timestamp: new Date(),
    metadata: {
      vaultGuid,
      totalWorkflows: workflows.length,
      totalStates: workflows.reduce((sum, w) => sum + w.states.length, 0),
      objectsInWorkflow: statistics.totalInWorkflow,
      objectsNotInWorkflow: statistics.notInWorkflow,
      workflowDistribution: statistics.byWorkflow,
      stateDistribution: statistics.byState,
    },
    rawData: {
      workflows: workflows.map((w) => ({
        id: w.workflowId,
        name: w.workflowName,
        stateCount: w.states.length,
      })),
      organizationId,
    },
  };
}
