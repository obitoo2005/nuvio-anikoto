import { AnikotoServerItem, PluginRuntimeResult, PluginSubtitleResult } from "../types";
import { getServerPlayerUrl } from "../api/anikotoClient";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface StreamVariant {
  quality: string;
  url: string;
}

async function parseMasterVariants(
  masterUrl: string,
  headers: Record<string, string>
): Promise<StreamVariant[]> {
  try {
    const res = await fetch(masterUrl, { headers });
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split("\n");
    const variants: StreamVariant[] = [];
    const seenQualities = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#EXT-X-STREAM-INF:")) {
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
          if (!seenQualities.has(quality)) {
            seenQualities.add(quality);
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

    const dataIdMatch = playerHtml.match(/data-id="(\d+)"/);
    if (!dataIdMatch) return [];
    const playerStreamId = dataIdMatch[1];

    const playerOrigin = new URL(playerUrl).origin;
    const getSourcesUrl = `${playerOrigin}/stream/getSourcesNew?id=${playerStreamId}`;

    const gsRes = await fetch(getSourcesUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": playerUrl,
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    if (!gsRes.ok) return [];
    const gsJson = await gsRes.json();

    const masterFile = gsJson?.sources?.file;
    if (!masterFile || typeof masterFile !== "string") return [];

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

    // Attempt to parse sub-playlist quality variants from the master playlist
    const variants = await parseMasterVariants(masterFile, headers);
    const results: PluginRuntimeResult[] = [];

    if (variants.length > 1) {
      // Multi-quality playlist: return each distinct quality option
      for (const v of variants) {
        results.push({
          title: `Anikoto - ${server.serverName} (${langLabel}) [${v.quality}]`,
          name: "Anikoto",
          url: v.url,
          quality: v.quality,
          language: langCode,
          type: "hls",
          headers,
          subtitles: subtitles.length > 0 ? subtitles : undefined
        });
      }
      // Also provide the adaptive master playlist as Auto
      results.push({
        title: `Anikoto - ${server.serverName} (${langLabel}) [Auto]`,
        name: "Anikoto",
        url: masterFile,
        quality: "Auto",
        language: langCode,
        type: "hls",
        headers,
        subtitles: subtitles.length > 0 ? subtitles : undefined
      });
    } else {
      // Single-variant or default playlist
      const detectedQuality = variants[0]?.quality || "1080p";
      results.push({
        title: `Anikoto - ${server.serverName} (${langLabel})`,
        name: "Anikoto",
        url: masterFile,
        quality: detectedQuality,
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
