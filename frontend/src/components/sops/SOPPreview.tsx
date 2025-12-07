/**
 * SOP Preview Component
 * Renders Markdown SOP content with styling and interactive elements
 */

import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface SOPPreviewProps {
  content: string;
  title?: string;
  showTitle?: boolean;
  className?: string;
}

export function SOPPreview({ content, title, showTitle = false, className = '' }: SOPPreviewProps) {
  // Parse and sanitize markdown
  const htmlContent = useMemo(() => {
    if (!content) return '';

    // Configure marked
    marked.setOptions({
      gfm: true,
      breaks: true,
    });

    // Parse markdown to HTML
    const rawHtml = marked.parse(content);

    // Sanitize HTML to prevent XSS
    const cleanHtml = DOMPurify.sanitize(rawHtml as string, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['target'],
    });

    // Process checkboxes
    const processedHtml = cleanHtml
      .replace(
        /\[ \]/g,
        '<input type="checkbox" class="sop-checkbox" disabled />'
      )
      .replace(
        /\[x\]/gi,
        '<input type="checkbox" class="sop-checkbox" checked disabled />'
      );

    return processedHtml;
  }, [content]);

  if (!content) {
    return (
      <div className="text-center py-12 text-gray-500">
        <svg
          className="w-16 h-16 mx-auto text-gray-300 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p>No content to preview</p>
      </div>
    );
  }

  return (
    <div className={`sop-preview ${className}`}>
      {showTitle && title && (
        <h1 className="text-3xl font-bold text-gray-900 mb-6 pb-4 border-b border-gray-200">
          {title}
        </h1>
      )}

      <div
        className="sop-content prose prose-blue max-w-none"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />

      <style>{`
        .sop-content h1 {
          font-size: 1.875rem;
          font-weight: 700;
          color: #111827;
          margin-top: 2rem;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #e5e7eb;
        }

        .sop-content h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: #1f2937;
          margin-top: 1.75rem;
          margin-bottom: 0.75rem;
        }

        .sop-content h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #374151;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }

        .sop-content h4 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #4b5563;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }

        .sop-content p {
          color: #374151;
          line-height: 1.75;
          margin-bottom: 1rem;
        }

        .sop-content ul,
        .sop-content ol {
          margin-bottom: 1rem;
          padding-left: 1.5rem;
        }

        .sop-content ul {
          list-style-type: disc;
        }

        .sop-content ol {
          list-style-type: decimal;
        }

        .sop-content li {
          color: #374151;
          line-height: 1.75;
          margin-bottom: 0.5rem;
        }

        .sop-content li > ul,
        .sop-content li > ol {
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .sop-content blockquote {
          border-left: 4px solid #3b82f6;
          padding-left: 1rem;
          margin: 1.5rem 0;
          color: #4b5563;
          font-style: italic;
          background-color: #f9fafb;
          padding: 1rem;
          border-radius: 0 0.5rem 0.5rem 0;
        }

        .sop-content code {
          background-color: #f3f4f6;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-family: 'Monaco', 'Consolas', monospace;
          font-size: 0.875rem;
          color: #1f2937;
        }

        .sop-content pre {
          background-color: #1f2937;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 1rem 0;
        }

        .sop-content pre code {
          background-color: transparent;
          padding: 0;
          color: #e5e7eb;
        }

        .sop-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5rem 0;
        }

        .sop-content th,
        .sop-content td {
          border: 1px solid #e5e7eb;
          padding: 0.75rem 1rem;
          text-align: left;
        }

        .sop-content th {
          background-color: #f3f4f6;
          font-weight: 600;
          color: #1f2937;
        }

        .sop-content tr:nth-child(even) {
          background-color: #f9fafb;
        }

        .sop-content hr {
          border: 0;
          border-top: 2px solid #e5e7eb;
          margin: 2rem 0;
        }

        .sop-content a {
          color: #2563eb;
          text-decoration: underline;
        }

        .sop-content a:hover {
          color: #1d4ed8;
        }

        .sop-content strong {
          font-weight: 600;
          color: #1f2937;
        }

        .sop-content em {
          font-style: italic;
        }

        .sop-content img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }

        .sop-checkbox {
          width: 1rem;
          height: 1rem;
          margin-right: 0.5rem;
          vertical-align: middle;
          accent-color: #2563eb;
        }

        /* Warning/Note/Tip boxes - common patterns in SOPs */
        .sop-content blockquote > p:first-child strong:first-child {
          display: block;
          margin-bottom: 0.25rem;
        }

        /* Flowchart/diagram placeholder styling */
        .sop-content p:has(img[alt*="flowchart"]),
        .sop-content p:has(img[alt*="diagram"]) {
          text-align: center;
          padding: 1rem;
          background-color: #f9fafb;
          border-radius: 0.5rem;
          border: 1px dashed #d1d5db;
        }

        /* Step numbering visual enhancement */
        .sop-content ol > li::marker {
          font-weight: 600;
          color: #2563eb;
        }

        /* Task list styling */
        .sop-content ul:has(.sop-checkbox) {
          list-style: none;
          padding-left: 0;
        }

        .sop-content ul:has(.sop-checkbox) li {
          display: flex;
          align-items: flex-start;
          padding: 0.5rem;
          border-radius: 0.375rem;
          margin-bottom: 0.25rem;
        }

        .sop-content ul:has(.sop-checkbox) li:hover {
          background-color: #f9fafb;
        }

        /* Definition list styling */
        .sop-content dl {
          margin: 1rem 0;
        }

        .sop-content dt {
          font-weight: 600;
          color: #1f2937;
          margin-top: 1rem;
        }

        .sop-content dd {
          margin-left: 1rem;
          color: #4b5563;
        }

        /* Timeline styling for steps with duration */
        .sop-content li em:first-child {
          color: #6b7280;
          font-size: 0.875rem;
        }

        @media print {
          .sop-content {
            font-size: 12pt;
          }

          .sop-content h1 {
            page-break-after: avoid;
          }

          .sop-content h2,
          .sop-content h3 {
            page-break-after: avoid;
          }

          .sop-content table,
          .sop-content pre,
          .sop-content blockquote {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

export default SOPPreview;
