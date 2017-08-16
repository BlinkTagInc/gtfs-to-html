const path = require('path');

const _ = require('lodash');
const fs = require('fs-extra');
const gtfs = require('gtfs');
const sanitize = require('sanitize-filename');
const Table = require('cli-table');
const Timer = require('timer-machine');

const fileUtils = require('./file-utils');
const formatters = require('./formatters');
const logUtils = require('./log-utils');
const utils = require('./utils');

module.exports = config => {
  const log = logUtils.log(config);

  if (!config.agencies || config.agencies.length === 0) {
    throw new Error('No agencies defined in `config.json`');
  }

  return Promise.all(config.agencies.map(async agency => {
    const timer = new Timer();
    const agencyKey = agency.agency_key;
    const exportPath = path.join('html', sanitize(agencyKey));
    const outputStats = {
      timetables: 0,
      timetablePages: 0,
      calendars: 0,
      trips: 0,
      routes: 0,
      stops: 0
    };

    timer.start();

    if (!config.skipImport) {
      // Import GTFS
      const agencyConfig = _.clone(_.omit(config, 'agencies'));
      agencyConfig.agencies = [agency];

      await gtfs.import(agencyConfig);
    }

    await fileUtils.prepDirectory(exportPath, path.join(__dirname, '..', 'public'));

    const timetablePages = await utils.getTimetablePages(agencyKey);

    for (const [idx, timetablePage] of timetablePages.entries()) {
      log(`${agencyKey}: Generating ${idx + 1} of ${timetablePages.length} HTML schedules\r`, true);

      if (timetablePage.timetables.length === 0) {
        throw new Error(`${agencyKey}: No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`);
      }

      outputStats.timetables += timetablePage.timetables.length;
      outputStats.timetablePages += 1;

      const datePath = fileUtils.generateFolderName(timetablePage);

      // Make directory, if it doesn't exist
      await fs.ensureDir(path.join(exportPath, datePath));
      config.assetPath = '../';
      timetablePage.path = path.join(__dirname, '..', exportPath, datePath, sanitize(timetablePage.filename));

      const results = await utils.generateHTML(timetablePage, config);
      _.each(outputStats, (stat, key) => {
        if (results.stats[key]) {
          outputStats[key] += results.stats[key];
        }
      });

      await fs.writeFile(path.join(exportPath, datePath, sanitize(timetablePage.filename)), results.html);
    }

    config.assetPath = '';
    const html = await utils.generateOverviewHTML(agencyKey, timetablePages, config);
    await fs.writeFile(path.join(exportPath, 'index.html'), html);

    const logText = await logUtils.generateLogText(agency, outputStats);
    await fs.writeFile(path.join(exportPath, 'log.txt'), logText.join('\n'));

    // Zip output, if specified
    if (config.zipOutput) {
      await fileUtils.zipFolder(exportPath);
    }

    // Print stats
    let fullExportPath = `${process.cwd()}/${exportPath}`;
    if (config.zipOutput) {
      fullExportPath += '/timetables.zip';
    }

    log(`${agencyKey}: HTML schedules created at ${fullExportPath}`);

    timer.stop();

    const table = new Table({
      colWidths: [40, 20],
      head: ['Item', 'Count']
    });

    table.push(
      ['Timetable Pages', outputStats.timetablePages],
      ['Timetables', outputStats.timetables],
      ['Calendar Service IDs', outputStats.calendars],
      ['Routes', outputStats.routes],
      ['Trips', outputStats.trips],
      ['Stops', outputStats.stops]
    );

    log(table.toString());
    log(`${agencyKey}: HTML schedule generation required ${formatters.msToSeconds(timer.time())} seconds`);
  }));
};
