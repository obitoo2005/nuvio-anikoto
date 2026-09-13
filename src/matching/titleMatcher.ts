import { AnikotoSearchResult, TMDBMetadata } from "../types";
import { cleanTitle, computeDiceScore, extractSeasonNumber } from "../utils/textUtils";

export function scoreTitleMatch(
  candidateTitle: string,
  candidateJp: string | undefined,
  targetTitle: string,
  targetSeason?: number,
  allSeasons?: Array<{ season_number: number; name: string }>
): number {
  const cNorm = cleanTitle(candidateTitle);
  const jNorm = candidateJp ? cleanTitle(candidateJp) : "";
  const tNorm = cleanTitle(targetTitle);

  if (!cNorm && !jNorm) return 0;
  if (!tNorm) return 0;

  // 1. Direct exact match check
  let score = 0;
  if (cNorm === tNorm || jNorm === tNorm) {
    score = 1.0;
  } else {
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
  }

  // 2. Strict season alignment penalty and boost from explicit numbers
  const candSeason = extractSeasonNumber(candidateTitle) || (candidateJp ? extractSeasonNumber(candidateJp) : null);
  const effectiveSeason = (typeof targetSeason === "number" && targetSeason > 0) ? targetSeason : 1;

  if (effectiveSeason === 1) {
    // When Season 1 is requested, penalize any candidate that explicitly specifies Season 2+
    if (candSeason !== null && candSeason > 1) {
      score -= 0.6;
    } else if (candSeason === null) {
      score += 0.2;
    }
  } else {
    // When Season 2+ is requested, boost the matching season and heavily penalize mismatches
    if (candSeason === effectiveSeason) {
      score += 0.4;
    } else if (candSeason !== null && candSeason !== effectiveSeason) {
      score -= 0.6;
    }
  }

  // 3. Named season alignment check from TMDB seasons metadata (e.g. "Descending Stories" is Season 2!)
  if (allSeasons && allSeasons.length > 0) {
    for (const s of allSeasons) {
      if (s.season_number > 0 && s.name) {
        const sDice = Math.max(
          computeDiceScore(candidateTitle, s.name),
          candidateJp ? computeDiceScore(candidateJp, s.name) : 0
        );
        if (sDice >= 0.75) {
          if (s.season_number === effectiveSeason) {
            score += 0.5; // Matches the exact named season from TMDB!
          } else {
            score -= 0.8; // Belongs to a different season! Disqualify!
          }
        }
      }
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
      const sc = scoreTitleMatch(item.title, item.jpTitle, title, season, meta.allSeasons);
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
