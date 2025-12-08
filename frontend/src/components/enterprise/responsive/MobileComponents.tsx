/**
 * Mobile-Responsive Enterprise Components (T379-T382)
 * Responsive layouts and touch-friendly components for enterprise features
 */

import React, { useState, useEffect, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface BreakpointConfig {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
}

// =============================================================================
// Breakpoint Configuration
// =============================================================================

const BREAKPOINTS: BreakpointConfig = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

// =============================================================================
// Hooks
// =============================================================================

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('lg');

  useEffect(() => {
    const calculateBreakpoint = (): Breakpoint => {
      const width = window.innerWidth;
      if (width >= BREAKPOINTS['2xl']) return '2xl';
      if (width >= BREAKPOINTS.xl) return 'xl';
      if (width >= BREAKPOINTS.lg) return 'lg';
      if (width >= BREAKPOINTS.md) return 'md';
      if (width >= BREAKPOINTS.sm) return 'sm';
      return 'xs';
    };

    const handleResize = () => {
      setBreakpoint(calculateBreakpoint());
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}

export function useIsMobile(): boolean {
  const breakpoint = useBreakpoint();
  return breakpoint === 'xs' || breakpoint === 'sm';
}

export function useIsTablet(): boolean {
  const breakpoint = useBreakpoint();
  return breakpoint === 'md';
}

export function useIsDesktop(): boolean {
  const breakpoint = useBreakpoint();
  return breakpoint === 'lg' || breakpoint === 'xl' || breakpoint === '2xl';
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// =============================================================================
// Responsive Container
// =============================================================================

interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function ResponsiveContainer({
  children,
  className = '',
  padding = true,
}: ResponsiveContainerProps) {
  return (
    <div
      className={`
        w-full mx-auto
        ${padding ? 'px-4 sm:px-6 lg:px-8' : ''}
        max-w-7xl
        ${className}
      `}
    >
      {children}
    </div>
  );
}

// =============================================================================
// Responsive Grid
// =============================================================================

interface ResponsiveGridProps {
  children: React.ReactNode;
  cols?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  gap?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function ResponsiveGrid({
  children,
  cols = { xs: 1, sm: 2, md: 3, lg: 4 },
  gap = 'md',
  className = '',
}: ResponsiveGridProps) {
  const gapClasses = {
    none: 'gap-0',
    sm: 'gap-2 sm:gap-3',
    md: 'gap-4 sm:gap-6',
    lg: 'gap-6 sm:gap-8',
  };

  const colClasses = [
    cols.xs ? `grid-cols-${cols.xs}` : 'grid-cols-1',
    cols.sm ? `sm:grid-cols-${cols.sm}` : '',
    cols.md ? `md:grid-cols-${cols.md}` : '',
    cols.lg ? `lg:grid-cols-${cols.lg}` : '',
    cols.xl ? `xl:grid-cols-${cols.xl}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`grid ${colClasses} ${gapClasses[gap]} ${className}`}>{children}</div>
  );
}

// =============================================================================
// Mobile Navigation Drawer (T379)
// =============================================================================

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  position?: 'left' | 'right';
}

export function MobileDrawer({
  isOpen,
  onClose,
  children,
  title,
  position = 'left',
}: MobileDrawerProps) {
  // Lock body scroll when open
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

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const positionClasses =
    position === 'left'
      ? 'left-0 -translate-x-full'
      : 'right-0 translate-x-full';

  const openClasses =
    position === 'left' ? 'translate-x-0' : 'translate-x-0';

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`
          absolute top-0 ${position}-0 h-full w-80 max-w-[85vw]
          bg-white shadow-xl transform transition-transform duration-300 ease-out
          ${isOpen ? openClasses : positionClasses}
        `}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Navigation drawer'}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
          <button
            onClick={onClose}
            className="p-2 -m-2 text-gray-400 hover:text-gray-600 rounded-lg"
            aria-label="Close drawer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// =============================================================================
// Mobile Entity Selector (T379)
// =============================================================================

interface MobileEntitySelectorProps {
  entities: Array<{ id: string; name: string; slug: string; logo?: string }>;
  currentEntityId: string | null;
  onSelect: (entityId: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function MobileEntitySelector({
  entities,
  currentEntityId,
  onSelect,
  onClose,
  isOpen,
}: MobileEntitySelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntities = entities.filter(
    (entity) =>
      entity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entity.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (entityId: string) => {
    onSelect(entityId);
    onClose();
  };

  return (
    <MobileDrawer isOpen={isOpen} onClose={onClose} title="Select Entity" position="left">
      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Entity List */}
      <div className="space-y-2">
        {filteredEntities.map((entity) => (
          <button
            key={entity.id}
            onClick={() => handleSelect(entity.id)}
            className={`
              w-full flex items-center gap-3 p-4 rounded-lg text-left transition-colors
              ${
                currentEntityId === entity.id
                  ? 'bg-blue-50 border-2 border-blue-500'
                  : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
              }
            `}
          >
            {/* Logo/Avatar */}
            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
              {entity.logo ? (
                <img
                  src={entity.logo}
                  alt=""
                  className="w-full h-full rounded-lg object-cover"
                />
              ) : (
                <span className="text-lg font-semibold text-gray-600">
                  {entity.name.charAt(0)}
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">{entity.name}</div>
              <div className="text-sm text-gray-500 truncate">{entity.slug}</div>
            </div>

            {/* Selected indicator */}
            {currentEntityId === entity.id && (
              <svg
                className="w-5 h-5 text-blue-600 flex-shrink-0"
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

        {filteredEntities.length === 0 && (
          <div className="text-center py-8 text-gray-500">No entities found</div>
        )}
      </div>
    </MobileDrawer>
  );
}

// =============================================================================
// Swipeable Card (T380)
// =============================================================================

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  className?: string;
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  className = '',
}: SwipeableCardProps) {
  const [offset, setOffset] = useState(0);
  const [startX, setStartX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;

    // Limit the offset
    const maxOffset = 100;
    setOffset(Math.max(-maxOffset, Math.min(maxOffset, diff)));
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const threshold = 60;

    if (offset > threshold && onSwipeRight) {
      onSwipeRight();
    } else if (offset < -threshold && onSwipeLeft) {
      onSwipeLeft();
    }

    setOffset(0);
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Background Actions */}
      {leftAction && (
        <div
          className="absolute left-0 top-0 bottom-0 flex items-center px-4 bg-green-500 text-white"
          style={{ opacity: offset > 0 ? Math.min(offset / 60, 1) : 0 }}
        >
          {leftAction}
        </div>
      )}
      {rightAction && (
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center px-4 bg-red-500 text-white"
          style={{ opacity: offset < 0 ? Math.min(-offset / 60, 1) : 0 }}
        >
          {rightAction}
        </div>
      )}

      {/* Card Content */}
      <div
        className="relative bg-white transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(${offset}px)`,
          transitionDuration: isDragging ? '0ms' : '200ms',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// Responsive Data Table (T381)
// =============================================================================

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  mobileHidden?: boolean;
  priority?: number; // Lower = higher priority to show on mobile
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}

export function ResponsiveTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  onRowClick,
  emptyMessage = 'No data available',
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

  // On mobile, show as cards
  if (isMobile) {
    return (
      <div className="space-y-3">
        {data.length === 0 ? (
          <div className="text-center py-8 text-gray-500">{emptyMessage}</div>
        ) : (
          data.map((item) => (
            <div
              key={String(item[keyField])}
              className={`
                bg-white rounded-lg border border-gray-200 p-4
                ${onRowClick ? 'cursor-pointer active:bg-gray-50' : ''}
              `}
              onClick={() => onRowClick?.(item)}
            >
              {columns
                .filter((col) => !col.mobileHidden)
                .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                .map((col, index) => (
                  <div
                    key={col.key}
                    className={`
                      flex justify-between items-start
                      ${index > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}
                    `}
                  >
                    <span className="text-sm text-gray-500">{col.header}</span>
                    <span className="text-sm font-medium text-gray-900 text-right">
                      {col.render
                        ? col.render(item)
                        : String(item[col.key as keyof T] ?? '')}
                    </span>
                  </div>
                ))}
            </div>
          ))
        )}
      </div>
    );
  }

  // Desktop: regular table
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr
                key={String(item[keyField])}
                className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {col.render ? col.render(item) : String(item[col.key as keyof T] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Touch-Friendly Button (T380)
// =============================================================================

interface TouchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

export function TouchButton({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}: TouchButtonProps) {
  const baseClasses = `
    inline-flex items-center justify-center gap-2 font-medium rounded-lg
    transition-colors active:scale-95 transform
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
  `;

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
    outline: 'border-2 border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
    ghost: 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  // Larger touch targets on mobile
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm min-h-[40px] min-w-[40px]',
    md: 'px-4 py-3 text-base min-h-[48px] min-w-[48px]',
    lg: 'px-6 py-4 text-lg min-h-[56px] min-w-[56px]',
  };

  return (
    <button
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
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
      ) : icon ? (
        icon
      ) : null}
      {children}
    </button>
  );
}

// =============================================================================
// Bottom Sheet (T382)
// =============================================================================

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  snapPoints?: number[];
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  snapPoints = [0.5, 0.9],
}: BottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(0);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const sheetHeight = snapPoints[currentSnap] * 100;

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
    setCurrentY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setCurrentY(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const diff = currentY - startY;

    if (diff > 100) {
      // Dragged down
      if (currentSnap > 0) {
        setCurrentSnap(currentSnap - 1);
      } else {
        onClose();
      }
    } else if (diff < -100) {
      // Dragged up
      if (currentSnap < snapPoints.length - 1) {
        setCurrentSnap(currentSnap + 1);
      }
    }

    setStartY(0);
    setCurrentY(0);
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setCurrentSnap(0);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const dragOffset = isDragging ? currentY - startY : 0;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl transition-transform duration-300 ease-out"
        style={{
          height: `${sheetHeight}vh`,
          transform: `translateY(${Math.max(0, dragOffset)}px)`,
          transitionDuration: isDragging ? '0ms' : '300ms',
        }}
      >
        {/* Handle */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        {title && (
          <div className="px-4 pb-3 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// =============================================================================
// Pull to Refresh (T382)
// =============================================================================

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
}: PullToRefreshProps) {
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].clientY);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startY === 0 || isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0 && window.scrollY === 0) {
        e.preventDefault();
        setPullDistance(Math.min(diff * 0.5, threshold * 1.5));
      }
    },
    [startY, isRefreshing, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold * 0.5);

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    setStartY(0);
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Refresh indicator */}
      <div
        className="flex justify-center items-center overflow-hidden transition-all duration-200"
        style={{ height: pullDistance }}
      >
        <div
          className={`
            w-8 h-8 rounded-full border-2 border-gray-300 border-t-blue-600
            ${isRefreshing ? 'animate-spin' : ''}
          `}
          style={{
            transform: `rotate(${(pullDistance / threshold) * 360}deg)`,
            opacity: Math.min(pullDistance / threshold, 1),
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          transform: `translateY(${isRefreshing ? 0 : 0}px)`,
          transition: 'transform 200ms',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default {
  useBreakpoint,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useMediaQuery,
  ResponsiveContainer,
  ResponsiveGrid,
  MobileDrawer,
  MobileEntitySelector,
  SwipeableCard,
  ResponsiveTable,
  TouchButton,
  BottomSheet,
  PullToRefresh,
};
