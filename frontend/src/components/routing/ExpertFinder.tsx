/**
 * Expert Finder Component
 * T059 - Create expert finder interface
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  findExperts,
  checkHandlerAvailability,
  checkHandlerWorkload,
  type ExpertMatch,
  type AvailabilityResult,
  type WorkloadCapacity,
} from '../../services/routingApi';

interface ExpertWithDetails extends ExpertMatch {
  availability?: AvailabilityResult;
  workload?: WorkloadCapacity;
}

export function ExpertFinder() {
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [experts, setExperts] = useState<ExpertWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExpert, setSelectedExpert] = useState<ExpertWithDetails | null>(null);
  const [options, setOptions] = useState({
    mustBeAvailable: true,
    limit: 10,
  });

  function addCategory() {
    const cat = newCategory.trim().toLowerCase();
    if (cat && !categories.includes(cat)) {
      setCategories([...categories, cat]);
      setNewCategory('');
    }
  }

  function removeCategory(cat: string) {
    setCategories(categories.filter((c) => c !== cat));
  }

  async function handleSearch() {
    if (categories.length === 0) {
      setError('Please add at least one category');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSelectedExpert(null);

      const { experts: results } = await findExperts(categories, options);
      setExperts(results);

      if (results.length === 0) {
        setError('No experts found for the selected categories');
      }
    } catch (err) {
      setError('Failed to find experts');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadExpertDetails(expert: ExpertMatch) {
    try {
      const [availability, workload] = await Promise.all([
        checkHandlerAvailability(expert.personId),
        checkHandlerWorkload(expert.personId),
      ]);

      const enrichedExpert: ExpertWithDetails = {
        ...expert,
        availability,
        workload,
      };

      setSelectedExpert(enrichedExpert);

      // Update in list too
      setExperts((prev) =>
        prev.map((e) => (e.personId === expert.personId ? enrichedExpert : e))
      );
    } catch (err) {
      console.error('Failed to load expert details:', err);
    }
  }

  function getAvailabilityColor(status: string): string {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'busy':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_meeting':
        return 'bg-orange-100 text-orange-800';
      case 'out_of_office':
      case 'offline':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getWorkloadColor(score: number): string {
    if (score >= 0.7) return 'text-green-600';
    if (score >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  }

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle>Find Experts by Category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Enter category (e.g., invoice, sales, support)"
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            />
            <Button onClick={addCategory}>Add</Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant="outline"
                className="cursor-pointer hover:bg-red-50"
                onClick={() => removeCategory(cat)}
              >
                {cat} ×
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.mustBeAvailable}
                onChange={(e) =>
                  setOptions({ ...options, mustBeAvailable: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-sm">Only available experts</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-sm">Limit:</span>
              <select
                value={options.limit}
                onChange={(e) =>
                  setOptions({ ...options, limit: parseInt(e.target.value) })
                }
                className="p-1 border rounded text-sm"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </div>
          </div>

          <Button
            onClick={handleSearch}
            disabled={loading || categories.length === 0}
            className="w-full"
          >
            {loading ? 'Searching...' : 'Find Experts'}
          </Button>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {experts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Expert List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Found Experts ({experts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {experts.map((expert) => (
                  <div
                    key={expert.personId}
                    onClick={() => loadExpertDetails(expert)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedExpert?.personId === expert.personId
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{expert.personName}</span>
                      <Badge>
                        {(expert.expertiseScore * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {expert.matchedSkills.length} matching skills
                    </div>
                    {expert.availability && (
                      <Badge
                        className={`mt-1 ${getAvailabilityColor(
                          expert.availability.status
                        )}`}
                      >
                        {expert.availability.status.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Expert Details */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {selectedExpert ? selectedExpert.personName : 'Expert Details'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedExpert ? (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-500">Name</span>
                      <p className="font-medium">{selectedExpert.personName}</p>
                    </div>
                    {selectedExpert.email && (
                      <div>
                        <span className="text-sm text-gray-500">Email</span>
                        <p className="font-medium">{selectedExpert.email}</p>
                      </div>
                    )}
                  </div>

                  {/* Expertise Score */}
                  <div>
                    <span className="text-sm text-gray-500">Expertise Score</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{
                            width: `${selectedExpert.expertiseScore * 100}%`,
                          }}
                        />
                      </div>
                      <span className="font-medium">
                        {(selectedExpert.expertiseScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Matched Skills */}
                  <div>
                    <span className="text-sm text-gray-500">Matched Skills</span>
                    <div className="mt-2 space-y-2">
                      {selectedExpert.matchedSkills.map((skill) => (
                        <div
                          key={skill.skillName}
                          className="flex items-center justify-between bg-gray-50 p-2 rounded"
                        >
                          <span>{skill.skillName}</span>
                          <div className="flex gap-2 text-sm">
                            <Badge variant="outline">
                              Level {skill.level}/5
                            </Badge>
                            <Badge variant="outline">
                              {(skill.confidence * 100).toFixed(0)}% conf
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Availability */}
                  {selectedExpert.availability && (
                    <div>
                      <span className="text-sm text-gray-500">Availability</span>
                      <div className="mt-2 bg-gray-50 p-3 rounded space-y-2">
                        <div className="flex justify-between">
                          <span>Status</span>
                          <Badge
                            className={getAvailabilityColor(
                              selectedExpert.availability.status
                            )}
                          >
                            {selectedExpert.availability.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Score</span>
                          <span>
                            {(selectedExpert.availability.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        {selectedExpert.availability.nextAvailable && (
                          <div className="flex justify-between">
                            <span>Next Available</span>
                            <span>
                              {new Date(
                                selectedExpert.availability.nextAvailable
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {selectedExpert.availability.reason && (
                          <div className="text-sm text-gray-500 italic">
                            {selectedExpert.availability.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Workload */}
                  {selectedExpert.workload && (
                    <div>
                      <span className="text-sm text-gray-500">Workload</span>
                      <div className="mt-2 bg-gray-50 p-3 rounded space-y-2">
                        <div className="flex justify-between">
                          <span>Has Capacity</span>
                          <Badge
                            variant={
                              selectedExpert.workload.hasCapacity
                                ? 'default'
                                : 'destructive'
                            }
                          >
                            {selectedExpert.workload.hasCapacity ? 'Yes' : 'No'}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Current Workload</span>
                          <span
                            className={getWorkloadColor(
                              1 - selectedExpert.workload.currentWorkload / 100
                            )}
                          >
                            {selectedExpert.workload.currentWorkload}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Active Tasks</span>
                          <span>{selectedExpert.workload.activeTaskCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Burnout Risk</span>
                          <span
                            className={
                              selectedExpert.workload.burnoutRisk > 70
                                ? 'text-red-600'
                                : selectedExpert.workload.burnoutRisk > 50
                                ? 'text-yellow-600'
                                : 'text-green-600'
                            }
                          >
                            {selectedExpert.workload.burnoutRisk}%
                          </span>
                        </div>
                        {selectedExpert.workload.reason && (
                          <div className="text-sm text-gray-500 italic">
                            {selectedExpert.workload.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    <Button className="flex-1">Assign to This Expert</Button>
                    <Button variant="outline">View Full Profile</Button>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  Click on an expert to view details
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default ExpertFinder;
