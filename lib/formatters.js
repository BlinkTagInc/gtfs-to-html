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

exports.formatStopTime = (stoptime, timetable, config) => {
  if (stoptime) {
    stoptime.classes = [];
  } else {
    stoptime = {
      classes: ['skipped'],
      arrival_formatted_time: config.noServiceSymbol,
      departure_formatted_time: config.noServiceSymbol
    };
    timetable.noServiceSymbolUsed = true;
  }

  if (stoptime.departure_time === '') {
    stoptime.arrival_formatted_time = config.requestStopSymbol;
    stoptime.departure_formatted_time = config.requestStopSymbol;
    stoptime.classes.push('untimed');
    timetable.requestStopSymbolUsed = true;
  } else if (stoptime.pickup_type === 2 || stoptime.pickup_type === 3) {
    stoptime.arrival_formatted_time = config.requestStopSymbol;
    stoptime.departure_formatted_time = config.requestStopSymbol;
    stoptime.classes.push('request');
    stoptime.classes.push('untimed');
    timetable.requestStopSymbolUsed = true;
  } else if (stoptime.departure_time) {
    const departureTime = parseTime(stoptime.departure_time);
    const arrivalTime = parseTime(stoptime.arrival_time);
    stoptime.arrival_formatted_time = arrivalTime.format('h:mm');
    stoptime.arrival_formatted_period = arrivalTime.format('a');
    stoptime.departure_formatted_time = departureTime.format('h:mm');
    stoptime.departure_formatted_period = departureTime.format('a');
    stoptime.classes.push(arrivalTime.format('a'));
  }

  return stoptime;
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

exports.formatCalendars = calendars => {
  return calendars.map(item => {
    const calendar = item.toObject();
    calendar.dayList = exports.formatDays(calendar);
    return calendar;
  });
};

exports.formatRouteName = route => {
  if (route.route_short_name !== '' && route.route_short_name !== undefined) {
    return route.route_short_name;
  }
  return route.route_long_name;
};
