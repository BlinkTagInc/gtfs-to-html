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
  const longestTrip = _.maxBy(trips, trip => _.size(trip.stoptimes));
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

function filterStoptimes(stoptimes) {
  return _.filter(stoptimes, stoptime => {
    if (stoptime.timepoint === undefined) {
      return stoptime.arrival_time !== '' && stoptime.departure_time !== '';
    }

    return stoptime.timepoint === 1;
  });
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

const processStops = async timetable => {
  const dayList = timetable.orderedTrips[0].dayList;

  for (const trip of timetable.orderedTrips) {
    // See if any trips have a different dayList
    if (trip.dayList !== dayList) {
      timetable.showDayList = true;
    }

    let stopIndex = 0;
    for (const [idx, stoptime] of trip.stoptimes.entries()) {
      // Find a stop for the matching stop_id greater than the last stopIndex
      const stop = _.find(timetable.stops, (st, idx) => {
        if (st.stop_id === stoptime.stop_id && idx >= stopIndex) {
          stopIndex = idx;
          return true;
        }
        return false;
      });

      if (!stop) {
        continue;
      }

      // If showing arrival and departure times, add trip to the departure stop, unless it is the last stoptime of the trip
      if (stop.type === 'arrival' && idx < trip.stoptimes.length - 1) {
        timetable.stops[stopIndex + 1].trips.push(formatters.formatStopTime(stoptime, timetable));
      }

      // Don't show times if it is an arrival stop and is the first stoptime for the trip
      if (idx === 0 && stop.type === 'arrival') {
        continue;
      }

      stop.trips.push(formatters.formatStopTime(stoptime, timetable));
    }

    // Fill in any missing stoptimes for this trip
    for (const stop of timetable.stops) {
      const lastStopTime = _.last(stop.trips);
      if (!lastStopTime || lastStopTime.trip_id !== trip.trip_id) {
        stop.trips.push(formatters.formatStopTime(undefined, timetable));
      }
    }
  }

  for (const stop of timetable.stops) {
    const stopData = await gtfs.getStops({
      agency_key: timetable.agency_key,
      stop_id: stop.stop_id
    });
    _.extend(stop, _.pick(_.first(stopData), ['stop_name', 'stop_code', 'stop_lat', 'stop_lon']));
  }

  // If `showStopCity` is true, look up stop attributes.
  if (timetable.showStopCity) {
    for (const stop of timetable.stops) {
      const stopAttribute = await gtfs.getStopAttributes({
        agency_key: timetable.agency_key,
        stop_id: stop.stop_id
      });
      if (stopAttribute.length > 0) {
        stop.stop_city = _.first(stopAttribute).stop_city;
      }
    }
  }
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

const getStops = async (trips, timetable) => {
  const longestTrip = _.maxBy(trips, trip => _.size(trip.stoptimes));
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

    for (const item of longestTrip.stoptimes) {
      const stoptime = item.toObject();
      stopIds[stoptime.stop_sequence] = stoptime.stop_id;
    }

    stopIds = _.compact(stopIds);
  }

  // Convert stops to array of objects
  const stops = stopIds.map((stopId, idx) => {
    const stop = {
      stop_id: stopId,
      trips: []
    };

    if (idx < (stopIds.length - 1) && stopId === stopIds[idx + 1]) {
      stop.type = 'arrival';
    } else if (idx > 0 && stopId === stopIds[idx - 1]) {
      stop.type = 'departure';
    }

    return stop;
  });

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
    let frequencies = await gtfs.getFrequencies({
      agency_key: timetable.agency_key,
      trip_id: trip.trip_id
    });
    frequencies = frequencies.map(frequency => frequency.toObject());

    const formattedTrip = formatters.formatTrip(trip, timetable, calendars, frequencies);

    const stoptimes = await gtfs.getStoptimes({
      agency_key: timetable.agency_key,
      trip_id: formattedTrip.trip_id
    });

    // Handles `showOnlyTimepoint` config option
    formattedTrip.stoptimes = (config.showOnlyTimepoint === true) ? filterStoptimes(stoptimes) : stoptimes;

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
    formattedTimetable.stops = await getStops(formattedTimetable.orderedTrips, timetable);
    await processStops(formattedTimetable);
    formattedTimetable.specialDates = await getSpecialDates(timetable);

    if (config.showMap) {
      formattedTimetable.geojson = await geoJSONUtils.getTimetableGeoJSON(timetable, config);
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
