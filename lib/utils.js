const _ = require('lodash');
const gtfs = require('gtfs');
const moment = require('moment');

const fileUtils = require('./file-utils');
const formatters = require('./formatters');
const geoJSONUtils = require('./geojson-utils');
const timeUtils = require('./time-utils');

const { version } = require('../package.json');

/*
 * Get all of the route colors for a timetable page.
 */
const getTimetablePageColors = async timetablePage => {
  const routes = await gtfs.getRoutes({
    agency_key: timetablePage.agency_key,
    route_id: {$in: timetablePage.routeIds}
  });
  return _.compact(_.uniq(_.map(routes, 'route_color')));
};

/*
 * Determine if a stoptime is a timepoint.
 */
const isTimepoint = stoptime => {
  if (stoptime.timepoint === undefined) {
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
    filteredTripStoptimes = trips.map(trip => _.filter(trip.stoptimes, isTimepoint));
  } else {
    filteredTripStoptimes = trips.map(trip => trip.stoptimes);
  }

  return _.maxBy(filteredTripStoptimes, stoptimes => _.size(stoptimes));
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

  const commonStoptime = _.find(longestTripStoptimes, (stoptime, idx) => {
    // If longest trip is a loop (first and last stops the same), then skip first stoptime
    if (idx === 0 && stoptime.stop_id === _.last(longestTripStoptimes).stop_id) {
      return false;
    }

    // If stoptime isn't a timepoint, skip it
    if (stoptime.arrival_time === '') {
      return false;
    }

    return _.every(trips, trip => {
      return _.find(trip.stoptimes, {stop_id: stoptime.stop_id});
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
      const stoptimes = _.map(trip.stoptimes, 'departure_time');

      let selectedStoptime;
      if (commonStopId) {
        selectedStoptime = _.find(trip.stoptimes, {stop_id: commonStopId});
      } else {
        selectedStoptime = trip.stoptimes[0];
      }

      // Find all other trips where the common stop has the same departure time
      const similarTrips = _.filter(memo, trip => {
        const stoptime = _.find(trip.stoptimes, {stop_id: selectedStoptime.stop_id});
        if (!stoptime) {
          return false;
        }

        return stoptime.departure_time === selectedStoptime.departure_time;
      });

      // Only add trip if no existing trip with the same set of timepoints has already been added
      const tripIsUnique = _.every(similarTrips, similarTrip => {
        const similarTripStoptimes = _.map(similarTrip.stoptimes, 'departure_time');
        return !_.isEqual(stoptimes, similarTripStoptimes);
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
 * Sort trips chronologically, using a common stop id if available, otherwise
 * use the first stoptime.
 * Edited by Pawajoro - more sorting options
 */
const sortTrips = (trips, config) => {
  let sortedTrips = trips;
  let commonStopId;

  if (_.includes(['beginning', 'end'], config.sortingAlgorithm)) {
    let referenceStoptimes;
    let sortingDirection;
    let sortingOrder;

    if (config.sortingAlgorithm === 'end') {
      referenceStoptimes = _.orderBy(getLongestTripStoptimes(trips, config), ['stop_sequence'], 'desc');
      sortingDirection = -1;
      sortingOrder = 'desc';
    } else {
      referenceStoptimes = _.sortBy(getLongestTripStoptimes(trips, config), ['stop_sequence']);
      sortingDirection = 1;
      sortingOrder = 'asc';
    }

    for (const stop of referenceStoptimes) {
      let previousSortingStoptime;
      for (const trip of sortedTrips) {
        if (trip.stoptimes.length === 0) {
          trip.sortingStoptime = undefined;
        }

        const selectedStoptime = _.find(trip.stoptimes, {stop_id: stop.stop_id});

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

      sortedTrips = _.orderBy(sortedTrips, ['sortingStoptime'], sortingOrder);
    }

    if (sortingOrder === 'desc') {
      sortedTrips = sortedTrips.reverse();
    }
  } else {
    if (config.sortingAlgorithm === 'common') {
      commonStopId = findCommonStopId(trips, config);
    }

    sortedTrips = _.sortBy(trips, trip => {
      if (trip.stoptimes.length === 0) {
        return;
      }

      let selectedStoptime;
      if (commonStopId) {
        selectedStoptime = _.find(trip.stoptimes, {stop_id: commonStopId});
      } else if (config.sortingAlgorithm !== 'last') {
        selectedStoptime = _.first(trip.stoptimes);
      }

      if (config.sortingAlgorithm === 'last') {
        selectedStoptime = _.last(trip.stoptimes);
      }

      return formatters.timeToSeconds(selectedStoptime.departure_time);
    });
  }

  return deduplicateTrips(sortedTrips, commonStopId);
};

/*
 * Find all timetables for a specified timetable page id and sort by
 * timetable_sequence.
 */
const filterAndSortTimetables = async (timetables, timetablePageId) => {
  const selectedTimetables = _.filter(timetables, {timetable_page_id: timetablePageId});

  return _.sortBy(selectedTimetables, 'timetable_sequence');
};

/*
 * Get all calendar dates for a specific timetable.
 */
const getCalendarDates = async (timetable, config) => {
  const calendarDates = await gtfs.getCalendarDates({
    agency_key: timetable.agency_key,
    service_id: {
      $in: timetable.serviceIds
    }
  })
    .sort('date')
    .lean();

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
 * Get the route for a specific timetable.
 */
const getRouteFromTimetable = async (timetable, config) => {
  const routes = await gtfs.getRoutes({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id
  });

  if (routes.length === 0) {
    config.logWarning(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
    return null;
  }

  return _.first(routes);
};

/*
 * Get the trip_headsign for a specific timetable.
 */
const getDirectionHeadsignFromTimetable = async timetable => {
  const directions = await gtfs.getDirectionsByRoute({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id,
    direction_id: timetable.direction_id
  });

  if (directions.length === 0) {
    return '';
  }

  return _.first(directions).trip_headsign;
};

/*
 * Create a timetable page from a single timetable. Used if no
 * `timetable_pages.txt` is present.
 */
const convertTimetableToTimetablePage = async (timetable, config) => {
  if (!timetable.route) {
    timetable.route = await getRouteFromTimetable(timetable, config);
  }

  const filename = await fileUtils.generateFileName(timetable, config);

  return {
    agency_key: timetable.agency_key,
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
const convertRouteToTimetablePage = (route, direction, calendars, calendarDates, config) => {
  const timetable = {
    agency_key: route.agency_key,
    route_id: route.route_id,
    direction_id: direction ? direction.direction_id : undefined,
    direction_name: direction ? direction.trip_headsign : undefined,
    route,
    include_exceptions: (calendarDates && calendarDates.length) ? 1 : 0,
    service_id: (calendarDates && calendarDates.length) ? calendarDates[0].service_id : null
  };
  
  // Get days of week from calendars and assign to timetable
  Object.assign(timetable, getDaysFromCalendars(calendars || []));

  timetable.timetable_id = formatters.formatTimetableId(timetable);

  return convertTimetableToTimetablePage(timetable, config);
};

/*
 * Create timetable pages for all routes in an agency. Used if no
 * `timetables.txt` is present.
 */
const convertRoutesToTimetablePages = async (agencyKey, config) => {
  const routes = await gtfs.getRoutes({agency_key: agencyKey});
  const timetablePages = await Promise.all(routes.map(async route => {
    const directions = await gtfs.getDirectionsByRoute({
      agency_key: agencyKey,
      route_id: route.route_id
    });

    const calendars = await gtfs.getCalendars({
      agency_key: agencyKey,
      route_id: route.route_id
    }, undefined, { lean: true });

    // Find all calendar dates with service_ids not present in calendar.txt
    const calendarDates = await gtfs.getCalendarDates({
      agency_key: agencyKey,
      exception_type: 1,
      service_id: { $nin: _.map(calendars, 'service_id') }
    });

    const directionGroups = _.groupBy(directions, direction => direction.direction_id);
    const dayGroups = _.groupBy(calendars, timeUtils.calendarToCalendarCode);
    const calendarDateGroups = _.groupBy(calendarDates, 'service_id');

    return Promise.all(_.map(directionGroups, directionGroup => {
      const direction = _.first(directionGroup);
      return Promise.all([
        Promise.all(_.map(dayGroups, calendars => {
          return convertRouteToTimetablePage(route, direction, calendars, null, config);
        })),
        Promise.all(_.map(calendarDateGroups, calendarDates => {
          return convertRouteToTimetablePage(route, direction, null, calendarDates, config);
        }))
      ])
    }));
  }));

  return _.compact(_.flattenDeep(timetablePages));
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
      const newTrip = _.omit(_.cloneDeep(resetTrip), ['_id']);
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
const getStopIds = async (timetable, config) => {
  const timetableStopOrders = await gtfs.getTimetableStopOrders({
    agency_key: timetable.agency_key,
    timetable_id: timetable.timetable_id
  });

  if (timetableStopOrders && timetableStopOrders.length !== 0) {
    // Use the stop_sequence from `timetable_stop_order.txt`
    return _.map(timetableStopOrders, 'stop_id');
  }

  let stopIds = [];
  const longestTripStoptimes = getLongestTripStoptimes(timetable.orderedTrips, config);

  for (const stoptime of longestTripStoptimes) {
    stopIds[stoptime.stop_sequence] = stoptime.stop_id;
  }

  // Remove any missing values from missing stop_sequence
  stopIds = _.compact(stopIds);

  /*
    * Check if any stoptimes have different arrival and departure times and
    * if they do, duplicate the stop id unless it is the first or last stop.
    * Edited by Pawajoro - minimal difference specified in config, or NULL
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

  const stopIds = await getStopIds(timetable, config);

  // Convert stops to array of objects
  const stops = await Promise.all(stopIds.map(async (stopId, idx) => {
    const stopQuery = {
      agency_key: timetable.agency_key,
      stop_id: stopId
    };

    const stops = await gtfs.getStops(stopQuery, undefined, {limit: 1, lean: true});

    if (stops.length === 0) {
      config.logWarning(`No stop found for agency_key=${timetable.agency_key}, stop_id=${stopId}`);
      return null;
    }

    const stop = _.first(stops);
    stop.trips = [];

    if (idx < (stopIds.length - 1) && stopId === stopIds[idx + 1]) {
      stop.type = 'arrival';
    } else if (idx > 0 && stopId === stopIds[idx - 1]) {
      stop.type = 'departure';
    }

    // If `showStopCity` is true, look up stop attributes.
    if (timetable.showStopCity) {
      const stopAttribute = await gtfs.getStopAttributes(stopQuery);
      if (stopAttribute.length > 0) {
        stop.stop_city = _.first(stopAttribute).stop_city;
      }
    }

    return stop;
  }));

  const formattedStops = formatters.formatStops(_.compact(stops), timetable, config);
  return formattedStops;
};

/*
 * Get all calendars from a specific timetable.
 */
const getCalendarsFromTimetable = async timetable => {
  const calendarQuery = {
    agency_key: timetable.agency_key
  };

  if (timetable.end_date) {
    calendarQuery.start_date = {$lt: timetable.end_date};
  }

  if (timetable.start_date) {
    calendarQuery.end_date = {$gte: timetable.start_date};
  }

  const days = getDaysFromCalendars([timetable]);
  // Create an $or query array of days based on calendars
  const dayQuery = _.reduce(days, (memo, value, key) => {
    if (value === 1) {
      const queryItem = {};
      queryItem[key] = value;
      memo.push(queryItem);
    }

    return memo;
  }, []);

  if (dayQuery.length > 0) {
    calendarQuery.$or = dayQuery;
  }

  return gtfs.getCalendars(calendarQuery);
};

/*
 * Get all calendar date service ids for an agency between two dates.
 */
const getCalendarDatesServiceIds = async (agencyKey, startDate, endDate) => {
  const calendarDateQuery = {
    agency_key: agencyKey,
    exception_type: 1
  };

  if (endDate) {
    if (!calendarDateQuery.date) {
      calendarDateQuery.date = {};
    }

    calendarDateQuery.date.$lt = endDate;
  }

  if (startDate) {
    if (!calendarDateQuery.date) {
      calendarDateQuery.date = {};
    }

    calendarDateQuery.date.$gte = startDate;
  }

  const calendarDates = await gtfs.getCalendarDates(calendarDateQuery);

  return _.map(calendarDates, 'service_id');
};

/*
 * Get formatted freuqencies for a specific trip.
 */
const getFrequenciesByTrip = async trip => {
  const frequencies = await gtfs.getFrequencies({
    agency_key: trip.agency_key,
    trip_id: trip.trip_id
  });
  return frequencies.map(formatters.formatFrequency);
};

/*
 * Get all stoptimes for a trip.
 */
const getStoptimesByTrip = async trip => {
  return gtfs.getStoptimes({
    agency_key: trip.agency_key,
    trip_id: trip.trip_id
  });
};

/*
 * For a specific stop_id, returms an array all stop_ids within a parent station
 * and the stop_id of parent station itself. If no parent station, it returns the
 * stop_id.
 */
const getAllStationStopIds = async (stopId, agencyKey) => {
  const stop = await gtfs.getStops({
    agency_key: agencyKey,
    stop_id: stopId
  });

  if (stop[0].parent_station === '' || stop[0].parent_station === undefined) {
    return [stopId];
  }

  const stopsInParentStation = await gtfs.getStops({
    parent_station: stop[0].parent_station
  }, {stop_id: 1});

  return [stop[0].parent_station, ..._.map(stopsInParentStation, 'stop_id')];
};

/*
 * Get trips with the same blockId
 */
const getTripsWithSameBlock = async (trip, timetable) => {
  const tripQuery = {
    agency_key: trip.agency_key,
    block_id: trip.block_id,
    service_id: {
      $in: timetable.serviceIds
    }
  };

  const trips = await gtfs.getTrips(tripQuery, {trip_id: 1, route_id: 1, _id: 0});

  await Promise.all(trips.map(async blockTrip => {
    const firstStoptime = await gtfs.getStoptimes({
      agency_key: timetable.agency_key,
      trip_id: blockTrip.trip_id
    }, undefined, {lean: true, sort: {stop_sequence: 1}, limit: 1});

    if (firstStoptime.length === 0) {
      throw new Error(`No stoptimes found found for trip_id=${blockTrip.trip_id}, agency_key=${blockTrip.agency_key}`);
    }

    blockTrip.firstStoptime = firstStoptime[0];

    const lastStoptime = await gtfs.getStoptimes({
      agency_key: timetable.agency_key,
      trip_id: blockTrip.trip_id
    }, undefined, {lean: true, sort: {stop_sequence: -1}, limit: 1});

    if (lastStoptime.length === 0) {
      throw new Error(`No stoptimes found found for trip_id=${blockTrip.trip_id}, agency_key=${blockTrip.agency_key}`);
    }

    blockTrip.lastStoptime = lastStoptime[0];
  }));

  return _.sortBy(trips, trip => trip.firstStoptime.departure_timestamp);
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

  const firstStoptime = _.first(trip.stoptimes);
  const firstStopIds = await getAllStationStopIds(firstStoptime.stop_id, trip.agency_key);
  const lastStoptime = _.last(trip.stoptimes);
  const lastStopIds = await getAllStationStopIds(lastStoptime.stop_id, trip.agency_key);
  const blockTrips = await getTripsWithSameBlock(trip, timetable);

  // "Continues From" trips must be the previous trip chronologically.
  const previousTrip = _.findLast(blockTrips, blockTrip => {
    return blockTrip.lastStoptime.arrival_timestamp <= firstStoptime.departure_timestamp;
  });

  // "Continues From" trips must be a different route_id.
  if (previousTrip && previousTrip.route_id !== trip.route_id) {
    // "Comtinues From" trips must not be more than 60 minutes before.
    if (previousTrip.lastStoptime.arrival_timestamp >= firstStoptime.departure_timestamp - maxContinuesAsWaitingTimeSeconds) {
      // "Continues From" trips must have their last stop_id be the same as the next trip's first stop_id.
      if (firstStopIds.includes(previousTrip.lastStoptime.stop_id)) {
        const routes = await gtfs.getRoutes({
          agency_key: timetable.agency_key,
          route_id: previousTrip.route_id
        });

        previousTrip.route = routes[0];

        trip.continues_from_route = previousTrip;
      }
    }
  }

  // "Continues As" trips must be the next trip chronologically.
  const nextTrip = _.find(blockTrips, blockTrip => {
    return blockTrip.firstStoptime.departure_timestamp >= lastStoptime.arrival_timestamp;
  });

  // "Continues As" trips must be a different route_id.
  if (nextTrip && nextTrip.route_id !== trip.route_id) {
    // "Comtinues As" trips must not be more than 60 minutes later.
    if (nextTrip.firstStoptime.departure_timestamp <= lastStoptime.arrival_timestamp + maxContinuesAsWaitingTimeSeconds) {
      // "Continues As" trips must have their first stop_id be the same as the previous trip's last stop_id.
      if (lastStopIds.includes(nextTrip.firstStoptime.stop_id)) {
        const routes = await gtfs.getRoutes({
          agency_key: timetable.agency_key,
          route_id: nextTrip.route_id
        });

        nextTrip.route = routes[0];
        trip.continues_as_route = nextTrip;
      }
    }
  }
};

/*
 * Get all trips from a timetable.
 */
const getTripsFromTimetable = async (timetable, calendars, config) => {
  const tripQuery = {
    agency_key: timetable.agency_key,
    route_id: timetable.route_id,
    service_id: {
      $in: timetable.serviceIds
    }
  };

  if (timetable.direction_id !== '' && timetable.direction_id !== null) {
    tripQuery.direction_id = timetable.direction_id;
  }

  const trips = await gtfs.getTrips(tripQuery);

  if (trips.length === 0) {
    config.logWarning(`No trips found for route_id=${timetable.route_id}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.serviceIds)}, timetable_id=${timetable.timetable_id}`);
  }

  // Updated timetable.serviceIds with only the service IDs actually used in one or more trip
  timetable.serviceIds = _.uniq(_.map(trips, 'service_id'));

  const formattedTrips = [];
  await Promise.all(trips.map(async trip => {
    const formattedTrip = formatters.formatTrip(trip, timetable, calendars, config);
    formattedTrip.stoptimes = await getStoptimesByTrip(formattedTrip);

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
      config.logWarning(`No stoptimes found for agency_key=${timetable.agency_key}, trip_id=${formattedTrip.trip_id}, route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
    }

    const frequencies = await getFrequenciesByTrip(formattedTrip, config);
    if (frequencies.length === 0) {
      formattedTrips.push(formattedTrip);
    } else {
      const frequencyTrips = generateTripsByFrequencies(formattedTrip, frequencies);
      formattedTrips.push(...frequencyTrips);
      timetable.frequencies = frequencies;
      timetable.frequencyExactTimes = _.some(frequencies, {exact_times: 1});
    }
  }));

  return sortTrips(formattedTrips, config);
};

/*
 * Discern if a day list should be shown for a specific timetable (if some
 * trips happen on different days).
 */
const getShowDayList = timetable => {
  return !_.every(timetable.orderedTrips, (trip, idx) => {
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
    let serviceIds = _.map(calendars, 'service_id');

    if (timetable.include_exceptions === 1) {
      const calendarDatesServiceIds = await getCalendarDatesServiceIds(timetable.agency_key, timetable.start_date, timetable.end_date);
      serviceIds = _.uniq([...serviceIds, ...calendarDatesServiceIds]);
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
      serviceIds,
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
 * Get all timetable pages for an agency.
 */
exports.getTimetablePages = async (agencyKey, config) => {
  const timetables = await gtfs.getTimetables({agency_key: agencyKey});

  // If no timetables, build each route and direction into a timetable
  if (!timetables || timetables.length === 0) {
    return convertRoutesToTimetablePages(agencyKey, config);
  }

  const timetablePages = await gtfs.getTimetablePages({agency_key: agencyKey});

  // Check if there are any timetable pages defined in timetable_pages.txt
  if (!timetablePages || timetablePages.length === 0) {
    // If no timetablepages, use timetables
    return Promise.all(timetables.map(timetable => convertTimetableToTimetablePage(timetable, config)));
  }

  // Otherwise, use timetable pages defined in timetable_pages.txt
  return Promise.all(timetablePages.map(async timetablePage => {
    timetablePage.timetables = await filterAndSortTimetables(timetables, timetablePage.timetable_page_id);

    // Add route for each Timetable
    await Promise.all(timetablePage.timetables.map(async timetable => {
      timetable.route = await getRouteFromTimetable(timetable, config);
    }));

    return timetablePage;
  }));
};

/*
 * Format a timetable page for display.
 */
exports.formatTimetablePage = async (timetablePage, config) => {
  timetablePage.dayList = formatters.formatDays(getDaysFromCalendars(timetablePage.timetables), config);
  timetablePage.dayLists = _.uniq(timetablePage.timetables.map(timetable => timetable.dayList));
  timetablePage.routeIds = _.uniq(_.map(timetablePage.timetables, 'route_id'));
  timetablePage.routeColors = await getTimetablePageColors(timetablePage);

  // Set default filename
  if (!timetablePage.filename) {
    timetablePage.filename = `${timetablePage.timetable_page_id}.html`;
  }

  // Get direction_name for each timetable
  await Promise.all(timetablePage.timetables.map(async timetable => {
    if (timetable.direction_name === undefined || timetable.direction_name === '') {
      timetable.direction_name = await getDirectionHeadsignFromTimetable(timetable);
    }

    if (!timetable.route) {
      timetable.route = await getRouteFromTimetable(timetable, config);
    }
  }));

  timetablePage.directionNames = _.uniq(_.map(timetablePage.timetables, 'direction_name'));

  return timetablePage;
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
exports.getFormattedTimetablePage = async (agencyKey, timetablePageId, config) => {
  const timetables = await gtfs.getTimetables({agency_key: agencyKey});

  let timetablePage;

  // Check if there are any timetable pages defined in timetable_pages.txt
  const timetablePages = await gtfs.getTimetablePages({
    agency_key: agencyKey,
    timetable_page_id: timetablePageId
  });

  if (timetablePages.length > 1) {
    throw new Error(`Multiple timetable_pages found for timetable_page_id=${timetablePageId}`);
  }

  if (!timetables || timetables.length === 0) {
    // If no timetables, build the route and direction into a timetable
    let calendarCode;
    let calendars;
    let calendarDates;
    let serviceId;
    let directionId = '';
    const parts = timetablePageId.split('|');
    if (parts.length > 1) {
      directionId = parseInt(parts.pop(), 10);
      calendarCode = parts.pop();
    }

    const routeId = parts.join('|');
    const routeQuery = {
      agency_key: agencyKey,
      route_id: routeId
    };

    const route = await getRouteFromTimetable(routeQuery, config);
    const directions = await gtfs.getDirectionsByRoute(routeQuery);

    if (calendarCode.match(/^[01]*$/)) {
      calendars = await gtfs.getCalendars({
        ...routeQuery,
        ...timeUtils.calendarCodeToCalendar(calendarCode)
      });
    } else {
      serviceId = calendarCode;
      calendarDates = await gtfs.getCalendarDates({
        agency_key: agencyKey,
        exception_type: 1,
        service_id: serviceId
      });
    }
  
    const direction = _.find(directions, direction => direction.direction_id === directionId);
    timetablePage = await convertRouteToTimetablePage(route, direction, calendars, calendarDates, config);
  } else if (timetablePages.length === 0) {
    // If no timetablepage, use timetable
    const timetable = _.find(timetables, {timetable_id: timetablePageId});

    if (!timetable) {
      throw new Error(`No timetable found for timetable_page_id=${timetablePageId}`);
    }

    timetablePage = await convertTimetableToTimetablePage(timetable, config);
  } else {
    // Otherwise, use timetablepage defined in timetable_pages.txt
    timetablePage = _.first(timetablePages);
    timetablePage.timetables = await filterAndSortTimetables(timetables, timetablePage.timetable_page_id);

    // Add route for each Timetable
    await Promise.all(timetablePage.timetables.map(async timetable => {
      timetable.route = await getRouteFromTimetable(timetable, config);
    }));
  }

  timetablePage.consolidatedTimetables = await formatTimetables(timetablePage.timetables, config);

  if (!timetablePage.consolidatedTimetables || timetablePage.consolidatedTimetables.length === 0) {
    throw new Error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`);
  }

  return exports.formatTimetablePage(timetablePage, config);
};

/*
 * Generate stats about timetable
 */
const generateStats = timetablePage => {
  return timetablePage.timetables.reduce((memo, timetable) => {
    memo.stops += timetable.stops.length;
    memo.trips += timetable.orderedTrips.length;
    for (const serviceId of timetable.serviceIds) {
      memo.serviceIds[serviceId] = true;
    }

    memo.routeIds[timetable.route_id] = true;
    memo.routes = _.size(memo.routeIds);
    memo.calendars = _.size(memo.serviceIds);
    return memo;
  }, {
    stops: 0,
    trips: 0,
    routeIds: {},
    serviceIds: {}
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
  return {html, stats};
};

/*
 * Generate the HTML for the agency overview page.
 */
exports.generateOverviewHTML = async (agencyKey, timetablePages, config) => {
  const agencies = await gtfs.getAgencies({agency_key: agencyKey});
  if (!agencies || agencies.length === 0) {
    throw new Error(`No agency found for agency_key=${agencyKey}`);
  }

  const agency = _.first(agencies);

  if (config.showMap) {
    agency.geojson = await geoJSONUtils.getAgencyGeoJSON(agencyKey, config);
  }

  const templateVars = {
    agencyKey,
    agency,
    config,
    timetablePages: _.sortBy(timetablePages, 'timetable_page_label')
  };
  return fileUtils.renderFile('overview', templateVars, config);
};
