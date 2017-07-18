#!/usr/bin/env node

const resolve = require('path').resolve;

const _ = require('lodash');
const fs = require('fs-extra');
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
    .option('s', {
      alias: 'skipImport',
      describe: 'Don\'t import GTFS file.',
      type: 'boolean'
    })
    .option('t', {
      alias: 'showOnlyTimepoint',
      describe: 'Show only stops with a `timepoint` value in `stops.txt`',
      default: true,
      type: 'boolean'
    })
    .argv;

const gtfsToHtml = require('../');
const utils = require('../lib/utils');

function handleError(err) {
  console.error(err || 'Unknown Error');
  process.exit(1);
}

const getConfig = async () => {
  const data = await fs.readFile(resolve(argv.configPath), 'utf8');
  return _.merge(JSON.parse(data), argv);
};

getConfig()
.catch(err => {
  console.error(new Error(`Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`));
  handleError(err);
})
.then(async config => {
  const log = utils.log(config);

  mongoose.Promise = global.Promise;
  mongoose.connect(config.mongoUrl);

  await gtfsToHtml(config);

  log('Completed Generating HTML schedules\n');
  process.exit();
})
.catch(handleError);
