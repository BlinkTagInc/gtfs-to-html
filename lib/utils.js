const _ = require('lodash');
const archiver = require('archiver');
const async = require('async');
const fs = require('fs');
const gtfs = require('gtfs');
const path = require('path');
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

  calendarDates.forEach((calendarDate) => {
    if (moment(calendarDate.date, 'YYYYMMDD').isBetween(start, end)) {
      filteredDates[calendarDate.date] = calendarDate;
    }
  });

  return _.sortBy(filteredDates, 'date');
}

function formatStopTime(stoptime, options) {
  if (!stoptime) {
    stoptime = {
      classes: ['skipped'],
      formatted_time: options.noServiceSymbol
    };
    options.noServiceSymbolUsed = true;
  } else {
    stoptime.classes = [];
  }

  if (stoptime.departure_time === '') {
    stoptime.formatted_time = options.requestStopSymbol;
    stoptime.classes.push('untimed');
    options.requestStopSymbolUsed = true;
  } else if (stoptime.pickup_type === 2 || stoptime.pickup_type === 3) {
    stoptime.formatted_time = options.requestStopSymbol;
    stoptime.classes.push('request');
    stoptime.classes.push('untimed');
    options.requestStopSymbolUsed = true;
  } else if (stoptime.departure_time) {
    let timeStr = stoptime.departure_time;
    let hr = parseInt(timeStr.substr(0, timeStr.indexOf(':')), 10);

    // Decrement time past 23 hours so moment can parse it
    while (hr > 23) {
      hr -= 24;
    }

    timeStr = `${hr}:${timeStr.substr(timeStr.indexOf(':'))}`;
    const time = moment(timeStr, 'HH:mm:ss');
    stoptime.formatted_time = time.format('h:mm');
    stoptime.formatted_period = time.format('A');
    stoptime.classes.push(time.format('a'));
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
      if (dayString.length) {
        if (!previousDayOperating) {
          dayString += ', ';
        } else if (daysInARow === 1) {
          dayString += '-';
        }
      }

      daysInARow += 1;

      if (!dayString.length || !nextDayOperating || i === 6 || !previousDayOperating) {
        dayString += daysShort[i];
      }
    } else {
      daysInARow = 0;
    }
  }

  if (!dayString.length) {
    dayString = 'No regular service days';
  }

  return dayString;
}

function filterStoptimes(stoptimes, options) {
  // handle `showOnlyTimepoint` config option
  if (options.showOnlyTimepoint) {
    return _.filter(stoptimes, (stoptime) => {
      return stoptime.arrival_time !== '' && stoptime.departure_time !== '';
    });
  }

  return stoptimes;
}

function formatCalendars(calendars) {
  return calendars.map((item) => {
    const calendar = item.toObject();
    calendar.day_list = formatDays(calendar);
    return calendar;
  });
}

function getSpecialDates(timetable) {
  return gtfs.getCalendarDatesByService(timetable.serviceIds).then((results) => {
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

  timetable.orderedTrips.forEach((trip) => {
    // See if any trips have a different dayList
    if (trip.day_list !== dayList) {
      options.showDayList = true;
    }

    // append route_short_name
    trip.route_short_name = timetable.route.route_short_name;

    let stopSequence = 0;
    timetable.stops.forEach((stop) => {
      // find a stoptime for the matching stop_id greater than the last stop_sequence
      const stoptime = _.find(trip.stoptimes, st => st.stop_id === stop.stop_id && st.stop_sequence >= stopSequence);
      if (stoptime) {
        stopSequence = stoptime.stop_sequence;
      }
      stop.trips.push(formatStopTime(stoptime, options));
    });
  });

  const stopIds = _.map(timetable.stops, 'stop_id');

  return gtfs.getStops(agencyKey, stopIds).then((stopDatas) => {
    timetable.stops.forEach((stop) => {
      const stopData = _.find(stopDatas, { stop_id: stop.stop_id });

      _.extend(stop, {
        stop_timezone: stopData.stop_timezone,
        stop_name: stopData.stop_name,
        stop_code: stopData.stop_code,
        stop_lat: stopData.stop_lat,
        stop_lon: stopData.stop_lon,
        stop_times: _.reduce(stop.trips, (memo, trip) => {
          if (trip.departure_time) {
            memo.push(moment(trip.departure_time, 'HH:mm:ss').format('h:mm A'));
          }
          return memo;
        }, [])
      });
    });
  }).then(() => {
    // If showStopCity is true, look up stop attributes.
    if (options.showStopCity) {
      return gtfs.getStopAttributes(agencyKey, stopIds).then((stopAttributes) => {
        timetable.stops.forEach((stop) => {
          const stopAttribute = _.find(stopAttributes, { stop_id: stop.stop_id });
          stop.stop_city = stopAttribute.stop_city;
        });
      });
    }
  });
}

function processStopsForMap(timetable) {
  const keys = ['stop_name', 'stop_times', 'stop_lat', 'stop_lon'];
  return timetable.stops.map(stop => _.pick(stop, keys));
}


function getRouteName(route) {
  if (route.route_short_name !== '' && route.route_short_name !== undefined) {
    return route.route_short_name;
  }
  return route.route_long_name;
}


function generateFileName(agencyKey, timetable) {
  return gtfs.getRoutesById(agencyKey, timetable.route_id).then((route) => {
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
    route_label: `${getRouteName(route)} ${direction.trip_headsign}`,
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
  return generateFileName(agencyKey, timetable).then((filename) => (
    {
      timetable_page_id: timetable.timetable_id,
      route_label: timetable.route_label,
      timetables: [timetable],
      filename
    }
  ));
}

exports.generateFolderName = (timetablePage) => {
  // Use first timetable in timetable page for start date and end date
  const timetable = timetablePage.timetables[0];
  return sanitize(`${timetable.start_date}-${timetable.end_date}`);
};

exports.generateHTML = (agencyKey, timetablePage, options, cb) => {
  const stats = {
    stops: 0,
    trips: 0,
    routeIds: {},
    serviceIds: {}
  };

  // Set default symbols if not provded in config
  options.noServiceSymbol = options.noServiceSymbol || '—';
  options.requestStopSymbol = options.requestStopSymbol || '***';

  async.each(timetablePage.timetables, (timetable, cb) => {
    stats.routeIds[timetable.route_id] = true;

    // Format TimetablePage
    timetable.day_list = formatDays(timetable);

    async.series([
      (cb) => {
        // Lookup calendars
        gtfs.getCalendars(agencyKey, timetable.start_date, timetable.end_date, timetable.monday, timetable.tuesday, timetable.wednesday, timetable.thursday, timetable.friday, timetable.saturday, timetable.sunday).then((results) => {
          if (!results.length) {
            throw new Error(`No calendars found for start_date=${timetable.start_date}, end_date=${timetable.end_date}, timetable_id=${timetable.timetable_id}`);
          }
          timetable.calendars = formatCalendars(results);
          timetable.serviceIds = _.map(timetable.calendars, 'service_id');
          timetable.serviceIds.forEach((service_id) => {
            stats.serviceIds[service_id] = true;
          });

          cb();
        }, cb);
      },
      (cb) => {
        // Get route
        gtfs.getRoutesById(agencyKey, timetable.route_id).then((result) => {
          if (!result) {
            throw new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`);
          }

          timetable.route = result;
          cb();
        }, cb);
      },
      (cb) => {
        // Get trips
        gtfs.getTripsByRouteAndDirection(agencyKey, timetable.route_id, timetable.direction_id, timetable.serviceIds).then((results) => {
          if (!results || !results.length) {
            throw new Error(`No trips found for route_id=${timetable.route_id}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.serviceIds)}, timetable_id=${timetable.timetable_id}`);
          }

          timetable.trips = _.flatten(results, true);
          stats.trips += timetable.trips.length;

          cb();
        }).catch(cb);
      },
      (cb) => {
        // Order trips
        gtfs.getTimetableStopOrders(agencyKey, timetable.timetable_id).then((timetableStopOrders) => {
          async.map(timetable.trips, (item, cb) => {
            const trip = item.toObject();
            trip.calendar = _.find(timetable.calendars, { service_id: trip.service_id });
            trip.day_list = formatDays(trip.calendar);

            gtfs.getStoptimesByTrip(agencyKey, trip.trip_id).then((stoptimes) => {
              trip.stoptimes = filterStoptimes(stoptimes, options);

              let stops;

              if (timetableStopOrders && timetableStopOrders.length) {
                // use the stop_sequence from `timetable_stop_order.txt`
                stops = _.map(timetableStopOrders, 'stop_id');
              } else {
                stops = [];
                trip.stoptimes.forEach((item) => {
                  const stoptime = item.toObject();
                  stops[stoptime.stop_sequence] = stoptime.stop_id;
                });
                stops = _.compact(stops);
              }

              // Convert stops to array of objects
              timetable.stops = stops.map((stop) => {
                return {
                  stop_id: stop,
                  trips: []
                };
              });

              stats.stops += timetable.stops.length;

              cb(null, trip);
            }, cb);
          }, (err, results) => {
            if (err) return cb(err);

            if (!results || !results.length) {
              throw new Error(`No trips found for timetable_id=${timetable.timetable_id}`);
            }

            timetable.orderedTrips = _.sortBy(results, trip => moment(trip.stoptimes[0].departure_time, 'HH:mm:ss').format('X'));

            return cb();
          });
        }, cb).catch(cb);
      },
      (cb) => {
        // Process stops
        processStops(agencyKey, timetable, options).then(() => {
          cb();
        }, cb);
      },
      (cb) => {
        timetable.stopsForMap = processStopsForMap(timetable);
        cb();
      },
      (cb) => {
        // Lookup special dates
        getSpecialDates(timetable).then((specialDates) => {
          timetable.specialDates = specialDates;
          cb();
        }, cb);
      },
      (cb) => {
        // Lookup shapes
        gtfs.getShapesByRoute(agencyKey, timetable.route_id, timetable.direction_id, timetable.serviceIds).then((results) => {
          if (!results) {
            timetable.shapes = null;
            return cb();
          }

          timetable.shapes = _.map(results, shape => _.map(shape, p => [p.shape_pt_lat, p.shape_pt_lon]));
          cb();
        }, cb);
      }
    ], cb);
  }, (err) => {
    if (err) return cb(err);

    // Finally, Render HTML
    const template = (!options || !options.nohead) ? 'timetablepage_full.pug' : 'timetablepage.pug';
    const html = pug.renderFile(path.join(__dirname, '..', 'views', template), {
      timetablePage,
      options
    });

    stats.routes = _.size(stats.routeIds);
    stats.calendars = _.size(stats.serviceIds);

    return cb(null, html, stats);
  });
};


exports.generateLogText = (agency, outputStats) => {
  return gtfs.getFeedInfo(agency.agency_key).then((results) => {
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
  return gtfs.getTimetablesByAgency(agencyKey).then((results) => {
    const timetables = results.map(timetable => timetable.toObject());
    // Check if there are any timetable pages
    return gtfs.getTimetablePage(agencyKey, timetablePageId).then((result) => {
      if (!timetables || !timetables.length) {
        // If no timetables, build the route and direction into a timetable
        const parts = timetablePageId.split('_');
        const directionId = parseInt(parts.pop(), 10);
        const routeId = parts.join('_');
        return gtfs.getRoutesById(agencyKey, routeId).then((result) => {
          if (!result) {
            throw new Error(`No route found for route_id=${routeId}`);
          }
          return gtfs.getDirectionsByRoute(agencyKey, routeId).then((directions) => {
            const direction = _.find(directions, (direction) => direction.direction_id = directionId);
            return convertTimetableToTimetablePage(agencyKey, convertRouteToTimetable(result, direction));
          });
        });
      } else if (!result) {
        // If no timetablepage, use timetable
        const timetable = _.find(timetables, { timetable_id: timetablePageId });
        return convertTimetableToTimetablePage(agencyKey, timetable)
      } else {
        const timetablePage = result.toObject();
        timetablePage.timetables = _.filter(timetables, { timetable_page_id: timetablePageId });
        return timetablePage;
      }
    });
  });
};

exports.getTimetablePages = (agencyKey) => {
  return gtfs.getTimetablesByAgency(agencyKey).then((results) => {
    const timetables = results.map(timetable => timetable.toObject());
    // Check if there are any timetable pages
    return gtfs.getTimetablePagesByAgency(agencyKey).then((results) => {
      const timetablePages = results.map(timetablePage => timetablePage.toObject());

      if (!timetables || !timetables.length) {
        // If no timetables, build each route and direction into a timetable
        return gtfs.getRoutesByAgency(agencyKey).then((routes) => {
          return Promise.all(routes.map((route) => {
            return gtfs.getDirectionsByRoute(agencyKey, route.route_id).then((results) => {
              const directionGroups = _.groupBy(results, (direction) => direction.direction_id);
              return Promise.all(_.map(directionGroups, (directionGroup) => {
                const direction = directionGroup[0];
                return gtfs.getTripsByRouteAndDirection(agencyKey, route.route_id, direction.direction_id).then((trips) => {
                  if (trips && trips.length) {
                    return convertTimetableToTimetablePage(agencyKey, convertRouteToTimetable(route, direction));
                  }
                });
              }));
            });
          }));
        }).then((timetablePages) => {
          return _.compact(_.flatten(timetablePages));
        })
      } else if (!timetablePages || !timetablePages.length) {
        // If no timetablepages, use timetables
        return Promise.all(timetables.map((timetable) => convertTimetableToTimetablePage(agencyKey, timetable)));
      } else {
        // Use timetable pages
        timetablePages.forEach((timetablePage) => {
          const selectedTimetables = _.filter(timetables, { timetable_page_id: timetablePage.timetable_page_id });
          timetablePage.timetables = _.sortBy(selectedTimetables, 'timetable_sequence');
        });
        return timetablePages;
      }
    });
  });
};

exports.zipFolder = (exportPath) => {
  const output = fs.createWriteStream(path.join(exportPath, 'gtfs.zip'));
  const archive = archiver('zip');

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob(`${exportPath}/**/*.{txt,css,html}`);
    archive.finalize();
  });
};
