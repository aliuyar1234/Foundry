/**
 * Odoo Workflow State Transition Tracker
 * Task: T047
 *
 * Tracks state transitions for Odoo documents (orders, invoices, etc.)
 * Enables workflow analysis and process mining.
 */

import { ExtractedEvent } from '../../base/connector';
import { OdooXmlRpcClient } from '../xmlrpcClient';
import { OdooRestClient } from '../restClient';

type OdooClient = OdooXmlRpcClient | OdooRestClient;

export interface StateTransition {
  id: number;
  model: string;
  recordId: number;
  recordName: string;
  fromState: string;
  toState: string;
  timestamp: Date;
  userId?: number;
  userName?: string;
  duration?: number; // milliseconds in previous state
}

export interface WorkflowDefinition {
  model: string;
  stateField: string;
  states: Array<{
    value: string;
    name: string;
    sequence: number;
    isFinal: boolean;
  }>;
  transitions: Array<{
    from: string;
    to: string;
    action?: string;
  }>;
}

// Known Odoo workflow definitions
const WORKFLOW_DEFINITIONS: Record<string, WorkflowDefinition> = {
  'sale.order': {
    model: 'sale.order',
    stateField: 'state',
    states: [
      { value: 'draft', name: 'Quotation', sequence: 1, isFinal: false },
      { value: 'sent', name: 'Quotation Sent', sequence: 2, isFinal: false },
      { value: 'sale', name: 'Sales Order', sequence: 3, isFinal: false },
      { value: 'done', name: 'Locked', sequence: 4, isFinal: true },
      { value: 'cancel', name: 'Cancelled', sequence: 5, isFinal: true },
    ],
    transitions: [
      { from: 'draft', to: 'sent', action: 'action_quotation_send' },
      { from: 'draft', to: 'sale', action: 'action_confirm' },
      { from: 'sent', to: 'sale', action: 'action_confirm' },
      { from: 'sale', to: 'done', action: 'action_done' },
      { from: 'draft', to: 'cancel', action: 'action_cancel' },
      { from: 'sent', to: 'cancel', action: 'action_cancel' },
      { from: 'sale', to: 'cancel', action: 'action_cancel' },
    ],
  },
  'purchase.order': {
    model: 'purchase.order',
    stateField: 'state',
    states: [
      { value: 'draft', name: 'RFQ', sequence: 1, isFinal: false },
      { value: 'sent', name: 'RFQ Sent', sequence: 2, isFinal: false },
      { value: 'to approve', name: 'To Approve', sequence: 3, isFinal: false },
      { value: 'purchase', name: 'Purchase Order', sequence: 4, isFinal: false },
      { value: 'done', name: 'Locked', sequence: 5, isFinal: true },
      { value: 'cancel', name: 'Cancelled', sequence: 6, isFinal: true },
    ],
    transitions: [
      { from: 'draft', to: 'sent', action: 'action_rfq_send' },
      { from: 'draft', to: 'to approve' },
      { from: 'sent', to: 'to approve' },
      { from: 'to approve', to: 'purchase', action: 'button_approve' },
      { from: 'draft', to: 'purchase', action: 'button_confirm' },
      { from: 'sent', to: 'purchase', action: 'button_confirm' },
      { from: 'purchase', to: 'done', action: 'button_done' },
      { from: 'draft', to: 'cancel', action: 'button_cancel' },
      { from: 'sent', to: 'cancel', action: 'button_cancel' },
      { from: 'to approve', to: 'cancel', action: 'button_cancel' },
    ],
  },
  'account.move': {
    model: 'account.move',
    stateField: 'state',
    states: [
      { value: 'draft', name: 'Draft', sequence: 1, isFinal: false },
      { value: 'posted', name: 'Posted', sequence: 2, isFinal: false },
      { value: 'cancel', name: 'Cancelled', sequence: 3, isFinal: true },
    ],
    transitions: [
      { from: 'draft', to: 'posted', action: 'action_post' },
      { from: 'posted', to: 'draft', action: 'button_draft' },
      { from: 'draft', to: 'cancel', action: 'button_cancel' },
      { from: 'posted', to: 'cancel', action: 'button_cancel' },
    ],
  },
  'stock.picking': {
    model: 'stock.picking',
    stateField: 'state',
    states: [
      { value: 'draft', name: 'Draft', sequence: 1, isFinal: false },
      { value: 'waiting', name: 'Waiting Another Operation', sequence: 2, isFinal: false },
      { value: 'confirmed', name: 'Waiting', sequence: 3, isFinal: false },
      { value: 'assigned', name: 'Ready', sequence: 4, isFinal: false },
      { value: 'done', name: 'Done', sequence: 5, isFinal: true },
      { value: 'cancel', name: 'Cancelled', sequence: 6, isFinal: true },
    ],
    transitions: [
      { from: 'draft', to: 'confirmed', action: 'action_confirm' },
      { from: 'confirmed', to: 'assigned', action: 'action_assign' },
      { from: 'waiting', to: 'assigned', action: 'action_assign' },
      { from: 'assigned', to: 'done', action: 'button_validate' },
      { from: 'draft', to: 'cancel', action: 'action_cancel' },
      { from: 'confirmed', to: 'cancel', action: 'action_cancel' },
      { from: 'assigned', to: 'cancel', action: 'action_cancel' },
    ],
  },
  'crm.lead': {
    model: 'crm.lead',
    stateField: 'stage_id',
    states: [], // Dynamic - loaded from crm.stage
    transitions: [],
  },
  'project.task': {
    model: 'project.task',
    stateField: 'stage_id',
    states: [], // Dynamic - loaded from project.task.type
    transitions: [],
  },
};

export class OdooStateTransitionTracker {
  private client: OdooClient;
  private stateCache: Map<string, Map<number, string>> = new Map();

  constructor(client: OdooClient) {
    this.client = client;
  }

  /**
   * Track state transitions for a model
   */
  async trackTransitions(
    model: string,
    options: {
      organizationId: string;
      modifiedAfter?: Date;
      recordIds?: number[];
      limit?: number;
    }
  ): Promise<{
    events: ExtractedEvent[];
    transitions: StateTransition[];
  }> {
    const workflow = WORKFLOW_DEFINITIONS[model];
    if (!workflow) {
      return { events: [], transitions: [] };
    }

    const events: ExtractedEvent[] = [];
    const transitions: StateTransition[] = [];

    // Get message/tracking history
    const domain: Array<[string, string, unknown]> = [
      ['model', '=', model],
      ['tracking_value_ids', '!=', false],
    ];

    if (options.modifiedAfter) {
      domain.push(['date', '>=', options.modifiedAfter.toISOString()]);
    }

    if (options.recordIds?.length) {
      domain.push(['res_id', 'in', options.recordIds]);
    }

    // Fetch mail.message with tracking values
    const messages = await this.client.searchRead<{
      id: number;
      res_id: number;
      date: string;
      author_id?: [number, string];
      tracking_value_ids: number[];
    }>('mail.message', domain, {
      fields: ['res_id', 'date', 'author_id', 'tracking_value_ids'],
      limit: options.limit || 1000,
      order: 'date desc',
    });

    // Get tracking values
    const allTrackingIds = messages.flatMap((m) => m.tracking_value_ids);

    if (allTrackingIds.length === 0) {
      return { events, transitions };
    }

    const trackingValues = await this.client.searchRead<{
      id: number;
      field: string;
      field_desc: string;
      old_value_char?: string;
      new_value_char?: string;
      old_value_integer?: number;
      new_value_integer?: number;
    }>('mail.tracking.value', [['id', 'in', allTrackingIds]], {
      fields: [
        'field',
        'field_desc',
        'old_value_char',
        'new_value_char',
        'old_value_integer',
        'new_value_integer',
      ],
    });

    const trackingMap = new Map(trackingValues.map((tv) => [tv.id, tv]));

    // Get record names
    const recordIds = [...new Set(messages.map((m) => m.res_id))];
    const records = await this.client.searchRead<{ id: number; name?: string; display_name?: string }>(
      model,
      [['id', 'in', recordIds]],
      { fields: ['name', 'display_name'] }
    );
    const recordMap = new Map(records.map((r) => [r.id, r.name || r.display_name || `${model}/${r.id}`]));

    // Process messages to find state transitions
    for (const message of messages) {
      for (const trackingId of message.tracking_value_ids) {
        const tracking = trackingMap.get(trackingId);
        if (!tracking) continue;

        // Check if this is a state field change
        if (tracking.field === workflow.stateField || tracking.field_desc?.toLowerCase().includes('state')) {
          const fromState = tracking.old_value_char || String(tracking.old_value_integer || '');
          const toState = tracking.new_value_char || String(tracking.new_value_integer || '');

          if (fromState && toState && fromState !== toState) {
            const transition: StateTransition = {
              id: message.id,
              model,
              recordId: message.res_id,
              recordName: recordMap.get(message.res_id) || `${model}/${message.res_id}`,
              fromState,
              toState,
              timestamp: new Date(message.date),
              userId: message.author_id?.[0],
              userName: message.author_id?.[1],
            };

            transitions.push(transition);
            events.push(this.transitionToEvent(transition, options.organizationId));
          }
        }
      }
    }

    return { events, transitions };
  }

  /**
   * Get workflow definition for a model
   */
  getWorkflowDefinition(model: string): WorkflowDefinition | null {
    return WORKFLOW_DEFINITIONS[model] || null;
  }

  /**
   * Load dynamic workflow states (for models with configurable stages)
   */
  async loadDynamicWorkflow(model: string): Promise<WorkflowDefinition | null> {
    if (model === 'crm.lead') {
      const stages = await this.client.searchRead<{
        id: number;
        name: string;
        sequence: number;
        is_won: boolean;
      }>('crm.stage', [], {
        fields: ['name', 'sequence', 'is_won'],
        order: 'sequence asc',
      });

      return {
        model: 'crm.lead',
        stateField: 'stage_id',
        states: stages.map((s) => ({
          value: String(s.id),
          name: s.name,
          sequence: s.sequence,
          isFinal: s.is_won,
        })),
        transitions: [], // CRM allows any-to-any transitions
      };
    }

    if (model === 'project.task') {
      const stages = await this.client.searchRead<{
        id: number;
        name: string;
        sequence: number;
        fold: boolean;
      }>('project.task.type', [], {
        fields: ['name', 'sequence', 'fold'],
        order: 'sequence asc',
      });

      return {
        model: 'project.task',
        stateField: 'stage_id',
        states: stages.map((s) => ({
          value: String(s.id),
          name: s.name,
          sequence: s.sequence,
          isFinal: s.fold,
        })),
        transitions: [], // Tasks allow any-to-any transitions
      };
    }

    return WORKFLOW_DEFINITIONS[model] || null;
  }

  /**
   * Calculate state duration statistics
   */
  async calculateStateDurations(
    model: string,
    options: {
      organizationId: string;
      dateFrom?: Date;
      dateTo?: Date;
    }
  ): Promise<{
    byState: Record<string, { avgDuration: number; minDuration: number; maxDuration: number; count: number }>;
    byTransition: Record<string, { avgDuration: number; count: number }>;
  }> {
    const { transitions } = await this.trackTransitions(model, {
      organizationId: options.organizationId,
      modifiedAfter: options.dateFrom,
    });

    // Group transitions by record
    const byRecord = new Map<number, StateTransition[]>();
    for (const t of transitions) {
      const list = byRecord.get(t.recordId) || [];
      list.push(t);
      byRecord.set(t.recordId, list);
    }

    const stateDurations: Record<string, number[]> = {};
    const transitionCounts: Record<string, number[]> = {};

    // Calculate durations
    for (const [, recordTransitions] of byRecord) {
      // Sort by timestamp
      recordTransitions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      for (let i = 0; i < recordTransitions.length - 1; i++) {
        const current = recordTransitions[i];
        const next = recordTransitions[i + 1];

        const duration = next.timestamp.getTime() - current.timestamp.getTime();

        // Track state duration
        if (!stateDurations[current.toState]) {
          stateDurations[current.toState] = [];
        }
        stateDurations[current.toState].push(duration);

        // Track transition duration
        const transitionKey = `${current.toState}->${next.toState}`;
        if (!transitionCounts[transitionKey]) {
          transitionCounts[transitionKey] = [];
        }
        transitionCounts[transitionKey].push(duration);
      }
    }

    // Calculate statistics
    const byState: Record<string, { avgDuration: number; minDuration: number; maxDuration: number; count: number }> = {};
    for (const [state, durations] of Object.entries(stateDurations)) {
      const sum = durations.reduce((a, b) => a + b, 0);
      byState[state] = {
        avgDuration: sum / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        count: durations.length,
      };
    }

    const byTransition: Record<string, { avgDuration: number; count: number }> = {};
    for (const [transition, durations] of Object.entries(transitionCounts)) {
      const sum = durations.reduce((a, b) => a + b, 0);
      byTransition[transition] = {
        avgDuration: sum / durations.length,
        count: durations.length,
      };
    }

    return { byState, byTransition };
  }

  /**
   * Convert transition to event
   */
  private transitionToEvent(
    transition: StateTransition,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'erp.workflow.transition',
      timestamp: transition.timestamp,
      actorId: transition.userName,
      targetId: String(transition.recordId),
      metadata: {
        source: 'odoo',
        organizationId,
        model: transition.model,
        recordId: transition.recordId,
        recordName: transition.recordName,
        fromState: transition.fromState,
        toState: transition.toState,
        userId: transition.userId,
        userName: transition.userName,
        duration: transition.duration,
      },
    };
  }
}

/**
 * Create state transition tracker
 */
export function createOdooStateTransitionTracker(
  client: OdooClient
): OdooStateTransitionTracker {
  return new OdooStateTransitionTracker(client);
}
