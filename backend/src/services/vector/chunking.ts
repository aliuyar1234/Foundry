/**
 * Text Chunking Utility (T022)
 * Splits documents into overlapping chunks for embedding
 */

import { logger } from '../../lib/logger.js';
import type { DocumentChunk, EmbeddingMetadata } from '../../models/Embedding.js';

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  maxTokens: number;
  overlapTokens: number;
  minChunkSize: number;
}

/**
 * Default chunking configuration
 * 512 tokens with 64 token overlap as per spec
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  maxTokens: 512,
  overlapTokens: 64,
  minChunkSize: 50,
};

/**
 * Approximate token count (4 chars per token)
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Convert token count to character count
 */
function tokensToChars(tokens: number): number {
  return tokens * 4;
}

/**
 * Find the best split point near a position (prefer sentence/paragraph boundaries)
 */
function findSplitPoint(text: string, targetPosition: number, searchRadius: number): number {
  const start = Math.max(0, targetPosition - searchRadius);
  const end = Math.min(text.length, targetPosition + searchRadius);
  const searchText = text.slice(start, end);

  // Priority order: paragraph, sentence, clause, word
  const boundaries = [
    /\n\n/g, // Paragraph
    /[.!?]\s+/g, // Sentence
    /[,;:]\s+/g, // Clause
    /\s+/g, // Word
  ];

  for (const boundary of boundaries) {
    let match;
    let bestMatch = null;
    let bestDistance = Infinity;

    while ((match = boundary.exec(searchText)) !== null) {
      const absolutePosition = start + match.index + match[0].length;
      const distance = Math.abs(absolutePosition - targetPosition);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = absolutePosition;
      }
    }

    if (bestMatch !== null) {
      return bestMatch;
    }
  }

  // Fallback to exact position
  return targetPosition;
}

/**
 * Split text into overlapping chunks
 */
export function chunkText(
  text: string,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): string[] {
  const { maxTokens, overlapTokens, minChunkSize } = config;

  // Clean and normalize text
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleanedText) {
    return [];
  }

  const estimatedTokens = estimateTokenCount(cleanedText);

  // If text fits in single chunk, return as-is
  if (estimatedTokens <= maxTokens) {
    return [cleanedText];
  }

  const chunks: string[] = [];
  const maxChars = tokensToChars(maxTokens);
  const overlapChars = tokensToChars(overlapTokens);
  const searchRadius = Math.floor(maxChars * 0.1); // 10% of chunk size

  let position = 0;

  while (position < cleanedText.length) {
    // Calculate end position for this chunk
    let endPosition = Math.min(position + maxChars, cleanedText.length);

    // If not at the end, find a good split point
    if (endPosition < cleanedText.length) {
      endPosition = findSplitPoint(cleanedText, endPosition, searchRadius);
    }

    // Extract chunk
    const chunk = cleanedText.slice(position, endPosition).trim();

    // Only add non-trivial chunks
    if (chunk.length >= minChunkSize) {
      chunks.push(chunk);
    }

    // Move position forward, accounting for overlap
    if (endPosition >= cleanedText.length) {
      break;
    }

    // Start next chunk with overlap
    position = Math.max(position + 1, endPosition - overlapChars);

    // Find a good start point for the next chunk
    if (position < cleanedText.length) {
      const nextStart = findSplitPoint(cleanedText, position, searchRadius / 2);
      position = Math.max(position, Math.min(nextStart, cleanedText.length - 1));
    }
  }

  logger.debug(
    {
      inputLength: text.length,
      estimatedTokens,
      chunksCreated: chunks.length,
      avgChunkSize: chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length,
    },
    'Text chunking complete'
  );

  return chunks;
}

/**
 * Create document chunks with metadata
 */
export function createDocumentChunks(
  content: string,
  baseMetadata: EmbeddingMetadata,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): DocumentChunk[] {
  const textChunks = chunkText(content, config);

  return textChunks.map((text, index) => ({
    content: text,
    index,
    metadata: {
      ...baseMetadata,
      chunkIndex: index,
      totalChunks: textChunks.length,
    },
  }));
}

/**
 * Generate content preview (first N characters)
 */
export function generateContentPreview(content: string, maxLength: number = 200): string {
  if (content.length <= maxLength) {
    return content;
  }

  // Try to cut at a word boundary
  const truncated = content.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Generate hash for chunk content (for deduplication)
 */
export async function generateChunkHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);

  // Use SubtleCrypto if available (browser/Node 15+), otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Simple fallback hash (not cryptographic, but good enough for deduplication)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
