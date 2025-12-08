/**
 * Tooltip and Help Text Components
 * T258 - Add tooltips and help text for routing configuration
 * T259 - Add tooltips and help text for compliance rules
 *
 * Provides contextual help and guidance throughout the application
 */

import React, { useState, useRef, useEffect, ReactNode } from 'react';

// Types
interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  maxWidth?: number;
  disabled?: boolean;
}

interface HelpTextProps {
  text: string;
  learnMoreUrl?: string;
  type?: 'info' | 'warning' | 'tip';
}

interface InfoIconProps {
  tooltip: string;
  size?: 'small' | 'medium' | 'large';
}

interface FieldHelpProps {
  label: string;
  tooltip?: string;
  required?: boolean;
  children: ReactNode;
}

// ==========================================
// Routing Configuration Help Content (T258)
// ==========================================

export const ROUTING_HELP = {
  overview: {
    title: 'Task Routing',
    description:
      'Intelligent task routing automatically assigns incoming tasks to the most appropriate team or individual based on skills, availability, and workload.',
  },

  rules: {
    title: 'Routing Rules',
    description:
      'Rules define how tasks are matched and assigned. Each rule has conditions that must be met and actions that specify where to route the task.',
    tips: [
      'Rules are evaluated in priority order - higher priority rules are checked first',
      'Use specific conditions to ensure accurate routing',
      'Test rules with sample tasks before activating',
    ],
  },

  conditions: {
    taskType: 'Filter tasks by their type (e.g., support ticket, feature request, bug report)',
    priority: 'Match tasks based on their priority level (low, medium, high, critical)',
    source: 'Route tasks from specific channels (email, chat, API, manual)',
    keywords: 'Match tasks containing specific keywords in their title or description',
    customer: 'Route based on customer tier, segment, or specific customer IDs',
    timeRange: 'Apply rules only during specific time periods or business hours',
  },

  actions: {
    assignTeam: 'Route the task to a specific team queue',
    assignUser: 'Route directly to a specific user',
    roundRobin: 'Distribute tasks evenly among team members',
    leastBusy: 'Assign to the team member with the lowest current workload',
    skillMatch: 'Match task requirements with team member skills',
    escalate: 'Automatically escalate if not handled within a time limit',
  },

  metrics: {
    routingAccuracy: 'Percentage of tasks correctly routed on the first attempt',
    avgRoutingTime: 'Average time from task creation to assignment',
    reassignmentRate: 'Percentage of tasks that needed to be rerouted',
    capacityUtilization: 'How well workload is distributed across the team',
  },

  bestPractices: [
    'Start with broad rules and refine based on actual routing patterns',
    'Use fallback rules to catch tasks that don\'t match specific criteria',
    'Review routing metrics weekly to identify optimization opportunities',
    'Keep rule conditions simple and easy to understand',
    'Document the purpose of each rule for team reference',
  ],
};

// ==========================================
// Compliance Rules Help Content (T259)
// ==========================================

export const COMPLIANCE_HELP = {
  overview: {
    title: 'Compliance Monitoring',
    description:
      'Automated compliance monitoring tracks adherence to organizational policies, regulatory requirements, and SLA commitments.',
  },

  rules: {
    title: 'Compliance Rules',
    description:
      'Rules define what conditions trigger compliance violations and what actions should be taken when violations occur.',
    tips: [
      'Set appropriate severity levels to prioritize response efforts',
      'Configure escalation paths for critical violations',
      'Use grace periods for non-critical violations',
    ],
  },

  ruleTypes: {
    sla: 'Service Level Agreement rules track response and resolution time commitments',
    security: 'Security rules monitor access patterns, data handling, and system integrity',
    regulatory: 'Regulatory rules ensure compliance with industry regulations (GDPR, HIPAA, SOX)',
    operational: 'Operational rules track adherence to internal policies and procedures',
    data: 'Data rules monitor data quality, retention, and handling requirements',
  },

  conditions: {
    threshold: 'Trigger when a metric exceeds or falls below a specified value',
    pattern: 'Detect specific patterns or sequences of events',
    time: 'Monitor for actions that occur outside allowed time windows',
    frequency: 'Alert when events occur more or less frequently than expected',
    anomaly: 'Use AI to detect unusual patterns that may indicate compliance issues',
  },

  actions: {
    alert: 'Send notifications to specified recipients',
    escalate: 'Automatically escalate to management or compliance team',
    block: 'Prevent actions that would cause violations',
    log: 'Create detailed audit logs for review',
    remediate: 'Trigger automated remediation workflows',
  },

  severity: {
    critical: 'Immediate action required - potential legal or financial impact',
    high: 'Urgent attention needed - significant risk if not addressed',
    medium: 'Should be addressed within standard response time',
    low: 'Minor issue - can be addressed during regular review',
    info: 'Informational - no action required but worth noting',
  },

  bestPractices: [
    'Align compliance rules with your organization\'s risk tolerance',
    'Regularly review and update rules as regulations change',
    'Test rules thoroughly before enabling enforcement actions',
    'Maintain comprehensive documentation for audit purposes',
    'Establish clear ownership for each compliance domain',
  ],
};

// ==========================================
// Tooltip Component
// ==========================================

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
  maxWidth = 250,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const calculatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        y = triggerRect.top - tooltipRect.height - 8;
        break;
      case 'bottom':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        y = triggerRect.bottom + 8;
        break;
      case 'left':
        x = triggerRect.left - tooltipRect.width - 8;
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'right':
        x = triggerRect.right + 8;
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
    }

    // Keep tooltip within viewport
    const padding = 8;
    x = Math.max(padding, Math.min(x, window.innerWidth - tooltipRect.width - padding));
    y = Math.max(padding, Math.min(y, window.innerHeight - tooltipRect.height - padding));

    setCoords({ x, y });
  };

  const showTooltip = () => {
    if (disabled) return;

    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      // Calculate position after render
      requestAnimationFrame(calculatePosition);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        className="tooltip-trigger"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </div>

      {isVisible && (
        <div
          ref={tooltipRef}
          className={`tooltip tooltip-${position}`}
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            maxWidth,
          }}
          role="tooltip"
        >
          {content}
          <div className={`tooltip-arrow tooltip-arrow-${position}`} />
        </div>
      )}
    </>
  );
}

// ==========================================
// Help Text Component
// ==========================================

export function HelpText({ text, learnMoreUrl, type = 'info' }: HelpTextProps) {
  const icons = {
    info: (
      <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    ),
    warning: (
      <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    ),
    tip: (
      <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
        <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
      </svg>
    ),
  };

  return (
    <div className={`help-text help-text-${type}`}>
      <span className="help-text-icon">{icons[type]}</span>
      <span className="help-text-content">
        {text}
        {learnMoreUrl && (
          <a href={learnMoreUrl} target="_blank" rel="noopener noreferrer" className="help-text-link">
            Learn more
          </a>
        )}
      </span>
    </div>
  );
}

// ==========================================
// Info Icon with Tooltip
// ==========================================

export function InfoIcon({ tooltip, size = 'medium' }: InfoIconProps) {
  const sizes = {
    small: 14,
    medium: 16,
    large: 20,
  };

  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        className={`info-icon info-icon-${size}`}
        aria-label="More information"
      >
        <svg viewBox="0 0 20 20" width={sizes[size]} height={sizes[size]} fill="currentColor">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </Tooltip>
  );
}

// ==========================================
// Field with Help Component
// ==========================================

export function FieldHelp({ label, tooltip, required, children }: FieldHelpProps) {
  return (
    <div className="field-help">
      <label className="field-help-label">
        <span>{label}</span>
        {required && <span className="field-required">*</span>}
        {tooltip && <InfoIcon tooltip={tooltip} size="small" />}
      </label>
      {children}
    </div>
  );
}

// ==========================================
// Contextual Help Panel
// ==========================================

export function ContextualHelpPanel({
  title,
  description,
  tips,
  learnMoreUrl,
  onClose,
}: {
  title: string;
  description: string;
  tips?: string[];
  learnMoreUrl?: string;
  onClose?: () => void;
}) {
  return (
    <div className="contextual-help-panel">
      <div className="contextual-help-header">
        <h4>{title}</h4>
        {onClose && (
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            ×
          </button>
        )}
      </div>

      <div className="contextual-help-content">
        <p>{description}</p>

        {tips && tips.length > 0 && (
          <div className="contextual-help-tips">
            <h5>Tips</h5>
            <ul>
              {tips.map((tip, index) => (
                <li key={index}>{tip}</li>
              ))}
            </ul>
          </div>
        )}

        {learnMoreUrl && (
          <a href={learnMoreUrl} target="_blank" rel="noopener noreferrer" className="btn btn-text">
            Learn more →
          </a>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Best Practices Checklist
// ==========================================

export function BestPracticesChecklist({
  title,
  practices,
  checkedItems = [],
  onChange,
}: {
  title: string;
  practices: string[];
  checkedItems?: string[];
  onChange?: (practice: string, checked: boolean) => void;
}) {
  return (
    <div className="best-practices-checklist">
      <h4>{title}</h4>
      <ul>
        {practices.map((practice, index) => {
          const isChecked = checkedItems.includes(practice);
          return (
            <li key={index} className={isChecked ? 'checked' : ''}>
              {onChange ? (
                <label>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => onChange(practice, e.target.checked)}
                  />
                  <span>{practice}</span>
                </label>
              ) : (
                <>
                  <span className="bullet">•</span>
                  <span>{practice}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ==========================================
// Inline Documentation
// ==========================================

export function InlineDoc({
  term,
  definition,
  example,
}: {
  term: string;
  definition: string;
  example?: string;
}) {
  return (
    <Tooltip
      content={
        <div className="inline-doc-tooltip">
          <div className="inline-doc-definition">{definition}</div>
          {example && (
            <div className="inline-doc-example">
              <strong>Example:</strong> {example}
            </div>
          )}
        </div>
      }
      maxWidth={300}
    >
      <span className="inline-doc-term">{term}</span>
    </Tooltip>
  );
}

// CSS styles
const styles = `
/* Tooltip styles */
.tooltip-trigger {
  display: inline-block;
}

.tooltip {
  background: #1f2937;
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.4;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: tooltip-fade-in 0.15s ease;
}

@keyframes tooltip-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tooltip-arrow {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #1f2937;
  transform: rotate(45deg);
}

.tooltip-arrow-top {
  bottom: -4px;
  left: 50%;
  margin-left: -4px;
}

.tooltip-arrow-bottom {
  top: -4px;
  left: 50%;
  margin-left: -4px;
}

.tooltip-arrow-left {
  right: -4px;
  top: 50%;
  margin-top: -4px;
}

.tooltip-arrow-right {
  left: -4px;
  top: 50%;
  margin-top: -4px;
}

/* Help text styles */
.help-text {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.help-text-info {
  background: #eff6ff;
  color: #1e40af;
}

.help-text-warning {
  background: #fffbeb;
  color: #92400e;
}

.help-text-tip {
  background: #f0fdf4;
  color: #166534;
}

.help-text-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.help-text-content {
  flex: 1;
}

.help-text-link {
  margin-left: 4px;
  text-decoration: underline;
}

/* Info icon styles */
.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  cursor: help;
  padding: 2px;
  background: none;
  border: none;
  transition: color 0.15s;
}

.info-icon:hover {
  color: #6b7280;
}

/* Field help styles */
.field-help {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-help-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.field-required {
  color: #dc2626;
}

/* Contextual help panel styles */
.contextual-help-panel {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.contextual-help-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.contextual-help-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.contextual-help-content {
  padding: 16px;
}

.contextual-help-content p {
  margin: 0 0 12px;
  color: #4b5563;
  line-height: 1.5;
}

.contextual-help-tips {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.contextual-help-tips h5 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.contextual-help-tips ul {
  margin: 0;
  padding-left: 20px;
}

.contextual-help-tips li {
  margin-bottom: 6px;
  color: #6b7280;
  font-size: 13px;
}

/* Best practices checklist styles */
.best-practices-checklist {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.best-practices-checklist h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}

.best-practices-checklist ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.best-practices-checklist li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  font-size: 13px;
  color: #4b5563;
  border-bottom: 1px solid #e5e7eb;
}

.best-practices-checklist li:last-child {
  border-bottom: none;
}

.best-practices-checklist li.checked {
  color: #059669;
}

.best-practices-checklist .bullet {
  color: #9ca3af;
}

.best-practices-checklist label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}

.best-practices-checklist input[type="checkbox"] {
  margin-top: 2px;
}

/* Inline doc styles */
.inline-doc-term {
  border-bottom: 1px dashed #9ca3af;
  cursor: help;
}

.inline-doc-tooltip {
  text-align: left;
}

.inline-doc-definition {
  margin-bottom: 8px;
}

.inline-doc-example {
  font-size: 12px;
  color: #9ca3af;
  padding-top: 8px;
  border-top: 1px solid #374151;
}
`;

export const tooltipStyles = styles;

export default {
  Tooltip,
  HelpText,
  InfoIcon,
  FieldHelp,
  ContextualHelpPanel,
  BestPracticesChecklist,
  InlineDoc,
  ROUTING_HELP,
  COMPLIANCE_HELP,
};
