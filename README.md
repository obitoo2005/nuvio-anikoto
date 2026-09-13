# Nuvio Anikoto Suite (Plugin & Local Addon)

A production-ready **streaming provider plugin** and **live local catalogue addon** for the **Nuvio** media player ecosystem powered by **Anikoto.cz**.

---

## 1. Local Anikoto Catalogue Addon (Home & Discover Rows)

A standalone local Stremio/Nuvio HTTP addon server that streams real-time catalogues directly from Anikoto.cz to your Nuvio **Home** and **Discover** pages:

- **Anikoto - Trending**: Currently trending anime.
- **Anikoto - Latest Updates**: Newly updated anime episodes.
- **Anikoto - Top Airing**: Most viewed currently-airing shows.
- **Anikoto - Most Popular**: All-time most viewed anime on Anikoto.
- **Live Genre Browsing**: Filter by Action, Adventure, Comedy, Drama, Fantasy, Romance, Sci-Fi, Shounen, etc.
- **Live Search**: Search Anikoto's full library directly from Nuvio's search bar.
- **One-Click Playback**: Clicking any episode card automatically connects to our Anikoto streaming plugin to play in 1080p.

### How to Run the Addon Locally:

1. Open a terminal in `D:\nuvioplugin` and run:
   ```bash
   npm run addon
   ```
2. The terminal will display:
   ```text
   =====================================================
      ANIKOTO CATALOGUE ADDON FOR NUVIO IS RUNNING!     
   =====================================================
   Local (this PC):   http://localhost:7000/manifest.json
   Network (TV/Phone): http://192.168.1.X:7000/manifest.json
   =====================================================
   ```

### How to Add to Nuvio:

1. In Nuvio, go to **Settings (⚙️) &rarr; Addons** *(Note: Addons, not Plugins)*.
2. Tap **Add Addon** (or the **`+`** button).
3. Paste the URL:
   - **If running Nuvio on this PC**: `http://localhost:7000/manifest.json`
   - **If running Nuvio on your Phone or Android TV**: `http://<your-pc-ip>:7000/manifest.json`
4. Tap **Install**.
5. Go to **Settings &rarr; Homescreen** to arrange the Anikoto catalog rows to the top of your homepage.

---

## 2. Anikoto Stream Provider Plugin (Video Playback)

The video scraper plugin that resolves high-bitrate 1080p HLS video streams, multi-server redundancy, and multi-language subtitles when you tap any anime episode.

### Features:
- **Direct 1080p HLS Playback**: Crystal clear high-definition streams.
- **Server Redundancy**: Multi-mirror support (`HD-1`, `HD-2`, `Vidstream-2`).
- **Sub & Dub**: Japanese original audio with subtitles or English dubbing.
- **Multi-Language Subtitles**: WebVTT subtitles in English, Spanish, French, German, and more.
- **Bidirectional Season Resolution**: Intelligently resolves multi-season anime across TMDB, Kitsu, and Anikoto.

### Plugin Installation in Nuvio:
1. Open Nuvio and navigate to **Settings (⚙️) &rarr; Plugins**.
2. Tap **Add Plugin Repository** (or **Install from URL**).
3. Paste the Plugin manifest URL:
   ```text
   https://cdn.jsdelivr.net/gh/obitoo2005/nuvio-anikoto@main/manifest.json
   ```
   *(or raw: `https://raw.githubusercontent.com/obitoo2005/nuvio-anikoto/main/manifest.json`)*
4. Tap **Install**.
