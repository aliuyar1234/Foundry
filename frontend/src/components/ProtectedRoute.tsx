/**
 * Protected Route Wrapper
 * Redirects to login if user is not authenticated
 */

import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, useIsAuthenticated, useIsAuthLoading } from '@/stores/authStore';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER';
}

const ROLE_HIERARCHY = ['VIEWER', 'ANALYST', 'ADMIN', 'OWNER'];

function hasRequiredRole(userRole: string, requiredRole: string): boolean {
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole);
  const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);
  return userRoleIndex >= requiredRoleIndex;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useIsAuthLoading();
  const user = useAuthStore((state) => state.user);
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login with return URL
      navigate('/login', {
        state: { from: location.pathname },
        replace: true,
      });
    }
  }, [isLoading, isAuthenticated, navigate, location]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Check role requirement
  if (requiredRole && user) {
    if (!hasRequiredRole(user.role, requiredRole)) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
            <p className="mt-2 text-muted-foreground">
              You don't have permission to access this page.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Required role: {requiredRole}
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}

// HOC version for class components or different patterns
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  requiredRole?: 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER'
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute requiredRole={requiredRole}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}
