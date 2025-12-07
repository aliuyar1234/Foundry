/**
 * Message Bubble Component
 * T089 - Create message bubble component
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { type ChatMessage } from '../../services/assistantApi';

interface MessageBubbleProps {
  message: ChatMessage;
  onClick?: () => void;
  isSelected?: boolean;
  isStreaming?: boolean;
}

export function MessageBubble({
  message,
  onClick,
  isSelected,
  isStreaming,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-gray-100 text-gray-600 text-sm px-4 py-2 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      onClick={onClick}
    >
      <div
        className={`max-w-[80%] rounded-lg p-4 ${
          isUser
            ? 'bg-blue-500 text-white'
            : `bg-gray-100 text-gray-900 ${
                isSelected ? 'ring-2 ring-blue-300' : ''
              } ${onClick ? 'cursor-pointer hover:bg-gray-200' : ''}`
        } ${isStreaming ? 'animate-pulse' : ''}`}
      >
        {/* Message Content */}
        <div className="prose prose-sm max-w-none">
          {formatContent(message.content)}
        </div>

        {/* Citations indicator */}
        {message.citations && message.citations.length > 0 && !isUser && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>📚</span>
              <span>{message.citations.length} sources</span>
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-xs mt-2 ${
            isUser ? 'text-blue-200' : 'text-gray-400'
          }`}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

/**
 * Format message content with markdown-like styling
 */
function formatContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith('### ')) {
      if (inList) {
        elements.push(renderList(listItems, i));
        listItems = [];
        inList = false;
      }
      elements.push(
        <h4 key={i} className="font-semibold text-sm mt-3 mb-1">
          {line.slice(4)}
        </h4>
      );
      continue;
    }

    if (line.startsWith('## ')) {
      if (inList) {
        elements.push(renderList(listItems, i));
        listItems = [];
        inList = false;
      }
      elements.push(
        <h3 key={i} className="font-semibold mt-3 mb-1">
          {line.slice(3)}
        </h3>
      );
      continue;
    }

    // Lists
    if (line.match(/^[-*]\s/)) {
      inList = true;
      listItems.push(line.slice(2));
      continue;
    }

    if (line.match(/^\d+\.\s/)) {
      inList = true;
      listItems.push(line.replace(/^\d+\.\s/, ''));
      continue;
    }

    // End list if we hit a non-list line
    if (inList && line.trim()) {
      elements.push(renderList(listItems, i));
      listItems = [];
      inList = false;
    }

    // Empty line
    if (!line.trim()) {
      if (inList) {
        elements.push(renderList(listItems, i));
        listItems = [];
        inList = false;
      }
      elements.push(<br key={i} />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="mb-2">
        {formatInlineStyles(line)}
      </p>
    );
  }

  // Handle remaining list items
  if (inList && listItems.length > 0) {
    elements.push(renderList(listItems, lines.length));
  }

  return elements;
}

/**
 * Render a list
 */
function renderList(items: string[], key: number): React.ReactNode {
  return (
    <ul key={`list-${key}`} className="list-disc list-inside my-2 space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm">
          {formatInlineStyles(item)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Format inline styles like bold and italic
 */
function formatInlineStyles(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(remaining.slice(0, boldMatch.index));
      }
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/\*(.+?)\*/);
    if (italicMatch && italicMatch.index !== undefined) {
      if (italicMatch.index > 0) {
        parts.push(remaining.slice(0, italicMatch.index));
      }
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
      continue;
    }

    // Code
    const codeMatch = remaining.match(/`(.+?)`/);
    if (codeMatch && codeMatch.index !== undefined) {
      if (codeMatch.index > 0) {
        parts.push(remaining.slice(0, codeMatch.index));
      }
      parts.push(
        <code key={key++} className="bg-gray-200 px-1 rounded text-sm">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
      continue;
    }

    // No more matches, add remaining text
    parts.push(remaining);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/**
 * Format timestamp
 */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default MessageBubble;
