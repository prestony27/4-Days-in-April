"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/shared/tier-badge";
import { CountdownTimer } from "@/components/shared/countdown-timer";
import Link from "next/link";
import type { LeaderboardResponse, LeaderboardGolfer, Tier } from "@/types";

interface LeaderboardApiResponse extends LeaderboardResponse {
  locked?: boolean;
  unlocks_at?: string;
}

async function fetchLeaderboard(): Promise<LeaderboardApiResponse> {
  const res = await fetch("/api/leaderboard");
  if (!res.ok) throw new Error("Failed to fetch leaderboard");
  return res.json();
}

function formatScore(score: number | null): string {
  if (score === null) return "-";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "STATUS_CUT":
      return <Badge variant="secondary" className="text-xs">CUT</Badge>;
    case "STATUS_WITHDRAWN":
      return <Badge variant="destructive" className="text-xs">WD</Badge>;
    case "STATUS_DISQUALIFIED":
      return <Badge variant="destructive" className="text-xs">DQ</Badge>;
    default:
      return null;
  }
}

export default function LeaderboardPage() {
  const [searchFilter, setSearchFilter] = useState("");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 120_000, // 2 minutes - data updates via cron every 10 min
    refetchOnWindowFocus: true,
  });

  const teams = data?.teams ?? [];
  const lastUpdated = data?.last_updated;
  const isPreDeadline = !isLoading && data && data.locked === false;

  const filteredTeams = searchFilter
    ? teams.filter(
        (t) =>
          t.contestant_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
          t.team_name.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : teams;

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">
          {isPreDeadline ? "Entries" : "Leaderboard"}
        </h1>
        {isPreDeadline ? (
          <>
            <p className="text-muted-foreground mb-3">
              Team picks will be revealed when submissions close
            </p>
            <div className="inline-block bg-primary/10 rounded-lg px-4 py-2">
              <CountdownTimer />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-sm text-green-600 font-medium">LIVE</span>
              </div>
            </div>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-2">
                Last updated: {new Date(lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </>
        )}
      </div>

      {/* Filter */}
      <div className="mb-6 max-w-sm mx-auto">
        <Input
          type="search"
          placeholder="Search by team or contestant name"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="min-h-[44px]"
        />
      </div>

      {isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          Loading leaderboard...
        </div>
      )}

      {error && (
        <div className="text-center py-12 text-destructive">
          Failed to load leaderboard. Please try again.
        </div>
      )}

      {!isLoading && !error && filteredTeams.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {searchFilter
            ? "No teams found matching your search."
            : "No teams submitted yet."}
        </div>
      )}

      {/* Team List */}
      {!isLoading && !error && filteredTeams.length > 0 && (
        <div className="space-y-2">
          {filteredTeams.map((team) => {
            const isExpanded = expandedTeams.has(team.team_id);
            const isDQ = team.status === "disqualified";

            // Pre-deadline: simplified card without scores/expand
            if (isPreDeadline) {
              return (
                <Card key={team.team_id} className="overflow-hidden">
                  <div className="p-4 min-h-[56px] flex items-center gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{team.team_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {team.contestant_name}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            }

            // Post-deadline: full expandable card with scores
            return (
              <Card
                key={team.team_id}
                className={`overflow-hidden transition-colors ${
                  isDQ ? "opacity-60 border-destructive/30" : ""
                }`}
              >
                {/* Team Row */}
                <button
                  className="w-full text-left p-4 min-h-[56px] flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors"
                  onClick={() => toggleTeam(team.team_id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`font-bold text-lg w-8 text-center shrink-0 ${
                        team.rank <= 3 ? "text-primary" : ""
                      }`}
                    >
                      {isDQ ? "-" : team.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {team.team_name}
                        {isDQ && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            DQ
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {team.contestant_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xl font-bold font-mono tabular-nums ${
                        (team.total_score ?? 0) < 0
                          ? "text-red-600"
                          : (team.total_score ?? 0) > 0
                            ? "text-muted-foreground"
                            : ""
                      }`}
                    >
                      {formatScore(team.total_score)}
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform text-muted-foreground ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {/* Expanded Golfer Details */}
                {isExpanded && team.golfers && (
                  <CardContent className="pt-0 pb-4">
                    <div className="border-t border-border pt-3">
                      <div className="divide-y divide-border">
                        {team.golfers.map((gs: LeaderboardGolfer) => (
                          <div
                            key={gs.id}
                            className="flex items-center justify-between py-2.5 gap-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium truncate">
                                {gs.name}
                              </span>
                              {gs.tier && <TierBadge tier={gs.tier as Tier} />}
                              {getStatusBadge(gs.status)}
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                              {gs.thru !== null && gs.status === "STATUS_IN_PROGRESS" && (
                                <span className="text-xs text-muted-foreground">
                                  Thru {gs.thru}
                                </span>
                              )}
                              <span
                                className={`font-mono text-sm font-semibold tabular-nums ${
                                  (gs.score_to_par ?? 0) < 0
                                    ? "text-red-600"
                                    : (gs.score_to_par ?? 0) > 0
                                      ? "text-muted-foreground"
                                      : ""
                                }`}
                              >
                                {formatScore(gs.score_to_par)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
