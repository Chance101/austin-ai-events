'use client';

import { useState, useRef, FormEvent } from 'react';

type FormState = 'idle' | 'open' | 'submitting' | 'success' | 'error';

export default function FeedbackButton() {
  const [state, setState] = useState<FormState>('idle');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const urlInputRef = useRef<HTMLInputElement>(null);

  const handleOpen = () => {
    setState('open');
    // Focus the URL input after the form renders
    setTimeout(() => urlInputRef.current?.focus(), 50);
  };

  const handleClose = () => {
    setState('idle');
    setUrl('');
    setNotes('');
    setHoneypot('');
    setErrorMessage('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!url.trim()) {
      setErrorMessage('Please enter a URL.');
      return;
    }

    try {
      new URL(url.trim());
    } catch {
      setErrorMessage('Please enter a valid URL (e.g. https://...)');
      return;
    }

    setState('submitting');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          notes: notes.trim() || undefined,
          website: honeypot,
        }),
      });

      if (response.ok) {
        setState('success');
        setUrl('');
        setNotes('');
        setHoneypot('');
        setTimeout(handleClose, 3000);
      } else if (response.status === 429) {
        setErrorMessage("You've submitted several already today — thank you!");
        setState('open');
      } else {
        const data = await response.json();
        setErrorMessage(data.error || 'Something went wrong.');
        setState('open');
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
      setState('open');
    }
  };

  if (state === 'idle') {
    return (
      <div className="text-center pt-6">
        <button
          onClick={handleOpen}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2 decoration-gray-300 dark:decoration-gray-600 hover:decoration-gray-500 dark:hover:decoration-gray-400 transition-colors cursor-pointer"
        >
          Missing an event?
        </button>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="text-center pt-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Thanks, we&apos;ll check it out.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-6 max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Know of an Austin AI event we&apos;re missing?
        </p>

        <div>
          <label htmlFor="feedback-url" className="sr-only">
            Event URL
          </label>
          <input
            ref={urlInputRef}
            id="feedback-url"
            type="url"
            placeholder="Event URL"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (errorMessage) setErrorMessage('');
            }}
            required
            className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {errorMessage && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="feedback-notes" className="sr-only">
            Anything else
          </label>
          <textarea
            id="feedback-notes"
            placeholder="Anything else? (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Honeypot field — invisible to humans, attracts bots */}
        <div
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px' }}
        >
          <label htmlFor="feedback-website">Website</label>
          <input
            id="feedback-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={state === 'submitting'}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {state === 'submitting' ? 'Submitting...' : 'Submit'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
