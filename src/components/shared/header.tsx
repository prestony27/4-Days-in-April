"use client";

import Link from "next/link";
import { useState } from "react";
import { CountdownTimer } from "./countdown-timer";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/rankings", label: "Rankings" },
  { href: "/teams/builder", label: "Build Team" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-brand-green text-white">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo / Title */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-bold tracking-tight">
              Four Days in April
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/80 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Countdown (desktop) */}
          <div className="hidden md:flex items-center gap-2 text-white/90">
            <span className="text-xs uppercase tracking-wider text-white font-medium">
              Deadline:
            </span>
            <CountdownTimer compact />
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Toggle menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {menuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="md:hidden mt-3 pb-2 border-t border-white/20 pt-3 flex flex-col gap-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 min-h-[44px] flex items-center text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="px-3 pt-2 flex items-center gap-2 text-white/90">
              <span className="text-xs uppercase tracking-wider text-white font-medium">
                Deadline:
              </span>
              <CountdownTimer compact />
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
