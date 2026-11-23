import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createRequire } from 'node:module';
import { Gtfs } from 'gtfs';
import gtfsToHtml from '../dist/index.js';
import { fixtureFiles } from './fixtures/feed.js';

const SqliteDatabase = createRequire(import.meta.resolve('gtfs'))(
  'better-sqlite3',
);

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
      showMap: true,
    },
  };
}

function pages(output) {
  return readdirSync(output, { recursive: true })
    .filter((name) => name.endsWith('.html') && !name.endsWith('index.html'))
    .map((name) => JSON.parse(readFileSync(join(output, name), 'utf8')));
}

function withoutMaps(page) {
  const result = structuredClone(page);
  for (const timetable of [
    ...result.timetables,
    ...result.consolidatedTimetables,
  ]) {
    delete timetable.geojson;
  }
  return result;
}

test('generation preserves the captured timetable contract and CSV output; memory and reopen agree', async (t) => {
  const { root, config } = setup(t);
  assert.equal(await gtfsToHtml(config), config.outputPath);
  const [page] = pages(config.outputPath);
  const baseline = JSON.parse(
    readFileSync(
      new URL('./fixtures/expected-page.json', import.meta.url),
      'utf8',
    ),
  );
  // Keep the baseline fixture intact, excluding its intentionally removed derived fields.
  const nativeBaseline = JSON.parse(JSON.stringify(baseline), (key, value) =>
    key.endsWith('_timestamp') ? undefined : value,
  );
  assert.deepEqual(withoutMaps(page), nativeBaseline);
  assert.doesNotMatch(
    JSON.stringify(page),
    /_(?:timestamp|service_day_seconds)"/,
  );
  for (const timetable of page.consolidatedTimetables) {
    const line = timetable.geojson.features.find(
      (feature) => feature.geometry.type === 'MultiLineString',
    );
    assert.deepEqual(
      line.geometry.coordinates,
      timetable.direction_id === 0
        ? [
            [
              [-122, 37],
              [-122.01, 37.01],
            ],
          ]
        : [
            [
              [-122.01, 37.01],
              [-122, 37],
            ],
          ],
    );
  }
  const sqlitePath = join(root, 'transit.db');
  await gtfsToHtml({ ...config, sqlitePath });
  await gtfsToHtml({ ...config, sqlitePath, skipImport: true });
  assert.deepEqual(pages(config.outputPath)[0], page);
  const csvPath = join(root, 'csv');
  await gtfsToHtml({
    ...config,
    sqlitePath,
    skipImport: true,
    outputFormat: 'csv',
    outputPath: csvPath,
  });
  const csvFiles = readdirSync(csvPath, { recursive: true }).filter((name) =>
    name.endsWith('.csv'),
  );
  assert.deepEqual(csvFiles.sort(), [
    '20260101-20261231/back_4_1_mon-sun.csv',
    '20260101-20261231/out_4_0_mon-sun.csv',
  ]);
  for (const name of csvFiles) {
    assert.equal(
      readFileSync(join(csvPath, name), 'utf8'),
      readFileSync(
        new URL(`./fixtures/${name.split('/').pop()}`, import.meta.url),
        'utf8',
      ),
    );
  }
});

test('overlapping source IDs remain isolated, including calendars, extensions, output paths and reopen', async (t) => {
  const { root, feed, config } = setup(t);
  const second = join(root, 'second');
  mkdirSync(second);
  for (const [name, content] of Object.entries(fixtureFiles)) {
    writeFileSync(
      join(second, name),
      content
        .replaceAll('Alpha', 'Second Alpha')
        .replaceAll('Test Transit', 'Second Transit')
        .replaceAll('09:', '19:'),
    );
  }
  const agencies = [
    { agencyKey: 'one', path: feed },
    { agencyKey: 'two', path: second },
  ];
  const sqlitePath = join(root, 'shared.db');
  await gtfsToHtml({ ...config, sqlitePath, agencies });
  const first = pages(join(config.outputPath, 'source-one'))[0];
  const other = pages(join(config.outputPath, 'source-two'))[0];
  assert.equal(first.consolidatedTimetables[0].stops[0].stop_name, 'Alpha');
  assert.equal(
    other.consolidatedTimetables[0].stops[0].stop_name,
    'Second Alpha',
  );
  assert.equal(
    other.consolidatedTimetables[0].orderedTrips[0].stoptimes[0].arrival_time,
    '19:00:00',
  );
  await gtfsToHtml({
    ...config,
    sqlitePath,
    agencies: [...agencies].reverse(),
    skipImport: true,
  });
  assert.deepEqual(pages(join(config.outputPath, 'source-one'))[0], first);
  assert.deepEqual(pages(join(config.outputPath, 'source-two'))[0], other);
  const gtfs = new Gtfs({
    database: { path: sqlitePath },
    sources: [{ sourceId: 'one' }],
    extensions: ['gtfs-to-html', 'gtfs-plus'],
  });
  try {
    assert.deepEqual(
      (await gtfs.schedule.routes.all()).map((route) => [
        route.source_id,
        route.route_id,
      ]),
      [['one', '4']],
    );
  } finally {
    await gtfs.close();
  }
});

test('maps select the matching direction and service-period trips, including their stops', async (t) => {
  const { config } = setup(t, {
    'trips.txt':
      'route_id,service_id,trip_id,direction_id,shape_id\n4,s,out,0,outshape\n4,s,back,1,backshape\n4,later,later,0,latershape\n',
    'calendar.txt':
      fixtureFiles['calendar.txt'] + 'later,1,1,1,1,1,1,1,20270101,20271231\n',
    'shapes.txt':
      'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\noutshape,37,-122,1\noutshape,37.02,-122.02,2\nbackshape,38,-123,1\nbackshape,38.02,-123.02,2\nlatershape,39,-124,1\nlatershape,39.02,-124.02,2\n',
    'stops.txt': fixtureFiles['stops.txt'] + 'C,Gamma,39,-124\n',
    'stop_times.txt':
      fixtureFiles['stop_times.txt'] +
      'later,11:00:00,11:00:00,C,1\nlater,11:10:00,11:10:00,A,2\n',
  });
  await gtfsToHtml(config);
  const [page] = pages(config.outputPath);
  for (const timetable of page.consolidatedTimetables) {
    const line = timetable.geojson.features.find(
      (feature) => feature.geometry.type === 'MultiLineString',
    );
    assert.deepEqual(
      line.geometry.coordinates,
      timetable.direction_id === 0
        ? [
            [
              [-122, 37],
              [-122.02, 37.02],
            ],
          ]
        : [
            [
              [-123, 38],
              [-123.02, 38.02],
            ],
          ],
    );
    assert.deepEqual(
      timetable.geojson.features
        .filter((feature) => feature.geometry.type === 'Point')
        .map((feature) => feature.properties.stop_id)
        .sort(),
      ['A', 'B'],
    );
  }
});

test('frequency trips retain post-midnight seconds, extensions, and base-trip map geometry', async (t) => {
  const { config } = setup(t, {
    'frequencies.txt':
      'trip_id,start_time,end_time,headway_secs,exact_times\nout,25:00:00,26:00:00,1800,1\n',
    'stop_attributes.txt': 'stop_id,stop_city\nA,Test City\n',
    'timetable_notes.txt': 'note_id,symbol,note\nn,*,Test note\n',
    'timetable_notes_references.txt': 'note_id,trip_id\nn,out\n',
  });
  await gtfsToHtml({ ...config, showStopCity: true });
  const timetable = pages(config.outputPath)[0].consolidatedTimetables.find(
    (row) => row.direction_id === 0,
  );
  assert.equal(timetable.orderedTrips.length, 2);
  assert.equal(timetable.orderedTrips[0].stoptimes[0].arrival_time, '25:00:00');
  assert.equal(timetable.stops[0].stop_city, 'Test City');
  assert.equal(timetable.notes[0].note, 'Test note');
  assert.ok(
    timetable.geojson.features.some(
      (feature) => feature.geometry.type === 'MultiLineString',
    ),
  );
});

test('incompatible databases are rejected without modification; failed imports preserve existing output', async (t) => {
  const { root, config } = setup(t);
  const sqlitePath = join(root, 'legacy.db');
  const db = new DatabaseSync(sqlitePath);
  db.exec('CREATE TABLE agency (agency_id TEXT, agency_name TEXT)');
  db.close();
  const original = readFileSync(sqlitePath);
  await assert.rejects(
    gtfsToHtml({ ...config, sqlitePath, deleteDbAfter: true }),
    /incompatible database schema/,
  );
  assert.deepEqual(readFileSync(sqlitePath), original);
  assert.equal(existsSync(config.outputPath), false);
  mkdirSync(config.outputPath);
  writeFileSync(join(config.outputPath, 'keep.txt'), 'keep');
  await assert.rejects(
    gtfsToHtml({
      ...config,
      agencies: [
        {
          agencyKey: 'test',
          path: join(root, 'missing.zip'),
          import: { onSourceError: 'continue' },
        },
      ],
    }),
  );
  assert.equal(
    readFileSync(join(config.outputPath, 'keep.txt'), 'utf8'),
    'keep',
  );
  await assert.rejects(
    gtfsToHtml({
      ...config,
      agencies: [{ ...config.agencies[0], prefix: 'old-' }],
    }),
    /prefix option is no longer supported/,
  );
  await assert.rejects(
    gtfsToHtml({
      ...config,
      ignoreErrors: true,
      agencies: [{ agencyKey: 'test', path: join(root, 'missing.zip') }],
    }),
  );
});

test('CLI imports a fresh persistent database and reuses it with --skipImport', async (t) => {
  const { root, config } = setup(t);
  const configPath = join(root, 'config.json');
  writeFileSync(
    configPath,
    JSON.stringify({ ...config, sqlitePath: join(root, 'cli.db') }),
  );
  execFileSync(process.execPath, [
    'dist/bin/gtfs-to-html.js',
    '--configPath',
    configPath,
  ]);
  const first = pages(config.outputPath)[0];
  execFileSync(process.execPath, [
    'dist/bin/gtfs-to-html.js',
    '--configPath',
    configPath,
    '--skipImport',
  ]);
  assert.deepEqual(pages(config.outputPath)[0], first);
});

test('concurrent in-memory generations own independent instances', async (t) => {
  const first = setup(t);
  const second = setup(t, {
    'stops.txt': fixtureFiles['stops.txt'].replace(
      'Alpha',
      'Independent Alpha',
    ),
  });
  await Promise.all([gtfsToHtml(first.config), gtfsToHtml(second.config)]);
  assert.equal(
    pages(first.config.outputPath)[0].consolidatedTimetables[0].stops[0]
      .stop_name,
    'Alpha',
  );
  assert.equal(
    pages(second.config.outputPath)[0].consolidatedTimetables[0].stops[0]
      .stop_name,
    'Independent Alpha',
  );
});

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

test('alternate stop placement uses the nearer shared stop within trip-order constraints', async (t) => {
  for (const { longitude, constraint, expected } of [
    { longitude: 0.1, expected: 'AXBCDEF' },
    { longitude: 4.9, expected: 'ABCDEXF' },
    { longitude: 0.1, constraint: 'CX', expected: 'ABCXDEF' },
    { longitude: 4.9, constraint: 'XD', expected: 'ABCXDEF' },
  ]) {
    const trips = { alternate: 'AXF', local: 'ABCDEF' };
    if (constraint) {
      trips.connection = constraint;
    }
    const { config } = setup(t, {
      'stops.txt': [
        'stop_id,stop_name,stop_lat,stop_lon',
        ...Array.from('ABCDEF', (id, index) => `${id},Stop ${id},0,${index}`),
        `X,Alternate,0,${longitude}`,
      ].join('\n'),
      'trips.txt': [
        'route_id,service_id,trip_id,direction_id',
        ...Object.keys(trips).map((id) => `4,s,${id},0`),
      ].join('\n'),
      'stop_times.txt': [
        'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
        ...Object.entries(trips).flatMap(([tripId, sequence]) =>
          Array.from(
            sequence,
            (id, i) => `${tripId},09:0${i}:00,09:0${i}:00,${id},${i + 1}`,
          ),
        ),
      ].join('\n'),
    });
    await gtfsToHtml({ ...config, showMap: false });
    const [timetable] = pages(config.outputPath)[0].consolidatedTimetables;
    assert.equal(
      timetable.stops.map((stop) => stop.stop_id).join(''),
      expected,
    );
    for (const [index, trip] of timetable.orderedTrips.entries()) {
      assert.equal(
        timetable.stops
          .filter((stop) => !stop.trips[index].skipped)
          .map((stop) => stop.stop_id)
          .join(''),
        trips[trip.trip_id],
      );
    }
  }
});

test('cyclic stop orders preserve onward times and distinct branches', async (t) => {
  const { config } = setup(t, {
    'stops.txt':
      fixtureFiles['stops.txt'] +
      'X,Shared intermediate,37.02,-122\nY,Other,37.03,-122\nD,East,37.04,-122\nE,West,37.05,-122\n',
    'trips.txt':
      'route_id,service_id,trip_id,direction_id\n4,s,first,0\n4,s,east,0\n4,s,west,0\n',
    'stop_times.txt': [
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
      'first,12:25:00,12:25:00,A,1',
      'first,12:40:00,12:40:00,X,2',
      'first,12:55:00,12:55:00,Y,3',
      'first,13:07:00,13:07:00,B,4',
      'east,13:35:00,13:35:00,B,1',
      'east,13:42:00,13:44:00,X,2',
      'east,13:52:00,13:52:00,D,3',
      'west,13:35:00,13:35:00,B,1',
      'west,13:42:00,13:44:00,X,2',
      'west,13:57:00,13:57:00,E,3',
    ].join('\n'),
  });
  await gtfsToHtml({ ...config, showMap: false });
  const [timetable] = pages(config.outputPath)[0].consolidatedTimetables;
  const rows = Object.fromEntries(
    timetable.orderedTrips.map((trip, index) => [
      trip.trip_id,
      timetable.stops.flatMap((stop) => {
        const cell = stop.trips[index];
        if (cell.skipped) {
          return [];
        }
        return [stop.stop_id + ' ' + cell.formatted_time];
      }),
    ]),
  );
  assert.deepEqual(rows, {
    first: ['A 12:25pm', 'X 12:40pm', 'Y 12:55pm', 'B 1:07pm'],
    east: ['B 1:35pm', 'X 1:42pm', 'X 1:44pm', 'D 1:52pm'],
    west: ['B 1:35pm', 'X 1:42pm', 'X 1:44pm', 'E 1:57pm'],
  });
});

test('timepoint-only loops retain separate visits after hiding an intermediate stop', async (t) => {
  const { config } = setup(t, {
    'trips.txt': 'route_id,service_id,trip_id,direction_id\n4,s,loop,0\n',
    'stop_times.txt': [
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence,timepoint',
      'loop,09:00:00,09:00:00,A,1,1',
      'loop,09:10:00,09:10:00,B,2,0',
      'loop,09:20:00,09:20:00,A,3,1',
    ].join('\n'),
  });
  await gtfsToHtml({ ...config, showOnlyTimepoint: true, showMap: false });
  const [timetable] = pages(config.outputPath)[0].consolidatedTimetables;
  assert.deepEqual(
    timetable.stops.map((stop) => [stop.stop_id, stop.trips[0].formatted_time]),
    [
      ['A', '9:00am'],
      ['A', '9:20am'],
    ],
  );
});

test('display deduplication preserves realtime trip IDs but excludes filtered trips', async (t) => {
  for (const showDuplicateTrips of [false, true]) {
    for (const showMap of [false, true]) {
      const { config } = setup(t, {
        'trips.txt':
          fixtureFiles['trips.txt'] + '4,s,duplicate,0\n4,s,short,0\n',
        'stop_times.txt':
          fixtureFiles['stop_times.txt'] +
          'duplicate,09:00:00,09:00:00,A,1\n' +
          'duplicate,09:10:00,09:10:00,B,2\n' +
          'short,09:00:00,09:00:00,A,1\n',
      });
      await gtfsToHtml({ ...config, showDuplicateTrips, showMap });
      const timetables = pages(config.outputPath)[0].consolidatedTimetables;
      const outbound = timetables.find((row) => row.direction_id === 0);
      const inbound = timetables.find((row) => row.direction_id === 1);
      assert.deepEqual([...outbound.trip_ids].sort(), ['duplicate', 'out']);
      assert.equal(outbound.orderedTrips.length, showDuplicateTrips ? 2 : 1);
      assert.deepEqual(inbound.trip_ids, ['back']);
    }
  }
});

test('time-string filters include the start and exclude the end at midnight and after 24:00', async (t) => {
  for (const [start, end] of [
    ['00:00:00', '01:00:00'],
    ['25:00:00', '26:00:00'],
  ]) {
    const { config } = setup(t, {
      'stop_times.txt': fixtureFiles['stop_times.txt']
        .replaceAll('09:00:00', start)
        .replaceAll('09:10:00', start.replace(':00:00', ':10:00'))
        .replaceAll('10:00:00', end)
        .replaceAll('10:10:00', end.replace(':00:00', ':10:00')),
      'timetables.txt':
        fixtureFiles['timetables.txt']
          .trimEnd()
          .split('\n')
          .map((line, index) =>
            index === 0
              ? `${line},start_time,end_time`
              : `${line},${start},${end}`,
          )
          .join('\n') + '\n',
    });
    await gtfsToHtml(config);
    const timetables = pages(config.outputPath)[0].consolidatedTimetables;
    assert.deepEqual(
      timetables.flatMap((timetable) => timetable.trip_ids),
      ['out'],
    );
    assert.equal(
      timetables[0].orderedTrips[0].stoptimes[0].arrival_time,
      start,
    );
  }
});

test('trip continuations compare extended GTFS time strings without derived fields', async (t) => {
  const { config } = setup(t, {
    'routes.txt':
      fixtureFiles['routes.txt'] + '5,a,5,Previous,3\n6,a,6,Next,3\n',
    'trips.txt':
      'route_id,service_id,trip_id,direction_id,block_id\n4,s,out,0,block\n5,s,previous,0,block\n6,s,next,0,block\n',
    'stop_times.txt':
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nprevious,24:40:00,24:40:00,B,1\nprevious,24:50:00,24:50:00,A,2\nout,25:00:00,25:00:00,A,1\nout,25:10:00,25:10:00,B,2\nnext,25:30:00,25:30:00,B,1\nnext,25:40:00,25:40:00,A,2\n',
    'timetables.txt':
      fixtureFiles['timetables.txt']
        .trimEnd()
        .split('\n')
        .slice(0, 2)
        .map((line, index) =>
          index === 0 ? `${line},show_trip_continuation` : `${line},1`,
        )
        .join('\n') + '\n',
  });
  await gtfsToHtml(config);
  const trip = pages(config.outputPath)[0].consolidatedTimetables[0]
    .orderedTrips[0];
  assert.equal(trip.continues_from_route.trip_id, 'previous');
  assert.equal(trip.continues_as_route.trip_id, 'next');
  assert.doesNotMatch(
    JSON.stringify(trip),
    /_(?:timestamp|service_day_seconds)"/,
  );
});

test('unkeyed feeds get stable distinct keys across reordering and database reopen', async (t) => {
  const first = setup(t);
  const second = setup(t, {
    'stops.txt': fixtureFiles['stops.txt'].replace('Alpha', 'Second Alpha'),
  });
  const agencies = [{ path: first.feed }, { path: second.feed }];
  const original = structuredClone(agencies);
  const config = {
    ...first.config,
    agencies,
    sqlitePath: join(first.root, 'generated-keys.db'),
  };
  await gtfsToHtml(config);
  assert.deepEqual(agencies, original);
  const directories = readdirSync(config.outputPath).filter((name) =>
    name.startsWith('source-'),
  );
  assert.equal(directories.length, 2);
  const before = directories.map((directory) =>
    pages(join(config.outputPath, directory)),
  );
  assert.deepEqual(
    before
      .map(([page]) => page.consolidatedTimetables[0].stops[0].stop_name)
      .sort(),
    ['Alpha', 'Second Alpha'],
  );
  await gtfsToHtml({
    ...config,
    agencies: [...agencies].reverse(),
    skipImport: true,
  });
  assert.deepEqual(
    directories.map((directory) => pages(join(config.outputPath, directory))),
    before,
  );
});

test('legacy agency_key remains supported and repeated unkeyed inputs get unique keys', async (t) => {
  const { root, feed, config } = setup(t);
  const sqlitePath = join(root, 'keys.db');
  await gtfsToHtml({
    ...config,
    sqlitePath,
    agencies: [{ agency_key: 'legacy', path: feed }],
  });
  await gtfsToHtml({
    ...config,
    sqlitePath,
    agencies: [{ agency_key: 'legacy' }],
    skipImport: true,
  });
  assert.equal(pages(config.outputPath).length, 1);
  const repeated = {
    ...config,
    sqlitePath,
    outputPath: join(root, 'repeated'),
    agencies: [{ path: feed }, { path: feed }],
  };
  await gtfsToHtml(repeated);
  const directories = readdirSync(repeated.outputPath).filter((name) =>
    name.startsWith('source-'),
  );
  assert.equal(directories.length, 2);
  assert.equal(new Set(directories).size, 2);
  await gtfsToHtml({ ...repeated, skipImport: true });
  assert.ok(
    directories.every(
      (directory) => pages(join(repeated.outputPath, directory)).length === 1,
    ),
  );
  await assert.rejects(
    gtfsToHtml({
      ...config,
      agencies: [
        { agencyKey: 'same', path: feed },
        { agencyKey: 'same', path: feed },
      ],
    }),
    /agencyKey must be unique/,
  );
});

for (const groupTimetablesIntoPages of [true, false]) {
  for (const [name, baseDays, extraDays, expected] of [
    [
      'daily plus weekend',
      '1,1,1,1,1,1,1',
      '0,0,0,0,0,1,1',
      [
        ['1111100', ['out']],
        ['0000011', ['out', 'extra']],
      ],
    ],
    [
      'disjoint weekdays and weekend',
      '1,1,1,1,1,0,0',
      '0,0,0,0,0,1,1',
      [
        ['1111100', ['out']],
        ['0000011', ['extra']],
      ],
    ],
    [
      'partially overlapping weekdays',
      '1,1,1,0,0,0,0',
      '0,0,1,1,1,0,0',
      [
        ['1100000', ['out']],
        ['0010000', ['out', 'extra']],
        ['0001100', ['extra']],
      ],
    ],
  ]) {
    test(`automatic timetables partition ${name} (grouped=${groupTimetablesIntoPages})`, async (t) => {
      const { config } = setup(t, {
        'timetables.txt': null,
        'timetable_pages.txt': null,
        'calendar.txt':
          fixtureFiles['calendar.txt'].split('\n')[0] +
          '\n' +
          `s,${baseDays},20260101,20261231\nextra,${extraDays},20260101,20261231\n` +
          'unrelated,0,1,0,0,0,0,0,20260101,20261231\n',
        'trips.txt': fixtureFiles['trips.txt'] + '4,extra,extra,0\n',
        'stop_times.txt':
          fixtureFiles['stop_times.txt'] +
          'extra,11:00:00,11:00:00,A,1\nextra,11:10:00,11:10:00,B,2\n',
      });
      await gtfsToHtml({ ...config, groupTimetablesIntoPages });
      const timetables = pages(config.outputPath).flatMap(
        (page) => page.consolidatedTimetables,
      );
      const days = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ];
      const outbound = timetables.filter((row) => row.direction_id === 0);
      assert.deepEqual(
        outbound
          .map((row) => [days.map((day) => row[day]).join(''), row.trip_ids])
          .sort(),
        [...expected].sort(),
      );
      const inbound = timetables.filter((row) => row.direction_id === 1);
      assert.equal(inbound.length, 1);
      assert.equal(
        days.map((day) => inbound[0][day]).join(''),
        baseDays.replaceAll(',', ''),
      );
      assert.deepEqual(inbound[0].trip_ids, ['back']);
      assert.ok(
        timetables.every(
          (row) =>
            !row.warnings.some((warning) => warning.includes('only run on')),
        ),
      );
    });
  }
}

test('GeoJSON omits source IDs and GTFS Plus attributes', async (t) => {
  const { config } = setup(t, {
    'route_attributes.txt':
      'route_id,category,subcategory,running_way\n4,3,101,1\n',
    'stop_attributes.txt': 'stop_id,stop_city\nA,Test City\n',
  });
  await gtfsToHtml(config);
  const overviewPath = readdirSync(config.outputPath, { recursive: true }).find(
    (name) => name.endsWith('index.html'),
  );
  const overview = JSON.parse(
    readFileSync(join(config.outputPath, overviewPath), 'utf8'),
  );
  const geojsons = [
    overview.geojson,
    ...pages(config.outputPath).flatMap((page) =>
      page.consolidatedTimetables.map((row) => row.geojson),
    ),
  ];
  for (const geojson of geojsons) {
    assert.doesNotMatch(
      JSON.stringify(geojson),
      /"(?:source_id|category|subcategory|running_way|stop_city)"/,
    );
    const stop = geojson.features.find(
      (feature) => feature.properties.stop_id === 'A',
    );
    assert.equal(stop.properties.stop_name, 'Alpha');
    assert.ok(stop.properties.routes.length > 0);
    const route = stop.properties.routes.find((row) => row.route_id === '4');
    assert.equal(route.route_short_name, '4');
    assert.equal(route.route_type, 3);
    assert.ok(
      geojson.features.some(
        (feature) => feature.geometry.type === 'MultiLineString',
      ),
    );
  }
});

for (const ignoreErrors of [undefined, false, true]) {
  test(`timetable failures preserve healthy siblings only with ignoreErrors=${ignoreErrors}`, async (t) => {
    const { config } = setup(t, {
      'timetable_stop_order.txt':
        'timetable_id,stop_id,stop_sequence\nout,MISSING,1\n',
    });
    if (ignoreErrors !== true) {
      await assert.rejects(gtfsToHtml({ ...config, ignoreErrors }), /MISSING/);
      return;
    }
    await gtfsToHtml({ ...config, ignoreErrors });
    const [page] = pages(config.outputPath);
    assert.deepEqual(
      page.consolidatedTimetables.map((item) => item.timetable_id),
      ['back'],
    );
    assert.deepEqual(
      page.timetables.map((item) => item.timetable_id),
      ['back'],
    );
    const log = readFileSync(join(config.outputPath, 'log.txt'), 'utf8');
    assert.match(
      log,
      /timetable_page_id=page: Skipping timetable_id=out:.*MISSING/,
    );
    assert.match(log, /Timetable Count: 1/);
  });
}

test('failed pages are omitted from overview and counts while later pages render', async (t) => {
  const { root, config } = setup(t, {
    'timetable_pages.txt':
      'timetable_page_id,timetable_page_label,filename\na,Broken,a.html\nz,Healthy,z.html\n',
    'timetables.txt': fixtureFiles['timetables.txt']
      .replace(',page\n', ',a\n')
      .replace(',page\n', ',z\n'),
  });
  writeFileSync(
    join(root, 'templates', 'timetablepage.pug'),
    '- if (timetablePage.timetable_page_id === "a") { throw new Error("Broken template"); }\n!= JSON.stringify(timetablePage)',
  );
  writeFileSync(
    join(root, 'templates', 'overview.pug'),
    '!= JSON.stringify(timetablePages)',
  );
  await gtfsToHtml({ ...config, ignoreErrors: true });
  assert.deepEqual(
    pages(config.outputPath).map((page) => page.timetable_page_id),
    ['z'],
  );
  const overview = JSON.parse(
    readFileSync(join(config.outputPath, 'index.html'), 'utf8'),
  );
  assert.deepEqual(
    overview.map((page) => page.timetable_page_id),
    ['z'],
  );
  const log = readFileSync(join(config.outputPath, 'log.txt'), 'utf8');
  assert.match(log, /Timetable Page Count: 1/);
  assert.match(log, /Timetable Count: 1/);
  assert.match(log, /Skipping timetable_page_id=a:/);
  assert.match(log, /Broken template/);
  await assert.rejects(
    gtfsToHtml({ ...config, ignoreErrors: false }),
    /Broken template/,
  );
});

for (const persistent of [false, true]) {
  test(`borrowed db supports import and reuse without closing or deleting it (persistent=${persistent})`, async (t) => {
    const { root, config } = setup(t);
    const databasePath = join(root, 'borrowed.sqlite');
    const db = new SqliteDatabase(persistent ? databasePath : ':memory:');
    t.after(() => db.close());
    const sqlitePath = persistent ? databasePath : join(root, 'unused.sqlite');
    const borrowedConfig = { ...config, db, sqlitePath, deleteDbAfter: true };
    await gtfsToHtml(borrowedConfig);
    const originalPages = pages(config.outputPath);
    assert.equal(db.open, true);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM trips').get().count,
      2,
    );
    await gtfsToHtml({ ...borrowedConfig, skipImport: true });
    assert.deepEqual(pages(config.outputPath), originalPages);
    assert.equal(db.open, true);
    assert.equal(existsSync(sqlitePath), persistent);

    await assert.rejects(
      gtfsToHtml({
        ...borrowedConfig,
        agencies: [{ agencyKey: 'test', path: join(root, 'missing.zip') }],
      }),
    );
    assert.equal(db.open, true);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM trips').get().count,
      2,
    );
    assert.equal(existsSync(sqlitePath), persistent);
  });
}

test('borrowed legacy db is rejected without modification or closing', async (t) => {
  const { config } = setup(t);
  const db = new SqliteDatabase(':memory:');
  t.after(() => db.close());
  db.exec(
    "CREATE TABLE agency (agency_id TEXT); INSERT INTO agency VALUES ('keep')",
  );
  await assert.rejects(
    gtfsToHtml({ ...config, db, deleteDbAfter: true }),
    /incompatible database schema/,
  );
  assert.equal(db.open, true);
  assert.deepEqual(db.prepare('SELECT * FROM agency').all(), [
    { agency_id: 'keep' },
  ]);
  assert.equal(existsSync(config.outputPath), false);
});

test('borrowed db remains usable across multiple isolated sources', async (t) => {
  const { config } = setup(t);
  const db = new SqliteDatabase(':memory:');
  t.after(() => db.close());
  const shared = {
    ...config,
    db,
    agencies: ['first', 'second'].map((agencyKey) => ({
      ...config.agencies[0],
      agencyKey,
    })),
  };
  await gtfsToHtml(shared);
  assert.equal(db.open, true);
  assert.deepEqual(
    db.prepare('SELECT DISTINCT source_id FROM trips ORDER BY source_id').all(),
    [{ source_id: 'first' }, { source_id: 'second' }],
  );
  await gtfsToHtml({ ...shared, skipImport: true });
  assert.equal(pages(config.outputPath).length, 2);
});
