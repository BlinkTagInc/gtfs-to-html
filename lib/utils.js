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

function formatFileName(filename) {
  return `${sanitize(filename).replace(/\s/g, '')}.html`;
}

exports.generateFilename = function generateFilename(agencyKey, timetable, cb) {
  gtfs.getRoutesById(agencyKey, timetable.route_id, (err, route) => {
    let filename = `${route.route_short_name}`;
    if (timetable.direction_id !== null) {
      filename += `_${timetable.direction_id}`;
    }
    filename += `_${formatDays(timetable).toLowerCase()}`;

    cb(null, formatFileName(filename));
  });
};


exports.generateHTML = function generateHTML(agencyKey, timetableId, options, cb) {
  // Set default symbols if not provded in config
  options.noServiceSymbol = options.noServiceSymbol || '—';
  options.requestStopSymbol = options.requestStopSymbol || '***';

  gtfs.getTimetable(agencyKey, timetableId, (err, timetables) => {
    if (err) return cb(err);

    if (!timetables || !timetables.length) {
      return cb(new Error('No Timetable Found'));
    }

    const timetable = timetables[0].toObject();
    const startDate = timetable.start_date;
    const endDate = timetable.end_date;

    timetable.day_list = formatDays(timetable);

    gtfs.getCalendars(agencyKey, startDate, endDate, timetable.monday, timetable.tuesday, timetable.wednesday, timetable.thursday, timetable.friday, timetable.saturday, timetable.sunday, (err, calendars) => {
      if (err) return cb(err);

      calendars = calendars.map((item) => {
        const calendar = item.toObject();
        calendar.day_list = formatDays(calendar);
        return calendar;
      });

      const serviceIds = _.pluck(calendars, 'service_id');
      let stops = [];
      const routes = [];

      function processRoutes(e, routeTrips) {
        if (e) return cb(e);

        if (!routeTrips || !routeTrips.length) {
          return cb(new Error('No trips found'));
        }

        const trips = _.flatten(routeTrips, true);

        function processStops(e, trips) {
          if (e) return cb(e);

          // Convert stops to array of objects
          stops = _.map(_.sortBy(stops, (stop, stopSequence) => {
            return parseInt(stopSequence, 10);
          }), (stop) => {
            return {
              stop_id: stop,
              trips: []
            };
          });

          if (!trips || !trips.length) {
            return cb(new Error('No trips found'));
          }

          options.showDayList = false;
          options.noServiceSymbolUsed = false;
          options.requestStopSymbolUsed = false;

          trips = _.sortBy(trips, (trip) => {
            return moment(trip.stoptimes[0].departure_time, 'HH:mm:ss').format('X');
          });

          const dayList = trips[0].day_list;

          trips.forEach((trip) => {
            // See if any trips have a different dayList
            if (trip.day_list !== dayList) {
              options.showDayList = true;
            }

            // append route_short_name
            trip.route_short_name = _.findWhere(routes, { route_id: trip.route_id }).route_short_name;

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

          gtfs.getStops(agencyKey, _.pluck(stops, 'stop_id'), (e, stopDatas) => {
            if (e) return cb(e);

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

            gtfs.getCalendarDatesByService(serviceIds, (e, calendarDates) => {
              if (e) return cb(e);

              calendarDates = _.groupBy(calendarDates, 'exception_type');
              const excludedDates = _.uniq(
                filterCalendarDates(_.pluck(calendarDates['2'], 'date'), timetable.start_date, timetable.end_date)
              ).sort();
              const includedDates = _.uniq(
                filterCalendarDates(_.pluck(calendarDates['1'], 'date'), timetable.start_date, timetable.end_date)
              ).sort();

              cb(null, jade.renderFile('views/timetable.jade', {
                stops,
                routes,
                timetable,
                trips,
                calendars,
                options,
                excludedDates: _.map(excludedDates, formatDate),
                includedDates: _.map(includedDates, formatDate)
              }));
            });
          });
        }

        gtfs.getTimetableStopOrders(agencyKey, timetable.timetable_id, (e, timetableStopOrders) => {
          if (e) return cb(e);

          async.map(trips, (item, cb) => {
            const trip = item.toObject();
            trip.calendar = _.findWhere(calendars, { service_id: trip.service_id });
            trip.day_list = formatDays(trip.calendar);

            gtfs.getStoptimesByTrip(agencyKey, trip.trip_id, (e, stoptimes) => {
              if (e) return cb(e);

              // handle `showOnlyTimepoint` config option
              if (options.showOnlyTimepoint) {
                trip.stoptimes = _.filter(stoptimes, (stoptime) => stoptime.timepoint !== 0);
              } else {
                trip.stoptimes = stoptimes;
              }

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
          }, processStops);
        });
      }

      async.map(timetables, (timetable, cb) => {
        gtfs.getRoutesById(agencyKey, timetable.route_id, (e, route) => {
          if (e) return cb(e);

          if (!route) {
            return cb(new Error('No route found'));
          }

          routes.push(route);

          gtfs.getTripsByRouteAndDirection(agencyKey, timetable.route_id, timetable.direction_id, serviceIds, cb);
        });
      }, processRoutes);
    });
  });
};
