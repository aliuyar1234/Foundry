/**
 * Internationalization Context (T376, T378)
 * React context and hooks for multi-language support
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translations, Locale, Translations, TranslationNamespace } from './translations';

// =============================================================================
// Types
// =============================================================================

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
  formatRelativeTime: (date: Date | string) => string;
  availableLocales: Locale[];
}

// =============================================================================
// Context
// =============================================================================

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

// Shorthand for translations
export function useTranslation(namespace?: keyof Translations) {
  const { t, locale } = useI18n();

  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      return t(fullKey, params);
    },
    [t, namespace]
  );

  return { t: translate, locale };
}

// =============================================================================
// Provider
// =============================================================================

interface I18nProviderProps {
  children: React.ReactNode;
  defaultLocale?: Locale;
}

const AVAILABLE_LOCALES: Locale[] = ['en', 'de'];

export function I18nProvider({ children, defaultLocale = 'en' }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    // Try to get from localStorage
    const stored = localStorage.getItem('foundry_locale');
    if (stored && AVAILABLE_LOCALES.includes(stored as Locale)) {
      return stored as Locale;
    }

    // Try to detect from browser
    const browserLang = navigator.language.split('-')[0];
    if (AVAILABLE_LOCALES.includes(browserLang as Locale)) {
      return browserLang as Locale;
    }

    return defaultLocale;
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('foundry_locale', newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  // Set initial HTML lang attribute
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Translation function
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const keys = key.split('.');
      let value: string | TranslationNamespace = translations[locale];

      for (const k of keys) {
        if (typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          // Fallback to English
          value = translations.en;
          for (const fallbackKey of keys) {
            if (typeof value === 'object' && fallbackKey in value) {
              value = value[fallbackKey];
            } else {
              console.warn(`Translation key not found: ${key}`);
              return key;
            }
          }
        }
      }

      if (typeof value !== 'string') {
        console.warn(`Translation key points to object, not string: ${key}`);
        return key;
      }

      // Replace parameters
      if (params) {
        let result = value;
        for (const [paramKey, paramValue] of Object.entries(params)) {
          result = result.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue));
        }
        return result;
      }

      return value;
    },
    [locale]
  );

  // Date formatting
  const formatDate = useCallback(
    (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const defaultOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...options,
      };
      return new Intl.DateTimeFormat(locale, defaultOptions).format(dateObj);
    },
    [locale]
  );

  // Number formatting
  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions): string => {
      return new Intl.NumberFormat(locale, options).format(value);
    },
    [locale]
  );

  // Currency formatting
  const formatCurrency = useCallback(
    (value: number, currency = 'EUR'): string => {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
      }).format(value);
    },
    [locale]
  );

  // Relative time formatting
  const formatRelativeTime = useCallback(
    (date: Date | string): string => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const now = new Date();
      const diffMs = dateObj.getTime() - now.getTime();
      const diffSec = Math.round(diffMs / 1000);
      const diffMin = Math.round(diffSec / 60);
      const diffHour = Math.round(diffMin / 60);
      const diffDay = Math.round(diffHour / 24);
      const diffWeek = Math.round(diffDay / 7);
      const diffMonth = Math.round(diffDay / 30);
      const diffYear = Math.round(diffDay / 365);

      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

      if (Math.abs(diffSec) < 60) {
        return rtf.format(diffSec, 'second');
      } else if (Math.abs(diffMin) < 60) {
        return rtf.format(diffMin, 'minute');
      } else if (Math.abs(diffHour) < 24) {
        return rtf.format(diffHour, 'hour');
      } else if (Math.abs(diffDay) < 7) {
        return rtf.format(diffDay, 'day');
      } else if (Math.abs(diffWeek) < 4) {
        return rtf.format(diffWeek, 'week');
      } else if (Math.abs(diffMonth) < 12) {
        return rtf.format(diffMonth, 'month');
      } else {
        return rtf.format(diffYear, 'year');
      }
    },
    [locale]
  );

  const value: I18nContextValue = {
    locale,
    setLocale,
    t,
    formatDate,
    formatNumber,
    formatCurrency,
    formatRelativeTime,
    availableLocales: AVAILABLE_LOCALES,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// =============================================================================
// Locale Selector Component
// =============================================================================

interface LocaleSelectorProps {
  className?: string;
  variant?: 'dropdown' | 'buttons' | 'select';
}

const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
};

const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇬🇧',
  de: '🇩🇪',
};

export function LocaleSelector({ className = '', variant = 'dropdown' }: LocaleSelectorProps) {
  const { locale, setLocale, availableLocales } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  if (variant === 'buttons') {
    return (
      <div className={`flex gap-2 ${className}`}>
        {availableLocales.map((loc) => (
          <button
            key={loc}
            onClick={() => setLocale(loc)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              locale === loc
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            aria-pressed={locale === loc}
          >
            {LOCALE_FLAGS[loc]} {LOCALE_NAMES[loc]}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'select') {
    return (
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className={`px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm ${className}`}
        aria-label="Select language"
      >
        {availableLocales.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_FLAGS[loc]} {LOCALE_NAMES[loc]}
          </option>
        ))}
      </select>
    );
  }

  // Dropdown (default)
  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{LOCALE_FLAGS[locale]}</span>
        <span>{LOCALE_NAMES[locale]}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div
            className="absolute right-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]"
            role="listbox"
          >
            {availableLocales.map((loc) => (
              <button
                key={loc}
                onClick={() => {
                  setLocale(loc);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50 ${
                  locale === loc ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
                role="option"
                aria-selected={locale === loc}
              >
                <span>{LOCALE_FLAGS[loc]}</span>
                <span>{LOCALE_NAMES[loc]}</span>
                {locale === loc && (
                  <svg
                    className="w-4 h-4 ml-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Translation Component
// =============================================================================

interface TransProps {
  i18nKey: string;
  params?: Record<string, string | number>;
  components?: Record<string, React.ReactNode>;
}

export function Trans({ i18nKey, params, components }: TransProps) {
  const { t } = useI18n();
  let text = t(i18nKey, params);

  // Handle component interpolation (e.g., <bold>text</bold>)
  if (components) {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    // Find all component tags
    const tagRegex = /<(\w+)>(.*?)<\/\1>/g;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      // Add text before the tag
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      // Add the component with its content
      const [, tagName, content] = match;
      const Component = components[tagName];
      if (Component) {
        parts.push(
          React.isValidElement(Component)
            ? React.cloneElement(Component, { key: match.index }, content)
            : content
        );
      } else {
        parts.push(match[0]);
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return <>{parts}</>;
  }

  return <>{text}</>;
}

// =============================================================================
// Plural Hook
// =============================================================================

export function usePlural() {
  const { locale } = useI18n();

  return useCallback(
    (count: number, forms: { one: string; other: string; zero?: string }): string => {
      const rules = new Intl.PluralRules(locale);
      const category = rules.select(count);

      if (count === 0 && forms.zero) {
        return forms.zero;
      }

      return category === 'one' ? forms.one : forms.other;
    },
    [locale]
  );
}

export default {
  I18nProvider,
  useI18n,
  useTranslation,
  LocaleSelector,
  Trans,
  usePlural,
};
