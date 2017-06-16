const _ = require('lodash');
const beautify = require('js-beautify').html_beautify;
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

function sortTrips(trips) {
  // Find the first stop_id that all trips have in common, otherwise use the first stoptime
  const commonStoptime = _.find(_.first(trips).stoptimes, stoptime => {
    return _.every(trips, trip => {
      return _.find(trip.stoptimes, {stop_id: stoptime.stop_id});
    });
  });

  return _.sortBy(trips, trip => {
    let selectedStoptime;
    if (commonStoptime) {
      selectedStoptime =  _.find(trip.stoptimes, {stop_id: commonStoptime.stop_id});
    } else {
      selectedStoptime = trip.stoptimes[0];
    }

    return moment(selectedStoptime.departure_time, 'HH:mm:ss').format('X');
  });
}

function filterStoptimes(stoptimes, config) {
  // Handles `showOnlyTimepoint` config option
  if (!config.showOnlyTimepoint) {
    return stoptimes;
  }

  return _.filter(stoptimes, stoptime => {
    return stoptime.arrival_time !== '' && stoptime.departure_time !== '';
  });
}

function getSpecialDates(timetable) {
  return gtfs.getCalendarDatesByService(timetable.serviceIds)
  .then(results => {
    const calendarDates = _.groupBy(results, 'exception_type');
    return {
      excludedDates: filterAndSortCalendarDates(calendarDates['2'], timetable.start_date, timetable.end_date).map(formatters.formatDate),
      includedDates: filterAndSortCalendarDates(calendarDates['1'], timetable.start_date, timetable.end_date).map(formatters.formatDate)
    };
  });
}

function processStops(agencyKey, timetable, config) {
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

    let stopSequence = 0;
    timetable.stops.forEach(stop => {
      // find a stoptime for the matching stop_id greater than the last stop_sequence
      const stoptime = _.find(trip.stoptimes, st => st.stop_id === stop.stop_id && st.stop_sequence >= stopSequence);
      if (stoptime) {
        stopSequence = stoptime.stop_sequence;
      }
      stop.trips.push(formatters.formatStopTime(stoptime, timetable, config));
    });
  });

  const stopIds = _.map(timetable.stops, 'stop_id');

  return gtfs.getStops(agencyKey, stopIds)
  .then(stopDatas => {
    timetable.stops.forEach(stop => {
      const stopData = _.find(stopDatas, {stop_id: stop.stop_id});
      _.extend(stop, _.pick(stopData, ['stop_name', 'stop_code', 'stop_lat', 'stop_lon']));
    });

    // If `showStopCity` is true, look up stop attributes.
    if (config.showStopCity) {
      return gtfs.getStopAttributes(agencyKey, stopIds)
      .then(stopAttributes => {
        timetable.stops.forEach(stop => {
          const stopAttribute = _.find(stopAttributes, {stop_id: stop.stop_id});
          if (stopAttribute) {
            stop.stop_city = stopAttribute.stop_city;
          }
        });
      });
    }
  });
}

function processStopsForMap(timetable) {
  const keys = ['stop_name', 'stop_lat', 'stop_lon'];
  return timetable.stops.map(stop => _.pick(stop, keys));
}

function generateFileName(agencyKey, timetable) {
  return gtfs.getRoutesById(agencyKey, timetable.route_id)
  .then(route => {
    if (!route) {
      throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
    }

    const routeName = formatters.formatRouteName(route);
    let filename = `${timetable.timetable_id}_${routeName}_`;

    if (timetable.direction_id !== null) {
      filename += `${timetable.direction_id}_`;
    }

    filename += `${formatters.formatDays(timetable).toLowerCase()}.html`;

    return sanitize(filename).replace(/\s/g, '');
  });
}

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

function convertRouteToTimetablePage(agencyKey, route, direction) {
  const timetable = {
    timetable_id: `${route.route_id}_${direction.direction_id}`,
    timetable_label: `${formatters.formatRouteName(route)} to ${direction.trip_headsign}`,
    route_id: route.route_id,
    direction_id: direction.direction_id,
    start_date: parseInt(formatters.toGTFSDate(moment()), 10),
    end_date: parseInt(formatters.toGTFSDate(moment().add(1, 'week')), 10)
  };

  return gtfs.getTripsByRouteAndDirection(agencyKey, route.route_id, direction.direction_id)
  .then(trips => {
    if (!trips || trips.length === 0) {
      return;
    }

    const serviceIds = _.uniq(_.map(trips, 'service_id'));

    return gtfs.getCalendarsByService(serviceIds)
    .then(calendars => {
      // Get days of week from route calendars
      Object.assign(timetable, getDaysFromCalendars(calendars));

      return convertTimetableToTimetablePage(agencyKey, timetable);
    });
  });
}

function convertTimetableToTimetablePage(agencyKey, timetable) {
  return generateFileName(agencyKey, timetable)
  .then(filename => (
    {
      timetable_page_id: timetable.timetable_id,
      timetable_page_label: timetable.timetable_label,
      timetables: [timetable],
      filename
    }
  ));
}

function convertRoutesToTimetablePages(agencyKey) {
  return gtfs.getRoutesByAgency(agencyKey)
  .then(routes => {
    return Promise.all(routes.map(route => {
      return gtfs.getDirectionsByRoute(agencyKey, route.route_id)
      .then(results => {
        const directionGroups = _.groupBy(results, direction => direction.direction_id);
        return Promise.all(_.map(directionGroups, directionGroup => {
          const direction = directionGroup[0];
          return convertRouteToTimetablePage(agencyKey, route, direction);
        }));
      });
    }));
  })
  .then(timetablePages => _.compact(_.flatten(timetablePages)));
}

function getStops(timetableStopOrders, stoptimes) {
  let stopIds;

  if (timetableStopOrders && timetableStopOrders.length) {
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
    let stop = {
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

function getCalendarQueryDay(timetable) {
  const queryDay = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0
  };

  _.each(queryDay, (value, day) => {
    if (timetable[day] === 1) {
      queryDay[day] = 1;
      return false;
    }
  });

  return queryDay;
}

function shapesToCoordinateArray(shapes) {
  if (!shapes) {
    return null;
  }

  return _.map(shapes, shape => _.map(shape, p => [p.shape_pt_lon, p.shape_pt_lat]));
}

function formatTimetablePage(agencyKey, timetablePage) {
  // If timetable_page_label not set, use first route to name it
  if (timetablePage.timetable_page_label !== '') {
    return timetablePage;
  }

  return gtfs.getRoutesById(agencyKey, timetablePage.timetables[0].route_id)
  .then(route => {
    if (!route) {
      throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
    }

    timetablePage.timetable_page_label = `${route.route_short_name} ${route.route_long_name}`;
    return timetablePage;
  });
}

exports.setDefaultConfig = config => {
  const defaults = {
    menuType: 'jump',
    noHead: false,
    noServiceSymbol: '-',
    requestStopSymbol: '***',
    showMap: false,
    showOnlyTimepoint: false,
    showStopCity: false,
    verbose: true,
    zipOutput: false
  };

  return Object.assign(defaults, config);
};

exports.generateHTML = (agencyKey, timetablePage, config) => {
  const stats = {
    stops: 0,
    trips: 0,
    routeIds: {},
    serviceIds: {}
  };

  // Set default symbols if not provded in config
  config.noServiceSymbol = config.noServiceSymbol || '—';
  config.requestStopSymbol = config.requestStopSymbol || '***';

  // Format Timetables
  return Promise.all(timetablePage.timetables.map(timetable => {
    // Only get first day of week that matches timetable
    return new Promise(resolve => {
      resolve(getCalendarQueryDay(timetable));
    })
    .then(queryDay => {
      return gtfs.getCalendars(agencyKey, timetable.start_date, timetable.end_date, queryDay.monday, queryDay.tuesday, queryDay.wednesday, queryDay.thursday, queryDay.friday, queryDay.saturday, queryDay.sunday);
    })
    .then(calendars => {
      if (!calendars.length) {
        throw new Error(`No calendars found for start_date=${timetable.start_date}, end_date=${timetable.end_date}, timetable_id=${timetable.timetable_id}`);
      }
      // Get Calendars
      timetable.calendars = formatters.formatCalendars(calendars);
      timetable.serviceIds = _.map(timetable.calendars, 'service_id');
      timetable.serviceIds.forEach(serviceId => {
        stats.serviceIds[serviceId] = true;
      });
    })
    .then(() => {
      stats.routeIds[timetable.route_id] = true;

      timetable.dayList = formatters.formatDays(timetable);
    })
    .then(() => gtfs.getRoutesById(agencyKey, timetable.route_id))
    .then(route => {
      if (!route) {
        throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
      }
      // Get Route
      timetable.route = route;
    })
    .then(() => gtfs.getTripsByRouteAndDirection(agencyKey, timetable.route_id, timetable.direction_id, timetable.serviceIds))
    .then(trips => {
      if (!trips || trips.length === 0) {
        throw new Error(`No trips found for route_id=${timetable.route_id}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.serviceIds)}, timetable_id=${timetable.timetable_id}`);
      }
      // Get Trips
      timetable.trips = _.flatten(trips, true);
      stats.trips += timetable.trips.length;
    })
    .then(() => gtfs.getTimetableStopOrders(agencyKey, timetable.timetable_id))
    .then(timetableStopOrders => {
      // Order Trips
      let longestTrip;
      return Promise.all(timetable.trips.map(item => {
        const trip = item.toObject();
        trip.calendar = _.find(timetable.calendars, {service_id: trip.service_id});
        trip.dayList = formatters.formatDays(trip.calendar);

        return gtfs.getStoptimesByTrip(agencyKey, trip.trip_id)
        .then(stoptimes => {
          trip.stoptimes = filterStoptimes(stoptimes, config);

          // Save to longest trip
          if (!longestTrip || trip.stoptimes.length > longestTrip.stoptimes.length) {
            longestTrip = trip;
          }

          return trip;
        });
      }))
      .then(trips => {
        timetable.stops = getStops(timetableStopOrders, longestTrip.stoptimes);
        stats.stops += timetable.stops.length;

        return trips;
      });
    })
    .then(trips => {
      if (!trips || trips.length === 0) {
        throw new Error(`No trips found for timetable_id=${timetable.timetable_id}`);
      }

      timetable.orderedTrips = sortTrips(trips);
    })
    .then(() => processStops(agencyKey, timetable, config))
    .then(() => {
      timetable.stopsForMap = processStopsForMap(timetable);
    })
    .then(() => getSpecialDates(timetable))
    .then(specialDates => {
      timetable.specialDates = specialDates;
    })
    .then(() => gtfs.getShapesByRoute(agencyKey, timetable.route_id, timetable.direction_id, timetable.serviceIds))
    .then(shapesToCoordinateArray)
    .then(coordinates => {
      timetable.shapes = coordinates;
    });
  }))
  .then(() => {
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

    return pug.renderFile(fileUtils.getTemplateFile(config), templateVars);
  })
  .then(html => {
    // Beautify HTML if setting is set
    if (!config.beautify) {
      return html;
    }

    return beautify(html, {indent_size: 2});
  })
  .then(html => (
    {
      html,
      stats
    }
  ));
};

exports.generateLogText = (agency, outputStats) => {
  return gtfs.getFeedInfo(agency.agency_key)
  .then(results => {
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
  });
};

exports.getTimetablePage = (agencyKey, timetablePageId) => {
  return gtfs.getTimetablesByAgency(agencyKey)
  .then(timetables => timetables.map(timetable => timetable.toObject()))
  .then(timetables => {
    // Check if there are any timetable pages
    return gtfs.getTimetablePage(agencyKey, timetablePageId)
    .then(result => {
      if (!timetables || !timetables.length) {
        // If no timetables, build the route and direction into a timetable
        const parts = timetablePageId.split('_');
        const directionId = parseInt(parts.pop(), 10);
        const routeId = parts.join('_');
        return gtfs.getRoutesById(agencyKey, routeId)
        .then(result => {
          if (!result) {
            throw new Error(`No route found for route_id=${routeId}`);
          }
          return gtfs.getDirectionsByRoute(agencyKey, routeId)
          .then(directions => {
            const direction = _.find(directions, direction => direction.direction_id === directionId);
            return convertRouteToTimetablePage(agencyKey, result, direction);
          });
        });
      } else if (!result) {
        // If no timetablepage, use timetable
        const timetable = _.find(timetables, {timetable_id: timetablePageId});
        return convertTimetableToTimetablePage(agencyKey, timetable);
      }

      const timetablePage = result.toObject();
      const selectedTimetables = _.filter(timetables, {timetable_page_id: timetablePageId});
      timetablePage.timetables = _.sortBy(selectedTimetables, 'timetable_sequence');
      return timetablePage;
    })
    .then(timetablePage => {
      return formatTimetablePage(agencyKey, timetablePage);
    });
  });
};

exports.getTimetablePages = agencyKey => {
  return gtfs.getTimetablesByAgency(agencyKey)
  .then(timetables => timetables.map(timetable => timetable.toObject()))
  .then(timetables => {
    // Check if there are any timetable pages
    return gtfs.getTimetablePagesByAgency(agencyKey)
    .then(timetablePages => {
      return timetablePages.map(timetablePage => timetablePage.toObject());
    })
    .then(timetablePages => {
      if (!timetables || timetables.length === 0) {
        // If no timetables, build each route and direction into a timetable
        return convertRoutesToTimetablePages(agencyKey);
      } else if (!timetablePages || timetablePages.length === 0) {
        // If no timetablepages, use timetables
        return Promise.all(timetables.map(timetable => {
          return convertTimetableToTimetablePage(agencyKey, timetable)
        }));
      }

      // Otherwise, use timetable pages provided
      return timetablePages.map(timetablePage => {
        const selectedTimetables = _.filter(timetables, {timetable_page_id: timetablePage.timetable_page_id});
        timetablePage.timetables = _.sortBy(selectedTimetables, 'timetable_sequence');
        return timetablePage;
      });
    })
    .then(timetablePages => {
      return Promise.all(timetablePages.map(timetablePage => {
        return formatTimetablePage(agencyKey, timetablePage);
      }));
    });
  });
};
