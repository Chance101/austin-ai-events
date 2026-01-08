'use client';

const steps = [
  {
    icon: '🔍',
    label: 'Search',
    description: 'Agent searches the web for Austin AI events',
  },
  {
    icon: '🧠',
    label: 'Evaluate',
    description: 'Claude AI decides: Is this a real AI event in Austin?',
  },
  {
    icon: '📋',
    label: 'Classify',
    description: 'Claude tags each event: audience, skill level, free/paid',
  },
  {
    icon: '📅',
    label: 'Publish',
    description: 'Valid events appear on the calendar automatically',
  },
  {
    icon: '🔄',
    label: 'Learn',
    description: 'Agent improves its search strategy over time',
  },
];

export default function HowItWorks() {
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">How It Works</h3>

      {/* Desktop: Horizontal flow */}
      <div className="hidden md:block">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center text-center bg-gray-50 border border-gray-200 rounded-lg p-4 min-w-[140px]">
                <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-2xl mb-2">
                  {step.icon}
                </div>
                <span className="text-sm font-medium text-gray-900">{step.label}</span>
                <span className="text-xs text-gray-500 mt-1">{step.description}</span>
              </div>
              {index < steps.length - 1 && (
                <div className="mx-2 text-gray-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Curved arrow from Learn back to Search */}
        <div className="relative mt-3">
          <svg className="w-full h-10" viewBox="-100 0 1000 40" preserveAspectRatio="xMidYMid meet">
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                <path d="M0,1 L0,7 L6,4 Z" fill="#60a5fa" />
              </marker>
            </defs>
            <path
              d="M 880 5 L 880 25 Q 880 35, 870 35 L -70 35 Q -80 35, -80 25 L -80 5"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="3"
              strokeLinecap="round"
              markerEnd="url(#arrowhead)"
            />
          </svg>
          <span className="absolute left-1/2 -translate-x-1/2 bottom-0 text-sm font-medium text-blue-500 bg-white px-3 py-0.5 rounded-full border border-blue-200">
            ongoing learning loop
          </span>
        </div>
      </div>

      {/* Mobile: Vertical flow */}
      <div className="md:hidden space-y-3">
        {steps.map((step, index) => (
          <div key={step.label} className="flex flex-col items-center">
            <div className="flex items-center gap-4 w-full bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xl flex-shrink-0">
                {step.icon}
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900">{step.label}</span>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className="my-1 text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            )}
          </div>
        ))}
        {/* Repeats indicator */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 bg-white px-3 py-0.5 rounded-full border border-blue-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            ongoing learning loop
          </span>
        </div>
      </div>

      {/* The Bigger Picture */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">💡</span>
          <h4 className="text-md font-semibold text-gray-900">The Bigger Picture</h4>
        </div>
        <p className="text-sm text-gray-600">
          The agent is meant to be a self-improving system. It runs daily, learns from its successes and failures, and continuously expands its knowledge of Austin&apos;s AI community, all with minimal human intervention. The Observatory exists to give transparency into this process so people can see the agent isn&apos;t a black box.
        </p>
      </div>
    </div>
  );
}
