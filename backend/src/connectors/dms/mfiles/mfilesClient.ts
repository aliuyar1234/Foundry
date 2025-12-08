/**
 * M-Files REST API Client Wrapper
 * Provides typed access to M-Files REST API endpoints
 * T169: M-Files API client for vault and object operations
 */

import { getVaultApiUrl } from './auth.js';

export interface MFilesClientConfig {
  serverUrl: string;
  vaultGuid: string;
  authToken: string;
}

export interface MFilesObjectVersion {
  ObjVer: {
    Type: number; // Object type ID
    ID: number; // Object ID
    Version: number; // Version number
  };
  Title: string;
  DisplayID: string; // Display ID (e.g., "DOC-001")
  Class: number; // Class ID
  ObjectGUID?: string;
  CreatedUtc?: string;
  LastModifiedUtc?: string;
  VersionLabel?: string;
  PathInIDView?: string;
  ObjectCheckedOut?: boolean;
  ObjectCheckedOutToUserID?: number;
  CheckedOutAtUtc?: string;
  SingleFile?: boolean;
  ThisVersionLatestToThisUser?: boolean;
  VisibleAfterOperation?: boolean;
  Files?: MFilesObjectFile[];
  Properties?: MFilesPropertyValue[];
}

export interface MFilesObjectFile {
  ID: number;
  Version: number;
  Name: string;
  Extension: string;
  Size: number;
  CreatedUtc: string;
  LastModifiedUtc: string;
}

export interface MFilesPropertyValue {
  PropertyDef: number; // Property definition ID
  TypedValue: {
    DataType: number; // M-Files data type
    HasValue: boolean;
    Value?: unknown;
    DisplayValue?: string;
    Lookup?: MFilesLookup;
    Lookups?: MFilesLookup[];
  };
}

export interface MFilesLookup {
  Item: number; // Value list item ID
  DisplayValue?: string;
  Version?: number;
}

export interface MFilesObjectType {
  ID: number;
  Name: string;
  NamePlural: string;
  OwnerType: number;
  RealObjectType: boolean;
}

export interface MFilesClass {
  ID: number;
  Name: string;
  NamePlural: string;
  ObjectType: number;
  Predefined: boolean;
  AssociatedPropertyDef?: number;
}

export interface MFilesPropertyDef {
  ID: number;
  Name: string;
  DataType: number;
  ValueList?: number;
  AutomaticValueType?: number;
  ContentType?: string;
}

export interface MFilesWorkflow {
  ID: number;
  Name: string;
  ObjectClass: number;
}

export interface MFilesWorkflowState {
  ID: number;
  Name: string;
  Workflow: number;
}

export interface MFilesValueListItem {
  ID: number;
  Name: string;
  DisplayID?: string;
  OwnerID?: number;
  ParentID?: number;
  ValueListID: number;
  Deleted: boolean;
}

export interface MFilesSearchCondition {
  ConditionType: number;
  Expression: {
    DataPropertyValuePropertyDef: number;
    DataStatusValueType?: number;
  };
  TypedValue: {
    DataType: number;
    Value?: unknown;
    Lookup?: MFilesLookup;
  };
}

export interface MFilesSearchQuery {
  SearchConditions?: MFilesSearchCondition[];
  ObjectTypeFilter?: number[];
}

/**
 * M-Files REST API client class
 */
export class MFilesClient {
  private serverUrl: string;
  private vaultGuid: string;
  private authToken: string;
  private baseUrl: string;

  constructor(config: MFilesClientConfig) {
    this.serverUrl = config.serverUrl;
    this.vaultGuid = config.vaultGuid;
    this.authToken = config.authToken;
    this.baseUrl = getVaultApiUrl(config.serverUrl, config.vaultGuid);
  }

  /**
   * Make authenticated request to M-Files API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        'X-Authentication': this.authToken,
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`M-Files API error: ${error}`);
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Get vault structure information
   */
  async getVaultStructure(): Promise<{
    objectTypes: MFilesObjectType[];
    classes: MFilesClass[];
    propertyDefs: MFilesPropertyDef[];
    workflows: MFilesWorkflow[];
  }> {
    const [objectTypes, classes, propertyDefs, workflows] = await Promise.all([
      this.getObjectTypes(),
      this.getClasses(),
      this.getPropertyDefinitions(),
      this.getWorkflows(),
    ]);

    return {
      objectTypes,
      classes,
      propertyDefs,
      workflows,
    };
  }

  /**
   * Get all object types in vault
   */
  async getObjectTypes(): Promise<MFilesObjectType[]> {
    return this.request<MFilesObjectType[]>('/structure/objecttypes');
  }

  /**
   * Get specific object type by ID
   */
  async getObjectType(objectTypeId: number): Promise<MFilesObjectType> {
    return this.request<MFilesObjectType>(`/structure/objecttypes/${objectTypeId}`);
  }

  /**
   * Get all classes in vault
   */
  async getClasses(): Promise<MFilesClass[]> {
    return this.request<MFilesClass[]>('/structure/classes');
  }

  /**
   * Get specific class by ID
   */
  async getClass(classId: number): Promise<MFilesClass> {
    return this.request<MFilesClass>(`/structure/classes/${classId}`);
  }

  /**
   * Get all property definitions in vault
   */
  async getPropertyDefinitions(): Promise<MFilesPropertyDef[]> {
    return this.request<MFilesPropertyDef[]>('/structure/properties');
  }

  /**
   * Get specific property definition by ID
   */
  async getPropertyDefinition(propertyDefId: number): Promise<MFilesPropertyDef> {
    return this.request<MFilesPropertyDef>(`/structure/properties/${propertyDefId}`);
  }

  /**
   * Get all workflows in vault
   */
  async getWorkflows(): Promise<MFilesWorkflow[]> {
    return this.request<MFilesWorkflow[]>('/structure/workflows');
  }

  /**
   * Get specific workflow by ID
   */
  async getWorkflow(workflowId: number): Promise<MFilesWorkflow> {
    return this.request<MFilesWorkflow>(`/structure/workflows/${workflowId}`);
  }

  /**
   * Get all workflow states for a workflow
   */
  async getWorkflowStates(workflowId: number): Promise<MFilesWorkflowState[]> {
    return this.request<MFilesWorkflowState[]>(`/structure/workflows/${workflowId}/states`);
  }

  /**
   * Get value list items
   */
  async getValueListItems(valueListId: number): Promise<MFilesValueListItem[]> {
    return this.request<MFilesValueListItem[]>(`/valuelists/${valueListId}/items`);
  }

  /**
   * Get objects by type with optional date filter
   */
  async getObjectsByType(
    objectTypeId: number,
    options: {
      modifiedSince?: Date;
      limit?: number;
    } = {}
  ): Promise<MFilesObjectVersion[]> {
    let endpoint = `/objects/${objectTypeId}`;
    const params = new URLSearchParams();

    if (options.limit) {
      params.append('limit', options.limit.toString());
    }

    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    const objects = await this.request<MFilesObjectVersion[]>(endpoint);

    // Filter by modified date if provided
    if (options.modifiedSince) {
      return objects.filter((obj) => {
        if (!obj.LastModifiedUtc) return false;
        return new Date(obj.LastModifiedUtc) >= options.modifiedSince!;
      });
    }

    return objects;
  }

  /**
   * Get specific object version
   */
  async getObject(
    objectTypeId: number,
    objectId: number,
    version?: number
  ): Promise<MFilesObjectVersion> {
    const versionPath = version !== undefined ? `/${version}` : '/latest';
    return this.request<MFilesObjectVersion>(
      `/objects/${objectTypeId}/${objectId}${versionPath}`
    );
  }

  /**
   * Get object version history
   */
  async getObjectVersions(
    objectTypeId: number,
    objectId: number
  ): Promise<MFilesObjectVersion[]> {
    return this.request<MFilesObjectVersion[]>(
      `/objects/${objectTypeId}/${objectId}/history`
    );
  }

  /**
   * Get object properties with full details
   */
  async getObjectProperties(
    objectTypeId: number,
    objectId: number,
    version?: number
  ): Promise<MFilesPropertyValue[]> {
    const versionPath = version !== undefined ? `/${version}` : '/latest';
    return this.request<MFilesPropertyValue[]>(
      `/objects/${objectTypeId}/${objectId}${versionPath}/properties`
    );
  }

  /**
   * Search objects using M-Files search conditions
   */
  async searchObjects(query: MFilesSearchQuery): Promise<MFilesObjectVersion[]> {
    return this.request<MFilesObjectVersion[]>('/objects', {
      method: 'POST',
      body: JSON.stringify(query),
    });
  }

  /**
   * Get recently modified objects across all types
   */
  async getRecentlyModifiedObjects(
    since?: Date,
    limit: number = 100
  ): Promise<MFilesObjectVersion[]> {
    const searchConditions: MFilesSearchCondition[] = [];

    if (since) {
      searchConditions.push({
        ConditionType: 1, // Equal or greater
        Expression: {
          DataPropertyValuePropertyDef: 21, // Last modified (built-in property)
        },
        TypedValue: {
          DataType: 5, // Date
          Value: since.toISOString(),
        },
      });
    }

    return this.searchObjects({
      SearchConditions: searchConditions,
    });
  }

  /**
   * Get file content URL
   */
  getFileDownloadUrl(
    objectTypeId: number,
    objectId: number,
    fileId: number,
    version?: number
  ): string {
    const versionPath = version !== undefined ? `/${version}` : '/latest';
    return `${this.baseUrl}/objects/${objectTypeId}/${objectId}${versionPath}/files/${fileId}/content`;
  }

  /**
   * Download file content
   */
  async downloadFile(
    objectTypeId: number,
    objectId: number,
    fileId: number,
    version?: number
  ): Promise<ArrayBuffer> {
    const url = this.getFileDownloadUrl(objectTypeId, objectId, fileId, version);

    const response = await fetch(url, {
      headers: {
        'X-Authentication': this.authToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Test connection to M-Files vault
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getObjectTypes();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get vault information
   */
  async getVaultInfo(): Promise<{
    Name: string;
    GUID: string;
    Version: string;
  }> {
    return this.request(`${this.serverUrl}/REST/server/vaults/${this.vaultGuid}`);
  }
}

/**
 * Create M-Files client instance
 */
export function createMFilesClient(config: MFilesClientConfig): MFilesClient {
  return new MFilesClient(config);
}
