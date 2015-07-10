var _ = require('underscore');
var async = require('async');
var gtfs = require('../gtfs');
var jade = require('jade');
var moment = require('moment');


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
  } else {
    stoptime.classes = [];
  }

  if(stoptime.departure_time === '') {
    stoptime.formatted_time = options.requestStopSymbol;
    stoptime.classes.push('untimed');
  } else if(stoptime.departure_time) {
    var time = moment(stoptime.departure_time, 'HH:mm:ss');
    stoptime.formatted_time = time.format('h:mm');
    stoptime.formatted_period = time.format('A');
    stoptime.classes.push(time.format('a'));
  }

  if(stoptime.pickup_type === 2 || stoptime.pickup_type === 3) {
    stoptime.classes.push('request');
  }

  return stoptime;
}


function formatDays(calendar) {
  var days = [];

  if(calendar.monday === '1') {
    days.push('Mon');
  }
  if(calendar.tuesday === '1') {
    days.push('Tue');
  }
  if(calendar.wednesday === '1') {
    days.push('Wed');
  }
  if(calendar.thursday === '1') {
    days.push('Thu');
  }
  if(calendar.friday === '1') {
    days.push('Fri');
  }
  if(calendar.saturday === '1') {
    days.push('Sat');
  }
  if(calendar.sunday === '1') {
    days.push('Sun');
  }

  return days.join(' ');
}


exports.generateHTML = function(agencyKey, timetableId, options, cb) {
  // Set default symbols if not provded in config
  options.noServiceSymbol = options.noServiceSymbol || '—';
  options.requestStopSymbol = options.requestStopSymbol || '***';

  gtfs.getTimetable(timetableId, function(e, timetable) {
    if(e) return cb(e);
    if(!timetable) return cb(new Error('No Timetable Found'));

    var routeId = timetable.route_id;
    var directionId = timetable.direction_id;

    timetable.day_list = formatDays(timetable);

    gtfs.getRoute(routeId, function(e, route) {
      if(e) return cb(e);

      if(!route) {
        return cb(new Error('No route found'));
      }

      gtfs.getTripsByRouteAndDirection(agencyKey, routeId, directionId, function(e, trips) {
        if(e) return cb(e);

        var stops = [];
        async.map(trips, function(trip, cb) {
          gtfs.getStoptimesByTrip(trip.trip_id, function(e, stoptimes) {
            if(e) return cb(e);

            trip.stoptimes = stoptimes;

            if(!stops.length) {
              stops = _.pluck(stoptimes, 'stop_id');
            } else {
              var index = 0;

              stoptimes.forEach(function(item) {
                var stoptime = item.toObject();
                var stopsLeft = stops.slice(index);

                if(_.contains(stopsLeft, stoptime.stop_id)) {
                  index += stopsLeft.indexOf(stoptime.stop_id);
                } else {
                  stops.splice(index, 0, stoptime.stop_id);
                }
              });
            }
            cb(null, trip);
          });
        }, function(e, trips){
          if(e) return cb(e);

          //Convert stops to array of objects
          stops = _.map(stops, function(stop) {
            return {
              stop_id: stop,
              trips: []
            };
          });

          if(!trips || !trips.length) {
            return cb(new Error('No trips found'));
          }

          trips = _.sortBy(trips, function(trip) {
            return moment(trip.stoptimes[0].departure_time, 'HH:mm:ss').format('X');
          });

          trips.forEach(function(trip) {
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

          gtfs.getStops(_.pluck(stops, 'stop_id'), function(e, stopDatas) {
            if(e) return cb(e);

            stops.forEach(function(stop) {
              var stopData = _.findWhere(stopDatas, {stop_id: stop.stop_id});

              _.extend(stop, {
                stop_timezone: stopData.stop_timezone,
                stop_name: stopData.stop_name,
                stop_code: stopData.stop_code
              });
            });

            var service_ids = _.pluck(trips, 'service_id');

            gtfs.getCalendarsByService(service_ids, function(e, calendars) {
              if(e) return cb(e);

              calendars = calendars.map(function(item) {
                var calendar = item.toObject();
                calendar.day_list = formatDays(calendar);
                return calendar;
              });

              trips.forEach(function(trip) {
                trip.calendar = _.findWhere(calendars, {service_id: trip.service_id});
              });

              gtfs.getCalendarDatesByService(service_ids, function(e, calendarDates) {
                if(e) return cb(e);

                calendarDates = _.groupBy(calendarDates, 'exception_type');
                var excludedDates = filterCalendarDates(_.pluck(calendarDates['2'], 'date'), timetable.start_date, timetable.end_date);
                var includedDates = filterCalendarDates(_.pluck(calendarDates['1'], 'date'), timetable.start_date, timetable.end_date);

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
          });
        });
      });
    });
  });
};
