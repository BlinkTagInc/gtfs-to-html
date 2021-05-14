import { clearLine, cursorTo } from 'node:readline';
import PrettyError from 'pretty-error';
import { noop } from 'lodash-es';
import chalk from 'chalk';
import { getFeedInfo } from 'gtfs';
import ProgressBar from 'progress';
import Table from 'cli-table';

const pe = new PrettyError();
pe.start();

/*
 * Creates text for a log of output details.
 */
export async function generateLogText(outputStats, config) {
  const feedInfo = await getFeedInfo();
  const feedVersion = (feedInfo.length > 0 && feedInfo[0].feed_version) ? feedInfo[0].feed_version : 'Unknown';

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

  for (const agency of config.agencies) {
    if (agency.url) {
      logText.push(`Source: ${agency.url}`);
    } else if (agency.path) {
      logText.push(`Source: ${agency.path}`);
    }
  }

  if (outputStats.warnings.length > 0) {
    logText.push('', 'Warnings:', ...outputStats.warnings);
  }

  return logText.join('\n');
}

/*
 * Returns a log function based on config settings
 */
export function log(config) {
  if (config.verbose === false) {
    return noop;
  }

  if (config.logFunction) {
    return config.logFunction;
  }

  return (text, overwrite) => {
    if (overwrite === true && process.stdout.isTTY) {
      clearLine(process.stdout, 0);
      cursorTo(process.stdout, 0);
    } else {
      process.stdout.write('\n');
    }

    process.stdout.write(text);
  };
}

/*
 * Returns an warning log function based on config settings
 */
export function logWarning(config) {
  if (config.logFunction) {
    return config.logFunction;
  }

  return text => {
    process.stdout.write(`\n${formatWarning(text)}\n`);
  };
}

/*
 * Returns an error log function based on config settings
 */
export function logError(config) {
  if (config.logFunction) {
    return config.logFunction;
  }

  return text => {
    process.stdout.write(`\n${formatError(text)}\n`);
  };
}

/*
 * Format console warning text
 */
export function formatWarning(text) {
  return `${chalk.yellow.underline('Warning')}${chalk.yellow(':')} ${chalk.yellow(text)}`;
}

/*
 * Format console error text
 */
export function formatError(error) {
  const message = error instanceof Error ? error.message : error;
  return `${chalk.red.underline('Error')}${chalk.red(':')} ${chalk.red(message.replace('Error: ', ''))}`;
}

/*
 * Print a table of stats to the console.
 */
export function logStats(stats, config) {
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
    ['🛑 Stops', stats.stops],
    ['⛔️ Warnings', stats.warnings.length]
  );

  config.log(table.toString());
}

/*
 * Print a progress bar to the console.
 */
export function progressBar(formatString, barOptions, config) {
  if (config.verbose === false) {
    return {
      interrupt: noop,
      tick: noop
    };
  }

  if (barOptions.total === 0) {
    return null;
  }

  if (config.logFunction) {
    let barProgress = 0;
    const renderProgressString = () => {
      return formatString
        .replace(':current', barProgress)
        .replace(':total', barOptions.total)
        .replace('[:bar] ', '');
    };

    config.log(renderProgressString());

    return {
      interrupt: text => {
        config.logWarning(text);
      },
      tick: () => {
        barProgress += 1;
        config.log(renderProgressString());
      }
    };
  }

  return new ProgressBar(formatString, barOptions);
}
