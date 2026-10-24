import { TMDB_API_KEY } from "./tmdbClient";
import {
  cleanTitle,
  computeDiceScore,
  decodeHtmlEntities,
  distinctiveWords,
  fetchWithTimeout,
  parseSeasonLabel
} from "../utils/textUtils";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface KitsuResolution {
  tmdbId: string;
  kind: "tv" | "movie";
  season: number;
  episodeOffset: number;
  title: string;
  originalTitle?: string;
  alternateTitles: string[];
}

interface KitsuAnime {
  id: string;
  subtype: string;
  episodeCount: number;
  startDate?: string;
  canonicalTitle: string;
  originalTitle?: string;
  titles: string[];
}

const cache = new Map<string, KitsuResolution | null>();

function titleScore(candidate: string, target: string): number {
  const c = cleanTitle(candidate);
  const t = cleanTitle(target);
  if (!c || !t) return 0;
  if (c === t) return 1;

  let best = 0;
  if (c.startsWith(t) || t.startsWith(c)) {
    const ratio = Math.min(c.length, t.length) / Math.max(c.length, t.length);
    best = Math.max(best, 0.8 * ratio);
  }
  if (c.includes(t) || t.includes(c)) {
    const ratio = Math.min(c.length, t.length) / Math.max(c.length, t.length);
    best = Math.max(best, 0.7 * ratio);
  }

  const targetWords = distinctiveWords(t);
  if (targetWords.length > 0) {
    const candidateWords = new Set(distinctiveWords(c));
    let matched = 0;
    for (const w of targetWords) if (candidateWords.has(w)) matched++;
    if (matched / targetWords.length >= 0.8) best = Math.max(best, 0.8);
  }

  return Math.max(best, computeDiceScore(c, t));
}

function pickBestTmdbResult(
  results: Array<Record<string, unknown>>,
  kitsu: KitsuAnime
): Record<string, unknown> | null {
  const titles = [kitsu.canonicalTitle, ...kitsu.titles].filter(Boolean);
  const startYear = kitsu.startDate ? parseInt(kitsu.startDate.slice(0, 4), 10) : null;
  let best: Record<string, unknown> | null = null;
  let bestScore = 0;

  for (const result of results) {
    const name = String(result.name || result.title || "");
    const original = String(result.original_name || result.original_title || "");
    let score = 0;
    for (const title of titles) {
      score = Math.max(score, titleScore(name, title), titleScore(original, title));
    }

    const dateValue = String(result.first_air_date || result.release_date || "");
    const resultYear = dateValue ? parseInt(dateValue.slice(0, 4), 10) : null;
    if (startYear && resultYear) {
      const delta = Math.abs(resultYear - startYear);
      if (delta <= 1) score += 0.15;
      else if (delta > 3) score -= 0.2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = result;
    }
  }

  return bestScore >= 0.45 ? best : null;
}

async function fetchKitsuAnime(kitsuId: string): Promise<KitsuAnime | null> {
  try {
    const res = await fetchWithTimeout(
      `https://kitsu.io/api/edge/anime/${encodeURIComponent(kitsuId)}`,
      { headers: { Accept: "application/vnd.api+json", "User-Agent": UA } },
      4000
    );
    if (!res.ok) return null;
    const data = await res.json();
    const attr = data.data?.attributes;
    if (!attr) return null;

    const titles = Object.values(attr.titles || {})
      .concat(attr.abbreviatedTitles || [])
      .filter((t): t is string => Boolean(t && typeof t === "string"))
      .map(t => decodeHtmlEntities(t));

    return {
      id: String(data.data.id),
      subtype: String(attr.subtype || "").toLowerCase(),
      episodeCount: Number(attr.episodeCount || 0),
      startDate: attr.startDate || undefined,
      canonicalTitle: decodeHtmlEntities(attr.canonicalTitle || titles[0] || ""),
      originalTitle: attr.titles?.ja_jp ? decodeHtmlEntities(attr.titles.ja_jp) : undefined,
      titles
    };
  } catch {
    return null;
  }
}

async function searchTmdb(kitsu: KitsuAnime, kind: "tv" | "movie"): Promise<Record<string, unknown> | null> {
  const queries = [kitsu.canonicalTitle, ...kitsu.titles]
    .filter((q): q is string => Boolean(q && q.trim()));

  for (const query of [...new Set(queries)].slice(0, 5)) {
    try {
      const res = await fetchWithTimeout(
        `https://api.themoviedb.org/3/search/${kind}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`,
        { headers: { "User-Agent": UA } },
        4000
      );
      if (!res.ok) continue;
      const data = await res.json();
      const best = pickBestTmdbResult(data.results || [], kitsu);
      if (best) return best;
    } catch {
      continue;
    }
  }
  return null;
}

async function mapByAirDate(
  tmdbId: string,
  startDate?: string
): Promise<{ season: number; episodeOffset: number } | null> {
  if (!startDate) return null;
  const start = Date.parse(startDate);
  if (isNaN(start)) return null;

  try {
    const showRes = await fetchWithTimeout(
      `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}?api_key=${TMDB_API_KEY}`,
      { headers: { "User-Agent": UA } },
      4000
    );
    if (!showRes.ok) return null;
    const show = await showRes.json();
    const seasons = (show.seasons || [])
      .filter((s: { season_number: number; air_date?: string }) => s.season_number > 0 && s.air_date)
      .sort((a: { air_date: string }, b: { air_date: string }) =>
        Math.abs(Date.parse(a.air_date) - start) - Math.abs(Date.parse(b.air_date) - start)
      )
      .slice(0, 3);

    let best: { season: number; episode: number; delta: number } | null = null;

    for (const season of seasons) {
      try {
        const seasonRes = await fetchWithTimeout(
          `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}/season/${season.season_number}?api_key=${TMDB_API_KEY}`,
          { headers: { "User-Agent": UA } },
          4000
        );
        if (!seasonRes.ok) continue;
        const seasonData = await seasonRes.json();
        for (const episode of seasonData.episodes || []) {
          if (!episode.air_date || !episode.episode_number) continue;
          const delta = Math.abs(Date.parse(episode.air_date) - start);
          if (!best || delta < best.delta) {
            best = { season: season.season_number, episode: episode.episode_number, delta };
          }
        }
      } catch {
        continue;
      }
    }

    if (best && best.delta <= 14 * 86400000) {
      return { season: best.season, episodeOffset: best.episode - 1 };
    }

    if (seasons.length > 0) {
      return { season: seasons[0].season_number, episodeOffset: 0 };
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolveKitsuEntry(
  kitsuId: string,
  mediaType: string,
  incomingSeason: number
): Promise<KitsuResolution | null> {
  if (!kitsuId) return null;
  const cacheKey = `${kitsuId}:${mediaType}:${incomingSeason}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) || null;

  const kitsu = await fetchKitsuAnime(kitsuId);
  if (!kitsu) {
    cache.set(cacheKey, null);
    return null;
  }

  const kind: "tv" | "movie" =
    mediaType === "movie" || kitsu.subtype === "movie" ? "movie" : "tv";

  const tmdb = await searchTmdb(kitsu, kind);
  if (!tmdb) {
    cache.set(cacheKey, null);
    return null;
  }

  const tmdbId = String(tmdb.id);
  const base: KitsuResolution = {
    tmdbId,
    kind,
    season: 1,
    episodeOffset: 0,
    title: kitsu.canonicalTitle,
    originalTitle: kitsu.originalTitle,
    alternateTitles: [...new Set([...kitsu.titles, kitsu.canonicalTitle].filter(Boolean))]
  };

  if (kind === "movie") {
    cache.set(cacheKey, base);
    return base;
  }

  if (incomingSeason > 1) {
    const resolved = { ...base, season: incomingSeason };
    cache.set(cacheKey, resolved);
    return resolved;
  }

  if (kitsu.episodeCount > 100) {
    cache.set(cacheKey, base);
    return base;
  }

  const labels = [kitsu.canonicalTitle, ...kitsu.titles].map(t => parseSeasonLabel(t));
  const titleSeason = labels
    .map(l => l.season)
    .filter((s): s is number => typeof s === "number" && s > 1)
    .sort((a, b) => b - a)[0];
  const titlePart = labels
    .map(l => l.part)
    .filter((p): p is number => typeof p === "number" && p > 1)
    .sort((a, b) => b - a)[0];

  if (titleSeason) {
    if (titlePart) {
      const mapped = await mapByAirDate(tmdbId, kitsu.startDate);
      const resolved = {
        ...base,
        season: titleSeason,
        episodeOffset: mapped && mapped.season === titleSeason ? mapped.episodeOffset : 0
      };
      cache.set(cacheKey, resolved);
      return resolved;
    }
    const resolved = { ...base, season: titleSeason };
    cache.set(cacheKey, resolved);
    return resolved;
  }

  const mapped = await mapByAirDate(tmdbId, kitsu.startDate);
  const resolved = {
    ...base,
    season: mapped?.season || 1,
    episodeOffset: mapped?.episodeOffset || 0
  };
  cache.set(cacheKey, resolved);
  return resolved;
}
