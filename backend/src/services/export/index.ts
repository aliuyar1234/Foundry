/**
 * Export Services Index
 * Exports document conversion utilities
 */

export {
  exportToPDF,
  type PDFExportOptions,
  type SOPDocument as PDFSOPDocument,
} from './pdfExporter.js';

export {
  exportToDOCX,
  type DOCXExportOptions,
  type SOPDocument as DOCXSOPDocument,
} from './docxExporter.js';

// Common document type
export interface SOPDocument {
  id: string;
  title: string;
  content: string;
  version: string;
  status: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
  versions?: Array<{
    version: string;
    createdAt: Date;
    createdBy: string;
    changeNotes?: string;
  }>;
  process?: {
    id: string;
    name: string;
  };
}

// Common export options
export interface ExportOptions {
  includeMetadata?: boolean;
  includeVersionHistory?: boolean;
}
