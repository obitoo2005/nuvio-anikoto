import { PluginRuntimeResult, AnikotoSearchResult, AnikotoSeasonItem, TMDBMetadata } from "./types";
import { getTmdbMetadata, parseIncomingId } from "./api/tmdbClient";
import { searchAnikoto, getEpisodeList, getServerList, getAnimeSeasons, getAnimeIdFromUrl } from "./api/anikotoClient";
import {
  findBestAnimeMatch,
  scoreTitleMatch,
  scoreBaseTitle,
  seasonAlignmentScore
} from "./matching/titleMatcher";
import {
  planSeasonTarget,
  resolveTargetEpisode,
  isContinuousNumbering,
  resolveTargetSeasonAnimeId,
  SeasonPlan
} from "./matching/seasonMatcher";
import { resolveKitsuEntry } from "./api/kitsuResolver";
import { resolveStreamFromServer } from "./extractors/streamExtractor";
import {
  cleanTitle,
  extractSeasonNumber,
  parseSeasonLabel,
  coversNamedSeason,
  decodeHtmlEntities,
  computeDiceScore
} from "./utils/textUtils";

function buildSearchQueries(meta: TMDBMetadata): string[] {
  const extraSubqueries: string[] = [];
  if (meta.title.includes(":")) extraSubqueries.push(meta.title.split(":")[0].trim());
  if (meta.title.includes("-")) extraSubqueries.push(meta.title.split("-")[0].trim());
  if (meta.originalTitle && meta.originalTitle.includes(":")) {
    extraSubqueries.push(meta.originalTitle.split(":")[0].trim());
  }
  if (meta.seasonName && meta.seasonName.includes(":")) {
    extraSubqueries.push(meta.seasonName.split(":")[0].trim());
  }

  return [
    meta.title,
    meta.originalTitle,
    meta.seasonName,
    ...extraSubqueries,
    ...(meta.alternateTitles || [])
  ].filter((t): t is string => Boolean(t && t.trim()));
}

async function resolveMetadata(
  rawId: string,
  mediaType: string,
  isKitsu: boolean,
  cleanId: string,
  targetSeason: number,
  targetEpisode: number
): Promise<{ meta: TMDBMetadata | null; season: number; episode: number }> {
  if (isKitsu) {
    const kitsu = await resolveKitsuEntry(cleanId, mediaType, targetSeason);
    if (kitsu) {
      const season = kitsu.season;
      const episode = kitsu.episodeOffset + targetEpisode;
      const tmdbMeta = await getTmdbMetadata(kitsu.tmdbId, kitsu.kind, season, episode);
      if (tmdbMeta) {
        return {
          meta: {
            ...tmdbMeta,
            title: kitsu.title || tmdbMeta.title,
            originalTitle: kitsu.originalTitle || tmdbMeta.originalTitle,
            alternateTitles: [...new Set([
              kitsu.title,
              ...kitsu.alternateTitles,
              tmdbMeta.title,
              tmdbMeta.originalTitle || "",
              ...tmdbMeta.alternateTitles
            ].filter(Boolean))],
            resolvedSeason: season
          },
          season,
          episode
        };
      }
    }
  }

  const meta = await getTmdbMetadata(rawId, mediaType, targetSeason, targetEpisode);
  let season = targetSeason;
  if (meta && typeof meta.resolvedSeason === "number" && meta.resolvedSeason > 0) {
    season = meta.resolvedSeason;
  }
  return { meta, season, episode: targetEpisode };
}

export async function getStreams(
  tmdbId: string,
  mediaType: string = "tv",
  season?: number,
  episode?: number
): Promise<PluginRuntimeResult[]> {
  try {
    if (!tmdbId) return [];

    const idInfo = parseIncomingId(tmdbId, season, episode);
    const incomingEpisode = idInfo.episode;
    let targetSeason = idInfo.season;
    let targetEpisode = idInfo.episode;
    let kitsuOffset = 0;

    let seasonAnimeId = "";
    let absoluteOffset = 0;
    let meta: TMDBMetadata | null = null;
    let plan: SeasonPlan | null = null;
    let seasonList: AnikotoSeasonItem[] = [];
    let matchedAnimeId = "";

    if (idInfo.isAnikoto) {
      seasonAnimeId = idInfo.cleanId;
    } else {
      const resolved = await resolveMetadata(
        tmdbId,
        mediaType,
        idInfo.isKitsu,
        idInfo.cleanId,
        targetSeason,
        targetEpisode
      );
      meta = resolved.meta;
      targetSeason = resolved.season;
      targetEpisode = resolved.episode;
      if (idInfo.isKitsu) {
        kitsuOffset = Math.max(0, resolved.episode - incomingEpisode);
      }

      if (!meta || !meta.title) return [];

      const searchQueries = buildSearchQueries(meta);
      const uniqueQueries = [...new Set(searchQueries)].slice(0, 4);
      const queryResults = await Promise.all(uniqueQueries.map(q => searchAnikoto(q)));
      const candidateMap = new Map<string, AnikotoSearchResult>();
      for (const list of queryResults) {
        for (const item of list) {
          if (item.id && !candidateMap.has(item.id)) {
            candidateMap.set(item.id, item);
          }
        }
      }
      const candidates = [...candidateMap.values()];
      if (candidates.length === 0) return [];

      const matchedAnime = findBestAnimeMatch(candidates, meta, targetSeason);
      if (!matchedAnime || !matchedAnime.id) return [];

      matchedAnimeId = matchedAnime.id;
      const seasons = await getAnimeSeasons(matchedAnime.id);
      seasonList = seasons;
      plan = await planSeasonTarget({
        baseAnimeId: matchedAnime.id,
        matched: matchedAnime,
        seasons,
        meta,
        targetSeason,
        targetEpisode
      });
      if (!plan || !plan.animeId) return [];

      seasonAnimeId = plan.animeId;
      if (plan.localEpisode !== null) {
        targetEpisode = plan.localEpisode;
        absoluteOffset = 0;
      } else {
        absoluteOffset = meta.absoluteOffset;
      }
    }

    const episodes = await getEpisodeList(seasonAnimeId);
    if (!episodes || episodes.length === 0) return [];

    const localToSeason = idInfo.isAnikoto || Boolean(plan && plan.localEpisode !== null);
    const continuous = localToSeason ? false : isContinuousNumbering(episodes, meta);

    let matchedEp = resolveTargetEpisode(episodes, targetEpisode, absoluteOffset, {
      continuous,
      allowZero: true,
      local: localToSeason
    });

    if (!matchedEp && !idInfo.isAnikoto && kitsuOffset > 0) {
      const localKitsuEpisode = resolveTargetEpisode(episodes, incomingEpisode, 0, {
        allowZero: true,
        local: true
      });
      if (localKitsuEpisode) matchedEp = localKitsuEpisode;
    }

    if (!matchedEp && !idInfo.isAnikoto && seasonList.length > 0) {
      const nextSeason = seasonList.find(s => {
        const label = parseSeasonLabel(s.name);
        return label.season === targetSeason + 1 && !label.isSpecial && !label.isMovie;
      });
      if (nextSeason) {
        const nextId = nextSeason.active
          ? matchedAnimeId
          : (await getAnimeIdFromUrl(nextSeason.url)) || matchedAnimeId;
        const nextEpisodes = await getEpisodeList(nextId);
        const overflowEpisode = targetEpisode - episodes.length;
        if (overflowEpisode > 0) {
          const nextEp = resolveTargetEpisode(nextEpisodes, overflowEpisode, 0, {
            allowZero: true,
            local: true
          });
          if (nextEp) matchedEp = nextEp;
        }
      }
    }

    if (!matchedEp || !matchedEp.dataIds) return [];

    const rawServers = await getServerList(matchedEp.dataIds);
    if (!rawServers || rawServers.length === 0) return [];

    const prioritized = rawServers.slice().sort((a, b) => {
      const aIsHd = a.serverName.toLowerCase().includes("hd");
      const bIsHd = b.serverName.toLowerCase().includes("hd");
      if (aIsHd && !bIsHd) return -1;
      if (!aIsHd && bIsHd) return 1;
      return 0;
    });

    const servers = prioritized.slice(0, 3);
    const resolved = await Promise.all(servers.map(s => resolveStreamFromServer(s)));
    return resolved.filter((s): s is PluginRuntimeResult => Boolean(s && s.url));
  } catch (err) {
    console.warn("[Anikoto] getStreams failed:", (err as Error)?.message || err);
    return [];
  }
}

export async function search(query: string) {
  try {
    if (!query) return [];
    return await searchAnikoto(query);
  } catch (err) {
    console.warn("[Anikoto] search failed:", (err as Error)?.message || err);
    return [];
  }
}

export {
  cleanTitle,
  extractSeasonNumber,
  parseSeasonLabel,
  coversNamedSeason,
  decodeHtmlEntities,
  computeDiceScore,
  scoreTitleMatch,
  scoreBaseTitle,
  seasonAlignmentScore,
  findBestAnimeMatch,
  planSeasonTarget,
  resolveTargetEpisode,
  isContinuousNumbering,
  resolveTargetSeasonAnimeId
};

if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { getStreams: typeof getStreams }).getStreams = getStreams;
  (globalThis as unknown as { search: typeof search }).search = search;
}
