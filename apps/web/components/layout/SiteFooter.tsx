import { Wordmark } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line py-10">
      <div className="shell flex flex-col gap-4 text-sm text-ink/60 sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <p>Open-source architecture planning for domain-aligned AI.</p>
      </div>
    </footer>
  );
}
