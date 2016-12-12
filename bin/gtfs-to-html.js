#!/usr/bin/env node

const _ = require('lodash');
const gtfsToHtml = require('../');
const path = require('path');
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
    .argv;

const configPath = path.join(process.cwd(), argv.configPath);


function handleError(err) {
  console.error(err || 'Unknown Error');
  process.exit(1);
}


function getConfig() {
  try {
    const config = require(configPath);
    // Merge confiruration file with command-line arguments
    return _.merge(config, argv);
  } catch (err) {
    handleError(new Error(`Cannot find configuration file at \`${configPath}\`. Use config-sample.json as a starting point, pass --configPath option`));
  }
}


gtfsToHtml(getConfig(), (err) => {
  if (err) {
    handleError(err);
  }

  console.log('Completed Generating HTML schedules');
  process.exit();
});
