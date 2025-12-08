/**
 * Odoo Module Discovery Service
 * Task: T043
 *
 * Discovers installed Odoo modules and available data models.
 * Enables dynamic connector configuration based on available features.
 */

import { OdooXmlRpcClient } from './xmlrpcClient';
import { OdooRestClient } from './restClient';

type OdooClient = OdooXmlRpcClient | OdooRestClient;

export interface OdooModule {
  id: number;
  name: string;
  displayName: string;
  summary?: string;
  state: 'installed' | 'uninstalled' | 'to_install' | 'to_upgrade' | 'to_remove';
  version?: string;
  category?: string;
}

export interface OdooModel {
  model: string;
  name: string;
  transient: boolean;
  fieldCount: number;
  accessRead: boolean;
  accessWrite: boolean;
  accessCreate: boolean;
  accessUnlink: boolean;
}

export interface ModuleDiscoveryResult {
  modules: OdooModule[];
  coreModules: string[];
  erpModules: string[];
  crmModules: string[];
  accountingModules: string[];
  inventoryModules: string[];
  hrModules: string[];
  websiteModules: string[];
  customModules: string[];
}

export interface ModelDiscoveryResult {
  models: OdooModel[];
  byCategory: Record<string, OdooModel[]>;
}

// Known Odoo module categories
const MODULE_CATEGORIES = {
  core: ['base', 'web', 'mail', 'auth_signup', 'bus', 'im_livechat'],
  erp: ['sale', 'purchase', 'stock', 'mrp', 'project', 'fleet'],
  crm: ['crm', 'contacts', 'calendar', 'helpdesk'],
  accounting: ['account', 'account_accountant', 'l10n_generic_coa', 'payment'],
  inventory: ['stock', 'stock_account', 'stock_landed_costs', 'product'],
  hr: ['hr', 'hr_expense', 'hr_holidays', 'hr_payroll', 'hr_recruitment'],
  website: ['website', 'website_sale', 'website_blog', 'website_forum'],
};

export class OdooModuleDiscovery {
  private client: OdooClient;

  constructor(client: OdooClient) {
    this.client = client;
  }

  /**
   * Discover all installed modules
   */
  async discoverModules(): Promise<ModuleDiscoveryResult> {
    const modules = await this.getInstalledModules();

    const moduleNames = modules.map((m) => m.name);

    return {
      modules,
      coreModules: moduleNames.filter((m) => MODULE_CATEGORIES.core.includes(m)),
      erpModules: moduleNames.filter((m) => MODULE_CATEGORIES.erp.includes(m)),
      crmModules: moduleNames.filter((m) => MODULE_CATEGORIES.crm.includes(m)),
      accountingModules: moduleNames.filter((m) =>
        MODULE_CATEGORIES.accounting.includes(m)
      ),
      inventoryModules: moduleNames.filter((m) =>
        MODULE_CATEGORIES.inventory.includes(m)
      ),
      hrModules: moduleNames.filter((m) => MODULE_CATEGORIES.hr.includes(m)),
      websiteModules: moduleNames.filter((m) =>
        MODULE_CATEGORIES.website.includes(m)
      ),
      customModules: moduleNames.filter(
        (m) =>
          !MODULE_CATEGORIES.core.includes(m) &&
          !MODULE_CATEGORIES.erp.includes(m) &&
          !MODULE_CATEGORIES.crm.includes(m) &&
          !MODULE_CATEGORIES.accounting.includes(m) &&
          !MODULE_CATEGORIES.inventory.includes(m) &&
          !MODULE_CATEGORIES.hr.includes(m) &&
          !MODULE_CATEGORIES.website.includes(m)
      ),
    };
  }

  /**
   * Get installed modules
   */
  async getInstalledModules(): Promise<OdooModule[]> {
    const modules = await this.client.searchRead<{
      id: number;
      name: string;
      shortdesc: string;
      summary: string;
      state: string;
      installed_version: string;
      category_id: [number, string] | false;
    }>('ir.module.module', [['state', '=', 'installed']], {
      fields: [
        'name',
        'shortdesc',
        'summary',
        'state',
        'installed_version',
        'category_id',
      ],
      order: 'name asc',
    });

    return modules.map((m) => ({
      id: m.id,
      name: m.name,
      displayName: m.shortdesc,
      summary: m.summary || undefined,
      state: m.state as OdooModule['state'],
      version: m.installed_version || undefined,
      category: m.category_id ? m.category_id[1] : undefined,
    }));
  }

  /**
   * Check if specific modules are installed
   */
  async hasModules(moduleNames: string[]): Promise<Record<string, boolean>> {
    const modules = await this.getInstalledModules();
    const installedNames = new Set(modules.map((m) => m.name));

    const result: Record<string, boolean> = {};
    for (const name of moduleNames) {
      result[name] = installedNames.has(name);
    }

    return result;
  }

  /**
   * Discover available models
   */
  async discoverModels(): Promise<ModelDiscoveryResult> {
    const models = await this.client.searchRead<{
      id: number;
      model: string;
      name: string;
      transient: boolean;
    }>('ir.model', [], {
      fields: ['model', 'name', 'transient'],
      order: 'model asc',
    });

    const odooModels: OdooModel[] = [];
    const byCategory: Record<string, OdooModel[]> = {};

    for (const m of models) {
      // Check access rights
      const access = await this.checkModelAccess(m.model);

      const model: OdooModel = {
        model: m.model,
        name: m.name,
        transient: m.transient,
        fieldCount: 0,
        ...access,
      };

      odooModels.push(model);

      // Categorize by model prefix
      const prefix = m.model.split('.')[0];
      if (!byCategory[prefix]) {
        byCategory[prefix] = [];
      }
      byCategory[prefix].push(model);
    }

    return { models: odooModels, byCategory };
  }

  /**
   * Check model access rights
   */
  async checkModelAccess(model: string): Promise<{
    accessRead: boolean;
    accessWrite: boolean;
    accessCreate: boolean;
    accessUnlink: boolean;
  }> {
    try {
      const rights = await this.client.call<[boolean, boolean, boolean, boolean]>(
        model,
        'check_access_rights',
        [],
        { operation: 'read', raise_exception: false }
      );

      // If we got a response, we have at least read access
      return {
        accessRead: true,
        accessWrite: await this.checkSingleAccess(model, 'write'),
        accessCreate: await this.checkSingleAccess(model, 'create'),
        accessUnlink: await this.checkSingleAccess(model, 'unlink'),
      };
    } catch {
      return {
        accessRead: false,
        accessWrite: false,
        accessCreate: false,
        accessUnlink: false,
      };
    }
  }

  /**
   * Check single access right
   */
  private async checkSingleAccess(
    model: string,
    operation: 'read' | 'write' | 'create' | 'unlink'
  ): Promise<boolean> {
    try {
      await this.client.call<boolean>(model, 'check_access_rights', [], {
        operation,
        raise_exception: false,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get model fields
   */
  async getModelFields(model: string): Promise<Record<string, {
    type: string;
    string: string;
    required: boolean;
    readonly: boolean;
    relation?: string;
    selection?: Array<[string, string]>;
  }>> {
    const fields = await this.client.call<Record<string, any>>(
      model,
      'fields_get',
      [],
      { attributes: ['type', 'string', 'required', 'readonly', 'relation', 'selection'] }
    );

    const result: Record<string, any> = {};
    for (const [name, info] of Object.entries(fields)) {
      result[name] = {
        type: info.type,
        string: info.string,
        required: info.required || false,
        readonly: info.readonly || false,
        relation: info.relation,
        selection: info.selection,
      };
    }

    return result;
  }

  /**
   * Get recommended modules for sync
   */
  async getRecommendedSyncModules(): Promise<{
    available: string[];
    recommended: string[];
    models: Record<string, string[]>;
  }> {
    const discovery = await this.discoverModules();

    const available = discovery.modules.map((m) => m.name);
    const recommended: string[] = [];
    const models: Record<string, string[]> = {};

    // Sales module
    if (available.includes('sale')) {
      recommended.push('sale');
      models.sale = ['sale.order', 'sale.order.line'];
    }

    // Purchase module
    if (available.includes('purchase')) {
      recommended.push('purchase');
      models.purchase = ['purchase.order', 'purchase.order.line'];
    }

    // Stock/Inventory module
    if (available.includes('stock')) {
      recommended.push('stock');
      models.stock = [
        'stock.picking',
        'stock.move',
        'stock.quant',
        'stock.warehouse',
        'stock.location',
      ];
    }

    // Accounting module
    if (available.includes('account')) {
      recommended.push('account');
      models.account = [
        'account.move',
        'account.move.line',
        'account.payment',
        'account.journal',
      ];
    }

    // CRM module
    if (available.includes('crm')) {
      recommended.push('crm');
      models.crm = ['crm.lead', 'crm.stage', 'crm.team'];
    }

    // Project module
    if (available.includes('project')) {
      recommended.push('project');
      models.project = ['project.project', 'project.task'];
    }

    // Always include contacts/partners
    models.base = ['res.partner', 'res.company', 'res.users'];

    // Products
    models.product = ['product.product', 'product.template', 'product.category'];

    return { available, recommended, models };
  }

  /**
   * Get sync statistics for a model
   */
  async getModelStats(model: string): Promise<{
    totalRecords: number;
    lastModified?: Date;
    oldestRecord?: Date;
  }> {
    try {
      const count = await this.client.searchCount(model, []);

      // Get most recent write_date
      const recent = await this.client.searchRead<{ write_date: string }>(
        model,
        [],
        { fields: ['write_date'], limit: 1, order: 'write_date desc' }
      );

      // Get oldest create_date
      const oldest = await this.client.searchRead<{ create_date: string }>(
        model,
        [],
        { fields: ['create_date'], limit: 1, order: 'create_date asc' }
      );

      return {
        totalRecords: count,
        lastModified: recent[0]?.write_date
          ? new Date(recent[0].write_date)
          : undefined,
        oldestRecord: oldest[0]?.create_date
          ? new Date(oldest[0].create_date)
          : undefined,
      };
    } catch {
      return { totalRecords: 0 };
    }
  }
}

/**
 * Create module discovery
 */
export function createOdooModuleDiscovery(
  client: OdooClient
): OdooModuleDiscovery {
  return new OdooModuleDiscovery(client);
}
