/**
 * Email Metadata Extractor
 * Extracts structured events from Microsoft 365 email messages
 */

import { GraphMessage } from '../graphClient.js';
import { ExtractedEvent } from '../../base/connector.js';

export interface EmailMetadata {
  to: string[];
  cc: string[];
  subjectKeywords: string[];
  hasAttachment: boolean;
  importance: string;
  isRead: boolean;
  conversationId: string;
}

/**
 * Extract keywords from email subject
 * Removes common stop words and extracts meaningful terms
 */
function extractSubjectKeywords(subject: string): string[] {
  if (!subject) return [];

  // Common stop words to filter out
  const stopWords = new Set([
    're', 'fw', 'fwd', 'aw', 'wg', 'the', 'a', 'an', 'and', 'or', 'but',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also',
  ]);

  // Clean and split subject
  const words = subject
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  // Return unique keywords (max 10)
  return [...new Set(words)].slice(0, 10);
}

/**
 * Extract email addresses from recipients
 */
function extractRecipients(
  recipients?: Array<{ emailAddress: { address: string; name?: string } }>
): string[] {
  if (!recipients) return [];
  return recipients
    .map((r) => r.emailAddress?.address?.toLowerCase())
    .filter((email): email is string => !!email);
}

/**
 * Extract event from received email
 */
export function extractReceivedEmailEvent(
  message: GraphMessage,
  organizationId: string
): ExtractedEvent {
  const fromEmail = message.from?.emailAddress?.address?.toLowerCase();
  const toEmails = extractRecipients(message.toRecipients);
  const ccEmails = extractRecipients(message.ccRecipients);

  const metadata: EmailMetadata = {
    to: toEmails,
    cc: ccEmails,
    subjectKeywords: extractSubjectKeywords(message.subject),
    hasAttachment: message.hasAttachments,
    importance: message.importance,
    isRead: message.isRead,
    conversationId: message.conversationId,
  };

  return {
    type: 'email_received',
    timestamp: new Date(message.receivedDateTime),
    actorId: toEmails[0], // Primary recipient
    targetId: fromEmail,
    metadata: {
      ...metadata,
      from: fromEmail,
      messageId: message.id,
    },
    rawData: {
      id: message.id,
      subject: message.subject,
      organizationId,
    },
  };
}

/**
 * Extract event from sent email
 */
export function extractSentEmailEvent(
  message: GraphMessage,
  organizationId: string
): ExtractedEvent {
  const fromEmail = message.from?.emailAddress?.address?.toLowerCase();
  const toEmails = extractRecipients(message.toRecipients);
  const ccEmails = extractRecipients(message.ccRecipients);

  const metadata: EmailMetadata = {
    to: toEmails,
    cc: ccEmails,
    subjectKeywords: extractSubjectKeywords(message.subject),
    hasAttachment: message.hasAttachments,
    importance: message.importance,
    isRead: true,
    conversationId: message.conversationId,
  };

  return {
    type: 'email_sent',
    timestamp: new Date(message.sentDateTime),
    actorId: fromEmail,
    targetId: toEmails[0], // Primary recipient
    metadata: {
      ...metadata,
      messageId: message.id,
      recipientCount: toEmails.length + ccEmails.length,
    },
    rawData: {
      id: message.id,
      subject: message.subject,
      organizationId,
    },
  };
}

/**
 * Batch extract events from messages
 */
export function extractEmailEvents(
  messages: GraphMessage[],
  type: 'received' | 'sent',
  organizationId: string
): ExtractedEvent[] {
  const extractor = type === 'received' ? extractReceivedEmailEvent : extractSentEmailEvent;
  return messages.map((message) => extractor(message, organizationId));
}

/**
 * Check if email is internal (within organization domain)
 */
export function isInternalEmail(email: string, orgDomains: string[]): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return orgDomains.some((d) => d.toLowerCase() === domain);
}

/**
 * Calculate email thread depth from conversation
 */
export function getThreadDepth(subject: string): number {
  const prefixes = subject.match(/^(re:|fw:|fwd:|aw:|wg:)\s*/gi) || [];
  return prefixes.length;
}
