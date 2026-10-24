const {
  parseSeasonLabel,
  coversNamedSeason,
  scoreBaseTitle,
  decodeHtmlEntities
} = require("../providers/anikoto.js");

const EPISODE_RE = /<a[^>]+data-id="(\d+)"[^>]+data-num="(\d+)"[^>]+data-ids="([^"]+)"(?:[^>]*data-mal="(\d+)")?[^>]*>(?:<b>(\d+)<\/b>)?(?:\s*<span[^>]*class="d-title"[^>]*>([^<]*)<\/span>)?/gi;

function parseEpisodes(html) {
  const matches = [...(html || "").matchAll(EPISODE_RE)];
  return matches.map(m => ({
    id: m[1],
    num: parseInt(m[2], 10),
    dataIds: m[3],
    malId: m[4] || undefined,
    title: m[6] ? decodeHtmlEntities(m[6].trim()) : undefined
  }));
}

function pickBestTmdbResult(results, animeTitle) {
  let best = null;
  let bestScore = 0;
  for (const result of results || []) {
    const name = result.name || result.title || "";
    const original = result.original_name || result.original_title || "";
    const score = Math.max(
      scoreBaseTitle(name, original, animeTitle),
      scoreBaseTitle(original, name, animeTitle)
    );
    const genreBonus = (result.genre_ids || []).includes(16) ? 0.05 : 0;
    const total = score + genreBonus;
    if (total > bestScore) {
      bestScore = total;
      best = result;
    }
  }
  return bestScore >= 0.4 ? best : null;
}

function mapSeasonEntries(seasonItems, tmdbSeasons) {
  const seasons = (tmdbSeasons || [])
    .filter(s => s.season_number > 0 && (s.episode_count || 0) > 0)
    .sort((a, b) => a.season_number - b.season_number);
  const used = new Set();

  return seasonItems.map((item, index) => {
    const label = parseSeasonLabel(item.name);
    let displaySeason = null;

    if (label.isSpecial || label.isMovie) {
      displaySeason = 0;
    } else {
      for (const tmdb of seasons) {
        if (coversNamedSeason(item.name, tmdb.name)) {
          displaySeason = tmdb.season_number;
          break;
        }
      }
      if (displaySeason === null && label.season !== null && seasons.some(s => s.season_number === label.season)) {
        displaySeason = label.season;
      }
      if (displaySeason === null) {
        const unused = seasons.find(s => !used.has(s.season_number));
        if (unused) {
          displaySeason = unused.season_number;
        } else {
          let n = 1;
          while (used.has(n)) n++;
          displaySeason = n;
        }
      }
    }

    if (displaySeason > 0) used.add(displaySeason);
    return { ...item, label, index, displaySeason };
  });
}

function buildVideos(options) {
  const {
    animeId,
    animeTitle,
    animePoster,
    seasonItems,
    episodeLists,
    tmdbSeasons,
    isMovie
  } = options;

  if (isMovie) {
    const episodes = episodeLists[0] || [];
    const episode = episodes[0];
    return [{
      id: `anikoto:${animeId}:${episode ? episode.num : 1}`,
      title: episode && episode.title ? episode.title : "Full",
      season: 1,
      episode: 1,
      thumbnail: animePoster
    }];
  }

  if (!seasonItems || seasonItems.length <= 1) {
    const episodes = episodeLists[0] || [];
    if (episodes.length === 0) return [];

    const tmdb = (tmdbSeasons || [])
      .filter(s => s.season_number > 0 && (s.episode_count || 0) > 0)
      .sort((a, b) => a.season_number - b.season_number);
    const maxEpisode = Math.max(...episodes.map(e => e.num));
    const totalEpisodes = tmdb.reduce((sum, s) => sum + (s.episode_count || 0), 0);

    if (tmdb.length > 1 && totalEpisodes > 0 && Math.abs(maxEpisode - totalEpisodes) <= 2) {
      const videos = [];
      let cursor = 0;
      for (const season of tmdb) {
        const slice = episodes.slice(cursor, cursor + (season.episode_count || 0));
        slice.forEach((episode, index) => {
          videos.push({
            id: `anikoto:${animeId}:${episode.num}`,
            title: episode.title ? `[${season.name}] ${episode.title}` : `Episode ${index + 1}`,
            season: season.season_number,
            episode: index + 1,
            thumbnail: animePoster
          });
        });
        cursor += season.episode_count || 0;
      }
      if (cursor >= episodes.length - 2) return videos;
    }

    const seasonNumber = parseSeasonLabel(animeTitle).season || 1;
    return episodes.map(episode => ({
      id: `anikoto:${animeId}:${episode.num}`,
      title: episode.title || `Episode ${episode.num}`,
      season: seasonNumber,
      episode: episode.num,
      thumbnail: animePoster
    }));
  }

  const entries = mapSeasonEntries(
    seasonItems.map((item, index) => ({
      ...item,
      episodes: episodeLists[index] || []
    })),
    tmdbSeasons
  );

  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.displaySeason)) groups.set(entry.displaySeason, []);
    groups.get(entry.displaySeason).push(entry);
  }

  const videos = [];
  for (const [season, items] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    items.sort((a, b) => (a.label.part ?? a.index + 1) - (b.label.part ?? b.index + 1));
    const isPartGroup = season > 0 && items.length > 1;
    let previousEpisodes = 0;
    let specialOffset = 0;

    for (const item of items) {
      for (const episode of item.episodes) {
        let displayEpisode;
        if (season === 0) {
          displayEpisode = specialOffset + (episode.num >= 1 ? episode.num : 1);
        } else if (isPartGroup) {
          displayEpisode = previousEpisodes + (episode.num >= 1 ? episode.num : 1);
        } else {
          displayEpisode = episode.num;
        }

        videos.push({
          id: `anikoto:${item.targetId}:${episode.num}`,
          title: episode.title
            ? `[${item.name}] ${episode.title}`
            : `[${item.name}] Episode ${episode.num}`,
          season,
          episode: displayEpisode,
          thumbnail: animePoster
        });
      }

      if (season === 0) specialOffset += item.episodes.length;
      else previousEpisodes += item.episodes.length;
    }
  }

  return videos.sort((a, b) => a.season - b.season || a.episode - b.episode);
}

module.exports = {
  parseEpisodes,
  pickBestTmdbResult,
  mapSeasonEntries,
  buildVideos
};
