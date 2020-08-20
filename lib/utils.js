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
  map,
  maxBy,
  omit,
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

const { version } = require('../package.json');
const fileUtils = require('./file-utils');
const formatters = require('./formatters');
const geoJSONUtils = require('./geojson-utils');
const timeUtils = require('./time-utils');

/*
 * Determine if a stoptime is a timepoint.
 */
const isTimepoint = stoptime => {
  if (stoptime.timepoint === null) {
    return stoptime.arrival_time !== '' && stoptime.departure_time !== '';
  }

  return stoptime.timepoint === 1;
};

/*
 * Find the longest trip (most stops) in a group of trips and return stoptimes.
 */
const getLongestTripStoptimes = (trips, config) => {
  let filteredTripStoptimes;

  // If `showOnlyTimepoint` is true, then filter out all non-timepoints
  if (config.showOnlyTimepoint === true) {
    filteredTripStoptimes = trips.map(trip => trip.stoptimes.filter(stoptime => isTimepoint(stoptime)));
  } else {
    filteredTripStoptimes = trips.map(trip => trip.stoptimes);
  }

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
    // If longest trip is a loop (first and last stops the same), then skip first stoptime
    if (idx === 0 && stoptime.stop_id === last(longestTripStoptimes).stop_id) {
      return false;
    }

    // If stoptime isn't a timepoint, skip it
    if (stoptime.arrival_time === '') {
      return false;
    }

    return every(trips, trip => {
      return find(trip.stoptimes, { stop_id: stoptime.stop_id });
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
  const deduplicatedTrips = trips.reduce((memo, trip) => {
    if (memo.length === 0 || trip.stoptimes.length === 0) {
      memo.push(trip);
    } else {
      const stoptimes = map(trip.stoptimes, 'departure_time');

      let selectedStoptime;
      if (commonStopId) {
        selectedStoptime = find(trip.stoptimes, { stop_id: commonStopId });
      } else {
        selectedStoptime = trip.stoptimes[0];
      }

      // Find all other trips where the common stop has the same departure time
      const similarTrips = memo.filter(trip => {
        const stoptime = find(trip.stoptimes, { stop_id: selectedStoptime.stop_id });
        if (!stoptime) {
          return false;
        }

        return stoptime.departure_time === selectedStoptime.departure_time;
      });

      // Only add trip if no existing trip with the same set of timepoints has already been added
      const tripIsUnique = every(similarTrips, similarTrip => {
        const similarTripStoptimes = map(similarTrip.stoptimes, 'departure_time');
        return !isEqual(stoptimes, similarTripStoptimes);
      });

      if (tripIsUnique) {
        memo.push(trip);
      }
    }

    return memo;
  }, []);

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
        selectedStoptime = find(trip.stoptimes, { stop_id: commonStopId });
      } else if (config.sortingAlgorithm === 'last') {
        selectedStoptime = last(trip.stoptimes);
      } else if (config.sortingAlgorithm === 'first') {
        selectedStoptime = first(trip.stoptimes);
      } else {
        // Default to 'first' if no common stop is found.
        selectedStoptime = first(trip.stoptimes);
      }

      return formatters.timeToSeconds(selectedStoptime.departure_time);
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

      const selectedStoptime = find(trip.stoptimes, { stop_id: stop.stop_id });

      if (!selectedStoptime) {
        if (!trip.sortingStoptime || trip.sortingStoptime * sortingDirection < previousSortingStoptime * sortingDirection) {
          trip.sortingStoptime = previousSortingStoptime;
        }
      } else if (isTimepoint(selectedStoptime)) {
        trip.sortingStoptime = formatters.timeToSeconds(selectedStoptime.departure_time);
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
  const calendarDates = await gtfs.getCalendarDates({ service_id: timetable.service_ids }, [], [['date', 'ASC']]);
  const start = timeUtils.fromGTFSDate(timetable.start_date);
  const end = timeUtils.fromGTFSDate(timetable.end_date);

  const filteredCalendarDates = calendarDates.reduce((memo, calendarDate) => {
    if (moment(calendarDate.date, 'YYYYMMDD').isBetween(start, end)) {
      if (calendarDate.exception_type === 1) {
        memo.includedDates.push(formatters.formatDate(calendarDate, config.dateFormat));
      } else if (calendarDate.exception_type === 2) {
        memo.excludedDates.push(formatters.formatDate(calendarDate, config.dateFormat));
      }
    }

    return memo;
  }, {
    excludedDates: [],
    includedDates: []
  });

  return filteredCalendarDates;
};

/*
 * Get days of the week from calendars
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
    Object.entries(days).forEach(([day, value]) => {
      days[day] = value | calendar[day];
    });
  }

  return days;
};

/*
 * Get the trip_headsign for a specific timetable.
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
 * Create a timetable page from a single timetable. Used if no
 * `timetable_pages.txt` is present.
 */
const convertTimetableToTimetablePage = async (timetable, config) => {
  if (!timetable.routes) {
    timetable.routes = await gtfs.getRoutes({ route_id: timetable.route_ids });
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
    service_id: (calendarDates && calendarDates.length > 0) ? calendarDates[0].service_id : null
  };
  /* eslint-enable max-params */

  // Get days of week from calendars and assign to timetable
  Object.assign(timetable, getDaysFromCalendars(calendars || []));

  timetable.timetable_id = formatters.formatTimetableId(timetable);

  return convertTimetableToTimetablePage(timetable, config);
};

/*
 * Create timetable pages for all routes in an agency. Used if no
 * `timetables.txt` is present.
 */
const convertRoutesToTimetablePages = async config => {
  const db = gtfs.getDb();
  const routes = await gtfs.getRoutes();
  const timetablePages = await Promise.all(routes.map(async route => {
    const trips = await gtfs.getTrips({
      route_id: route.route_id
    }, [
      'trip_headsign',
      'direction_id'
    ]);
    const directions = uniqBy(trips, trip => trip.trip_headsign);

    const calendars = await gtfs.getCalendars();

    // Find all calendar dates with service_ids not present in calendar.txt
    const serviceIds = calendars.map(calendar => calendar.service_id);
    const calendarDates = await db.all(`SELECT * FROM calendar_dates WHERE exception_type = 1 AND service_id NOT IN (${serviceIds.map(() => '?').join(', ')})`, serviceIds);

    const dayGroups = groupBy(calendars, timeUtils.calendarToCalendarCode);
    const calendarDateGroups = groupBy(calendarDates, 'service_id');

    return Promise.all(directions.map(direction => {
      return Promise.all([
        Promise.all(map(dayGroups, calendars => {
          return convertRouteToTimetablePage(route, direction, calendars, null, config);
        })),
        Promise.all(map(calendarDateGroups, calendarDates => {
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
const generateTripsByFrequencies = (trip, frequencies) => {
  const resetTrip = formatters.resetStoptimesToMidnight(trip);
  return frequencies.reduce((memo, frequency) => {
    const startSeconds = timeUtils.secondsAfterMidnight(frequency.start_time);
    const endSeconds = timeUtils.secondsAfterMidnight(frequency.end_time);
    for (let offset = startSeconds; offset < endSeconds; offset += frequency.headway_secs) {
      const newTrip = omit(cloneDeep(resetTrip), ['_id']);
      newTrip.trip_id = `${resetTrip.trip_id}_freq_${memo.length}`;
      newTrip.stoptimes = formatters.updateStoptimesByOffset(newTrip, offset);
      memo.push(newTrip);
    }

    return memo;
  }, []);
};

/*
 * Get an array of stop_ids for a specific timetable.
 */
const getStopOrder = async (timetable, config) => {
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
    // Use the stop_sequence from `timetable_stop_order.txt`
    return map(timetableStopOrders, 'stop_id');
  }

  let stopIds = [];
  const longestTripStoptimes = getLongestTripStoptimes(timetable.orderedTrips, config);

  for (const stoptime of longestTripStoptimes) {
    stopIds[stoptime.stop_sequence] = stoptime.stop_id;
  }

  // Remove any missing values from missing stop_sequence
  stopIds = compact(stopIds);

  /*
    * Check if any stoptimes have different arrival and departure times and
    * if they do, duplicate the stop id unless it is the first or last stop.
  */
  for (const trip of timetable.orderedTrips) {
    for (const stoptime of trip.stoptimes) {
      const timepointDifference = timeUtils.fromGTFSTime(stoptime.departure_time).diff(timeUtils.fromGTFSTime(stoptime.arrival_time), 'minutes');
      if (config.showArrivalOnDifference !== null && timepointDifference >= config.showArrivalOnDifference) {
        const index = stopIds.indexOf(stoptime.stop_id);
        if (index === 0 || index === stopIds.length - 1) {
          continue;
        }

        if (stopIds[index] === stopIds[index + 1] || stopIds[index] === stopIds[index - 1]) {
          continue;
        }

        stopIds.splice(index, 0, stoptime.stop_id);
      }
    }
  }

  return stopIds;
};

/*
 * Get an array of stops for a specific timetable.
 */
const getStops = async (timetable, config) => {
  if (timetable.orderedTrips.length === 0) {
    return [];
  }

  const stopOrder = await getStopOrder(timetable, config);
  const stops = await gtfs.getStops({ stop_id: stopOrder });

  const orderedStops = stopOrder.map((stopId, index) => {
    // Clone stop to support using the same stop more than once in a timetable
    const stop = cloneDeep(stops.find(stop => stop.stop_id === stopId));
    stop.trips = [];

    if (index < (stopOrder.length - 1) && stopId === stopOrder[index + 1]) {
      stop.type = 'arrival';
    } else if (index > 0 && stopId === stopOrder[index - 1]) {
      stop.type = 'departure';
    }

    return stop;
  });

  // If `showStopCity` is true, look up stop attributes.
  if (timetable.showStopCity) {
    const stopAttributes = await gtfs.getStopAttributes({ stop_id: stopOrder });

    if (stopAttributes.length > 0) {
      for (const stopAttribute of stopAttributes) {
        const stop = orderedStops.find(stop => stop.stop_id === stopAttribute.stop_id);

        if (stop) {
          stop.stop_city = stopAttribute.stop_city;
        }
      }
    }
  }

  const formattedStops = formatters.formatStops(compact(orderedStops), timetable, config);

  return formattedStops;
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
  // Create an $or query array of days based on calendars
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
 * Get formatted frequencies for a specific trip.
 */
const getFrequenciesByTrip = async trip => {
  const frequencies = await gtfs.getFrequencies({
    trip_id: trip.trip_id
  });
  return frequencies.map(frequency => formatters.formatFrequency(frequency));
};

/*
 * Get all stoptimes for a trip.
 */
const getStoptimesByTrip = async trip => {
  return gtfs.getStoptimes({
    trip_id: trip.trip_id
  },
  [],
  [
    ['stop_sequence', 'ASC']
  ]);
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

  if (stop.parent_station === '' || stop.parent_station === null) {
    return [stopId];
  }

  const stopsInParentStation = await gtfs.getStops({
    parent_station: stop.parent_station
  }, ['stop_id']);

  return [stop.parent_station, ...map(stopsInParentStation, 'stop_id')];
};

/*
 * Get trips with the same blockId
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
    const stopTimes = await gtfs.getStoptimes(
      {
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
 * Get next trip and previous trip with the same block_id if it arrives/departs
 * from the same stop and is a different route.
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

  // "Continues From" trips must be a different route_id.
  if (previousTrip && previousTrip.route_id !== trip.route_id) {
    // "Continues From" trips must not be more than 60 minutes before.
    if (previousTrip.lastStoptime.arrival_timestamp >= firstStoptime.departure_timestamp - maxContinuesAsWaitingTimeSeconds) {
      // "Continues From" trips must have their last stop_id be the same as the next trip's first stop_id.
      if (firstStopIds.includes(previousTrip.lastStoptime.stop_id)) {
        const routes = await gtfs.getRoutes({
          route_id: previousTrip.route_id
        });

        previousTrip.route = routes[0];

        trip.continues_from_route = previousTrip;
      }
    }
  }

  // "Continues As" trips must be the next trip chronologically.
  const nextTrip = find(blockTrips, blockTrip => {
    return blockTrip.firstStoptime.departure_timestamp >= lastStoptime.arrival_timestamp;
  });

  // "Continues As" trips must be a different route_id.
  if (nextTrip && nextTrip.route_id !== trip.route_id) {
    // "Continues As" trips must not be more than 60 minutes later.
    if (nextTrip.firstStoptime.departure_timestamp <= lastStoptime.arrival_timestamp + maxContinuesAsWaitingTimeSeconds) {
      // "Continues As" trips must have their first stop_id be the same as the previous trip's last stop_id.
      if (lastStopIds.includes(nextTrip.firstStoptime.stop_id)) {
        const routes = await gtfs.getRoutes({
          route_id: nextTrip.route_id
        });

        nextTrip.route = routes[0];
        trip.continues_as_route = nextTrip;
      }
    }
  }
};

/*
 * Apply time range filters to trips
 */
const filterTrips = (trips, timetable) => {
  let filteredTrips = trips;
  if (timetable.start_timestamp !== '' && timetable.start_timestamp !== null) {
    filteredTrips = filteredTrips.filter(trip => {
      return trip.stoptimes[0].arrival_timestamp >= timetable.start_timestamp;
    });
  }

  if (timetable.end_timestamp !== '' && timetable.end_timestamp !== null) {
    filteredTrips = filteredTrips.filter(trip => {
      return trip.stoptimes[0].arrival_timestamp < timetable.end_timestamp;
    });
  }

  return filteredTrips;
};

/*
 * Get all trips from a timetable.
 */
const getTripsFromTimetable = async (timetable, calendars, config) => {
  const tripQuery = {
    route_id: timetable.route_ids,
    service_id: timetable.service_ids
  };

  if (timetable.direction_id !== '' && timetable.direction_id !== null) {
    tripQuery.direction_id = timetable.direction_id;
  }

  const trips = await gtfs.getTrips(tripQuery);

  if (trips.length === 0) {
    config.logWarning(`No trips found for route_id=${timetable.route_ids.join('_')}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.service_ids)}, timetable_id=${timetable.timetable_id}`);
  }

  // Updated timetable.serviceIds with only the service IDs actually used in one or more trip
  timetable.service_ids = uniq(map(trips, 'service_id'));

  const formattedTrips = [];
  const parentStations = {};
  await Promise.all(trips.map(async trip => {
    const formattedTrip = formatters.formatTrip(trip, timetable, calendars, config);
    const stopTimes = await getStoptimesByTrip(formattedTrip);

    if (config.useParentStation) {
      // Lookup parent station and cache it
      await Promise.all(stopTimes.map(async stopTime => {
        if (parentStations[stopTime.stop_id] === undefined) {
          const stops = await gtfs.getStops({
            stop_id: stopTime.stop_id
          },
          [
            'parent_station',
            'stop_id'
          ]);

          if (stops.length === 0) {
            return;
          }

          parentStations[stopTime.stop_id] = stops[0].parent_station || stops[0].stop_id;
        }

        stopTime.stop_id = parentStations[stopTime.stop_id];
      }));
    }

    formattedTrip.stoptimes = stopTimes;

    if (timetable.show_trip_continuation) {
      await addTripContinuation(formattedTrip, timetable);

      if (formattedTrip.continues_as_route) {
        timetable.has_continues_as_route = true;
      }

      if (formattedTrip.continues_from_route) {
        timetable.has_continues_from_route = true;
      }
    }

    if (formattedTrip.stoptimes.length === 0) {
      config.logWarning(`No stoptimes found for trip_id=${formattedTrip.trip_id}, route_id=${timetable.route_ids.join('_')}, timetable_id=${timetable.timetable_id}`);
    }

    const frequencies = await getFrequenciesByTrip(formattedTrip, config);

    if (frequencies.length === 0) {
      formattedTrips.push(formattedTrip);
    } else {
      const frequencyTrips = generateTripsByFrequencies(formattedTrip, frequencies);
      formattedTrips.push(...frequencyTrips);
      timetable.frequencies = frequencies;
      timetable.frequencyExactTimes = some(frequencies, { exact_times: 1 });
    }
  }));

  const filteredTrips = filterTrips(formattedTrips, timetable);

  return sortTrips(filteredTrips, config);
};

/*
 * Discern if a day list should be shown for a specific timetable (if some
 * trips happen on different days).
 */
const getShowDayList = timetable => {
  return !every(timetable.orderedTrips, (trip, idx) => {
    if (idx === 0) {
      return true;
    }

    return trip.dayList === timetable.orderedTrips[idx - 1].dayList;
  });
};

/*
 * Format timetables for display.
 */
const formatTimetables = async (timetables, config) => {
  return Promise.all(timetables.map(async timetable => {
    const dayList = formatters.formatDays(timetable, config);
    const calendars = await getCalendarsFromTimetable(timetable);
    let serviceIds = map(calendars, 'service_id');

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
      service_ids: serviceIds,
      dayList,
      dayListLong: formatters.formatDaysLong(dayList, config)
    });

    timetable.orderedTrips = await getTripsFromTimetable(timetable, calendars, config);
    timetable.stops = await getStops(timetable, config);
    timetable.calendarDates = await getCalendarDates(timetable, config);
    timetable.showDayList = getShowDayList(timetable);
    timetable.timetable_label = formatters.formatTimetableLabel(timetable);

    if (config.showMap) {
      timetable.geojson = await geoJSONUtils.getTimetableGeoJSON(timetable, config);
    }

    return timetable;
  }));
};

/*
 * Merge timetables with same timetable_id
 */
const mergeTimetablesWithSameId = timetables => {
  if (timetables.length === 0) {
    return [];
  }

  const mergedTimetables = groupBy(timetables, 'timetable_id');

  return Object.values(mergedTimetables).map(timetableGroup => {
    const mergedTimetable = omit(timetableGroup[0], 'route_id');

    mergedTimetable.route_ids = timetableGroup.map(timetable => timetable.route_id);

    return mergedTimetable;
  });
};

/*
 * Get all timetable pages for an agency.
 */
exports.getTimetablePages = async config => {
  const timetables = mergeTimetablesWithSameId(await gtfs.getTimetables(
    {},
    [],
    [
      ['route_id', 'ASC'],
      ['timetable_sequence', 'ASC']
    ]
  ));

  // If no timetables, build each route and direction into a timetable
  if (timetables.length === 0) {
    return convertRoutesToTimetablePages(config);
  }

  const timetablePages = await gtfs.getTimetablePages({}, [], [['timetable_page_id', 'ASC']]);

  // Check if there are any timetable pages defined in timetable_pages.txt
  if (timetablePages.length === 0) {
    // If no timetablepages, use timetables
    return Promise.all(timetables.map(timetable => convertTimetableToTimetablePage(timetable, config)));
  }

  // Otherwise, use timetable pages defined in timetable_pages.txt
  return Promise.all(timetablePages.map(async timetablePage => {
    timetablePage.timetables = timetables.filter(timetable => timetable.timetable_page_id === timetablePage.timetable_page_id);

    // Add route for each Timetable
    await Promise.all(timetablePage.timetables.map(async timetable => {
      timetable.routes = await gtfs.getRoutes({ route_id: timetable.route_ids });
    }));

    return timetablePage;
  }));
};

/*
 * Get a timetable page by id
 */
const getTimetablePageById = async (timetablePageId, config) => {
  // Check if there are any timetable pages defined in timetable_pages.txt
  const timetablePages = await gtfs.getTimetablePages({
    timetable_page_id: timetablePageId
  });

  const timetables = mergeTimetablesWithSameId(await gtfs.getTimetables(
    {},
    [],
    [
      ['timetable_sequence', 'ASC']
    ]
  ));

  if (timetablePages.length > 1) {
    throw new Error(`Multiple timetable_pages found for timetable_page_id=${timetablePageId}`);
  }

  if (timetablePages.length === 1) {
    // Use timetablePage defined in timetable_pages.txt
    const timetablePage = timetablePages[0];
    timetablePage.timetables = timetables.filter(timetable => timetable.timetable_page_id === timetablePageId);

    // Add route for each Timetable
    await Promise.all(timetablePage.timetables.map(async timetable => {
      timetable.routes = await gtfs.getRoutes({ route_id: timetable.route_ids });
    }));

    return timetablePage;
  }

  if (timetables.length > 0) {
    // If no timetablePage, use timetable defined in timetables.txt
    const timetablePageTimetables = timetables.filter(timetable => timetable.timetable_id === timetablePageId);

    if (timetablePageTimetables.length === 0) {
      throw new Error(`No timetable found for timetable_page_id=${timetablePageId}`);
    }

    return convertTimetableToTimetablePage(timetablePageTimetables[0], config);
  }

  // If no timetables.txt in GTFS, build the route and direction into a timetable
  let calendarCode;
  let calendars;
  let calendarDates;
  let serviceId;
  let directionId = '';
  const parts = timetablePageId.split('|');
  if (parts.length > 1) {
    directionId = Number.parseInt(parts.pop(), 10);
    calendarCode = parts.pop();
  }

  const routeId = parts.join('|');

  const routes = await gtfs.getRoutes({
    route_id: routeId
  });

  const directions = await gtfs.getTrips({
    route_id: routeId,
    direction_id: directionId
  }, [
    'trip_headsign',
    'direction_id'
  ]);

  if (directions.length === 0) {
    throw new Error(`No trips found for timetable_page_id=${timetablePageId} route_id=${routeId} direction_id=${directionId}`);
  }

  if (calendarCode.match(/^[01]*$/)) {
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

  if (!timetablePage.consolidatedTimetables || timetablePage.consolidatedTimetables.length === 0) {
    throw new Error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`);
  }

  timetablePage.dayList = formatters.formatDays(getDaysFromCalendars(timetablePage.timetables), config);
  timetablePage.dayLists = uniq(timetablePage.timetables.map(timetable => timetable.dayList));
  timetablePage.route_ids = uniq(flatMap(timetablePage.timetables, 'route_ids'));

  const timetableRoutes = await gtfs.getRoutes({
    route_id: timetablePage.route_ids
  }, [
    'route_color',
    'route_text_color'
  ]);

  timetablePage.routeColors = timetableRoutes.map(route => route.route_color);
  timetablePage.routeTextColors = timetableRoutes.map(route => route.route_text_color);

  // Set default filename
  if (!timetablePage.filename) {
    timetablePage.filename = `${timetablePage.timetable_page_id}.html`;
  }

  // Get direction_name for each timetable
  await Promise.all(timetablePage.timetables.map(async timetable => {
    if (timetable.direction_name === null || timetable.direction_name === '') {
      timetable.direction_name = await getDirectionHeadsignFromTimetable(timetable);
    }

    if (!timetable.routes) {
      timetable.routes = await gtfs.getRoutes({ route_id: timetable.route_ids });
    }
  }));

  timetablePage.directionNames = uniq(map(timetablePage.timetables, 'direction_name'));

  return timetablePage;
};

/*
 * Generate stats about timetable
 */
const generateStats = timetablePage => {
  return timetablePage.timetables.reduce((memo, timetable) => {
    memo.stops += timetable.stops.length;
    memo.trips += timetable.orderedTrips.length;
    for (const serviceId of timetable.service_ids) {
      memo.service_ids[serviceId] = true;
    }

    for (const routeId of timetable.route_ids) {
      memo.route_ids[routeId] = true;
    }

    memo.routes = size(memo.route_ids);
    memo.calendars = size(memo.service_ids);
    return memo;
  }, {
    stops: 0,
    trips: 0,
    route_ids: {},
    service_ids: {}
  });
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
  return { html, stats };
};

/*
 * Generate the HTML for the agency overview page.
 */
exports.generateOverviewHTML = async (timetablePages, config) => {
  const agencies = await gtfs.getAgencies();
  if (agencies.length === 0) {
    throw new Error('No agencies found');
  }

  const agency = first(agencies);

  if (config.showMap) {
    agency.geojson = await geoJSONUtils.getAgencyGeoJSON(config);
  }

  const templateVars = {
    agency,
    config,
    timetablePages: sortBy(timetablePages, 'timetable_page_label')
  };
  return fileUtils.renderFile('overview', templateVars, config);
};
