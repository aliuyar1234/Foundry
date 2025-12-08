/**
 * M-Files REST API Authentication
 * Handles authentication for both cloud and on-premise M-Files vaults
 * T168: M-Files authentication with session management
 */

export interface MFilesAuthConfig {
  serverUrl: string; // e.g., "https://yourdomain.m-files.com" or "http://localhost"
  username: string;
  password: string;
  vaultGuid?: string; // Optional: Specific vault GUID to authenticate against
  authenticationType?: 'MFAuthTypeSpecificMFilesUser' | 'MFAuthTypeSpecificWindowsUser';
}

export interface MFilesTokens {
  token: string;
  vaultGuid: string;
  expiresAt: Date;
  serverUrl: string;
}

export interface MFilesVault {
  Name: string;
  GUID: string;
  Authentication: number;
}

export interface MFilesAuthenticationResult {
  Value: string; // The authentication token
  SessionID?: string;
}

/**
 * Default authentication type constants
 */
export const MF_AUTH_TYPE_SPECIFIC_MFILES_USER = 1; // MFAuthTypeSpecificMFilesUser
export const MF_AUTH_TYPE_SPECIFIC_WINDOWS_USER = 2; // MFAuthTypeSpecificWindowsUser
export const MF_AUTH_TYPE_CURRENT_WINDOWS_USER = 3; // MFAuthTypeCurrentWindowsUser
export const MF_AUTH_TYPE_ANONYMOUS = 4; // MFAuthTypeAnonymous

/**
 * Get the authentication type code from string
 */
function getAuthTypeCode(type?: string): number {
  switch (type) {
    case 'MFAuthTypeSpecificMFilesUser':
      return MF_AUTH_TYPE_SPECIFIC_MFILES_USER;
    case 'MFAuthTypeSpecificWindowsUser':
      return MF_AUTH_TYPE_SPECIFIC_WINDOWS_USER;
    default:
      return MF_AUTH_TYPE_SPECIFIC_MFILES_USER;
  }
}

/**
 * Get list of available vaults from M-Files server
 */
export async function getAvailableVaults(serverUrl: string): Promise<MFilesVault[]> {
  const url = `${serverUrl}/REST/server/vaults`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to get M-Files vaults: ${error}`);
  }

  return response.json();
}

/**
 * Authenticate to M-Files vault and get authentication token
 */
export async function authenticateToVault(
  config: MFilesAuthConfig
): Promise<MFilesTokens> {
  // If no vault GUID is provided, get the first available vault
  let vaultGuid = config.vaultGuid;

  if (!vaultGuid) {
    const vaults = await getAvailableVaults(config.serverUrl);
    if (vaults.length === 0) {
      throw new Error('No vaults available on M-Files server');
    }
    vaultGuid = vaults[0].GUID;
  }

  const authType = getAuthTypeCode(config.authenticationType);
  const url = `${config.serverUrl}/REST/server/authenticationtokens`;

  const authBody = {
    Username: config.username,
    Password: config.password,
    VaultGuid: vaultGuid,
    Expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    SessionID: '',
    ReadOnly: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(authBody),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText);
    throw new Error(`M-Files authentication failed: ${error}`);
  }

  const result: MFilesAuthenticationResult = await response.json();

  // Token typically expires in 24 hours, but we set it to 23 hours to be safe
  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000);

  return {
    token: result.Value,
    vaultGuid: vaultGuid,
    expiresAt,
    serverUrl: config.serverUrl,
  };
}

/**
 * Refresh M-Files authentication token
 * Note: M-Files doesn't have a traditional refresh token mechanism,
 * so we re-authenticate with credentials
 */
export async function refreshAuthToken(
  config: MFilesAuthConfig
): Promise<MFilesTokens> {
  return authenticateToVault(config);
}

/**
 * Test authentication by making a simple API call
 */
export async function testAuthentication(
  serverUrl: string,
  vaultGuid: string,
  token: string
): Promise<boolean> {
  try {
    const url = `${serverUrl}/REST/server/vaults/${vaultGuid}/views`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Authentication': token,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Destroy M-Files session (logout)
 */
export async function destroySession(
  serverUrl: string,
  token: string
): Promise<void> {
  try {
    const url = `${serverUrl}/REST/session`;

    await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-Authentication': token,
      },
    });
  } catch (error) {
    // Ignore errors during logout
    console.warn('Failed to destroy M-Files session:', error);
  }
}

/**
 * Validate M-Files configuration
 */
export function validateMFilesConfig(config: Partial<MFilesAuthConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.serverUrl) {
    errors.push('Missing serverUrl');
  } else {
    try {
      new URL(config.serverUrl);
    } catch {
      errors.push('Invalid serverUrl format');
    }
  }

  if (!config.username) {
    errors.push('Missing username');
  }

  if (!config.password) {
    errors.push('Missing password');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if authentication is cloud or on-premise based on URL
 */
export function isCloudVault(serverUrl: string): boolean {
  return serverUrl.includes('.m-files.com') || serverUrl.includes('.cloudvault.m-files.com');
}

/**
 * Get vault-specific REST API base URL
 */
export function getVaultApiUrl(serverUrl: string, vaultGuid: string): string {
  return `${serverUrl}/REST/server/vaults/${vaultGuid}`;
}
