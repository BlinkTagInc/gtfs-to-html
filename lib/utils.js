const _ = require('underscore');
const async = require('async');
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

function getSpecialDates(timetable, cb) {
  gtfs.getCalendarDatesByService(timetable.serviceIds, (err, results) => {
    if (err) return cb(err);

    const calendarDates = _.groupBy(results, 'exception_type');
    timetable.specialDates = {
      excludedDates: filterAndSortCalendarDates(calendarDates['2'], timetable.start_date, timetable.end_date).map(formatDate),
      includedDates: filterAndSortCalendarDates(calendarDates['1'], timetable.start_date, timetable.end_date).map(formatDate)
    };
    cb();
  });
}

function processStops(agencyKey, timetable, options, cb) {
  // Convert stops to array of objects
  timetable.stops = _.map(_.sortBy(timetable.stops, (stop, stopSequence) => parseInt(stopSequence, 10)), (stop) => {
    return {
      stop_id: stop,
      trips: []
    };
  });

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
      const stoptime = _.find(trip.stoptimes, (st) => {
        return st.stop_id === stop.stop_id && st.stop_sequence >= stopSequence;
      });
      if (stoptime) {
        stopSequence = stoptime.stop_sequence;
      }
      stop.trips.push(formatStopTime(stoptime, options));
    });
  });

  gtfs.getStops(agencyKey, _.pluck(timetable.stops, 'stop_id'), (err, stopDatas) => {
    if (err) return cb(err);

    timetable.stops.forEach((stop) => {
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

    cb();
  });
}

function processStopsForMap(timetable, cb) {
  timetable.stopsForMap = timetable.stops.map((stop) => {
    return _.pick(stop, ['stop_name', 'stop_times', 'stop_lat', 'stop_lon']);
  });
  cb();
}


function generateFileName(agencyKey, timetable, cb) {
  gtfs.getRoutesById(agencyKey, timetable.route_id, (err, route) => {
    if (err) return cb(err);

    if (!route) {
      return cb(new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`));
    }

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
}

function convertTimetableToTimetablepage(agencyKey, timetable, cb) {
  generateFileName(agencyKey, timetable, (err, filename) => {
    if (err) return cb(err);
    cb(null, {
      timetable_page_id: timetable.timetable_id,
      route_label: timetable.route_label,
      timetables: [timetable],
      filename
    });
  });
}

exports.generateFolderName = (timetablePage) => {
  // Use first timetable in timetable page for start date and end date
  const timetable = timetablePage.timetables[0];
  return sanitize(`${timetable.start_date}-${timetable.end_date}`);
};

exports.generateHTML = (agencyKey, timetablePage, options, cb) => {
  // Set default symbols if not provded in config
  options.noServiceSymbol = options.noServiceSymbol || '—';
  options.requestStopSymbol = options.requestStopSymbol || '***';

  timetablePage.timetables.forEach((timetable) => {
    timetable.day_list = formatDays(timetable);
  });

  async.each(timetablePage.timetables, (timetable, cb) => {
    // Format TimetablePage
    timetable.day_list = formatDays(timetable);

    async.series([
      (cb) => {
        // Lookup calendars
        gtfs.getCalendars(agencyKey, timetable.start_date, timetable.end_date, timetable.monday, timetable.tuesday, timetable.wednesday, timetable.thursday, timetable.friday, timetable.saturday, timetable.sunday, (err, results) => {
          if (err) return cb(err);

          timetable.calendars = formatCalendars(results);
          timetable.serviceIds = _.pluck(timetable.calendars, 'service_id');
          cb();
        });
      },
      (cb) => {
        // Get route
        gtfs.getRoutesById(agencyKey, timetable.route_id, (err, result) => {
          if (err) return cb(err);

          if (!result) {
            return cb(new Error(`No route found for route_id=${timetable.route_id}, timetable_id=${timetable.timetable_id}`));
          }

          timetable.route = result;
          return cb();
        });
      },
      (cb) => {
        // Get trips
        gtfs.getTripsByRouteAndDirection(agencyKey, timetable.route_id, timetable.direction_id, timetable.serviceIds, (err, results) => {
          if (err) return cb(err);

          if (!results || !results.length) {
            return cb(new Error(`No trips found for route_id=${timetable.route_id}, direction_id=${timetable.direction_id}, service_ids=${JSON.stringify(timetable.serviceIds)}, timetable_id=${timetable.timetable_id}`));
          }

          timetable.trips = _.flatten(results, true);
          return cb();
        });
      },
      (cb) => {
        // Order trips
        gtfs.getTimetableStopOrders(agencyKey, timetable.timetable_id, (err, timetableStopOrders) => {
          if (err) return cb(err);

          async.map(timetable.trips, (item, cb) => {
            const trip = item.toObject();
            trip.calendar = _.findWhere(timetable.calendars, { service_id: trip.service_id });
            trip.day_list = formatDays(trip.calendar);

            gtfs.getStoptimesByTrip(agencyKey, trip.trip_id, (err, stoptimes) => {
              if (err) return cb(err);

              trip.stoptimes = filterStoptimes(stoptimes, options);

              if (timetableStopOrders && timetableStopOrders.length) {
                // use the stop_sequence from `timetable_stop_order.txt`
                timetable.stops = _.pluck(timetableStopOrders, 'stop_id');
              } else if (timetable.use_stop_sequence === 1) {
                // obey timetables.txt `use_stop_sequence`
                trip.stoptimes.forEach((item) => {
                  const stoptime = item.toObject();
                  timetable.stops[stoptime.stop_sequence] = stoptime.stop_id;
                });
              } else if (!timetable.stops || !timetable.stops.length) {
                timetable.stops = _.pluck(trip.stoptimes, 'stop_id');
              } else {
                let index = 0;

                trip.stoptimes.forEach((item) => {
                  const stoptime = item.toObject();
                  const stopsLeft = timetable.stops.slice(index);

                  if (_.contains(stopsLeft, stoptime.stop_id)) {
                    index += stopsLeft.indexOf(stoptime.stop_id);
                  } else {
                    timetable.stops.splice(index, 0, stoptime.stop_id);
                  }
                  index += 1;
                });
              }
              cb(null, trip);
            });
          }, (err, results) => {
            if (err) return cb(err);

            if (!results || !results.length) {
              return cb(new Error(`No trips found for timetable_id=${timetable.timetable_id}`));
            }

            timetable.orderedTrips = _.sortBy(results, trip => moment(trip.stoptimes[0].departure_time, 'HH:mm:ss').format('X'));

            return cb();
          });
        });
      },
      (cb) => {
        // Process stops
        processStops(agencyKey, timetable, options, cb);
      },
      (cb) => {
        processStopsForMap(timetable, cb);
      },
      (cb) => {
        // Lookup special dates
        getSpecialDates(timetable, cb);
      },
      (cb) => {
        // Lookup shapes
        gtfs.getShapesByRoute(agencyKey, timetable.route_id, timetable.direction_id, timetable.serviceIds, (err, results) => {
          if (err) return cb(err);

          if (!results) {
            timetable.shapes = null;
            return cb();
          }

          timetable.shapes = _.map(results, (shape) => _.map(shape, (p) => [p.shape_pt_lat, p.shape_pt_lon]));
          return cb();
        });
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

    return cb(null, html);
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

exports.getTimetablePage = (agencyKey, timetablePageId, cb) => {
  gtfs.getTimetablesByAgency(agencyKey).then((results) => {
    const timetables = results.map((timetable) => timetable.toObject());
    // Check if there are any timetable pages
    gtfs.getTimetablePage(agencyKey, timetablePageId).then((result) => {
      // If no timetablepage, use timetable
      if (!result) {
        const timetable = _.findWhere(timetables, { timetable_id: timetablePageId });
        convertTimetableToTimetablepage(agencyKey, timetable, cb);
      } else {
        const timetablePage = result.toObject();
        timetablePage.timetables = _.where(timetables, { timetable_page_id: timetablePageId });
        cb(null, timetablePage);
      }
    }, cb);
  }, cb);
};

exports.getTimetablePages = (agencyKey, cb) => {
  gtfs.getTimetablesByAgency(agencyKey).then((results) => {
    const timetables = results.map((timetable) => timetable.toObject());
    // Check if there are any timetable pages
    gtfs.getTimetablePagesByAgency(agencyKey).then((results) => {
      const timetablePages = results.map((timetablePage) => timetablePage.toObject());

      // If no timetablepages, use timetables
      if (!timetablePages || !timetablePages.length) {
        async.map(timetables, (timetable, cb) => {
          convertTimetableToTimetablepage(agencyKey, timetable, cb);
        }, cb);
      } else {
        timetablePages.forEach((timetablePage) => {
          const selectedTimetables = _.where(timetables, { timetable_page_id: timetablePage.timetable_page_id });
          timetablePage.timetables = _.sortBy(selectedTimetables, 'timetable_sequence');
        });
        cb(null, timetablePages);
      }
    }, cb);
  }, cb);
};
