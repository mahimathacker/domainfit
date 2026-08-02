import Link from "next/link";

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-3 font-bold tracking-tight" aria-label="DomainFit home">
      <span className="grid size-9 place-items-center rounded-xl bg-ink text-sm text-lime">DF</span>
      <span>DomainFit</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-canvas/90 backdrop-blur">
      <div className="shell flex min-h-20 items-center justify-between gap-6">
        <Wordmark />
        <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm font-medium sm:gap-7">
          <Link href="/methodology" className="hover:text-moss">Methodology</Link>
          <Link href="/compare" className="hidden hover:text-moss sm:block">Compare</Link>
          <Link href="/planner" className="button-primary !min-h-10 !px-5">Plan yours</Link>
        </nav>
      </div>
    </header>
  );
}
