import { TMDBMetadata } from "../types";
import { decodeHtmlEntities, extractSeasonNumber } from "../utils/textUtils";

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface ParsedIdInfo {
  cleanId: string;
  isKitsu: boolean;
  isAnikoto: boolean;
  season: number;
  episode: number;
}

export function parseIncomingId(
  rawId: string,
  season?: number,
  episode?: number
): ParsedIdInfo {
  let s = (typeof season === "number" && !isNaN(season)) ? season : undefined;
  let e = (typeof episode === "number" && !isNaN(episode)) ? episode : undefined;

  const raw = String(rawId || "").trim();
  const isKitsu = raw.startsWith("kitsu:") || raw.startsWith("kitsu/");
  const isAnikoto = raw.startsWith("anikoto:") || raw.startsWith("anikoto/");
  const stripped = raw.replace(/^kitsu[:/]/, "").replace(/^anikoto[:/]/, "").replace(/^tmdb[:/]/, "");
  const parts = stripped.split(":");
  const cleanId = parts[0].split("/")[0].trim();

  if (parts.length >= 3) {
    if (s === undefined) s = parseInt(parts[1], 10);
    if (e === undefined) e = parseInt(parts[2], 10);
  } else if (parts.length === 2) {
    if (isKitsu || isAnikoto) {
      if (e === undefined) e = parseInt(parts[1], 10);
      if (s === undefined) s = 1;
    } else {
      if (e === undefined) e = parseInt(parts[1], 10);
    }
  }

  return {
    cleanId,
    isKitsu,
    isAnikoto,
    season: (typeof s === "number" && !isNaN(s)) ? s : 1,
    episode: (typeof e === "number" && !isNaN(e)) ? e : 1
  };
}

export async function getTmdbMetadata(
  rawId: string,
  mediaType: string,
  season?: number,
  episode?: number
): Promise<TMDBMetadata | null> {
  let kind: "tv" | "movie" = mediaType === "movie" ? "movie" : "tv";
  const parsed = parseIncomingId(rawId, season, episode);
  const cleanId = parsed.cleanId;
  let targetSeason = parsed.season;

  // 1. If direct Anikoto ID provided (e.g. anikoto:1642:1:1)
  if (parsed.isAnikoto) {
    return {
      numericId: cleanId,
      kind,
      title: `Anikoto ${cleanId}`,
      alternateTitles: [],
      absoluteOffset: 0
    };
  }

  // 2. If Kitsu ID provided (e.g. kitsu:12:1 or kitsu:8671)
  if (parsed.isKitsu) {
    try {
      const kRes = await fetch(`https://kitsu.io/api/edge/anime/${encodeURIComponent(cleanId)}`, {
        headers: { "Accept": "application/vnd.api+json", "User-Agent": UA }
      });
      if (kRes.ok) {
        const kData = await kRes.json();
        const attr = kData.data?.attributes;
        const mainTitle = attr?.canonicalTitle || attr?.titles?.en || attr?.titles?.en_jp;
        const origTitle = attr?.titles?.ja_jp || attr?.titles?.en_jp;
        const altList: string[] = Object.values(attr?.titles || {})
          .concat(attr?.abbreviatedTitles || [])
          .filter((t): t is string => Boolean(t && typeof t === "string"));

        if (mainTitle) {
          const titleSeason = extractSeasonNumber(mainTitle) || (origTitle ? extractSeasonNumber(origTitle) : null);
          if (titleSeason && titleSeason > 1) {
            targetSeason = titleSeason;
          }

          try {
            const sRes = await fetch(`https://api.themoviedb.org/3/search/${kind}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(mainTitle)}`, {
              headers: { "User-Agent": UA }
            });
            if (sRes.ok) {
              const sData = await sRes.json();
              if (sData.results && sData.results.length > 0) {
                const tmdbIdFound = sData.results[0].id;
                const tmdbMeta = await getTmdbMetadata(String(tmdbIdFound), kind, targetSeason);
                if (tmdbMeta) {
                  return {
                    ...tmdbMeta,
                    title: decodeHtmlEntities(mainTitle),
                    alternateTitles: [...new Set([tmdbMeta.title, ...tmdbMeta.alternateTitles, ...altList])]
                  };
                }
              }
            }
          } catch {}

          return {
            numericId: cleanId,
            kind,
            title: decodeHtmlEntities(mainTitle),
            originalTitle: origTitle ? decodeHtmlEntities(origTitle) : undefined,
            alternateTitles: altList.map(t => decodeHtmlEntities(t)),
            absoluteOffset: 0
          };
        }
      }
    } catch {}
  }

  // 3. If IMDB ID provided (e.g. tt0388629:1:1 or tt0388629)
  let numericId: string | number = cleanId;
  if (cleanId.startsWith("tt")) {
    try {
      const findUrl = `https://api.themoviedb.org/3/find/${encodeURIComponent(cleanId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
      const res = await fetch(findUrl, { headers: { "User-Agent": UA } });
      if (res.ok) {
        const data = await res.json();
        if (kind === "movie" && data.movie_results && data.movie_results.length > 0) {
          numericId = data.movie_results[0].id;
        } else if (data.tv_results && data.tv_results.length > 0) {
          kind = "tv";
          numericId = data.tv_results[0].id;
        } else if (data.movie_results && data.movie_results.length > 0) {
          kind = "movie";
          numericId = data.movie_results[0].id;
        }
      }
    } catch {}
  }

  // 4. Fetch detailed metadata from TMDB
  try {
    const url = `https://api.themoviedb.org/3/${kind}/${numericId}?api_key=${TMDB_API_KEY}&append_to_response=alternative_titles,external_ids`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const data = await res.json();
      const mainTitle = kind === "tv" ? data.name : data.title;
      const origTitle = kind === "tv" ? data.original_name : data.original_title;
      const altList = (data.alternative_titles?.results || data.alternative_titles?.titles || []).map(
        (t: { title: string }) => t.title
      );

      let absoluteOffset = 0;
      let seasonName: string | undefined;
      const allSeasons: Array<{ season_number: number; name: string }> = [];
      if (kind === "tv" && data.seasons) {
        for (const s of data.seasons) {
          if (s.season_number != null && s.name) {
            allSeasons.push({ season_number: s.season_number, name: decodeHtmlEntities(s.name) });
          }
          if (targetSeason && s.season_number > 0 && s.season_number < targetSeason) {
            absoluteOffset += (s.episode_count || 0);
          }
          if (targetSeason && s.season_number === targetSeason) {
            seasonName = s.name;
          }
        }
      }

      return {
        numericId,
        kind,
        title: decodeHtmlEntities(mainTitle || ""),
        originalTitle: origTitle ? decodeHtmlEntities(origTitle) : undefined,
        alternateTitles: altList.map((t: string) => decodeHtmlEntities(t)),
        imdbId: data.external_ids?.imdb_id,
        seasonName,
        allSeasons,
        absoluteOffset
      };
    }
  } catch {}

  // 5. Keyless fallback by scraping themoviedb.org page directly
  try {
    const scrapeUrl = `https://www.themoviedb.org/${kind}/${numericId}`;
    const res = await fetch(scrapeUrl, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const html = await res.text();
      const ogMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (ogMatch) {
        const title = ogMatch[1].replace(/\s*-\s*The Movie Database.*$/i, "").replace(/\s*-\s*TMDb.*$/i, "").trim();
        return {
          numericId,
          kind,
          title: decodeHtmlEntities(title),
          alternateTitles: [],
          absoluteOffset: 0
        };
      }
    }
  } catch {}

  return null;
}
