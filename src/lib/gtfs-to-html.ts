import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { openDb, importGtfs } from 'gtfs';
import sanitize from 'sanitize-filename';
import Timer from 'timer-machine';
import untildify from 'untildify';

import {
  prepDirectory,
  copyStaticAssets,
  generateFolderName,
  renderPdf,
  zipFolder,
  generateFileName,
} from './file-utils.js';
import {
  progressBar,
  generateLogText,
  logStats,
  logError,
  log,
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

import type { Config } from '../types/global_interfaces.js';

/*
 * Generate HTML timetables from GTFS.
 */
/* eslint-disable complexity */
const gtfsToHtml = async (initialConfig: Config) => {
  const config = setDefaultConfig(initialConfig);
  const timer = new Timer();

  const agencyKey = config.agencies
    .map(
      (agency: { agencyKey?: string; agency_key?: string }) =>
        agency.agencyKey ?? agency.agency_key ?? 'unknown',
    )
    .join('-');
  const outputPath = config.outputPath
    ? untildify(config.outputPath)
    : path.join(process.cwd(), 'html', sanitize(agencyKey));

  timer.start();

  await prepDirectory(outputPath, config);

  try {
    openDb(config);
  } catch (error: any) {
    if (error?.code === 'SQLITE_CANTOPEN') {
      logError(config)(
        `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`,
      );
    }

    throw error;
  }

  if (!config.agencies || config.agencies.length === 0) {
    throw new Error('No agencies defined in `config.json`');
  }

  if (!config.skipImport) {
    await importGtfs(config);
  }

  const stats: {
    timetables: number;
    timetablePages: number;
    calendars: number;
    routes: number;
    trips: number;
    stops: number;
    warnings: string[];
    [key: string]: number | string[];
  } = {
    timetables: 0,
    timetablePages: 0,
    calendars: 0,
    routes: 0,
    trips: 0,
    stops: 0,
    warnings: [],
  };

  const timetablePages = [];
  const timetablePageIds = getTimetablePagesForAgency(config).map(
    (timetablePage) => timetablePage.timetable_page_id,
  );

  if (config.noHead !== true && ['html', 'pdf'].includes(config.outputFormat)) {
    await copyStaticAssets(config, outputPath);
  }

  const bar = progressBar(
    `${agencyKey}: Generating ${config.outputFormat.toUpperCase()} timetables {bar} {value}/{total}`,
    timetablePageIds.length,
    config,
  );

  /* eslint-disable no-await-in-loop */
  for (const timetablePageId of timetablePageIds) {
    try {
      const timetablePage = await getFormattedTimetablePage(
        timetablePageId,
        config,
      );

      for (const timetable of timetablePage.timetables) {
        for (const warning of timetable.warnings) {
          stats.warnings.push(warning);
          bar?.interrupt(warning);
        }
      }

      if (timetablePage.consolidatedTimetables.length === 0) {
        throw new Error(
          `No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`,
        );
      }

      stats.timetables += timetablePage.consolidatedTimetables.length;
      stats.timetablePages += 1;

      const datePath = generateFolderName(timetablePage);

      // Make directory if it doesn't exist
      await mkdir(path.join(outputPath, datePath), { recursive: true });
      config.assetPath = '../';

      timetablePage.relativePath = path.join(
        datePath,
        sanitize(timetablePage.filename),
      );

      if (config.outputFormat === 'csv') {
        for (const timetable of timetablePage.consolidatedTimetables) {
          const csv = await generateTimetableCSV(timetable);
          const csvPath = path.join(
            outputPath,
            datePath,
            generateFileName(timetable, config, 'csv'),
          );
          await writeFile(csvPath, csv);
        }
      } else {
        const html = await generateTimetableHTML(timetablePage, config);
        const htmlPath = path.join(
          outputPath,
          datePath,
          sanitize(timetablePage.filename),
        );
        await writeFile(htmlPath, html);

        if (config.outputFormat === 'pdf') {
          await renderPdf(htmlPath);
        }
      }

      timetablePages.push(timetablePage);
      const timetableStats = generateStats(timetablePage);

      stats.stops += timetableStats.stops;
      stats.routes += timetableStats.routes;
      stats.trips += timetableStats.trips;
      stats.calendars += timetableStats.calendars;
    } catch (error: any) {
      stats.warnings.push(error?.message);
      bar?.interrupt(error.message);
    }

    bar?.increment();
  }
  /* eslint-enable no-await-in-loop */

  if (config.outputFormat === 'html') {
    // Generate overview HTML
    config.assetPath = '';
    const html = await generateOverviewHTML(timetablePages, config);
    await writeFile(path.join(outputPath, 'index.html'), html);
  }

  // Generate log.txt
  const logText = generateLogText(stats, config);
  await writeFile(path.join(outputPath, 'log.txt'), logText);

  // Zip output, if specified
  if (config.zipOutput) {
    await zipFolder(outputPath);
  }

  const fullOutputPath = path.join(
    outputPath,
    config.zipOutput ? '/timetables.zip' : '',
  );

  // Print stats
  log(config)(
    `${agencyKey}: ${config.outputFormat.toUpperCase()} timetables created at ${fullOutputPath}`,
  );

  logStats(config)(stats);

  const seconds = Math.round(timer.time() / 1000);
  log(config)(
    `${agencyKey}: ${config.outputFormat.toUpperCase()} timetable generation required ${seconds} seconds`,
  );

  timer.stop();

  return fullOutputPath;
};
/* eslint-enable complexity */

export default gtfsToHtml;
