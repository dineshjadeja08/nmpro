"use client";
export default function Error({ reset }: { reset: () => void }) { return <main role="alert" style={{ padding: 32 }}><h1>Workspace unavailable</h1><button onClick={reset}>Retry</button></main>; }
