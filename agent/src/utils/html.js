/**
 * Decode HTML entities in a string
 * Handles both named entities (&amp;) and numeric entities (&#038;, &#x26;)
 * @param {string} str - The string to decode
 * @returns {string} The decoded string
 */
export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') {
    return str;
  }

  // Named entities (most common ones)
  const namedEntities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '\u2013',  // en-dash
    '&mdash;': '\u2014',  // em-dash
    '&lsquo;': '\u2018',  // left single quote
    '&rsquo;': '\u2019',  // right single quote
    '&ldquo;': '\u201C',  // left double quote
    '&rdquo;': '\u201D',  // right double quote
    '&hellip;': '\u2026', // ellipsis
    '&copy;': '\u00A9',   // copyright
    '&reg;': '\u00AE',    // registered
    '&trade;': '\u2122',  // trademark
  };

  // Replace named entities
  let result = str;
  for (const [entity, char] of Object.entries(namedEntities)) {
    result = result.split(entity).join(char);
  }

  // Replace numeric decimal entities (&#38;, &#8211;, etc.)
  result = result.replace(/&#(\d+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });

  // Replace numeric hex entities (&#x26;, &#x2019;, etc.)
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 16));
  });

  return result;
}
