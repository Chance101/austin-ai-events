'use client';

import { AudienceType, TechnicalLevel, EventFilters as Filters } from '@/types/event';

interface EventFiltersProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
}

const audienceOptions: { value: AudienceType; label: string }[] = [
  { value: 'developers', label: 'Developers' },
  { value: 'business', label: 'Business' },
  { value: 'researchers', label: 'Researchers' },
  { value: 'general', label: 'General' },
  { value: 'students', label: 'Students' },
];

const levelOptions: { value: TechnicalLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all-levels', label: 'All Levels' },
];

export default function EventFilters({ filters, onFilterChange }: EventFiltersProps) {
  const toggleAudience = (audience: AudienceType) => {
    const current = filters.audience || [];
    const updated = current.includes(audience)
      ? current.filter((a) => a !== audience)
      : [...current, audience];
    onFilterChange({ ...filters, audience: updated.length ? updated : undefined });
  };

  const toggleLevel = (level: TechnicalLevel) => {
    const current = filters.technicalLevel || [];
    const updated = current.includes(level)
      ? current.filter((l) => l !== level)
      : [...current, level];
    onFilterChange({ ...filters, technicalLevel: updated.length ? updated : undefined });
  };

  const toggleFree = () => {
    onFilterChange({
      ...filters,
      isFree: filters.isFree === undefined ? true : undefined,
    });
  };

  const clearFilters = () => {
    onFilterChange({});
  };

  const hasActiveFilters =
    (filters.audience?.length || 0) > 0 ||
    (filters.technicalLevel?.length || 0) > 0 ||
    filters.isFree !== undefined;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Audience</h3>
          <div className="flex flex-wrap gap-2">
            {audienceOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleAudience(option.value)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  filters.audience?.includes(option.value)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Technical Level</h3>
          <div className="flex flex-wrap gap-2">
            {levelOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleLevel(option.value)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  filters.technicalLevel?.includes(option.value)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button
            onClick={toggleFree}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              filters.isFree
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
            }`}
          >
            Free Events Only
          </button>
        </div>
      </div>
    </div>
  );
}
