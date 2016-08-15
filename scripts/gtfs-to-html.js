const _ = require('underscore');
const async = require('async');
const fs = require('fs');
const gtfs = require('gtfs');
const mkdirp = require('mkdirp');
const path = require('path');
const rimraf = require('rimraf');
const sanitize = require('sanitize-filename');
const argv = require('yargs');

const download = require('../node_modules/gtfs/scripts/download');
const utils = require('../lib/utils');

// check if this file was invoked direct through command line or required as an export
const invocation = (require.main === module) ? 'direct' : 'required';

let config = {};
if (invocation === 'direct') {
  try {
    config = require('../config.js');
  } catch (e) {
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
    let timetables;

    log(`Generating HTML schedules for ${agencyKey}`);

    async.series([
      (cb) => {
        // download GTFS
        const agencyConfig = _.clone(_.omit(config, 'agencies'));
        agencyConfig.agencies = [agency];
        download(agencyConfig, cb);
      },
      (cb) => {
        // cleanup any previously generated files
        rimraf(exportPath, cb);
      },
      (cb) => {
        // create directory
        mkdirp(exportPath, cb);
      },
      (cb) => {
        // copy css
        fs.createReadStream(path.join(__dirname, '..', 'public/timetable_styles.css'))
          .pipe(fs.createWriteStream(`${exportPath}/timetable_styles.css`));
        cb();
      },
      (cb) => {
        // get timetables
        gtfs.getTimetablesByAgency(agencyKey, (e, results) => {
          timetables = results;
          cb(e);
        });
      },
      (cb) => {
        // build HTML timetables
        async.each(timetables, (timetable, cb) => {
          utils.generateHTML(agencyKey, timetable.timetable_id, options, (e, html) => {
            if (e) return cb(e);
            utils.generateFilename(agencyKey, timetable, (e, filename) => {
              if (e) return cb(e);
              const datePath = sanitize(`${timetable.start_date}-${timetable.end_date}`);
              log(`  Creating ${filename}`);
              mkdirp.sync(path.join(exportPath, datePath));
              fs.writeFile(path.join(exportPath, datePath, filename), html, cb);
            });
          });
        }, cb);
      },
      (cb) => {
        // create log file
        gtfs.getFeedInfo(agencyKey, (e, results) => {
          if (e) cb(e);
          const feedVersion = results ? results.feed_version : 'Unknown';

          log('  Writing log.txt');
          const text = [
            `Feed Version: ${feedVersion}`,
            `Date Generated: ${new Date()}`
          ];

          if (agency.url) {
            text.push(`Source: ${agency.url}`);
          } else if (agency.path) {
            text.push(`Source: ${agency.path}`);
          }

          fs.writeFile(path.join(exportPath, 'log.txt'), text.join('\n'), cb);
        });
      }
    ], cb);
  }, cb);
}

// allow script to be called directly from commandline or required (for testable code)
if (invocation === 'direct') {
  main(config, (e) => {
    if (e) {
      console.error(e || 'Unknown Error');
      process.exit(1);
    } else {
      console.log('Completed Generating HTML schedules');
      process.exit();
    }
  });
} else {
  module.exports = main;
}
