"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const teamId = searchParams.get("team_id");

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card className="text-center">
        <CardContent className="pt-8 pb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Team Submitted!</h1>
          <p className="text-muted-foreground mb-6">
            Your payment has been confirmed and your team is locked in. Good
            luck in the tournament!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild className="min-h-[44px]">
              <Link href="/teams/builder">Build Another Team</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-[44px]">
              <Link href="/leaderboard">View Leaderboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
