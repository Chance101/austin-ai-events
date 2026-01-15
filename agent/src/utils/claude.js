import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client = null;

export function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

/**
 * Extract location information from an event image using Claude's vision
 * This is used as a fallback when structured venue/address data is missing
 * @param {string} imageUrl - URL of the event image to analyze
 * @returns {Object} Location info extracted from image, or null if not found
 */
export async function extractLocationFromImage(imageUrl) {
  if (!imageUrl) return null;

  const anthropic = getClient();

  try {
    // Fetch the image and convert to base64
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`    Could not fetch image: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Determine media type
    let mediaType = 'image/jpeg';
    if (contentType.includes('png')) mediaType = 'image/png';
    else if (contentType.includes('gif')) mediaType = 'image/gif';
    else if (contentType.includes('webp')) mediaType = 'image/webp';

    const message = await anthropic.messages.create({
      model: config.claudeModel,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Look at this event promotional image/banner. Extract any location information visible in the image.

Respond with JSON only:
{
  "city": string | null,      // City name if visible (e.g., "Austin", "San Antonio", "Killeen")
  "state": string | null,     // State if visible (e.g., "TX", "Texas")
  "venue": string | null,     // Venue name if visible
  "address": string | null,   // Street address if visible
  "found": boolean            // true if any location info was found
}

Look for location text in banners, headers, footers, or any text overlays on the image.
Return {"found": false} if no location information is visible.`,
          },
        ],
      }],
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (result.found) {
        console.log(`    📷 Extracted location from image: ${result.city || result.venue || 'partial info'}`);
        return result;
      }
    }
  } catch (e) {
    console.log(`    Could not analyze image: ${e.message}`);
  }

  return null;
}

/**
 * Use Claude to determine if a potential event is legitimate and relevant
 * @param {Object} eventData - The event data to validate
 * @param {Object} runStats - Optional run stats object (tracking done at call site)
 */
export async function validateEvent(eventData, runStats = null) {
  const anthropic = getClient();
  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  const prompt = `You are evaluating whether a potential event is a legitimate, in-person AI/ML event in Austin, TX.

Today's date is: ${today}

Event data:
${JSON.stringify(eventData, null, 2)}

Evaluate this event and respond with a JSON object:
{
  "isValid": boolean,        // true if this is a real, upcoming, in-person AI/ML event in Austin
  "confidence": number,      // 0-1 confidence score
  "reason": string,          // brief explanation
  "concerns": string[]       // any red flags or concerns
}

CRITICAL - AI/ML Focus Requirement:
This event must be SPECIFICALLY about AI, machine learning, or LLMs. The event should focus on one or more of:
- Artificial Intelligence (AI) or Machine Learning (ML)
- Large Language Models (LLMs), GPT, Claude, Gemini, etc.
- Generative AI, ChatGPT, Midjourney, Stable Diffusion
- Neural networks, deep learning, transformers
- NLP (Natural Language Processing) or Computer Vision with AI focus
- AI agents, RAG, embeddings, vector databases
- AI ethics, policy, safety, or alignment
- Data science WITH explicit AI/ML applications

REJECT events that are general tech without AI focus:
- General programming (Python, JavaScript, etc.) without AI application
- Data engineering, ETL, databases (unless AI-specific like vector DBs)
- DevOps, cloud infrastructure, Kubernetes
- IoT, hardware, Raspberry Pi, Arduino (unless AI at the edge)
- Web development, mobile apps
- Cybersecurity (unless AI-focused)
- General networking or career events

Other validation criteria:
- Is the date in the future (after ${today})?
- Does it appear to be a legitimate event (not spam, not a job posting)?
- Events scheduled months in advance are normal for recurring meetups - do NOT reject events in ${currentYear} or ${nextYear} as "too far in the future"

CRITICAL - Location Verification:
The event MUST be physically located in Austin, TX or the immediate Austin metro area (Travis, Williamson, Hays counties).

IMPORTANT: You MUST verify the location based on venue_name or address fields in the event data, NOT based on the organizer name. An organization named "Austin AI Alliance" or similar does NOT mean the event is in Austin - they may host events in other cities.

- If venue_name and address are both null/empty, set isValid to FALSE with reason "No venue/address provided - cannot verify Austin location"
- If the address shows a city other than Austin (e.g., San Antonio, Houston, Dallas, San Marcos, New Braunfels), reject it
- Virtual-only events should be rejected (this calendar is for in-person Austin events)
- "Austin area" or "Greater Austin" is acceptable; cities 50+ miles away are NOT`;

  const message = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content[0].text;

  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse Claude response:', e);
  }

  return { isValid: false, confidence: 0, reason: 'Failed to parse response', concerns: [] };
}

/**
 * Use Claude to classify an event by audience and technical level
 * @param {Object} eventData - The event data to classify
 * @param {Object} runStats - Optional run stats object (tracking done at call site)
 */
export async function classifyEvent(eventData, runStats = null) {
  const anthropic = getClient();

  const prompt = `Classify this AI/ML event and create a clean summary.

Event:
Title: ${eventData.title}
Description: ${eventData.description || 'No description'}
Organizer: ${eventData.organizer || 'Unknown'}

Respond with a JSON object:
{
  "audienceType": string[],     // array from: "developers", "business", "researchers", "general", "students"
  "technicalLevel": string,     // one of: "beginner", "intermediate", "advanced", "all-levels"
  "isFree": boolean | null,     // true, false, or null if unknown
  "summary": string,            // 1-2 sentence clean summary of what the event is about (no URLs, no markdown, no registration info)
  "reasoning": string           // brief explanation of classification
}

Guidelines for classification:
- Most meetups are "all-levels" unless specifically advanced
- Hackathons are typically "developers" + "intermediate" or "advanced"
- Networking events are often "general" or "business"
- Academic talks are "researchers" + "advanced"
- Workshops can vary - look for skill level indicators

Guidelines for summary:
- Write 1-2 clear sentences about what attendees will learn or experience
- Focus on the topic/content, not logistics like registration links or seat limits
- Remove any markdown formatting, URLs, or promotional language
- If it's a technical talk, mention the key topics covered
- Make it readable and informative for someone scanning event listings`;

  const message = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content[0].text;

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse Claude classification:', e);
  }

  // Default classification
  return {
    audienceType: ['general'],
    technicalLevel: 'all-levels',
    isFree: null,
    summary: null,
    reasoning: 'Default classification due to parsing error',
  };
}

/**
 * Use Claude to determine if two events are duplicates
 * @param {Object} event1 - First event to compare
 * @param {Object} event2 - Second event to compare
 * @param {Object} runStats - Optional run stats object (tracking done at call site)
 */
export async function checkDuplicate(event1, event2, runStats = null) {
  const anthropic = getClient();

  const prompt = `Determine if these two events are the same event (duplicates).

Event 1:
- Title: ${event1.title}
- Date: ${event1.start_time}
- Location: ${event1.venue_name || event1.location || 'Unknown'}
- URL: ${event1.url}

Event 2:
- Title: ${event2.title}
- Date: ${event2.start_time}
- Location: ${event2.venue_name || event2.location || 'Unknown'}
- URL: ${event2.url}

Respond with JSON:
{
  "isDuplicate": boolean,
  "confidence": number,  // 0-1
  "reason": string
}

Consider: Same event might have slightly different titles or be listed on multiple platforms.`;

  const message = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content[0].text;

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse duplicate check:', e);
  }

  return { isDuplicate: false, confidence: 0, reason: 'Failed to parse' };
}
