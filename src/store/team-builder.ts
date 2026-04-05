import { create } from "zustand";
import type { Golfer, Tier, TeamGolferSlot } from "@/types";

interface TeamBuilderState {
  /** Current wizard step: 0=email, 1=tier1, 2=tier2, 3=tier3, 4=tier4, 5=review */
  currentStep: number;
  /** User's email for submission */
  email: string;
  /** Contestant's name */
  name: string;
  /** Team name */
  teamName: string;
  /** Selected golfers by tier */
  selections: Map<string, TeamGolferSlot>; // keyed by golfer id
  /** Golfer IDs already used in other submitted teams (for duplicate prevention) */
  usedGolferIds: Set<string>;
  /** How many teams this user has already submitted */
  submittedTeamCount: number;

  // Actions
  setEmail: (email: string) => void;
  setName: (name: string) => void;
  setTeamName: (name: string) => void;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  selectGolfer: (golfer: Golfer) => void;
  deselectGolfer: (golferId: string) => void;
  setUsedGolferIds: (ids: string[]) => void;
  setSubmittedTeamCount: (count: number) => void;
  getSelectionsByTier: (tier: Tier) => TeamGolferSlot[];
  getAllSelections: () => TeamGolferSlot[];
  isGolferSelected: (golferId: string) => boolean;
  isGolferUsedInOtherTeam: (golferId: string) => boolean;
  isTierComplete: (tier: Tier) => boolean;
  reset: () => void;
}

const TIER_PICK_COUNTS: Record<Tier, number> = { 1: 1, 2: 2, 3: 1, 4: 1 };

export const useTeamBuilderStore = create<TeamBuilderState>((set, get) => ({
  currentStep: 0,
  email: "",
  name: "",
  teamName: "",
  selections: new Map(),
  usedGolferIds: new Set(),
  submittedTeamCount: 0,

  setEmail: (email) => set({ email }),
  setName: (name) => set({ name }),
  setTeamName: (name) => set({ teamName: name }),
  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, 5) })),
  prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),

  selectGolfer: (golfer) =>
    set((state) => {
      const tier = golfer.tier;
      const maxPicks = TIER_PICK_COUNTS[tier];
      const currentTierSelections = Array.from(state.selections.values()).filter(
        (s) => s.tier === tier
      );

      // If tier is full, don't add
      if (currentTierSelections.length >= maxPicks) return state;

      const next = new Map(state.selections);
      next.set(golfer.id, {
        golfer_id: golfer.id,
        golfer_name: golfer.name,
        tier: golfer.tier,
      });
      return { selections: next };
    }),

  deselectGolfer: (golferId) =>
    set((state) => {
      const next = new Map(state.selections);
      next.delete(golferId);
      return { selections: next };
    }),

  setUsedGolferIds: (ids) => set({ usedGolferIds: new Set(ids) }),
  setSubmittedTeamCount: (count) => set({ submittedTeamCount: count }),

  getSelectionsByTier: (tier) =>
    Array.from(get().selections.values()).filter((s) => s.tier === tier),

  getAllSelections: () => Array.from(get().selections.values()),

  isGolferSelected: (golferId) => get().selections.has(golferId),

  isGolferUsedInOtherTeam: (golferId) => get().usedGolferIds.has(golferId),

  isTierComplete: (tier) => {
    const count = Array.from(get().selections.values()).filter(
      (s) => s.tier === tier
    ).length;
    return count >= TIER_PICK_COUNTS[tier];
  },

  reset: () =>
    set({
      currentStep: 0,
      email: "",
      name: "",
      teamName: "",
      selections: new Map(),
    }),
}));
