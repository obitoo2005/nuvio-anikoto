import { AnikotoSearchResult, AnikotoSeasonItem, AnikotoEpisodeItem, AnikotoServerItem } from "../types";
import { decodeHtmlEntities } from "../utils/textUtils";

const BASE_URL = "https://anikoto.cz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  "Referer": `${BASE_URL}/`
};
const AJAX_HEADERS = {
  ...HEADERS,
  "X-Requested-With": "XMLHttpRequest"
};

export async function searchAnikoto(query: string): Promise<AnikotoSearchResult[]> {
  if (!query || !query.trim()) return [];
  const filterUrl = `${BASE_URL}/filter?keyword=${encodeURIComponent(query.trim())}`;
  try {
    const res = await fetch(filterUrl, { headers: HEADERS });
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/<div class="item [\s\S]*?<div class="ani poster tip" data-tip="(\d+)"[\s\S]*?<a class="name d-title" href="([^"]+)"(?:\s+data-jp="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/gi)];
      if (matches.length > 0) {
        return matches.map(m => ({
          id: m[1],
          url: m[2],
          jpTitle: m[3] ? decodeHtmlEntities(m[3].trim()) : undefined,
          title: decodeHtmlEntities(m[4].replace(/<[^>]+>/g, "").trim())
        }));
      }
    }
  } catch {}

  // Fallback to ajax/anime/search
  try {
    const ajaxUrl = `${BASE_URL}/ajax/anime/search?keyword=${encodeURIComponent(query.trim())}`;
    const res = await fetch(ajaxUrl, { headers: AJAX_HEADERS });
    if (res.ok) {
      const json = await res.json();
      const html = json?.result?.html || "";
      const items = [...html.matchAll(/<a class="item" href="([^"]+)"[\s\S]*?<div class="name d-title"[^>]*>([\s\S]*?)<\/div>/gi)];
      return items.map(m => {
        const url = m[1];
        const rawTitle = m[2].replace(/<[^>]+>/g, "").trim();
        return {
          id: "",
          url,
          title: decodeHtmlEntities(rawTitle)
        };
      });
    }
  } catch {}

  return [];
}

export async function getAnimeIdFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const html = await res.text();
      const idMatch = html.match(/data-id="(\d+)"/);
      if (idMatch) return idMatch[1];
    }
  } catch {}
  return null;
}

export async function getAnimeSeasons(animeId: string): Promise<AnikotoSeasonItem[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/seasons/${encodeURIComponent(animeId)}`, { headers: AJAX_HEADERS });
    if (res.ok) {
      const json = await res.json();
      const html = json?.result || "";
      const items = [...html.matchAll(/<div class="swiper-slide season (active)?">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<div class="name"[^>]*>([\s\S]*?)<\/div>/gi)];
      return items.map(m => ({
        active: !!m[1],
        url: m[2],
        name: decodeHtmlEntities(m[3].trim())
      }));
    }
  } catch {}
  return [];
}

export async function getEpisodeList(animeId: string): Promise<AnikotoEpisodeItem[]> {
  try {
    const res = await fetch(`${BASE_URL}/ajax/episode/list/${encodeURIComponent(animeId)}`, { headers: AJAX_HEADERS });
    if (res.ok) {
      const json = await res.json();
      const html = json?.result || "";
      const matches = [...html.matchAll(/<a[^>]+data-id="(\d+)"[^>]+data-num="(\d+)"[^>]+data-ids="([^"]+)"(?:[^>]*data-mal="(\d+)")?[^>]*>(?:<b>(\d+)<\/b>)?(?:\s*<span[^>]*class="d-title"[^>]*>([^<]*)<\/span>)?/gi)];
      return matches.map(m => ({
        id: m[1],
        num: parseInt(m[2], 10),
        dataIds: m[3],
        malId: m[4] || undefined,
        title: m[6] ? decodeHtmlEntities(m[6].trim()) : undefined
      }));
    }
  } catch {}
  return [];
}

export async function getServerList(dataIds: string): Promise<AnikotoServerItem[]> {
  try {
    const res = await fetch(`${BASE_URL}/ajax/server/list?servers=${encodeURIComponent(dataIds)}`, { headers: AJAX_HEADERS });
    if (res.ok) {
      const json = await res.json();
      const html = json?.result || "";
      const types = [...html.matchAll(/<div class="type" data-type="(sub|dub)">([\s\S]*?)<\/div>/gi)];
      const list: AnikotoServerItem[] = [];
      for (const t of types) {
        const type = t[1] as "sub" | "dub";
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
  } catch {}
  return [];
}

export async function getServerPlayerUrl(linkId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/ajax/server?get=${encodeURIComponent(linkId)}`, { headers: AJAX_HEADERS });
    if (res.ok) {
      const json = await res.json();
      return json?.result?.url || null;
    }
  } catch {}
  return null;
}
