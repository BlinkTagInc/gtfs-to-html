import {
  cloneDeep,
  compact,
  countBy,
  difference,
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
import {
  getCalendarDates,
  getTrips,
  getTimetableNotesReferences,
  getTimetableNotes,
  getRoutes,
  getCalendars,
  getTimetableStopOrders,
  getStops,
  getStopAttributes,
  getStoptimes,
  getFrequencies,
  getTimetables,
  getTimetablePages,
  getAgencies,
  openDb,
  Calendar,
  CalendarDate,
  Frequency,
  Route,
  Trip,
  StopTime,
  Stop,
} from 'gtfs';
import { stringify } from 'csv-stringify';
import moment from 'moment';
import sqlString from 'sqlstring';
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
  formatTrip,
  formatTripContinuesAs,
  formatTripContinuesFrom,
  isNullOrEmpty,
  mergeTimetablesWithSameId,
  resetStoptimesToMidnight,
  timeToSeconds,
  updateStoptimesByOffset,
} from './formatters.js';
import { getTimetableGeoJSON, getAgencyGeoJSON } from './geojson-utils.js';
import {
  calendarToCalendarCode,
  secondsAfterMidnight,
  fromGTFSTime,
  calendarCodeToCalendar,
} from './time-utils.js';
import { formatTripNameForCSV } from './template-functions.js';

import type {
  Config,
  Timetable,
  TimetablePage,
} from '../types/global_interfaces.js';

import packageJson from '../../package.json' with { type: 'json' };
const { version } = packageJson;

type FormattedTrip = Trip & {
  firstStoptime: number;
  lastStoptime: number;
  stoptimes: StopTime[];
};

/*
 * Determine if a stoptime is a timepoint.
 */
export const isTimepoint = (stoptime: StopTime) => {
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
    const firstStopId = first(longestTripStoptimes).stop_id;
    sortedTrips = sortTripsByStoptimeAtStop(trips, firstStopId);
  } else if (config.sortingAlgorithm === 'last') {
    // Sort trips chronologically using the stoptime of a the last stop of the longest trip.

    const longestTripStoptimes = getLongestTripStoptimes(trips, config);
    const lastStopId = last(longestTripStoptimes).stop_id;
    sortedTrips = sortTripsByStoptimeAtStop(trips, lastStopId);
  }

  if (config.showDuplicateTrips === false) {
    return deduplicateTrips(sortedTrips ?? []);
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
const getCalendarDatesForTimetable = (timetable: Timetable, config: Config) => {
  const calendarDates = getCalendarDates(
    {
      service_id: timetable.service_ids,
    },
    [],
    [['date', 'ASC']],
  );
  const start = moment(timetable.start_date, 'YYYYMMDD');
  const end = moment(timetable.end_date, 'YYYYMMDD');
  const excludedDates = new Set();
  const includedDates = new Set();

  for (const calendarDate of calendarDates) {
    if (moment(calendarDate.date, 'YYYYMMDD').isBetween(start, end)) {
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
const getDaysFromCalendars = (calendars: Calendar[]) => {
  const days = {
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
      /* eslint-disable-next-line no-bitwise */
      days[day] = days[day] | calendar[day];
    }
  }

  return days;
};

/*
 * Get the `trip_headsign` for a specific timetable.
 */
const getDirectionHeadsignFromTimetable = (timetable: Timetable) => {
  const trips = getTrips(
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

  return mostCommonHeadsign;
};

/*
 * Get the notes for a specific timetable.
 */
const getTimetableNotesForTimetable = (
  timetable: Timetable,
  config: Config,
) => {
  const noteReferences = [
    // Get all notes for this timetable.
    ...getTimetableNotesReferences({
      timetable_id: timetable.timetable_id,
    }),

    // Get all notes for this route.
    ...getTimetableNotesReferences({
      route_id: timetable.routes.map((route) => route.route_id),
      timetable_id: null,
    }),

    // Get all notes for all trips in this timetable.
    ...getTimetableNotesReferences({
      trip_id: timetable.orderedTrips.map((trip) => trip.trip_id),
    }),

    // Get all notes for all stops in this timetable.
    ...getTimetableNotesReferences({
      stop_id: timetable.stops.map((stop) => stop.stop_id),
      trip_id: null,
      route_id: null,
      timetable_id: null,
    }),
  ];

  const usedNoteReferences = [];
  // Check if stop_sequence matches any trip.
  for (const noteReference of noteReferences) {
    if (
      noteReference.stop_sequence === '' ||
      noteReference.stop_sequence === null
    ) {
      usedNoteReferences.push(noteReference);
      continue;
    }

    // Note references with stop_sequence must also have stop_id.
    if (noteReference.stop_id === '' || noteReference.stop_id === null) {
      timetable.warnings.push(
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

  const notes = getTimetableNotes({
    note_id: usedNoteReferences.map((noteReference) => noteReference.note_id),
  });

  // Assign symbols to each note if unassigned. Use a-z then default to integers.
  const symbols = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let symbolIndex = 0;
  for (const note of notes) {
    if (note.symbol === '' || note.symbol === null) {
      note.symbol =
        symbolIndex < symbols.length - 1
          ? symbols[symbolIndex]
          : symbolIndex - symbols.length;
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
const createTimetablePage = ({
  timetablePageId,
  timetables,
  config,
}: {
  timetablePageId: string;
  timetables: Timetable[];
  config: Config;
}) => {
  const updatedTimetables = timetables.map((timetable) => {
    if (!timetable.routes) {
      timetable.routes = getRoutes({
        route_id: timetable.route_ids,
      });
    }

    return timetable;
  });

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
  route: Route;
  directionId?: 0 | 1;
  tripHeadsign?: string;
  calendars?: Calendar[];
  calendarDates?: CalendarDate[];
}): Timetable => {
  const serviceIds = uniq([
    ...(calendars?.map((calendar) => calendar.service_id) ?? []),
    ...(calendarDates?.map((calendarDate) => calendarDate.service_id) ?? []),
  ]);

  const days = {};
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

  const timetableId = formatTimetableId({
    routeIds: [route.route_id],
    directionId: directionId,
    days: days,
  });

  return {
    timetable_id: timetableId,
    route_ids: [route.route_id],
    direction_id: directionId === null ? null : directionId,
    direction_name: tripHeadsign === null ? null : tripHeadsign,
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
  };
};

/*
 * Create timetable pages for all routes in an agency. Used if no
 * `timetables.txt` is present.
 */
const convertRoutesToTimetablePages = (config: Config) => {
  const routes = getRoutes();
  const timetablePages: TimetablePage[] = [];
  const { calendars, calendarDates } = getCalendarsFromConfig(config);

  for (const route of routes) {
    const trips = getTrips(
      {
        route_id: route.route_id,
      },
      ['trip_headsign', 'direction_id', 'trip_id', 'service_id'],
    );
    const uniqueTripDirections = orderBy(
      uniqBy(trips, (trip) => trip.direction_id),
      'direction_id',
    );
    const sortedCalendars = orderBy(calendars, calendarToCalendarCode, 'desc');
    const calendarGroups = groupBy(sortedCalendars, calendarToCalendarCode);
    const calendarDateGroups = groupBy(calendarDates, 'service_id');

    const timetables: Timetable[] = [];

    for (const uniqueTripDirection of uniqueTripDirections) {
      for (const calendars of Object.values(calendarGroups)) {
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

    if (config.groupTimetablesIntoPages === true) {
      timetablePages.push(
        createTimetablePage({
          timetablePageId: `route_${route.route_short_name ?? route.route_long_name}`,
          timetables,
          config,
        }),
      );
    } else {
      for (const timetable of timetables) {
        timetablePages.push(
          createTimetablePage({
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
  frequencies: Frequency[],
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
const duplicateStopsForDifferentArrivalDeparture = (
  stopIds: string[],
  timetable: Timetable,
  config: Config,
) => {
  if (
    config.showArrivalOnDifference === null ||
    config.showArrivalOnDifference === undefined
  ) {
    return stopIds;
  }

  for (const trip of timetable.orderedTrips) {
    for (const stoptime of trip.stoptimes) {
      const timepointDifference = fromGTFSTime(stoptime.departure_time).diff(
        fromGTFSTime(stoptime.arrival_time),
        'minutes',
      );

      if (timepointDifference < config.showArrivalOnDifference) {
        continue;
      }

      const index = stopIds.indexOf(stoptime.stop_id);
      if (index === 0 || index === stopIds.length - 1) {
        continue;
      }

      if (
        stoptime.stop_id === stopIds[index + 1] ||
        stoptime.stop_id === stopIds[index - 1]
      ) {
        continue;
      }

      stopIds.splice(index, 0, stoptime.stop_id);
    }
  }

  return stopIds;
};

/*
 * Get a sorted array of stop_ids for a specific timetable.
 */
const getStopOrder = (timetable: Timetable, config: Config) => {
  // First, check if `timetable_stop_order.txt` for route exists
  const timetableStopOrders = getTimetableStopOrders(
    {
      timetable_id: timetable.timetable_id,
    },
    ['stop_id'],
    [['stop_sequence', 'ASC']],
  );

  if (timetableStopOrders.length > 0) {
    return timetableStopOrders.map(
      (timetableStopOrder) => timetableStopOrder.stop_id,
    );
  }

  // Next, try using a directed graph to determine stop order.
  try {
    const stopGraph = [];

    // If a stop is marked as a timepoint in any trips, treat it as a timepoint in all trips for sorting purposes.
    const timepointStopIds = new Set(
      timetable.orderedTrips.flatMap((trip) =>
        trip.stoptimes
          .filter((stoptime) => isTimepoint(stoptime))
          .map((stoptime) => stoptime.stop_id),
      ),
    );

    for (const trip of timetable.orderedTrips) {
      const sortedStopIds = trip.stoptimes
        .filter((stoptime) => {
          // If `showOnlyTimepoint` is true, then filter out all non-timepoints.
          if (config.showOnlyTimepoint === true) {
            return timepointStopIds.has(stoptime.stop_id);
          }
          return true;
        })
        .map((stoptime) => stoptime.stop_id);

      for (const [index, stopId] of sortedStopIds.entries()) {
        if (index === sortedStopIds.length - 1) {
          continue;
        }

        stopGraph.push([stopId, sortedStopIds[index + 1]]);
      }
    }

    if (stopGraph.length === 0 && config.showOnlyTimepoint === true) {
      timetable.warnings.push(
        `Timetable ${timetable.timetable_id}'s trips have stoptimes with timepoints but \`showOnlyTimepoint\` is true. Try setting \`showOnlyTimepoint\` to false.`,
      );
    }

    const stopIds = toposort(stopGraph);

    return duplicateStopsForDifferentArrivalDeparture(
      stopIds,
      timetable,
      config,
    );
  } catch {
    // Fall back to using the stop order from the trip with the most stoptimes.
    // Note that this may miss some stops if the trip with the most stoptimes
    // does not contain all stops.
    const longestTripStoptimes = getLongestTripStoptimes(
      timetable.orderedTrips,
      config,
    );
    const stopIds = longestTripStoptimes.map(
      (stoptime) => stoptime.stop_id,
    ) as string[];

    const missingStopIds = difference(
      new Set(
        timetable.orderedTrips.flatMap((trip: Trip) =>
          trip.stoptimes.map((stoptime: StopTime) => stoptime.stop_id),
        ),
      ),
      new Set(stopIds),
    ) as string[];

    if (missingStopIds.length > 0) {
      timetable.warnings.push(
        `Timetable ${timetable.timetable_id} stops are unable to be topologically sorted and has no \`timetable_stop_order.txt\`. Falling back to using the using the stop order from trip with most stoptimes, but this does not include stop_ids ${formatListForDisplay(missingStopIds)}. Try manually specifying stops with \`timetable_stop_order.txt\`. Read more at https://gtfstohtml.com/docs/timetable-stop-order`,
      );
    }

    return duplicateStopsForDifferentArrivalDeparture(
      stopIds,
      timetable,
      config,
    );
  }
};

/*
 * Get an array of stops for a specific timetable.
 */
const getStopsForTimetable = (timetable: Timetable, config: Config) => {
  if (timetable.orderedTrips.length === 0) {
    return [];
  }

  const orderedStopIds = getStopOrder(timetable, config);
  const orderedStops = orderedStopIds.map((stopId, index) => {
    const stops = getStops({
      stop_id: stopId,
    });

    if (stops.length === 0) {
      throw new Error(
        `No stop found found for stop_id=${stopId} in timetable_id=${timetable.timetable_id}`,
      );
    }

    const stop = {
      ...stops[0],
      trips: [],
    };

    if (
      index < orderedStopIds.length - 1 &&
      stopId === orderedStopIds[index + 1]
    ) {
      stop.type = 'arrival';
    } else if (index > 0 && stopId === orderedStopIds[index - 1]) {
      stop.type = 'departure';
    }

    return stop;
  });

  // If `showStopCity` is true, look up stop attributes.
  if (config.showStopCity) {
    const stopAttributes = getStopAttributes({
      stop_id: orderedStopIds,
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

const getCalendarsFromConfig = (config: Config) => {
  const db = openDb();
  let whereClause = '';
  const whereClauses = [];

  if (config.endDate) {
    // Validate config.endDate is a valid date
    if (!moment(config.endDate).isValid()) {
      throw new Error(`Invalid endDate=${config.endDate} in config.json`);
    }

    whereClauses.push(
      `start_date <= ${sqlString.escape(moment(config.endDate).format('YYYYMMDD'))}`,
    );
  }

  if (config.startDate) {
    // Validate config.startDate is a valid date
    if (!moment(config.startDate).isValid()) {
      throw new Error(`Invalid startDate=${config.startDate} in config.json`);
    }

    whereClauses.push(
      `end_date >= ${sqlString.escape(moment(config.startDate).format('YYYYMMDD'))}`,
    );
  }

  if (whereClauses.length > 0) {
    whereClause = `WHERE ${whereClauses.join(' AND ')}`;
  }

  const calendars: Calendar[] = db
    .prepare(`SELECT * FROM calendar ${whereClause}`)
    .all();

  // Find all calendar dates with service_ids not present in `calendar.txt`.
  const serviceIds = calendars.map((calendar) => calendar.service_id);
  const calendarDates = db
    .prepare(
      `SELECT * FROM calendar_dates WHERE exception_type = 1 AND service_id NOT IN (${serviceIds
        .map((serviceId) => `'${serviceId}'`)
        .join(', ')})`,
    )
    .all();

  return {
    calendars,
    calendarDates,
  };
};

/*
 * Get all calendars from a specific timetable.
 */
const getCalendarsFromTimetable = (timetable: Timetable) => {
  const db = openDb();
  let whereClause = '';
  const whereClauses = [];

  if (timetable.end_date) {
    // Validate timetable.end_date is a valid date
    if (!moment(timetable.end_date, 'YYYYMMDD', true).isValid()) {
      throw new Error(
        `Invalid end_date=${timetable.end_date} for timetable_id=${timetable.timetable_id}`,
      );
    }

    whereClauses.push(`start_date <= ${sqlString.escape(timetable.end_date)}`);
  }

  if (timetable.start_date) {
    // Validate timetable.start_date is a valid date
    if (!moment(timetable.start_date, 'YYYYMMDD', true).isValid()) {
      throw new Error(
        `Invalid start_date=${timetable.start_date} for timetable_id=${timetable.timetable_id}`,
      );
    }

    whereClauses.push(`end_date >= ${sqlString.escape(timetable.start_date)}`);
  }

  const days = getDaysFromCalendars([timetable]);
  // Create an 'OR' query array of days based on calendars.
  const dayQueries = reduce(
    days,
    (memo: string[], value: number, key: string) => {
      if (value === 1) {
        memo.push(`${key} = 1`);
      }

      return memo;
    },
    [],
  );

  if (dayQueries.length > 0) {
    whereClauses.push(`(${dayQueries.join(' OR ')})`);
  }

  if (whereClauses.length > 0) {
    whereClause = `WHERE ${whereClauses.join(' AND ')}`;
  }

  return db.prepare(`SELECT * FROM calendar ${whereClause}`).all();
};

/*
 * Get all calendar date service ids for an agency between two dates.
 */
const getCalendarDatesServiceIds = (
  startDate?: number | null,
  endDate?: number | null,
) => {
  const db = openDb();
  const whereClauses = ['exception_type = 1'];

  if (endDate) {
    whereClauses.push(`date <= ${sqlString.escape(endDate)}`);
  }

  if (startDate) {
    whereClauses.push(`date >= ${sqlString.escape(startDate)}`);
  }

  const calendarDates: CalendarDate[] = db
    .prepare(
      `SELECT DISTINCT service_id FROM calendar_dates WHERE ${whereClauses.join(
        ' AND ',
      )}`,
    )
    .all();
  return calendarDates.map((calendarDate) => calendarDate.service_id);
};

/*
 * For a specific stop_id, returns an array all stop_ids within a parent station
 * and the stop_id of parent station itself. If no parent station, it returns the
 * stop_id.
 */
const getAllStationStopIds = (stopId: string) => {
  const stops = getStops({
    stop_id: stopId,
  });

  if (stops.length === 0) {
    throw new Error(`No stop found for stop_id=${stopId}`);
  }

  const stop = stops[0];

  if (isNullOrEmpty(stop.parent_station)) {
    return [stopId];
  }

  const stopsInParentStation = getStops(
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
const getTripsWithSameBlock = (trip: FormattedTrip, timetable: Timetable) => {
  const trips = getTrips(
    {
      block_id: trip.block_id,
      service_id: timetable.service_ids,
    },
    ['trip_id', 'route_id'],
  );

  for (const blockTrip of trips) {
    const stopTimes = getStoptimes(
      {
        trip_id: blockTrip.trip_id,
      },
      [],
      [['stop_sequence', 'ASC']],
    );

    if (stopTimes.length === 0) {
      throw new Error(
        `No stoptimes found found for trip_id=${blockTrip.trip_id}`,
      );
    }

    blockTrip.firstStoptime = first(stopTimes);
    blockTrip.lastStoptime = last(stopTimes);
  }

  return sortBy(trips, (trip) => trip.firstStoptime.departure_timestamp);
};

/*
 * Get next trip and previous trip with the same `block_id` if it arrives or
 * departs from the same stop and is a different route.
 */
const addTripContinuation = (trip: FormattedTrip, timetable: Timetable) => {
  if (!trip.block_id || trip.stoptimes.length === 0) {
    return;
  }

  const maxContinuesAsWaitingTimeSeconds = 60 * 60;

  const firstStoptime = first(trip.stoptimes);
  const firstStopIds = getAllStationStopIds(firstStoptime.stop_id);
  const lastStoptime = last(trip.stoptimes);
  const lastStopIds = getAllStationStopIds(lastStoptime.stop_id);
  const blockTrips = getTripsWithSameBlock(trip, timetable);

  // "Continues From" trips must be the previous trip chronologically.
  const previousTrip = findLast(
    blockTrips,
    (blockTrip) =>
      blockTrip.lastStoptime.arrival_timestamp <=
      firstStoptime.departure_timestamp,
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
    previousTrip.lastStoptime.arrival_timestamp >=
      firstStoptime.departure_timestamp - maxContinuesAsWaitingTimeSeconds &&
    firstStopIds.includes(previousTrip.lastStoptime.stop_id)
  ) {
    const routes = getRoutes({
      route_id: previousTrip.route_id,
    });

    previousTrip.route = routes[0];

    trip.continues_from_route = previousTrip;
  }

  // "Continues As" trips must be the next trip chronologically.
  const nextTrip = find(
    blockTrips,
    (blockTrip) =>
      blockTrip.firstStoptime.departure_timestamp >=
      lastStoptime.arrival_timestamp,
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
    nextTrip.firstStoptime.departure_timestamp <=
      lastStoptime.arrival_timestamp + maxContinuesAsWaitingTimeSeconds &&
    lastStopIds.includes(nextTrip.firstStoptime.stop_id)
  ) {
    const routes = getRoutes({
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
const filterTrips = (timetable: Timetable) => {
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

    trip.stoptimes = combinedStoptimes;
  }

  // Remove stoptimes for stops not used in timetable
  const timetableStopIds = new Set(
    timetable.stops.map((stop: Stop) => stop.stop_id),
  );
  for (const trip of filteredTrips) {
    trip.stoptimes = trip.stoptimes.filter((stoptime: StopTime) =>
      timetableStopIds.has(stoptime.stop_id),
    );
  }

  // Exclude trips with less than two stops
  filteredTrips = filteredTrips.filter(
    (trip: Trip) => trip.stoptimes.length > 1,
  );

  return filteredTrips;
};

/*
 * Get all trips from a timetable.
 */

/* eslint-disable complexity */
const getTripsForTimetable = (
  timetable: Timetable,
  calendars: Calendar[],
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

  const trips = getTrips(tripQuery);

  if (trips.length === 0) {
    timetable.warnings.push(
      `No trips found for route_id=${timetable.route_ids.join(
        '_',
      )}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(
        timetable.service_ids,
      )}, timetable_id=${timetable.timetable_id}`,
    );
  }

  const frequencies = getFrequencies({
    trip_id: trips.map((trip) => trip.trip_id),
  });

  // Updated timetable.serviceIds with only the service IDs actually used in one or more trip.
  timetable.service_ids = uniq(trips.map((trip) => trip.service_id));

  const formattedTrips = [];

  for (const trip of trips) {
    const formattedTrip = formatTrip(trip, timetable, calendars, config);
    formattedTrip.stoptimes = getStoptimes(
      {
        trip_id: formattedTrip.trip_id,
      },
      [],
      [['stop_sequence', 'ASC']],
    );

    if (formattedTrip.stoptimes.length === 0) {
      timetable.warnings.push(
        `No stoptimes found for trip_id=${
          formattedTrip.trip_id
        }, route_id=${timetable.route_ids.join('_')}, timetable_id=${
          timetable.timetable_id
        }`,
      );
    }

    // Exclude trips before timetable `start_timestamp`
    if (
      timetable.start_timestamp !== '' &&
      timetable.start_timestamp !== null &&
      timetable.start_timestamp !== undefined &&
      trip.stoptimes[0].arrival_timestamp < timetable.start_timestamp
    ) {
      return;
    }

    // Exclude trips after timetable `end_timestamp`
    if (
      timetable.end_timestamp !== '' &&
      timetable.end_timestamp !== null &&
      timetable.end_timestamp !== undefined &&
      trip.stoptimes[0].arrival_timestamp >= timetable.end_timestamp
    ) {
      return;
    }

    if (timetable.show_trip_continuation) {
      addTripContinuation(formattedTrip, timetable);

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
        frequencies,
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

    const stops = getStops(
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
/* eslint-enable complexity */

/*
 * Format timetables for display.
 */
const formatTimetables = (timetables: Timetable[], config: Config) => {
  const formattedTimetables = timetables.map((timetable) => {
    timetable.warnings = [];
    const dayList = formatDays(timetable, config);
    const calendars = getCalendarsFromTimetable(timetable);
    let serviceIds = calendars.map((calendar: Calendar) => calendar.service_id);

    if (timetable.include_exceptions === 1) {
      const calendarDatesServiceIds = getCalendarDatesServiceIds(
        timetable.start_date,
        timetable.end_date,
      );
      serviceIds = uniq([...serviceIds, ...calendarDatesServiceIds]);
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
      service_ids: serviceIds,
      dayList,
      dayListLong: formatDaysLong(dayList, config),
    });

    timetable.orderedTrips = getTripsForTimetable(timetable, calendars, config);
    timetable.stops = getStopsForTimetable(timetable, config);
    timetable.calendarDates = getCalendarDatesForTimetable(timetable, config);
    timetable.timetable_label = formatTimetableLabel(timetable);
    timetable.notes = getTimetableNotesForTimetable(timetable, config);

    if (config.showMap) {
      timetable.geojson = getTimetableGeoJSON(timetable, config);
    }

    // Filter trips after all timetable properties are assigned
    timetable.orderedTrips = filterTrips(timetable);

    // Format stops after all timetable properties are assigned
    timetable.stops = formatStops(timetable, config);

    return timetable;
  });

  if (config.allowEmptyTimetables) {
    return formattedTimetables;
  }

  return formattedTimetables.filter(
    (timetable) => timetable.orderedTrips.length > 0,
  );
};

/*
 * Get all timetable pages for an agency.
 */
export function getTimetablePagesForAgency(config: Config): TimetablePage[] {
  const timetables = mergeTimetablesWithSameId(getTimetables());
  const routes = getRoutes();
  const formattedTimetables = timetables.map((timetable) => {
    return {
      ...timetable,
      routes: routes.filter((route) =>
        timetable.route_ids.includes(route.route_id),
      ),
    } as Timetable;
  });

  // If no timetables, build each route and direction into a timetable.
  if (timetables.length === 0) {
    return convertRoutesToTimetablePages(config);
  }

  const timetablePages = getTimetablePages(
    {},
    [],
    [['timetable_page_id', 'ASC']],
  );

  // Check if there are any timetable pages defined in `timetable_pages.txt`.
  if (timetablePages.length === 0) {
    // If no timetablepages, use timetables
    return formattedTimetables.map((timetable) =>
      createTimetablePage({
        timetablePageId: timetable.timetable_id,
        timetables: [timetable],
        config,
      }),
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
    } as TimetablePage;
  });
}

const getDataForTimetablePageById = (timetablePageId: string) => {
  let calendarCode;
  let calendars;
  let calendarDates;
  let serviceId;
  let directionId: number | string | null = '';
  const parts = timetablePageId?.split('|') ?? [];
  if (parts.length > 2) {
    directionId = Number.parseInt(parts.pop(), 10);
    calendarCode = parts.pop();
  } else if (parts.length > 1) {
    directionId = null;
    calendarCode = parts.pop();
  }

  const routeId = parts.join('|');

  const routes = getRoutes({
    route_id: routeId,
  });

  const trips = getTrips(
    {
      route_id: routeId,
      direction_id: directionId,
    },
    ['trip_headsign', 'direction_id'],
  );
  const uniqueTripDirections = uniqBy(trips, (trip) => trip.direction_id);

  if (uniqueTripDirections.length === 0) {
    throw new Error(
      `No trips found for timetable_page_id=${timetablePageId} route_id=${routeId} direction_id=${directionId}`,
    );
  }

  if (/^[01]*$/.test(calendarCode ?? '')) {
    calendars = getCalendars({
      ...calendarCodeToCalendar(calendarCode),
    });
  } else {
    serviceId = calendarCode;
    calendarDates = getCalendarDates({
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
const getTimetablePageById = (timetablePageId: string, config: Config) => {
  // Check if there are any timetable pages defined in `timetable_pages.txt`.
  const timetablePages = getTimetablePages({
    timetable_page_id: timetablePageId,
  });

  const timetables = mergeTimetablesWithSameId(getTimetables()) as Timetable[];

  if (timetablePages.length > 1) {
    throw new Error(
      `Multiple timetable_pages found for timetable_page_id=${timetablePageId}`,
    );
  }

  if (timetablePages.length === 1) {
    // Use timetablePage defined in `timetable_pages.txt`.
    const timetablePage = timetablePages[0];
    timetablePage.timetables = sortBy(
      timetables.filter(
        (timetable) => timetable.timetable_page_id === timetablePageId,
      ),
      'timetable_sequence',
    );

    // Add routes for each timetable
    for (const timetable of timetablePage.timetables) {
      timetable.routes = getRoutes({
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
      throw new Error(
        `No timetable found for timetable_page_id=${timetablePageId}`,
      );
    }

    return createTimetablePage({
      timetablePageId: timetablePageId,
      timetables: [timetablePageTimetables[0]],
      config,
    });
  }

  // If no `timetables.txt` in GTFS and timetable_page_id starts with "route_", build the route into a timetable page using all calendars and directions.
  if (timetablePageId.startsWith('route_')) {
    const routes = getRoutes({
      route_short_name: timetablePageId.split('_')[1],
    });

    if (routes.length === 0) {
      throw new Error(
        `No route found for timetable_page_id=${timetablePageId}`,
      );
    }

    const { calendars, calendarDates } = getCalendarsFromConfig(config);

    const trips = getTrips(
      {
        route_id: routes[0].route_id,
      },
      ['trip_headsign', 'direction_id', 'trip_id', 'service_id'],
    );
    const uniqueTripDirections = orderBy(
      uniqBy(trips, (trip) => trip.direction_id),
      'direction_id',
    );
    const sortedCalendars = orderBy(calendars, calendarToCalendarCode, 'desc');
    const calendarGroups = groupBy(sortedCalendars, calendarToCalendarCode);
    const calendarDateGroups = groupBy(calendarDates, 'service_id');

    const timetables: Timetable[] = [];

    for (const uniqueTripDirection of uniqueTripDirections) {
      for (const calendars of Object.values(calendarGroups)) {
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

    return createTimetablePage({
      timetablePageId,
      timetables,
      config,
    });
  }

  // If no `timetables.txt` in GTFS, try to parse the timetable_page_id and build the route and direction into a timetable.
  const { calendars, calendarDates, route, directionId, tripHeadsign } =
    getDataForTimetablePageById(timetablePageId);

  const timetable = createTimetable({
    route,
    directionId,
    tripHeadsign,
    calendars,
    calendarDates,
  });

  return createTimetablePage({
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
    showArrivalOnDifference: 0.2,
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
export function getFormattedTimetablePage(
  timetablePageId: string,
  config: Config,
) {
  const timetablePage = getTimetablePageById(
    timetablePageId,
    config,
  ) as TimetablePage;

  const consolidatedTimetables = formatTimetables(
    timetablePage.timetables,
    config,
  );

  // Get `direction_name` for each timetable.
  for (const timetable of consolidatedTimetables) {
    if (isNullOrEmpty(timetable.direction_name)) {
      timetable.direction_name = getDirectionHeadsignFromTimetable(timetable);
    }

    if (!timetable.routes) {
      timetable.routes = getRoutes({
        route_id: timetable.route_ids,
      });
    }
  }

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
export const generateStats = (timetablePage: TimetablePage) => {
  const routeIds: { [key: string]: boolean } = {};
  const serviceIds: { [key: string]: boolean } = {};
  const stats = {
    stops: 0,
    trips: 0,
    routes: 0,
    calendars: 0,
  };

  for (const timetable of timetablePage.consolidatedTimetables) {
    stats.stops += timetable.stops.length;
    stats.trips += timetable.orderedTrips.length;
    for (const serviceId of timetable.service_ids) {
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
export function generateTimetableHTML(
  timetablePage: TimetablePage,
  config: Config,
) {
  const agencies = getAgencies() as { agency_name: string }[];
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
export function generateTimetableCSV(timetable) {
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
export function generateOverviewHTML(
  timetablePages: TimetablePage[],
  config: Config,
) {
  const agencies = getAgencies() as { agency_name: string }[];
  if (agencies.length === 0) {
    throw new Error('No agencies found');
  }

  const geojson = config.showMap ? getAgencyGeoJSON(config) : undefined;

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
