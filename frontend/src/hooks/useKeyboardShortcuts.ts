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

// ==========================================
// T257 - Assistant-specific keyboard shortcuts
// ==========================================

/**
 * Default assistant shortcuts configuration
 */
export const ASSISTANT_SHORTCUTS = [
  { key: 'k', ctrl: true, description: 'Open/Close assistant', category: 'Assistant' },
  { key: 'Escape', description: 'Close assistant', category: 'Assistant' },
  { key: '/', description: 'Focus search/input', category: 'Navigation' },
  { key: 'Enter', ctrl: true, description: 'Submit message', category: 'Assistant' },
  { key: 'ArrowUp', alt: true, description: 'Previous conversation', category: 'Assistant' },
  { key: 'ArrowDown', alt: true, description: 'Next conversation', category: 'Assistant' },
  { key: 'n', ctrl: true, shift: true, description: 'New conversation', category: 'Assistant' },
  { key: 'c', ctrl: true, shift: true, description: 'Copy last response', category: 'Assistant' },
  { key: '?', description: 'Show shortcuts help', category: 'Help' },
];

/**
 * Command center shortcuts configuration
 */
export const COMMAND_CENTER_SHORTCUTS = [
  { key: '1', ctrl: true, description: 'Go to Overview', category: 'Navigation' },
  { key: '2', ctrl: true, description: 'Go to Routing', category: 'Navigation' },
  { key: '3', ctrl: true, description: 'Go to Self-Healing', category: 'Navigation' },
  { key: '4', ctrl: true, description: 'Go to Compliance', category: 'Navigation' },
  { key: '5', ctrl: true, description: 'Go to Workload', category: 'Navigation' },
  { key: 'r', ctrl: true, description: 'Refresh data', category: 'Actions' },
  { key: 'f', ctrl: true, description: 'Toggle fullscreen', category: 'View' },
];

/**
 * Hook for assistant-specific shortcuts (T257)
 */
export function useAssistantShortcuts(handlers: {
  onToggle?: () => void;
  onClose?: () => void;
  onSubmit?: () => void;
  onNewConversation?: () => void;
  onCopyLastResponse?: () => void;
  onPreviousConversation?: () => void;
  onNextConversation?: () => void;
  onFocusInput?: () => void;
  onShowHelp?: () => void;
}) {
  const shortcuts: ShortcutConfig[] = [];

  if (handlers.onToggle) {
    shortcuts.push({
      key: 'k',
      ctrl: true,
      description: 'Toggle assistant',
      action: handlers.onToggle,
    });
  }

  if (handlers.onClose) {
    shortcuts.push({
      key: 'Escape',
      description: 'Close assistant',
      action: handlers.onClose,
      ignoreInputs: false,
    });
  }

  if (handlers.onSubmit) {
    shortcuts.push({
      key: 'Enter',
      ctrl: true,
      description: 'Submit message',
      action: handlers.onSubmit,
      ignoreInputs: false,
    });
  }

  if (handlers.onNewConversation) {
    shortcuts.push({
      key: 'n',
      ctrl: true,
      shift: true,
      description: 'New conversation',
      action: handlers.onNewConversation,
    });
  }

  if (handlers.onCopyLastResponse) {
    shortcuts.push({
      key: 'c',
      ctrl: true,
      shift: true,
      description: 'Copy last response',
      action: handlers.onCopyLastResponse,
    });
  }

  if (handlers.onPreviousConversation) {
    shortcuts.push({
      key: 'ArrowUp',
      alt: true,
      description: 'Previous conversation',
      action: handlers.onPreviousConversation,
    });
  }

  if (handlers.onNextConversation) {
    shortcuts.push({
      key: 'ArrowDown',
      alt: true,
      description: 'Next conversation',
      action: handlers.onNextConversation,
    });
  }

  if (handlers.onFocusInput) {
    shortcuts.push({
      key: '/',
      description: 'Focus input',
      action: handlers.onFocusInput,
      ignoreInputs: true,
    });
  }

  if (handlers.onShowHelp) {
    shortcuts.push({
      key: '?',
      description: 'Show shortcuts help',
      action: handlers.onShowHelp,
      ignoreInputs: true,
    });
  }

  return useKeyboardShortcuts(shortcuts);
}

/**
 * Hook for command center shortcuts (T257)
 */
export function useCommandCenterShortcuts(handlers: {
  onNavigate?: (section: number) => void;
  onRefresh?: () => void;
  onToggleFullscreen?: () => void;
  onOpenAssistant?: () => void;
}) {
  const shortcuts: ShortcutConfig[] = [];

  // Navigation shortcuts (Ctrl+1-5)
  if (handlers.onNavigate) {
    for (let i = 1; i <= 5; i++) {
      shortcuts.push({
        key: String(i),
        ctrl: true,
        description: `Go to section ${i}`,
        action: () => handlers.onNavigate!(i),
      });
    }
  }

  if (handlers.onRefresh) {
    shortcuts.push({
      key: 'r',
      ctrl: true,
      description: 'Refresh data',
      action: handlers.onRefresh,
    });
  }

  if (handlers.onToggleFullscreen) {
    shortcuts.push({
      key: 'f',
      ctrl: true,
      description: 'Toggle fullscreen',
      action: handlers.onToggleFullscreen,
    });
  }

  if (handlers.onOpenAssistant) {
    shortcuts.push({
      key: 'k',
      ctrl: true,
      description: 'Open assistant',
      action: handlers.onOpenAssistant,
    });
  }

  return useKeyboardShortcuts(shortcuts);
}

/**
 * Extended Shortcuts Help Panel Component (T257)
 */
export function ShortcutsHelpPanel({
  shortcuts,
  onClose,
  title = 'Keyboard Shortcuts',
}: {
  shortcuts: Array<{ formatted?: string; description: string; key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; category?: string }>;
  onClose?: () => void;
  title?: string;
}) {
  // Group shortcuts by category
  const categories = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || 'General';
    if (!acc[category]) acc[category] = [];

    const formatted = shortcut.formatted || formatShortcut(shortcut as ShortcutConfig);
    acc[category].push({ ...shortcut, formatted });
    return acc;
  }, {} as Record<string, Array<{ formatted: string; description: string }>>);

  // Close on Escape
  useModalShortcuts(onClose);

  return (
    <div className="shortcuts-help-panel">
      <div className="shortcuts-help-header">
        <h3>{title}</h3>
        {onClose && (
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            ×
          </button>
        )}
      </div>
      <div className="shortcuts-help-content">
        {Object.entries(categories).map(([category, categoryShortcuts]) => (
          <div key={category} className="shortcuts-category">
            <h4>{category}</h4>
            <div className="shortcuts-list">
              {categoryShortcuts.map((shortcut, index) => (
                <div key={index} className="shortcut-item">
                  <span className="shortcut-description">{shortcut.description}</span>
                  <kbd className="shortcut-key">{shortcut.formatted}</kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="shortcuts-help-footer">
        Press <kbd>?</kbd> to toggle this help
      </div>
    </div>
  );
}

// ==========================================
// T370 - Entity switching keyboard shortcuts
// ==========================================

/**
 * Entity switching shortcuts configuration
 */
export const ENTITY_SWITCHING_SHORTCUTS = [
  { key: 'e', ctrl: true, description: 'Open entity selector', category: 'Entity' },
  { key: '1-9', ctrl: true, description: 'Switch to entity 1-9', category: 'Entity' },
  { key: '[', ctrl: true, description: 'Previous entity', category: 'Entity' },
  { key: ']', ctrl: true, description: 'Next entity', category: 'Entity' },
  { key: 'Escape', description: 'Close entity selector', category: 'Entity' },
];

/**
 * Hook for entity switching shortcuts (T370)
 */
export function useEntitySwitchingShortcuts(handlers: {
  entities: Array<{ id: string; name: string; slug: string }>;
  currentEntityId: string | null;
  onSwitch: (entityId: string) => void;
  onOpenSelector: () => void;
  onCloseSelector?: () => void;
  enabled?: boolean;
}) {
  const {
    entities,
    currentEntityId,
    onSwitch,
    onOpenSelector,
    onCloseSelector,
    enabled = true,
  } = handlers;

  const shortcuts: ShortcutConfig[] = [];

  if (!enabled) {
    return useKeyboardShortcuts([]);
  }

  // Open entity selector
  shortcuts.push({
    key: 'e',
    ctrl: true,
    description: 'Open entity selector',
    action: onOpenSelector,
  });

  // Close entity selector
  if (onCloseSelector) {
    shortcuts.push({
      key: 'Escape',
      description: 'Close entity selector',
      action: onCloseSelector,
      ignoreInputs: false,
    });
  }

  // Number shortcuts (Ctrl+1 through Ctrl+9) for first 9 entities
  entities.slice(0, 9).forEach((entity, index) => {
    shortcuts.push({
      key: String(index + 1),
      ctrl: true,
      description: `Switch to ${entity.name}`,
      action: () => {
        if (currentEntityId !== entity.id) {
          onSwitch(entity.id);
        }
      },
    });
  });

  // Navigate between entities with Ctrl+[ and Ctrl+]
  const currentIndex = entities.findIndex((e) => e.id === currentEntityId);

  // Previous entity (Ctrl+[)
  if (currentIndex > 0) {
    shortcuts.push({
      key: '[',
      ctrl: true,
      description: 'Previous entity',
      action: () => onSwitch(entities[currentIndex - 1].id),
    });
  }

  // Next entity (Ctrl+])
  if (currentIndex >= 0 && currentIndex < entities.length - 1) {
    shortcuts.push({
      key: ']',
      ctrl: true,
      description: 'Next entity',
      action: () => onSwitch(entities[currentIndex + 1].id),
    });
  }

  return useKeyboardShortcuts(shortcuts);
}

/**
 * Hook for entity selector list navigation (T370)
 */
export function useEntitySelectorShortcuts(handlers: {
  entities: Array<{ id: string; name: string }>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onClose: () => void;
  isOpen: boolean;
}) {
  const { entities, selectedIndex, onSelect, onConfirm, onClose, isOpen } = handlers;

  const shortcuts: ShortcutConfig[] = [];

  if (!isOpen) {
    return useKeyboardShortcuts([]);
  }

  // Navigation
  shortcuts.push({
    key: 'ArrowUp',
    description: 'Previous entity',
    action: () => onSelect(Math.max(0, selectedIndex - 1)),
    ignoreInputs: false,
  });

  shortcuts.push({
    key: 'ArrowDown',
    description: 'Next entity',
    action: () => onSelect(Math.min(entities.length - 1, selectedIndex + 1)),
    ignoreInputs: false,
  });

  // Vim-style navigation
  shortcuts.push({
    key: 'k',
    description: 'Previous entity (vim)',
    action: () => onSelect(Math.max(0, selectedIndex - 1)),
    ignoreInputs: true,
  });

  shortcuts.push({
    key: 'j',
    description: 'Next entity (vim)',
    action: () => onSelect(Math.min(entities.length - 1, selectedIndex + 1)),
    ignoreInputs: true,
  });

  // First/Last navigation
  shortcuts.push({
    key: 'Home',
    description: 'First entity',
    action: () => onSelect(0),
    ignoreInputs: false,
  });

  shortcuts.push({
    key: 'End',
    description: 'Last entity',
    action: () => onSelect(entities.length - 1),
    ignoreInputs: false,
  });

  // Selection
  shortcuts.push({
    key: 'Enter',
    description: 'Select entity',
    action: onConfirm,
    ignoreInputs: false,
  });

  // Close
  shortcuts.push({
    key: 'Escape',
    description: 'Close selector',
    action: onClose,
    ignoreInputs: false,
  });

  return useKeyboardShortcuts(shortcuts);
}

/**
 * Quick entity search shortcuts (T370)
 * Allows typing to filter entities in the selector
 */
export function useEntityQuickSearch(handlers: {
  onSearch: (query: string) => void;
  onClear: () => void;
  enabled?: boolean;
}) {
  const { onSearch, onClear, enabled = true } = handlers;
  const searchBufferRef = useRef('');
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in input elements
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Ignore modifier keys alone
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      // Handle backspace
      if (event.key === 'Backspace') {
        searchBufferRef.current = searchBufferRef.current.slice(0, -1);
        if (searchBufferRef.current) {
          onSearch(searchBufferRef.current);
        } else {
          onClear();
        }
        return;
      }

      // Handle Escape to clear
      if (event.key === 'Escape') {
        searchBufferRef.current = '';
        onClear();
        return;
      }

      // Only handle single character keys for search
      if (event.key.length !== 1) return;

      // Add to search buffer
      searchBufferRef.current += event.key;
      onSearch(searchBufferRef.current);

      // Clear buffer after 1.5 seconds of inactivity
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
      clearTimeoutRef.current = setTimeout(() => {
        searchBufferRef.current = '';
      }, 1500);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
    };
  }, [enabled, onSearch, onClear]);
}

/**
 * Enterprise navigation shortcuts (T370)
 * Extended navigation for enterprise features
 */
export function useEnterpriseNavigationShortcuts(handlers: {
  navigate: (path: string) => void;
  currentPath?: string;
  enabled?: boolean;
}) {
  const { navigate, enabled = true } = handlers;

  const shortcuts: ShortcutConfig[] = [
    // Standard navigation
    {
      key: 'h',
      alt: true,
      description: 'Go to Dashboard',
      action: () => navigate('/dashboard'),
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
      action: () => navigate('/processes'),
    },
    // Enterprise-specific navigation
    {
      key: 's',
      alt: true,
      description: 'Go to Settings',
      action: () => navigate('/settings'),
    },
    {
      key: 'a',
      alt: true,
      shift: true,
      description: 'Go to API Dashboard',
      action: () => navigate('/settings/api'),
    },
    {
      key: 'w',
      alt: true,
      shift: true,
      description: 'Go to Webhooks',
      action: () => navigate('/settings/webhooks'),
    },
    {
      key: 'u',
      alt: true,
      shift: true,
      description: 'Go to Audit Log',
      action: () => navigate('/settings/audit'),
    },
    {
      key: 'g',
      alt: true,
      shift: true,
      description: 'Go to GDPR Dashboard',
      action: () => navigate('/settings/privacy'),
    },
    {
      key: 'b',
      alt: true,
      shift: true,
      description: 'Go to White Label',
      action: () => navigate('/settings/branding'),
    },
  ];

  return useKeyboardShortcuts(enabled ? shortcuts : []);
}

/**
 * Command palette hook for enterprise features (T370)
 */
export function useEnterpriseCommandPalette(handlers: {
  commands: Array<{
    id: string;
    name: string;
    description?: string;
    shortcut?: string;
    action: () => void;
    category?: string;
  }>;
  onOpen?: () => void;
  onClose?: () => void;
}) {
  const { commands, onOpen, onClose } = handlers;
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const filteredCommands = React.useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lower) ||
        cmd.description?.toLowerCase().includes(lower) ||
        cmd.category?.toLowerCase().includes(lower)
    );
  }, [commands, query]);

  const open = React.useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setSelectedIndex(0);
    onOpen?.();
  }, [onOpen]);

  const close = React.useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
    onClose?.();
  }, [onClose]);

  const execute = React.useCallback(() => {
    const command = filteredCommands[selectedIndex];
    if (command) {
      command.action();
      close();
    }
  }, [filteredCommands, selectedIndex, close]);

  // Global shortcut to open
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      description: 'Open command palette',
      action: open,
    },
    {
      key: 'p',
      ctrl: true,
      shift: true,
      description: 'Open command palette',
      action: open,
    },
  ]);

  // Palette-specific shortcuts when open
  useKeyboardShortcuts(
    isOpen
      ? [
          {
            key: 'Escape',
            description: 'Close palette',
            action: close,
            ignoreInputs: false,
          },
          {
            key: 'ArrowDown',
            description: 'Next command',
            action: () =>
              setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1)),
            ignoreInputs: false,
          },
          {
            key: 'ArrowUp',
            description: 'Previous command',
            action: () => setSelectedIndex((i) => Math.max(i - 1, 0)),
            ignoreInputs: false,
          },
          {
            key: 'Enter',
            description: 'Execute command',
            action: execute,
            ignoreInputs: false,
          },
        ]
      : []
  );

  return {
    isOpen,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    filteredCommands,
    open,
    close,
    execute,
  };
}

/**
 * All enterprise shortcut groups for help display (T370)
 */
export const ENTERPRISE_SHORTCUT_GROUPS = [
  {
    name: 'Entity Management',
    shortcuts: ENTITY_SWITCHING_SHORTCUTS,
  },
  {
    name: 'Navigation',
    shortcuts: [
      { key: 'h', alt: true, description: 'Dashboard', category: 'Navigation' },
      { key: 'd', alt: true, description: 'Data Sources', category: 'Navigation' },
      { key: 'p', alt: true, description: 'Processes', category: 'Navigation' },
      { key: 's', alt: true, description: 'Settings', category: 'Navigation' },
      { key: 'a', alt: true, shift: true, description: 'API Dashboard', category: 'Navigation' },
      { key: 'w', alt: true, shift: true, description: 'Webhooks', category: 'Navigation' },
      { key: 'u', alt: true, shift: true, description: 'Audit Log', category: 'Navigation' },
    ],
  },
  {
    name: 'General',
    shortcuts: [
      { key: 'k', ctrl: true, description: 'Command palette', category: 'General' },
      { key: '/', description: 'Focus search', category: 'General' },
      { key: 'Escape', description: 'Close modal/panel', category: 'General' },
      { key: '?', description: 'Show shortcuts help', category: 'General' },
    ],
  },
];

export default useKeyboardShortcuts;
