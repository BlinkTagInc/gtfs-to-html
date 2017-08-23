#!/usr/bin/env node

const resolve = require('path').resolve;

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
    .default('skipImport', undefined)
    .option('t', {
      alias: 'showOnlyTimepoint',
      describe: 'Show only stops with a `timepoint` value in `stops.txt`',
      type: 'boolean'
    })
    .default('showOnlyTimepoint', undefined)
    .argv;

const gtfsToHtml = require('../');
const logUtils = require('../lib/log-utils');
const utils = require('../lib/utils');

function handleError(err) {
  console.error(err || 'Unknown Error');
  process.exit(1);
}

const getConfig = async () => {
  const data = await fs.readFile(resolve(argv.configPath), 'utf8');
  const config = JSON.parse(data);

  if (argv.skipImport === true) {
    config.skipImport = argv.skipImport;
  }

  if (argv.showOnlyTimepoint === true) {
    config.showOnlyTimepoint = argv.showOnlyTimepoint;
  }

  return utils.setDefaultConfig(config);
};

getConfig()
.catch(err => {
  console.error(new Error(`Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`));
  handleError(err);
})
.then(async config => {
  const log = logUtils.log(config);

  mongoose.Promise = global.Promise;
  mongoose.connect(config.mongoUrl, {useMongoClient: true});

  await gtfsToHtml(config);

  log('Completed Generating HTML schedules\n');
  process.exit();
})
.catch(handleError);
