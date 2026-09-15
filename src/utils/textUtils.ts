/**
 * Text utility and normalization functions
 */

export function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function cleanTitle(str: string): string {
  if (!str) return "";
  return decodeHtmlEntities(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeDiceScore(s1: string, s2: string): number {
  const a = cleanTitle(s1);
  const b = cleanTitle(s2);
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  const wordsA = a.split(" ").filter(Boolean);
  const wordsB = b.split(" ").filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  return (2 * intersection) / (wordsA.length + wordsB.length);
}

export function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs: number = 3000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}

export function extractSeasonNumber(title: string): number | null {
  if (!title) return null;
  const t = title.trim();

  // 1. Explicit Season words: "Season 2", "2nd Season", "S2", "Part 2"
  const m1 = t.match(/\b(?:season\s*(\d+)|(\d+)(?:nd|rd|th|st)\s*season|\bs(\d+)\b|part\s*(\d+))/i);
  if (m1) {
    const num = m1[1] || m1[2] || m1[3] || m1[4];
    if (num) return parseInt(num, 10);
  }

  // 2. Roman Numerals: II, III, IV, V, VI (avoids isolated I)
  const mRoman = t.match(/\b(VI|V|IV|III|II)\b/i);
  if (mRoman) {
    const r = mRoman[1].toUpperCase();
    if (r === "II") return 2;
    if (r === "III") return 3;
    if (r === "IV") return 4;
    if (r === "V") return 5;
    if (r === "VI") return 6;
  }

  // 3. Trailing season digit: "KonoSuba 2", "Noragami 2", "Blue Exorcist 2"
  const mTrail = t.match(/\s+([2-9])$/);
  if (mTrail) {
    return parseInt(mTrail[1], 10);
  }

  return null;
}

const LANG_MAP: Record<string, string> = {
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

export function normalizeSubtitleLang(rawLabel?: string): string {
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
