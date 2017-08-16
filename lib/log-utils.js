const _ = require('lodash');
const gtfs = require('gtfs');

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

  return logText;
};

exports.log = config => {
  if (config.verbose === false) {
    return _.noop;
  }

  return (text, overwrite) => {
    return process.stdout.write(`${overwrite !== true ? '\n' : ''}${text}`);
  };
};
