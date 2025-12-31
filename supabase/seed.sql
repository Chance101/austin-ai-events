-- Seed data for development and testing
-- Run this after schema.sql to populate sample events

INSERT INTO events (title, description, start_time, end_time, venue_name, address, url, source, source_event_id, audience_type, technical_level, is_free, organizer, is_verified)
VALUES
  (
    'Austin AI Meetup: Introduction to LLMs',
    'Join us for an introduction to Large Language Models. We''ll cover the basics of how LLMs work, popular models like GPT and Claude, and practical applications. Perfect for beginners looking to understand the AI landscape.',
    NOW() + INTERVAL '7 days',
    NOW() + INTERVAL '7 days' + INTERVAL '2 hours',
    'Capital Factory',
    '701 Brazos St, Austin, TX 78701',
    'https://meetup.com/austin-ai/events/intro-llm',
    'manual',
    'seed-event-1',
    ARRAY['developers', 'general']::audience_type[],
    'beginner',
    true,
    'Austin AI Community',
    true
  ),
  (
    'Advanced RAG Workshop: Building Production Systems',
    'Deep dive into Retrieval Augmented Generation techniques for production applications. We''ll cover vector databases, chunking strategies, hybrid search, and evaluation metrics.',
    NOW() + INTERVAL '10 days',
    NOW() + INTERVAL '10 days' + INTERVAL '3 hours',
    'WeWork Congress',
    '600 Congress Ave, Austin, TX 78701',
    'https://meetup.com/austin-langchain/events/rag-workshop',
    'austin-langchain',
    'seed-event-2',
    ARRAY['developers']::audience_type[],
    'advanced',
    false,
    'Austin LangChain',
    true
  ),
  (
    'AI in Business: Executive Roundtable',
    'A discussion forum for business leaders exploring AI adoption strategies. Learn from peers who have successfully implemented AI solutions in their organizations.',
    NOW() + INTERVAL '5 days',
    NOW() + INTERVAL '5 days' + INTERVAL '90 minutes',
    'Austin Tech Council',
    '815 Brazos St, Austin, TX 78701',
    'https://lu.ma/ai-exec-roundtable',
    'aitx',
    'seed-event-3',
    ARRAY['business']::audience_type[],
    'all-levels',
    true,
    'AITX',
    true
  ),
  (
    'HackAI Austin: 24-Hour AI Hackathon',
    'Build innovative AI applications in 24 hours! Teams will compete to create the most impactful AI solution. Prizes for top 3 teams. Food and drinks provided.',
    NOW() + INTERVAL '21 days',
    NOW() + INTERVAL '22 days',
    'UT Austin Gates Dell Complex',
    '2317 Speedway, Austin, TX 78712',
    'https://meetup.com/hack-ai/events/hackathon-jan',
    'hackai',
    'seed-event-4',
    ARRAY['developers', 'students']::audience_type[],
    'intermediate',
    true,
    'HackAI',
    true
  ),
  (
    'Machine Learning Paper Reading Group',
    'Weekly paper reading group focused on recent ML research. This week: "Attention Is All You Need" - the transformer paper that started it all.',
    NOW() + INTERVAL '3 days',
    NOW() + INTERVAL '3 days' + INTERVAL '90 minutes',
    'Online + UT Campus',
    'GDC 6.302, UT Austin',
    'https://ai.utexas.edu/events/paper-reading',
    'ut-austin',
    'seed-event-5',
    ARRAY['researchers', 'students']::audience_type[],
    'advanced',
    true,
    'UT Austin AI Lab',
    true
  ),
  (
    'AI Automation for Marketing Teams',
    'Learn how to leverage AI tools to automate your marketing workflows. Hands-on workshop covering content generation, analytics, and campaign optimization.',
    NOW() + INTERVAL '12 days',
    NOW() + INTERVAL '12 days' + INTERVAL '2 hours',
    'Industrious Downtown',
    '823 Congress Ave, Austin, TX 78701',
    'https://meetup.com/ai-marketing/events/automation-workshop',
    'ai-automation',
    'seed-event-6',
    ARRAY['business']::audience_type[],
    'beginner',
    false,
    'AI Automation & Marketing',
    true
  ),
  (
    'AICamp Austin: Monthly Networking',
    'Our monthly networking event for AI practitioners in Austin. Lightning talks, demos, and plenty of time to connect with fellow AI enthusiasts.',
    NOW() + INTERVAL '14 days',
    NOW() + INTERVAL '14 days' + INTERVAL '3 hours',
    'The Pershing',
    '311 E 5th St, Austin, TX 78701',
    'https://aicamp.ai/event/austin-monthly',
    'aicamp',
    'seed-event-7',
    ARRAY['developers', 'business', 'general']::audience_type[],
    'all-levels',
    true,
    'AICamp',
    true
  ),
  (
    'Building AI Agents with Claude',
    'Workshop on building autonomous AI agents using Claude''s tool use capabilities. We''ll build a real agent from scratch.',
    NOW() + INTERVAL '17 days',
    NOW() + INTERVAL '17 days' + INTERVAL '2 hours',
    'Capital Factory',
    '701 Brazos St, Austin, TX 78701',
    'https://meetup.com/austin-langchain/events/claude-agents',
    'austin-langchain',
    'seed-event-8',
    ARRAY['developers']::audience_type[],
    'intermediate',
    true,
    'Austin LangChain',
    true
  );

-- Verify seed data
SELECT
  title,
  source,
  technical_level,
  audience_type,
  start_time::date as event_date
FROM events
ORDER BY start_time;
