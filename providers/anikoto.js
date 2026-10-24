"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  cleanTitle: () => cleanTitle,
  computeDiceScore: () => computeDiceScore,
  coversNamedSeason: () => coversNamedSeason,
  decodeHtmlEntities: () => decodeHtmlEntities,
  extractSeasonNumber: () => extractSeasonNumber,
  findBestAnimeMatch: () => findBestAnimeMatch,
  getStreams: () => getStreams,
  isContinuousNumbering: () => isContinuousNumbering,
  parseSeasonLabel: () => parseSeasonLabel,
  planSeasonTarget: () => planSeasonTarget,
  resolveTargetEpisode: () => resolveTargetEpisode,
  resolveTargetSeasonAnimeId: () => resolveTargetSeasonAnimeId,
  scoreBaseTitle: () => scoreBaseTitle,
  scoreTitleMatch: () => scoreTitleMatch,
  search: () => search,
  seasonAlignmentScore: () => seasonAlignmentScore
});
module.exports = __toCommonJS(index_exports);

// src/utils/textUtils.ts
function decodeHtmlEntities(str) {
  if (!str) return "";
  return str.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10))).replace(/&#039;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanTitle(str) {
  if (!str) return "";
  return decodeHtmlEntities(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function computeDiceScore(s1, s2) {
  const a = cleanTitle(s1);
  const b = cleanTitle(s2);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const wordsA = a.split(" ").filter(Boolean);
  const wordsB = b.split(" ").filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  return 2 * intersection / (wordsA.length + wordsB.length);
}
function fetchWithTimeout(url, opts = {}, timeoutMs = 4e3) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}
var SEASON_STOP_WORDS = /* @__PURE__ */ new Set([
  "season",
  "seasons",
  "part",
  "parts",
  "cour",
  "cours",
  "the",
  "a",
  "an",
  "of",
  "and",
  "to",
  "in",
  "on",
  "for",
  "with",
  "ver",
  "version",
  "tv",
  "arc",
  "special",
  "specials",
  "movie",
  "movies",
  "film",
  "films",
  "final",
  "story",
  "chapter",
  "volume",
  "no",
  "wa",
  "ga",
  "ni",
  "de",
  "wo",
  "ova",
  "ona",
  "recap",
  "picture",
  "drama",
  "mini",
  "anime",
  "half"
]);
function parseSeasonLabel(title) {
  const raw = decodeHtmlEntities(String(title || "")).trim();
  const lower = raw.toLowerCase();
  const isSpecial = /\b(specials?|ova|onas?|recap|picture drama|mini anime)\b/i.test(lower);
  const isMovie = /\b(movies?|films?)\b/i.test(lower);
  const isFinalSeason = /\bfinal season\b/i.test(lower);
  let season = null;
  let part = null;
  const mSeason = lower.match(/\bseason\s*0*(\d+)\b/i);
  if (mSeason) season = parseInt(mSeason[1], 10);
  if (season === null) {
    const mNth = lower.match(/\b0*(\d+)\s*(?:st|nd|rd|th)\s*season\b/i);
    if (mNth) season = parseInt(mNth[1], 10);
  }
  if (season === null) {
    const mS = lower.match(/\bs0*(\d+)\b/i);
    if (mS) season = parseInt(mS[1], 10);
  }
  if (season === null) {
    const mRoman = raw.match(/\b(VI|V|IV|III|II)\b/);
    if (mRoman) {
      const map = { II: 2, III: 3, IV: 4, V: 5, VI: 6 };
      season = map[mRoman[1].toUpperCase()] ?? null;
    }
  }
  if (season === null) {
    const mTrail = raw.match(/\s+([2-9])$/);
    if (mTrail && !/\b(?:part|cour)\s*[2-9]\s*$/i.test(raw)) {
      season = parseInt(mTrail[1], 10);
    }
  }
  const mPart = lower.match(/\b(?:part|cour)\s*0*(\d+)\b/i);
  if (mPart) part = parseInt(mPart[1], 10);
  return { season, part, isSpecial, isMovie, isFinalSeason };
}
function extractSeasonNumber(title) {
  return parseSeasonLabel(title).season;
}
function distinctiveWords(text) {
  return cleanTitle(text).split(" ").filter((w) => w.length >= 3 && !SEASON_STOP_WORDS.has(w));
}
function coversNamedSeason(candidate, seasonName) {
  if (!candidate || !seasonName) return false;
  const targetWords = distinctiveWords(seasonName);
  if (targetWords.length === 0) return false;
  const candidateWords = new Set(distinctiveWords(candidate));
  if (candidateWords.size === 0) return false;
  let matched = 0;
  for (const w of targetWords) if (candidateWords.has(w)) matched++;
  return matched / targetWords.length >= 0.6;
}
var LANG_MAP = {
  english: "eng",
  spanish: "spa",
  portuguese: "por",
  french: "fre",
  german: "ger",
  italian: "ita",
  russian: "rus",
  arabic: "ara",
  indonesian: "ind",
  vietnamese: "vie",
  thai: "tha",
  turkish: "tur",
  polish: "pol",
  dutch: "dut",
  japanese: "jpn",
  korean: "kor",
  chinese: "chi",
  hindi: "hin",
  bengali: "ben"
};
function normalizeSubtitleLang(rawLabel) {
  if (!rawLabel) return "eng";
  const clean = rawLabel.toLowerCase().trim();
  for (const [key, code] of Object.entries(LANG_MAP)) {
    if (clean.includes(key)) return code;
  }
  if (/^[a-z]{3}$/i.test(clean)) return clean.toLowerCase();
  if (/^[a-z]{2}$/i.test(clean)) {
    if (clean === "en") return "eng";
    if (clean === "es") return "spa";
    if (clean === "pt") return "por";
    if (clean === "fr") return "fre";
    if (clean === "de") return "ger";
    if (clean === "it") return "ita";
    if (clean === "ja") return "jpn";
    if (clean === "ko") return "kor";
    if (clean === "zh") return "chi";
  }
  return "eng";
}

// src/api/tmdbClient.ts
var TMDB_API_KEY = typeof process !== "undefined" && process.env?.TMDB_API_KEY || "439c478a771f35c05022f9feabcca01c";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
function parseIncomingId(rawId, season, episode) {
  let s = typeof season === "number" && !isNaN(season) ? season : void 0;
  let e = typeof episode === "number" && !isNaN(episode) ? episode : void 0;
  const raw = String(rawId || "").trim();
  const isKitsu = raw.startsWith("kitsu:") || raw.startsWith("kitsu/");
  const isAnikoto = raw.startsWith("anikoto:") || raw.startsWith("anikoto/");
  const stripped = raw.replace(/^kitsu[:/]/, "").replace(/^anikoto[:/]/, "").replace(/^tmdb[:/]/, "");
  const parts = stripped.split(":");
  const cleanId = parts[0].split("/")[0].trim();
  if (parts.length >= 3) {
    if (s === void 0) s = parseInt(parts[1], 10);
    if (e === void 0) e = parseInt(parts[2], 10);
  } else if (parts.length === 2) {
    if (isKitsu || isAnikoto) {
      if (e === void 0) e = parseInt(parts[1], 10);
      if (s === void 0) s = 1;
    } else {
      if (e === void 0) e = parseInt(parts[1], 10);
    }
  }
  return {
    cleanId,
    isKitsu,
    isAnikoto,
    season: typeof s === "number" && !isNaN(s) ? s : 1,
    episode: typeof e === "number" && !isNaN(e) ? e : 1
  };
}
async function getTmdbMetadata(rawId, mediaType, season, episode) {
  let kind = mediaType === "movie" ? "movie" : "tv";
  const parsed = parseIncomingId(rawId, season, episode);
  const cleanId = parsed.cleanId;
  let targetSeason = parsed.season;
  if (parsed.isAnikoto) {
    return {
      numericId: cleanId,
      kind,
      title: `Anikoto ${cleanId}`,
      alternateTitles: [],
      absoluteOffset: 0
    };
  }
  if (parsed.isKitsu) {
    try {
      const kRes = await fetchWithTimeout(`https://kitsu.io/api/edge/anime/${encodeURIComponent(cleanId)}`, {
        headers: { "Accept": "application/vnd.api+json", "User-Agent": UA }
      });
      if (kRes.ok) {
        const kData = await kRes.json();
        const attr = kData.data?.attributes;
        const mainTitle = attr?.canonicalTitle || attr?.titles?.en || attr?.titles?.en_jp;
        const origTitle = attr?.titles?.ja_jp || attr?.titles?.en_jp;
        const altList = Object.values(attr?.titles || {}).concat(attr?.abbreviatedTitles || []).filter((t) => Boolean(t && typeof t === "string"));
        if (mainTitle) {
          const titleSeason = extractSeasonNumber(mainTitle) || (origTitle ? extractSeasonNumber(origTitle) : null);
          if (titleSeason && titleSeason > 1) {
            targetSeason = titleSeason;
          }
          try {
            const sRes = await fetchWithTimeout(`https://api.themoviedb.org/3/search/${kind}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(mainTitle)}`, {
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
                    alternateTitles: [.../* @__PURE__ */ new Set([tmdbMeta.title, ...tmdbMeta.alternateTitles, ...altList])],
                    resolvedSeason: targetSeason
                  };
                }
              }
            }
          } catch (err) {
            console.warn("[Anikoto] Kitsu->TMDB search failed:", err?.message || err);
          }
          return {
            numericId: cleanId,
            kind,
            title: decodeHtmlEntities(mainTitle),
            originalTitle: origTitle ? decodeHtmlEntities(origTitle) : void 0,
            alternateTitles: altList.map((t) => decodeHtmlEntities(t)),
            absoluteOffset: 0,
            resolvedSeason: targetSeason
          };
        }
      }
    } catch (err) {
      console.warn("[Anikoto] Kitsu metadata fetch failed:", err?.message || err);
    }
  }
  let numericId = cleanId;
  if (cleanId.startsWith("tt")) {
    try {
      const findUrl = `https://api.themoviedb.org/3/find/${encodeURIComponent(cleanId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
      const res = await fetchWithTimeout(findUrl, { headers: { "User-Agent": UA } }, 4e3);
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
    } catch (err) {
      console.warn("[Anikoto] IMDB->TMDB lookup failed:", err?.message || err);
    }
  }
  try {
    const url = `https://api.themoviedb.org/3/${kind}/${numericId}?api_key=${TMDB_API_KEY}&append_to_response=alternative_titles,external_ids`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, 4e3);
    if (res.ok) {
      const data = await res.json();
      const mainTitle = kind === "tv" ? data.name : data.title;
      const origTitle = kind === "tv" ? data.original_name : data.original_title;
      const altList = (data.alternative_titles?.results || data.alternative_titles?.titles || []).map(
        (t) => t.title
      );
      let absoluteOffset = 0;
      let seasonName;
      let seasonEpisodeCount;
      let totalEpisodes = 0;
      const allSeasons = [];
      if (kind === "tv" && data.seasons) {
        for (const s of data.seasons) {
          if (s.season_number != null && s.name) {
            allSeasons.push({
              season_number: s.season_number,
              name: decodeHtmlEntities(s.name),
              episode_count: s.episode_count || 0
            });
          }
          if (s.season_number > 0) {
            totalEpisodes += s.episode_count || 0;
          }
          if (targetSeason && s.season_number > 0 && s.season_number < targetSeason) {
            absoluteOffset += s.episode_count || 0;
          }
          if (targetSeason && s.season_number === targetSeason) {
            seasonName = s.name;
            seasonEpisodeCount = s.episode_count || 0;
          }
        }
      }
      return {
        numericId,
        kind,
        title: decodeHtmlEntities(mainTitle || ""),
        originalTitle: origTitle ? decodeHtmlEntities(origTitle) : void 0,
        alternateTitles: altList.map((t) => decodeHtmlEntities(t)),
        imdbId: data.external_ids?.imdb_id,
        seasonName,
        allSeasons,
        absoluteOffset,
        totalEpisodes,
        seasonEpisodeCount,
        resolvedSeason: targetSeason
      };
    }
  } catch (err) {
    console.warn("[Anikoto] TMDB metadata fetch failed:", err?.message || err);
  }
  try {
    const scrapeUrl = `https://www.themoviedb.org/${kind}/${numericId}`;
    const res = await fetchWithTimeout(scrapeUrl, { headers: { "User-Agent": UA } }, 4e3);
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
          absoluteOffset: 0,
          resolvedSeason: targetSeason
        };
      }
    }
  } catch (err) {
    console.warn("[Anikoto] TMDB scrape fallback failed:", err?.message || err);
  }
  return null;
}

// src/api/anikotoClient.ts
var BASE_URL = "https://anikoto.cz";
var UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var HEADERS = {
  "User-Agent": UA2,
  "Referer": `${BASE_URL}/`
};
var AJAX_HEADERS = {
  ...HEADERS,
  "X-Requested-With": "XMLHttpRequest"
};
async function searchAnikoto(query) {
  if (!query || !query.trim()) return [];
  const filterUrl = `${BASE_URL}/filter?keyword=${encodeURIComponent(query.trim())}`;
  try {
    let res;
    try {
      res = await fetchWithTimeout(filterUrl, { headers: HEADERS }, 3500);
    } catch {
      res = await fetchWithTimeout(filterUrl, { headers: HEADERS }, 5e3);
    }
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/<div class="item [\s\S]*?<div class="ani poster tip" data-tip="(\d+)"[\s\S]*?<a class="name d-title" href="([^"]+)"(?:\s+data-jp="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/gi)];
      if (matches.length > 0) {
        return matches.map((m) => ({
          id: m[1],
          url: m[2],
          jpTitle: m[3] ? decodeHtmlEntities(m[3].trim()) : void 0,
          title: decodeHtmlEntities(m[4].replace(/<[^>]+>/g, "").trim())
        }));
      }
    }
  } catch (err) {
    console.warn("[Anikoto] searchAnikoto filter failed:", err?.message || err);
  }
  try {
    const ajaxUrl = `${BASE_URL}/ajax/anime/search?keyword=${encodeURIComponent(query.trim())}`;
    const res = await fetchWithTimeout(ajaxUrl, { headers: AJAX_HEADERS }, 4e3);
    if (res.ok) {
      const json = await res.json();
      const html = json?.result?.html || "";
      const items = [...html.matchAll(/<a class="item" href="([^"]+)"[\s\S]*?<div class="name d-title"[^>]*>([\s\S]*?)<\/div>/gi)];
      return items.map((m) => {
        const url = m[1];
        const rawTitle = m[2].replace(/<[^>]+>/g, "").trim();
        return {
          id: "",
          url,
          title: decodeHtmlEntities(rawTitle)
        };
      });
    }
  } catch (err) {
    console.warn("[Anikoto] searchAnikoto ajax fallback failed:", err?.message || err);
  }
  return [];
}
async function getAnimeIdFromUrl(url) {
  try {
    const res = await fetchWithTimeout(url, { headers: HEADERS }, 4e3);
    if (res.ok) {
      const html = await res.text();
      const idMatch = html.match(/data-id="(\d+)"/);
      if (idMatch) return idMatch[1];
    }
  } catch (err) {
    console.warn("[Anikoto] getAnimeIdFromUrl failed:", err?.message || err);
  }
  return null;
}
async function getAnimeSeasons(animeId) {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/seasons/${encodeURIComponent(animeId)}`, { headers: AJAX_HEADERS }, 4e3);
    if (res.ok) {
      const json = await res.json();
      const html = json?.result || "";
      const items = [...html.matchAll(/<div class="swiper-slide season (active)?">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<div class="name"[^>]*>([\s\S]*?)<\/div>/gi)];
      return items.map((m) => ({
        active: !!m[1],
        url: m[2],
        name: decodeHtmlEntities(m[3].trim())
      }));
    }
  } catch (err) {
    console.warn("[Anikoto] getAnimeSeasons failed:", err?.message || err);
  }
  return [];
}
async function getEpisodeList(animeId) {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/ajax/episode/list/${encodeURIComponent(animeId)}`, { headers: AJAX_HEADERS }, 4e3);
    if (res.ok) {
      const json = await res.json();
      const html = json?.result || "";
      const matches = [...html.matchAll(/<a[^>]+data-id="(\d+)"[^>]+data-num="(\d+)"[^>]+data-ids="([^"]+)"(?:[^>]*data-mal="(\d+)")?[^>]*>(?:<b>(\d+)<\/b>)?(?:\s*<span[^>]*class="d-title"[^>]*>([^<]*)<\/span>)?/gi)];
      return matches.map((m) => ({
        id: m[1],
        num: parseInt(m[2], 10),
        dataIds: m[3],
        malId: m[4] || void 0,
        title: m[6] ? decodeHtmlEntities(m[6].trim()) : void 0
      }));
    }
  } catch (err) {
    console.warn("[Anikoto] getEpisodeList failed:", err?.message || err);
  }
  return [];
}
async function getServerList(dataIds) {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/ajax/server/list?servers=${encodeURIComponent(dataIds)}`, { headers: AJAX_HEADERS }, 4e3);
    if (res.ok) {
      const json = await res.json();
      const html = json?.result || "";
      const types = [...html.matchAll(/<div class="type" data-type="(sub|dub)">([\s\S]*?)<\/div>/gi)];
      const list = [];
      for (const t of types) {
        const type = t[1];
        const items = [...t[2].matchAll(/<li[^>]*data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi)];
        for (const item of items) {
          list.push({
            type,
            linkId: item[1],
            serverName: decodeHtmlEntities(item[2].replace(/<[^>]+>/g, "").trim())
          });
        }
      }
      return list;
    }
  } catch (err) {
    console.warn("[Anikoto] getServerList failed:", err?.message || err);
  }
  return [];
}
async function getServerPlayerUrl(linkId) {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/ajax/server?get=${encodeURIComponent(linkId)}`, { headers: AJAX_HEADERS }, 2e3);
    if (res.ok) {
      const json = await res.json();
      return json?.result?.url || null;
    }
  } catch (err) {
    console.warn("[Anikoto] getServerPlayerUrl failed:", err?.message || err);
  }
  return null;
}

// src/matching/titleMatcher.ts
function scoreBaseTitle(candidateTitle, candidateJp, targetTitle) {
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
function seasonAlignmentScore(candidateTitle, candidateJp, targetSeason, seasonName, allSeasons, kind = "tv", baseTitles) {
  const label = parseSeasonLabel(`${candidateTitle} ${candidateJp || ""}`);
  const effectiveSeason = targetSeason > 0 ? targetSeason : 1;
  let score = 0;
  const seasonWords = distinctiveWords(seasonName || "");
  const baseWords = new Set((baseTitles || []).flatMap((t) => distinctiveWords(t)));
  const seasonIsBaseTitle = seasonWords.length > 0 && seasonWords.every((w) => baseWords.has(w));
  const effectiveSeasonName = seasonIsBaseTitle ? void 0 : seasonName;
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
    const finalSeason = (allSeasons || []).find((s) => s.season_number > 0 && /\bfinal\b/i.test(s.name));
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
function scoreTitleMatch(candidateTitle, candidateJp, targetTitle, targetSeason, allSeasons) {
  const effectiveSeason = typeof targetSeason === "number" && targetSeason > 0 ? targetSeason : 1;
  const seasonName = allSeasons?.find((s) => s.season_number === effectiveSeason)?.name;
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
function findBestAnimeMatch(candidates, meta, season) {
  if (!candidates || candidates.length === 0) return null;
  const effectiveSeason = typeof season === "number" && season > 0 ? season : 1;
  const baseTitles = [
    meta.title,
    meta.originalTitle,
    ...meta.alternateTitles || []
  ].filter((t) => Boolean(t && t.trim()));
  const seasonName = meta.seasonName || meta.allSeasons?.find((s) => s.season_number === effectiveSeason)?.name;
  const isMovie = meta.kind === "movie";
  let bestCandidate = null;
  let highestScore = -1;
  let bestPrimary = null;
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
    const isPrimary = isMovie ? isItemMovie : !label.isSpecial && !isItemMovie;
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

// src/matching/seasonMatcher.ts
function isRootCandidate(matched, meta) {
  const rootWords = /* @__PURE__ */ new Set([
    ...distinctiveWords(meta.title),
    ...distinctiveWords(meta.originalTitle || "")
  ]);
  const matchedWords = [
    ...distinctiveWords(matched.title),
    ...distinctiveWords(matched.jpTitle || "")
  ];
  if (matchedWords.length === 0) return false;
  const extra = matchedWords.filter((w) => !rootWords.has(w));
  return extra.length === 0;
}
function isSeasonSpecific(matched, targetSeason, seasonName) {
  const label = parseSeasonLabel(`${matched.title} ${matched.jpTitle || ""}`);
  if (targetSeason > 0 && label.season === targetSeason) return true;
  if (seasonName) {
    if (coversNamedSeason(matched.title, seasonName)) return true;
    if (matched.jpTitle && coversNamedSeason(matched.jpTitle, seasonName)) return true;
  }
  return false;
}
async function resolveCandidateId(item, baseAnimeId) {
  if (item.active) return baseAnimeId;
  const id = await getAnimeIdFromUrl(item.url);
  return id || baseAnimeId;
}
async function buildGroupPlan(entries, baseAnimeId, targetEpisode, targetSeason, reason) {
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
  const resolved = await Promise.all(sorted.map(async (entry) => {
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
async function planSeasonTarget(options) {
  const { baseAnimeId, matched, seasons, meta } = options;
  const targetSeason = options.targetSeason === 0 ? 0 : options.targetSeason > 0 ? options.targetSeason : 1;
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
  const candidates = seasons.map((item, index) => ({
    item,
    label: parseSeasonLabel(item.name),
    index,
    id: item.active ? baseAnimeId : "",
    episodes: []
  }));
  const activeEntry = candidates.find((c) => c.item.active);
  const specials = candidates.filter((c) => c.label.season === 0 || c.label.isSpecial);
  const namedAll = meta.seasonName ? candidates.filter((c) => coversNamedSeason(c.item.name, meta.seasonName)) : [];
  const ordinalAll = targetSeason > 0 ? candidates.filter((c) => c.label.season === targetSeason) : [];
  const preferTv = (entries) => {
    const tv = entries.filter((c) => !c.label.isMovie && !c.label.isSpecial);
    return tv.length > 0 ? tv : entries;
  };
  const named = preferTv(namedAll);
  const ordinal = preferTv(ordinalAll);
  const hasParts = ordinal.some((c) => c.label.part !== null);
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
    const group = named.length > 0 ? named : ordinal.length > 0 ? ordinal : candidates.filter((c) => c.item.active);
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
async function resolveTargetSeasonAnimeId(baseAnimeId, seasonNumber, seasonName, targetEpisode = 1) {
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
    targetSeason: typeof seasonNumber === "number" && seasonNumber >= 0 ? seasonNumber : 1,
    targetEpisode
  });
  return plan?.animeId || baseAnimeId;
}
function resolveTargetEpisode(episodes, episodeNumber, absoluteOffset = 0, options = {}) {
  if (!episodes || episodes.length === 0) return null;
  const rawTarget = typeof episodeNumber === "number" && !isNaN(episodeNumber) ? episodeNumber : 1;
  const targetNum = options.allowZero === false ? Math.max(1, rawTarget) : Math.max(0, rawTarget);
  const allowZero = options.allowZero !== false;
  if (options.continuous) {
    if (absoluteOffset > 0 && allowZero) {
      const absoluteEpisode = episodes.find((e) => e.num === absoluteOffset + targetNum);
      if (absoluteEpisode) return absoluteEpisode;
    }
    const direct = episodes.find((e) => e.num === targetNum);
    if (direct) return direct;
  } else {
    const direct = episodes.find((e) => e.num === targetNum);
    if (direct) return direct;
    if (!options.local && absoluteOffset > 0) {
      const absoluteEpisode = episodes.find((e) => e.num === absoluteOffset + targetNum);
      if (absoluteEpisode) return absoluteEpisode;
    }
  }
  if (episodes.length === 1 && targetNum >= 1) {
    return episodes[0];
  }
  return null;
}
function isContinuousNumbering(episodes, meta) {
  if (!episodes || episodes.length === 0 || !meta) return false;
  const maxEpisode = Math.max(...episodes.map((e) => e.num));
  const totalEpisodes = meta.totalEpisodes || 0;
  const seasonEpisodeCount = meta.seasonEpisodeCount || 0;
  if (totalEpisodes <= 0) return false;
  if (Math.abs(maxEpisode - totalEpisodes) > 2) return false;
  return seasonEpisodeCount === 0 || maxEpisode > seasonEpisodeCount + 2;
}

// src/api/kitsuResolver.ts
var UA3 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var cache = /* @__PURE__ */ new Map();
function titleScore(candidate, target) {
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
function pickBestTmdbResult(results, kitsu) {
  const titles = [kitsu.canonicalTitle, ...kitsu.titles].filter(Boolean);
  const startYear = kitsu.startDate ? parseInt(kitsu.startDate.slice(0, 4), 10) : null;
  let best = null;
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
async function fetchKitsuAnime(kitsuId) {
  try {
    const res = await fetchWithTimeout(
      `https://kitsu.io/api/edge/anime/${encodeURIComponent(kitsuId)}`,
      { headers: { Accept: "application/vnd.api+json", "User-Agent": UA3 } },
      4e3
    );
    if (!res.ok) return null;
    const data = await res.json();
    const attr = data.data?.attributes;
    if (!attr) return null;
    const titles = Object.values(attr.titles || {}).concat(attr.abbreviatedTitles || []).filter((t) => Boolean(t && typeof t === "string")).map((t) => decodeHtmlEntities(t));
    return {
      id: String(data.data.id),
      subtype: String(attr.subtype || "").toLowerCase(),
      episodeCount: Number(attr.episodeCount || 0),
      startDate: attr.startDate || void 0,
      canonicalTitle: decodeHtmlEntities(attr.canonicalTitle || titles[0] || ""),
      originalTitle: attr.titles?.ja_jp ? decodeHtmlEntities(attr.titles.ja_jp) : void 0,
      titles
    };
  } catch {
    return null;
  }
}
async function searchTmdb(kitsu, kind) {
  const queries = [kitsu.canonicalTitle, ...kitsu.titles].filter((q) => Boolean(q && q.trim()));
  for (const query of [...new Set(queries)].slice(0, 5)) {
    try {
      const res = await fetchWithTimeout(
        `https://api.themoviedb.org/3/search/${kind}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`,
        { headers: { "User-Agent": UA3 } },
        4e3
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
async function mapByAirDate(tmdbId, startDate) {
  if (!startDate) return null;
  const start = Date.parse(startDate);
  if (isNaN(start)) return null;
  try {
    const showRes = await fetchWithTimeout(
      `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}?api_key=${TMDB_API_KEY}`,
      { headers: { "User-Agent": UA3 } },
      4e3
    );
    if (!showRes.ok) return null;
    const show = await showRes.json();
    const seasons = (show.seasons || []).filter((s) => s.season_number > 0 && s.air_date).sort(
      (a, b) => Math.abs(Date.parse(a.air_date) - start) - Math.abs(Date.parse(b.air_date) - start)
    ).slice(0, 3);
    let best = null;
    for (const season of seasons) {
      try {
        const seasonRes = await fetchWithTimeout(
          `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}/season/${season.season_number}?api_key=${TMDB_API_KEY}`,
          { headers: { "User-Agent": UA3 } },
          4e3
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
    if (best && best.delta <= 14 * 864e5) {
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
async function resolveKitsuEntry(kitsuId, mediaType, incomingSeason) {
  if (!kitsuId) return null;
  const cacheKey = `${kitsuId}:${mediaType}:${incomingSeason}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) || null;
  const kitsu = await fetchKitsuAnime(kitsuId);
  if (!kitsu) {
    cache.set(cacheKey, null);
    return null;
  }
  const kind = mediaType === "movie" || kitsu.subtype === "movie" ? "movie" : "tv";
  const tmdb = await searchTmdb(kitsu, kind);
  if (!tmdb) {
    cache.set(cacheKey, null);
    return null;
  }
  const tmdbId = String(tmdb.id);
  const base = {
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
    const resolved2 = { ...base, season: incomingSeason };
    cache.set(cacheKey, resolved2);
    return resolved2;
  }
  if (kitsu.episodeCount > 100) {
    cache.set(cacheKey, base);
    return base;
  }
  const labels = [kitsu.canonicalTitle, ...kitsu.titles].map((t) => parseSeasonLabel(t));
  const titleSeason = labels.map((l) => l.season).filter((s) => typeof s === "number" && s > 1).sort((a, b) => b - a)[0];
  const titlePart = labels.map((l) => l.part).filter((p) => typeof p === "number" && p > 1).sort((a, b) => b - a)[0];
  if (titleSeason) {
    if (titlePart) {
      const mapped2 = await mapByAirDate(tmdbId, kitsu.startDate);
      const resolved3 = {
        ...base,
        season: titleSeason,
        episodeOffset: mapped2 && mapped2.season === titleSeason ? mapped2.episodeOffset : 0
      };
      cache.set(cacheKey, resolved3);
      return resolved3;
    }
    const resolved2 = { ...base, season: titleSeason };
    cache.set(cacheKey, resolved2);
    return resolved2;
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

// src/extractors/streamExtractor.ts
var UA4 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var U = "i?LMTAx0Q6,:}50U";
var S = "W0;27ToaUpl_P%'c";
function W(str, len) {
  const encText = new TextEncoder().encode(String(str));
  const arr = new Uint8Array(len);
  arr.set(encText.subarray(0, Math.min(len, encText.length)));
  return arr;
}
function b64ToUint8(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function decryptEnc(encStr) {
  try {
    const keyBytes = W(U, 32);
    const ivBytes = W(S, 16);
    const cipherBytes = b64ToUint8(encStr);
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes.buffer,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: ivBytes.buffer },
      key,
      cipherBytes.buffer
    );
    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text);
  } catch (err) {
    console.warn("[Anikoto] decryptEnc failed:", err?.message || err);
    return null;
  }
}
async function resolveStreamFromServer(server) {
  try {
    const playerUrl = await getServerPlayerUrl(server.linkId);
    if (!playerUrl) return null;
    const playerRes = await fetchWithTimeout(playerUrl, {
      headers: {
        "User-Agent": UA4,
        "Referer": "https://anikoto.cz/"
      }
    }, 2e3);
    if (!playerRes.ok) return null;
    const playerHtml = await playerRes.text();
    const dataIdMatch = playerHtml.match(/data-id="(\d+)"/);
    if (!dataIdMatch) return null;
    const playerStreamId = dataIdMatch[1];
    const parsed = new URL(playerUrl);
    const playerOrigin = parsed.origin;
    const sParam = parsed.searchParams.get("s") || "tcdn";
    const gsUrl = `${playerOrigin}/stream/getSourcesNew?id=${playerStreamId}&s=${encodeURIComponent(sParam)}`;
    const gsRes = await fetchWithTimeout(gsUrl, {
      headers: {
        "User-Agent": UA4,
        "Referer": playerUrl,
        "X-Requested-With": "XMLHttpRequest"
      }
    }, 2e3);
    if (!gsRes.ok) return null;
    const gsJson = await gsRes.json();
    let masterFile = gsJson?.sources?.file;
    if (!masterFile && gsJson?.enc) {
      const dec = await decryptEnc(gsJson.enc);
      masterFile = dec?.file;
    }
    if (!masterFile || typeof masterFile !== "string") return null;
    if (masterFile.includes("fetch.nexabloom.top")) {
      masterFile = masterFile.replace("fetch.nexabloom.top", "ncdn.imgnex.top");
    }
    const subtitles = (gsJson.tracks || []).filter((t) => Boolean(t.file)).map((t) => ({
      url: t.file,
      language: normalizeSubtitleLang(t.label || "English"),
      name: t.label || "English",
      headers: {
        "Referer": `${playerOrigin}/`,
        "Origin": playerOrigin
      }
    }));
    const isDub = server.type === "dub";
    const langLabel = isDub ? "Dub" : "Sub";
    const langCode = isDub ? "en" : "ja";
    const displayName = `${server.serverName} \u2022 ${langLabel}`;
    return {
      title: `Anikoto - ${displayName}`,
      name: displayName,
      url: masterFile,
      quality: "1080p",
      language: langCode,
      type: "hls",
      headers: {
        "Referer": `${playerOrigin}/`,
        "Origin": playerOrigin
      },
      subtitles: subtitles.length > 0 ? subtitles : void 0
    };
  } catch (err) {
    console.warn("[Anikoto] resolveStreamFromServer failed:", err?.message || err);
    return null;
  }
}

// src/index.ts
function buildSearchQueries(meta) {
  const extraSubqueries = [];
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
    ...meta.alternateTitles || []
  ].filter((t) => Boolean(t && t.trim()));
}
async function resolveMetadata(rawId, mediaType, isKitsu, cleanId, targetSeason, targetEpisode) {
  if (isKitsu) {
    const kitsu = await resolveKitsuEntry(cleanId, mediaType, targetSeason);
    if (kitsu) {
      const season2 = kitsu.season;
      const episode = kitsu.episodeOffset + targetEpisode;
      const tmdbMeta = await getTmdbMetadata(kitsu.tmdbId, kitsu.kind, season2, episode);
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
            resolvedSeason: season2
          },
          season: season2,
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
async function getStreams(tmdbId, mediaType = "tv", season, episode) {
  try {
    if (!tmdbId) return [];
    const idInfo = parseIncomingId(tmdbId, season, episode);
    const incomingEpisode = idInfo.episode;
    let targetSeason = idInfo.season;
    let targetEpisode = idInfo.episode;
    let kitsuOffset = 0;
    let seasonAnimeId = "";
    let absoluteOffset = 0;
    let meta = null;
    let plan = null;
    let seasonList = [];
    let matchedAnimeId = "";
    if (idInfo.isAnikoto) {
      seasonAnimeId = idInfo.cleanId;
    } else {
      const resolved2 = await resolveMetadata(
        tmdbId,
        mediaType,
        idInfo.isKitsu,
        idInfo.cleanId,
        targetSeason,
        targetEpisode
      );
      meta = resolved2.meta;
      targetSeason = resolved2.season;
      targetEpisode = resolved2.episode;
      if (idInfo.isKitsu) {
        kitsuOffset = Math.max(0, resolved2.episode - incomingEpisode);
      }
      if (!meta || !meta.title) return [];
      const searchQueries = buildSearchQueries(meta);
      const uniqueQueries = [...new Set(searchQueries)].slice(0, 4);
      const queryResults = await Promise.all(uniqueQueries.map((q) => searchAnikoto(q)));
      const candidateMap = /* @__PURE__ */ new Map();
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
      const nextSeason = seasonList.find((s) => {
        const label = parseSeasonLabel(s.name);
        return label.season === targetSeason + 1 && !label.isSpecial && !label.isMovie;
      });
      if (nextSeason) {
        const nextId = nextSeason.active ? matchedAnimeId : await getAnimeIdFromUrl(nextSeason.url) || matchedAnimeId;
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
    const resolved = await Promise.all(servers.map((s) => resolveStreamFromServer(s)));
    return resolved.filter((s) => Boolean(s && s.url));
  } catch (err) {
    console.warn("[Anikoto] getStreams failed:", err?.message || err);
    return [];
  }
}
async function search(query) {
  try {
    if (!query) return [];
    return await searchAnikoto(query);
  } catch (err) {
    console.warn("[Anikoto] search failed:", err?.message || err);
    return [];
  }
}
if (typeof globalThis !== "undefined") {
  globalThis.getStreams = getStreams;
  globalThis.search = search;
}
