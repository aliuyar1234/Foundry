# Connector Hooks and State Management

This directory contains React hooks and state management for connector operations in the Enterprise AI Foundation Platform.

## Overview

The connector system provides:
- **CRUD operations** for connector instances
- **Sync management** with real-time progress tracking
- **Error handling** with filtering and resolution
- **Global state** via Zustand store
- **Type-safe** React Query patterns

## Files

### Hooks

1. **useConnectorInstances.ts** (T201)
   - Fetch and manage connector instances
   - CRUD operations with optimistic updates
   - OAuth flow management
   - Health monitoring

2. **useConnectorSync.ts** (T202)
   - Trigger and monitor sync operations
   - Real-time sync status updates
   - Cancel/retry sync capability
   - Sync statistics

3. **useConnectorErrors.ts** (T203)
   - Fetch connector errors
   - Filter and pagination
   - Mark as resolved
   - Error trends and analytics

### Store

4. **connectorStore.ts** (T204)
   - Zustand global state management
   - Available connectors cache
   - Instance list cache per organization
   - Active sync tracking
   - UI state (filters, selections, wizard)

### Types

5. **types/connectors.ts**
   - Comprehensive TypeScript type definitions
   - All connector-related interfaces

## Usage Examples

### Fetching Connector Instances

```typescript
import { useConnectorInstances } from '@/hooks';

function ConnectorList() {
  const { data: instances, isLoading, error } = useConnectorInstances(orgId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {instances?.map(instance => (
        <li key={instance.id}>{instance.name} - {instance.status}</li>
      ))}
    </ul>
  );
}
```

### Creating a Connector Instance

```typescript
import { useCreateConnectorInstance } from '@/hooks';

function CreateConnectorButton() {
  const createMutation = useCreateConnectorInstance(orgId);

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      name: 'My Salesforce Connector',
      type: 'SALESFORCE',
      config: {
        instanceUrl: 'https://mycompany.salesforce.com',
        clientId: 'xxx',
      },
    });
  };

  return (
    <button onClick={handleCreate} disabled={createMutation.isPending}>
      {createMutation.isPending ? 'Creating...' : 'Create Connector'}
    </button>
  );
}
```

### Triggering a Sync

```typescript
import { useTriggerSync, useLatestSyncJob } from '@/hooks';

function SyncButton({ instanceId }: { instanceId: string }) {
  const triggerSync = useTriggerSync(orgId, instanceId);
  const { data: latestJob } = useLatestSyncJob(orgId, instanceId);

  const isRunning = latestJob?.status === 'RUNNING' || latestJob?.status === 'PENDING';

  const handleSync = async () => {
    await triggerSync.mutateAsync({
      fullSync: false,
      syncEmails: true,
    });
  };

  return (
    <button onClick={handleSync} disabled={isRunning || triggerSync.isPending}>
      {isRunning ? 'Syncing...' : 'Start Sync'}
    </button>
  );
}
```

### Monitoring Sync Progress

```typescript
import { useSyncProgress } from '@/hooks';

function SyncProgressBar({ instanceId, jobId }: { instanceId: string; jobId: string }) {
  const { data: progress } = useSyncProgress(orgId, instanceId, jobId);

  if (!progress) return null;

  return (
    <div>
      <div>Stage: {progress.stage}</div>
      <div>Progress: {progress.percentage}%</div>
      <progress value={progress.current} max={progress.total} />
      {progress.message && <div>{progress.message}</div>}
    </div>
  );
}
```

### Managing Errors

```typescript
import { useConnectorErrors, useResolveConnectorError } from '@/hooks';

function ErrorList({ instanceId }: { instanceId: string }) {
  const { data: errors } = useConnectorErrors(orgId, instanceId, {
    resolved: false,
    severity: 'HIGH',
  });

  const resolveMutation = useResolveConnectorError(orgId, instanceId);

  const handleResolve = (errorId: string) => {
    resolveMutation.mutate({
      errorId,
      resolution: 'Fixed by updating configuration',
    });
  };

  return (
    <ul>
      {errors?.data.map(error => (
        <li key={error.id}>
          {error.message} - {error.severity}
          <button onClick={() => handleResolve(error.id)}>Resolve</button>
        </li>
      ))}
    </ul>
  );
}
```

### Using the Connector Store

```typescript
import { useConnectorStore, useFilteredInstances } from '@/stores/connectorStore';

function ConnectorDashboard() {
  const { filters, setFilters } = useConnectorStore();
  const filteredInstances = useFilteredInstances(orgId);
  const activeSyncs = useConnectorStore(state => state.getAllActiveSyncs());

  return (
    <div>
      <div>Active Syncs: {activeSyncs.length}</div>

      <input
        type="text"
        value={filters.searchQuery || ''}
        onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
        placeholder="Search connectors..."
      />

      <ul>
        {filteredInstances.map(instance => (
          <li key={instance.id}>{instance.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Tracking Active Syncs

```typescript
import { useConnectorStore } from '@/stores/connectorStore';

function ActiveSyncIndicator({ instanceId }: { instanceId: string }) {
  const hasActiveSync = useConnectorStore(state => state.hasActiveSync(instanceId));
  const activeSync = useConnectorStore(state => state.getActiveSync(instanceId));

  if (!hasActiveSync) return null;

  return (
    <div>
      <span>Sync in progress...</span>
      {activeSync?.progress && (
        <span>{activeSync.progress.percentage}%</span>
      )}
    </div>
  );
}
```

### OAuth Flow

```typescript
import { useGetConnectorAuthUrl, useExchangeConnectorAuthCode } from '@/hooks';

function OAuthConnect({ instanceId }: { instanceId: string }) {
  const getAuthUrl = useGetConnectorAuthUrl(orgId, instanceId);
  const exchangeCode = useExchangeConnectorAuthCode(orgId, instanceId);

  const handleConnect = async () => {
    const { authorizationUrl, state } = await getAuthUrl.mutateAsync({
      redirectUri: window.location.origin + '/oauth/callback',
    });

    // Store state for validation
    sessionStorage.setItem('oauth_state', state);

    // Redirect to OAuth provider
    window.location.href = authorizationUrl;
  };

  // On callback page:
  const handleCallback = async (code: string, state: string) => {
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
      throw new Error('Invalid state parameter');
    }

    await exchangeCode.mutateAsync({
      code,
      redirectUri: window.location.origin + '/oauth/callback',
      state,
    });
  };

  return <button onClick={handleConnect}>Connect</button>;
}
```

## Features

### Optimistic Updates

All mutation hooks use optimistic updates to provide instant UI feedback:
- Create connector: Immediately adds to list with temp ID
- Update connector: Instantly reflects changes
- Delete connector: Removes from list immediately
- Resolve error: Marks as resolved instantly

On error, changes are automatically rolled back.

### Automatic Refetching

Queries automatically refetch when:
- Sync jobs are running (every 2 seconds)
- Health checks (every 60 seconds)
- Unresolved error counts (every 60 seconds)
- Latest job has running status (every 2 seconds)

### Type Safety

All hooks are fully typed with TypeScript:
- Autocomplete support
- Type checking at compile time
- Prevents runtime errors

### Error Handling

Built-in error handling:
- API errors are caught and typed
- Error states exposed via `isError` and `error` properties
- Automatic retry with exponential backoff (configurable)

### Performance

Optimized for performance:
- Query result caching (5-60 minutes depending on data type)
- Selector hooks prevent unnecessary re-renders
- Pagination support for large datasets
- Debounced search in store

## Query Key Structure

```typescript
// Available connectors
['connectors', 'available']

// Instance list
['connectors', 'instances', organizationId]

// Single instance
['connectors', 'instances', organizationId, instanceId]

// Sync jobs
['connectors', 'instances', organizationId, instanceId, 'syncJobs']

// Specific sync job
['connectors', 'instances', organizationId, instanceId, 'syncJobs', jobId]

// Errors
['connectors', 'instances', organizationId, instanceId, 'errors']

// Health
['connectors', 'instances', organizationId, instanceId, 'health']
```

## Best Practices

1. **Always provide organizationId**: Most hooks require an organizationId parameter
2. **Use enabled flag**: Disable queries when IDs are not available
3. **Handle loading states**: Always show loading indicators
4. **Handle errors**: Display error messages to users
5. **Use optimistic updates**: For better UX during mutations
6. **Cleanup on unmount**: Cancel ongoing queries when component unmounts
7. **Use selector hooks**: For better performance with Zustand store

## API Endpoints

The hooks expect these API endpoints to be available:

```
GET    /connectors/available
GET    /organizations/:orgId/connectors
GET    /organizations/:orgId/connectors/:id
POST   /organizations/:orgId/connectors
PATCH  /organizations/:orgId/connectors/:id
DELETE /organizations/:orgId/connectors/:id
POST   /organizations/:orgId/connectors/:id/sync
POST   /organizations/:orgId/connectors/:id/test
GET    /organizations/:orgId/connectors/:id/health
GET    /organizations/:orgId/connectors/:id/sync-jobs
GET    /organizations/:orgId/connectors/:id/sync-jobs/:jobId
POST   /organizations/:orgId/connectors/:id/sync-jobs/:jobId/cancel
GET    /organizations/:orgId/connectors/:id/errors
POST   /organizations/:orgId/connectors/:id/errors/:errorId/resolve
```

## Testing

Example test setup:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConnectorInstances } from './useConnectorInstances';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

test('fetches connector instances', async () => {
  const { result } = renderHook(
    () => useConnectorInstances('org-123'),
    { wrapper: createWrapper() }
  );

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(5);
});
```

## Contributing

When adding new hooks:
1. Follow the existing patterns (React Query for data fetching)
2. Add optimistic updates for mutations
3. Include proper TypeScript types
4. Update this README with usage examples
5. Add query keys to queryClient.ts
