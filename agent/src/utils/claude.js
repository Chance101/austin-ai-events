import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

/**
 * Use Claude to determine if a potential event is legitimate and relevant
 */
export async function validateEvent(eventData) {
  const anthropic = getClient();
  const today = new Date().toISOString().split('T')[0];

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

Consider:
- Is this actually in Austin, TX (not virtual-only, not another city)?
- Is it related to AI, ML, data science, or adjacent tech topics?
- Does it appear to be a legitimate event (not spam, not a job posting)?
- Is the date in the future (after ${today})?
- Events scheduled months in advance are normal for recurring meetups - do NOT reject events just because they are in 2026 or later`;

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
 */
export async function classifyEvent(eventData) {
  const anthropic = getClient();

  const prompt = `Classify this AI/ML event by audience and technical level.

Event:
Title: ${eventData.title}
Description: ${eventData.description || 'No description'}
Organizer: ${eventData.organizer || 'Unknown'}

Respond with a JSON object:
{
  "audienceType": string[],     // array from: "developers", "business", "researchers", "general", "students"
  "technicalLevel": string,     // one of: "beginner", "intermediate", "advanced", "all-levels"
  "isFree": boolean | null,     // true, false, or null if unknown
  "reasoning": string           // brief explanation
}

Guidelines:
- Most meetups are "all-levels" unless specifically advanced
- Hackathons are typically "developers" + "intermediate" or "advanced"
- Networking events are often "general" or "business"
- Academic talks are "researchers" + "advanced"
- Workshops can vary - look for skill level indicators`;

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
    reasoning: 'Default classification due to parsing error',
  };
}

/**
 * Use Claude to determine if two events are duplicates
 */
export async function checkDuplicate(event1, event2) {
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
