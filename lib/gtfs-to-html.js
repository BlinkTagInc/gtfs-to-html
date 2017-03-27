const fs = require('fs');
const path = require('path');

const _ = require('lodash');
const async = require('async');
const gtfs = require('gtfs');
const mkdirp = require('mkdirp-promise');
const rimraf = require('rimraf');
const sanitize = require('sanitize-filename');
const Table = require('cli-table');
const Timer = require('timer-machine');

const utils = require('../lib/utils');

module.exports = (config, cb) => {
  const defaults = {
    noHead: false,
    noServiceSymbol: '-',
    requestStopSymbol: '***',
    showMap: false,
    showOnlyTimepoint: false,
    showStopCity: false,
    verbose: true,
    zipOutput: false
  };

  Object.assign(defaults, config);

  const log = (config.verbose === false) ? _.noop : console.log;

  async.eachSeries(config.agencies, (agency, cb) => {
    const timer = new Timer();
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

    timer.start();

    log(`Generating HTML schedules for ${agencyKey}`);

    async.series([
      cb => {
        // Import GTFS
        const agencyConfig = _.clone(_.omit(config, 'agencies'));
        agencyConfig.agencies = [agency];
        gtfs.import(agencyConfig, cb);
      },
      cb => {
        // Cleanup any previously generated files
        rimraf(exportPath, cb);
      },
      cb => {
        // Create directory
        mkdirp(exportPath)
        .then(() => {
          cb();
        })
        .catch(cb);
      },
      cb => {
        // Copy CSS
        const inputFolder = path.join(__dirname, '..', 'public/timetable_styles.css');
        const outputFolder = path.join(exportPath, 'timetable_styles.css');
        fs.createReadStream(inputFolder).pipe(fs.createWriteStream(outputFolder));
        cb();
      },
      cb => {
        // Get timetable pages
        utils.getTimetablePages(agencyKey).then(results => {
          timetablePages = results;
          cb();
        }, cb);
      },
      cb => {
        // Build HTML timetables
        return Promise.all(timetablePages.map(timetablePage => {
          if (timetablePage.timetables.length === 0) {
            throw new Error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`);
          }

          outputStats.timetables += timetablePage.timetables.length;
          outputStats.timetablePages += 1;

          const datePath = utils.generateFolderName(timetablePage);

          // Make directory, if it doesn't exist
          return mkdirp(path.join(exportPath, datePath))
          .then(() => utils.generateHTML(agencyKey, timetablePage, config))
          .then(results => {
            Object.assign(outputStats, results.stats);

            // Write file
            log(`  Creating ${timetablePage.filename}`);
            return new Promise((resolve, reject) => {
              fs.writeFile(path.join(exportPath, datePath, timetablePage.filename), results.html, err => {
                if (err) {
                  return reject(err);
                }
                resolve();
              });
            });
          });
        }))
        .then(() => {
          cb();
        })
        .catch(cb);
      },
      cb => {
        // Create log file
        log(`  Export log for ${agencyKey} created at ${path.join(fullExportPath, 'log.txt')}`);
        utils.generateLogText(agency, outputStats).then(logText => {
          fs.writeFile(path.join(exportPath, 'log.txt'), logText.join('\n'), cb);
        }, cb);
      },
      cb => {
        // Zip output, if specified
        if (config.zipOutput) {
          return utils.zipFolder(exportPath).then(() => {
            cb();
          }, cb);
        }
        cb();
      },
      cb => {
        // Print stats
        let schedulePath = fullExportPath;
        if (config.zipOutput) {
          schedulePath += '/timetables.zip';
        }

        log(`HTML schedules for ${agencyKey} created at ${schedulePath}`);

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
      }
    ], cb);
  }, cb);
};
