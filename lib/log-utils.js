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
    return process.stdout.write(`${overwrite === true ? '' : '\n'}${text}`);
  };
};

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
