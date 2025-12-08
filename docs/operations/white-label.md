# White-Label Configuration Guide

Configure Foundry for white-label deployments with custom branding, domains, and theming.

## Overview

White-label features enable:
- **Custom branding** - Logos, colors, fonts
- **Custom domains** - Your domain, SSL certificates
- **Email customization** - Custom sender addresses and templates
- **Complete rebranding** - Remove all Foundry references

## Branding Configuration

### Entity-Level Branding

```yaml
# Entity branding configuration
branding:
  entityId: "acme-corp"

  # Company information
  company:
    name: "Acme Process Intelligence"
    legalName: "Acme Corporation"
    website: "https://acme.com"
    supportEmail: "support@acme.com"

  # Visual identity
  visual:
    # Logo configurations
    logos:
      primary:
        url: "https://cdn.acme.com/logo.svg"
        width: 180
        height: 40
      icon:
        url: "https://cdn.acme.com/icon.svg"
        width: 32
        height: 32
      favicon:
        url: "https://cdn.acme.com/favicon.ico"

    # Color palette
    colors:
      primary: "#1E40AF"
      primaryHover: "#1E3A8A"
      secondary: "#64748B"
      accent: "#F59E0B"
      background: "#FFFFFF"
      surface: "#F8FAFC"
      text: "#1E293B"
      textSecondary: "#64748B"
      error: "#DC2626"
      success: "#16A34A"
      warning: "#F59E0B"

    # Typography
    fonts:
      heading: "Inter"
      body: "Inter"
      mono: "JetBrains Mono"
      googleFontsUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"

  # UI customization
  ui:
    borderRadius: "8px"
    buttonStyle: "rounded"  # rounded, square, pill
    cardShadow: "sm"
    headerStyle: "light"  # light, dark, transparent
```

### Platform-Wide Defaults

```yaml
# Default branding (used when entity has no custom branding)
defaultBranding:
  company:
    name: "Process Intelligence Platform"
    supportEmail: "support@platform.com"

  visual:
    logos:
      primary:
        url: "/assets/logo.svg"
    colors:
      primary: "#6366F1"
```

## Custom Domains

### Domain Configuration

```yaml
# Custom domain setup
customDomains:
  - entityId: "acme-corp"
    domains:
      - domain: "processes.acme.com"
        type: "primary"
        ssl:
          provider: "letsencrypt"
          autoRenew: true

      - domain: "api.acme-processes.com"
        type: "api"
        ssl:
          provider: "custom"
          certificate: "${ACME_SSL_CERT}"
          privateKey: "${ACME_SSL_KEY}"
```

### DNS Configuration

```bash
# Required DNS records for custom domain

# Primary domain
processes.acme.com    CNAME    foundry-lb.your-company.com

# API subdomain (if separate)
api.processes.acme.com    CNAME    foundry-api-lb.your-company.com

# Email sending (SPF/DKIM)
_dmarc.acme.com    TXT    "v=DMARC1; p=quarantine; rua=mailto:dmarc@acme.com"
acme.com           TXT    "v=spf1 include:_spf.foundry.io ~all"
foundry._domainkey.acme.com    TXT    "v=DKIM1; k=rsa; p=MIGfMA0GCS..."
```

### Ingress Configuration

```yaml
# Kubernetes ingress for custom domain
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: acme-corp-ingress
  namespace: foundry
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    # Route to correct entity
    nginx.ingress.kubernetes.io/configuration-snippet: |
      proxy_set_header X-Entity-Domain $host;
spec:
  tls:
    - hosts:
        - processes.acme.com
      secretName: acme-corp-tls
  rules:
    - host: processes.acme.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: foundry-frontend
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: foundry-backend
                port:
                  number: 3000
```

### SSL Certificate Management

```bash
# Verify domain ownership
foundry domain verify "processes.acme.com" --entity "acme-corp"

# Request SSL certificate
foundry domain ssl request "processes.acme.com"

# Check certificate status
foundry domain ssl status "processes.acme.com"

# Renew certificate manually
foundry domain ssl renew "processes.acme.com"
```

## Email Customization

### Email Configuration

```yaml
# Email branding configuration
email:
  entityId: "acme-corp"

  # Sender configuration
  sender:
    name: "Acme Process Intelligence"
    email: "noreply@processes.acme.com"
    replyTo: "support@acme.com"

  # SMTP configuration (optional, uses platform SMTP by default)
  smtp:
    host: "smtp.acme.com"
    port: 587
    secure: true
    auth:
      user: "${ACME_SMTP_USER}"
      pass: "${ACME_SMTP_PASS}"

  # Email templates
  templates:
    # Welcome email
    welcome:
      subject: "Welcome to {{company.name}}"
      templateId: "acme-welcome-v1"

    # Password reset
    passwordReset:
      subject: "Reset your {{company.name}} password"
      templateId: "acme-password-reset-v1"

    # Process notification
    processNotification:
      subject: "[{{company.name}}] Process Update: {{process.name}}"
      templateId: "acme-process-notification-v1"

    # Insight alert
    insightAlert:
      subject: "[{{company.name}}] New Insight: {{insight.title}}"
      templateId: "acme-insight-alert-v1"
```

### Email Template Customization

```html
<!-- Custom email template -->
<!DOCTYPE html>
<html>
<head>
  <style>
    .header {
      background-color: {{branding.colors.primary}};
      padding: 20px;
      text-align: center;
    }
    .logo {
      max-width: 180px;
    }
    .content {
      padding: 30px;
      font-family: {{branding.fonts.body}}, sans-serif;
      color: {{branding.colors.text}};
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: {{branding.colors.primary}};
      color: white;
      text-decoration: none;
      border-radius: {{branding.ui.borderRadius}};
    }
    .footer {
      padding: 20px;
      text-align: center;
      color: {{branding.colors.textSecondary}};
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="{{branding.logos.primary.url}}" alt="{{company.name}}" class="logo">
  </div>

  <div class="content">
    <h1>Welcome to {{company.name}}</h1>
    <p>Hello {{user.firstName}},</p>
    <p>Your account has been created. Click below to get started:</p>
    <a href="{{loginUrl}}" class="button">Sign In</a>
  </div>

  <div class="footer">
    <p>&copy; {{year}} {{company.legalName}}. All rights reserved.</p>
    <p>{{company.address}}</p>
  </div>
</body>
</html>
```

## Theme Customization

### CSS Variables

```css
/* Custom theme CSS variables */
:root {
  /* Colors */
  --color-primary: {{branding.colors.primary}};
  --color-primary-hover: {{branding.colors.primaryHover}};
  --color-secondary: {{branding.colors.secondary}};
  --color-accent: {{branding.colors.accent}};
  --color-background: {{branding.colors.background}};
  --color-surface: {{branding.colors.surface}};
  --color-text: {{branding.colors.text}};
  --color-text-secondary: {{branding.colors.textSecondary}};
  --color-error: {{branding.colors.error}};
  --color-success: {{branding.colors.success}};
  --color-warning: {{branding.colors.warning}};

  /* Typography */
  --font-heading: '{{branding.fonts.heading}}', sans-serif;
  --font-body: '{{branding.fonts.body}}', sans-serif;
  --font-mono: '{{branding.fonts.mono}}', monospace;

  /* UI */
  --border-radius: {{branding.ui.borderRadius}};
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
}
```

### React Theme Provider

```typescript
// Theme configuration for React app
interface BrandingTheme {
  colors: {
    primary: string;
    primaryHover: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    error: string;
    success: string;
    warning: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  ui: {
    borderRadius: string;
    buttonStyle: 'rounded' | 'square' | 'pill';
  };
  logos: {
    primary: { url: string; width: number; height: number };
    icon: { url: string; width: number; height: number };
    favicon: { url: string };
  };
}

// Apply theme
function applyBrandingTheme(theme: BrandingTheme) {
  const root = document.documentElement;

  // Apply colors
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${kebabCase(key)}`, value);
  });

  // Apply fonts
  Object.entries(theme.fonts).forEach(([key, value]) => {
    root.style.setProperty(`--font-${key}`, `'${value}', sans-serif`);
  });

  // Apply UI settings
  root.style.setProperty('--border-radius', theme.ui.borderRadius);

  // Update favicon
  const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
  if (favicon) {
    favicon.href = theme.logos.favicon.url;
  }

  // Update document title
  document.title = theme.company?.name || 'Process Intelligence';
}
```

## Login Page Customization

### Custom Login Configuration

```yaml
# Login page configuration
loginPage:
  entityId: "acme-corp"

  # Background
  background:
    type: "image"  # image, gradient, solid
    image: "https://cdn.acme.com/login-bg.jpg"
    overlay: "rgba(0, 0, 0, 0.5)"

  # Login form
  form:
    title: "Sign in to Acme Process Intelligence"
    subtitle: "Enter your credentials to continue"
    showLogo: true
    showRememberMe: true
    showForgotPassword: true

  # Social login buttons
  socialLogin:
    showGoogle: false
    showMicrosoft: true
    showSaml: true
    samlButtonText: "Sign in with SSO"

  # Footer
  footer:
    showTermsLink: true
    termsUrl: "https://acme.com/terms"
    showPrivacyLink: true
    privacyUrl: "https://acme.com/privacy"
    copyrightText: "© 2024 Acme Corporation"
```

### Custom Login Page Component

```tsx
// CustomLoginPage.tsx
import { useBranding } from '@/hooks/useBranding';

export function CustomLoginPage() {
  const branding = useBranding();

  return (
    <div
      className="login-page"
      style={{
        backgroundImage: `url(${branding.loginPage.background.image})`,
      }}
    >
      <div className="login-overlay" style={{ background: branding.loginPage.background.overlay }}>
        <div className="login-container">
          {branding.loginPage.form.showLogo && (
            <img
              src={branding.logos.primary.url}
              alt={branding.company.name}
              className="login-logo"
            />
          )}

          <h1>{branding.loginPage.form.title}</h1>
          <p>{branding.loginPage.form.subtitle}</p>

          <LoginForm />

          {branding.loginPage.socialLogin.showSaml && (
            <SSOButton text={branding.loginPage.socialLogin.samlButtonText} />
          )}

          <footer>
            <span>{branding.loginPage.footer.copyrightText}</span>
            <a href={branding.loginPage.footer.termsUrl}>Terms</a>
            <a href={branding.loginPage.footer.privacyUrl}>Privacy</a>
          </footer>
        </div>
      </div>
    </div>
  );
}
```

## Complete Rebranding

### Remove Platform References

```yaml
# Full white-label configuration
whiteLabel:
  entityId: "acme-corp"
  mode: "complete"  # complete removes all platform references

  # Replace all platform references
  textReplacements:
    "Foundry": "Acme Intelligence"
    "foundry.io": "acme.com"

  # Remove platform branding
  removePlatformBranding: true
  removePoweredBy: true
  removeHelpLinks: true

  # Custom help/support
  support:
    helpUrl: "https://help.acme.com"
    contactUrl: "https://acme.com/contact"
    documentationUrl: "https://docs.acme.com"

  # Custom legal
  legal:
    termsOfServiceUrl: "https://acme.com/terms"
    privacyPolicyUrl: "https://acme.com/privacy"
    cookiePolicyUrl: "https://acme.com/cookies"
```

### API Response Rebranding

```typescript
// Middleware to rebrand API responses
function rebrandingMiddleware(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);

  res.json = (data: any) => {
    const entity = req.entity;
    if (entity?.whiteLabel?.mode === 'complete') {
      data = rebrandObject(data, entity.whiteLabel.textReplacements);
    }
    return originalJson(data);
  };

  next();
}

function rebrandObject(obj: any, replacements: Record<string, string>): any {
  if (typeof obj === 'string') {
    let result = obj;
    for (const [from, to] of Object.entries(replacements)) {
      result = result.replace(new RegExp(from, 'gi'), to);
    }
    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => rebrandObject(item, replacements));
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = rebrandObject(value, replacements);
    }
    return result;
  }

  return obj;
}
```

## Asset Management

### CDN Configuration

```yaml
# Asset hosting configuration
assets:
  entityId: "acme-corp"

  # CDN configuration
  cdn:
    provider: "cloudfront"  # cloudfront, cloudflare, custom
    baseUrl: "https://cdn.acme.com/foundry"

  # Asset upload
  upload:
    allowedTypes: ["image/png", "image/svg+xml", "image/jpeg", "image/ico"]
    maxSize: "5MB"
    storageProvider: "s3"
    bucket: "acme-assets"
```

### Upload Custom Assets

```bash
# Upload logo
foundry branding upload "acme-corp" \
  --type "logo" \
  --file "./logo.svg"

# Upload favicon
foundry branding upload "acme-corp" \
  --type "favicon" \
  --file "./favicon.ico"

# Upload login background
foundry branding upload "acme-corp" \
  --type "login-background" \
  --file "./login-bg.jpg"

# List uploaded assets
foundry branding assets list "acme-corp"
```

## Testing White-Label

### Preview Mode

```bash
# Preview branding changes
foundry branding preview "acme-corp" \
  --config "./branding-config.yaml" \
  --open-browser

# Generate branding preview URL
foundry branding preview-url "acme-corp" \
  --expires "1h"
```

### Validation

```bash
# Validate branding configuration
foundry branding validate "./branding-config.yaml"

# Check asset URLs
foundry branding check-assets "acme-corp"

# Test email templates
foundry branding test-email "acme-corp" \
  --template "welcome" \
  --to "test@acme.com"
```

## Troubleshooting

### Common Issues

**Logo not displaying:**
```bash
# Check asset URL accessibility
curl -I "https://cdn.acme.com/logo.svg"

# Verify CORS headers
curl -I -H "Origin: https://processes.acme.com" "https://cdn.acme.com/logo.svg"
```

**Custom domain SSL errors:**
```bash
# Check certificate
openssl s_client -connect processes.acme.com:443 -servername processes.acme.com

# Verify DNS
dig processes.acme.com CNAME
```

**Email not using custom branding:**
```bash
# Check email configuration
foundry branding email-config show "acme-corp"

# Send test email
foundry branding test-email "acme-corp" --template "welcome" --to "test@example.com"
```
