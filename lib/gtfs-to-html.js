const path = require('path');

const _ = require('lodash');
const fs = require('fs-extra');
const gtfs = require('gtfs');
const sanitize = require('sanitize-filename');
const Table = require('cli-table');
const Timer = require('timer-machine');

const fileUtils = require('../lib/file-utils');
const utils = require('../lib/utils');

module.exports = selectedConfig => {
  const config = utils.setDefaultConfig(selectedConfig);

  const log = (config.verbose === false) ? _.noop : console.log;

  return Promise.all(config.agencies.map(agency => {
    const timer = new Timer();
    const agencyKey = agency.agency_key;
    const exportPath = path.join('html', sanitize(agencyKey));
    const assetPath = path.join(__dirname, '..', 'public');
    const outputStats = {
      timetables: 0,
      timetablePages: 0,
      calendars: 0,
      trips: 0,
      routes: 0,
      stops: 0
    };

    timer.start();

    log(`Generating HTML schedules for ${agencyKey}`);

    return new Promise((resolve, reject) => {
      if (config.skipImport) {
        return resolve();
      }

      // Import GTFS
      const agencyConfig = _.clone(_.omit(config, 'agencies'));
      agencyConfig.agencies = [agency];
      gtfs.import(agencyConfig, err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    })
    .then(() => fileUtils.prepDirectory(exportPath, assetPath))
    .then(() => utils.getTimetablePages(agencyKey))
    .then(timetablePages => {
      return Promise.all(timetablePages.map(timetablePage => {
        if (timetablePage.timetables.length === 0) {
          throw new Error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`);
        }

        outputStats.timetables += timetablePage.timetables.length;
        outputStats.timetablePages += 1;

        const datePath = fileUtils.generateFolderName(timetablePage);

        // Make directory, if it doesn't exist
        return fs.ensureDir(path.join(exportPath, datePath))
        .then(() => utils.generateHTML(agencyKey, timetablePage, config))
        .then(results => {
          Object.assign(outputStats, results.stats);
          return fileUtils.writeFile(path.join(exportPath, datePath), timetablePage.filename, results.html);
        });
      }));
    })
    .then(() => utils.generateLogText(agency, outputStats))
    .then(logText => fileUtils.writeFile(exportPath, 'log.txt', logText.join('\n')))
    .then(() => {
      // Zip output, if specified
      if (config.zipOutput) {
        return fileUtils.zipFolder(exportPath);
      }
    })
    .then(() => {
      // Print stats
      let fullExportPath = `${process.cwd()}/${exportPath}`;
      if (config.zipOutput) {
        fullExportPath += '/timetables.zip';
      }

      log(`HTML schedules for ${agencyKey} created at ${fullExportPath}`);

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
      log(`Timetable generation required ${Math.round(timer.time() / 1000)} seconds`);
    });
  }));
};
