"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ENTRY_FEE, MAX_TEAMS } from "@/types";

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Enter the Pool</h1>
            <p className="text-muted-foreground">
              Build your team to get started. Payment is collected after you
              finalize your picks.
            </p>
          </div>

          <div className="text-center">
            <div className="flex items-baseline justify-center gap-1 mb-1">
              <span className="text-4xl font-bold text-primary">
                ${ENTRY_FEE}
              </span>
              <span className="text-muted-foreground text-sm">.00</span>
            </div>
            <p className="text-sm text-muted-foreground">
              per team (max {MAX_TEAMS})
            </p>
          </div>

          <div className="border rounded-lg p-4 bg-muted/30">
            <h3 className="text-sm font-semibold mb-2">How it works:</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Build your team of 5 golfers across 4 tiers</li>
              <li>Review your picks and submit</li>
              <li>Complete $30 payment via Stripe</li>
              <li>Track your team on the live leaderboard</li>
            </ol>
          </div>

          <Button asChild className="w-full min-h-[44px] text-base">
            <Link href="/teams/builder">Build Your Team</Link>
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Secure payment processed by Stripe. Your team is only active after
            payment is confirmed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
