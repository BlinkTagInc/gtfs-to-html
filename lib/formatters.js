import {
  clone,
  find,
  first,
  flatMap,
  groupBy,
  last,
  omit,
  sortBy,
  uniqBy,
  zipObject,
} from 'lodash-es';
import moment from 'moment';

import {
  fromGTFSTime,
  minutesAfterMidnight,
  calendarToCalendarCode,
  secondsAfterMidnight,
  toGTFSTime,
  updateTimeByOffset,
} from './time-utils.js';

/*
 * Replace all instances in a string with items from an object.
 */
function replaceAll(string, mapObject) {
  const re = new RegExp(Object.keys(mapObject).join('|'), 'gi');
  return string.replace(re, (matched) => mapObject[matched]);
}

/*
 * Determine if value is null or empty string.
 */
export function isNullOrEmpty(value) {
  return value === null || value === '';
}

/*
 * Format a date for display.
 */
export function formatDate(date, dateFormat) {
  if (date.holiday_name) {
    return date.holiday_name;
  }

  return moment(date.date, 'YYYYMMDD').format(dateFormat);
}

/*
 * Convert time to seconds.
 */
export function timeToSeconds(time) {
  return moment.duration(time).asSeconds();
}

/*
 * Format a single stoptime.
 */
/* eslint-disable complexity */
function formatStopTime(stoptime, timetable, config) {
  stoptime.classes = [];

  if (stoptime.type === 'arrival' && stoptime.arrival_time) {
    const arrivalTime = fromGTFSTime(stoptime.arrival_time);
    stoptime.formatted_time = arrivalTime.format(config.timeFormat);
    stoptime.classes.push(arrivalTime.format('a'));
  } else if (stoptime.type === 'departure' && stoptime.departure_time) {
    const departureTime = fromGTFSTime(stoptime.departure_time);
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
  }

  if (stoptime.timepoint === 0 || stoptime.departure_time === '') {
    stoptime.interpolated = true;
    stoptime.classes.push('interpolated');
    if (timetable.interpolatedStopSymbol !== null) {
      timetable.interpolatedStopSymbolUsed = true;
    }
  }

  if (stoptime.timepoint === null && stoptime.departure_time === null) {
    stoptime.skipped = true;
    stoptime.classes.push('skipped');
    if (timetable.noServiceSymbol !== null) {
      timetable.noServiceSymbolUsed = true;
    }
  }

  return stoptime;
}
/* eslint-enable complexity */

/*
 * Find hourly times for each stop for hourly schedules.
 */
function filterHourlyTimes(stops) {
  // Find all stoptimes within the first 60 minutes.
  const firstStopTimes = [];
  const firstTripMinutes = minutesAfterMidnight(stops[0].trips[0].arrival_time);
  for (const trip of stops[0].trips) {
    const minutes = minutesAfterMidnight(trip.arrival_time);
    if (minutes >= firstTripMinutes + 60) {
      break;
    }

    firstStopTimes.push(fromGTFSTime(trip.arrival_time));
  }

  // Sort stoptimes by minutes for first stop.
  const firstStopTimesAndIndex = firstStopTimes.map((time, idx) => ({
    idx,
    time,
  }));
  const sortedFirstStopTimesAndIndex = sortBy(firstStopTimesAndIndex, (item) =>
    Number.parseInt(item.time.format('m'), 10)
  );

  // Filter and arrange stoptimes for all stops based on sort.
  return stops.map((stop) => {
    stop.hourlyTimes = sortedFirstStopTimesAndIndex.map((item) =>
      fromGTFSTime(stop.trips[item.idx].arrival_time).format(':mm')
    );

    return stop;
  });
}

/*
 * Format a calendar's list of days for display using abbreviated day names.
 */
const days = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
export function formatDays(calendar, config) {
  const daysShort = config.daysShortStrings;
  let daysInARow = 0;
  let dayString = '';

  if (!calendar) {
    return '';
  }

  for (let i = 0; i <= 6; i += 1) {
    const currentDayOperating = calendar[days[i]] === 1;
    const previousDayOperating = i > 0 ? calendar[days[i - 1]] === 1 : false;
    const nextDayOperating = i < 6 ? calendar[days[i + 1]] === 1 : false;

    if (currentDayOperating) {
      if (dayString.length > 0) {
        if (!previousDayOperating) {
          dayString += ', ';
        } else if (daysInARow === 1) {
          dayString += '-';
        }
      }

      daysInARow += 1;

      if (
        dayString.length === 0 ||
        !nextDayOperating ||
        i === 6 ||
        !previousDayOperating
      ) {
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
}

/*
 * Format a list of days for display using full names of days.
 */
export function formatDaysLong(dayList, config) {
  const mapObject = zipObject(config.daysShortStrings, config.daysStrings);

  return replaceAll(dayList, mapObject);
}

/*
 * Format a trip.
 */
export function formatTrip(trip, timetable, calendars, config) {
  trip.calendar = find(calendars, {
    service_id: trip.service_id,
  });
  trip.dayList = formatDays(trip.calendar, config);
  trip.dayListLong = formatDaysLong(trip.dayList, config);

  if (timetable.routes.length === 1) {
    trip.route_short_name = timetable.routes[0].route_short_name;
  } else {
    const route = timetable.routes.find(
      (route) => route.route_id === trip.route_id
    );
    trip.route_short_name = route.route_short_name;
  }

  return trip;
}

/*
 * Format a route name.
 */
export function formatRouteName(route) {
  let routeName = 'Route ';
  if (!isNullOrEmpty(route.route_short_name)) {
    routeName += route.route_short_name;
  } else if (!isNullOrEmpty(route.route_long_name)) {
    routeName += route.route_long_name;
  }

  return routeName;
}

/*
 * Format a frequency.
 */
export function formatFrequency(frequency, config) {
  const startTime = fromGTFSTime(frequency.start_time);
  const endTime = fromGTFSTime(frequency.end_time);
  const headway = moment.duration(frequency.headway_secs, 'seconds');
  frequency.start_formatted_time = startTime.format(config.timeFormat);
  frequency.end_formatted_time = endTime.format(config.timeFormat);
  frequency.headway_min = Math.round(headway.asMinutes());
  return frequency;
}

/*
 * Generate a timetable id.
 */
export function formatTimetableId(timetable) {
  let timetableId = `${timetable.route_ids.join('_')}|${calendarToCalendarCode(
    timetable
  )}`;
  if (!isNullOrEmpty(timetable.direction_id)) {
    timetableId += `|${timetable.direction_id}`;
  }

  return timetableId;
}

function createEmptyStoptime(stopId, tripId) {
  return {
    id: null,
    trip_id: tripId,
    arrival_time: null,
    departure_time: null,
    stop_id: stopId,
    stop_sequence: null,
    stop_headsign: null,
    pickup_type: null,
    drop_off_type: null,
    continuous_pickup: null,
    continuous_drop_off: null,
    shape_dist_traveled: null,
    timepoint: null,
  };
}

/*
 * Format stops.
 */
export function formatStops(timetable, config) {
  for (const trip of timetable.orderedTrips) {
    let stopIndex = -1;
    for (const [idx, stoptime] of trip.stoptimes.entries()) {
      // Find a stop for the matching `stop_id` greater than the last `stopIndex`.
      const stop = find(timetable.stops, (st, idx) => {
        if (st.stop_id === stoptime.stop_id && idx > stopIndex) {
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
        const departureStoptime = clone(stoptime);
        departureStoptime.type = 'departure';
        timetable.stops[stopIndex + 1].trips.push(
          formatStopTime(departureStoptime, timetable, config)
        );
      }

      // Show times if it is an arrival stop and is the first stoptime for the trip.
      if (!(stop.type === 'arrival' && idx === 0)) {
        stoptime.type = 'arrival';
        stop.trips.push(formatStopTime(stoptime, timetable, config));
      }
    }

    // Fill in any missing stoptimes for this trip.
    for (const stop of timetable.stops) {
      const lastStopTime = last(stop.trips);
      if (!lastStopTime || lastStopTime.trip_id !== trip.trip_id) {
        const emptyStoptime = createEmptyStoptime(stop.stop_id, trip.trip_id);
        stop.trips.push(formatStopTime(emptyStoptime, timetable, config));
      }
    }
  }

  if (timetable.orientation === 'hourly') {
    timetable.stops = filterHourlyTimes(timetable.stops);
  }

  return timetable.stops;
}

/*
 * Formats a stop name.
 */
export function formatStopName(stop) {
  return `${stop.stop_name}${
    stop.type === 'arrival'
      ? ' (Arrival)'
      : stop.type === 'departure'
      ? ' (Departure)'
      : ''
  }`;
}

/*
 * Formats trip "Contines from".
 */
export function formatTripContinuesFrom(trip) {
  return trip.continues_from_route
    ? trip.continues_from_route.route.route_short_name
    : '';
}

/*
 * Formats trip "Contines as".
 */
export function formatTripContinuesAs(trip) {
  return trip.continues_as_route
    ? trip.continues_as_route.route.route_short_name
    : '';
}

/*
 * Change all stoptimes of a trip so the first trip starts at midnight. Useful
 * for hourly schedules.
 */
export function resetStoptimesToMidnight(trip) {
  const offsetSeconds = secondsAfterMidnight(
    first(trip.stoptimes).departure_time
  );
  if (offsetSeconds > 0) {
    for (const stoptime of trip.stoptimes) {
      stoptime.departure_time = toGTFSTime(
        fromGTFSTime(stoptime.departure_time).subtract(offsetSeconds, 'seconds')
      );
      stoptime.arrival_time = toGTFSTime(
        fromGTFSTime(stoptime.arrival_time).subtract(offsetSeconds, 'seconds')
      );
    }
  }

  return trip;
}

/*
 * Change all stoptimes of a trip by a specified number of seconds. Useful for
 * hourly schedules.
 */
export function updateStoptimesByOffset(trip, offsetSeconds) {
  return trip.stoptimes.map((stoptime) => {
    delete stoptime._id;
    stoptime.departure_time = updateTimeByOffset(
      stoptime.departure_time,
      offsetSeconds
    );
    stoptime.arrival_time = updateTimeByOffset(
      stoptime.arrival_time,
      offsetSeconds
    );
    stoptime.trip_id = trip.trip_id;
    return stoptime;
  });
}

/*
 * Format a label for a timetable.
 */
export function formatTimetableLabel(timetable) {
  if (!isNullOrEmpty(timetable.timetable_label)) {
    return timetable.timetable_label;
  }

  let timetableLabel = '';

  if (timetable.routes && timetable.routes.length > 0) {
    timetableLabel += 'Route ';
    if (!isNullOrEmpty(timetable.routes[0].route_short_name)) {
      timetableLabel += timetable.routes[0].route_short_name;
    } else if (!isNullOrEmpty(timetable.routes[0].route_long_name)) {
      timetableLabel += timetable.routes[0].route_long_name;
    }
  }

  if (timetable.stops && timetable.stops.length > 0) {
    const firstStop = timetable.stops[0].stop_name;
    const lastStop = timetable.stops[timetable.stops.length - 1].stop_name;
    if (firstStop === lastStop) {
      if (!isNullOrEmpty(timetable.routes[0].route_long_name)) {
        timetableLabel += ` - ${timetable.routes[0].route_long_name}`;
      }

      timetableLabel += ' - Loop';
    } else {
      timetableLabel += ` - ${firstStop} to ${lastStop}`;
    }
  } else if (timetable.direction_name !== null) {
    timetableLabel += ` to ${timetable.direction_name}`;
  }

  return timetableLabel;
}

/*
 * Format a label for a timetable page.
 */
export function formatTimetablePageLabel(timetablePage) {
  if (!isNullOrEmpty(timetablePage.timetable_page_label)) {
    return timetablePage.timetable_page_label;
  }

  // Get label from first timetable.
  if (
    timetablePage.consolidatedTimetables &&
    timetablePage.consolidatedTimetables.length > 0
  ) {
    const routes = uniqBy(
      flatMap(
        timetablePage.consolidatedTimetables,
        (timetable) => timetable.routes
      ),
      'route_id'
    );
    const timetablePageLabel = routes.map((route) => formatRouteName(route));

    return timetablePageLabel.join(' and ');
  }

  return 'Unknown';
}

/*
 * Merge timetables with same `timetable_id`.
 */
export function mergeTimetablesWithSameId(timetables) {
  if (timetables.length === 0) {
    return [];
  }

  const mergedTimetables = groupBy(timetables, 'timetable_id');

  return Object.values(mergedTimetables).map((timetableGroup) => {
    const mergedTimetable = omit(timetableGroup[0], 'route_id');

    mergedTimetable.route_ids = timetableGroup.map(
      (timetable) => timetable.route_id
    );

    return mergedTimetable;
  });
}
