import { log } from './log-utils.js';
import type { GtfsReader } from './gtfs-reader.js';
import {
  cloneDeep,
  compact,
  countBy,
  entries,
  every,
  find,
  findLast,
  first,
  flatMap,
  flow,
  groupBy,
  head,
  last,
  maxBy,
  orderBy,
  partialRight,
  reduce,
  size,
  some,
  sortBy,
  uniq,
  uniqBy,
  zip,
} from 'lodash-es';
import type * as Gtfs from 'gtfs';
import type { Row } from '../types/gtfs.js';
import { stringify } from 'csv-stringify';
import moment from 'moment';
import toposort from 'toposort';

import { generateTimetablePageFileName, renderTemplate } from './file-utils.js';
import {
  formatDate,
  formatDays,
  formatDaysLong,
  formatFrequency,
  formatListForDisplay,
  formatRouteName,
  formatStopName,
  formatStops,
  formatTimetableId,
  formatTimetableLabel,
  formatTripContinuesAs,
  formatTripContinuesFrom,
  isNullOrEmpty,
  mergeTimetablesWithSameId,
  resetStoptimesToMidnight,
  timeToSeconds,
  updateStoptimesByOffset,
} from './formatters.js';
import { getTimetableGeoJSON, getAgencyGeoJSON } from './geojson-utils.js';
import { getBaseTripIds } from './trip-id-utils.js';
import {
  calendarToCalendarCode,
  combineCalendars,
  secondsAfterMidnight,
  calendarToDateList,
} from './time-utils.js';
import { formatTripNameForCSV } from './template-functions.js';
import {
  GtfsToHtmlError,
  GtfsToHtmlErrorCategory,
  GtfsToHtmlErrorCode,
} from './errors.js';

import type {
  BlockTrip,
  Config,
  FormattedStop,
  FormattedTimetable,
  FormattedTimetablePage,
  FormattedTrip,
  TimetablePageSummary,
} from '../types/index.ts';

import packageJson from '../../package.json' with { type: 'json' };
const { version } = packageJson;

/*
 * Determine if a stoptime is a timepoint.
 */
export const isTimepoint = (stoptime: {
  timepoint: number | null;
  arrival_time: string | null;
  departure_time: string | null;
}) => {
  if (isNullOrEmpty(stoptime.timepoint)) {
    return (
      !isNullOrEmpty(stoptime.arrival_time) &&
      !isNullOrEmpty(stoptime.departure_time)
    );
  }

  return stoptime.timepoint === 1;
};

/*
 * Find the longest trip (most stops) in a group of trips and return stoptimes.
 */
const getLongestTripStoptimes = (trips: FormattedTrip[], config: Config) => {
  const filteredTripStoptimes = trips.map((trip) =>
    trip.stoptimes.filter((stoptime) => {
      // If `showOnlyTimepoint` is true, then filter out all non-timepoints.
      if (config.showOnlyTimepoint === true) {
        return isTimepoint(stoptime);
      }
      return true;
    }),
  );

  return maxBy(filteredTripStoptimes, (stoptimes) => size(stoptimes));
};

/*
 * Find the first stop_id that all trips have in common, otherwise use the first
 * stoptime.
 */
const findCommonStopId = (trips: FormattedTrip[], config: Config) => {
  const longestTripStoptimes = getLongestTripStoptimes(trips, config);

  if (!longestTripStoptimes) {
    return null;
  }

  const commonStoptime = longestTripStoptimes.find((stoptime, idx) => {
    // If longest trip is a loop (first and last stops the same), then skip first stoptime.
    if (idx === 0 && stoptime.stop_id === last(longestTripStoptimes)?.stop_id) {
      return false;
    }

    // If stoptime doesn't have a time, skip it.
    if (isNullOrEmpty(stoptime.arrival_time)) {
      return false;
    }

    // Check if all trips have this stoptime and that they have a time.
    return every(trips, (trip) =>
      trip.stoptimes.find(
        (tripStoptime) =>
          tripStoptime.stop_id === stoptime.stop_id &&
          tripStoptime.arrival_time !== null,
      ),
    );
  });

  return commonStoptime ? commonStoptime.stop_id : null;
};

/*
 * Return a set of unique trips based on departure and arrival times.
 */
const deduplicateTrips = (trips: FormattedTrip[]) => {
  if (trips.length <= 1) {
    return trips;
  }

  const uniqueTrips = new Map<string, FormattedTrip>();

  for (const trip of trips) {
    // Create a unique signature for this trip based on departure and arrival times.
    const tripSignature = trip.stoptimes
      .map(
        (stoptime) =>
          `${stoptime.stop_id}|${stoptime.departure_time}|${stoptime.arrival_time}`,
      )
      .join('|');

    if (!uniqueTrips.has(tripSignature)) {
      uniqueTrips.set(tripSignature, trip);
    } else {
      // Duplicate trip found. Add additional service_id to trip for duplicate trip.
      const existingTrip = uniqueTrips.get(tripSignature);
      if (!existingTrip) {
        continue;
      }

      if (!existingTrip.additional_service_ids) {
        existingTrip.additional_service_ids = [];
      }

      existingTrip.additional_service_ids.push(trip.service_id);
      uniqueTrips.set(tripSignature, existingTrip);
    }
  }

  return Array.from(uniqueTrips.values());
};

/*
 * Sort trips chronologically, using specified config.sortingAlgorithm
 */
const sortTrips = (trips: FormattedTrip[], config: Config): FormattedTrip[] => {
  let sortedTrips;
  let commonStopId;

  if (config.sortingAlgorithm === 'common') {
    // Sort trips chronologically using the stoptime of a common stop across all trips.

    commonStopId = findCommonStopId(trips, config);

    if (commonStopId) {
      sortedTrips = sortTripsByStoptimeAtStop(trips, commonStopId);
    } else {
      // Default to 'beginning' if no common stop is found.
      sortedTrips = sortTrips(trips, {
        ...config,
        sortingAlgorithm: 'beginning',
      });
    }
  } else if (config.sortingAlgorithm === 'beginning') {
    // Sort trips chronologically using first stoptime of each trip, which can be at different stops.

    for (const trip of trips) {
      if (trip.stoptimes.length === 0) {
        continue;
      }

      trip.firstStoptime = timeToSeconds(trip.stoptimes[0].departure_time);
      trip.lastStoptime = timeToSeconds(
        trip.stoptimes[trip.stoptimes.length - 1].departure_time,
      );
    }

    sortedTrips = sortBy(trips, ['firstStoptime', 'lastStoptime']);
  } else if (config.sortingAlgorithm === 'end') {
    // Sort trips chronologically using last stoptime of each trip, which can be at different stops.

    for (const trip of trips) {
      if (trip.stoptimes.length === 0) {
        continue;
      }

      trip.firstStoptime = timeToSeconds(trip.stoptimes[0].departure_time);
      trip.lastStoptime = timeToSeconds(
        trip.stoptimes[trip.stoptimes.length - 1].departure_time,
      );
    }

    sortedTrips = sortBy(trips, ['lastStoptime', 'firstStoptime']);
  } else if (config.sortingAlgorithm === 'first') {
    // Sort trips chronologically using the stoptime of a the first stop of the longest trip.

    const longestTripStoptimes = getLongestTripStoptimes(trips, config);
    const firstStopId = first(longestTripStoptimes)?.stop_id ?? '';
    sortedTrips = sortTripsByStoptimeAtStop(trips, firstStopId);
  } else if (config.sortingAlgorithm === 'last') {
    // Sort trips chronologically using the stoptime of a the last stop of the longest trip.

    const longestTripStoptimes = getLongestTripStoptimes(trips, config);
    const lastStopId = last(longestTripStoptimes)?.stop_id ?? '';
    sortedTrips = sortTripsByStoptimeAtStop(trips, lastStopId);
  }

  return sortedTrips ?? [];
};

/*
 * Sort trips by stoptime at a specific stop
 */
const sortTripsByStoptimeAtStop = (trips: FormattedTrip[], stopId: string) =>
  sortBy(trips, (trip) => {
    const stoptime = find(trip.stoptimes, { stop_id: stopId });
    return stoptime ? timeToSeconds(stoptime.departure_time) : undefined;
  });

/*
 * Get all calendar dates for a specific timetable.
 */
const getCalendarDatesForTimetable = async (
  data: GtfsReader,
  timetable: FormattedTimetable,
  config: Config,
) => {
  const calendarDates = await data.calendarDates(
    {
      service_id: timetable.service_ids,
    },
    [],
    [['date', 'ASC']],
  );
  const start = moment(timetable.start_date, 'YYYYMMDD');
  const end = moment(timetable.end_date, 'YYYYMMDD');
  const excludedDates = new Set<string>();
  const includedDates = new Set<string>();

  for (const calendarDate of calendarDates) {
    if (
      moment(calendarDate.date, 'YYYYMMDD').isBetween(
        start,
        end,
        undefined,
        '[]',
      )
    ) {
      if (calendarDate.exception_type === 1) {
        includedDates.add(formatDate(calendarDate, config.dateFormat));
      } else if (calendarDate.exception_type === 2) {
        excludedDates.add(formatDate(calendarDate, config.dateFormat));
      }
    }
  }

  // Remove dates that are both included and excluded from both lists
  const includedAndExcludedDates = new Set(
    [...excludedDates].filter((date) => includedDates.has(date)),
  );

  return {
    excludedDates: [...excludedDates].filter(
      (date) => !includedAndExcludedDates.has(date),
    ),
    includedDates: [...includedDates].filter(
      (date) => !includedAndExcludedDates.has(date),
    ),
  };
};

/*
 * Get days of the week from calendars.
 */
interface WeekdayFlagsRequired {
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
}

const getDaysFromCalendars = (
  calendars: WeekdayFlagsRequired[],
): WeekdayFlagsRequired => {
  const days: WeekdayFlagsRequired = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0,
  };

  for (const calendar of calendars) {
    for (const day of Object.keys(days) as (keyof typeof days)[]) {
      days[day] = days[day] | calendar[day];
    }
  }

  return days;
};

/*
 * Group weekdays that have the same active services. Calendar patterns can
 * overlap (for example, daily service plus extra weekend trips).
 */
const groupCalendarsByActiveDays = (calendars: Row<Gtfs.Calendar>[]) => {
  const emptyDays = getDaysFromCalendars([]);
  const groups = new Map<
    string,
    {
      calendars: Row<Gtfs.Calendar>[];
      days: WeekdayFlagsRequired;
    }
  >();

  for (const day of Object.keys(emptyDays) as (keyof typeof emptyDays)[]) {
    const activeCalendars = calendars.filter((calendar) => calendar[day] === 1);
    if (activeCalendars.length === 0) {
      continue;
    }
    const key = JSON.stringify(
      activeCalendars.map((calendar) => calendar.service_id).sort(),
    );
    let group = groups.get(key);
    if (!group) {
      group = { calendars: activeCalendars, days: { ...emptyDays } };
      groups.set(key, group);
    }
    group.days[day] = 1;
  }

  return [...groups.values()].map((group) =>
    group.calendars.map((calendar) => ({ ...calendar, ...group.days })),
  );
};

/*
 * Get the `trip_headsign` for a specific timetable.
 */
const getDirectionHeadsignFromTimetable = async (
  data: GtfsReader,
  timetable: FormattedTimetable,
) => {
  const trips = await data.trips(
    {
      direction_id: timetable.direction_id,
      route_id: timetable.route_ids,
    },
    ['trip_headsign'],
  );

  if (trips.length === 0) {
    return '';
  }

  const mostCommonHeadsign = flow(
    countBy,
    entries,
    partialRight(maxBy, last),
    head,
  )(compact(trips.map((trip) => trip.trip_headsign)));

  return mostCommonHeadsign as string;
};

/*
 * Get the notes for a specific timetable.
 */
const getTimetableNotesForTimetable = async (
  data: GtfsReader,
  timetable: FormattedTimetable,
  config: Config,
) => {
  const noteReferences = [
    // Get all notes for this timetable.
    ...(await data.timetableNotesReferences({
      timetable_id: timetable.timetable_id,
    })),

    // Get all notes for this route.
    ...(await data.timetableNotesReferences({
      route_id: timetable.routes.map((route) => route.route_id),
      timetable_id: null,
    })),

    // Get all notes for all trips in this timetable.
    ...(await data.timetableNotesReferences({
      trip_id: getBaseTripIds(timetable.orderedTrips),
    })),

    // Get all notes for all stops in this timetable.
    ...(await data.timetableNotesReferences({
      stop_id: timetable.stops.map((stop) => stop.stop_id),
      trip_id: null,
      route_id: null,
      timetable_id: null,
    })),
  ];

  const usedNoteReferences = [];
  // Check if stop_sequence matches any trip.
  for (const noteReference of noteReferences) {
    if (noteReference.stop_sequence === null) {
      usedNoteReferences.push(noteReference);
      continue;
    }

    // Note references with stop_sequence must also have stop_id.
    if (noteReference.stop_id === '' || noteReference.stop_id === null) {
      timetable.warnings?.push(
        `Timetable Note Reference for note_id=${noteReference.note_id} has a \`stop_sequence\` but no \`stop_id\` - ignoring`,
      );
      continue;
    }

    const stop = timetable.stops.find(
      (stop) => stop.stop_id === noteReference.stop_id,
    );

    if (!stop) {
      continue;
    }

    const tripWithMatchingStopSequence = stop.trips.find(
      (trip) => trip.stop_sequence === noteReference.stop_sequence,
    );

    if (tripWithMatchingStopSequence) {
      usedNoteReferences.push(noteReference);
    }
  }

  const notes = (
    await data.timetableNotes({
      note_id: usedNoteReferences.map((noteReference) => noteReference.note_id),
    })
  ).map((note) => ({ ...note }));

  // Assign symbols to each note if unassigned. Use a-z then default to integers.
  const symbols = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let symbolIndex = 0;
  for (const note of notes) {
    if (note.symbol === '' || note.symbol === null) {
      note.symbol =
        symbolIndex < symbols.length - 1
          ? symbols[symbolIndex]
          : String(symbolIndex - symbols.length);
      symbolIndex += 1;
    }
  }

  const formattedNotes = usedNoteReferences.map((noteReference) => ({
    ...noteReference,
    ...notes.find((note) => note.note_id === noteReference.note_id),
  }));

  return sortBy(formattedNotes, 'symbol');
};

/*
 * Create a timetable page from timetables. Used if no
 * `timetable_pages.txt` is present.
 */
const createTimetablePage = async (
  data: GtfsReader,
  {
    timetablePageId,
    timetables,
    config,
  }: {
    timetablePageId: string;
    timetables: FormattedTimetable[];
    config: Config;
  },
) => {
  const updatedTimetables = await Promise.all(
    timetables.map(async (timetable) => {
      if (!timetable.routes) {
        timetable.routes = await data.routes({
          route_id: timetable.route_ids,
        });
      }

      return timetable;
    }),
  );

  const timetablePage = {
    timetable_page_id: timetablePageId,
    timetables: updatedTimetables,
    routes: updatedTimetables.flatMap((timetable) => timetable.routes),
  };

  const filename = generateTimetablePageFileName(timetablePage, config);

  return {
    ...timetablePage,
    filename,
  };
};

/*
 * Create a timetable from a route/direction/calendars/calendarDates. Used if no `timetables.txt` is present.
 */
const createTimetable = ({
  route,
  directionId,
  tripHeadsign,
  calendars,
  calendarDates,
}: {
  route: Row<Gtfs.Routes>;
  directionId?: number | null;
  tripHeadsign?: string | null;
  calendars?: Row<Gtfs.Calendar>[];
  calendarDates?: Row<Gtfs.CalendarDates>[];
}) => {
  const serviceIds = uniq([
    ...(calendars?.map((calendar) => calendar.service_id) ?? []),
    ...(calendarDates?.map((calendarDate) => calendarDate.service_id) ?? []),
  ]);

  const days: {
    monday: null | 0 | 1;
    tuesday: null | 0 | 1;
    wednesday: null | 0 | 1;
    thursday: null | 0 | 1;
    friday: null | 0 | 1;
    saturday: null | 0 | 1;
    sunday: null | 0 | 1;
  } = {
    monday: null,
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  };
  let startDate: number | null = null;
  let endDate: number | null = null;

  if (calendars && calendars.length > 0) {
    Object.assign(days, getDaysFromCalendars(calendars));

    startDate = parseInt(
      moment
        .min(
          calendars.map((calendar) => moment(calendar.start_date, 'YYYYMMDD')),
        )
        .format('YYYYMMDD'),
      10,
    );

    endDate = parseInt(
      moment
        .max(calendars.map((calendar) => moment(calendar.end_date, 'YYYYMMDD')))
        .format('YYYYMMDD'),
      10,
    );
  }

  if ((!calendars || calendars.length === 0) && calendarDates?.length) {
    startDate = Math.min(...calendarDates.map((row) => row.date));
    endDate = Math.max(...calendarDates.map((row) => row.date));
  }

  const timetableId = formatTimetableId({
    routeIds: [route.route_id],
    directionId: directionId,
    days: days,
    dates: calendarDates?.map((calendarDate) => calendarDate.date),
  });

  return {
    timetable_id: timetableId,
    route_ids: [route.route_id],
    direction_id: directionId ?? null,
    direction_name: tripHeadsign ?? null,
    routes: [route],
    include_exceptions: calendarDates && calendarDates.length > 0 ? 1 : 0,
    service_ids: serviceIds,
    service_notes: null,
    timetable_label: null,
    start_time: null,
    end_time: null,
    orientation: null,
    timetable_sequence: null,
    show_trip_continuation: null,
    start_date: startDate,
    end_date: endDate,
    ...days,
  } as FormattedTimetable;
};

/*
 * Create timetable pages for all routes in an agency. Used if no
 * `timetables.txt` is present.
 */
const convertRoutesToTimetablePages = async (
  data: GtfsReader,
  config: Config,
) => {
  const routes = await data.routes();
  const timetablePages: FormattedTimetablePage[] = [];
  const { calendars, calendarDates } = await getCalendarsFromConfig(
    data,
    config,
  );

  for (const route of routes) {
    const trips = await data.trips(
      {
        route_id: route.route_id,
      },
      ['trip_headsign', 'direction_id', 'trip_id', 'service_id'],
    );
    const uniqueTripDirections = orderBy(
      uniqBy(trips, (trip) => trip.direction_id),
      'direction_id',
    );
    const calendarDateGroups = groupBy(calendarDates, 'service_id');

    const timetables: FormattedTimetable[] = [];

    for (const uniqueTripDirection of uniqueTripDirections) {
      const directionServiceIds = new Set(
        trips
          .filter(
            (trip) => trip.direction_id === uniqueTripDirection.direction_id,
          )
          .map((trip) => trip.service_id),
      );
      const calendarGroups = groupCalendarsByActiveDays(
        calendars.filter((calendar) =>
          directionServiceIds.has(calendar.service_id),
        ),
      );
      for (const calendars of calendarGroups) {
        const tripsForCalendars = trips.filter((trip) =>
          some(calendars, { service_id: trip.service_id }),
        );
        if (tripsForCalendars.length > 0) {
          timetables.push(
            createTimetable({
              route,
              directionId: uniqueTripDirection.direction_id,
              tripHeadsign: uniqueTripDirection.trip_headsign,
              calendars,
            }),
          );
        }
      }

      for (const calendarDates of Object.values(calendarDateGroups)) {
        const tripsForCalendarDates = trips.filter((trip) =>
          some(calendarDates, { service_id: trip.service_id }),
        );
        if (tripsForCalendarDates.length > 0) {
          timetables.push(
            createTimetable({
              route,
              directionId: uniqueTripDirection.direction_id,
              tripHeadsign: uniqueTripDirection.trip_headsign,
              calendarDates,
            }),
          );
        }
      }
    }

    if (timetables.length === 0) {
      continue;
    }

    if (config.groupTimetablesIntoPages === true) {
      timetablePages.push(
        await createTimetablePage(data, {
          timetablePageId: `route_${route.route_id}`,
          timetables,
          config,
        }),
      );
    } else {
      for (const timetable of timetables) {
        timetablePages.push(
          await createTimetablePage(data, {
            timetablePageId: timetable.timetable_id,
            timetables: [timetable],
            config,
          }),
        );
      }
    }
  }

  return timetablePages;
};

/*
 * Generate all trips based on a start trip and an array of frequencies.
 */
const generateTripsByFrequencies = (
  trip: FormattedTrip,
  frequencies: Row<Gtfs.Frequencies>[],
  config: Config,
) => {
  const formattedFrequencies = frequencies.map((frequency) =>
    formatFrequency(frequency, config),
  );
  const resetTrip = resetStoptimesToMidnight(trip);
  const trips = [];

  for (const frequency of formattedFrequencies) {
    const startSeconds = secondsAfterMidnight(frequency.start_time);
    const endSeconds = secondsAfterMidnight(frequency.end_time);

    for (
      let offset = startSeconds;
      offset < endSeconds;
      offset += frequency.headway_secs
    ) {
      const newTrip = cloneDeep(resetTrip);
      trips.push({
        ...newTrip,
        trip_id: `${resetTrip.trip_id}_freq_${trips.length}`,
        stoptimes: updateStoptimesByOffset(newTrip, offset),
      });
    }
  }

  return trips;
};

/*
 * Check if any stoptimes have different arrival and departure times and
 * if they do, duplicate the stop id unless it is the first or last stop.
 */
const getStopColumns = (
  stopIds: string[],
  timetable: FormattedTimetable,
  config: Config,
): Pick<FormattedStop, 'stop_id' | 'type'>[] => {
  if (
    config.showArrivalOnDifference === null ||
    config.showArrivalOnDifference === undefined
  ) {
    return stopIds.map((stop_id) => ({ stop_id }));
  }

  const splitColumns = new Set<number>();
  for (const trip of timetable.orderedTrips) {
    let column = -1;
    for (let i = 0; i < trip.stoptimes.length; i++) {
      const arrival = trip.stoptimes[i];
      // Adjacent visits to the same stop become one stoptime in filterTrips.
      while (
        i + 1 < trip.stoptimes.length &&
        trip.stoptimes[i + 1].stop_id === arrival.stop_id
      ) {
        i++;
      }
      const next = stopIds.indexOf(arrival.stop_id ?? '', column + 1);
      if (next === -1) {
        continue;
      }
      column = next;
      const departureTime = trip.stoptimes[i].departure_time;
      const dwellSeconds =
        arrival.arrival_time && departureTime
          ? secondsAfterMidnight(departureTime) -
            secondsAfterMidnight(arrival.arrival_time)
          : 0;
      if (
        column > 0 &&
        column < stopIds.length - 1 &&
        dwellSeconds / 60 >= config.showArrivalOnDifference
      ) {
        splitColumns.add(column);
      }
    }
  }
  return stopIds.flatMap((stop_id, index) =>
    splitColumns.has(index)
      ? [
          { stop_id, type: 'arrival' as const },
          { stop_id, type: 'departure' as const },
        ]
      : [{ stop_id }],
  );
};

/*
 * Align two stop sequences on their longest common subsequence. Keeping all
 * unmatched visits gives the shortest order that contains both inputs.
 */
const mergeStopSequences = (order: string[], pattern: string[]): string[] => {
  let matched = 0;
  for (const id of order) {
    if (id === pattern[matched]) {
      matched++;
    }
  }
  if (matched === pattern.length) {
    return order;
  }

  const lengths = Array.from(
    { length: order.length + 1 },
    () => new Uint32Array(pattern.length + 1),
  );
  for (let i = order.length - 1; i >= 0; i--) {
    for (let j = pattern.length - 1; j >= 0; j--) {
      if (order[i] === pattern[j]) {
        lengths[i][j] = 1 + lengths[i + 1][j + 1];
      } else {
        lengths[i][j] = Math.max(lengths[i + 1][j], lengths[i][j + 1]);
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
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      merged.push(order[i++]);
    } else {
      merged.push(pattern[j++]);
    }
  }
  return merged.concat(order.slice(i), pattern.slice(j));
};

type GetStop = (id: string) => Promise<Row<Gtfs.Stops>>;

// The haversine term increases with great-circle distance. Comparing it
// directly avoids converting the result to meters.
function stopDistance(from: Row<Gtfs.Stops>, to: Row<Gtfs.Stops>) {
  const { stop_lat: lat1, stop_lon: lon1 } = from;
  const { stop_lat: lat2, stop_lon: lon2 } = to;
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return NaN;
  }
  const radians = Math.PI / 180;
  return (
    Math.sin(((lat2 - lat1) * radians) / 2) ** 2 +
    Math.cos(lat1 * radians) *
      Math.cos(lat2 * radians) *
      Math.sin(((lon2 - lon1) * radians) / 2) ** 2
  );
}

// For a single alternate stop between two known stops, move it to the
// nearer end of the gap, within the bounds imposed by every trip.
async function placeBranchStops(
  order: string[],
  patterns: string[][],
  edges: [string, string][],
  getStop: GetStop,
) {
  if (patterns.length < 2) {
    return;
  }
  const known = new Set<string>();
  for (const pattern of patterns.toSorted((a, b) => b.length - a.length)) {
    for (let i = 1; i < pattern.length - 1; i++) {
      const previous = pattern[i - 1];
      const id = pattern[i];
      const next = pattern[i + 1];
      if (known.has(id) || !known.has(previous) || !known.has(next)) {
        continue;
      }
      const index = order.indexOf(id);
      let earliest = order.indexOf(previous) + 1;
      let latest = order.indexOf(next) - 1;
      if (earliest === latest) {
        continue;
      }
      // Crossing an immediate neighbor in any trip would break that trip's order.
      for (const [from, to] of edges) {
        if (to === id) {
          earliest = Math.max(earliest, order.indexOf(from) + 1);
        }
        if (from === id) {
          latest = Math.min(latest, order.indexOf(to) - 1);
        }
      }
      const [stop, start, end] = await Promise.all([
        getStop(id),
        getStop(previous),
        getStop(next),
      ]);
      const startDistance = stopDistance(stop, start);
      const endDistance = stopDistance(stop, end);
      let target = index;
      if (startDistance < endDistance) {
        target = earliest;
      } else if (endDistance < startDistance) {
        target = latest;
      }
      if (target !== index) {
        order.splice(index, 1);
        order.splice(target, 0, id);
      }
    }
    for (const id of pattern) {
      known.add(id);
    }
  }
}

/*
 * Get a sorted array of stop_ids for a specific timetable.
 */
const getStopOrder = async (
  data: GtfsReader,
  timetable: FormattedTimetable,
  config: Config,
  getStop: GetStop,
) => {
  // First, check if `timetable_stop_order.txt` for route exists
  const timetableStopOrders = await data.timetableStopOrders(
    {
      timetable_id: timetable.timetable_id,
    },
    ['stop_id', 'stop_sequence'],
    [['stop_sequence', 'ASC']],
  );

  if (timetableStopOrders.length > 0) {
    return timetableStopOrders.map(({ stop_id }, index) => {
      const column: Pick<FormattedStop, 'stop_id' | 'type'> = { stop_id };
      if (stop_id === timetableStopOrders[index + 1]?.stop_id) {
        column.type = 'arrival';
      } else if (stop_id === timetableStopOrders[index - 1]?.stop_id) {
        column.type = 'departure';
      }
      return column;
    });
  }

  const timepointStopIds = new Set(
    timetable.orderedTrips.flatMap((trip) =>
      trip.stoptimes.filter(isTimepoint).map((stoptime) => stoptime.stop_id),
    ),
  );
  const patterns = uniqBy(
    timetable.orderedTrips.map((trip) =>
      trip.stoptimes
        .filter(
          (stoptime, index) =>
            (index === 0 ||
              stoptime.stop_id !== trip.stoptimes[index - 1].stop_id) &&
            (!config.showOnlyTimepoint ||
              timepointStopIds.has(stoptime.stop_id)),
        )
        .map((stoptime) => stoptime.stop_id ?? ''),
    ),
    (pattern) => JSON.stringify(pattern),
  );

  const stopGraph: [string, string][] = [];
  for (const pattern of patterns) {
    for (let i = 1; i < pattern.length; i++) {
      stopGraph.push([pattern[i - 1], pattern[i]]);
    }
  }
  if (stopGraph.length === 0 && config.showOnlyTimepoint === true) {
    timetable.warnings?.push(
      `Timetable ${timetable.timetable_id}'s trips have stoptimes with timepoints but \`showOnlyTimepoint\` is true. Try setting \`showOnlyTimepoint\` to false.`,
    );
  }

  let stopIds: string[];
  try {
    stopIds = toposort(stopGraph);
  } catch {
    patterns.sort((a, b) => b.length - a.length);
    stopIds = patterns.reduce(mergeStopSequences, []);
    return getStopColumns(stopIds, timetable, config);
  }
  await placeBranchStops(stopIds, patterns, stopGraph, getStop);
  return getStopColumns(stopIds, timetable, config);
};

/*
 * Get an array of stops for a specific timetable.
 */
const getStopsForTimetable = async (
  data: GtfsReader,
  timetable: FormattedTimetable,
  config: Config,
) => {
  if (timetable.orderedTrips.length === 0) {
    return [];
  }

  const stopCache = new Map<string, Promise<Row<Gtfs.Stops>>>();
  const getStop: GetStop = (stopId) => {
    const cached = stopCache.get(stopId);
    if (cached) {
      return cached;
    }
    const result = data.stops({ stop_id: stopId }).then(([stop]) => {
      if (!stop) {
        throw new GtfsToHtmlError(
          `No stop found for stop_id=${stopId} in timetable_id=${timetable.timetable_id}`,
          {
            code: GtfsToHtmlErrorCode.QUERY_RESULT_NOT_FOUND,
            category: GtfsToHtmlErrorCategory.QUERY,
            details: {
              entity: 'stop',
              stopId,
              timetableId: timetable.timetable_id,
            },
          },
        );
      }
      return stop;
    });
    stopCache.set(stopId, result);
    return result;
  };

  const columns = await getStopOrder(data, timetable, config, getStop);
  const orderedStops: FormattedStop[] = await Promise.all(
    columns.map(async (column) => ({
      ...(await getStop(column.stop_id)),
      ...column,
      trips: [],
    })),
  );

  // If `showStopCity` is true, look up stop attributes.
  if (config.showStopCity) {
    const stopAttributes = await data.stopAttributes({
      stop_id: columns.map((column) => column.stop_id),
    });

    for (const stopAttribute of stopAttributes) {
      const stop = orderedStops.find(
        (stop) => stop.stop_id === stopAttribute.stop_id,
      );

      if (stop) {
        stop.stop_city = stopAttribute.stop_city;
      }
    }
  }

  return orderedStops;
};

const validateDate = (
  value: string | number | null | undefined,
  field: string,
) => {
  if (
    value &&
    !moment(value, typeof value === 'number' ? 'YYYYMMDD' : undefined).isValid()
  ) {
    throw new GtfsToHtmlError(`Invalid ${field}=${value}`, {
      code: GtfsToHtmlErrorCode.CONFIG_DATE_INVALID,
      category: GtfsToHtmlErrorCategory.CONFIG,
    });
  }
};

const getCalendarsFromConfig = async (data: GtfsReader, config: Config) => {
  validateDate(config.startDate, 'startDate');
  validateDate(config.endDate, 'endDate');
  const start = config.startDate
    ? Number(moment(config.startDate).format('YYYYMMDD'))
    : null;
  const end = config.endDate
    ? Number(moment(config.endDate).format('YYYYMMDD'))
    : null;
  const calendars = (await data.calendars()).filter(
    (row) =>
      (!end || row.start_date <= end) && (!start || row.end_date >= start),
  );
  const serviceIds = new Set(calendars.map((row) => row.service_id));
  const calendarDates = (
    await data.calendarDates({ exception_type: 1 })
  ).filter(
    (row) =>
      !serviceIds.has(row.service_id) &&
      (!start || row.date >= start) &&
      (!end || row.date <= end),
  );
  return { calendars, calendarDates };
};

const getCalendarsFromTimetable = async (
  data: GtfsReader,
  timetable: FormattedTimetable,
  config: Config,
) => {
  validateDate(timetable.start_date, 'start_date');
  validateDate(timetable.end_date, 'end_date');
  const days = getDaysFromCalendars([timetable]);
  const activeDays = Object.entries(days)
    .filter(([, value]) => value === 1)
    .map(([day]) => day as keyof typeof days);
  return (await data.calendars()).filter(
    (row) =>
      (!timetable.end_date || row.start_date <= timetable.end_date) &&
      (!timetable.start_date || row.end_date >= timetable.start_date) &&
      (activeDays.length === 0 || activeDays.some((day) => row[day] === 1)),
  );
};

const getCalendarDatesForDateRange = async (
  data: GtfsReader,
  startDate: number | null | undefined,
  endDate: number | null | undefined,
  config: Config,
) => {
  return (await data.calendarDates()).filter(
    (row) =>
      (!endDate || row.date <= endDate) &&
      (!startDate || row.date >= startDate),
  );
};

/*
 * For a specific stop_id, returns an array all stop_ids within a parent station
 * and the stop_id of parent station itself. If no parent station, it returns the
 * stop_id.
 */
const getAllStationStopIds = async (data: GtfsReader, stopId: string) => {
  const stops = await data.stops({
    stop_id: stopId,
  });

  if (stops.length === 0) {
    throw new GtfsToHtmlError(`No stop found for stop_id=${stopId}`, {
      code: GtfsToHtmlErrorCode.QUERY_RESULT_NOT_FOUND,
      category: GtfsToHtmlErrorCategory.QUERY,
      details: { entity: 'stop', stopId },
    });
  }

  const stop = stops[0];

  if (isNullOrEmpty(stop.parent_station)) {
    return [stopId];
  }

  const stopsInParentStation = await data.stops(
    {
      parent_station: stop.parent_station,
    },
    ['stop_id'],
  );

  return [
    stop.parent_station,
    ...stopsInParentStation.map((stop) => stop.stop_id),
  ];
};

/*
 * Get trips with the same `block_id`.
 */
const getTripsWithSameBlock = async (
  data: GtfsReader,
  trip: FormattedTrip,
  timetable: FormattedTimetable,
): Promise<BlockTrip[]> => {
  const trips = (await data.trips(
    {
      block_id: trip.block_id,
      service_id: timetable.service_ids,
    },
    ['trip_id', 'route_id'],
  )) as BlockTrip[];

  for (const blockTrip of trips) {
    const stopTimes = await data.stoptimes(
      {
        trip_id: blockTrip.trip_id,
      },
      [],
      [['stop_sequence', 'ASC']],
    );

    if (stopTimes.length === 0) {
      throw new GtfsToHtmlError(
        `No stoptimes found found for trip_id=${blockTrip.trip_id}`,
        {
          code: GtfsToHtmlErrorCode.QUERY_RESULT_NOT_FOUND,
          category: GtfsToHtmlErrorCategory.QUERY,
          details: { entity: 'stoptime', tripId: blockTrip.trip_id },
        },
      );
    }

    blockTrip.firstStoptime = first(stopTimes);
    blockTrip.lastStoptime = last(stopTimes);
  }

  return sortBy(trips, (trip) =>
    secondsAfterMidnight(trip.firstStoptime?.departure_time ?? null),
  );
};

/*
 * Get next trip and previous trip with the same `block_id` if it arrives or
 * departs from the same stop and is a different route.
 */
const addTripContinuation = async (
  data: GtfsReader,
  trip: FormattedTrip,
  timetable: FormattedTimetable,
) => {
  if (!trip.block_id || trip.stoptimes.length === 0) {
    return;
  }

  const maxContinuesAsWaitingTimeSeconds = 60 * 60;

  const firstStoptime = first(trip.stoptimes);
  const lastStoptime = last(trip.stoptimes);

  if (!firstStoptime || !lastStoptime) {
    return;
  }

  const firstStopIds = await getAllStationStopIds(
    data,
    firstStoptime.stop_id ?? '',
  );
  const lastStopIds = await getAllStationStopIds(
    data,
    lastStoptime.stop_id ?? '',
  );
  const blockTrips = await getTripsWithSameBlock(data, trip, timetable);

  // "Continues From" trips must be the previous trip chronologically.
  const previousTrip = findLast(
    blockTrips,
    (blockTrip) =>
      secondsAfterMidnight(blockTrip.lastStoptime?.arrival_time ?? null) <=
      secondsAfterMidnight(firstStoptime.departure_time ?? null),
  );

  /*
   * "Continues From" trips
   * * must be a different route_id
   * * must not be more than 60 minutes before
   * * must have their last stop_id be the same as the next trip's first stop_id
   */
  if (
    previousTrip &&
    previousTrip.route_id !== trip.route_id &&
    secondsAfterMidnight(previousTrip.lastStoptime?.arrival_time ?? null) >=
      secondsAfterMidnight(firstStoptime.departure_time ?? null) -
        maxContinuesAsWaitingTimeSeconds &&
    firstStopIds.includes(previousTrip.lastStoptime?.stop_id ?? '')
  ) {
    const routes = await data.routes({
      route_id: previousTrip.route_id,
    });

    previousTrip.route = routes[0];

    trip.continues_from_route = previousTrip;
  }

  // "Continues As" trips must be the next trip chronologically.
  const nextTrip = find(
    blockTrips,
    (blockTrip) =>
      secondsAfterMidnight(blockTrip.firstStoptime?.departure_time ?? null) >=
      secondsAfterMidnight(lastStoptime.arrival_time ?? null),
  );

  // "Continues As" trips must be a different route_id.
  /*
   * "Continues As" trips
   * * must be a different route_id
   * * must not be more than 60 minutes later
   * * must have their first stop_id be the same as the previous trip's last stop_id
   */
  if (
    nextTrip &&
    nextTrip.route_id !== trip.route_id &&
    secondsAfterMidnight(nextTrip.firstStoptime?.departure_time ?? null) <=
      secondsAfterMidnight(lastStoptime.arrival_time ?? null) +
        maxContinuesAsWaitingTimeSeconds &&
    lastStopIds.includes(nextTrip.firstStoptime?.stop_id ?? '')
  ) {
    const routes = await data.routes({
      route_id: nextTrip.route_id,
    });

    nextTrip.route = routes[0];
    trip.continues_as_route = nextTrip;
  }
};

/*
 * Apply time range filters to trips and remove trips with less than two stoptimes for stops used in this timetable.
 * Stops can be excluded by using `timetable_stop_order.txt`. Additionally, remove trip stoptimes for unused stops.
 */
const filterTrips = (
  timetable: FormattedTimetable,
  calendars: Row<Gtfs.Calendar>[],
  config: Config,
) => {
  let filteredTrips = timetable.orderedTrips;

  // Combine adjacent stoptimes with the same `stop_id`
  for (const trip of filteredTrips) {
    const combinedStoptimes = [];

    for (const [index, stoptime] of trip.stoptimes.entries()) {
      if (
        index === 0 ||
        stoptime.stop_id !== trip.stoptimes[index - 1].stop_id
      ) {
        combinedStoptimes.push(stoptime);
      } else {
        // The `stoptime` is the same as previous, use `arrival_time` from previous and `departure_time` from this stoptime
        combinedStoptimes[combinedStoptimes.length - 1].departure_time =
          stoptime.departure_time;
      }
    }

    // Select the departure at the actual origin before filtering out hidden stops.
    const origin = combinedStoptimes[0];
    if (
      origin?.departure_time &&
      origin.departure_time !== origin.arrival_time
    ) {
      origin.type = 'departure';
    }
    trip.stoptimes = combinedStoptimes;
  }

  // Remove stoptimes for stops not used in timetable
  const timetableStopIds = new Set(timetable.stops.map((stop) => stop.stop_id));
  for (const trip of filteredTrips) {
    trip.stoptimes = trip.stoptimes.filter((stoptime) =>
      timetableStopIds.has(stoptime.stop_id ?? ''),
    );
  }

  // Exclude trips with less than two stops
  filteredTrips = filteredTrips.filter((trip) => trip.stoptimes.length > 1);

  // Keep every matching GTFS ID for realtime lookup, even when identical
  // schedules are combined into a single displayed trip below.
  timetable.trip_ids = getBaseTripIds(filteredTrips);

  if (config.showDuplicateTrips === false) {
    filteredTrips = deduplicateTrips(filteredTrips);
  }

  // Warn about any trip that doesn't run on every day of the week that the
  // timetable covers. This catches cases like a Sat+Sun timetable where
  // some trips only run on Saturday, a Mon-Fri timetable where a trip
  // skips Wednesday, or a Sat+Sun timetable where trips run differently on
  // each day.
  const dayNames = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const;
  const timetableDays = dayNames.filter((day) => timetable[day] === 1);

  if (timetableDays.length > 1) {
    const warnedServiceIds = new Set<string>();

    for (const trip of filteredTrips) {
      const tripServiceIds = [
        trip.service_id,
        ...(trip.additional_service_ids ?? []),
      ];
      const tripCalendars = calendars.filter((c) =>
        tripServiceIds.includes(c.service_id),
      );

      if (tripCalendars.length === 0) {
        continue;
      }

      const tripDays = getDaysFromCalendars(tripCalendars);
      const missingDays = timetableDays.filter(
        (day) => (tripDays[day] ?? 0) !== 1,
      );

      if (missingDays.length > 0) {
        const serviceIdKey = tripServiceIds.sort().join('|');
        if (!warnedServiceIds.has(serviceIdKey)) {
          warnedServiceIds.add(serviceIdKey);
          const tripDayList = formatDays(tripDays, config);
          const timetableDayList = formatDays(timetable, config);
          timetable.warnings?.push(
            `Timetable ${timetable.timetable_id} (Routes: ${timetable.routes.map((route) => route.route_short_name).join(', ')}) covers ${timetableDayList} but some trips (service_id=${tripServiceIds.join(', ')}) only run on ${tripDayList}. This may indicate a data issue in the GTFS or that you should generate separate timetables for different days of the week.`,
          );
        }
      }
    }
  }

  // Add day list and route short name to trips
  const formattedTrips = filteredTrips.map((trip) => {
    const tripCalendars =
      calendars.filter((calendar) => {
        return [
          trip.service_id,
          ...(trip.additional_service_ids || []),
        ].includes(calendar.service_id);
      }) ?? [];
    trip.dayList = formatDays(combineCalendars(tripCalendars), config);
    trip.dayListLong = formatDaysLong(trip.dayList, config);

    if (timetable.routes.length === 1) {
      trip.route_short_name = timetable.routes[0].route_short_name;
    } else {
      const route = timetable.routes.find(
        (route) => route.route_id === trip.route_id,
      );
      trip.route_short_name = route?.route_short_name;
    }

    return trip;
  });

  return formattedTrips;
};

/*
 * Get all trips from a timetable.
 */

const getTripsForTimetable = async (
  data: GtfsReader,
  timetable: FormattedTimetable,
  calendars: Row<Gtfs.Calendar>[],
  config: Config,
) => {
  const tripQuery: {
    route_id: string[];
    service_id?: string[];
    direction_id?: number;
  } = {
    route_id: timetable.route_ids,
    service_id: timetable.service_ids,
  };

  if (!isNullOrEmpty(timetable.direction_id)) {
    tripQuery.direction_id = timetable.direction_id;
  }

  const trips = (await data.trips(tripQuery)) as FormattedTrip[];

  if (trips.length === 0) {
    timetable.warnings?.push(
      `No trips found for route_id=${timetable.route_ids.join(
        '_',
      )}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(
        timetable.service_ids,
      )}, timetable_id=${timetable.timetable_id}`,
    );
  }

  const frequencies = await data.frequencies({
    trip_id: trips.map((trip) => trip.trip_id),
  });

  // Updated timetable.serviceIds with only the service IDs actually used in one or more trip.
  timetable.service_ids = uniq(trips.map((trip) => trip.service_id));

  const formattedTrips: FormattedTrip[] = [];

  for (const trip of trips) {
    const formattedTrip = trip;
    formattedTrip.stoptimes = await data.stoptimes(
      {
        trip_id: formattedTrip.trip_id,
      },
      [],
      [['stop_sequence', 'ASC']],
    );

    if (formattedTrip.stoptimes.length === 0) {
      timetable.warnings?.push(
        `No stoptimes found for trip_id=${
          formattedTrip.trip_id
        }, route_id=${timetable.route_ids.join('_')}, timetable_id=${
          timetable.timetable_id
        }`,
      );
    }

    // Exclude trips before timetable start_time
    if (
      !isNullOrEmpty(timetable.start_time) &&
      secondsAfterMidnight(trip.stoptimes[0].arrival_time ?? null) <
        secondsAfterMidnight(timetable.start_time)
    ) {
      continue;
    }

    // Exclude trips after timetable end_time
    if (
      !isNullOrEmpty(timetable.end_time) &&
      secondsAfterMidnight(trip.stoptimes[0].arrival_time ?? null) >=
        secondsAfterMidnight(timetable.end_time)
    ) {
      continue;
    }

    if (timetable.show_trip_continuation) {
      await addTripContinuation(data, formattedTrip, timetable);

      if (formattedTrip.continues_as_route) {
        timetable.has_continues_as_route = true;
      }

      if (formattedTrip.continues_from_route) {
        timetable.has_continues_from_route = true;
      }
    }

    const tripFrequencies = frequencies.filter(
      (frequency) => frequency.trip_id === trip.trip_id,
    );

    if (tripFrequencies.length === 0) {
      formattedTrips.push(formattedTrip);
    } else {
      const frequencyTrips = generateTripsByFrequencies(
        formattedTrip,
        tripFrequencies,
        config,
      );
      formattedTrips.push(...frequencyTrips);
      timetable.frequencies = frequencies;
      timetable.frequencyExactTimes = some(frequencies, {
        exact_times: 1,
      });
    }
  }

  if (config.useParentStation) {
    const stopIds = [];

    for (const trip of formattedTrips) {
      for (const stoptime of trip.stoptimes) {
        stopIds.push(stoptime.stop_id);
      }
    }

    const stops = await data.stops(
      {
        stop_id: uniq(stopIds),
      },
      ['parent_station', 'stop_id'],
    );

    for (const trip of formattedTrips) {
      for (const stoptime of trip.stoptimes) {
        const stop = stops.find((stop) => stop.stop_id === stoptime.stop_id);

        if (stop?.parent_station) {
          stoptime.stop_id = stop.parent_station;
        }
      }
    }
  }

  return sortTrips(formattedTrips, config);
};

/*
 * Format timetables for display.
 */
const formatTimetables = async (
  data: GtfsReader,
  timetables: FormattedTimetable[],
  config: Config,
  onWarning: (warning: string) => void,
) => {
  const failedTimetables = new Set<FormattedTimetable>();
  const formattedTimetables = await Promise.all(
    timetables.map(async (timetable) => {
      try {
        timetable.warnings = [];
        const dayList = formatDays(timetable, config);
        const calendars = await getCalendarsFromTimetable(
          data,
          timetable,
          config,
        );
        const serviceIds = new Set();

        // Add all service IDs from calendars
        for (const calendar of calendars) {
          serviceIds.add(calendar.service_id);
        }

        if (timetable.include_exceptions === 1) {
          const calendarDates = await getCalendarDatesForDateRange(
            data,
            timetable.start_date,
            timetable.end_date,
            config,
          );

          const calendarDateGroups = groupBy(calendarDates, 'service_id');

          for (const [serviceId, calendarDateGroup] of Object.entries(
            calendarDateGroups,
          )) {
            // Check if there is a corresponding calendar.txt entry for this service_id
            const calendar = calendars.find(
              (c: Row<Gtfs.Calendar>) => c.service_id === serviceId,
            );

            // Add service_id if any dates are added
            if (
              calendarDateGroup.some(
                (calendarDate) => calendarDate.exception_type === 1,
              )
            ) {
              serviceIds.add(serviceId);
            }

            const calendarDateGroupExceptionType2 = calendarDateGroup.filter(
              (calendarDate) => calendarDate.exception_type === 2,
            );

            // Check if ALL dates are excluded
            if (
              timetable.start_date &&
              timetable.end_date &&
              calendar &&
              calendarDateGroupExceptionType2.length > 0
            ) {
              const datesDuringDateRange = calendarToDateList(
                calendar,
                timetable.start_date,
                timetable.end_date,
              );

              // If no dates are are within the date range, remove service_id
              if (datesDuringDateRange.length === 0) {
                serviceIds.delete(serviceId);
              }

              // Check if every date is excluded and remove service_id if so
              const everyDateIsExcluded = datesDuringDateRange.every(
                (dateDuringDateRange) =>
                  calendarDateGroupExceptionType2.some(
                    (calendarDate) => calendarDate.date === dateDuringDateRange,
                  ),
              );

              if (everyDateIsExcluded) {
                serviceIds.delete(serviceId);
              }
            }
          }
        }

        Object.assign(timetable, {
          noServiceSymbolUsed: false,
          requestDropoffSymbolUsed: false,
          noDropoffSymbolUsed: false,
          requestPickupSymbolUsed: false,
          noPickupSymbolUsed: false,
          interpolatedStopSymbolUsed: false,
          showStopCity: config.showStopCity,
          showStopDescription: config.showStopDescription,
          noServiceSymbol: config.noServiceSymbol,
          requestDropoffSymbol: config.requestDropoffSymbol,
          noDropoffSymbol: config.noDropoffSymbol,
          requestPickupSymbol: config.requestPickupSymbol,
          noPickupSymbol: config.noPickupSymbol,
          interpolatedStopSymbol: config.interpolatedStopSymbol,
          orientation: timetable.orientation || config.defaultOrientation,
          service_ids: Array.from(serviceIds),
          dayList,
          dayListLong: formatDaysLong(dayList, config),
        });

        timetable.orderedTrips = await getTripsForTimetable(
          data,
          timetable,
          calendars,
          config,
        );
        timetable.stops = await getStopsForTimetable(data, timetable, config);
        timetable.calendarDates = await getCalendarDatesForTimetable(
          data,
          timetable,
          config,
        );
        // Preserve the feed label for custom formatting, while keeping the generated
        // label available to existing templates that read timetable_label directly.
        timetable.timetableLabelOverride = timetable.timetable_label ?? null;
        timetable.timetable_label = formatTimetableLabel(timetable);
        timetable.notes = await getTimetableNotesForTimetable(
          data,
          timetable,
          config,
        );

        // Apply the final timetable filters before selecting map geometry.
        timetable.orderedTrips = filterTrips(timetable, calendars, config);
        if (config.showMap) {
          timetable.geojson = await getTimetableGeoJSON(
            data,
            timetable,
            config,
          );
        }

        // Format stops after all timetable properties are assigned
        timetable.stops = formatStops(timetable, config);

        if (isNullOrEmpty(timetable.direction_name)) {
          timetable.direction_name = await getDirectionHeadsignFromTimetable(
            data,
            timetable,
          );
        }
        if (!timetable.routes) {
          timetable.routes = await data.routes({
            route_id: timetable.route_ids,
          });
        }

        return timetable;
      } catch (error: unknown) {
        if (!config.ignoreErrors) {
          throw error;
        }
        failedTimetables.add(timetable);
        onWarning(
          `Skipping timetable_id=${timetable.timetable_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    }),
  );

  return {
    failedTimetables,
    timetables: formattedTimetables.filter(
      (timetable): timetable is FormattedTimetable =>
        timetable !== null &&
        (config.allowEmptyTimetables === true ||
          timetable.orderedTrips.length > 0),
    ),
  };
};

/*
 * Get all timetable pages for an agency.
 */
export async function getTimetablePagesForAgency(
  data: GtfsReader,
  config: Config,
): Promise<FormattedTimetablePage[]> {
  const timetables = mergeTimetablesWithSameId(await data.timetables());
  const routes = await data.routes();
  const formattedTimetables = timetables.map((timetable) => {
    return {
      ...timetable,
      routes: routes.filter((route) =>
        timetable.route_ids.includes(route.route_id),
      ),
    } as FormattedTimetable;
  });

  // If no timetables, build each route and direction into a timetable.
  if (timetables.length === 0) {
    return await convertRoutesToTimetablePages(data, config);
  }

  const timetablePages = await data.timetablePages(
    {},
    [],
    [['timetable_page_id', 'ASC']],
  );

  // Check if there are any timetable pages defined in `timetable_pages.txt`.
  if (timetablePages.length === 0) {
    // If no timetablepages, use timetables
    return await Promise.all(
      formattedTimetables.map(
        async (timetable) =>
          await createTimetablePage(data, {
            timetablePageId: timetable.timetable_id,
            timetables: [timetable],
            config,
          }),
      ),
    );
  }

  // Otherwise, use timetable pages defined in `timetable_pages.txt`.
  return timetablePages.map((timetablePage) => {
    return {
      ...timetablePage,
      timetables: sortBy(
        formattedTimetables.filter(
          (timetable) =>
            timetable.timetable_page_id === timetablePage.timetable_page_id,
        ),
        'timetable_sequence',
      ),
    } as FormattedTimetablePage;
  });
}

const getDataForTimetablePageById = async (
  data: GtfsReader,
  timetablePageId: string,
  config: Config,
) => {
  let calendarCode: string | undefined;
  let calendars;
  let calendarDates;
  let serviceId;
  let directionId: number | null = null;
  const parts = timetablePageId?.split('|') ?? [];
  if (parts.length > 2) {
    directionId = Number.parseInt(parts.pop() ?? '', 10);
    calendarCode = parts.pop();
  } else if (parts.length > 1) {
    directionId = null;
    calendarCode = parts.pop();
  }

  const routeId = parts.join('|');

  const routes = await data.routes({
    route_id: routeId,
  });

  const trips = await data.trips(
    {
      route_id: routeId,
      direction_id: directionId,
    },
    ['trip_headsign', 'direction_id', 'service_id'],
  );
  const uniqueTripDirections = uniqBy(trips, (trip) => trip.direction_id);

  if (uniqueTripDirections.length === 0) {
    throw new GtfsToHtmlError(
      `No trips found for timetable_page_id=${timetablePageId} route_id=${routeId} direction_id=${directionId}`,
      {
        code: GtfsToHtmlErrorCode.QUERY_RESULT_NOT_FOUND,
        category: GtfsToHtmlErrorCategory.QUERY,
        details: {
          entity: 'trip',
          timetablePageId,
          routeId,
          directionId,
        },
      },
    );
  }

  if (/^[01]*$/.test(calendarCode ?? '')) {
    const configured = await getCalendarsFromConfig(data, config);
    const serviceIds = new Set(trips.map((trip) => trip.service_id));
    calendars =
      groupCalendarsByActiveDays(
        configured.calendars.filter((calendar) =>
          serviceIds.has(calendar.service_id),
        ),
      ).find((group) => calendarToCalendarCode(group[0]) === calendarCode) ??
      [];
  } else {
    serviceId = calendarCode;
    calendarDates = await data.calendarDates({
      exception_type: 1,
      service_id: serviceId,
    });
  }

  return {
    calendars,
    calendarDates,
    route: routes[0],
    directionId: uniqueTripDirections[0].direction_id,
    tripHeadsign: uniqueTripDirections[0].trip_headsign,
  };
};

/*
 * Get a timetable_page by id.
 */
const getTimetablePageById = async (
  data: GtfsReader,
  timetablePageId: string,
  config: Config,
) => {
  // Check if there are any timetable pages defined in `timetable_pages.txt`.
  const timetablePages = await data.timetablePages({
    timetable_page_id: timetablePageId,
  });

  const timetables = mergeTimetablesWithSameId(
    await data.timetables(),
  ) as FormattedTimetable[];

  if (timetablePages.length > 1) {
    throw new GtfsToHtmlError(
      `Multiple timetable_pages found for timetable_page_id=${timetablePageId}`,
      {
        code: GtfsToHtmlErrorCode.QUERY_RESULT_AMBIGUOUS,
        category: GtfsToHtmlErrorCategory.QUERY,
        details: { entity: 'timetable_page', timetablePageId },
      },
    );
  }

  if (timetablePages.length === 1) {
    // Use timetablePage defined in `timetable_pages.txt`.
    const timetablePage = timetablePages[0] as FormattedTimetablePage;
    timetablePage.timetables = sortBy(
      timetables.filter(
        (timetable) => timetable.timetable_page_id === timetablePageId,
      ),
      'timetable_sequence',
    );

    // Add routes for each timetable
    for (const timetable of timetablePage.timetables) {
      timetable.routes = await data.routes({
        route_id: timetable.route_ids,
      });
    }

    return timetablePage;
  }

  if (timetables.length > 0) {
    // If no timetable_page, use timetable defined in `timetables.txt`.
    const timetablePageTimetables = timetables.filter(
      (timetable) => timetable.timetable_id === timetablePageId,
    );

    if (timetablePageTimetables.length === 0) {
      throw new GtfsToHtmlError(
        `No timetable found for timetable_page_id=${timetablePageId}`,
        {
          code: GtfsToHtmlErrorCode.QUERY_RESULT_NOT_FOUND,
          category: GtfsToHtmlErrorCategory.QUERY,
          details: { entity: 'timetable', timetablePageId },
        },
      );
    }

    return await createTimetablePage(data, {
      timetablePageId: timetablePageId,
      timetables: [timetablePageTimetables[0]],
      config,
    });
  }

  // If no `timetables.txt` in GTFS and timetable_page_id starts with "route_", build the route into a timetable page using all calendars and directions.
  if (timetablePageId.startsWith('route_')) {
    const routes = await data.routes({
      route_id: timetablePageId.slice('route_'.length),
    });

    if (routes.length === 0) {
      throw new GtfsToHtmlError(
        `No route found for timetable_page_id=${timetablePageId}`,
        {
          code: GtfsToHtmlErrorCode.QUERY_RESULT_NOT_FOUND,
          category: GtfsToHtmlErrorCategory.QUERY,
          details: { entity: 'route', timetablePageId },
        },
      );
    }

    const { calendars, calendarDates } = await getCalendarsFromConfig(
      data,
      config,
    );

    const trips = await data.trips(
      {
        route_id: routes[0].route_id,
      },
      ['trip_headsign', 'direction_id', 'trip_id', 'service_id'],
    );
    const uniqueTripDirections = orderBy(
      uniqBy(trips, (trip) => trip.direction_id),
      'direction_id',
    );
    const calendarDateGroups = groupBy(calendarDates, 'service_id');

    const timetables: FormattedTimetable[] = [];

    for (const uniqueTripDirection of uniqueTripDirections) {
      const directionServiceIds = new Set(
        trips
          .filter(
            (trip) => trip.direction_id === uniqueTripDirection.direction_id,
          )
          .map((trip) => trip.service_id),
      );
      const calendarGroups = groupCalendarsByActiveDays(
        calendars.filter((calendar) =>
          directionServiceIds.has(calendar.service_id),
        ),
      );
      for (const calendars of calendarGroups) {
        const tripsForCalendars = trips.filter((trip) =>
          some(calendars, { service_id: trip.service_id }),
        );
        if (tripsForCalendars.length > 0) {
          timetables.push(
            createTimetable({
              route: routes[0],
              directionId: uniqueTripDirection.direction_id,
              tripHeadsign: uniqueTripDirection.trip_headsign,
              calendars,
            }),
          );
        }
      }

      for (const calendarDates of Object.values(calendarDateGroups)) {
        const tripsForCalendarDates = trips.filter((trip) =>
          some(calendarDates, { service_id: trip.service_id }),
        );
        if (tripsForCalendarDates.length > 0) {
          timetables.push(
            createTimetable({
              route: routes[0],
              directionId: uniqueTripDirection.direction_id,
              tripHeadsign: uniqueTripDirection.trip_headsign,
              calendarDates,
            }),
          );
        }
      }
    }

    return await createTimetablePage(data, {
      timetablePageId,
      timetables,
      config,
    });
  }

  // If no `timetables.txt` in GTFS, try to parse the timetable_page_id and build the route and direction into a timetable.
  const { calendars, calendarDates, route, directionId, tripHeadsign } =
    await getDataForTimetablePageById(data, timetablePageId, config);

  const timetable = createTimetable({
    route,
    directionId,
    tripHeadsign,
    calendars,
    calendarDates,
  });

  return await createTimetablePage(data, {
    timetablePageId,
    timetables: [timetable],
    config,
  });
};

/*
 * Initialize configuration with defaults.
 */
export function setDefaultConfig(initialConfig: Config) {
  const defaults = {
    allowEmptyTimetables: false,
    ignoreErrors: false,
    beautify: false,
    coordinatePrecision: 5,
    dateFormat: 'MMM D, YYYY',
    daysShortStrings: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    daysStrings: [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
    defaultOrientation: 'vertical',
    deleteDbAfter: false,
    interpolatedStopSymbol: '•',
    interpolatedStopText: 'Estimated time of arrival',
    groupTimetablesIntoPages: true,
    gtfsToHtmlVersion: version,
    linkStopUrls: false,
    mapStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
    menuType: 'jump',
    noDropoffSymbol: '‡',
    noDropoffText: 'No drop off available',
    noHead: false,
    noPickupSymbol: '**',
    noPickupText: 'No pickup available',
    noRegularServiceDaysText: 'No regular service days',
    noServiceSymbol: '-',
    noServiceText: 'No service at this stop',
    outputFormat: 'html',
    overwriteExistingFiles: true,
    requestDropoffSymbol: '†',
    requestDropoffText: 'Must request drop off',
    requestPickupSymbol: '***',
    requestPickupText: 'Request stop - call for pickup',
    serviceNotProvidedOnText: 'Service not provided on',
    serviceProvidedOnText: 'Service provided on',
    showArrivalOnDifference: 1,
    showCalendarExceptions: true,
    showDuplicateTrips: false,
    showMap: false,
    showOnlyTimepoint: false,
    showRouteTitle: true,
    showStopCity: false,
    showStopDescription: false,
    showStoptimesForRequestStops: true,
    skipImport: false,
    sortingAlgorithm: 'common',
    timeFormat: 'h:mma',
    useParentStation: true,
    verbose: true,
    zipOutput: false,
  };

  const config = Object.assign(defaults, initialConfig);

  if (config.outputFormat === 'pdf') {
    // Force `noHead` to false to false if pdfs are asked for
    config.noHead = false;
    config.menuType = 'none';
  }

  // Add values to config if gtfs realtime URLs are present
  config.hasGtfsRealtimeVehiclePositions = config.agencies.some(
    (agency) => agency.realtimeVehiclePositions?.url,
  );

  config.hasGtfsRealtimeTripUpdates = config.agencies.some(
    (agency) => agency.realtimeTripUpdates?.url,
  );

  config.hasGtfsRealtimeAlerts = config.agencies.some(
    (agency) => agency.realtimeAlerts?.url,
  );

  return config;
}

/*
 * Get a timetable page by id.
 */
export async function getFormattedTimetablePage(
  data: GtfsReader,
  timetablePageId: string,
  config: Config,
  onWarning: (warning: string) => void = (warning) => log(config)(warning),
) {
  const timetablePage = (await getTimetablePageById(
    data,
    timetablePageId,
    config,
  )) as FormattedTimetablePage;

  const { timetables: consolidatedTimetables, failedTimetables } =
    await formatTimetables(data, timetablePage.timetables, config, onWarning);
  timetablePage.timetables = timetablePage.timetables.filter(
    (timetable) => !failedTimetables.has(timetable),
  );

  const uniqueRoutes = uniqBy(
    flatMap(consolidatedTimetables, (timetable) => timetable.routes),
    'route_id',
  );

  const formattedTimetablePage = {
    ...timetablePage,
    consolidatedTimetables,
    dayList: formatDays(getDaysFromCalendars(consolidatedTimetables), config),
    dayLists: uniq(
      consolidatedTimetables.map((timetable) => timetable.dayList),
    ),
    route_ids: uniqueRoutes.map((route) => route.route_id),
    agency_ids: uniq(compact(uniqueRoutes.map((route) => route.agency_id))),
    filename:
      timetablePage.filename ?? `${timetablePage.timetable_page_id}.html`,
    timetable_page_label:
      timetablePage.timetable_page_label ??
      formatListForDisplay(uniqueRoutes.map((route) => formatRouteName(route))),
  };

  return formattedTimetablePage;
}

/*
 * Generate stats about timetable page.
 */
export const generateStats = (timetablePage: FormattedTimetablePage) => {
  const routeIds: { [key: string]: boolean } = {};
  const serviceIds: { [key: string]: boolean } = {};
  const stats = {
    stops: 0,
    trips: 0,
    routes: 0,
    calendars: 0,
  };

  for (const timetable of timetablePage.consolidatedTimetables ?? []) {
    stats.stops += timetable.stops.length;
    stats.trips += timetable.orderedTrips.length;
    for (const serviceId of timetable.service_ids ?? []) {
      serviceIds[serviceId] = true;
    }

    for (const routeId of timetable.route_ids) {
      routeIds[routeId] = true;
    }
  }

  stats.routes = size(routeIds);
  stats.calendars = size(serviceIds);

  return stats;
};

/*
 * Generate the HTML timetable for a timetable page.
 */
export async function generateTimetableHTML(
  data: GtfsReader,
  timetablePage: FormattedTimetablePage,
  config: Config,
) {
  const agencies = (await data.agencies()) as { agency_name: string }[];
  const templateVars = {
    timetablePage,
    config,
    title: `${timetablePage.timetable_page_label} | ${formatListForDisplay(agencies.map((agency) => agency.agency_name))}`,
  };
  return renderTemplate('timetablepage', templateVars, config);
}

/*
 * Generate the CSV timetable for a timetable page.
 */
export function generateTimetableCSV(timetable: FormattedTimetable) {
  // Generate horizontal orientation, then transpose if vertical is needed.
  const lines = [];

  lines.push([
    '',
    ...timetable.orderedTrips.map((trip) =>
      formatTripNameForCSV(trip, timetable),
    ),
  ]);

  if (timetable.has_continues_from_route) {
    lines.push([
      'Continues from route',
      ...timetable.orderedTrips.map((trip) => formatTripContinuesFrom(trip)),
    ]);
  }

  for (const stop of timetable.stops) {
    lines.push([
      formatStopName(stop),
      ...stop.trips.map((stoptime) => stoptime.formatted_time),
    ]);
  }

  if (timetable.has_continues_as_route) {
    lines.push([
      'Continues as route',
      ...timetable.orderedTrips.map((trip) => formatTripContinuesAs(trip)),
    ]);
  }

  if (timetable.orientation === 'vertical') {
    return stringify(zip(...lines));
  }

  return stringify(lines);
}

/*
 * Generate the HTML for the agency overview page.
 */
export async function generateOverviewHTML(
  data: GtfsReader,
  timetablePages: TimetablePageSummary[],
  config: Config,
) {
  const agencies = (await data.agencies()) as { agency_name: string }[];
  if (agencies.length === 0) {
    throw new GtfsToHtmlError('No agencies found', {
      code: GtfsToHtmlErrorCode.QUERY_RESULT_NOT_FOUND,
      category: GtfsToHtmlErrorCategory.QUERY,
      details: { entity: 'agency' },
    });
  }

  const geojson = config.showMap
    ? await getAgencyGeoJSON(data, config)
    : undefined;

  const templateVars = {
    agency: {
      ...first(agencies),
      geojson,
    }, // Legacy agency object
    agencies,
    geojson,
    config,
    timetablePages,
    title: `${formatListForDisplay(agencies.map((agency) => agency.agency_name))} Timetables`,
  };
  return renderTemplate('overview', templateVars, config);
}
