/**
 * Responsive Layout Components
 * T260 - Implement responsive layouts for command center
 *
 * Provides responsive grid and layout components that adapt to different screen sizes
 */

import React, { ReactNode, useState, useEffect, useCallback } from 'react';

// Types
type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface BreakpointConfig {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
}

interface ResponsiveGridProps {
  children: ReactNode;
  cols?: Partial<Record<Breakpoint, number>>;
  gap?: number | Partial<Record<Breakpoint, number>>;
  className?: string;
}

interface ResponsiveContainerProps {
  children: ReactNode;
  maxWidth?: Breakpoint | number;
  padding?: boolean;
  className?: string;
}

interface ShowAtProps {
  children: ReactNode;
  breakpoint: Breakpoint;
  direction?: 'up' | 'down' | 'only';
}

interface ResponsiveSidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  sidebarWidth?: number;
  sidebarPosition?: 'left' | 'right';
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  mobileBreakpoint?: Breakpoint;
}

interface ResponsiveStackProps {
  children: ReactNode;
  direction?: 'horizontal' | 'vertical' | Partial<Record<Breakpoint, 'horizontal' | 'vertical'>>;
  gap?: number | Partial<Record<Breakpoint, number>>;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
  className?: string;
}

// Breakpoint values (in pixels)
const BREAKPOINTS: BreakpointConfig = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

// ==========================================
// Hooks
// ==========================================

/**
 * Hook to get current breakpoint
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('lg');

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      if (width >= BREAKPOINTS['2xl']) setBreakpoint('2xl');
      else if (width >= BREAKPOINTS.xl) setBreakpoint('xl');
      else if (width >= BREAKPOINTS.lg) setBreakpoint('lg');
      else if (width >= BREAKPOINTS.md) setBreakpoint('md');
      else if (width >= BREAKPOINTS.sm) setBreakpoint('sm');
      else setBreakpoint('xs');
    };

    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);

  return breakpoint;
}

/**
 * Hook to check if current breakpoint matches condition
 */
export function useMediaQuery(breakpoint: Breakpoint, direction: 'up' | 'down' = 'up'): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const query =
      direction === 'up'
        ? `(min-width: ${BREAKPOINTS[breakpoint]}px)`
        : `(max-width: ${BREAKPOINTS[breakpoint] - 1}px)`;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [breakpoint, direction]);

  return matches;
}

/**
 * Hook for responsive value
 */
export function useResponsiveValue<T>(values: Partial<Record<Breakpoint, T>>, defaultValue: T): T {
  const breakpoint = useBreakpoint();

  // Find the closest breakpoint value
  const breakpointOrder: Breakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];
  const currentIndex = breakpointOrder.indexOf(breakpoint);

  for (let i = currentIndex; i < breakpointOrder.length; i++) {
    const bp = breakpointOrder[i];
    if (values[bp] !== undefined) {
      return values[bp]!;
    }
  }

  return defaultValue;
}

// ==========================================
// Components
// ==========================================

/**
 * Responsive Grid Component
 */
export function ResponsiveGrid({
  children,
  cols = { xs: 1, sm: 2, md: 3, lg: 4 },
  gap = 16,
  className = '',
}: ResponsiveGridProps) {
  const breakpoint = useBreakpoint();

  const currentCols = useResponsiveValue(cols, 1);
  const currentGap = typeof gap === 'number' ? gap : useResponsiveValue(gap, 16);

  return (
    <div
      className={`responsive-grid ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${currentCols}, minmax(0, 1fr))`,
        gap: currentGap,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Responsive Container Component
 */
export function ResponsiveContainer({
  children,
  maxWidth = 'xl',
  padding = true,
  className = '',
}: ResponsiveContainerProps) {
  const maxWidthValue = typeof maxWidth === 'number' ? maxWidth : BREAKPOINTS[maxWidth];

  return (
    <div
      className={`responsive-container ${className}`}
      style={{
        maxWidth: maxWidthValue,
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: padding ? 16 : 0,
        paddingRight: padding ? 16 : 0,
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Show content at specific breakpoints
 */
export function ShowAt({ children, breakpoint, direction = 'up' }: ShowAtProps) {
  const isVisible = useMediaQuery(breakpoint, direction);

  if (!isVisible) return null;
  return <>{children}</>;
}

/**
 * Hide content at specific breakpoints
 */
export function HideAt({ children, breakpoint, direction = 'down' }: ShowAtProps) {
  const isHidden = useMediaQuery(breakpoint, direction);

  if (isHidden) return null;
  return <>{children}</>;
}

/**
 * Responsive Stack Component
 */
export function ResponsiveStack({
  children,
  direction = 'vertical',
  gap = 16,
  align = 'stretch',
  justify = 'start',
  wrap = false,
  className = '',
}: ResponsiveStackProps) {
  const currentDirection =
    typeof direction === 'string' ? direction : useResponsiveValue(direction, 'vertical');
  const currentGap = typeof gap === 'number' ? gap : useResponsiveValue(gap, 16);

  const alignMap = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
  };

  const justifyMap = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
    around: 'space-around',
  };

  return (
    <div
      className={`responsive-stack ${className}`}
      style={{
        display: 'flex',
        flexDirection: currentDirection === 'horizontal' ? 'row' : 'column',
        gap: currentGap,
        alignItems: alignMap[align],
        justifyContent: justifyMap[justify],
        flexWrap: wrap ? 'wrap' : 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Responsive Sidebar Layout
 */
export function ResponsiveSidebarLayout({
  sidebar,
  children,
  sidebarWidth = 280,
  sidebarPosition = 'left',
  collapsible = true,
  defaultCollapsed = false,
  mobileBreakpoint = 'md',
}: ResponsiveSidebarLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const isMobile = useMediaQuery(mobileBreakpoint, 'down');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setIsMobileMenuOpen(!isMobileMenuOpen);
    } else {
      setIsCollapsed(!isCollapsed);
    }
  }, [isMobile, isMobileMenuOpen, isCollapsed]);

  // Close mobile menu on breakpoint change
  useEffect(() => {
    if (!isMobile) {
      setIsMobileMenuOpen(false);
    }
  }, [isMobile]);

  return (
    <div className="responsive-sidebar-layout">
      {/* Mobile overlay */}
      {isMobile && isMobileMenuOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${sidebarPosition} ${isCollapsed ? 'collapsed' : ''} ${isMobile ? 'mobile' : ''} ${isMobileMenuOpen ? 'open' : ''}`}
        style={{
          width: isMobile ? '100%' : isCollapsed ? 64 : sidebarWidth,
          maxWidth: isMobile ? 320 : undefined,
        }}
      >
        {collapsible && (
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={sidebarPosition === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
            </svg>
          </button>
        )}
        <div className="sidebar-content">{sidebar}</div>
      </aside>

      {/* Main content */}
      <main
        className="main-content"
        style={{
          marginLeft: sidebarPosition === 'left' && !isMobile ? (isCollapsed ? 64 : sidebarWidth) : 0,
          marginRight: sidebarPosition === 'right' && !isMobile ? (isCollapsed ? 64 : sidebarWidth) : 0,
        }}
      >
        {/* Mobile menu button */}
        {isMobile && (
          <button
            className="mobile-menu-button"
            onClick={toggleSidebar}
            aria-label="Toggle menu"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        {children}
      </main>
    </div>
  );
}

/**
 * Command Center Layout
 */
export function CommandCenterLayout({
  header,
  sidebar,
  children,
  footer,
}: {
  header?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const isMobile = useMediaQuery('lg', 'down');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="command-center-layout">
      {/* Header */}
      {header && (
        <header className="cc-header">
          {isMobile && sidebar && (
            <button
              className="cc-menu-button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          {header}
        </header>
      )}

      <div className="cc-body">
        {/* Sidebar */}
        {sidebar && (
          <>
            {isMobile && sidebarOpen && (
              <div
                className="cc-sidebar-overlay"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <aside className={`cc-sidebar ${isMobile ? 'mobile' : ''} ${sidebarOpen ? 'open' : ''}`}>
              {sidebar}
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="cc-main">
          {children}
        </main>
      </div>

      {/* Footer */}
      {footer && (
        <footer className="cc-footer">
          {footer}
        </footer>
      )}
    </div>
  );
}

/**
 * Dashboard Panel with responsive behavior
 */
export function DashboardPanel({
  title,
  children,
  actions,
  collapsible = false,
  defaultCollapsed = false,
  fullWidth = false,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  fullWidth?: boolean;
  className?: string;
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`dashboard-panel ${fullWidth ? 'full-width' : ''} ${isCollapsed ? 'collapsed' : ''} ${className}`}>
      {(title || actions || collapsible) && (
        <div className="panel-header">
          {collapsible && (
            <button
              className="panel-collapse-btn"
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={isCollapsed ? 'M9 5l7 7-7 7' : 'M19 9l-7 7-7-7'} />
              </svg>
            </button>
          )}
          {title && <h3 className="panel-title">{title}</h3>}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      {!isCollapsed && <div className="panel-content">{children}</div>}
    </div>
  );
}

// CSS styles
const styles = `
/* Responsive Sidebar Layout */
.responsive-sidebar-layout {
  display: flex;
  min-height: 100vh;
  position: relative;
}

.sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  background: white;
  border-right: 1px solid #e5e7eb;
  transition: width 0.3s ease, transform 0.3s ease;
  z-index: 40;
  overflow: hidden;
}

.sidebar.left {
  left: 0;
}

.sidebar.right {
  right: 0;
  border-right: none;
  border-left: 1px solid #e5e7eb;
}

.sidebar.mobile {
  transform: translateX(-100%);
}

.sidebar.mobile.open {
  transform: translateX(0);
}

.sidebar.right.mobile {
  transform: translateX(100%);
}

.sidebar.right.mobile.open {
  transform: translateX(0);
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 30;
}

.sidebar-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 8px;
  background: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  z-index: 10;
}

.sidebar-toggle:hover {
  background: #e5e7eb;
}

.sidebar.collapsed .sidebar-toggle svg {
  transform: rotate(180deg);
}

.sidebar-content {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.sidebar.collapsed .sidebar-content {
  padding: 16px 8px;
}

.main-content {
  flex: 1;
  min-height: 100vh;
  transition: margin 0.3s ease;
}

.mobile-menu-button {
  position: fixed;
  top: 12px;
  left: 12px;
  padding: 8px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  z-index: 20;
}

/* Command Center Layout */
.command-center-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f9fafb;
}

.cc-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 20;
}

.cc-menu-button {
  padding: 8px;
  background: none;
  border: none;
  cursor: pointer;
  color: #6b7280;
}

.cc-menu-button:hover {
  color: #374151;
}

.cc-body {
  display: flex;
  flex: 1;
  position: relative;
}

.cc-sidebar {
  width: 280px;
  background: white;
  border-right: 1px solid #e5e7eb;
  overflow-y: auto;
  flex-shrink: 0;
}

.cc-sidebar.mobile {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 40;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
}

.cc-sidebar.mobile.open {
  transform: translateX(0);
}

.cc-sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 30;
}

.cc-main {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

@media (max-width: 1024px) {
  .cc-main {
    padding: 16px;
  }
}

.cc-footer {
  padding: 12px 24px;
  background: white;
  border-top: 1px solid #e5e7eb;
}

/* Dashboard Panel */
.dashboard-panel {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.dashboard-panel.full-width {
  grid-column: 1 / -1;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.panel-collapse-btn {
  padding: 4px;
  background: none;
  border: none;
  cursor: pointer;
  color: #6b7280;
  transition: transform 0.2s;
}

.panel-collapse-btn:hover {
  color: #374151;
}

.dashboard-panel.collapsed .panel-header {
  border-bottom: none;
}

.panel-title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.panel-content {
  padding: 16px;
}

/* Responsive Grid utilities */
.responsive-grid {
  width: 100%;
}

/* Mobile optimizations */
@media (max-width: 640px) {
  .cc-header {
    padding: 12px 16px;
  }

  .cc-main {
    padding: 12px;
  }

  .dashboard-panel .panel-content {
    padding: 12px;
  }
}
`;

export const responsiveLayoutStyles = styles;

export {
  BREAKPOINTS,
  type Breakpoint,
  type BreakpointConfig,
};

export default {
  ResponsiveGrid,
  ResponsiveContainer,
  ResponsiveStack,
  ResponsiveSidebarLayout,
  CommandCenterLayout,
  DashboardPanel,
  ShowAt,
  HideAt,
  useBreakpoint,
  useMediaQuery,
  useResponsiveValue,
};
