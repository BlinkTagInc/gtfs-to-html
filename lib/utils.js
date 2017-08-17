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

function getLongestTrip(trips) {
  return _.maxBy(trips, trip => _.size(trip.stoptimes));
}

function filterAndSortCalendarDates(calendarDates, startDate, endDate) {
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
}

function sortTrips(trips) {
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

  const sortedTrips = _.sortBy(trips, trip => {
    let selectedStoptime;
    if (commonStoptime) {
      selectedStoptime = _.find(trip.stoptimes, {stop_id: commonStoptime.stop_id});
    } else {
      selectedStoptime = trip.stoptimes[0];
    }
    return moment(selectedStoptime.departure_time, 'HH:mm:ss').unix();
  });

  // Remove duplicate trips (from overlapping service_ids)
  const filteredTrips = sortedTrips.reduce((memo, trip) => {
    if (memo.length === 0) {
      memo.push(trip);
      return memo;
    }

    const stoptimes = _.map(trip.stoptimes, 'departure_time');
    const prevStoptimes = _.map(_.last(memo).stoptimes, 'departure_time');
    if (!_.isEqual(stoptimes, prevStoptimes)) {
      memo.push(trip);
    }
    return memo;
  }, []);

  return filteredTrips;
}

const filterAndSortTimetables = async (timetables, timetablePageId) => {
  const selectedTimetables = _.filter(timetables, {timetable_page_id: timetablePageId});
  if (!selectedTimetables || selectedTimetables.length === 0) {
    throw new Error(`No timetables found for timetable_page_id=${timetablePageId}`);
  }

  for (const timetable of selectedTimetables) {
    const routes = await gtfs.getRoutes({
      agency_key: timetable.agency_key,
      route_id: timetable.route_id
    });
    if (!routes || routes.length === 0) {
      throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
    }
    timetable.route = _.first(routes);
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

const formatTimetablePage = async timetablePage => {
  // Summarize timetables in timetablePage
  timetablePage.dayList = formatters.formatDays(formatters.getDaysFromCalendars(timetablePage.timetables));
  timetablePage.dayLists = _.uniq(timetablePage.timetables.map(timetable => timetable.dayList));
  timetablePage.routeIds = _.uniq(_.map(timetablePage.timetables, 'route_id'));
  timetablePage.routeColors = await getTimetableColors(timetablePage);
  timetablePage.directionNames = _.uniq(timetablePage.timetables.map(timetable => timetable.direction_name));

  return timetablePage;
};

const convertTimetableToTimetablePage = async timetable => {
  const routes = await gtfs.getRoutes({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id
  });

  if (routes.length === 0) {
    throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
  }

  const route = routes[0];
  const filename = await fileUtils.generateFileName(timetable, route);
  timetable.route = route;

  return {
    agency_key: timetable.agency_key,
    timetable_page_id: timetable.timetable_id,
    timetable_page_label: timetable.timetable_label,
    timetables: [timetable],
    filename
  };
};

const convertRouteToTimetablePage = async (route, direction) => {
  const timetable = {
    agency_key: route.agency_key,
    timetable_id: formatters.formatTimetableId(route, direction),
    route_id: route.route_id,
    direction_id: direction.direction_id,
    start_date: parseInt(formatters.toGTFSDate(moment()), 10),
    end_date: parseInt(formatters.toGTFSDate(moment().add(1, 'week')), 10),
    route: route
  };

  const tripQuery = {
    agency_key: route.agency_key,
    route_id: route.route_id
  };

  if (direction.direction_id !== '' && direction.direction_id !== null) {
    tripQuery.direction_id = direction.direction_id
  };

  const serviceIds = await gtfs.getTrips(tripQuery).distinct('service_id');

  const calendars = await gtfs.getCalendars({
    agency_key: route.agency_key,
    service_id: {
      $in: serviceIds
    }
  });

  // Get days of week from route calendars
  Object.assign(timetable, formatters.getDaysFromCalendars(calendars));

  return convertTimetableToTimetablePage(timetable);
};

const convertRoutesToTimetablePages = async agencyKey => {
  const routes = await gtfs.getRoutes({agency_key: agencyKey});
  const timetablePages = await Promise.all(routes.map(async route => {
    const directions = await gtfs.getDirectionsByRoute({
      agency_key: agencyKey,
      route_id: route.route_id
    });
    const directionGroups = _.groupBy(directions, direction => direction.direction_id);
    return Promise.all(_.map(directionGroups, directionGroup => {
      const direction = directionGroup[0];
      return convertRouteToTimetablePage(route, direction);
    }));
  }));

  return _.compact(_.flatten(timetablePages));
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
    for (const item of longestTrip.stoptimes) {
      const stoptime = item.toObject();
      stopIds[stoptime.stop_sequence] = stoptime.stop_id;
    }

    stopIds = _.compact(stopIds);
  }

  // Convert stops to array of objects
  let stops = await Promise.all(stopIds.map(async (stopId, idx) => {
    const stop = await gtfs.getStops({
      agency_key: timetable.agency_key,
      stop_id: stopId
    })
    .then(stops => {
      if (stops.length === 0 ) {
        throw new Error(`No stop found for agency_key=${timetable.agency_key}, stop_id=${stopId}`);
      }

      return _.pick(_.first(stops), ['stop_id', 'stop_name', 'stop_code', 'stop_lat', 'stop_lon']);
    });

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
    for (const stop of stops) {
      const stopAttribute = await gtfs.getStopAttributes({
        agency_key: timetable.agency_key,
        stop_id: stop.stop_id
      });
      if (stopAttribute.length > 0) {
        stop.stop_city = _.first(stopAttribute).stop_city;
      }
    }
  }

  return stops;
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

  let trips = await gtfs.getTrips(tripQuery);
  trips = trips.map(trip => trip.toObject());

  if (trips.length === 0) {
    throw new Error(`No trips found for route_id=${timetable.route_id}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.serviceIds)}, timetable_id=${timetable.timetable_id}`);
  }

  // Order Trips
  const formattedTrips = await Promise.all(trips.map(async trip => {
    const formattedTrip = formatters.formatTrip(trip, timetable, calendars);
    formattedTrip.frequencies = await getFrequenciesByTrip(formattedTrip);
    formattedTrip.stoptimes = await getStoptimesByTrip(formattedTrip, config);

    if (formattedTrip.stoptimes.length === 0) {
      if (config.showOnlyTimepoint === true) {
        throw new Error(`No stoptimes which are timepoints found for agency_key=${timetable.agency_key}, trip_id=${formattedTrip.trip_id}`);
      } else {
        throw new Error(`No stoptimes found for agency_key=${timetable.agency_key}, trip_id=${formattedTrip.trip_id}`);
      }
    }

    return formattedTrip;
  }));

  return sortTrips(formattedTrips);
};

const getCalendarsFromTimetable = async timetable => {
  const calendarQuery = {
    agency_key: timetable.agency_key,
    start_date: {$lt: timetable.end_date},
    end_date: {$gte: timetable.start_date}
  };

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

const getFrequenciesByTrip = async trip => {
  const frequencies = await gtfs.getFrequencies({
    agency_key: trip.agency_key,
    trip_id: trip.trip_id
  });
  return frequencies.map(frequency => formatters.formatFrequency(frequency.toObject()));
};

const getStoptimesByTrip = async (trip, config) => {
  const stoptimes = await gtfs.getStoptimes({
    agency_key: trip.agency_key,
    trip_id: trip.trip_id
  });

  if (config.showOnlyTimepoint === true) {
    return _.filter(stoptimes, stoptime => {
      if (stoptime.timepoint === undefined) {
        return stoptime.arrival_time !== '' && stoptime.departure_time !== '';
      }

      return stoptime.timepoint === 1;
    });
  }

  return stoptimes;
};

const getShowDayList = timetable => {
  return !_.every(timetable.orderedTrips, (trip, idx) => {
    if (idx === 0) {
      return true;
    }
    return trip.dayList === timetable.orderedTrips[idx - 1].dayList;
  });
};

exports.setDefaultConfig = config => {
  const defaults = {
    beautify: false,
    menuType: 'jump',
    noHead: false,
    noServiceSymbol: '-',
    requestStopSymbol: '***',
    skipImport: false,
    showMap: false,
    showOnlyTimepoint: false,
    showStopCity: false,
    verbose: true,
    zipOutput: false
  };

  return Object.assign(defaults, config);
};

exports.generateHTML = async (timetablePage, config) => {
  await Promise.all(timetablePage.timetables.map(async timetable => {
    const calendars = await getCalendarsFromTimetable(timetable);
    const calendarDates = await gtfs.getCalendarDates({
      agency_key: timetablePage.agency_key,
      date: {
        $lt: timetable.end_date,
        $gte: timetable.start_date
      },
      exception_type: 1
    });

    const formattedTimetable = formatters.formatTimetable(timetable, calendars, calendarDates, config);

    formattedTimetable.route = await getRouteFromTimetable(formattedTimetable);
    formattedTimetable.orderedTrips = await getTripsFromTimetable(formattedTimetable, calendars, config);
    formattedTimetable.stops = await getStops(formattedTimetable);
    formattedTimetable.specialDates = await getSpecialDates(formattedTimetable);
    formattedTimetable.showDayList = getShowDayList(formattedTimetable);

    if (config.showMap) {
      formattedTimetable.geojson = await geoJSONUtils.getTimetableGeoJSON(formattedTimetable, config);
    }
  }));

  const templateVars = {
    timetablePage,
    config
  };
  const html = await fileUtils.renderFile(fileUtils.getTemplateFile(config), templateVars, config);
  const stats = logUtils.generateStats(timetablePage);
  return {html, stats};
};

exports.generateOverviewHTML = async (agencyKey, timetablePages, config) => {
  const agencies = await gtfs.getAgencies({agency_key: agencyKey});
  const agency = _.first(agencies)

  if (config.showMap) {
    agency.geojson = await geoJSONUtils.getAgencyGeoJSON(agencyKey, config);
  }

  const templateVars = {
    agencyKey,
    agency,
    config,
    timetablePages: _.sortBy(timetablePages, 'timetable_page_label')
  };
  return fileUtils.renderFile(fileUtils.getOverviewTemplateFile(config), templateVars, config);
};

exports.getTimetablePage = async (agencyKey, timetablePageId) => {
  let timetables = await gtfs.getTimetables({agency_key: agencyKey});
  timetables = timetables.map(timetable => timetable.toObject());

  // Check if there are any timetable pages
  let timetablePages = await gtfs.getTimetablePages({
    agency_key: agencyKey,
    timetable_page_id: timetablePageId
  });
  timetablePages = timetablePages.map(timetablePage => timetablePage.toObject());

  let timetablePage;

  if (timetablePages.length > 1) {
    throw new Error(`Multiple timetable_pages found for timetable_page_id=${timetablePageId}`);
  } else if (!timetables || timetables.length === 0) {
    // If no timetables, build the route and direction into a timetable
    let routeId;
    let directionId = '';
    if (timetablePageId.indexOf('_') === -1) {
      routeId = timetablePageId;
    } else {
      const parts = timetablePageId.split('_');
      directionId = parseInt(parts.pop(), 10);
      routeId = parts.join('_');
    }

    const routes = await gtfs.getRoutes({
      agency_key: agencyKey,
      route_id: routeId
    });

    if (routes.length === 0) {
      throw new Error(`No route found for route_id=${routeId}`);
    }

    const route = routes[0];
    const directions = await gtfs.getDirectionsByRoute({
      agency_key: agencyKey,
      route_id: routeId
    });

    const direction = _.find(directions, direction => direction.direction_id === directionId);
    timetablePage = await convertRouteToTimetablePage(route, direction);
  } else if (timetablePages.length === 0) {
    // If no timetablepage, use timetable
    const timetable = _.find(timetables, {timetable_id: timetablePageId});

    if (!timetable) {
      throw new Error(`No timetable found for timetable_page_id=${timetablePageId}`);
    }
    timetablePage = await convertTimetableToTimetablePage(timetable);
  } else {
    // Otherwise, use timetablepage provided
    timetablePage = _.first(timetablePages);
    timetablePage.timetables = await filterAndSortTimetables(timetables, timetablePage.timetable_page_id);
  }

  return formatTimetablePage(timetablePage);
};

exports.getTimetablePages = async agencyKey => {
  let timetables = await gtfs.getTimetables({agency_key: agencyKey});
  timetables = timetables.map(timetable => timetable.toObject());

  // Check if there are any timetable pages
  let timetablePages = await gtfs.getTimetablePages({agency_key: agencyKey});
  timetablePages = timetablePages.map(timetablePage => timetablePage.toObject());

  if (!timetables || timetables.length === 0) {
    // If no timetables, build each route and direction into a timetable
    timetablePages = await convertRoutesToTimetablePages(agencyKey);
  } else if (!timetablePages || timetablePages.length === 0) {
    // If no timetablepages, use timetables
    timetablePages = await Promise.all(timetables.map(convertTimetableToTimetablePage));
  } else {
    // Otherwise, use timetable pages provided
    timetablePages = await Promise.all(timetablePages.map(async timetablePage => {
      timetablePage.timetables = await filterAndSortTimetables(timetables, timetablePage.timetable_page_id);
      return timetablePage;
    }));
  }

  return Promise.all(timetablePages.map(formatTimetablePage));
};
