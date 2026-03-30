import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// In-memory rate limiting: IP -> timestamps of submissions
const rateLimitMap = new Map<string, number[]>();

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_MAX = 3;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];

  // Remove entries older than the window
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(ip, recent);

  return recent.length >= RATE_LIMIT_MAX;
}

function recordSubmission(ip: string): void {
  const timestamps = rateLimitMap.get(ip) || [];
  timestamps.push(Date.now());
  rateLimitMap.set(ip, timestamps);
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, notes, website } = body;

    // Honeypot: if the hidden "website" field is filled, a bot submitted this.
    // Return success to avoid tipping off the bot, but don't store anything.
    if (website) {
      return NextResponse.json({ success: true });
    }

    // Validate required field
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return NextResponse.json(
        { error: 'Event URL is required.' },
        { status: 400 }
      );
    }

    // Validate URL format
    if (!isValidUrl(url.trim())) {
      return NextResponse.json(
        { error: 'Please enter a valid URL.' },
        { status: 400 }
      );
    }

    // Rate limiting by IP
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    // Insert into feedback_missed_events
    const { error } = await supabase.from('feedback_missed_events').insert({
      url: url.trim(),
      notes: notes && typeof notes === 'string' ? notes.trim() || null : null,
    });

    if (error) {
      console.error('Error inserting feedback:', error);
      return NextResponse.json(
        { error: 'Something went wrong. Please try again.' },
        { status: 500 }
      );
    }

    recordSubmission(ip);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
