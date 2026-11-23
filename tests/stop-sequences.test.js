import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCyclicStopPatterns } from '../src/lib/stop-sequences.ts';

test('cyclic merges count padded matrix cells before allocation', () => {
  const patterns = [
    ['A', 'B', 'A'],
    ['A', 'C', 'A'],
  ];
  assert.equal(mergeCyclicStopPatterns(patterns, 15), undefined);
  assert.deepEqual(mergeCyclicStopPatterns(patterns, 16), ['A', 'B', 'C', 'A']);
});

test('successive cyclic merges share the timetable budget', () => {
  const patterns = [['A', 'B', 'A'], ['A', 'C', 'A'], ['D']];
  // The scans cost 3 + 4 visits and the matrices cost 16 + 10 cells.
  assert.equal(mergeCyclicStopPatterns(patterns, 16, 32), undefined);
  assert.deepEqual(mergeCyclicStopPatterns(patterns, 16, 33), [
    'A',
    'B',
    'C',
    'A',
    'D',
  ]);
});

test('contained patterns use only the scan budget and stop at the last match', () => {
  const patterns = [['A', 'B', 'A'], ['A'], ['B']];
  assert.equal(mergeCyclicStopPatterns(patterns, 0, 2), undefined);
  assert.deepEqual(mergeCyclicStopPatterns(patterns, 0, 3), ['A', 'B', 'A']);
});
