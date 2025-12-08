/**
 * Add Customer Dialog
 * SCALE Tier - Task T138
 *
 * Dialog for adding a new customer to a reseller account
 */

import React, { useState, useCallback } from 'react';

// ==========================================================================
// Types
// ==========================================================================

interface AddCustomerDialogProps {
  resellerId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (customer: { id: string; name: string; slug: string }) => void;
}

interface FormData {
  name: string;
  slug: string;
  industry?: string;
  employeeCount?: string;
  configuration: {
    features?: string[];
    limits?: Record<string, number>;
  };
}

interface FormErrors {
  name?: string;
  slug?: string;
  general?: string;
}

// ==========================================================================
// Helper Functions
// ==========================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

// ==========================================================================
// Form Field Components
// ==========================================================================

interface InputFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
}

function InputField({
  label,
  name,
  value,
  onChange,
  error,
  placeholder,
  required,
  disabled,
  helperText,
}: InputFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type="text"
        id={name}
        name={name}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? 'border-red-300' : 'border-gray-300'
        } ${disabled ? 'bg-gray-50 cursor-not-allowed' : ''}`}
      />
      {helperText && !error && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
}: SelectFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ==========================================================================
// Feature Selection Component
// ==========================================================================

interface FeatureCheckboxProps {
  features: string[];
  selectedFeatures: string[];
  onChange: (features: string[]) => void;
}

function FeatureCheckboxes({
  features,
  selectedFeatures,
  onChange,
}: FeatureCheckboxProps) {
  const toggleFeature = (feature: string) => {
    if (selectedFeatures.includes(feature)) {
      onChange(selectedFeatures.filter(f => f !== feature));
    } else {
      onChange([...selectedFeatures, feature]);
    }
  };

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        Enabled Features
      </label>
      <div className="grid grid-cols-2 gap-2">
        {features.map(feature => (
          <label
            key={feature}
            className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selectedFeatures.includes(feature)}
              onChange={() => toggleFeature(feature)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              {feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

export function AddCustomerDialog({
  resellerId,
  isOpen,
  onClose,
  onSuccess,
}: AddCustomerDialogProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    slug: '',
    industry: '',
    employeeCount: '',
    configuration: {
      features: [],
      limits: {},
    },
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);

  const availableFeatures = [
    'process_discovery',
    'ai_insights',
    'sop_generation',
    'data_integration',
    'compliance_monitoring',
    'analytics_dashboard',
  ];

  const industries = [
    { value: 'manufacturing', label: 'Manufacturing' },
    { value: 'retail', label: 'Retail' },
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'finance', label: 'Finance' },
    { value: 'technology', label: 'Technology' },
    { value: 'logistics', label: 'Logistics' },
    { value: 'other', label: 'Other' },
  ];

  const employeeCounts = [
    { value: '1-10', label: '1-10 employees' },
    { value: '11-50', label: '11-50 employees' },
    { value: '51-200', label: '51-200 employees' },
    { value: '201-500', label: '201-500 employees' },
    { value: '501-1000', label: '501-1000 employees' },
    { value: '1000+', label: '1000+ employees' },
  ];

  const handleNameChange = useCallback(
    (name: string) => {
      setFormData(prev => ({
        ...prev,
        name,
        slug: slugEdited ? prev.slug : generateSlug(name),
      }));
      setErrors(prev => ({ ...prev, name: undefined }));
    },
    [slugEdited]
  );

  const handleSlugChange = useCallback((slug: string) => {
    setSlugEdited(true);
    setFormData(prev => ({ ...prev, slug: generateSlug(slug) }));
    setErrors(prev => ({ ...prev, slug: undefined }));
  }, []);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Customer name is required';
    }

    if (!formData.slug.trim()) {
      newErrors.slug = 'Slug is required';
    } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      newErrors.slug = 'Slug can only contain lowercase letters, numbers, and hyphens';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const response = await fetch(`/api/resellers/${resellerId}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          slug: formData.slug.trim(),
          configuration: {
            ...formData.configuration,
            industry: formData.industry,
            employeeCount: formData.employeeCount,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create customer');
      }

      const customer = await response.json();
      onSuccess?.(customer);
      handleClose();
    } catch (err) {
      setErrors({
        general: err instanceof Error ? err.message : 'An error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      slug: '',
      industry: '',
      employeeCount: '',
      configuration: { features: [], limits: {} },
    });
    setErrors({});
    setSlugEdited(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Add New Customer</h2>
              <button
                onClick={handleClose}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {errors.general && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {errors.general}
              </div>
            )}

            <InputField
              label="Customer Name"
              name="name"
              value={formData.name}
              onChange={handleNameChange}
              error={errors.name}
              placeholder="Acme Corporation"
              required
            />

            <InputField
              label="Slug"
              name="slug"
              value={formData.slug}
              onChange={handleSlugChange}
              error={errors.slug}
              placeholder="acme-corporation"
              helperText="Used in URLs and as a unique identifier"
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label="Industry"
                name="industry"
                value={formData.industry || ''}
                onChange={value => setFormData(prev => ({ ...prev, industry: value }))}
                options={industries}
                placeholder="Select industry"
              />

              <SelectField
                label="Company Size"
                name="employeeCount"
                value={formData.employeeCount || ''}
                onChange={value =>
                  setFormData(prev => ({ ...prev, employeeCount: value }))
                }
                options={employeeCounts}
                placeholder="Select size"
              />
            </div>

            <FeatureCheckboxes
              features={availableFeatures}
              selectedFeatures={formData.configuration.features || []}
              onChange={features =>
                setFormData(prev => ({
                  ...prev,
                  configuration: { ...prev.configuration, features },
                }))
              }
            />

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
                )}
                {isSubmitting ? 'Creating...' : 'Create Customer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AddCustomerDialog;
