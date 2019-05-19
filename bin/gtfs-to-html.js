#!/usr/bin/env node

const {resolve} = require('path');

const fs = require('fs-extra');
const mongoose = require('mongoose');

// eslint-disable-next-line prefer-destructuring
const argv = require('yargs').usage('Usage: $0 --config ./config.json')
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

const gtfsToHtml = require('..');
const logUtils = require('../lib/log-utils');

function handleError(err) {
  logUtils.error(err || 'Unknown Error');
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

  return config;
};

getConfig()
  .catch(error => {
    console.error(new Error(`Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`));
    handleError(error);
  })
  .then(async config => {
    mongoose.Promise = global.Promise;
    mongoose.set('useCreateIndex', true);
    mongoose.connect(config.mongoUrl, {useNewUrlParser: true});

    await gtfsToHtml(config);

    process.exit();
  })
  .catch(handleError);
