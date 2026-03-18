export const EARTH_RADIUS_KM = 6371;
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 600;
export const STATIONS_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle';
export const ACTIVE_SATS_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
export const LAND_GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';
export const LOCAL_STATIONS_URL = '/data/stations.tle';
export const LOCAL_ACTIVE_URL = '/data/active.tle';
export const TRACKER_SETTINGS_URL = '/data/tracker-settings.json';
export const TRACKER_SETTINGS_STORAGE_KEY = 'gps-tracker-settings';
export const SATELLITE_CATEGORIES = [
  'Stations',
  'Starlink',
  'OneWeb',
  'GPS',
  'GLONASS',
  'Galileo',
  'Iridium',
  'Weather',
  'Other',
];
export const REFRESH_OPTIONS = [5, 10];
export const VIEW_MODES = {
  map: 'map',
  godsEye: 'gods-eye',
};
export const CATEGORY_COLORS = {
  Stations: '#fde047',
  Starlink: '#60a5fa',
  OneWeb: '#a78bfa',
  GPS: '#34d399',
  GLONASS: '#f97316',
  Galileo: '#fb7185',
  Iridium: '#38bdf8',
  Weather: '#22c55e',
  Other: '#cbd5e1',
};
export const DEFAULT_CAMERA = { eye: { x: 1.5, y: 1.5, z: 1.5 } };