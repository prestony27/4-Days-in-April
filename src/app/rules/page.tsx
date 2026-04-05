import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ENTRY_FEE, MAX_TEAMS, TIER_CONFIGS } from "@/types";

const RULES = [
  {
    number: 1,
    text: `A contestant chooses five golfers to form their team. From the World Golf Rankings, a contestant shall choose one (1) golfer from rankings 1-10, two (2) from 11-30, one (1) from 31-50, and one (1) from 51+. Rankings are locked as of 9:00 AM EST Monday, April 6th. Submissions are not allowed before then.`,
  },
  {
    number: 2,
    text: `The scores of a contestant's five golfers are added together to form a team score. The lowest team score at the end of the tournament wins. If a contestant picks a golfer who misses the cut, the golfer's score simply will not change during the weekend. If any of a team's golfers DQs or withdraws after starting the tournament, the entire team is disqualified.`,
  },
  {
    number: 3,
    text: `Each contestant entry is $${ENTRY_FEE}. Contestants may make up to ${MAX_TEAMS} entries for a total of $${ENTRY_FEE * MAX_TEAMS}. If a contestant enters more than one team, no golfer can be on more than one of their teams.`,
  },
  {
    number: 4,
    text: `The pool website will re-rank teams on the website's Leaderboard as often as updated tournament scoring data is available.`,
  },
  {
    number: 5,
    text: `Teams have to be submitted by 5 AM EST Thursday, April 9th.`,
  },
  {
    number: 6,
    text: `Submissions are only valid once the $${ENTRY_FEE} payment is received and a rule-abiding team is picked.`,
  },
  {
    number: 7,
    text: `Pre-Tournament Withdrawals: If a golfer withdraws before Round 1 begins, affected contestants may resubmit their team with a replacement golfer. If no resubmission is received before the deadline, a full refund will be issued.`,
  },
  {
    number: 8,
    text: `Tiebreakers: (1) Team with the better (lower) score from their 51+ ranked golfer wins. (2) Team with the better (lower) combined score from their two 11-30 ranked golfers wins. (3) If still tied, teams split the combined prize money for the positions they occupy.`,
  },
  {
    number: 9,
    text: `Prize Distribution: Entry fees first offset operational costs. The remaining pool is distributed: 1st place (50%), 2nd place (30%), 3rd place (20%). Exact distribution may be adjusted based on total entries.`,
  },
];

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Pool Rules</h1>
        <p className="text-muted-foreground">
          Official rules for Four Days in April 2026
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tier Structure</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {TIER_CONFIGS.map((tc) => (
              <div
                key={tc.tier}
                className="border rounded-lg p-3 text-center"
              >
                <p className="font-semibold">{tc.label}</p>
                <p className="text-sm text-muted-foreground">
                  Rank {tc.rankRange}
                </p>
                <p className="text-sm">
                  Pick {tc.pickCount} golfer{tc.pickCount > 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 space-y-4">
        {RULES.map((rule) => (
          <Card key={rule.number}>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  {rule.number}
                </span>
                <p className="text-sm leading-relaxed">{rule.text}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
