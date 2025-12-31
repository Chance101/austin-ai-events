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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-gray-600">
            <p>
              Automatically updated daily. Data sourced from local AI
              communities.
            </p>
            <div className="flex gap-4">
              <a href="/about" className="hover:text-gray-900">
                About
              </a>
              <a href="/submit" className="hover:text-gray-900">
                Submit Event
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
