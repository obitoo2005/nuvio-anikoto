/**
 * Nuvio Provider Types and Interfaces
 */

export interface PluginSubtitleResult {
  url: string;
  language: string;
  name?: string;
  headers?: Record<string, string>;
}

export interface PluginRuntimeResult {
  title: string;
  name?: string;
  url: string;
  quality?: string;
  size?: string;
  language?: string;
  provider?: string;
  type?: string;
  seeders?: number;
  peers?: number;
  infoHash?: string;
  headers?: Record<string, string>;
  subtitles?: PluginSubtitleResult[];
}

export interface TMDBSeasonInfo {
  season_number: number;
  episode_count: number;
  name: string;
}

export interface TMDBMetadata {
  numericId: string | number;
  kind: "tv" | "movie";
  title: string;
  originalTitle?: string;
  alternateTitles: string[];
  imdbId?: string;
  seasonName?: string;
  absoluteOffset: number;
}

export interface AnikotoSearchResult {
  id: string;
  url: string;
  title: string;
  jpTitle?: string;
}

export interface AnikotoSeasonItem {
  active: boolean;
  url: string;
  name: string;
}

export interface AnikotoEpisodeItem {
  id: string;
  num: number;
  dataIds: string;
  malId?: string;
  title?: string;
}

export interface AnikotoServerItem {
  type: "sub" | "dub";
  serverName: string;
  linkId: string;
}

export interface ResolvedStreamResult {
  url: string;
  quality: string;
  type: string;
  headers: Record<string, string>;
  subtitles?: PluginSubtitleResult[];
}
