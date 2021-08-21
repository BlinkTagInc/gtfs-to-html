import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { each, map } from 'lodash-es';
import { openDb, getDb, importGtfs } from 'gtfs';
import sanitize from 'sanitize-filename';
import Timer from 'timer-machine';

import { prepDirectory, copyStaticAssets, generateFolderName, renderPdf, zipFolder } from './file-utils.js';
import { log, logWarning, logError, progressBar, formatWarning, generateLogText, logStats } from './log-utils.js';
import { setDefaultConfig, getTimetablePagesForAgency, getFormattedTimetablePage, generateHTML, generateOverviewHTML } from './utils.js';

/*
 * Generate HTML timetables from GTFS.
 */
const gtfsToHtml = async initialConfig => {
  const config = setDefaultConfig(initialConfig);
  const timer = new Timer();

  config.log = log(config);
  config.logWarning = logWarning(config);
  config.logError = logError(config);

  timer.start();

  await openDb(config).catch(error => {
    if (error instanceof Error && error.code === 'SQLITE_CANTOPEN') {
      config.logError(`Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`);
    }

    throw error;
  });

  if (config.debug === true) {
    const db = getDb();

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
    await importGtfs(config);
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
  const timetablePageIds = map(await getTimetablePagesForAgency(config), 'timetable_page_id');
  await prepDirectory(exportPath);

  if (config.noHead !== true) {
    copyStaticAssets(exportPath);
  }

  const bar = progressBar(
    `${agencyKey}: Generating ${config.outputFormat.toUpperCase()} timetables {bar} {value}/{total}`,
    timetablePageIds.length,
    config
  );

  /* eslint-disable no-await-in-loop */
  for (const timetablePageId of timetablePageIds) {
    try {
      const timetablePage = await getFormattedTimetablePage(timetablePageId, config);

      if (timetablePage.consolidatedTimetables.length === 0) {
        throw new Error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`);
      }

      for (const timetable of timetablePage.timetables) {
        for (const warning of timetable.warnings) {
          outputStats.warnings.push(warning);
          bar.interrupt(warning);
        }
      }

      outputStats.timetables += timetablePage.consolidatedTimetables.length;
      outputStats.timetablePages += 1;

      const datePath = generateFolderName(timetablePage);

      // Make directory if it doesn't exist
      await mkdir(path.join(exportPath, datePath), { recursive: true });
      config.assetPath = '../';

      timetablePage.relativePath = path.join(datePath, sanitize(timetablePage.filename));

      const results = await generateHTML(timetablePage, config);

      each(outputStats, (stat, key) => {
        if (results.stats[key]) {
          outputStats[key] += results.stats[key];
        }
      });

      const htmlPath = path.join(exportPath, datePath, sanitize(timetablePage.filename));
      await writeFile(htmlPath, results.html);

      if (config.outputFormat === 'pdf') {
        await renderPdf(htmlPath);
      }

      timetablePages.push(timetablePage);
    } catch (error) {
      outputStats.warnings.push(error.message);
      bar.interrupt(error.message);
    }

    bar.increment();
  }
  /* eslint-enable no-await-in-loop */

  // Generate route summary index.html
  config.assetPath = '';
  const html = await generateOverviewHTML(timetablePages, config);
  await writeFile(path.join(exportPath, 'index.html'), html);

  // Generate output log.txt
  const logText = await generateLogText(outputStats, config);
  await writeFile(path.join(exportPath, 'log.txt'), logText);

  // Zip output, if specified
  if (config.zipOutput) {
    await zipFolder(exportPath);
  }

  const fullExportPath = path.join(exportPath, config.zipOutput ? '/timetables.zip' : '');

  // Print stats
  config.log(`${agencyKey}: ${config.outputFormat.toUpperCase()} timetables created at ${fullExportPath}`);

  logStats(outputStats, config);

  const seconds = Math.round(timer.time() / 1000);
  config.log(`${agencyKey}: ${config.outputFormat.toUpperCase()} timetable generation required ${seconds} seconds`);

  timer.stop();
};

export default gtfsToHtml;
