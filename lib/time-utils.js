const moment = require('moment');

/*
 * Convert a GTFS formatted time string into a moment less than 24 hours.
 */
exports.fromGTFSTime = timeString => {
  const duration = moment.duration(timeString);

  return moment({
    hour: duration.hours(),
    minute: duration.minutes(),
    second: duration.seconds()
  });
};

/*
 * Convert a moment into a GTFS formatted time string.
 */
exports.toGTFSTime = time => {
  return time.format('HH:mm:ss');
};

/*
 * Convert a GTFS formatted date string into a moment.
 */
exports.fromGTFSDate = gtfsDate => moment(gtfsDate, 'YYYYMMDD');

/*
 * Convert a object of weekdays into a a string containing 1s and 0s.
 */
exports.calendarToCalendarCode = c => {
  if (c.service_id) {
    return c.service_id;
  }

  return `${c.monday}${c.tuesday}${c.wednesday}${c.thursday}${c.friday}${c.saturday}${c.sunday}`;
};

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
 * Get number of seconds after midnight of a GTFS formatted time string.
 */
exports.secondsAfterMidnight = timeString => {
  return moment.duration(timeString).asSeconds();
};

/*
 * Get number of minutes after midnight of a GTFS formatted time string.
 */
exports.minutesAfterMidnight = timeString => {
  return moment.duration(timeString).asMinutes();
};

/*
 * Add specified number of seconds to a GTFS formatted time string.
 */
exports.updateTimeByOffset = (timeString, offsetSeconds) => {
  const newTime = exports.fromGTFSTime(timeString);
  return exports.toGTFSTime(newTime.add(offsetSeconds, 'seconds'));
};
