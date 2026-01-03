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
      <h3 className="text-lg font-semibold text-gray-900 mb-2">How It Works</h3>
      <p className="text-sm text-gray-600 mb-6">
        This calendar is maintained by an AI agent that discovers and curates events automatically.
      </p>

      {/* Desktop: Horizontal flow */}
      <div className="hidden md:flex items-center justify-between">
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
      </div>
    </div>
  );
}
