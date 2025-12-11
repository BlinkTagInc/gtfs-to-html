import moment from 'moment';

type CalendarBit = '0' | '1';
export type CalendarCode =
  `${CalendarBit}${CalendarBit}${CalendarBit}${CalendarBit}${CalendarBit}${CalendarBit}${CalendarBit}`;

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
 * Convert a object of weekdays into a a string containing 1s and 0s.
 */
export function calendarToCalendarCode(calendar: {
  monday?: null | 0 | 1;
  tuesday?: null | 0 | 1;
  wednesday?: null | 0 | 1;
  thursday?: null | 0 | 1;
  friday?: null | 0 | 1;
  saturday?: null | 0 | 1;
  sunday?: null | 0 | 1;
}): CalendarCode | '' {
  if (Object.values(calendar).every((value) => value === null)) {
    return '';
  }

  return `${calendar.monday ?? '0'}${calendar.tuesday ?? '0'}${calendar.wednesday ?? '0'}${calendar.thursday ?? '0'}${calendar.friday ?? '0'}${calendar.saturday ?? '0'}${calendar.sunday ?? '0'}`;
}

/*
 * Convert a string of 1s and 0s representing a weekday to an object.
 */
export function calendarCodeToCalendar(code: CalendarCode) {
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  const calendar: {
    monday?: null | 0 | 1;
    tuesday?: null | 0 | 1;
    wednesday?: null | 0 | 1;
    thursday?: null | 0 | 1;
    friday?: null | 0 | 1;
    saturday?: null | 0 | 1;
    sunday?: null | 0 | 1;
  } = {};

  for (const [index, day] of days.entries()) {
    calendar[day] = code[index];
  }

  return calendar;
}

/* Concert an object of weekdays and a date range into a list of dates. */
export function calendarToDateList(
  calendar: {
    monday?: null | 0 | 1;
    tuesday?: null | 0 | 1;
    wednesday?: null | 0 | 1;
    thursday?: null | 0 | 1;
    friday?: null | 0 | 1;
    saturday?: null | 0 | 1;
    sunday?: null | 0 | 1;
  },
  startDate: number,
  endDate: number | null,
) {
  if (!startDate || !endDate) {
    return [];
  }

  const activeWeekdays = [
    calendar.monday === 1 ? 1 : null,
    calendar.tuesday === 1 ? 2 : null,
    calendar.wednesday === 1 ? 3 : null,
    calendar.thursday === 1 ? 4 : null,
    calendar.friday === 1 ? 5 : null,
    calendar.saturday === 1 ? 6 : null,
    calendar.sunday === 1 ? 7 : null,
  ].filter((weekday): weekday is number => weekday !== null);

  if (activeWeekdays.length === 0) {
    return [];
  }

  const activeWeekdaySet = new Set(activeWeekdays);
  const dates = new Set<number>();
  const date = moment(startDate.toString(), 'YYYYMMDD');
  const endDateMoment = moment(endDate.toString(), 'YYYYMMDD');

  while (date.isSameOrBefore(endDateMoment)) {
    const isoWeekday = date.isoWeekday();
    if (activeWeekdaySet.has(isoWeekday)) {
      dates.add(parseInt(date.format('YYYYMMDD'), 10));
    }
    date.add(1, 'day');
  }

  return Array.from(dates);
}

/*
 * Combine a list of calendars into a single calendar.
 */
export function combineCalendars(
  calendars: {
    monday?: null | 0 | 1;
    tuesday?: null | 0 | 1;
    wednesday?: null | 0 | 1;
    thursday?: null | 0 | 1;
    friday?: null | 0 | 1;
    saturday?: null | 0 | 1;
    sunday?: null | 0 | 1;
  }[],
) {
  const combinedCalendar: {
    monday: 0 | 1;
    tuesday: 0 | 1;
    wednesday: 0 | 1;
    thursday: 0 | 1;
    friday: 0 | 1;
    saturday: 0 | 1;
    sunday: 0 | 1;
  } = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0,
  };

  for (const calendar of calendars) {
    for (const day of Object.keys(
      combinedCalendar,
    ) as (keyof typeof combinedCalendar)[]) {
      if (calendar[day] === 1) {
        combinedCalendar[day] = 1;
      }
    }
  }

  return combinedCalendar;
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
