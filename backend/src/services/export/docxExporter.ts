/**
 * DOCX Exporter
 * Converts Markdown SOPs to Microsoft Word format
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  Packer,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  ShadingType,
  CheckBox,
} from 'docx';
import { marked } from 'marked';

export interface DOCXExportOptions {
  includeMetadata?: boolean;
  includeVersionHistory?: boolean;
  companyName?: string;
  companyLogo?: Buffer;
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

const DEFAULT_OPTIONS: DOCXExportOptions = {
  includeMetadata: false,
  includeVersionHistory: false,
};

/**
 * Export SOP document to DOCX
 */
export async function exportToDOCX(
  sop: SOPDocument,
  options: DOCXExportOptions = {}
): Promise<{ content: Buffer; mimeType: string; filename: string }> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Parse markdown to tokens
  const tokens = marked.lexer(sop.content);

  // Build document sections
  const sections: Paragraph[] = [];

  // Add metadata section if requested
  if (mergedOptions.includeMetadata) {
    sections.push(...buildMetadataSection(sop));
  }

  // Convert markdown tokens to docx elements
  sections.push(...convertTokensToDocx(tokens));

  // Add version history if requested
  if (mergedOptions.includeVersionHistory && sop.versions && sop.versions.length > 0) {
    sections.push(...buildVersionHistorySection(sop.versions));
  }

  // Create document
  const doc = new Document({
    creator: 'Enterprise AI Foundation Platform',
    title: sop.title,
    subject: `SOP for ${sop.process?.name || 'Process'}`,
    keywords: 'SOP, procedure, documentation',
    lastModifiedBy: 'System',
    revision: parseInt(sop.version.split('.')[1] || '0', 10),
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch in twips
              right: 1080,
              bottom: 1440,
              left: 1080,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: sop.title,
                    size: 18,
                    color: '666666',
                  }),
                  new TextRun({
                    text: `\t\tVersion ${sop.version}`,
                    size: 18,
                    color: '666666',
                  }),
                ],
                alignment: AlignmentType.LEFT,
                tabStops: [
                  {
                    type: 'right',
                    position: 9360, // Right margin
                  },
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Confidential',
                    size: 18,
                    color: '666666',
                  }),
                  new TextRun({
                    text: '\t\tPage ',
                    size: 18,
                    color: '666666',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: '666666',
                  }),
                  new TextRun({
                    text: ' of ',
                    size: 18,
                    color: '666666',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: '666666',
                  }),
                ],
                alignment: AlignmentType.LEFT,
                tabStops: [
                  {
                    type: 'right',
                    position: 9360,
                  },
                ],
              }),
            ],
          }),
        },
        children: sections,
      },
    ],
  });

  // Generate buffer
  const buffer = await Packer.toBuffer(doc);

  return {
    content: buffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: `${sanitizeFilename(sop.title)}_v${sop.version}.docx`,
  };
}

/**
 * Build metadata section
 */
function buildMetadataSection(sop: SOPDocument): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Metadata box
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Document Information',
          bold: true,
          size: 24,
        }),
      ],
      spacing: { before: 200, after: 100 },
    })
  );

  const metadataItems = [
    { label: 'Document ID', value: sop.id },
    { label: 'Version', value: sop.version },
    { label: 'Status', value: sop.status.charAt(0).toUpperCase() + sop.status.slice(1) },
    { label: 'Language', value: sop.language.toUpperCase() },
    { label: 'Created', value: formatDate(sop.createdAt) },
    { label: 'Last Updated', value: formatDate(sop.updatedAt) },
  ];

  if (sop.process) {
    metadataItems.push({ label: 'Process', value: sop.process.name });
  }

  // Create table for metadata
  const table = new Table({
    rows: metadataItems.map(
      (item) =>
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: item.label,
                      bold: true,
                      size: 20,
                    }),
                  ],
                }),
              ],
              width: { size: 2500, type: WidthType.DXA },
              shading: { fill: 'F3F4F6', type: ShadingType.SOLID },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: item.value,
                      size: 20,
                    }),
                  ],
                }),
              ],
              width: { size: 6860, type: WidthType.DXA },
            }),
          ],
        })
    ),
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  paragraphs.push(table as unknown as Paragraph);
  paragraphs.push(new Paragraph({ spacing: { after: 400 } }));

  return paragraphs;
}

/**
 * Convert markdown tokens to DOCX paragraphs
 */
function convertTokensToDocx(tokens: marked.Token[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        paragraphs.push(createHeading(token));
        break;

      case 'paragraph':
        paragraphs.push(createParagraph(token));
        break;

      case 'list':
        paragraphs.push(...createList(token));
        break;

      case 'table':
        paragraphs.push(createTable(token) as unknown as Paragraph);
        break;

      case 'blockquote':
        paragraphs.push(...createBlockquote(token));
        break;

      case 'code':
        paragraphs.push(createCodeBlock(token));
        break;

      case 'hr':
        paragraphs.push(createHorizontalRule());
        break;

      case 'space':
        // Skip empty space tokens
        break;

      default:
        // Handle unknown tokens as paragraphs
        if ('text' in token && token.text) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: token.text, size: 22 })],
            })
          );
        }
    }
  }

  return paragraphs;
}

/**
 * Create heading paragraph
 */
function createHeading(token: marked.Tokens.Heading): Paragraph {
  const headingLevels: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };

  return new Paragraph({
    heading: headingLevels[token.depth] || HeadingLevel.HEADING_1,
    children: parseInlineTokens(token.tokens || []),
    spacing: {
      before: token.depth === 1 ? 400 : 300,
      after: 120,
    },
  });
}

/**
 * Create regular paragraph
 */
function createParagraph(token: marked.Tokens.Paragraph): Paragraph {
  return new Paragraph({
    children: parseInlineTokens(token.tokens || []),
    spacing: { after: 120 },
  });
}

/**
 * Create list items
 */
function createList(token: marked.Tokens.List): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  token.items.forEach((item, index) => {
    const bullet = token.ordered ? `${index + 1}.` : '•';
    const text = item.text || '';

    // Check for checkbox syntax
    const hasCheckbox = text.startsWith('[ ]') || text.startsWith('[x]');
    const isChecked = text.startsWith('[x]');
    const cleanText = hasCheckbox ? text.slice(3).trim() : text;

    const children: (TextRun | CheckBox)[] = [];

    if (hasCheckbox) {
      children.push(
        new CheckBox({
          checked: isChecked,
        }) as unknown as TextRun
      );
      children.push(new TextRun({ text: ' ' }));
    }

    children.push(
      new TextRun({
        text: `${bullet} ${cleanText}`,
        size: 22,
      })
    );

    paragraphs.push(
      new Paragraph({
        children,
        indent: { left: 360 },
        spacing: { after: 60 },
      })
    );
  });

  return paragraphs;
}

/**
 * Create table
 */
function createTable(token: marked.Tokens.Table): Table {
  const rows: TableRow[] = [];

  // Header row
  rows.push(
    new TableRow({
      children: token.header.map(
        (cell) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cell.text,
                    bold: true,
                    size: 20,
                  }),
                ],
              }),
            ],
            shading: { fill: 'F3F4F6', type: ShadingType.SOLID },
          })
      ),
    })
  );

  // Data rows
  for (const row of token.rows) {
    rows.push(
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell.text,
                      size: 20,
                    }),
                  ],
                }),
              ],
            })
        ),
      })
    );
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Create blockquote
 */
function createBlockquote(token: marked.Tokens.Blockquote): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const childToken of token.tokens) {
    if (childToken.type === 'paragraph') {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: childToken.text || '',
              italics: true,
              size: 22,
              color: '4B5563',
            }),
          ],
          indent: { left: 720 },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 24,
              color: '3B82F6',
            },
          },
          spacing: { after: 120 },
        })
      );
    }
  }

  return paragraphs;
}

/**
 * Create code block
 */
function createCodeBlock(token: marked.Tokens.Code): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: token.text,
        font: 'Consolas',
        size: 18,
      }),
    ],
    shading: { fill: '1F2937', type: ShadingType.SOLID },
    spacing: { before: 120, after: 120 },
  });
}

/**
 * Create horizontal rule
 */
function createHorizontalRule(): Paragraph {
  return new Paragraph({
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: 'E5E7EB',
      },
    },
    spacing: { before: 200, after: 200 },
  });
}

/**
 * Parse inline tokens to TextRuns
 */
function parseInlineTokens(tokens: marked.Token[]): TextRun[] {
  const runs: TextRun[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        runs.push(new TextRun({ text: token.text, size: 22 }));
        break;

      case 'strong':
        runs.push(new TextRun({ text: token.text, bold: true, size: 22 }));
        break;

      case 'em':
        runs.push(new TextRun({ text: token.text, italics: true, size: 22 }));
        break;

      case 'codespan':
        runs.push(
          new TextRun({
            text: token.text,
            font: 'Consolas',
            size: 20,
            shading: { fill: 'F3F4F6', type: ShadingType.SOLID },
          })
        );
        break;

      case 'link':
        runs.push(
          new TextRun({
            text: token.text,
            color: '3B82F6',
            underline: {},
            size: 22,
          })
        );
        break;

      default:
        if ('text' in token && token.text) {
          runs.push(new TextRun({ text: token.text, size: 22 }));
        }
    }
  }

  return runs;
}

/**
 * Build version history section
 */
function buildVersionHistorySection(
  versions: Array<{
    version: string;
    createdAt: Date;
    createdBy: string;
    changeNotes?: string;
  }>
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Section title
  paragraphs.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Version History', size: 28 })],
      spacing: { before: 400, after: 200 },
      pageBreakBefore: true,
    })
  );

  // Version table
  const rows: TableRow[] = [
    new TableRow({
      children: ['Version', 'Date', 'Author', 'Changes'].map(
        (text) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text, bold: true, size: 20 })],
              }),
            ],
            shading: { fill: 'F3F4F6', type: ShadingType.SOLID },
          })
      ),
    }),
  ];

  for (const version of versions) {
    rows.push(
      new TableRow({
        children: [
          version.version,
          formatDate(version.createdAt),
          version.createdBy,
          version.changeNotes || '-',
        ].map(
          (text) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text, size: 20 })],
                }),
              ],
            })
        ),
      })
    );
  }

  paragraphs.push(
    new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    }) as unknown as Paragraph
  );

  return paragraphs;
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

export default exportToDOCX;
