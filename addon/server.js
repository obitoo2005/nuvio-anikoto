const http = require("http");
const os = require("os");

let PORT = parseInt(process.env.PORT || "7070", 10);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE_URL = "https://anikoto.cz";

// In-memory cache with 5-minute TTL
const cache = new Map();
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
      if (net.family === "IPv4" && !net.internal) return net.address;
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

function parseCards(html) {
  const matches = [...html.matchAll(/<div class="item[\s\S]*?<div class="ani poster[^"]*" data-tip="(\d+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<img src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<a class="name d-title"[^>]*>([\s\S]*?)<\/a>/gi)];
  return matches.map(m => {
    const id = m[1];
    const title = decodeHtmlEntities(m[5].replace(/<[^>]+>/g, "").trim());
    const poster = m[3];
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
    const epRes = await fetch(`${BASE_URL}/ajax/episode/list/${encodeURIComponent(animeId)}`, {
      headers: { "User-Agent": UA, "Referer": `${BASE_URL}/`, "X-Requested-With": "XMLHttpRequest" }
    });
    const epJson = await epRes.json();
    const html = epJson.result || "";
    const matches = [...html.matchAll(/<a[^>]+data-id="(\d+)"[^>]+data-num="(\d+)"[^>]+data-ids="([^"]+)"(?:[^>]*data-mal="(\d+)")?[^>]*>(?:<b>(\d+)<\/b>)?(?:\s*<span[^>]*class="d-title"[^>]*>([^<]*)<\/span>)?/gi)];
    const videos = matches.map(m => ({
      id: `anikoto:${animeId}:1:${m[2]}`,
      title: m[6] ? decodeHtmlEntities(m[6].trim()) : `Episode ${m[2]}`,
      season: 1,
      episode: parseInt(m[2], 10)
    }));

    const meta = {
      id: `anikoto:${animeId}`,
      type: "series",
      name: `Anime ${animeId}`,
      genres: ["Anime"],
      description: `Watch on Anikoto.cz (${videos.length} episodes available).`,
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
  name: "Anikoto Catalogue",
  description: "Live anime catalogue directly from Anikoto.cz (Trending, Latest Updates, Top Airing, Most Popular)",
  version: "1.0.0",
  resources: ["catalog", "meta"],
  types: ["anime", "series"],
  idPrefixes: ["anikoto:"],
  catalogs: [
    {
      type: "anime",
      id: "anikoto_trending",
      name: "Anikoto - Trending"
    },
    {
      type: "anime",
      id: "anikoto_latest",
      name: "Anikoto - Latest Updates"
    },
    {
      type: "anime",
      id: "anikoto_top_airing",
      name: "Anikoto - Top Airing"
    },
    {
      type: "anime",
      id: "anikoto_popular",
      name: "Anikoto - Most Popular",
      extra: [
        { name: "search", isRequired: false },
        { name: "genre", isRequired: false, options: ["action", "adventure", "comedy", "drama", "fantasy", "romance", "sci-fi", "shounen", "supernatural"] }
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

  // 2. Catalogs
  if (pathname.startsWith("/catalog/")) {
    const parts = pathname.replace(/^\/catalog\//, "").replace(/\.json$/, "").split("/");
    const type = parts[0];
    const catalogId = parts[1];
    const extraStr = parts[2] || "";

    let searchQuery = parsedUrl.searchParams.get("search") || "";
    let genreQuery = parsedUrl.searchParams.get("genre") || "";
    if (!searchQuery && extraStr.includes("search=")) {
      searchQuery = decodeURIComponent(extraStr.split("search=")[1].split("&")[0]);
    }
    if (!genreQuery && extraStr.includes("genre=")) {
      genreQuery = decodeURIComponent(extraStr.split("genre=")[1].split("&")[0]);
    }

    let metas = [];
    if (searchQuery) {
      metas = await fetchFilterMetas(`filter?keyword=${encodeURIComponent(searchQuery)}`);
    } else if (genreQuery) {
      metas = await fetchFilterMetas(`filter?genre=${encodeURIComponent(genreQuery)}`);
    } else if (catalogId === "anikoto_trending") {
      metas = await fetchWidgetMetas("trending");
    } else if (catalogId === "anikoto_latest") {
      metas = await fetchWidgetMetas("updated-all");
    } else if (catalogId === "anikoto_top_airing") {
      metas = await fetchFilterMetas("filter?status=airing&sort=views");
    } else if (catalogId === "anikoto_popular") {
      metas = await fetchFilterMetas("filter?sort=views");
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

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
});

function startServer(portToTry) {
  server.listen(portToTry, "0.0.0.0", () => {
    const localIp = getLocalIp();
    console.log("=====================================================");
    console.log("   ANIKOTO CATALOGUE ADDON FOR NUVIO IS RUNNING!     ");
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
