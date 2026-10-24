import { AnikotoSearchResult, TMDBMetadata } from "../types";
import { cleanTitle, computeDiceScore, coversNamedSeason, distinctiveWords, parseSeasonLabel } from "../utils/textUtils";

export function scoreBaseTitle(
  candidateTitle: string,
  candidateJp: string | undefined,
  targetTitle: string
): number {
  const target = cleanTitle(targetTitle);
  if (!target) return 0;

  const candidates = [cleanTitle(candidateTitle), candidateJp ? cleanTitle(candidateJp) : ""].filter(Boolean);
  let best = 0;

  for (const cand of candidates) {
    if (cand === target) {
      best = Math.max(best, 1);
      continue;
    }

    if (cand.startsWith(target) || target.startsWith(cand)) {
      const ratio = Math.min(cand.length, target.length) / Math.max(cand.length, target.length);
      best = Math.max(best, 0.8 * ratio);
    } else if (cand.includes(target) || target.includes(cand)) {
      const ratio = Math.min(cand.length, target.length) / Math.max(cand.length, target.length);
      best = Math.max(best, 0.65 * ratio);
    }

    const targetWords = distinctiveWords(target);
    if (targetWords.length > 0) {
      const candWords = new Set(distinctiveWords(cand));
      let matched = 0;
      for (const w of targetWords) if (candWords.has(w)) matched++;
      const coverage = matched / targetWords.length;
      if (coverage >= 0.8) {
        best = Math.max(best, 0.7 + 0.1 * coverage);
      }
    }

    best = Math.max(best, computeDiceScore(cand, target));
  }

  return Math.min(1, best);
}

export function seasonAlignmentScore(
  candidateTitle: string,
  candidateJp: string | undefined,
  targetSeason: number,
  seasonName?: string,
  allSeasons?: Array<{ season_number: number; name: string }>,
  kind: "tv" | "movie" = "tv",
  baseTitles?: string[]
): number {
  const label = parseSeasonLabel(`${candidateTitle} ${candidateJp || ""}`);
  const effectiveSeason = targetSeason > 0 ? targetSeason : 1;
  let score = 0;

  const seasonWords = distinctiveWords(seasonName || "");
  const baseWords = new Set((baseTitles || []).flatMap(t => distinctiveWords(t)));
  const seasonIsBaseTitle =
    seasonWords.length > 0 && seasonWords.every(w => baseWords.has(w));
  const effectiveSeasonName = seasonIsBaseTitle ? undefined : seasonName;

  if (effectiveSeasonName && (coversNamedSeason(candidateTitle, effectiveSeasonName) || coversNamedSeason(candidateJp || "", effectiveSeasonName))) {
    score += 0.6;
  } else if (effectiveSeasonName && allSeasons && allSeasons.length > 0) {
    for (const s of allSeasons) {
      if (s.season_number > 0 && s.name && s.season_number !== effectiveSeason) {
        if (coversNamedSeason(candidateTitle, s.name) || coversNamedSeason(candidateJp || "", s.name)) {
          score -= 0.3;
          break;
        }
      }
    }
  }

  if (label.season !== null) {
    if (label.season === effectiveSeason) {
      score += 0.25;
    } else {
      score -= 0.5;
    }
  } else if (effectiveSeason === 1) {
    score += 0.1;
  }

  if (label.isFinalSeason) {
    const finalSeason = (allSeasons || []).find(s => s.season_number > 0 && /\bfinal\b/i.test(s.name));
    if (finalSeason) {
      score += finalSeason.season_number === effectiveSeason ? 0.2 : -0.3;
    }
  }

  if (label.isSpecial && effectiveSeason > 0 && !/\bspecial/i.test(seasonName || "")) {
    score -= 0.35;
  }

  if (label.isMovie && kind !== "movie") {
    score -= 0.5;
  }

  return score;
}

export function scoreTitleMatch(
  candidateTitle: string,
  candidateJp: string | undefined,
  targetTitle: string,
  targetSeason?: number,
  allSeasons?: Array<{ season_number: number; name: string }>
): number {
  const effectiveSeason = (typeof targetSeason === "number" && targetSeason > 0) ? targetSeason : 1;
  const seasonName = allSeasons?.find(s => s.season_number === effectiveSeason)?.name;
  const base = scoreBaseTitle(candidateTitle, candidateJp, targetTitle);
  const season = seasonAlignmentScore(
    candidateTitle,
    candidateJp,
    effectiveSeason,
    seasonName,
    allSeasons,
    "tv",
    [targetTitle]
  );
  return Math.max(0, base + season);
}

export function findBestAnimeMatch(
  candidates: AnikotoSearchResult[],
  meta: TMDBMetadata,
  season?: number
): AnikotoSearchResult | null {
  if (!candidates || candidates.length === 0) return null;

  const effectiveSeason = (typeof season === "number" && season > 0) ? season : 1;
  const baseTitles = [
    meta.title,
    meta.originalTitle,
    ...(meta.alternateTitles || [])
  ].filter((t): t is string => Boolean(t && t.trim()));

  const seasonName =
    meta.seasonName ||
    meta.allSeasons?.find(s => s.season_number === effectiveSeason)?.name;

  const isMovie = meta.kind === "movie";
  let bestCandidate: AnikotoSearchResult | null = null;
  let highestScore = -1;
  let bestPrimary: AnikotoSearchResult | null = null;
  let highestPrimaryScore = -1;

  for (const item of candidates) {
    if (!item.id) continue;

    let baseScore = 0;
    for (const title of baseTitles) {
      baseScore = Math.max(baseScore, scoreBaseTitle(item.title, item.jpTitle, title));
    }

    if (baseScore < 0.3) continue;

    const seasonAdj = seasonAlignmentScore(
      item.title,
      item.jpTitle,
      effectiveSeason,
      seasonName,
      meta.allSeasons,
      meta.kind,
      baseTitles
    );

    let total = baseScore + seasonAdj;

    const isItemMovie = /\bmovie\b/i.test(item.title) || /\/movie\b/i.test(item.url);
    const isItemOva = /\b(?:ova|ona|special)\b/i.test(item.title) || /\b(?:ova|ona|special)\b/i.test(item.url);

    if (isMovie && !isItemMovie) {
      total *= 0.5;
    } else if (!isMovie && isItemMovie) {
      total *= 0.6;
    } else if (!isMovie && isItemOva) {
      total *= 0.8;
    }

    const label = parseSeasonLabel(`${item.title} ${item.jpTitle || ""}`);
    const isPrimary = isMovie ? isItemMovie : (!label.isSpecial && !isItemMovie);

    if (total > highestScore) {
      highestScore = total;
      bestCandidate = item;
    }
    if (isPrimary && total > highestPrimaryScore) {
      highestPrimaryScore = total;
      bestPrimary = item;
    }
  }

  if (highestPrimaryScore >= 0.45) {
    return bestPrimary;
  }
  if (highestScore >= 0.45) {
    return bestCandidate;
  }

  return null;
}
