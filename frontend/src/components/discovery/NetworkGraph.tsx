/**
 * Network Graph Component
 * Visualizes communication network between people
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { usePeople, useCommunications, Person, Communication } from '../../hooks/useDiscovery';

interface GraphNode {
  id: string;
  label: string;
  size: number;
  x: number;
  y: number;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export function NetworkGraph() {
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: people, isLoading: peopleLoading } = usePeople({ limit: 100 });
  const { data: communications, isLoading: commsLoading } = useCommunications({
    limit: 200,
  });

  const isLoading = peopleLoading || commsLoading;

  // Build graph data
  const { nodes, edges } = useMemo(() => {
    if (!people || !communications) return { nodes: [], edges: [] };

    // Create node map
    const nodeMap = new Map<string, GraphNode>();
    const maxComms = Math.max(...people.map((p) => p.communicationCount || 0), 1);

    // Layout nodes in a circle
    const centerX = 400;
    const centerY = 300;
    const radius = 250;

    people.forEach((person, index) => {
      const angle = (2 * Math.PI * index) / people.length;
      const commRatio = (person.communicationCount || 0) / maxComms;

      nodeMap.set(person.email, {
        id: person.email,
        label: person.displayName || person.email.split('@')[0],
        size: 10 + commRatio * 20,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        color: selectedPerson === person.email ? '#3B82F6' : '#6B7280',
      });
    });

    // Create edges
    const graphEdges: GraphEdge[] = communications
      .filter((c) => nodeMap.has(c.fromEmail) && nodeMap.has(c.toEmail))
      .map((c) => ({
        source: c.fromEmail,
        target: c.toEmail,
        weight: c.totalCount,
      }));

    return {
      nodes: Array.from(nodeMap.values()),
      edges: graphEdges,
    };
  }, [people, communications, selectedPerson]);

  // Filter people by search
  const filteredPeople = useMemo(() => {
    if (!people) return [];
    if (!searchTerm) return people;
    const term = searchTerm.toLowerCase();
    return people.filter(
      (p) =>
        p.email.toLowerCase().includes(term) ||
        p.displayName?.toLowerCase().includes(term)
    );
  }, [people, searchTerm]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card className="animate-pulse">
            <CardHeader>
              <div className="h-8 w-48 bg-gray-200 rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-96 bg-gray-100 rounded"></div>
            </CardContent>
          </Card>
        </div>
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-8 w-32 bg-gray-200 rounded"></div>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-gray-100 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Graph Visualization */}
      <div className="col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Communication Network</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg bg-gray-50 overflow-hidden">
              <svg width="100%" height="600" viewBox="0 0 800 600">
                <defs>
                  <marker
                    id="network-arrow"
                    markerWidth="6"
                    markerHeight="4"
                    refX="6"
                    refY="2"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 2, 0 4" fill="#D1D5DB" />
                  </marker>
                </defs>

                {/* Draw edges */}
                {edges.map((edge, index) => {
                  const sourceNode = nodes.find((n) => n.id === edge.source);
                  const targetNode = nodes.find((n) => n.id === edge.target);
                  if (!sourceNode || !targetNode) return null;

                  const isSelected =
                    selectedPerson === edge.source || selectedPerson === edge.target;
                  const opacity = selectedPerson
                    ? isSelected
                      ? 0.8
                      : 0.1
                    : 0.3;
                  const strokeWidth = Math.max(1, Math.min(4, edge.weight / 50));

                  return (
                    <line
                      key={`edge-${index}`}
                      x1={sourceNode.x}
                      y1={sourceNode.y}
                      x2={targetNode.x}
                      y2={targetNode.y}
                      stroke={isSelected ? '#3B82F6' : '#9CA3AF'}
                      strokeWidth={strokeWidth}
                      opacity={opacity}
                      markerEnd="url(#network-arrow)"
                    />
                  );
                })}

                {/* Draw nodes */}
                {nodes.map((node) => {
                  const isSelected = selectedPerson === node.id;
                  const isConnected =
                    selectedPerson &&
                    edges.some(
                      (e) =>
                        (e.source === selectedPerson && e.target === node.id) ||
                        (e.target === selectedPerson && e.source === node.id)
                    );
                  const opacity = selectedPerson
                    ? isSelected || isConnected
                      ? 1
                      : 0.3
                    : 1;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      style={{ cursor: 'pointer', opacity }}
                      onClick={() =>
                        setSelectedPerson(isSelected ? null : node.id)
                      }
                    >
                      <circle
                        r={node.size}
                        fill={isSelected ? '#3B82F6' : '#6B7280'}
                        stroke={isSelected ? '#1D4ED8' : '#4B5563'}
                        strokeWidth="2"
                      />
                      <text
                        y={node.size + 15}
                        textAnchor="middle"
                        className="text-xs fill-gray-700"
                      >
                        {node.label.length > 12
                          ? `${node.label.substring(0, 12)}...`
                          : node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-gray-500"></div>
                <span>Node size = communication volume</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-1 bg-gray-400"></div>
                <span>Edge width = message count</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* People List */}
      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <Input
            placeholder="Search people..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mt-2"
          />
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredPeople.map((person) => (
              <div
                key={person.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedPerson === person.email
                    ? 'bg-blue-100 border-blue-300 border'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
                onClick={() =>
                  setSelectedPerson(
                    selectedPerson === person.email ? null : person.email
                  )
                }
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">
                      {person.displayName || person.email}
                    </p>
                    <p className="text-xs text-gray-500">{person.email}</p>
                  </div>
                  <div className="text-right">
                    <Badge className="bg-blue-100 text-blue-800">
                      {person.communicationCount || 0}
                    </Badge>
                    <p className="text-xs text-gray-400 mt-1">messages</p>
                  </div>
                </div>
                {person.department && (
                  <p className="text-xs text-gray-400 mt-1">{person.department}</p>
                )}
              </div>
            ))}
          </div>

          {selectedPerson && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="font-medium text-sm mb-2">Selected Person</h4>
              <p className="text-sm text-gray-600">{selectedPerson}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setSelectedPerson(null)}
              >
                Clear Selection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default NetworkGraph;
