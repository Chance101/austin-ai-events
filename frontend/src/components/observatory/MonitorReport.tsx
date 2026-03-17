'use client';

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';

interface Finding {
  category: string;
  severity: 'critical' | 'warning' | 'info' | 'positive';
  status?: 'new' | 'recurring' | 'resolved' | 'escalated';
  finding: string;
  recommendation: string | null;
}

interface AutoAction {
  action: string;
  detail: string;
  result: string;
}

interface ActionReview {
  previous_action: string;
  outcome: string;
  assessment: string;
}

export interface MonitorReportData {
  id: string;
  created_at: string;
  overall_grade: string;
  summary: string;
  findings: Finding[];
  auto_actions: AutoAction[];
  action_review?: ActionReview[];
}

interface MonitorReportProps {
  reports: MonitorReportData[];
  loading: boolean;
}

const gradeColors: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-800 dark:text-green-200', border: 'border-green-300 dark:border-green-700' },
  B: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-800 dark:text-blue-200', border: 'border-blue-300 dark:border-blue-700' },
  C: { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-800 dark:text-yellow-200', border: 'border-yellow-300 dark:border-yellow-700' },
  D: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-800 dark:text-orange-200', border: 'border-orange-300 dark:border-orange-700' },
  F: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-800 dark:text-red-200', border: 'border-red-300 dark:border-red-700' },
};

const severityConfig: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  critical: { icon: '!!', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-800 dark:text-red-200' },
  warning: { icon: '!', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-800 dark:text-amber-200' },
  info: { icon: 'i', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-800 dark:text-blue-200' },
  positive: { icon: '+', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', text: 'text-green-800 dark:text-green-200' },
};

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'NEW', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  recurring: { label: 'RECURRING', bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  resolved: { label: 'RESOLVED', bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
  escalated: { label: 'ESCALATED', bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
};

const categoryLabels: Record<string, string> = {
  coverage: 'Coverage',
  sources: 'Sources',
  pipeline: 'Pipeline',
  cost: 'Cost',
  reliability: 'Reliability',
};

function FindingCard({ finding }: { finding: Finding }) {
  const config = severityConfig[finding.severity] || severityConfig.info;
  const status = finding.status ? statusConfig[finding.status] : null;

  return (
    <div className={`p-3 rounded-lg ${config.bg} border ${config.border}`}>
      <div className="flex items-start gap-2">
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${config.text} ${config.bg} border ${config.border} shrink-0 mt-0.5`}>
          {config.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.text}`}>
              {categoryLabels[finding.category] || finding.category}
            </span>
            {status && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${status.bg} ${status.text}`}>
                {status.label}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-200">
            {finding.finding}
          </p>
          {finding.recommendation && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 italic">
              {finding.recommendation}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionReviewSection({ reviews }: { reviews: ActionReview[] }) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Action Review (learning from past decisions)
      </h4>
      <div className="space-y-2">
        {reviews.map((review, i) => {
          const isEffective = review.assessment.toLowerCase().includes('effective') && !review.assessment.toLowerCase().includes('ineffective');
          const isPending = review.assessment.toLowerCase().includes('pending');

          return (
            <div key={i} className="p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-2">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${
                  isEffective
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : isPending
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                }`}>
                  {isEffective ? 'Worked' : isPending ? 'Pending' : 'Missed'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800 dark:text-gray-200 font-medium truncate">
                    {review.previous_action}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {review.outcome}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 italic">
                    {review.assessment}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportContent({ report }: { report: MonitorReportData }) {
  const severityOrder = { critical: 0, warning: 1, info: 2, positive: 3 };
  const sortedFindings = [...(report.findings || [])].sort(
    (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
  );

  // Count findings by status
  const statusCounts = sortedFindings.reduce((acc, f) => {
    if (f.status) acc[f.status] = (acc[f.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      {/* Summary */}
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
        {report.summary}
      </p>

      {/* Finding counts */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(() => {
          const criticalCount = sortedFindings.filter(f => f.severity === 'critical').length;
          const warningCount = sortedFindings.filter(f => f.severity === 'warning').length;
          const positiveCount = sortedFindings.filter(f => f.severity === 'positive').length;
          return (
            <>
              {criticalCount > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
                  {criticalCount} critical
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                  {warningCount} warning{warningCount > 1 ? 's' : ''}
                </span>
              )}
              {positiveCount > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium">
                  {positiveCount} positive
                </span>
              )}
              {statusCounts.recurring > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
                  {statusCounts.recurring} recurring
                </span>
              )}
              {statusCounts.resolved > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
                  {statusCounts.resolved} resolved
                </span>
              )}
              {statusCounts.escalated > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium">
                  {statusCounts.escalated} escalated
                </span>
              )}
            </>
          );
        })()}
      </div>

      {/* Findings */}
      <div className="space-y-2 mb-4">
        {sortedFindings.map((finding, i) => (
          <FindingCard key={i} finding={finding} />
        ))}
      </div>

      {/* Auto-actions taken */}
      {report.auto_actions && report.auto_actions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Auto-actions taken
          </h4>
          <div className="space-y-1">
            {report.auto_actions.map((action, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                <span className="font-medium">{action.action}:</span>
                <span className="truncate">{action.detail}</span>
                <span className="text-gray-400 dark:text-gray-500 shrink-0">({action.result})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action review */}
      {report.action_review && report.action_review.length > 0 && (
        <ActionReviewSection reviews={report.action_review} />
      )}
    </div>
  );
}

function formatReportDate(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d, yyyy');
}

function PastReportCard({ report, isExpanded, onToggle }: {
  report: MonitorReportData;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const grade = gradeColors[report.overall_grade] || gradeColors.C;

  return (
    <div className="relative pl-8 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

      {/* Timeline dot — grade colored */}
      <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full ${grade.bg} border-2 ${grade.border} flex items-center justify-center text-xs font-bold ${grade.text} z-10`}>
        {report.overall_grade}
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header - always visible */}
        <button
          onClick={onToggle}
          className="w-full p-4 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${grade.bg} ${grade.text} border ${grade.border}`}>
                  Grade: {report.overall_grade}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatReportDate(report.created_at)}
                </span>
                {/* Show finding status summary in collapsed view */}
                {report.findings && (() => {
                  const escalated = report.findings.filter(f => f.status === 'escalated').length;
                  const recurring = report.findings.filter(f => f.status === 'recurring').length;
                  const resolved = report.findings.filter(f => f.status === 'resolved').length;
                  return (
                    <>
                      {escalated > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold">
                          {escalated} escalated
                        </span>
                      )}
                      {recurring > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
                          {recurring} recurring
                        </span>
                      )}
                      {resolved > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
                          {resolved} resolved
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                {report.summary}
              </p>
            </div>
            <span className="text-gray-400 dark:text-gray-500 shrink-0">
              {isExpanded ? '▼' : '▶'}
            </span>
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-3">
            <ReportContent report={report} />
          </div>
        )}
      </div>
    </div>
  );
}

const REPORTS_PER_PAGE = 7;

export default function MonitorReport({ reports, loading }: MonitorReportProps) {
  const [visibleCount, setVisibleCount] = useState(REPORTS_PER_PAGE);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Health Report</h3>
        <p className="text-gray-500 dark:text-gray-400 mt-2">No evaluation reports yet. The monitor runs automatically after each agent discovery run.</p>
      </div>
    );
  }

  const latestReport = reports[0];
  const pastReports = reports.slice(1);
  const displayedPast = pastReports.slice(0, visibleCount);
  const hasMore = pastReports.length > visibleCount;
  const latestGrade = gradeColors[latestReport.overall_grade] || gradeColors.C;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      {/* Latest report — always fully displayed */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Agent Health Report
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatDistanceToNow(new Date(latestReport.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className={`w-14 h-14 rounded-xl ${latestGrade.bg} border-2 ${latestGrade.border} flex items-center justify-center`}>
          <span className={`text-2xl font-bold ${latestGrade.text}`}>
            {latestReport.overall_grade}
          </span>
        </div>
      </div>

      <ReportContent report={latestReport} />

      {/* Past reports timeline */}
      {pastReports.length > 0 && (
        <>
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Past Reports
            </h4>
            <div className={visibleCount > REPORTS_PER_PAGE ? 'max-h-[600px] overflow-y-auto pr-2' : ''}>
              {displayedPast.map((report) => (
                <PastReportCard
                  key={report.id}
                  report={report}
                  isExpanded={expandedId === report.id}
                  onToggle={() => setExpandedId(expandedId === report.id ? null : report.id)}
                />
              ))}
            </div>
          </div>

          {/* Show more button */}
          {hasMore && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setVisibleCount(prev => prev + REPORTS_PER_PAGE)}
                className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
              >
                Show more ({pastReports.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Auto-generated after each agent run
        </p>
      </div>
    </div>
  );
}
