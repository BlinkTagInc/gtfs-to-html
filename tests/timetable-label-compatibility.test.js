import assert from 'node:assert/strict';
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
import test from 'node:test';

import gtfsToHtml from '../dist/index.js';

// Build first: pnpm run build
test('GTFS generation supports both legacy templates and translated Pug labels', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gtfs-to-html-compatibility-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const feed = join(root, 'feed');
  const templates = join(root, 'templates');
  mkdirSync(feed);
  mkdirSync(templates);
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
  writeFileSync(join(templates, 'overview.pug'), 'p Overview');
  const legacyTemplate =
    'if timetablePageHasDifferentLabels(timetablePage)\n  each timetable in timetablePage.consolidatedTimetables\n    p= timetable.timetable_label';
  writeFileSync(join(templates, 'timetablepage.pug'), legacyTemplate);
  const config = {
    agencies: [{ agencyKey: 'test', path: feed }],
    sqlitePath: join(root, 'gtfs.db'),
    outputPath: join(root, 'legacy'),
    templatePath: templates,
    noHead: true,
    verbose: false,
    logFunction: () => {},
  };
  await gtfsToHtml(config);

  function readTimetable(outputPath) {
    const page = readdirSync(outputPath, { recursive: true }).find(
      (name) => name.endsWith('.html') && name !== 'index.html',
    );
    assert.ok(page, 'A timetable page was generated');
    return readFileSync(join(outputPath, page), 'utf8');
  }

  const legacyHtml = readTimetable(config.outputPath);
  assert.ok(legacyHtml.includes('<p>Route 4 - Alpha to Beta</p>'), legacyHtml);
  assert.ok(legacyHtml.includes('<p>Express</p>'));

  const helpers = readFileSync(
    new URL('../views/default/formatting_functions.pug', import.meta.url),
    'utf8',
  )
    .replace('Route ${', 'Ligne ${')
    .replaceAll(' to ${', ' vers ${');
  writeFileSync(join(templates, 'formatting_functions.pug'), helpers);
  writeFileSync(
    join(templates, 'timetablepage.pug'),
    `include formatting_functions.pug\n${legacyTemplate.replace('p= timetable.timetable_label', 'p= formatTimetableLabel(timetable)')}`,
  );
  const translatedOutput = join(root, 'translated');
  await gtfsToHtml({
    ...config,
    outputPath: translatedOutput,
    skipImport: true,
  });
  const translatedHtml = readTimetable(translatedOutput);
  assert.ok(translatedHtml.includes('<p>Ligne 4 - Alpha vers Beta</p>'));
  assert.ok(translatedHtml.includes('<p>Express</p>'));
});
