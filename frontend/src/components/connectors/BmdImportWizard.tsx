/**
 * BMD Import Wizard Component (T157)
 * Multi-step wizard for importing BMD NTCS accounting data
 * Steps: File Upload -> Chart Selection -> Preview -> Import
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { BmdFileUpload, BmdFileFormat } from './BmdFileUpload';
import { BmdChartSelector, AustrianChartOfAccounts, AccountMapping } from './BmdChartSelector';
import { BmdImportStatus, ImportStatus, ImportProgress, ImportError, ImportSummary } from './BmdImportStatus';

interface BmdImportWizardProps {
  organizationId: string;
  onComplete?: (result: ImportResult) => void;
  onCancel?: () => void;
}

export interface ImportResult {
  success: boolean;
  importId: string;
  summary: ImportSummary;
}

export interface ImportConfig {
  file: File;
  fileFormat: BmdFileFormat;
  chartOfAccounts: AustrianChartOfAccounts;
  customMapping?: AccountMapping;
}

interface PreviewData {
  totalRecords: number;
  recordsByType: {
    type: string;
    label: string;
    count: number;
    sample: Record<string, any>[];
  }[];
  chartInfo: {
    chart: AustrianChartOfAccounts;
    accountsFound: number;
    unmappedAccounts: string[];
  };
}

type WizardStep = 'upload' | 'chart' | 'preview' | 'import';

export function BmdImportWizard({
  organizationId,
  onComplete,
  onCancel,
}: BmdImportWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [config, setConfig] = useState<Partial<ImportConfig>>({});
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Import status states
  const [importStatus, setImportStatus] = useState<ImportStatus>('pending');
  const [importProgress, setImportProgress] = useState<ImportProgress | undefined>();
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | undefined>();

  const steps: { id: WizardStep; title: string; description: string }[] = [
    {
      id: 'upload',
      title: 'Datei hochladen',
      description: 'BMD NTCS Datei auswählen',
    },
    {
      id: 'chart',
      title: 'Kontenrahmen',
      description: 'Kontenrahmen auswählen',
    },
    {
      id: 'preview',
      title: 'Vorschau',
      description: 'Daten überprüfen',
    },
    {
      id: 'import',
      title: 'Import',
      description: 'Daten importieren',
    },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const handleFileSelected = (file: File, format: BmdFileFormat) => {
    setConfig((prev) => ({
      ...prev,
      file,
      fileFormat: format,
    }));
  };

  const handleFileRemoved = () => {
    setConfig((prev) => ({
      ...prev,
      file: undefined,
      fileFormat: undefined,
    }));
  };

  const handleChartSelected = (
    chart: AustrianChartOfAccounts,
    customMapping?: AccountMapping
  ) => {
    setConfig((prev) => ({
      ...prev,
      chartOfAccounts: chart,
      customMapping,
    }));
    setCurrentStep('preview');
  };

  const loadPreviewData = async () => {
    setIsLoadingPreview(true);

    try {
      // In a real implementation, this would call an API endpoint
      // For now, we'll simulate the preview data
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const mockPreview: PreviewData = {
        totalRecords: 1250,
        recordsByType: [
          {
            type: 'journal_entries',
            label: 'Buchungssätze',
            count: 850,
            sample: [
              {
                date: '2024-01-15',
                account: '4000',
                description: 'Umsatzerlöse 20%',
                debit: 0,
                credit: 15000,
              },
              {
                date: '2024-01-15',
                account: '1200',
                description: 'Forderungen',
                debit: 15000,
                credit: 0,
              },
            ],
          },
          {
            type: 'accounts',
            label: 'Konten',
            count: 320,
            sample: [
              { number: '4000', name: 'Umsatzerlöse 20%', type: 'Ertrag' },
              { number: '5000', name: 'Wareneinkauf 20%', type: 'Aufwand' },
            ],
          },
          {
            type: 'business_partners',
            label: 'Geschäftspartner',
            count: 80,
            sample: [
              { id: 'K001', name: 'Mustermann GmbH', type: 'Kunde' },
              { id: 'L001', name: 'Lieferant AG', type: 'Lieferant' },
            ],
          },
        ],
        chartInfo: {
          chart: config.chartOfAccounts!,
          accountsFound: 320,
          unmappedAccounts: ['9999', '8888'],
        },
      };

      setPreviewData(mockPreview);
    } catch (error) {
      console.error('Error loading preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const startImport = async () => {
    setCurrentStep('import');
    setImportStatus('processing');

    try {
      // Simulate import process with progress updates
      const totalSteps = 4;
      const recordTypes = previewData!.recordsByType;

      // Step 1: Validating
      setImportProgress({
        currentStep: 'Validierung der Datei...',
        percentage: 25,
        recordsProcessed: 0,
        totalRecords: previewData!.totalRecords,
        byType: recordTypes.map((rt) => ({
          type: rt.type,
          label: rt.label,
          processed: 0,
          total: rt.count,
          status: 'pending',
        })),
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Step 2: Processing accounts
      setImportProgress({
        currentStep: 'Verarbeitung der Konten...',
        percentage: 40,
        recordsProcessed: 320,
        totalRecords: previewData!.totalRecords,
        byType: recordTypes.map((rt, idx) => ({
          type: rt.type,
          label: rt.label,
          processed: idx === 1 ? rt.count : 0,
          total: rt.count,
          status: idx === 1 ? 'completed' : idx > 1 ? 'pending' : 'processing',
        })),
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Step 3: Processing journal entries
      setImportProgress({
        currentStep: 'Verarbeitung der Buchungssätze...',
        percentage: 70,
        recordsProcessed: 900,
        totalRecords: previewData!.totalRecords,
        byType: recordTypes.map((rt, idx) => ({
          type: rt.type,
          label: rt.label,
          processed: idx <= 1 ? rt.count : Math.floor(rt.count * 0.7),
          total: rt.count,
          status: idx <= 1 ? 'completed' : 'processing',
        })),
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Add some mock warnings
      const mockErrors: ImportError[] = [
        {
          id: '1',
          type: 'validation',
          severity: 'warning',
          message: 'Konto 9999 nicht im Kontenrahmen gefunden',
          details: 'Das Konto wurde automatisch der Klasse "Sonstige" zugeordnet',
          accountNumber: '9999',
        },
        {
          id: '2',
          type: 'mapping',
          severity: 'warning',
          message: 'Ungewöhnlicher Buchungsbetrag erkannt',
          details: 'Betrag von 0,00 EUR wurde übersprungen',
          recordNumber: 542,
        },
      ];
      setImportErrors(mockErrors);

      // Step 4: Finalizing
      setImportProgress({
        currentStep: 'Abschluss des Imports...',
        percentage: 95,
        recordsProcessed: 1248,
        totalRecords: previewData!.totalRecords,
        byType: recordTypes.map((rt) => ({
          type: rt.type,
          label: rt.label,
          processed: rt.count,
          total: rt.count,
          status: 'completed',
        })),
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Complete
      const summary: ImportSummary = {
        totalRecords: previewData!.totalRecords,
        successfulRecords: 1248,
        failedRecords: 2,
        warnings: mockErrors.length,
        duration: 8,
        byType: recordTypes.map((rt) => ({
          type: rt.type,
          label: rt.label,
          count: rt.count,
        })),
      };

      setImportSummary(summary);
      setImportStatus('completed');

      if (onComplete) {
        onComplete({
          success: true,
          importId: `imp_${Date.now()}`,
          summary,
        });
      }
    } catch (error) {
      setImportStatus('failed');
      setImportErrors([
        {
          id: 'fatal',
          type: 'system',
          severity: 'error',
          message: 'Import konnte nicht abgeschlossen werden',
          details: error instanceof Error ? error.message : 'Unbekannter Fehler',
        },
      ]);
    }
  };

  const handleNext = () => {
    if (currentStep === 'upload' && config.file) {
      setCurrentStep('chart');
    } else if (currentStep === 'chart' && config.chartOfAccounts) {
      // Chart selection already advances to preview
    } else if (currentStep === 'preview') {
      startImport();
    }
  };

  const handleBack = () => {
    const stepOrder: WizardStep[] = ['upload', 'chart', 'preview', 'import'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    } else if (onCancel) {
      onCancel();
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'upload':
        return Boolean(config.file && config.fileFormat);
      case 'chart':
        return Boolean(config.chartOfAccounts);
      case 'preview':
        return previewData !== null;
      case 'import':
        return false;
      default:
        return false;
    }
  };

  // Load preview when entering preview step
  React.useEffect(() => {
    if (currentStep === 'preview' && !previewData && !isLoadingPreview) {
      loadPreviewData();
    }
  }, [currentStep]);

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <div>
            <CardTitle>BMD NTCS Import</CardTitle>
            <CardDescription>
              Importieren Sie Buchungsdaten aus BMD NTCS
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center ${
                  index < steps.length - 1 ? 'flex-1' : ''
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                    index < currentStepIndex
                      ? 'bg-green-500 text-white'
                      : index === currentStepIndex
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {index < currentStepIndex ? '✓' : index + 1}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      index < currentStepIndex ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-500">
            {steps.map((step) => (
              <div key={step.id} className="text-center">
                <div className="font-medium">{step.title}</div>
                <div className="text-gray-400">{step.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="mb-8 min-h-[400px]">
          {currentStep === 'upload' && (
            <div>
              <h3 className="text-lg font-medium mb-4">
                BMD NTCS Datei hochladen
              </h3>
              <BmdFileUpload
                onFileSelected={handleFileSelected}
                onFileRemoved={handleFileRemoved}
              />
            </div>
          )}

          {currentStep === 'chart' && (
            <div>
              <BmdChartSelector onChartSelected={handleChartSelected} />
            </div>
          )}

          {currentStep === 'preview' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Datenvorschau</h3>

              {isLoadingPreview ? (
                <div className="text-center py-12">
                  <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-gray-600">Lade Vorschau...</p>
                </div>
              ) : previewData ? (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-blue-900">
                            {previewData.totalRecords}
                          </div>
                          <div className="text-sm text-blue-700">Datensätze gesamt</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-blue-900">
                            {config.chartOfAccounts}
                          </div>
                          <div className="text-sm text-blue-700">Kontenrahmen</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-blue-900">
                            {previewData.chartInfo.accountsFound}
                          </div>
                          <div className="text-sm text-blue-700">Konten gefunden</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Records by Type */}
                  {previewData.recordsByType.map((recordType) => (
                    <Card key={recordType.type}>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span>{recordType.label}</span>
                          <span className="text-gray-500 font-normal">
                            {recordType.count} Datensätze
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xs">
                          <div className="font-medium text-gray-700 mb-2">
                            Beispieldaten:
                          </div>
                          <pre className="bg-gray-50 p-3 rounded border overflow-x-auto">
                            {JSON.stringify(recordType.sample, null, 2)}
                          </pre>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Warnings */}
                  {previewData.chartInfo.unmappedAccounts.length > 0 && (
                    <Card className="border-yellow-300 bg-yellow-50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-2">
                          <svg
                            className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-yellow-900">
                              Nicht zugeordnete Konten gefunden
                            </p>
                            <p className="text-xs text-yellow-800 mt-1">
                              Die folgenden Konten wurden nicht im Kontenrahmen gefunden:{' '}
                              {previewData.chartInfo.unmappedAccounts.join(', ')}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Fehler beim Laden der Vorschau
                </div>
              )}
            </div>
          )}

          {currentStep === 'import' && (
            <BmdImportStatus
              status={importStatus}
              progress={importProgress}
              errors={importErrors}
              summary={importSummary}
              onRetry={startImport}
              onClose={onCancel}
            />
          )}
        </div>

        {/* Navigation buttons */}
        {currentStep !== 'import' && (
          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBack}>
              {currentStepIndex === 0 ? 'Abbrechen' : 'Zurück'}
            </Button>
            <Button onClick={handleNext} disabled={!canProceed()}>
              {currentStep === 'preview' ? 'Import starten' : 'Weiter'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BmdImportWizard;
