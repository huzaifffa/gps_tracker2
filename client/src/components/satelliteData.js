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
  CATEGORY_COLORS,
  DEFAULT_CAMERA,
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
const GLOBE_SURFACE_RESOLUTION = 50;

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

export function createSphere(radius = 1, resolution = 50) {
  const x = [];
  const y = [];
  const z = [];

  for (let rowIndex = 0; rowIndex < resolution; rowIndex += 1) {
    const rowX = [];
    const rowY = [];
    const rowZ = [];
    const u = (2 * Math.PI * rowIndex) / (resolution - 1);

    for (let columnIndex = 0; columnIndex < resolution; columnIndex += 1) {
      const v = (Math.PI * columnIndex) / (resolution - 1);
      rowX.push(radius * Math.cos(u) * Math.sin(v));
      rowY.push(radius * Math.sin(u) * Math.sin(v));
      rowZ.push(radius * Math.cos(v));
    }

    x.push(rowX);
    y.push(rowY);
    z.push(rowZ);
  }

  return { x, y, z };
}

function ringCrossesAntimeridian(ring) {
  if (!Array.isArray(ring) || ring.length < 2) {
    return false;
  }

  for (let index = 1; index < ring.length; index += 1) {
    if (Math.abs(ring[index][0] - ring[index - 1][0]) > 180) {
      return true;
    }
  }

  return false;
}

function getRingBounds(ring) {
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;

  for (const point of ring) {
    const [lon, lat] = point;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  return { minLat, maxLat, minLon, maxLon };
}

function normalizeLongitudeForReference(longitude, referenceLongitude) {
  let normalizedLongitude = longitude;

  while (normalizedLongitude - referenceLongitude > 180) {
    normalizedLongitude -= 360;
  }

  while (normalizedLongitude - referenceLongitude < -180) {
    normalizedLongitude += 360;
  }

  return normalizedLongitude;
}

function pointInRing(longitude, latitude, ring) {
  let inside = false;

  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const currentLongitude = normalizeLongitudeForReference(ring[index][0], longitude);
    const currentLatitude = ring[index][1];
    const previousLongitude = normalizeLongitudeForReference(ring[previousIndex][0], longitude);
    const previousLatitude = ring[previousIndex][1];

    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    if (!crossesLatitude) {
      continue;
    }

    const intersectionLongitude =
      ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
        (previousLatitude - currentLatitude) +
      currentLongitude;

    if (longitude < intersectionLongitude) {
      inside = !inside;
    }
  }

  return inside;
}

function preparePolygon(polygon) {
  if (!Array.isArray(polygon) || !polygon.length || !Array.isArray(polygon[0]) || !polygon[0].length) {
    return null;
  }

  const exterior = polygon[0];
  const holes = polygon.slice(1).filter((ring) => Array.isArray(ring) && ring.length);

  return {
    exterior,
    holes,
    bounds: getRingBounds(exterior),
    crossesAntimeridian: ringCrossesAntimeridian(exterior),
  };
}

function polygonMayContainPoint(longitude, latitude, polygon) {
  if (latitude < polygon.bounds.minLat || latitude > polygon.bounds.maxLat) {
    return false;
  }

  if (!polygon.crossesAntimeridian) {
    return longitude >= polygon.bounds.minLon && longitude <= polygon.bounds.maxLon;
  }

  return true;
}

function pointInPolygon(longitude, latitude, polygon) {
  if (!polygonMayContainPoint(longitude, latitude, polygon)) {
    return false;
  }

  if (!pointInRing(longitude, latitude, polygon.exterior)) {
    return false;
  }

  return !polygon.holes.some((hole) => pointInRing(longitude, latitude, hole));
}

function buildGlobeSurfaceColor(polygons, resolution = GLOBE_SURFACE_RESOLUTION) {
  const surfaceColor = [];

  for (let rowIndex = 0; rowIndex < resolution; rowIndex += 1) {
    const longitude = -180 + (360 * rowIndex) / (resolution - 1);
    const colorRow = [];

    for (let columnIndex = 0; columnIndex < resolution; columnIndex += 1) {
      const latitude = 90 - (180 * columnIndex) / (resolution - 1);
      const isLand = polygons.some((polygon) => pointInPolygon(longitude, latitude, polygon));

      colorRow.push(isLand ? 0.2 : 0.85);
    }

    surfaceColor.push(colorRow);
  }

  return surfaceColor;
}

export function projectLinesToSphere(lons, lats, radius = 1.001) {
  const x = [];
  const y = [];
  const z = [];

  for (let index = 0; index < lons.length; index += 1) {
    const lon = lons[index];
    const lat = lats[index];

    if (lon === null || lat === null) {
      x.push(null);
      y.push(null);
      z.push(null);
      continue;
    }

    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    x.push(radius * Math.cos(latRad) * Math.cos(lonRad));
    y.push(radius * Math.cos(latRad) * Math.sin(lonRad));
    z.push(radius * Math.sin(latRad));
  }

  return { x, y, z };
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
        const lons = [];
        const lats = [];
        const mapPaths = [];
        const globePolygons = [];

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

            const preparedPolygon = preparePolygon(polygon);
            if (preparedPolygon) {
              globePolygons.push(preparedPolygon);
            }

            const pathData = buildSvgPathFromRing(polygon[0]);
            if (pathData) {
              mapPaths.push(`${pathData} Z`);
            }

            for (const point of polygon[0]) {
              lons.push(point[0]);
              lats.push(point[1]);
            }

            lons.push(null);
            lats.push(null);
          }
        }

        return {
          sphere: projectLinesToSphere(lons, lats),
          mapPaths,
          surfaceColor: buildGlobeSurfaceColor(globePolygons),
        };
      })
      .catch(() => ({ sphere: { x: [], y: [], z: [] }, mapPaths: [], surfaceColor: null }));
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

export function extractCamera(relayoutData) {
  if (!relayoutData || typeof relayoutData !== 'object') {
    return null;
  }
  if (relayoutData['scene.camera']) {
    return relayoutData['scene.camera'];
  }
  if (relayoutData.scene?.camera) {
    return relayoutData.scene.camera;
  }
  return null;
}

export function buildGodsEyeFigure(selectedCategories, satelliteData, landData, camera, selectedSatelliteId) {
  const earth = createSphere(1, GLOBE_SURFACE_RESOLUTION);
  const filteredSatellites = satelliteData.satellites.filter((satellite) =>
    selectedCategories.includes(satellite.category),
  );
  const selectedSatellite = filteredSatellites.find((satellite) => satellite.id === selectedSatelliteId) ?? null;

  const figure = {
    data: [
      {
        type: 'surface',
        x: earth.x,
        y: earth.y,
        z: earth.z,
        colorscale: [
          [0, '#32593f'],
          [0.22, '#5f8f54'],
          [0.221, '#14314a'],
          [1, '#214a72'],
        ],
        ...(landData.surfaceColor ? { surfacecolor: landData.surfaceColor, cmin: 0, cmax: 1 } : {}),
        showscale: false,
        opacity: 0.9,
        lighting: { ambient: 0.65, diffuse: 0.9, roughness: 0.95, specular: 0.1 },
        lightposition: { x: 200, y: 80, z: 120 },
        name: 'Earth basemap',
        hoverinfo: 'skip',
      },
      {
        type: 'scatter3d',
        x: landData.sphere.x,
        y: landData.sphere.y,
        z: landData.sphere.z,
        mode: 'lines',
        line: { color: '#d9f99d', width: 2 },
        hoverinfo: 'skip',
        name: 'Coastlines',
      },
      {
        type: 'scatter3d',
        x: filteredSatellites.map((satellite) => satellite.orbitX),
        y: filteredSatellites.map((satellite) => satellite.orbitY),
        z: filteredSatellites.map((satellite) => satellite.orbitZ),
        mode: 'markers',
        marker: {
          size: 2.6,
          color: filteredSatellites.map((satellite) => CATEGORY_COLORS[satellite.category] ?? CATEGORY_COLORS.Other),
          opacity: 0.95,
        },
        text: filteredSatellites.map((satellite) => `${satellite.name} (${satellite.category})`),
        hovertemplate: '%{text}<extra></extra>',
        name: 'Satellites',
      },
    ],
    layout: {
      title: "God's Eye Satellite Globe",
      margin: { l: 0, r: 0, b: 0, t: 44 },
      paper_bgcolor: '#030712',
      plot_bgcolor: '#030712',
      legend: {
        font: { color: '#f8fafc' },
        bgcolor: 'rgba(3, 7, 18, 0.55)',
      },
      scene: {
        xaxis: { visible: false },
        yaxis: { visible: false },
        zaxis: { visible: false },
        bgcolor: '#030712',
        aspectmode: 'data',
        uirevision: 'keep-gods-eye-camera',
        camera: camera ?? DEFAULT_CAMERA,
      },
    },
    config: {
      displaylogo: false,
      responsive: true,
      scrollZoom: true,
    },
  };

  if (satelliteData.iss) {
    figure.data.push({
      type: 'scatter3d',
      x: [satelliteData.iss.orbitX],
      y: [satelliteData.iss.orbitY],
      z: [satelliteData.iss.orbitZ],
      mode: 'markers',
      marker: { size: 7, color: '#fde047', symbol: 'diamond' },
      name: 'ISS',
      hovertemplate: 'ISS<extra></extra>',
    });
  }

  if (selectedSatellite) {
    figure.data.push({
      type: 'scatter3d',
      x: [selectedSatellite.orbitX],
      y: [selectedSatellite.orbitY],
      z: [selectedSatellite.orbitZ],
      mode: 'markers',
      marker: { size: 10, color: '#ffffff', symbol: 'circle-open' },
      name: 'Selected',
      hovertemplate: `${selectedSatellite.name}<extra></extra>`,
    });
  }

  return figure;
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