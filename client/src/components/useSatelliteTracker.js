import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CAMERA,
  REFRESH_OPTIONS,
  SATELLITE_CATEGORIES,
  VIEW_MODES,
} from './constants';
import {
  buildGodsEyeFigure,
  buildSatelliteSnapshot,
  formatTimestamp,
  loadLandData,
  loadTleFeeds,
} from './satelliteData';

export function useSatelliteTracker() {
  const [selectedCategories, setSelectedCategories] = useState(SATELLITE_CATEGORIES);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(REFRESH_OPTIONS[1]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSatelliteId, setSelectedSatelliteId] = useState('');
  const [viewMode, setViewMode] = useState(VIEW_MODES.map);
  const [feeds, setFeeds] = useState(null);
  const [landData, setLandData] = useState({ sphere: { x: [], y: [], z: [] }, mapPaths: [] });
  const [godsEyeCamera, setGodsEyeCamera] = useState(DEFAULT_CAMERA);
  const [plotError, setPlotError] = useState('');
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
        const [nextFeeds, nextLandData] = await Promise.all([
          loadTleFeeds(),
          loadLandData(),
        ]);

        if (cancelled) {
          return;
        }

        const nextData = buildSatelliteSnapshot(nextFeeds, new Date());
        setFeeds(nextFeeds);
        setLandData(nextLandData);
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
      return undefined;
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

  const filteredSatellites = useMemo(
    () => satelliteData.satellites.filter((satellite) => selectedCategories.includes(satellite.category)),
    [satelliteData.satellites, selectedCategories],
  );

  const listedSatellites = useMemo(
    () => satelliteData.satellites
      .filter((satellite) => {
        if (!searchTerm.trim()) {
          return true;
        }

        const query = searchTerm.trim().toLowerCase();
        return satellite.name.toLowerCase().includes(query) || satellite.category.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftIsIss = left.name === satelliteData.iss?.name ? 1 : 0;
        const rightIsIss = right.name === satelliteData.iss?.name ? 1 : 0;

        if (leftIsIss !== rightIsIss) {
          return rightIsIss - leftIsIss;
        }

        return left.name.localeCompare(right.name);
      }),
    [searchTerm, satelliteData.iss?.name, satelliteData.satellites],
  );

  const selectedSatellite = useMemo(
    () => satelliteData.satellites.find((satellite) => satellite.id === selectedSatelliteId) ?? null,
    [satelliteData.satellites, selectedSatelliteId],
  );

  const categoryCounts = useMemo(
    () => SATELLITE_CATEGORIES.map((category) => ({
      category,
      count: satelliteData.satellites.filter((satellite) => satellite.category === category).length,
    })),
    [satelliteData.satellites],
  );

  const status = satelliteData.lastRefresh
    ? `Last refreshed: ${formatTimestamp(satelliteData.lastRefresh)} | Showing ${filteredSatellites.length} / ${satelliteData.totalCount} satellites.`
    : 'Loading satellite positions...';

  const godsEyeFigure = useMemo(
    () => buildGodsEyeFigure(selectedCategories, satelliteData, landData, godsEyeCamera, selectedSatelliteId),
    [godsEyeCamera, landData, satelliteData, selectedCategories, selectedSatelliteId],
  );

  return {
    state: {
      autoRefreshEnabled,
      categoryCounts,
      error,
      filteredSatellites,
      godsEyeFigure,
      landData,
      listedSatellites,
      loading,
      plotError,
      refreshSeconds,
      searchTerm,
      selectedCategories,
      selectedSatellite,
      selectedSatelliteId,
      sourceNotes,
      sourceSummary,
      status,
      satelliteData,
      viewMode,
    },
    actions: {
      handleManualRefresh,
      setAutoRefreshEnabled,
      setGodsEyeCamera,
      setPlotError,
      setRefreshSeconds,
      setSearchTerm,
      setSelectedCategories,
      setSelectedSatelliteId,
      setViewMode,
    },
  };
}