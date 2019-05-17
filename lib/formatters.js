const _ = require('lodash');
const moment = require('moment');

const timeUtils = require('./time-utils');

/*
 * Replace all instances in a string with items from an object.
 */
function replaceAll(str, mapObj) {
  const re = new RegExp(Object.keys(mapObj).join('|'), 'gi');
  return str.replace(re, matched => mapObj[matched]);
}

/*
 * Format a date for display. Edited by Pawajoro - added custom format
 */
exports.formatDate = (date, dateFormat) => {
  if (date.holiday_name) {
    return date.holiday_name;
  }

  return moment(date.date, 'YYYYMMDD').format(dateFormat);
};

/*
 * Time to seconds
 */
exports.timeToSeconds = time => moment.duration(time).asSeconds();

/*
 * Format a single stoptime. Edited by Pawajoro - custom time format
 */
function formatStopTime(stoptime, timetable, config) {
  stoptime.classes = [];

  if (stoptime.type === 'arrival' && stoptime.arrival_time) {
    const arrivalTime = timeUtils.fromGTFSTime(stoptime.arrival_time);
    stoptime.formatted_time = arrivalTime.format(config.timeFormat);
    stoptime.classes.push(arrivalTime.format('a'));
  } else if (stoptime.type === 'departure' && stoptime.departure_time) {
    const departureTime = timeUtils.fromGTFSTime(stoptime.departure_time);
    stoptime.formatted_time = departureTime.format(config.timeFormat);
    stoptime.classes.push(departureTime.format('a'));
  }

  if (stoptime.pickup_type === 1) {
    stoptime.noPickup = true;
    stoptime.classes.push('no-pickup');
    if (timetable.noPickupSymbol !== null) {
      timetable.noPickupSymbolUsed = true;
    }
  } else if (stoptime.pickup_type === 2 || stoptime.pickup_type === 3) {
    stoptime.requestPickup = true;
    stoptime.classes.push('request-pickup');
    if (timetable.requestPickupSymbol !== null) {
      timetable.requestPickupSymbolUsed = true;
    }

    stoptime.formatted_time = '';
    stoptime.formatted_period = '';
  }

  if (stoptime.drop_off_type === 1) {
    stoptime.noDropoff = true;
    stoptime.classes.push('no-drop-off');
    if (timetable.noDropoffSymbol !== null) {
      timetable.noDropoffSymbolUsed = true;
    }
  } else if (stoptime.drop_off_type === 2 || stoptime.drop_off_type === 3) {
    stoptime.requestDropoff = true;
    stoptime.classes.push('request-drop-off');
    if (timetable.requestDropoffSymbol !== null) {
      timetable.requestDropoffSymbolUsed = true;
    }

    stoptime.formatted_time = '';
    stoptime.formatted_period = '';
  }

  if (stoptime.timepoint === 0 || stoptime.departure_time === '') {
    stoptime.interpolated = true;
    stoptime.classes.push('interpolated');
    if (timetable.interpolatedStopSymbol !== null) {
      timetable.interpolatedStopSymbolUsed = true;
    }
  }

  if (stoptime.timepoint === undefined && stoptime.departure_time === undefined) {
    stoptime.skipped = true;
    stoptime.classes.push('skipped');
    if (timetable.noServiceSymbol !== null) {
      timetable.noServiceSymbolUsed = true;
    }
  }

  return stoptime;
}

/*
 * Find hourly times for each stop for hourly schedules.
 */
function filterHourlyTimes(stops) {
  // Find all stoptimes within the first 60 minutes
  const firstStopTimes = [];
  const firstTripMinutes = timeUtils.minutesAfterMidnight(stops[0].trips[0].arrival_time);
  for (const trip of stops[0].trips) {
    const minutes = timeUtils.minutesAfterMidnight(trip.arrival_time);
    if (minutes >= firstTripMinutes + 60) {
      break;
    }

    firstStopTimes.push(timeUtils.fromGTFSTime(trip.arrival_time));
  }

  // Sort stoptimes by minutes for first stop
  const firstStopTimesAndIndex = firstStopTimes.map((time, idx) => ({idx, time}));
  const sortedFirstStopTimesAndIndex = _.sortBy(firstStopTimesAndIndex, item => {
    return parseInt(item.time.format('m'), 10);
  });

  // Filter and arrange stoptimes for all stops based on sort
  return stops.map(stop => {
    stop.hourlyTimes = sortedFirstStopTimesAndIndex.map(item => {
      return timeUtils.fromGTFSTime(stop.trips[item.idx].arrival_time).format(':mm');
    });

    return stop;
  });
}

/*
 * Format a calendar's list of days for display using abbrivated day names.
 * Edited by Pawajoro - custom days strings
 */
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
exports.formatDays = (calendar, config) => {
  const daysShort = config.daysShortStrings;
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
};

/*
 * Format a list of days for display using full names of days.
 * Edited by Pawajoro - custom days strings
 */
exports.formatDaysLong = (dayList, config) => {
  const mapObj = _.zipObject(config.daysShortStrings, config.daysStrings);

  return replaceAll(dayList, mapObj);
};

/*
 * Format a trip.
 * Edited by Pawajoro - passing config for formatting
 */
exports.formatTrip = (trip, timetable, calendars, config) => {
  trip.calendar = _.find(calendars, {service_id: trip.service_id});
  trip.dayList = exports.formatDays(trip.calendar, config);
  trip.dayListLong = exports.formatDaysLong(trip.dayList, config);
  trip.route_short_name = timetable.route.route_short_name;

  return trip;
};

/*
 * Format a frequency.
 * Edited by Pawajoro - custom format support
 */
exports.formatFrequency = (frequency, config) => {
  const startTime = timeUtils.fromGTFSTime(frequency.start_time);
  const endTime = timeUtils.fromGTFSTime(frequency.end_time);
  const headway = moment.duration(frequency.headway_secs, 'seconds');
  frequency.start_formatted_time = startTime.format(config.timeFormat);
  frequency.end_formatted_time = endTime.format(config.timeFormat);
  frequency.headway_min = Math.round(headway.asMinutes());
  return frequency;
};

/*
 * Generate a timetable id.
 */
exports.formatTimetableId = timetable => {
  let timetableId = `${timetable.route_id}_${timeUtils.calendarToCalendarCode(timetable)}`;
  if (timetable.direction_id !== '') {
    timetableId += `_${timetable.direction_id}`;
  }

  return timetableId;
};

/*
 * Format stops.
 */
exports.formatStops = (stops, timetable, config) => {
  for (const trip of timetable.orderedTrips) {
    let stopIndex = 0;
    for (const [idx, stoptime] of trip.stoptimes.entries()) {
      // Find a stop for the matching stop_id greater than the last stopIndex
      const stop = _.find(stops, (st, idx) => {
        if (st.stop_id === stoptime.stop_id && idx >= stopIndex) {
          stopIndex = idx;
          return true;
        }

        return false;
      });

      if (!stop) {
        continue;
      }

      // If showing arrival and departure times as separate columns/rows, add
      // trip to the departure stop, unless it is the last stoptime of the trip.
      if (stop.type === 'arrival' && idx < trip.stoptimes.length - 1) {
        const departureStoptime = _.clone(stoptime);
        departureStoptime.type = 'departure';
        stops[stopIndex + 1].trips.push(formatStopTime(departureStoptime, timetable, config));
      }

      // Show times if it is an arrival stop and is the first stoptime for the trip.
      if (!(stop.type === 'arrival' && idx === 0)) {
        stoptime.type = 'arrival';
        stop.trips.push(formatStopTime(stoptime, timetable, config));
      }
    }

    // Fill in any missing stoptimes for this trip.
    for (const stop of stops) {
      const lastStopTime = _.last(stop.trips);
      if (!lastStopTime || lastStopTime.trip_id !== trip.trip_id) {
        stop.trips.push(formatStopTime({}, timetable, config));
      }
    }
  }

  if (timetable.orientation === 'hourly') {
    stops = filterHourlyTimes(stops);
  }

  return stops;
};

/*
 * Change all stoptimes of a trip so the first trip starts at midnight. Useful
 * for hourly schedules.
 */
exports.resetStoptimesToMidnight = trip => {
  const offsetSeconds = timeUtils.secondsAfterMidnight(_.first(trip.stoptimes).departure_time);
  if (offsetSeconds > 0) {
    for (const stoptime of trip.stoptimes) {
      stoptime.departure_time = timeUtils.toGTFSTime(timeUtils.fromGTFSTime(stoptime.departure_time).subtract(offsetSeconds, 'seconds'));
      stoptime.arrival_time = timeUtils.toGTFSTime(timeUtils.fromGTFSTime(stoptime.arrival_time).subtract(offsetSeconds, 'seconds'));
    }
  }

  return trip;
};

/*
 * Change all stoptimes of a trip by a specified numger of seconds. Useful for
 * hourly schedules.
 */
exports.updateStoptimesByOffset = (trip, offsetSeconds) => {
  return trip.stoptimes.map(stoptime => {
    delete stoptime._id;
    stoptime.departure_time = timeUtils.updateTimeByOffset(stoptime.departure_time, offsetSeconds);
    stoptime.arrival_time = timeUtils.updateTimeByOffset(stoptime.arrival_time, offsetSeconds);
    stoptime.trip_id = trip.trip_id;
    return stoptime;
  });
};

/*
 * Format a label for a timetable.
 */
exports.formatTimetableLabel = timetable => {
  if (timetable.timetable_label !== '' && timetable.timetable_label !== undefined) {
    return timetable.timetable_label;
  }

  let timetableLabel = 'Route ';
  if (timetable.route.route_short_name !== '' && timetable.route.route_short_name !== undefined) {
    timetableLabel += timetable.route.route_short_name;
  } else if (timetable.route.route_long_name !== '' && timetable.route.route_long_name !== undefined) {
    timetableLabel += timetable.route.route_long_name;
  }

  if (timetable.stops && timetable.stops.length > 0) {
    const firstStop = timetable.stops[0].stop_name;
    const lastStop = timetable.stops[timetable.stops.length - 1].stop_name;
    if (firstStop === lastStop) {
      if (timetable.route.route_long_name !== '' && timetable.route.route_long_name !== undefined) {
        timetableLabel += ` - ${timetable.route.route_long_name}`;
      }

      timetableLabel += ' - Loop';
    } else {
      timetableLabel += ` - ${firstStop} to ${lastStop}`;
    }
  } else if (timetable.direction_name !== undefined) {
    timetableLabel += ` to ${timetable.direction_name}`;
  }

  return timetableLabel;
};
