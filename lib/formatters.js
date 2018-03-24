const _ = require('lodash');
const moment = require('moment');

/*
 * Parse a GTFS formatted time string into a moment less than 24 hours.
 */
function fromGTFSTime(timeStr) {
  const duration = moment.duration(timeStr);

  return moment({
    hour: duration.hours(),
    minute: duration.minutes(),
    second: duration.seconds()
  });
}

/*
 * Turn a moment into a GTFS formatted time string.
 */
function toGTFSTime(time) {
  return time.format('HH:mm:ss');
}

/*
 * Add specified number of aseconds to a GTFS formatted time string.
 */
function updateTimeByOffset(timeStr, offsetSeconds) {
  const newTime = fromGTFSTime(timeStr);
  return toGTFSTime(newTime.add(offsetSeconds, 'seconds'));
}

/*
 * Replace all instances in a string with items from an object.
 */
function replaceAll(str, mapObj) {
  const re = new RegExp(Object.keys(mapObj).join('|'), 'gi');
  return str.replace(re, matched => mapObj[matched]);
}

/*
 * Convert a object of weekdays into a a string containing 1s and 0s.
 */
function calendarToCalendarCode(c) {
  return `${c.monday}${c.tuesday}${c.wednesday}${c.thursday}${c.friday}${c.saturday}${c.sunday}`;
}

/*
 * Convert a string of 1s and 0s representing a weekday to an object.
 */
exports.calendarCodeToCalendar = code => {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days.reduce((memo, day, idx) => {
    memo[day] = code[idx];
    return memo;
  }, {});
};

/*
 * Convert ms to seconds.
 */
exports.msToSeconds = ms => {
  return Math.round(ms / 1000);
};

/*
 * Format a date for display
 */
exports.formatDate = date => {
  if (date.holiday_name) {
    return date.holiday_name;
  }

  return moment(date.date, 'YYYYMMDD').format('MMM D, YYYY');
};

/*
 * Convert a GTFS formatted date string into a moment.
 */
exports.fromGTFSDate = gtfsDate => moment(gtfsDate, 'YYYYMMDD');

/*
 * Convert a moment into a GTFS formatted date string.
 */
exports.toGTFSDate = date => moment(date).format('YYYYMMDD');

/*
 * Get number of seconds after midnight of a GTFS formatted time string.
 */
exports.secondsAfterMidnight = timeStr => {
  return moment.duration(timeStr).asSeconds();
};

/*
 * Get number of minutes after midnight of a GTFS formatted time string.
 */
function minutesAfterMidnight(timeStr) {
  return moment.duration(timeStr).asMinutes();
}

/*
 * Format a single stoptime.
 */
function formatStopTime(stoptime, timetable) {
  stoptime.classes = [];

  if (stoptime.type === 'arrival' && stoptime.arrival_time) {
    const arrivalTime = fromGTFSTime(stoptime.arrival_time);
    stoptime.formatted_time = arrivalTime.format('h:mm');
    stoptime.formatted_period = arrivalTime.format('a');
    stoptime.classes.push(arrivalTime.format('a'));
  } else if (stoptime.type === 'departure' && stoptime.departure_time) {
    const departureTime = fromGTFSTime(stoptime.departure_time);
    stoptime.formatted_time = departureTime.format('h:mm');
    stoptime.formatted_period = departureTime.format('a');
    stoptime.classes.push(departureTime.format('a'));
  }

  if (stoptime.timepoint === 0 || stoptime.departure_time === '') {
    stoptime.interpolated = true;
    stoptime.classes.push('interpolated');
    timetable.interpolatedStopSymbolUsed = true;
  }

  if (stoptime.pickup_type === 2 || stoptime.pickup_type === 3) {
    stoptime.request = true;
    stoptime.classes.push('request');
    timetable.requestStopSymbolUsed = true;
  }

  if (stoptime.timepoint === undefined && stoptime.departure_time === undefined) {
    stoptime.skipped = true;
    stoptime.classes.push('skipped');
    timetable.noServiceSymbolUsed = true;
  }

  return stoptime;
}

/*
 * Find hourly times for each stop for hourly schedules.
 */
function filterHourlyTimes(stops) {
  // Find all stoptimes within the first 60 minutes
  const firstStopTimes = [];
  const firstTripMinutes = minutesAfterMidnight(stops[0].trips[0].arrival_time);
  for (const trip of stops[0].trips) {
    const minutes = minutesAfterMidnight(trip.arrival_time);
    if (minutes >= firstTripMinutes + 60) {
      break;
    }
    firstStopTimes.push(fromGTFSTime(trip.arrival_time));
  }

  // Sort stoptimes by minutes for first stop
  const firstStopTimesAndIndex = firstStopTimes.map((time, idx) => ({idx, time}));
  const sortedFirstStopTimesAndIndex = _.sortBy(firstStopTimesAndIndex, item => {
    return parseInt(item.time.format('m'), 10);
  });

  // Filter and arrange stoptimes for all stops based on sort
  return stops.map(stop => {
    stop.hourlyTimes = sortedFirstStopTimesAndIndex.map(item => {
      return fromGTFSTime(stop.trips[item.idx].arrival_time).format(':mm');
    });

    return stop;
  });
}

/*
 * Format a calendar's list of days for display using abbrivated day names.
 */
exports.formatDays = calendar => {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const daysShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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
 */
exports.formatDaysLong = dayList => {
  const mapObj = {
    Mon: 'Monday',
    Tue: 'Tuesday',
    Wed: 'Wednesday',
    Thu: 'Thursday',
    Fri: 'Friday',
    Sat: 'Saturday',
    Sun: 'Sunday'
  };

  return replaceAll(dayList, mapObj);
};

/*
 * Format a trip.
 */
exports.formatTrip = (trip, timetable, calendars) => {
  trip.calendar = _.find(calendars, {service_id: trip.service_id});
  trip.dayList = exports.formatDays(trip.calendar);
  trip.dayListLong = exports.formatDaysLong(trip.dayList);
  trip.route_short_name = timetable.route.route_short_name;

  return trip;
};

/*
 * Format a frequency.
 */
exports.formatFrequency = frequency => {
  const startTime = fromGTFSTime(frequency.start_time);
  const endTime = fromGTFSTime(frequency.end_time);
  const headway = moment.duration(frequency.headway_secs, 'seconds');
  frequency.start_formatted_time = startTime.format('h:mm');
  frequency.start_formatted_period = startTime.format('a');
  frequency.end_formatted_time = endTime.format('h:mm');
  frequency.end_formatted_period = endTime.format('a');
  frequency.headway_min = Math.round(headway.asMinutes());
  return frequency;
};

/*
 * Generate a timetable id.
 */
exports.formatTimetableId = timetable => {
  let timetableId = `${timetable.route_id}_${calendarToCalendarCode(timetable)}`;
  if (timetable.direction_id !== '') {
    timetableId += `_${timetable.direction_id}`;
  }
  return timetableId;
};

/*
 * Format stops.
 */
exports.formatStops = (stops, timetable) => {
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
        stops[stopIndex + 1].trips.push(formatStopTime(departureStoptime, timetable));
      }

      // Show times if it is an arrival stop and is the first stoptime for the trip.
      if (!(stop.type === 'arrival' && idx === 0)) {
        stoptime.type = 'arrival';
        stop.trips.push(formatStopTime(stoptime, timetable));
      }
    }

    // Fill in any missing stoptimes for this trip.
    for (const stop of stops) {
      const lastStopTime = _.last(stop.trips);
      if (!lastStopTime || lastStopTime.trip_id !== trip.trip_id) {
        stop.trips.push(formatStopTime({}, timetable));
      }
    }
  }

  if (timetable.orientation === 'hourly') {
    stops = filterHourlyTimes(stops);
  }

  return stops;
};

/*
 * Get days of the week from calendars
 */
exports.getDaysFromCalendars = calendars => {
  const days = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0
  };

  for (const calendar of calendars) {
    Object.entries(days).forEach(([day, value]) => {
      days[day] = value | calendar[day];
    });
  }

  return days;
};

/*
 * Change all stoptimes of a trip so the first trip starts at midnight. Useful
 * for hourly schedules.
 */
exports.resetStoptimesToMidnight = trip => {
  const offsetSeconds = exports.secondsAfterMidnight(_.first(trip.stoptimes).departure_time);
  if (offsetSeconds > 0) {
    for (const stoptime of trip.stoptimes) {
      stoptime.departure_time = toGTFSTime(fromGTFSTime(stoptime.departure_time).subtract(offsetSeconds, 'seconds'));
      stoptime.arrival_time = toGTFSTime(fromGTFSTime(stoptime.arrival_time).subtract(offsetSeconds, 'seconds'));
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
    stoptime.departure_time = updateTimeByOffset(stoptime.departure_time, offsetSeconds);
    stoptime.arrival_time = updateTimeByOffset(stoptime.arrival_time, offsetSeconds);
    stoptime.trip_id = trip.trip_id;
    return stoptime;
  });
};

/*
 * Group calendars by their days.
 */
exports.groupCalendarsByDays = calendars => {
  return _.groupBy(calendars, calendarToCalendarCode);
};

/*
 * Format a label for a timetable.
 */
exports.formatTimetableLabel = timetable => {
  if (timetable.timetable_label !== '' && timetable.timetable_label !== undefined) {
    return timetable.timetable_label;
  }
  let timetableLabel = `Route `;
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
