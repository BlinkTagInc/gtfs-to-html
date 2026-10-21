import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as _ from 'lodash-es';
import pug from 'pug';
import cssEscape from 'css.escape';

import * as templateFunctions from '../src/lib/template-functions.ts';

const viewsPath = fileURLToPath(new URL('../views/default/', import.meta.url));

function createTimetable(id, stopNames, overrides = {}) {
  return {
    timetable_id: id,
    timetable_label: null,
    direction_id: id,
    direction_name: null,
    route_ids: ['4'],
    routes: [
      { route_id: '4', route_short_name: '4', route_long_name: 'Downtown' },
    ],
    stops: stopNames.map((stop_name, index) => ({
      stop_id: `${id}-${index}`,
      stop_name,
      is_timepoint: true,
      trips: [{ formatted_time: '9:00am', classes: [] }],
      hourlyTimes: [':00'],
    })),
    orderedTrips: [],
    notes: [],
    service_notes: null,
    dayList: 'Mon',
    dayListLong: 'Monday',
    ...overrides,
  };
}

function renderPage(timetables, menuType, templatePath = viewsPath) {
  return pug.renderFile(join(templatePath, 'timetablepage.pug'), {
    _,
    cssEscape,
    ...templateFunctions,
    formatRouteColor: () => '#000000',
    formatRouteTextColor: () => '#ffffff',
    config: { showRouteTitle: true, menuType },
    timetablePage: {
      timetable_page_label: 'Downtown',
      consolidatedTimetables: timetables,
      dayLists: ['Mon'],
    },
  });
}

test('default labels handle endpoints, loops, headsigns, and explicit labels', () => {
  const renderLabel = pug.compile(
    'include formatting_functions.pug\np= formatTimetableLabel(timetable)',
    { filename: join(viewsPath, 'label-test.pug') },
  );
  const cases = [
    [createTimetable(0, ['A', 'B']), 'Route 4 - A to B'],
    [createTimetable(0, ['A', 'A']), 'Route 4 - Downtown - Loop'],
    [
      createTimetable(0, [], { direction_name: 'Downtown' }),
      'Route 4 to Downtown',
    ],
    [createTimetable(0, []), 'Route 4'],
    [
      createTimetable(0, ['A', 'B'], { timetable_label: '' }),
      'Route 4 - A to B',
    ],
    [
      createTimetable(0, ['A', 'B'], { timetable_label: 'Express <4>' }),
      'Express &lt;4&gt;',
    ],
    [
      createTimetable(0, ['A', 'B'], {
        routes: [{ route_short_name: '', route_long_name: 'Downtown' }],
      }),
      'Route Downtown - A to B',
    ],
  ];
  for (const [timetable, expected] of cases) {
    assert.equal(renderLabel({ timetable }), `<p>${expected}</p>`);
  }
});

test('a custom Pug helper translates labels throughout every menu and orientation', (t) => {
  const customPath = mkdtempSync(join(tmpdir(), 'gtfs-to-html-labels-'));
  t.after(() => rmSync(customPath, { recursive: true, force: true }));
  for (const name of readdirSync(viewsPath)) {
    if (name.endsWith('.pug')) {
      let source = readFileSync(join(viewsPath, name), 'utf8');
      if (name === 'formatting_functions.pug') {
        source = source
          .replace('Route ${', 'Ligne ${')
          .replaceAll(' to ${', ' vers ${')
          .replace("' - Loop'", "' - Boucle'");
      }
      writeFileSync(join(customPath, name), source);
    }
  }

  for (const orientation of ['horizontal', 'vertical', 'hourly']) {
    for (const menuType of ['simple', 'jump', 'radio']) {
      const timetables = [
        createTimetable(0, ['A', 'B'], {
          orientation,
          timetable_label: 'Route 4 - A to B',
          timetableLabelOverride: null,
        }),
        createTimetable(1, ['A', 'A'], {
          orientation,
          timetable_label: 'Route 4 - Downtown - Loop',
          timetableLabelOverride: null,
        }),
      ];
      const html = renderPage(timetables, menuType, customPath);
      for (const label of [
        'Ligne 4 - A vers B',
        'Ligne 4 - Downtown - Boucle',
      ]) {
        assert.ok(html.includes(`<h2>${label} | Monday</h2>`));
        assert.ok(
          html.includes(`<caption class="sr-only">${label} | Mon</caption>`),
        );
        assert.ok(html.includes(`on the route for ${label} Mon.`));
        assert.ok(html.includes(`data-direction-name="${label}"`));
        // A menu label appears directly inside either a span or an anchor.
        assert.ok(
          html.includes(`>${label}</span>`) || html.includes(`>${label}</a>`),
        );
      }
      assert.ok(!html.includes('Route 4'));
      assert.deepEqual(
        timetables.map((timetable) => timetable.timetable_label),
        ['Route 4 - A to B', 'Route 4 - Downtown - Loop'],
      );
    }
  }
});

test('explicit labels and headsign buttons retain precedence', () => {
  const timetables = [
    createTimetable(0, ['A', 'B'], {
      timetable_label: 'Express',
      timetableLabelOverride: 'Express',
      direction_name: 'Downtown',
    }),
    createTimetable(1, ['B', 'A']),
  ];
  const html = renderPage(timetables, 'radio');
  assert.ok(html.includes('<span>Downtown</span>'));
  assert.ok(html.includes('<h2>Express | Monday</h2>'));
  assert.ok(html.includes('<span>Route 4 - B to A</span>'));
});

test('existing templates can still compare and display generated label properties', () => {
  const timetables = [
    createTimetable(0, ['A', 'B'], {
      timetable_label: 'Route 4 - A to B',
      timetableLabelOverride: null,
    }),
    createTimetable(1, ['B', 'A'], {
      timetable_label: 'Route 4 - B to A',
      timetableLabelOverride: null,
    }),
  ];
  const html = pug.render(
    'if timetablePageHasDifferentLabels(timetablePage)\n  each timetable in timetablePage.consolidatedTimetables\n    p= timetable.timetable_label',
    {
      ...templateFunctions,
      timetablePage: { consolidatedTimetables: timetables },
    },
  );
  assert.equal(html, '<p>Route 4 - A to B</p><p>Route 4 - B to A</p>');
});

test('simple menus compare rendered labels instead of missing raw labels', () => {
  const first = createTimetable(0, ['A', 'B']);
  const sameLabel = createTimetable(1, ['A', 'B'], {
    dayList: 'Tue',
    dayListLong: 'Tuesday',
  });
  const differentLabel = createTimetable(1, ['B', 'A']);
  const sameMenu = renderPage([first, sameLabel], 'simple').match(
    /<ul.*?<\/ul>/,
  )[0];
  assert.ok(!sameMenu.includes('Route 4'));
  assert.ok(sameMenu.includes('Monday'));
  assert.ok(sameMenu.includes('Tuesday'));
  const differentMenu = renderPage([first, differentLabel], 'simple').match(
    /<ul.*?<\/ul>/,
  )[0];
  assert.ok(differentMenu.includes('Route 4 - A to B'));
  assert.ok(differentMenu.includes('Route 4 - B to A'));
});
