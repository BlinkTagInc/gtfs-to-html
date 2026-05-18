#!/usr/bin/env node

import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
    source: 'dist/maplibre-gl.js',
    target: 'maplibre-gl.js',
  },
  {
    package: 'maplibre-gl',
    source: 'dist/maplibre-gl.js.map',
    target: 'maplibre-gl.js.map',
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

function resolvePackageRoot(packageName) {
  // Walk up from the resolved entry point to find the package root. We can't
  // use require.resolve(packageName + '/package.json') because some packages
  // (e.g. pbf) don't expose ./package.json in their exports field. We also
  // can't stop at the first package.json found because some packages (e.g.
  // maplibre-gl) place a stub package.json in their dist/ subdirectory.
  let dir = dirname(require.resolve(packageName));
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

  const licenseContent = await generateThirdPartyLicenses([
    ...packageRoots.keys(),
  ]);
  await writeFile(join(targetDir, 'THIRD_PARTY_LICENSES.txt'), licenseContent);
}

copyBrowserAssets().catch((error) => {
  console.error('Error copying browser assets:', error.message);
  process.exit(1);
});
