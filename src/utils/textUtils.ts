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

export function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs: number = 4000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}

export interface ParsedSeasonLabel {
  season: number | null;
  part: number | null;
  isSpecial: boolean;
  isMovie: boolean;
  isFinalSeason: boolean;
}

const SEASON_STOP_WORDS = new Set([
  "season", "seasons", "part", "parts", "cour", "cours", "the", "a", "an",
  "of", "and", "to", "in", "on", "for", "with", "ver", "version", "tv",
  "arc", "special", "specials", "movie", "movies", "film", "films", "final",
  "story", "chapter", "volume", "no", "wa", "ga", "ni", "de", "wo", "ova",
  "ona", "recap", "picture", "drama", "mini", "anime", "half"
]);

export function parseSeasonLabel(title: string): ParsedSeasonLabel {
  const raw = decodeHtmlEntities(String(title || "")).trim();
  const lower = raw.toLowerCase();

  const isSpecial = /\b(specials?|ova|onas?|recap|picture drama|mini anime)\b/i.test(lower);
  const isMovie = /\b(movies?|films?)\b/i.test(lower);
  const isFinalSeason = /\bfinal season\b/i.test(lower);

  let season: number | null = null;
  let part: number | null = null;

  // "Season 2", "Season 02"
  const mSeason = lower.match(/\bseason\s*0*(\d+)\b/i);
  if (mSeason) season = parseInt(mSeason[1], 10);

  // "2nd Season", "3rd Season"
  if (season === null) {
    const mNth = lower.match(/\b0*(\d+)\s*(?:st|nd|rd|th)\s*season\b/i);
    if (mNth) season = parseInt(mNth[1], 10);
  }

  // "S2" (standalone token)
  if (season === null) {
    const mS = lower.match(/\bs0*(\d+)\b/i);
    if (mS) season = parseInt(mS[1], 10);
  }

  // Roman numerals: II, III, IV, V, VI (avoid isolated I)
  if (season === null) {
    const mRoman = raw.match(/\b(VI|V|IV|III|II)\b/);
    if (mRoman) {
      const map: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6 };
      season = map[mRoman[1].toUpperCase()] ?? null;
    }
  }

  // Trailing season digit: "KonoSuba 2" (never "Part 2")
  if (season === null) {
    const mTrail = raw.match(/\s+([2-9])$/);
    if (mTrail && !/\b(?:part|cour)\s*[2-9]\s*$/i.test(raw)) {
      season = parseInt(mTrail[1], 10);
    }
  }

  // "Part 2", "Cour 2" are parts, never seasons
  const mPart = lower.match(/\b(?:part|cour)\s*0*(\d+)\b/i);
  if (mPart) part = parseInt(mPart[1], 10);

  return { season, part, isSpecial, isMovie, isFinalSeason };
}

export function extractSeasonNumber(title: string): number | null {
  return parseSeasonLabel(title).season;
}

export function distinctiveWords(text: string): string[] {
  return cleanTitle(text)
    .split(" ")
    .filter(w => w.length >= 3 && !SEASON_STOP_WORDS.has(w));
}

export function coversNamedSeason(candidate: string, seasonName?: string): boolean {
  if (!candidate || !seasonName) return false;
  const targetWords = distinctiveWords(seasonName);
  if (targetWords.length === 0) return false;
  const candidateWords = new Set(distinctiveWords(candidate));
  if (candidateWords.size === 0) return false;
  let matched = 0;
  for (const w of targetWords) if (candidateWords.has(w)) matched++;
  return matched / targetWords.length >= 0.6;
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
