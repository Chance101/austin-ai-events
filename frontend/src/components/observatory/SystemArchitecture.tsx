'use client';

/**
 * System Architecture Diagram — shows the three autonomous loops
 * that power austinai.events, designed to be understandable by
 * someone with limited AI knowledge.
 */

const innerLoopSteps = [
  { icon: '🔍', label: 'Search', desc: 'Scans 8+ sources and the web for Austin AI events' },
  { icon: '🔀', label: 'Deduplicate', desc: 'Catches the same event listed on different platforms' },
  { icon: '✅', label: 'Validate', desc: 'AI confirms: real event? In Austin? AI-related?' },
  { icon: '🏷️', label: 'Classify', desc: 'Tags audience, skill level, and free/paid' },
  { icon: '📅', label: 'Publish', desc: 'Approved events appear on the calendar' },
];

const modelTiers = [
  { model: 'Haiku', role: 'Speed', desc: 'Handles 80% of decisions — validation, classification, dedup', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { model: 'Sonnet', role: 'Balance', desc: 'Evaluates new sources and extracts event details', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { model: 'Opus', role: 'Strategy', desc: 'The system brain — monitors health and drives improvements', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
];

export default function SystemArchitecture() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">How It Works</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Three autonomous loops work together — no human runs this system.
      </p>

      {/* === THREE LOOPS === */}
      <div className="space-y-6">

        {/* LOOP 1: Inner Loop — Discovery Pipeline */}
        <div className="rounded-lg border-2 border-blue-500/30 bg-blue-500/5 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
              LOOP 1
            </span>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Discovery Pipeline</h4>
            <span className="text-sm text-gray-500 dark:text-gray-400">— runs daily at midnight</span>
          </div>

          {/* Desktop: Horizontal */}
          <div className="hidden md:flex items-center justify-between gap-1">
            {innerLoopSteps.map((step, i) => (
              <div key={step.label} className="flex items-center">
                <div className="flex flex-col items-center text-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 min-w-[160px] flex-1">
                  <span className="text-xl mb-1">{step.icon}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{step.label}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{step.desc}</span>
                </div>
                {i < innerLoopSteps.length - 1 && (
                  <svg className="w-4 h-4 mx-1 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>

          {/* Mobile: Vertical */}
          <div className="md:hidden space-y-2">
            {innerLoopSteps.map((step, i) => (
              <div key={step.label} className="flex flex-col items-center">
                <div className="flex items-center gap-3 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                  <span className="text-xl flex-shrink-0">{step.icon}</span>
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{step.label}</span>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{step.desc}</p>
                  </div>
                </div>
                {i < innerLoopSteps.length - 1 && (
                  <svg className="w-3 h-3 my-0.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Arrow down from Loop 1 to Loop 2 */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" />
            </svg>
            <span className="text-sm text-gray-500 dark:text-gray-400">run complete — monitor evaluates</span>
          </div>
        </div>

        {/* LOOP 2: Monitor — The Brain */}
        <div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              LOOP 2
            </span>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Self-Monitoring</h4>
            <span className="text-sm text-gray-500 dark:text-gray-400">— evaluates every run</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">📊</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Gather Metrics</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Collects data on scraper health, error rates, source performance, and calendar coverage</p>
            </div>
            <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🧠</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Opus Evaluates</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">The most powerful Claude model reviews everything, assigns a health grade, and identifies issues</p>
            </div>
            <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">⚡</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Take Action</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Creates search queries, manages sources, and escalates code issues for the repair agent</p>
            </div>
          </div>
        </div>

        {/* Arrow down from Loop 2 to Loop 3 */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center">
            <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" />
            </svg>
            <span className="text-sm text-gray-500 dark:text-gray-400">issues found — repair agent activates</span>
          </div>
        </div>

        {/* LOOP 3: Outer Loop — Self-Healing */}
        <div className="rounded-lg border-2 border-rose-500/30 bg-rose-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
              LOOP 3
            </span>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Self-Healing</h4>
            <span className="text-sm text-gray-500 dark:text-gray-400">— runs daily, 2 hours after discovery</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">📋</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Read Issues</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Picks up the highest-priority action item from the monitor</p>
            </div>
            <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🔧</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Fix Code</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Reads the codebase, understands the bug, and writes a fix</p>
            </div>
            <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🧪</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Test</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Runs the test suite — only pushes if all tests pass</p>
            </div>
            <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🚀</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Deploy</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pushes the fix to production — next run uses the improved code</p>
            </div>
          </div>
        </div>

        {/* Feedback loop arrow */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Cycle repeats daily — the system continuously improves itself</span>
          </div>
        </div>
      </div>

      {/* === MULTI-MODEL ARCHITECTURE === */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🤖</span>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Multi-Model Architecture</h4>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Three Claude AI models split the work based on what each task needs — like having a junior analyst, a senior reviewer, and a strategic director on the same team.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {modelTiers.map((tier) => (
            <div key={tier.model} className={`rounded-lg border p-3 ${tier.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold">{tier.model}</span>
                <span className="text-sm opacity-70">({tier.role})</span>
              </div>
              <p className="text-sm opacity-80">{tier.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* === USER FEEDBACK === */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">💬</span>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Community Input</h4>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Anyone can submit an event the system missed using the &ldquo;Missing an event?&rdquo; button on the calendar. The agent scrapes the submitted URL, validates it, and adds it to the calendar — all in the same daily run. It also learns from each submission, adding new sources and search strategies to find similar events in the future.
        </p>
      </div>

    </div>
  );
}
