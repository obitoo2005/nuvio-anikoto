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
  extractSeasonNumber: () => extractSeasonNumber,
  findBestAnimeMatch: () => findBestAnimeMatch,
  getStreams: () => getStreams,
  scoreTitleMatch: () => scoreTitleMatch,
  search: () => search
});
module.exports = __toCommonJS(index_exports);

// src/utils/textUtils.ts
function decodeHtmlEntities(str) {
  if (!str) return "";
  return str.replace(/&#039;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
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
function extractSeasonNumber(title) {
  if (!title) return null;
  const match = title.match(/\b(?:season\s*(\d+)|(\d+)(?:nd|rd|th|st)\s*season|part\s*(\d+))\b/i);
  if (!match) return null;
  const num = match[1] || match[2] || match[3];
  return num ? parseInt(num, 10) : null;
}

// src/api/tmdbClient.ts
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
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
      const kRes = await fetch(`https://kitsu.io/api/edge/anime/${encodeURIComponent(cleanId)}`, {
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
                    alternateTitles: [.../* @__PURE__ */ new Set([tmdbMeta.title, ...tmdbMeta.alternateTitles, ...altList])]
                  };
                }
              }
            }
          } catch {
          }
          return {
            numericId: cleanId,
            kind,
            title: decodeHtmlEntities(mainTitle),
            originalTitle: origTitle ? decodeHtmlEntities(origTitle) : void 0,
            alternateTitles: altList.map((t) => decodeHtmlEntities(t)),
            absoluteOffset: 0
          };
        }
      }
    } catch {
    }
  }
  let numericId = cleanId;
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
    } catch {
    }
  }
  try {
    const url = `https://api.themoviedb.org/3/${kind}/${numericId}?api_key=${TMDB_API_KEY}&append_to_response=alternative_titles,external_ids`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const data = await res.json();
      const mainTitle = kind === "tv" ? data.name : data.title;
      const origTitle = kind === "tv" ? data.original_name : data.original_title;
      const altList = (data.alternative_titles?.results || data.alternative_titles?.titles || []).map(
        (t) => t.title
      );
      let absoluteOffset = 0;
      let seasonName;
      const allSeasons = [];
      if (kind === "tv" && data.seasons) {
        for (const s of data.seasons) {
          if (s.season_number != null && s.name) {
            allSeasons.push({ season_number: s.season_number, name: decodeHtmlEntities(s.name) });
          }
          if (targetSeason && s.season_number > 0 && s.season_number < targetSeason) {
            absoluteOffset += s.episode_count || 0;
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
        originalTitle: origTitle ? decodeHtmlEntities(origTitle) : void 0,
        alternateTitles: altList.map((t) => decodeHtmlEntities(t)),
        imdbId: data.external_ids?.imdb_id,
        seasonName,
        allSeasons,
        absoluteOffset
      };
    }
  } catch {
  }
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
  } catch {
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
    const res = await fetch(filterUrl, { headers: HEADERS });
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
  } catch {
  }
  try {
    const ajaxUrl = `${BASE_URL}/ajax/anime/search?keyword=${encodeURIComponent(query.trim())}`;
    const res = await fetch(ajaxUrl, { headers: AJAX_HEADERS });
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
  } catch {
  }
  return [];
}
async function getAnimeIdFromUrl(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const html = await res.text();
      const idMatch = html.match(/data-id="(\d+)"/);
      if (idMatch) return idMatch[1];
    }
  } catch {
  }
  return null;
}
async function getAnimeSeasons(animeId) {
  try {
    const res = await fetch(`${BASE_URL}/api/seasons/${encodeURIComponent(animeId)}`, { headers: AJAX_HEADERS });
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
  } catch {
  }
  return [];
}
async function getEpisodeList(animeId) {
  try {
    const res = await fetch(`${BASE_URL}/ajax/episode/list/${encodeURIComponent(animeId)}`, { headers: AJAX_HEADERS });
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
  } catch {
  }
  return [];
}
async function getServerList(dataIds) {
  try {
    const res = await fetch(`${BASE_URL}/ajax/server/list?servers=${encodeURIComponent(dataIds)}`, { headers: AJAX_HEADERS });
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
  } catch {
  }
  return [];
}
async function getServerPlayerUrl(linkId) {
  try {
    const res = await fetch(`${BASE_URL}/ajax/server?get=${encodeURIComponent(linkId)}`, { headers: AJAX_HEADERS });
    if (res.ok) {
      const json = await res.json();
      return json?.result?.url || null;
    }
  } catch {
  }
  return null;
}

// src/matching/titleMatcher.ts
function scoreTitleMatch(candidateTitle, candidateJp, targetTitle, targetSeason, allSeasons) {
  const cNorm = cleanTitle(candidateTitle);
  const jNorm = candidateJp ? cleanTitle(candidateJp) : "";
  const tNorm = cleanTitle(targetTitle);
  if (!cNorm && !jNorm) return 0;
  if (!tNorm) return 0;
  let score = 0;
  if (cNorm === tNorm || jNorm === tNorm) {
    score = 1;
  } else {
    for (const cand of [cNorm, jNorm]) {
      if (!cand) continue;
      if (cand === tNorm) {
        score = Math.max(score, 1);
        continue;
      }
      if (cand.startsWith(tNorm) || tNorm.startsWith(cand)) {
        const ratio = Math.min(cand.length, tNorm.length) / Math.max(cand.length, tNorm.length);
        score = Math.max(score, 0.8 * ratio);
      } else if (cand.includes(tNorm) || tNorm.includes(cand)) {
        const ratio = Math.min(cand.length, tNorm.length) / Math.max(cand.length, tNorm.length);
        score = Math.max(score, 0.65 * ratio);
      } else {
        score = Math.max(score, computeDiceScore(cand, tNorm));
      }
    }
  }
  const candSeason = extractSeasonNumber(candidateTitle) || (candidateJp ? extractSeasonNumber(candidateJp) : null);
  const effectiveSeason = typeof targetSeason === "number" && targetSeason > 0 ? targetSeason : 1;
  if (effectiveSeason === 1) {
    if (candSeason !== null && candSeason > 1) {
      score -= 0.6;
    } else if (candSeason === null) {
      score += 0.2;
    }
  } else {
    if (candSeason === effectiveSeason) {
      score += 0.4;
    } else if (candSeason !== null && candSeason !== effectiveSeason) {
      score -= 0.6;
    }
  }
  if (allSeasons && allSeasons.length > 0) {
    for (const s of allSeasons) {
      if (s.season_number > 0 && s.name) {
        const sDice = Math.max(
          computeDiceScore(candidateTitle, s.name),
          candidateJp ? computeDiceScore(candidateJp, s.name) : 0
        );
        if (sDice >= 0.75) {
          if (s.season_number === effectiveSeason) {
            score += 0.5;
          } else {
            score -= 0.8;
          }
        }
      }
    }
  }
  return Math.max(0, score);
}
function findBestAnimeMatch(candidates, meta, season) {
  if (!candidates || candidates.length === 0) return null;
  const titlesToTry = [
    meta.title,
    meta.originalTitle,
    ...meta.alternateTitles || []
  ].filter((t) => Boolean(t && t.trim()));
  const isMovie = meta.kind === "movie";
  let bestCandidate = null;
  let highestScore = -1;
  for (const item of candidates) {
    let maxScoreForItem = 0;
    for (const title of titlesToTry) {
      const sc = scoreTitleMatch(item.title, item.jpTitle, title, season, meta.allSeasons);
      if (sc > maxScoreForItem) {
        maxScoreForItem = sc;
      }
    }
    const isItemMovie = /\bmovie\b/i.test(item.title) || /\/movie\b/i.test(item.url);
    const isItemOva = /\b(?:ova|ona|special)\b/i.test(item.title) || /\b(?:ova|ona|special)\b/i.test(item.url);
    if (isMovie && !isItemMovie) {
      maxScoreForItem *= 0.5;
    } else if (!isMovie && isItemMovie) {
      maxScoreForItem *= 0.6;
    } else if (!isMovie && !isItemOva && isItemOva) {
      maxScoreForItem *= 0.7;
    }
    if (maxScoreForItem > highestScore) {
      highestScore = maxScoreForItem;
      bestCandidate = item;
    }
  }
  if (highestScore < 0.25) {
    return null;
  }
  return bestCandidate;
}

// src/matching/seasonMatcher.ts
async function resolveTargetSeasonAnimeId(baseAnimeId, seasonNumber, seasonName) {
  const targetSeason = typeof seasonNumber === "number" && seasonNumber > 0 ? seasonNumber : 1;
  const seasons = await getAnimeSeasons(baseAnimeId);
  if (!seasons || seasons.length === 0) {
    return baseAnimeId;
  }
  let matched = seasons.find((s) => {
    const sNum = extractSeasonNumber(s.name);
    return sNum === targetSeason;
  });
  if (!matched && targetSeason === 1) {
    matched = seasons.find((s) => /\bseason\s*0*1\b/i.test(s.name) || extractSeasonNumber(s.name) === null);
  }
  if (!matched && seasonName) {
    const cleanTarg = cleanTitle(seasonName);
    matched = seasons.find((s) => {
      const cleanS = cleanTitle(s.name);
      return cleanS.includes(cleanTarg) || cleanTarg.includes(cleanS);
    });
  }
  if (!matched) {
    return baseAnimeId;
  }
  if (matched.active) {
    return baseAnimeId;
  }
  const seasonId = await getAnimeIdFromUrl(matched.url);
  return seasonId || baseAnimeId;
}
function resolveTargetEpisode(episodes, episodeNumber, absoluteOffset = 0) {
  if (!episodes || episodes.length === 0) return null;
  const targetNum = typeof episodeNumber === "number" && episodeNumber > 0 ? episodeNumber : 1;
  let ep = episodes.find((e) => e.num === targetNum);
  if (ep) return ep;
  if (absoluteOffset > 0) {
    const absNum = absoluteOffset + targetNum;
    ep = episodes.find((e) => e.num === absNum);
    if (ep) return ep;
  }
  if (targetNum <= episodes.length) {
    const posEp = episodes[targetNum - 1];
    if (posEp) return posEp;
  }
  return null;
}

// src/extractors/streamExtractor.ts
var UA3 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
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
      keyBytes,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: ivBytes },
      key,
      cipherBytes
    );
    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text);
  } catch {
    return null;
  }
}
async function resolveStreamFromServer(server) {
  try {
    const playerUrl = await getServerPlayerUrl(server.linkId);
    if (!playerUrl) return null;
    const playerRes = await fetch(playerUrl, {
      headers: {
        "User-Agent": UA3,
        "Referer": "https://anikoto.cz/"
      }
    });
    if (!playerRes.ok) return null;
    const playerHtml = await playerRes.text();
    const dataIdMatch = playerHtml.match(/data-id="(\d+)"/);
    if (!dataIdMatch) return null;
    const playerStreamId = dataIdMatch[1];
    const parsed = new URL(playerUrl);
    const playerOrigin = parsed.origin;
    const sParam = parsed.searchParams.get("s") || "tcdn";
    const gsUrl = `${playerOrigin}/stream/getSourcesNew?id=${playerStreamId}&s=${encodeURIComponent(sParam)}`;
    const gsRes = await fetch(gsUrl, {
      headers: {
        "User-Agent": UA3,
        "Referer": playerUrl,
        "X-Requested-With": "XMLHttpRequest"
      }
    });
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
      language: t.label || "Unknown",
      name: t.label || "Subtitles"
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
  } catch {
    return null;
  }
}

// src/index.ts
async function getStreams(tmdbId, mediaType = "tv", season, episode) {
  try {
    if (!tmdbId) return [];
    const idInfo = parseIncomingId(tmdbId, season, episode);
    const targetSeason = idInfo.season;
    const targetEpisode = idInfo.episode;
    let seasonAnimeId = "";
    let absoluteOffset = 0;
    if (idInfo.isAnikoto) {
      seasonAnimeId = idInfo.cleanId;
    } else {
      const meta = await getTmdbMetadata(tmdbId, mediaType, targetSeason, targetEpisode);
      if (!meta || !meta.title) {
        return [];
      }
      absoluteOffset = meta.absoluteOffset;
      const extraSubqueries = [];
      if (meta.title.includes(":")) extraSubqueries.push(meta.title.split(":")[0].trim());
      if (meta.title.includes("-")) extraSubqueries.push(meta.title.split("-")[0].trim());
      if (meta.originalTitle && meta.originalTitle.includes(":")) extraSubqueries.push(meta.originalTitle.split(":")[0].trim());
      const searchQueries = [
        meta.title,
        meta.originalTitle,
        ...extraSubqueries,
        ...meta.alternateTitles || []
      ].filter((t) => Boolean(t && t.trim()));
      let candidates = [];
      for (const q of searchQueries.slice(0, 5)) {
        candidates = await searchAnikoto(q);
        if (candidates.length > 0) break;
      }
      if (candidates.length === 0) return [];
      const matchedAnime = findBestAnimeMatch(candidates, meta, targetSeason);
      if (!matchedAnime || !matchedAnime.id) return [];
      seasonAnimeId = await resolveTargetSeasonAnimeId(
        matchedAnime.id,
        targetSeason,
        meta.seasonName
      );
    }
    const episodes = await getEpisodeList(seasonAnimeId);
    if (!episodes || episodes.length === 0) return [];
    const matchedEp = resolveTargetEpisode(episodes, targetEpisode, absoluteOffset);
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
    const streamPromises = servers.map((s) => resolveStreamFromServer(s));
    const resolved = await Promise.all(streamPromises);
    const streams = resolved.filter((s) => Boolean(s && s.url));
    return streams;
  } catch {
    return [];
  }
}
async function search(query) {
  try {
    if (!query) return [];
    return await searchAnikoto(query);
  } catch {
    return [];
  }
}
if (typeof globalThis !== "undefined") {
  globalThis.getStreams = getStreams;
  globalThis.search = search;
}
