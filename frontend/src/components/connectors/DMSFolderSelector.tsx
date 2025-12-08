/**
 * DMS Folder Selector
 * T181: Tree view for selecting cabinets/vaults and folders for sync
 */

import React, { useState, useMemo } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Search } from 'lucide-react';

interface FolderNode {
  id: string;
  name: string;
  type: 'cabinet' | 'vault' | 'folder';
  path: string;
  children?: FolderNode[];
  documentCount?: number;
  parentId?: string;
}

interface DMSFolderSelectorProps {
  systemType: 'docuware' | 'mfiles';
  folders: FolderNode[];
  selectedFolders: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  maxHeight?: string;
}

export function DMSFolderSelector({
  systemType,
  folders,
  selectedFolders,
  onSelectionChange,
  onConfirm,
  onCancel,
  maxHeight = '600px',
}: DMSFolderSelectorProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const toggleSelection = (nodeId: string, node: FolderNode) => {
    const isSelected = selectedFolders.includes(nodeId);

    if (isSelected) {
      // Deselect this node and all its children
      const nodesToDeselect = getAllDescendantIds(node);
      onSelectionChange(
        selectedFolders.filter((id) => !nodesToDeselect.includes(id) && id !== nodeId)
      );
    } else {
      // Select this node
      onSelectionChange([...selectedFolders, nodeId]);
    }
  };

  const getAllDescendantIds = (node: FolderNode): string[] => {
    const ids: string[] = [];
    const traverse = (n: FolderNode) => {
      if (n.children) {
        n.children.forEach((child) => {
          ids.push(child.id);
          traverse(child);
        });
      }
    };
    traverse(node);
    return ids;
  };

  const isNodeSelected = (nodeId: string): boolean => {
    return selectedFolders.includes(nodeId);
  };

  const isNodeIndeterminate = (node: FolderNode): boolean => {
    if (!node.children || node.children.length === 0) return false;

    const childIds = getAllDescendantIds(node);
    const selectedChildCount = childIds.filter((id) => selectedFolders.includes(id)).length;

    return selectedChildCount > 0 && selectedChildCount < childIds.length;
  };

  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;

    const query = searchQuery.toLowerCase();
    const matchingNodes = new Set<string>();

    const findMatches = (nodes: FolderNode[]): void => {
      nodes.forEach((node) => {
        if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) {
          matchingNodes.add(node.id);
          // Add all parents
          let current = node;
          while (current.parentId) {
            matchingNodes.add(current.parentId);
            current = findNodeById(folders, current.parentId) || current;
          }
        }
        if (node.children) {
          findMatches(node.children);
        }
      });
    };

    findMatches(folders);

    const filterNodes = (nodes: FolderNode[]): FolderNode[] => {
      return nodes
        .filter((node) => matchingNodes.has(node.id))
        .map((node) => ({
          ...node,
          children: node.children ? filterNodes(node.children) : undefined,
        }));
    };

    return filterNodes(folders);
  }, [folders, searchQuery]);

  const findNodeById = (nodes: FolderNode[], id: string): FolderNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const renderFolderNode = (node: FolderNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = isNodeSelected(node.id);
    const isIndeterminate = isNodeIndeterminate(node);

    return (
      <div key={node.id} style={{ marginLeft: `${level * 20}px` }}>
        <div
          className={`flex items-center gap-2 py-2 px-3 hover:bg-gray-50 rounded cursor-pointer ${
            isSelected ? 'bg-blue-50' : ''
          }`}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(node.id);
              }}
              className="p-0.5 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-600" />
              )}
            </button>
          ) : (
            <div className="w-5" />
          )}

          <input
            type="checkbox"
            checked={isSelected}
            ref={(el) => {
              if (el) {
                el.indeterminate = isIndeterminate;
              }
            }}
            onChange={() => toggleSelection(node.id, node)}
            className="cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />

          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-blue-500" />
          ) : (
            <Folder className="w-4 h-4 text-gray-500" />
          )}

          <div
            className="flex-1 flex items-center justify-between"
            onClick={() => toggleSelection(node.id, node)}
          >
            <div>
              <span className="font-medium text-sm">{node.name}</span>
              {node.type !== 'folder' && (
                <span className="ml-2 text-xs text-gray-500">
                  ({node.type === 'cabinet' ? 'Cabinet' : 'Vault'})
                </span>
              )}
            </div>
            {node.documentCount !== undefined && (
              <span className="text-xs text-gray-500 ml-2">
                {node.documentCount.toLocaleString()} docs
              </span>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>{node.children!.map((child) => renderFolderNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  const selectedCount = selectedFolders.length;
  const totalDocuments = useMemo(() => {
    let total = 0;
    const countDocs = (nodes: FolderNode[]) => {
      nodes.forEach((node) => {
        if (selectedFolders.includes(node.id) && node.documentCount) {
          total += node.documentCount;
        }
        if (node.children) {
          countDocs(node.children);
        }
      });
    };
    countDocs(folders);
    return total;
  }, [folders, selectedFolders]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          Select {systemType === 'docuware' ? 'Cabinets and Folders' : 'Vaults and Folders'}
        </CardTitle>
        <CardDescription>
          Choose which {systemType === 'docuware' ? 'cabinets' : 'vaults'} and folders to
          include in your sync. Only documents from selected locations will be analyzed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Folder Tree */}
        <div
          className="border rounded-lg p-2 overflow-y-auto"
          style={{ maxHeight }}
        >
          {filteredFolders.length > 0 ? (
            filteredFolders.map((node) => renderFolderNode(node))
          ) : (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'No folders match your search' : 'No folders available'}
            </div>
          )}
        </div>

        {/* Selection Summary */}
        {selectedCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-sm text-blue-800">
              <strong>{selectedCount}</strong> location(s) selected
              {totalDocuments > 0 && (
                <>
                  {' '}
                  • Approximately <strong>{totalDocuments.toLocaleString()}</strong> documents
                </>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {(onConfirm || onCancel) && (
          <div className="flex justify-between gap-3">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {onConfirm && (
              <Button onClick={onConfirm} disabled={selectedCount === 0} className="flex-1">
                Confirm Selection
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Example mock data generator for testing
export function generateMockFolderStructure(
  systemType: 'docuware' | 'mfiles'
): FolderNode[] {
  if (systemType === 'docuware') {
    return [
      {
        id: 'cab1',
        name: 'Invoices',
        type: 'cabinet',
        path: '/Invoices',
        documentCount: 1250,
        children: [
          {
            id: 'cab1-f1',
            name: '2024',
            type: 'folder',
            path: '/Invoices/2024',
            parentId: 'cab1',
            documentCount: 450,
            children: [
              {
                id: 'cab1-f1-1',
                name: 'Q1',
                type: 'folder',
                path: '/Invoices/2024/Q1',
                parentId: 'cab1-f1',
                documentCount: 120,
              },
              {
                id: 'cab1-f1-2',
                name: 'Q2',
                type: 'folder',
                path: '/Invoices/2024/Q2',
                parentId: 'cab1-f1',
                documentCount: 150,
              },
            ],
          },
          {
            id: 'cab1-f2',
            name: '2023',
            type: 'folder',
            path: '/Invoices/2023',
            parentId: 'cab1',
            documentCount: 800,
          },
        ],
      },
      {
        id: 'cab2',
        name: 'Contracts',
        type: 'cabinet',
        path: '/Contracts',
        documentCount: 450,
        children: [
          {
            id: 'cab2-f1',
            name: 'Customer Contracts',
            type: 'folder',
            path: '/Contracts/Customer Contracts',
            parentId: 'cab2',
            documentCount: 300,
          },
          {
            id: 'cab2-f2',
            name: 'Vendor Contracts',
            type: 'folder',
            path: '/Contracts/Vendor Contracts',
            parentId: 'cab2',
            documentCount: 150,
          },
        ],
      },
    ];
  } else {
    return [
      {
        id: 'vault1',
        name: 'Document Vault',
        type: 'vault',
        path: '/Document Vault',
        documentCount: 5420,
        children: [
          {
            id: 'vault1-f1',
            name: 'Projects',
            type: 'folder',
            path: '/Document Vault/Projects',
            parentId: 'vault1',
            documentCount: 2100,
            children: [
              {
                id: 'vault1-f1-1',
                name: 'Project Alpha',
                type: 'folder',
                path: '/Document Vault/Projects/Project Alpha',
                parentId: 'vault1-f1',
                documentCount: 850,
              },
              {
                id: 'vault1-f1-2',
                name: 'Project Beta',
                type: 'folder',
                path: '/Document Vault/Projects/Project Beta',
                parentId: 'vault1-f1',
                documentCount: 650,
              },
            ],
          },
          {
            id: 'vault1-f2',
            name: 'Correspondence',
            type: 'folder',
            path: '/Document Vault/Correspondence',
            parentId: 'vault1',
            documentCount: 1200,
          },
        ],
      },
      {
        id: 'vault2',
        name: 'Engineering',
        type: 'vault',
        path: '/Engineering',
        documentCount: 2100,
        children: [
          {
            id: 'vault2-f1',
            name: 'Drawings',
            type: 'folder',
            path: '/Engineering/Drawings',
            parentId: 'vault2',
            documentCount: 1500,
          },
          {
            id: 'vault2-f2',
            name: 'Specifications',
            type: 'folder',
            path: '/Engineering/Specifications',
            parentId: 'vault2',
            documentCount: 600,
          },
        ],
      },
    ];
  }
}

export default DMSFolderSelector;
