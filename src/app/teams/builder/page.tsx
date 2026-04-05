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
  const store = useTeamBuilderStore();
  const {
    email, setEmail,
    name, setName,
    teamName, setTeamName,
    inviteCode, setInviteCode,
    inviteCodeValidated, setInviteCodeValidated,
    nextStep, submittedTeamCount, cart, setStep
  } = store;
  const canAddMore = store.canAddMoreTeams();
  const [isValidating, setIsValidating] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lockoutInfo, setLockoutInfo] = useState<{ locked: boolean; retryAfter: number } | null>(null);

  // Show invite code field only on first team and when not yet validated
  const showInviteCode = cart.length === 0 && !inviteCodeValidated;

  const handleContinue = async () => {
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

    // Validate invite code if needed
    if (showInviteCode) {
      if (!inviteCode.trim()) {
        setInviteError("Invite code is required");
        return;
      }

      setIsValidating(true);
      setInviteError(null);
      try {
        const res = await fetch("/api/validate-invite-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: inviteCode }),
        });

        const data = await res.json();

        if (!data.valid) {
          if (data.locked) {
            setLockoutInfo({ locked: true, retryAfter: data.retryAfter });
            setInviteError(data.message);
          } else {
            setInviteError(data.message + (data.remainingAttempts !== undefined ? ` (${data.remainingAttempts} attempts remaining)` : ""));
          }
          return;
        }

        // Code is valid
        setInviteCodeValidated(true);
        setLockoutInfo(null);
      } catch {
        setInviteError("Failed to validate invite code. Please try again.");
        return;
      } finally {
        setIsValidating(false);
      }
    }

    nextStep();
  };

  // If cart is full, show checkout prompt instead of new team form
  if (!canAddMore && cart.length > 0) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Cart Full</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            You have {cart.length} team{cart.length > 1 ? "s" : ""} in your cart (maximum {MAX_TEAMS} teams allowed).
          </p>
          <Button onClick={() => setStep(5)} className="w-full min-h-[44px]">
            Proceed to Checkout
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{cart.length > 0 ? "Add Another Team" : "Get Started"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {cart.length === 0 && (
          <>
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
            {showInviteCode && (
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium mb-1">
                  Invite Code
                </label>
                <Input
                  id="inviteCode"
                  type="text"
                  placeholder="Enter your invite code"
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value);
                    setInviteError(null);
                  }}
                  className="min-h-[44px]"
                  aria-invalid={!!inviteError}
                  disabled={lockoutInfo?.locked}
                />
                {inviteError && (
                  <p className="text-xs text-destructive mt-1">{inviteError}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  This is a private contest. Enter your invite code to participate.
                </p>
              </div>
            )}
          </>
        )}
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
        {cart.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {cart.length} team{cart.length > 1 ? "s" : ""} in cart. You can add {MAX_TEAMS - submittedTeamCount - cart.length} more.
          </p>
        )}
        {submittedTeamCount > 0 && cart.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You have {submittedTeamCount}/{MAX_TEAMS} teams submitted.
          </p>
        )}
        <Button
          onClick={handleContinue}
          className="w-full min-h-[44px]"
          disabled={!name.trim() || !email || !teamName.trim() || (showInviteCode && !inviteCode.trim()) || isValidating || lockoutInfo?.locked}
        >
          {isValidating ? "Validating..." : "Continue"}
        </Button>
        {cart.length > 0 && (
          <Button
            variant="outline"
            onClick={() => setStep(5)}
            className="w-full min-h-[44px]"
          >
            Skip to Checkout ({cart.length} team{cart.length > 1 ? "s" : ""})
          </Button>
        )}
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
            const usedInCart = store.isGolferInCart(golfer.id);
            const tierFull = isTierDone && !selected;

            return (
              <GolferCard
                key={golfer.id}
                golfer={golfer}
                selected={selected}
                disabled={usedInOther || usedInCart || tierFull}
                disabledReason={
                  usedInOther
                    ? "Already on another team"
                    : usedInCart
                      ? "Already in cart"
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
  const canAddMore = store.canAddMoreTeams();
  const cartCount = store.cart.length;
  const totalTeams = cartCount + (isComplete ? 1 : 0);
  const totalPrice = totalTeams * 30;

  const selectionsToGolfers = (selections: typeof allSelections) => {
    const tier1 = selections.find((s) => s.tier === 1);
    const tier2 = selections.filter((s) => s.tier === 2);
    const tier3 = selections.find((s) => s.tier === 3);
    const tier4 = selections.find((s) => s.tier === 4);
    if (!tier1 || tier2.length !== 2 || !tier3 || !tier4) return null;
    return {
      tier1: tier1.golfer_id,
      tier2_a: tier2[0].golfer_id,
      tier2_b: tier2[1].golfer_id,
      tier3: tier3.golfer_id,
      tier4: tier4.golfer_id,
    };
  };

  const handleAddToCart = () => {
    if (!isComplete) {
      toast.error("Please select all 5 golfers");
      return;
    }
    if (!store.teamName.trim()) {
      toast.error("Please enter a team name");
      return;
    }
    store.addToCart();
    toast.success("Team added to cart! Build another team or checkout.");
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!isComplete && cartCount === 0) {
      toast.error("Please select all 5 golfers or add teams to cart");
      return;
    }

    // Build all teams to submit (cart + current if complete)
    const teamsToSubmit: Array<{ team_name: string; golfers: ReturnType<typeof selectionsToGolfers> }> = [];

    // Add cart teams
    for (const cartTeam of store.cart) {
      const golfers = selectionsToGolfers(cartTeam.selections);
      if (!golfers) {
        toast.error(`Invalid selections in cart team: ${cartTeam.team_name}`);
        return;
      }
      teamsToSubmit.push({ team_name: cartTeam.team_name, golfers });
    }

    // Add current team if complete
    if (isComplete) {
      const golfers = selectionsToGolfers(allSelections);
      if (!golfers) {
        toast.error("Invalid tier selections. Please go back and check.");
        return;
      }
      teamsToSubmit.push({ team_name: store.teamName, golfers });
    }

    if (teamsToSubmit.length === 0) {
      toast.error("No teams to submit");
      return;
    }

    setIsSubmitting(true);
    try {
      // Use batch endpoint for multiple teams, single endpoint for one
      const endpoint = teamsToSubmit.length > 1 ? "/api/submit-teams" : "/api/submit-team";
      const body = teamsToSubmit.length > 1
        ? { email: store.email, name: store.name, teams: teamsToSubmit, invite_code: store.inviteCode }
        : { email: store.email, name: store.name, team_name: teamsToSubmit[0].team_name, golfers: teamsToSubmit[0].golfers, invite_code: store.inviteCode };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        const msg = typeof err.detail === "string" ? err.detail : err.detail?.message || "Failed to submit team";
        toast.error(msg);
        return;
      }

      const data = await res.json();
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        const teamId = data.team_id || data.team_ids?.[0];
        window.location.href = `/submit?team_id=${teamId}`;
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Cart Summary */}
      {cartCount > 0 && (
        <Card className="mb-4 border-primary/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Cart ({cartCount} team{cartCount > 1 ? "s" : ""})</span>
              <Badge variant="secondary">${cartCount * 30}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {store.cart.map((cartTeam, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2">
                  <span className="font-medium">{cartTeam.team_name}</span>
                  <button
                    onClick={() => store.removeFromCart(idx)}
                    className="text-destructive hover:underline text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Team Review */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            {isComplete ? `Current Team: ${store.teamName}` : "Current Team (incomplete)"}
          </CardTitle>
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

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={store.prevStep} className="min-h-[44px]">
          Back
        </Button>
        <div className="flex gap-2 flex-col sm:flex-row">
          {canAddMore && isComplete && (
            <Button
              variant="outline"
              onClick={handleAddToCart}
              className="min-h-[44px]"
            >
              Add Another Team
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={(!isComplete && cartCount === 0) || isSubmitting}
            className="min-h-[44px] bg-primary hover:bg-primary/90"
          >
            {isSubmitting
              ? "Submitting..."
              : totalTeams > 1
                ? `Checkout ${totalTeams} Teams - $${totalPrice}`
                : `Submit & Pay $${totalPrice}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
