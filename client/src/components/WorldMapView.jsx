import React from 'react';
import { CATEGORY_COLORS, MAP_HEIGHT, MAP_WIDTH } from './constants';
import { formatCoordinate, renderGridLines } from './satelliteData';

export default function WorldMapView({ filteredSatellites, landData, satelliteData, selectedSatellite }) {
  return (
    <svg className="world-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="Satellite positions on a world map">
      <defs>
        <linearGradient id="mapBackground" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#082f49" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} rx="24" className="map-backdrop" />
      {landData.mapPaths.map((pathData, index) => (
        <path key={`world-path-${index}`} d={pathData} className="world-basemap" />
      ))}
      {renderGridLines().map((line) => (
        <line
          key={line.key}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          className="grid-line"
        />
      ))}
      <line x1="0" y1={MAP_HEIGHT / 2} x2={MAP_WIDTH} y2={MAP_HEIGHT / 2} className="equator-line" />

      {filteredSatellites.map((satellite) => (
        <circle
          key={satellite.id}
          cx={satellite.mapX}
          cy={satellite.mapY}
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
          cx={selectedSatellite.mapX}
          cy={selectedSatellite.mapY}
          r="8"
          className="selected-ring"
        />
      ) : null}
    </svg>
  );
}