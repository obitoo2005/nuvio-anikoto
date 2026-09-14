import { PluginRuntimeResult } from "./types";
import { getTmdbMetadata, parseIncomingId } from "./api/tmdbClient";
import { searchAnikoto, getEpisodeList, getServerList } from "./api/anikotoClient";
import { findBestAnimeMatch, scoreTitleMatch } from "./matching/titleMatcher";
import { resolveTargetSeasonAnimeId, resolveTargetEpisode } from "./matching/seasonMatcher";
import { resolveStreamFromServer } from "./extractors/streamExtractor";
import { cleanTitle, extractSeasonNumber } from "./utils/textUtils";

export async function getStreams(
  tmdbId: string,
  mediaType: string = "tv",
  season?: number,
  episode?: number
): Promise<PluginRuntimeResult[]> {
  try {
    if (!tmdbId) return [];

    // Extract clean ID, season, and episode from incoming ID (handles anikoto:1642:1:1, kitsu:12:1, tt123:1:1, etc.)
    const idInfo = parseIncomingId(tmdbId, season, episode);
    const targetSeason = idInfo.season;
    const targetEpisode = idInfo.episode;

    let seasonAnimeId = "";
    let absoluteOffset = 0;

    if (idInfo.isAnikoto) {
      // Direct Anikoto ID: skip search & matching, resolve episodes directly
      seasonAnimeId = idInfo.cleanId;
    } else {
      // 1. Fetch TMDB / Kitsu / IMDB metadata
      const meta = await getTmdbMetadata(tmdbId, mediaType, targetSeason, targetEpisode);
      if (!meta || !meta.title) {
        return [];
      }
      absoluteOffset = meta.absoluteOffset;

      // 2. Search Anikoto for candidates using all available titles
      const extraSubqueries: string[] = [];
      if (meta.title.includes(":")) extraSubqueries.push(meta.title.split(":")[0].trim());
      if (meta.title.includes("-")) extraSubqueries.push(meta.title.split("-")[0].trim());
      if (meta.originalTitle && meta.originalTitle.includes(":")) extraSubqueries.push(meta.originalTitle.split(":")[0].trim());

      const searchQueries = [
        meta.title,
        meta.originalTitle,
        ...extraSubqueries,
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
      seasonAnimeId = await resolveTargetSeasonAnimeId(
        matchedAnime.id,
        targetSeason,
        meta.seasonName
      );
    }

    // 5. Fetch episodes for the target season
    const episodes = await getEpisodeList(seasonAnimeId);
    if (!episodes || episodes.length === 0) return [];

    // 6. Map and locate the requested episode
    const matchedEp = resolveTargetEpisode(episodes, targetEpisode, absoluteOffset);
    if (!matchedEp || !matchedEp.dataIds) return [];

    // 7. Get available servers for this episode
    const rawServers = await getServerList(matchedEp.dataIds);
    if (!rawServers || rawServers.length === 0) return [];

    // Prioritize HD-1 (fastest CDN) first, followed by Vidstream-2
    const prioritized = rawServers.slice().sort((a, b) => {
      const aIsHd = a.serverName.toLowerCase().includes("hd");
      const bIsHd = b.serverName.toLowerCase().includes("hd");
      if (aIsHd && !bIsHd) return -1;
      if (!aIsHd && bIsHd) return 1;
      return 0;
    });

    // Limit concurrent requests to top 3 servers to respond well under Nuvio timeout (under 2s)
    const servers = prioritized.slice(0, 3);

    // 8. Resolve playable streams concurrently
    const streamPromises = servers.map(s => resolveStreamFromServer(s));
    const resolved = await Promise.all(streamPromises);

    // Filter out failed resolutions
    const streams = resolved.filter((s): s is PluginRuntimeResult => Boolean(s && s.url));
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
