/**
 * Gmail Label and Folder Mapper
 * Task: T023
 *
 * Maps Gmail labels to organizational categories.
 * Supports both system and user-defined labels.
 */

import { GmailApiClient } from '../gmailClient';

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  color?: {
    textColor: string;
    backgroundColor: string;
  };
}

export interface LabelCategory {
  category: string;
  labels: GmailLabel[];
  messageCount: number;
}

export interface LabelMapping {
  labelId: string;
  labelName: string;
  normalizedCategory: string;
  businessContext?: string;
}

// System label mappings to business categories
const SYSTEM_LABEL_MAPPINGS: Record<string, string> = {
  INBOX: 'inbox',
  SENT: 'sent',
  DRAFT: 'drafts',
  TRASH: 'deleted',
  SPAM: 'spam',
  STARRED: 'important',
  IMPORTANT: 'important',
  CATEGORY_PERSONAL: 'personal',
  CATEGORY_SOCIAL: 'social',
  CATEGORY_PROMOTIONS: 'marketing',
  CATEGORY_UPDATES: 'updates',
  CATEGORY_FORUMS: 'forums',
};

// Business context keywords for auto-categorization
const BUSINESS_KEYWORDS: Record<string, string[]> = {
  sales: ['sales', 'deal', 'opportunity', 'proposal', 'quote'],
  support: ['support', 'ticket', 'help', 'issue', 'problem'],
  hr: ['hr', 'human resources', 'hiring', 'recruitment', 'employee'],
  finance: ['finance', 'invoice', 'payment', 'billing', 'accounting'],
  project: ['project', 'milestone', 'deadline', 'deliverable'],
  client: ['client', 'customer', 'account'],
  internal: ['internal', 'team', 'all-hands', 'announcement'],
};

export class GmailLabelMapper {
  private client: GmailApiClient;
  private labelCache: Map<string, GmailLabel> = new Map();

  constructor(client: GmailApiClient) {
    this.client = client;
  }

  /**
   * Fetch all labels for a user
   */
  async fetchLabels(userId: string = 'me'): Promise<GmailLabel[]> {
    const response = await this.client.listLabels(userId);
    const labels: GmailLabel[] = [];

    for (const label of response.labels || []) {
      const gmailLabel: GmailLabel = {
        id: label.id!,
        name: label.name!,
        type: label.type as 'system' | 'user',
        messageListVisibility: label.messageListVisibility as any,
        labelListVisibility: label.labelListVisibility as any,
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
        threadsTotal: label.threadsTotal,
        threadsUnread: label.threadsUnread,
        color: label.color as any,
      };

      labels.push(gmailLabel);
      this.labelCache.set(label.id!, gmailLabel);
    }

    return labels;
  }

  /**
   * Get label by ID
   */
  async getLabel(labelId: string, userId: string = 'me'): Promise<GmailLabel | null> {
    if (this.labelCache.has(labelId)) {
      return this.labelCache.get(labelId)!;
    }

    try {
      const label = await this.client.getLabel(labelId, userId);
      const gmailLabel: GmailLabel = {
        id: label.id!,
        name: label.name!,
        type: label.type as 'system' | 'user',
        messageListVisibility: label.messageListVisibility as any,
        labelListVisibility: label.labelListVisibility as any,
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
        color: label.color as any,
      };

      this.labelCache.set(labelId, gmailLabel);
      return gmailLabel;
    } catch {
      return null;
    }
  }

  /**
   * Map labels to normalized categories
   */
  mapLabelsToCategories(labelIds: string[]): LabelMapping[] {
    const mappings: LabelMapping[] = [];

    for (const labelId of labelIds) {
      const label = this.labelCache.get(labelId);
      const labelName = label?.name || labelId;

      // Check system label mapping first
      if (SYSTEM_LABEL_MAPPINGS[labelId]) {
        mappings.push({
          labelId,
          labelName,
          normalizedCategory: SYSTEM_LABEL_MAPPINGS[labelId],
        });
        continue;
      }

      // Try to infer business context from label name
      const lowerName = labelName.toLowerCase();
      let businessContext: string | undefined;

      for (const [context, keywords] of Object.entries(BUSINESS_KEYWORDS)) {
        if (keywords.some((kw) => lowerName.includes(kw))) {
          businessContext = context;
          break;
        }
      }

      // Determine category based on label hierarchy
      let normalizedCategory = 'other';
      if (labelName.includes('/')) {
        // Nested label - use parent as category
        normalizedCategory = labelName.split('/')[0].toLowerCase();
      } else if (label?.type === 'user') {
        normalizedCategory = 'user_label';
      }

      mappings.push({
        labelId,
        labelName,
        normalizedCategory,
        businessContext,
      });
    }

    return mappings;
  }

  /**
   * Group labels by category
   */
  groupLabelsByCategory(labels: GmailLabel[]): LabelCategory[] {
    const categories = new Map<string, LabelCategory>();

    for (const label of labels) {
      let category: string;

      if (label.type === 'system') {
        category = 'system';
      } else if (label.name.includes('/')) {
        category = label.name.split('/')[0];
      } else {
        category = 'user';
      }

      if (!categories.has(category)) {
        categories.set(category, {
          category,
          labels: [],
          messageCount: 0,
        });
      }

      const cat = categories.get(category)!;
      cat.labels.push(label);
      cat.messageCount += label.messagesTotal || 0;
    }

    return Array.from(categories.values());
  }

  /**
   * Get label statistics
   */
  getLabelStats(labels: GmailLabel[]): {
    totalLabels: number;
    systemLabels: number;
    userLabels: number;
    totalMessages: number;
    unreadMessages: number;
  } {
    const systemLabels = labels.filter((l) => l.type === 'system');
    const userLabels = labels.filter((l) => l.type === 'user');

    return {
      totalLabels: labels.length,
      systemLabels: systemLabels.length,
      userLabels: userLabels.length,
      totalMessages: labels.reduce((sum, l) => sum + (l.messagesTotal || 0), 0),
      unreadMessages: labels.reduce((sum, l) => sum + (l.messagesUnread || 0), 0),
    };
  }

  /**
   * Find labels matching a pattern
   */
  findLabels(pattern: string, labels: GmailLabel[]): GmailLabel[] {
    const lowerPattern = pattern.toLowerCase();
    return labels.filter((l) => l.name.toLowerCase().includes(lowerPattern));
  }

  /**
   * Get nested label structure
   */
  getLabelHierarchy(
    labels: GmailLabel[]
  ): Array<{
    label: GmailLabel;
    children: GmailLabel[];
    depth: number;
  }> {
    const hierarchy: Array<{
      label: GmailLabel;
      children: GmailLabel[];
      depth: number;
    }> = [];

    // Get top-level labels
    const topLevel = labels.filter((l) => !l.name.includes('/'));

    for (const label of topLevel) {
      const children = labels.filter(
        (l) => l.name.startsWith(label.name + '/') && l.id !== label.id
      );

      hierarchy.push({
        label,
        children,
        depth: 0,
      });
    }

    return hierarchy;
  }

  /**
   * Clear label cache
   */
  clearCache(): void {
    this.labelCache.clear();
  }
}

/**
 * Create label mapper
 */
export function createGmailLabelMapper(client: GmailApiClient): GmailLabelMapper {
  return new GmailLabelMapper(client);
}
