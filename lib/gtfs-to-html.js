const fs = require('fs');
const path = require('path');

const _ = require('lodash');
const async = require('async');
const copy = require('copy');
const gtfs = require('gtfs');
const mkdirp = require('mkdirp-promise');
const rmrf = require('rmrf');
const sanitize = require('sanitize-filename');
const Table = require('cli-table');
const Timer = require('timer-machine');

const fileUtils = require('../lib/file-utils');
const utils = require('../lib/utils');

module.exports = (selectedConfig, cb) => {
  const config = utils.setDefaultConfig(selectedConfig);

  const log = (config.verbose === false) ? _.noop : console.log;

  function writeFile(filePath, fileName, html) {
    const cleanedFileName = sanitize(fileName);
    log(`  Creating ${cleanedFileName}`);
    return new Promise((resolve, reject) => {
      fs.writeFile(path.join(filePath, cleanedFileName), html, err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  async.eachSeries(config.agencies, (agency, cb) => {
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
    .then(() => rmrf(exportPath))
    .then(() => mkdirp(exportPath))
    .then(() => {
      return new Promise((resolve, reject) => {
        // Copy CSS
        const inputPath = path.join(__dirname, '..', 'public/css/*.css');
        const outputPath = path.join(exportPath, 'css');
        copy(inputPath, outputPath, err => {
          if(err) {
            return reject(err);
          }
          resolve();
        });
      });
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        // Copy JS
        const inputPath = path.join(__dirname, '..', 'public/js/*.js');
        const outputPath = path.join(exportPath, 'js');
        copy(inputPath, outputPath, err => {
          if(err) {
            return reject(err);
          }
          resolve();
        });
      });
    })
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
        return mkdirp(path.join(exportPath, datePath))
        .then(() => utils.generateHTML(agencyKey, timetablePage, config))
        .then(results => {
          Object.assign(outputStats, results.stats);
          return writeFile(path.join(exportPath, datePath), timetablePage.filename, results.html);
        });
      }));
    })
    .then(() => utils.generateLogText(agency, outputStats))
    .then(logText => writeFile(exportPath, 'log.txt', logText.join('\n')))
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
      cb();
    })
    .catch(cb);
  }, cb);
};
