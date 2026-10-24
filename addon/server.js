const http = require("http");
const os = require("os");

let PORT = parseInt(process.env.PORT || "7070", 10);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE_URL = "https://anikoto.cz";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "439c478a771f35c05022f9feabcca01c";
const { normalizeSubtitleLang, decodeHtmlEntities } = require("../providers/anikoto.js");
const { parseEpisodes, pickBestTmdbResult, buildVideos } = require("./videoMapper.js");

// In-memory caches
const cache = new Map();
const animeStore = new Map(); // stores anikotoId -> { title, poster, watchUrl, isMovie }

function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.time < 300000) return item.data;
  return null;
}
function setCached(key, data) {
  if (cache.size > 500) {
    const oldest = [...cache.keys()].slice(0, 100);
    oldest.forEach(k => cache.delete(k));
  }
  cache.set(key, { time: Date.now(), data });
}

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal && (net.address.startsWith("192.168.") || name.toLowerCase().includes("wi-fi"))) return net.address;
    }
  }
  return "127.0.0.1";
}

function parseStreamId(fullId) {
  const raw = String(fullId || "").trim();
  let season = 1;
  let episode = 1;

  const isAnikoto = raw.startsWith("anikoto:") || raw.startsWith("anikoto/");
  const isKitsu = raw.startsWith("kitsu:") || raw.startsWith("kitsu/");
  const isTmdb = raw.startsWith("tmdb:") || raw.startsWith("tmdb/");

  const stripped = raw.replace(/^anikoto[:/]/, "").replace(/^kitsu[:/]/, "").replace(/^tmdb[:/]/, "");
  const parts = stripped.split(":");
  const baseId = parts[0];

  if (parts.length >= 3) {
    const parsedSeason = parseInt(parts[1], 10);
    const parsedEpisode = parseInt(parts[2], 10);
    season = Number.isNaN(parsedSeason) ? 1 : parsedSeason;
    episode = Number.isNaN(parsedEpisode) ? 1 : parsedEpisode;
  } else if (parts.length === 2) {
    const parsedEpisode = parseInt(parts[1], 10);
    episode = Number.isNaN(parsedEpisode) ? 1 : parsedEpisode;
  }
  return { raw, baseId, isAnikoto, isKitsu, isTmdb, season, episode };
}

const ANIKOTO_GENRE_IDS = {
  "Action": "1",
  "Action & Adventure": "2344",
  "Adventure": "2",
  "Comedy": "8",
  "Drama": "62",
  "Ecchi": "214",
  "Fantasy": "3",
  "Horror": "222",
  "Isekai": "74",
  "Magic": "203",
  "Mecha": "123",
  "Military": "125",
  "Music": "242",
  "Mystery": "57",
  "Psychological": "73",
  "Romance": "28",
  "Sci-Fi": "12",
  "Shounen": "15",
  "Slice of Life": "35",
  "Sports": "29",
  "Supernatural": "9",
  "Suspense": "2316",
  "Thriller": "54"
};

const ALL_GENRES = Object.keys(ANIKOTO_GENRE_IDS);

const GENRE_MAP = {
  10759: "Action & Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  37: "Western"
};

function parseCards(html, forceType = null) {
  const matches = [...html.matchAll(/<div class="item[^"]*"[\s\S]*?data-tip="(\d+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<img src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<a class="name d-title"[^>]*>([\s\S]*?)<\/a>/gi)];
  return matches.map(m => {
    const id = m[1];
    const title = decodeHtmlEntities(m[5].replace(/<[^>]+>/g, "").trim());
    const poster = m[3];
    const watchUrl = m[2];
    const typeLabel = (m[0].match(/<div class="right">([^<]+)<\/div>/i) || [])[1] || "";
    const isMovie = forceType === "movie" || /movie/i.test(typeLabel) || /\bmovie\b/i.test(title) || /\/movie\b/i.test(watchUrl);
    const itemType = isMovie ? "movie" : "series";

    animeStore.set(id, { title, poster, watchUrl, isMovie });

    return {
      id: `anikoto:${id}`,
      type: itemType,
      name: title,
      poster: poster,
      genres: ["Anime"],
      description: isMovie ? `Watch ${title} full movie online on Anikoto.` : `Watch ${title} online on Anikoto.`
    };
  });
}

async function fetchWidgetMetas(widgetName) {
  const cacheKey = `widget_${widgetName}`;
  const hit = getCached(cacheKey);
  if (hit) return hit;
  try {
    const res = await fetch(`${BASE_URL}/ajax/home/widget/${widgetName}`, {
      headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": `${BASE_URL}/home` }
    });
    const json = await res.json();
    const cards = parseCards(json.result || "");
    setCached(cacheKey, cards);
    return cards;
  } catch {
    return [];
  }
}

async function fetchFilterMetas(pathAndQuery, forceType = null) {
  const cacheKey = `filter_${pathAndQuery}_${forceType || ""}`;
  const hit = getCached(cacheKey);
  if (hit) return hit;
  try {
    const res = await fetch(`${BASE_URL}/${pathAndQuery}`, {
      headers: { "User-Agent": UA, "Referer": `${BASE_URL}/` }
    });
    const html = await res.text();
    const cards = parseCards(html, forceType);
    setCached(cacheKey, cards);
    return cards;
  } catch {
    return [];
  }
}

async function fetchAnimeMeta(animeId, requestedType = "series") {
  const cacheKey = "meta_" + animeId;
  const hit = getCached(cacheKey);
  if (hit && !(requestedType === "movie" && hit.type !== "movie")) return hit;
  try {
    // 1. Check for franchise seasons/sequels first
    let seasonItems = [];
    try {
      const sRes = await fetch(BASE_URL + "/api/seasons/" + encodeURIComponent(animeId), {
        headers: { "User-Agent": UA, "Referer": BASE_URL + "/", "X-Requested-With": "XMLHttpRequest" }
      });
      if (sRes.ok) {
        const sJson = await sRes.json();
        const sHtml = sJson?.result || "";
        seasonItems = [...sHtml.matchAll(/<div class="swiper-slide season (active)?">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<div class="name"[^>]*>([\s\S]*?)<\/div>/gi)];
      }
    } catch {}

    // 2. Resolve real title and poster from store or tooltip
    let stored = animeStore.get(animeId);
    let animeTitle = stored?.title;
    let animePoster = stored?.poster;
    let isMovie = requestedType === "movie" || stored?.isMovie || false;

    if (!animeTitle) {
      try {
        const tipRes = await fetch(BASE_URL + "/ajax/anime/tooltip/" + encodeURIComponent(animeId), {
          headers: { "User-Agent": UA, "Referer": BASE_URL + "/", "X-Requested-With": "XMLHttpRequest" }
        });
        if (tipRes.ok) {
          const tipHtml = await tipRes.text();
          const titleMatch = tipHtml.match(/<div class="title d-title"[^>]*>([\s\S]*?)<\/div>/i);
          if (titleMatch) {
            animeTitle = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").trim());
          }
          const watchMatch = tipHtml.match(/href="([^"]+)"\s+class="watch"/i);
          if (watchMatch) {
            const watchUrl = watchMatch[1];
            if (/\/movie\b/i.test(watchUrl)) isMovie = true;
            if (!animePoster) {
              try {
                const wRes = await fetch(watchUrl, { headers: { "User-Agent": UA, "Referer": BASE_URL + "/" } });
                if (wRes.ok) {
                  const wHtml = await wRes.text();
                  const ogMatch = wHtml.match(/<meta property="og:image" content="([^"]+)"/i);
                  if (ogMatch) animePoster = ogMatch[1];
                }
              } catch {}
            }
          }
        }
      } catch {}
    }

    if (!animeTitle && seasonItems.length > 0) {
      const activeMatch = seasonItems.find(m => !!m[1]) || seasonItems[0];
      if (activeMatch) {
        animeTitle = decodeHtmlEntities(activeMatch[3].replace(/<[^>]+>/g, "").trim());
      }
    }

    if (!animeTitle) {
      animeTitle = "Anime " + animeId;
    }
    if (/\bmovie\b/i.test(animeTitle)) {
      isMovie = true;
    }

    // 3. Query TMDB for metadata and season structure
    let tmdbInfo = null;
    let tmdbSeasons = [];
    const searchKind = isMovie ? "movie" : "tv";

    try {
      const cleanSearch = animeTitle
        .replace(/\b(?:Season\s*\d+|\d+(?:nd|rd|th|st)\s*Season|Part\s*\d+).*$/i, "")
        .replace(/\bSpecials?.*$/i, "")
        .replace(/\bMovie.*$/i, "")
        .replace(/[:\-].*$/g, "")
        .trim() || animeTitle;
      const tmdbRes = await fetch("https://api.themoviedb.org/3/search/" + searchKind + "?api_key=" + TMDB_API_KEY + "&query=" + encodeURIComponent(cleanSearch), {
        headers: { "User-Agent": UA }
      });
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        const top = pickBestTmdbResult(tmdbData.results || [], animeTitle);
        if (top) {
          tmdbInfo = top;
          if (!isMovie) {
            try {
              const detailRes = await fetch("https://api.themoviedb.org/3/tv/" + top.id + "?api_key=" + TMDB_API_KEY, {
                headers: { "User-Agent": UA }
              });
              if (detailRes.ok) {
                const detail = await detailRes.json();
                tmdbSeasons = detail.seasons || [];
              }
            } catch {}
          }
        }
      }
    } catch {}

    // 4. Enrich metadata
    let banner;
    let description = isMovie ? ("Watch " + animeTitle + " full movie on Anikoto.cz.") : ("Watch " + animeTitle + " on Anikoto.cz.");
    let genres = ["Animation", "Action", "Fantasy"];
    let releaseInfo;
    let imdbRating;

    if (tmdbInfo) {
      if (tmdbInfo.poster_path) animePoster = "https://image.tmdb.org/t/p/w500" + tmdbInfo.poster_path;
      if (tmdbInfo.backdrop_path) banner = "https://image.tmdb.org/t/p/original" + tmdbInfo.backdrop_path;
      if (tmdbInfo.overview) description = tmdbInfo.overview;
      const dateStr = tmdbInfo.first_air_date || tmdbInfo.release_date;
      if (dateStr) releaseInfo = dateStr.slice(0, 4);
      if (tmdbInfo.vote_average) imdbRating = String(tmdbInfo.vote_average.toFixed(1));
      if (tmdbInfo.genre_ids && tmdbInfo.genre_ids.length > 0) {
        const gList = tmdbInfo.genre_ids.map((id) => GENRE_MAP[id]).filter(Boolean);
        if (gList.length > 0) genres = gList;
      }
    }

    // 5. Build episode lists and videos
    let seasonItemsForVideos = [];
    let episodeLists = [];

    if (isMovie) {
      const epRes = await fetch(BASE_URL + "/ajax/episode/list/" + encodeURIComponent(animeId), {
        headers: { "User-Agent": UA, "Referer": BASE_URL + "/", "X-Requested-With": "XMLHttpRequest" }
      });
      const epJson = await epRes.json();
      episodeLists = [parseEpisodes(epJson.result || "")];
      seasonItemsForVideos = [{ name: animeTitle, active: true, targetId: animeId }];
    } else if (seasonItems.length > 1) {
      const seasonInfos = await Promise.all(seasonItems.map(async (m) => {
        const active = !!m[1];
        const url = m[2];
        const name = decodeHtmlEntities(m[3].replace(/<[^>]+>/g, "").trim());

        let targetId = animeId;
        if (!active) {
          try {
            const pageRes = await fetch(url, { headers: { "User-Agent": UA } });
            const pageHtml = await pageRes.text();
            const idMatch = pageHtml.match(/data-id="(\d+)"/);
            if (idMatch) targetId = idMatch[1];
          } catch {}
        }
        return { active, name, targetId };
      }));

      const epLists = await Promise.all(seasonInfos.map(s => {
        return fetch(BASE_URL + "/ajax/episode/list/" + encodeURIComponent(s.targetId), {
          headers: { "User-Agent": UA, "Referer": BASE_URL + "/", "X-Requested-With": "XMLHttpRequest" }
        }).then(r => r.json()).catch(() => ({ result: "" }));
      }));

      seasonItemsForVideos = seasonInfos;
      episodeLists = epLists.map(j => parseEpisodes(j?.result || ""));
    } else {
      const epRes = await fetch(BASE_URL + "/ajax/episode/list/" + encodeURIComponent(animeId), {
        headers: { "User-Agent": UA, "Referer": BASE_URL + "/", "X-Requested-With": "XMLHttpRequest" }
      });
      const epJson = await epRes.json();
      episodeLists = [parseEpisodes(epJson.result || "")];
      seasonItemsForVideos = [{ name: animeTitle, active: true, targetId: animeId }];
    }

    const videos = buildVideos({
      animeId,
      animeTitle,
      animePoster,
      seasonItems: seasonItemsForVideos,
      episodeLists,
      tmdbSeasons,
      isMovie
    });

    const meta = {
      id: "anikoto:" + animeId,
      type: isMovie ? "movie" : "series",
      name: animeTitle,
      poster: animePoster,
      background: banner,
      genres,
      releaseInfo,
      imdbRating,
      description,
      videos
    };
    setCached(cacheKey, meta);
    return meta;
  } catch {
    return null;
  }
}

const manifest = {
  id: "org.anikoto.nuvio.addon",
  name: "Anikoto All-in-One",
  description: "Complete live anime catalogue, movies, and direct 1080p streaming from Anikoto.cz",
  version: "1.5.0",
  resources: ["catalog", "meta", "stream", "subtitles"],
  types: ["anime", "series", "movie", "tv"],
  catalogs: [
    {
      type: "movie",
      id: "anikoto_movies",
      name: "Anikoto - Anime Movies",
      extra: [
        { name: "genre", isRequired: false, options: ALL_GENRES },
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "anime",
      id: "anikoto_popular",
      name: "Anikoto - Browse All Anime",
      extra: [
        { name: "genre", isRequired: false, options: ALL_GENRES },
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "anime",
      id: "anikoto_top_airing",
      name: "Anikoto - Top Airing",
      extra: [
        { name: "genre", isRequired: false, options: ALL_GENRES },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "anime",
      id: "anikoto_trending",
      name: "Anikoto - Trending",
      extra: [
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "anime",
      id: "anikoto_latest",
      name: "Anikoto - Latest Updates",
      extra: [
        { name: "skip", isRequired: false }
      ]
    }
  ]
};

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(parsedUrl.pathname || "");
  if (pathname.startsWith("/addon")) {
    pathname = pathname.replace(/^\/addon/, "") || "/";
  }

  // 1. Manifest
  if (pathname === "/" || pathname === "/manifest.json") {
    res.writeHead(200);
    res.end(JSON.stringify(manifest));
    return;
  }

  // 2. Catalogs (Infinite scrolling with skip, genres, search, movies)
  if (pathname.startsWith("/catalog/")) {
    const parts = pathname.replace(/^\/catalog\//, "").replace(/\.json$/, "").split("/");
    const type = parts[0];
    const catalogId = parts[1];
    const extraStr = parts[2] || "";

    let skip = parseInt(parsedUrl.searchParams.get("skip") || "0", 10);
    let searchQuery = parsedUrl.searchParams.get("search") || "";
    let genreQuery = parsedUrl.searchParams.get("genre") || "";

    if (extraStr) {
      const extraParams = new URLSearchParams(extraStr);
      if (!skip && extraParams.has("skip")) skip = parseInt(extraParams.get("skip") || "0", 10);
      if (!searchQuery && extraParams.has("search")) searchQuery = extraParams.get("search") || "";
      if (!genreQuery && extraParams.has("genre")) genreQuery = extraParams.get("genre") || "";
    }

    const page = Math.floor(skip / 30) + 1;
    let filterQuery = `page=${page}`;

    if (searchQuery) {
      filterQuery += `&keyword=${encodeURIComponent(searchQuery)}`;
    }

    if (genreQuery && ANIKOTO_GENRE_IDS[genreQuery]) {
      filterQuery += `&genre[]=${ANIKOTO_GENRE_IDS[genreQuery]}`;
    }

    let metas = [];
    if (catalogId === "anikoto_movies" || catalogId === "anikoto_movies_anime" || type === "movie") {
      filterQuery += `&term_type[]=Movie&sort=views`;
      metas = await fetchFilterMetas(`filter?${filterQuery}`, "movie");
    } else if (catalogId === "anikoto_top_airing") {
      filterQuery += `&status=airing&sort=views`;
      metas = await fetchFilterMetas(`filter?${filterQuery}`);
    } else if (catalogId === "anikoto_trending") {
      if (page === 1 && !searchQuery && !genreQuery) {
        metas = await fetchWidgetMetas("trending");
      } else {
        metas = await fetchFilterMetas(`filter?sort=views&${filterQuery}`);
      }
    } else if (catalogId === "anikoto_latest") {
      if (page === 1 && !searchQuery && !genreQuery) {
        metas = await fetchWidgetMetas("updated-all");
      } else {
        metas = await fetchFilterMetas(`filter?sort=updated&${filterQuery}`);
      }
    } else {
      filterQuery += `&sort=views`;
      metas = await fetchFilterMetas(`filter?${filterQuery}`);
    }

    res.writeHead(200);
    res.end(JSON.stringify({ metas }));
    return;
  }

  // 3. Meta details
  if (pathname.startsWith("/meta/")) {
    const parts = pathname.replace(/^\/meta\//, "").replace(/\.json$/, "").split("/");
    const requestedType = parts[0] || "series";
    const fullId = parts[1] || "";
    if (!/^anikoto[:/]/.test(fullId)) {
      res.writeHead(200);
      res.end(JSON.stringify({ meta: null }));
      return;
    }
    const animeId = fullId.replace(/^anikoto[:/]/, "").split(":")[0];
    const meta = await fetchAnimeMeta(animeId, requestedType);
    res.writeHead(200);
    res.end(JSON.stringify({ meta }));
    return;
  }

  // 4. Video Streams (resolves 1080p stream for ANY source ID)
  if (pathname.startsWith("/stream/")) {
    const parts = pathname.replace(/^\/stream\//, "").replace(/\.json$/, "").split("/");
    const type = parts[0] || "series";
    const fullId = parts[1] || "";

    const cacheKey = `stream_${fullId}`;
    const hit = getCached(cacheKey);
    if (hit) {
      res.writeHead(200);
      res.end(JSON.stringify({ streams: hit }));
      return;
    }

    try {
      const parsedId = parseStreamId(fullId);
      const provider = require("../providers/anikoto.js");
      const results = await provider.getStreams(
        parsedId.raw,
        type === "movie" ? "movie" : "tv",
        parsedId.season,
        parsedId.episode
      );

      const host = req.headers.host || "localhost";
      const proto = req.headers["x-forwarded-proto"] || "http";
      const origin = `${proto}://${host}`;
      const prefix = pathname.startsWith("/addon") ? "/addon" : "";

      const streams = results.map(r => ({
        name: r.name || "Anikoto",
        title: `${r.title}\n${r.quality || "1080p"}`,
        url: r.url,
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: {
            request: r.headers || {
              "Referer": "https://megaplay.buzz/",
              "Origin": "https://megaplay.buzz"
            }
          }
        },
        subtitles: (r.subtitles || []).map((sub, idx) => {
          const langCode = normalizeSubtitleLang ? normalizeSubtitleLang(sub.language || sub.name) : (sub.language || "eng");
          const proxiedUrl = `${origin}${prefix}/sub.vtt?url=${encodeURIComponent(sub.url)}`;
          return {
            id: String(idx + 1),
            url: proxiedUrl,
            lang: langCode,
            language: langCode,
            name: sub.name || langCode
          };
        })
      }));

      setCached(cacheKey, streams);
      res.writeHead(200);
      res.end(JSON.stringify({ streams }));
      return;
    } catch (err) {
      res.writeHead(200);
      res.end(JSON.stringify({ streams: [] }));
      return;
    }
  }

  // 4b. Dedicated Stremio Subtitles Resource (/subtitles/:type/:id.json)
  if (pathname.startsWith("/subtitles/")) {
    const parts = pathname.replace(/^\/subtitles\//, "").replace(/\.json$/, "").split("/");
    const type = parts[0] || "series";
    const fullId = parts[1] || "";

    const cacheKey = `subtitles_${fullId}`;
    const hit = getCached(cacheKey);
    if (hit) {
      res.writeHead(200);
      res.end(JSON.stringify({ subtitles: hit }));
      return;
    }

    try {
      const parsedId = parseStreamId(fullId);
      const provider = require("../providers/anikoto.js");
      const results = await provider.getStreams(
        parsedId.raw,
        type === "movie" ? "movie" : "tv",
        parsedId.season,
        parsedId.episode
      );

      const host = req.headers.host || "localhost";
      const proto = req.headers["x-forwarded-proto"] || "http";
      const origin = `${proto}://${host}`;
      const prefix = pathname.startsWith("/addon") ? "/addon" : "";

      const rawSubs = results[0]?.subtitles || [];
      const subtitles = rawSubs.map((sub, idx) => {
        const langCode = normalizeSubtitleLang ? normalizeSubtitleLang(sub.language || sub.name) : (sub.language || "eng");
        const proxiedUrl = `${origin}${prefix}/sub.vtt?url=${encodeURIComponent(sub.url)}`;
        return {
          id: String(idx + 1),
          url: proxiedUrl,
          lang: langCode,
          language: langCode,
          name: sub.name || langCode
        };
      });

      setCached(cacheKey, subtitles);
      res.writeHead(200);
      res.end(JSON.stringify({ subtitles }));
      return;
    } catch (err) {
      res.writeHead(200);
      res.end(JSON.stringify({ subtitles: [] }));
      return;
    }
  }

  // 5. Subtitle Proxy (fixes HTTP 403 on protected subtitle CDNs)
  if (pathname === "/sub" || pathname === "/sub.vtt") {
    const subUrl = parsedUrl.searchParams.get("url");
    if (!subUrl) {
      res.writeHead(400);
      res.end("Missing url parameter");
      return;
    }
    try {
      const subRes = await fetch(subUrl, {
        headers: {
          "User-Agent": UA,
          "Referer": "https://megaplay.buzz/",
          "Origin": "https://megaplay.buzz"
        }
      });
      if (!subRes.ok) {
        res.writeHead(subRes.status);
        res.end();
        return;
      }
      res.setHeader("Content-Type", "text/vtt; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.writeHead(200);
      const vttText = await subRes.text();
      res.end(vttText);
      return;
    } catch (err) {
      res.writeHead(500);
      res.end();
      return;
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
});

function startServer(portToTry) {
  server.listen(portToTry, "0.0.0.0", () => {
    const localIp = getLocalIp();
    console.log("=====================================================");
    console.log("   ANIKOTO ALL-IN-ONE ADDON (UNIVERSAL COMPATIBILITY)");
    console.log("=====================================================");
    console.log(`Local (this PC):    http://localhost:${portToTry}/manifest.json`);
    console.log(`Network (TV/Phone):  http://${localIp}:${portToTry}/manifest.json`);
    console.log("=====================================================");
  }).on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${portToTry} is in use, trying port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error("Server error:", err);
    }
  });
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = { server, manifest };
