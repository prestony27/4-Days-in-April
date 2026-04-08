"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CountdownTimer } from "@/components/shared/countdown-timer";
import type { LeaderboardResponse, LeaderboardGolfer } from "@/types";

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

function getScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score < 0) return "text-red-600 font-semibold";        // Under par - red
  if (score > 0) return "text-brand-green font-semibold";    // Over par - Masters green
  return "text-blue-600 font-semibold";                      // Even par - blue
}

function getGolferByTier(golfers: LeaderboardGolfer[] | undefined, tier: number, index = 0): LeaderboardGolfer | null {
  if (!golfers) return null;
  const tierGolfers = golfers.filter(g => g.tier === tier);
  return tierGolfers[index] || null;
}

export default function LeaderboardPage() {
  const [searchFilter, setSearchFilter] = useState("");

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

  return (
    <div className={`mx-auto px-4 py-8 ${isPreDeadline ? "max-w-4xl" : "max-w-[1400px]"}`}>
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

      {/* Pre-deadline: Simple entries list */}
      {!isLoading && !error && filteredTeams.length > 0 && isPreDeadline && (
        <div className="space-y-2">
          {filteredTeams.map((team) => (
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
          ))}
        </div>
      )}

      {/* Post-deadline: Full leaderboard table */}
      {!isLoading && !error && filteredTeams.length > 0 && !isPreDeadline && (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-3 py-2 text-left font-semibold w-14">Rank</th>
                <th className="px-3 py-2 text-left font-semibold">Team</th>
                <th className="px-3 py-2 text-left font-semibold">Owner</th>
                <th className="px-3 py-2 text-center font-semibold w-16">Total</th>
                <th className="px-3 py-2 text-left font-semibold bg-amber-100/50 dark:bg-amber-900/20">
                  <div className="text-xs text-muted-foreground">1 through 10</div>
                </th>
                <th className="px-3 py-2 text-left font-semibold bg-green-100/50 dark:bg-green-900/20">
                  <div className="text-xs text-muted-foreground">11 through 30</div>
                </th>
                <th className="px-3 py-2 text-left font-semibold bg-green-100/50 dark:bg-green-900/20">
                  <div className="text-xs text-muted-foreground">11 through 30</div>
                </th>
                <th className="px-3 py-2 text-left font-semibold bg-blue-100/50 dark:bg-blue-900/20">
                  <div className="text-xs text-muted-foreground">31 through 50</div>
                </th>
                <th className="px-3 py-2 text-left font-semibold bg-purple-100/50 dark:bg-purple-900/20">
                  <div className="text-xs text-muted-foreground">51 and over</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((team, idx) => {
                const isDQ = team.status === "disqualified";
                const tier1 = getGolferByTier(team.golfers, 1);
                const tier2a = getGolferByTier(team.golfers, 2, 0);
                const tier2b = getGolferByTier(team.golfers, 2, 1);
                const tier3 = getGolferByTier(team.golfers, 3);
                const tier4 = getGolferByTier(team.golfers, 4);

                return (
                  <tr
                    key={team.team_id}
                    className={`border-b last:border-b-0 ${
                      idx % 2 === 0 ? "bg-white dark:bg-background" : "bg-muted/30"
                    } ${isDQ ? "opacity-50" : ""}`}
                  >
                    {/* Rank */}
                    <td className="px-3 py-2 font-bold text-center">
                      {isDQ ? "-" : team.rank}
                    </td>

                    {/* Team Name */}
                    <td className="px-3 py-2 font-medium">
                      {team.team_name}
                      {isDQ && (
                        <Badge variant="destructive" className="ml-2 text-xs">DQ</Badge>
                      )}
                    </td>

                    {/* Owner */}
                    <td className="px-3 py-2 text-muted-foreground">
                      {team.contestant_name}
                    </td>

                    {/* Total Score */}
                    <td className={`px-3 py-2 text-center font-bold tabular-nums ${getScoreColor(team.total_score)}`}>
                      {formatScore(team.total_score)}
                    </td>

                    {/* Tier 1: 1-10 */}
                    <td className="px-3 py-2 bg-amber-50/50 dark:bg-amber-900/10">
                      {tier1 ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate max-w-[100px]">{tier1.name}</span>
                          <span className={`tabular-nums ${getScoreColor(tier1.score_to_par)}`}>
                            {formatScore(tier1.score_to_par)}
                          </span>
                        </div>
                      ) : "-"}
                    </td>

                    {/* Tier 2a: 11-30 */}
                    <td className="px-3 py-2 bg-green-50/50 dark:bg-green-900/10">
                      {tier2a ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate max-w-[100px]">{tier2a.name}</span>
                          <span className={`tabular-nums ${getScoreColor(tier2a.score_to_par)}`}>
                            {formatScore(tier2a.score_to_par)}
                          </span>
                        </div>
                      ) : "-"}
                    </td>

                    {/* Tier 2b: 11-30 */}
                    <td className="px-3 py-2 bg-green-50/50 dark:bg-green-900/10">
                      {tier2b ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate max-w-[100px]">{tier2b.name}</span>
                          <span className={`tabular-nums ${getScoreColor(tier2b.score_to_par)}`}>
                            {formatScore(tier2b.score_to_par)}
                          </span>
                        </div>
                      ) : "-"}
                    </td>

                    {/* Tier 3: 31-50 */}
                    <td className="px-3 py-2 bg-blue-50/50 dark:bg-blue-900/10">
                      {tier3 ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate max-w-[100px]">{tier3.name}</span>
                          <span className={`tabular-nums ${getScoreColor(tier3.score_to_par)}`}>
                            {formatScore(tier3.score_to_par)}
                          </span>
                        </div>
                      ) : "-"}
                    </td>

                    {/* Tier 4: 51+ */}
                    <td className="px-3 py-2 bg-purple-50/50 dark:bg-purple-900/10">
                      {tier4 ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate max-w-[100px]">{tier4.name}</span>
                          <span className={`tabular-nums ${getScoreColor(tier4.score_to_par)}`}>
                            {formatScore(tier4.score_to_par)}
                          </span>
                        </div>
                      ) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
