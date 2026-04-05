import { Badge } from "@/components/ui/badge";
import type { Tier } from "@/types";
import { TIER_CONFIGS } from "@/types";

const TIER_STYLES: Record<Tier, string> = {
  1: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  2: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  3: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  4: "bg-purple-500/10 text-purple-700 border-purple-500/30",
};

export function TierBadge({ tier }: { tier: Tier }) {
  const config = TIER_CONFIGS.find((t) => t.tier === tier);
  return (
    <Badge variant="outline" className={TIER_STYLES[tier]}>
      {config?.label} ({config?.rankRange})
    </Badge>
  );
}
