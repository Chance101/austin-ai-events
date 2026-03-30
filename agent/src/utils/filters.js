/**
 * Quick sanity check for Austin location - runs for ALL events regardless of trust tier
 * This is a fast string-based check that doesn't require Claude API calls
 * Returns: { isAustin: true/false/null, reason: string }
 *   true  = definitely Austin (matched Austin indicator)
 *   false = definitely NOT Austin (matched non-Austin city)
 *   null  = uncertain (no match either way, needs Claude verification)
 */
export function checkAustinLocation(event) {
  const venueOrAddress = [event.venue_name, event.address, event.location, event.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Known non-Austin cities that events might be from
  const nonAustinCities = [
    'san antonio', 'houston', 'dallas', 'fort worth', 'san marcos',
    'new braunfels', 'san francisco', 'los angeles', 'new york',
    'chicago', 'seattle', 'denver', 'boston', 'atlanta', 'miami',
    'phoenix', 'portland', 'washington dc', 'philadelphia', 'london',
    'virtual', 'online only', 'webinar', 'remote', 'zoom only',
    'killeen', 'waco', 'college station', 'corpus christi', 'el paso',
    'lubbock', 'amarillo', 'brownsville', 'laredo', 'mcallen',
  ];

  // Check for explicit non-Austin locations
  for (const city of nonAustinCities) {
    if (venueOrAddress.includes(city)) {
      return { isAustin: false, reason: `Location appears to be in ${city}, not Austin` };
    }
  }

  // Austin area indicators
  const austinIndicators = [
    'austin', 'atx', 'tx 78', '787', 'travis county', 'williamson county',
    'hays county', 'round rock', 'cedar park', 'pflugerville',
    'leander', 'georgetown', 'dripping springs', 'lakeway', 'bee cave',
    'capital factory', 'domain', 'downtown austin', 'south congress',
    'east austin', 'soco', '6th street', 'rainey street', 'ut austin',
    'university of texas', 'acc ', 'st. edwards', 'concordia',
    'sxsw', 'south lamar', 'mueller', 'zilker', 'shoal creek',
    'south austin', 'north austin', 'west lake', 'westlake',
    'brushy creek', 'jollyville', 'manor rd', 'burnet rd',
    'south first', 'congress ave', 'lamar blvd',
  ];

  // If venue/address is provided, check for Austin indicators
  if (venueOrAddress.length > 3) {
    for (const indicator of austinIndicators) {
      if (venueOrAddress.includes(indicator)) {
        return { isAustin: true, reason: 'Location matches Austin area' };
      }
    }
    // Has location data but no definitive match either way - uncertain
    return { isAustin: null, reason: 'Location provided but no Austin indicators found — needs verification' };
  }

  // No location data at all - will need Claude validation
  return { isAustin: null, reason: 'No location data to verify' };
}

/**
 * Check if a title looks malformed (CSS, HTML, or garbage)
 * Returns true if title appears invalid
 */
export function isMalformedTitle(title) {
  if (!title) return true;

  const malformedPatterns = [
    /^\s*\.\w+[-\w]*\s*\{/,           // CSS class definitions: .class-name {
    /position\s*:\s*relative/i,        // CSS property
    /display\s*:\s*block/i,            // CSS property
    /^\s*<\w+/,                        // HTML tags
    /^\s*\[\w+\]/,                     // Attribute selectors
    /^\s*#[\w-]+\s*\{/,                // CSS ID selectors
    /&:hover/,                         // CSS pseudo-selectors
    /^\s*@media/i,                     // CSS media queries
    /^\s*@import/i,                    // CSS imports
    /^\s*function\s*\(/,               // JavaScript
    /^\s*const\s+\w+/,                 // JavaScript
    /^\s*var\s+\w+/,                   // JavaScript
    /[{}]{2,}/,                        // Multiple braces
  ];

  for (const pattern of malformedPatterns) {
    if (pattern.test(title)) {
      return true;
    }
  }

  // Title is mostly non-alphanumeric
  const alphanumeric = title.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumeric.length < title.length * 0.3) {
    return true;
  }

  return false;
}
