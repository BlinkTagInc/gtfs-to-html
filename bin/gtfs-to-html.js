#!/usr/bin/env node

const gtfsToHtml = require('../');
const path = require('path');
const argv = require('yargs')
    .usage('Usage: $0 --config ./config.json')
    .help()
    .option('c', {
      alias: 'config-path',
      describe: 'Path to config file',
      default: './config.json',
      type: 'string'
    })
    .option('n', {
      alias: 'nohead',
      describe: 'Skip header of HTML file',
      default: false,
      type: 'boolean'
    })
    .argv;

const configPath = path.join(process.cwd(), argv['config-path']);


function handleError(err) {
  console.error(err || 'Unknown Error');
  process.exit(1);
}


function getConfig() {
  try {
    const config = require(configPath);

    if (argv['skip-delete']) {
      config.skip_delete = argv['skip-delete'];
    }

    if (argv.nohead) {
      config.nohead = argv.nohead;
    }

    return config;
  } catch (err) {
    handleError(new Error(`Cannot find configuration file at \`${configPath}\`. Use config-sample.json as a starting point, pass --config-path option`));
  }
}


gtfsToHtml(getConfig(), (err) => {
  if (err) {
    handleError(err);
  }

  console.log('Completed Generating HTML schedules');
  process.exit();
});
