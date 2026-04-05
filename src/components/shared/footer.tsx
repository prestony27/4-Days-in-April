import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/50 mt-auto">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>&copy; 2026 Four Days in April</span>
            <span className="hidden sm:inline">|</span>
            <Link href="/rules" className="hover:text-foreground transition-colors">
              Rules
            </Link>
          </div>
          <p className="text-xs text-muted-foreground text-center sm:text-right">
            Not affiliated with Augusta National Golf Club.
          </p>
        </div>
      </div>
    </footer>
  );
}
