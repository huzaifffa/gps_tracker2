import React from 'react';
import { VIEW_MODES } from './constants';

export default function Toolbar({ handleManualRefresh, loading, status, viewMode, setViewMode }) {
  return (
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
  );
}