import EventList from "@/components/EventList";

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Austin AI Events
            </h1>
            <p className="mt-1 text-gray-600">
              Discover AI meetups, workshops, and conferences in Austin, TX
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <EventList />
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-sm text-gray-600">
            This calendar runs itself. An autonomous AI agent running Claude Opus 4.5 discovers, validates, and curates Austin's AI events daily—no humans required. Built with Claude Code.
          </p>
        </div>
      </footer>
    </div>
  );
}
