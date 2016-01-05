var _ = require('underscore');
var async = require('async');
var gtfs = require('gtfs');
var jade = require('jade');
var moment = require('moment');
var sanitize = require("sanitize-filename");


function formatDate(date) {
  return moment(date, 'YYYYMMDD').format('ddd, MMM D, YYYY');
}


function filterCalendarDates(dates, start_date, end_date) {
  start_date = moment(start_date, 'YYYYMMDD');
  end_date = moment(end_date, 'YYYYMMDD');

  return _.filter(dates, function(date) {
    return moment(date, 'YYYYMMDD').isBetween(start_date, end_date);
  });
}


function formatStopTime(stoptime, options) {
  if(!stoptime) {
    stoptime = {
      classes: ['skipped'],
      formatted_time: options.noServiceSymbol
    };
    options.noServiceSymbolUsed = true;
  } else {
    stoptime.classes = [];
  }

  if(stoptime.departure_time === '') {
    stoptime.formatted_time = options.requestStopSymbol;
    stoptime.classes.push('untimed');
    options.requestStopSymbolUsed = true;
  } else if(stoptime.pickup_type === 2 || stoptime.pickup_type === 3) {
    stoptime.formatted_time = options.requestStopSymbol;
    stoptime.classes.push('request');
    stoptime.classes.push('untimed');
    options.requestStopSymbolUsed = true;
  } else if(stoptime.departure_time) {
    var time = moment(stoptime.departure_time, 'HH:mm:ss');
    stoptime.formatted_time = time.format('h:mm');
    stoptime.formatted_period = time.format('A');
    stoptime.classes.push(time.format('a'));
  }

  return stoptime;
}


function formatDays(calendar) {
  var days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var daysShort = ['Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun'];
  var daysInARow = 0;
  var dayString = '';

  if(!calendar) {
    return '';
  }

  for(var i = 0; i <=6; i++) {
    var currentDayOperating = (calendar[days[i]] === 1);
    var previousDayOperating = (i > 0) ? (calendar[days[i - 1]] === 1) : false;
    var nextDayOperating = (i < 6) ? (calendar[days[i + 1]] === 1) : false;

    if(currentDayOperating) {
      if(dayString.length) {
        if(!previousDayOperating) {
          dayString += ', ';
        } else if(daysInARow === 1) {
          dayString += '-';
        }
      }

      daysInARow += 1;

      if(!dayString.length || !nextDayOperating || i === 6 || !previousDayOperating) {
        dayString += daysShort[i];
      }
    } else {
      daysInARow = 0;
    }
  }

  if(!dayString.length) {
    dayString = 'No regular service days';
  }

  return dayString;
}


exports.generateFilename = function(agencyKey, timetable, cb) {
  var filename = '';
  if(timetable.timetable_file_name) {
    returnFileName(timetable.timetable_file_name);
  } else if(timetable.route_label) {
    filename += timetable.timetable_id + '_' + timetable.route_label + '_' + timetable.service_notes;
    if(timetable.direction_id !== null) {
      filename += '_' + timetable.direction_id;
    }
    returnFileName(filename);
  } else {
    gtfs.getRoutesById(agencyKey, timetable.route_id, function(e, route) {
      filename += route.route_short_name + '_' + timetable.service_notes;
      if(timetable.direction_id !== null) {
        filename += '_' + timetable.direction_id;
      }
      returnFileName(filename);
    });
  }

  function returnFileName(filename) {
    cb(null, sanitize(filename).replace(/\s/g, '') + '.html');
  }
};


exports.generateHTML = function(agencyKey, timetableId, options, cb) {
  // Set default symbols if not provded in config
  options.noServiceSymbol = options.noServiceSymbol || '—';
  options.requestStopSymbol = options.requestStopSymbol || '***';

  gtfs.getTimetable(agencyKey, timetableId, function(e, timetable) {
    if(e) return cb(e);
    if(!timetable) return cb(new Error('No Timetable Found'));

    timetable = timetable.toObject();

    var routeId = timetable.route_id;
    var directionId = timetable.direction_id;
    var startDate = timetable.start_date;
    var endDate = timetable.end_date;

    timetable.day_list = formatDays(timetable);

    gtfs.getRoutesById(agencyKey, routeId, function(e, route) {
      if(e) return cb(e);

      if(!route) {
        return cb(new Error('No route found'));
      }

      gtfs.getCalendars(agencyKey, startDate, endDate, timetable.monday, timetable.tuesday, timetable.wednesday, timetable.thursday, timetable.friday, timetable.saturday, timetable.sunday, function(e, calendars) {
        if(e) return cb(e);

        calendars = calendars.map(function(item) {
          var calendar = item.toObject();
          calendar.day_list = formatDays(calendar);
          return calendar;
        });

        var serviceIds;

        if(timetable.service_id) {
          serviceIds = [timetable.service_id];
        } else {
          serviceIds = _.pluck(calendars, 'service_id');
        }

        gtfs.getTripsByRouteAndDirection(agencyKey, routeId, directionId, serviceIds, function(e, trips) {
          if(e) return cb(e);

          var stops = {};

          function processStops(e, trips) {
            if(e) return cb(e);

            //Convert stops to array of objects
            stops = _.map(_.sortBy(stops, function(stop, stopSequence) {
              return parseInt(stopSequence, 10);
            }), function(stop) {
              return {
                stop_id: stop,
                trips: []
              };
            });

            if(!trips || !trips.length) {
              return cb(new Error('No trips found'));
            }

            options.showDayList = false;
            options.noServiceSymbolUsed = false;
            options.requestStopSymbolUsed = false;

            trips = _.sortBy(trips, function(trip) {
              return moment(trip.stoptimes[0].departure_time, 'HH:mm:ss').format('X');
            });

            var dayList = trips[0].day_list;

            trips.forEach(function(trip, idx) {
              // See if any trips have a different dayList
              if(trip.day_list !== dayList) {
                options.showDayList = true;
              }

              var stopSequence = 0;
              stops.forEach(function(stop) {
                // find a stoptime for the matching stop_id greater than the last stop_sequence
                var stoptime = _.find(trip.stoptimes, function(st){
                  return st.stop_id === stop.stop_id && st.stop_sequence >= stopSequence;
                });
                if(stoptime) {
                  stopSequence = stoptime.stop_sequence;
                }
                stop.trips.push(formatStopTime(stoptime, options));
              });
            });

            gtfs.getStops(agencyKey, _.pluck(stops, 'stop_id'), function(e, stopDatas) {
              if(e) return cb(e);

              stops.forEach(function(stop) {
                var stopData = _.findWhere(stopDatas, {stop_id: stop.stop_id});

                _.extend(stop, {
                  stop_timezone: stopData.stop_timezone,
                  stop_name: stopData.stop_name,
                  stop_code: stopData.stop_code,
                  stop_lat: stopData.stop_lat,
                  stop_lon: stopData.stop_lon,
                  stop_times: _.reduce(stop.trips, function(memo, trip) {
                    if(trip.departure_time) {
                      memo.push(moment(trip.departure_time, 'HH:mm:ss').format('h:mm A'));
                    }
                    return memo;
                  }, [])
                });
              });

              gtfs.getCalendarDatesByService(serviceIds, function(e, calendarDates) {
                if(e) return cb(e);

                calendarDates = _.groupBy(calendarDates, 'exception_type');
                var excludedDates = _.uniq(filterCalendarDates(_.pluck(calendarDates['2'], 'date'), timetable.start_date, timetable.end_date));
                var includedDates = _.uniq(filterCalendarDates(_.pluck(calendarDates['1'], 'date'), timetable.start_date, timetable.end_date));

                cb(null, jade.renderFile('views/timetable.jade', {
                  stops: stops,
                  route: route,
                  timetable: timetable,
                  trips: trips,
                  calendars: calendars,
                  options: options,
                  excludedDates: _.map(excludedDates, formatDate),
                  includedDates: _.map(includedDates, formatDate)
                }));
              });
            });
          }

          async.map(trips, function(item, cb) {
            var trip = item.toObject();
            trip.calendar = _.findWhere(calendars, {service_id: trip.service_id});
            trip.day_list = formatDays(trip.calendar);

            gtfs.getStoptimesByTrip(agencyKey, trip.trip_id, function(e, stoptimes) {
              if(e) return cb(e);

              // handle `showOnlyTimepoint` config option
              if(options.showOnlyTimepoint) {
                trip.stoptimes = _.filter(stoptimes, function(stoptime) {
                  return stoptime.timepoint !== 0;
                });
              } else {
                trip.stoptimes = stoptimes;
              }

              // obey timetables.txt `use_stop_sequence`
              if(timetable.use_stop_sequence === 1) {
                trip.stoptimes.forEach(function(item) {
                  var stoptime = item.toObject();
                  stops[stoptime.stop_sequence] = stoptime.stop_id;
                });
              } else {
                if(!stops.length) {
                  stops = _.pluck(trip.stoptimes, 'stop_id');
                } else {
                  var index = 0;

                  trip.stoptimes.forEach(function(item) {
                    var stoptime = item.toObject();
                    var stopsLeft = stops.slice(index);

                    if(_.contains(stopsLeft, stoptime.stop_id)) {
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
      });
    });
  });
};
