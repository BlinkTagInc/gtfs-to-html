var _ = require('underscore');
var async = require('async');
var gtfs = require('gtfs');
var jade = require('jade');
var moment = require('moment');

function formatStopTime(stoptime) {
  if(!stoptime) {
    stoptime = {
      classes: ['skipped'],
      formatted_time: '—'
    };
  } else {
    stoptime.classes = [];
  }

  if(stoptime.departure_time === '') {
    stoptime.formatted_time = '***';
    stoptime.classes.push('untimed');
  } else if(stoptime.departure_time) {
    stoptime.formatted_time = moment(stoptime.departure_time, 'HH:mm:ss').format('h:mm A');
    stoptime.classes.push(moment(stoptime.departure_time, 'HH:mm:ss').format('a'));
  }

  if(stoptime.pickup_type === 2 || stoptime.pickup_type === 3) {
    stoptime.classes.push('request');
  }

  return stoptime;
}


exports.generateHTML = function(agencyKey, routeId, directionId, cb) {
  gtfs.getRoute(routeId, function(e, route) {
    if(e) return cb(e);

    if(!route) {
      return cb(new Error('No route found'));
    }

    gtfs.getTripsByRouteAndDirection(agencyKey, routeId, directionId, function(e, trips) {
      if(e) return cb(e);

      var stops = {};

      async.map(trips, function(trip, cb){
        gtfs.getStoptimesByTrip(trip.trip_id, function(e, stoptimes) {
          if(e) return cb(e);

          trip.stoptimes = stoptimes;

          stoptimes.forEach(function(stoptime) {
            stops[stoptime.stop_id] = {
              trips: [],
              stop_id: stoptime.stop_id
            };
          });

          cb(null, trip);
        });
      }, function(e, trips){
        if(e) return cb(e);

        var headsign = '';

        if(!trips || !trips.length) {
          return cb(new Error('No trips found'));
        }

        trips = _.sortBy(trips, function(trip) {
          return moment(trip.stoptimes[0].departure_time, 'HH:mm:ss').format('X');
        });

        trips.forEach(function(trip) {
          _.each(stops, function(stop, stop_id) {
            stop.trips.push(formatStopTime(_.findWhere(trip.stoptimes, {stop_id: stop_id})));
          });

          headsign = headsign || trip.trip_headsign;
        });

        gtfs.getStops(_.keys(stops), function(e, stopData) {
          if(e) return cb(e);

          stopData.forEach(function(stop) {
            stops[stop.stop_id].stop_timezone = stop.stop_timezone;
            stops[stop.stop_id].stop_name = stop.stop_name;
            stops[stop.stop_id].stop_code = stop.stop_code;
          });

          var orderedStops = _.sortBy(stops, function(stop) {
            var trip = _.find(stop.trips, function(trip) {
              return trip && trip.stop_sequence !== undefined;
            });
            return trip.stop_sequence;
          });

          cb(null, jade.renderFile('views/timetable.jade', {stops: orderedStops, headsign: headsign, route: route}));
        });
      });
    });
  });
};
