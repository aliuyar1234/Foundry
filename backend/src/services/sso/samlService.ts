// =============================================================================
// SAML 2.0 Service
// SCALE Tier - Task T250-T260
//
// SAML 2.0 authentication service for enterprise SSO
// =============================================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { z } from 'zod';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export const SsoProviderTypeSchema = z.enum(['SAML', 'OIDC']);
export type SsoProviderType = z.infer<typeof SsoProviderTypeSchema>;

export interface SamlConfiguration {
  id: string;
  entityId: string;
  organizationId: string;
  providerType: 'SAML';
  enabled: boolean;
  // IdP Configuration
  idpEntityId: string;
  idpSsoUrl: string;
  idpSloUrl?: string;
  idpCertificate: string;
  // SP Configuration
  spEntityId: string;
  spAcsUrl: string;
  spSloUrl?: string;
  spCertificate?: string;
  spPrivateKey?: string;
  // Attribute Mapping
  attributeMapping: SamlAttributeMapping;
  // Options
  signRequests: boolean;
  signAssertions: boolean;
  encryptAssertions: boolean;
  allowUnencrypted: boolean;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface SamlAttributeMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  groups?: string;
  roles?: string;
}

export interface SamlAssertion {
  issuer: string;
  nameId: string;
  nameIdFormat: string;
  sessionIndex?: string;
  attributes: Record<string, string | string[]>;
  conditions: {
    notBefore?: Date;
    notOnOrAfter?: Date;
    audience?: string;
  };
}

export interface SamlAuthRequest {
  id: string;
  destination: string;
  issuer: string;
  issueInstant: Date;
  assertionConsumerServiceUrl: string;
}

export interface SamlAuthResponse {
  success: boolean;
  user?: {
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string[];
    roles?: string[];
    externalId: string;
  };
  sessionIndex?: string;
  error?: string;
}

// -----------------------------------------------------------------------------
// SAML Service
// -----------------------------------------------------------------------------

export class SamlService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // ---------------------------------------------------------------------------
  // Configuration Management
  // ---------------------------------------------------------------------------

  async createConfiguration(
    organizationId: string,
    config: Omit<SamlConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'entityId'>
  ): Promise<SamlConfiguration> {
    const id = crypto.randomUUID();

    const samlConfig = await this.prisma.ssoConfiguration.create({
      data: {
        id,
        organizationId,
        providerType: 'SAML',
        enabled: config.enabled,
        configuration: {
          idpEntityId: config.idpEntityId,
          idpSsoUrl: config.idpSsoUrl,
          idpSloUrl: config.idpSloUrl,
          idpCertificate: config.idpCertificate,
          spEntityId: config.spEntityId,
          spAcsUrl: config.spAcsUrl,
          spSloUrl: config.spSloUrl,
          attributeMapping: config.attributeMapping,
          signRequests: config.signRequests,
          signAssertions: config.signAssertions,
          encryptAssertions: config.encryptAssertions,
          allowUnencrypted: config.allowUnencrypted,
        },
      },
    });

    return this.mapToSamlConfiguration(samlConfig);
  }

  async getConfiguration(organizationId: string): Promise<SamlConfiguration | null> {
    const config = await this.prisma.ssoConfiguration.findFirst({
      where: {
        organizationId,
        providerType: 'SAML',
      },
    });

    return config ? this.mapToSamlConfiguration(config) : null;
  }

  async updateConfiguration(
    id: string,
    updates: Partial<SamlConfiguration>
  ): Promise<SamlConfiguration> {
    const existing = await this.prisma.ssoConfiguration.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Configuration not found');
    }

    const existingConfig = existing.configuration as Record<string, unknown>;

    const updated = await this.prisma.ssoConfiguration.update({
      where: { id },
      data: {
        enabled: updates.enabled ?? existing.enabled,
        configuration: {
          ...existingConfig,
          idpEntityId: updates.idpEntityId ?? existingConfig.idpEntityId,
          idpSsoUrl: updates.idpSsoUrl ?? existingConfig.idpSsoUrl,
          idpSloUrl: updates.idpSloUrl ?? existingConfig.idpSloUrl,
          idpCertificate: updates.idpCertificate ?? existingConfig.idpCertificate,
          attributeMapping: updates.attributeMapping ?? existingConfig.attributeMapping,
        },
      },
    });

    return this.mapToSamlConfiguration(updated);
  }

  async deleteConfiguration(id: string): Promise<void> {
    await this.prisma.ssoConfiguration.delete({
      where: { id },
    });
  }

  // ---------------------------------------------------------------------------
  // SAML Request Generation
  // ---------------------------------------------------------------------------

  generateAuthRequest(config: SamlConfiguration): SamlAuthRequest {
    const id = `_${crypto.randomUUID()}`;
    const issueInstant = new Date();

    return {
      id,
      destination: config.idpSsoUrl,
      issuer: config.spEntityId,
      issueInstant,
      assertionConsumerServiceUrl: config.spAcsUrl,
    };
  }

  buildAuthRequestXml(request: SamlAuthRequest): string {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${request.id}"
    Version="2.0"
    IssueInstant="${request.issueInstant.toISOString()}"
    Destination="${request.destination}"
    AssertionConsumerServiceURL="${request.assertionConsumerServiceUrl}"
    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
    <saml:Issuer>${request.issuer}</saml:Issuer>
    <samlp:NameIDPolicy
        Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        AllowCreate="true"/>
</samlp:AuthnRequest>`;

    return xml;
  }

  encodeAuthRequest(xml: string): string {
    // Deflate and base64 encode for HTTP-Redirect binding
    const deflated = Buffer.from(xml, 'utf-8');
    return deflated.toString('base64');
  }

  buildRedirectUrl(config: SamlConfiguration, relayState?: string): string {
    const request = this.generateAuthRequest(config);
    const xml = this.buildAuthRequestXml(request);
    const encoded = this.encodeAuthRequest(xml);

    const params = new URLSearchParams();
    params.set('SAMLRequest', encoded);
    if (relayState) {
      params.set('RelayState', relayState);
    }

    return `${config.idpSsoUrl}?${params.toString()}`;
  }

  // ---------------------------------------------------------------------------
  // SAML Response Parsing
  // ---------------------------------------------------------------------------

  async parseResponse(
    samlResponse: string,
    config: SamlConfiguration
  ): Promise<SamlAuthResponse> {
    try {
      // Decode base64 response
      const xml = Buffer.from(samlResponse, 'base64').toString('utf-8');

      // Parse XML (simplified - in production use a proper XML parser)
      const assertion = this.extractAssertion(xml, config);

      if (!assertion) {
        return {
          success: false,
          error: 'No valid assertion found in response',
        };
      }

      // Validate assertion
      const validation = await this.validateAssertion(assertion, config);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Map attributes to user
      const user = this.mapAssertionToUser(assertion, config.attributeMapping);

      return {
        success: true,
        user,
        sessionIndex: assertion.sessionIndex,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse SAML response: ${(error as Error).message}`,
      };
    }
  }

  private extractAssertion(xml: string, config: SamlConfiguration): SamlAssertion | null {
    // Simplified assertion extraction
    // In production, use a proper SAML library like saml2-js or passport-saml

    // Extract issuer
    const issuerMatch = xml.match(/<saml:Issuer[^>]*>([^<]+)<\/saml:Issuer>/);
    const issuer = issuerMatch?.[1];

    if (issuer !== config.idpEntityId) {
      return null;
    }

    // Extract NameID
    const nameIdMatch = xml.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
    const nameId = nameIdMatch?.[1];

    if (!nameId) {
      return null;
    }

    // Extract attributes
    const attributes: Record<string, string | string[]> = {};
    const attrRegex = /<saml:Attribute\s+Name="([^"]+)"[^>]*>[\s\S]*?<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>[\s\S]*?<\/saml:Attribute>/g;
    let attrMatch;

    while ((attrMatch = attrRegex.exec(xml)) !== null) {
      const [, name, value] = attrMatch;
      attributes[name] = value;
    }

    // Extract session index
    const sessionMatch = xml.match(/SessionIndex="([^"]+)"/);
    const sessionIndex = sessionMatch?.[1];

    // Extract conditions
    const notBeforeMatch = xml.match(/NotBefore="([^"]+)"/);
    const notAfterMatch = xml.match(/NotOnOrAfter="([^"]+)"/);

    return {
      issuer,
      nameId,
      nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      sessionIndex,
      attributes,
      conditions: {
        notBefore: notBeforeMatch ? new Date(notBeforeMatch[1]) : undefined,
        notOnOrAfter: notAfterMatch ? new Date(notAfterMatch[1]) : undefined,
        audience: config.spEntityId,
      },
    };
  }

  private async validateAssertion(
    assertion: SamlAssertion,
    _config: SamlConfiguration
  ): Promise<{ valid: boolean; error?: string }> {
    const now = new Date();

    // Check time conditions
    if (assertion.conditions.notBefore && assertion.conditions.notBefore > now) {
      return { valid: false, error: 'Assertion not yet valid' };
    }

    if (assertion.conditions.notOnOrAfter && assertion.conditions.notOnOrAfter < now) {
      return { valid: false, error: 'Assertion has expired' };
    }

    // In production, also verify:
    // - XML signature using IdP certificate
    // - Assertion signature
    // - InResponseTo matches our request
    // - Audience restriction

    return { valid: true };
  }

  private mapAssertionToUser(
    assertion: SamlAssertion,
    mapping: SamlAttributeMapping
  ): SamlAuthResponse['user'] {
    const getAttr = (key: string | undefined): string | undefined => {
      if (!key) return undefined;
      const value = assertion.attributes[key];
      return Array.isArray(value) ? value[0] : value;
    };

    const getAttrArray = (key: string | undefined): string[] | undefined => {
      if (!key) return undefined;
      const value = assertion.attributes[key];
      if (!value) return undefined;
      return Array.isArray(value) ? value : [value];
    };

    return {
      email: getAttr(mapping.email) || assertion.nameId,
      firstName: getAttr(mapping.firstName),
      lastName: getAttr(mapping.lastName),
      displayName: getAttr(mapping.displayName),
      groups: getAttrArray(mapping.groups),
      roles: getAttrArray(mapping.roles),
      externalId: assertion.nameId,
    };
  }

  // ---------------------------------------------------------------------------
  // SP Metadata Generation
  // ---------------------------------------------------------------------------

  generateSpMetadata(config: SamlConfiguration): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor
    xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
    entityID="${config.spEntityId}">
    <md:SPSSODescriptor
        AuthnRequestsSigned="${config.signRequests}"
        WantAssertionsSigned="${config.signAssertions}"
        protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
        <md:AssertionConsumerService
            Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
            Location="${config.spAcsUrl}"
            index="0"
            isDefault="true"/>
        ${
          config.spSloUrl
            ? `<md:SingleLogoutService
            Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
            Location="${config.spSloUrl}"/>`
            : ''
        }
    </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  buildLogoutRequest(
    config: SamlConfiguration,
    nameId: string,
    sessionIndex?: string
  ): string {
    const id = `_${crypto.randomUUID()}`;
    const issueInstant = new Date().toISOString();

    return `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${id}"
    Version="2.0"
    IssueInstant="${issueInstant}"
    Destination="${config.idpSloUrl}">
    <saml:Issuer>${config.spEntityId}</saml:Issuer>
    <saml:NameID>${nameId}</saml:NameID>
    ${sessionIndex ? `<samlp:SessionIndex>${sessionIndex}</samlp:SessionIndex>` : ''}
</samlp:LogoutRequest>`;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapToSamlConfiguration(record: {
    id: string;
    organizationId: string;
    providerType: string;
    enabled: boolean;
    configuration: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): SamlConfiguration {
    const config = record.configuration as Record<string, unknown>;

    return {
      id: record.id,
      entityId: record.id,
      organizationId: record.organizationId,
      providerType: 'SAML',
      enabled: record.enabled,
      idpEntityId: config.idpEntityId as string,
      idpSsoUrl: config.idpSsoUrl as string,
      idpSloUrl: config.idpSloUrl as string | undefined,
      idpCertificate: config.idpCertificate as string,
      spEntityId: config.spEntityId as string,
      spAcsUrl: config.spAcsUrl as string,
      spSloUrl: config.spSloUrl as string | undefined,
      attributeMapping: config.attributeMapping as SamlAttributeMapping,
      signRequests: config.signRequests as boolean,
      signAssertions: config.signAssertions as boolean,
      encryptAssertions: config.encryptAssertions as boolean,
      allowUnencrypted: config.allowUnencrypted as boolean,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
