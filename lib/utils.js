const _ = require('lodash');
const gtfs = require('gtfs');
const moment = require('moment');

const fileUtils = require('./file-utils');
const formatters = require('./formatters');
const geoJSONUtils = require('./geojson-utils');
const logUtils = require('./log-utils');

const getTimetableColors = async timetablePage => {
  const routes = await gtfs.getRoutes({
    agency_key: timetablePage.agency_key,
    route_id: {$in: timetablePage.routeIds}
  });
  return _.compact(_.uniq(_.map(routes, 'route_color')));
};

const getLongestTrip = trips => _.maxBy(trips, trip => _.size(trip.stoptimes));

const filterAndSortCalendarDates = (calendarDates, startDate = '19000000', endDate = '21000000') => {
  if (!calendarDates) {
    return [];
  }

  const start = formatters.fromGTFSDate(startDate);
  const end = formatters.fromGTFSDate(endDate);

  const filteredDates = {};

  for (const calendarDate of calendarDates) {
    if (moment(calendarDate.date, 'YYYYMMDD').isBetween(start, end)) {
      filteredDates[calendarDate.date] = calendarDate;
    }
  }

  return _.sortBy(filteredDates, 'date');
};

const findCommonStopId = trips => {
  // Find the first stop_id that all trips have in common, otherwise use the first stoptime
  const longestTrip = getLongestTrip(trips);
  const commonStoptime = _.find(longestTrip.stoptimes, (stoptime, idx) => {
    // If longest trip is a loop (first and last stops the same), then skip first stoptime
    if (idx === 0 && stoptime.stop_id === _.last(longestTrip.stoptimes).stop_id) {
      return false;
    }
    return _.every(trips, trip => {
      return _.find(trip.stoptimes, {stop_id: stoptime.stop_id});
    });
  });

  return commonStoptime ? commonStoptime.stop_id : null;
};

const deduplicateTrips = (trips, commonStopId) => {
  // Remove duplicate trips (from overlapping service_ids)
  const deduplicatedTrips = trips.reduce((memo, trip) => {
    if (memo.length === 0) {
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

const sortTrips = trips => {
  const commonStopId = findCommonStopId(trips);

  const sortedTrips = _.sortBy(trips, trip => {
    let selectedStoptime;
    if (commonStopId) {
      selectedStoptime = _.find(trip.stoptimes, {stop_id: commonStopId});
    } else {
      selectedStoptime = trip.stoptimes[0];
    }
    return moment.duration(selectedStoptime.departure_time).asSeconds();
  });

  return deduplicateTrips(sortedTrips, commonStopId);
};

const filterAndSortTimetables = async (timetables, timetablePageId) => {
  const selectedTimetables = _.filter(timetables, {timetable_page_id: timetablePageId});
  if (!selectedTimetables || selectedTimetables.length === 0) {
    throw new Error(`No timetables found for timetable_page_id=${timetablePageId}`);
  }

  return _.sortBy(selectedTimetables, 'timetable_sequence');
};

const getSpecialDates = async timetable => {
  const results = await gtfs.getCalendarDates({
    agency_key: timetable.agency_key,
    service_id: {
      $in: timetable.serviceIds
    }
  });

  const calendarDates = _.groupBy(results, 'exception_type');
  return {
    excludedDates: filterAndSortCalendarDates(calendarDates['2'], timetable.start_date, timetable.end_date).map(formatters.formatDate),
    includedDates: filterAndSortCalendarDates(calendarDates['1'], timetable.start_date, timetable.end_date).map(formatters.formatDate)
  };
};

const getRouteFromTimetable = async timetable => {
  const routes = await gtfs.getRoutes({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id
  });

  if (routes.length === 0) {
    throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
  }

  return _.first(routes);
};

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

const convertTimetableToTimetablePage = async timetable => {
  if (!timetable.route) {
    timetable.route = getRouteFromTimetable(timetable);
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

const convertRouteToTimetablePage = async (route, direction, calendars) => {
  const timetable = {
    agency_key: route.agency_key,
    route_id: route.route_id,
    direction_id: direction.direction_id,
    direction_name: direction.trip_headsign,
    route
  };

  // Get days of week from calendars and assign to timetable
  Object.assign(timetable, formatters.getDaysFromCalendars(calendars));

  timetable.timetable_id = formatters.formatTimetableId(timetable);

  return convertTimetableToTimetablePage(timetable);
};

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
    const dayGroups = formatters.groupCalendarsByDays(calendars);

    return Promise.all(_.map(directionGroups, directionGroup => {
      const direction = _.first(directionGroup);
      return Promise.all(_.map(dayGroups, calendars => {
        return convertRouteToTimetablePage(route, direction, calendars);
      }));
    }));
  }));

  return _.compact(_.flattenDeep(timetablePages));
};

const generateTripsByFrequencies = (trip, frequencies) => {
  const resetTrip = formatters.resetStoptimesToMidnight(trip);
  return frequencies.reduce((memo, frequency) => {
    const startSeconds = formatters.secondsAfterMidnight(frequency.start_time);
    const endSeconds = formatters.secondsAfterMidnight(frequency.end_time);
    for (let offset = startSeconds; offset < endSeconds; offset += frequency.headway_secs) {
      const newTrip = _.omit(_.cloneDeep(resetTrip), ['_id']);
      newTrip.trip_id = `${resetTrip.trip_id}_freq_${memo.length}`;
      newTrip.stoptimes = formatters.updateStoptimesByOffset(newTrip, offset);
      memo.push(newTrip);
    }
    return memo;
  }, []);
};

const getStops = async timetable => {
  const timetableStopOrders = await gtfs.getTimetableStopOrders({
    agency_key: timetable.agency_key,
    timetable_id: timetable.timetable_id
  });

  let stopIds;
  if (timetableStopOrders && timetableStopOrders.length !== 0) {
    // Use the stop_sequence from `timetable_stop_order.txt`
    stopIds = _.map(timetableStopOrders, 'stop_id');
  } else {
    stopIds = [];
    const longestTrip = getLongestTrip(timetable.orderedTrips);
    for (const stoptime of longestTrip.stoptimes) {
      stopIds[stoptime.stop_sequence] = stoptime.stop_id;
    }

    stopIds = _.compact(stopIds);
  }

  // Convert stops to array of objects
  let stops = await Promise.all(stopIds.map(async (stopId, idx) => {
    const stops = await gtfs.getStops({
      agency_key: timetable.agency_key,
      stop_id: stopId
    });

    if (stops.length === 0) {
      throw new Error(`No stop found for agency_key=${timetable.agency_key}, stop_id=${stopId}`);
    }

    const stop = _.pick(_.first(stops), ['stop_id', 'stop_name', 'stop_code', 'stop_lat', 'stop_lon']);

    stop.trips = [];

    if (idx < (stopIds.length - 1) && stopId === stopIds[idx + 1]) {
      stop.type = 'arrival';
    } else if (idx > 0 && stopId === stopIds[idx - 1]) {
      stop.type = 'departure';
    }

    return stop;
  }));

  stops = formatters.formatStops(stops, timetable);

  // If `showStopCity` is true, look up stop attributes.
  if (timetable.showStopCity) {
    await Promise.all(stops.map(async stop => {
      const stopAttribute = await gtfs.getStopAttributes({
        agency_key: timetable.agency_key,
        stop_id: stop.stop_id
      });
      if (stopAttribute.length > 0) {
        stop.stop_city = _.first(stopAttribute).stop_city;
      }
    }));
  }

  return stops;
};

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

  const days = formatters.getDaysFromCalendars([timetable]);
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

const getCalendarDatesFromTimetable = async timetable => {
  const calendarDateQuery = {
    agency_key: timetable.agency_key,
    exception_type: 1
  };

  if (timetable.end_date) {
    if (!calendarDateQuery.date) {
      calendarDateQuery.date = {};
    }

    calendarDateQuery.date.$lt = timetable.end_date;
  }

  if (timetable.start_date) {
    if (!calendarDateQuery.date) {
      calendarDateQuery.date = {};
    }

    calendarDateQuery.date.$gte = timetable.start_date;
  }

  const calendarDates = await gtfs.getCalendarDates(calendarDateQuery);

  return calendarDates;
};

const getFrequenciesByTrip = async trip => {
  const frequencies = await gtfs.getFrequencies({
    agency_key: trip.agency_key,
    trip_id: trip.trip_id
  });
  return frequencies.map(formatters.formatFrequency);
};

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
    throw new Error(`No trips found for route_id=${timetable.route_id}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.serviceIds)}, timetable_id=${timetable.timetable_id}`);
  }

  const formattedTrips = [];
  await Promise.all(trips.map(async trip => {
    const formattedTrip = formatters.formatTrip(trip, timetable, calendars);
    formattedTrip.stoptimes = await getStoptimesByTrip(formattedTrip, config);

    if (formattedTrip.stoptimes.length === 0) {
      if (config.showOnlyTimepoint === true) {
        throw new Error(`No stoptimes which are timepoints found for agency_key=${timetable.agency_key}, trip_id=${formattedTrip.trip_id}`);
      } else {
        throw new Error(`No stoptimes found for agency_key=${timetable.agency_key}, trip_id=${formattedTrip.trip_id}`);
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

const getShowDayList = timetable => {
  return !_.every(timetable.orderedTrips, (trip, idx) => {
    if (idx === 0) {
      return true;
    }
    return trip.dayList === timetable.orderedTrips[idx - 1].dayList;
  });
};

exports.formatTimetables = async (timetables, config) => {
  return Promise.all(timetables.map(async timetable => {
    const dayList = formatters.formatDays(timetable);
    const calendars = await getCalendarsFromTimetable(timetable);
    let serviceIds = _.map(calendars, 'service_id');

    if (timetable.exclude_exceptions !== 1) {
      const calendarDates = await getCalendarDatesFromTimetable(timetable);
      const calendarDatesServiceIds = _.map(calendarDates, 'service_id');
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
    timetable.specialDates = await getSpecialDates(timetable);
    timetable.showDayList = getShowDayList(timetable);
    timetable.timetable_label = formatters.formatTimetableLabel(timetable);

    if (config.showMap) {
      timetable.geojson = await geoJSONUtils.getTimetableGeoJSON(timetable, config);
    }

    return timetable;
  }));
};

exports.formatTimetablePage = async timetablePage => {
  timetablePage.dayList = formatters.formatDays(formatters.getDaysFromCalendars(timetablePage.timetables));
  timetablePage.dayLists = _.uniq(timetablePage.timetables.map(timetable => timetable.dayList));
  timetablePage.routeIds = _.uniq(_.map(timetablePage.timetables, 'route_id'));
  timetablePage.routeColors = await getTimetableColors(timetablePage);

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
    showStopCity: false,
    verbose: true,
    zipOutput: false
  };

  return Object.assign(defaults, config);
};

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

    Object.assign(calendarQuery, formatters.calendarCodeToCalendar(calendarCode));
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

exports.generateHTML = async (timetablePage, config) => {
  const templateVars = {
    timetablePage,
    config
  };
  const html = await fileUtils.renderFile('timetablepage', templateVars, config);
  const stats = logUtils.generateStats(timetablePage);
  return {html, stats};
};

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
