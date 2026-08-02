import Link from "next/link";

export default function NotFound() { return <div className="shell py-24"><div className="card mx-auto max-w-xl p-10 text-center"><p className="eyebrow">404</p><h1 className="mt-4 text-3xl font-semibold">That page does not fit.</h1><p className="mt-4 text-ink/60">The route may have moved or the result only exists in another browser.</p><Link href="/" className="button-primary mt-7">Return home</Link></div></div>; }

