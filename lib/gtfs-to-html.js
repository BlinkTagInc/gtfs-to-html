const _ = require('lodash');
const async = require('async');
const gtfs = require('gtfs');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const rimraf = require('rimraf');
const sanitize = require('sanitize-filename');
const mongoose = require('mongoose');
const Table = require('cli-table');

const utils = require('../lib/utils');


module.exports = (config, cb) => {
  const log = (config.verbose === false) ? _.noop : console.log;

  mongoose.Promise = global.Promise;
  mongoose.connect(config.mongo_url);

  async.eachSeries(config.agencies, (agency, cb) => {
    const agencyKey = agency.agency_key;
    const exportPath = path.join('html', sanitize(agencyKey));
    const fullExportPath = `${process.cwd()}/${exportPath}`;
    let timetablePages;
    const outputStats = {
      timetables: 0,
      timetablePages: 0,
      calendars: 0,
      trips: 0,
      routes: 0,
      stops: 0
    };

    log(`Generating HTML schedules for ${agencyKey}`);

    async.series([
      (cb) => {
        // Import GTFS
        const agencyConfig = _.clone(_.omit(config, 'agencies'));
        agencyConfig.agencies = [agency];
        gtfs.import(agencyConfig, cb);
      },
      (cb) => {
        // Cleanup any previously generated files
        rimraf(exportPath, cb);
      },
      (cb) => {
        // Create directory
        mkdirp(exportPath, cb);
      },
      (cb) => {
        // Copy CSS
        const inputFolder = path.join(__dirname, '..', 'public/timetable_styles.css');
        const outputFolder = path.join(exportPath, 'timetable_styles.css');
        fs.createReadStream(inputFolder).pipe(fs.createWriteStream(outputFolder));
        cb();
      },
      (cb) => {
        // Get timetable pages
        utils.getTimetablePages(agencyKey).then((results) => {
          timetablePages = results;
          cb();
        }, cb);
      },
      (cb) => {
        // Build HTML timetables
        async.each(timetablePages, (timetablePage, cb) => {
          if (!timetablePage.timetables.length) {
            return cb(new Error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`));
          }

          outputStats.timetables += timetablePage.timetables.length;
          outputStats.timetablePages += 1;

          const datePath = utils.generateFolderName(timetablePage);
          return async.waterfall([
            (cb) => {
              // Make directory, if it doesn't exist
              mkdirp(path.join(exportPath, datePath), cb);
            },
            (path, cb) => {
              // Generate HTML and pass to next function
              utils.generateHTML(agencyKey, timetablePage, config, cb);
            },
            (html, timetableStats, cb) => {
              Object.assign(outputStats, timetableStats);

              // Write file
              log(`  Creating ${timetablePage.filename}`);
              fs.writeFile(path.join(exportPath, datePath, timetablePage.filename), html, cb);
            }
          ], cb);
        }, cb);
      },
      (cb) => {
        // Create log file
        log(`  Export log for ${agencyKey} created at ${path.join(fullExportPath, 'log.txt')}`);
        utils.generateLogText(agency, outputStats).then((logText) => {
          fs.writeFile(path.join(exportPath, 'log.txt'), logText.join('\n'), cb);
        }, cb);
      },
      (cb) => {
        // Zip output, if specified
        if (config.zipOutput) {
          utils.zipFolder(exportPath).then(() => {
            cb();
          }, cb);
        } else {
          cb();
        }
      },
      (cb) => {
        // Print stats
        let schedulePath = fullExportPath;
        if (config.zipOutput) {
          schedulePath += '/gtfs.zip';
        }

        log(`HTML schedules for ${agencyKey} created at ${schedulePath}`);

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

        console.log(table.toString());
        cb();
      }
    ], cb);
  }, cb);
};
