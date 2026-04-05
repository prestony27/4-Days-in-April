"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTeamBuilderStore } from "@/store/team-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { GolferCard } from "@/components/shared/golfer-card";
import { TIER_CONFIGS, SUBMISSION_DEADLINE, MAX_TEAMS, type Golfer, type Tier } from "@/types";
import Link from "next/link";
import { toast } from "sonner";

async function fetchGolfers(): Promise<Golfer[]> {
  const res = await fetch("/api/golfers");
  if (!res.ok) throw new Error("Failed to fetch golfers");
  const data = await res.json();
  return data.golfers;
}

const WIZARD_STEPS = [
  { label: "Email", tier: null },
  { label: "Tier 1 (1-10)", tier: 1 as Tier },
  { label: "Tier 2 (11-30)", tier: 2 as Tier },
  { label: "Tier 3 (31-50)", tier: 3 as Tier },
  { label: "Tier 4 (51+)", tier: 4 as Tier },
  { label: "Review", tier: null },
];

export default function TeamBuilderPage() {
  const store = useTeamBuilderStore();
  const deadlinePassed = Date.now() > SUBMISSION_DEADLINE.getTime();

  const { data: golfers = [], isLoading } = useQuery({
    queryKey: ["golfers"],
    queryFn: fetchGolfers,
    staleTime: 5 * 60 * 1000,
  });

  const progress = useMemo(() => {
    const total = 5; // 5 golfers needed
    return (store.getAllSelections().length / total) * 100;
  }, [store]);

  if (deadlinePassed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold mb-4">Submissions Closed</h1>
        <p className="text-muted-foreground mb-6">
          The submission deadline has passed. Check the leaderboard to follow the
          tournament.
        </p>
        <Button asChild>
          <Link href="/leaderboard">View Leaderboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Build Your Team</h1>
        <p className="text-muted-foreground">
          Select 5 golfers across 4 tiers to complete your team
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            Step {store.currentStep + 1} of {WIZARD_STEPS.length}:{" "}
            {WIZARD_STEPS[store.currentStep].label}
          </span>
          <span className="text-sm text-muted-foreground">
            {store.getAllSelections().length}/5 golfers selected
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Step Navigation Pills */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
        {WIZARD_STEPS.map((step, i) => (
          <button
            key={i}
            onClick={() => store.setStep(i)}
            disabled={i > 0 && i < 5 && !store.email}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors min-h-[32px] ${
              i === store.currentStep
                ? "bg-primary text-primary-foreground"
                : i < store.currentStep
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
            } ${i > 0 && i < 5 && !store.email ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {step.label}
          </button>
        ))}
      </div>

      {/* Step Content */}
      {store.currentStep === 0 && <EmailStep />}
      {store.currentStep >= 1 && store.currentStep <= 4 && (
        <TierStep
          tier={WIZARD_STEPS[store.currentStep].tier!}
          golfers={golfers}
          isLoading={isLoading}
        />
      )}
      {store.currentStep === 5 && <ReviewStep golfers={golfers} />}
    </div>
  );
}

function EmailStep() {
  const { email, setEmail, name, setName, teamName, setTeamName, nextStep, submittedTeamCount } =
    useTeamBuilderStore();

  const handleContinue = () => {
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!teamName.trim()) {
      toast.error("Please enter a team name");
      return;
    }
    nextStep();
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Get Started</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Your Name
          </label>
          <Input
            id="name"
            type="text"
            placeholder="John Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-[44px]"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email Address
          </label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[44px]"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Used to associate your teams and track submissions
          </p>
        </div>
        <div>
          <label htmlFor="teamName" className="block text-sm font-medium mb-1">
            Team Name
          </label>
          <Input
            id="teamName"
            type="text"
            placeholder="e.g. Green Jacket Chasers"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="min-h-[44px]"
          />
        </div>
        {submittedTeamCount > 0 && (
          <p className="text-sm text-muted-foreground">
            You have {submittedTeamCount}/{MAX_TEAMS} teams submitted.
          </p>
        )}
        <Button
          onClick={handleContinue}
          className="w-full min-h-[44px]"
          disabled={!name.trim() || !email || !teamName.trim()}
        >
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}

function TierStep({
  tier,
  golfers,
  isLoading,
}: {
  tier: Tier;
  golfers: Golfer[];
  isLoading: boolean;
}) {
  const store = useTeamBuilderStore();
  const config = TIER_CONFIGS.find((t) => t.tier === tier)!;
  const tierGolfers = golfers.filter((g) => g.tier === tier);
  const selections = store.getSelectionsByTier(tier);
  const isTierDone = store.isTierComplete(tier);

  return (
    <div>
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">
              {config.label}: Rank {config.rankRange}
            </h2>
            <Badge variant={isTierDone ? "default" : "secondary"}>
              {selections.length}/{config.pickCount} selected
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Select {config.pickCount} golfer{config.pickCount > 1 ? "s" : ""}{" "}
            from this tier
          </p>
        </CardContent>
      </Card>

      {/* Selected golfers summary */}
      {selections.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {selections.map((s) => (
            <Badge
              key={s.golfer_id}
              variant="default"
              className="cursor-pointer hover:bg-destructive"
              onClick={() => store.deselectGolfer(s.golfer_id)}
            >
              {s.golfer_name} &times;
            </Badge>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading golfers...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tierGolfers.map((golfer) => {
            const selected = store.isGolferSelected(golfer.id);
            const usedInOther = store.isGolferUsedInOtherTeam(golfer.id);
            const tierFull = isTierDone && !selected;

            return (
              <GolferCard
                key={golfer.id}
                golfer={golfer}
                selected={selected}
                disabled={usedInOther || tierFull}
                disabledReason={
                  usedInOther
                    ? "Already on another team"
                    : tierFull
                      ? "Tier is full"
                      : undefined
                }
                onSelect={store.selectGolfer}
                onDeselect={store.deselectGolfer}
              />
            );
          })}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={store.prevStep} className="min-h-[44px]">
          Back
        </Button>
        <Button
          onClick={store.nextStep}
          disabled={!isTierDone}
          className="min-h-[44px]"
        >
          {tier === 4 ? "Review Team" : "Next Tier"}
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({ golfers }: { golfers: Golfer[] }) {
  const store = useTeamBuilderStore();
  const allSelections = store.getAllSelections();
  const isComplete = allSelections.length === 5;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!isComplete) {
      toast.error("Please select all 5 golfers");
      return;
    }

    // Map selections to the backend's expected format: { tier1, tier2_a, tier2_b, tier3, tier4 }
    const tier1 = allSelections.find((s) => s.tier === 1);
    const tier2 = allSelections.filter((s) => s.tier === 2);
    const tier3 = allSelections.find((s) => s.tier === 3);
    const tier4 = allSelections.find((s) => s.tier === 4);

    if (!tier1 || tier2.length !== 2 || !tier3 || !tier4) {
      toast.error("Invalid tier selections. Please go back and check.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/submit-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: store.email,
          name: store.name,
          team_name: store.teamName,
          golfers: {
            tier1: tier1.golfer_id,
            tier2_a: tier2[0].golfer_id,
            tier2_b: tier2[1].golfer_id,
            tier3: tier3.golfer_id,
            tier4: tier4.golfer_id,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        const msg = typeof err.detail === "string" ? err.detail : err.detail?.message || "Failed to submit team";
        toast.error(msg);
        return;
      }

      const data = await res.json();
      // Redirect to Stripe checkout
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        window.location.href = `/submit?team_id=${data.team_id}`;
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Review Your Team: {store.teamName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {TIER_CONFIGS.map((tc) => {
              const tierSelections = store.getSelectionsByTier(tc.tier);
              return (
                <div key={tc.tier}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-muted-foreground">
                      {tc.label} (Rank {tc.rankRange})
                    </span>
                    <Badge
                      variant={
                        tierSelections.length === tc.pickCount
                          ? "default"
                          : "destructive"
                      }
                    >
                      {tierSelections.length}/{tc.pickCount}
                    </Badge>
                  </div>
                  {tierSelections.length === 0 ? (
                    <p className="text-sm text-destructive ml-4">
                      No golfer selected
                    </p>
                  ) : (
                    <ul className="ml-4">
                      {tierSelections.map((s) => (
                        <li key={s.golfer_id} className="text-sm py-0.5">
                          {s.golfer_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Submitting as: {store.email}
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={store.prevStep} className="min-h-[44px]">
          Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!isComplete || isSubmitting}
          className="min-h-[44px] bg-primary hover:bg-primary/90"
        >
          {isSubmitting ? "Submitting..." : "Submit & Pay $30"}
        </Button>
      </div>
    </div>
  );
}
