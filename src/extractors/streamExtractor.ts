import { AnikotoServerItem, PluginRuntimeResult, PluginSubtitleResult } from "../types";
import { getServerPlayerUrl } from "../api/anikotoClient";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const U = "i?LMTAx0Q6,:}50U";
const S = "W0;27ToaUpl_P%'c";

function W(str: string, len: number): Uint8Array {
  const encText = new TextEncoder().encode(String(str));
  const arr = new Uint8Array(len);
  arr.set(encText.subarray(0, Math.min(len, encText.length)));
  return arr;
}

function b64ToUint8(str: string): Uint8Array {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function decryptEnc(encStr: string): Promise<{ file?: string } | null> {
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

interface StreamVariant {
  quality: string;
  url: string;
}

async function parseMasterVariants(
  masterUrl: string,
  headers: Record<string, string>
): Promise<StreamVariant[]> {
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;
    const res = await fetch(masterUrl, {
      headers,
      signal: controller?.signal
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split("\n");
    const variants: StreamVariant[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#EXT-X-STREAM-INF:") && !line.includes("I-FRAME")) {
        let quality = "1080p";
        const nameMatch = line.match(/NAME="([^"]+)"/i);
        const resMatch = line.match(/RESOLUTION=(\d+x(\d+))/i);
        if (nameMatch && nameMatch[1]) {
          quality = nameMatch[1].trim();
        } else if (resMatch && resMatch[2]) {
          quality = `${resMatch[2]}p`;
        }

        const nextLine = lines[i + 1]?.trim();
        if (nextLine && !nextLine.startsWith("#")) {
          const variantUrl = new URL(nextLine, masterUrl).href;
          if (!seen.has(quality)) {
            seen.add(quality);
            variants.push({ quality, url: variantUrl });
          }
        }
      }
    }
    return variants;
  } catch {
    return [];
  }
}

export async function resolveStreamsFromServer(
  server: AnikotoServerItem
): Promise<PluginRuntimeResult[]> {
  try {
    const playerUrl = await getServerPlayerUrl(server.linkId);
    if (!playerUrl) return [];

    const playerRes = await fetch(playerUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://anikoto.cz/"
      }
    });
    if (!playerRes.ok) return [];
    const playerHtml = await playerRes.text();

    // Extract data-id attribute from player container
    const dataIdMatch = playerHtml.match(/data-id="(\d+)"/);
    if (!dataIdMatch) return [];
    const playerStreamId = dataIdMatch[1];

    const parsed = new URL(playerUrl);
    const playerOrigin = parsed.origin;
    const sParam = parsed.searchParams.get("s") || "tcdn";
    const gsUrl = `${playerOrigin}/stream/getSourcesNew?id=${playerStreamId}&s=${encodeURIComponent(sParam)}`;

    const gsRes = await fetch(gsUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": playerUrl,
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    if (!gsRes.ok) return [];
    const gsJson = await gsRes.json();

    let masterFile = gsJson?.sources?.file;
    if (!masterFile && gsJson?.enc) {
      const dec = await decryptEnc(gsJson.enc);
      masterFile = dec?.file;
    }
    if (!masterFile || typeof masterFile !== "string") return [];

    // Route subtitle-only domain to working media CDN
    if (masterFile.includes("fetch.nexabloom.top")) {
      masterFile = masterFile.replace("fetch.nexabloom.top", "ncdn.imgnex.top");
    }

    const subtitles: PluginSubtitleResult[] = (gsJson.tracks || [])
      .filter((t: { file?: string }) => Boolean(t.file))
      .map((t: { file: string; label?: string }) => ({
        url: t.file,
        language: t.label || "Unknown",
        name: t.label || "Subtitles"
      }));

    const isDub = server.type === "dub";
    const langLabel = isDub ? "Dub" : "Sub";
    const langCode = isDub ? "en" : "ja";
    const headers = {
      "Referer": `${playerOrigin}/`,
      "Origin": playerOrigin
    };

    const variants = await parseMasterVariants(masterFile, headers);
    const results: PluginRuntimeResult[] = [];

    if (variants.length > 0) {
      for (const v of variants) {
        results.push({
          title: `Anikoto - ${server.serverName} (${langLabel}) [${v.quality} Direct]`,
          name: "Anikoto",
          url: v.url,
          quality: v.quality,
          language: langCode,
          type: "hls",
          headers,
          subtitles: subtitles.length > 0 ? subtitles : undefined
        });
      }
      results.push({
        title: `Anikoto - ${server.serverName} (${langLabel}) [Auto Adaptive]`,
        name: "Anikoto",
        url: masterFile,
        quality: "Auto",
        language: langCode,
        type: "hls",
        headers,
        subtitles: subtitles.length > 0 ? subtitles : undefined
      });
    } else {
      const direct1080 = masterFile.replace("master.m3u8", "index-f1-v1-a1.m3u8");
      results.push({
        title: `Anikoto - ${server.serverName} (${langLabel}) [1080p Direct]`,
        name: "Anikoto",
        url: direct1080,
        quality: "1080p",
        language: langCode,
        type: "hls",
        headers,
        subtitles: subtitles.length > 0 ? subtitles : undefined
      });
      results.push({
        title: `Anikoto - ${server.serverName} (${langLabel}) [Auto Adaptive]`,
        name: "Anikoto",
        url: masterFile,
        quality: "Auto",
        language: langCode,
        type: "hls",
        headers,
        subtitles: subtitles.length > 0 ? subtitles : undefined
      });
    }

    return results;
  } catch {
    return [];
  }
}
