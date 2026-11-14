import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Set GTFS_TO_HTML_PACKAGE_ROOT to exercise an installed npm tarball.
// Also set GTFS_TO_HTML_BIN to test its CLI from an unrelated working directory.
const packageRoot = process.env.GTFS_TO_HTML_PACKAGE_ROOT;
const entry = packageRoot
  ? pathToFileURL(join(packageRoot, 'dist/index.js'))
  : new URL('../dist/index.js', import.meta.url);
const { default: gtfsToHtml } = await import(entry.href);

test('full HTML exports copy and refresh the packaged MapLibre assets', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gtfs-map-assets-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const feed = join(root, 'feed');
  mkdirSync(feed);
  const files = {
    'timetable_pages.txt':
      'timetable_page_id,timetable_page_label,filename\npage,Downtown,page.html\n',
    'agency.txt':
      'agency_id,agency_name,agency_url,agency_timezone\na,Test Transit,https://example.com,America/Los_Angeles\n',
    'routes.txt':
      'route_id,agency_id,route_short_name,route_long_name,route_type\n4,a,4,Downtown,3\n',
    'stops.txt':
      'stop_id,stop_name,stop_lat,stop_lon\nA,Alpha,37,-122\nB,Beta,37.01,-122.01\n',
    'trips.txt':
      'route_id,service_id,trip_id,direction_id\n4,s,out,0\n4,s,back,1\n',
    'stop_times.txt':
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nout,09:00:00,09:00:00,A,1\nout,09:10:00,09:10:00,B,2\nback,10:00:00,10:00:00,B,1\nback,10:10:00,10:10:00,A,2\n',
    'calendar.txt':
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,1,1,20260101,20261231\n',
    'timetables.txt':
      'timetable_id,route_id,direction_id,start_date,end_date,monday,tuesday,wednesday,thursday,friday,saturday,sunday,timetable_label,timetable_page_id\nout,4,0,20260101,20261231,1,1,1,1,1,1,1,,page\nback,4,1,20260101,20261231,1,1,1,1,1,1,1,Express,page\n',
  };
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(feed, name), content);
  }
  const outputPath = join(root, 'output');
  const config = {
    agencies: [{ agencyKey: 'test', path: feed }],
    sqlitePath: join(root, 'gtfs.db'),
    outputPath,
    showMap: true,
    verbose: false,
    logFunction: () => {},
  };
  const assets = [
    'js/maplibre-gl.js',
    'js/maplibre-gl.js.map',
    'css/maplibre-gl.css',
    'js/maplibre-gl-geocoder.js',
    'css/maplibre-gl-geocoder.css',
  ];
  for (let run = 0; run < 2; run += 1) {
    const runConfig = { ...config, skipImport: run > 0 };
    if (process.env.GTFS_TO_HTML_BIN) {
      const configPath = join(root, 'config.json');
      writeFileSync(configPath, JSON.stringify(runConfig));
      execFileSync(process.env.GTFS_TO_HTML_BIN, ['--configPath', configPath], {
        cwd: root,
        stdio: 'pipe',
      });
    } else {
      await gtfsToHtml(runConfig);
    }
    for (const asset of assets) {
      const name = asset.split('/').at(-1);
      const packagedFile = new URL(`./browser/${name}`, entry);
      assert.deepEqual(
        readFileSync(join(outputPath, asset)),
        readFileSync(packagedFile),
      );
    }
    const page = readdirSync(outputPath, { recursive: true }).find(
      (name) => name.endsWith('.html') && name !== 'index.html',
    );
    assert.ok(page, 'A timetable page was generated');
    const html = readFileSync(join(outputPath, page), 'utf8');
    assert.ok(html.includes('js/maplibre-gl.js'));
    assert.ok(html.includes('css/maplibre-gl.css'));
    if (run === 0) {
      for (const asset of assets) {
        writeFileSync(join(outputPath, asset), 'stale asset');
      }
    }
  }
});
