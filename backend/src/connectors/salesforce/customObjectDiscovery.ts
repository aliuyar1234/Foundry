/**
 * Salesforce Custom Object Discovery
 * Task: T081
 *
 * Discovers and maps custom objects and fields in Salesforce.
 * Supports dynamic schema introspection.
 */

import { SalesforceClient } from './salesforceClient';

export interface SalesforceObjectDescribe {
  name: string;
  label: string;
  labelPlural: string;
  keyPrefix: string;
  custom: boolean;
  customSetting: boolean;
  queryable: boolean;
  searchable: boolean;
  createable: boolean;
  updateable: boolean;
  deletable: boolean;
  replicateable: boolean;
  triggerable: boolean;
  recordTypeInfos: RecordTypeInfo[];
  fields: SalesforceFieldDescribe[];
  childRelationships: ChildRelationship[];
}

export interface SalesforceFieldDescribe {
  name: string;
  label: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  custom: boolean;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  calculatedFormula?: string;
  defaultValue?: unknown;
  picklistValues?: PicklistValue[];
  referenceTo?: string[];
  relationshipName?: string;
  externalId: boolean;
  unique: boolean;
  encrypted: boolean;
}

export interface RecordTypeInfo {
  recordTypeId: string;
  name: string;
  developerName: string;
  defaultRecordTypeMapping: boolean;
  available: boolean;
  master: boolean;
}

export interface ChildRelationship {
  childSObject: string;
  field: string;
  relationshipName: string;
  cascadeDelete: boolean;
  restrictedDelete: boolean;
}

export interface PicklistValue {
  value: string;
  label: string;
  active: boolean;
  defaultValue: boolean;
}

export interface DiscoveredObject {
  apiName: string;
  label: string;
  type: 'standard' | 'custom' | 'custom_setting' | 'platform_event';
  keyPrefix: string;
  isQueryable: boolean;
  fieldCount: number;
  customFieldCount: number;
  relationshipCount: number;
  hasRecordTypes: boolean;
}

export interface ObjectDiscoveryOptions {
  includeStandard?: boolean;
  includeCustom?: boolean;
  includeCustomSettings?: boolean;
  includePlatformEvents?: boolean;
  namePattern?: RegExp;
}

export class SalesforceCustomObjectDiscovery {
  private client: SalesforceClient;
  private objectCache: Map<string, SalesforceObjectDescribe> = new Map();

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  /**
   * Discover all objects in the org
   */
  async discoverObjects(
    options: ObjectDiscoveryOptions = {}
  ): Promise<DiscoveredObject[]> {
    const {
      includeStandard = true,
      includeCustom = true,
      includeCustomSettings = false,
      includePlatformEvents = false,
      namePattern,
    } = options;

    const globalDescribe = await this.getGlobalDescribe();
    const discovered: DiscoveredObject[] = [];

    for (const obj of globalDescribe.sobjects) {
      // Filter by type
      const isCustom = obj.custom;
      const isCustomSetting = obj.customSetting;
      const isPlatformEvent = obj.name.endsWith('__e');

      if (!includeStandard && !isCustom && !isCustomSetting && !isPlatformEvent) {
        continue;
      }
      if (!includeCustom && isCustom && !isCustomSetting && !isPlatformEvent) {
        continue;
      }
      if (!includeCustomSettings && isCustomSetting) {
        continue;
      }
      if (!includePlatformEvents && isPlatformEvent) {
        continue;
      }

      // Filter by name pattern
      if (namePattern && !namePattern.test(obj.name)) {
        continue;
      }

      // Skip non-queryable objects
      if (!obj.queryable) {
        continue;
      }

      let type: DiscoveredObject['type'] = 'standard';
      if (isPlatformEvent) {
        type = 'platform_event';
      } else if (isCustomSetting) {
        type = 'custom_setting';
      } else if (isCustom) {
        type = 'custom';
      }

      discovered.push({
        apiName: obj.name,
        label: obj.label,
        type,
        keyPrefix: obj.keyPrefix || '',
        isQueryable: obj.queryable,
        fieldCount: 0, // Will be populated on demand
        customFieldCount: 0,
        relationshipCount: 0,
        hasRecordTypes: false,
      });
    }

    return discovered;
  }

  /**
   * Get detailed object description
   */
  async describeObject(objectName: string): Promise<SalesforceObjectDescribe | null> {
    // Check cache
    if (this.objectCache.has(objectName)) {
      return this.objectCache.get(objectName)!;
    }

    try {
      const describe = await this.client.describeObject(objectName) as any;

      const objectDescribe: SalesforceObjectDescribe = {
        name: describe.name,
        label: describe.label,
        labelPlural: describe.labelPlural,
        keyPrefix: describe.keyPrefix,
        custom: describe.custom,
        customSetting: describe.customSetting,
        queryable: describe.queryable,
        searchable: describe.searchable,
        createable: describe.createable,
        updateable: describe.updateable,
        deletable: describe.deletable,
        replicateable: describe.replicateable,
        triggerable: describe.triggerable,
        recordTypeInfos: (describe.recordTypeInfos || []).map((rt: any) => ({
          recordTypeId: rt.recordTypeId,
          name: rt.name,
          developerName: rt.developerName,
          defaultRecordTypeMapping: rt.defaultRecordTypeMapping,
          available: rt.available,
          master: rt.master,
        })),
        fields: (describe.fields || []).map((f: any) => ({
          name: f.name,
          label: f.label,
          type: f.type,
          length: f.length,
          precision: f.precision,
          scale: f.scale,
          custom: f.custom,
          nillable: f.nillable,
          createable: f.createable,
          updateable: f.updateable,
          calculatedFormula: f.calculatedFormula,
          defaultValue: f.defaultValue,
          picklistValues: (f.picklistValues || []).map((pv: any) => ({
            value: pv.value,
            label: pv.label,
            active: pv.active,
            defaultValue: pv.defaultValue,
          })),
          referenceTo: f.referenceTo,
          relationshipName: f.relationshipName,
          externalId: f.externalId,
          unique: f.unique,
          encrypted: f.encrypted,
        })),
        childRelationships: (describe.childRelationships || []).map((cr: any) => ({
          childSObject: cr.childSObject,
          field: cr.field,
          relationshipName: cr.relationshipName,
          cascadeDelete: cr.cascadeDelete,
          restrictedDelete: cr.restrictedDelete,
        })),
      };

      // Cache the result
      this.objectCache.set(objectName, objectDescribe);

      return objectDescribe;
    } catch (error) {
      console.warn(`Failed to describe object ${objectName}:`, error);
      return null;
    }
  }

  /**
   * Get custom fields for an object
   */
  async getCustomFields(objectName: string): Promise<SalesforceFieldDescribe[]> {
    const describe = await this.describeObject(objectName);
    if (!describe) return [];

    return describe.fields.filter((f) => f.custom);
  }

  /**
   * Get relationship fields for an object
   */
  async getRelationshipFields(objectName: string): Promise<SalesforceFieldDescribe[]> {
    const describe = await this.describeObject(objectName);
    if (!describe) return [];

    return describe.fields.filter((f) => f.type === 'reference' && f.referenceTo?.length);
  }

  /**
   * Get all picklist fields and their values
   */
  async getPicklistFields(objectName: string): Promise<Array<{
    fieldName: string;
    label: string;
    values: PicklistValue[];
  }>> {
    const describe = await this.describeObject(objectName);
    if (!describe) return [];

    return describe.fields
      .filter((f) => f.type === 'picklist' || f.type === 'multipicklist')
      .map((f) => ({
        fieldName: f.name,
        label: f.label,
        values: f.picklistValues || [],
      }));
  }

  /**
   * Build SOQL query for an object with all queryable fields
   */
  async buildSelectAllQuery(
    objectName: string,
    options?: {
      excludeFields?: string[];
      whereClause?: string;
      orderBy?: string;
      limit?: number;
    }
  ): Promise<string> {
    const describe = await this.describeObject(objectName);
    if (!describe) {
      throw new Error(`Object ${objectName} not found`);
    }

    // Get all queryable fields
    let fields = describe.fields
      .filter((f) => {
        // Skip compound fields that can't be queried directly
        if (f.type === 'address' || f.type === 'location') return false;
        return true;
      })
      .map((f) => f.name);

    // Exclude specified fields
    if (options?.excludeFields?.length) {
      fields = fields.filter((f) => !options.excludeFields!.includes(f));
    }

    let soql = `SELECT ${fields.join(', ')} FROM ${objectName}`;

    if (options?.whereClause) {
      soql += ` WHERE ${options.whereClause}`;
    }

    if (options?.orderBy) {
      soql += ` ORDER BY ${options.orderBy}`;
    }

    if (options?.limit) {
      soql += ` LIMIT ${options.limit}`;
    }

    return soql;
  }

  /**
   * Get object relationships
   */
  async getObjectRelationships(objectName: string): Promise<{
    parents: Array<{ objectName: string; fieldName: string; relationshipName?: string }>;
    children: ChildRelationship[];
  }> {
    const describe = await this.describeObject(objectName);
    if (!describe) {
      return { parents: [], children: [] };
    }

    const parents = describe.fields
      .filter((f) => f.type === 'reference' && f.referenceTo?.length)
      .flatMap((f) =>
        f.referenceTo!.map((ref) => ({
          objectName: ref,
          fieldName: f.name,
          relationshipName: f.relationshipName,
        }))
      );

    return {
      parents,
      children: describe.childRelationships,
    };
  }

  /**
   * Get global describe (all objects)
   */
  private async getGlobalDescribe(): Promise<{
    encoding: string;
    maxBatchSize: number;
    sobjects: Array<{
      name: string;
      label: string;
      keyPrefix: string;
      custom: boolean;
      customSetting: boolean;
      queryable: boolean;
    }>;
  }> {
    return (this.client as any).request('/sobjects');
  }

  /**
   * Clear object cache
   */
  clearCache(): void {
    this.objectCache.clear();
  }
}

/**
 * Create custom object discovery instance
 */
export function createCustomObjectDiscovery(client: SalesforceClient): SalesforceCustomObjectDiscovery {
  return new SalesforceCustomObjectDiscovery(client);
}
