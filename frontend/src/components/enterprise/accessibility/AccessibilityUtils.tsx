/**
 * Accessibility Utilities (T373, T374, T375)
 * WCAG 2.1 AA compliance utilities, ARIA labels, and focus management
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export interface AccessibilitySettings {
  reduceMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  screenReaderMode: boolean;
  focusIndicators: 'default' | 'enhanced' | 'high-visibility';
  keyboardNavigation: boolean;
}

interface FocusTrapOptions {
  initialFocus?: string;
  returnFocus?: boolean;
  escapeDeactivates?: boolean;
  onEscape?: () => void;
}

// =============================================================================
// Accessibility Context
// =============================================================================

const defaultSettings: AccessibilitySettings = {
  reduceMotion: false,
  highContrast: false,
  largeText: false,
  screenReaderMode: false,
  focusIndicators: 'default',
  keyboardNavigation: true,
};

interface AccessibilityContextValue {
  settings: AccessibilitySettings;
  updateSettings: (updates: Partial<AccessibilitySettings>) => void;
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    // Load from localStorage
    const saved = localStorage.getItem('foundry_accessibility_settings');
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }

    // Detect system preferences
    return {
      ...defaultSettings,
      reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      highContrast: window.matchMedia('(prefers-contrast: more)').matches,
    };
  });

  // Live region for announcements
  const [announcement, setAnnouncement] = useState<{
    message: string;
    priority: 'polite' | 'assertive';
  } | null>(null);

  const updateSettings = useCallback((updates: Partial<AccessibilitySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem('foundry_accessibility_settings', JSON.stringify(next));
      return next;
    });
  }, []);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    setAnnouncement({ message, priority });
    // Clear after screen reader has time to read
    setTimeout(() => setAnnouncement(null), 1000);
  }, []);

  // Apply settings to document
  useEffect(() => {
    const root = document.documentElement;

    if (settings.reduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    if (settings.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    if (settings.largeText) {
      root.classList.add('large-text');
    } else {
      root.classList.remove('large-text');
    }

    root.dataset.focusIndicators = settings.focusIndicators;
  }, [settings]);

  // Listen for system preference changes
  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrastQuery = window.matchMedia('(prefers-contrast: more)');

    const handleMotionChange = (e: MediaQueryListEvent) => {
      updateSettings({ reduceMotion: e.matches });
    };

    const handleContrastChange = (e: MediaQueryListEvent) => {
      updateSettings({ highContrast: e.matches });
    };

    motionQuery.addEventListener('change', handleMotionChange);
    contrastQuery.addEventListener('change', handleContrastChange);

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange);
      contrastQuery.removeEventListener('change', handleContrastChange);
    };
  }, [updateSettings]);

  return (
    <AccessibilityContext.Provider value={{ settings, updateSettings, announce }}>
      {children}
      {/* Live regions for screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement?.priority === 'polite' ? announcement.message : ''}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement?.priority === 'assertive' ? announcement.message : ''}
      </div>
    </AccessibilityContext.Provider>
  );
}

// =============================================================================
// Skip Links (T373)
// =============================================================================

interface SkipLink {
  id: string;
  label: string;
  target: string;
}

const defaultSkipLinks: SkipLink[] = [
  { id: 'skip-to-main', label: 'Skip to main content', target: '#main-content' },
  { id: 'skip-to-nav', label: 'Skip to navigation', target: '#main-navigation' },
  { id: 'skip-to-search', label: 'Skip to search', target: '#search-input' },
];

export function SkipLinks({ links = defaultSkipLinks }: { links?: SkipLink[] }) {
  return (
    <div className="skip-links">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.target}
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

// =============================================================================
// Focus Trap (T375)
// =============================================================================

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  isActive: boolean,
  options: FocusTrapOptions = {}
) {
  const { initialFocus, returnFocus = true, escapeDeactivates = true, onEscape } = options;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    // Store current focus
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Get focusable elements
    const getFocusableElements = () => {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    };

    // Set initial focus
    const focusableElements = getFocusableElements();
    if (initialFocus) {
      const initialElement = containerRef.current.querySelector<HTMLElement>(initialFocus);
      initialElement?.focus();
    } else if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Handle keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escapeDeactivates) {
        onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const elements = getFocusableElements();
      if (elements.length === 0) return;

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];

      if (e.shiftKey) {
        // Shift+Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Return focus to previous element
      if (returnFocus && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive, containerRef, initialFocus, returnFocus, escapeDeactivates, onEscape]);
}

// =============================================================================
// Focus Management (T375)
// =============================================================================

export function useFocusReturn() {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, []);

  return { saveFocus, restoreFocus };
}

export function useRovingTabIndex<T extends HTMLElement>(
  items: React.RefObject<T>[],
  options: { wrap?: boolean; orientation?: 'horizontal' | 'vertical' | 'both' } = {}
) {
  const { wrap = true, orientation = 'both' } = options;
  const [activeIndex, setActiveIndex] = useState(0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let nextIndex = activeIndex;

      const isNext =
        (orientation !== 'vertical' && e.key === 'ArrowRight') ||
        (orientation !== 'horizontal' && e.key === 'ArrowDown');
      const isPrev =
        (orientation !== 'vertical' && e.key === 'ArrowLeft') ||
        (orientation !== 'horizontal' && e.key === 'ArrowUp');

      if (isNext) {
        e.preventDefault();
        nextIndex = activeIndex + 1;
        if (nextIndex >= items.length) {
          nextIndex = wrap ? 0 : items.length - 1;
        }
      } else if (isPrev) {
        e.preventDefault();
        nextIndex = activeIndex - 1;
        if (nextIndex < 0) {
          nextIndex = wrap ? items.length - 1 : 0;
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = items.length - 1;
      }

      if (nextIndex !== activeIndex) {
        setActiveIndex(nextIndex);
        items[nextIndex]?.current?.focus();
      }
    },
    [activeIndex, items, wrap, orientation]
  );

  const getTabIndex = useCallback(
    (index: number) => (index === activeIndex ? 0 : -1),
    [activeIndex]
  );

  return { activeIndex, setActiveIndex, handleKeyDown, getTabIndex };
}

// =============================================================================
// ARIA Components (T374)
// =============================================================================

interface AriaLiveRegionProps {
  children: React.ReactNode;
  priority?: 'polite' | 'assertive';
  atomic?: boolean;
  relevant?: 'additions' | 'removals' | 'text' | 'all';
}

export function AriaLiveRegion({
  children,
  priority = 'polite',
  atomic = true,
  relevant = 'additions text',
}: AriaLiveRegionProps) {
  return (
    <div
      role={priority === 'assertive' ? 'alert' : 'status'}
      aria-live={priority}
      aria-atomic={atomic}
      aria-relevant={relevant}
    >
      {children}
    </div>
  );
}

interface VisuallyHiddenProps {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

export function VisuallyHidden({ children, as: Tag = 'span' }: VisuallyHiddenProps) {
  return <Tag className="sr-only">{children}</Tag>;
}

interface DescribedByProps {
  id: string;
  children: React.ReactNode;
}

export function DescriptionText({ id, children }: DescribedByProps) {
  return (
    <span id={id} className="sr-only">
      {children}
    </span>
  );
}

// =============================================================================
// Accessible Form Components (T373)
// =============================================================================

interface AccessibleInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  description?: string;
  required?: boolean;
}

export function AccessibleInput({
  label,
  error,
  description,
  required,
  id,
  ...props
}: AccessibleInputProps) {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="space-y-1">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
        {required && <VisuallyHidden>(required)</VisuallyHidden>}
      </label>
      {description && (
        <p id={descriptionId} className="text-sm text-gray-500">
          {description}
        </p>
      )}
      <input
        id={inputId}
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-required={required}
        className={`block w-full rounded-lg border ${
          error ? 'border-red-500' : 'border-gray-300'
        } px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface AccessibleSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  description?: string;
  required?: boolean;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}

export function AccessibleSelect({
  label,
  error,
  description,
  required,
  options,
  id,
  ...props
}: AccessibleSelectProps) {
  const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const descriptionId = description ? `${selectId}-description` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className="space-y-1">
      <label
        htmlFor={selectId}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {description && (
        <p id={descriptionId} className="text-sm text-gray-500">
          {description}
        </p>
      )}
      <select
        id={selectId}
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-required={required}
        className={`block w-full rounded-lg border ${
          error ? 'border-red-500' : 'border-gray-300'
        } px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Accessible Modal (T373, T375)
// =============================================================================

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function AccessibleModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: AccessibleModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = `modal-title-${title.toLowerCase().replace(/\s+/g, '-')}`;
  const descriptionId = description
    ? `modal-description-${title.toLowerCase().replace(/\s+/g, '-')}`
    : undefined;

  useFocusTrap(modalRef, isOpen, {
    escapeDeactivates: true,
    onEscape: onClose,
    returnFocus: true,
  });

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`relative bg-white rounded-xl shadow-xl ${sizeClasses[size]} w-full`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Description */}
        {description && (
          <p id={descriptionId} className="px-4 py-2 text-sm text-gray-600 border-b border-gray-100">
            {description}
          </p>
        )}

        {/* Content */}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// =============================================================================
// Accessible Tabs (T373)
// =============================================================================

interface Tab {
  id: string;
  label: string;
  panel: React.ReactNode;
  disabled?: boolean;
}

interface AccessibleTabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  ariaLabel?: string;
}

export function AccessibleTabs({
  tabs,
  defaultTab,
  onChange,
  ariaLabel = 'Tab navigation',
}: AccessibleTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;

    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    // Skip disabled tabs
    while (tabs[nextIndex]?.disabled && nextIndex !== index) {
      if (e.key === 'ArrowRight' || e.key === 'End') {
        nextIndex = (nextIndex + 1) % tabs.length;
      } else {
        nextIndex = (nextIndex - 1 + tabs.length) % tabs.length;
      }
    }

    tabRefs.current[nextIndex]?.focus();
    handleTabChange(tabs[nextIndex].id);
  };

  const activeTabData = tabs.find((t) => t.id === activeTab);

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex border-b border-gray-200"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => (tabRefs.current[index] = el)}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            aria-disabled={tab.disabled}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => !tab.disabled && handleTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            disabled={tab.disabled}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } ${tab.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
        className="py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-b-lg"
      >
        {activeTabData?.panel}
      </div>
    </div>
  );
}

// =============================================================================
// Accessibility CSS (add to global styles)
// =============================================================================

export const accessibilityStyles = `
/* Screen reader only content */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.sr-only:focus,
.sr-only:active {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}

/* Reduced motion */
.reduce-motion * {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
}

/* High contrast mode */
.high-contrast {
  --focus-ring-color: #000;
  --focus-ring-offset: 2px;
  filter: contrast(1.2);
}

.high-contrast a,
.high-contrast button {
  text-decoration: underline;
}

/* Large text mode */
.large-text {
  font-size: 1.125rem;
  line-height: 1.75;
}

.large-text h1 { font-size: 2.5rem; }
.large-text h2 { font-size: 2rem; }
.large-text h3 { font-size: 1.75rem; }

/* Enhanced focus indicators */
[data-focus-indicators="enhanced"] :focus {
  outline: 3px solid #3b82f6;
  outline-offset: 2px;
}

[data-focus-indicators="high-visibility"] :focus {
  outline: 4px solid #000;
  outline-offset: 4px;
  box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.3);
}

/* Focus visible polyfill styles */
.focus-visible:focus {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

:focus:not(.focus-visible) {
  outline: none;
}
`;

export default {
  AccessibilityProvider,
  useAccessibility,
  SkipLinks,
  useFocusTrap,
  useFocusReturn,
  useRovingTabIndex,
  AriaLiveRegion,
  VisuallyHidden,
  DescriptionText,
  AccessibleInput,
  AccessibleSelect,
  AccessibleModal,
  AccessibleTabs,
  accessibilityStyles,
};
