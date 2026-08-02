"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="shell py-24"><div className="card mx-auto max-w-xl p-10 text-center"><h1 className="text-3xl font-semibold">Something went wrong</h1><p className="mt-4 text-ink/60">Your planner draft is saved locally. Try loading this page again.</p><button className="button-primary mt-7" onClick={reset}>Try again</button></div></div>; }

