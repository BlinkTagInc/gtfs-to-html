const readline = require('readline');

const _ = require('lodash');
const chalk = require('chalk');
const gtfs = require('gtfs');
const ProgressBar = require('progress');
const Table = require('cli-table');

/*
 * Creates text for a log of output details.
 */
exports.generateLogText = async (agency, outputStats, config) => {
  const results = await gtfs.getFeedInfo({agency_key: agency.agency_key});
  const feedVersion = (results && results.feed_version) ? results.feed_version : 'Unknown';

  const logText = [
    `Feed Version: ${feedVersion}`,
    `GTFS-to-HTML Version: ${config.gtfsToHtmlVersion}`,
    `Date Generated: ${new Date()}`,
    `Timetable Page Count: ${outputStats.timetablePages}`,
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

  if (config.logFunction) {
    return config.logFunction;
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
 * Returns an warning log function based on config settings
 */
exports.logWarning = config => {
  if (config.logFunction) {
    return config.logFunction;
  }

  return (text) => {
    process.stdout.write(`\n${exports.formatWarning(text)}\n`);
  }
};

/*
 * Returns an error log function based on config settings
 */
exports.logError = config => {
  if (config.logFunction) {
    return config.logFunction;
  }

  return (text) => {
    process.stdout.write(`\n${exports.formatError(text)}\n`);
  }
};

/*
 * Format console warning text
 */
exports.formatWarning = text => {
  return `${chalk.yellow.underline('Warning')}${chalk.yellow(':')} ${chalk.yellow(text)}`;
};

/*
 * Format console error text
 */
exports.formatError = text => {
  return `${chalk.red.underline('Error')}${chalk.red(':')} ${chalk.red(text)}`;
};

/*
 * Print a table of stats to the console.
 */
exports.logStats = (stats, config) => {
  // Hide stats table from custom log functions
  if (config.logFunction) {
    return;
  }

  const table = new Table({
    colWidths: [40, 20],
    head: ['Item', 'Count']
  });

  table.push(
    ['📄 Timetable Pages', stats.timetablePages],
    ['🕑 Timetables', stats.timetables],
    ['📅 Calendar Service IDs', stats.calendars],
    ['🔄 Routes', stats.routes],
    ['🚍 Trips', stats.trips],
    ['🛑 Stops', stats.stops]
  );

  config.log(table.toString());
};

/*
 * Print a progress bar to the console.
 */
exports.progressBar = (formatString, barOptions, config) => {
  if (config.logFunction) {
    let barProgress = 0;
    const renderProgressString = () => {
      return formatString
        .replace(':current', barProgress)
        .replace(':total', barOptions.total)
        .replace('[:bar] ', '');
    }
    config.log(renderProgressString());

    return {
      interrupt: text => {
        config.logWarning(text);
      },
      tick: () => {
        barProgress += 1;
        config.log(renderProgressString());
      }
    }
  } else {
    const bar = new ProgressBar(formatString, barOptions);
    bar.render();
  
    return {
      interrupt: text => {
        bar.interrupt(text);
      },
      tick: () => {
        bar.tick();
      }
    }
  }
};
