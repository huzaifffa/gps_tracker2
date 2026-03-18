import React from 'react';
import { REFRESH_OPTIONS, SATELLITE_CATEGORIES } from './constants';
import { formatCoordinate } from './satelliteData';

export default function ControlPanel({
  autoRefreshEnabled,
  categoryCounts,
  refreshSeconds,
  satelliteData,
  selectedCategories,
  setAutoRefreshEnabled,
  setRefreshSeconds,
  setSelectedCategories,
  sourceNotes,
  sourceSummary,
}) {
  return (
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
  );
}