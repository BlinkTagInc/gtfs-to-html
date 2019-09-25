const path = require('path');

const _ = require('lodash');
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
module.exports = initialConfig => {
  const config = utils.setDefaultConfig(initialConfig);
  config.log = logUtils.log(config);
  config.logWarning = logUtils.logWarning(config);

  if (!config.agencies || config.agencies.length === 0) {
    throw new Error('No agencies defined in `config.json`');
  }

  return Promise.all(config.agencies.map(async agency => {
    const timer = new Timer();
    const agencyKey = agency.agency_key;
    const exportPath = path.join(process.cwd(), 'html', sanitize(agencyKey));
    const outputStats = {
      timetables: 0,
      timetablePages: 0,
      calendars: 0,
      trips: 0,
      routes: 0,
      stops: 0
    };

    timer.start();

    if (!config.skipImport) {
      // Import GTFS
      const agencyConfig = _.clone(_.omit(config, 'agencies'));
      agencyConfig.agencies = [agency];

      await gtfs.import(agencyConfig);
    }

    const timetablePages = [];
    const timetablePageIds = _.map(await utils.getTimetablePages(agencyKey, config), 'timetable_page_id');
    await fileUtils.prepDirectory(exportPath);

    const bar = logUtils.progressBar(`${agencyKey}: Generating ${config.outputFormat.toUpperCase()} timetables [:bar] :current/:total`, {total: timetablePageIds.length}, config);

    /* eslint-disable no-await-in-loop */
    for (const timetablePageId of timetablePageIds) {
      const timetablePage = await utils.getFormattedTimetablePage(agencyKey, timetablePageId, config);

      if (timetablePage.timetables.length === 0) {
        bar.interrupt(logUtils.formatWarn(`${agencyKey}: No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`));
        continue;
      }

      outputStats.timetables += timetablePage.timetables.length;
      outputStats.timetablePages += 1;

      const datePath = fileUtils.generateFolderName(timetablePage);

      // Make directory if it doesn't exist
      await fs.ensureDir(path.join(exportPath, datePath));
      config.assetPath = '../';

      timetablePage.relativePath = path.join(datePath, sanitize(timetablePage.filename));

      const results = await utils.generateHTML(timetablePage, config);

      _.each(outputStats, (stat, key) => {
        if (results.stats[key]) {
          outputStats[key] += results.stats[key];
        }
      });

      const htmlPath = path.join(exportPath, datePath, sanitize(timetablePage.filename));
      await fs.writeFile(htmlPath, results.html);

      if (config.outputFormat === 'pdf') {
        await fileUtils.renderPdf(htmlPath);
      }

      bar.tick();
      timetablePages.push(timetablePage);
    }
    /* eslint-enable no-await-in-loop */

    // Generate route summary index.html
    config.assetPath = '';
    const html = await utils.generateOverviewHTML(agencyKey, timetablePages, config);
    await fs.writeFile(path.join(exportPath, 'index.html'), html);

    // Generate output log.txt
    const logText = await logUtils.generateLogText(agency, outputStats, config);
    await fs.writeFile(path.join(exportPath, 'log.txt'), logText);

    // Zip output, if specified
    if (config.zipOutput) {
      await fileUtils.zipFolder(exportPath);
    }

    let fullExportPath = exportPath + config.zipOutput ? '/timetables.zip' : '';
  
    timer.stop();

    // Print stats
    config.log(`${agencyKey}: ${config.outputFormat.toUpperCase()} timetables created at ${fullExportPath}`);

    logUtils.logStats(outputStats, config);

    const seconds = Math.round(timer.time() / 1000);
    config.log(`${agencyKey}: ${config.outputFormat.toUpperCase()} timetable generation required ${seconds} seconds`);
  }));
};
