import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';
import gtfsToHtml from '../dist/index.js';
import { fixtureFiles } from './fixtures/feed.js';

test('agency-wide alerts appear on every route page with maps enabled', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'gtfs-agency-alerts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const feed = join(root, 'feed');
  await mkdir(feed);
  const files = {
    ...fixtureFiles,
    'routes.txt':
      'route_id,route_short_name,route_long_name,route_type\n4,4,Downtown,3\n5,5,Uptown,3\n',
    'trips.txt': fixtureFiles['trips.txt'].replace('4,s,back', '5,s,back'),
  };
  delete files['timetables.txt'];
  delete files['timetable_pages.txt'];
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(feed, name), content);
  }

  const browser = await puppeteer.launch();
  t.after(() => browser.close());
  const outputPath = join(root, 'output');
  await gtfsToHtml({
    agencies: [
      {
        agencyKey: 'test',
        path: feed,
        realtimeAlerts: { url: 'https://example.com/alerts' },
      },
    ],
    showMap: true,
    outputPath,
    verbose: false,
  });
  const pages = (await readdir(outputPath, { recursive: true })).filter(
    (name) => name.endsWith('.html') && !name.endsWith('index.html'),
  );
  assert.equal(pages.length, 2);
  for (const name of pages) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      const originalFetch = window.fetch;
      window.fetch = (url, options) => {
        if (url !== 'https://example.com/alerts') {
          return originalFetch(url, options);
        }
        const alerts = [
          ['Agency closure', { agency_id: 'a' }],
          ['Other agency', { agency_id: 'b' }],
          ['Route 4 only', { agency_id: 'a', route_id: '4' }],
          ['Other stop', { agency_id: 'a', stop_id: 'X' }],
          ['Specific trip', { agency_id: 'a', trip: { trip_id: 'out' } }],
          ['Trams only', { agency_id: 'a', route_type: 0 }],
        ];
        // The bundled writer omits explicit zero values.
        const writeSelector = EntitySelector.write;
        EntitySelector.write = (selector, pbf) => {
          writeSelector(selector, pbf);
          if (selector.route_type === 0) {
            pbf.writeVarintField(3, 0);
          }
        };
        const writer = new Pbf.PbfWriter();
        FeedMessage.write(
          {
            entity: alerts.map(([title, selector]) => ({
              id: title,
              alert: {
                informed_entity: [selector],
                header_text: { translation: [{ text: title }] },
                description_text: { translation: [{ text: 'Details' }] },
              },
            })),
          },
          writer,
        );
        return Promise.resolve(new Response(writer.finish()));
      };
    });
    await page.goto(pathToFileURL(join(outputPath, name)).href, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('.alert-title', { timeout: 5000 });
    const { titles, routeId } = await page.evaluate(() => ({
      titles: [...document.querySelectorAll('.alert-title')].map(
        (el) => el.textContent,
      ),
      routeId: document.querySelector('.timetable').dataset.routeId,
    }));
    assert.deepEqual(
      titles,
      routeId === '4' ? ['Agency closure', 'Route 4 only'] : ['Agency closure'],
    );
    await page.close();
  }
});
