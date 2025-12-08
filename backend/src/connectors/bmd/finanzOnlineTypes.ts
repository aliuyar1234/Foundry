/**
 * FinanzOnline Types (T153)
 * TypeScript types for FinanzOnline (Austrian tax authority portal)
 * UVA submission structure
 * ZM submission structure
 * Response types
 */

/**
 * FinanzOnline authentication configuration
 */
export interface FinanzOnlineAuthConfig {
  teilnehmerNummer: string;      // Participant ID
  benutzerkennung: string;       // Username
  pin?: string;                  // PIN (for initial setup)
  webserviceBenutzer?: string;   // Webservice username
  webservicePasswort?: string;   // Webservice password
  zertifikat?: string;           // Certificate for authentication
}

/**
 * FinanzOnline connection status
 */
export interface FinanzOnlineConnectionStatus {
  connected: boolean;
  lastConnectionAt?: Date;
  lastSuccessfulSubmission?: Date;
  errors?: string[];
}

/**
 * UVA (Umsatzsteuervoranmeldung) submission to FinanzOnline
 */
export interface UvaSubmission {
  uId: string;                   // Submission unique ID
  steuernummer: string;          // Tax number (Steuernummer)
  fastnr?: string;               // VAT ID (UID-Nummer)
  jahr: number;                  // Year
  zeitraum: UvaZeitraum;         // Period type
  monat?: number;                // Month (1-12) for monthly filing
  quartal?: number;              // Quarter (1-4) for quarterly filing

  // UVA Kennzahlen (field codes)
  kennzahlen: UvaKennzahlen;

  // Submission metadata
  eingereichtAm?: Date;
  eingereichtDurch?: string;
  uebertragungsnummer?: string;  // Transmission number
  status: UvaSubmissionStatus;
}

/**
 * UVA period type
 */
export type UvaZeitraum =
  | 'monatlich'      // Monthly
  | 'quartalsweise'  // Quarterly
  | 'jaehrlich';     // Yearly (rare)

/**
 * UVA submission status
 */
export type UvaSubmissionStatus =
  | 'entwurf'        // Draft
  | 'bereit'         // Ready for submission
  | 'uebermittelt'   // Submitted
  | 'angenommen'     // Accepted by FinanzOnline
  | 'abgelehnt'      // Rejected
  | 'berichtigt';    // Corrected

/**
 * UVA Kennzahlen (field codes according to Austrian tax forms)
 */
export interface UvaKennzahlen {
  // Revenue (Bemessungsgrundlagen)
  kz000?: number;  // Gesamtbetrag der Bemessungsgrundlagen
  kz022?: number;  // Lieferungen/sonstige Leistungen 20%
  kz029?: number;  // Lieferungen/sonstige Leistungen 13%
  kz006?: number;  // Lieferungen/sonstige Leistungen 10%
  kz037?: number;  // Lieferungen/sonstige Leistungen 19% (historisch)
  kz008?: number;  // Lieferungen/sonstige Leistungen 7% (historisch)

  // Tax-exempt revenue
  kz011?: number;  // Steuerfreie Umsätze mit Vorsteuerabzug
  kz012?: number;  // Steuerfreie Umsätze ohne Vorsteuerabzug
  kz015?: number;  // Steuerpflichtige Umsätze für die Steuer schuldet

  // Intra-community
  kz017?: number;  // Innergemeinschaftliche Lieferungen
  kz018?: number;  // Umsätze außerhalb der EU
  kz019?: number;  // Umsätze in Drittländer

  // Reverse charge
  kz021?: number;  // Reverse Charge nach §19 Abs. 1
  kz073?: number;  // Reverse Charge nach §19 Abs. 1a
  kz072?: number;  // Reverse Charge nach §19 Abs. 1b
  kz088?: number;  // Reverse Charge nach §19 Abs. 1c
  kz089?: number;  // Reverse Charge nach §19 Abs. 1d
  kz044?: number;  // Reverse Charge nach §19 Abs. 1e

  // Output tax (Umsatzsteuer)
  kz056?: number;  // Umsatzsteuer 20%
  kz057?: number;  // Umsatzsteuer 13%
  kz008_ust?: number;  // Umsatzsteuer 10%
  kz048?: number;  // Umsatzsteuer 19% (historisch)
  kz009?: number;  // Umsatzsteuer 7% (historisch)

  // Special cases
  kz032?: number;  // Eigenverbrauch
  kz039?: number;  // Sonstige Berichtigungen

  // Intra-community acquisitions
  kz070?: number;  // Innergemeinschaftliche Erwerbe
  kz071?: number;  // Umsatzsteuer darauf

  // Input tax (Vorsteuer)
  kz060?: number;  // Gesamtbetrag Vorsteuer
  kz061?: number;  // Vorsteuer für innergemeinschaftliche Erwerbe
  kz062?: number;  // Vorsteuer für Einfuhr
  kz063?: number;  // Vorsteuer für Reverse Charge
  kz064?: number;  // Vorsteuer aus Anzahlungen

  // Total amounts
  kz095?: number;  // Summe Umsatzsteuer
  kz065?: number;  // Summe Vorsteuer
  kz096?: number;  // Zahllast/Überschuss

  // Additional fields
  kz090?: number;  // Gutschrift auf Grund des Einbringungsvorganges
  kz092?: number;  // Gutschrift gemäß §215 Abs. 4 BAO
}

/**
 * UVA response from FinanzOnline
 */
export interface UvaResponse {
  erfolg: boolean;
  uebertragungsnummer?: string;
  eingangsdatum?: Date;
  bearbeitungsnummer?: string;
  fehlermeldungen?: FinanzOnlineError[];
  warnungen?: FinanzOnlineWarning[];
  rueckmeldung?: string;
}

/**
 * ZM (Zusammenfassende Meldung) submission to FinanzOnline
 */
export interface ZmSubmission {
  uId: string;                   // Submission unique ID
  steuernummer: string;          // Tax number
  uidnummer: string;             // VAT ID (UID-Nummer)
  jahr: number;                  // Year
  zeitraum: ZmZeitraum;          // Period type
  monat?: number;                // Month (1-12) for monthly filing
  quartal?: number;              // Quarter (1-4) for quarterly filing

  // ZM line items
  meldungen: ZmMeldung[];

  // Submission metadata
  eingereichtAm?: Date;
  eingereichtDurch?: string;
  uebertragungsnummer?: string;
  status: ZmSubmissionStatus;
}

/**
 * ZM period type
 */
export type ZmZeitraum =
  | 'monatlich'      // Monthly
  | 'quartalsweise'; // Quarterly

/**
 * ZM submission status
 */
export type ZmSubmissionStatus =
  | 'entwurf'        // Draft
  | 'bereit'         // Ready for submission
  | 'uebermittelt'   // Submitted
  | 'angenommen'     // Accepted
  | 'abgelehnt'      // Rejected
  | 'berichtigt';    // Corrected

/**
 * ZM individual report (per EU customer)
 */
export interface ZmMeldung {
  laufendeNummer: number;        // Sequential number
  uidnummerKunde: string;        // Customer VAT ID
  laendercode: string;           // EU country code (e.g., "DE", "FR")

  // Amounts
  warenlieferung?: number;       // Goods delivery amount
  dienstleistung?: number;       // Services amount
  dreiecksgeschaeft?: boolean;   // Triangular transaction

  // Special cases
  berichtigung?: boolean;        // Correction of previous report
  stornierung?: boolean;         // Cancellation
}

/**
 * ZM response from FinanzOnline
 */
export interface ZmResponse {
  erfolg: boolean;
  uebertragungsnummer?: string;
  eingangsdatum?: Date;
  bearbeitungsnummer?: string;
  fehlermeldungen?: FinanzOnlineError[];
  warnungen?: FinanzOnlineWarning[];
  rueckmeldung?: string;
  ungueltigeUidNummern?: string[];  // Invalid VAT IDs
}

/**
 * FinanzOnline error message
 */
export interface FinanzOnlineError {
  code: string;
  text: string;
  feld?: string;                 // Field that caused the error
  schwere: ErrorSeverity;
}

/**
 * Error severity
 */
export type ErrorSeverity =
  | 'fehler'         // Error (blocking)
  | 'warnung'        // Warning (non-blocking)
  | 'hinweis';       // Notice/info

/**
 * FinanzOnline warning message
 */
export interface FinanzOnlineWarning {
  code: string;
  text: string;
  feld?: string;
}

/**
 * FinanzOnline submission history
 */
export interface FinanzOnlineSubmissionHistory {
  id: string;
  typ: 'UVA' | 'ZM';
  submissionId: string;
  jahr: number;
  monat?: number;
  quartal?: number;
  eingereichtAm: Date;
  eingereichtDurch: string;
  uebertragungsnummer?: string;
  status: UvaSubmissionStatus | ZmSubmissionStatus;
  erfolg: boolean;
  fehlermeldungen?: FinanzOnlineError[];
  warnungen?: FinanzOnlineWarning[];
}

/**
 * UID (VAT ID) validation request
 */
export interface UidValidationRequest {
  uidnummer: string;             // VAT ID to validate
  firmenname?: string;           // Company name (optional)
  ort?: string;                  // City (optional)
  plz?: string;                  // Postal code (optional)
  strasse?: string;              // Street (optional)
}

/**
 * UID validation response
 */
export interface UidValidationResponse {
  uidnummer: string;
  gueltig: boolean;
  firmenname?: string;
  ort?: string;
  plz?: string;
  strasse?: string;
  abfragedatum: Date;
}

/**
 * FinanzOnline webservice endpoints
 */
export const FINANZONLINE_ENDPOINTS = {
  PRODUCTION: 'https://finanzonline.bmf.gv.at/fon',
  TEST: 'https://finanzonline.bmf.gv.at/fontest',

  // Specific endpoints
  UVA_SUBMIT: '/uva/submit',
  ZM_SUBMIT: '/zm/submit',
  UID_VALIDATE: '/uid/validate',
  STATUS_CHECK: '/status',
} as const;

/**
 * FinanzOnline submission options
 */
export interface FinanzOnlineSubmitOptions {
  testMode?: boolean;            // Submit to test environment
  validateOnly?: boolean;        // Only validate, don't submit
  async?: boolean;               // Asynchronous submission
  notificationEmail?: string;    // Email for notifications
}

/**
 * FinanzOnline API response wrapper
 */
export interface FinanzOnlineApiResponse<T> {
  success: boolean;
  data?: T;
  errors?: FinanzOnlineError[];
  warnings?: FinanzOnlineWarning[];
  timestamp: Date;
  requestId?: string;
}
