import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from 'satellite.js';
import {
  ACTIVE_SATS_URL,
  EARTH_RADIUS_KM,
  LAND_GEOJSON_URL,
  LOCAL_ACTIVE_URL,
  LOCAL_STATIONS_URL,
  MAP_HEIGHT,
  MAP_WIDTH,
  REFRESH_OPTIONS,
  STATIONS_URL,
  SATELLITE_CATEGORIES,
  TRACKER_SETTINGS_STORAGE_KEY,
  TRACKER_SETTINGS_URL,
  VIEW_MODES,
} from './constants';

let landDataPromise;

function normalizeTrackerSettings(candidate) {
  const normalizedCategories = Array.isArray(candidate?.selectedCategories)
    ? candidate.selectedCategories.filter((category) => SATELLITE_CATEGORIES.includes(category))
    : [];

  return {
    autoRefreshEnabled:
      typeof candidate?.autoRefreshEnabled === 'boolean' ? candidate.autoRefreshEnabled : true,
    refreshSeconds:
      typeof candidate?.refreshSeconds === 'number' && REFRESH_OPTIONS.includes(candidate.refreshSeconds)
        ? candidate.refreshSeconds
        : null,
    selectedCategories: normalizedCategories.length ? normalizedCategories : SATELLITE_CATEGORIES,
    selectedSatelliteName:
      typeof candidate?.selectedSatelliteName === 'string' ? candidate.selectedSatelliteName.trim() : '',
    viewMode:
      candidate?.viewMode === VIEW_MODES.godsEye || candidate?.viewMode === VIEW_MODES.map
        ? candidate.viewMode
        : VIEW_MODES.map,
  };
}

export function classifySatellite(name) {
  const upper = name.toUpperCase();

  if (upper.includes('ISS') || upper.includes('TIANHE') || upper.includes('CSS')) {
    return 'Stations';
  }
  if (upper.includes('STARLINK')) {
    return 'Starlink';
  }
  if (upper.includes('ONEWEB')) {
    return 'OneWeb';
  }
  if (upper.includes('IRIDIUM')) {
    return 'Iridium';
  }
  if (upper.includes('GLONASS')) {
    return 'GLONASS';
  }
  if (upper.includes('GALILEO')) {
    return 'Galileo';
  }
  if (upper.includes('GPS') || upper.includes('NAVSTAR')) {
    return 'GPS';
  }
  if (['NOAA', 'METEOR', 'GOES', 'METOP', 'FENGYUN', 'FY-', 'DMSP'].some((key) => upper.includes(key))) {
    return 'Weather';
  }

  return 'Other';
}

export function parseTleText(tleText) {
  const lines = tleText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const satellites = [];

  for (let index = 0; index < lines.length - 2; index += 3) {
    satellites.push({
      id: `${lines[index + 1].trim()}-${lines[index + 2].trim()}`,
      name: lines[index].trim(),
      line1: lines[index + 1].trim(),
      line2: lines[index + 2].trim(),
    });
  }

  return satellites;
}

export function computeSatellitePosition(satellite, now) {
  const satrec = twoline2satrec(satellite.line1, satellite.line2);
  const propagation = propagate(satrec, now);
  if (!propagation.position) {
    return null;
  }

  const gmst = gstime(now);
  const geodetic = eciToGeodetic(propagation.position, gmst);
  const latitude = degreesLat(geodetic.latitude);
  const longitude = degreesLong(geodetic.longitude);
  const radius = 1 + geodetic.height / EARTH_RADIUS_KM;
  const latRad = (latitude * Math.PI) / 180;
  const lonRad = (longitude * Math.PI) / 180;

  return {
    orbitX: radius * Math.cos(latRad) * Math.cos(lonRad),
    orbitY: radius * Math.cos(latRad) * Math.sin(lonRad),
    orbitZ: radius * Math.sin(latRad),
    latitude,
    longitude,
    altitudeKm: geodetic.height,
  };
}

export function projectToMap(latitude, longitude) {
  return {
    mapX: ((longitude + 180) / 360) * MAP_WIDTH,
    mapY: ((90 - latitude) / 180) * MAP_HEIGHT,
  };
}

function buildSvgPathFromRing(ring) {
  if (!ring?.length) {
    return '';
  }

  return ring
    .map((point, index) => {
      const x = ((point[0] + 180) / 360) * MAP_WIDTH;
      const y = ((90 - point[1]) / 180) * MAP_HEIGHT;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

async function fetchTextWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }
    return await response.text();
  } finally {
    window.clearTimeout(timerId);
  }
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timerId);
  }
}

export async function loadLandData() {
  if (!landDataPromise) {
    landDataPromise = fetchJsonWithTimeout(LAND_GEOJSON_URL, 12000)
      .then((geoJson) => {
        const mapPaths = [];

        for (const feature of geoJson.features ?? []) {
          const geometry = feature.geometry ?? {};
          const coordinates = geometry.coordinates;
          if (!coordinates) {
            continue;
          }

          const geometryPolygons = geometry.type === 'Polygon'
            ? [coordinates]
            : geometry.type === 'MultiPolygon'
              ? coordinates
              : [];

          for (const polygon of geometryPolygons) {
            if (!polygon?.length) {
              continue;
            }

            const pathData = buildSvgPathFromRing(polygon[0]);
            if (pathData) {
              mapPaths.push(`${pathData} Z`);
            }
          }
        }

        return {
          mapPaths,
        };
      })
      .catch(() => ({ mapPaths: [] }));
  }

  return landDataPromise;
}

async function loadTleFeed(remoteUrl, localUrl, label) {
  try {
    const remoteText = await fetchTextWithTimeout(remoteUrl, 12000);
    return {
      text: remoteText,
      source: 'remote',
      note: `${label} loaded from the live Celestrak feed.`,
    };
  } catch (remoteError) {
    const localText = await fetchTextWithTimeout(localUrl, 12000);
    const fallbackMessage = remoteError instanceof Error ? remoteError.message : 'Remote request failed';

    return {
      text: localText,
      source: 'local',
      note: `${label} fell back to the bundled local snapshot because the live feed was unavailable: ${fallbackMessage}.`,
    };
  }
}

export async function loadTleFeeds() {
  const [stationsFeed, activeFeed] = await Promise.all([
    loadTleFeed(STATIONS_URL, LOCAL_STATIONS_URL, 'Stations feed'),
    loadTleFeed(ACTIVE_SATS_URL, LOCAL_ACTIVE_URL, 'Active feed'),
  ]);

  return {
    stations: parseTleText(stationsFeed.text),
    active: parseTleText(activeFeed.text),
    sourceSummary:
      stationsFeed.source === 'remote' && activeFeed.source === 'remote'
        ? 'Live browser fetch'
        : 'Bundled local snapshot',
    sourceNotes: [stationsFeed.note, activeFeed.note],
  };
}

export function buildSatelliteSnapshot(feeds, now) {
  const stationRecords = feeds.stations
    .map((satellite) => {
      const position = computeSatellitePosition(satellite, now);
      if (!position) {
        return null;
      }

      return {
        ...position,
        ...projectToMap(position.latitude, position.longitude),
        id: satellite.id,
        name: satellite.name,
        category: classifySatellite(satellite.name),
      };
    })
    .filter(Boolean);

  const activeRecords = feeds.active
    .map((satellite) => {
      const position = computeSatellitePosition(satellite, now);
      if (!position) {
        return null;
      }

      return {
        ...position,
        ...projectToMap(position.latitude, position.longitude),
        id: satellite.id,
        name: satellite.name,
        category: classifySatellite(satellite.name),
      };
    })
    .filter(Boolean);

  const stationIds = new Set(stationRecords.map((satellite) => satellite.id));
  const satellites = [
    ...stationRecords,
    ...activeRecords.filter((satellite) => !stationIds.has(satellite.id)),
  ];

  return {
    satellites,
    iss: stationRecords.find((satellite) => satellite.name.toUpperCase().includes('ISS')) ?? null,
    lastRefresh: now,
    totalCount: satellites.length,
  };
}

export function renderGridLines() {
  const lines = [];

  for (let longitude = -150; longitude <= 150; longitude += 30) {
    const x = ((longitude + 180) / 360) * MAP_WIDTH;
    lines.push({
      key: `lon-${longitude}`,
      x1: x,
      y1: 0,
      x2: x,
      y2: MAP_HEIGHT,
    });
  }

  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const y = ((90 - latitude) / 180) * MAP_HEIGHT;
    lines.push({
      key: `lat-${latitude}`,
      x1: 0,
      y1: y,
      x2: MAP_WIDTH,
      y2: y,
    });
  }

  return lines;
}

export function formatCoordinate(value, positive, negative) {
  const suffix = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(1)}° ${suffix}`;
}

export function formatTimestamp(date) {
  if (!date) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export async function loadTrackerSettings() {
  let fileSettings = {};

  try {
    fileSettings = await fetchJsonWithTimeout(TRACKER_SETTINGS_URL, 12000);
  } catch {
    fileSettings = {};
  }

  let storedSettings = {};

  try {
    const rawSettings = window.localStorage.getItem(TRACKER_SETTINGS_STORAGE_KEY);
    storedSettings = rawSettings ? JSON.parse(rawSettings) : {};
  } catch {
    storedSettings = {};
  }

  return normalizeTrackerSettings({
    ...fileSettings,
    ...storedSettings,
  });
}

export function saveTrackerSettings(settings) {
  try {
    window.localStorage.setItem(
      TRACKER_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizeTrackerSettings(settings)),
    );
  } catch {
    // Ignore storage failures so the tracker keeps working in restricted browsers.
  }
}