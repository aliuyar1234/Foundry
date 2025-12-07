/**
 * Zustand Auth Store
 * Manages authentication state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@eaif/shared';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  setUser: (user: AuthUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<boolean>;
  checkAuth: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
      },

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken });
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },

      setError: (error) => {
        set({ error });
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Login failed');
          }

          const data = await response.json();

          get().setTokens(data.accessToken, data.refreshToken);
          set({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({
          ...initialState,
          isLoading: false,
        });
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();

        if (!refreshToken) {
          return false;
        }

        try {
          const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (!response.ok) {
            get().logout();
            return false;
          }

          const data = await response.json();
          set({ accessToken: data.accessToken });
          localStorage.setItem('accessToken', data.accessToken);
          return true;
        } catch {
          get().logout();
          return false;
        }
      },

      checkAuth: async () => {
        const { accessToken } = get();

        if (!accessToken) {
          set({ isLoading: false });
          return;
        }

        try {
          const response = await fetch('/api/auth/me', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            // Try to refresh token
            const refreshed = await get().refreshAccessToken();
            if (!refreshed) {
              set({ isLoading: false });
              return;
            }

            // Retry with new token
            const retryResponse = await fetch('/api/auth/me', {
              headers: {
                Authorization: `Bearer ${get().accessToken}`,
              },
            });

            if (!retryResponse.ok) {
              get().logout();
              return;
            }

            const data = await retryResponse.json();
            set({ user: data.user, isAuthenticated: true, isLoading: false });
            return;
          }

          const data = await response.json();
          set({ user: data.user, isAuthenticated: true, isLoading: false });
        } catch {
          get().logout();
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// Selector hooks for common patterns
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useIsAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
