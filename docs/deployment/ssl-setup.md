# SSL/TLS Setup Guide

Configure SSL/TLS certificates for secure Foundry deployments.

## Overview

Foundry supports multiple certificate management options:
- **Let's Encrypt** - Free automated certificates (recommended for internet-facing)
- **cert-manager** - Kubernetes native certificate management
- **Manual** - Self-managed certificates for air-gapped environments
- **Cloud Provider** - AWS ACM, GCP Certificate Manager, Azure Key Vault

## Let's Encrypt with cert-manager

### Install cert-manager

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Verify installation
kubectl get pods -n cert-manager
```

### Create ClusterIssuer

```yaml
# cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@your-company.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
---
# Staging issuer for testing
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: admin@your-company.com
    privateKeySecretRef:
      name: letsencrypt-staging-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

### Configure Ingress

```yaml
# ingress-tls.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: foundry-ingress
  namespace: foundry
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  tls:
    - hosts:
        - foundry.your-company.com
        - api.foundry.your-company.com
      secretName: foundry-tls
  rules:
    - host: foundry.your-company.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: foundry-frontend
                port:
                  number: 80
    - host: api.foundry.your-company.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: foundry-backend
                port:
                  number: 3000
```

### Verify Certificate

```bash
# Check certificate status
kubectl get certificate -n foundry

# Describe certificate
kubectl describe certificate foundry-tls -n foundry

# Check certificate secret
kubectl get secret foundry-tls -n foundry -o yaml
```

## Manual Certificate Setup

### Generate Self-Signed Certificates

```bash
#!/bin/bash
# generate-certs.sh

DOMAIN="${1:-foundry.local}"
DAYS="${2:-365}"
OUTPUT_DIR="./certs"

mkdir -p "$OUTPUT_DIR"

# Generate CA private key
openssl genrsa -out "$OUTPUT_DIR/ca.key" 4096

# Generate CA certificate
openssl req -new -x509 -days 3650 -key "$OUTPUT_DIR/ca.key" \
  -out "$OUTPUT_DIR/ca.crt" \
  -subj "/C=US/ST=State/L=City/O=Company/CN=Foundry CA"

# Generate server private key
openssl genrsa -out "$OUTPUT_DIR/server.key" 2048

# Create certificate signing request
cat > "$OUTPUT_DIR/server.cnf" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
C = US
ST = State
L = City
O = Company
CN = $DOMAIN

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = *.$DOMAIN
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF

openssl req -new -key "$OUTPUT_DIR/server.key" \
  -out "$OUTPUT_DIR/server.csr" \
  -config "$OUTPUT_DIR/server.cnf"

# Sign the certificate
openssl x509 -req -days $DAYS \
  -in "$OUTPUT_DIR/server.csr" \
  -CA "$OUTPUT_DIR/ca.crt" \
  -CAkey "$OUTPUT_DIR/ca.key" \
  -CAcreateserial \
  -out "$OUTPUT_DIR/server.crt" \
  -extensions req_ext \
  -extfile "$OUTPUT_DIR/server.cnf"

# Create fullchain
cat "$OUTPUT_DIR/server.crt" "$OUTPUT_DIR/ca.crt" > "$OUTPUT_DIR/fullchain.crt"

echo "Certificates generated in $OUTPUT_DIR"
echo "  CA Certificate: $OUTPUT_DIR/ca.crt"
echo "  Server Certificate: $OUTPUT_DIR/server.crt"
echo "  Server Key: $OUTPUT_DIR/server.key"
echo "  Full Chain: $OUTPUT_DIR/fullchain.crt"
```

### Create Kubernetes Secret

```bash
# Create TLS secret
kubectl create secret tls foundry-tls \
  --namespace foundry \
  --cert=./certs/fullchain.crt \
  --key=./certs/server.key

# Verify secret
kubectl get secret foundry-tls -n foundry -o yaml
```

### Distribute CA Certificate

For self-signed certificates, clients need the CA certificate:

```bash
# Copy CA to trust store (Linux)
sudo cp certs/ca.crt /usr/local/share/ca-certificates/foundry-ca.crt
sudo update-ca-certificates

# Import to browser (Chrome)
# Settings > Privacy and Security > Security > Manage certificates > Authorities > Import

# Add to Node.js
export NODE_EXTRA_CA_CERTS=/path/to/ca.crt
```

## Docker Compose SSL

### Nginx Configuration

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name foundry.local;

        # SSL Configuration
        ssl_certificate /etc/nginx/certs/fullchain.crt;
        ssl_certificate_key /etc/nginx/certs/server.key;

        # Modern SSL configuration
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # SSL session caching
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;

        # OCSP Stapling
        ssl_stapling on;
        ssl_stapling_verify on;
        ssl_trusted_certificate /etc/nginx/certs/ca.crt;

        # Security headers
        add_header Strict-Transport-Security "max-age=63072000" always;
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";

        # Frontend
        location / {
            proxy_pass http://frontend:80;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Backend API
        location /api {
            proxy_pass http://backend:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
```

### Docker Compose Configuration

```yaml
# docker-compose.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - frontend
      - backend
```

## Database SSL

### PostgreSQL SSL

```bash
# Generate PostgreSQL server certificate
openssl req -new -x509 -days 365 -nodes \
  -out server.crt \
  -keyout server.key \
  -subj "/CN=postgres"

# Set permissions
chmod 600 server.key
chown postgres:postgres server.key server.crt
```

```ini
# postgresql.conf
ssl = on
ssl_cert_file = '/var/lib/postgresql/server.crt'
ssl_key_file = '/var/lib/postgresql/server.key'
ssl_ca_file = '/var/lib/postgresql/ca.crt'
ssl_crl_file = ''
ssl_prefer_server_ciphers = on
ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL'
ssl_min_protocol_version = 'TLSv1.2'
```

```bash
# Connection string with SSL
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=verify-full&sslrootcert=/path/to/ca.crt
```

### Neo4j SSL

```conf
# neo4j.conf
dbms.ssl.policy.bolt.enabled=true
dbms.ssl.policy.bolt.base_directory=certificates/bolt
dbms.ssl.policy.bolt.private_key=private.key
dbms.ssl.policy.bolt.public_certificate=public.crt
dbms.ssl.policy.bolt.trusted_dir=trusted
dbms.ssl.policy.bolt.client_auth=NONE

dbms.ssl.policy.https.enabled=true
dbms.ssl.policy.https.base_directory=certificates/https
dbms.ssl.policy.https.private_key=private.key
dbms.ssl.policy.https.public_certificate=public.crt
```

### Redis SSL

```conf
# redis.conf
tls-port 6379
port 0
tls-cert-file /etc/redis/certs/redis.crt
tls-key-file /etc/redis/certs/redis.key
tls-ca-cert-file /etc/redis/certs/ca.crt
tls-auth-clients no
```

```bash
# Connection string with SSL
REDIS_URL=rediss://:password@redis:6379
```

## Certificate Rotation

### Automated Rotation with cert-manager

cert-manager automatically renews certificates 30 days before expiry.

```yaml
# certificate.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: foundry-cert
  namespace: foundry
spec:
  secretName: foundry-tls
  duration: 2160h    # 90 days
  renewBefore: 720h  # 30 days before expiry
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - foundry.your-company.com
```

### Manual Rotation

```bash
#!/bin/bash
# rotate-certs.sh

# Generate new certificates
./generate-certs.sh foundry.your-company.com 365

# Update Kubernetes secret
kubectl delete secret foundry-tls -n foundry
kubectl create secret tls foundry-tls \
  --namespace foundry \
  --cert=./certs/fullchain.crt \
  --key=./certs/server.key

# Restart ingress to pick up new certs
kubectl rollout restart deployment ingress-nginx-controller -n ingress-nginx

# Verify
kubectl describe certificate foundry-tls -n foundry
```

## Troubleshooting

### Certificate Not Working

```bash
# Check certificate chain
openssl s_client -connect foundry.your-company.com:443 -servername foundry.your-company.com

# Verify certificate dates
openssl x509 -in server.crt -noout -dates

# Check certificate subject
openssl x509 -in server.crt -noout -subject -issuer

# Test SSL configuration
curl -vI https://foundry.your-company.com
```

### cert-manager Issues

```bash
# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager

# Check certificate status
kubectl describe certificate foundry-tls -n foundry

# Check certificate request
kubectl get certificaterequest -n foundry

# Check ACME challenge
kubectl get challenge -n foundry
```

### Common Errors

**Certificate chain incomplete:**
```bash
# Ensure fullchain includes intermediate certificates
cat server.crt intermediate.crt ca.crt > fullchain.crt
```

**Name mismatch:**
```bash
# Verify SAN includes all required domains
openssl x509 -in server.crt -noout -text | grep -A1 "Subject Alternative Name"
```

**Expired certificate:**
```bash
# Check expiration
openssl x509 -in server.crt -noout -enddate

# Renew with cert-manager
kubectl delete certificate foundry-tls -n foundry
# cert-manager will automatically create a new one
```
