#!/usr/bin/env node

const { resolve } = require('path');

const fs = require('fs-extra');

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

const gtfsToHtml = require('..');

function handleError(err) {
  console.error(err || 'Unknown Error');
  process.exit(1);
}

const getConfig = async () => {
  const data = await fs.readFile(resolve(argv.configPath), 'utf8').catch(() => {
    throw new Error(`Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`);
  });

  try {
    const config = JSON.parse(data);

    if (argv.skipImport === true) {
      config.skipImport = argv.skipImport;
    }

    if (argv.showOnlyTimepoint === true) {
      config.showOnlyTimepoint = argv.showOnlyTimepoint;
    }

    return config;
  } catch (error) {
    console.error(`Problem parsing configuration file at \`${argv.configPath}\``);
    handleError(error);
  }
};

getConfig()
  .then(async config => {
    await gtfsToHtml(config);

    process.exit();
  })
  .catch(error => {
    process.stdout.write('\n');
    console.error(error);
    process.exit();
  });
