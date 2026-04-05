import Link from "next/link";
import { CountdownTimer } from "@/components/shared/countdown-timer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ENTRY_FEE, MAX_TEAMS, TIER_CONFIGS } from "@/types";

const RULES_SUMMARY = [
  {
    title: "Pick Your Golfers",
    description: "Select 5 golfers across 4 tiers based on World Golf Rankings.",
  },
  {
    title: "Lowest Score Wins",
    description:
      "Your team's combined score to par determines your rank. Lowest wins.",
  },
  {
    title: "No Duplicate Golfers",
    description: `Enter up to ${MAX_TEAMS} teams at $${ENTRY_FEE} each. No golfer can appear on more than one of your teams.`,
  },
  {
    title: "Live Leaderboard",
    description:
      "Track your team's performance in real-time during the tournament.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative bg-brand-green text-white">
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24 text-center">
          <Badge className="mb-4 bg-brand-yellow text-brand-green-dark font-semibold">
            April 9-12, 2026
          </Badge>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
            Four Days in April
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-8">
            Pick your golfers. Build your team. Compete for cash prizes in the
            2026 tournament.
          </p>

          {/* Countdown */}
          <div className="mb-8">
            <p className="text-sm uppercase tracking-wider text-white/60 mb-3">
              Submission Deadline
            </p>
            <div className="flex justify-center">
              <CountdownTimer />
            </div>
            <p className="text-sm text-white/60 mt-2">
              5:00 AM EST, Thursday, April 9th
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-brand-yellow text-brand-green-dark hover:bg-brand-yellow/90 font-semibold min-h-[44px] text-base"
            >
              <Link href="/teams/builder">Build Your Team</Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="border-2 border-white bg-transparent text-white hover:bg-white/20 min-h-[44px] text-base font-semibold"
            >
              <Link href="/leaderboard">View Leaderboard</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">
          How It Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {RULES_SUMMARY.map((rule, i) => (
            <Card key={i} className="border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {i + 1}
                  </span>
                  <h3 className="font-semibold">{rule.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {rule.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="max-w-6xl mx-auto" />

      {/* Tier Breakdown */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">
          Tier Breakdown
        </h2>
        <p className="text-center text-muted-foreground mb-8">
          Build a team of 5 golfers across 4 World Golf Ranking tiers
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {TIER_CONFIGS.map((tc) => (
            <Card
              key={tc.tier}
              className="text-center border-primary/20 hover:border-primary/40 transition-colors"
            >
              <CardContent className="pt-6">
                <Badge variant="outline" className="mb-2 border-primary text-primary">
                  {tc.label}
                </Badge>
                <p className="text-2xl font-bold text-primary">
                  Rank {tc.rankRange}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Pick {tc.pickCount} golfer{tc.pickCount > 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="max-w-6xl mx-auto" />

      {/* Entry Info */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Entry Details</h2>
          <div className="flex items-baseline justify-center gap-1 mb-2">
            <span className="text-5xl font-bold text-primary">${ENTRY_FEE}</span>
            <span className="text-muted-foreground">per team</span>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            Up to {MAX_TEAMS} teams per person. Prize distribution: 50% / 30% / 20%.
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            Not-for-profit. Entry fees cover operational costs only — the rest goes to prizes.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-primary hover:bg-primary/90 min-h-[44px] text-base"
          >
            <Link href="/teams/builder">Get Started</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
