import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';

test('vendored MapLibre renders local HTML with its worker and native array properties', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gtfs-maplibre-'));
  const browser = await puppeteer.launch({
    args: ['--enable-unsafe-swiftshader'],
  });
  try {
    const htmlPath = join(directory, 'map.html');
    const scriptUrl = new URL(
      '../dist/browser/maplibre-gl.js',
      import.meta.url,
    );
    await writeFile(
      htmlPath,
      `<!doctype html><meta charset="utf-8"><div id="map" style="width:400px;height:400px"></div><script src="${scriptUrl.href}"></script>`,
    );
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(htmlPath).href);
    assert.deepEqual(errors, []);
    const result = await page.evaluate(async () => {
      const map = new maplibregl.Map({
        container: 'map',
        center: [0, 0],
        zoom: 10,
        style: { version: 8, sources: {}, layers: [] },
      });
      await new Promise((resolve, reject) => {
        map.on('error', (event) => reject(event.error));
        map.on('load', resolve);
      });
      map.addSource('stops', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [0, 0] },
              properties: { route_ids: ['1'], routes: [{ route_id: '1' }] },
            },
          ],
        },
      });
      map.addLayer({ id: 'stops', type: 'circle', source: 'stops' });
      await new Promise((resolve) => map.once('idle', resolve));
      const properties = map.queryRenderedFeatures({ layers: ['stops'] })[0]
        .properties;
      const version = maplibregl.getVersion();
      return { version, properties };
    });
    assert.match(result.version, /^6\./);
    assert.deepEqual(result.properties.route_ids, ['1']);
    assert.deepEqual(result.properties.routes, [{ route_id: '1' }]);
    assert.deepEqual(errors, []);
    await page.pdf({ path: join(directory, 'map.pdf') });
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
