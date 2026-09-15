import { AnikotoServerItem, PluginRuntimeResult, PluginSubtitleResult } from "../types";
import { getServerPlayerUrl } from "../api/anikotoClient";
import { fetchWithTimeout, normalizeSubtitleLang } from "../utils/textUtils";

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
      keyBytes.buffer as ArrayBuffer,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: ivBytes.buffer as ArrayBuffer },
      key,
      cipherBytes.buffer as ArrayBuffer
    );
    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text);
  } catch (err) {
    console.warn("[Anikoto] decryptEnc failed:", (err as Error)?.message || err);
    return null;
  }
}

export async function resolveStreamFromServer(
  server: AnikotoServerItem
): Promise<PluginRuntimeResult | null> {
  try {
    const playerUrl = await getServerPlayerUrl(server.linkId);
    if (!playerUrl) return null;

    const playerRes = await fetchWithTimeout(playerUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://anikoto.cz/"
      }
    }, 2000);
    if (!playerRes.ok) return null;
    const playerHtml = await playerRes.text();

    // Extract data-id attribute from player container
    const dataIdMatch = playerHtml.match(/data-id="(\d+)"/);
    if (!dataIdMatch) return null;
    const playerStreamId = dataIdMatch[1];

    const parsed = new URL(playerUrl);
    const playerOrigin = parsed.origin;
    const sParam = parsed.searchParams.get("s") || "tcdn";
    const gsUrl = `${playerOrigin}/stream/getSourcesNew?id=${playerStreamId}&s=${encodeURIComponent(sParam)}`;

    const gsRes = await fetchWithTimeout(gsUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": playerUrl,
        "X-Requested-With": "XMLHttpRequest"
      }
    }, 2000);
    if (!gsRes.ok) return null;
    const gsJson = await gsRes.json();

    let masterFile = gsJson?.sources?.file;
    if (!masterFile && gsJson?.enc) {
      const dec = await decryptEnc(gsJson.enc);
      masterFile = dec?.file;
    }
    if (!masterFile || typeof masterFile !== "string") return null;

    // Route subtitle-only domain to working media CDN
    if (masterFile.includes("fetch.nexabloom.top")) {
      masterFile = masterFile.replace("fetch.nexabloom.top", "ncdn.imgnex.top");
    }

    const subtitles: PluginSubtitleResult[] = (gsJson.tracks || [])
      .filter((t: { file?: string }) => Boolean(t.file))
      .map((t: { file: string; label?: string }) => ({
        url: t.file,
        language: normalizeSubtitleLang(t.label || "English"),
        name: t.label || "English"
      }));

    const isDub = server.type === "dub";
    const langLabel = isDub ? "Dub" : "Sub";
    const langCode = isDub ? "en" : "ja";

    const displayName = `${server.serverName} • ${langLabel}`;

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
      subtitles: subtitles.length > 0 ? subtitles : undefined
    };
  } catch (err) {
    console.warn("[Anikoto] resolveStreamFromServer failed:", (err as Error)?.message || err);
    return null;
  }
}
