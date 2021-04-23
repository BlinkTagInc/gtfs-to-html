const {
  cloneDeep,
  compact,
  every,
  find,
  findLast,
  first,
  flatMap,
  flattenDeep,
  isEqual,
  groupBy,
  last,
  maxBy,
  orderBy,
  reduce,
  size,
  some,
  sortBy,
  uniq,
  uniqBy
} = require('lodash');
const gtfs = require('gtfs');
const moment = require('moment');
const sqlString = require('sqlstring');
const toposort = require('toposort');

const {
  version
} = require('../package.json');
const fileUtils = require('./file-utils');
const {
  formatDate,
  formatDays,
  formatDaysLong,
  formatFrequency,
  formatStops,
  formatTimetableId,
  formatTimetableLabel,
  formatTimetablePageLabel,
  formatTrip,
  isNullOrEmpty,
  mergeTimetablesWithSameId,
  resetStoptimesToMidnight,
  timeToSeconds,
  updateStoptimesByOffset
} = require('./formatters');
const geoJSONUtils = require('./geojson-utils');
const timeUtils = require('./time-utils');

/*
 * Determine if a stoptime is a timepoint.
 */
const isTimepoint = stoptime => {
  if (isNullOrEmpty(stoptime.timepoint)) {
    return !isNullOrEmpty(stoptime.arrival_time) && !isNullOrEmpty(stoptime.departure_time);
  }

  return stoptime.timepoint === 1;
};

/*
 * Find the longest trip (most stops) in a group of trips and return stoptimes.
 */
const getLongestTripStoptimes = (trips, config) => {
  // If `showOnlyTimepoint` is true, then filter out all non-timepoints.
  const filteredTripStoptimes = config.showOnlyTimepoint === true ? trips.map(trip => trip.stoptimes.filter(stoptime => isTimepoint(stoptime))) : trips.map(trip => trip.stoptimes);

  return maxBy(filteredTripStoptimes, stoptimes => size(stoptimes));
};

/*
 * Find the first stop_id that all trips have in common, otherwise use the first
 * stoptime.
 */
const findCommonStopId = (trips, config) => {
  const longestTripStoptimes = getLongestTripStoptimes(trips, config);

  if (!longestTripStoptimes) {
    return null;
  }

  const commonStoptime = longestTripStoptimes.find((stoptime, idx) => {
    // If longest trip is a loop (first and last stops the same), then skip first stoptime.
    if (idx === 0 && stoptime.stop_id === last(longestTripStoptimes).stop_id) {
      return false;
    }

    // If stoptime doesn't have a time, skip it.
    if (isNullOrEmpty(stoptime.arrival_time)) {
      return false;
    }

    // Check if all trips have this stoptime and that they have a time.
    return every(trips, trip => {
      return trip.stoptimes.find(tripStoptime => tripStoptime.stop_id === stoptime.stop_id && tripStoptime.arrival_time !== null);
    });
  });

  return commonStoptime ? commonStoptime.stop_id : null;
};

/*
 * Return a set of unique trips (with at least one unique stop time) from an
 * array of trips.
 */
const deduplicateTrips = (trips, commonStopId) => {
  // Remove duplicate trips (from overlapping service_ids)
  const deduplicatedTrips = [];

  for (const trip of trips) {
    if (deduplicatedTrips.length === 0 || trip.stoptimes.length === 0) {
      deduplicatedTrips.push(trip);
      continue;
    }

    const stoptimes = trip.stoptimes.map(stoptime => stoptime.departure_time);
    const selectedStoptime = commonStopId ? find(trip.stoptimes, {
      stop_id: commonStopId
    }) : trip.stoptimes[0];

    // Find all other trips where the common stop has the same departure time.
    const similarTrips = deduplicatedTrips.filter(trip => {
      const stoptime = find(trip.stoptimes, {
        stop_id: selectedStoptime.stop_id
      });
      if (!stoptime) {
        return false;
      }

      return stoptime.departure_time === selectedStoptime.departure_time;
    });

    // Only add trip if no existing trip with the same set of timepoints has already been added.
    const tripIsUnique = every(similarTrips, similarTrip => {
      const similarTripStoptimes = similarTrip.stoptimes.map(stoptime => stoptime.departure_time);
      return !isEqual(stoptimes, similarTripStoptimes);
    });

    if (tripIsUnique) {
      deduplicatedTrips.push(trip);
    }
  }

  return deduplicatedTrips;
};

/*
 * Sort trips chronologically, using a common stop id if available, otherwise use the first stoptime.
 */
const sortTrips = (trips, config) => {
  let sortedTrips;
  let commonStopId;

  if (['beginning', 'end'].includes(config.sortingAlgorithm)) {
    sortedTrips = sortTripsByStartOrEnd(trips, config);
  } else {
    if (config.sortingAlgorithm === 'common') {
      commonStopId = findCommonStopId(trips, config);
    }

    sortedTrips = sortBy(trips, trip => {
      if (trip.stoptimes.length === 0) {
        return;
      }

      let selectedStoptime;
      if (commonStopId) {
        selectedStoptime = find(trip.stoptimes, {
          stop_id: commonStopId
        });
      } else if (config.sortingAlgorithm === 'last') {
        selectedStoptime = last(trip.stoptimes);
      } else if (config.sortingAlgorithm === 'first') {
        selectedStoptime = first(trip.stoptimes);
      } else {
        // Default to 'first' if no common stop is found.
        selectedStoptime = first(trip.stoptimes);
      }

      return timeToSeconds(selectedStoptime.departure_time);
    });
  }

  return deduplicateTrips(sortedTrips, commonStopId);
};

/*
 * Sort trips chronologically, using a common stop id if available, otherwise use the first stoptime.
 */
const sortTripsByStartOrEnd = (trips, config) => {
  let referenceStoptimes;
  let sortingDirection;
  let sortingOrder;
  let sortedTrips = trips;

  if (config.sortingAlgorithm === 'end') {
    referenceStoptimes = orderBy(getLongestTripStoptimes(trips, config), ['stop_sequence'], 'desc');
    sortingDirection = -1;
    sortingOrder = 'desc';
  } else {
    referenceStoptimes = sortBy(getLongestTripStoptimes(trips, config), ['stop_sequence']);
    sortingDirection = 1;
    sortingOrder = 'asc';
  }

  for (const stop of referenceStoptimes) {
    let previousSortingStoptime;
    for (const trip of sortedTrips) {
      if (trip.stoptimes.length === 0) {
        trip.sortingStoptime = undefined;
      }

      const selectedStoptime = find(trip.stoptimes, {
        stop_id: stop.stop_id
      });

      if (!selectedStoptime) {
        if (!trip.sortingStoptime || trip.sortingStoptime * sortingDirection < previousSortingStoptime * sortingDirection) {
          trip.sortingStoptime = previousSortingStoptime;
        }
      } else if (isTimepoint(selectedStoptime)) {
        trip.sortingStoptime = timeToSeconds(selectedStoptime.departure_time);
      } else if (!trip.sortingStoptime || trip.sortingStoptime * sortingDirection < previousSortingStoptime * sortingDirection) {
        trip.sortingStoptime = previousSortingStoptime;
      }

      if (selectedStoptime) {
        selectedStoptime.sortingTime = trip.sortingStoptime;
      }

      previousSortingStoptime = trip.sortingStoptime;
    }

    sortedTrips = orderBy(sortedTrips, ['sortingStoptime'], sortingOrder);
  }

  if (sortingOrder === 'desc') {
    return sortedTrips.reverse();
  }

  return sortedTrips;
};

/*
 * Get all calendar dates for a specific timetable.
 */
const getCalendarDates = async (timetable, config) => {
  const calendarDates = await gtfs.getCalendarDates({
    service_id: timetable.service_ids
  }, [], [
    ['date', 'ASC']
  ]);
  const start = timeUtils.fromGTFSDate(timetable.start_date);
  const end = timeUtils.fromGTFSDate(timetable.end_date);
  const filteredCalendarDates = {
    excludedDates: [],
    includedDates: []
  };

  for (const calendarDate of calendarDates) {
    if (moment(calendarDate.date, 'YYYYMMDD').isBetween(start, end)) {
      if (calendarDate.exception_type === 1) {
        filteredCalendarDates.includedDates.push(formatDate(calendarDate, config.dateFormat));
      } else if (calendarDate.exception_type === 2) {
        filteredCalendarDates.excludedDates.push(formatDate(calendarDate, config.dateFormat));
      }
    }
  }

  return filteredCalendarDates;
};

/*
 * Get days of the week from calendars.
 */
const getDaysFromCalendars = calendars => {
  const days = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0
  };

  for (const calendar of calendars) {
    for (const [day, value] of Object.entries(days)) {
      days[day] = value | calendar[day];
    }
  }

  return days;
};

/*
 * Get the `trip_headsign` for a specific timetable.
 */
const getDirectionHeadsignFromTimetable = async timetable => {
  const trips = await gtfs.getTrips({
    direction_id: timetable.direction_id,
    route_id: timetable.route_ids
  }, [
    'trip_headsign'
  ]);

  if (trips.length === 0) {
    return '';
  }

  return first(trips).trip_headsign;
};

/*
 * Get the notes for a specific timetable.
 */
const getTimetableNotes = async (timetable, config) => {
  const noteReferences = [
    // Get all notes for this timetable.
    ...await gtfs.getTimetableNotesReferences({
      timetable_id: timetable.timetable_id
    }),

    // Get all notes for this route.
    ...await gtfs.getTimetableNotesReferences({
      route_id: timetable.routes.map(route => route.route_id),
      timetable_id: null
    }),

    // Get all notes for all trips in this timetable.
    ...await gtfs.getTimetableNotesReferences({
      trip_id: timetable.orderedTrips.map(trip => trip.trip_id)
    }),

    // Get all notes for all stops in this timetable.
    ...await gtfs.getTimetableNotesReferences({
      stop_id: timetable.stops.map(stop => stop.stop_id),
      trip_id: null,
      route_id: null,
      timetable_id: null
    })
  ];

  const usedNoteReferences = [];
  // Check if stop_sequence matches any trip.
  for (const noteReference of noteReferences) {
    if (noteReference.stop_sequence === '' || noteReference.stop_sequence === null) {
      usedNoteReferences.push(noteReference);
      continue;
    }

    // Note references with stop_sequence must also have stop_id.
    if (noteReference.stop_id === '' || noteReference.stop_id === null) {
      config.logWarning(`Timetable Note Reference for note_id=${noteReference.note_id} has a \`stop_sequence\` but no \`stop_id\` - ignoring`);
      continue;
    }

    const stop = timetable.stops.find(stop => stop.stop_id === noteReference.stop_id);

    if (!stop) {
      continue;
    }

    const tripWithMatchingStopSequence = stop.trips.find(trip => trip.stop_sequence === noteReference.stop_sequence);

    if (tripWithMatchingStopSequence) {
      usedNoteReferences.push(noteReference);
    }
  }

  const notes = await gtfs.getTimetableNotes({
    note_id: usedNoteReferences.map(noteReference => noteReference.note_id)
  });

  // Assign symbols to each note if unassigned. Use a-z then default to integers.
  const symbols = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let symbolIndex = 0;
  for (const note of notes) {
    if (note.symbol === '' || note.symbol === null) {
      note.symbol = symbolIndex < (symbols.length - 1) ? symbols[symbolIndex] : (symbolIndex - symbols.length);
      symbolIndex += 1;
    }
  }

  const formattedNotes = usedNoteReferences.map(noteReference => {
    return {
      ...noteReference,
      ...notes.find(note => note.note_id === noteReference.note_id)
    };
  });

  return sortBy(formattedNotes, 'symbol');
};

/*
 * Create a timetable page from a single timetable. Used if no
 * `timetable_pages.txt` is present.
 */
const convertTimetableToTimetablePage = async (timetable, config) => {
  if (!timetable.routes) {
    timetable.routes = await gtfs.getRoutes({
      route_id: timetable.route_ids
    });
  }

  const filename = await fileUtils.generateFileName(timetable, config);

  return {
    timetable_page_id: timetable.timetable_id,
    timetable_page_label: timetable.timetable_label,
    timetables: [timetable],
    filename
  };
};

/*
 * Create a timetable page from a single route. Used if no `timetables.txt`
 * is present.
 */
/* eslint-disable max-params */
const convertRouteToTimetablePage = (route, direction, calendars, calendarDates, config) => {
  const timetable = {
    route_ids: [route.route_id],
    direction_id: direction ? direction.direction_id : undefined,
    direction_name: direction ? direction.trip_headsign : undefined,
    routes: [route],
    include_exceptions: (calendarDates && calendarDates.length > 0) ? 1 : 0,
    service_id: (calendarDates && calendarDates.length > 0) ? calendarDates[0].service_id : null,
    service_notes: null,
    timetable_label: null,
    start_time: null,
    end_time: null,
    orientation: null,
    timetable_sequence: null,
    show_trip_continuation: null,
    start_date: null,
    end_date: null
  };
  /* eslint-enable max-params */

  if (calendars && calendars.length > 0) {
    // Get days of week from calendars and assign to timetable.
    Object.assign(timetable, getDaysFromCalendars(calendars));

    timetable.start_date = timeUtils.toGTFSDate(moment.min(calendars.map(calendar => timeUtils.fromGTFSDate(calendar.start_date))));
    timetable.end_date = timeUtils.toGTFSDate(moment.max(calendars.map(calendar => timeUtils.fromGTFSDate(calendar.end_date))));
  }

  timetable.timetable_id = formatTimetableId(timetable);

  return convertTimetableToTimetablePage(timetable, config);
};

/*
 * Create timetable pages for all routes in an agency. Used if no
 * `timetables.txt` is present.
 */
const convertRoutesToTimetablePages = async config => {
  const db = gtfs.getDb();
  const routes = await gtfs.getRoutes();
  const calendars = await gtfs.getCalendars();

  // Find all calendar dates with service_ids not present in `calendar.txt`.
  const serviceIds = calendars.map(calendar => calendar.service_id);
  const calendarDates = await db.all(`SELECT * FROM calendar_dates WHERE exception_type = 1 AND service_id NOT IN (${serviceIds.map(serviceId => `'${serviceId}'`).join(', ')})`);

  const timetablePages = await Promise.all(routes.map(async route => {
    const trips = await gtfs.getTrips({
      route_id: route.route_id
    }, [
      'trip_headsign',
      'direction_id'
    ]);
    const directions = uniqBy(trips, trip => trip.direction_id);
    const dayGroups = groupBy(calendars, timeUtils.calendarToCalendarCode);
    const calendarDateGroups = groupBy(calendarDates, 'service_id');

    return Promise.all(directions.map(direction => {
      return Promise.all([
        Promise.all(Object.values(dayGroups).map(calendars => {
          return convertRouteToTimetablePage(route, direction, calendars, null, config);
        })),
        Promise.all(Object.values(calendarDateGroups).map(calendarDates => {
          return convertRouteToTimetablePage(route, direction, null, calendarDates, config);
        }))
      ]);
    }));
  }));

  return compact(flattenDeep(timetablePages));
};

/*
 * Generate all trips based on a start trip and an array of frequencies.
 */
const generateTripsByFrequencies = (trip, frequencies, config) => {
  const formattedFrequencies = frequencies.map(frequency => formatFrequency(frequency, config));
  const resetTrip = resetStoptimesToMidnight(trip);
  const trips = [];

  for (const frequency of formattedFrequencies) {
    const startSeconds = timeUtils.secondsAfterMidnight(frequency.start_time);
    const endSeconds = timeUtils.secondsAfterMidnight(frequency.end_time);

    for (let offset = startSeconds; offset < endSeconds; offset += frequency.headway_secs) {
      const newTrip = cloneDeep(resetTrip);
      trips.push({
        ...newTrip,
        trip_id: `${resetTrip.trip_id}_freq_${trips.length}`,
        stoptimes: updateStoptimesByOffset(newTrip, offset)
      });
    }
  }

  return trips;
};

/*
 * Check if any stoptimes have different arrival and departure times and
 * if they do, duplicate the stop id unless it is the first or last stop.
 */
const duplicateStopsForDifferentArrivalDeparture = (stopIds, timetable, config) => {
  for (const trip of timetable.orderedTrips) {
    for (const stoptime of trip.stoptimes) {
      const timepointDifference = timeUtils.fromGTFSTime(stoptime.departure_time).diff(timeUtils.fromGTFSTime(stoptime.arrival_time), 'minutes');

      if (config.showArrivalOnDifference === null || timepointDifference < config.showArrivalOnDifference) {
        continue;
      }

      const index = stopIds.indexOf(stoptime.stop_id);
      if (index === 0 || index === stopIds.length - 1) {
        continue;
      }

      if (stoptime.stop_id === stopIds[index + 1] || stoptime.stop_id === stopIds[index - 1]) {
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
const getStopOrder = async (timetable, config) => {
  // First, check if `timetable_stop_order.txt` for route exists
  const timetableStopOrders = await gtfs.getTimetableStopOrders({
    timetable_id: timetable.timetable_id
  },
  [
    'stop_id'
  ],
  [
    ['stop_sequence', 'ASC']
  ]);

  if (timetableStopOrders.length > 0) {
    return timetableStopOrders.map(timetableStopOrder => timetableStopOrder.stop_id);
  }

  // Next, try using a directed graph to determine stop order.
  try {
    const stopGraph = [];

    for (const trip of timetable.orderedTrips) {
      // If `showOnlyTimepoint` is true, then filter out all non-timepoints.
      const sortedStopIds = config.showOnlyTimepoint === true ? trip.stoptimes.filter(stoptime => isTimepoint(stoptime)).map(stoptime => stoptime.stop_id) : trip.stoptimes.map(stoptime => stoptime.stop_id);

      for (const [index, stopId] of sortedStopIds.entries()) {
        if (index === sortedStopIds.length - 1) {
          continue;
        }

        stopGraph.push([stopId, sortedStopIds[index + 1]]);
      }
    }

    const stopIds = toposort(stopGraph);

    return duplicateStopsForDifferentArrivalDeparture(stopIds, timetable, config);
  } catch {
    // Ignore errors and move to next strategy.
  }

  // Finally, fall back to using the stop order from the trip with the most stoptimes.
  const longestTripStoptimes = getLongestTripStoptimes(timetable.orderedTrips, config);
  const stopIds = longestTripStoptimes.map(stoptime => stoptime.stop_id);

  return duplicateStopsForDifferentArrivalDeparture(stopIds, timetable, config);
};

/*
 * Get an array of stops for a specific timetable.
 */
const getStopsForTimetable = async (timetable, config) => {
  if (timetable.orderedTrips.length === 0) {
    return [];
  }

  const orderedStopIds = await getStopOrder(timetable, config);
  const orderedStops = await Promise.all(orderedStopIds.map(async (stopId, index) => {
    const stops = await gtfs.getStops({
      stop_id: stopId
    });

    if (stops.length === 0) {
      throw new Error(`No stop found found for stop_id=${stopId} in timetable_id=${timetable.timetable_id}`);
    }

    const stop = {
      ...stops[0],
      trips: []
    };

    if (index < (orderedStopIds.length - 1) && stopId === orderedStopIds[index + 1]) {
      stop.type = 'arrival';
    } else if (index > 0 && stopId === orderedStopIds[index - 1]) {
      stop.type = 'departure';
    }

    return stop;
  }));

  // If `showStopCity` is true, look up stop attributes.
  if (timetable.showStopCity) {
    const stopAttributes = await gtfs.getStopAttributes({
      stop_id: orderedStopIds
    });

    for (const stopAttribute of stopAttributes) {
      const stop = orderedStops.find(stop => stop.stop_id === stopAttribute.stop_id);

      if (stop) {
        stop.stop_city = stopAttribute.stop_city;
      }
    }
  }

  return orderedStops;
};

/*
 * Get all calendars from a specific timetable.
 */
const getCalendarsFromTimetable = async timetable => {
  const db = gtfs.getDb();
  let whereClause = '';
  const whereClauses = [];

  if (timetable.end_date) {
    whereClauses.push(`start_date <= ${sqlString.escape(timetable.end_date)}`);
  }

  if (timetable.start_date) {
    whereClauses.push(`end_date >= ${sqlString.escape(timetable.start_date)}`);
  }

  const days = getDaysFromCalendars([timetable]);
  // Create an 'OR' query array of days based on calendars.
  const dayQueries = reduce(days, (memo, value, key) => {
    if (value === 1) {
      memo.push(`${key} = 1`);
    }

    return memo;
  }, []);

  if (dayQueries.length > 0) {
    whereClauses.push(`(${dayQueries.join(' OR ')})`);
  }

  if (whereClauses.length > 0) {
    whereClause = `WHERE ${whereClauses.join(' AND ')}`;
  }

  return db.all(`SELECT * FROM calendar ${whereClause}`);
};

/*
 * Get all calendar date service ids for an agency between two dates.
 */
const getCalendarDatesServiceIds = async (startDate, endDate) => {
  const db = gtfs.getDb();
  const whereClauses = ['exception_type = 1'];

  if (endDate) {
    whereClauses.push(`date <= ${sqlString.escape(endDate)}`);
  }

  if (startDate) {
    whereClauses.push(`date >= ${sqlString.escape(startDate)}`);
  }

  const calendarDates = await db.all(`SELECT DISTINCT service_id FROM calendar_dates WHERE ${whereClauses.join(' AND ')}`);
  return calendarDates.map(calendarDate => calendarDate.service_id);
};

/*
 * For a specific stop_id, returns an array all stop_ids within a parent station
 * and the stop_id of parent station itself. If no parent station, it returns the
 * stop_id.
 */
const getAllStationStopIds = async stopId => {
  const stops = await gtfs.getStops({
    stop_id: stopId
  });

  const stop = stops[0];

  if (isNullOrEmpty(stop.parent_station)) {
    return [stopId];
  }

  const stopsInParentStation = await gtfs.getStops({
    parent_station: stop.parent_station
  }, ['stop_id']);

  return [stop.parent_station, ...stopsInParentStation.map(stop => stop.stop_id)];
};

/*
 * Get trips with the same `block_id`.
 */
const getTripsWithSameBlock = async (trip, timetable) => {
  const trips = await gtfs.getTrips({
    block_id: trip.block_id,
    service_id: timetable.service_ids
  }, [
    'trip_id',
    'route_id'
  ]);

  await Promise.all(trips.map(async blockTrip => {
    const stopTimes = await gtfs.getStoptimes({
      trip_id: blockTrip.trip_id
    },
    [],
    [
      ['stop_sequence', 'ASC']
    ]
    );

    if (stopTimes.length === 0) {
      throw new Error(`No stoptimes found found for trip_id=${blockTrip.trip_id}`);
    }

    blockTrip.firstStoptime = first(stopTimes);
    blockTrip.lastStoptime = last(stopTimes);
  }));

  return sortBy(trips, trip => trip.firstStoptime.departure_timestamp);
};

/*
 * Get next trip and previous trip with the same `block_id` if it arrives or
 * departs from the same stop and is a different route.
 */
const addTripContinuation = async (trip, timetable) => {
  if (!trip.block_id) {
    return;
  }

  const maxContinuesAsWaitingTimeSeconds = 60 * 60;

  const firstStoptime = first(trip.stoptimes);
  const firstStopIds = await getAllStationStopIds(firstStoptime.stop_id);
  const lastStoptime = last(trip.stoptimes);
  const lastStopIds = await getAllStationStopIds(lastStoptime.stop_id);
  const blockTrips = await getTripsWithSameBlock(trip, timetable);

  // "Continues From" trips must be the previous trip chronologically.
  const previousTrip = findLast(blockTrips, blockTrip => {
    return blockTrip.lastStoptime.arrival_timestamp <= firstStoptime.departure_timestamp;
  });

  /*
   * "Continues From" trips
   * * must be a different route_id
   * * must not be more than 60 minutes before
   * * must have their last stop_id be the same as the next trip's first stop_id
   */
  if (previousTrip && previousTrip.route_id !== trip.route_id && previousTrip.lastStoptime.arrival_timestamp >= firstStoptime.departure_timestamp - maxContinuesAsWaitingTimeSeconds && firstStopIds.includes(previousTrip.lastStoptime.stop_id)) {
    const routes = await gtfs.getRoutes({
      route_id: previousTrip.route_id
    });

    previousTrip.route = routes[0];

    trip.continues_from_route = previousTrip;
  }

  // "Continues As" trips must be the next trip chronologically.
  const nextTrip = find(blockTrips, blockTrip => {
    return blockTrip.firstStoptime.departure_timestamp >= lastStoptime.arrival_timestamp;
  });

  // "Continues As" trips must be a different route_id.
  /*
   * "Continues As" trips
   * * must be a different route_id
   * * must not be more than 60 minutes later
   * * must have their first stop_id be the same as the previous trip's last stop_id
   */
  if (nextTrip && nextTrip.route_id !== trip.route_id && nextTrip.firstStoptime.departure_timestamp <= lastStoptime.arrival_timestamp + maxContinuesAsWaitingTimeSeconds && lastStopIds.includes(nextTrip.firstStoptime.stop_id)) {
    const routes = await gtfs.getRoutes({
      route_id: nextTrip.route_id
    });

    nextTrip.route = routes[0];
    trip.continues_as_route = nextTrip;
  }
};

/*
 * Apply time range filters to trips and remove trips with less than two stoptimes for stops used in this timetable.
 * Stops can be excluded by using `timetable_stop_order.txt`. Additionally, remove trip stoptimes for unused stops.
 */
const filterTrips = timetable => {
  let filteredTrips = timetable.orderedTrips;

  // Exclude trips before timetable `start_timestamp`
  if (timetable.start_timestamp !== '' && timetable.start_timestamp !== null && timetable.start_timestamp !== undefined) {
    filteredTrips = filteredTrips.filter(trip => {
      return trip.stoptimes[0].arrival_timestamp >= timetable.start_timestamp;
    });
  }

  // Exclude trips after timetable `end_timestamp`
  if (timetable.end_timestamp !== '' && timetable.end_timestamp !== null && timetable.end_timestamp !== undefined) {
    filteredTrips = filteredTrips.filter(trip => {
      return trip.stoptimes[0].arrival_timestamp < timetable.end_timestamp;
    });
  }

  // Remove stoptimes for stops not used in timetable
  const timetableStopIds = new Set(timetable.stops.map(stop => stop.stop_id));
  for (const trip of filteredTrips) {
    trip.stoptimes = trip.stoptimes.filter(stoptime => timetableStopIds.has(stoptime.stop_id));
  }

  // Exclude trips with less than two stops
  filteredTrips = filteredTrips.filter(trip => trip.stoptimes.length > 1);

  return filteredTrips;
};

/*
 * Get all trips from a timetable.
 */
const getTripsForTimetable = async (timetable, calendars, config) => {
  const tripQuery = {
    route_id: timetable.route_ids,
    service_id: timetable.service_ids
  };

  if (!isNullOrEmpty(timetable.direction_id)) {
    tripQuery.direction_id = timetable.direction_id;
  }

  const trips = await gtfs.getTrips(tripQuery);

  if (trips.length === 0) {
    timetable.warnings.push(`No trips found for route_id=${timetable.route_ids.join('_')}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.service_ids)}, timetable_id=${timetable.timetable_id}`);
  }

  const frequencies = await gtfs.getFrequencies({
    trip_id: trips.map(trip => trip.trip_id)
  });

  // Updated timetable.serviceIds with only the service IDs actually used in one or more trip.
  timetable.service_ids = uniq(trips.map(trip => trip.service_id));

  const formattedTrips = [];
  await Promise.all(trips.map(async trip => {
    const formattedTrip = formatTrip(trip, timetable, calendars, config);
    formattedTrip.stoptimes = await gtfs.getStoptimes({
      trip_id: formattedTrip.trip_id
    },
    [],
    [
      ['stop_sequence', 'ASC']
    ]);

    if (formattedTrip.stoptimes.length === 0) {
      timetable.warnings.push(`No stoptimes found for trip_id=${formattedTrip.trip_id}, route_id=${timetable.route_ids.join('_')}, timetable_id=${timetable.timetable_id}`);
    }

    if (timetable.show_trip_continuation) {
      await addTripContinuation(formattedTrip, timetable);

      if (formattedTrip.continues_as_route) {
        timetable.has_continues_as_route = true;
      }

      if (formattedTrip.continues_from_route) {
        timetable.has_continues_from_route = true;
      }
    }

    const tripFrequencies = frequencies.filter(frequency => frequency.trip_id === trip.trip_id);

    if (tripFrequencies.length === 0) {
      formattedTrips.push(formattedTrip);
    } else {
      const frequencyTrips = generateTripsByFrequencies(formattedTrip, frequencies, config);
      formattedTrips.push(...frequencyTrips);
      timetable.frequencies = frequencies;
      timetable.frequencyExactTimes = some(frequencies, {
        exact_times: 1
      });
    }
  }));

  if (config.useParentStation) {
    const stopIds = [];

    for (const trip of formattedTrips) {
      for (const stoptime of trip.stoptimes) {
        stopIds.push(stoptime.stop_id);
      }
    }

    const stops = await gtfs.getStops({
      stop_id: uniq(stopIds)
    },
    [
      'parent_station',
      'stop_id'
    ]);

    for (const trip of formattedTrips) {
      for (const stoptime of trip.stoptimes) {
        const parentStationStop = stops.find(stop => stop.stop_id === stoptime.stop_id);
        stoptime.stop_id = parentStationStop.parent_station || parentStationStop.stop_id;
      }
    }
  }

  return sortTrips(formattedTrips, config);
};

/*
 * Format timetables for display.
 */
const formatTimetables = async (timetables, config) => {
  const formattedTimetables = await Promise.all(timetables.map(async timetable => {
    timetable.warnings = [];
    const dayList = formatDays(timetable, config);
    const calendars = await getCalendarsFromTimetable(timetable);
    let serviceIds = calendars.map(calendar => calendar.service_id);

    if (timetable.include_exceptions === 1) {
      const calendarDatesServiceIds = await getCalendarDatesServiceIds(timetable.start_date, timetable.end_date);
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
      dayListLong: formatDaysLong(dayList, config)
    });

    timetable.orderedTrips = await getTripsForTimetable(timetable, calendars, config);
    timetable.stops = await getStopsForTimetable(timetable, config);
    timetable.calendarDates = await getCalendarDates(timetable, config);
    timetable.timetable_label = formatTimetableLabel(timetable);
    timetable.notes = await getTimetableNotes(timetable, config);

    if (config.showMap) {
      timetable.geojson = await geoJSONUtils.getTimetableGeoJSON(timetable, config);
    }

    // Filter trips after all timetable properties are assigned
    timetable.orderedTrips = filterTrips(timetable);

    // Format stops after all timetable properties are assigned
    timetable.stops = formatStops(timetable, config);

    return timetable;
  }));

  if (config.allowEmptyTimetables) {
    return formattedTimetables;
  }

  return formattedTimetables.filter(timetable => timetable.orderedTrips.length > 0);
};

/*
 * Get all timetable pages for an agency.
 */
exports.getTimetablePages = async config => {
  const timetables = mergeTimetablesWithSameId(await gtfs.getTimetables());

  // If no timetables, build each route and direction into a timetable.
  if (timetables.length === 0) {
    return convertRoutesToTimetablePages(config);
  }

  const timetablePages = await gtfs.getTimetablePages({}, [], [
    ['timetable_page_id', 'ASC']
  ]);

  // Check if there are any timetable pages defined in `timetable_pages.txt`.
  if (timetablePages.length === 0) {
    // If no timetablepages, use timetables
    return Promise.all(timetables.map(timetable => convertTimetableToTimetablePage(timetable, config)));
  }

  const routes = await gtfs.getRoutes();

  // Otherwise, use timetable pages defined in `timetable_pages.txt`.
  return Promise.all(timetablePages.map(async timetablePage => {
    timetablePage.timetables = sortBy(timetables.filter(timetable => timetable.timetable_page_id === timetablePage.timetable_page_id), 'timetable_sequence');

    // Add routes for each timetable.
    for (const timetable of timetablePage.timetables) {
      timetable.routes = routes.filter(route => timetable.route_ids.includes(route.route_id));
    }

    return timetablePage;
  }));
};

/*
 * Get a timetable_page by id.
 */
const getTimetablePageById = async (timetablePageId, config) => {
  // Check if there are any timetable pages defined in `timetable_pages.txt`.
  const timetablePages = await gtfs.getTimetablePages({
    timetable_page_id: timetablePageId
  });

  const timetables = mergeTimetablesWithSameId(await gtfs.getTimetables());

  if (timetablePages.length > 1) {
    throw new Error(`Multiple timetable_pages found for timetable_page_id=${timetablePageId}`);
  }

  if (timetablePages.length === 1) {
    // Use timetablePage defined in `timetable_pages.txt`.
    const timetablePage = timetablePages[0];
    timetablePage.timetables = sortBy(timetables.filter(timetable => timetable.timetable_page_id === timetablePageId), 'timetable_sequence');

    // Add routes for each timetable
    await Promise.all(timetablePage.timetables.map(async timetable => {
      timetable.routes = await gtfs.getRoutes({
        route_id: timetable.route_ids
      });
    }));

    return timetablePage;
  }

  if (timetables.length > 0) {
    // If no timetable_page, use timetable defined in `timetables.txt`.
    const timetablePageTimetables = timetables.filter(timetable => timetable.timetable_id === timetablePageId);

    if (timetablePageTimetables.length === 0) {
      throw new Error(`No timetable found for timetable_page_id=${timetablePageId}`);
    }

    return convertTimetableToTimetablePage(timetablePageTimetables[0], config);
  }

  // If no `timetables.txt` in GTFS, build the route and direction into a timetable.
  let calendarCode;
  let calendars;
  let calendarDates;
  let serviceId;
  let directionId = '';
  const parts = timetablePageId.split('|');
  if (parts.length > 2) {
    directionId = Number.parseInt(parts.pop(), 10);
    calendarCode = parts.pop();
  } else if (parts.length > 1) {
    directionId = null;
    calendarCode = parts.pop();
  }

  const routeId = parts.join('|');

  const routes = await gtfs.getRoutes({
    route_id: routeId
  });

  const trips = await gtfs.getTrips({
    route_id: routeId,
    direction_id: directionId
  }, [
    'trip_headsign',
    'direction_id'
  ]);
  const directions = uniqBy(trips, trip => trip.direction_id);

  if (directions.length === 0) {
    throw new Error(`No trips found for timetable_page_id=${timetablePageId} route_id=${routeId} direction_id=${directionId}`);
  }

  if (/^[01]*$/.test(calendarCode)) {
    calendars = await gtfs.getCalendars({
      ...timeUtils.calendarCodeToCalendar(calendarCode)
    });
  } else {
    serviceId = calendarCode;
    calendarDates = await gtfs.getCalendarDates({
      exception_type: 1,
      service_id: serviceId
    });
  }

  return convertRouteToTimetablePage(routes[0], directions[0], calendars, calendarDates, config);
};

/*
 * Initialize configuration with defaults.
 */
exports.setDefaultConfig = initialConfig => {
  const defaults = {
    allowEmptyTimetables: false,
    beautify: false,
    coordinatePrecision: 5,
    dateFormat: 'MMM D, YYYY',
    daysShortStrings: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    daysStrings: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    defaultOrientation: 'vertical',
    interpolatedStopSymbol: '•',
    interpolatedStopText: 'Estimated time of arrival',
    gtfsToHtmlVersion: version,
    menuType: 'jump',
    noDropoffSymbol: '‡',
    noDropoffText: 'No drop off available',
    noHead: false,
    noPickupSymbol: '***',
    noPickupText: 'No pickup available',
    noServiceSymbol: '-',
    noServiceText: 'No service at this stop',
    outputFormat: 'html',
    requestDropoffSymbol: '†',
    requestDropoffText: 'Must request drop off',
    requestPickupSymbol: '***',
    requestPickupText: 'Request stop - call for pickup',
    serviceNotProvidedOnText: 'Service not provided on',
    serviceProvidedOnText: 'Service provided on',
    showArrivalOnDifference: 0.2,
    showMap: false,
    showOnlyTimepoint: false,
    showRouteTitle: true,
    showStopCity: false,
    showStopDescription: false,
    skipImport: false,
    sortingAlgorithm: 'common',
    timeFormat: 'h:mma',
    useParentStation: true,
    verbose: true,
    zipOutput: false
  };

  const config = Object.assign(defaults, initialConfig);

  if (config.outputFormat === 'pdf') {
    // Force noHead to false to false if pdfs are asked for
    config.noHead = false;
  }

  return config;
};

/*
 * Get a timetable page by id.
 */
exports.getFormattedTimetablePage = async (timetablePageId, config) => {
  const timetablePage = await getTimetablePageById(timetablePageId, config);

  timetablePage.consolidatedTimetables = await formatTimetables(timetablePage.timetables, config);
  timetablePage.timetable_page_label = formatTimetablePageLabel(timetablePage);
  timetablePage.dayList = formatDays(getDaysFromCalendars(timetablePage.consolidatedTimetables), config);
  timetablePage.dayLists = uniq(timetablePage.consolidatedTimetables.map(timetable => timetable.dayList));
  timetablePage.route_ids = uniq(flatMap(timetablePage.consolidatedTimetables, 'route_ids'));

  const timetableRoutes = await gtfs.getRoutes({
    route_id: timetablePage.route_ids
  }, [
    'route_color',
    'route_text_color',
    'agency_id'
  ]);

  timetablePage.routeColors = timetableRoutes.map(route => route.route_color);
  timetablePage.routeTextColors = timetableRoutes.map(route => route.route_text_color);
  timetablePage.agency_ids = compact(timetableRoutes.map(route => route.agency_id));

  // Set default filename.
  if (!timetablePage.filename) {
    timetablePage.filename = `${timetablePage.timetable_page_id}.html`;
  }

  // Get `direction_name` for each timetable.
  await Promise.all(timetablePage.consolidatedTimetables.map(async timetable => {
    if (isNullOrEmpty(timetable.direction_name)) {
      timetable.direction_name = await getDirectionHeadsignFromTimetable(timetable);
    }

    if (!timetable.routes) {
      timetable.routes = await gtfs.getRoutes({
        route_id: timetable.route_ids
      });
    }
  }));

  return timetablePage;
};

/*
 * Generate stats about timetable page.
 */
const generateStats = timetablePage => {
  const stats = {
    stops: 0,
    trips: 0,
    route_ids: {},
    service_ids: {}
  };

  for (const timetable of timetablePage.consolidatedTimetables) {
    stats.stops += timetable.stops.length;
    stats.trips += timetable.orderedTrips.length;
    for (const serviceId of timetable.service_ids) {
      stats.service_ids[serviceId] = true;
    }

    for (const routeId of timetable.route_ids) {
      stats.route_ids[routeId] = true;
    }
  }

  stats.routes = size(stats.route_ids);
  stats.calendars = size(stats.service_ids);

  return stats;
};

/*
 * Generate the HTML timetable for a timetable page.
 */
exports.generateHTML = async (timetablePage, config) => {
  const templateVars = {
    timetablePage,
    config
  };
  const html = await fileUtils.renderFile('timetablepage', templateVars, config);
  const stats = generateStats(timetablePage);
  return {
    html,
    stats
  };
};

/*
 * Generate the HTML for the agency overview page.
 */
exports.generateOverviewHTML = async (timetablePages, config) => {
  const agencies = await gtfs.getAgencies();
  if (agencies.length === 0) {
    throw new Error('No agencies found');
  }

  let geojson;
  if (config.showMap) {
    geojson = await geoJSONUtils.getAgencyGeoJSON(config);
  }

  // Sort timetables for display, first numerically then alphabetically.
  const sortedTimetablePages = sortBy(timetablePages, [
    timetablePage => {
      if (timetablePage.consolidatedTimetables.length > 0 && timetablePage.consolidatedTimetables[0].routes.length > 0) {
        return Number.parseInt(timetablePage.consolidatedTimetables[0].routes[0].route_short_name, 10);
      }
    },
    timetablePage => {
      if (timetablePage.consolidatedTimetables.length > 0 && timetablePage.consolidatedTimetables[0].routes.length > 0) {
        return timetablePage.consolidatedTimetables[0].routes[0].route_short_name;
      }
    }
  ]);

  const templateVars = {
    agency: {
      ...first(agencies),
      geojson
    },
    agencies,
    geojson,
    config,
    timetablePages: sortedTimetablePages
  };
  return fileUtils.renderFile('overview', templateVars, config);
};
