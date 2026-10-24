import {
  AnikotoEpisodeItem,
  AnikotoSearchResult,
  AnikotoSeasonItem,
  TMDBMetadata
} from "../types";
import { getAnimeIdFromUrl, getAnimeSeasons, getEpisodeList } from "../api/anikotoClient";
import {
  coversNamedSeason,
  distinctiveWords,
  parseSeasonLabel,
  ParsedSeasonLabel
} from "../utils/textUtils";

export interface SeasonPlan {
  animeId: string;
  localEpisode: number | null;
  seasonNumber: number;
  partNumber: number | null;
  continuous: boolean | null;
  reason: string;
}

interface SeasonCandidate {
  item: AnikotoSeasonItem;
  label: ParsedSeasonLabel;
  index: number;
  id: string;
  episodes: AnikotoEpisodeItem[];
}

function isRootCandidate(matched: AnikotoSearchResult, meta: TMDBMetadata): boolean {
  const rootWords = new Set([
    ...distinctiveWords(meta.title),
    ...distinctiveWords(meta.originalTitle || "")
  ]);
  const matchedWords = [
    ...distinctiveWords(matched.title),
    ...distinctiveWords(matched.jpTitle || "")
  ];
  if (matchedWords.length === 0) return false;
  const extra = matchedWords.filter(w => !rootWords.has(w));
  return extra.length === 0;
}

function isSeasonSpecific(
  matched: AnikotoSearchResult,
  targetSeason: number,
  seasonName?: string
): boolean {
  const label = parseSeasonLabel(`${matched.title} ${matched.jpTitle || ""}`);
  if (targetSeason > 0 && label.season === targetSeason) return true;
  if (seasonName) {
    if (coversNamedSeason(matched.title, seasonName)) return true;
    if (matched.jpTitle && coversNamedSeason(matched.jpTitle, seasonName)) return true;
  }
  return false;
}

async function resolveCandidateId(item: AnikotoSeasonItem, baseAnimeId: string): Promise<string> {
  if (item.active) return baseAnimeId;
  const id = await getAnimeIdFromUrl(item.url);
  return id || baseAnimeId;
}

async function buildGroupPlan(
  entries: SeasonCandidate[],
  baseAnimeId: string,
  targetEpisode: number,
  targetSeason: number,
  reason: string
): Promise<SeasonPlan | null> {
  if (entries.length === 0) return null;

  const sorted = entries.slice().sort((a, b) => {
    const ap = a.label.part ?? a.index + 1;
    const bp = b.label.part ?? b.index + 1;
    return ap - bp;
  });

  if (targetSeason === 0) {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.max(0, targetEpisode) - 1));
    const chosen = sorted[idx];
    const animeId = await resolveCandidateId(chosen.item, baseAnimeId);
    return {
      animeId,
      localEpisode: 1,
      seasonNumber: 0,
      partNumber: chosen.label.part,
      continuous: false,
      reason
    };
  }

  if (sorted.length === 1) {
    const only = sorted[0];
    const animeId = await resolveCandidateId(only.item, baseAnimeId);
    return {
      animeId,
      localEpisode: targetEpisode,
      seasonNumber: targetSeason,
      partNumber: only.label.part,
      continuous: false,
      reason
    };
  }

  const resolved = await Promise.all(sorted.map(async entry => {
    const animeId = await resolveCandidateId(entry.item, baseAnimeId);
    const episodes = await getEpisodeList(animeId);
    return { ...entry, id: animeId, episodes };
  }));

  let before = 0;
  for (let i = 0; i < resolved.length; i++) {
    const entry = resolved[i];
    const count = entry.episodes.length;
    const isLast = i === resolved.length - 1;
    if (targetEpisode <= before + count || isLast) {
      return {
        animeId: entry.id,
        localEpisode: targetEpisode - before,
        seasonNumber: targetSeason,
        partNumber: entry.label.part,
        continuous: false,
        reason
      };
    }
    before += count;
  }

  return null;
}

export async function planSeasonTarget(options: {
  baseAnimeId: string;
  matched: AnikotoSearchResult;
  seasons: AnikotoSeasonItem[];
  meta: TMDBMetadata;
  targetSeason: number;
  targetEpisode: number;
}): Promise<SeasonPlan | null> {
  const { baseAnimeId, matched, seasons, meta } = options;
  const targetSeason = options.targetSeason === 0 ? 0 : (options.targetSeason > 0 ? options.targetSeason : 1);
  const targetEpisode = options.targetEpisode;

  if (meta.kind === "movie") {
    return {
      animeId: baseAnimeId,
      localEpisode: Math.max(1, targetEpisode),
      seasonNumber: 1,
      partNumber: null,
      continuous: false,
      reason: "movie"
    };
  }

  if (!seasons || seasons.length === 0) {
    return {
      animeId: baseAnimeId,
      localEpisode: null,
      seasonNumber: targetSeason,
      partNumber: null,
      continuous: null,
      reason: "no-season-list"
    };
  }

  const candidates: SeasonCandidate[] = seasons.map((item, index) => ({
    item,
    label: parseSeasonLabel(item.name),
    index,
    id: item.active ? baseAnimeId : "",
    episodes: []
  }));

  const activeEntry = candidates.find(c => c.item.active);
  const specials = candidates.filter(c => c.label.season === 0 || c.label.isSpecial);
  const namedAll = meta.seasonName
    ? candidates.filter(c => coversNamedSeason(c.item.name, meta.seasonName))
    : [];
  const ordinalAll = targetSeason > 0
    ? candidates.filter(c => c.label.season === targetSeason)
    : [];
  const preferTv = (entries: SeasonCandidate[]): SeasonCandidate[] => {
    const tv = entries.filter(c => !c.label.isMovie && !c.label.isSpecial);
    return tv.length > 0 ? tv : entries;
  };
  const named = preferTv(namedAll);
  const ordinal = preferTv(ordinalAll);
  const hasParts = ordinal.some(c => c.label.part !== null);

  if (targetSeason === 0) {
    if (specials.length > 0) {
      return buildGroupPlan(specials, baseAnimeId, targetEpisode, 0, "specials");
    }
    const matchedLabel = parseSeasonLabel(`${matched.title} ${matched.jpTitle || ""}`);
    if (matchedLabel.isSpecial) {
      return {
        animeId: baseAnimeId,
        localEpisode: targetEpisode,
        seasonNumber: 0,
        partNumber: matchedLabel.part,
        continuous: false,
        reason: "matched-special"
      };
    }
    return null;
  }

  if (isSeasonSpecific(matched, targetSeason, meta.seasonName)) {
    const group = named.length > 0 ? named : (ordinal.length > 0 ? ordinal : candidates.filter(c => c.item.active));
    return buildGroupPlan(group, baseAnimeId, targetEpisode, targetSeason, "matched-season");
  }

  if (targetSeason === 1 && isRootCandidate(matched, meta) && activeEntry && !hasParts) {
    return {
      animeId: baseAnimeId,
      localEpisode: targetEpisode,
      seasonNumber: 1,
      partNumber: null,
      continuous: false,
      reason: "active-root-season-1"
    };
  }

  if (named.length > 0) {
    return buildGroupPlan(named, baseAnimeId, targetEpisode, targetSeason, "named-season");
  }

  if (ordinal.length > 0) {
    return buildGroupPlan(ordinal, baseAnimeId, targetEpisode, targetSeason, "ordinal-season");
  }

  if (!isRootCandidate(matched, meta)) {
    return {
      animeId: baseAnimeId,
      localEpisode: targetEpisode,
      seasonNumber: targetSeason,
      partNumber: null,
      continuous: false,
      reason: "distinct-entry-fallback"
    };
  }

  if (targetSeason === 1) {
    return {
      animeId: baseAnimeId,
      localEpisode: targetEpisode,
      seasonNumber: 1,
      partNumber: null,
      continuous: false,
      reason: "root-season-1"
    };
  }

  return null;
}

export async function resolveTargetSeasonAnimeId(
  baseAnimeId: string,
  seasonNumber?: number,
  seasonName?: string,
  targetEpisode: number = 1
): Promise<string> {
  const seasons = await getAnimeSeasons(baseAnimeId);
  const plan = await planSeasonTarget({
    baseAnimeId,
    matched: { id: baseAnimeId, url: "", title: "" },
    seasons,
    meta: {
      numericId: baseAnimeId,
      kind: "tv",
      title: "",
      alternateTitles: [],
      absoluteOffset: 0,
      seasonName
    },
    targetSeason: (typeof seasonNumber === "number" && seasonNumber >= 0) ? seasonNumber : 1,
    targetEpisode
  });
  return plan?.animeId || baseAnimeId;
}

export interface EpisodeResolutionOptions {
  continuous?: boolean;
  allowZero?: boolean;
  local?: boolean;
}

export function resolveTargetEpisode(
  episodes: AnikotoEpisodeItem[],
  episodeNumber?: number,
  absoluteOffset: number = 0,
  options: EpisodeResolutionOptions = {}
): AnikotoEpisodeItem | null {
  if (!episodes || episodes.length === 0) return null;

  const rawTarget = (typeof episodeNumber === "number" && !isNaN(episodeNumber)) ? episodeNumber : 1;
  const targetNum = options.allowZero === false ? Math.max(1, rawTarget) : Math.max(0, rawTarget);
  const allowZero = options.allowZero !== false;

  if (options.continuous) {
    if (absoluteOffset > 0 && allowZero) {
      const absoluteEpisode = episodes.find(e => e.num === absoluteOffset + targetNum);
      if (absoluteEpisode) return absoluteEpisode;
    }
    const direct = episodes.find(e => e.num === targetNum);
    if (direct) return direct;
  } else {
    const direct = episodes.find(e => e.num === targetNum);
    if (direct) return direct;

    if (!options.local && absoluteOffset > 0) {
      const absoluteEpisode = episodes.find(e => e.num === absoluteOffset + targetNum);
      if (absoluteEpisode) return absoluteEpisode;
    }
  }

  if (episodes.length === 1 && targetNum >= 1) {
    return episodes[0];
  }

  return null;
}

export function isContinuousNumbering(
  episodes: AnikotoEpisodeItem[],
  meta: TMDBMetadata | null | undefined
): boolean {
  if (!episodes || episodes.length === 0 || !meta) return false;
  const maxEpisode = Math.max(...episodes.map(e => e.num));
  const totalEpisodes = meta.totalEpisodes || 0;
  const seasonEpisodeCount = meta.seasonEpisodeCount || 0;

  if (totalEpisodes <= 0) return false;
  if (Math.abs(maxEpisode - totalEpisodes) > 2) return false;
  return seasonEpisodeCount === 0 || maxEpisode > seasonEpisodeCount + 2;
}
