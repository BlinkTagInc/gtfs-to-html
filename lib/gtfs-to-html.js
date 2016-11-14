const _ = require('lodash');
const archiver = require('archiver');
const async = require('async');
const gtfs = require('gtfs');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const rimraf = require('rimraf');
const sanitize = require('sanitize-filename');
const mongoose = require('mongoose');

const utils = require('../lib/utils');


module.exports = (config, cb) => {
  const log = (config.verbose === false) ? _.noop : console.log;

  mongoose.Promise = global.Promise;
  mongoose.connect(config.mongo_url);

  async.eachSeries(config.agencies, (agency, cb) => {
    const agencyKey = agency.agency_key;
    const exportPath = path.join('html', sanitize(agencyKey));
    let timetablePages;

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
        utils.getTimetablePages(agencyKey, (err, results) => {
          if (err) return cb(err);

          timetablePages = results;
          return cb();
        });
      },
      (cb) => {
        // Build HTML timetables
        async.each(timetablePages, (timetablePage, cb) => {
          if (!timetablePage.timetables.length) {
            return cb(new Error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`));
          }

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
            (html, cb) => {
              // Write file
              log(`  Creating ${timetablePage.filename}`);
              fs.writeFile(path.join(exportPath, datePath, timetablePage.filename), html, cb);
            }
          ], cb);
        }, cb);
      },
      (cb) => {
        // Create log file
        utils.generateLogText(agency, (err, logText) => {
          if (err) return cb(err);

          log(`  Writing ${path.join(exportPath, 'log.txt')}`);
          return fs.writeFile(path.join(exportPath, 'log.txt'), logText.join('\n'), cb);
        });
      },
      (cb) => {
        // Zip output, if desired
        if (!config.zipOutput) {
          log(`HTML schedules for ${agencyKey} created at ${process.cwd()}/${exportPath}`);
          cb();
        }

        const output = fs.createWriteStream(path.join(exportPath, 'gtfs.zip'));
        const archive = archiver('zip');

        output.on('close', () => {
          log(`HTML schedules for ${agencyKey} created and zipped at ${process.cwd()}/${exportPath}/gtfs.zip`);
          cb();
        });

        archive.on('error', cb);

        archive.pipe(output);

        archive.bulk([
          {
            expand: true,
            cwd: exportPath,
            src: ['**/*.txt', '**/*.css', '**/*.html']
          }
        ]);

        archive.finalize();
      }
    ], cb);
  }, cb);
}
