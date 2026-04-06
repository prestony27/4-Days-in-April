/**
 * Update golfer world rankings from OWGR CSV file
 *
 * Usage: npx tsx scripts/update-rankings-from-csv.ts [--dry-run]
 *
 * This script:
 * 1. Reads the OWGR CSV file
 * 2. Fetches existing golfers from Supabase
 * 3. Matches golfers by name
 * 4. Updates world_rank and tier directly in Supabase
 * 5. Reports golfers without OWGR rankings (may need manual handling)
 */

import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables from .env.local
config({ path: path.join(process.cwd(), ".env.local") });

// Tier definitions based on world rank
function calculateTier(worldRank: number): number {
  if (worldRank >= 1 && worldRank <= 10) return 1;
  if (worldRank >= 11 && worldRank <= 30) return 2;
  if (worldRank >= 31 && worldRank <= 50) return 3;
  return 4; // 51+
}

// Normalize name for matching (handle variations like "J.J." vs "JJ", etc.)
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.-]/g, "") // Remove periods and hyphens
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

// Extract last name (last word in name)
function getLastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

// Search for potential matches using fuzzy matching
function findPotentialMatches(
  dbName: string,
  csvGolfers: CSVGolfer[]
): CSVGolfer[] {
  const normalizedDB = normalizeName(dbName);
  const dbLastName = getLastName(dbName);
  const dbParts = normalizedDB.split(" ");

  const matches: Array<{ golfer: CSVGolfer; score: number }> = [];

  for (const csv of csvGolfers) {
    const normalizedCSV = normalizeName(csv.name);
    const csvLastName = getLastName(csv.name);
    const csvParts = normalizedCSV.split(" ");

    let score = 0;

    // Exact match after normalization
    if (normalizedDB === normalizedCSV) {
      score = 100;
    }
    // Last name exact match
    else if (dbLastName === csvLastName) {
      score = 50;
      // Bonus if first initial matches
      if (dbParts[0]?.[0] === csvParts[0]?.[0]) {
        score += 20;
      }
      // Bonus if first name is contained
      if (dbParts[0] && csvParts[0]?.includes(dbParts[0])) {
        score += 15;
      }
      if (csvParts[0] && dbParts[0]?.includes(csvParts[0])) {
        score += 15;
      }
    }
    // Partial last name match (e.g., "An" in "Byeong Hun An")
    else if (
      dbLastName.length >= 2 &&
      (csvLastName.includes(dbLastName) || dbLastName.includes(csvLastName))
    ) {
      score = 30;
    }

    if (score > 0) {
      matches.push({ golfer: csv, score });
    }
  }

  // Sort by score descending, return top matches
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m) => m.golfer);
}

interface CSVGolfer {
  playerId: string;
  rank: number;
  name: string;
}

interface DBGolfer {
  id: string;
  name: string;
  world_rank: number | null;
  tier: number | null;
}

interface UpdatePayload {
  id: string;
  name: string;
  world_rank: number;
  tier: number;
}

async function parseCSV(filePath: string): Promise<CSVGolfer[]> {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");

  // Skip header row
  const golfers: CSVGolfer[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Parse CSV with quoted fields
    const matches = line.match(/("([^"]*)"|[^,]+)/g);
    if (!matches) continue;

    const values = matches.map((v) => v.replace(/^"|"$/g, "").trim());

    // Columns: Player Id, RANKING, LAST WEEK, END, CTRY, NAME, First Name, Last Name, ...
    const playerId = values[0];
    const rank = parseInt(values[1], 10);
    const name = values[5]; // Full name column

    if (playerId && !isNaN(rank) && name) {
      golfers.push({ playerId, rank, name });
    }
  }

  return golfers;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchDBGolfers(): Promise<DBGolfer[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from("golfers")
    .select("id, name, world_rank, tier");

  if (error) {
    throw new Error(`Failed to fetch golfers: ${error.message}`);
  }

  return data || [];
}

async function updateGolfers(golfers: UpdatePayload[]): Promise<{ updated: number }> {
  const db = getSupabase();

  // Use upsert to update existing golfers
  const upsertData = golfers.map((g) => ({
    id: g.id,
    name: g.name,
    world_rank: g.world_rank,
    tier: g.tier,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await db.from("golfers").upsert(upsertData, {
    onConflict: "id",
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`Failed to update golfers: ${error.message}`);
  }

  return { updated: golfers.length };
}

async function main() {
  const csvPath = path.join(process.cwd(), "OWGR_downloaded_rankings.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log("Parsing OWGR CSV...");
  const csvGolfers = await parseCSV(csvPath);
  console.log(`Found ${csvGolfers.length} golfers in CSV`);

  console.log("\nFetching golfers from database...");
  const dbGolfers = await fetchDBGolfers();
  console.log(`Found ${dbGolfers.length} golfers in database`);

  // Build lookup map from normalized name -> CSV data
  const csvByName = new Map<string, CSVGolfer>();
  for (const g of csvGolfers) {
    csvByName.set(normalizeName(g.name), g);
  }

  // Match DB golfers to CSV data
  const updates: UpdatePayload[] = [];
  const unmatched: DBGolfer[] = [];
  const matched: Array<{ db: DBGolfer; csv: CSVGolfer; newTier: number }> = [];

  for (const dbGolfer of dbGolfers) {
    const normalizedName = normalizeName(dbGolfer.name);
    const csvGolfer = csvByName.get(normalizedName);

    if (csvGolfer) {
      const newTier = calculateTier(csvGolfer.rank);
      updates.push({
        id: dbGolfer.id,
        name: dbGolfer.name, // Keep original DB name
        world_rank: csvGolfer.rank,
        tier: newTier,
      });
      matched.push({ db: dbGolfer, csv: csvGolfer, newTier });
    } else {
      unmatched.push(dbGolfer);
    }
  }

  // Report matches with tier changes
  console.log("\n=== TIER CHANGES ===");
  const tierChanges = matched.filter((m) => m.db.tier !== m.newTier);
  if (tierChanges.length > 0) {
    for (const { db, csv, newTier } of tierChanges) {
      console.log(
        `  ${db.name}: Tier ${db.tier} -> Tier ${newTier} (rank ${db.world_rank} -> ${csv.rank})`
      );
    }
  } else {
    console.log("  No tier changes detected");
  }

  // Try fuzzy matching for unmatched golfers
  console.log("\n=== SEARCHING FOR UNMATCHED GOLFERS ===");
  const stillUnmatched: DBGolfer[] = [];
  const fuzzyMatched: Array<{ db: DBGolfer; csv: CSVGolfer; newTier: number }> = [];

  if (unmatched.length > 0) {
    for (const dbGolfer of unmatched) {
      const potentialMatches = findPotentialMatches(dbGolfer.name, csvGolfers);

      if (potentialMatches.length > 0) {
        // Check if top match looks like a good fit (same last name)
        const topMatch = potentialMatches[0];
        const dbLast = getLastName(dbGolfer.name);
        const csvLast = getLastName(topMatch.name);

        const dbFirst = normalizeName(dbGolfer.name).split(" ")[0];
        const csvFirst = normalizeName(topMatch.name).split(" ")[0];
        const firstInitialMatches = dbFirst[0] === csvFirst[0];
        const firstNameSimilar = dbFirst.includes(csvFirst) || csvFirst.includes(dbFirst);

        if (dbLast === csvLast && (firstInitialMatches || firstNameSimilar)) {
          // Auto-accept if last names match AND first name/initial is similar
          const newTier = calculateTier(topMatch.rank);
          updates.push({
            id: dbGolfer.id,
            name: dbGolfer.name,
            world_rank: topMatch.rank,
            tier: newTier,
          });
          fuzzyMatched.push({ db: dbGolfer, csv: topMatch, newTier });
          console.log(
            `  ✓ "${dbGolfer.name}" -> "${topMatch.name}" (rank ${topMatch.rank})`
          );
        } else if (dbLast === csvLast) {
          // Last name matches but first name doesn't - show for review
          console.log(`  ? "${dbGolfer.name}" - potential matches:`);
          for (const pm of potentialMatches.slice(0, 3)) {
            console.log(`      - "${pm.name}" (rank ${pm.rank})`);
          }
          stillUnmatched.push(dbGolfer);
        } else {
          // Show potential matches but don't auto-accept
          console.log(`  ? "${dbGolfer.name}" - potential matches:`);
          for (const pm of potentialMatches.slice(0, 3)) {
            console.log(`      - "${pm.name}" (rank ${pm.rank})`);
          }
          stillUnmatched.push(dbGolfer);
        }
      } else {
        stillUnmatched.push(dbGolfer);
      }
    }
  }

  // Include unmatched golfers with rank 999, tier 4
  console.log("\n=== GOLFERS NOT FOUND IN OWGR ===");
  if (stillUnmatched.length > 0) {
    console.log("These golfers have no OWGR ranking - setting to rank 999, tier 4:");
    for (const g of stillUnmatched) {
      console.log(`  - ${g.name} (current: rank ${g.world_rank}, tier ${g.tier})`);
      updates.push({
        id: g.id,
        name: g.name,
        world_rank: 999,
        tier: 4,
      });
    }
  } else {
    console.log("  All database golfers matched to OWGR CSV!");
  }

  // Check for rank 999 changes
  console.log("\n=== RANK 999 ANALYSIS ===");

  // Unmatched golfers that currently have a rank OTHER than 999 (concerning)
  const unmatchedWithRealRank = stillUnmatched.filter(g => g.world_rank !== null && g.world_rank !== 999);
  if (unmatchedWithRealRank.length > 0) {
    console.log("WARNING: Unmatched golfers with existing rank (will be set to 999):");
    for (const g of unmatchedWithRealRank) {
      console.log(`  - ${g.name}: rank ${g.world_rank} -> 999`);
    }
  } else {
    console.log("  No unmatched golfers have a rank other than 999 (good!)");
  }

  // Golfers currently at 999 that will now get a real ranking (good)
  const allMatched = [...matched, ...fuzzyMatched];
  const was999NowRanked = allMatched.filter(m => m.db.world_rank === 999 && m.csv.rank !== 999);
  if (was999NowRanked.length > 0) {
    console.log("\nGolfers gaining a real ranking (was 999):");
    for (const m of was999NowRanked) {
      console.log(`  - ${m.db.name}: rank 999 -> ${m.csv.rank}`);
    }
  } else {
    console.log("\n  No golfers going from 999 to a real ranking");
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`  Total in DB: ${dbGolfers.length}`);
  console.log(`  Exact matches: ${matched.length}`);
  console.log(`  Fuzzy matches: ${fuzzyMatched.length}`);
  console.log(`  Still unmatched: ${stillUnmatched.length}`);
  console.log(`  Tier changes: ${tierChanges.length}`);
  console.log(`  Total to update: ${updates.length}`);

  // Confirm before updating
  if (updates.length === 0) {
    console.log("\nNo updates to make.");
    return;
  }

  console.log(`\nReady to update ${updates.length} golfers.`);

  // Check for dry-run flag
  if (process.argv.includes("--dry-run")) {
    console.log("\n[DRY RUN] No changes made. Remove --dry-run to apply updates.");
    return;
  }

  // Actually update
  console.log("\nUpdating golfers in Supabase...");
  const result = await updateGolfers(updates);
  console.log(`Updated ${result.updated} golfers.`);
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
