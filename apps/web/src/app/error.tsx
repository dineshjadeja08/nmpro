"use client";
export default function Error({ reset }: { reset: () => void }) { return <main className="container simple-page" role="alert"><h1>Page unavailable</h1><p>Please try again.</p><button className="button button-primary" onClick={reset}>Retry</button></main>; }
