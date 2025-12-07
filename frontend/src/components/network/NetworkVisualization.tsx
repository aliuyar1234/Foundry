/**
 * Network Visualization Component
 * Interactive force-directed graph visualization of communication network
 * T244 - Main network visualization
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';

export interface NetworkNode {
  id: string;
  email: string;
  displayName?: string;
  department?: string;
  degree: number;
  influenceScore?: number;
  communityId?: string;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  direction: 'outgoing' | 'incoming' | 'bidirectional';
}

interface NetworkVisualizationProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  width?: number;
  height?: number;
  selectedNode?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  colorBy?: 'department' | 'community' | 'influence';
  showLabels?: boolean;
}

interface LayoutNode extends NetworkNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Color palette for departments/communities
const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export function NetworkVisualization({
  nodes,
  edges,
  width = 800,
  height = 600,
  selectedNode,
  onNodeSelect,
  colorBy = 'department',
  showLabels = true,
}: NetworkVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Initialize layout with force-directed positioning
  useEffect(() => {
    if (nodes.length === 0) return;

    // Initialize positions in a circle
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    const initialLayout: LayoutNode[] = nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      return {
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });

    // Run force simulation
    const simulation = runForceSimulation(initialLayout, edges, width, height);
    setLayoutNodes(simulation);
  }, [nodes, edges, width, height]);

  // Get color for a node
  const getNodeColor = useCallback((node: NetworkNode) => {
    if (colorBy === 'department') {
      const depts = [...new Set(nodes.map((n) => n.department).filter(Boolean))];
      const index = depts.indexOf(node.department || '');
      return index >= 0 ? COLORS[index % COLORS.length] : '#6B7280';
    }
    if (colorBy === 'community') {
      const communities = [...new Set(nodes.map((n) => n.communityId).filter(Boolean))];
      const index = communities.indexOf(node.communityId || '');
      return index >= 0 ? COLORS[index % COLORS.length] : '#6B7280';
    }
    if (colorBy === 'influence' && node.influenceScore !== undefined) {
      const intensity = Math.min(node.influenceScore, 1);
      return `rgba(59, 130, 246, ${0.3 + intensity * 0.7})`;
    }
    return '#6B7280';
  }, [nodes, colorBy]);

  // Handle zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.2, Math.min(3, z * delta)));
  }, []);

  // Handle pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Get connected nodes for highlighting
  const connectedNodes = useMemo(() => {
    if (!selectedNode && !hoveredNode) return new Set<string>();
    const target = selectedNode || hoveredNode;
    const connected = new Set<string>([target!]);
    edges.forEach((e) => {
      if (e.source === target) connected.add(e.target);
      if (e.target === target) connected.add(e.source);
    });
    return connected;
  }, [selectedNode, hoveredNode, edges]);

  const nodeMap = useMemo(() => {
    return new Map(layoutNodes.map((n) => [n.id, n]));
  }, [layoutNodes]);

  if (layoutNodes.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <p className="text-gray-500">Loading network...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Communication Network</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(1)}
          >
            Reset Zoom
          </Button>
          <Badge variant="secondary">{nodes.length} nodes</Badge>
          <Badge variant="secondary">{edges.length} edges</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="border rounded-lg bg-gray-50 overflow-hidden"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {edges.map((edge, i) => {
                const source = nodeMap.get(edge.source);
                const target = nodeMap.get(edge.target);
                if (!source || !target) return null;

                const isHighlighted = connectedNodes.size === 0 ||
                  (connectedNodes.has(edge.source) && connectedNodes.has(edge.target));
                const opacity = isHighlighted ? 0.6 : 0.1;
                const strokeWidth = Math.max(1, Math.min(5, edge.weight / 20));

                return (
                  <line
                    key={`edge-${i}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={isHighlighted ? '#3B82F6' : '#9CA3AF'}
                    strokeWidth={strokeWidth}
                    opacity={opacity}
                  />
                );
              })}

              {/* Nodes */}
              {layoutNodes.map((node) => {
                const isSelected = selectedNode === node.id;
                const isHighlighted = connectedNodes.size === 0 || connectedNodes.has(node.id);
                const nodeRadius = 8 + Math.sqrt(node.degree) * 2;
                const opacity = isHighlighted ? 1 : 0.3;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ cursor: 'pointer', opacity }}
                    onClick={() => onNodeSelect?.(isSelected ? null : node.id)}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <circle
                      r={nodeRadius}
                      fill={getNodeColor(node)}
                      stroke={isSelected ? '#1D4ED8' : '#fff'}
                      strokeWidth={isSelected ? 3 : 1.5}
                    />
                    {showLabels && zoom > 0.6 && (
                      <text
                        y={nodeRadius + 12}
                        textAnchor="middle"
                        className="text-xs fill-gray-700 pointer-events-none"
                        style={{ fontSize: '10px' }}
                      >
                        {(node.displayName || node.email.split('@')[0]).slice(0, 15)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-500"></div>
              <span>Node size = connections</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-1 bg-blue-400"></div>
              <span>Edge width = communication volume</span>
            </div>
          </div>
          <span className="text-xs">Scroll to zoom, drag to pan</span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Simple force-directed layout simulation
 */
function runForceSimulation(
  nodes: LayoutNode[],
  edges: NetworkEdge[],
  width: number,
  height: number,
  iterations: number = 100
): LayoutNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const centerX = width / 2;
  const centerY = height / 2;

  // Build adjacency for attraction
  const adjacency = new Map<string, Set<string>>();
  edges.forEach((e) => {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
    adjacency.get(e.source)!.add(e.target);
    adjacency.get(e.target)!.add(e.source);
  });

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 5000 / (dist * dist);

        const fx = (dx / dist) * force * cooling;
        const fy = (dy / dist) * force * cooling;

        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Attraction along edges
    edges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * 0.01 * cooling;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    });

    // Center gravity
    nodes.forEach((node) => {
      node.vx += (centerX - node.x) * 0.001 * cooling;
      node.vy += (centerY - node.y) * 0.001 * cooling;
    });

    // Apply velocities with damping
    nodes.forEach((node) => {
      node.x += node.vx * 0.5;
      node.y += node.vy * 0.5;
      node.vx *= 0.8;
      node.vy *= 0.8;

      // Keep in bounds
      node.x = Math.max(50, Math.min(width - 50, node.x));
      node.y = Math.max(50, Math.min(height - 50, node.y));
    });
  }

  return nodes;
}

export default NetworkVisualization;
