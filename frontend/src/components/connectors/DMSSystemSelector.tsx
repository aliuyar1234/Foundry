/**
 * DMS System Selector
 * T178: Select between Docuware and M-Files DMS systems
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { FileText, FolderOpen } from 'lucide-react';

interface DMSSystem {
  id: 'docuware' | 'mfiles';
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
}

interface DMSSystemSelectorProps {
  onSelectSystem: (systemId: 'docuware' | 'mfiles') => void;
  onCancel?: () => void;
}

const DMS_SYSTEMS: DMSSystem[] = [
  {
    id: 'docuware',
    name: 'DocuWare',
    description: 'Enterprise document management and workflow automation',
    icon: <FileText className="w-8 h-8" />,
    features: [
      'Document archiving and indexing',
      'Workflow automation',
      'Cloud and on-premise support',
      'Full-text search',
      'Version control',
    ],
  },
  {
    id: 'mfiles',
    name: 'M-Files',
    description: 'Intelligent information management platform',
    icon: <FolderOpen className="w-8 h-8" />,
    features: [
      'Metadata-driven document management',
      'Automated workflows',
      'Multi-vault support',
      'AI-powered classification',
      'Integration with business systems',
    ],
  },
];

export function DMSSystemSelector({ onSelectSystem, onCancel }: DMSSystemSelectorProps) {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Select DMS System</h2>
        <p className="text-gray-600">
          Choose your document management system to connect and sync documents
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {DMS_SYSTEMS.map((system) => (
          <Card
            key={system.id}
            className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => onSelectSystem(system.id)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                    {system.icon}
                  </div>
                  <div>
                    <CardTitle className="text-xl">{system.name}</CardTitle>
                    <CardDescription className="mt-1">{system.description}</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                <p className="text-sm font-medium text-gray-700">Key Features:</p>
                <ul className="space-y-1">
                  {system.features.map((feature, index) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <Button className="w-full" onClick={() => onSelectSystem(system.id)}>
                Connect {system.name}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {onCancel && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default DMSSystemSelector;
