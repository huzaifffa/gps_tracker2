import React, { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { CATEGORY_COLORS, MAPLIBRE_GLOBE_STYLE_URL } from './constants';
import { formatCoordinate } from './satelliteData';

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };

function buildSatelliteCollection(satellites) {
  return {
    type: 'FeatureCollection',
    features: satellites.map((satellite) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [satellite.longitude, satellite.latitude],
      },
      properties: {
        altitudeKm: satellite.altitudeKm,
        category: satellite.category,
        color: CATEGORY_COLORS[satellite.category] ?? CATEGORY_COLORS.Other,
        id: satellite.id,
        latitudeLabel: formatCoordinate(satellite.latitude, 'N', 'S'),
        longitudeLabel: formatCoordinate(satellite.longitude, 'E', 'W'),
        name: satellite.name,
        size: satellite.category === 'Stations' ? 7 : 5,
      },
    })),
  };
}

function buildSelectedCollection(selectedSatellite) {
  if (!selectedSatellite) {
    return EMPTY_FEATURE_COLLECTION;
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [selectedSatellite.longitude, selectedSatellite.latitude],
        },
        properties: {
          id: selectedSatellite.id,
        },
      },
    ],
  };
}

function buildPopupContent(properties) {
  const container = document.createElement('div');

  const title = document.createElement('strong');
  title.textContent = properties?.name ?? 'Satellite';
  container.appendChild(title);

  const category = document.createElement('div');
  category.textContent = properties?.category ?? '';
  container.appendChild(category);

  const coordinates = document.createElement('div');
  coordinates.textContent = `${properties?.latitudeLabel ?? ''} | ${properties?.longitudeLabel ?? ''}`;
  container.appendChild(coordinates);

  return container;
}

function ensureSourcesAndLayers(map) {
  if (!map.getSource('satellites')) {
    map.addSource('satellites', {
      type: 'geojson',
      data: EMPTY_FEATURE_COLLECTION,
    });
  }

  if (!map.getLayer('satellite-points')) {
    map.addLayer({
      id: 'satellite-points',
      type: 'circle',
      source: 'satellites',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.92,
        'circle-radius': ['get', 'size'],
        'circle-stroke-color': 'rgba(2, 6, 23, 0.92)',
        'circle-stroke-width': 1.25,
      },
    });
  }

  if (!map.getSource('selected-satellite')) {
    map.addSource('selected-satellite', {
      type: 'geojson',
      data: EMPTY_FEATURE_COLLECTION,
    });
  }

  if (!map.getLayer('selected-satellite-ring')) {
    map.addLayer({
      id: 'selected-satellite-ring',
      type: 'circle',
      source: 'selected-satellite',
      paint: {
        'circle-color': 'rgba(255, 255, 255, 0.08)',
        'circle-radius': 12,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  }
}

export default function GodsEyeGlobe({
  filteredSatellites,
  selectedSatellite,
  selectedSatelliteId,
  onSelectSatellite,
  onPlotError,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const previousSelectedIdRef = useRef('');
  const satelliteCollectionRef = useRef(EMPTY_FEATURE_COLLECTION);
  const selectedCollectionRef = useRef(EMPTY_FEATURE_COLLECTION);

  const satelliteCollection = useMemo(
    () => buildSatelliteCollection(filteredSatellites),
    [filteredSatellites],
  );

  const selectedCollection = useMemo(
    () => buildSelectedCollection(selectedSatellite),
    [selectedSatellite],
  );

  satelliteCollectionRef.current = satelliteCollection;
  selectedCollectionRef.current = selectedCollection;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    const map = new maplibregl.Map({
      attributionControl: true,
      container: containerRef.current,
      center: [0, 18],
      pitch: 0,
      style: MAPLIBRE_GLOBE_STYLE_URL,
      zoom: 0.9,
    });

    mapRef.current = map;

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
    });

    map.on('load', () => {
      map.setProjection({ type: 'globe' });
      map.setFog({
        color: 'rgb(6, 15, 30)',
        'high-color': 'rgb(22, 53, 92)',
        'space-color': 'rgb(1, 4, 13)',
        'star-intensity': 0.15,
      });
      ensureSourcesAndLayers(map);
      map.getSource('satellites')?.setData(satelliteCollectionRef.current);
      map.getSource('selected-satellite')?.setData(selectedCollectionRef.current);

      map.on('click', 'satellite-points', (event) => {
        const feature = event.features?.[0];
        const satelliteId = feature?.properties?.id;

        if (typeof satelliteId === 'string' && satelliteId) {
          onSelectSatellite(satelliteId);
        }
      });

      map.on('mouseenter', 'satellite-points', (event) => {
        map.getCanvas().style.cursor = 'pointer';

        const feature = event.features?.[0];
        if (!feature || !popupRef.current) {
          return;
        }

        const coordinates = feature.geometry?.coordinates;
        if (!Array.isArray(coordinates)) {
          return;
        }

        popupRef.current
          .setLngLat(coordinates)
          .setDOMContent(buildPopupContent(feature.properties))
          .addTo(map);
      });

      map.on('mouseleave', 'satellite-points', () => {
        map.getCanvas().style.cursor = '';
        popupRef.current?.remove();
      });

      onPlotError('');
    });

    map.on('error', (event) => {
      const message = event?.error?.message ?? 'MapLibre globe failed to load.';
      onPlotError(message);
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [onPlotError, onSelectSatellite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    ensureSourcesAndLayers(map);
    map.getSource('satellites')?.setData(satelliteCollection);
    map.getSource('selected-satellite')?.setData(selectedCollection);
  }, [satelliteCollection, selectedCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedSatellite || previousSelectedIdRef.current === selectedSatelliteId) {
      return;
    }

    previousSelectedIdRef.current = selectedSatelliteId;
    map.easeTo({
      center: [selectedSatellite.longitude, selectedSatellite.latitude],
      duration: 1200,
      zoom: Math.max(map.getZoom(), 1.6),
    });
  }, [selectedSatellite, selectedSatelliteId]);

  useEffect(() => {
    if (!selectedSatelliteId) {
      previousSelectedIdRef.current = '';
    }
  }, [selectedSatelliteId]);

  return <div ref={containerRef} className="gods-eye-map" />;
}