import { AnikotoEpisodeItem } from "../types";
import { getAnimeSeasons, getAnimeIdFromUrl } from "../api/anikotoClient";
import { extractSeasonNumber, cleanTitle } from "../utils/textUtils";

export async function resolveTargetSeasonAnimeId(
  baseAnimeId: string,
  seasonNumber?: number,
  seasonName?: string
): Promise<string> {
  const targetSeason = (typeof seasonNumber === "number" && seasonNumber > 0) ? seasonNumber : 1;

  const seasons = await getAnimeSeasons(baseAnimeId);
  if (!seasons || seasons.length === 0) {
    return baseAnimeId;
  }

  // 1. Try matching by season number in season.name (e.g. "Season 1", "Season 2", "Season 3")
  let matched = seasons.find(s => {
    const sNum = extractSeasonNumber(s.name);
    return sNum === targetSeason;
  });

  // 2. If targetSeason is 1 and no explicit season number match, match "Season 1" or unnumbered entry
  if (!matched && targetSeason === 1) {
    matched = seasons.find(s => /\bseason\s*0*1\b/i.test(s.name) || extractSeasonNumber(s.name) === null);
  }

  // 3. Try matching by seasonName if provided by TMDB (e.g. "Entertainment District Arc")
  if (!matched && seasonName) {
    const cleanTarg = cleanTitle(seasonName);
    matched = seasons.find(s => {
      const cleanS = cleanTitle(s.name);
      return cleanS.includes(cleanTarg) || cleanTarg.includes(cleanS);
    });
  }

  if (!matched) {
    return baseAnimeId;
  }

  // If the matched season is already the active season on this page, keep baseAnimeId
  if (matched.active) {
    return baseAnimeId;
  }

  // Fetch the season page to extract its data-id
  const seasonId = await getAnimeIdFromUrl(matched.url);
  return seasonId || baseAnimeId;
}

export function resolveTargetEpisode(
  episodes: AnikotoEpisodeItem[],
  episodeNumber?: number,
  absoluteOffset: number = 0
): AnikotoEpisodeItem | null {
  if (!episodes || episodes.length === 0) return null;

  const targetNum = (typeof episodeNumber === "number" && episodeNumber > 0) ? episodeNumber : 1;

  // 1. Match directly by episode number
  let ep = episodes.find(e => e.num === targetNum);
  if (ep) return ep;

  // 2. If offset exists (continuous numbering like Bleach / One Piece), match offset + targetNum
  if (absoluteOffset > 0) {
    const absNum = absoluteOffset + targetNum;
    ep = episodes.find(e => e.num === absNum);
    if (ep) return ep;
  }

  // 3. Positional fallback: if targetNum matches 1-based index in the episode list
  if (targetNum <= episodes.length) {
    const posEp = episodes[targetNum - 1];
    if (posEp) return posEp;
  }

  return null;
}
