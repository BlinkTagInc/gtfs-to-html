const _ = require('lodash');
const gtfs = require('gtfs');
const moment = require('moment');

const fileUtils = require('./file-utils');
const formatters = require('./formatters');
const geoJSONUtils = require('./geojson-utils');
const logUtils = require('./log-utils');
const timeUtils = require('./time-utils');

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
 * Find the longest trip (most stops) in a group of trips.
 */
const getLongestTrip = trips => _.maxBy(trips, trip => _.size(trip.stoptimes));

/*
 * Find the first stop_id that all trips have in common, otherwise use the first
 * stoptime.
 */
const findCommonStopId = trips => {
  const longestTrip = getLongestTrip(trips);

  if (!longestTrip) {
    return null;
  }

  const commonStoptime = _.find(longestTrip.stoptimes, (stoptime, idx) => {
    // If longest trip is a loop (first and last stops the same), then skip first stoptime
    if (idx === 0 && stoptime.stop_id === _.last(longestTrip.stoptimes).stop_id) {
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
 */
const sortTrips = trips => {
  const commonStopId = findCommonStopId(trips);

  const sortedTrips = _.sortBy(trips, trip => {
    if (trip.stoptimes.length === 0) {
      return;
    }

    let selectedStoptime;
    if (commonStopId) {
      selectedStoptime = _.find(trip.stoptimes, {stop_id: commonStopId});
    } else {
      selectedStoptime = _.first(trip.stoptimes);
    }
    return formatters.timeToSeconds(selectedStoptime.departure_time);
  });

  return deduplicateTrips(sortedTrips, commonStopId);
};

/*
 * Find all timetables for a specified timetable page id and sort by
 * timetable_sequence.
 */
const filterAndSortTimetables = async (timetables, timetablePageId) => {
  const selectedTimetables = _.filter(timetables, {timetable_page_id: timetablePageId});
  if (!selectedTimetables || selectedTimetables.length === 0) {
    logUtils.warn(`No timetables found for timetable_page_id=${timetablePageId}`);
  }

  return _.sortBy(selectedTimetables, 'timetable_sequence');
};

/*
 * Get all calendar dates for a specific timetable.
 */
const getCalendarDates = async timetable => {
  const calendarDates = await gtfs.getCalendarDates({
    agency_key: timetable.agency_key,
    service_id: {
      $in: timetable.serviceIds
    }
  }, '-_id', {
    lean: true,
    sort: {date: 1}
  });

  const start = timeUtils.fromGTFSDate(timetable.start_date);
  const end = timeUtils.fromGTFSDate(timetable.end_date);

  const filteredCalendarDates = calendarDates.reduce((memo, calendarDate) => {
    if (moment(calendarDate.date, 'YYYYMMDD').isBetween(start, end)) {
      if (calendarDate.exception_type === 1) {
        memo.includedDates.push(formatters.formatDate(calendarDate));
      } else if (calendarDate.exception_type === 2) {
        memo.excludedDates.push(formatters.formatDate(calendarDate));
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
 * Group calendars by their days.
 */
const groupCalendarsByDays = calendars => {
  return _.groupBy(calendars, timeUtils.calendarToCalendarCode);
};

/*
 * Get the route for a specific timetable.
 */
const getRouteFromTimetable = async timetable => {
  const routes = await gtfs.getRoutes({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id
  });

  if (routes.length === 0) {
    logUtils.warn(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
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
const convertTimetableToTimetablePage = async timetable => {
  if (!timetable.route) {
    timetable.route = await getRouteFromTimetable(timetable);
  }

  const filename = await fileUtils.generateFileName(timetable);

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
const convertRouteToTimetablePage = async (route, direction, calendars) => {
  const timetable = {
    agency_key: route.agency_key,
    route_id: route.route_id,
    direction_id: direction.direction_id,
    direction_name: direction.trip_headsign,
    route
  };

  // Get days of week from calendars and assign to timetable
  Object.assign(timetable, getDaysFromCalendars(calendars));

  timetable.timetable_id = formatters.formatTimetableId(timetable);

  return convertTimetableToTimetablePage(timetable);
};

/*
 * Create timetable pages for all routes in an agency. Used if no
 * `timetables.txt` is present.
 */
const convertRoutesToTimetablePages = async agencyKey => {
  const routes = await gtfs.getRoutes({agency_key: agencyKey});
  const timetablePages = await Promise.all(routes.map(async route => {
    const directions = await gtfs.getDirectionsByRoute({
      agency_key: agencyKey,
      route_id: route.route_id
    });
    const calendars = await gtfs.getCalendars({
      agency_key: agencyKey,
      route_id: route.route_id
    });
    const directionGroups = _.groupBy(directions, direction => direction.direction_id);
    const dayGroups = groupCalendarsByDays(calendars);

    return Promise.all(_.map(directionGroups, directionGroup => {
      const direction = _.first(directionGroup);
      return Promise.all(_.map(dayGroups, calendars => {
        return convertRouteToTimetablePage(route, direction, calendars);
      }));
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
const getStopIds = async timetable => {
  const timetableStopOrders = await gtfs.getTimetableStopOrders({
    agency_key: timetable.agency_key,
    timetable_id: timetable.timetable_id
  });

  if (timetableStopOrders && timetableStopOrders.length !== 0) {
    // Use the stop_sequence from `timetable_stop_order.txt`
    return _.map(timetableStopOrders, 'stop_id');
  }

  const stopIds = [];
  const longestTrip = getLongestTrip(timetable.orderedTrips);

  if (longestTrip) {
    for (const stoptime of longestTrip.stoptimes) {
      stopIds[stoptime.stop_sequence] = stoptime.stop_id;
    }
  }

  return _.compact(stopIds);
};

/*
 * Get an array of stops for a specific timetable.
 */
const getStops = async timetable => {
  const stopIds = await getStopIds(timetable);

  // Convert stops to array of objects
  const stops = await Promise.all(stopIds.map(async (stopId, idx) => {
    const stops = await gtfs.getStops({
      agency_key: timetable.agency_key,
      stop_id: stopId
    }, {_id: 0, stop_id: 1, stop_name: 1, stop_code: 1, stop_lat: 1, stop_lon: 1}, {limit: 1, lean: true});

    if (stops.length === 0) {
      logUtils.warn(`No stop found for agency_key=${timetable.agency_key}, stop_id=${stopId}`);
    }

    const stop = _.first(stops);

    stop.trips = [];

    if (idx < (stopIds.length - 1) && stopId === stopIds[idx + 1]) {
      stop.type = 'arrival';
    } else if (idx > 0 && stopId === stopIds[idx - 1]) {
      stop.type = 'departure';
    }

    return stop;
  }));

  const formattedStops = formatters.formatStops(stops, timetable);

  // If `showStopCity` is true, look up stop attributes.
  if (timetable.showStopCity) {
    await Promise.all(formattedStops.map(async stop => {
      const stopAttribute = await gtfs.getStopAttributes({
        agency_key: timetable.agency_key,
        stop_id: stop.stop_id
      });
      if (stopAttribute.length > 0) {
        stop.stop_city = _.first(stopAttribute).stop_city;
      }
    }));
  }

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
const getStoptimesByTrip = async (trip, config) => {
  const stoptimes = await gtfs.getStoptimes({
    agency_key: trip.agency_key,
    trip_id: trip.trip_id
  });

  // Remove stoptimes that are duplicates
  const deduplicatedStoptimes = _.filter(stoptimes, (stoptime, idx) => {
    if (idx === 0 || stoptime.arrival_time === '') {
      return true;
    }
    // Remove duplicate entries in stop_times.txt
    if (stoptime.stop_sequence === stoptimes[idx - 1].stop_sequence) {
      return false;
    }
    if (stoptime.arrival_time !== stoptimes[idx - 1].departure_time) {
      return true;
    }
    return false;
  });

  if (config.showOnlyTimepoint === true) {
    return _.filter(deduplicatedStoptimes, stoptime => {
      if (stoptime.timepoint === undefined) {
        return stoptime.arrival_time !== '' && stoptime.departure_time !== '';
      }

      return stoptime.timepoint === 1;
    });
  }

  return deduplicatedStoptimes;
};

/*
 * Get all trips from a timetable.
 */
const getTripsFromTimetable = async (timetable, calendars, config) => {
  const tripQuery = {
    agency_key: timetable.agency_key,
    route_id: timetable.route_id
  };

  if (timetable.serviceIds.length > 0) {
    tripQuery.service_id = {
      $in: timetable.serviceIds
    };
  }

  if (timetable.direction_id !== '' && timetable.direction_id !== null) {
    tripQuery.direction_id = timetable.direction_id;
  }

  const trips = await gtfs.getTrips(tripQuery);

  if (trips.length === 0) {
    logUtils.warn(`No trips found for route_id=${timetable.route_id}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.serviceIds)}, timetable_id=${timetable.timetable_id}`);
  }

  // Updated timetable.serviceIds with only the service IDs actually used in one or more trip
  timetable.serviceIds = _.uniq(_.map(trips, 'service_id'));

  const formattedTrips = [];
  await Promise.all(trips.map(async trip => {
    const formattedTrip = formatters.formatTrip(trip, timetable, calendars);
    formattedTrip.stoptimes = await getStoptimesByTrip(formattedTrip, config);

    if (formattedTrip.stoptimes.length === 0) {
      if (config.showOnlyTimepoint === true) {
        logUtils.warn(`No stoptimes which are timepoints found for agency_key=${timetable.agency_key}, trip_id=${formattedTrip.trip_id}, route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
      } else {
        logUtils.warn(`No stoptimes found for agency_key=${timetable.agency_key}, trip_id=${formattedTrip.trip_id}, route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
      }
    }

    const frequencies = await getFrequenciesByTrip(formattedTrip);
    if (frequencies.length === 0) {
      formattedTrips.push(formattedTrip);
    } else {
      const frequencyTrips = generateTripsByFrequencies(formattedTrip, frequencies);
      formattedTrips.push(...frequencyTrips);
      timetable.frequencies = frequencies;
      timetable.frequencyExactTimes = _.some(frequencies, {exact_times: 1});
    }
  }));

  return sortTrips(formattedTrips);
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
exports.formatTimetables = async (timetables, config) => {
  return Promise.all(timetables.map(async timetable => {
    const dayList = formatters.formatDays(timetable);
    const calendars = await getCalendarsFromTimetable(timetable);
    let serviceIds = _.map(calendars, 'service_id');

    if (timetable.include_exceptions === 1) {
      const calendarDatesServiceIds = await getCalendarDatesServiceIds(timetable.agency_key, timetable.start_date, timetable.end_date);
      serviceIds = _.uniq([...serviceIds, ...calendarDatesServiceIds]);
    }

    Object.assign(timetable, {
      noServiceSymbolUsed: false,
      requestStopSymbolUsed: false,
      interpolatedStopSymbolUsed: false,
      showStopCity: config.showStopCity,
      noServiceSymbol: config.noServiceSymbol,
      requestStopSymbol: config.requestStopSymbol,
      interpolatedStopSymbol: config.interpolatedStopSymbol,
      serviceIds,
      dayList,
      dayListLong: formatters.formatDaysLong(dayList)
    });

    timetable.orderedTrips = await getTripsFromTimetable(timetable, calendars, config);
    timetable.stops = await getStops(timetable);
    timetable.calendarDates = await getCalendarDates(timetable);
    timetable.showDayList = getShowDayList(timetable);
    timetable.timetable_label = formatters.formatTimetableLabel(timetable);

    if (config.showMap) {
      timetable.geojson = await geoJSONUtils.getTimetableGeoJSON(timetable, config);
    }

    return timetable;
  }));
};

/*
 * Format a timetable page for display.
 */
exports.formatTimetablePage = async timetablePage => {
  timetablePage.dayList = formatters.formatDays(getDaysFromCalendars(timetablePage.timetables));
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
      timetable.route = await getRouteFromTimetable(timetable);
    }
  }));

  timetablePage.directionNames = _.uniq(_.map(timetablePage.timetables, 'direction_name'));

  return timetablePage;
};

/*
 * Initialize configuration with defaults.
 */
exports.setDefaultConfig = config => {
  const defaults = {
    beautify: false,
    menuType: 'jump',
    noHead: false,
    noServiceSymbol: '-',
    requestStopSymbol: '***',
    interpolatedStopSymbol: '•',
    skipImport: false,
    showMap: false,
    showOnlyTimepoint: false,
    showRouteTitle: true,
    showStopCity: false,
    verbose: true,
    zipOutput: false
  };

  return Object.assign(defaults, config);
};

/*
 * Get a timetable page by id.
 */
exports.getTimetablePage = async (agencyKey, timetablePageId) => {
  const timetables = await gtfs.getTimetables({agency_key: agencyKey});

  // Check if there are any timetable pages defined in timetable_pages.txt
  const timetablePages = await gtfs.getTimetablePages({
    agency_key: agencyKey,
    timetable_page_id: timetablePageId
  });

  if (timetablePages.length > 1) {
    throw new Error(`Multiple timetable_pages found for timetable_page_id=${timetablePageId}`);
  }

  let timetablePage;

  if (!timetables || timetables.length === 0) {
    // If no timetables, build the route and direction into a timetable
    let calendarCode;
    let directionId = '';
    const parts = timetablePageId.split('_');
    if (parts.length > 1) {
      directionId = parseInt(parts.pop(), 10);
      calendarCode = parts.pop();
    }
    const routeId = parts.join('_');

    const route = await getRouteFromTimetable({
      agency_key: agencyKey,
      route_id: routeId
    });
    const directions = await gtfs.getDirectionsByRoute({
      agency_key: agencyKey,
      route_id: routeId
    });
    const calendarQuery = {
      agency_key: agencyKey,
      route_id: routeId
    };

    Object.assign(calendarQuery, timeUtils.calendarCodeToCalendar(calendarCode));
    const calendars = await gtfs.getCalendars(calendarQuery);

    const direction = _.find(directions, direction => direction.direction_id === directionId);
    timetablePage = await convertRouteToTimetablePage(route, direction, calendars);
  } else if (timetablePages.length === 0) {
    // If no timetablepage, use timetable
    const timetable = _.find(timetables, {timetable_id: timetablePageId});

    if (!timetable) {
      throw new Error(`No timetable found for timetable_page_id=${timetablePageId}`);
    }
    timetablePage = await convertTimetableToTimetablePage(timetable);
  } else {
    // Otherwise, use timetablepage defined in timetable_pages.txt
    timetablePage = _.first(timetablePages);
    timetablePage.timetables = await filterAndSortTimetables(timetables, timetablePage.timetable_page_id);

    // Add route for each Timetable
    await Promise.all(timetablePage.timetables.map(async timetable => {
      timetable.route = await getRouteFromTimetable(timetable);
    }));
  }

  return timetablePage;
};

/*
 * Get all timetable pages for an agency.
 */
exports.getTimetablePages = async agencyKey => {
  const timetables = await gtfs.getTimetables({agency_key: agencyKey});

  // Check if there are any timetable pages defined in timetable_pages.txt
  let timetablePages = await gtfs.getTimetablePages({agency_key: agencyKey});

  if (!timetables || timetables.length === 0) {
    // If no timetables, build each route and direction into a timetable
    timetablePages = await convertRoutesToTimetablePages(agencyKey);
  } else if (!timetablePages || timetablePages.length === 0) {
    // If no timetablepages, use timetables
    timetablePages = await Promise.all(timetables.map(convertTimetableToTimetablePage));
  } else {
    // Otherwise, use timetable pages defined in timetable_pages.txt
    timetablePages = await Promise.all(timetablePages.map(async timetablePage => {
      timetablePage.timetables = await filterAndSortTimetables(timetables, timetablePage.timetable_page_id);

      // Add route for each Timetable
      await Promise.all(timetablePage.timetables.map(async timetable => {
        timetable.route = await getRouteFromTimetable(timetable);
      }));

      return timetablePage;
    }));
  }

  return timetablePages;
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
  const stats = logUtils.generateStats(timetablePage);
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
