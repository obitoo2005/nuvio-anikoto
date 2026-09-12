import { AnikotoServerItem, PluginRuntimeResult, PluginSubtitleResult } from "../types";
import { getServerPlayerUrl } from "../api/anikotoClient";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function resolveStreamFromServer(
  server: AnikotoServerItem
): Promise<PluginRuntimeResult | null> {
  try {
    const playerUrl = await getServerPlayerUrl(server.linkId);
    if (!playerUrl) return null;

    const playerRes = await fetch(playerUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://anikoto.cz/"
      }
    });
    if (!playerRes.ok) return null;
    const playerHtml = await playerRes.text();

    // Extract data-id attribute from player container
    const dataIdMatch = playerHtml.match(/data-id="(\d+)"/);
    if (!dataIdMatch) return null;
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
    if (!gsRes.ok) return null;
    const gsJson = await gsRes.json();

    const file = gsJson?.sources?.file;
    if (!file || typeof file !== "string") return null;

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

    return {
      title: `Anikoto - ${server.serverName} (${langLabel})`,
      name: "Anikoto",
      url: file,
      quality: "1080p",
      language: langCode,
      type: "hls",
      headers: {
        "Referer": `${playerOrigin}/`,
        "Origin": playerOrigin
      },
      subtitles: subtitles.length > 0 ? subtitles : undefined
    };
  } catch {
    return null;
  }
}
