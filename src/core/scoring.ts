import { REAL_SECONDS_PER_GAME_MINUTE } from './clock';
import { PARCEL_RULES as R, parcelValue, type Parcel } from './parcels';

/** Scoring constants (SPEC §2). Thresholds are a first guess, to tune in playtesting. */
export const SCORING = {
  /** A delivery within this many real seconds of the previous one extends the streak. */
  streakSeconds: 30,
  /** Bonus per delivery in a streak (the 2nd delivery in a row earns 1×, the 3rd 2×, …), capped. */
  streakStep: 10,
  streakCap: 3,
  /** A hit at or above this speed loss (m/s) counts as hard: damage penalty, fragile loss. */
  hardHit: 4,
  /** Penalty per hard hit: points per m/s of speed lost, capped. */
  damagePerMs: 3,
  damageCap: 40,
  /** Rank thresholds, as a share of the best possible score for the day's load (see bestScore). */
  ranks: { onTime: 0.45, hero: 0.8 },
};

export type Rank = 'Missed the Sleigh' | 'On Time' | 'Christmas Hero';

export type Tally = {
  delivered: number;
  total: number;
  /** Line items, in display order. Zero lines are kept so the tally always has the same shape. */
  lines: { label: string; points: number }[];
  score: number;
  /** Best possible score for this load: every parcel, every bonus, a full streak, no damage. */
  best: number;
  rank: Rank;
};

/** Penalty points for one hard hit. */
export function hitPenalty(strength: number): number {
  return Math.min(SCORING.damageCap, Math.round(strength * SCORING.damagePerMs));
}

/** Every parcel delivered intact and on time with its tip, one long streak, no damage. */
export function bestScore(parcels: readonly Parcel[]): number {
  let best = 0;
  for (const p of parcels) {
    best += p.value + p.tip;
    if (p.type === 'express') best += R.expressBonus;
    if (p.type === 'fragile') best += R.fragileIntactBonus;
    if (p.type === 'grandma') best += R.grandmaBonus;
  }
  for (let i = 1; i < parcels.length; i++) best += Math.min(i, SCORING.streakCap) * SCORING.streakStep;
  return best;
}

export function rankFor(score: number, parcels: readonly Parcel[]): Rank {
  const share = score / (bestScore(parcels) || 1);
  if (share >= SCORING.ranks.hero) return 'Christmas Hero';
  if (share >= SCORING.ranks.onTime) return 'On Time';
  return 'Missed the Sleigh';
}

/** Streak bonus from delivery times (game minutes since 4pm), in any order. */
export function streakBonus(times: readonly number[]): number {
  const window = SCORING.streakSeconds / REAL_SECONDS_PER_GAME_MINUTE;
  const sorted = [...times].sort((a, b) => a - b);
  let bonus = 0;
  let run = 0;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i]! - sorted[i - 1]! <= window ? run + 1 : 0;
    bonus += Math.min(run, SCORING.streakCap) * SCORING.streakStep;
  }
  return bonus;
}

/**
 * score = delivered value + express bonuses + tips + fragile-intact bonus
 *       + For Grandma bonus + streak bonus − damage penalty
 */
export function tally(parcels: readonly Parcel[], damage: number): Tally {
  const done = parcels.filter((p) => p.delivered);
  const sum = (f: (p: Parcel) => number) => done.reduce((s, p) => s + f(p), 0);
  const at = (p: Parcel) => p.deliveredAt ?? Infinity;
  const intact = (p: Parcel) => p.type !== 'fragile' || p.hits === 0;

  const value = sum(parcelValue);
  const express = sum((p) => (p.type === 'express' && at(p) < R.expressBy ? R.expressBonus : 0));
  const tips = sum((p) => (at(p) <= R.tipBy && intact(p) ? p.tip : 0));
  const fragile = sum((p) => (p.type === 'fragile' && p.hits === 0 ? R.fragileIntactBonus : 0));
  const grandma = sum((p) => (p.type === 'grandma' ? R.grandmaBonus : 0));
  const streak = streakBonus(done.map(at));
  const score = Math.max(0, value + express + tips + fragile + grandma + streak - damage);

  return {
    delivered: done.length,
    total: parcels.length,
    lines: [
      { label: `${done.length} parcel${done.length === 1 ? '' : 's'} delivered`, points: value },
      { label: 'Express before 5pm', points: express },
      { label: 'Tips', points: tips },
      { label: 'Fragile, intact', points: fragile },
      { label: 'For Grandma', points: grandma },
      { label: 'Streak', points: streak },
      { label: 'Damage', points: -damage },
    ],
    score,
    best: bestScore(parcels),
    rank: rankFor(score, parcels),
  };
}
