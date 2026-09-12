import { TMDBMetadata } from "../types";
import { decodeHtmlEntities } from "../utils/textUtils";

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function getTmdbMetadata(
  tmdbId: string,
  mediaType: string,
  season?: number
): Promise<TMDBMetadata | null> {
  let kind: "tv" | "movie" = mediaType === "movie" ? "movie" : "tv";
  let numericId: string | number = tmdbId;

  // If IMDB ID provided (e.g. tt1234567), resolve via TMDB find API
  if (String(tmdbId).startsWith("tt")) {
    try {
      const findUrl = `https://api.themoviedb.org/3/find/${encodeURIComponent(tmdbId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
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

  // Fetch detailed metadata from TMDB
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
      if (kind === "tv" && season && data.seasons) {
        for (const s of data.seasons) {
          if (s.season_number > 0 && s.season_number < season) {
            absoluteOffset += (s.episode_count || 0);
          }
          if (s.season_number === season) {
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
        absoluteOffset
      };
    }
  } catch {}

  // Keyless fallback by scraping themoviedb.org page directly
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
