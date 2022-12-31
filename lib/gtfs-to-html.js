import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { map } from 'lodash-es';
import { openDb, importGtfs } from 'gtfs';
import sanitize from 'sanitize-filename';
import Timer from 'timer-machine';

import {
  prepDirectory,
  copyStaticAssets,
  generateFolderName,
  renderPdf,
  zipFolder,
  generateCSVFileName,
} from './file-utils.js';
import {
  log,
  logWarning,
  logError,
  progressBar,
  generateLogText,
  logStats,
} from './log-utils.js';
import {
  setDefaultConfig,
  getTimetablePagesForAgency,
  getFormattedTimetablePage,
  generateTimetableHTML,
  generateTimetableCSV,
  generateOverviewHTML,
  generateStats,
} from './utils.js';

/*
 * Generate HTML timetables from GTFS.
 */
/* eslint-disable complexity */
const gtfsToHtml = async (initialConfig) => {
  const config = setDefaultConfig(initialConfig);
  const timer = new Timer();

  config.log = log(config);
  config.logWarning = logWarning(config);
  config.logError = logError(config);

  timer.start();

  try {
    openDb(config);
  } catch (error) {
    if (error instanceof Error && error.code === 'SQLITE_CANTOPEN') {
      config.logError(
        `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`
      );
    }

    throw error;
  }

  if (!config.agencies || config.agencies.length === 0) {
    throw new Error('No agencies defined in `config.json`');
  }

  if (!config.skipImport) {
    // Import GTFS
    await importGtfs(config);
  }

  const agencyKey = config.agencies
    .map((agency) => agency.agency_key)
    .join('-');
  const exportPath = path.join(process.cwd(), 'html', sanitize(agencyKey));
  const outputStats = {
    timetables: 0,
    timetablePages: 0,
    calendars: 0,
    trips: 0,
    routes: 0,
    stops: 0,
    warnings: [],
  };

  const timetablePages = [];
  const timetablePageIds = map(
    getTimetablePagesForAgency(config),
    'timetable_page_id'
  );
  await prepDirectory(exportPath);

  if (config.noHead !== true && ['html', 'pdf'].includes(config.outputFormat)) {
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
      const timetablePage = await getFormattedTimetablePage(
        timetablePageId,
        config
      );

      if (timetablePage.consolidatedTimetables.length === 0) {
        throw new Error(
          `No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`
        );
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

      timetablePage.relativePath = path.join(
        datePath,
        sanitize(timetablePage.filename)
      );

      if (config.outputFormat === 'csv') {
        for (const timetable of timetablePage.timetables) {
          const csv = await generateTimetableCSV(timetable);
          const csvPath = path.join(
            exportPath,
            datePath,
            generateCSVFileName(timetable, timetablePage)
          );
          await writeFile(csvPath, csv);
        }
      } else {
        const html = await generateTimetableHTML(timetablePage, config);
        const htmlPath = path.join(
          exportPath,
          datePath,
          sanitize(timetablePage.filename)
        );
        await writeFile(htmlPath, html);

        if (config.outputFormat === 'pdf') {
          await renderPdf(htmlPath);
        }
      }

      timetablePages.push(timetablePage);
      const timetableStats = generateStats(timetablePage);

      for (const key of Object.keys(outputStats)) {
        if (timetableStats[key]) {
          outputStats[key] += timetableStats[key];
        }
      }
    } catch (error) {
      outputStats.warnings.push(error.message);
      bar.interrupt(error.message);
    }

    bar.increment();
  }
  /* eslint-enable no-await-in-loop */

  if (config.outputFormat === 'html') {
    // Generate route summary index.html
    config.assetPath = '';
    const html = await generateOverviewHTML(timetablePages, config);
    await writeFile(path.join(exportPath, 'index.html'), html);
  }

  // Generate output log.txt
  const logText = generateLogText(outputStats, config);
  await writeFile(path.join(exportPath, 'log.txt'), logText);

  // Zip output, if specified
  if (config.zipOutput) {
    await zipFolder(exportPath);
  }

  const fullExportPath = path.join(
    exportPath,
    config.zipOutput ? '/timetables.zip' : ''
  );

  // Print stats
  config.log(
    `${agencyKey}: ${config.outputFormat.toUpperCase()} timetables created at ${fullExportPath}`
  );

  logStats(outputStats, config);

  const seconds = Math.round(timer.time() / 1000);
  config.log(
    `${agencyKey}: ${config.outputFormat.toUpperCase()} timetable generation required ${seconds} seconds`
  );

  timer.stop();
};
/* eslint-enable complexity */

export default gtfsToHtml;
