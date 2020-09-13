#!/usr/bin/env node

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
    describe: 'Don’t import GTFS file.',
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

const fileUtils = require('../lib/file-utils');
const logUtils = require('../lib/log-utils');
const gtfsToHtml = require('..');

const handleError = err => {
  const text = err || 'Unknown Error';
  process.stdout.write(`\n${logUtils.formatError(text)}\n`);
  console.error(err);
  process.exit(1);
};

const setupImport = async () => {
  const config = await fileUtils.getConfig(argv);
  await gtfsToHtml(config);
  process.exit();
};

setupImport()
  .catch(handleError);
