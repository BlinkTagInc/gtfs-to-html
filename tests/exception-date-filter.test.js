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

const fixtureFiles = {
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

function setup(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gtfs-html-integration-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const feed = join(root, 'feed');
  const templates = join(root, 'templates');
  mkdirSync(feed);
  mkdirSync(templates);
  for (const [name, content] of Object.entries({
    ...fixtureFiles,
    ...overrides,
  })) {
    if (content !== null) {
      writeFileSync(join(feed, name), content);
    }
  }
  writeFileSync(
    join(templates, 'overview.pug'),
    '!= JSON.stringify({agencies,geojson})',
  );
  writeFileSync(
    join(templates, 'timetablepage.pug'),
    '!= JSON.stringify(timetablePage)',
  );
  return {
    root,
    feed,
    config: {
      agencies: [{ agencyKey: 'test', path: feed }],
      templatePath: templates,
      outputPath: join(root, 'output'),
      noHead: true,
      verbose: false,
      showMap: false,
    },
  };
}

function pages(output) {
  return readdirSync(output, { recursive: true })
    .filter((name) => name.endsWith('.html') && !name.endsWith('index.html'))
    .map((name) => JSON.parse(readFileSync(join(output, name), 'utf8')));
}

test('automatic timetables filter calendar-only service additions by the configured date range', async (t) => {
  const { config } = setup(t, {
    'timetables.txt': null,
    'timetable_pages.txt': null,
    'calendar.txt': null,
    'calendar_dates.txt':
      'service_id,date,exception_type\ns,20261113,1\nlater,20270101,1\n',
    'trips.txt': fixtureFiles['trips.txt'] + '4,later,future,0\n',
    'stop_times.txt':
      fixtureFiles['stop_times.txt'] +
      'future,11:00:00,11:00:00,A,1\nfuture,11:10:00,11:10:00,B,2\n',
  });
  await gtfsToHtml({
    ...config,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  });
  const generated = pages(config.outputPath);
  assert.ok(generated.length > 0);
  assert.ok(
    generated.every((page) =>
      page.consolidatedTimetables.every(
        (timetable) =>
          timetable.start_date === 20261113 && timetable.end_date === 20261113,
      ),
    ),
  );
  assert.ok(
    generated.every((page) =>
      page.consolidatedTimetables.every(
        (timetable) => !timetable.trip_ids.includes('future'),
      ),
    ),
  );
});
