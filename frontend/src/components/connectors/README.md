# DMS Connector Components

This directory contains React components for connecting to and managing Document Management Systems (DMS) including DocuWare and M-Files.

## Components Overview

### 1. DMSSystemSelector (T178)
Allows users to select between DocuWare and M-Files DMS systems.

**Features:**
- Visual cards showing system logos and descriptions
- Key features listed for each system
- One-click routing to appropriate setup wizard

**Usage:**
```tsx
import { DMSSystemSelector } from '@/components/connectors';

<DMSSystemSelector
  onSelectSystem={(systemId) => console.log(systemId)}
  onCancel={() => console.log('Cancelled')}
/>
```

### 2. DocuwareSetupWizard (T179)
Multi-step wizard for setting up DocuWare connections.

**Steps:**
1. Connection Details - Name, cloud/on-premise selection, URL
2. Authentication - Username and password
3. Cabinet Selection - Choose document cabinets
4. Sync Configuration - Sync interval and workflow tracking

**Usage:**
```tsx
import { DocuwareSetupWizard } from '@/components/connectors';

<DocuwareSetupWizard
  onComplete={(config) => console.log('Config:', config)}
  onCancel={() => console.log('Cancelled')}
  isSubmitting={false}
/>
```

**Config Output:**
```typescript
interface DocuwareConfig {
  name: string;
  connectionType: 'cloud' | 'onpremise';
  url: string;
  username: string;
  password: string;
  organization?: string;
  selectedCabinets: string[];
  syncInterval: number;
  enableWorkflows: boolean;
}
```

### 3. MFilesSetupWizard (T180)
Multi-step wizard for setting up M-Files connections.

**Steps:**
1. Connection Details - Name, cloud/on-premise selection, server URL
2. Authentication - M-Files or Windows authentication
3. Vault Selection - Choose M-Files vaults
4. Sync Configuration - Sync settings, metadata, and version control

**Usage:**
```tsx
import { MFilesSetupWizard } from '@/components/connectors';

<MFilesSetupWizard
  onComplete={(config) => console.log('Config:', config)}
  onCancel={() => console.log('Cancelled')}
  isSubmitting={false}
/>
```

**Config Output:**
```typescript
interface MFilesConfig {
  name: string;
  connectionType: 'cloud' | 'onpremise';
  serverUrl: string;
  username: string;
  password: string;
  authType: 'mfiles' | 'windows';
  selectedVaults: string[];
  syncInterval: number;
  syncMetadata: boolean;
  syncVersions: boolean;
}
```

### 4. DMSFolderSelector (T181)
Tree view component for selecting specific folders within cabinets/vaults.

**Features:**
- Hierarchical tree view with expand/collapse
- Checkbox selection with parent-child relationships
- Search/filter functionality
- Document count display
- Indeterminate checkbox states for partial selections

**Usage:**
```tsx
import { DMSFolderSelector, generateMockFolderStructure } from '@/components/connectors';

const folders = generateMockFolderStructure('docuware'); // or 'mfiles'

<DMSFolderSelector
  systemType="docuware"
  folders={folders}
  selectedFolders={selectedIds}
  onSelectionChange={setSelectedIds}
  onConfirm={() => console.log('Confirmed')}
  onCancel={() => console.log('Cancelled')}
  maxHeight="600px"
/>
```

**Folder Structure:**
```typescript
interface FolderNode {
  id: string;
  name: string;
  type: 'cabinet' | 'vault' | 'folder';
  path: string;
  children?: FolderNode[];
  documentCount?: number;
  parentId?: string;
}
```

### 5. DMSSyncStatus (T182)
Displays real-time sync status and statistics for DMS connections.

**Features:**
- Connection status badges (Connected, Syncing, Error, Paused)
- Sync progress indicator
- Document statistics
- Workflow tracking (for DocuWare)
- Error and warning display
- Manual sync, pause/resume controls

**Usage:**
```tsx
import { DMSSyncStatus, generateMockDMSConnection } from '@/components/connectors';

const connection = generateMockDMSConnection('docuware', 'connected');

<DMSSyncStatus
  connection={connection}
  onSync={() => console.log('Sync triggered')}
  onPause={() => console.log('Paused')}
  onResume={() => console.log('Resumed')}
  onViewErrors={() => console.log('View errors')}
  onDisconnect={() => console.log('Disconnected')}
  isSyncing={false}
/>
```

**Connection Structure:**
```typescript
interface DMSConnection {
  id: string;
  name: string;
  type: 'docuware' | 'mfiles';
  status: 'connected' | 'syncing' | 'error' | 'paused';
  stats: SyncStats;
  errors: SyncError[];
  connectedAt: Date;
}
```

## Complete Example

See `DMSConnectorExample.tsx` for a complete integration example showing all components working together in a typical workflow:

1. User selects DMS system
2. User completes setup wizard
3. User selects folders to sync
4. System displays sync status

```tsx
import { DMSConnectorExample } from '@/components/connectors';

<DMSConnectorExample />
```

## Tech Stack

- **React 18** - Component framework
- **TypeScript 5.x** - Type safety
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Radix UI** - Base UI components

## Integration with Backend

These components are designed to work with the backend DMS connector APIs:

- `POST /api/connectors/dms/docuware` - Create DocuWare connection
- `POST /api/connectors/dms/mfiles` - Create M-Files connection
- `GET /api/connectors/dms/:id/folders` - Fetch folder structure
- `POST /api/connectors/dms/:id/sync` - Trigger manual sync
- `GET /api/connectors/dms/:id/status` - Get sync status

## Testing

Each component includes mock data generators for testing:

```tsx
import {
  generateMockFolderStructure,
  generateMockDMSConnection,
} from '@/components/connectors';

const mockFolders = generateMockFolderStructure('docuware');
const mockConnection = generateMockDMSConnection('mfiles', 'syncing');
```

## File Structure

```
connectors/
├── DMSSystemSelector.tsx        (T178)
├── DocuwareSetupWizard.tsx      (T179)
├── MFilesSetupWizard.tsx        (T180)
├── DMSFolderSelector.tsx        (T181)
├── DMSSyncStatus.tsx            (T182)
├── DMSConnectorExample.tsx      (Example/Demo)
├── index.ts                     (Exports)
└── README.md                    (This file)
```

## Patterns Used

All components follow the established patterns from existing connector components:

- Multi-step wizards use `ConnectorWizard` wrapper
- Consistent use of shadcn/ui components (Card, Button, Input, Badge)
- TypeScript interfaces for all props and config types
- Mock data generators for testing
- Responsive design with Tailwind CSS
- Lucide React icons throughout

## Future Enhancements

Potential improvements:

1. Real-time sync progress via WebSocket
2. Advanced folder filtering (by date, type, etc.)
3. Batch operations for multiple connections
4. Export sync reports
5. Connection health monitoring
6. Automatic retry logic for failed syncs
