var _ = require('underscore');
var async = require('async');
var download = require('../node_modules/gtfs/scripts/download');
var fs = require('fs');
var gtfs = require('gtfs');
var jade = require('jade');
var mkdirp = require('mkdirp');
var path = require('path');
var rimraf = require('rimraf');
var utils = require('../lib/utils');
var argv = require('yargs').argv;

// check if this file was invoked direct through command line or required as an export
var invocation = (require.main === module) ? 'direct' : 'required';

var config = {};
if (invocation === 'direct') {
  try {
    config = require('../config.js');
  } catch (e) {
    handleError(new Error('Cannot find config.js'));
  }

  if(!config.agencies){
    handleError(new Error('No agency_key specified in config.js\nTry adding \'capital-metro\' to the agencies in config.js to load transit data'));
    process.exit();
  }
}

function main(config, cb){
  var log = (config.verbose === false) ? function(){} : console.log;

  var options = _.extend(config, {
    nohead: !!argv.nohead
  });

  async.eachSeries(config.agencies, function(agency, cb) {
    var agencyKey = (typeof agency === 'string')  ? agency : agency.agency_key;
    var exportPath = path.join('html', agencyKey);
    var timetables;

    log('Generating HTML schedules for ' + agencyKey);

    async.series([
      function(cb) {
        // download GTFS
        var agencyConfig = _.clone(_.omit(config, 'agencies'));
        agencyConfig.agencies = [agency];
        download(agencyConfig, cb);
      },
      function(cb) {
        // cleanup any previously generated files
        rimraf(exportPath, cb);
      },
      function(cb) {
        // create directory
        mkdirp(exportPath, cb);
      },
      function(cb) {
        // copy css
        fs.createReadStream(path.join(__dirname, '..', 'public/timetable_styles.css'))
          .pipe(fs.createWriteStream(exportPath + '/timetable_styles.css'));
        cb();
      },
      function(cb) {
        // get timetables
        gtfs.getTimetablesByAgency(agencyKey, function(e, results) {
          timetables = results;
          cb(e);
        });
      },
      function(cb) {
        // build HTML timetables
        async.each(timetables, function(timetable, cb) {
          utils.generateHTML(agencyKey, timetable.timetable_id, options, function(e, html) {
            if(e) return cb(e);
            utils.generateFilename(agencyKey, timetable, function(e, filename) {
              if(e) return cb(e);
              var datePath = timetable.start_date + '-' + timetable.end_date;
              log('  Creating ' + filename);
              mkdirp.sync(path.join(exportPath, datePath));
              fs.writeFile(path.join(exportPath, datePath, filename), html, cb);
            });
          });
        }, cb);
      },
      function(cb) {
        // create log file
        gtfs.getFeedInfo(agencyKey, function(e, results) {
          if(e) cb(e);
          log('  Writing log.txt');
          var text = [
            'Feed Version: ' + results.feed_version,
            'Date Generated: ' + new Date()
          ];

          if(typeof (agency) == 'string') {
            text.push('Source: http://www.gtfs-data-exchange.com/agency/' + item + '/latest.zip');
          } else if(agency.url) {
            text.push('Source: ' + agency.url);
          } else if(agency.path) {
            text.push('Source: ' + agency.path);
          }

          fs.writeFile(path.join(exportPath, 'log.txt'), text.join('\n'), cb);
        });
      }
    ], cb);
  }, cb);
}

// allow script to be called directly from commandline or required (for testable code)
if (invocation === 'direct') {
  main(config, function(e) {
    if(e) {
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
