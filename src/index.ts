import { PluginRuntimeResult } from "./types";
import { getTmdbMetadata } from "./api/tmdbClient";
import { searchAnikoto, getEpisodeList, getServerList } from "./api/anikotoClient";
import { findBestAnimeMatch, scoreTitleMatch } from "./matching/titleMatcher";
import { resolveTargetSeasonAnimeId, resolveTargetEpisode } from "./matching/seasonMatcher";
import { resolveStreamsFromServer } from "./extractors/streamExtractor";
import { cleanTitle, extractSeasonNumber } from "./utils/textUtils";

export async function getStreams(
  tmdbId: string,
  mediaType: string = "tv",
  season?: number,
  episode?: number
): Promise<PluginRuntimeResult[]> {
  try {
    if (!tmdbId) return [];

    const targetSeason = typeof season === "number" ? season : (mediaType === "movie" ? 1 : 1);
    const targetEpisode = typeof episode === "number" ? episode : 1;

    // 1. Fetch TMDB metadata
    const meta = await getTmdbMetadata(String(tmdbId), mediaType, targetSeason);
    if (!meta || !meta.title) {
      return [];
    }

    // 2. Search Anikoto for candidates using all available titles
    const searchQueries = [
      meta.title,
      meta.originalTitle,
      ...(meta.alternateTitles || [])
    ].filter((t): t is string => Boolean(t && t.trim()));

    let candidates = [];
    for (const q of searchQueries.slice(0, 5)) {
      candidates = await searchAnikoto(q);
      if (candidates.length > 0) break;
    }
    if (candidates.length === 0) return [];

    // 3. Match the best candidate anime
    const matchedAnime = findBestAnimeMatch(candidates, meta, targetSeason);
    if (!matchedAnime || !matchedAnime.id) return [];

    // 4. Resolve the correct season anime ID if multi-season
    const seasonAnimeId = await resolveTargetSeasonAnimeId(
      matchedAnime.id,
      targetSeason,
      meta.seasonName
    );

    // 5. Fetch episodes for the target season
    const episodes = await getEpisodeList(seasonAnimeId);
    if (!episodes || episodes.length === 0) return [];

    // 6. Map and locate the requested episode
    const matchedEp = resolveTargetEpisode(episodes, targetEpisode, meta.absoluteOffset);
    if (!matchedEp || !matchedEp.dataIds) return [];

    // 7. Get available servers for this episode
    const servers = await getServerList(matchedEp.dataIds);
    if (!servers || servers.length === 0) return [];

    // 8. Resolve playable streams concurrently for all available servers
    const streamPromises = servers.map(s => resolveStreamsFromServer(s));
    const resolvedArrays = await Promise.all(streamPromises);
    const flattened = resolvedArrays.flat();

    // Filter out failed resolutions
    const streams = flattened.filter((s): s is PluginRuntimeResult => Boolean(s && s.url));
    return streams;
  } catch {
    return [];
  }
}

export async function search(query: string) {
  try {
    if (!query) return [];
    return await searchAnikoto(query);
  } catch {
    return [];
  }
}

// Internal utilities exported for unit testing and validation
export {
  cleanTitle,
  extractSeasonNumber,
  scoreTitleMatch,
  findBestAnimeMatch
};

if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { getStreams: typeof getStreams }).getStreams = getStreams;
  (globalThis as unknown as { search: typeof search }).search = search;
}
