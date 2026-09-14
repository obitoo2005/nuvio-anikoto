const http = require("http");
const os = require("os");

let PORT = parseInt(process.env.PORT || "7070", 10);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE_URL = "https://anikoto.cz";
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

// In-memory caches
const cache = new Map();
const animeStore = new Map(); // stores anikotoId -> { title, poster, watchUrl }

function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.time < 300000) return item.data;
  return null;
}
function setCached(key, data) {
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

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractSeasonNumber(title) {
  if (!title) return null;
  const match = title.match(/\b(?:season\s*(\d+)|(\d+)(?:nd|rd|th|st)\s*season|part\s*(\d+))\b/i);
  if (!match) return null;
  const num = match[1] || match[2] || match[3];
  return num ? parseInt(num, 10) : null;
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

function parseCards(html) {
  const matches = [...html.matchAll(/<div class="item[^"]*"[\s\S]*?data-tip="(\d+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<img src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<a class="name d-title"[^>]*>([\s\S]*?)<\/a>/gi)];
  return matches.map(m => {
    const id = m[1];
    const title = decodeHtmlEntities(m[5].replace(/<[^>]+>/g, "").trim());
    const poster = m[3];
    const watchUrl = m[2];

    // Save to global animeStore so /meta/ has the real name and poster
    animeStore.set(id, { title, poster, watchUrl });

    return {
      id: `anikoto:${id}`,
      type: "series",
      name: title,
      poster: poster,
      genres: ["Anime"],
      description: `Watch ${title} online on Anikoto.`
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

async function fetchFilterMetas(pathAndQuery) {
  const cacheKey = `filter_${pathAndQuery}`;
  const hit = getCached(cacheKey);
  if (hit) return hit;
  try {
    const res = await fetch(`${BASE_URL}/${pathAndQuery}`, {
      headers: { "User-Agent": UA, "Referer": `${BASE_URL}/` }
    });
    const html = await res.text();
    const cards = parseCards(html);
    setCached(cacheKey, cards);
    return cards;
  } catch {
    return [];
  }
}

async function fetchAnimeMeta(animeId) {
  const cacheKey = `meta_${animeId}`;
  const hit = getCached(cacheKey);
  if (hit) return hit;
  try {
    // 1. Fetch episodes
    const epRes = await fetch(`${BASE_URL}/ajax/episode/list/${encodeURIComponent(animeId)}`, {
      headers: { "User-Agent": UA, "Referer": `${BASE_URL}/`, "X-Requested-With": "XMLHttpRequest" }
    });
    const epJson = await epRes.json();
    const html = epJson.result || "";
    const matches = [...html.matchAll(/<a[^>]+data-id="(\d+)"[^>]+data-num="(\d+)"[^>]+data-ids="([^"]+)"(?:[^>]*data-mal="(\d+)")?[^>]*>(?:<b>(\d+)<\/b>)?(?:\s*<span[^>]*class="d-title"[^>]*>([^<]*)<\/span>)?/gi)];

    // 2. Resolve real title and poster from store or seasons
    let stored = animeStore.get(animeId);
    let animeTitle = stored?.title;
    let animePoster = stored?.poster;

    if (!animeTitle) {
      try {
        const sRes = await fetch(`${BASE_URL}/api/seasons/${encodeURIComponent(animeId)}`, {
          headers: { "User-Agent": UA, "Referer": `${BASE_URL}/`, "X-Requested-With": "XMLHttpRequest" }
        });
        const sJson = await sRes.json();
        const activeMatch = (sJson.result || "").match(/<div class="swiper-slide season active">[\s\S]*?<div class="name"[^>]*>([\s\S]*?)<\/div>/i);
        if (activeMatch) {
          animeTitle = decodeHtmlEntities(activeMatch[1].trim());
        }
      } catch {}
    }
    if (!animeTitle) {
      animeTitle = `Anime ${animeId}`;
    }

    // Extract the actual season number from title (e.g. Season 3 -> 3)
    const sNum = extractSeasonNumber(animeTitle) || 1;

    // 3. Query TMDB for high-res poster, background, and overview
    let banner;
    let description = `Watch ${animeTitle} on Anikoto.cz (${matches.length} episodes available).`;
    let genres = ["Animation", "Action", "Fantasy"];
    let releaseInfo;
    let imdbRating;

    try {
      const cleanSearch = animeTitle
        .replace(/\b(?:Season\s*\d+|\d+(?:nd|rd|th|st)\s*Season|Part\s*\d+).*$/i, "")
        .replace(/\bSpecials?.*$/i, "")
        .replace(/\bMovie.*$/i, "")
        .replace(/[:\-].*$/g, "")
        .trim() || animeTitle;
      const tmdbRes = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanSearch)}`, {
        headers: { "User-Agent": UA }
      });
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        const top = (tmdbData.results || []).find((x) => (x.genre_ids || []).includes(16)) || tmdbData.results?.[0];
        if (top) {
          if (top.poster_path) animePoster = `https://image.tmdb.org/t/p/w500${top.poster_path}`;
          if (top.backdrop_path) banner = `https://image.tmdb.org/t/p/original${top.backdrop_path}`;
          if (top.overview) description = top.overview;
          if (top.first_air_date) releaseInfo = top.first_air_date.slice(0, 4);
          if (top.vote_average) imdbRating = String(top.vote_average.toFixed(1));
          if (top.genre_ids && top.genre_ids.length > 0) {
            const gList = top.genre_ids.map((id) => GENRE_MAP[id]).filter(Boolean);
            if (gList.length > 0) genres = gList;
          }
        }
      }
    } catch {}

    const videos = matches.map(m => ({
      id: `anikoto:${animeId}:${sNum}:${m[2]}`,
      title: m[6] ? decodeHtmlEntities(m[6].trim()) : `Episode ${m[2]}`,
      season: sNum,
      episode: parseInt(m[2], 10),
      thumbnail: animePoster
    }));

    const meta = {
      id: `anikoto:${animeId}`,
      type: "series",
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
  description: "Complete live anime catalogue and direct 1080p streaming from Anikoto.cz",
  version: "1.2.0",
  resources: ["catalog", "meta", "stream"],
  types: ["anime", "series", "movie"],
  idPrefixes: ["anikoto:", "tmdb:", "kitsu:"],
  catalogs: [
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
    },
    {
      type: "anime",
      id: "anikoto_movies",
      name: "Anikoto - Anime Movies",
      extra: [
        { name: "genre", isRequired: false, options: ALL_GENRES },
        { name: "search", isRequired: false },
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
  const pathname = decodeURIComponent(parsedUrl.pathname || "");

  // 1. Manifest
  if (pathname === "/" || pathname === "/manifest.json") {
    res.writeHead(200);
    res.end(JSON.stringify(manifest));
    return;
  }

  // 2. Catalogs (Infinite scrolling with skip, genres, search)
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
    if (catalogId === "anikoto_movies") {
      filterQuery += `&type=movie`;
      metas = await fetchFilterMetas(`filter?${filterQuery}`);
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
      // anikoto_popular (Browse All Anime)
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
    const fullId = parts[1] || "";
    const animeId = fullId.replace(/^anikoto[:/]/, "").split(":")[0];
    const meta = await fetchAnimeMeta(animeId);
    res.writeHead(200);
    res.end(JSON.stringify({ meta }));
    return;
  }

  // 4. Video Streams (direct 1080p stream resolution)
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
      const colonParts = fullId.split(":");
      let season = 1;
      let episode = 1;
      if (colonParts.length >= 4) {
        season = parseInt(colonParts[2], 10) || 1;
        episode = parseInt(colonParts[3], 10) || 1;
      } else if (colonParts.length === 3) {
        episode = parseInt(colonParts[2], 10) || 1;
      }

      const provider = require("../providers/anikoto.js");
      const results = await provider.getStreams(fullId, type === "movie" ? "movie" : "tv", season, episode);
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
        subtitles: (r.subtitles || []).map((sub, idx) => ({
          id: String(idx + 1),
          url: sub.url,
          lang: sub.language || "English"
        }))
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

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
});

function startServer(portToTry) {
  server.listen(portToTry, "0.0.0.0", () => {
    const localIp = getLocalIp();
    console.log("=====================================================");
    console.log("   ANIKOTO ALL-IN-ONE ADDON (ENTIRE LIBRARY & DISCOVER)");
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
