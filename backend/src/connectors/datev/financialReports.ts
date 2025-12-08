/**
 * DATEV Financial Reports
 * Task: T139
 *
 * Generates balance sheet (Bilanz) and profit & loss (GuV) reports.
 * Supports German accounting standards (HGB).
 */

import { DatevClient, DatevAccount, DatevJournalEntry } from './datevClient';
import { DatevSKRChartOfAccounts, SKRAccount, SKR03_ACCOUNTS } from './skrChartOfAccounts';

export interface BalanceSheetReport {
  reportDate: Date;
  period: string;
  currency: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

export interface BalanceSheetSection {
  name: string;
  nameDe: string;
  total: number;
  items: BalanceSheetItem[];
}

export interface BalanceSheetItem {
  position: string;
  name: string;
  nameDe: string;
  amount: number;
  previousAmount?: number;
  children?: BalanceSheetItem[];
  accounts?: string[];
}

export interface ProfitLossReport {
  dateFrom: Date;
  dateTo: Date;
  period: string;
  currency: string;
  revenue: ProfitLossSection;
  costOfSales: ProfitLossSection;
  grossProfit: number;
  operatingExpenses: ProfitLossSection;
  operatingProfit: number;
  financialResult: ProfitLossSection;
  profitBeforeTax: number;
  taxes: ProfitLossSection;
  netProfit: number;
  ebitda?: number;
}

export interface ProfitLossSection {
  name: string;
  nameDe: string;
  total: number;
  items: ProfitLossItem[];
}

export interface ProfitLossItem {
  position: string;
  name: string;
  nameDe: string;
  amount: number;
  previousAmount?: number;
  percentage?: number;
  accounts?: string[];
}

export interface FinancialRatios {
  // Liquidity ratios
  currentRatio: number;
  quickRatio: number;
  cashRatio: number;

  // Profitability ratios
  grossProfitMargin: number;
  operatingProfitMargin: number;
  netProfitMargin: number;
  returnOnAssets: number;
  returnOnEquity: number;

  // Leverage ratios
  debtRatio: number;
  debtToEquityRatio: number;
  equityRatio: number;

  // Efficiency ratios
  assetTurnover: number;
  receivablesDays: number;
  payablesDays: number;
}

export interface ReportOptions {
  organizationId: string;
  dateFrom: Date;
  dateTo: Date;
  comparePreviousPeriod?: boolean;
  currency?: string;
}

export class DatevFinancialReports {
  private client: DatevClient;
  private skr: DatevSKRChartOfAccounts;
  private accountBalances: Map<string, number> = new Map();

  constructor(client: DatevClient) {
    this.client = client;
    this.skr = new DatevSKRChartOfAccounts('SKR03');
  }

  /**
   * Generate balance sheet
   */
  async generateBalanceSheet(options: ReportOptions): Promise<BalanceSheetReport> {
    // Load account balances
    await this.loadAccountBalances(options);

    const currency = options.currency || 'EUR';

    // Build asset section
    const assets = this.buildBalanceSheetAssets();

    // Build liability section
    const liabilities = this.buildBalanceSheetLiabilities();

    // Build equity section
    const equity = this.buildBalanceSheetEquity();

    // Calculate totals
    const totalAssets = assets.total;
    const totalLiabilitiesAndEquity = liabilities.total + equity.total;

    return {
      reportDate: options.dateTo,
      period: `${options.dateFrom.toISOString().split('T')[0]} - ${options.dateTo.toISOString().split('T')[0]}`,
      currency,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilitiesAndEquity,
      isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    };
  }

  /**
   * Generate profit & loss statement
   */
  async generateProfitLoss(options: ReportOptions): Promise<ProfitLossReport> {
    // Load account movements
    await this.loadAccountMovements(options);

    const currency = options.currency || 'EUR';

    // Build revenue section
    const revenue = this.buildRevenueSection();

    // Build cost of sales section
    const costOfSales = this.buildCostOfSalesSection();

    // Calculate gross profit
    const grossProfit = revenue.total - costOfSales.total;

    // Build operating expenses section
    const operatingExpenses = this.buildOperatingExpensesSection();

    // Calculate operating profit
    const operatingProfit = grossProfit - operatingExpenses.total;

    // Build financial result section
    const financialResult = this.buildFinancialResultSection();

    // Calculate profit before tax
    const profitBeforeTax = operatingProfit + financialResult.total;

    // Build taxes section
    const taxes = this.buildTaxesSection();

    // Calculate net profit
    const netProfit = profitBeforeTax - taxes.total;

    // Calculate EBITDA (add back depreciation)
    const depreciation = this.getAccountBalance('6200');
    const ebitda = operatingProfit + depreciation;

    return {
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      period: `${options.dateFrom.toISOString().split('T')[0]} - ${options.dateTo.toISOString().split('T')[0]}`,
      currency,
      revenue,
      costOfSales,
      grossProfit,
      operatingExpenses,
      operatingProfit,
      financialResult,
      profitBeforeTax,
      taxes,
      netProfit,
      ebitda,
    };
  }

  /**
   * Calculate financial ratios
   */
  async calculateFinancialRatios(options: ReportOptions): Promise<FinancialRatios> {
    const balanceSheet = await this.generateBalanceSheet(options);
    const profitLoss = await this.generateProfitLoss(options);

    // Get key balance sheet figures
    const currentAssets = this.sumAccountRange('1000', '1999');
    const inventory = this.sumAccountRange('1500', '1599');
    const cash = this.getAccountBalance('1000') + this.getAccountBalance('1200');
    const currentLiabilities = this.sumAccountRange('3000', '3499');
    const totalDebt = balanceSheet.liabilities.total;
    const totalEquity = balanceSheet.equity.total;
    const totalAssets = balanceSheet.totalAssets;
    const receivables = this.getAccountBalance('1400');
    const payables = this.getAccountBalance('3300');

    // Get key P&L figures
    const revenue = profitLoss.revenue.total;

    return {
      // Liquidity ratios
      currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : 0,
      quickRatio: currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0,
      cashRatio: currentLiabilities > 0 ? cash / currentLiabilities : 0,

      // Profitability ratios
      grossProfitMargin: revenue > 0 ? (profitLoss.grossProfit / revenue) * 100 : 0,
      operatingProfitMargin: revenue > 0 ? (profitLoss.operatingProfit / revenue) * 100 : 0,
      netProfitMargin: revenue > 0 ? (profitLoss.netProfit / revenue) * 100 : 0,
      returnOnAssets: totalAssets > 0 ? (profitLoss.netProfit / totalAssets) * 100 : 0,
      returnOnEquity: totalEquity > 0 ? (profitLoss.netProfit / totalEquity) * 100 : 0,

      // Leverage ratios
      debtRatio: totalAssets > 0 ? (totalDebt / totalAssets) * 100 : 0,
      debtToEquityRatio: totalEquity > 0 ? totalDebt / totalEquity : 0,
      equityRatio: totalAssets > 0 ? (totalEquity / totalAssets) * 100 : 0,

      // Efficiency ratios
      assetTurnover: totalAssets > 0 ? revenue / totalAssets : 0,
      receivablesDays: revenue > 0 ? (receivables / revenue) * 365 : 0,
      payablesDays: profitLoss.costOfSales.total > 0 ? (payables / profitLoss.costOfSales.total) * 365 : 0,
    };
  }

  /**
   * Load account balances from DATEV
   */
  private async loadAccountBalances(options: ReportOptions): Promise<void> {
    this.accountBalances.clear();

    try {
      const accounts = await this.client.getAccounts();

      for (const account of accounts) {
        this.accountBalances.set(account.number, account.balance);
      }
    } catch (error) {
      console.warn('Failed to load account balances:', error);
    }
  }

  /**
   * Load account movements (for P&L)
   */
  private async loadAccountMovements(options: ReportOptions): Promise<void> {
    this.accountBalances.clear();

    try {
      const entries = await this.client.getAllJournalEntries({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });

      for (const entry of entries) {
        const current = this.accountBalances.get(entry.accountNumber) || 0;
        this.accountBalances.set(entry.accountNumber, current + entry.amount);
      }
    } catch (error) {
      console.warn('Failed to load account movements:', error);
    }
  }

  /**
   * Get account balance
   */
  private getAccountBalance(accountNumber: string): number {
    return this.accountBalances.get(accountNumber) || 0;
  }

  /**
   * Sum account range
   */
  private sumAccountRange(from: string, to: string): number {
    let total = 0;

    for (const [number, balance] of this.accountBalances) {
      if (number >= from && number <= to) {
        total += balance;
      }
    }

    return total;
  }

  /**
   * Build balance sheet assets section
   */
  private buildBalanceSheetAssets(): BalanceSheetSection {
    const items: BalanceSheetItem[] = [
      {
        position: 'A',
        name: 'Fixed Assets',
        nameDe: 'Anlagevermögen',
        amount: 0,
        children: [
          {
            position: 'A.I',
            name: 'Intangible Assets',
            nameDe: 'Immaterielle Vermögensgegenstände',
            amount: this.sumAccountRange('0000', '0099'),
          },
          {
            position: 'A.II',
            name: 'Tangible Assets',
            nameDe: 'Sachanlagen',
            amount: this.sumAccountRange('0100', '0499'),
          },
          {
            position: 'A.III',
            name: 'Financial Assets',
            nameDe: 'Finanzanlagen',
            amount: this.sumAccountRange('0500', '0799'),
          },
        ],
      },
      {
        position: 'B',
        name: 'Current Assets',
        nameDe: 'Umlaufvermögen',
        amount: 0,
        children: [
          {
            position: 'B.I',
            name: 'Inventory',
            nameDe: 'Vorräte',
            amount: this.sumAccountRange('1500', '1599'),
          },
          {
            position: 'B.II',
            name: 'Receivables',
            nameDe: 'Forderungen',
            amount: this.sumAccountRange('1400', '1499'),
          },
          {
            position: 'B.IV',
            name: 'Cash and Bank',
            nameDe: 'Liquide Mittel',
            amount: this.getAccountBalance('1000') + this.getAccountBalance('1200') + this.getAccountBalance('1300'),
          },
        ],
      },
    ];

    // Calculate totals
    for (const item of items) {
      if (item.children) {
        item.amount = item.children.reduce((sum, child) => sum + child.amount, 0);
      }
    }

    const total = items.reduce((sum, item) => sum + item.amount, 0);

    return {
      name: 'Assets',
      nameDe: 'Aktiva',
      total,
      items,
    };
  }

  /**
   * Build balance sheet liabilities section
   */
  private buildBalanceSheetLiabilities(): BalanceSheetSection {
    const items: BalanceSheetItem[] = [
      {
        position: 'C.1',
        name: 'Provisions',
        nameDe: 'Rückstellungen',
        amount: this.sumAccountRange('3000', '3099'),
      },
      {
        position: 'C.2',
        name: 'Bank Loans',
        nameDe: 'Verbindlichkeiten gegenüber Kreditinstituten',
        amount: this.sumAccountRange('3600', '3699'),
      },
      {
        position: 'C.4',
        name: 'Trade Payables',
        nameDe: 'Verbindlichkeiten aus Lieferungen und Leistungen',
        amount: this.getAccountBalance('3300'),
      },
      {
        position: 'C.8',
        name: 'Other Liabilities',
        nameDe: 'Sonstige Verbindlichkeiten',
        amount: this.sumAccountRange('3400', '3599'),
      },
    ];

    const total = items.reduce((sum, item) => sum + Math.abs(item.amount), 0);

    return {
      name: 'Liabilities',
      nameDe: 'Verbindlichkeiten',
      total,
      items,
    };
  }

  /**
   * Build balance sheet equity section
   */
  private buildBalanceSheetEquity(): BalanceSheetSection {
    const items: BalanceSheetItem[] = [
      {
        position: 'A.I',
        name: 'Share Capital',
        nameDe: 'Gezeichnetes Kapital',
        amount: Math.abs(this.getAccountBalance('8000')),
      },
      {
        position: 'A.II',
        name: 'Capital Reserve',
        nameDe: 'Kapitalrücklage',
        amount: Math.abs(this.getAccountBalance('8100')),
      },
      {
        position: 'A.III',
        name: 'Retained Earnings',
        nameDe: 'Gewinnrücklagen',
        amount: Math.abs(this.getAccountBalance('8200')),
      },
      {
        position: 'A.IV',
        name: 'Profit/Loss Carried Forward',
        nameDe: 'Gewinn-/Verlustvortrag',
        amount: this.getAccountBalance('8500'),
      },
      {
        position: 'A.V',
        name: 'Annual Result',
        nameDe: 'Jahresergebnis',
        amount: this.getAccountBalance('8600'),
      },
    ];

    const total = items.reduce((sum, item) => sum + item.amount, 0);

    return {
      name: 'Equity',
      nameDe: 'Eigenkapital',
      total,
      items,
    };
  }

  /**
   * Build revenue section for P&L
   */
  private buildRevenueSection(): ProfitLossSection {
    const items: ProfitLossItem[] = [
      {
        position: '1',
        name: 'Revenue',
        nameDe: 'Umsatzerlöse',
        amount: Math.abs(this.sumAccountRange('4000', '4199')),
      },
      {
        position: '2',
        name: 'Other Operating Income',
        nameDe: 'Sonstige betriebliche Erträge',
        amount: Math.abs(this.sumAccountRange('4200', '4999')),
      },
    ];

    const total = items.reduce((sum, item) => sum + item.amount, 0);

    return {
      name: 'Revenue',
      nameDe: 'Erträge',
      total,
      items,
    };
  }

  /**
   * Build cost of sales section for P&L
   */
  private buildCostOfSalesSection(): ProfitLossSection {
    const items: ProfitLossItem[] = [
      {
        position: '5',
        name: 'Cost of Materials',
        nameDe: 'Materialaufwand',
        amount: Math.abs(this.sumAccountRange('5000', '5199')),
      },
      {
        position: '5a',
        name: 'Purchased Services',
        nameDe: 'Bezogene Leistungen',
        amount: Math.abs(this.sumAccountRange('5100', '5199')),
      },
    ];

    const total = items.reduce((sum, item) => sum + item.amount, 0);

    return {
      name: 'Cost of Sales',
      nameDe: 'Materialaufwand',
      total,
      items,
    };
  }

  /**
   * Build operating expenses section for P&L
   */
  private buildOperatingExpensesSection(): ProfitLossSection {
    const items: ProfitLossItem[] = [
      {
        position: '6',
        name: 'Personnel Expenses',
        nameDe: 'Personalaufwand',
        amount: Math.abs(this.sumAccountRange('6000', '6199')),
      },
      {
        position: '7',
        name: 'Depreciation',
        nameDe: 'Abschreibungen',
        amount: Math.abs(this.sumAccountRange('6200', '6299')),
      },
      {
        position: '8',
        name: 'Other Operating Expenses',
        nameDe: 'Sonstige betriebliche Aufwendungen',
        amount: Math.abs(this.sumAccountRange('6300', '6999')),
      },
    ];

    const total = items.reduce((sum, item) => sum + item.amount, 0);

    return {
      name: 'Operating Expenses',
      nameDe: 'Betriebliche Aufwendungen',
      total,
      items,
    };
  }

  /**
   * Build financial result section for P&L
   */
  private buildFinancialResultSection(): ProfitLossSection {
    const interestIncome = Math.abs(this.sumAccountRange('7200', '7299'));
    const interestExpense = Math.abs(this.sumAccountRange('7300', '7399'));

    const items: ProfitLossItem[] = [
      {
        position: '12',
        name: 'Interest Income',
        nameDe: 'Zinserträge',
        amount: interestIncome,
      },
      {
        position: '13',
        name: 'Interest Expense',
        nameDe: 'Zinsaufwendungen',
        amount: -interestExpense,
      },
    ];

    const total = interestIncome - interestExpense;

    return {
      name: 'Financial Result',
      nameDe: 'Finanzergebnis',
      total,
      items,
    };
  }

  /**
   * Build taxes section for P&L
   */
  private buildTaxesSection(): ProfitLossSection {
    const items: ProfitLossItem[] = [
      {
        position: '14',
        name: 'Income Tax',
        nameDe: 'Steuern vom Einkommen und Ertrag',
        amount: Math.abs(this.sumAccountRange('7700', '7799')),
      },
    ];

    const total = items.reduce((sum, item) => sum + item.amount, 0);

    return {
      name: 'Taxes',
      nameDe: 'Steuern',
      total,
      items,
    };
  }
}

/**
 * Create financial reports generator
 */
export function createFinancialReports(client: DatevClient): DatevFinancialReports {
  return new DatevFinancialReports(client);
}
