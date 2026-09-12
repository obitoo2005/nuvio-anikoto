import { AnikotoSearchResult, TMDBMetadata } from "../types";
import { cleanTitle, computeDiceScore, extractSeasonNumber } from "../utils/textUtils";

export function scoreTitleMatch(
  candidateTitle: string,
  candidateJp: string | undefined,
  targetTitle: string,
  targetSeason?: number
): number {
  const cNorm = cleanTitle(candidateTitle);
  const jNorm = candidateJp ? cleanTitle(candidateJp) : "";
  const tNorm = cleanTitle(targetTitle);

  if (!cNorm && !jNorm) return 0;
  if (!tNorm) return 0;

  // 1. Direct exact match check
  if (cNorm === tNorm || jNorm === tNorm) {
    return 1.0;
  }

  // 2. Substring containment with length penalty
  let score = 0;
  for (const cand of [cNorm, jNorm]) {
    if (!cand) continue;
    if (cand === tNorm) {
      score = Math.max(score, 1.0);
      continue;
    }
    if (cand.startsWith(tNorm) || tNorm.startsWith(cand)) {
      const ratio = Math.min(cand.length, tNorm.length) / Math.max(cand.length, tNorm.length);
      score = Math.max(score, 0.8 * ratio);
    } else if (cand.includes(tNorm) || tNorm.includes(cand)) {
      const ratio = Math.min(cand.length, tNorm.length) / Math.max(cand.length, tNorm.length);
      score = Math.max(score, 0.65 * ratio);
    } else {
      score = Math.max(score, computeDiceScore(cand, tNorm));
    }
  }

  // 3. Season alignment boost or penalty
  if (targetSeason && targetSeason > 1) {
    const candSeason = extractSeasonNumber(candidateTitle) || (candidateJp ? extractSeasonNumber(candidateJp) : null);
    if (candSeason === targetSeason) {
      score += 0.35;
    } else if (candSeason !== null && candSeason !== targetSeason) {
      score -= 0.4;
    }
  }

  return Math.max(0, score);
}

export function findBestAnimeMatch(
  candidates: AnikotoSearchResult[],
  meta: TMDBMetadata,
  season?: number
): AnikotoSearchResult | null {
  if (!candidates || candidates.length === 0) return null;

  const titlesToTry = [
    meta.title,
    meta.originalTitle,
    ...(meta.alternateTitles || [])
  ].filter((t): t is string => Boolean(t && t.trim()));

  const isMovie = meta.kind === "movie";
  let bestCandidate: AnikotoSearchResult | null = null;
  let highestScore = -1;

  for (const item of candidates) {
    let maxScoreForItem = 0;
    for (const title of titlesToTry) {
      const sc = scoreTitleMatch(item.title, item.jpTitle, title, season);
      if (sc > maxScoreForItem) {
        maxScoreForItem = sc;
      }
    }

    // Media type heuristics
    const isItemMovie = /\bmovie\b/i.test(item.title) || /\/movie\b/i.test(item.url);
    const isItemOva = /\b(?:ova|ona|special)\b/i.test(item.title) || /\b(?:ova|ona|special)\b/i.test(item.url);

    if (isMovie && !isItemMovie) {
      maxScoreForItem *= 0.5;
    } else if (!isMovie && isItemMovie) {
      maxScoreForItem *= 0.6;
    } else if (!isMovie && !isItemOva && isItemOva) {
      maxScoreForItem *= 0.7;
    }

    if (maxScoreForItem > highestScore) {
      highestScore = maxScoreForItem;
      bestCandidate = item;
    }
  }

  if (highestScore < 0.25) {
    return null;
  }

  return bestCandidate;
}
