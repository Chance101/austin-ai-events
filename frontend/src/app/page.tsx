import Link from "next/link";
import { fetchEventsServer } from "@/lib/supabase-server";
import EventListClient from "@/components/EventListClient";
import PageTracker from "@/components/PageTracker";
import { Event } from "@/types/event";

// ISR: Revalidate every 5 minutes
export const revalidate = 300;

function getEventLocation(event: Event): string {
  return event.venue_name || event.location || event.address || "Austin, TX";
}

function generateJsonLd(events: Event[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Austin AI Events",
    "description": "Upcoming AI meetups, workshops, and conferences in Austin, TX",
    "itemListElement": events.map((event, index) => ({
      "@type": "Event",
      "position": index + 1,
      "name": event.title,
      "startDate": event.start_time,
      "endDate": event.end_time || undefined,
      "location": {
        "@type": "Place",
        "name": getEventLocation(event),
        "address": event.address || "Austin, TX"
      },
      "description": event.description || undefined,
      "organizer": event.organizer ? {
        "@type": "Organization",
        "name": event.organizer
      } : undefined,
      "url": event.url,
      "isAccessibleForFree": event.is_free ?? undefined,
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode"
    }))
  };
}

export default async function Home() {
  const events = await fetchEventsServer();
  const jsonLd = generateJsonLd(events);

  return (
    <div className="min-h-screen">
      <PageTracker page="/" />

      {/* JSON-LD Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Austin AI Events
              </h1>
              <p className="mt-1 text-gray-600">
                Discover AI meetups, workshops, and conferences in Austin, TX
              </p>
            </div>
            <Link
              href="/observatory"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Observatory
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <EventListClient initialEvents={events} />
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-sm text-gray-600">
            This calendar runs itself. An autonomous AI agent running Claude Opus 4.5 discovers, validates, and curates Austin&apos;s AI events daily—no humans required. Built with Claude Code.
          </p>
        </div>
      </footer>
    </div>
  );
}
