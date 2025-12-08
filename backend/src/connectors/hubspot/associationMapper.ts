/**
 * HubSpot Association Mapper
 * Task: T101
 *
 * Maps and extracts associations between HubSpot objects.
 * Handles company-contact, deal-contact, and other relationships.
 */

import { ExtractedEvent } from '../base/connector';
import { HubSpotClient } from './hubspotClient';

export interface Association {
  fromObjectType: string;
  fromObjectId: string;
  toObjectType: string;
  toObjectId: string;
  associationType: string;
  associationLabel?: string;
}

export interface AssociationDefinition {
  category: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';
  typeId: number;
  label?: string;
  name?: string;
}

export interface AssociationBatch {
  from: { id: string };
  to: Array<{
    toObjectId: string;
    associationTypes: Array<{
      associationCategory: string;
      associationTypeId: number;
    }>;
  }>;
}

export type AssociableObjectType =
  | 'contacts'
  | 'companies'
  | 'deals'
  | 'tickets'
  | 'products'
  | 'line_items'
  | 'quotes'
  | 'calls'
  | 'emails'
  | 'meetings'
  | 'notes'
  | 'tasks';

export class HubSpotAssociationMapper {
  private client: HubSpotClient;
  private definitionCache: Map<string, AssociationDefinition[]> = new Map();

  constructor(client: HubSpotClient) {
    this.client = client;
  }

  /**
   * Get associations for a specific object
   */
  async getAssociations(
    fromObjectType: AssociableObjectType,
    fromObjectId: string,
    toObjectType: AssociableObjectType
  ): Promise<Association[]> {
    const associations: Association[] = [];

    try {
      const response = await (this.client as any).request<{
        results: Array<{
          toObjectId: string;
          associationTypes: Array<{
            category: string;
            typeId: number;
            label?: string;
          }>;
        }>;
      }>(`/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}`);

      for (const result of response.results) {
        for (const assocType of result.associationTypes) {
          associations.push({
            fromObjectType,
            fromObjectId,
            toObjectType,
            toObjectId: result.toObjectId,
            associationType: `${assocType.category}_${assocType.typeId}`,
            associationLabel: assocType.label,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to get associations from ${fromObjectType}/${fromObjectId} to ${toObjectType}:`, error);
    }

    return associations;
  }

  /**
   * Get all associations for an object
   */
  async getAllAssociationsForObject(
    objectType: AssociableObjectType,
    objectId: string
  ): Promise<Association[]> {
    const allAssociations: Association[] = [];
    const targetTypes: AssociableObjectType[] = [
      'contacts', 'companies', 'deals', 'tickets',
    ];

    for (const targetType of targetTypes) {
      if (targetType !== objectType) {
        const associations = await this.getAssociations(objectType, objectId, targetType);
        allAssociations.push(...associations);
      }
    }

    return allAssociations;
  }

  /**
   * Get association definitions between two object types
   */
  async getAssociationDefinitions(
    fromObjectType: AssociableObjectType,
    toObjectType: AssociableObjectType
  ): Promise<AssociationDefinition[]> {
    const cacheKey = `${fromObjectType}->${toObjectType}`;

    if (this.definitionCache.has(cacheKey)) {
      return this.definitionCache.get(cacheKey)!;
    }

    try {
      const response = await (this.client as any).request<{
        results: AssociationDefinition[];
      }>(`/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`);

      this.definitionCache.set(cacheKey, response.results);
      return response.results;
    } catch (error) {
      console.warn(`Failed to get association definitions for ${fromObjectType} -> ${toObjectType}:`, error);
      return [];
    }
  }

  /**
   * Extract associations as events
   */
  async extractAssociationEvents(
    fromObjectType: AssociableObjectType,
    objectIds: string[],
    toObjectTypes: AssociableObjectType[],
    options: { organizationId: string }
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    for (const fromId of objectIds) {
      for (const toType of toObjectTypes) {
        const associations = await this.getAssociations(fromObjectType, fromId, toType);

        for (const assoc of associations) {
          events.push({
            type: 'crm.association',
            timestamp: new Date(),
            actorId: undefined,
            targetId: `${assoc.fromObjectType}:${assoc.fromObjectId}:${assoc.toObjectType}:${assoc.toObjectId}`,
            metadata: {
              source: 'hubspot',
              organizationId: options.organizationId,
              fromObjectType: assoc.fromObjectType,
              fromObjectId: assoc.fromObjectId,
              toObjectType: assoc.toObjectType,
              toObjectId: assoc.toObjectId,
              associationType: assoc.associationType,
              associationLabel: assoc.associationLabel,
            },
          });
        }
      }
    }

    return events;
  }

  /**
   * Build association graph for visualization
   */
  async buildAssociationGraph(
    rootObjectType: AssociableObjectType,
    rootObjectId: string,
    depth: number = 2
  ): Promise<{
    nodes: Array<{
      id: string;
      type: string;
      objectId: string;
      depth: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
      type: string;
      label?: string;
    }>;
  }> {
    const nodes: Array<{
      id: string;
      type: string;
      objectId: string;
      depth: number;
    }> = [];
    const edges: Array<{
      from: string;
      to: string;
      type: string;
      label?: string;
    }> = [];
    const visited = new Set<string>();

    const traverse = async (
      objectType: AssociableObjectType,
      objectId: string,
      currentDepth: number
    ) => {
      const nodeId = `${objectType}:${objectId}`;
      if (visited.has(nodeId) || currentDepth > depth) {
        return;
      }
      visited.add(nodeId);

      nodes.push({
        id: nodeId,
        type: objectType,
        objectId,
        depth: currentDepth,
      });

      if (currentDepth < depth) {
        const associations = await this.getAllAssociationsForObject(objectType, objectId);

        for (const assoc of associations) {
          const targetNodeId = `${assoc.toObjectType}:${assoc.toObjectId}`;

          edges.push({
            from: nodeId,
            to: targetNodeId,
            type: assoc.associationType,
            label: assoc.associationLabel,
          });

          await traverse(
            assoc.toObjectType as AssociableObjectType,
            assoc.toObjectId,
            currentDepth + 1
          );
        }
      }
    };

    await traverse(rootObjectType, rootObjectId, 0);

    return { nodes, edges };
  }

  /**
   * Get company's contacts
   */
  async getCompanyContacts(companyId: string): Promise<string[]> {
    const associations = await this.getAssociations('companies', companyId, 'contacts');
    return associations.map((a) => a.toObjectId);
  }

  /**
   * Get company's deals
   */
  async getCompanyDeals(companyId: string): Promise<string[]> {
    const associations = await this.getAssociations('companies', companyId, 'deals');
    return associations.map((a) => a.toObjectId);
  }

  /**
   * Get contact's companies
   */
  async getContactCompanies(contactId: string): Promise<string[]> {
    const associations = await this.getAssociations('contacts', contactId, 'companies');
    return associations.map((a) => a.toObjectId);
  }

  /**
   * Get deal's contacts
   */
  async getDealContacts(dealId: string): Promise<string[]> {
    const associations = await this.getAssociations('deals', dealId, 'contacts');
    return associations.map((a) => a.toObjectId);
  }

  /**
   * Get deal's company
   */
  async getDealCompany(dealId: string): Promise<string | null> {
    const associations = await this.getAssociations('deals', dealId, 'companies');
    return associations.length > 0 ? associations[0].toObjectId : null;
  }

  /**
   * Get ticket associations
   */
  async getTicketAssociations(ticketId: string): Promise<{
    contacts: string[];
    companies: string[];
    deals: string[];
  }> {
    const [contacts, companies, deals] = await Promise.all([
      this.getAssociations('tickets', ticketId, 'contacts'),
      this.getAssociations('tickets', ticketId, 'companies'),
      this.getAssociations('tickets', ticketId, 'deals'),
    ]);

    return {
      contacts: contacts.map((a) => a.toObjectId),
      companies: companies.map((a) => a.toObjectId),
      deals: deals.map((a) => a.toObjectId),
    };
  }

  /**
   * Clear definition cache
   */
  clearCache(): void {
    this.definitionCache.clear();
  }
}

/**
 * Create association mapper
 */
export function createAssociationMapper(client: HubSpotClient): HubSpotAssociationMapper {
  return new HubSpotAssociationMapper(client);
}
