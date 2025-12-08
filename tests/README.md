# Test Suites Documentation

This directory contains comprehensive test suites for the Foundry platform, including E2E, integration, performance, and accuracy tests.

## Test Structure

```
tests/
├── e2e/                          # End-to-end tests (Playwright)
│   ├── connector-setup.spec.ts  # Connector setup flow tests (T212)
│   ├── multiEntity.spec.ts      # Multi-entity tests
│   ├── partnerApi.spec.ts       # Partner API tests
│   ├── sso.spec.ts              # SSO tests
│   ├── whiteLabel.spec.ts       # White-label tests
│   └── helpers.ts               # E2E test utilities

backend/tests/
├── security/                     # Security tests
│   └── credential-audit.test.ts # Credential encryption tests (T213)
├── integration/                  # Integration tests
│   └── rate-limiting.test.ts    # Rate limiting tests (T214)
├── performance/                  # Performance tests
│   └── sync-performance.test.ts # Sync performance tests (T215)
├── accuracy/                     # Accuracy validation tests
│   └── sync-accuracy.test.ts    # Data sync accuracy tests (T216)
├── fixtures/                     # Test data fixtures
│   └── connectorData.ts         # Mock connector data
└── utils/                        # Test utilities
    └── testHelpers.ts           # Common test helpers
```

## Running Tests

### All Tests

```bash
# Run all tests (backend + frontend)
pnpm test

# Run with coverage
pnpm test:coverage
```

### Backend Tests

```bash
# Run all backend tests
cd backend
pnpm test

# Run specific test suites
pnpm test tests/security
pnpm test tests/integration
pnpm test tests/performance
pnpm test tests/accuracy

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration
```

### Frontend E2E Tests

```bash
# Run all E2E tests
cd frontend
pnpm test:e2e

# Run E2E tests with UI
pnpm test:e2e:ui

# Run specific test file
pnpm test:e2e tests/e2e/connector-setup.spec.ts
```

## Test Descriptions

### T212: Connector Setup E2E Tests
**File:** `frontend/tests/e2e/connector-setup.spec.ts`

Comprehensive end-to-end tests for the connector setup flow:
- Marketplace navigation and filtering
- Connector wizard completion (OAuth and API key)
- Connection testing and validation
- Error handling and retry logic
- Progress tracking

**Key Features:**
- Tests Google Workspace, Salesforce, HubSpot, and Slack connectors
- OAuth flow simulation
- API key validation
- Wizard navigation and state persistence

**Run:**
```bash
cd frontend
pnpm test:e2e tests/e2e/connector-setup.spec.ts
```

### T213: Credential Audit Tests
**File:** `backend/tests/security/credential-audit.test.ts`

Security audit tests for credential encryption:
- AES-256-GCM encryption verification
- Credentials encrypted at rest validation
- No plaintext secrets in logs
- Credential rotation testing
- Master key strength validation

**Key Features:**
- Tests encryption/decryption integrity
- Validates auth tag protection
- Tests key rotation without data loss
- Verifies no plaintext leakage

**Run:**
```bash
cd backend
pnpm test tests/security/credential-audit.test.ts
```

### T214: Rate Limiting Tests
**File:** `backend/tests/integration/rate-limiting.test.ts`

Comprehensive rate limiting tests:
- Rate limiter enforcement across connectors
- Exponential backoff validation
- Concurrent request handling
- Rate limit header respect
- Multi-window rate limiting (hourly, daily, burst)

**Key Features:**
- Tests different rate limit tiers (FREE, STANDARD, PREMIUM, ENTERPRISE)
- Validates backoff with jitter
- Tests Redis-based and local rate limiting
- Concurrent request stress testing

**Run:**
```bash
cd backend
pnpm test tests/integration/rate-limiting.test.ts
```

### T215: Sync Performance Tests
**File:** `backend/tests/performance/sync-performance.test.ts`

Performance tests for large-scale data synchronization:
- 10,000 record sync completion under 30 minutes
- Memory usage tracking and validation
- Throughput measurement (records/sec)
- Batch processing efficiency
- Concurrent processing performance

**Key Features:**
- Tests with mock datasets (small and large records)
- Memory leak detection
- Progress tracking validation
- Checkpointing overhead measurement
- Real-world mixed dataset scenarios

**Run:**
```bash
cd backend
pnpm test tests/performance/sync-performance.test.ts
```

**Note:** Performance tests have longer timeouts (up to 30 minutes) and should be run separately:
```bash
pnpm test tests/performance --testTimeout=1800000
```

### T216: Sync Accuracy Tests
**File:** `backend/tests/accuracy/sync-accuracy.test.ts`

Data synchronization accuracy validation:
- Source vs synced record comparison
- 99% accuracy target validation
- Data transformation correctness
- Field mapping validation
- Type preservation verification

**Key Features:**
- Tests Google, Salesforce, HubSpot transformations
- Validates 1,000 and 10,000 record accuracy
- Field-level accuracy tracking
- Special character and Unicode handling
- Nested object transformation validation

**Run:**
```bash
cd backend
pnpm test tests/accuracy/sync-accuracy.test.ts
```

## Test Fixtures and Utilities

### Connector Data Fixtures
**File:** `backend/tests/fixtures/connectorData.ts`

Reusable mock data for all connector types:
- Google Workspace (contacts, emails, calendar)
- Salesforce (accounts, opportunities, activities)
- HubSpot (contacts, deals, engagements)
- Slack (messages, channels, users)
- Microsoft 365 (emails, calendar events)
- SAP Business One (business partners, documents)
- DATEV (documents, cost centers)
- Odoo (partners, sale orders)

### Test Helpers
**File:** `backend/tests/utils/testHelpers.ts`

Common utilities for backend testing:
- `wait()` - Async delay utility
- `retry()` - Retry with exponential backoff
- `measureTime()` - Performance measurement
- `assertWithinTime()` - Time-bound assertions
- `createMockRedis()` - Mock Redis client
- `formatBytes()`, `formatDuration()` - Formatting utilities
- `createMockLogger()` - Capture log messages

### E2E Helpers
**File:** `frontend/tests/e2e/helpers.ts`

Common utilities for E2E testing:
- `login()` - User authentication
- `waitForElement()` - Wait for UI elements
- `mockApiResponse()` - Mock API calls
- `fillForm()` - Form filling utility
- `clickAndNavigate()` - Click with navigation wait
- Storage helpers (localStorage, sessionStorage, cookies)
- Network and console log capture

## Environment Variables

### Backend Tests
```env
# Test database
DATABASE_URL=postgresql://user:pass@localhost:5432/test_db

# Redis (optional, falls back to in-memory)
REDIS_URL=redis://localhost:6379

# Encryption
CREDENTIAL_MASTER_KEY=your-strong-master-key-here
```

### E2E Tests
```env
# Test URLs
E2E_BASE_URL=http://localhost:3000
E2E_API_URL=http://localhost:3001

# Test credentials
TEST_USER_EMAIL=admin@test.com
TEST_USER_PASSWORD=TestPassword123!
```

## Performance Targets

### Sync Performance (T215)
- **10,000 records:** < 30 minutes
- **Throughput:** > 100 records/sec
- **Memory usage:** < 500 MB increase
- **Concurrent processing:** > 200 records/sec with 20 workers

### Accuracy Targets (T216)
- **Overall accuracy:** ≥ 99%
- **Field-level accuracy:** ≥ 99% per field
- **Type preservation:** 100%
- **Transformation correctness:** 100%

### Rate Limiting (T214)
- **Tier enforcement:** 100% compliance
- **Backoff timing:** Within 10% of expected
- **Concurrent handling:** No race conditions

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run Backend Tests
  run: |
    cd backend
    pnpm test --coverage

- name: Run E2E Tests
  run: |
    cd frontend
    pnpm test:e2e
```

### Test Reports

Test results are generated in:
- Backend: `backend/coverage/` (coverage reports)
- E2E: `frontend/test-results/` (Playwright reports)

View reports:
```bash
# Backend coverage
cd backend
pnpm test:coverage
open coverage/index.html

# E2E report
cd frontend
pnpm playwright show-report
```

## Troubleshooting

### E2E Tests Failing
1. Ensure dev server is running: `pnpm dev`
2. Check Playwright browsers are installed: `pnpm playwright install`
3. Verify environment variables are set
4. Run with UI mode for debugging: `pnpm test:e2e:ui`

### Performance Tests Timeout
1. Increase test timeout in vitest config
2. Run performance tests separately: `pnpm test tests/performance`
3. Check system resources (CPU, memory)

### Rate Limiting Tests Flaky
1. Ensure Redis is running (or tests use in-memory fallback)
2. Clear Redis between test runs: `redis-cli FLUSHALL`
3. Run with increased timeout for CI environments

### Security Tests Failing
1. Verify `CREDENTIAL_MASTER_KEY` is set
2. Check that master key meets strength requirements
3. Ensure crypto module is available (Node.js 14+)

## Best Practices

1. **Isolation:** Each test should be independent and not rely on others
2. **Cleanup:** Always clean up test data in `afterEach` or `afterAll`
3. **Mocking:** Use mocks for external services (APIs, databases)
4. **Assertions:** Use descriptive assertion messages
5. **Performance:** Keep unit tests fast (< 1s), mark slow tests appropriately
6. **Coverage:** Aim for > 80% code coverage
7. **Documentation:** Comment complex test scenarios

## Contributing

When adding new tests:

1. Follow existing naming conventions
2. Add test descriptions and documentation
3. Include test fixtures in appropriate directory
4. Update this README with new test information
5. Ensure tests pass in CI before merging

## Support

For issues or questions about tests:
- Check test logs and error messages
- Review test fixtures and mocks
- Consult team documentation
- Create an issue with test failure details
