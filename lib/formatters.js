const _ = require('lodash');
const moment = require('moment');

function parseTime(timeStr) {
  let hr = parseInt(timeStr.substr(0, timeStr.indexOf(':')), 10);

  // Decrement time past 23 hours so moment can parse it
  while (hr > 23) {
    hr -= 24;
  }

  timeStr = `${hr}:${timeStr.substr(timeStr.indexOf(':'))}`;
  return moment(timeStr, 'HH:mm:ss');
}

function stringifyTime(time) {
  return time.format('HH:mm:ss');
}

function updateTimeByOffset(time, offsetSeconds) {
  const newTime = parseTime(time);
  return stringifyTime(newTime.add(offsetSeconds, 'seconds'));
}

function calendarToCalendarCode(c) {
  return `${c.monday}${c.tuesday}${c.wednesday}${c.thursday}${c.friday}${c.saturday}${c.sunday}`;
}

exports.calendarCodeToCalendar = code => {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days.reduce((memo, day, idx) => {
    memo[day] = code[idx];
    return memo;
  }, {});
};

exports.msToSeconds = ms => {
  return Math.round(ms / 1000);
};

exports.formatDate = date => {
  if (date.holiday_name) {
    return date.holiday_name;
  }

  return moment(date.date, 'YYYYMMDD').format('MMM D, YYYY');
};

exports.fromGTFSDate = gtfsDate => moment(gtfsDate, 'YYYYMMDD');

exports.toGTFSDate = date => moment(date).format('YYYYMMDD');

exports.secondsAfterMidnight = timeStr => {
  return parseTime(timeStr).diff(parseTime('00:00:00'), 'seconds');
};

function minutesAfterMidnight(timeStr) {
  return parseTime(timeStr).diff(parseTime('00:00:00'), 'minutes');
}

function formatStopTime(stoptime, timetable) {
  if (stoptime) {
    stoptime.classes = [];
    stoptime.arrival_formatted_time = '';
    stoptime.departure_formatted_time = '';
  } else {
    stoptime = {
      classes: ['skipped'],
      arrival_formatted_time: timetable.noServiceSymbol,
      departure_formatted_time: timetable.noServiceSymbol
    };
    timetable.noServiceSymbolUsed = true;
  }

  if (stoptime.departure_time) {
    const departureTime = parseTime(stoptime.departure_time);
    const arrivalTime = parseTime(stoptime.arrival_time);
    stoptime.arrival_formatted_time = arrivalTime.format('h:mm');
    stoptime.arrival_formatted_period = arrivalTime.format('a');
    stoptime.departure_formatted_time = departureTime.format('h:mm');
    stoptime.departure_formatted_period = departureTime.format('a');
    stoptime.classes.push(arrivalTime.format('a'));
  }

  if (stoptime.timepoint === 0 || stoptime.departure_time === '') {
    stoptime.arrival_formatted_time = timetable.interpolatedStopSymbol;
    stoptime.departure_formatted_time = timetable.interpolatedStopSymbol;
    stoptime.classes.push('interpolated');
    timetable.interpolatedStopSymbolUsed = true;
  }

  if (stoptime.pickup_type === 2 || stoptime.pickup_type === 3) {
    stoptime.arrival_formatted_time += timetable.requestStopSymbol;
    stoptime.departure_formatted_time += timetable.requestStopSymbol;
    stoptime.classes.push('request');
    timetable.requestStopSymbolUsed = true;
  }

  return stoptime;
}

function filterHourlyTimes(stops) {
  // Find all stoptimes within the first 60 minutes
  const firstStopTimes = [];
  const firstTripMinutes = minutesAfterMidnight(stops[0].trips[0].arrival_time);
  for (const trip of stops[0].trips) {
    const minutes = minutesAfterMidnight(trip.arrival_time);
    if (minutes >= firstTripMinutes + 60) {
      break;
    }
    firstStopTimes.push(parseTime(trip.arrival_time));
  }

  // Sort stoptimes by minutes for first stop
  const firstStopTimesAndIndex = firstStopTimes.map((time, idx) => ({idx, time}));
  const sortedFirstStopTimesAndIndex = _.sortBy(firstStopTimesAndIndex, item => {
    return parseInt(item.time.format('m'), 10);
  });

  // Filter and arrange stoptimes for all stops based on sort
  return stops.map(stop => {
    stop.hourlyTimes = sortedFirstStopTimesAndIndex.map(item => {
      return parseTime(stop.trips[item.idx].arrival_time).format(':mm');
    });

    return stop;
  });
}

exports.formatTrip = (trip, timetable, calendars) => {
  trip.calendar = _.find(calendars, {service_id: trip.service_id});
  trip.dayList = exports.formatDays(trip.calendar);
  trip.route_short_name = timetable.route.route_short_name;

  return trip;
};

exports.formatDays = calendar => {
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
};

exports.formatFrequency = frequency => {
  const startTime = parseTime(frequency.start_time);
  const endTime = parseTime(frequency.end_time);
  const headway = moment.duration(frequency.headway_secs, 'seconds');
  frequency.start_formatted_time = startTime.format('h:mm');
  frequency.start_formatted_period = startTime.format('a');
  frequency.end_formatted_time = endTime.format('h:mm');
  frequency.end_formatted_period = endTime.format('a');
  frequency.headway_min = Math.round(headway.asMinutes());
  return frequency;
};

exports.formatTimetableId = (timetable) => {
  let timetableId = `${timetable.route_id}_${calendarToCalendarCode(timetable)}`;
  if (timetable.direction_id !== '') {
    timetableId += `_${timetable.direction_id}`;
  }
  return timetableId;
};

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

      // If showing arrival and departure times, add trip to the departure stop, unless it is the last stoptime of the trip
      if (stop.type === 'arrival' && idx < trip.stoptimes.length - 1) {
        stops[stopIndex + 1].trips.push(formatStopTime(stoptime, timetable));
      }

      // Don't show times if it is an arrival stop and is the first stoptime for the trip
      if (idx === 0 && stop.type === 'arrival') {
        continue;
      }

      stop.trips.push(formatStopTime(stoptime, timetable));
    }

    // Fill in any missing stoptimes for this trip
    for (const stop of stops) {
      const lastStopTime = _.last(stop.trips);
      if (!lastStopTime || lastStopTime.trip_id !== trip.trip_id) {
        stop.trips.push(formatStopTime(undefined, timetable));
      }
    }
  }

  if (timetable.orientation === 'hourly') {
    stops = filterHourlyTimes(stops);
  }

  return stops;
};

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

exports.resetStoptimesToMidnight = trip => {
  const offsetSeconds = exports.secondsAfterMidnight(_.first(trip.stoptimes).departure_time);
  if (offsetSeconds === 0) {
    return trip;
  }
  for (const stoptime of trip.stoptimes) {
    stoptime.departure_time = stringifyTime(parseTime(stoptime.departure_time).subtract(offsetSeconds, 'seconds'));
    stoptime.arrival_time = stringifyTime(parseTime(stoptime.arrival_time).subtract(offsetSeconds, 'seconds'));
  }
  return trip;
};

exports.updateStoptimesByOffset = (trip, offsetSeconds) => {
  return trip.stoptimes.map(stoptime => {
    delete stoptime._id;
    stoptime.departure_time = updateTimeByOffset(stoptime.departure_time, offsetSeconds);
    stoptime.arrival_time = updateTimeByOffset(stoptime.arrival_time, offsetSeconds);
    stoptime.trip_id = trip.trip_id;
    return stoptime;
  });
};

exports.groupCalendarsByDays = calendars => {
  return _.groupBy(calendars, calendarToCalendarCode);
};

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
        timetableLabel += ` ${timetable.route.route_long_name}`;
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
