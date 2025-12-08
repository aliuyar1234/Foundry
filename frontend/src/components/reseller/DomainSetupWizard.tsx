/**
 * Domain Setup Wizard
 * SCALE Tier - Task T141
 *
 * Step-by-step wizard for configuring custom domains
 */

import React, { useState, useCallback, useEffect } from 'react';

// ==========================================================================
// Types
// ==========================================================================

interface DomainSetupWizardProps {
  configId: string;
  currentDomain?: string;
  onComplete?: (domain: string) => void;
  onCancel?: () => void;
}

interface SetupInstructions {
  domain: string;
  verificationToken: string;
  cnameRecord: { host: string; value: string };
  txtRecord: { host: string; value: string };
  instructions: string[];
}

interface VerificationResult {
  domain: string;
  isVerified: boolean;
  cnameStatus: 'pending' | 'configured' | 'incorrect';
  txtStatus: 'pending' | 'verified' | 'incorrect';
  expectedCname: string;
  expectedTxtRecord: string;
  actualCname?: string;
  actualTxtRecord?: string;
  errors?: string[];
}

type Step = 'enter' | 'configure' | 'verify' | 'ssl' | 'complete';

// ==========================================================================
// Step Indicator Component
// ==========================================================================

interface StepIndicatorProps {
  steps: { id: Step; label: string }[];
  currentStep: Step;
}

function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = step.id === currentStep;

        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`ml-2 text-sm ${
                  isCurrent ? 'font-medium text-gray-900' : 'text-gray-500'
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-4 ${
                  index < currentIndex ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ==========================================================================
// DNS Record Display Component
// ==========================================================================

interface DnsRecordProps {
  type: 'CNAME' | 'TXT';
  host: string;
  value: string;
  status?: 'pending' | 'configured' | 'verified' | 'incorrect';
}

function DnsRecord({ type, host, value, status }: DnsRecordProps) {
  const statusColors = {
    pending: 'bg-gray-100 text-gray-600',
    configured: 'bg-green-100 text-green-700',
    verified: 'bg-green-100 text-green-700',
    incorrect: 'bg-red-100 text-red-700',
  };

  const statusLabels = {
    pending: 'Pending',
    configured: 'Configured',
    verified: 'Verified',
    incorrect: 'Incorrect',
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{type} Record</span>
        {status && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}>
            {statusLabels[status]}
          </span>
        )}
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-gray-500">Host / Name</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white px-3 py-1.5 rounded border text-sm font-mono truncate">
              {host}
            </code>
            <button
              onClick={() => copyToClipboard(host)}
              className="p-1.5 text-gray-400 hover:text-gray-600"
              title="Copy to clipboard"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Value / Points to</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white px-3 py-1.5 rounded border text-sm font-mono truncate">
              {value}
            </code>
            <button
              onClick={() => copyToClipboard(value)}
              className="p-1.5 text-gray-400 hover:text-gray-600"
              title="Copy to clipboard"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// Step Components
// ==========================================================================

interface EnterDomainStepProps {
  domain: string;
  onDomainChange: (domain: string) => void;
  onNext: () => void;
  error?: string;
  isLoading: boolean;
}

function EnterDomainStep({
  domain,
  onDomainChange,
  onNext,
  error,
  isLoading,
}: EnterDomainStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Enter Your Custom Domain</h2>
        <p className="text-gray-500 mt-2">
          Enter the domain you want to use for your white-label instance
        </p>
      </div>

      <div className="max-w-md mx-auto">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Custom Domain
        </label>
        <input
          type="text"
          value={domain}
          onChange={e => onDomainChange(e.target.value.toLowerCase())}
          placeholder="app.yourcompany.com"
          className={`w-full px-4 py-3 border rounded-lg text-lg ${
            error ? 'border-red-300' : 'border-gray-300'
          } focus:ring-2 focus:ring-blue-500`}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-2 text-sm text-gray-500">
          We recommend using a subdomain like <code>app.yourcompany.com</code> or{' '}
          <code>portal.yourcompany.com</code>
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!domain || isLoading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          Continue
        </button>
      </div>
    </div>
  );
}

interface ConfigureStepProps {
  instructions: SetupInstructions;
  onNext: () => void;
  onBack: () => void;
}

function ConfigureStep({ instructions, onNext, onBack }: ConfigureStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Configure DNS Records</h2>
        <p className="text-gray-500 mt-2">
          Add these DNS records at your domain registrar
        </p>
      </div>

      <div className="space-y-4">
        <DnsRecord
          type="CNAME"
          host={instructions.cnameRecord.host}
          value={instructions.cnameRecord.value}
        />
        <DnsRecord
          type="TXT"
          host={instructions.txtRecord.host}
          value={instructions.txtRecord.value}
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">Instructions</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
          {instructions.instructions.map((instruction, i) => (
            <li key={i}>{instruction}</li>
          ))}
        </ol>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          I&apos;ve Added the Records
        </button>
      </div>
    </div>
  );
}

interface VerifyStepProps {
  result: VerificationResult | null;
  onVerify: () => void;
  onNext: () => void;
  onBack: () => void;
  isVerifying: boolean;
  instructions: SetupInstructions;
}

function VerifyStep({
  result,
  onVerify,
  onNext,
  onBack,
  isVerifying,
  instructions,
}: VerifyStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Verify DNS Configuration</h2>
        <p className="text-gray-500 mt-2">
          We&apos;ll check if your DNS records are configured correctly
        </p>
      </div>

      {result ? (
        <div className="space-y-4">
          <DnsRecord
            type="CNAME"
            host={instructions.cnameRecord.host}
            value={instructions.cnameRecord.value}
            status={result.cnameStatus}
          />
          <DnsRecord
            type="TXT"
            host={instructions.txtRecord.host}
            value={instructions.txtRecord.value}
            status={result.txtStatus}
          />

          {result.errors && result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-red-800 mb-2">Issues Found</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
                {result.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {result.isVerified && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <svg
                className="w-12 h-12 text-green-500 mx-auto mb-2"
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
              <h4 className="font-medium text-green-800">Domain Verified!</h4>
              <p className="text-sm text-green-700">Your DNS is configured correctly</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <svg
            className="w-16 h-16 text-gray-400 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <p className="text-gray-500">Click verify to check your DNS configuration</p>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Back
        </button>
        <div className="flex gap-3">
          <button
            onClick={onVerify}
            disabled={isVerifying}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            {isVerifying && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isVerifying ? 'Verifying...' : 'Verify DNS'}
          </button>
          {result?.isVerified && (
            <button
              onClick={onNext}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface SslStepProps {
  onRequestSsl: () => void;
  onNext: () => void;
  onBack: () => void;
  isRequesting: boolean;
  sslStatus: string | null;
}

function SslStep({ onRequestSsl, onNext, onBack, isRequesting, sslStatus }: SslStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">SSL Certificate</h2>
        <p className="text-gray-500 mt-2">
          We&apos;ll provision a free SSL certificate for your domain
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-6 text-center">
        {sslStatus === 'active' ? (
          <>
            <svg
              className="w-16 h-16 text-green-500 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900">SSL Certificate Active</h3>
            <p className="text-gray-500 mt-2">Your domain is secured with HTTPS</p>
          </>
        ) : sslStatus === 'provisioning' ? (
          <>
            <svg className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900">Provisioning Certificate...</h3>
            <p className="text-gray-500 mt-2">This usually takes 1-5 minutes</p>
          </>
        ) : (
          <>
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900">Request SSL Certificate</h3>
            <p className="text-gray-500 mt-2">
              Click below to provision a free SSL certificate from Let&apos;s Encrypt
            </p>
            <button
              onClick={onRequestSsl}
              disabled={isRequesting}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isRequesting ? 'Requesting...' : 'Request Certificate'}
            </button>
          </>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          Back
        </button>
        {sslStatus === 'active' && (
          <button onClick={onNext} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Complete Setup
          </button>
        )}
      </div>
    </div>
  );
}

function CompleteStep({ domain, onComplete }: { domain: string; onComplete: () => void }) {
  return (
    <div className="text-center py-8">
      <svg className="w-20 h-20 text-green-500 mx-auto mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Domain Setup Complete!</h2>
      <p className="text-gray-500 mb-6">
        Your custom domain is now active at{' '}
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          https://{domain}
        </a>
      </p>
      <button onClick={onComplete} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Done
      </button>
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

export function DomainSetupWizard({
  configId,
  currentDomain,
  onComplete,
  onCancel,
}: DomainSetupWizardProps) {
  const [step, setStep] = useState<Step>(currentDomain ? 'verify' : 'enter');
  const [domain, setDomain] = useState(currentDomain || '');
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [instructions, setInstructions] = useState<SetupInstructions | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [sslStatus, setSslStatus] = useState<string | null>(null);

  const steps = [
    { id: 'enter' as const, label: 'Domain' },
    { id: 'configure' as const, label: 'DNS' },
    { id: 'verify' as const, label: 'Verify' },
    { id: 'ssl' as const, label: 'SSL' },
    { id: 'complete' as const, label: 'Done' },
  ];

  const configureDomain = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const response = await fetch('/api/white-label/domain/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId, domain }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to configure domain');
      }

      const data = await response.json();
      setInstructions(data);
      setStep('configure');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to configure domain');
    } finally {
      setIsLoading(false);
    }
  }, [configId, domain]);

  const verifyDomain = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/white-label/domain/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId }),
      });

      if (!response.ok) throw new Error('Verification failed');

      const result = await response.json();
      setVerificationResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  }, [configId]);

  const requestSsl = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/white-label/domain/ssl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId }),
      });

      if (!response.ok) throw new Error('SSL request failed');

      const result = await response.json();
      setSslStatus(result.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSL request failed');
    } finally {
      setIsLoading(false);
    }
  }, [configId]);

  // Poll for SSL status when provisioning
  useEffect(() => {
    if (sslStatus === 'provisioning') {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/white-label/domain/status?domain=${domain}`);
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'active') {
              setSslStatus('active');
            }
          }
        } catch {
          // Ignore errors during polling
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [sslStatus, domain]);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Custom Domain Setup</h1>
        {onCancel && (
          <button onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <StepIndicator steps={steps} currentStep={step} />

      {step === 'enter' && (
        <EnterDomainStep
          domain={domain}
          onDomainChange={setDomain}
          onNext={configureDomain}
          error={error}
          isLoading={isLoading}
        />
      )}

      {step === 'configure' && instructions && (
        <ConfigureStep
          instructions={instructions}
          onNext={() => setStep('verify')}
          onBack={() => setStep('enter')}
        />
      )}

      {step === 'verify' && instructions && (
        <VerifyStep
          result={verificationResult}
          onVerify={verifyDomain}
          onNext={() => setStep('ssl')}
          onBack={() => setStep('configure')}
          isVerifying={isLoading}
          instructions={instructions}
        />
      )}

      {step === 'ssl' && (
        <SslStep
          onRequestSsl={requestSsl}
          onNext={() => setStep('complete')}
          onBack={() => setStep('verify')}
          isRequesting={isLoading}
          sslStatus={sslStatus}
        />
      )}

      {step === 'complete' && (
        <CompleteStep domain={domain} onComplete={() => onComplete?.(domain)} />
      )}
    </div>
  );
}

export default DomainSetupWizard;
