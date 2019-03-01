const readline = require('readline');

const _ = require('lodash');
const chalk = require('chalk');
const gtfs = require('gtfs');

/*
 * Creates text for a log of output details.
 */
exports.generateLogText = async (agency, outputStats) => {
  const results = await gtfs.getFeedInfo({agency_key: agency.agency_key});
  const feedVersion = results ? results.feed_version : 'Unknown';

  const logText = [
    `Feed Version: ${feedVersion}`,
    `Date Generated: ${new Date()}`,
    `Timetable Page Count ${outputStats.timetablePages}`,
    `Timetable Count: ${outputStats.timetables}`,
    `Calendar Service ID Count: ${outputStats.calendars}`,
    `Route Count: ${outputStats.routes}`,
    `Trip Count: ${outputStats.trips}`,
    `Stop Count: ${outputStats.stops}`
  ];

  if (agency.url) {
    logText.push(`Source: ${agency.url}`);
  } else if (agency.path) {
    logText.push(`Source: ${agency.path}`);
  }

  return logText.join('\n');
};

/*
 * Returns a log function based on config settings
 */
exports.log = config => {
  if (config.verbose === false) {
    return _.noop;
  }

  return (text, overwrite) => {
    if (overwrite === true) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    } else {
      process.stdout.write('\n');
    }

    process.stdout.write(text);
  };
};

/*
 * Format console warning text
 */
exports.formatWarn = text => {
  return `${chalk.yellow.underline('Warning')}${chalk.yellow(':')} ${chalk.yellow(text)}`;
};

/*
 * Print a warning to the console
 */
exports.warn = text => {
  process.stdout.write(`\n${exports.formatWarn(text)}\n`);
};

/*
 * Format console error text
 */
exports.formatError = text => {
  return `${chalk.red.underline('Error')}${chalk.red(':')} ${chalk.red(text)}`;
};

/*
 * Print an error to the console
 */
exports.error = error => {
  process.stdout.write(`\n${exports.formatError(error)}\n`);
  console.error(error);
};

/*
 * Print a table of stats to the console.
 */
exports.generateStats = timetablePage => {
  return timetablePage.timetables.reduce((memo, timetable) => {
    memo.stops += timetable.stops.length;
    memo.trips += timetable.orderedTrips.length;
    for (const serviceId of timetable.serviceIds) {
      memo.serviceIds[serviceId] = true;
    }

    memo.routeIds[timetable.route_id] = true;
    memo.routes = _.size(memo.routeIds);
    memo.calendars = _.size(memo.serviceIds);
    return memo;
  }, {
    stops: 0,
    trips: 0,
    routeIds: {},
    serviceIds: {}
  });
};
