import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { PbfWriter } from 'pbf';

test('re-evaluates decoded alert periods at each boundary between feed polls', async () => {
  const writer = new PbfWriter();
  const windows = {
    ongoing: [],
    epoch: [{ end: 0 }],
    intermittent: [{ end: 11 }, { start: 12, end: 13 }, { start: 14 }],
  };
  for (const [id, periods] of Object.entries(windows)) {
    writer.writeMessage(
      2,
      (_, entity) => {
        entity.writeStringField(1, id);
        entity.writeMessage(
          5,
          (_, alert) => {
            alert.writeMessage(
              5,
              (_, selector) => selector.writeStringField(2, 'r'),
              null,
            );
            for (const period of periods) {
              alert.writeMessage(
                1,
                (_, range) => {
                  if (period.start !== undefined) {
                    range.writeVarintField(1, period.start);
                  }
                  if (period.end !== undefined) {
                    range.writeVarintField(2, period.end);
                  }
                },
                null,
              );
            }
          },
          null,
        );
      },
      null,
    );
  }

  let now = 10000;
  let scheduled;
  const displayed = [];
  const context = {
    bytes: writer.finish(),
    TextDecoder,
    Date: { now: () => now },
    setTimeout(callback, delay) {
      scheduled = { callback, delay };
    },
    clearTimeout() {
      scheduled = undefined;
    },
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelectorAll: () => [],
      querySelector: () => ({ style: {}, appendChild() {} }),
    },
    routeData: { r: {} },
    routeIds: ['r'],
    stopIds: [],
    alertPatterns: [{ routeId: 'r' }],
    record: (entity) => {
      displayed.push(entity.id);
      return {
        remove: () => displayed.splice(displayed.indexOf(entity.id), 1),
      };
    },
  };
  const scripts = await Promise.all(
    [
      ['../dist/browser/pbf.js', 'utf8'],
      ['../dist/browser/gtfs-realtime.browser.proto.js', 'utf16le'],
      ['../views/default/js/timetable-alerts.js', 'utf8'],
    ].map(([path, encoding]) =>
      readFile(new URL(path, import.meta.url), encoding),
    ),
  );
  runInNewContext(
    [
      'var self = globalThis;',
      ...scripts,
      'formatAlertAsHtml = record;',
      'renderAlerts(FeedMessage.read(new Pbf.PbfReader(bytes)).entity);',
    ].join('\n'),
    context,
  );
  assert.deepEqual(displayed, ['ongoing', 'intermittent']);
  for (const second of [11, 12, 13, 14]) {
    assert.ok(scheduled);
    assert.equal(scheduled.delay, 1000);
    now = second * 1000;
    scheduled.callback();
    assert.deepEqual(
      displayed,
      second % 2 === 0 ? ['ongoing', 'intermittent'] : ['ongoing'],
    );
  }
  assert.equal(scheduled, undefined);
});
