/**
 * Process Flow Visualization Component
 * Visual representation of discovered process flows
 */

import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { useProcess, useProcessFlow, ProcessStep } from '../../hooks/useDiscovery';

interface Node {
  id: string;
  label: string;
  type: 'start' | 'end' | 'step';
  frequency: number;
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
  frequency: number;
}

export function ProcessFlowVisualization() {
  const { processId } = useParams<{ processId: string }>();
  const { data: process, isLoading: processLoading } = useProcess(processId!);
  const { data: flow, isLoading: flowLoading } = useProcessFlow(processId!);

  const isLoading = processLoading || flowLoading;

  // Calculate layout positions
  const { nodes, edges } = useMemo(() => {
    if (!flow) return { nodes: [], edges: [] };

    const nodeMap = new Map<string, Node>();
    const stepsByOrder = [...flow.steps].sort((a, b) => a.order - b.order);

    // Calculate positions in a horizontal flow
    const nodeWidth = 150;
    const nodeHeight = 60;
    const horizontalGap = 80;
    const verticalGap = 40;

    // Group steps by order to handle parallel paths
    const orderGroups = new Map<number, ProcessStep[]>();
    for (const step of stepsByOrder) {
      const group = orderGroups.get(step.order) || [];
      group.push(step);
      orderGroups.set(step.order, group);
    }

    // Calculate positions
    let x = 100;
    for (const [order, steps] of Array.from(orderGroups.entries()).sort((a, b) => a[0] - b[0])) {
      const totalHeight = steps.length * (nodeHeight + verticalGap) - verticalGap;
      let y = 200 - totalHeight / 2;

      for (const step of steps) {
        nodeMap.set(step.id, {
          id: step.id,
          label: step.name,
          type: step.isStartStep ? 'start' : step.isEndStep ? 'end' : 'step',
          frequency: step.frequency,
          x,
          y,
        });
        y += nodeHeight + verticalGap;
      }
      x += nodeWidth + horizontalGap;
    }

    const nodes = Array.from(nodeMap.values());
    const edges: Edge[] = flow.transitions.map((t) => ({
      from: t.from,
      to: t.to,
      frequency: t.frequency,
    }));

    return { nodes, edges };
  }, [flow]);

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-8 w-64 bg-gray-200 rounded"></div>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-gray-100 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  if (!process || !flow) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600">Process not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{process.name}</CardTitle>
            <Badge
              className={
                process.status === 'discovered'
                  ? 'bg-blue-100 text-blue-800'
                  : process.status === 'validated'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-purple-100 text-purple-800'
              }
            >
              {process.status}
            </Badge>
          </div>
          {process.description && (
            <p className="text-sm text-gray-500">{process.description}</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{flow.steps.length}</p>
              <p className="text-sm text-gray-500">Steps</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {process.frequency.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">Occurrences</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {Math.round(process.confidence * 100)}%
              </p>
              <p className="text-sm text-gray-500">Confidence</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {flow.transitions.length}
              </p>
              <p className="text-sm text-gray-500">Transitions</p>
            </div>
          </div>

          {/* SVG Process Flow Diagram */}
          <div className="border rounded-lg bg-gray-50 overflow-auto">
            <svg
              width="100%"
              height="400"
              viewBox={`0 0 ${Math.max(800, nodes.length * 230 + 100)} 400`}
              className="min-w-full"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280" />
                </marker>
              </defs>

              {/* Draw edges */}
              {edges.map((edge, index) => {
                const fromNode = nodes.find((n) => n.id === edge.from);
                const toNode = nodes.find((n) => n.id === edge.to);
                if (!fromNode || !toNode) return null;

                const x1 = fromNode.x + 150;
                const y1 = fromNode.y + 30;
                const x2 = toNode.x;
                const y2 = toNode.y + 30;

                // Calculate control points for curved path
                const midX = (x1 + x2) / 2;

                return (
                  <g key={`edge-${index}`}>
                    <path
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="#9CA3AF"
                      strokeWidth={Math.max(1, Math.min(4, edge.frequency / 100))}
                      markerEnd="url(#arrowhead)"
                    />
                    <text
                      x={midX}
                      y={(y1 + y2) / 2 - 10}
                      textAnchor="middle"
                      className="text-xs fill-gray-500"
                    >
                      {edge.frequency}
                    </text>
                  </g>
                );
              })}

              {/* Draw nodes */}
              {nodes.map((node) => (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <rect
                    width="150"
                    height="60"
                    rx="8"
                    fill={
                      node.type === 'start'
                        ? '#DCFCE7'
                        : node.type === 'end'
                        ? '#FEE2E2'
                        : '#F3F4F6'
                    }
                    stroke={
                      node.type === 'start'
                        ? '#22C55E'
                        : node.type === 'end'
                        ? '#EF4444'
                        : '#9CA3AF'
                    }
                    strokeWidth="2"
                  />
                  <text
                    x="75"
                    y="25"
                    textAnchor="middle"
                    className="text-sm font-medium fill-gray-800"
                  >
                    {node.label.length > 18
                      ? `${node.label.substring(0, 18)}...`
                      : node.label}
                  </text>
                  <text
                    x="75"
                    y="45"
                    textAnchor="middle"
                    className="text-xs fill-gray-500"
                  >
                    {node.frequency.toLocaleString()} occurrences
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Steps Table */}
      <Card>
        <CardHeader>
          <CardTitle>Process Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Order</th>
                  <th className="text-left py-2 px-3">Step Name</th>
                  <th className="text-left py-2 px-3">Activity</th>
                  <th className="text-right py-2 px-3">Frequency</th>
                  <th className="text-center py-2 px-3">Type</th>
                </tr>
              </thead>
              <tbody>
                {flow.steps
                  .sort((a, b) => a.order - b.order)
                  .map((step) => (
                    <tr key={step.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">{step.order + 1}</td>
                      <td className="py-2 px-3 font-medium">{step.name}</td>
                      <td className="py-2 px-3 text-gray-500">{step.activity}</td>
                      <td className="py-2 px-3 text-right">
                        {step.frequency.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {step.isStartStep && (
                          <Badge className="bg-green-100 text-green-800">Start</Badge>
                        )}
                        {step.isEndStep && (
                          <Badge className="bg-red-100 text-red-800">End</Badge>
                        )}
                        {!step.isStartStep && !step.isEndStep && (
                          <Badge className="bg-gray-100 text-gray-800">Step</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ProcessFlowVisualization;
