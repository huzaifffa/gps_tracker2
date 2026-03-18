import React from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import { extractCamera } from './satelliteData';

const Plot = createPlotlyComponent(Plotly);

export default function GodsEyeGlobe({ figure, setGodsEyeCamera, setPlotError }) {
  return (
    <div className="plot-shell">
      <Plot
        data={figure.data}
        layout={figure.layout}
        config={figure.config}
        useResizeHandler
        className="gods-eye-plot"
        style={{ width: '100%', height: '100%' }}
        onError={(nextError) => {
          const message = nextError instanceof Error ? nextError.message : String(nextError);
          setPlotError(message);
        }}
        onRelayout={(event) => {
          const camera = extractCamera(event);
          if (camera) {
            setGodsEyeCamera(camera);
          }
        }}
      />
    </div>
  );
}