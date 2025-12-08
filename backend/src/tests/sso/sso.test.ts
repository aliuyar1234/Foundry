// =============================================================================
// SSO Service Tests
// SCALE Tier - Enterprise SSO Testing
//
// Unit tests for SAML, OIDC, SCIM, Role Mapping, and Directory Sync services
// =============================================================================

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SamlService, SamlConfiguration } from '../../services/sso/samlService';
import { OidcService, OidcConfiguration } from '../../services/sso/oidcService';
import { ScimService, ScimUser } from '../../services/sso/scimService';
import { RoleMappingService, RoleMapping, DEFAULT_ROLES } from '../../services/sso/roleMappingService';
import { DirectorySyncService, DirectorySyncConfig } from '../../services/sso/directorySyncService';

// Mock Prisma
vi.mock('@prisma/client', () => {
  const mockPrisma = {
    ssoConfiguration: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    ssoRoleMapping: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    directorySyncConfig: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    directorySyncJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    group: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    groupMembership: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    scimSyncLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };
  return { PrismaClient: vi.fn(() => mockPrisma) };
});

// Mock fetch
global.fetch = vi.fn();

describe('SamlService', () => {
  let samlService: SamlService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = new PrismaClient();
    samlService = new SamlService(prisma);
    vi.clearAllMocks();
  });

  describe('Configuration Management', () => {
    const mockConfig: Partial<SamlConfiguration> = {
      organizationId: 'org-123',
      idpEntityId: 'https://idp.example.com',
      idpSsoUrl: 'https://idp.example.com/sso',
      idpCertificate: 'MIIC...certificate...',
      spEntityId: 'https://sp.example.com',
      spAcsUrl: 'https://sp.example.com/acs',
      attributeMapping: {
        email: 'email',
        firstName: 'firstName',
        lastName: 'lastName',
      },
      signRequests: false,
      signAssertions: true,
      encryptAssertions: false,
      allowUnencrypted: true,
    };

    it('should create SAML configuration', async () => {
      const dbRecord = {
        id: 'config-123',
        organizationId: 'org-123',
        providerType: 'SAML',
        enabled: true,
        configuration: mockConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.ssoConfiguration.create as Mock).mockResolvedValue(dbRecord);

      const result = await samlService.createConfiguration('org-123', {
        ...mockConfig,
        providerType: 'SAML',
        enabled: true,
      } as any);

      expect(result.organizationId).toBe('org-123');
      expect(result.providerType).toBe('SAML');
      expect(prisma.ssoConfiguration.create).toHaveBeenCalled();
    });

    it('should get SAML configuration by organization', async () => {
      const dbRecord = {
        id: 'config-123',
        organizationId: 'org-123',
        providerType: 'SAML',
        enabled: true,
        configuration: mockConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.ssoConfiguration.findFirst as Mock).mockResolvedValue(dbRecord);

      const result = await samlService.getConfiguration('org-123');

      expect(result).not.toBeNull();
      expect(result?.organizationId).toBe('org-123');
      expect(prisma.ssoConfiguration.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-123', providerType: 'SAML' },
      });
    });

    it('should return null for non-existent configuration', async () => {
      (prisma.ssoConfiguration.findFirst as Mock).mockResolvedValue(null);

      const result = await samlService.getConfiguration('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('AuthRequest Generation', () => {
    const config: SamlConfiguration = {
      id: 'config-123',
      entityId: 'config-123',
      organizationId: 'org-123',
      providerType: 'SAML',
      enabled: true,
      idpEntityId: 'https://idp.example.com',
      idpSsoUrl: 'https://idp.example.com/sso',
      idpCertificate: 'cert',
      spEntityId: 'https://sp.example.com',
      spAcsUrl: 'https://sp.example.com/acs',
      attributeMapping: { email: 'email' },
      signRequests: false,
      signAssertions: true,
      encryptAssertions: false,
      allowUnencrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should generate valid AuthnRequest', () => {
      const request = samlService.generateAuthRequest(config);

      expect(request.id).toMatch(/^_[a-f0-9-]+$/);
      expect(request.destination).toBe(config.idpSsoUrl);
      expect(request.issuer).toBe(config.spEntityId);
      expect(request.assertionConsumerServiceUrl).toBe(config.spAcsUrl);
    });

    it('should build valid AuthnRequest XML', () => {
      const request = samlService.generateAuthRequest(config);
      const xml = samlService.buildAuthRequestXml(request);

      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('samlp:AuthnRequest');
      expect(xml).toContain(request.id);
      expect(xml).toContain(config.idpSsoUrl);
      expect(xml).toContain(config.spEntityId);
    });

    it('should build redirect URL with encoded request', () => {
      const url = samlService.buildRedirectUrl(config, 'org-123|/dashboard');

      expect(url).toContain(config.idpSsoUrl);
      expect(url).toContain('SAMLRequest=');
      expect(url).toContain('RelayState=');
    });
  });

  describe('SP Metadata Generation', () => {
    const config: SamlConfiguration = {
      id: 'config-123',
      entityId: 'config-123',
      organizationId: 'org-123',
      providerType: 'SAML',
      enabled: true,
      idpEntityId: 'https://idp.example.com',
      idpSsoUrl: 'https://idp.example.com/sso',
      idpCertificate: 'cert',
      spEntityId: 'https://sp.example.com',
      spAcsUrl: 'https://sp.example.com/acs',
      spSloUrl: 'https://sp.example.com/slo',
      attributeMapping: { email: 'email' },
      signRequests: true,
      signAssertions: true,
      encryptAssertions: false,
      allowUnencrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should generate valid SP metadata XML', () => {
      const metadata = samlService.generateSpMetadata(config);

      expect(metadata).toContain('<?xml version="1.0"');
      expect(metadata).toContain('md:EntityDescriptor');
      expect(metadata).toContain(config.spEntityId);
      expect(metadata).toContain(config.spAcsUrl);
      expect(metadata).toContain('md:SingleLogoutService');
    });
  });
});

describe('OidcService', () => {
  let oidcService: OidcService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = new PrismaClient();
    oidcService = new OidcService(prisma);
    vi.clearAllMocks();
  });

  describe('Configuration Discovery', () => {
    it('should discover OIDC configuration from issuer', async () => {
      const discoveryDoc = {
        issuer: 'https://idp.example.com',
        authorization_endpoint: 'https://idp.example.com/authorize',
        token_endpoint: 'https://idp.example.com/token',
        userinfo_endpoint: 'https://idp.example.com/userinfo',
        jwks_uri: 'https://idp.example.com/.well-known/jwks.json',
        end_session_endpoint: 'https://idp.example.com/logout',
        scopes_supported: ['openid', 'profile', 'email'],
      };

      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(discoveryDoc),
      });

      const result = await oidcService.discoverConfiguration('https://idp.example.com');

      expect(result.issuer).toBe(discoveryDoc.issuer);
      expect(result.authorizationEndpoint).toBe(discoveryDoc.authorization_endpoint);
      expect(result.tokenEndpoint).toBe(discoveryDoc.token_endpoint);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://idp.example.com/.well-known/openid-configuration'
      );
    });

    it('should throw error on discovery failure', async () => {
      (global.fetch as Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(
        oidcService.discoverConfiguration('https://invalid.example.com')
      ).rejects.toThrow('Failed to fetch OIDC discovery document');
    });
  });

  describe('Authorization URL Building', () => {
    const config: OidcConfiguration = {
      id: 'config-123',
      organizationId: 'org-123',
      providerType: 'OIDC',
      enabled: true,
      issuer: 'https://idp.example.com',
      authorizationEndpoint: 'https://idp.example.com/authorize',
      tokenEndpoint: 'https://idp.example.com/token',
      userinfoEndpoint: 'https://idp.example.com/userinfo',
      jwksUri: 'https://idp.example.com/.well-known/jwks.json',
      clientId: 'client-123',
      clientSecret: 'secret-123',
      redirectUri: 'https://app.example.com/callback',
      scopes: ['openid', 'profile', 'email'],
      claimMapping: { email: 'email' },
      pkceEnabled: true,
      noncesEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should build authorization URL with PKCE', async () => {
      const { url, state } = await oidcService.buildAuthorizationUrl(config);

      expect(url).toContain(config.authorizationEndpoint);
      expect(url).toContain('response_type=code');
      expect(url).toContain(`client_id=${config.clientId}`);
      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
      expect(state).toBeDefined();
      expect(state.length).toBeGreaterThan(0);
    });

    it('should include nonce in authorization URL', async () => {
      const { url } = await oidcService.buildAuthorizationUrl(config);

      expect(url).toContain('nonce=');
    });
  });
});

describe('RoleMappingService', () => {
  let roleMappingService: RoleMappingService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = new PrismaClient();
    roleMappingService = new RoleMappingService(prisma);
    vi.clearAllMocks();
  });

  describe('Role Resolution', () => {
    it('should resolve roles from SSO groups', async () => {
      const mappings = [
        {
          id: 'mapping-1',
          organizationId: 'org-123',
          name: 'Admin Mapping',
          sourceType: 'group',
          sourceValue: 'Administrators',
          targetRole: 'ADMIN',
          targetPermissions: [],
          priority: 1,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mapping-2',
          organizationId: 'org-123',
          name: 'User Mapping',
          sourceType: 'group',
          sourceValue: 'Users',
          targetRole: 'USER',
          targetPermissions: [],
          priority: 10,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.ssoRoleMapping.findMany as Mock).mockResolvedValue(mappings);

      const result = await roleMappingService.resolveRoles('org-123', {
        groups: ['Administrators', 'Users'],
      });

      expect(result.roles).toContain('ADMIN');
      expect(result.roles).toContain('USER');
      expect(result.mappingsApplied.length).toBe(2);
    });

    it('should resolve roles using regex pattern', async () => {
      const mappings = [
        {
          id: 'mapping-1',
          organizationId: 'org-123',
          name: 'Manager Pattern',
          sourceType: 'group',
          sourceValue: '',
          sourcePattern: '^.*-managers$',
          targetRole: 'MANAGER',
          targetPermissions: [],
          priority: 1,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.ssoRoleMapping.findMany as Mock).mockResolvedValue(mappings);

      const result = await roleMappingService.resolveRoles('org-123', {
        groups: ['engineering-managers', 'sales-team'],
      });

      expect(result.roles).toContain('MANAGER');
    });

    it('should apply default USER role when no mappings match', async () => {
      (prisma.ssoRoleMapping.findMany as Mock).mockResolvedValue([]);

      const result = await roleMappingService.resolveRoles('org-123', {
        groups: ['Unknown Group'],
      });

      expect(result.roles).toContain('USER');
      expect(result.permissions).toEqual(expect.arrayContaining(DEFAULT_ROLES.USER.permissions));
    });

    it('should respect mapping priority', async () => {
      const mappings = [
        {
          id: 'mapping-1',
          organizationId: 'org-123',
          name: 'Low Priority',
          sourceType: 'group',
          sourceValue: 'Everyone',
          targetRole: 'USER',
          targetPermissions: [],
          priority: 100,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mapping-2',
          organizationId: 'org-123',
          name: 'High Priority',
          sourceType: 'group',
          sourceValue: 'Everyone',
          targetRole: 'ADMIN',
          targetPermissions: [],
          priority: 1,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.ssoRoleMapping.findMany as Mock).mockResolvedValue(mappings);

      const result = await roleMappingService.resolveRoles('org-123', {
        groups: ['Everyone'],
      });

      // Both roles should be applied, but ADMIN first due to priority
      expect(result.roles[0]).toBe('ADMIN');
    });

    it('should skip disabled mappings', async () => {
      const mappings = [
        {
          id: 'mapping-1',
          organizationId: 'org-123',
          name: 'Disabled Mapping',
          sourceType: 'group',
          sourceValue: 'Admins',
          targetRole: 'ADMIN',
          targetPermissions: [],
          priority: 1,
          enabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.ssoRoleMapping.findMany as Mock).mockResolvedValue(mappings);

      const result = await roleMappingService.resolveRoles('org-123', {
        groups: ['Admins'],
      });

      expect(result.roles).not.toContain('ADMIN');
      expect(result.roles).toContain('USER'); // Default
    });
  });

  describe('Preset Mappings', () => {
    it('should create Azure AD preset mappings', async () => {
      (prisma.ssoRoleMapping.create as Mock).mockImplementation(({ data }) => ({
        ...data,
        id: `mapping-${Math.random()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await roleMappingService.createPresetMappings('org-123', 'azure-ad');

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((m) => m.sourceValue === 'Global Administrators')).toBe(true);
    });

    it('should create Okta preset mappings', async () => {
      (prisma.ssoRoleMapping.create as Mock).mockImplementation(({ data }) => ({
        ...data,
        id: `mapping-${Math.random()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await roleMappingService.createPresetMappings('org-123', 'okta');

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((m) => m.sourceValue === 'SUPER_ADMIN')).toBe(true);
    });
  });
});

describe('ScimService', () => {
  let scimService: ScimService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = new PrismaClient();
    scimService = new ScimService(prisma, 'https://api.example.com', 'org-123');
    vi.clearAllMocks();
  });

  describe('User Operations', () => {
    it('should list users in SCIM format', async () => {
      const users = [
        {
          id: 'user-1',
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          status: 'ACTIVE',
          ssoExternalId: 'ext-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.user.findMany as Mock).mockResolvedValue(users);
      (prisma.user.count as Mock).mockResolvedValue(1);

      const result = await scimService.getUsers();

      expect(result.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
      expect(result.totalResults).toBe(1);
      expect(result.Resources?.[0].userName).toBe('john@example.com');
    });

    it('should create user from SCIM request', async () => {
      const scimUser: ScimUser = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'jane@example.com',
        name: {
          givenName: 'Jane',
          familyName: 'Smith',
        },
        emails: [{ value: 'jane@example.com', primary: true }],
        active: true,
      };

      (prisma.user.findFirst as Mock).mockResolvedValue(null);
      (prisma.user.create as Mock).mockResolvedValue({
        id: 'user-new',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (prisma.scimSyncLog.create as Mock).mockResolvedValue({});

      const result = await scimService.createUser(scimUser);

      expect(result.userName).toBe('jane@example.com');
      expect(result.name?.givenName).toBe('Jane');
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should return error for duplicate user', async () => {
      const scimUser: ScimUser = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'existing@example.com',
        emails: [{ value: 'existing@example.com', primary: true }],
        active: true,
      };

      (prisma.user.findFirst as Mock).mockResolvedValue({
        id: 'existing-user',
        email: 'existing@example.com',
      });

      await expect(scimService.createUser(scimUser)).rejects.toMatchObject({
        status: '409',
        scimType: 'uniqueness',
      });
    });
  });

  describe('Group Operations', () => {
    it('should list groups in SCIM format', async () => {
      const groups = [
        {
          id: 'group-1',
          name: 'Engineering',
          ssoExternalId: 'ext-group-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { members: 5 },
        },
      ];

      (prisma.group.findMany as Mock).mockResolvedValue(groups);
      (prisma.group.count as Mock).mockResolvedValue(1);

      const result = await scimService.getGroups();

      expect(result.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
      expect(result.Resources?.[0].displayName).toBe('Engineering');
    });
  });
});

describe('DirectorySyncService', () => {
  let directorySyncService: DirectorySyncService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = new PrismaClient();
    directorySyncService = new DirectorySyncService(prisma, 'https://api.example.com');
    vi.clearAllMocks();
  });

  describe('Configuration Management', () => {
    it('should create sync configuration', async () => {
      const config = {
        name: 'Azure AD Sync',
        sourceType: 'azure-ad' as const,
        sourceConfig: { tenantId: 'tenant-123' },
        syncUsers: true,
        syncGroups: true,
        syncRoles: true,
        scheduleEnabled: true,
        scheduleInterval: 60,
        enabled: true,
        organizationId: 'org-123',
      };

      (prisma.directorySyncConfig.create as Mock).mockResolvedValue({
        id: 'config-123',
        ...config,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await directorySyncService.createConfig('org-123', config);

      expect(result.name).toBe('Azure AD Sync');
      expect(result.sourceType).toBe('azure-ad');
      expect(prisma.directorySyncConfig.create).toHaveBeenCalled();
    });

    it('should list configurations for organization', async () => {
      const configs = [
        {
          id: 'config-1',
          organizationId: 'org-123',
          name: 'Config 1',
          sourceType: 'scim',
          sourceConfig: {},
          syncUsers: true,
          syncGroups: true,
          syncRoles: true,
          scheduleEnabled: false,
          scheduleInterval: 60,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.directorySyncConfig.findMany as Mock).mockResolvedValue(configs);

      const result = await directorySyncService.getConfigs('org-123');

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Config 1');
    });
  });

  describe('Sync Job Management', () => {
    it('should start sync job', async () => {
      const config = {
        id: 'config-123',
        organizationId: 'org-123',
        name: 'Test Sync',
        sourceType: 'scim',
        sourceConfig: { baseUrl: 'https://scim.example.com' },
        syncUsers: true,
        syncGroups: true,
        syncRoles: false,
        scheduleEnabled: false,
        scheduleInterval: 60,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.directorySyncConfig.findUnique as Mock).mockResolvedValue(config);
      (prisma.directorySyncJob.create as Mock).mockResolvedValue({
        id: 'job-123',
        configId: 'config-123',
        organizationId: 'org-123',
        status: 'pending',
        type: 'incremental',
        stats: {},
        errors: [],
        createdAt: new Date(),
      });

      const result = await directorySyncService.startSync('config-123', 'incremental');

      expect(result.status).toBe('pending');
      expect(result.type).toBe('incremental');
      expect(prisma.directorySyncJob.create).toHaveBeenCalled();
    });

    it('should not start sync for disabled configuration', async () => {
      const config = {
        id: 'config-123',
        organizationId: 'org-123',
        name: 'Disabled Sync',
        sourceType: 'scim',
        sourceConfig: {},
        enabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.directorySyncConfig.findUnique as Mock).mockResolvedValue(config);

      await expect(directorySyncService.startSync('config-123')).rejects.toThrow(
        'Sync configuration is disabled'
      );
    });

    it('should list jobs for configuration', async () => {
      const jobs = [
        {
          id: 'job-1',
          configId: 'config-123',
          organizationId: 'org-123',
          status: 'completed',
          type: 'full',
          startedAt: new Date(),
          completedAt: new Date(),
          stats: { usersProcessed: 100 },
          errors: [],
          createdAt: new Date(),
        },
      ];

      (prisma.directorySyncJob.findMany as Mock).mockResolvedValue(jobs);

      const result = await directorySyncService.getJobs('config-123', 10);

      expect(result.length).toBe(1);
      expect(result[0].status).toBe('completed');
    });
  });
});

describe('Default Roles', () => {
  it('should have all required default roles defined', () => {
    expect(DEFAULT_ROLES).toHaveProperty('SUPER_ADMIN');
    expect(DEFAULT_ROLES).toHaveProperty('ADMIN');
    expect(DEFAULT_ROLES).toHaveProperty('MANAGER');
    expect(DEFAULT_ROLES).toHaveProperty('ANALYST');
    expect(DEFAULT_ROLES).toHaveProperty('USER');
    expect(DEFAULT_ROLES).toHaveProperty('VIEWER');
  });

  it('should have SUPER_ADMIN with wildcard permission', () => {
    expect(DEFAULT_ROLES.SUPER_ADMIN.permissions).toContain('*');
  });

  it('should have proper permission hierarchy', () => {
    const adminPerms = DEFAULT_ROLES.ADMIN.permissions;
    const userPerms = DEFAULT_ROLES.USER.permissions;

    // Admin should have more permissions than User
    expect(adminPerms.length).toBeGreaterThan(userPerms.length);

    // User should have basic read permissions
    expect(userPerms).toContain('entities:read');
    expect(userPerms).toContain('reports:read');
  });
});
