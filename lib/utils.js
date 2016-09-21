const _ = require('underscore');
const async = require('async');
const gtfs = require('gtfs');
const jade = require('jade');
const moment = require('moment');
const sanitize = require('sanitize-filename');

function formatDate(date) {
  return moment(date, 'YYYYMMDD').format('ddd, MMM D, YYYY');
}

function filterCalendarDates(dates, startDate, endDate) {
  const start = moment(startDate, 'YYYYMMDD');
  const end = moment(endDate, 'YYYYMMDD');

  return _.filter(dates, (date) => moment(date, 'YYYYMMDD').isBetween(start, end));
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

  for (let i = 0; i <= 6; i++) {
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
    return _.filter(stoptimes, (stoptime) => stoptime.timepoint !== 0);
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

function getSpecialDates(serviceIds, timetable, cb) {
  gtfs.getCalendarDatesByService(serviceIds, (err, calendarDates) => {
    if (err) return cb(err);

    calendarDates = _.groupBy(calendarDates, 'exception_type');
    const specialDates = {};
    specialDates.excludedDates = _.map(_.uniq(
      filterCalendarDates(_.pluck(calendarDates['2'], 'date'), timetable.start_date, timetable.end_date)
    ).sort(), formatDate);
    specialDates.includedDates = _.map(_.uniq(
      filterCalendarDates(_.pluck(calendarDates['1'], 'date'), timetable.start_date, timetable.end_date)
    ).sort(), formatDate);

    cb(null, specialDates);
  });
}

function processStops(agencyKey, stops, orderedTrips, route, options, cb) {
  if (!orderedTrips || !orderedTrips.length) {
    return cb(new Error('No trips found'));
  }

  // Convert stops to array of objects
  stops = _.map(_.sortBy(stops, (stop, stopSequence) => parseInt(stopSequence, 10)), (stop) => {
    return {
      stop_id: stop,
      trips: []
    };
  });

  options.showDayList = false;
  options.noServiceSymbolUsed = false;
  options.requestStopSymbolUsed = false;

  const dayList = orderedTrips[0].day_list;

  orderedTrips.forEach((trip) => {
    // See if any trips have a different dayList
    if (trip.day_list !== dayList) {
      options.showDayList = true;
    }

    // append route_short_name
    trip.route_short_name = route.route_short_name;

    let stopSequence = 0;
    stops.forEach((stop) => {
      // find a stoptime for the matching stop_id greater than the last stop_sequence
      const stoptime = _.find(trip.stoptimes, (st) => {
        return st.stop_id === stop.stop_id && st.stop_sequence >= stopSequence;
      });
      if (stoptime) {
        stopSequence = stoptime.stop_sequence;
      }
      stop.trips.push(formatStopTime(stoptime, options));
    });
  });

  gtfs.getStops(agencyKey, _.pluck(stops, 'stop_id'), (err, stopDatas) => {
    if (err) return cb(err);

    stops.forEach((stop) => {
      const stopData = _.findWhere(stopDatas, { stop_id: stop.stop_id });

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

    cb(null, stops);
  });
}

exports.generateFileName = (agencyKey, timetable, cb) => {
  gtfs.getRoutesById(agencyKey, timetable.route_id, (err, route) => {
    if (err) return cb(err);

    let routeName;

    if (route.route_short_name !== '' && route.route_short_name !== undefined) {
      routeName = route.route_short_name;
    } else {
      routeName = route.route_long_name;
    }

    let filename = `${timetable.timetable_id}_${routeName}`;

    if (timetable.direction_id !== null) {
      filename += `_${timetable.direction_id}`;
    }

    filename += `_${formatDays(timetable).toLowerCase()}.html`;

    const formattedFileName = sanitize(filename).replace(/\s/g, '');

    return cb(null, formattedFileName);
  });
};

exports.generateFolderName = (timetable) => sanitize(`${timetable.start_date}-${timetable.end_date}`);

exports.generateHTML = (agencyKey, timetableId, options, cb) => {
  // Set default symbols if not provded in config
  options.noServiceSymbol = options.noServiceSymbol || '—';
  options.requestStopSymbol = options.requestStopSymbol || '***';

  let timetable;
  let calendars;
  let serviceIds;
  let route;
  let trips;
  let stops = [];
  let orderedTrips;
  let processedStops;
  let specialDates;

  async.series([
    (cb) => {
      // Lookup timetables by ID
      gtfs.getTimetable(agencyKey, timetableId, (err, timetables) => {
        if (err) return cb(err);

        if (!timetables || !timetables.length) {
          return cb(new Error('No Timetable Found'));
        }

        timetable = timetables[0].toObject();
        timetable.day_list = formatDays(timetable);
        cb();
      });
    },
    (cb) => {
      // Lookup calendars
      gtfs.getCalendars(agencyKey, timetable.start_date, timetable.end_date, timetable.monday, timetable.tuesday, timetable.wednesday, timetable.thursday, timetable.friday, timetable.saturday, timetable.sunday, (err, results) => {
        if (err) return cb(err);

        calendars = formatCalendars(results);
        serviceIds = _.pluck(calendars, 'service_id');
        cb();
      });
    },
    (cb) => {
      // Get route
      gtfs.getRoutesById(agencyKey, timetable.route_id, (err, result) => {
        if (err) return cb(err);

        if (!result) {
          return cb(new Error('No route found'));
        }

        route = result;
        cb();
      });
    },
    (cb) => {
      // Get trips
      gtfs.getTripsByRouteAndDirection(agencyKey, timetable.route_id, timetable.direction_id, serviceIds, (err, results) => {
        if (err) return cb(err);

        if (!results || !results.length) {
          return cb(new Error('No trips found'));
        }

        trips = _.flatten(results, true);
        return cb();
      });
    },
    (cb) => {
      // Order trips
      gtfs.getTimetableStopOrders(agencyKey, timetable.timetable_id, (err, timetableStopOrders) => {
        if (err) return cb(err);

        async.map(trips, (item, cb) => {
          const trip = item.toObject();
          trip.calendar = _.findWhere(calendars, { service_id: trip.service_id });
          trip.day_list = formatDays(trip.calendar);

          gtfs.getStoptimesByTrip(agencyKey, trip.trip_id, (err, stoptimes) => {
            if (err) return cb(err);

            trip.stoptimes = filterStoptimes(stoptimes, options);

            if (timetableStopOrders && timetableStopOrders.length) {
              // use the stop_sequence from `timetable_stop_order.txt`
              stops = _.pluck(timetableStopOrders, 'stop_id');
            } else if (timetable.use_stop_sequence === 1) {
              // obey timetables.txt `use_stop_sequence`
              trip.stoptimes.forEach((item) => {
                const stoptime = item.toObject();
                stops[stoptime.stop_sequence] = stoptime.stop_id;
              });
            } else {
              if (!stops.length) {
                stops = _.pluck(trip.stoptimes, 'stop_id');
              } else {
                let index = 0;

                trip.stoptimes.forEach((item) => {
                  const stoptime = item.toObject();
                  const stopsLeft = stops.slice(index);

                  if (_.contains(stopsLeft, stoptime.stop_id)) {
                    index += stopsLeft.indexOf(stoptime.stop_id);
                  } else {
                    stops.splice(index, 0, stoptime.stop_id);
                  }
                  index += 1;
                });
              }
            }
            cb(null, trip);
          });
        }, (err, results) => {
          if (err) return cb(err);

          orderedTrips = _.sortBy(results, (trip) => {
            return moment(trip.stoptimes[0].departure_time, 'HH:mm:ss').format('X');
          });

          return cb();
        });
      });
    },
    (cb) => {
      // Process stops
      processStops(agencyKey, stops, orderedTrips, route, options, (err, results) => {
        if (err) return cb(err);

        processedStops = results;
        return cb();
      });
    },
    (cb) => {
      // Lookup special dates
      getSpecialDates(serviceIds, timetable, (err, results) => {
        if (err) return cb(err);

        specialDates = results;
        return cb();
      });
    }
  ], (err) => {
    if (err) return cb(err);

    // Finally, Render HTML
    const html = jade.renderFile('views/timetable.jade', {
      stops: processedStops,
      route,
      timetable,
      trips,
      calendars,
      options,
      specialDates,
      mapboxAccessToken: options.mapboxAccessToken || ''
    });

    cb(null, html);
  });
};


exports.generateLogText = (agency, cb) => {
  gtfs.getFeedInfo(agency.agency_key, (err, results) => {
    if (err) return cb(err);

    const feedVersion = results ? results.feed_version : 'Unknown';

    const logText = [
      `Feed Version: ${feedVersion}`,
      `Date Generated: ${new Date()}`
    ];

    if (agency.url) {
      logText.push(`Source: ${agency.url}`);
    } else if (agency.path) {
      logText.push(`Source: ${agency.path}`);
    }

    return cb(null, logText);
  });
};
