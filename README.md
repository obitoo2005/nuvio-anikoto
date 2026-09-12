# Nuvio Provider Plugin: Anikoto.cz

A production-quality provider plugin for the **Nuvio** media player ecosystem that resolves playable anime series, movies, and specials from **Anikoto.cz**.

---

## Features

- **Full Catalog Coverage**: Search and resolve episodes for thousands of anime titles.
- **Direct HLS Playback**: Resolves legitimate master `.m3u8` streams compatible with Nuvio's native player (ExoPlayer / MPV).
- **Dual Audio Support**: Returns both **Sub** (Japanese with subtitles) and **Dub** (English audio) streams when available.
- **Multi-Server Redundancy**: Resolves all active servers (`Vidstream-2`, `HD-1`) with corresponding CDN mirrors.
- **Multi-Language Subtitles**: Extracts all publicly available WebVTT caption tracks (English, French, German, Spanish, Arabic, etc.).
- **Multi-Season & Franchise Mapping**: Automatically navigates franchise season trees (`/api/seasons/`) and handles both per-season episode numbering and continuous absolute numbering (e.g. Bleach, One Piece).
- **Robust Title Matching**: Employs fuzzy matching, Romaji normalization, Japanese title resolution, and TMDB alternate titles.
- **Zero External Runtime Dependencies**: Bundled into a standalone, self-contained ES2020/CommonJS provider compatible with Nuvio's QuickJS runtime.

---

## Reverse-Engineering & Architecture

The provider mirrors the complete playback resolution flow of Anikoto.cz:

```
TMDB ID / Request
        │
        ▼
TMDB Metadata Resolution (titles, Japanese title, seasons, absolute offsets)
        │
        ▼
Anikoto Search (/filter?keyword=...) & Fuzzy Match Scoring
        │
        ▼
Season Resolution (/api/seasons/{animeId})
        │
        ▼
Episode List Retrieval (/ajax/episode/list/{seasonAnimeId})
        │
        ▼
Server List Retrieval (/ajax/server/list?servers={dataIds})
        │
        ▼
Player URL Resolution (/ajax/server?get={linkId})
        │
        ▼
Direct Media & Subtitle Extraction (/stream/getSourcesNew?id={playerId})
        │
        ▼
Nuvio PluginRuntimeResult Array (HLS master.m3u8, headers, subtitles, 1080p)
```

---

## Repository Layout

```
├── manifest.json              # Nuvio plugin manifest
├── package.json               # Build and test configuration
├── tsconfig.json              # TypeScript configuration
├── README.md                  # Documentation and usage instructions
├── src/                       # Modular TypeScript source code
│   ├── index.ts               # Main provider entry point (getStreams & search exports)
│   ├── types.ts               # Nuvio & Anikoto TypeScript interfaces
│   ├── api/
│   │   ├── anikotoClient.ts   # Anikoto HTTP client & DOM parsers
│   │   └── tmdbClient.ts      # TMDB metadata client & offset calculator
│   ├── matching/
│   │   ├── titleMatcher.ts    # Title scoring & candidate selection
│   │   └── seasonMatcher.ts   # Multi-season & episode locator
│   ├── extractors/
│   │   └── streamExtractor.ts # Player extractor & HLS stream resolver
│   └── utils/
│       └── textUtils.ts       # Normalization, entity decoding, season extraction
├── providers/
│   └── anikoto.js             # Compiled production provider bundle for Nuvio
└── tests/
    ├── test_all.js            # Master test suite runner
    ├── test_manifest.js       # Manifest schema validation
    ├── test_nuvio_runtime.js  # Nuvio QuickJS evaluation harness test
    ├── test_title_matching.js # Unit tests for title matching & normalization
    ├── test_stream_schema.js  # Nuvio stream output schema validator
    └── test_real_anime.js     # Live end-to-end integration tests (Tests A-G)
```

---

## Installation into Nuvio

### Method 1: Remote Repository (Recommended)

1. Host this repository on GitHub (or any git host / raw file server).
2. In Nuvio, navigate to **Settings** → **Plugins**.
3. Click **Add Plugin Repository** (or **Install from URL**).
4. Enter the direct raw URL to `manifest.json`, for example:
   ```
   https://raw.githubusercontent.com/obitoo2005/nuvio-anikoto/main/manifest.json
   ```
5. Nuvio will download `manifest.json` and fetch `providers/anikoto.js`. Anikoto will now be available as an active stream provider.

### Method 2: Local Installation (Development / Testing)

1. Run a local HTTP server inside this directory:
   ```bash
   npx serve . -p 8080
   ```
2. Add the URL to Nuvio:
   ```
   http://127.0.0.1:8080/manifest.json
   ```

---

## Development & Building

### Prerequisites

- Node.js v18+ (tested on Node.js v24)
- npm

### Build the Provider Bundle

Compile the TypeScript source into the standalone `providers/anikoto.js` bundle:

```bash
npm run build
```

### Run the Test Suite

Execute the complete test suite (unit tests, manifest validation, QuickJS runtime harness, and live media playback checks):

```bash
npm test
```

---

## Verification & Test Results

The test suite tests real live content against Anikoto.cz:

- **Test A (Popular Anime)**: `Frieren: Beyond Journey's End` (TMDB 209867) S01E01 → Verified 4 streams, 9 subtitle tracks, HTTP 200 live HLS playlist.
- **Test B (Multi-Season Anime)**: `Attack on Titan` (TMDB 1429) S02E03 → Successfully navigated to Season 2 (Anikoto ID 1385), matched episode 3, verified 4 streams.
- **Test C (Alternate Titles)**: `Demon Slayer: Kimetsu no Yaiba` (TMDB 85937) S01E01 → Successfully resolved Japanese and Romaji title variants.
- **Test D (Movies)**: `Jujutsu Kaisen 0` (TMDB 810693) → Successfully resolved movie stream and 10 subtitle tracks.
- **Test E (Nonexistent Anime)**: Handled gracefully, returning empty array `[]` without throwing.
- **Test F (Nonexistent Episode)**: Handled gracefully, returning empty array `[]` without throwing.
- **Test G (Catalog Search)**: Direct keyword search returns rich anime metadata.

---

## Known Technical Limitations

1. **Geoblocking on Third-Party CDNs**: Certain CDN nodes used by Megaplay may apply regional IP rate-limiting. The provider returns all available server mirrors (`Vidstream-2`, `HD-1`) to ensure failover.
2. **Ongoing Source Stability**: If Anikoto changes its internal API signatures or obfuscation keys in the future, `src/api/anikotoClient.ts` will need corresponding updates.
3. **Subtitles**: Subtitles are delivered when provided by the upstream host (typically WebVTT tracks).
