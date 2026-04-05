"use client";

import { Card } from "@/components/ui/card";
import { TierBadge } from "./tier-badge";
import type { Golfer } from "@/types";

interface GolferCardProps {
  golfer: Golfer;
  selected?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSelect?: (golfer: Golfer) => void;
  onDeselect?: (golferId: string) => void;
}

export function GolferCard({
  golfer,
  selected = false,
  disabled = false,
  disabledReason,
  onSelect,
  onDeselect,
}: GolferCardProps) {
  const handleClick = () => {
    if (disabled) return;
    if (selected && onDeselect) {
      onDeselect(golfer.id);
    } else if (!selected && onSelect) {
      onSelect(golfer);
    }
  };

  const isInteractive = !!(onSelect || onDeselect);

  return (
    <Card
      className={`relative p-4 transition-all ${
        isInteractive ? "cursor-pointer" : ""
      } ${
        selected
          ? "ring-2 ring-primary bg-primary/5 border-primary"
          : disabled
            ? "opacity-50 cursor-not-allowed"
            : isInteractive
              ? "hover:border-primary/40 hover:shadow-sm"
              : ""
      }`}
      onClick={isInteractive ? handleClick : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold shrink-0">
            {golfer.world_rank}
          </span>
          <div className="min-w-0">
            <p className="font-medium truncate">{golfer.name}</p>
            <TierBadge tier={golfer.tier} />
          </div>
        </div>
        {selected && (
          <span className="text-primary shrink-0">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}
      </div>
      {disabled && disabledReason && (
        <p className="text-xs text-destructive mt-2">{disabledReason}</p>
      )}
    </Card>
  );
}
