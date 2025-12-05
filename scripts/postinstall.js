#!/usr/bin/env node

/**
 * Postinstall Script - Copy Frontend Libraries
 *
 * This script copies browser-compatible JavaScript and CSS files from node_modules
 * into the dist/frontend_libraries directory. These files are needed for the HTML
 * timetables to work in browsers (for maps, geocoding, protocol buffers, etc.).
 *
 * Why this is needed:
 * - The generated HTML files reference these libraries directly
 * - They must be bundled with the package so they're available when installed as a dependency
 * - npm/pnpm may hoist dependencies, so we can't rely on a fixed node_modules path
 *
 * This script handles multiple installation scenarios:
 * - Direct installation (npm install in this package)
 * - Installed as a dependency (node_modules may be hoisted to parent)
 * - Works with both npm and pnpm
 */

import { mkdir, copyFile } from 'node:fs/promises';
import { accessSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const targetDir = join(__dirname, '../dist/frontend_libraries');

const filesToCopy = [
  {
    package: 'pbf',
    source: 'dist/pbf.js',
    target: 'pbf.js',
  },
  {
    package: 'gtfs-realtime-pbf-js-module',
    source: 'gtfs-realtime.browser.proto.js',
    target: 'gtfs-realtime.browser.proto.js',
  },
  {
    package: 'anchorme',
    source: 'dist/browser/anchorme.min.js',
    target: 'anchorme.min.js',
  },
  {
    package: 'maplibre-gl',
    source: 'dist/maplibre-gl.js',
    target: 'maplibre-gl.js',
  },
  {
    package: 'maplibre-gl',
    source: 'dist/maplibre-gl.css',
    target: 'maplibre-gl.css',
  },
  {
    package: '@maplibre/maplibre-gl-geocoder',
    source: 'dist/maplibre-gl-geocoder.js',
    target: 'maplibre-gl-geocoder.js',
  },
  {
    package: '@maplibre/maplibre-gl-geocoder',
    source: 'dist/maplibre-gl-geocoder.css',
    target: 'maplibre-gl-geocoder.css',
  },
];

function resolvePackagePath(packageName) {
  const possiblePaths = [
    // Direct dependency (when running in development or as root package)
    join(__dirname, '../node_modules', packageName),
    // Hoisted dependency (when installed as a dependency in another project)
    join(__dirname, '../../', packageName),
    // Deeply nested
    join(__dirname, '../../../', packageName),
  ];

  for (const path of possiblePaths) {
    try {
      accessSync(path);
      return path;
    } catch {
      continue;
    }
  }

  throw new Error(`Could not resolve package: ${packageName}`);
}

async function copyFrontendLibraries() {
  try {
    await mkdir(targetDir, { recursive: true });

    for (const file of filesToCopy) {
      try {
        const packagePath = resolvePackagePath(file.package);
        const sourcePath = join(packagePath, file.source);
        const targetPath = join(targetDir, file.target);

        await copyFile(sourcePath, targetPath);
      } catch (error) {
        console.error(
          `Failed to copy ${file.package}/${file.source}:`,
          error.message,
        );
        // Continue with other files even if one fails
      }
    }
  } catch (error) {
    console.error('Error copying frontend libraries:', error);
    process.exit(1);
  }
}

copyFrontendLibraries();
