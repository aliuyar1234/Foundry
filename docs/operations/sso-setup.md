# SSO Configuration Guide

Configure Single Sign-On (SSO) for enterprise Foundry deployments using SAML 2.0, OIDC, or SCIM.

## Overview

Foundry supports multiple SSO protocols:
- **SAML 2.0** - Enterprise identity providers (Okta, Azure AD, OneLogin)
- **OIDC** - OpenID Connect (Auth0, Keycloak, Google Workspace)
- **SCIM 2.0** - Automated user provisioning

## SAML 2.0 Configuration

### Prerequisites
- Identity Provider (IdP) with SAML 2.0 support
- IdP metadata XML or manual configuration
- Foundry entity admin access

### Foundry Service Provider Details

Provide these values to your IdP:

| Setting | Value |
|---------|-------|
| Entity ID (Audience) | `https://foundry.your-company.com/saml/metadata` |
| ACS URL | `https://foundry.your-company.com/api/auth/saml/callback` |
| SLS URL | `https://foundry.your-company.com/api/auth/saml/logout` |
| Name ID Format | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |

### IdP Configuration

#### Okta Setup

1. Create new SAML 2.0 Application
2. Configure SAML settings:
   ```
   Single Sign On URL: https://foundry.your-company.com/api/auth/saml/callback
   Audience URI: https://foundry.your-company.com/saml/metadata
   Name ID format: EmailAddress
   Application username: Email
   ```

3. Configure attribute statements:
   | Name | Value |
   |------|-------|
   | email | user.email |
   | firstName | user.firstName |
   | lastName | user.lastName |
   | groups | user.groups |

4. Download IdP metadata XML

#### Azure AD Setup

1. Register enterprise application
2. Configure SAML-based Sign-on:
   ```
   Identifier (Entity ID): https://foundry.your-company.com/saml/metadata
   Reply URL (ACS): https://foundry.your-company.com/api/auth/saml/callback
   Sign on URL: https://foundry.your-company.com/login
   ```

3. Configure claims:
   | Claim | Source attribute |
   |-------|------------------|
   | emailaddress | user.mail |
   | givenname | user.givenname |
   | surname | user.surname |
   | groups | user.groups |

4. Download Federation Metadata XML

### Foundry SAML Configuration

```yaml
# config/sso/saml.yaml
saml:
  enabled: true
  entityId: "https://foundry.your-company.com/saml/metadata"

  # Identity Provider configuration
  idp:
    # Option 1: Metadata URL (recommended)
    metadataUrl: "https://your-idp.com/saml/metadata"

    # Option 2: Manual configuration
    # ssoUrl: "https://your-idp.com/saml/sso"
    # sloUrl: "https://your-idp.com/saml/slo"
    # certificate: |
    #   -----BEGIN CERTIFICATE-----
    #   MIIDpDCCAoygAwIBAgIGAX...
    #   -----END CERTIFICATE-----

  # Service Provider configuration
  sp:
    certificate: "${SAML_SP_CERTIFICATE}"
    privateKey: "${SAML_SP_PRIVATE_KEY}"

  # Attribute mapping
  attributeMapping:
    email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    firstName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
    lastName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
    groups: "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"

  # Security settings
  security:
    wantAssertionsSigned: true
    wantMessagesSigned: true
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
```

### Generate SP Certificate

```bash
#!/bin/bash
# generate-sp-cert.sh

openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout sp-private-key.pem \
  -out sp-certificate.pem \
  -subj "/CN=foundry.your-company.com/O=Your Company/C=US"

# Create Kubernetes secret
kubectl create secret generic foundry-saml \
  --namespace foundry \
  --from-file=sp-certificate.pem \
  --from-file=sp-private-key.pem
```

## OIDC Configuration

### Prerequisites
- OIDC-compliant identity provider
- Client ID and Client Secret
- Discovery endpoint URL

### Provider Setup

#### Auth0 Setup

1. Create new Regular Web Application
2. Configure settings:
   ```
   Allowed Callback URLs: https://foundry.your-company.com/api/auth/oidc/callback
   Allowed Logout URLs: https://foundry.your-company.com
   Allowed Web Origins: https://foundry.your-company.com
   ```

3. Note Client ID and Client Secret

#### Keycloak Setup

1. Create new Client in realm
2. Configure client:
   ```
   Client ID: foundry
   Client Protocol: openid-connect
   Access Type: confidential
   Valid Redirect URIs: https://foundry.your-company.com/api/auth/oidc/callback
   ```

3. Generate and note Client Secret

### Foundry OIDC Configuration

```yaml
# config/sso/oidc.yaml
oidc:
  enabled: true

  # Provider configuration
  provider:
    # Option 1: Discovery URL (recommended)
    discoveryUrl: "https://your-idp.com/.well-known/openid-configuration"

    # Option 2: Manual configuration
    # authorizationUrl: "https://your-idp.com/oauth/authorize"
    # tokenUrl: "https://your-idp.com/oauth/token"
    # userInfoUrl: "https://your-idp.com/userinfo"
    # jwksUrl: "https://your-idp.com/.well-known/jwks.json"

  # Client configuration
  client:
    id: "${OIDC_CLIENT_ID}"
    secret: "${OIDC_CLIENT_SECRET}"

  # Scopes to request
  scopes:
    - openid
    - profile
    - email
    - groups

  # Claim mapping
  claimMapping:
    email: email
    firstName: given_name
    lastName: family_name
    groups: groups

  # Callback URL
  callbackUrl: "https://foundry.your-company.com/api/auth/oidc/callback"
```

### Environment Variables

```bash
# .env or Kubernetes secret
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_DISCOVERY_URL=https://your-idp.com/.well-known/openid-configuration
```

## SCIM 2.0 Provisioning

### Enable SCIM Endpoint

```yaml
# config/sso/scim.yaml
scim:
  enabled: true

  # Authentication for SCIM endpoint
  authentication:
    type: bearer
    token: "${SCIM_BEARER_TOKEN}"

  # User provisioning settings
  users:
    autoCreate: true
    autoUpdate: true
    autoDeactivate: true

  # Group provisioning settings
  groups:
    enabled: true
    syncRoles: true

  # Attribute mapping
  attributeMapping:
    userName: email
    name.givenName: firstName
    name.familyName: lastName
    emails[primary].value: email
    groups: roles
```

### Generate SCIM Token

```bash
# Generate secure token
SCIM_TOKEN=$(openssl rand -base64 32)
echo "SCIM Token: $SCIM_TOKEN"

# Create Kubernetes secret
kubectl create secret generic foundry-scim \
  --namespace foundry \
  --from-literal=bearer-token="$SCIM_TOKEN"
```

### IdP SCIM Configuration

#### Okta SCIM Setup

1. Enable SCIM provisioning in Okta app
2. Configure SCIM connector:
   ```
   SCIM connector base URL: https://foundry.your-company.com/api/scim/v2
   Authentication mode: HTTP Header
   Authorization: Bearer <SCIM_TOKEN>
   ```

3. Enable provisioning features:
   - Create Users
   - Update User Attributes
   - Deactivate Users
   - Sync Password (optional)

#### Azure AD SCIM Setup

1. Enable Provisioning in enterprise app
2. Configure settings:
   ```
   Tenant URL: https://foundry.your-company.com/api/scim/v2
   Secret Token: <SCIM_TOKEN>
   ```

3. Map attributes:
   | Azure AD Attribute | SCIM Attribute |
   |--------------------|----------------|
   | userPrincipalName | userName |
   | mail | emails[type eq "work"].value |
   | givenName | name.givenName |
   | surname | name.familyName |

## Role Mapping

### Configure Role Mapping

```yaml
# config/sso/roles.yaml
roleMapping:
  enabled: true

  # Map IdP groups to Foundry roles
  mappings:
    # Admin group gets admin role
    - idpGroup: "Foundry-Admins"
      foundryRole: "admin"

    # Analysts get analyst role
    - idpGroup: "Foundry-Analysts"
      foundryRole: "analyst"

    # Viewers get viewer role
    - idpGroup: "Foundry-Viewers"
      foundryRole: "viewer"

    # Default role for unmapped users
    - idpGroup: "*"
      foundryRole: "viewer"

  # Entity-specific mappings
  entityMappings:
    - idpGroup: "Dept-Finance"
      entityId: "entity-finance-123"
      foundryRole: "analyst"

    - idpGroup: "Dept-Engineering"
      entityId: "entity-engineering-456"
      foundryRole: "admin"
```

### Dynamic Role Assignment

```typescript
// Example role mapping logic
interface RoleMapping {
  idpGroups: string[];
  entityId?: string;
  role: string;
}

function mapUserRoles(idpGroups: string[], mappings: RoleMapping[]): UserRole[] {
  const roles: UserRole[] = [];

  for (const mapping of mappings) {
    const hasGroup = mapping.idpGroups.some(g =>
      idpGroups.includes(g) || g === '*'
    );

    if (hasGroup) {
      roles.push({
        entityId: mapping.entityId,
        role: mapping.role,
      });
    }
  }

  return roles;
}
```

## Multi-Entity SSO

### Entity-Based SSO Configuration

```yaml
# config/sso/multi-entity.yaml
multiEntitySso:
  enabled: true

  # Default SSO configuration
  default:
    type: saml
    config: "saml-config-1"

  # Entity-specific overrides
  entities:
    - entityId: "entity-abc-123"
      ssoType: oidc
      config: "oidc-auth0"

    - entityId: "entity-def-456"
      ssoType: saml
      config: "saml-azure"

  # SSO configurations
  configurations:
    saml-config-1:
      type: saml
      idpMetadataUrl: "https://idp1.com/metadata"

    oidc-auth0:
      type: oidc
      discoveryUrl: "https://tenant.auth0.com/.well-known/openid-configuration"
      clientId: "${AUTH0_CLIENT_ID}"
      clientSecret: "${AUTH0_CLIENT_SECRET}"

    saml-azure:
      type: saml
      idpMetadataUrl: "https://login.microsoftonline.com/tenant/federationmetadata/2007-06/federationmetadata.xml"
```

## Testing SSO

### SAML Testing

```bash
# Generate SAML request for testing
curl -X GET "https://foundry.your-company.com/api/auth/saml/login" \
  -H "Accept: application/json" \
  -v

# Test SAML metadata endpoint
curl -X GET "https://foundry.your-company.com/saml/metadata" \
  -H "Accept: application/xml"

# Validate SAML response (development only)
curl -X POST "https://foundry.your-company.com/api/auth/saml/callback" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "SAMLResponse=<base64-encoded-response>"
```

### OIDC Testing

```bash
# Test OIDC discovery
curl -X GET "https://your-idp.com/.well-known/openid-configuration" | jq

# Test authorization flow
open "https://foundry.your-company.com/api/auth/oidc/login"

# Test token exchange (with authorization code)
curl -X POST "https://your-idp.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=<auth-code>" \
  -d "client_id=<client-id>" \
  -d "client_secret=<client-secret>" \
  -d "redirect_uri=https://foundry.your-company.com/api/auth/oidc/callback"
```

### SCIM Testing

```bash
# Test SCIM endpoint
curl -X GET "https://foundry.your-company.com/api/scim/v2/Users" \
  -H "Authorization: Bearer <SCIM_TOKEN>" \
  -H "Accept: application/scim+json"

# Create user via SCIM
curl -X POST "https://foundry.your-company.com/api/scim/v2/Users" \
  -H "Authorization: Bearer <SCIM_TOKEN>" \
  -H "Content-Type: application/scim+json" \
  -d '{
    "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
    "userName": "test@example.com",
    "name": {
      "givenName": "Test",
      "familyName": "User"
    },
    "emails": [
      {
        "value": "test@example.com",
        "primary": true
      }
    ]
  }'
```

## Troubleshooting

### Common SAML Issues

**"Invalid SAML Response"**
```bash
# Check certificate expiration
openssl x509 -in idp-cert.pem -noout -dates

# Verify signature
openssl x509 -in idp-cert.pem -noout -fingerprint

# Check time sync
date && curl -s "https://your-idp.com/time"
```

**"Audience mismatch"**
- Verify Entity ID matches exactly in IdP and Foundry
- Check for trailing slashes

**"Invalid Assertion Consumer Service URL"**
- Verify ACS URL matches exactly
- Check HTTPS vs HTTP

### Common OIDC Issues

**"Invalid client credentials"**
```bash
# Verify client ID/secret
curl -X POST "https://your-idp.com/oauth/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=<id>" \
  -d "client_secret=<secret>"
```

**"Invalid redirect URI"**
- Check registered callback URLs in IdP
- Verify exact match including protocol and port

### SCIM Issues

**"401 Unauthorized"**
- Verify bearer token
- Check token hasn't expired

**"User not syncing"**
- Check SCIM logs in IdP
- Verify attribute mapping
- Check network connectivity
```

## Security Recommendations

1. **Use HTTPS everywhere** - All SSO endpoints must use TLS
2. **Rotate certificates** - SP certificates should be rotated annually
3. **Limit token lifetime** - OIDC tokens should expire within 1 hour
4. **Audit SSO events** - Log all authentication events
5. **Implement MFA** - Require MFA at the IdP level
6. **Regular access reviews** - Audit SCIM provisioned accounts quarterly
