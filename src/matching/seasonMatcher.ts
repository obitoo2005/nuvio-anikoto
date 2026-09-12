import { AnikotoEpisodeItem } from "../types";
import { getAnimeSeasons, getAnimeIdFromUrl } from "../api/anikotoClient";
import { extractSeasonNumber, cleanTitle } from "../utils/textUtils";

export async function resolveTargetSeasonAnimeId(
  baseAnimeId: string,
  seasonNumber?: number,
  seasonName?: string
): Promise<string> {
  if (!seasonNumber || seasonNumber <= 1) {
    return baseAnimeId;
  }

  const seasons = await getAnimeSeasons(baseAnimeId);
  if (!seasons || seasons.length === 0) {
    return baseAnimeId;
  }

  // 1. Try matching by season number in season.name
  let matched = seasons.find(s => {
    const sNum = extractSeasonNumber(s.name);
    return sNum === seasonNumber;
  });

  // 2. Try matching by seasonName if provided by TMDB
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

  const targetNum = (episodeNumber && episodeNumber > 0) ? episodeNumber : 1;

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
