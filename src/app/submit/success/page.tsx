"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { TIER_CONFIGS } from "@/types";

interface Golfer {
  id: string;
  name: string;
  world_rank: number;
  tier: number;
}

interface Team {
  id: string;
  team_name: string;
  contestant_name: string | null;
  payment_status: string;
  golfers: Golfer[];
}

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
  const teamIdsParam = searchParams.get("team_ids");

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Parse team IDs from URL params
  const teamIds = teamIdsParam
    ? teamIdsParam.split(",")
    : teamId
      ? [teamId]
      : [];

  useEffect(() => {
    if (teamIds.length === 0) {
      setLoading(false);
      return;
    }

    const fetchTeams = async () => {
      const fetchedTeams: Team[] = [];

      for (const id of teamIds) {
        try {
          const res = await fetch(`/api/teams/${id}`);
          if (res.ok) {
            const data = await res.json();
            fetchedTeams.push(data);
          }
        } catch {
          // Ignore fetch errors
        }
      }

      setTeams(fetchedTeams);
      setLoading(false);
    };

    fetchTeams();
  }, [teamIds.join(",")]);

  const totalAmount = teams.length * 30;
  const isPending = teams.some(t => t.payment_status === "pending");

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className={`flex items-center justify-center w-16 h-16 rounded-full mx-auto mb-4 ${isPending ? "bg-amber-100" : "bg-primary/10"}`}>
          <svg
            className={`w-8 h-8 ${isPending ? "text-amber-600" : "text-primary"}`}
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
        <h1 className="text-2xl font-bold mb-2">
          {teams.length > 1 ? `${teams.length} Teams Submitted!` : "Team Submitted!"}
        </h1>
        <p className="text-muted-foreground">
          {isPending
            ? `Your ${teams.length > 1 ? "entries have" : "entry has"} been received. Please complete your Venmo payment to confirm.`
            : `Your ${teams.length > 1 ? "teams are" : "team is"} locked in. Good luck in the tournament!`}
        </p>
      </div>

      {/* Team Details */}
      {loading ? (
        <Card className="mb-6">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Loading your team details...</p>
          </CardContent>
        </Card>
      ) : teams.length > 0 ? (
        <div className="space-y-4 mb-6">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{team.team_name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {TIER_CONFIGS.map((tc) => {
                    const tierGolfers = team.golfers.filter((g) => g.tier === tc.tier);
                    return (
                      <div key={tc.tier} className="flex items-start gap-2">
                        <Badge variant="outline" className="shrink-0 w-16 justify-center">
                          Tier {tc.tier}
                        </Badge>
                        <div className="text-sm">
                          {tierGolfers.map((g, i) => (
                            <span key={g.id}>
                              {g.name}
                              <span className="text-muted-foreground"> #{g.world_rank}</span>
                              {i < tierGolfers.length - 1 && ", "}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Payment Summary */}
          <Card className={isPending ? "bg-amber-50 border-amber-200" : "bg-muted/50"}>
            <CardContent className="py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{isPending ? "Amount Due" : "Total Paid"}</span>
                  {isPending && (
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                      Payment Pending
                    </Badge>
                  )}
                </div>
                <span className="font-bold text-lg">${totalAmount}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {teams.length} team{teams.length > 1 ? "s" : ""} x $30
              </p>
            </CardContent>
          </Card>

          {/* Venmo Reminder for pending payments */}
          {isPending && (
            <Card className="border-amber-200">
              <CardContent className="py-4">
                <p className="text-sm font-medium mb-2">Complete your payment via Venmo:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Send ${totalAmount} to <strong>@pyoung</strong></li>
                  <li>For the note, enter <strong>&quot;gift&quot;</strong></li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="mb-6">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Your teams are being processed. Check the leaderboard to see your entries.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button asChild className="min-h-[44px]">
          <Link href="/teams/builder">Build Another Team</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-[44px]">
          <Link href="/leaderboard">View Leaderboard</Link>
        </Button>
      </div>
    </div>
  );
}
