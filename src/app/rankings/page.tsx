"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TierBadge } from "@/components/shared/tier-badge";
import { TIER_CONFIGS, type Golfer, type Tier } from "@/types";

async function fetchGolfers(): Promise<Golfer[]> {
  const res = await fetch("/api/golfers");
  if (!res.ok) throw new Error("Failed to fetch golfers");
  const data = await res.json();
  return data.golfers;
}

function groupByTier(golfers: Golfer[]): Record<Tier, Golfer[]> {
  const groups: Record<Tier, Golfer[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const g of golfers) {
    if (g.tier in groups) groups[g.tier].push(g);
  }
  return groups;
}

export default function RankingsPage() {
  const [search, setSearch] = useState("");
  const [expandedTiers, setExpandedTiers] = useState<Set<Tier>>(
    new Set([1, 2, 3, 4])
  );

  const { data: golfers = [], isLoading, error } = useQuery({
    queryKey: ["golfers"],
    queryFn: fetchGolfers,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = search
    ? golfers.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase())
      )
    : golfers;

  const grouped = groupByTier(filtered);

  const toggleTier = (tier: Tier) => {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">
          World Golf Rankings
        </h1>
        <p className="text-muted-foreground">
          Tournament field organized by tier. Rankings locked as of 9:00 AM EST,
          Monday April 6th.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6 max-w-md mx-auto">
        <Input
          type="search"
          placeholder="Search golfers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-[44px]"
        />
      </div>

      {isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          Loading rankings...
        </div>
      )}

      {error && (
        <div className="text-center py-12 text-destructive">
          Failed to load rankings. Please try again later.
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-4">
          {TIER_CONFIGS.map((tc) => {
            const tierGolfers = grouped[tc.tier];
            const isExpanded = expandedTiers.has(tc.tier);

            return (
              <Card key={tc.tier}>
                <CardHeader
                  className="cursor-pointer select-none"
                  onClick={() => toggleTier(tc.tier)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">
                        {tc.label}: Rank {tc.rankRange}
                      </CardTitle>
                      <Badge variant="secondary">
                        Pick {tc.pickCount}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {tierGolfers.length} golfers
                      </span>
                      <svg
                        className={`w-5 h-5 transition-transform ${
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
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent>
                    {tierGolfers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {search
                          ? "No golfers match your search in this tier."
                          : "No golfers available in this tier."}
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {tierGolfers.map((golfer) => (
                          <div
                            key={golfer.id}
                            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                          >
                            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold shrink-0">
                              {golfer.world_rank}
                            </span>
                            <span className="font-medium">{golfer.name}</span>
                            <TierBadge tier={golfer.tier} />
                          </div>
                        ))}
                      </div>
                    )}
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
