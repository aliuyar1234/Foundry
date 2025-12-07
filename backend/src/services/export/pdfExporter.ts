/**
 * PDF Exporter
 * Converts Markdown SOPs to PDF format
 */

import { marked } from 'marked';
import puppeteer from 'puppeteer';

export interface PDFExportOptions {
  includeMetadata?: boolean;
  includeVersionHistory?: boolean;
  pageSize?: 'A4' | 'Letter';
  margins?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  headerTemplate?: string;
  footerTemplate?: string;
  displayHeaderFooter?: boolean;
}

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

const DEFAULT_OPTIONS: PDFExportOptions = {
  includeMetadata: false,
  includeVersionHistory: false,
  pageSize: 'A4',
  margins: {
    top: '20mm',
    right: '15mm',
    bottom: '20mm',
    left: '15mm',
  },
  displayHeaderFooter: true,
};

const PDF_STYLES = `
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #333;
    max-width: 100%;
    margin: 0;
    padding: 0;
  }

  h1 {
    font-size: 24pt;
    color: #1a1a1a;
    border-bottom: 2px solid #3b82f6;
    padding-bottom: 10px;
    margin-top: 0;
  }

  h2 {
    font-size: 18pt;
    color: #1a1a1a;
    margin-top: 24pt;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 8px;
  }

  h3 {
    font-size: 14pt;
    color: #374151;
    margin-top: 16pt;
  }

  h4 {
    font-size: 12pt;
    color: #4b5563;
    margin-top: 12pt;
  }

  p {
    margin: 8pt 0;
  }

  ul, ol {
    margin: 8pt 0;
    padding-left: 24pt;
  }

  li {
    margin: 4pt 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16pt 0;
    font-size: 10pt;
  }

  th, td {
    border: 1px solid #d1d5db;
    padding: 8pt 12pt;
    text-align: left;
  }

  th {
    background-color: #f3f4f6;
    font-weight: 600;
  }

  tr:nth-child(even) {
    background-color: #f9fafb;
  }

  code {
    background-color: #f3f4f6;
    padding: 2pt 4pt;
    border-radius: 3pt;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 10pt;
  }

  pre {
    background-color: #1f2937;
    color: #f3f4f6;
    padding: 12pt;
    border-radius: 6pt;
    overflow-x: auto;
  }

  pre code {
    background: none;
    padding: 0;
  }

  blockquote {
    border-left: 4px solid #3b82f6;
    margin: 16pt 0;
    padding: 8pt 16pt;
    background-color: #eff6ff;
    color: #1e40af;
  }

  .warning {
    border-left: 4px solid #f59e0b;
    background-color: #fef3c7;
    color: #92400e;
    padding: 12pt 16pt;
    margin: 16pt 0;
    border-radius: 0 6pt 6pt 0;
  }

  .note {
    border-left: 4px solid #10b981;
    background-color: #d1fae5;
    color: #065f46;
    padding: 12pt 16pt;
    margin: 16pt 0;
    border-radius: 0 6pt 6pt 0;
  }

  .metadata {
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6pt;
    padding: 16pt;
    margin-bottom: 24pt;
    font-size: 10pt;
  }

  .metadata h3 {
    margin-top: 0;
    font-size: 12pt;
  }

  .metadata-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8pt;
  }

  .metadata-item {
    display: flex;
    gap: 8pt;
  }

  .metadata-label {
    font-weight: 600;
    color: #6b7280;
  }

  .version-history {
    margin-top: 32pt;
    padding-top: 16pt;
    border-top: 2px solid #e5e7eb;
  }

  .checkbox {
    display: inline-block;
    width: 14pt;
    height: 14pt;
    border: 2px solid #9ca3af;
    border-radius: 3pt;
    margin-right: 8pt;
    vertical-align: middle;
  }

  @media print {
    body {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    h2, h3 {
      page-break-after: avoid;
    }

    table, pre, blockquote {
      page-break-inside: avoid;
    }
  }
`;

/**
 * Export SOP document to PDF
 */
export async function exportToPDF(
  sop: SOPDocument,
  options: PDFExportOptions = {}
): Promise<{ content: Buffer; mimeType: string; filename: string }> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Convert markdown to HTML
  const contentHtml = marked.parse(sop.content);

  // Build full HTML document
  const html = buildHTMLDocument(sop, contentHtml as string, mergedOptions);

  // Generate PDF using Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: mergedOptions.pageSize,
      margin: mergedOptions.margins,
      printBackground: true,
      displayHeaderFooter: mergedOptions.displayHeaderFooter,
      headerTemplate: mergedOptions.headerTemplate || buildHeaderTemplate(sop),
      footerTemplate: mergedOptions.footerTemplate || buildFooterTemplate(),
    });

    return {
      content: Buffer.from(pdf),
      mimeType: 'application/pdf',
      filename: `${sanitizeFilename(sop.title)}_v${sop.version}.pdf`,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Build complete HTML document
 */
function buildHTMLDocument(
  sop: SOPDocument,
  contentHtml: string,
  options: PDFExportOptions
): string {
  let metadataSection = '';
  if (options.includeMetadata) {
    metadataSection = `
      <div class="metadata">
        <h3>Document Information</h3>
        <div class="metadata-grid">
          <div class="metadata-item">
            <span class="metadata-label">Document ID:</span>
            <span>${sop.id}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Version:</span>
            <span>${sop.version}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Status:</span>
            <span>${sop.status}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Language:</span>
            <span>${sop.language.toUpperCase()}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Created:</span>
            <span>${formatDate(sop.createdAt)}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Last Updated:</span>
            <span>${formatDate(sop.updatedAt)}</span>
          </div>
          ${sop.process ? `
            <div class="metadata-item">
              <span class="metadata-label">Process:</span>
              <span>${sop.process.name}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  let versionHistorySection = '';
  if (options.includeVersionHistory && sop.versions && sop.versions.length > 0) {
    versionHistorySection = `
      <div class="version-history">
        <h2>Version History</h2>
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Date</th>
              <th>Author</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody>
            ${sop.versions.map(v => `
              <tr>
                <td>${v.version}</td>
                <td>${formatDate(v.createdAt)}</td>
                <td>${v.createdBy}</td>
                <td>${v.changeNotes || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Process content to add checkbox styling
  const processedContent = contentHtml
    .replace(/\[\s*\]/g, '<span class="checkbox"></span>')
    .replace(/\[x\]/gi, '<span class="checkbox" style="background-color: #3b82f6;"></span>');

  return `
    <!DOCTYPE html>
    <html lang="${sop.language}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${sop.title}</title>
      <style>${PDF_STYLES}</style>
    </head>
    <body>
      ${metadataSection}
      <article>
        ${processedContent}
      </article>
      ${versionHistorySection}
    </body>
    </html>
  `;
}

/**
 * Build header template for PDF
 */
function buildHeaderTemplate(sop: SOPDocument): string {
  return `
    <div style="font-size: 9px; color: #6b7280; width: 100%; padding: 0 15mm; display: flex; justify-content: space-between;">
      <span>${sop.title}</span>
      <span>Version ${sop.version}</span>
    </div>
  `;
}

/**
 * Build footer template for PDF
 */
function buildFooterTemplate(): string {
  return `
    <div style="font-size: 9px; color: #6b7280; width: 100%; padding: 0 15mm; display: flex; justify-content: space-between;">
      <span>Confidential</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  `;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Sanitize filename
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

export default exportToPDF;
