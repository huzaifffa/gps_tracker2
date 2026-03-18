import React from 'react';
import ControlPanel from './components/ControlPanel';
import GodsEyeGlobe from './components/GodsEyeGlobe';
import SatelliteSidebar from './components/SatelliteSidebar';
import Toolbar from './components/Toolbar';
import WorldMapView from './components/WorldMapView';
import { CATEGORY_COLORS, SATELLITE_CATEGORIES, VIEW_MODES } from './components/constants';
import { useSatelliteTracker } from './components/useSatelliteTracker';

export default function App() {
  const { state, actions } = useSatelliteTracker();
  const {
    autoRefreshEnabled,
    categoryCounts,
    error,
    filteredSatellites,
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
  } = state;

  const {
    handleManualRefresh,
    setAutoRefreshEnabled,
    setPlotError,
    setRefreshSeconds,
    setSearchTerm,
    setSelectedCategories,
    setSelectedSatelliteId,
    setViewMode,
  } = actions;

  return (
    <div className="app-shell">
      <ControlPanel
        autoRefreshEnabled={autoRefreshEnabled}
        categoryCounts={categoryCounts}
        refreshSeconds={refreshSeconds}
        satelliteData={satelliteData}
        selectedCategories={selectedCategories}
        setAutoRefreshEnabled={setAutoRefreshEnabled}
        setRefreshSeconds={setRefreshSeconds}
        setSelectedCategories={setSelectedCategories}
        sourceNotes={sourceNotes}
        sourceSummary={sourceSummary}
      />

      <main className="map-panel">
        <Toolbar
          handleManualRefresh={handleManualRefresh}
          loading={loading}
          setViewMode={setViewMode}
          status={status}
          viewMode={viewMode}
        />

        {error ? <div className="error-banner">{error}</div> : null}
        {plotError ? <div className="error-banner">Plot error: {plotError}</div> : null}

        <div className="content-grid">
          <div className="map-frame">
            {viewMode === VIEW_MODES.map ? (
              <WorldMapView
                filteredSatellites={filteredSatellites}
                landData={landData}
                satelliteData={satelliteData}
                selectedSatellite={selectedSatellite}
              />
            ) : (
              <GodsEyeGlobe
                filteredSatellites={filteredSatellites}
                selectedSatellite={selectedSatellite}
                selectedSatelliteId={selectedSatelliteId}
                onSelectSatellite={setSelectedSatelliteId}
                onPlotError={setPlotError}
              />
            )}

            <div className="legend-row">
              {SATELLITE_CATEGORIES.filter((category) => selectedCategories.includes(category)).map((category) => (
                <div className="legend-item" key={category}>
                  <span
                    className="legend-swatch"
                    style={{ backgroundColor: CATEGORY_COLORS[category] }}
                  />
                  <span>{category}</span>
                </div>
              ))}
            </div>
          </div>

          <SatelliteSidebar
            listedSatellites={listedSatellites}
            searchTerm={searchTerm}
            selectedSatelliteId={selectedSatelliteId}
            setSearchTerm={setSearchTerm}
            setSelectedSatelliteId={setSelectedSatelliteId}
          />
        </div>

        {selectedSatellite ? (
          <footer className="selected-footer">
            <div>
              <strong>{selectedSatellite.name}</strong>
              <span>{selectedSatellite.category}</span>
            </div>
            <div>
              Lat {selectedSatellite.degreesLat.toFixed(2)}°, Lon {selectedSatellite.degreesLong.toFixed(2)}°, Alt{' '}
              {selectedSatellite.altitudeKm.toFixed(0)} km
            </div>
          </footer>
        ) : (
          <footer className="selected-footer selected-footer--empty">
            Select a satellite to inspect its live position.
          </footer>
        )}
      </main>
    </div>
  );
}

