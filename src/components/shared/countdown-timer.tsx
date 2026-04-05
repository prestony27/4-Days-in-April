"use client";

import { useEffect, useState } from "react";
import { SUBMISSION_DEADLINE } from "@/types";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(): TimeLeft | null {
  const diff = SUBMISSION_DEADLINE.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export function CountdownTimer({ compact = false }: { compact?: boolean }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(getTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!timeLeft) {
    return (
      <span className="text-destructive font-semibold">
        Submissions Closed
      </span>
    );
  }

  if (compact) {
    return (
      <span className="font-mono text-sm tabular-nums">
        {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m
      </span>
    );
  }

  return (
    <div className="flex gap-3 sm:gap-4">
      {[
        { value: timeLeft.days, label: "Days" },
        { value: timeLeft.hours, label: "Hours" },
        { value: timeLeft.minutes, label: "Min" },
        { value: timeLeft.seconds, label: "Sec" },
      ].map(({ value, label }) => (
        <div key={label} className="flex flex-col items-center">
          <span className="text-2xl sm:text-4xl font-bold font-mono tabular-nums text-white">
            {String(value).padStart(2, "0")}
          </span>
          <span className="text-xs sm:text-sm text-white/70 uppercase tracking-wider">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
