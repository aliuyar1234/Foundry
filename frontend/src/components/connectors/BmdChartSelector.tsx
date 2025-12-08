/**
 * BMD Chart of Accounts Selector Component (T159)
 * Allows selection of Austrian chart of accounts (EKR/RLG)
 * Provides preview of account classes and custom mapping options
 */

import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface BmdChartSelectorProps {
  onChartSelected: (chart: AustrianChartOfAccounts, customMapping?: AccountMapping) => void;
  allowCustomMapping?: boolean;
}

export type AustrianChartOfAccounts = 'EKR' | 'RLG';

export interface AccountMapping {
  accountRanges: AccountRange[];
  customRules: CustomMappingRule[];
}

export interface AccountRange {
  from: string;
  to: string;
  category: string;
  description: string;
}

export interface CustomMappingRule {
  accountPattern: string;
  targetCategory: string;
  description: string;
}

const CHART_DEFINITIONS = {
  EKR: {
    name: 'Einnahmen-Ausgaben-Rechnung (EKR)',
    description:
      'Vereinfachte Gewinnermittlung für kleine Unternehmen nach § 4 Abs. 3 EStG',
    accountClasses: [
      {
        class: '0',
        name: 'Anlagevermögen',
        description: 'Grundstücke, Gebäude, Maschinen, Betriebs- und Geschäftsausstattung',
        examples: ['0100-0199: Grundstücke', '0200-0299: Gebäude'],
      },
      {
        class: '1',
        name: 'Umlaufvermögen',
        description: 'Vorräte, Forderungen, liquide Mittel',
        examples: ['1000-1099: Vorräte', '1200-1299: Forderungen aus L+L'],
      },
      {
        class: '2',
        name: 'Eigenkapital',
        description: 'Eigenkapital und Rücklagen',
        examples: ['2000-2099: Eigenkapital', '2100-2199: Rücklagen'],
      },
      {
        class: '3',
        name: 'Fremdkapital',
        description: 'Verbindlichkeiten und Rückstellungen',
        examples: ['3000-3099: Verbindlichkeiten', '3200-3299: Rückstellungen'],
      },
      {
        class: '4',
        name: 'Betriebliche Erträge',
        description: 'Umsatzerlöse und sonstige betriebliche Erträge',
        examples: ['4000-4099: Umsatzerlöse 20%', '4500-4599: Umsatzerlöse 10%'],
      },
      {
        class: '5',
        name: 'Materialaufwand',
        description: 'Wareneinkauf und Materialaufwand',
        examples: ['5000-5099: Wareneinkauf 20%', '5500-5599: Wareneinkauf 10%'],
      },
      {
        class: '6',
        name: 'Personalaufwand',
        description: 'Löhne, Gehälter und Sozialaufwand',
        examples: ['6000-6099: Gehälter', '6200-6299: Sozialversicherung'],
      },
      {
        class: '7',
        name: 'Sonstige Aufwendungen',
        description: 'Betriebliche Aufwendungen, Abschreibungen',
        examples: ['7000-7099: Raumkosten', '7600-7699: Abschreibungen'],
      },
    ],
    note: 'Die EKR ist für kleinere Unternehmen geeignet und bietet eine vereinfachte Buchführung.',
  },
  RLG: {
    name: 'Rechnungslegungsgesetz (RLG)',
    description:
      'Vollständiger Kontenrahmen nach dem österreichischen Rechnungslegungsgesetz',
    accountClasses: [
      {
        class: '0',
        name: 'Anlagevermögen',
        description: 'Immaterielle Vermögensgegenstände, Sachanlagen, Finanzanlagen',
        examples: [
          '0000-0199: Immaterielle Vermögensgegenstände',
          '0200-0699: Sachanlagen',
        ],
      },
      {
        class: '1',
        name: 'Umlaufvermögen',
        description: 'Vorräte, Forderungen, Wertpapiere, Kassa/Bank',
        examples: ['1000-1399: Vorräte', '1400-1799: Forderungen'],
      },
      {
        class: '2',
        name: 'Eigenkapital und Rückstellungen',
        description: 'Grund-/Stammkapital, Rücklagen, Rückstellungen',
        examples: ['2000-2399: Eigenkapital', '2400-2899: Rückstellungen'],
      },
      {
        class: '3',
        name: 'Verbindlichkeiten',
        description: 'Verbindlichkeiten gegenüber Kreditinstituten und Lieferanten',
        examples: [
          '3000-3399: Verbindlichkeiten Banken',
          '3400-3799: Verbindlichkeiten L+L',
        ],
      },
      {
        class: '4',
        name: 'Betriebliche Erträge',
        description: 'Umsatzerlöse und Bestandsveränderungen',
        examples: ['4000-4399: Umsatzerlöse', '4400-4799: Bestandsveränderungen'],
      },
      {
        class: '5',
        name: 'Materialaufwand',
        description: 'Aufwendungen für Material und bezogene Leistungen',
        examples: ['5000-5399: Materialaufwand', '5400-5799: Bezogene Leistungen'],
      },
      {
        class: '6',
        name: 'Personalaufwand',
        description: 'Löhne, Gehälter und gesetzlicher Sozialaufwand',
        examples: ['6000-6399: Löhne und Gehälter', '6400-6799: Sozialaufwand'],
      },
      {
        class: '7',
        name: 'Abschreibungen und sonstige Aufwendungen',
        description: 'Abschreibungen, Steuern und sonstige betriebliche Aufwendungen',
        examples: ['7000-7399: Abschreibungen', '7400-7799: Sonstige Aufwendungen'],
      },
      {
        class: '8',
        name: 'Finanzerträge und -aufwendungen',
        description: 'Zinsen, Beteiligungserträge und Finanzaufwendungen',
        examples: ['8000-8399: Finanzerträge', '8400-8799: Finanzaufwendungen'],
      },
      {
        class: '9',
        name: 'Außerordentliche Posten und Steuern',
        description: 'Außerordentliche Erträge/Aufwendungen und Ertragsteuern',
        examples: [
          '9000-9399: Außerordentliche Posten',
          '9400-9799: Ertragsteuern',
        ],
      },
    ],
    note: 'Der RLG-Kontenrahmen ist für mittlere und große Unternehmen vorgeschrieben und bietet eine detaillierte Gliederung.',
  },
};

export function BmdChartSelector({
  onChartSelected,
  allowCustomMapping = true,
}: BmdChartSelectorProps) {
  const [selectedChart, setSelectedChart] = useState<AustrianChartOfAccounts | null>(
    null
  );
  const [showCustomMapping, setShowCustomMapping] = useState(false);
  const [customRules, setCustomRules] = useState<CustomMappingRule[]>([]);

  const handleChartSelection = (chart: AustrianChartOfAccounts) => {
    setSelectedChart(chart);
    setShowCustomMapping(false);
  };

  const handleConfirmSelection = () => {
    if (!selectedChart) return;

    const mapping: AccountMapping | undefined = showCustomMapping
      ? {
          accountRanges: [],
          customRules,
        }
      : undefined;

    onChartSelected(selectedChart, mapping);
  };

  const addCustomRule = () => {
    setCustomRules([
      ...customRules,
      {
        accountPattern: '',
        targetCategory: '',
        description: '',
      },
    ]);
  };

  const updateCustomRule = (
    index: number,
    field: keyof CustomMappingRule,
    value: string
  ) => {
    const updated = [...customRules];
    updated[index] = { ...updated[index], [field]: value };
    setCustomRules(updated);
  };

  const removeCustomRule = (index: number) => {
    setCustomRules(customRules.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Chart Selection */}
      {!selectedChart ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Kontenrahmen auswählen
            </h3>
            <p className="text-sm text-gray-500">
              Wählen Sie den in Ihrer BMD-Installation verwendeten Kontenrahmen.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {(Object.keys(CHART_DEFINITIONS) as AustrianChartOfAccounts[]).map(
              (chartKey) => {
                const chart = CHART_DEFINITIONS[chartKey];
                return (
                  <Card
                    key={chartKey}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleChartSelection(chartKey)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-lg font-semibold text-gray-900">
                              {chartKey}
                            </h4>
                            <Badge variant="secondary">
                              {chart.accountClasses.length} Kontenklassen
                            </Badge>
                          </div>
                          <h5 className="text-sm font-medium text-gray-700">
                            {chart.name}
                          </h5>
                        </div>
                        <div className="p-2 bg-blue-100 rounded-lg">
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
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </div>
                      </div>

                      <p className="text-sm text-gray-600 mb-4">{chart.description}</p>

                      <div className="p-3 bg-gray-50 rounded border border-gray-200">
                        <p className="text-xs text-gray-500 italic">{chart.note}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Selected Chart Overview */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Kontenrahmen: {selectedChart}
                </h3>
                <p className="text-sm text-gray-500">
                  {CHART_DEFINITIONS[selectedChart].name}
                </p>
              </div>
              <Button variant="outline" onClick={() => setSelectedChart(null)}>
                Ändern
              </Button>
            </div>
          </div>

          {/* Account Classes Preview */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Kontenklassen-Übersicht
            </h4>
            <div className="space-y-2">
              {CHART_DEFINITIONS[selectedChart].accountClasses.map((ac) => (
                <Card key={ac.class}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                        <span className="font-bold text-blue-700">{ac.class}</span>
                      </div>
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900 mb-1">{ac.name}</h5>
                        <p className="text-sm text-gray-600 mb-2">{ac.description}</p>
                        <div className="text-xs text-gray-500">
                          <strong>Beispiele:</strong>
                          <ul className="list-disc list-inside mt-1">
                            {ac.examples.map((example, idx) => (
                              <li key={idx}>{example}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Custom Mapping Option */}
          {allowCustomMapping && (
            <div className="border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">
                    Benutzerdefinierte Zuordnung
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Optional: Erstellen Sie eigene Zuordnungsregeln für spezielle Konten
                  </p>
                </div>
                <Button
                  variant={showCustomMapping ? 'secondary' : 'outline'}
                  onClick={() => setShowCustomMapping(!showCustomMapping)}
                >
                  {showCustomMapping ? 'Ausblenden' : 'Anpassen'}
                </Button>
              </div>

              {showCustomMapping && (
                <div className="space-y-4">
                  {customRules.map((rule, index) => (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Kontenmuster
                            </label>
                            <input
                              type="text"
                              value={rule.accountPattern}
                              onChange={(e) =>
                                updateCustomRule(index, 'accountPattern', e.target.value)
                              }
                              placeholder="z.B. 4*"
                              className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Zielkategorie
                            </label>
                            <input
                              type="text"
                              value={rule.targetCategory}
                              onChange={(e) =>
                                updateCustomRule(index, 'targetCategory', e.target.value)
                              }
                              placeholder="z.B. Erlöse"
                              className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                          </div>
                          <div className="flex items-end">
                            <button
                              onClick={() => removeCustomRule(index)}
                              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                            >
                              Entfernen
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  <Button variant="outline" onClick={addCustomRule}>
                    + Regel hinzufügen
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Confirm Button */}
          <div className="flex justify-end">
            <Button onClick={handleConfirmSelection}>
              Kontenrahmen bestätigen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BmdChartSelector;
