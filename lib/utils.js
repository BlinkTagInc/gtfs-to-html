const _ = require('lodash');
const beautify = require('js-beautify').html_beautify;
const geojsonMerge = require('@mapbox/geojson-merge');
const gtfs = require('gtfs');
const pug = require('pug');
const moment = require('moment');
const sanitize = require('sanitize-filename');

const fileUtils = require('./file-utils');
const formatters = require('./formatters');

function filterAndSortCalendarDates(calendarDates, startDate, endDate) {
  if (!calendarDates) {
    return [];
  }

  const start = formatters.fromGTFSDate(startDate);
  const end = formatters.fromGTFSDate(endDate);

  const filteredDates = {};

  calendarDates.forEach(calendarDate => {
    if (moment(calendarDate.date, 'YYYYMMDD').isBetween(start, end)) {
      filteredDates[calendarDate.date] = calendarDate;
    }
  });

  return _.sortBy(filteredDates, 'date');
}

function filterAndSortTimetables(timetables, timetablePageId) {
  const selectedTimetables = _.filter(timetables, {timetable_page_id: timetablePageId});
  if (!selectedTimetables || selectedTimetables.length === 0) {
    throw new Error(`No timetables found for timetable_page_id=${timetablePageId}`);
  }

  return _.sortBy(selectedTimetables, 'timetable_sequence');
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

const processStops = async (timetable, config) => {
  timetable.showDayList = false;
  timetable.noServiceSymbolUsed = false;
  timetable.requestStopSymbolUsed = false;

  const dayList = timetable.orderedTrips[0].dayList;

  timetable.orderedTrips.forEach(trip => {
    // See if any trips have a different dayList
    if (trip.dayList !== dayList) {
      timetable.showDayList = true;
    }

    // Append route_short_name
    trip.route_short_name = timetable.route.route_short_name;

    let stopIndex = 0;
    trip.stoptimes.forEach(stoptime => {
      // Find a stop for the matching stop_id greater than the last stopIndex
      const stop = _.find(timetable.stops, (st, idx) => {
        if (st.stop_id === stoptime.stop_id && idx >= stopIndex) {
          stopIndex = idx;
          return true;
        }
        return false;
      });

      if (stop) {
        stop.trips.push(formatters.formatStopTime(stoptime, timetable, config));

        // If showing arrival and departure times, add trip to the departure stop
        if (stop.type === 'arrival') {
          timetable.stops[stopIndex + 1].trips.push(formatters.formatStopTime(stoptime, timetable, config));
        }
      }
    });

    // Fill in any missing stoptimes for this trip
    timetable.stops.forEach(stop => {
      const lastStopTime = _.last(stop.trips);
      if (!lastStopTime || lastStopTime.trip_id !== trip.trip_id) {
        stop.trips.push(formatters.formatStopTime(undefined, timetable, config));
      }
    });
  });

  const stopIds = _.map(timetable.stops, 'stop_id');

  const stopDatas = await gtfs.getStops({
    agency_key: timetable.agency_key,
    stop_id: {
      $in: stopIds
    }
  });

  timetable.stops.forEach(stop => {
    const stopData = _.find(stopDatas, {stop_id: stop.stop_id});
    _.extend(stop, _.pick(stopData, ['stop_name', 'stop_code', 'stop_lat', 'stop_lon']));
  });

  // If `showStopCity` is true, look up stop attributes.
  if (config.showStopCity) {
    const stopAttributes = await gtfs.getStopAttributes({
      agency_key: timetable.agency_key,
      stop_id: {
        $in: stopIds
      }
    });

    timetable.stops.forEach(stop => {
      const stopAttribute = _.find(stopAttributes, {stop_id: stop.stop_id});
      if (stopAttribute) {
        stop.stop_city = stopAttribute.stop_city;
      }
    });
  }
};

const generateFileName = async timetable => {
  const routes = await gtfs.getRoutes({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id
  });

  if (routes.length === 0) {
    throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
  }

  const route = routes[0];
  const routeName = formatters.formatRouteName(route);
  let filename = `${timetable.timetable_id}_${routeName}_`;

  if (timetable.direction_id !== '' && timetable.direction_id !== null) {
    filename += `${timetable.direction_id}_`;
  }

  filename += `${formatters.formatDays(timetable).toLowerCase()}.html`;

  return sanitize(filename).replace(/\s/g, '');
};

function getDaysFromCalendars(calendars) {
  const days = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0
  };

  calendars.forEach(calendar => {
    _.each(days, (value, day) => {
      days[day] = value | calendar[day];
    });
  });

  return days;
}

const convertTimetableToTimetablePage = async timetable => {
  const filename = await generateFileName(timetable);
  return {
    agency_key: timetable.agency_key,
    timetable_page_id: timetable.timetable_id,
    timetable_page_label: timetable.timetable_label,
    timetables: [timetable],
    filename
  };
};

const convertRouteToTimetablePage = async (route, direction) => {
  const timetableId = route.route_id + (direction.direction_id ? `_${direction.direction_id}` : '');
  const timetable = {
    agency_key: route.agency_key,
    timetable_id: timetableId,
    timetable_label: `${formatters.formatRouteName(route)} to ${direction.trip_headsign}`,
    route_id: route.route_id,
    direction_id: direction.direction_id,
    start_date: parseInt(formatters.toGTFSDate(moment()), 10),
    end_date: parseInt(formatters.toGTFSDate(moment().add(1, 'week')), 10)
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
  Object.assign(timetable, getDaysFromCalendars(calendars));

  return convertTimetableToTimetablePage(timetable);
};

const convertRoutesToTimetablePages = async agencyKey => {
  const routes = await gtfs.getRoutes({agency_key: agencyKey});
  const timetablePages = await Promise.all(routes.map(async route => {
    const results = await gtfs.getDirectionsByRoute({
      agency_key: agencyKey,
      route_id: route.route_id
    });
    const directionGroups = _.groupBy(results, direction => direction.direction_id);
    return Promise.all(_.map(directionGroups, directionGroup => {
      const direction = directionGroup[0];
      return convertRouteToTimetablePage(route, direction);
    }));
  }));

  return _.compact(_.flatten(timetablePages));
};

function getStops(timetableStopOrders, stoptimes) {
  let stopIds;

  if (timetableStopOrders && timetableStopOrders.length !== 0) {
    // Use the stop_sequence from `timetable_stop_order.txt`
    stopIds = _.map(timetableStopOrders, 'stop_id');
  } else {
    stopIds = [];
    stoptimes.forEach(item => {
      const stoptime = item.toObject();
      stopIds[stoptime.stop_sequence] = stoptime.stop_id;
    });
    stopIds = _.compact(stopIds);
  }

  // Convert stops to array of object
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
}

const formatTimetablePage = async timetablePage => {
  // If timetable_page_label not set, use first route to name it
  if (timetablePage.timetable_page_label === '' || timetablePage.timetable_page_label === undefined) {
    const routes = await gtfs.getRoutes({
      agency_key: timetablePage.agency_key,
      route_id: timetablePage.timetables[0].route_id
    });

    if (routes.length === 0) {
      throw new Error(`No route found for route_id=${timetablePage.timetables[0].route_id}, timetable_id=${timetablePage.timetables[0].timetable_id}`);
    }
    const route = routes[0];

    timetablePage.timetable_page_label = `${route.route_short_name} ${route.route_long_name}`;
  }

  return timetablePage;
};

const getTimetableGeoJSON = async (timetable, config) => {
  const shapesGeojson = await gtfs.getShapesAsGeoJSON({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id,
    direction_id: timetable.direction_id
  });

  const stopsGeojson = await gtfs.getStopsAsGeoJSON({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id,
    direction_id: timetable.direction_id
  });

  const geojson = await geojsonMerge.merge([shapesGeojson, stopsGeojson]);
  return simplifyGeoJSON(geojson, config.coordinatePrecision);
};

function simplifyGeoJSON(geojson, coordinatePrecision) {
  if (coordinatePrecision === undefined) {
    return geojson;
  }

  geojson.features.forEach(feature => {
    feature.geometry.coordinates.forEach(coordinate => {
      const multiplier = Math.pow(10, coordinatePrecision);
      coordinate[0] = Math.round(coordinate[0] * multiplier) / multiplier;
      coordinate[1] = Math.round(coordinate[1] * multiplier) / multiplier;
    });
  });

  return geojson;
}

exports.setDefaultConfig = config => {
  const defaults = {
    assetPath: '..',
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
  const stats = {
    stops: 0,
    trips: 0,
    routeIds: {},
    serviceIds: {}
  };

  // Set default symbols if not provded in config
  config.noServiceSymbol = config.noServiceSymbol || '—';
  config.requestStopSymbol = config.requestStopSymbol || '***';
  config.assetPath = config.assetPath || '';

  // Format Timetables
  await Promise.all(timetablePage.timetables.map(async timetable => {
    const query = {
      agency_key: timetablePage.agency_key,
      start_date: {$lt: timetable.end_date},
      end_date: {$gte: timetable.start_date}
    };

    const days = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday'
    ];

    query.$or = days.reduce((memo, day) => {
      if (timetable[day] === 1) {
        const dayQuery = {};
        dayQuery[day] = 1;
        memo.push(dayQuery);
      }
      return memo;
    }, []);

    timetable.calendars = await gtfs.getCalendars(query);
    if (timetable.calendars.length === 0) {
      throw new Error(`No calendars found for start_date=${timetable.start_date}, end_date=${timetable.end_date}, timetable_id=${timetable.timetable_id}`);
    }

    timetable.serviceIds = _.map(_.uniqBy(timetable.calendars, 'service_id'), 'service_id');
    stats.routeIds[timetable.route_id] = true;
    timetable.dayList = formatters.formatDays(timetable);
    const routes = await gtfs.getRoutes({
      agency_key: timetablePage.agency_key,
      route_id: timetable.route_id
    });

    if (routes.length === 0) {
      throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
    }
    timetable.route = routes[0];

    const tripQuery = {
      agency_key: timetablePage.agency_key,
      route_id: timetable.route_id,
      service_id: {
        $in: timetable.serviceIds
      }
    };

    if (timetable.direction_id !== '') {
      tripQuery.direction_id = timetable.direction_id;
    }

    const trips = await gtfs.getTrips(tripQuery);

    if (trips.length === 0) {
      throw new Error(`No trips found for route_id=${timetable.route_id}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.serviceIds)}, timetable_id=${timetable.timetable_id}`);
    }

    const timetableStopOrders = await gtfs.getTimetableStopOrders({
      agency_key: timetablePage.agency_key,
      timetable_id: timetable.timetable_id
    });

    // Order Trips
    let longestTrip;
    const formattedTrips = await Promise.all(trips.map(async item => {
      const trip = item.toObject();
      trip.calendar = _.find(timetable.calendars, {service_id: trip.service_id});
      trip.dayList = formatters.formatDays(trip.calendar);

      const stoptimes = await gtfs.getStoptimes({
        agency_key: timetablePage.agency_key,
        trip_id: trip.trip_id
      });

      // Handles `showOnlyTimepoint` config option
      if (config.showOnlyTimepoint === true) {
        trip.stoptimes = filterStoptimes(stoptimes);

        if (trip.stoptimes.length === 0) {
          throw new Error(`No stoptimes which are timepoints found for agency_key=${timetablePage.agency_key}, trip_id=${trip.trip_id}`);
        }
      } else {
        trip.stoptimes = stoptimes;

        if (trip.stoptimes.length === 0) {
          throw new Error(`No stoptimes found for agency_key=${timetablePage.agency_key}, trip_id=${trip.trip_id}`);
        }
      }

      // Save to longest trip
      if (!longestTrip || trip.stoptimes.length > longestTrip.stoptimes.length) {
        longestTrip = trip;
      }

      return trip;
    }));

    timetable.orderedTrips = sortTrips(formattedTrips);

    stats.trips += timetable.orderedTrips.length;
    timetable.stops = getStops(timetableStopOrders, longestTrip.stoptimes);
    stats.stops += timetable.stops.length;

    await processStops(timetable, config);

    timetable.specialDates = await getSpecialDates(timetable);

    if (config.showMap) {
      timetable.geojson = await getTimetableGeoJSON(timetable, config);
    }
  }));

  // Summarize timetables in timetablePage
  timetablePage.dayLists = _.uniq(timetablePage.timetables.map(timetable => timetable.dayList));
  timetablePage.directionNames = _.uniq(timetablePage.timetables.map(timetable => timetable.direction_name));

  // Collect some stats
  stats.routes = _.size(stats.routeIds);
  stats.calendars = _.size(stats.serviceIds);

  // Generate HTML from template
  const templateVars = {
    timetablePage,
    config
  };

  let html = await pug.renderFile(fileUtils.getTemplateFile(config), templateVars);
  // Beautify HTML if setting is set
  if (config.beautify === true) {
    html = await beautify(html, {indent_size: 2});
  }

  return {
    html,
    stats
  };
};

exports.generateLogText = async (agency, outputStats) => {
  const results = await gtfs.getFeedInfo({agency_key: agency.agency_key});
  const feedVersion = results ? results.feed_version : 'Unknown';

  const logText = [
    `Feed Version: ${feedVersion}`,
    `Date Generated: ${new Date()}`,
    `Timetable Page Count ${outputStats.timetablePages}`,
    `Timetable Count: ${outputStats.timetables}`,
    `Calendar Service ID Count: ${outputStats.calendars}`,
    `Route Count: ${outputStats.routes}`,
    `Trip Count: ${outputStats.trips}`,
    `Stop Count: ${outputStats.stops}`
  ];

  if (agency.url) {
    logText.push(`Source: ${agency.url}`);
  } else if (agency.path) {
    logText.push(`Source: ${agency.path}`);
  }

  return logText;
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

  if (!timetables || timetables.length === 0) {
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
    timetablePages = [await convertRouteToTimetablePage(route, direction)];
  } else if (timetablePages.length === 0) {
    // If no timetablepage, use timetable
    const timetable = _.find(timetables, {timetable_id: timetablePageId});
    if (!timetable) {
      throw new Error(`No timetable found for timetable_page_id=${timetablePageId}`);
    }
    timetablePages = [await convertTimetableToTimetablePage(timetable)];
  } else {
    timetablePages.forEach(timetablePage => {
      timetablePage.timetables = filterAndSortTimetables(timetables, timetablePage.timetable_page_id);
    });
  }

  return formatTimetablePage(timetablePages[0]);
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
    timetablePages = await Promise.all(timetables.map(timetable => {
      return convertTimetableToTimetablePage(timetable);
    }));
  } else {
    // Otherwise, use timetable pages provided
    timetablePages = timetablePages.map(timetablePage => {
      timetablePage.timetables = filterAndSortTimetables(timetables, timetablePage.timetable_page_id);
      return timetablePage;
    });
  }

  return Promise.all(timetablePages.map(timetablePage => {
    return formatTimetablePage(timetablePage);
  }));
};

exports.log = config => {
  if (config.verbose === false) {
    return _.noop;
  }

  return (text, overwrite) => {
    return process.stdout.write(`${overwrite !== true ? '\n' : ''}${text}`);
  };
};
