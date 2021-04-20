const path = require('path');

const {
  each,
  map
} = require('lodash');
const fs = require('fs-extra');
const gtfs = require('gtfs');
const sanitize = require('sanitize-filename');
const Timer = require('timer-machine');

const fileUtils = require('./file-utils');
const logUtils = require('./log-utils');
const utils = require('./utils');

/*
 * Generate HTML timetables from GTFS.
 */
module.exports = async initialConfig => {
  const config = utils.setDefaultConfig(initialConfig);
  const timer = new Timer();

  config.log = logUtils.log(config);
  config.logWarning = logUtils.logWarning(config);
  config.logError = logUtils.logError(config);

  timer.start();

  await gtfs.openDb(config).catch(error => {
    if (error instanceof Error && error.code === 'SQLITE_CANTOPEN') {
      config.logError(`Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`);
    }

    throw error;
  });

  if (config.debug === true) {
    const db = gtfs.getDb();

    db.on('profile', (sql, nsecs) => {
      if (sql.startsWith('SELECT')) {
        console.log(sql);
        console.log(nsecs);
      }
    });
  }

  if (!config.agencies || config.agencies.length === 0) {
    throw new Error('No agencies defined in `config.json`');
  }

  if (!config.skipImport) {
    // Import GTFS
    await gtfs.import(config);
  }

  const agencyKey = config.agencies.map(agency => agency.agency_key).join('-');
  const exportPath = path.join(process.cwd(), 'html', sanitize(agencyKey));
  const outputStats = {
    timetables: 0,
    timetablePages: 0,
    calendars: 0,
    trips: 0,
    routes: 0,
    stops: 0,
    warnings: []
  };

  const timetablePages = [];
  const timetablePageIds = map(await utils.getTimetablePages(config), 'timetable_page_id');
  await fileUtils.prepDirectory(exportPath);

  if (config.noHead !== true) {
    await fileUtils.copyStaticAssets(exportPath);
  }

  const bar = logUtils.progressBar(`${agencyKey}: Generating ${config.outputFormat.toUpperCase()} timetables [:bar] :current/:total `, {
    total: timetablePageIds.length
  }, config);

  /* eslint-disable no-await-in-loop */
  for (const timetablePageId of timetablePageIds) {
    try {
      const timetablePage = await utils.getFormattedTimetablePage(timetablePageId, config);

      if (timetablePage.consolidatedTimetables.length === 0) {
        throw new Error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`);
      }

      for (const timetable of timetablePage.timetables) {
        for (const warning of timetable.warnings) {
          outputStats.warnings.push(warning);
          bar.interrupt(logUtils.formatWarning(warning));
        }
      }

      outputStats.timetables += timetablePage.consolidatedTimetables.length;
      outputStats.timetablePages += 1;

      const datePath = fileUtils.generateFolderName(timetablePage);

      // Make directory if it doesn't exist
      await fs.ensureDir(path.join(exportPath, datePath));
      config.assetPath = '../';

      timetablePage.relativePath = path.join(datePath, sanitize(timetablePage.filename));

      const results = await utils.generateHTML(timetablePage, config);

      each(outputStats, (stat, key) => {
        if (results.stats[key]) {
          outputStats[key] += results.stats[key];
        }
      });

      const htmlPath = path.join(exportPath, datePath, sanitize(timetablePage.filename));
      await fs.writeFile(htmlPath, results.html);

      if (config.outputFormat === 'pdf') {
        await fileUtils.renderPdf(htmlPath);
      }

      timetablePages.push(timetablePage);
    } catch (error) {
      outputStats.warnings.push(error.message);
      bar.interrupt(logUtils.formatWarning(error.message));
    }

    bar.tick();
  }
  /* eslint-enable no-await-in-loop */

  // Generate route summary index.html
  config.assetPath = '';
  const html = await utils.generateOverviewHTML(timetablePages, config);
  await fs.writeFile(path.join(exportPath, 'index.html'), html);

  // Generate output log.txt
  const logText = await logUtils.generateLogText(outputStats, config);
  await fs.writeFile(path.join(exportPath, 'log.txt'), logText);

  // Zip output, if specified
  if (config.zipOutput) {
    await fileUtils.zipFolder(exportPath);
  }

  const fullExportPath = path.join(exportPath, config.zipOutput ? '/timetables.zip' : '');

  // Print stats
  config.log(`${agencyKey}: ${config.outputFormat.toUpperCase()} timetables created at ${fullExportPath}`);

  logUtils.logStats(outputStats, config);

  const seconds = Math.round(timer.time() / 1000);
  config.log(`${agencyKey}: ${config.outputFormat.toUpperCase()} timetable generation required ${seconds} seconds`);

  timer.stop();
};
