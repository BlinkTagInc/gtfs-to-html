import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';
import gtfsToHtml from '../dist/index.js';
import { fixtureFiles } from './fixtures/feed.js';

test('alerts match all selector fields on the same timetable service', async (t) => {
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
      window.alertResponseStatus = 503;
      window.fetch = (url, options) => {
        if (url !== 'https://example.com/alerts') {
          return originalFetch(url, options);
        }
        if (window.alertResponseStatus !== 200) {
          return Promise.resolve(
            new Response(null, { status: window.alertResponseStatus }),
          );
        }
        const alerts = [
          ['Agency closure', { agency_id: 'a' }],
          ['Other agency', { agency_id: 'b' }],
          ['Route 4 only', { agency_id: 'a', route_id: '4' }],
          ['Other stop', { agency_id: 'a', stop_id: 'X' }],
          ['Specific trip', { agency_id: 'a', trip: { trip_id: 'out' } }],
          ['Unresolved trip', { trip: { route_id: '4' } }],
          ['Inbound trip', { trip: { trip_id: 'back' } }],
          ['Shared stop on Route 4', { route_id: '4', stop_id: 'B' }],
          ['Unknown stop on Route 4', { route_id: '4', stop_id: 'X' }],
          ['Wrong agency on Route 4', { agency_id: 'b', route_id: '4' }],
          ['Direction zero', { route_id: '4', direction_id: 0 }],
          ['Wrong direction', { route_id: '5', direction_id: 0 }],
          ['Buses only', { route_type: 3 }],
          ['Either route', { route_id: '4' }, { trip: { trip_id: 'back' } }],
          ['Trams only', { agency_id: 'a', route_type: 0 }],
        ];
        // The bundled writer omits explicit zero values.
        const writeSelector = EntitySelector.write;
        EntitySelector.write = (selector, pbf) => {
          writeSelector(selector, pbf);
          if (selector.direction_id !== undefined) {
            pbf.writeVarintField(6, selector.direction_id);
          }
          if (selector.route_type === 0) {
            pbf.writeVarintField(3, 0);
          }
        };
        const writer = new Pbf.PbfWriter();
        FeedMessage.write(
          {
            header: { gtfs_realtime_version: '2.0' },
            entity: (window.emptyAlertFeed ? [] : alerts).map(
              ([title, ...selectors]) => ({
                id: title,
                alert: {
                  informed_entity: selectors,
                  header_text: {
                    translation: [
                      {
                        text:
                          window.updatedBusAlert && title === 'Buses only'
                            ? 'Updated bus notice'
                            : title,
                      },
                    ],
                  },
                  url: {
                    translation: [{ text: 'https://example.test/details' }],
                  },
                  description_text: { translation: [{ text: 'Details' }] },
                },
              }),
            ),
          },
          writer,
        );
        return Promise.resolve(new Response(writer.finish()));
      };
    });
    await page.goto(pathToFileURL(join(outputPath, name)).href, {
      waitUntil: 'domcontentloaded',
    });
    const status = () =>
      document.querySelector('.timetable-alert-empty').textContent;
    await page.waitForFunction(
      () =>
        document.querySelector('.timetable-alert-empty').textContent ===
        'Service alerts are temporarily unavailable.',
    );
    await page.evaluate(async () => {
      window.alertResponseStatus = 200;
      await updateAlerts();
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
      routeId === '4'
        ? [
            'Agency closure',
            'Route 4 only',
            'Specific trip',
            'Shared stop on Route 4',
            'Direction zero',
            'Buses only',
            'Either route',
          ]
        : ['Agency closure', 'Inbound trip', 'Buses only', 'Either route'],
    );
    // Tab onto the second alert's link, then refresh with identical data
    // and again with a change to a different card.
    await page.focus('.alert-more-info');
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(async () => {
        const link = document.activeElement;
        if (link !== document.querySelectorAll('.alert-more-info')[1]) {
          return false;
        }
        await updateAlerts();
        window.updatedBusAlert = true;
        await updateAlerts();
        return link === document.activeElement && link.isConnected;
      }),
      true,
    );
    assert.ok(
      await page.evaluate(() =>
        [...document.querySelectorAll('.alert-title')].some(
          (el) => el.textContent === 'Updated bus notice',
        ),
      ),
    );
    await page.evaluate(async () => {
      window.alertResponseStatus = 503;
      await updateAlerts();
    });
    assert.match(
      await page.evaluate(status),
      /temporarily unavailable.*Last checked:/,
    );
    assert.deepEqual(
      await page.$$eval('.alert-title', (elements) =>
        elements.map((el) => el.textContent),
      ),
      titles.map((title) =>
        title === 'Buses only' ? 'Updated bus notice' : title,
      ),
    );
    await page.evaluate(async () => {
      window.alertResponseStatus = 200;
      window.emptyAlertFeed = true;
      await updateAlerts();
    });
    assert.equal(
      await page.evaluate(status),
      'There are no service alerts at this time.',
    );
    assert.equal(await page.$('.alert-title'), null);
    await page.close();
  }
});
