import { setWorkerUrl } from 'maplibre-gl';

// Replaced with the worker source by copy-browser-assets.js at build time.
setWorkerUrl(
  URL.createObjectURL(
    new Blob([__MAPLIBRE_WORKER_SOURCE__], { type: 'text/javascript' }),
  ),
);

export * from 'maplibre-gl';
