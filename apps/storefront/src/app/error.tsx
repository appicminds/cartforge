"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="sf-container flex flex-col items-center py-24 text-center">
      <h1 className="text-3xl md:text-4xl">Something went wrong</h1>
      <p className="mt-4 max-w-md text-muted">
        We couldn’t load this page. Please try again in a moment.
      </p>
      <button type="button" onClick={reset} className="sf-button mt-8">
        Try again
      </button>
    </div>
  );
}
