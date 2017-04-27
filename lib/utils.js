const fs = require('fs');
const path = require('path');

const _ = require('lodash');
const archiver = require('archiver');
const beautify = require('js-beautify').html_beautify;
const gtfs = require('gtfs');
const pug = require('pug');
const moment = require('moment');
const sanitize = require('sanitize-filename');

function formatDate(date) {
  if (date.holiday_name) {
    return date.holiday_name;
  }

  return moment(date.date, 'YYYYMMDD').format('MMM D, YYYY');
}

function filterAndSortCalendarDates(calendarDates, startDate, endDate) {
  if (!calendarDates) {
    return [];
  }

  const start = moment(startDate, 'YYYYMMDD');
  const end = moment(endDate, 'YYYYMMDD');

  const filteredDates = {};

  calendarDates.forEach(calendarDate => {
    if (moment(calendarDate.date, 'YYYYMMDD').isBetween(start, end)) {
      filteredDates[calendarDate.date] = calendarDate;
    }
  });

  return _.sortBy(filteredDates, 'date');
}

function parseTime(timeStr) {
  let hr = parseInt(timeStr.substr(0, timeStr.indexOf(':')), 10);

  // Decrement time past 23 hours so moment can parse it
  while (hr > 23) {
    hr -= 24;
  }

  timeStr = `${hr}:${timeStr.substr(timeStr.indexOf(':'))}`;
  return moment(timeStr, 'HH:mm:ss');
}

function formatStopTime(stoptime, options) {
  if (stoptime) {
    stoptime.classes = [];
  } else {
    stoptime = {
      classes: ['skipped'],
      arrival_formatted_time: options.noServiceSymbol,
      departure_formatted_time: options.noServiceSymbol,

    };
    options.noServiceSymbolUsed = true;
  }

  if (stoptime.departure_time === '') {
    stoptime.arrival_formatted_time = options.requestStopSymbol;
    stoptime.departure_formatted_time = options.requestStopSymbol;
    stoptime.classes.push('untimed');
    options.requestStopSymbolUsed = true;
  } else if (stoptime.pickup_type === 2 || stoptime.pickup_type === 3) {
    stoptime.arrival_formatted_time = options.requestStopSymbol;
    stoptime.departure_formatted_time = options.requestStopSymbol;
    stoptime.classes.push('request');
    stoptime.classes.push('untimed');
    options.requestStopSymbolUsed = true;
  } else if (stoptime.departure_time) {
    const departureTime = parseTime(stoptime.departure_time);
    const arrivalTime = parseTime(stoptime.arrival_time);
    stoptime.arrival_formatted_time = arrivalTime.format('h:mm');
    stoptime.arrival_formatted_period = arrivalTime.format('a');
    stoptime.departure_formatted_time = departureTime.format('h:mm');
    stoptime.departure_formatted_period = departureTime.format('a');
    stoptime.classes.push(arrivalTime.format('a'));
  }

  return stoptime;
}

function formatDays(calendar) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const daysShort = ['Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun'];
  let daysInARow = 0;
  let dayString = '';

  if (!calendar) {
    return '';
  }

  for (let i = 0; i <= 6; i += 1) {
    const currentDayOperating = (calendar[days[i]] === 1);
    const previousDayOperating = (i > 0) ? (calendar[days[i - 1]] === 1) : false;
    const nextDayOperating = (i < 6) ? (calendar[days[i + 1]] === 1) : false;

    if (currentDayOperating) {
      if (dayString.length > 0) {
        if (!previousDayOperating) {
          dayString += ', ';
        } else if (daysInARow === 1) {
          dayString += '-';
        }
      }

      daysInARow += 1;

      if (dayString.length === 0 || !nextDayOperating || i === 6 || !previousDayOperating) {
        dayString += daysShort[i];
      }
    } else {
      daysInARow = 0;
    }
  }

  if (dayString.length === 0) {
    dayString = 'No regular service days';
  }

  return dayString;
}

function filterStoptimes(stoptimes, options) {
  // handle `showOnlyTimepoint` config option
  if (options.showOnlyTimepoint) {
    return _.filter(stoptimes, stoptime => {
      return stoptime.arrival_time !== '' && stoptime.departure_time !== '';
    });
  }

  return stoptimes;
}

function formatCalendars(calendars) {
  return calendars.map(item => {
    const calendar = item.toObject();
    calendar.day_list = formatDays(calendar);
    return calendar;
  });
}

function getSpecialDates(timetable) {
  return gtfs.getCalendarDatesByService(timetable.serviceIds).then(results => {
    const calendarDates = _.groupBy(results, 'exception_type');
    return {
      excludedDates: filterAndSortCalendarDates(calendarDates['2'], timetable.start_date, timetable.end_date).map(formatDate),
      includedDates: filterAndSortCalendarDates(calendarDates['1'], timetable.start_date, timetable.end_date).map(formatDate)
    };
  });
}

function processStops(agencyKey, timetable, options) {
  options.showDayList = false;
  options.noServiceSymbolUsed = false;
  options.requestStopSymbolUsed = false;

  const dayList = timetable.orderedTrips[0].day_list;

  timetable.orderedTrips.forEach(trip => {
    // See if any trips have a different dayList
    if (trip.day_list !== dayList) {
      options.showDayList = true;
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
      stop.trips.push(formatStopTime(stoptime, options));
    });
  });

  const stopIds = _.map(timetable.stops, 'stop_id');

  return gtfs.getStops(agencyKey, stopIds).then(stopDatas => {
    timetable.stops.forEach(stop => {
      const stopData = _.find(stopDatas, {stop_id: stop.stop_id});

      _.extend(stop, _.pick(stopData, ['stop_name', 'stop_code', 'stop_lat', 'stop_lon']));
    });
  }).then(() => {
    // If showStopCity is true, look up stop attributes.
    if (options.showStopCity) {
      return gtfs.getStopAttributes(agencyKey, stopIds).then(stopAttributes => {
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

function getRouteName(route) {
  if (route.route_short_name !== '' && route.route_short_name !== undefined) {
    return route.route_short_name;
  }
  return route.route_long_name;
}

function generateFileName(agencyKey, timetable) {
  return gtfs.getRoutesById(agencyKey, timetable.route_id).then(route => {
    if (!route) {
      throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
    }

    const routeName = getRouteName(route);
    let filename = `${timetable.timetable_id}_${routeName}_`;

    if (timetable.direction_id !== null) {
      filename += `${timetable.direction_id}_`;
    }

    filename += `${formatDays(timetable).toLowerCase()}.html`;

    return sanitize(filename).replace(/\s/g, '');
  });
}

function convertRouteToTimetable(route, direction) {
  return {
    timetable_id: `${route.route_id}_${direction.direction_id}`,
    timetable_label: `${getRouteName(route)} ${direction.trip_headsign}`,
    route_id: route.route_id,
    direction_id: direction.direction_id,
    start_date: parseInt(moment().format('YYYYMMDD'), 10),
    end_date: parseInt(moment().add(1, 'day').format('YYYYMMDD'), 10),
    monday: 1,
    tuesday: 1,
    wednesday: 1,
    thursday: 1,
    friday: 1,
    saturday: 1,
    sunday: 1
  };
}

function convertTimetableToTimetablePage(agencyKey, timetable) {
  return generateFileName(agencyKey, timetable).then(filename => (
    {
      timetable_page_id: timetable.timetable_id,
      timetable_page_label: timetable.timetable_label,
      timetables: [timetable],
      filename
    }
  ));
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

exports.generateFolderName = timetablePage => {
  // Use first timetable in timetable page for start date and end date
  const timetable = timetablePage.timetables[0];
  return sanitize(`${timetable.start_date}-${timetable.end_date}`);
};

exports.generateHTML = (agencyKey, timetablePage, options) => {
  const stats = {
    stops: 0,
    trips: 0,
    routeIds: {},
    serviceIds: {}
  };

  // Set default symbols if not provded in config
  options.noServiceSymbol = options.noServiceSymbol || '—';
  options.requestStopSymbol = options.requestStopSymbol || '***';

  // Format Timetables
  return Promise.all(timetablePage.timetables.map((timetable) => {
    // Only get first day of week that matches timetable
    const queryDay = getCalendarQueryDay(timetable);
    return gtfs.getCalendars(agencyKey, timetable.start_date, timetable.end_date, queryDay.monday, queryDay.tuesday, queryDay.wednesday, queryDay.thursday, queryDay.friday, queryDay.saturday, queryDay.sunday)
    .then(calendars => {
      if (!calendars.length) {
        throw new Error(`No calendars found for start_date=${timetable.start_date}, end_date=${timetable.end_date}, timetable_id=${timetable.timetable_id}`);
      }
      // Get Calendars
      timetable.calendars = formatCalendars(calendars);
      timetable.serviceIds = _.map(timetable.calendars, 'service_id');
      timetable.serviceIds.forEach(service_id => {
        stats.serviceIds[service_id] = true;
      });
    })
    .then(() => {
      stats.routeIds[timetable.route_id] = true;

      timetable.day_list = formatDays(timetable);
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
      return Promise.all(timetable.trips.map(item => {
        const trip = item.toObject();
        trip.calendar = _.find(timetable.calendars, {service_id: trip.service_id});
        trip.day_list = formatDays(trip.calendar);

        return gtfs.getStoptimesByTrip(agencyKey, trip.trip_id)
        .then(stoptimes => {
          trip.stoptimes = filterStoptimes(stoptimes, options);
          timetable.stops = getStops(timetableStopOrders, trip.stoptimes);

          stats.stops += timetable.stops.length;

          return trip;
        });
      }));
    })
    .then(trips => {
      if (!trips || trips.length === 0) {
        throw new Error(`No trips found for timetable_id=${timetable.timetable_id}`);
      }

      timetable.orderedTrips = _.sortBy(trips, trip => moment(trip.stoptimes[0].departure_time, 'HH:mm:ss').format('X'));
    })
    .then(() => processStops(agencyKey, timetable, options))
    .then(() => {
      timetable.stopsForMap = processStopsForMap(timetable);
    })
    .then(() => getSpecialDates(timetable))
    .then(specialDates => {
      timetable.specialDates = specialDates;
    })
    .then(() => gtfs.getShapesByRoute(agencyKey, timetable.route_id, timetable.direction_id, timetable.serviceIds))
    .then(shapes => {
      if (shapes) {
        timetable.shapes = _.map(shapes, shape => _.map(shape, p => [p.shape_pt_lon, p.shape_pt_lat]));
      } else {
        timetable.shapes = null;
      }
    })
    .then(() => {
      // Set a timetable label if not set in timetables.txt
      if (!timetable.timetable_label) {
        timetable.timetable_label = `${_.first(timetable.stops).stop_name} to ${_.last(timetable.stops).stop_name} - ${timetable.day_list}`;
      }
    });
  }))
  .then(() => {
    stats.routes = _.size(stats.routeIds);
    stats.calendars = _.size(stats.serviceIds);
  })
  .then(() => {
    // Finally, Render HTML
    const template = (!options || !options.noHead) ? 'timetablepage_full.pug' : 'timetablepage.pug';
    const templateFile = path.join(__dirname, '..', 'views', template);
    const templateVars = {
      timetablePage,
      options
    };
    return pug.renderFile(templateFile, templateVars);
  })
  .then(html => {
    if (options.beautify) {
      return beautify(html, {indent_size: 2});
    }

    return html;
  })
  .then(html => {
    return {
      html,
      stats
    };
  });
};

exports.generateLogText = (agency, outputStats) => {
  return gtfs.getFeedInfo(agency.agency_key).then(results => {
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
  return gtfs.getTimetablesByAgency(agencyKey).then(timetables => {
    return timetables.map(timetable => timetable.toObject());
  }).then(timetables => {
    // Check if there are any timetable pages
    return gtfs.getTimetablePage(agencyKey, timetablePageId).then(result => {
      if (!timetables || !timetables.length) {
        // If no timetables, build the route and direction into a timetable
        const parts = timetablePageId.split('_');
        const directionId = parseInt(parts.pop(), 10);
        const routeId = parts.join('_');
        return gtfs.getRoutesById(agencyKey, routeId).then(result => {
          if (!result) {
            throw new Error(`No route found for route_id=${routeId}`);
          }
          return gtfs.getDirectionsByRoute(agencyKey, routeId).then(directions => {
            const direction = _.find(directions, direction => direction.direction_id === directionId);
            return convertTimetableToTimetablePage(agencyKey, convertRouteToTimetable(result, direction));
          });
        });
      } else if (!result) {
        // If no timetablepage, use timetable
        const timetable = _.find(timetables, {timetable_id: timetablePageId});
        return convertTimetableToTimetablePage(agencyKey, timetable);
      }

      const timetablePage = result.toObject();
      timetablePage.timetables = _.sortBy(_.filter(timetables, {timetable_page_id: timetablePageId}), 'timetable_sequence');
      return timetablePage;
    });
  });
};

exports.getTimetablePages = agencyKey => {
  return gtfs.getTimetablesByAgency(agencyKey).then(timetables => {
    return timetables.map(timetable => timetable.toObject());
  }).then(timetables => {
    // Check if there are any timetable pages
    return gtfs.getTimetablePagesByAgency(agencyKey).then(timetablePages => {
      return timetablePages.map(timetablePage => timetablePage.toObject());
    }).then(timetablePages => {
      if (!timetables || timetables.length === 0) {
        // If no timetables, build each route and direction into a timetable
        return gtfs.getRoutesByAgency(agencyKey).then(routes => {
          return Promise.all(routes.map(route => {
            return gtfs.getDirectionsByRoute(agencyKey, route.route_id).then(results => {
              const directionGroups = _.groupBy(results, direction => direction.direction_id);
              return Promise.all(_.map(directionGroups, directionGroup => {
                const direction = directionGroup[0];
                return gtfs.getTripsByRouteAndDirection(agencyKey, route.route_id, direction.direction_id).then(trips => {
                  if (trips && trips.length > 0) {
                    return convertTimetableToTimetablePage(agencyKey, convertRouteToTimetable(route, direction));
                  }
                });
              }));
            });
          }));
        }).then(timetablePages => _.compact(_.flatten(timetablePages)));
      } else if (!timetablePages || timetablePages.length === 0) {
        // If no timetablepages, use timetables
        return Promise.all(timetables.map(timetable => convertTimetableToTimetablePage(agencyKey, timetable)));
      }

      // Use timetable pages
      timetablePages.forEach(timetablePage => {
        const selectedTimetables = _.filter(timetables, {timetable_page_id: timetablePage.timetable_page_id});
        timetablePage.timetables = _.sortBy(selectedTimetables, 'timetable_sequence');
      });
      return timetablePages;
    });
  });
};

exports.zipFolder = exportPath => {
  const output = fs.createWriteStream(path.join(exportPath, 'timetables.zip'));
  const archive = archiver('zip');

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob(`${exportPath}/**/*.{txt,css,html}`);
    archive.finalize();
  });
};
