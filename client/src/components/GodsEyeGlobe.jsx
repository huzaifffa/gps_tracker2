import React, { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { CATEGORY_COLORS } from './constants';

function getSatelliteColor(category) {
  return Cesium.Color.fromCssColorString(CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other);
}

function getSatellitePointStyle(satellite, isSelected) {
  return {
    color: getSatelliteColor(satellite.category),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    outlineColor: isSelected ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#020617'),
    outlineWidth: isSelected ? 3 : 1,
    pixelSize: isSelected ? 12 : satellite.category === 'Stations' ? 9 : 6,
  };
}

export default function GodsEyeGlobe({
  filteredSatellites,
  selectedSatellite,
  selectedSatelliteId,
  onSelectSatellite,
  onPlotError,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const clickHandlerRef = useRef(null);
  const previousSelectedIdRef = useRef('');

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) {
      return undefined;
    }

    let disposed = false;

    async function initializeViewer() {
      try {
        const viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          timeline: false,
        });

        if (disposed) {
          viewer.destroy();
          return;
        }

        viewerRef.current = viewer;

        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#020617');
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#01040d');
        viewer.scene.skyBox.show = false;
        viewer.scene.moon.show = false;
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.skyAtmosphere.brightnessShift = -0.2;
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;

        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(
          new Cesium.OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/',
          }),
        );

        clickHandlerRef.current = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandlerRef.current.setInputAction((movement) => {
          const picked = viewer.scene.pick(movement.position);
          const entity = picked?.id;

          if (entity && typeof entity.id === 'string') {
            onSelectSatellite(entity.id);
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        onPlotError('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cesium globe failed to load.';
        onPlotError(message);
      }
    }

    initializeViewer();

    return () => {
      disposed = true;

      if (clickHandlerRef.current) {
        clickHandlerRef.current.destroy();
        clickHandlerRef.current = null;
      }

      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [onPlotError, onSelectSatellite]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    viewer.entities.removeAll();

    for (const satellite of filteredSatellites) {
      const isSelected = satellite.id === selectedSatelliteId;

      viewer.entities.add({
        id: satellite.id,
        name: satellite.name,
        position: Cesium.Cartesian3.fromDegrees(
          satellite.longitude,
          satellite.latitude,
          satellite.altitudeKm * 1000,
        ),
        point: getSatellitePointStyle(satellite, isSelected),
        label: isSelected
          ? {
              backgroundColor: Cesium.Color.fromCssColorString('#020617').withAlpha(0.85),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              fillColor: Cesium.Color.WHITE,
              font: '13px "Segoe UI"',
              pixelOffset: new Cesium.Cartesian2(0, -18),
              showBackground: true,
              style: Cesium.LabelStyle.FILL,
              text: satellite.name,
            }
          : undefined,
      });
    }

    viewer.scene.requestRender();
  }, [filteredSatellites, selectedSatelliteId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selectedSatellite || previousSelectedIdRef.current === selectedSatelliteId) {
      return;
    }

    previousSelectedIdRef.current = selectedSatelliteId;

    const targetEntity = viewer.entities.getById(selectedSatelliteId);
    if (!targetEntity) {
      return;
    }

    viewer.flyTo(targetEntity, {
      duration: 1.25,
      offset: new Cesium.HeadingPitchRange(
        0,
        -Cesium.Math.toRadians(38),
        Math.max(2_000_000, selectedSatellite.altitudeKm * 4000),
      ),
    });
  }, [selectedSatellite, selectedSatelliteId]);

  useEffect(() => {
    if (!selectedSatelliteId) {
      previousSelectedIdRef.current = '';
    }
  }, [selectedSatelliteId]);

  return <div ref={containerRef} className="gods-eye-map" />;
}