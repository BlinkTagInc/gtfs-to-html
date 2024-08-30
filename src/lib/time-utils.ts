import moment from 'moment';

/*
 * Convert a GTFS formatted time string into a moment less than 24 hours.
 */
export function fromGTFSTime(timeString) {
  const duration = moment.duration(timeString);

  return moment({
    hour: duration.hours(),
    minute: duration.minutes(),
    second: duration.seconds(),
  });
}

/*
 * Convert a moment into a GTFS formatted time string.
 */
export function toGTFSTime(time) {
  return time.format('HH:mm:ss');
}

/*
 * Convert a GTFS formatted date string into a moment.
 */
export function fromGTFSDate(gtfsDate) {
  return moment(gtfsDate, 'YYYYMMDD');
}

/*
 * Convert a moment date into a GTFS formatted date string.
 */
export function toGTFSDate(date) {
  return moment(date).format('YYYYMMDD');
}

/*
 * Convert a object of weekdays into a a string containing 1s and 0s.
 */
export function calendarToCalendarCode(c) {
  if (c.service_id) {
    return c.service_id;
  }

  return `${c.monday}${c.tuesday}${c.wednesday}${c.thursday}${c.friday}${c.saturday}${c.sunday}`;
}

/*
 * Convert a string of 1s and 0s representing a weekday to an object.
 */
export function calendarCodeToCalendar(code) {
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  const calendar = {};

  for (const [index, day] of days.entries()) {
    calendar[day] = code[index];
  }

  return calendar;
}

/*
 * Get number of seconds after midnight of a GTFS formatted time string.
 */
export function secondsAfterMidnight(timeString) {
  return moment.duration(timeString).asSeconds();
}

/*
 * Get number of minutes after midnight of a GTFS formatted time string.
 */
export function minutesAfterMidnight(timeString) {
  return moment.duration(timeString).asMinutes();
}

/*
 * Add specified number of seconds to a GTFS formatted time string.
 */
export function updateTimeByOffset(timeString, offsetSeconds) {
  const newTime = fromGTFSTime(timeString);
  return toGTFSTime(newTime.add(offsetSeconds, 'seconds'));
}
