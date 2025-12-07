/**
 * SOP Version Manager
 * Manages SOP versioning, diffs, and version history
 */

import { PrismaClient, SOPVersion } from '@prisma/client';
import * as diff from 'diff';

export interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  changes: VersionChange[];
  summary: {
    additions: number;
    deletions: number;
    modifications: number;
  };
  diffHtml: string;
  diffText: string;
}

export interface VersionChange {
  type: 'add' | 'remove' | 'modify';
  lineNumber?: number;
  section?: string;
  oldContent?: string;
  newContent?: string;
}

export interface VersionHistoryEntry {
  id: string;
  version: string;
  createdAt: Date;
  createdBy: string;
  changeNotes?: string;
  size: number;
  isCurrent: boolean;
}

export interface BranchInfo {
  name: string;
  baseVersion: string;
  currentVersion: string;
  createdAt: Date;
  createdBy: string;
}

export class VersionManager {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Get version history for an SOP
   */
  async getVersionHistory(sopId: string): Promise<VersionHistoryEntry[]> {
    const sop = await this.prisma.sOP.findUnique({
      where: { id: sopId },
      select: { version: true },
    });

    const versions = await this.prisma.sOPVersion.findMany({
      where: { sopId },
      orderBy: { createdAt: 'desc' },
    });

    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      changeNotes: v.changeNotes || undefined,
      size: v.content.length,
      isCurrent: v.version === sop?.version,
    }));
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    sopId: string,
    fromVersionId: string,
    toVersionId: string
  ): Promise<VersionComparison> {
    const [fromVersion, toVersion] = await Promise.all([
      this.prisma.sOPVersion.findUnique({ where: { id: fromVersionId } }),
      this.prisma.sOPVersion.findUnique({ where: { id: toVersionId } }),
    ]);

    if (!fromVersion || !toVersion) {
      throw new Error('One or both versions not found');
    }

    if (fromVersion.sopId !== sopId || toVersion.sopId !== sopId) {
      throw new Error('Versions do not belong to the specified SOP');
    }

    // Generate diff
    const changes = diff.diffLines(fromVersion.content, toVersion.content);

    // Analyze changes
    const versionChanges: VersionChange[] = [];
    let lineNumber = 1;
    let additions = 0;
    let deletions = 0;
    let modifications = 0;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];

      if (change.added) {
        additions += change.count || 1;
        versionChanges.push({
          type: 'add',
          lineNumber,
          newContent: change.value,
          section: this.detectSection(change.value),
        });
      } else if (change.removed) {
        deletions += change.count || 1;

        // Check if next change is an addition (modification)
        const nextChange = changes[i + 1];
        if (nextChange && nextChange.added) {
          modifications++;
          versionChanges.push({
            type: 'modify',
            lineNumber,
            oldContent: change.value,
            newContent: nextChange.value,
            section: this.detectSection(change.value),
          });
          i++; // Skip the next addition since we handled it
        } else {
          versionChanges.push({
            type: 'remove',
            lineNumber,
            oldContent: change.value,
            section: this.detectSection(change.value),
          });
        }
      }

      lineNumber += change.count || 1;
    }

    // Generate HTML diff
    const diffHtml = this.generateHtmlDiff(changes);

    // Generate text diff
    const diffText = this.generateTextDiff(changes);

    return {
      fromVersion: fromVersion.version,
      toVersion: toVersion.version,
      changes: versionChanges,
      summary: {
        additions,
        deletions,
        modifications,
      },
      diffHtml,
      diffText,
    };
  }

  /**
   * Compare current version with a previous version
   */
  async compareWithCurrent(sopId: string, versionId: string): Promise<VersionComparison> {
    const sop = await this.prisma.sOP.findUnique({
      where: { id: sopId },
    });

    if (!sop) {
      throw new Error('SOP not found');
    }

    const currentVersion = await this.prisma.sOPVersion.findFirst({
      where: { sopId, version: sop.version },
    });

    if (!currentVersion) {
      throw new Error('Current version not found');
    }

    return this.compareVersions(sopId, versionId, currentVersion.id);
  }

  /**
   * Get diff between consecutive versions
   */
  async getVersionDiff(sopId: string, versionId: string): Promise<VersionComparison | null> {
    const version = await this.prisma.sOPVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      throw new Error('Version not found');
    }

    // Find previous version
    const previousVersion = await this.prisma.sOPVersion.findFirst({
      where: {
        sopId,
        createdAt: { lt: version.createdAt },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!previousVersion) {
      return null; // First version, no diff
    }

    return this.compareVersions(sopId, previousVersion.id, versionId);
  }

  /**
   * Create a version tag/label
   */
  async tagVersion(
    sopId: string,
    versionId: string,
    tag: string,
    taggedBy: string
  ): Promise<void> {
    const version = await this.prisma.sOPVersion.findUnique({
      where: { id: versionId },
    });

    if (!version || version.sopId !== sopId) {
      throw new Error('Version not found');
    }

    // Store tag in metadata
    await this.prisma.sOPVersion.update({
      where: { id: versionId },
      data: {
        changeNotes: version.changeNotes
          ? `${version.changeNotes} [Tag: ${tag}]`
          : `[Tag: ${tag}]`,
      },
    });
  }

  /**
   * Find versions by tag
   */
  async findVersionsByTag(sopId: string, tag: string): Promise<SOPVersion[]> {
    return this.prisma.sOPVersion.findMany({
      where: {
        sopId,
        changeNotes: { contains: `[Tag: ${tag}]` },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get version count
   */
  async getVersionCount(sopId: string): Promise<number> {
    return this.prisma.sOPVersion.count({
      where: { sopId },
    });
  }

  /**
   * Cleanup old versions (keep last N versions)
   */
  async cleanupOldVersions(sopId: string, keepCount: number = 10): Promise<number> {
    const versions = await this.prisma.sOPVersion.findMany({
      where: { sopId },
      orderBy: { createdAt: 'desc' },
      skip: keepCount,
    });

    if (versions.length === 0) {
      return 0;
    }

    const deleteIds = versions.map((v) => v.id);

    await this.prisma.sOPVersion.deleteMany({
      where: { id: { in: deleteIds } },
    });

    return deleteIds.length;
  }

  /**
   * Detect section from content
   */
  private detectSection(content: string): string | undefined {
    // Look for markdown headers
    const headerMatch = content.match(/^(#{1,6})\s+(.+)$/m);
    if (headerMatch) {
      return headerMatch[2].trim();
    }

    // Look for numbered sections
    const numberedMatch = content.match(/^(\d+\.)+\s+(.+)$/m);
    if (numberedMatch) {
      return numberedMatch[0].trim();
    }

    return undefined;
  }

  /**
   * Generate HTML diff representation
   */
  private generateHtmlDiff(changes: diff.Change[]): string {
    let html = '<div class="diff">';

    for (const change of changes) {
      const escapedValue = this.escapeHtml(change.value);
      const lines = escapedValue.split('\n').filter((l) => l.length > 0);

      for (const line of lines) {
        if (change.added) {
          html += `<div class="diff-add">+ ${line}</div>`;
        } else if (change.removed) {
          html += `<div class="diff-remove">- ${line}</div>`;
        } else {
          html += `<div class="diff-unchanged">  ${line}</div>`;
        }
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * Generate text diff representation
   */
  private generateTextDiff(changes: diff.Change[]): string {
    let text = '';

    for (const change of changes) {
      const lines = change.value.split('\n').filter((l) => l.length > 0);

      for (const line of lines) {
        if (change.added) {
          text += `+ ${line}\n`;
        } else if (change.removed) {
          text += `- ${line}\n`;
        } else {
          text += `  ${line}\n`;
        }
      }
    }

    return text;
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
  }

  /**
   * Parse semantic version string
   */
  parseVersion(version: string): { major: number; minor: number; patch: string } {
    const parts = version.split('.');
    return {
      major: parseInt(parts[0], 10) || 1,
      minor: parseInt(parts[1], 10) || 0,
      patch: parts.slice(2).join('.') || '0',
    };
  }

  /**
   * Compare version strings
   */
  compareVersionStrings(v1: string, v2: string): number {
    const parsed1 = this.parseVersion(v1);
    const parsed2 = this.parseVersion(v2);

    if (parsed1.major !== parsed2.major) {
      return parsed1.major - parsed2.major;
    }
    if (parsed1.minor !== parsed2.minor) {
      return parsed1.minor - parsed2.minor;
    }
    return parsed1.patch.localeCompare(parsed2.patch);
  }
}

// Factory function
export function createVersionManager(prisma?: PrismaClient): VersionManager {
  return new VersionManager(prisma);
}

export default VersionManager;
