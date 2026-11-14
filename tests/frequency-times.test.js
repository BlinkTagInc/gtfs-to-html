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
import { updateTimeByOffset } from '../src/lib/time-utils.ts';

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

test('frequency trips retain extended hours and matching time values', async (t) => {
  const { config } = setup(t, {
    'frequencies.txt':
      'trip_id,start_time,end_time,headway_secs,exact_times\nout,25:00:00,26:00:00,1800,1\n',
  });
  await gtfsToHtml(config);
  const timetable = pages(config.outputPath)[0].consolidatedTimetables.find(
    (row) => row.direction_id === 0,
  );
  assert.equal(timetable.orderedTrips.length, 2);
  assert.deepEqual(
    timetable.orderedTrips.map((trip) => trip.stoptimes[0].departure_time),
    ['25:00:00', '25:30:00'],
  );
  assert.deepEqual(
    timetable.orderedTrips.map((trip) => trip.stoptimes.at(-1).arrival_time),
    ['25:10:00', '25:40:00'],
  );
  for (const [index, trip] of timetable.orderedTrips.entries()) {
    // Older template rows also expose numeric times; keep them in sync when present.
    if ('departure_timestamp' in trip.stoptimes[0]) {
      assert.equal(trip.stoptimes[0].departure_timestamp, 90000 + index * 1800);
      assert.equal(
        trip.stoptimes.at(-1).arrival_timestamp,
        90600 + index * 1800,
      );
    }
  }
});

test('time offsets preserve missing times and extended hours', () => {
  assert.equal(updateTimeByOffset(null, 3600), null);
  assert.equal(updateTimeByOffset(null, -3600), null);
  assert.equal(updateTimeByOffset('25:10:00', 1800), '25:40:00');
  assert.equal(updateTimeByOffset('23:50:00', 1200), '24:10:00');
  assert.equal(updateTimeByOffset('00:10:00', -1200), '23:50:00');
});
