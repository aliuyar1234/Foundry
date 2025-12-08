/**
 * SAP B1 Attachments Handler
 * Task: T065
 *
 * Extracts and manages document attachments.
 * Handles file metadata, download, and attachment linking.
 */

import { ExtractedEvent } from '../../base/connector';
import { SapB1Client } from '../sapClient';

export interface SapAttachment {
  absEntry: number;
  fileName: string;
  fileExtension: string;
  sourcePath?: string;
  attachmentDate: string;
  userID?: number;
  override?: boolean;
  freeText?: string;
}

export interface AttachmentLink {
  absEntry: number;
  lineNum: number;
  sourcePath: string;
  fileName: string;
  fileExtension: string;
  attachmentDate: string;
  userID?: number;
  freeText?: string;
}

export interface DocumentAttachment {
  docEntry: number;
  docType: string;
  attachments: AttachmentLink[];
}

export interface AttachmentExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  limit?: number;
  docTypes?: string[];
}

export class SapAttachmentsHandler {
  private client: SapB1Client;

  constructor(client: SapB1Client) {
    this.client = client;
  }

  /**
   * Extract attachment entries
   */
  async extractAttachments(
    options: AttachmentExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    attachments: SapAttachment[];
  }> {
    const events: ExtractedEvent[] = [];
    const attachments: SapAttachment[] = [];

    try {
      const filters: string[] = [];

      if (options.modifiedAfter) {
        filters.push(`AttachmentDate ge '${options.modifiedAfter.toISOString().split('T')[0]}'`);
      }

      const response = await this.client.query<any>('Attachments2', {
        $filter: filters.length > 0 ? filters.join(' and ') : undefined,
        $orderby: 'AbsoluteEntry desc',
        $top: options.limit || 100,
        $expand: 'Attachments2_Lines',
      });

      for (const att of response.value) {
        const attachment: SapAttachment = {
          absEntry: att.AbsoluteEntry,
          fileName: att.Attachments2_Lines?.[0]?.FileName || '',
          fileExtension: att.Attachments2_Lines?.[0]?.FileExtension || '',
          sourcePath: att.Attachments2_Lines?.[0]?.SourcePath,
          attachmentDate: att.Attachments2_Lines?.[0]?.AttachmentDate,
          userID: att.Attachments2_Lines?.[0]?.UserID,
          freeText: att.Attachments2_Lines?.[0]?.FreeText,
        };

        attachments.push(attachment);

        events.push({
          type: 'erp.attachment',
          timestamp: attachment.attachmentDate
            ? new Date(attachment.attachmentDate)
            : new Date(),
          actorId: attachment.userID?.toString(),
          targetId: String(attachment.absEntry),
          metadata: {
            source: 'sap_b1',
            organizationId: options.organizationId,
            absEntry: attachment.absEntry,
            fileName: attachment.fileName,
            fileExtension: attachment.fileExtension,
            sourcePath: attachment.sourcePath,
            attachmentDate: attachment.attachmentDate,
            userId: attachment.userID,
            freeText: attachment.freeText,
          },
        });
      }
    } catch (error) {
      console.warn('Failed to extract attachments:', error);
    }

    return { events, attachments };
  }

  /**
   * Get attachments for a specific document
   */
  async getDocumentAttachments(
    docEntry: number,
    docType: string,
    options: { organizationId: string }
  ): Promise<{
    events: ExtractedEvent[];
    attachments: AttachmentLink[];
  }> {
    const events: ExtractedEvent[] = [];
    const attachments: AttachmentLink[] = [];

    try {
      // Get document to find attachment entry
      const doc = await this.client.getById<any>(docType, docEntry);

      if (doc?.AttachmentEntry) {
        const attResponse = await this.client.getById<any>(
          'Attachments2',
          doc.AttachmentEntry
        );

        if (attResponse?.Attachments2_Lines) {
          for (const line of attResponse.Attachments2_Lines) {
            const attachment: AttachmentLink = {
              absEntry: attResponse.AbsoluteEntry,
              lineNum: line.Line,
              sourcePath: line.SourcePath,
              fileName: line.FileName,
              fileExtension: line.FileExtension,
              attachmentDate: line.AttachmentDate,
              userID: line.UserID,
              freeText: line.FreeText,
            };

            attachments.push(attachment);

            events.push({
              type: 'erp.document_attachment',
              timestamp: line.AttachmentDate
                ? new Date(line.AttachmentDate)
                : new Date(),
              actorId: line.UserID?.toString(),
              targetId: `${docType}:${docEntry}:${line.Line}`,
              metadata: {
                source: 'sap_b1',
                organizationId: options.organizationId,
                docType,
                docEntry,
                absEntry: attResponse.AbsoluteEntry,
                lineNum: line.Line,
                fileName: line.FileName,
                fileExtension: line.FileExtension,
                sourcePath: line.SourcePath,
                attachmentDate: line.AttachmentDate,
                userId: line.UserID,
              },
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to get attachments for ${docType} ${docEntry}:`, error);
    }

    return { events, attachments };
  }

  /**
   * Extract attachments for multiple documents
   */
  async extractDocumentAttachments(
    documents: Array<{ docEntry: number; docType: string }>,
    options: { organizationId: string }
  ): Promise<{
    events: ExtractedEvent[];
    documentAttachments: DocumentAttachment[];
  }> {
    const events: ExtractedEvent[] = [];
    const documentAttachments: DocumentAttachment[] = [];

    for (const doc of documents) {
      const result = await this.getDocumentAttachments(
        doc.docEntry,
        doc.docType,
        options
      );

      if (result.attachments.length > 0) {
        events.push(...result.events);
        documentAttachments.push({
          docEntry: doc.docEntry,
          docType: doc.docType,
          attachments: result.attachments,
        });
      }
    }

    return { events, documentAttachments };
  }

  /**
   * Get attachment file content (base64 encoded)
   */
  async getAttachmentContent(
    absEntry: number,
    lineNum: number
  ): Promise<{
    content: string;
    contentType: string;
    fileName: string;
  } | null> {
    try {
      // Use the attachment download endpoint
      const response = await this.client.executeRaw(
        `Attachments2(${absEntry})/$value?line=${lineNum}`,
        {
          method: 'GET',
          headers: {
            Accept: '*/*',
          },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        // Get metadata
        const att = await this.client.getById<any>('Attachments2', absEntry);
        const line = att?.Attachments2_Lines?.find((l: any) => l.Line === lineNum);

        return {
          content: base64,
          contentType: this.getContentType(line?.FileExtension || ''),
          fileName: line?.FileName || 'attachment',
        };
      }

      return null;
    } catch (error) {
      console.warn(`Failed to get attachment content ${absEntry}:${lineNum}:`, error);
      return null;
    }
  }

  /**
   * Create new attachment
   */
  async createAttachment(
    fileName: string,
    content: string, // base64 encoded
    options: {
      organizationId: string;
      freeText?: string;
    }
  ): Promise<number | null> {
    try {
      const response = await this.client.create('Attachments2', {
        Attachments2_Lines: [
          {
            FileName: fileName.replace(/\.[^/.]+$/, ''), // Remove extension
            FileExtension: fileName.split('.').pop() || '',
            SourcePath: 'Internal',
            AttachmentDate: new Date().toISOString().split('T')[0],
            FreeText: options.freeText,
          },
        ],
      });

      // Upload content if entry created
      if (response?.AbsoluteEntry) {
        await this.uploadAttachmentContent(response.AbsoluteEntry, 0, content);
        return response.AbsoluteEntry;
      }

      return null;
    } catch (error) {
      console.warn('Failed to create attachment:', error);
      return null;
    }
  }

  /**
   * Upload attachment content
   */
  private async uploadAttachmentContent(
    absEntry: number,
    lineNum: number,
    content: string // base64 encoded
  ): Promise<boolean> {
    try {
      const buffer = Buffer.from(content, 'base64');

      await this.client.executeRaw(
        `Attachments2(${absEntry})/$value?line=${lineNum}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: buffer,
        }
      );

      return true;
    } catch (error) {
      console.warn(`Failed to upload attachment content ${absEntry}:${lineNum}:`, error);
      return false;
    }
  }

  /**
   * Link attachment to document
   */
  async linkAttachmentToDocument(
    absEntry: number,
    docType: string,
    docEntry: number
  ): Promise<boolean> {
    try {
      await this.client.update(docType, docEntry, {
        AttachmentEntry: absEntry,
      });
      return true;
    } catch (error) {
      console.warn(`Failed to link attachment ${absEntry} to ${docType} ${docEntry}:`, error);
      return false;
    }
  }

  /**
   * Get content type from file extension
   */
  private getContentType(extension: string): string {
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      txt: 'text/plain',
      csv: 'text/csv',
      xml: 'application/xml',
      json: 'application/json',
      zip: 'application/zip',
    };

    return types[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Get attachment statistics
   */
  async getAttachmentStats(
    options: { organizationId: string }
  ): Promise<{
    totalAttachments: number;
    byExtension: Record<string, number>;
    recentCount: number;
  }> {
    try {
      // Get total count
      const countResponse = await this.client.query<any>('Attachments2', {
        $count: true,
        $top: 0,
      });

      // Get extension breakdown
      const extensionResponse = await this.client.query<any>('Attachments2', {
        $expand: 'Attachments2_Lines',
        $top: 1000,
      });

      const byExtension: Record<string, number> = {};
      let recentCount = 0;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      for (const att of extensionResponse.value) {
        for (const line of att.Attachments2_Lines || []) {
          const ext = (line.FileExtension || 'unknown').toLowerCase();
          byExtension[ext] = (byExtension[ext] || 0) + 1;

          if (line.AttachmentDate && new Date(line.AttachmentDate) > thirtyDaysAgo) {
            recentCount++;
          }
        }
      }

      return {
        totalAttachments: countResponse['@odata.count'] || extensionResponse.value.length,
        byExtension,
        recentCount,
      };
    } catch (error) {
      console.warn('Failed to get attachment stats:', error);
      return {
        totalAttachments: 0,
        byExtension: {},
        recentCount: 0,
      };
    }
  }
}

/**
 * Create attachments handler
 */
export function createSapAttachmentsHandler(client: SapB1Client): SapAttachmentsHandler {
  return new SapAttachmentsHandler(client);
}
