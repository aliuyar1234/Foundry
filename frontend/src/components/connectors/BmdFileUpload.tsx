/**
 * BMD File Upload Component (T158)
 * Drag-and-drop file upload for BMD NTCS accounting files
 * Supports .ntcs and .csv file formats
 */

import React, { useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';

interface BmdFileUploadProps {
  onFileSelected: (file: File, format: BmdFileFormat) => void;
  onFileRemoved?: () => void;
  acceptedFormats?: string[];
  maxFileSize?: number; // in MB
}

export type BmdFileFormat = 'NTCS' | 'CSV' | 'UNKNOWN';

interface FilePreview {
  file: File;
  format: BmdFileFormat;
  size: string;
  preview: string[];
}

export function BmdFileUpload({
  onFileSelected,
  onFileRemoved,
  acceptedFormats = ['.ntcs', '.csv'],
  maxFileSize = 50,
}: BmdFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detectFileFormat = (file: File): BmdFileFormat => {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'ntcs') {
      return 'NTCS';
    } else if (extension === 'csv') {
      return 'CSV';
    }

    return 'UNKNOWN';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const readFilePreview = async (file: File): Promise<string[]> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').slice(0, 5); // First 5 lines
        resolve(lines);
      };
      reader.onerror = () => {
        resolve(['Error reading file preview']);
      };
      reader.readAsText(file.slice(0, 2048)); // Read first 2KB for preview
    });
  };

  const validateAndProcessFile = async (file: File) => {
    setError(null);

    // Validate file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!acceptedFormats.includes(extension)) {
      setError(
        `Ungültiges Dateiformat. Akzeptiert werden: ${acceptedFormats.join(', ')}`
      );
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxFileSize) {
      setError(
        `Datei ist zu groß (${formatFileSize(file.size)}). Maximale Größe: ${maxFileSize}MB`
      );
      return;
    }

    // Detect format
    const format = detectFileFormat(file);
    if (format === 'UNKNOWN') {
      setError('Dateiformat konnte nicht erkannt werden');
      return;
    }

    // Read preview
    const preview = await readFilePreview(file);

    // Set preview
    setFilePreview({
      file,
      format,
      size: formatFileSize(file.size),
      preview,
    });

    // Notify parent
    onFileSelected(file, format);
  };

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        validateAndProcessFile(files[0]);
      }
    },
    [acceptedFormats, maxFileSize]
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        validateAndProcessFile(files[0]);
      }
    },
    [acceptedFormats, maxFileSize]
  );

  const handleRemoveFile = () => {
    setFilePreview(null);
    setError(null);
    if (onFileRemoved) {
      onFileRemoved();
    }
  };

  return (
    <div className="space-y-4">
      {!filePreview ? (
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : error
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept={acceptedFormats.join(',')}
            onChange={handleFileInput}
          />

          <div className="space-y-4">
            <div className="flex justify-center">
              <svg
                className={`w-16 h-16 ${error ? 'text-red-400' : 'text-gray-400'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>

            <div>
              <label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-blue-600 hover:text-blue-700 font-medium">
                  Datei auswählen
                </span>
              </label>
              <span className="text-gray-600"> oder hierher ziehen</span>
            </div>

            <div className="text-sm text-gray-500">
              <div>
                Unterstützte Formate: <strong>{acceptedFormats.join(', ')}</strong>
              </div>
              <div>Maximale Größe: {maxFileSize}MB</div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="mt-6 p-4 bg-blue-50 rounded-lg text-left">
              <p className="font-medium text-blue-900 text-sm mb-2">
                BMD NTCS Dateiexport:
              </p>
              <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                <li>Öffnen Sie BMD NTCS</li>
                <li>Gehen Sie zu: Datei → Export → Buchungsdaten</li>
                <li>Wählen Sie NTCS- oder CSV-Format</li>
                <li>Speichern und hier hochladen</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4 flex-1">
                <div className="p-3 bg-green-100 rounded-lg">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900">
                      {filePreview.file.name}
                    </h4>
                    <Badge variant="secondary">{filePreview.format}</Badge>
                  </div>

                  <p className="text-sm text-gray-500 mb-3">
                    Größe: {filePreview.size}
                  </p>

                  <div className="bg-gray-50 rounded border border-gray-200 p-3">
                    <p className="text-xs font-medium text-gray-700 mb-2">
                      Dateivorschau:
                    </p>
                    <pre className="text-xs text-gray-600 font-mono overflow-x-auto">
                      {filePreview.preview.join('\n')}
                    </pre>
                  </div>

                  {filePreview.format === 'CSV' && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      <strong>Hinweis:</strong> CSV-Dateien müssen dem BMD-Standard
                      entsprechen (Semikolon-getrennt, UTF-8).
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleRemoveFile}
                className="ml-4 text-gray-400 hover:text-gray-600"
                title="Datei entfernen"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default BmdFileUpload;
