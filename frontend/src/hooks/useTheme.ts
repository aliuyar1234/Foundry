/**
 * Dark Mode Support Hook (T194)
 * Implements dark mode theme switching
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import React from 'react';

// Theme types
type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

// Theme context type
interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

// Create theme context
const ThemeContext = createContext<ThemeContextValue | null>(null);

// Local storage key
const THEME_STORAGE_KEY = 'foundry-theme';

// Get system preference
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Get stored theme
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

// Store theme
function storeTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

// Apply theme to document
function applyTheme(resolvedTheme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (resolvedTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Update meta theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute(
      'content',
      resolvedTheme === 'dark' ? '#1f2937' : '#ffffff'
    );
  }
}

// Resolve theme to light/dark
function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

/**
 * Theme Provider Component
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredTheme())
  );

  // Update resolved theme when theme or system preference changes
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? 'dark' : 'light';
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Set theme function
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    storeTheme(newTheme);
  }, []);

  // Toggle theme function
  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const newTheme = resolveTheme(current) === 'dark' ? 'light' : 'dark';
      storeTheme(newTheme);
      return newTheme;
    });
  }, []);

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isDark: resolvedTheme === 'dark',
  };

  return React.createElement(ThemeContext.Provider, { value }, children);
}

/**
 * Hook to use theme context
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}

/**
 * Theme Toggle Button Component
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme, isDark } = useTheme();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Simple toggle button */}
      <button
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      >
        {isDark ? (
          // Sun icon for light mode
          <svg
            className="w-5 h-5 text-gray-600 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        ) : (
          // Moon icon for dark mode
          <svg
            className="w-5 h-5 text-gray-600 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        )}
      </button>

      {/* Theme selector dropdown */}
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-600 dark:text-gray-400"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </div>
  );
}

/**
 * Theme Switch Component (more visual)
 */
export function ThemeSwitch() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`relative w-14 h-7 rounded-full transition-colors ${
        isDark ? 'bg-blue-600' : 'bg-gray-200'
      }`}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <span
        className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
          isDark ? 'translate-x-7' : 'translate-x-0.5'
        }`}
      >
        {isDark ? (
          <svg
            className="w-4 h-4 text-blue-600 absolute top-1 left-1"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        ) : (
          <svg
            className="w-4 h-4 text-yellow-500 absolute top-1 left-1"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </span>
    </button>
  );
}

/**
 * CSS Variables for dark mode
 * Add these to your global CSS or Tailwind config
 */
export const darkModeStyles = `
  :root {
    --color-bg-primary: #ffffff;
    --color-bg-secondary: #f9fafb;
    --color-bg-tertiary: #f3f4f6;
    --color-text-primary: #111827;
    --color-text-secondary: #6b7280;
    --color-text-tertiary: #9ca3af;
    --color-border: #e5e7eb;
    --color-border-dark: #d1d5db;
  }

  .dark {
    --color-bg-primary: #1f2937;
    --color-bg-secondary: #111827;
    --color-bg-tertiary: #374151;
    --color-text-primary: #f9fafb;
    --color-text-secondary: #d1d5db;
    --color-text-tertiary: #9ca3af;
    --color-border: #374151;
    --color-border-dark: #4b5563;
  }

  /* Smooth transition for theme changes */
  html {
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  /* Dark mode scrollbar */
  .dark ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .dark ::-webkit-scrollbar-track {
    background: #374151;
  }

  .dark ::-webkit-scrollbar-thumb {
    background: #6b7280;
    border-radius: 4px;
  }

  .dark ::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
`;

export default useTheme;
