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

  var options = {
    nohead: !!argv.nohead
  };

  var agencyKey = (typeof config.agencies[0] === 'string')  ? config.agencies[0] : config.agencies[0].agency_key;
  var exportPath = 'html/' + agencyKey;
  var routes;

  log('Generating HTML schedules for ' + agencyKey);

  async.series([
    function(cb) {
      // download GTFS
      download(config, cb);
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
      fs.createReadStream(path.join(__dirname, '..', 'public/timetable_styles.css')).pipe(fs.createWriteStream(exportPath + '/timetable_styles.css'));
      cb();
    },
    function(cb) {
      // get routes
      gtfs.getRoutesByAgency(agencyKey, function(e, results) {
        routes = results;
        cb(e);
      });
    },
    function(cb) {
      var directionIds = ['0', '1', undefined];

      async.each(routes, function(route, cb) {
        var routeId = route.route_id;

        async.each(directionIds, function(directionId, cb) {
          utils.generateHTML(agencyKey, routeId, directionId, options, function(e, html) {
            // ignore errors
            if(e) return cb();

            var fileName = route.route_short_name + '_' + routeId + ((directionId !== undefined) ? ('_' + directionId) : '') + '.html';

            log('  Creating ' + fileName);
            fs.writeFile(exportPath + '/' + fileName, html, cb);
          });
        }, cb);
      }, cb);
    }
  ], cb);
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
