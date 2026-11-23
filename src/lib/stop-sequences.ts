/*
 * Align two stop sequences on their longest common subsequence. Keeping all
 * unmatched visits gives the shortest order that contains both inputs.
 */
const mergeStopSequences = (order: string[], pattern: string[]): string[] => {
  const width = pattern.length + 1;
  const lengths = new Uint32Array((order.length + 1) * width);
  for (let i = order.length - 1; i >= 0; i--) {
    const row = i * width;
    const nextRow = row + width;
    for (let j = pattern.length - 1; j >= 0; j--) {
      if (order[i] === pattern[j]) {
        lengths[row + j] = 1 + lengths[nextRow + j + 1];
      } else {
        lengths[row + j] = Math.max(lengths[nextRow + j], lengths[row + j + 1]);
      }
    }
  }
  const merged: string[] = [];
  let i = 0;
  let j = 0;
  while (i < order.length && j < pattern.length) {
    if (order[i] === pattern[j]) {
      merged.push(order[i++]);
      j++;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      merged.push(order[i++]);
    } else {
      merged.push(pattern[j++]);
    }
  }
  return merged.concat(order.slice(i), pattern.slice(j));
};

// Each matrix cell uses four bytes. Count the padded dimensions so the
// limits cover the allocation as well as the comparisons.
const maxCellsPerMerge = 1_000_000;
const maxWorkPerTimetable = 4_000_000;

export function mergeCyclicStopPatterns(
  patterns: string[][],
  maxCells = maxCellsPerMerge,
  remainingWork = maxWorkPerTimetable,
): string[] | undefined {
  patterns.sort((a, b) => b.length - a.length);
  let order = patterns[0] ?? [];
  for (let index = 1; index < patterns.length; index++) {
    const pattern = patterns[index];
    let matched = 0;
    for (const id of order) {
      if (matched === pattern.length) {
        break;
      }
      if (remainingWork <= 0) {
        return undefined;
      }
      remainingWork--;
      if (id === pattern[matched]) {
        matched++;
      }
    }
    if (matched === pattern.length) {
      continue;
    }

    const cells = (order.length + 1) * (pattern.length + 1);
    if (cells > maxCells || cells > remainingWork) {
      return undefined;
    }
    remainingWork -= cells;
    order = mergeStopSequences(order, pattern);
  }
  return order;
}
