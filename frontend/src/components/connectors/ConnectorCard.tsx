/**
 * ConnectorCard Component (T194)
 * Card component for marketplace display of available connectors
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export interface ConnectorType {
  id: string;
  name: string;
  description: string;
  category: 'ERP' | 'CRM' | 'Communication' | 'Accounting' | 'DMS' | 'Other';
  logo?: string;
  status?: 'available' | 'installed' | 'beta' | 'coming_soon';
  features?: string[];
  version?: string;
}

interface ConnectorCardProps {
  connector: ConnectorType;
  onAdd?: (connectorId: string) => void;
  onConfigure?: (connectorId: string) => void;
  isInstalled?: boolean;
  isLoading?: boolean;
}

const categoryColors: Record<ConnectorType['category'], string> = {
  ERP: 'bg-blue-100 text-blue-800',
  CRM: 'bg-green-100 text-green-800',
  Communication: 'bg-purple-100 text-purple-800',
  Accounting: 'bg-orange-100 text-orange-800',
  DMS: 'bg-pink-100 text-pink-800',
  Other: 'bg-gray-100 text-gray-800',
};

const statusColors: Record<NonNullable<ConnectorType['status']>, string> = {
  available: 'bg-green-100 text-green-800',
  installed: 'bg-blue-100 text-blue-800',
  beta: 'bg-yellow-100 text-yellow-800',
  coming_soon: 'bg-gray-100 text-gray-800',
};

export function ConnectorCard({
  connector,
  onAdd,
  onConfigure,
  isInstalled = false,
  isLoading = false,
}: ConnectorCardProps) {
  const handleAction = () => {
    if (isInstalled && onConfigure) {
      onConfigure(connector.id);
    } else if (!isInstalled && onAdd) {
      onAdd(connector.id);
    }
  };

  const isComingSoon = connector.status === 'coming_soon';

  return (
    <Card className="hover:shadow-lg transition-shadow h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between mb-2">
          {/* Logo */}
          {connector.logo ? (
            <img
              src={connector.logo}
              alt={`${connector.name} logo`}
              className="w-12 h-12 rounded-lg object-contain"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
          )}

          {/* Status Badge */}
          {connector.status && (
            <Badge className={statusColors[connector.status]}>
              {connector.status.replace('_', ' ')}
            </Badge>
          )}
        </div>

        <CardTitle className="text-lg">{connector.name}</CardTitle>
        <CardDescription className="line-clamp-2">{connector.description}</CardDescription>
      </CardHeader>

      <CardContent className="pb-3 flex-1">
        <div className="space-y-3">
          {/* Category Badge */}
          <div>
            <Badge variant="outline" className={categoryColors[connector.category]}>
              {connector.category}
            </Badge>
          </div>

          {/* Features */}
          {connector.features && connector.features.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Key Features:</p>
              <ul className="space-y-1">
                {connector.features.slice(0, 3).map((feature, index) => (
                  <li key={index} className="text-xs text-gray-600 flex items-start gap-1">
                    <svg
                      className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="line-clamp-1">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Version */}
          {connector.version && (
            <p className="text-xs text-gray-500">Version {connector.version}</p>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-0">
        <Button
          onClick={handleAction}
          disabled={isComingSoon || isLoading}
          variant={isInstalled ? 'outline' : 'default'}
          className="w-full"
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading...
            </>
          ) : isComingSoon ? (
            'Coming Soon'
          ) : isInstalled ? (
            'Configure'
          ) : (
            'Add Connector'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Connector Card Skeleton for loading state
 */
export function ConnectorCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="w-12 h-12 rounded-lg bg-gray-200 animate-pulse" />
          <div className="h-6 w-20 rounded-full bg-gray-200 animate-pulse" />
        </div>
        <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-3">
          <div className="h-6 w-24 rounded-full bg-gray-200 animate-pulse" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <div className="h-10 w-full rounded-md bg-gray-200 animate-pulse" />
      </CardFooter>
    </Card>
  );
}

export default ConnectorCard;
