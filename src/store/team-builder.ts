import { create } from "zustand";
import type { Golfer, Tier, TeamGolferSlot } from "@/types";

interface CartTeam {
  team_name: string;
  selections: TeamGolferSlot[];
}

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
  /** Cart of teams ready for checkout */
  cart: CartTeam[];

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
  isGolferInCart: (golferId: string) => boolean;
  isTierComplete: (tier: Tier) => boolean;
  addToCart: () => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  getCartGolferIds: () => string[];
  canAddMoreTeams: () => boolean;
  reset: () => void;
  resetForNewTeam: () => void;
}

const TIER_PICK_COUNTS: Record<Tier, number> = { 1: 1, 2: 2, 3: 1, 4: 1 };
const MAX_TEAMS = 3;

export const useTeamBuilderStore = create<TeamBuilderState>((set, get) => ({
  currentStep: 0,
  email: "",
  name: "",
  teamName: "",
  selections: new Map(),
  usedGolferIds: new Set(),
  submittedTeamCount: 0,
  cart: [],

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

  isGolferInCart: (golferId) => {
    const { cart } = get();
    return cart.some((team) =>
      team.selections.some((s) => s.golfer_id === golferId)
    );
  },

  isTierComplete: (tier) => {
    const count = Array.from(get().selections.values()).filter(
      (s) => s.tier === tier
    ).length;
    return count >= TIER_PICK_COUNTS[tier];
  },

  addToCart: () => {
    const { teamName, selections, cart } = get();
    const newTeam: CartTeam = {
      team_name: teamName,
      selections: Array.from(selections.values()),
    };
    set({
      cart: [...cart, newTeam],
      teamName: "",
      selections: new Map(),
      currentStep: 1, // Go back to tier 1 selection for next team
    });
  },

  removeFromCart: (index) => {
    const { cart } = get();
    set({ cart: cart.filter((_, i) => i !== index) });
  },

  clearCart: () => set({ cart: [] }),

  getCartGolferIds: () => {
    const { cart } = get();
    return cart.flatMap((team) => team.selections.map((s) => s.golfer_id));
  },

  canAddMoreTeams: () => {
    const { submittedTeamCount, cart } = get();
    return submittedTeamCount + cart.length < MAX_TEAMS;
  },

  reset: () =>
    set({
      currentStep: 0,
      email: "",
      name: "",
      teamName: "",
      selections: new Map(),
      cart: [],
    }),

  resetForNewTeam: () =>
    set({
      teamName: "",
      selections: new Map(),
      currentStep: 1,
    }),
}));
