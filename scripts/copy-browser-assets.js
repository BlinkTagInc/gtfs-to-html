#!/usr/bin/env node

import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'tsdown';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const targetDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../dist/browser',
);

const filesToCopy = [
  { package: 'pbf', source: 'dist/pbf.js', target: 'pbf.js' },
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

const licenseFileNames = ['LICENSE', 'LICENSE.txt', 'LICENSE.md'];

function resolveEntryPoint(packageName) {
  // Match v3: support CommonJS packages and ESM-only packages such as MapLibre 6.
  try {
    return require.resolve(packageName);
  } catch {
    return fileURLToPath(import.meta.resolve(packageName));
  }
}

function resolvePackageRoot(packageName) {
  // Walk up from the resolved entry point to find the package root. We can't
  // use require.resolve(packageName + '/package.json') because some packages
  // (e.g. pbf) don't expose ./package.json in their exports field. We also
  // can't stop at the first package.json found because some packages (e.g.
  // maplibre-gl) place a stub package.json in their dist/ subdirectory.
  let dir = dirname(resolveEntryPoint(packageName));
  while (true) {
    const pkgJsonPath = join(dir, 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.name === packageName && pkg.version) {
        return dir;
      }
    } catch {
      // no package.json here, keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not find package root for ${packageName}`);
    }
    dir = parent;
  }
}

async function readLicenseFile(packageRoot) {
  for (const fileName of licenseFileNames) {
    try {
      return await readFile(join(packageRoot, fileName), 'utf8');
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function generateThirdPartyLicenses(packageNames) {
  const sections = await Promise.all(
    packageNames.map(async (packageName) => {
      const packageRoot = resolvePackageRoot(packageName);
      const pkg = JSON.parse(
        await readFile(join(packageRoot, 'package.json'), 'utf8'),
      );
      const licenseText = await readLicenseFile(packageRoot);

      if (!licenseText) {
        throw new Error(
          `No license file found for ${packageName}. Checked: ${licenseFileNames.join(', ')}`,
        );
      }

      return `${packageName} ${pkg.version}\n${'─'.repeat(40)}\nLicense: ${pkg.license}\n\n${licenseText.trim()}\n`;
    }),
  );

  const header =
    `Third-Party Licenses\n${'═'.repeat(40)}\n` +
    `This file contains license notices for open-source libraries vendored\n` +
    `in dist/browser by gtfs-to-html (https://gtfstohtml.com).\n`;

  return header + '\n' + sections.join('\n');
}

async function copyBrowserAssets() {
  await mkdir(targetDir, { recursive: true });

  const packageRoots = new Map(
    [...new Set(filesToCopy.map((f) => f.package))].map((pkg) => [
      pkg,
      resolvePackageRoot(pkg),
    ]),
  );

  await Promise.all(
    filesToCopy.map(({ package: pkg, source, target }) =>
      copyFile(join(packageRoots.get(pkg), source), join(targetDir, target)),
    ),
  );

  // Keep classic script loading (including file:// PDF rendering) while using
  // MapLibre's ESM distribution. Embed its self-contained module worker so the
  // generated pages do not need an HTTP server or a separate worker request.
  await build({
    config: false,
    entry: {
      'maplibre-gl': fileURLToPath(
        new URL('./maplibre-browser.js', import.meta.url),
      ),
    },
    outDir: targetDir,
    format: 'iife',
    globalName: 'maplibregl',
    platform: 'browser',
    target: 'es2022',
    clean: false,
    dts: false,
    sourcemap: true,
    minify: true,
    deps: { alwaysBundle: ['maplibre-gl'], onlyBundle: ['maplibre-gl'] },
    define: {
      'import.meta.url': 'location.href',
      __MAPLIBRE_WORKER_SOURCE__: JSON.stringify(
        await readFile(
          join(packageRoots.get('maplibre-gl'), 'dist/maplibre-gl-worker.mjs'),
          'utf8',
        ),
      ),
    },
    outputOptions: { entryFileNames: '[name].js' },
  });

  const licenseContent = await generateThirdPartyLicenses([
    ...packageRoots.keys(),
  ]);
  await writeFile(join(targetDir, 'THIRD_PARTY_LICENSES.txt'), licenseContent);
}

copyBrowserAssets().catch((error) => {
  console.error('Error copying browser assets:', error.message);
  process.exit(1);
});
