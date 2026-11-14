import type { Gtfs, GtfsQuery, GtfsEqualityFilter } from 'gtfs';
import { orderBy, pick, uniqBy } from 'lodash-es';

type Filter<Row> = {
  [Key in keyof Row]?: Row[Key] | null | readonly (Row[Key] | null)[];
};
type Order = [string, string][];

function templateRow<Row extends object>(row: Row) {
  const { source_id: _source, ...result } = row as Row & { source_id?: string };
  return result as Omit<Row, 'source_id'>;
}

// Readers already carry a single source's scope. Scalar filters execute in the
// database; membership filters apply to those rows, before field projection.
function reader<
  Name extends string,
  Row extends object,
  Output = Omit<Row, 'source_id'>,
>(
  query: GtfsQuery<Name, Row>,
  convert: (row: Row) => Output = templateRow as (row: Row) => Output,
) {
  return async (
    filter: Filter<Row> = {},
    fields: string[] = [],
    order: Order = [],
  ): Promise<Output[]> => {
    const scalar: Record<string, unknown> = {};
    const membership: [string, readonly unknown[]][] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return [];
        }
        membership.push([key, value]);
      } else {
        scalar[key] = value;
      }
    }
    let rows = (await query.where(scalar as GtfsEqualityFilter<Name>).all())
      .filter((row) =>
        membership.every(([key, values]) =>
          values.includes((row as Record<string, unknown>)[key]),
        ),
      )
      .map(convert);
    if (order.length > 0) {
      rows = orderBy(
        rows,
        order.map(([key]) => key),
        order.map(([, direction]) => direction.toLowerCase() as 'asc' | 'desc'),
      );
    }
    if (fields.length > 0) {
      rows = uniqBy(
        rows.map((row) => pick(row, fields) as Output),
        (row) => JSON.stringify(row),
      );
    }
    return rows;
  };
}

export function createGtfsReader(gtfs: Gtfs) {
  if (gtfs.sourceIds?.length !== 1) {
    throw new Error('Rendering requires exactly one GTFS source');
  }
  return {
    gtfs,
    agencies: reader(gtfs.schedule.agency),
    feedInfo: reader(gtfs.schedule.feedInfo),
    calendars: reader(gtfs.schedule.calendar),
    calendarDates: reader(gtfs.schedule.calendarDates),
    routes: reader(gtfs.schedule.routes),
    trips: reader(gtfs.schedule.trips),
    stops: reader(gtfs.schedule.stops),
    shapes: reader(gtfs.schedule.shapes),
    stopAttributes: reader(gtfs.gtfsPlus.stopAttributes),
    timetableNotes: reader(gtfs.gtfsToHtml.timetableNotes),
    timetableNotesReferences: reader(gtfs.gtfsToHtml.timetableNotesReferences),
    timetablePages: reader(gtfs.gtfsToHtml.timetablePages),
    timetableStopOrders: reader(gtfs.gtfsToHtml.timetableStopOrder),
    timetables: reader(gtfs.gtfsToHtml.timetables),
    frequencies: reader(gtfs.schedule.frequencies),
    stoptimes: reader(gtfs.schedule.stopTimes),
  };
}

export type GtfsReader = ReturnType<typeof createGtfsReader>;
