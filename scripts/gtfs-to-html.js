const _ = require('underscore');
const async = require('async');
const fs = require('fs');
const gtfs = require('gtfs');
const mkdirp = require('mkdirp');
const path = require('path');
const rimraf = require('rimraf');
const sanitize = require('sanitize-filename');
const argv = require('yargs').argv;

const download = require('../node_modules/gtfs/scripts/download');
const utils = require('../lib/utils');

// check if this file was invoked direct through command line or required as an export
const invocation = (require.main === module) ? 'direct' : 'required';

let config = {};
if (invocation === 'direct') {
  try {
    config = require('../config');
  } catch (err) {
    console.error(new Error('Cannot find config.js. Use config-sample.js as a starting point'));
  }

  if (!config.agencies) {
    let message = 'No agency_key specified in config.js';
    message += 'Try adding \'capital-metro\' to the agencies in config.js to load transit data';
    console.error(new Error(message));
    process.exit();
  }
}

function main(config, cb) {
  const log = (config.verbose === false) ? _.noop : console.log;

  const options = _.extend(config, {
    nohead: !!argv.nohead
  });

  async.eachSeries(config.agencies, (agency, cb) => {
    const agencyKey = agency.agency_key;
    const exportPath = path.join('html', sanitize(agencyKey));
    let timetablePages;

    log(`Generating HTML schedules for ${agencyKey}`);

    async.series([
      (cb) => {
        // Download GTFS
        const agencyConfig = _.clone(_.omit(config, 'agencies'));
        agencyConfig.agencies = [agency];
        download(agencyConfig, cb);
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
          cb();
        });
      },
      (cb) => {
        // Build HTML timetables
        async.each(timetablePages, (timetablePage, cb) => {
          if (!timetablePage.timetables.length) {
            return cb(new Error('TimetablePage has no timetables'));
          }

          const datePath = utils.generateFolderName(timetablePage);
          async.waterfall([
            (cb) => {
              // Make directory, if it doesn't exist
              mkdirp(path.join(exportPath, datePath), cb);
            },
            (path, cb) => {
              // Generate HTML and pass to next function
              utils.generateHTML(agencyKey, timetablePage, options, cb);
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

          log('  Writing log.txt');
          return fs.writeFile(path.join(exportPath, 'log.txt'), logText.join('\n'), cb);
        });
      },
      (cb) => {
        log(`HTML schedules for ${agencyKey} created at ${process.cwd()}/${exportPath}`);
        cb();
      }
    ], cb);
  }, cb);
}

// Allow script to be called directly from commandline or required (for testable code)
if (invocation === 'direct') {
  main(config, (err) => {
    if (err) {
      console.error(err || 'Unknown Error');
      return process.exit(1);
    }

    console.log('Completed Generating HTML schedules');
    return process.exit();
  });
} else {
  module.exports = main;
}
