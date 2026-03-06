import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// AI crawler patterns
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

// General bot patterns (search engines, etc.)
const BOT_PATTERNS = [
  /HeadlessChrome/i,
  /vercel-screenshot/i,
  /Dataprovider/i,
  /Konqueror/i,
  /Nokia\d/i,
  /bot/i,
  /crawl/i,
  /spider/i,
  /Googlebot/i,
  /Bingbot/i,
  /Slurp/i,
  /DuckDuckBot/i,
  /Baiduspider/i,
  /YandexBot/i,
  /facebookexternalhit/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /WhatsApp/i,
  /Discordbot/i,
  /Slackbot/i,
  /TelegramBot/i,
  /Applebot/i,
  /PetalBot/i,
  /SemrushBot/i,
  /AhrefsBot/i,
  /MJ12bot/i,
  /DotBot/i,
  /Screaming Frog/i,
];

function detectVisitorType(userAgent: string | null): 'human' | 'bot' {
  if (!userAgent) return 'human';

  // Check AI bots first
  for (const pattern of AI_BOT_PATTERNS) {
    if (pattern.test(userAgent)) return 'bot';
  }

  // Check general bots
  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(userAgent)) return 'bot';
  }

  return 'human';
}

function isAIBot(userAgent: string | null): boolean {
  if (!userAgent) return false;

  for (const pattern of AI_BOT_PATTERNS) {
    if (pattern.test(userAgent)) return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const { page } = await request.json();

    if (!page) {
      return NextResponse.json({ error: 'Page is required' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent');
    const visitorType = detectVisitorType(userAgent);

    // Insert the page view
    await supabase.from('page_views').insert({
      page,
      visitor_type: visitorType,
      user_agent: userAgent,
    });

    // Get deduplicated human count (unique user_agent per day)
    const { data: humanData } = await supabase
      .rpc('get_unique_visitor_count', { p_page: page, p_type: 'human' });
    const humanCount = humanData ?? 0;

    // AI crawler count only (excludes general bots like vercel-screenshot)
    const { data: botData } = await supabase
      .rpc('get_ai_crawler_count', { p_page: page });
    const botCount = botData ?? 0;

    return NextResponse.json({
      humanCount,
      botCount,
      visitorType,
      isAI: isAIBot(userAgent),
    });
  } catch (error) {
    console.error('Error tracking page view:', error);
    return NextResponse.json({ error: 'Failed to track' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page');

    if (!page) {
      return NextResponse.json({ error: 'Page is required' }, { status: 400 });
    }

    // Get deduplicated human count (unique user_agent per day)
    const { data: humanData } = await supabase
      .rpc('get_unique_visitor_count', { p_page: page, p_type: 'human' });
    const humanCount = humanData ?? 0;

    // AI crawler count only (excludes general bots like vercel-screenshot)
    const { data: botData } = await supabase
      .rpc('get_ai_crawler_count', { p_page: page });
    const botCount = botData ?? 0;

    return NextResponse.json({
      humanCount,
      botCount,
    });
  } catch (error) {
    console.error('Error getting counts:', error);
    return NextResponse.json({ error: 'Failed to get counts' }, { status: 500 });
  }
}
