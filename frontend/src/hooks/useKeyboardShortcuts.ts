/**
 * Keyboard Shortcuts Hook (T193)
 * Adds keyboard shortcuts for common actions
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Shortcut configuration type
interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  action: () => void;
  // Prevent action when focused on input elements
  ignoreInputs?: boolean;
}

// Check if element is an input
function isInputElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  return element.isContentEditable;
}

// Generate shortcut key string for display
function formatShortcut(config: ShortcutConfig): string {
  const parts: string[] = [];

  if (config.ctrl) parts.push('Ctrl');
  if (config.alt) parts.push('Alt');
  if (config.shift) parts.push('Shift');
  if (config.meta) parts.push('Cmd');

  parts.push(config.key.toUpperCase());

  return parts.join('+');
}

// Check if event matches shortcut config
function matchesShortcut(event: KeyboardEvent, config: ShortcutConfig): boolean {
  const keyMatches = event.key.toLowerCase() === config.key.toLowerCase();
  const ctrlMatches = (config.ctrl ?? false) === (event.ctrlKey || event.metaKey);
  const altMatches = (config.alt ?? false) === event.altKey;
  const shiftMatches = (config.shift ?? false) === event.shiftKey;

  return keyMatches && ctrlMatches && altMatches && shiftMatches;
}

/**
 * Hook for registering keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      for (const shortcut of shortcutsRef.current) {
        if (matchesShortcut(event, shortcut)) {
          // Check if we should ignore input elements
          if (shortcut.ignoreInputs !== false && isInputElement(event.target)) {
            continue;
          }

          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Return formatted shortcuts for display
  return shortcuts.map((s) => ({
    ...s,
    formatted: formatShortcut(s),
  }));
}

/**
 * Hook for global navigation shortcuts
 */
export function useNavigationShortcuts() {
  const navigate = useNavigate();

  const shortcuts: ShortcutConfig[] = [
    {
      key: 'h',
      alt: true,
      description: 'Go to Home',
      action: () => navigate('/'),
    },
    {
      key: 'd',
      alt: true,
      description: 'Go to Data Sources',
      action: () => navigate('/data-sources'),
    },
    {
      key: 'p',
      alt: true,
      description: 'Go to Processes',
      action: () => navigate('/discovery/processes'),
    },
    {
      key: 'n',
      alt: true,
      description: 'Go to Network',
      action: () => navigate('/discovery/network'),
    },
    {
      key: 'i',
      alt: true,
      description: 'Go to Insights',
      action: () => navigate('/discovery/insights'),
    },
    {
      key: 's',
      alt: true,
      description: 'Go to SOPs',
      action: () => navigate('/sops'),
    },
    {
      key: 'a',
      alt: true,
      description: 'Go to Assessments',
      action: () => navigate('/assessments'),
    },
    {
      key: 'm',
      alt: true,
      description: 'Go to Simulations',
      action: () => navigate('/simulation'),
    },
    {
      key: 'e',
      alt: true,
      description: 'Go to Entity Records',
      action: () => navigate('/preparation/entity-records'),
    },
    {
      key: ',',
      alt: true,
      description: 'Go to Settings',
      action: () => navigate('/settings'),
    },
  ];

  return useKeyboardShortcuts(shortcuts);
}

/**
 * Hook for search shortcut
 */
export function useSearchShortcut(onSearch: () => void) {
  return useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      description: 'Open Search',
      action: onSearch,
    },
    {
      key: '/',
      description: 'Open Search',
      action: onSearch,
      ignoreInputs: true,
    },
  ]);
}

/**
 * Hook for modal/dialog shortcuts
 */
export function useModalShortcuts(onClose?: () => void, onConfirm?: () => void) {
  const shortcuts: ShortcutConfig[] = [];

  if (onClose) {
    shortcuts.push({
      key: 'Escape',
      description: 'Close',
      action: onClose,
      ignoreInputs: false,
    });
  }

  if (onConfirm) {
    shortcuts.push({
      key: 'Enter',
      ctrl: true,
      description: 'Confirm',
      action: onConfirm,
    });
  }

  return useKeyboardShortcuts(shortcuts);
}

/**
 * Hook for list navigation shortcuts
 */
export function useListShortcuts<T>({
  items,
  selectedIndex,
  onSelect,
  onActivate,
}: {
  items: T[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onActivate?: (item: T) => void;
}) {
  const moveUp = useCallback(() => {
    if (selectedIndex > 0) {
      onSelect(selectedIndex - 1);
    }
  }, [selectedIndex, onSelect]);

  const moveDown = useCallback(() => {
    if (selectedIndex < items.length - 1) {
      onSelect(selectedIndex + 1);
    }
  }, [selectedIndex, items.length, onSelect]);

  const activate = useCallback(() => {
    if (onActivate && items[selectedIndex]) {
      onActivate(items[selectedIndex]);
    }
  }, [onActivate, items, selectedIndex]);

  const moveToFirst = useCallback(() => {
    onSelect(0);
  }, [onSelect]);

  const moveToLast = useCallback(() => {
    onSelect(items.length - 1);
  }, [onSelect, items.length]);

  return useKeyboardShortcuts([
    {
      key: 'ArrowUp',
      description: 'Move up',
      action: moveUp,
    },
    {
      key: 'k',
      description: 'Move up',
      action: moveUp,
    },
    {
      key: 'ArrowDown',
      description: 'Move down',
      action: moveDown,
    },
    {
      key: 'j',
      description: 'Move down',
      action: moveDown,
    },
    {
      key: 'Enter',
      description: 'Activate',
      action: activate,
    },
    {
      key: 'Home',
      description: 'Go to first',
      action: moveToFirst,
    },
    {
      key: 'End',
      description: 'Go to last',
      action: moveToLast,
    },
  ]);
}

/**
 * Hook for editor shortcuts
 */
export function useEditorShortcuts({
  onSave,
  onUndo,
  onRedo,
  onFormat,
}: {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFormat?: () => void;
}) {
  const shortcuts: ShortcutConfig[] = [];

  if (onSave) {
    shortcuts.push({
      key: 's',
      ctrl: true,
      description: 'Save',
      action: onSave,
      ignoreInputs: false,
    });
  }

  if (onUndo) {
    shortcuts.push({
      key: 'z',
      ctrl: true,
      description: 'Undo',
      action: onUndo,
      ignoreInputs: false,
    });
  }

  if (onRedo) {
    shortcuts.push({
      key: 'z',
      ctrl: true,
      shift: true,
      description: 'Redo',
      action: onRedo,
      ignoreInputs: false,
    });
  }

  if (onFormat) {
    shortcuts.push({
      key: 'f',
      ctrl: true,
      shift: true,
      description: 'Format',
      action: onFormat,
      ignoreInputs: false,
    });
  }

  return useKeyboardShortcuts(shortcuts);
}

/**
 * Hook for action shortcuts (common actions)
 */
export function useActionShortcuts({
  onNew,
  onEdit,
  onDelete,
  onRefresh,
  onExport,
}: {
  onNew?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRefresh?: () => void;
  onExport?: () => void;
}) {
  const shortcuts: ShortcutConfig[] = [];

  if (onNew) {
    shortcuts.push({
      key: 'n',
      ctrl: true,
      description: 'Create New',
      action: onNew,
    });
  }

  if (onEdit) {
    shortcuts.push({
      key: 'e',
      ctrl: true,
      description: 'Edit',
      action: onEdit,
    });
  }

  if (onDelete) {
    shortcuts.push({
      key: 'Delete',
      description: 'Delete',
      action: onDelete,
    });
  }

  if (onRefresh) {
    shortcuts.push({
      key: 'r',
      ctrl: true,
      description: 'Refresh',
      action: onRefresh,
    });
  }

  if (onExport) {
    shortcuts.push({
      key: 'e',
      ctrl: true,
      shift: true,
      description: 'Export',
      action: onExport,
    });
  }

  return useKeyboardShortcuts(shortcuts);
}

/**
 * Component to display available shortcuts
 */
export function ShortcutsHelp({
  shortcuts,
}: {
  shortcuts: Array<{ formatted: string; description: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {shortcuts.map((shortcut, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="text-gray-600">{shortcut.description}</span>
          <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
            {shortcut.formatted}
          </kbd>
        </div>
      ))}
    </div>
  );
}

export default useKeyboardShortcuts;
