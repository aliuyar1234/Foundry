/**
 * Community View Component
 * Visualizes detected communities and their members
 * T246 - Community visualization
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export interface CommunityMember {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  internalConnections: number;
  externalConnections: number;
  communityRole: 'hub' | 'bridge' | 'peripheral' | 'member';
}

export interface Community {
  id: string;
  name?: string;
  members: CommunityMember[];
  size: number;
  density: number;
  avgCommunications: number;
  departments: Array<{ name: string; count: number }>;
  keyMembers: string[];
}

interface CommunityViewProps {
  communities: Community[];
  modularity?: number;
  onMemberSelect?: (email: string) => void;
  selectedMember?: string;
}

const ROLE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  hub: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Hub' },
  bridge: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Bridge' },
  peripheral: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Peripheral' },
  member: { bg: 'bg-green-100', text: 'text-green-800', label: 'Member' },
};

const COMMUNITY_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export function CommunityView({
  communities,
  modularity,
  onMemberSelect,
  selectedMember,
}: CommunityViewProps) {
  const [expandedCommunity, setExpandedCommunity] = useState<string | null>(
    communities[0]?.id || null
  );
  const [viewMode, setViewMode] = useState<'list' | 'bubble'>('list');

  // Calculate stats
  const stats = useMemo(() => {
    const totalMembers = communities.reduce((sum, c) => sum + c.size, 0);
    const avgSize = totalMembers / communities.length || 0;
    const largestCommunity = Math.max(...communities.map((c) => c.size), 0);
    const avgDensity = communities.reduce((sum, c) => sum + c.density, 0) / communities.length || 0;

    return { totalMembers, avgSize, largestCommunity, avgDensity };
  }, [communities]);

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-blue-600">{communities.length}</p>
            <p className="text-sm text-gray-500">Communities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-green-600">{stats.totalMembers}</p>
            <p className="text-sm text-gray-500">Total Members</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-purple-600">
              {stats.avgSize.toFixed(1)}
            </p>
            <p className="text-sm text-gray-500">Avg Community Size</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-orange-600">
              {modularity ? (modularity * 100).toFixed(0) : '--'}%
            </p>
            <p className="text-sm text-gray-500">Modularity</p>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle */}
      <div className="flex justify-end gap-2">
        <Button
          variant={viewMode === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('list')}
        >
          List View
        </Button>
        <Button
          variant={viewMode === 'bubble' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('bubble')}
        >
          Bubble View
        </Button>
      </div>

      {viewMode === 'bubble' ? (
        /* Bubble Visualization */
        <Card>
          <CardHeader>
            <CardTitle>Community Clusters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg bg-gray-50 p-4 min-h-[400px] flex flex-wrap items-center justify-center gap-4">
              {communities.map((community, index) => {
                const size = Math.sqrt(community.size) * 20 + 40;
                const color = COMMUNITY_COLORS[index % COMMUNITY_COLORS.length];

                return (
                  <div
                    key={community.id}
                    className="flex flex-col items-center cursor-pointer transition-transform hover:scale-105"
                    onClick={() => setExpandedCommunity(
                      expandedCommunity === community.id ? null : community.id
                    )}
                  >
                    <div
                      className="rounded-full flex items-center justify-center text-white font-bold shadow-lg"
                      style={{
                        width: size,
                        height: size,
                        backgroundColor: color,
                        opacity: expandedCommunity === community.id ? 1 : 0.7,
                      }}
                    >
                      {community.size}
                    </div>
                    <p className="text-xs text-gray-600 mt-2 text-center max-w-[100px] truncate">
                      {community.name || `Community ${community.id}`}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* List View */
        <div className="space-y-4">
          {communities.map((community, index) => {
            const isExpanded = expandedCommunity === community.id;
            const color = COMMUNITY_COLORS[index % COMMUNITY_COLORS.length];

            return (
              <Card key={community.id}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => setExpandedCommunity(isExpanded ? null : community.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <CardTitle className="text-lg">
                        {community.name || `Community ${parseInt(community.id) + 1}`}
                      </CardTitle>
                      <Badge variant="secondary">{community.size} members</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Density: {(community.density * 100).toFixed(0)}%</span>
                      <span>Avg Comms: {community.avgCommunications.toFixed(0)}</span>
                      <Button variant="ghost" size="sm">
                        {isExpanded ? '▼' : '▶'}
                      </Button>
                    </div>
                  </div>

                  {/* Department breakdown */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {community.departments.slice(0, 5).map((dept) => (
                      <Badge key={dept.name} variant="outline" className="text-xs">
                        {dept.name}: {dept.count}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    {/* Key Members */}
                    {community.keyMembers.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Key Members:</p>
                        <div className="flex flex-wrap gap-2">
                          {community.keyMembers.map((email) => {
                            const member = community.members.find((m) => m.email === email);
                            return (
                              <Badge
                                key={email}
                                className="bg-yellow-100 text-yellow-800 cursor-pointer hover:bg-yellow-200"
                                onClick={() => onMemberSelect?.(email)}
                              >
                                ★ {member?.displayName || email.split('@')[0]}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* All Members */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {community.members.map((member) => {
                        const roleConfig = ROLE_COLORS[member.communityRole];
                        const isSelected = selectedMember === member.email;

                        return (
                          <div
                            key={member.email}
                            className={`p-3 rounded-lg cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-100 border-blue-400 border-2'
                                : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                            }`}
                            onClick={() => onMemberSelect?.(member.email)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-medium text-sm truncate">
                                {member.displayName || member.email.split('@')[0]}
                              </p>
                              <Badge className={`${roleConfig.bg} ${roleConfig.text} text-xs`}>
                                {roleConfig.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{member.email}</p>
                            {member.department && (
                              <p className="text-xs text-gray-400 truncate">{member.department}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                              <span>Int: {member.internalConnections}</span>
                              <span>Ext: {member.externalConnections}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Role Legend */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Member Roles:</p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(ROLE_COLORS).map(([role, config]) => (
              <div key={role} className="flex items-center gap-2">
                <Badge className={`${config.bg} ${config.text}`}>{config.label}</Badge>
                <span className="text-xs text-gray-500">
                  {role === 'hub' && '- High internal connections'}
                  {role === 'bridge' && '- Connects to other communities'}
                  {role === 'peripheral' && '- Few connections'}
                  {role === 'member' && '- Regular member'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CommunityView;
