/**
 * Capacity Planner Component
 * T234 - Team capacity planning and resource allocation
 *
 * Visualizes team capacity, planned work, and helps with resource planning
 */

import React, { useState, useEffect, useCallback } from 'react';

// Types
interface TeamMember {
  id: string;
  name: string;
  role: string;
  capacity: number; // hours per week
  allocated: number;
  available: number;
  utilizationRate: number;
  skills: string[];
  plannedLeave: PlannedLeave[];
}

interface PlannedLeave {
  start: string;
  end: string;
  type: 'vacation' | 'sick' | 'personal' | 'holiday';
}

interface Project {
  id: string;
  name: string;
  requiredHours: number;
  allocatedHours: number;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  requiredSkills: string[];
  assignments: Assignment[];
}

interface Assignment {
  personId: string;
  personName: string;
  hours: number;
  role: string;
}

interface CapacityData {
  teamId: string;
  period: {
    start: string;
    end: string;
  };
  totalCapacity: number;
  totalAllocated: number;
  totalAvailable: number;
  overallUtilization: number;
  members: TeamMember[];
  projects: Project[];
  bottlenecks: Bottleneck[];
  recommendations: Recommendation[];
}

interface Bottleneck {
  type: 'skill_shortage' | 'overallocation' | 'deadline_conflict' | 'resource_gap';
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedProjects: string[];
  suggestedResolution: string;
}

interface Recommendation {
  id: string;
  type: 'rebalance' | 'hire' | 'defer' | 'outsource';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
}

interface CapacityPlannerProps {
  teamId: string;
  onAssignmentChange?: (projectId: string, assignment: Assignment) => void;
}

export function CapacityPlanner({
  teamId,
  onAssignmentChange,
}: CapacityPlannerProps) {
  const [data, setData] = useState<CapacityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'timeline' | 'matrix' | 'projects'>('timeline');
  const [weeksAhead, setWeeksAhead] = useState(4);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const fetchCapacity = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/workload/team/${teamId}/capacity?weeks=${weeksAhead}`
      );
      if (!response.ok) throw new Error('Failed to fetch capacity data');
      const result = await response.json();
      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [teamId, weeksAhead]);

  useEffect(() => {
    fetchCapacity();
  }, [fetchCapacity]);

  if (loading) {
    return (
      <div className="capacity-planner loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="capacity-planner error">
        <p>{error || 'No data available'}</p>
        <button onClick={fetchCapacity} className="btn btn-small">Retry</button>
      </div>
    );
  }

  return (
    <div className="capacity-planner">
      {/* Header */}
      <div className="planner-header">
        <h3>Capacity Planner</h3>
        <div className="header-controls">
          <select
            value={weeksAhead}
            onChange={(e) => setWeeksAhead(Number(e.target.value))}
            className="weeks-select"
          >
            <option value={2}>2 Weeks</option>
            <option value={4}>4 Weeks</option>
            <option value={8}>8 Weeks</option>
            <option value={12}>12 Weeks</option>
          </select>
          <div className="view-toggle">
            <button
              className={`toggle-btn ${view === 'timeline' ? 'active' : ''}`}
              onClick={() => setView('timeline')}
            >
              Timeline
            </button>
            <button
              className={`toggle-btn ${view === 'matrix' ? 'active' : ''}`}
              onClick={() => setView('matrix')}
            >
              Matrix
            </button>
            <button
              className={`toggle-btn ${view === 'projects' ? 'active' : ''}`}
              onClick={() => setView('projects')}
            >
              Projects
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="capacity-summary">
        <div className="summary-card">
          <span className="card-label">Total Capacity</span>
          <span className="card-value">{data.totalCapacity}h</span>
        </div>
        <div className="summary-card">
          <span className="card-label">Allocated</span>
          <span className="card-value">{data.totalAllocated}h</span>
        </div>
        <div className="summary-card">
          <span className="card-label">Available</span>
          <span className="card-value available">{data.totalAvailable}h</span>
        </div>
        <div className="summary-card">
          <span className="card-label">Utilization</span>
          <span
            className={`card-value ${getUtilizationClass(data.overallUtilization)}`}
          >
            {(data.overallUtilization * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Bottlenecks Alert */}
      {data.bottlenecks.filter((b) => b.severity === 'high').length > 0 && (
        <div className="bottlenecks-alert">
          <span className="alert-icon">⚠️</span>
          <span className="alert-text">
            {data.bottlenecks.filter((b) => b.severity === 'high').length} critical
            capacity issues detected
          </span>
          <button className="btn btn-small btn-outline">View Details</button>
        </div>
      )}

      {/* Main Content */}
      <div className="planner-content">
        {view === 'timeline' && (
          <TimelineView
            members={data.members}
            period={data.period}
            weeksAhead={weeksAhead}
          />
        )}
        {view === 'matrix' && (
          <MatrixView
            members={data.members}
            projects={data.projects}
            onAssignmentChange={onAssignmentChange}
          />
        )}
        {view === 'projects' && (
          <ProjectsView
            projects={data.projects}
            selectedProject={selectedProject}
            onSelectProject={setSelectedProject}
          />
        )}
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="recommendations-section">
          <h4>Recommendations</h4>
          <div className="recommendations-list">
            {data.recommendations.slice(0, 3).map((rec) => (
              <div key={rec.id} className={`recommendation-card ${rec.type}`}>
                <span className="rec-type">{rec.type}</span>
                <h5>{rec.title}</h5>
                <p>{rec.description}</p>
                <div className="rec-meta">
                  <span className="impact">Impact: {rec.impact}</span>
                  <span className={`effort ${rec.effort}`}>Effort: {rec.effort}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Timeline View
interface TimelineViewProps {
  members: TeamMember[];
  period: { start: string; end: string };
  weeksAhead: number;
}

function TimelineView({ members, weeksAhead }: TimelineViewProps) {
  const weeks = Array.from({ length: weeksAhead }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i * 7);
    return date;
  });

  return (
    <div className="timeline-view">
      {/* Header */}
      <div className="timeline-header">
        <div className="member-column">Team Member</div>
        {weeks.map((week, i) => (
          <div key={i} className="week-column">
            Week {i + 1}
            <span className="week-date">
              {week.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="timeline-body">
        {members.map((member) => (
          <div key={member.id} className="timeline-row">
            <div className="member-column">
              <span className="member-name">{member.name}</span>
              <span className="member-role">{member.role}</span>
            </div>
            {weeks.map((week, i) => {
              const isOnLeave = member.plannedLeave.some((leave) => {
                const leaveStart = new Date(leave.start);
                const leaveEnd = new Date(leave.end);
                return week >= leaveStart && week <= leaveEnd;
              });

              // Simulate varying utilization per week
              const weekUtil = Math.min(1, member.utilizationRate + (Math.random() - 0.5) * 0.2);

              return (
                <div key={i} className={`week-column ${isOnLeave ? 'on-leave' : ''}`}>
                  {isOnLeave ? (
                    <span className="leave-indicator">OOO</span>
                  ) : (
                    <div className="utilization-bar">
                      <div
                        className="bar-fill"
                        style={{
                          height: `${weekUtil * 100}%`,
                          backgroundColor: getUtilizationColor(weekUtil),
                        }}
                      />
                      <span className="util-value">{(weekUtil * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="timeline-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#22c55e' }} />
          <span>Under 70%</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#f59e0b' }} />
          <span>70-90%</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#ef4444' }} />
          <span>Over 90%</span>
        </div>
        <div className="legend-item">
          <span className="legend-color ooo" />
          <span>Out of Office</span>
        </div>
      </div>
    </div>
  );
}

// Matrix View
interface MatrixViewProps {
  members: TeamMember[];
  projects: Project[];
  onAssignmentChange?: (projectId: string, assignment: Assignment) => void;
}

function MatrixView({ members, projects, onAssignmentChange }: MatrixViewProps) {
  const getAssignment = (projectId: string, personId: string): number => {
    const project = projects.find((p) => p.id === projectId);
    const assignment = project?.assignments.find((a) => a.personId === personId);
    return assignment?.hours || 0;
  };

  const handleHoursChange = (projectId: string, personId: string, hours: number) => {
    const member = members.find((m) => m.id === personId);
    if (member && onAssignmentChange) {
      onAssignmentChange(projectId, {
        personId,
        personName: member.name,
        hours,
        role: member.role,
      });
    }
  };

  return (
    <div className="matrix-view">
      <table className="allocation-matrix">
        <thead>
          <tr>
            <th className="project-header">Project</th>
            {members.map((member) => (
              <th key={member.id} className="member-header">
                <span className="member-name">{member.name}</span>
                <span className="member-available">{member.available}h avail</span>
              </th>
            ))}
            <th className="total-header">Total</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id} className={`priority-${project.priority}`}>
              <td className="project-cell">
                <span className="project-name">{project.name}</span>
                <span className={`priority-badge ${project.priority}`}>
                  {project.priority}
                </span>
              </td>
              {members.map((member) => {
                const hours = getAssignment(project.id, member.id);
                return (
                  <td key={member.id} className="allocation-cell">
                    <input
                      type="number"
                      value={hours}
                      onChange={(e) =>
                        handleHoursChange(
                          project.id,
                          member.id,
                          Number(e.target.value)
                        )
                      }
                      min={0}
                      max={member.available}
                      className="hours-input"
                    />
                  </td>
                );
              })}
              <td className="total-cell">
                <span
                  className={
                    project.allocatedHours >= project.requiredHours ? 'met' : 'unmet'
                  }
                >
                  {project.allocatedHours}/{project.requiredHours}h
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="project-cell">Total Allocated</td>
            {members.map((member) => (
              <td key={member.id} className="allocation-cell total">
                <span
                  className={member.allocated > member.capacity ? 'over' : 'under'}
                >
                  {member.allocated}h
                </span>
              </td>
            ))}
            <td className="total-cell" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Projects View
interface ProjectsViewProps {
  projects: Project[];
  selectedProject: string | null;
  onSelectProject: (id: string | null) => void;
}

function ProjectsView({ projects, selectedProject, onSelectProject }: ProjectsViewProps) {
  const sortedProjects = [...projects].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const selected = selectedProject
    ? projects.find((p) => p.id === selectedProject)
    : null;

  return (
    <div className="projects-view">
      {/* Projects List */}
      <div className="projects-list">
        {sortedProjects.map((project) => {
          const fulfillment = (project.allocatedHours / project.requiredHours) * 100;
          const daysUntilDeadline = Math.ceil(
            (new Date(project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );

          return (
            <div
              key={project.id}
              className={`project-card ${selectedProject === project.id ? 'selected' : ''}`}
              onClick={() =>
                onSelectProject(selectedProject === project.id ? null : project.id)
              }
            >
              <div className="project-header">
                <span className="project-name">{project.name}</span>
                <span className={`priority-badge ${project.priority}`}>
                  {project.priority}
                </span>
              </div>
              <div className="project-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, fulfillment)}%`,
                      backgroundColor: fulfillment >= 100 ? '#22c55e' : '#f59e0b',
                    }}
                  />
                </div>
                <span className="progress-text">
                  {project.allocatedHours}/{project.requiredHours}h allocated
                </span>
              </div>
              <div className="project-deadline">
                <span className={`days-remaining ${daysUntilDeadline < 7 ? 'urgent' : ''}`}>
                  {daysUntilDeadline > 0 ? `${daysUntilDeadline} days` : 'Overdue'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Project Details */}
      {selected && (
        <div className="project-details">
          <h4>{selected.name}</h4>

          <div className="details-section">
            <h5>Required Skills</h5>
            <div className="skills-list">
              {selected.requiredSkills.map((skill) => (
                <span key={skill} className="skill-tag">
                  {skill}
                </span>
              ))}
            </div>
          </div>

          <div className="details-section">
            <h5>Assignments</h5>
            <div className="assignments-list">
              {selected.assignments.map((assignment) => (
                <div key={assignment.personId} className="assignment-item">
                  <span className="assignee-name">{assignment.personName}</span>
                  <span className="assignee-role">{assignment.role}</span>
                  <span className="assignee-hours">{assignment.hours}h</span>
                </div>
              ))}
              {selected.assignments.length === 0 && (
                <p className="no-assignments">No assignments yet</p>
              )}
            </div>
          </div>

          <div className="details-section">
            <h5>Resource Gap</h5>
            <div className="gap-indicator">
              {selected.requiredHours > selected.allocatedHours ? (
                <span className="gap negative">
                  -{selected.requiredHours - selected.allocatedHours}h understaffed
                </span>
              ) : (
                <span className="gap positive">
                  +{selected.allocatedHours - selected.requiredHours}h buffer
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Functions
function getUtilizationClass(rate: number): string {
  if (rate > 0.9) return 'over';
  if (rate > 0.7) return 'optimal';
  return 'under';
}

function getUtilizationColor(rate: number): string {
  if (rate > 0.9) return '#ef4444';
  if (rate > 0.7) return '#f59e0b';
  return '#22c55e';
}

export default CapacityPlanner;
