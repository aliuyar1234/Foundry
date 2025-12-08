/**
 * Availability View Component
 * T231 - Team availability visualization and scheduling
 *
 * Shows current team availability and helps find meeting times
 */

import React, { useState, useEffect } from 'react';

// Types
export interface PersonAvailability {
  personId: string;
  personName: string;
  currentStatus: AvailabilityStatus;
  statusSince: string;
  statusUntil?: string;
  timezone: string;
  todaySchedule: ScheduleBlock[];
  nextAvailable?: string;
  customStatus?: string;
}

export type AvailabilityStatus =
  | 'available'
  | 'busy'
  | 'in_meeting'
  | 'focusing'
  | 'away'
  | 'out_of_office'
  | 'offline';

export interface ScheduleBlock {
  start: string;
  end: string;
  type: 'meeting' | 'focus' | 'available' | 'break' | 'out';
  title?: string;
  attendees?: number;
}

export interface TeamAvailability {
  teamId: string;
  asOf: string;
  members: PersonAvailability[];
  summary: {
    available: number;
    busy: number;
    inMeeting: number;
    focusing: number;
    away: number;
    outOfOffice: number;
    offline: number;
  };
  commonAvailability: CommonSlot[];
}

export interface CommonSlot {
  start: string;
  end: string;
  duration: number;
  availableMembers: string[];
  allAvailable: boolean;
}

interface AvailabilityViewProps {
  teamId: string;
  onScheduleMeeting?: (slot: CommonSlot) => void;
  onMemberClick?: (personId: string) => void;
}

const STATUS_COLORS: Record<AvailabilityStatus, string> = {
  available: '#22c55e',
  busy: '#ef4444',
  in_meeting: '#f59e0b',
  focusing: '#6366f1',
  away: '#94a3b8',
  out_of_office: '#64748b',
  offline: '#374151',
};

const STATUS_ICONS: Record<AvailabilityStatus, string> = {
  available: '🟢',
  busy: '🔴',
  in_meeting: '📅',
  focusing: '🎯',
  away: '🟡',
  out_of_office: '🏠',
  offline: '⚫',
};

export function AvailabilityView({
  teamId,
  onScheduleMeeting,
  onMemberClick,
}: AvailabilityViewProps) {
  const [availability, setAvailability] = useState<TeamAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline' | 'list'>('grid');
  const [showScheduler, setShowScheduler] = useState(false);

  useEffect(() => {
    async function fetchAvailability() {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/workload/team/${teamId}/availability?includeSchedules=true&futureHours=8`
        );
        if (!response.ok) throw new Error('Failed to fetch availability');
        const data = await response.json();
        setAvailability(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchAvailability();
    // Poll every minute
    const interval = setInterval(fetchAvailability, 60000);
    return () => clearInterval(interval);
  }, [teamId]);

  if (loading) {
    return (
      <div className="availability-view loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !availability) {
    return (
      <div className="availability-view error">
        <p>{error || 'Unable to load availability'}</p>
      </div>
    );
  }

  return (
    <div className="availability-view">
      {/* Header */}
      <div className="view-header">
        <div className="header-info">
          <h3>Team Availability</h3>
          <span className="as-of">
            Updated {new Date(availability.asOf).toLocaleTimeString()}
          </span>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            {(['grid', 'timeline', 'list'] as const).map((mode) => (
              <button
                key={mode}
                className={`toggle-btn ${viewMode === mode ? 'active' : ''}`}
                onClick={() => setViewMode(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowScheduler(true)}
          >
            Find Meeting Time
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="availability-summary">
        {Object.entries(availability.summary).map(([status, count]) => (
          <div key={status} className={`summary-item ${status.replace('_', '-')}`}>
            <span className="status-icon">
              {STATUS_ICONS[status as AvailabilityStatus] || '❓'}
            </span>
            <span className="count">{count}</span>
            <span className="label">{formatStatus(status)}</span>
          </div>
        ))}
      </div>

      {/* View Content */}
      <div className="view-content">
        {viewMode === 'grid' && (
          <GridView
            members={availability.members}
            onMemberClick={onMemberClick}
          />
        )}
        {viewMode === 'timeline' && (
          <TimelineView
            members={availability.members}
            onMemberClick={onMemberClick}
          />
        )}
        {viewMode === 'list' && (
          <ListView
            members={availability.members}
            onMemberClick={onMemberClick}
          />
        )}
      </div>

      {/* Common Availability */}
      {availability.commonAvailability.length > 0 && (
        <div className="common-availability">
          <h4>Common Free Slots (Next 8 Hours)</h4>
          <div className="slots-list">
            {availability.commonAvailability.slice(0, 5).map((slot, i) => (
              <div
                key={i}
                className={`slot-item ${slot.allAvailable ? 'all-available' : ''}`}
                onClick={() => onScheduleMeeting?.(slot)}
              >
                <div className="slot-time">
                  <span className="start">
                    {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="separator">-</span>
                  <span className="end">
                    {new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="duration">{slot.duration} min</span>
                <span className={`available-count ${slot.allAvailable ? 'all' : ''}`}>
                  {slot.allAvailable
                    ? '✓ All available'
                    : `${slot.availableMembers.length} available`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meeting Scheduler Modal */}
      {showScheduler && (
        <MeetingScheduler
          teamId={teamId}
          members={availability.members}
          onClose={() => setShowScheduler(false)}
          onSchedule={(slot) => {
            onScheduleMeeting?.(slot);
            setShowScheduler(false);
          }}
        />
      )}
    </div>
  );
}

// Grid View
interface GridViewProps {
  members: PersonAvailability[];
  onMemberClick?: (personId: string) => void;
}

function GridView({ members, onMemberClick }: GridViewProps) {
  return (
    <div className="grid-view">
      {members.map((member) => (
        <div
          key={member.personId}
          className={`member-card ${member.currentStatus.replace('_', '-')}`}
          onClick={() => onMemberClick?.(member.personId)}
        >
          <div className="card-header">
            <div className="avatar">
              <span>{member.personName.charAt(0)}</span>
              <span
                className="status-dot"
                style={{ backgroundColor: STATUS_COLORS[member.currentStatus] }}
              />
            </div>
            <div className="member-info">
              <span className="name">{member.personName}</span>
              <span className="status">{formatStatus(member.currentStatus)}</span>
            </div>
          </div>

          {member.customStatus && (
            <p className="custom-status">{member.customStatus}</p>
          )}

          {member.statusUntil && (
            <div className="status-until">
              Until {new Date(member.statusUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {member.nextAvailable && member.currentStatus !== 'available' && (
            <div className="next-available">
              Next free: {new Date(member.nextAvailable).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {/* Mini Schedule */}
          <div className="mini-schedule">
            {member.todaySchedule.slice(0, 3).map((block, i) => (
              <div key={i} className={`schedule-block ${block.type}`}>
                <span className="time">
                  {new Date(block.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="title">{block.title || block.type}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Timeline View
interface TimelineViewProps {
  members: PersonAvailability[];
  onMemberClick?: (personId: string) => void;
}

function TimelineView({ members, onMemberClick }: TimelineViewProps) {
  // Calculate time range (8 hours from now)
  const now = new Date();
  const startHour = now.getHours();
  const hours = Array.from({ length: 9 }, (_, i) => (startHour + i) % 24);

  return (
    <div className="timeline-view">
      {/* Time Header */}
      <div className="timeline-header">
        <div className="member-col" />
        {hours.map((hour) => (
          <div key={hour} className="hour-col">
            {hour}:00
          </div>
        ))}
      </div>

      {/* Member Rows */}
      {members.map((member) => (
        <div
          key={member.personId}
          className="timeline-row"
          onClick={() => onMemberClick?.(member.personId)}
        >
          <div className="member-col">
            <span className="name">{member.personName}</span>
            <span
              className="status-dot"
              style={{ backgroundColor: STATUS_COLORS[member.currentStatus] }}
            />
          </div>
          <div className="schedule-col">
            {member.todaySchedule.map((block, i) => {
              const blockStart = new Date(block.start);
              const blockEnd = new Date(block.end);
              const startOffset = ((blockStart.getHours() - startHour) * 60 + blockStart.getMinutes()) / (9 * 60) * 100;
              const width = ((blockEnd.getTime() - blockStart.getTime()) / (9 * 60 * 60 * 1000)) * 100;

              if (startOffset < 0 || startOffset > 100) return null;

              return (
                <div
                  key={i}
                  className={`timeline-block ${block.type}`}
                  style={{
                    left: `${Math.max(0, startOffset)}%`,
                    width: `${Math.min(100 - startOffset, width)}%`,
                  }}
                  title={`${block.title || block.type}: ${blockStart.toLocaleTimeString()} - ${blockEnd.toLocaleTimeString()}`}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Current Time Indicator */}
      <div
        className="current-time-indicator"
        style={{
          left: `calc(${(now.getMinutes() / (9 * 60)) * 100}% + 100px)`,
        }}
      />
    </div>
  );
}

// List View
interface ListViewProps {
  members: PersonAvailability[];
  onMemberClick?: (personId: string) => void;
}

function ListView({ members, onMemberClick }: ListViewProps) {
  // Group by status
  const grouped = members.reduce((acc, member) => {
    const status = member.currentStatus;
    if (!acc[status]) acc[status] = [];
    acc[status].push(member);
    return acc;
  }, {} as Record<string, PersonAvailability[]>);

  const statusOrder: AvailabilityStatus[] = [
    'available',
    'focusing',
    'in_meeting',
    'busy',
    'away',
    'out_of_office',
    'offline',
  ];

  return (
    <div className="list-view">
      {statusOrder.map((status) => {
        const group = grouped[status];
        if (!group || group.length === 0) return null;

        return (
          <div key={status} className="status-group">
            <div className="group-header">
              <span className="status-icon">{STATUS_ICONS[status]}</span>
              <span className="status-name">{formatStatus(status)}</span>
              <span className="count">({group.length})</span>
            </div>
            <div className="group-members">
              {group.map((member) => (
                <div
                  key={member.personId}
                  className="member-item"
                  onClick={() => onMemberClick?.(member.personId)}
                >
                  <span className="name">{member.personName}</span>
                  {member.customStatus && (
                    <span className="custom">{member.customStatus}</span>
                  )}
                  {member.nextAvailable && status !== 'available' && (
                    <span className="next-free">
                      Free at {new Date(member.nextAvailable).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Meeting Scheduler Modal
interface MeetingSchedulerProps {
  teamId: string;
  members: PersonAvailability[];
  onClose: () => void;
  onSchedule: (slot: CommonSlot) => void;
}

function MeetingScheduler({
  teamId,
  members,
  onClose,
  onSchedule,
}: MeetingSchedulerProps) {
  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    members.map((m) => m.personId)
  );
  const [duration, setDuration] = useState(30);
  const [withinDays, setWithinDays] = useState(7);
  const [suggestions, setSuggestions] = useState<CommonSlot[]>([]);
  const [loading, setLoading] = useState(false);

  const findSlots = async () => {
    if (selectedMembers.length < 2) return;

    setLoading(true);
    try {
      const response = await fetch('/api/workload/scheduling/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeIds: selectedMembers,
          duration,
          withinDays,
          maxSuggestions: 10,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.data.map((s: any) => ({
          ...s.slot,
          duration,
          availableMembers: s.attendeeAvailability.filter((a: any) => a.available).map((a: any) => a.personId),
          allAvailable: s.attendeeAvailability.every((a: any) => a.available),
        })));
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (personId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(personId)
        ? prev.filter((id) => id !== personId)
        : [...prev, personId]
    );
  };

  return (
    <div className="scheduler-modal">
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content">
        <div className="modal-header">
          <h3>Find Meeting Time</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Attendee Selection */}
          <div className="section">
            <label>Attendees</label>
            <div className="attendee-list">
              {members.map((member) => (
                <label key={member.personId} className="attendee-item">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(member.personId)}
                    onChange={() => toggleMember(member.personId)}
                  />
                  <span className="name">{member.personName}</span>
                  <span
                    className="status-dot"
                    style={{ backgroundColor: STATUS_COLORS[member.currentStatus] }}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div className="section">
            <label>Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="duration-select"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>

          {/* Time Range */}
          <div className="section">
            <label>Look ahead</label>
            <select
              value={withinDays}
              onChange={(e) => setWithinDays(Number(e.target.value))}
              className="range-select"
            >
              <option value={1}>Today only</option>
              <option value={3}>Next 3 days</option>
              <option value={7}>Next week</option>
              <option value={14}>Next 2 weeks</option>
            </select>
          </div>

          {/* Find Button */}
          <button
            className="btn btn-primary find-btn"
            onClick={findSlots}
            disabled={selectedMembers.length < 2 || loading}
          >
            {loading ? 'Finding...' : 'Find Available Times'}
          </button>

          {/* Results */}
          {suggestions.length > 0 && (
            <div className="suggestions-section">
              <h4>Suggested Times</h4>
              <div className="suggestion-list">
                {suggestions.map((slot, i) => (
                  <div
                    key={i}
                    className={`suggestion-item ${slot.allAvailable ? 'all-available' : ''}`}
                    onClick={() => onSchedule(slot)}
                  >
                    <div className="slot-datetime">
                      <span className="date">
                        {new Date(slot.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="time">
                        {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                        {new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className={`availability ${slot.allAvailable ? 'all' : ''}`}>
                      {slot.allAvailable ? '✓ All' : `${slot.availableMembers.length}/${selectedMembers.length}`}
                    </span>
                    <button className="btn btn-small btn-outline">Select</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper
function formatStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default AvailabilityView;
