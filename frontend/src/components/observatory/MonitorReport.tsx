'use client';

import { formatDistanceToNow } from 'date-fns';

interface Finding {
  category: string;
  severity: 'critical' | 'warning' | 'info' | 'positive';
  finding: string;
  recommendation: string | null;
}

interface AutoAction {
  action: string;
  detail: string;
  result: string;
}

export interface MonitorReportData {
  id: string;
  created_at: string;
  overall_grade: string;
  summary: string;
  findings: Finding[];
  auto_actions: AutoAction[];
}

interface MonitorReportProps {
  report: MonitorReportData | null;
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

const categoryLabels: Record<string, string> = {
  coverage: 'Coverage',
  sources: 'Sources',
  pipeline: 'Pipeline',
  cost: 'Cost',
  reliability: 'Reliability',
};

function FindingCard({ finding }: { finding: Finding }) {
  const config = severityConfig[finding.severity] || severityConfig.info;

  return (
    <div className={`p-3 rounded-lg ${config.bg} border ${config.border}`}>
      <div className="flex items-start gap-2">
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${config.text} ${config.bg} border ${config.border} shrink-0 mt-0.5`}>
          {config.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.text}`}>
              {categoryLabels[finding.category] || finding.category}
            </span>
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

export default function MonitorReport({ report, loading }: MonitorReportProps) {
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

  if (!report) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Health Report</h3>
        <p className="text-gray-500 dark:text-gray-400 mt-2">No evaluation reports yet. The monitor runs automatically after each agent discovery run.</p>
      </div>
    );
  }

  const grade = gradeColors[report.overall_grade] || gradeColors.C;

  // Sort findings: critical first, then warning, info, positive
  const severityOrder = { critical: 0, warning: 1, info: 2, positive: 3 };
  const sortedFindings = [...(report.findings || [])].sort(
    (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
  );

  const criticalCount = sortedFindings.filter(f => f.severity === 'critical').length;
  const warningCount = sortedFindings.filter(f => f.severity === 'warning').length;
  const positiveCount = sortedFindings.filter(f => f.severity === 'positive').length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      {/* Header with grade */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Agent Health Report
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className={`w-14 h-14 rounded-xl ${grade.bg} border-2 ${grade.border} flex items-center justify-center`}>
          <span className={`text-2xl font-bold ${grade.text}`}>
            {report.overall_grade}
          </span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
        {report.summary}
      </p>

      {/* Finding counts */}
      <div className="flex gap-3 mb-4">
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

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Auto-generated after each agent run
        </p>
      </div>
    </div>
  );
}
