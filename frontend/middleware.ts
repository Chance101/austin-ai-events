import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const AI_BOT_PATTERNS = [
  /GPTBot/i,
  /ChatGPT/i,
  /ClaudeBot/i,
  /Claude-Web/i,
  /Anthropic/i,
  /Google-Extended/i,
  /CCBot/i,
  /PerplexityBot/i,
  /Bytespider/i,
  /Amazonbot/i,
  /cohere-ai/i,
  /Manus-User/i,
];

function isAICrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return AI_BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent');

  if (isAICrawler(userAgent)) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Fire and forget — don't block the response
    supabase.from('page_views').insert({
      page: request.nextUrl.pathname,
      visitor_type: 'bot',
      user_agent: userAgent,
    }).then(() => {});
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/',
};
