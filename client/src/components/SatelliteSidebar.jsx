import React from 'react';
import { CATEGORY_COLORS } from './constants';
import { formatCoordinate } from './satelliteData';

export default function SatelliteSidebar({
  listedSatellites,
  searchTerm,
  selectedSatelliteId,
  setSearchTerm,
  setSelectedSatelliteId,
}) {
  return (
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
            key={satellite.id}
            type="button"
            className={`satellite-item${selectedSatelliteId === satellite.id ? ' active' : ''}`}
            onClick={() => setSelectedSatelliteId(satellite.id)}
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
  );
}