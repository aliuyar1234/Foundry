/**
 * HubSpot Custom Property Discovery
 * Task: T099
 *
 * Discovers custom properties on HubSpot objects.
 * Maps property metadata and field types.
 */

import { HubSpotClient } from './hubspotClient';

export interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  groupName: string;
  description?: string;
  hasUniqueValue: boolean;
  hidden: boolean;
  modificationMetadata: {
    archivable: boolean;
    readOnlyDefinition: boolean;
    readOnlyValue: boolean;
  };
  options?: PropertyOption[];
  calculated: boolean;
  externalOptions: boolean;
}

export interface PropertyOption {
  label: string;
  value: string;
  description?: string;
  displayOrder: number;
  hidden: boolean;
}

export interface PropertyGroup {
  name: string;
  label: string;
  displayOrder: number;
  archived: boolean;
}

export interface DiscoveredProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  group: string;
  isCustom: boolean;
  isReadOnly: boolean;
  hasOptions: boolean;
  optionCount: number;
}

export type HubSpotObjectType = 'contacts' | 'companies' | 'deals' | 'tickets' | 'products' | 'line_items' | 'quotes';

export class HubSpotCustomPropertyDiscovery {
  private client: HubSpotClient;
  private propertyCache: Map<string, HubSpotProperty[]> = new Map();

  constructor(client: HubSpotClient) {
    this.client = client;
  }

  /**
   * Discover all properties for an object type
   */
  async discoverProperties(
    objectType: HubSpotObjectType
  ): Promise<DiscoveredProperty[]> {
    const properties = await this.getProperties(objectType);

    return properties.map((prop) => ({
      name: prop.name,
      label: prop.label,
      type: prop.type,
      fieldType: prop.fieldType,
      group: prop.groupName,
      isCustom: !prop.name.startsWith('hs_') && !this.isBuiltInProperty(objectType, prop.name),
      isReadOnly: prop.modificationMetadata.readOnlyValue,
      hasOptions: Boolean(prop.options?.length),
      optionCount: prop.options?.length || 0,
    }));
  }

  /**
   * Get all properties for an object type
   */
  async getProperties(objectType: HubSpotObjectType): Promise<HubSpotProperty[]> {
    // Check cache
    if (this.propertyCache.has(objectType)) {
      return this.propertyCache.get(objectType)!;
    }

    try {
      const response = await (this.client as any).request<{
        results: HubSpotProperty[];
      }>(`/crm/v3/properties/${objectType}`);

      // Cache the result
      this.propertyCache.set(objectType, response.results);

      return response.results;
    } catch (error) {
      console.warn(`Failed to get properties for ${objectType}:`, error);
      return [];
    }
  }

  /**
   * Get custom properties only
   */
  async getCustomProperties(objectType: HubSpotObjectType): Promise<HubSpotProperty[]> {
    const properties = await this.getProperties(objectType);

    return properties.filter(
      (prop) => !prop.name.startsWith('hs_') && !this.isBuiltInProperty(objectType, prop.name)
    );
  }

  /**
   * Get property groups for an object type
   */
  async getPropertyGroups(objectType: HubSpotObjectType): Promise<PropertyGroup[]> {
    try {
      const response = await (this.client as any).request<{
        results: PropertyGroup[];
      }>(`/crm/v3/properties/${objectType}/groups`);

      return response.results;
    } catch (error) {
      console.warn(`Failed to get property groups for ${objectType}:`, error);
      return [];
    }
  }

  /**
   * Get properties by group
   */
  async getPropertiesByGroup(
    objectType: HubSpotObjectType,
    groupName: string
  ): Promise<HubSpotProperty[]> {
    const properties = await this.getProperties(objectType);
    return properties.filter((prop) => prop.groupName === groupName);
  }

  /**
   * Get enumeration (dropdown/select) properties
   */
  async getEnumerationProperties(objectType: HubSpotObjectType): Promise<Array<{
    property: HubSpotProperty;
    options: PropertyOption[];
  }>> {
    const properties = await this.getProperties(objectType);

    return properties
      .filter((prop) => prop.type === 'enumeration' && prop.options?.length)
      .map((prop) => ({
        property: prop,
        options: prop.options || [],
      }));
  }

  /**
   * Build property map for efficient lookup
   */
  async buildPropertyMap(objectType: HubSpotObjectType): Promise<Map<string, HubSpotProperty>> {
    const properties = await this.getProperties(objectType);
    const map = new Map<string, HubSpotProperty>();

    for (const prop of properties) {
      map.set(prop.name, prop);
    }

    return map;
  }

  /**
   * Get required properties for data extraction
   */
  async getExtractableProperties(
    objectType: HubSpotObjectType,
    options?: {
      includeReadOnly?: boolean;
      includeHidden?: boolean;
      maxProperties?: number;
    }
  ): Promise<string[]> {
    const properties = await this.getProperties(objectType);

    let filtered = properties;

    if (!options?.includeReadOnly) {
      filtered = filtered.filter((p) => !p.modificationMetadata.readOnlyValue || p.calculated);
    }

    if (!options?.includeHidden) {
      filtered = filtered.filter((p) => !p.hidden);
    }

    // Sort by importance (custom properties last, system properties first)
    filtered.sort((a, b) => {
      const aIsSystem = a.name.startsWith('hs_') || this.isBuiltInProperty(objectType, a.name);
      const bIsSystem = b.name.startsWith('hs_') || this.isBuiltInProperty(objectType, b.name);
      if (aIsSystem && !bIsSystem) return -1;
      if (!aIsSystem && bIsSystem) return 1;
      return 0;
    });

    // Limit if specified
    if (options?.maxProperties) {
      filtered = filtered.slice(0, options.maxProperties);
    }

    return filtered.map((p) => p.name);
  }

  /**
   * Generate property schema for documentation
   */
  async generatePropertySchema(objectType: HubSpotObjectType): Promise<{
    objectType: string;
    totalProperties: number;
    customProperties: number;
    groups: Array<{
      name: string;
      label: string;
      propertyCount: number;
    }>;
    propertyTypes: Record<string, number>;
  }> {
    const properties = await this.getProperties(objectType);
    const groups = await this.getPropertyGroups(objectType);

    const propertyTypes: Record<string, number> = {};
    let customCount = 0;

    for (const prop of properties) {
      propertyTypes[prop.type] = (propertyTypes[prop.type] || 0) + 1;
      if (!prop.name.startsWith('hs_') && !this.isBuiltInProperty(objectType, prop.name)) {
        customCount++;
      }
    }

    const groupsWithCounts = groups.map((group) => ({
      name: group.name,
      label: group.label,
      propertyCount: properties.filter((p) => p.groupName === group.name).length,
    }));

    return {
      objectType,
      totalProperties: properties.length,
      customProperties: customCount,
      groups: groupsWithCounts,
      propertyTypes,
    };
  }

  /**
   * Check if property is a built-in HubSpot property
   */
  private isBuiltInProperty(objectType: HubSpotObjectType, propertyName: string): boolean {
    const builtInProperties: Record<HubSpotObjectType, string[]> = {
      contacts: [
        'firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company',
        'jobtitle', 'city', 'state', 'country', 'zip', 'address',
        'lifecyclestage', 'hubspot_owner_id', 'createdate',
      ],
      companies: [
        'name', 'domain', 'industry', 'phone', 'website', 'description',
        'city', 'state', 'country', 'zip', 'address', 'annualrevenue',
        'numberofemployees', 'hubspot_owner_id', 'createdate', 'lifecyclestage',
      ],
      deals: [
        'dealname', 'amount', 'closedate', 'dealstage', 'pipeline',
        'hubspot_owner_id', 'description', 'dealtype', 'createdate',
      ],
      tickets: [
        'subject', 'content', 'hubspot_owner_id', 'createdate',
      ],
      products: [
        'name', 'description', 'price', 'hs_sku', 'hs_cost_of_goods_sold',
      ],
      line_items: [
        'name', 'quantity', 'price', 'amount', 'discount',
      ],
      quotes: [
        'hs_title', 'hs_expiration_date', 'hs_status',
      ],
    };

    return builtInProperties[objectType]?.includes(propertyName) || false;
  }

  /**
   * Clear property cache
   */
  clearCache(): void {
    this.propertyCache.clear();
  }
}

/**
 * Create custom property discovery instance
 */
export function createCustomPropertyDiscovery(client: HubSpotClient): HubSpotCustomPropertyDiscovery {
  return new HubSpotCustomPropertyDiscovery(client);
}
