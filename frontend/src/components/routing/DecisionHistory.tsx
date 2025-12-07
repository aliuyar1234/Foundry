/**
 * Decision History Component
 * T060 - Create decision history viewer
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  getDecisions,
  getDecision,
  submitDecisionFeedback,
  type RoutingDecision,
} from '../../services/routingApi';

interface DecisionWithDetails extends RoutingDecision {
  // Extended details when fetched individually
}

interface DecisionHistoryProps {
  handlerId?: string;
  limit?: number;
}

export function DecisionHistory({ handlerId, limit = 50 }: DecisionHistoryProps) {
  const [decisions, setDecisions] = useState<RoutingDecision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<DecisionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    startTime: '',
    endTime: '',
    minConfidence: '',
    wasEscalated: '',
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackData, setFeedbackData] = useState({
    wasSuccessful: true,
    feedbackScore: 5,
    feedbackText: '',
  });

  useEffect(() => {
    loadDecisions();
  }, [handlerId]);

  async function loadDecisions() {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { limit };

      if (handlerId) params.handlerId = handlerId;
      if (filters.startTime) params.startTime = filters.startTime;
      if (filters.endTime) params.endTime = filters.endTime;
      if (filters.minConfidence) params.minConfidence = parseFloat(filters.minConfidence);
      if (filters.wasEscalated) params.wasEscalated = filters.wasEscalated === 'true';

      const { decisions } = await getDecisions(params as Record<string, string>);
      setDecisions(decisions);
      setError(null);
    } catch (err) {
      setError('Failed to load decisions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectDecision(decision: RoutingDecision) {
    try {
      const details = await getDecision(decision.id);
      setSelectedDecision(details);
    } catch (err) {
      console.error('Failed to load decision details:', err);
      setSelectedDecision(decision);
    }
  }

  async function handleSubmitFeedback() {
    if (!selectedDecision) return;

    try {
      await submitDecisionFeedback(selectedDecision.id, feedbackData);
      setFeedbackOpen(false);
      loadDecisions();
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  if (loading && decisions.length === 0) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-200 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Decisions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Time</label>
              <input
                type="datetime-local"
                value={filters.startTime}
                onChange={(e) =>
                  setFilters({ ...filters, startTime: e.target.value })
                }
                className="w-full p-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Time</label>
              <input
                type="datetime-local"
                value={filters.endTime}
                onChange={(e) =>
                  setFilters({ ...filters, endTime: e.target.value })
                }
                className="w-full p-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Min Confidence
              </label>
              <select
                value={filters.minConfidence}
                onChange={(e) =>
                  setFilters({ ...filters, minConfidence: e.target.value })
                }
                className="w-full p-2 border rounded-md text-sm"
              >
                <option value="">Any</option>
                <option value="0.9">90%+</option>
                <option value="0.8">80%+</option>
                <option value="0.6">60%+</option>
                <option value="0.4">40%+</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Escalated</label>
              <select
                value={filters.wasEscalated}
                onChange={(e) =>
                  setFilters({ ...filters, wasEscalated: e.target.value })
                }
                className="w-full p-2 border rounded-md text-sm"
              >
                <option value="">Any</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
          <Button onClick={loadDecisions} className="mt-4">
            Apply Filters
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Decisions List and Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Decisions List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Decisions ({decisions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {decisions.map((decision) => (
                <div
                  key={decision.id}
                  onClick={() => handleSelectDecision(decision)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedDecision?.id === decision.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate max-w-[150px]">
                      {decision.requestType}
                    </span>
                    <Badge className={getConfidenceColor(decision.confidence)}>
                      {(decision.confidence * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatDate(decision.createdAt)}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {decision.wasEscalated && (
                      <Badge variant="destructive" className="text-xs">
                        Escalated
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {decision.selectedHandlerType}
                    </Badge>
                  </div>
                </div>
              ))}
              {decisions.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No decisions found
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Decision Detail */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Decision Details</CardTitle>
            {selectedDecision && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFeedbackOpen(true)}
              >
                Submit Feedback
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {selectedDecision ? (
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-500">Decision ID</span>
                    <p className="font-mono text-sm">{selectedDecision.id}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Created At</span>
                    <p>{formatDate(selectedDecision.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Request Type</span>
                    <p className="font-medium">{selectedDecision.requestType}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Confidence</span>
                    <Badge className={getConfidenceColor(selectedDecision.confidence)}>
                      {(selectedDecision.confidence * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>

                {/* Categories */}
                <div>
                  <span className="text-sm text-gray-500">Categories</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedDecision.requestCategories.map((cat) => (
                      <Badge key={cat} variant="outline">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Handler */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Selected Handler</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-500">Handler ID</span>
                      <p className="font-mono text-sm">
                        {selectedDecision.selectedHandlerId}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">Handler Type</span>
                      <Badge>{selectedDecision.selectedHandlerType}</Badge>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="flex gap-4">
                  {selectedDecision.wasEscalated && (
                    <div className="flex items-center gap-2 text-orange-600">
                      <span>⚠</span>
                      <span>This decision was escalated</span>
                    </div>
                  )}
                  {selectedDecision.matchedRuleId && (
                    <div className="text-sm text-gray-500">
                      Matched Rule: {selectedDecision.matchedRuleId}
                    </div>
                  )}
                </div>

                {/* Feedback Modal */}
                {feedbackOpen && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-md">
                      <CardHeader>
                        <CardTitle>Submit Feedback</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Was this routing successful?
                          </label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                checked={feedbackData.wasSuccessful}
                                onChange={() =>
                                  setFeedbackData({
                                    ...feedbackData,
                                    wasSuccessful: true,
                                  })
                                }
                              />
                              <span>Yes</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                checked={!feedbackData.wasSuccessful}
                                onChange={() =>
                                  setFeedbackData({
                                    ...feedbackData,
                                    wasSuccessful: false,
                                  })
                                }
                              />
                              <span>No</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Rating (1-5)
                          </label>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((score) => (
                              <button
                                key={score}
                                onClick={() =>
                                  setFeedbackData({
                                    ...feedbackData,
                                    feedbackScore: score,
                                  })
                                }
                                className={`w-10 h-10 rounded-full border ${
                                  feedbackData.feedbackScore === score
                                    ? 'bg-blue-500 text-white border-blue-500'
                                    : 'border-gray-300 hover:border-blue-300'
                                }`}
                              >
                                {score}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Comments (optional)
                          </label>
                          <textarea
                            value={feedbackData.feedbackText}
                            onChange={(e) =>
                              setFeedbackData({
                                ...feedbackData,
                                feedbackText: e.target.value,
                              })
                            }
                            className="w-full p-2 border rounded-md"
                            rows={3}
                            placeholder="Any additional feedback..."
                          />
                        </div>

                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            onClick={() => setFeedbackOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button onClick={handleSubmitFeedback}>
                            Submit
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                Select a decision to view details
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default DecisionHistory;
