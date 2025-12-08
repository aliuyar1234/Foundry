/**
 * DATEV SKR Chart of Accounts
 * Task: T135
 *
 * Handles German standard chart of accounts (SKR03, SKR04).
 * Provides account mapping and categorization.
 */

import { DatevAccount } from './datevClient';

export interface SKRAccount {
  number: string;
  name: string;
  nameDe: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  category: string;
  categoryDe: string;
  subcategory?: string;
  subcategoryDe?: string;
  taxRelevant: boolean;
  defaultTaxCode?: string;
  elsterMapping?: string;
  balanceSheetPosition?: string;
  plPosition?: string;
}

export interface SKRMapping {
  skr03: string;
  skr04: string;
  name: string;
  nameDe: string;
}

export type SKRType = 'SKR03' | 'SKR04';

// SKR03 - Standard chart for commercial enterprises (Handelsunternehmen)
export const SKR03_ACCOUNTS: SKRAccount[] = [
  // Assets (Aktiva) - Class 0
  { number: '0010', name: 'Concessions', nameDe: 'Konzessionen', type: 'asset', category: 'Intangible Assets', categoryDe: 'Immaterielle Vermögensgegenstände', taxRelevant: false, balanceSheetPosition: 'A.I.1' },
  { number: '0027', name: 'Software', nameDe: 'EDV-Software', type: 'asset', category: 'Intangible Assets', categoryDe: 'Immaterielle Vermögensgegenstände', taxRelevant: false, balanceSheetPosition: 'A.I.2' },
  { number: '0200', name: 'Technical Equipment', nameDe: 'Technische Anlagen und Maschinen', type: 'asset', category: 'Fixed Assets', categoryDe: 'Sachanlagen', taxRelevant: false, balanceSheetPosition: 'A.II.2' },
  { number: '0320', name: 'Office Equipment', nameDe: 'Büroeinrichtung', type: 'asset', category: 'Fixed Assets', categoryDe: 'Sachanlagen', taxRelevant: false, balanceSheetPosition: 'A.II.3' },
  { number: '0410', name: 'Vehicles', nameDe: 'Fuhrpark', type: 'asset', category: 'Fixed Assets', categoryDe: 'Sachanlagen', taxRelevant: false, balanceSheetPosition: 'A.II.3' },
  { number: '0520', name: 'Bank', nameDe: 'Bank', type: 'asset', category: 'Financial Assets', categoryDe: 'Finanzanlagen', taxRelevant: false, balanceSheetPosition: 'A.III.3' },

  // Current Assets (Umlaufvermögen) - Class 1
  { number: '1000', name: 'Cash', nameDe: 'Kasse', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Liquid Assets', subcategoryDe: 'Liquide Mittel', taxRelevant: false, balanceSheetPosition: 'B.IV' },
  { number: '1200', name: 'Bank Account', nameDe: 'Bank', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Liquid Assets', subcategoryDe: 'Liquide Mittel', taxRelevant: false, balanceSheetPosition: 'B.IV' },
  { number: '1300', name: 'Post Office Giro', nameDe: 'Postbank', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Liquid Assets', subcategoryDe: 'Liquide Mittel', taxRelevant: false, balanceSheetPosition: 'B.IV' },
  { number: '1400', name: 'Trade Receivables', nameDe: 'Forderungen aus Lieferungen und Leistungen', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Receivables', subcategoryDe: 'Forderungen', taxRelevant: false, balanceSheetPosition: 'B.II.1' },
  { number: '1410', name: 'Doubtful Receivables', nameDe: 'Zweifelhafte Forderungen', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Receivables', subcategoryDe: 'Forderungen', taxRelevant: false, balanceSheetPosition: 'B.II.1' },
  { number: '1500', name: 'Input VAT', nameDe: 'Vorsteuer', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Other Receivables', subcategoryDe: 'Sonstige Forderungen', taxRelevant: true, defaultTaxCode: 'VSt19', balanceSheetPosition: 'B.II.4' },
  { number: '1571', name: 'Advance Payments', nameDe: 'Geleistete Anzahlungen', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Prepayments', subcategoryDe: 'Anzahlungen', taxRelevant: false, balanceSheetPosition: 'B.I.4' },

  // Liabilities (Passiva) - Class 3
  { number: '3300', name: 'Trade Payables', nameDe: 'Verbindlichkeiten aus Lieferungen und Leistungen', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: false, balanceSheetPosition: 'C.4' },
  { number: '3400', name: 'Received Advance Payments', nameDe: 'Erhaltene Anzahlungen', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: true, balanceSheetPosition: 'C.3' },
  { number: '3500', name: 'Output VAT', nameDe: 'Umsatzsteuer', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: true, defaultTaxCode: 'USt19', balanceSheetPosition: 'C.8' },
  { number: '3520', name: 'Payroll Taxes', nameDe: 'Lohnsteuer', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: true, balanceSheetPosition: 'C.8' },
  { number: '3600', name: 'Bank Loans', nameDe: 'Verbindlichkeiten gegenüber Kreditinstituten', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: false, balanceSheetPosition: 'C.2' },

  // Equity (Eigenkapital) - Class 8
  { number: '8000', name: 'Share Capital', nameDe: 'Gezeichnetes Kapital', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.I' },
  { number: '8100', name: 'Capital Reserve', nameDe: 'Kapitalrücklage', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.II' },
  { number: '8200', name: 'Retained Earnings', nameDe: 'Gewinnrücklagen', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.III' },
  { number: '8500', name: 'Profit/Loss Carried Forward', nameDe: 'Gewinn-/Verlustvortrag', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.IV' },
  { number: '8600', name: 'Annual Profit/Loss', nameDe: 'Jahresüberschuss/-fehlbetrag', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.V' },

  // Revenue (Erlöse) - Class 4
  { number: '4000', name: 'Revenue 19%', nameDe: 'Umsatzerlöse 19% USt', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, defaultTaxCode: 'USt19', elsterMapping: '81', plPosition: '1' },
  { number: '4100', name: 'Revenue 7%', nameDe: 'Umsatzerlöse 7% USt', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, defaultTaxCode: 'USt7', elsterMapping: '86', plPosition: '1' },
  { number: '4120', name: 'Revenue Export', nameDe: 'Steuerfreie Umsätze', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, defaultTaxCode: 'USt0', elsterMapping: '43', plPosition: '1' },
  { number: '4125', name: 'Intra-Community Revenue', nameDe: 'Innergemeinschaftliche Lieferungen', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, defaultTaxCode: 'ICE', elsterMapping: '41', plPosition: '1' },
  { number: '4200', name: 'Other Revenue', nameDe: 'Sonstige Erlöse', type: 'revenue', category: 'Other Income', categoryDe: 'Sonstige Erträge', taxRelevant: true, plPosition: '4' },

  // Expenses (Aufwendungen) - Class 5-7
  { number: '5000', name: 'Cost of Materials', nameDe: 'Wareneinsatz', type: 'expense', category: 'Cost of Sales', categoryDe: 'Materialaufwand', taxRelevant: true, plPosition: '5' },
  { number: '5100', name: 'Purchased Services', nameDe: 'Bezogene Leistungen', type: 'expense', category: 'Cost of Sales', categoryDe: 'Materialaufwand', taxRelevant: true, plPosition: '5' },
  { number: '6000', name: 'Wages', nameDe: 'Löhne', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '6' },
  { number: '6010', name: 'Salaries', nameDe: 'Gehälter', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '6' },
  { number: '6100', name: 'Social Security', nameDe: 'Sozialversicherungsbeiträge', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '6' },
  { number: '6200', name: 'Depreciation', nameDe: 'Abschreibungen', type: 'expense', category: 'Depreciation', categoryDe: 'Abschreibungen', taxRelevant: false, plPosition: '7' },
  { number: '6300', name: 'Rent', nameDe: 'Miete', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '8' },
  { number: '6400', name: 'Insurance', nameDe: 'Versicherungen', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: false, plPosition: '8' },
  { number: '6500', name: 'Vehicle Costs', nameDe: 'Fahrzeugkosten', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '8' },
  { number: '6600', name: 'Advertising', nameDe: 'Werbekosten', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '8' },
  { number: '6700', name: 'Travel Expenses', nameDe: 'Reisekosten', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '8' },
  { number: '6800', name: 'Phone/Internet', nameDe: 'Telefon/Internet', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '8' },
  { number: '6900', name: 'Office Supplies', nameDe: 'Bürobedarf', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '8' },
  { number: '7000', name: 'Professional Services', nameDe: 'Fremdleistungen', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '8' },
  { number: '7100', name: 'Legal/Consulting Fees', nameDe: 'Rechts- und Beratungskosten', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '8' },
  { number: '7300', name: 'Interest Expense', nameDe: 'Zinsaufwand', type: 'expense', category: 'Financial Expenses', categoryDe: 'Zinsaufwendungen', taxRelevant: false, plPosition: '13' },
  { number: '7600', name: 'Bank Fees', nameDe: 'Bankgebühren', type: 'expense', category: 'Financial Expenses', categoryDe: 'Zinsaufwendungen', taxRelevant: false, plPosition: '8' },
];

// SKR03 to SKR04 mapping for common accounts
export const SKR03_TO_SKR04_MAPPING: SKRMapping[] = [
  { skr03: '1000', skr04: '1600', name: 'Cash', nameDe: 'Kasse' },
  { skr03: '1200', skr04: '1800', name: 'Bank', nameDe: 'Bank' },
  { skr03: '1400', skr04: '1200', name: 'Trade Receivables', nameDe: 'Forderungen aus L+L' },
  { skr03: '3300', skr04: '3300', name: 'Trade Payables', nameDe: 'Verbindlichkeiten aus L+L' },
  { skr03: '4000', skr04: '4000', name: 'Revenue', nameDe: 'Umsatzerlöse' },
  { skr03: '6000', skr04: '6000', name: 'Wages', nameDe: 'Löhne' },
  { skr03: '6010', skr04: '6020', name: 'Salaries', nameDe: 'Gehälter' },
];

export class DatevSKRChartOfAccounts {
  private skrType: SKRType;
  private customAccounts: Map<string, SKRAccount> = new Map();

  constructor(skrType: SKRType = 'SKR03') {
    this.skrType = skrType;
  }

  /**
   * Get all accounts for current SKR type
   */
  getAllAccounts(): SKRAccount[] {
    // For now, we only have SKR03 fully implemented
    if (this.skrType === 'SKR03') {
      const accounts = [...SKR03_ACCOUNTS];
      for (const account of this.customAccounts.values()) {
        accounts.push(account);
      }
      return accounts;
    }

    // SKR04 would need separate implementation
    return [];
  }

  /**
   * Get account by number
   */
  getAccount(number: string): SKRAccount | undefined {
    if (this.customAccounts.has(number)) {
      return this.customAccounts.get(number);
    }

    return SKR03_ACCOUNTS.find((a) => a.number === number);
  }

  /**
   * Get accounts by type
   */
  getAccountsByType(type: SKRAccount['type']): SKRAccount[] {
    return this.getAllAccounts().filter((a) => a.type === type);
  }

  /**
   * Get accounts by category
   */
  getAccountsByCategory(category: string): SKRAccount[] {
    return this.getAllAccounts().filter(
      (a) => a.category === category || a.categoryDe === category
    );
  }

  /**
   * Get tax-relevant accounts
   */
  getTaxRelevantAccounts(): SKRAccount[] {
    return this.getAllAccounts().filter((a) => a.taxRelevant);
  }

  /**
   * Map account number between SKR03 and SKR04
   */
  mapAccountNumber(number: string, fromSkr: SKRType, toSkr: SKRType): string | undefined {
    const mapping = SKR03_TO_SKR04_MAPPING.find(
      (m) => (fromSkr === 'SKR03' ? m.skr03 : m.skr04) === number
    );

    if (!mapping) return undefined;

    return toSkr === 'SKR03' ? mapping.skr03 : mapping.skr04;
  }

  /**
   * Categorize DATEV accounts
   */
  categorizeAccounts(accounts: DatevAccount[]): Map<string, DatevAccount[]> {
    const categories = new Map<string, DatevAccount[]>();

    for (const account of accounts) {
      const skrAccount = this.getAccount(account.number);
      const category = skrAccount?.categoryDe || 'Sonstige';

      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(account);
    }

    return categories;
  }

  /**
   * Get balance sheet structure
   */
  getBalanceSheetStructure(): {
    assets: { position: string; name: string; nameDe: string; accounts: string[] }[];
    liabilities: { position: string; name: string; nameDe: string; accounts: string[] }[];
    equity: { position: string; name: string; nameDe: string; accounts: string[] }[];
  } {
    const structure = {
      assets: [
        { position: 'A.I', name: 'Intangible Assets', nameDe: 'Immaterielle Vermögensgegenstände', accounts: [] as string[] },
        { position: 'A.II', name: 'Fixed Assets', nameDe: 'Sachanlagen', accounts: [] as string[] },
        { position: 'A.III', name: 'Financial Assets', nameDe: 'Finanzanlagen', accounts: [] as string[] },
        { position: 'B.I', name: 'Inventory', nameDe: 'Vorräte', accounts: [] as string[] },
        { position: 'B.II', name: 'Receivables', nameDe: 'Forderungen', accounts: [] as string[] },
        { position: 'B.IV', name: 'Cash', nameDe: 'Liquide Mittel', accounts: [] as string[] },
      ],
      liabilities: [
        { position: 'C.1', name: 'Provisions', nameDe: 'Rückstellungen', accounts: [] as string[] },
        { position: 'C.2', name: 'Bank Loans', nameDe: 'Verbindlichkeiten gg. Kreditinstituten', accounts: [] as string[] },
        { position: 'C.4', name: 'Trade Payables', nameDe: 'Verbindlichkeiten aus L+L', accounts: [] as string[] },
        { position: 'C.8', name: 'Other Liabilities', nameDe: 'Sonstige Verbindlichkeiten', accounts: [] as string[] },
      ],
      equity: [
        { position: 'A.I', name: 'Share Capital', nameDe: 'Gezeichnetes Kapital', accounts: [] as string[] },
        { position: 'A.II', name: 'Capital Reserve', nameDe: 'Kapitalrücklage', accounts: [] as string[] },
        { position: 'A.III', name: 'Retained Earnings', nameDe: 'Gewinnrücklagen', accounts: [] as string[] },
        { position: 'A.V', name: 'Annual Result', nameDe: 'Jahresergebnis', accounts: [] as string[] },
      ],
    };

    // Map accounts to positions
    for (const account of this.getAllAccounts()) {
      if (!account.balanceSheetPosition) continue;

      let category: 'assets' | 'liabilities' | 'equity';
      if (account.type === 'asset') category = 'assets';
      else if (account.type === 'liability') category = 'liabilities';
      else if (account.type === 'equity') category = 'equity';
      else continue;

      const position = structure[category].find(
        (p) => account.balanceSheetPosition!.startsWith(p.position)
      );
      if (position) {
        position.accounts.push(account.number);
      }
    }

    return structure;
  }

  /**
   * Get P&L structure
   */
  getProfitLossStructure(): Array<{
    position: string;
    name: string;
    nameDe: string;
    accounts: string[];
    isSubtraction: boolean;
  }> {
    const structure = [
      { position: '1', name: 'Revenue', nameDe: 'Umsatzerlöse', accounts: [] as string[], isSubtraction: false },
      { position: '5', name: 'Cost of Materials', nameDe: 'Materialaufwand', accounts: [] as string[], isSubtraction: true },
      { position: '6', name: 'Personnel Expenses', nameDe: 'Personalaufwand', accounts: [] as string[], isSubtraction: true },
      { position: '7', name: 'Depreciation', nameDe: 'Abschreibungen', accounts: [] as string[], isSubtraction: true },
      { position: '8', name: 'Other Operating Expenses', nameDe: 'Sonstige betriebliche Aufwendungen', accounts: [] as string[], isSubtraction: true },
      { position: '4', name: 'Other Operating Income', nameDe: 'Sonstige betriebliche Erträge', accounts: [] as string[], isSubtraction: false },
      { position: '13', name: 'Interest Expense', nameDe: 'Zinsaufwendungen', accounts: [] as string[], isSubtraction: true },
    ];

    // Map accounts to positions
    for (const account of this.getAllAccounts()) {
      if (!account.plPosition) continue;

      const position = structure.find((p) => p.position === account.plPosition);
      if (position) {
        position.accounts.push(account.number);
      }
    }

    return structure;
  }

  /**
   * Add custom account
   */
  addCustomAccount(account: SKRAccount): void {
    this.customAccounts.set(account.number, account);
  }

  /**
   * Validate account number format
   */
  validateAccountNumber(number: string): boolean {
    // SKR03/04 accounts are typically 4 digits
    return /^\d{4}$/.test(number);
  }

  /**
   * Get account number range for type
   */
  getAccountNumberRange(type: SKRAccount['type']): { from: string; to: string } {
    // SKR03 ranges
    const ranges: Record<SKRAccount['type'], { from: string; to: string }> = {
      asset: { from: '0000', to: '1999' },
      liability: { from: '3000', to: '3999' },
      equity: { from: '8000', to: '8999' },
      revenue: { from: '4000', to: '4999' },
      expense: { from: '5000', to: '7999' },
    };

    return ranges[type];
  }
}

/**
 * Create SKR chart of accounts handler
 */
export function createSKRChartOfAccounts(skrType: SKRType = 'SKR03'): DatevSKRChartOfAccounts {
  return new DatevSKRChartOfAccounts(skrType);
}
