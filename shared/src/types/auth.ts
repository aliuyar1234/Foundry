/**
 * Authentication and Authorization Types
 */

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  ANALYST: 'ANALYST',
  VIEWER: 'VIEWER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ROLE_HIERARCHY: Role[] = ['VIEWER', 'ANALYST', 'ADMIN', 'OWNER'];

export interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'manage';
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: Role;
  organizationId: string;
  authProviderId: string;
}

export interface JWTClaims {
  sub: string;
  email: string;
  name?: string;
  'https://eaif.com/role': Role;
  'https://eaif.com/organizationId': string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
}
