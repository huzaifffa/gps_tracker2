import React, { useEffect, useRef, useState } from 'react';
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from 'satellite.js';

const EARTH_RADIUS_KM = 6371;
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 600;
const STATIONS_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle';
const ACTIVE_SATS_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const LOCAL_STATIONS_URL = '/data/stations.tle';
const LOCAL_ACTIVE_URL = '/data/active.tle';
const SATELLITE_CATEGORIES = [
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
const REFRESH_OPTIONS = [5, 10];
const VIEW_MODES = {
  map: 'map',
  godsEye: 'gods-eye',
};
const CATEGORY_COLORS = {
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

function classifySatellite(name) {
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


function parseTleText(tleText) {
  const lines = tleText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const satellites = [];

  for (let index = 0; index < lines.length - 2; index += 3) {
    satellites.push({
      name: lines[index].trim(),
      line1: lines[index + 1].trim(),
      line2: lines[index + 2].trim(),
    });
  }

  return satellites;
}

function computeSatellitePosition(satellite, now) {
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
    x: radius * Math.cos(latRad) * Math.cos(lonRad),
    y: radius * Math.cos(latRad) * Math.sin(lonRad),
    z: radius * Math.sin(latRad),
    latitude,
    longitude,
    altitudeKm: geodetic.height,
  };
}

function projectToMap(latitude, longitude) {
  return {
    x: ((longitude + 180) / 360) * MAP_WIDTH,
    y: ((90 - latitude) / 180) * MAP_HEIGHT,
  };
}

function buildSatelliteSnapshot(feeds, now) {
  const stationRecords = feeds.stations
    .map((satellite) => {
      const position = computeSatellitePosition(satellite, now);
      if (!position) {
        return null;
      }

      const mapPoint = projectToMap(position.latitude, position.longitude);

      return {
        ...position,
        ...mapPoint,
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

      const mapPoint = projectToMap(position.latitude, position.longitude);

      return {
        ...position,
        ...mapPoint,
        name: satellite.name,
        category: classifySatellite(satellite.name),
      };
    })
    .filter(Boolean);

  const stationNames = new Set(stationRecords.map((satellite) => satellite.name));
  const satellites = [
    ...stationRecords,
    ...activeRecords.filter((satellite) => !stationNames.has(satellite.name)),
  ];

  return {
    satellites,
    iss: stationRecords.find((satellite) => satellite.name.toUpperCase().includes('ISS')) ?? null,
    lastRefresh: now,
    totalCount: satellites.length,
  };
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

async function loadTleFeeds() {
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

function formatCoordinate(value, positive, negative) {
  const suffix = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(1)}° ${suffix}`;
}

function renderGridLines() {
  const lines = [];

  for (let longitude = -150; longitude <= 150; longitude += 30) {
    const x = ((longitude + 180) / 360) * MAP_WIDTH;
    lines.push(<line key={`lon-${longitude}`} x1={x} y1="0" x2={x} y2={MAP_HEIGHT} className="grid-line" />);
  }

  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const y = ((90 - latitude) / 180) * MAP_HEIGHT;
    lines.push(<line key={`lat-${latitude}`} x1="0" y1={y} x2={MAP_WIDTH} y2={y} className="grid-line" />);
  }

  return lines;
}

function renderGodsEyeGuides(size, earthRadius, maxOrbitRadius) {
  const center = size / 2;
  const guides = [];
  const ringCount = 3;

  for (let index = 1; index <= ringCount; index += 1) {
    const ratio = index / ringCount;
    const radius = earthRadius + (maxOrbitRadius - earthRadius) * ratio;
    guides.push(
      <circle
        key={`orbit-guide-${index}`}
        cx={center}
        cy={center}
        r={radius}
        className="gods-eye-guide"
      />,
    );
  }

  guides.push(<line key="gods-eye-axis-x" x1={0} y1={center} x2={size} y2={center} className="gods-eye-axis" />);
  guides.push(<line key="gods-eye-axis-y" x1={center} y1={0} x2={center} y2={size} className="gods-eye-axis" />);

  return guides;
}

function formatTimestamp(date) {
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

export default function App() {
  const [selectedCategories, setSelectedCategories] = useState(SATELLITE_CATEGORIES);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSatelliteName, setSelectedSatelliteName] = useState('');
  const [viewMode, setViewMode] = useState(VIEW_MODES.map);
  const [feeds, setFeeds] = useState(null);
  const [satelliteData, setSatelliteData] = useState({
    satellites: [],
    iss: null,
    totalCount: 0,
    lastRefresh: null,
  });
  const [sourceSummary, setSourceSummary] = useState('Loading data sources...');
  const [sourceNotes, setSourceNotes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError('');

      try {
        const nextFeeds = await loadTleFeeds();

        if (cancelled) {
          return;
        }

        const nextData = buildSatelliteSnapshot(nextFeeds, new Date());

        setFeeds(nextFeeds);
        setSourceSummary(nextFeeds.sourceSummary);
        setSourceNotes(nextFeeds.sourceNotes);
        setSatelliteData(nextData);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Unknown error';
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!feeds) {
      return;
    }

    if (refreshTimerRef.current) {
      window.clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (autoRefreshEnabled) {
      refreshTimerRef.current = window.setInterval(() => {
        setSatelliteData(buildSatelliteSnapshot(feeds, new Date()));
      }, refreshSeconds * 1000);
    }

    return () => {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [autoRefreshEnabled, feeds, refreshSeconds]);

  async function handleManualRefresh() {
    setLoading(true);
    setError('');

    try {
      const nextFeeds = await loadTleFeeds();
      setFeeds(nextFeeds);
      setSourceSummary(nextFeeds.sourceSummary);
      setSourceNotes(nextFeeds.sourceNotes);
      setSatelliteData(buildSatelliteSnapshot(nextFeeds, new Date()));
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const filteredSatellites = satelliteData.satellites.filter((satellite) =>
    selectedCategories.includes(satellite.category),
  );
  const listedSatellites = satelliteData.satellites
    .filter((satellite) => {
      if (!searchTerm.trim()) {
        return true;
      }

      const query = searchTerm.trim().toLowerCase();
      return (
        satellite.name.toLowerCase().includes(query) ||
        satellite.category.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      const leftIsIss = left.name === satelliteData.iss?.name ? 1 : 0;
      const rightIsIss = right.name === satelliteData.iss?.name ? 1 : 0;

      if (leftIsIss !== rightIsIss) {
        return rightIsIss - leftIsIss;
      }

      return left.name.localeCompare(right.name);
    });
  const selectedSatellite = satelliteData.satellites.find(
    (satellite) => satellite.name === selectedSatelliteName,
  );
  const categoryCounts = SATELLITE_CATEGORIES.map((category) => ({
    category,
    count: satelliteData.satellites.filter((satellite) => satellite.category === category).length,
  }));
  const status = satelliteData.lastRefresh
    ? `Last refreshed: ${formatTimestamp(satelliteData.lastRefresh)} | Showing ${filteredSatellites.length} / ${satelliteData.totalCount} satellites.`
    : 'Loading satellite positions...';
  const godsEyeSize = 960;
  const godsEyeCenter = godsEyeSize / 2;
  const maxSatelliteRadius = Math.max(
    1.15,
    ...filteredSatellites.map((satellite) => Math.sqrt((satellite.x ** 2) + (satellite.y ** 2))),
  );
  const earthDiskRadius = godsEyeSize * 0.18;
  const maxOrbitRadius = godsEyeSize * 0.46;
  const godsEyePoints = filteredSatellites.map((satellite) => {
    const orbitRadius = Math.sqrt((satellite.x ** 2) + (satellite.y ** 2));
    const scale = orbitRadius / maxSatelliteRadius;

    return {
      ...satellite,
      overheadX: godsEyeCenter + ((satellite.x / maxSatelliteRadius) * maxOrbitRadius),
      overheadY: godsEyeCenter - ((satellite.y / maxSatelliteRadius) * maxOrbitRadius),
      orbitBandRadius: earthDiskRadius + ((maxOrbitRadius - earthDiskRadius) * scale),
    };
  });
  const selectedGodsEyePoint = godsEyePoints.find((satellite) => satellite.name === selectedSatelliteName) ?? null;

  return (
    <div className="app-shell">
      <aside className="control-panel">
        <div>
          <p className="eyebrow">Satellite Tracker</p>
          <h1>Orbital map in React</h1>
          <p className="panel-copy">
            A static React app that computes live positions in the browser from TLE data with no backend required.
          </p>
        </div>

        <section className="panel-section">
          <h2>Data Source</h2>
          <div className="source-card">
            <strong>{sourceSummary}</strong>
            {sourceNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h2>Satellite Filters</h2>
          <div className="checkbox-list">
            {SATELLITE_CATEGORIES.map((category) => (
              <label key={category} className="check-row">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedCategories((current) => [...new Set([...current, category])]);
                    } else {
                      setSelectedCategories((current) => current.filter((value) => value !== category));
                    }
                  }}
                />
                <span>{category}</span>
                <span className="category-count">{categoryCounts.find((item) => item.category === category)?.count ?? 0}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h2>Live Update</h2>
          <label className="check-row">
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
            />
            <span>Enable auto refresh</span>
          </label>

          <div className="radio-list">
            {REFRESH_OPTIONS.map((seconds) => (
              <label key={seconds} className="radio-row">
                <input
                  type="radio"
                  name="refresh-rate"
                  checked={refreshSeconds === seconds}
                  onChange={() => setRefreshSeconds(seconds)}
                />
                <span>Every {seconds} seconds</span>
              </label>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h2>ISS Position</h2>
          <div className="source-card compact">
            {satelliteData.iss ? (
              <>
                <p>{formatCoordinate(satelliteData.iss.latitude, 'N', 'S')}</p>
                <p>{formatCoordinate(satelliteData.iss.longitude, 'E', 'W')}</p>
                <p>{satelliteData.iss.altitudeKm.toFixed(0)} km altitude</p>
              </>
            ) : (
              <p>ISS position unavailable in the current dataset.</p>
            )}
          </div>
        </section>
      </aside>

      <main className="map-panel">
        <div className="toolbar">
          <button className="refresh-button" onClick={handleManualRefresh} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <div className="view-toggle" role="tablist" aria-label="Map view mode">
            <button
              type="button"
              className={`view-toggle-button${viewMode === VIEW_MODES.map ? ' active' : ''}`}
              onClick={() => setViewMode(VIEW_MODES.map)}
            >
              World Map
            </button>
            <button
              type="button"
              className={`view-toggle-button${viewMode === VIEW_MODES.godsEye ? ' active' : ''}`}
              onClick={() => setViewMode(VIEW_MODES.godsEye)}
            >
              God&apos;s Eye
            </button>
          </div>
          <p className="status-text">{status}</p>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="content-grid">
          <div className="map-frame">
            {viewMode === VIEW_MODES.map ? (
              <svg className="world-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="Satellite positions on a world map">
                <defs>
                  <linearGradient id="mapBackground" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#082f49" />
                    <stop offset="100%" stopColor="#020617" />
                  </linearGradient>
                </defs>

                <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} rx="24" className="map-backdrop" />
                {renderGridLines()}
                <line x1="0" y1={MAP_HEIGHT / 2} x2={MAP_WIDTH} y2={MAP_HEIGHT / 2} className="equator-line" />

                {filteredSatellites.map((satellite) => (
                  <circle
                    key={`${satellite.name}-${satellite.category}`}
                    cx={satellite.x}
                    cy={satellite.y}
                    r={satellite.name === satelliteData.iss?.name ? 3.5 : 1.4}
                    fill={CATEGORY_COLORS[satellite.category] ?? CATEGORY_COLORS.Other}
                    opacity={satellite.name === satelliteData.iss?.name ? 1 : 0.82}
                  >
                    <title>
                      {`${satellite.name} | ${satellite.category} | ${formatCoordinate(satellite.latitude, 'N', 'S')} | ${formatCoordinate(satellite.longitude, 'E', 'W')} | ${satellite.altitudeKm.toFixed(0)} km`}
                    </title>
                  </circle>
                ))}

                {selectedSatellite ? (
                  <circle
                    cx={selectedSatellite.x}
                    cy={selectedSatellite.y}
                    r="8"
                    className="selected-ring"
                  />
                ) : null}
              </svg>
            ) : (
              <svg className="world-map gods-eye-map" viewBox={`0 0 ${godsEyeSize} ${godsEyeSize}`} role="img" aria-label="Top-down satellite view over Earth">
                <defs>
                  <radialGradient id="godsEyeBackground" cx="50%" cy="48%" r="65%">
                    <stop offset="0%" stopColor="#12324a" />
                    <stop offset="100%" stopColor="#020617" />
                  </radialGradient>
                  <radialGradient id="earthDiskGradient" cx="45%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#1d4ed8" />
                    <stop offset="100%" stopColor="#0f172a" />
                  </radialGradient>
                </defs>

                <rect x="0" y="0" width={godsEyeSize} height={godsEyeSize} rx="28" className="gods-eye-backdrop" />
                {renderGodsEyeGuides(godsEyeSize, earthDiskRadius, maxOrbitRadius)}
                <circle cx={godsEyeCenter} cy={godsEyeCenter} r={earthDiskRadius} className="earth-disk" />
                <text x={godsEyeCenter} y={godsEyeCenter - earthDiskRadius - 22} textAnchor="middle" className="gods-eye-label">
                  North Pole Overhead View
                </text>

                {godsEyePoints.map((satellite) => (
                  <circle
                    key={`${satellite.name}-${satellite.category}-overhead`}
                    cx={satellite.overheadX}
                    cy={satellite.overheadY}
                    r={satellite.name === satelliteData.iss?.name ? 5 : 2.5}
                    fill={CATEGORY_COLORS[satellite.category] ?? CATEGORY_COLORS.Other}
                    opacity={satellite.name === satelliteData.iss?.name ? 1 : 0.88}
                  >
                    <title>
                      {`${satellite.name} | ${satellite.category} | ${satellite.altitudeKm.toFixed(0)} km altitude | ${formatCoordinate(satellite.latitude, 'N', 'S')} | ${formatCoordinate(satellite.longitude, 'E', 'W')}`}
                    </title>
                  </circle>
                ))}

                {selectedGodsEyePoint ? (
                  <circle
                    cx={selectedGodsEyePoint.overheadX}
                    cy={selectedGodsEyePoint.overheadY}
                    r="10"
                    className="selected-ring"
                  />
                ) : null}
              </svg>
            )}

            <div className="map-legend">
              {SATELLITE_CATEGORIES.filter((category) => selectedCategories.includes(category)).map((category) => (
                <span key={category} className="legend-chip">
                  <span className="legend-swatch" style={{ backgroundColor: CATEGORY_COLORS[category] }} />
                  {category}
                </span>
              ))}
            </div>
          </div>

          <aside className="satellite-sidebar">
            <div className="sidebar-head">
              <div>
                <p className="eyebrow sidebar-eyebrow">Satellite List</p>
                <h2>Loaded Satellites</h2>
              </div>
              <span className="sidebar-count">{listedSatellites.length}</span>
            </div>

            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="satellite-search"
              placeholder="Search by satellite or category"
            />

            <div className="satellite-list" role="list">
              {listedSatellites.map((satellite) => (
                <button
                  key={`${satellite.name}-${satellite.category}-list`}
                  type="button"
                  className={`satellite-item${selectedSatelliteName === satellite.name ? ' active' : ''}`}
                  onClick={() => setSelectedSatelliteName(satellite.name)}
                >
                  <span
                    className="satellite-dot"
                    style={{ backgroundColor: CATEGORY_COLORS[satellite.category] ?? CATEGORY_COLORS.Other }}
                  />
                  <span className="satellite-item-body">
                    <strong>{satellite.name}</strong>
                    <span>{satellite.category}</span>
                    <span>
                      {formatCoordinate(satellite.latitude, 'N', 'S')} | {formatCoordinate(satellite.longitude, 'E', 'W')}
                    </span>
                  </span>
                </button>
              ))}

              {!listedSatellites.length ? (
                <div className="empty-sidebar-state">No satellites match the current search.</div>
              ) : null}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}