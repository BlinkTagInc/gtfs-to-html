#!/usr/bin/env node

const _ = require('lodash');
const gtfsToHtml = require('../');
const fs = require('fs');
const resolve = require('path').resolve;
const mongoose = require('mongoose');
const argv = require('yargs')
    .usage('Usage: $0 --config ./config.json')
    .help()
    .option('c', {
      alias: 'configPath',
      describe: 'Path to config file',
      default: './config.json',
      type: 'string'
    })
    .option('n', {
      alias: 'noHead',
      describe: 'Skip header of HTML file',
      default: false,
      type: 'boolean'
    })
    .option('t', {
      alias: 'showOnlyTimepoint',
      describe: 'Show only stops with a `timepoint` value in `stops.txt`',
      default: true,
      type: 'boolean'
    })
    .argv;


function handleError(err) {
  console.error(err || 'Unknown Error');
  process.exit(1);
}


function getConfig(cb) {
  const configPath = resolve(argv.configPath);

  fs.readFile(configPath, 'utf8', (err, data) => {
    if (err) {
      cb(err);
    }

    const config = JSON.parse(data);

    // Merge confiruration file with command-line arguments
    cb(null, _.merge(config, argv));
  });
}


// Run gtfs-to-html
getConfig((err, config) => {
  if (err) {
    console.error(new Error(`Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`));
    handleError(err);
  }

  mongoose.Promise = global.Promise;
  mongoose.connect(config.mongoUrl);

  gtfsToHtml(config, (err) => {
    if (err) {
      handleError(err);
    }

    console.log('Completed Generating HTML schedules');
    process.exit();
  });
});
