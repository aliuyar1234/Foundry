/**
 * Austrian Chart of Accounts Mapper
 * Task: T149
 *
 * Handles Austrian standard chart of accounts (EKR - Einheitskontenrahmen).
 * Provides account mapping, categorization, and Austrian VAT handling.
 */

import { BmdAccount } from './bmdClient';

export interface EKRAccount {
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
  balanceSheetPosition?: string;
  plPosition?: string;
}

export interface AustrianTaxCode {
  code: string;
  name: string;
  nameDe: string;
  rate: number;
  type: 'input' | 'output';
}

export type ChartType = 'EKR' | 'RLG';

// Austrian VAT rates
export const AUSTRIAN_TAX_CODES: AustrianTaxCode[] = [
  { code: 'VSt20', name: 'Input VAT 20%', nameDe: 'Vorsteuer 20%', rate: 20, type: 'input' },
  { code: 'VSt13', name: 'Input VAT 13%', nameDe: 'Vorsteuer 13%', rate: 13, type: 'input' },
  { code: 'VSt10', name: 'Input VAT 10%', nameDe: 'Vorsteuer 10%', rate: 10, type: 'input' },
  { code: 'USt20', name: 'Output VAT 20%', nameDe: 'Umsatzsteuer 20%', rate: 20, type: 'output' },
  { code: 'USt13', name: 'Output VAT 13%', nameDe: 'Umsatzsteuer 13%', rate: 13, type: 'output' },
  { code: 'USt10', name: 'Output VAT 10%', nameDe: 'Umsatzsteuer 10%', rate: 10, type: 'output' },
  { code: 'USt0', name: 'Tax-Free', nameDe: 'Steuerfrei', rate: 0, type: 'output' },
  { code: 'IGE', name: 'Intra-Community Supply', nameDe: 'Innergemeinschaftliche Lieferung', rate: 0, type: 'output' },
  { code: 'IGE13b', name: 'Reverse Charge', nameDe: 'Reverse Charge § 13b', rate: 0, type: 'input' },
];

// EKR (Einheitskontenrahmen) - Standard Austrian chart of accounts
export const EKR_ACCOUNTS: EKRAccount[] = [
  // Class 0: Fixed Assets (Anlagevermögen)
  { number: '0010', name: 'Concessions', nameDe: 'Konzessionen', type: 'asset', category: 'Intangible Assets', categoryDe: 'Immaterielle Vermögensgegenstände', taxRelevant: false, balanceSheetPosition: 'A.I.1' },
  { number: '0020', name: 'Patents and Licenses', nameDe: 'Patente und Lizenzen', type: 'asset', category: 'Intangible Assets', categoryDe: 'Immaterielle Vermögensgegenstände', taxRelevant: false, balanceSheetPosition: 'A.I.2' },
  { number: '0027', name: 'Software', nameDe: 'EDV-Software', type: 'asset', category: 'Intangible Assets', categoryDe: 'Immaterielle Vermögensgegenstände', taxRelevant: false, balanceSheetPosition: 'A.I.3' },
  { number: '0030', name: 'Goodwill', nameDe: 'Firmenwert', type: 'asset', category: 'Intangible Assets', categoryDe: 'Immaterielle Vermögensgegenstände', taxRelevant: false, balanceSheetPosition: 'A.I.4' },
  { number: '0100', name: 'Land', nameDe: 'Grundstücke', type: 'asset', category: 'Fixed Assets', categoryDe: 'Sachanlagen', taxRelevant: false, balanceSheetPosition: 'A.II.1' },
  { number: '0120', name: 'Buildings', nameDe: 'Gebäude', type: 'asset', category: 'Fixed Assets', categoryDe: 'Sachanlagen', taxRelevant: false, balanceSheetPosition: 'A.II.2' },
  { number: '0200', name: 'Technical Equipment', nameDe: 'Technische Anlagen und Maschinen', type: 'asset', category: 'Fixed Assets', categoryDe: 'Sachanlagen', taxRelevant: false, balanceSheetPosition: 'A.II.3' },
  { number: '0300', name: 'Other Equipment', nameDe: 'Andere Anlagen, Betriebs- und Geschäftsausstattung', type: 'asset', category: 'Fixed Assets', categoryDe: 'Sachanlagen', taxRelevant: false, balanceSheetPosition: 'A.II.4' },
  { number: '0320', name: 'Office Equipment', nameDe: 'Büroeinrichtung', type: 'asset', category: 'Fixed Assets', categoryDe: 'Sachanlagen', taxRelevant: false, balanceSheetPosition: 'A.II.4' },
  { number: '0400', name: 'Vehicles', nameDe: 'Fuhrpark', type: 'asset', category: 'Fixed Assets', categoryDe: 'Sachanlagen', taxRelevant: false, balanceSheetPosition: 'A.II.4' },
  { number: '0500', name: 'Shares in Affiliated Companies', nameDe: 'Anteile an verbundenen Unternehmen', type: 'asset', category: 'Financial Assets', categoryDe: 'Finanzanlagen', taxRelevant: false, balanceSheetPosition: 'A.III.1' },
  { number: '0600', name: 'Long-term Securities', nameDe: 'Wertpapiere des Anlagevermögens', type: 'asset', category: 'Financial Assets', categoryDe: 'Finanzanlagen', taxRelevant: false, balanceSheetPosition: 'A.III.3' },

  // Class 1: Inventory/Stock (Vorräte)
  { number: '1000', name: 'Raw Materials', nameDe: 'Roh-, Hilfs- und Betriebsstoffe', type: 'asset', category: 'Inventory', categoryDe: 'Vorräte', subcategory: 'Materials', subcategoryDe: 'Werkstoffe', taxRelevant: false, balanceSheetPosition: 'B.I.1' },
  { number: '1100', name: 'Merchandise', nameDe: 'Waren', type: 'asset', category: 'Inventory', categoryDe: 'Vorräte', subcategory: 'Goods', subcategoryDe: 'Handelswaren', taxRelevant: false, balanceSheetPosition: 'B.I.3' },
  { number: '1200', name: 'Work in Progress', nameDe: 'Unfertige Erzeugnisse', type: 'asset', category: 'Inventory', categoryDe: 'Vorräte', subcategory: 'WIP', subcategoryDe: 'Unfertige Erzeugnisse', taxRelevant: false, balanceSheetPosition: 'B.I.2' },
  { number: '1300', name: 'Finished Goods', nameDe: 'Fertige Erzeugnisse', type: 'asset', category: 'Inventory', categoryDe: 'Vorräte', subcategory: 'Products', subcategoryDe: 'Fertigerzeugnisse', taxRelevant: false, balanceSheetPosition: 'B.I.2' },
  { number: '1400', name: 'Advance Payments on Inventory', nameDe: 'Geleistete Anzahlungen auf Vorräte', type: 'asset', category: 'Inventory', categoryDe: 'Vorräte', subcategory: 'Prepayments', subcategoryDe: 'Anzahlungen', taxRelevant: false, balanceSheetPosition: 'B.I.4' },

  // Class 2: Receivables (Forderungen)
  { number: '2000', name: 'Trade Receivables', nameDe: 'Forderungen aus Lieferungen und Leistungen', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Receivables', subcategoryDe: 'Forderungen', taxRelevant: false, balanceSheetPosition: 'B.II.1' },
  { number: '2010', name: 'Doubtful Receivables', nameDe: 'Zweifelhafte Forderungen', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Receivables', subcategoryDe: 'Forderungen', taxRelevant: false, balanceSheetPosition: 'B.II.1' },
  { number: '2100', name: 'Receivables from Affiliated Companies', nameDe: 'Forderungen gegen verbundene Unternehmen', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Receivables', subcategoryDe: 'Forderungen', taxRelevant: false, balanceSheetPosition: 'B.II.2' },
  { number: '2300', name: 'Other Receivables', nameDe: 'Sonstige Forderungen', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Receivables', subcategoryDe: 'Forderungen', taxRelevant: false, balanceSheetPosition: 'B.II.4' },
  { number: '2500', name: 'Input VAT 20%', nameDe: 'Vorsteuer 20%', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Tax Receivables', subcategoryDe: 'Steuerforderungen', taxRelevant: true, defaultTaxCode: 'VSt20', balanceSheetPosition: 'B.II.4' },
  { number: '2510', name: 'Input VAT 13%', nameDe: 'Vorsteuer 13%', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Tax Receivables', subcategoryDe: 'Steuerforderungen', taxRelevant: true, defaultTaxCode: 'VSt13', balanceSheetPosition: 'B.II.4' },
  { number: '2520', name: 'Input VAT 10%', nameDe: 'Vorsteuer 10%', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Tax Receivables', subcategoryDe: 'Steuerforderungen', taxRelevant: true, defaultTaxCode: 'VSt10', balanceSheetPosition: 'B.II.4' },
  { number: '2600', name: 'Prepaid Expenses', nameDe: 'Rechnungsabgrenzungsposten (aktiv)', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Prepayments', subcategoryDe: 'Rechnungsabgrenzung', taxRelevant: false, balanceSheetPosition: 'C' },

  // Class 3: Cash/Bank (Kassa, Bank)
  { number: '2700', name: 'Cash', nameDe: 'Kassa', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Liquid Assets', subcategoryDe: 'Liquide Mittel', taxRelevant: false, balanceSheetPosition: 'B.IV' },
  { number: '2800', name: 'Bank Account', nameDe: 'Bank', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Liquid Assets', subcategoryDe: 'Liquide Mittel', taxRelevant: false, balanceSheetPosition: 'B.IV' },
  { number: '2810', name: 'Postal Account', nameDe: 'Postsparkasse', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Liquid Assets', subcategoryDe: 'Liquide Mittel', taxRelevant: false, balanceSheetPosition: 'B.IV' },
  { number: '2900', name: 'Short-term Securities', nameDe: 'Wertpapiere des Umlaufvermögens', type: 'asset', category: 'Current Assets', categoryDe: 'Umlaufvermögen', subcategory: 'Securities', subcategoryDe: 'Wertpapiere', taxRelevant: false, balanceSheetPosition: 'B.III' },

  // Class 4: Equity/Provisions (Eigenkapital, Rückstellungen)
  { number: '3000', name: 'Trade Payables', nameDe: 'Verbindlichkeiten aus Lieferungen und Leistungen', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: false, balanceSheetPosition: 'C.5' },
  { number: '3100', name: 'Payables to Affiliated Companies', nameDe: 'Verbindlichkeiten gegenüber verbundenen Unternehmen', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: false, balanceSheetPosition: 'C.6' },
  { number: '3200', name: 'Received Advance Payments', nameDe: 'Erhaltene Anzahlungen', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: true, balanceSheetPosition: 'C.4' },
  { number: '3300', name: 'Bank Loans', nameDe: 'Verbindlichkeiten gegenüber Kreditinstituten', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: false, balanceSheetPosition: 'C.2' },
  { number: '3400', name: 'Long-term Loans', nameDe: 'Langfristige Verbindlichkeiten', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: false, balanceSheetPosition: 'C.3' },
  { number: '3500', name: 'Output VAT 20%', nameDe: 'Umsatzsteuer 20%', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: true, defaultTaxCode: 'USt20', balanceSheetPosition: 'C.9' },
  { number: '3510', name: 'Output VAT 13%', nameDe: 'Umsatzsteuer 13%', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: true, defaultTaxCode: 'USt13', balanceSheetPosition: 'C.9' },
  { number: '3520', name: 'Output VAT 10%', nameDe: 'Umsatzsteuer 10%', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: true, defaultTaxCode: 'USt10', balanceSheetPosition: 'C.9' },
  { number: '3550', name: 'VAT Payable', nameDe: 'Umsatzsteuer-Zahllast', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: true, balanceSheetPosition: 'C.9' },
  { number: '3600', name: 'Payroll Taxes', nameDe: 'Lohnsteuer', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: true, balanceSheetPosition: 'C.9' },
  { number: '3610', name: 'Social Security Payable', nameDe: 'Sozialversicherungsbeiträge', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: false, balanceSheetPosition: 'C.9' },
  { number: '3700', name: 'Other Payables', nameDe: 'Sonstige Verbindlichkeiten', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: false, balanceSheetPosition: 'C.9' },
  { number: '3800', name: 'Accrued Expenses', nameDe: 'Rechnungsabgrenzungsposten (passiv)', type: 'liability', category: 'Liabilities', categoryDe: 'Verbindlichkeiten', taxRelevant: false, balanceSheetPosition: 'D' },
  { number: '3900', name: 'Provisions', nameDe: 'Rückstellungen', type: 'liability', category: 'Provisions', categoryDe: 'Rückstellungen', taxRelevant: false, balanceSheetPosition: 'B' },
  { number: '3910', name: 'Tax Provisions', nameDe: 'Steuerrückstellungen', type: 'liability', category: 'Provisions', categoryDe: 'Rückstellungen', taxRelevant: false, balanceSheetPosition: 'B.1' },
  { number: '3920', name: 'Pension Provisions', nameDe: 'Pensionsrückstellungen', type: 'liability', category: 'Provisions', categoryDe: 'Rückstellungen', taxRelevant: false, balanceSheetPosition: 'B.2' },
  { number: '3930', name: 'Severance Pay Provisions', nameDe: 'Abfertigungsrückstellungen', type: 'liability', category: 'Provisions', categoryDe: 'Rückstellungen', taxRelevant: false, balanceSheetPosition: 'B.3' },

  // Equity
  { number: '9000', name: 'Share Capital', nameDe: 'Grundkapital/Stammkapital', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.I' },
  { number: '9100', name: 'Capital Reserve', nameDe: 'Kapitalrücklage', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.II' },
  { number: '9200', name: 'Retained Earnings', nameDe: 'Gewinnrücklagen', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.III' },
  { number: '9300', name: 'Profit/Loss Carried Forward', nameDe: 'Gewinn-/Verlustvortrag', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.IV' },
  { number: '9500', name: 'Annual Profit/Loss', nameDe: 'Jahresüberschuss/-fehlbetrag', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.V' },
  { number: '9600', name: 'Private Withdrawals', nameDe: 'Privatentnahmen', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.IV' },
  { number: '9700', name: 'Private Deposits', nameDe: 'Privateinlagen', type: 'equity', category: 'Equity', categoryDe: 'Eigenkapital', taxRelevant: false, balanceSheetPosition: 'A.IV' },

  // Class 5: Revenue (Erlöse)
  { number: '4000', name: 'Revenue 20% VAT', nameDe: 'Umsatzerlöse 20% USt', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, defaultTaxCode: 'USt20', plPosition: '1' },
  { number: '4010', name: 'Revenue 13% VAT', nameDe: 'Umsatzerlöse 13% USt', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, defaultTaxCode: 'USt13', plPosition: '1' },
  { number: '4020', name: 'Revenue 10% VAT', nameDe: 'Umsatzerlöse 10% USt', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, defaultTaxCode: 'USt10', plPosition: '1' },
  { number: '4100', name: 'Export Revenue', nameDe: 'Erlöse Ausfuhrlieferungen', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, defaultTaxCode: 'USt0', plPosition: '1' },
  { number: '4110', name: 'Intra-Community Revenue', nameDe: 'Innergemeinschaftliche Lieferungen', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, defaultTaxCode: 'IGE', plPosition: '1' },
  { number: '4200', name: 'Revenue from Services', nameDe: 'Erlöse aus Dienstleistungen', type: 'revenue', category: 'Revenue', categoryDe: 'Umsatzerlöse', taxRelevant: true, plPosition: '1' },
  { number: '4400', name: 'Sales Deductions', nameDe: 'Erlösschmälerungen', type: 'revenue', category: 'Revenue Deductions', categoryDe: 'Erlösschmälerungen', taxRelevant: true, plPosition: '2' },
  { number: '4500', name: 'Discounts Granted', nameDe: 'Gewährte Skonti', type: 'revenue', category: 'Revenue Deductions', categoryDe: 'Erlösschmälerungen', taxRelevant: true, plPosition: '2' },
  { number: '4600', name: 'Other Operating Income', nameDe: 'Sonstige betriebliche Erträge', type: 'revenue', category: 'Other Income', categoryDe: 'Sonstige Erträge', taxRelevant: false, plPosition: '3' },
  { number: '4700', name: 'Interest Income', nameDe: 'Zinserträge', type: 'revenue', category: 'Financial Income', categoryDe: 'Finanzerträge', taxRelevant: false, plPosition: '12' },
  { number: '4800', name: 'Currency Gains', nameDe: 'Kursgewinne', type: 'revenue', category: 'Financial Income', categoryDe: 'Finanzerträge', taxRelevant: false, plPosition: '12' },

  // Class 6: Material costs (Materialaufwand)
  { number: '5000', name: 'Cost of Materials 20% VAT', nameDe: 'Wareneinsatz 20% VSt', type: 'expense', category: 'Cost of Sales', categoryDe: 'Materialaufwand', taxRelevant: true, defaultTaxCode: 'VSt20', plPosition: '4' },
  { number: '5010', name: 'Cost of Materials 13% VAT', nameDe: 'Wareneinsatz 13% VSt', type: 'expense', category: 'Cost of Sales', categoryDe: 'Materialaufwand', taxRelevant: true, defaultTaxCode: 'VSt13', plPosition: '4' },
  { number: '5020', name: 'Cost of Materials 10% VAT', nameDe: 'Wareneinsatz 10% VSt', type: 'expense', category: 'Cost of Sales', categoryDe: 'Materialaufwand', taxRelevant: true, defaultTaxCode: 'VSt10', plPosition: '4' },
  { number: '5100', name: 'Purchased Services', nameDe: 'Bezogene Leistungen', type: 'expense', category: 'Cost of Sales', categoryDe: 'Materialaufwand', taxRelevant: true, plPosition: '4' },
  { number: '5200', name: 'Intra-Community Acquisitions', nameDe: 'Innergemeinschaftlicher Erwerb', type: 'expense', category: 'Cost of Sales', categoryDe: 'Materialaufwand', taxRelevant: true, defaultTaxCode: 'IGE13b', plPosition: '4' },
  { number: '5400', name: 'Purchase Deductions', nameDe: 'Bezugsnebenkosten', type: 'expense', category: 'Cost of Sales', categoryDe: 'Materialaufwand', taxRelevant: true, plPosition: '4' },
  { number: '5500', name: 'Discounts Received', nameDe: 'Erhaltene Skonti', type: 'expense', category: 'Cost of Sales', categoryDe: 'Materialaufwand', taxRelevant: true, plPosition: '4' },

  // Class 7: Personnel costs (Personalaufwand)
  { number: '6000', name: 'Wages', nameDe: 'Löhne', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '5' },
  { number: '6010', name: 'Salaries', nameDe: 'Gehälter', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '5' },
  { number: '6100', name: 'Social Security Employer', nameDe: 'Sozialversicherung Dienstgeber', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '5' },
  { number: '6200', name: 'Payroll Tax', nameDe: 'Lohnnebenkosten', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '5' },
  { number: '6300', name: 'Severance Pay', nameDe: 'Abfertigungen', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '5' },
  { number: '6400', name: 'Pension Costs', nameDe: 'Pensionsaufwendungen', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '5' },
  { number: '6500', name: 'Other Personnel Costs', nameDe: 'Sonstige Personalkosten', type: 'expense', category: 'Personnel', categoryDe: 'Personalaufwand', taxRelevant: false, plPosition: '5' },

  // Class 8: Other expenses (Sonstiger Aufwand)
  { number: '7000', name: 'Depreciation', nameDe: 'Abschreibungen', type: 'expense', category: 'Depreciation', categoryDe: 'Abschreibungen', taxRelevant: false, plPosition: '6' },
  { number: '7100', name: 'Rent', nameDe: 'Miete', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '7200', name: 'Leasing', nameDe: 'Leasing', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '7300', name: 'Insurance', nameDe: 'Versicherungen', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: false, plPosition: '7' },
  { number: '7400', name: 'Vehicle Costs', nameDe: 'Fahrzeugkosten', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '7500', name: 'Energy', nameDe: 'Energie', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '7600', name: 'Advertising', nameDe: 'Werbekosten', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '7700', name: 'Travel Expenses', nameDe: 'Reisekosten', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '7800', name: 'Phone/Internet', nameDe: 'Telefon/Internet', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '7900', name: 'Office Supplies', nameDe: 'Büromaterial', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '8000', name: 'Legal and Consulting', nameDe: 'Rechts- und Beratungskosten', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '8100', name: 'Accounting Fees', nameDe: 'Buchführungs- und Abschlusskosten', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: true, plPosition: '7' },
  { number: '8200', name: 'Bank Fees', nameDe: 'Bankspesen', type: 'expense', category: 'Financial Expenses', categoryDe: 'Finanzaufwendungen', taxRelevant: false, plPosition: '11' },
  { number: '8300', name: 'Interest Expense', nameDe: 'Zinsaufwand', type: 'expense', category: 'Financial Expenses', categoryDe: 'Finanzaufwendungen', taxRelevant: false, plPosition: '11' },
  { number: '8400', name: 'Currency Losses', nameDe: 'Kursverluste', type: 'expense', category: 'Financial Expenses', categoryDe: 'Finanzaufwendungen', taxRelevant: false, plPosition: '11' },
  { number: '8500', name: 'Other Operating Expenses', nameDe: 'Sonstige betriebliche Aufwendungen', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: false, plPosition: '7' },
  { number: '8600', name: 'Taxes and Fees', nameDe: 'Steuern und Gebühren', type: 'expense', category: 'Operating Expenses', categoryDe: 'Sonstige betriebliche Aufwendungen', taxRelevant: false, plPosition: '7' },

  // Class 9: Internal accounts (Interne Konten) - Opening/Closing
  { number: '9800', name: 'Opening Balance', nameDe: 'Eröffnungsbilanz', type: 'equity', category: 'Internal', categoryDe: 'Interne Konten', taxRelevant: false },
  { number: '9850', name: 'Profit/Loss Account', nameDe: 'Gewinn- und Verlustrechnung', type: 'equity', category: 'Internal', categoryDe: 'Interne Konten', taxRelevant: false },
  { number: '9900', name: 'Closing Balance', nameDe: 'Schlussbilanz', type: 'equity', category: 'Internal', categoryDe: 'Interne Konten', taxRelevant: false },
];

export class AustrianChartOfAccounts {
  private chartType: ChartType;
  private customAccounts: Map<string, EKRAccount> = new Map();

  constructor(chartType: ChartType = 'EKR') {
    this.chartType = chartType;
  }

  /**
   * Get all accounts for current chart type
   */
  getAllAccounts(): EKRAccount[] {
    const accounts = [...EKR_ACCOUNTS];
    for (const account of this.customAccounts.values()) {
      accounts.push(account);
    }
    return accounts;
  }

  /**
   * Get account by number
   */
  getAccount(number: string): EKRAccount | undefined {
    if (this.customAccounts.has(number)) {
      return this.customAccounts.get(number);
    }

    return EKR_ACCOUNTS.find((a) => a.number === number);
  }

  /**
   * Get accounts by type
   */
  getAccountsByType(type: EKRAccount['type']): EKRAccount[] {
    return this.getAllAccounts().filter((a) => a.type === type);
  }

  /**
   * Get accounts by category
   */
  getAccountsByCategory(category: string): EKRAccount[] {
    return this.getAllAccounts().filter(
      (a) => a.category === category || a.categoryDe === category
    );
  }

  /**
   * Get tax-relevant accounts
   */
  getTaxRelevantAccounts(): EKRAccount[] {
    return this.getAllAccounts().filter((a) => a.taxRelevant);
  }

  /**
   * Detect account type from account number (Austrian EKR structure)
   */
  detectAccountType(accountNumber: string): EKRAccount['type'] | 'unknown' {
    const num = parseInt(accountNumber, 10);

    if (isNaN(num)) {
      return 'unknown';
    }

    // Class 0-2: Assets
    if (num >= 0 && num < 3000) {
      return 'asset';
    }
    // Class 3: Liabilities and Provisions
    if (num >= 3000 && num < 4000) {
      return 'liability';
    }
    // Class 4: Revenue
    if (num >= 4000 && num < 5000) {
      return 'revenue';
    }
    // Class 5-8: Expenses
    if (num >= 5000 && num < 9000) {
      return 'expense';
    }
    // Class 9: Equity and Internal
    if (num >= 9000) {
      return 'equity';
    }

    return 'unknown';
  }

  /**
   * Detect account class (Austrian structure)
   */
  getAccountClass(accountNumber: string): number | undefined {
    const num = parseInt(accountNumber, 10);
    if (isNaN(num)) {
      return undefined;
    }
    return Math.floor(num / 1000);
  }

  /**
   * Get Austrian tax code by rate and type
   */
  getTaxCode(rate: number, type: 'input' | 'output'): AustrianTaxCode | undefined {
    return AUSTRIAN_TAX_CODES.find((tc) => tc.rate === rate && tc.type === type);
  }

  /**
   * Map tax code to account number
   */
  getTaxAccountForCode(taxCode: string): string | undefined {
    const code = AUSTRIAN_TAX_CODES.find((tc) => tc.code === taxCode);
    if (!code) {
      return undefined;
    }

    if (code.type === 'input') {
      // Input VAT accounts (2500 range)
      if (code.rate === 20) return '2500';
      if (code.rate === 13) return '2510';
      if (code.rate === 10) return '2520';
    } else {
      // Output VAT accounts (3500 range)
      if (code.rate === 20) return '3500';
      if (code.rate === 13) return '3510';
      if (code.rate === 10) return '3520';
    }

    return undefined;
  }

  /**
   * Categorize BMD accounts
   */
  categorizeAccounts(accounts: BmdAccount[]): Map<string, BmdAccount[]> {
    const categories = new Map<string, BmdAccount[]>();

    for (const account of accounts) {
      const ekrAccount = this.getAccount(account.number);
      const category = ekrAccount?.categoryDe || 'Sonstige';

      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(account);
    }

    return categories;
  }

  /**
   * Get balance sheet structure (Austrian UGB format)
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
        { position: 'B.II', name: 'Receivables', nameDe: 'Forderungen und sonstige Vermögensgegenstände', accounts: [] as string[] },
        { position: 'B.III', name: 'Securities', nameDe: 'Wertpapiere', accounts: [] as string[] },
        { position: 'B.IV', name: 'Cash', nameDe: 'Kassenbestand, Guthaben bei Kreditinstituten', accounts: [] as string[] },
        { position: 'C', name: 'Prepaid Expenses', nameDe: 'Aktive Rechnungsabgrenzungsposten', accounts: [] as string[] },
      ],
      liabilities: [
        { position: 'B', name: 'Provisions', nameDe: 'Rückstellungen', accounts: [] as string[] },
        { position: 'C.2', name: 'Bank Loans', nameDe: 'Verbindlichkeiten gegenüber Kreditinstituten', accounts: [] as string[] },
        { position: 'C.4', name: 'Advance Payments', nameDe: 'Erhaltene Anzahlungen', accounts: [] as string[] },
        { position: 'C.5', name: 'Trade Payables', nameDe: 'Verbindlichkeiten aus Lieferungen und Leistungen', accounts: [] as string[] },
        { position: 'C.9', name: 'Other Liabilities', nameDe: 'Sonstige Verbindlichkeiten', accounts: [] as string[] },
        { position: 'D', name: 'Accrued Expenses', nameDe: 'Passive Rechnungsabgrenzungsposten', accounts: [] as string[] },
      ],
      equity: [
        { position: 'A.I', name: 'Share Capital', nameDe: 'Nennkapital/Stammkapital', accounts: [] as string[] },
        { position: 'A.II', name: 'Capital Reserve', nameDe: 'Kapitalrücklagen', accounts: [] as string[] },
        { position: 'A.III', name: 'Retained Earnings', nameDe: 'Gewinnrücklagen', accounts: [] as string[] },
        { position: 'A.IV', name: 'Profit/Loss Carried Forward', nameDe: 'Gewinn-/Verlustvortrag', accounts: [] as string[] },
        { position: 'A.V', name: 'Annual Result', nameDe: 'Jahresüberschuss/-fehlbetrag', accounts: [] as string[] },
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
   * Get P&L structure (Austrian UGB format)
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
      { position: '2', name: 'Revenue Deductions', nameDe: 'Erlösschmälerungen', accounts: [] as string[], isSubtraction: true },
      { position: '3', name: 'Other Operating Income', nameDe: 'Sonstige betriebliche Erträge', accounts: [] as string[], isSubtraction: false },
      { position: '4', name: 'Cost of Materials', nameDe: 'Materialaufwand', accounts: [] as string[], isSubtraction: true },
      { position: '5', name: 'Personnel Expenses', nameDe: 'Personalaufwand', accounts: [] as string[], isSubtraction: true },
      { position: '6', name: 'Depreciation', nameDe: 'Abschreibungen', accounts: [] as string[], isSubtraction: true },
      { position: '7', name: 'Other Operating Expenses', nameDe: 'Sonstige betriebliche Aufwendungen', accounts: [] as string[], isSubtraction: true },
      { position: '11', name: 'Financial Expenses', nameDe: 'Finanzaufwendungen', accounts: [] as string[], isSubtraction: true },
      { position: '12', name: 'Financial Income', nameDe: 'Finanzerträge', accounts: [] as string[], isSubtraction: false },
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
  addCustomAccount(account: EKRAccount): void {
    this.customAccounts.set(account.number, account);
  }

  /**
   * Validate account number format
   */
  validateAccountNumber(number: string): boolean {
    // Austrian accounts are typically 4 digits
    return /^\d{4}$/.test(number);
  }

  /**
   * Validate account against Austrian accounting rules
   */
  validateAccount(account: BmdAccount): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check format
    if (!this.validateAccountNumber(account.number)) {
      errors.push('Invalid account number format (must be 4 digits)');
    }

    // Check account class
    const accountClass = this.getAccountClass(account.number);
    if (accountClass === undefined || accountClass > 9) {
      errors.push('Invalid account class (must be 0-9)');
    }

    // Check type consistency
    const detectedType = this.detectAccountType(account.number);
    if (detectedType === 'unknown') {
      errors.push('Cannot determine account type from number');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get account number range for type
   */
  getAccountNumberRange(type: EKRAccount['type']): { from: string; to: string } {
    const ranges: Record<EKRAccount['type'], { from: string; to: string }> = {
      asset: { from: '0000', to: '2999' },
      liability: { from: '3000', to: '3999' },
      equity: { from: '9000', to: '9999' },
      revenue: { from: '4000', to: '4999' },
      expense: { from: '5000', to: '8999' },
    };

    return ranges[type];
  }

  /**
   * Map BMD account to EKR account
   */
  mapBmdAccountToEKR(bmdAccount: BmdAccount): EKRAccount {
    // Try to find existing EKR account
    const ekrAccount = this.getAccount(bmdAccount.number);
    if (ekrAccount) {
      return ekrAccount;
    }

    // Create mapped account from BMD data
    const detectedType = this.detectAccountType(bmdAccount.number);
    const accountClass = this.getAccountClass(bmdAccount.number);

    return {
      number: bmdAccount.number,
      name: bmdAccount.name,
      nameDe: bmdAccount.name,
      type: detectedType !== 'unknown' ? detectedType : 'asset',
      category: this.getCategoryFromClass(accountClass),
      categoryDe: this.getCategoryFromClass(accountClass, true),
      taxRelevant: !!bmdAccount.taxCode,
      defaultTaxCode: bmdAccount.taxCode,
    };
  }

  /**
   * Get category name from account class
   */
  private getCategoryFromClass(accountClass: number | undefined, german: boolean = false): string {
    if (accountClass === undefined) {
      return german ? 'Unbekannt' : 'Unknown';
    }

    const categories: Record<number, { en: string; de: string }> = {
      0: { en: 'Fixed Assets', de: 'Anlagevermögen' },
      1: { en: 'Inventory', de: 'Vorräte' },
      2: { en: 'Current Assets', de: 'Umlaufvermögen' },
      3: { en: 'Liabilities', de: 'Verbindlichkeiten' },
      4: { en: 'Revenue', de: 'Erlöse' },
      5: { en: 'Cost of Sales', de: 'Materialaufwand' },
      6: { en: 'Personnel', de: 'Personalaufwand' },
      7: { en: 'Operating Expenses', de: 'Betrieblicher Aufwand' },
      8: { en: 'Other Expenses', de: 'Sonstiger Aufwand' },
      9: { en: 'Equity', de: 'Eigenkapital' },
    };

    return categories[accountClass]?.[german ? 'de' : 'en'] || (german ? 'Sonstige' : 'Other');
  }

  /**
   * Get VAT summary for accounts
   */
  getVATSummary(accounts: BmdAccount[]): {
    inputVAT: { rate: number; total: number }[];
    outputVAT: { rate: number; total: number }[];
  } {
    const inputVAT = new Map<number, number>();
    const outputVAT = new Map<number, number>();

    for (const account of accounts) {
      const ekrAccount = this.getAccount(account.number);
      if (!ekrAccount?.taxRelevant || !ekrAccount.defaultTaxCode) continue;

      const taxCode = AUSTRIAN_TAX_CODES.find((tc) => tc.code === ekrAccount.defaultTaxCode);
      if (!taxCode) continue;

      if (taxCode.type === 'input') {
        inputVAT.set(taxCode.rate, (inputVAT.get(taxCode.rate) || 0) + Math.abs(account.balance));
      } else {
        outputVAT.set(taxCode.rate, (outputVAT.get(taxCode.rate) || 0) + Math.abs(account.balance));
      }
    }

    return {
      inputVAT: Array.from(inputVAT.entries()).map(([rate, total]) => ({ rate, total })),
      outputVAT: Array.from(outputVAT.entries()).map(([rate, total]) => ({ rate, total })),
    };
  }
}

/**
 * Create Austrian chart of accounts handler
 */
export function createAustrianChartOfAccounts(chartType: ChartType = 'EKR'): AustrianChartOfAccounts {
  return new AustrianChartOfAccounts(chartType);
}
