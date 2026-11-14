import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

import { isGtfsError } from 'gtfs';
import { openGtfs, normalizeAgencyKeys, sourceId } from './gtfs-config.js';
import { createGtfsReader } from './gtfs-reader.js';
import sanitize from 'sanitize-filename';

import {
  prepDirectory,
  copyStaticAssets,
  generateFolderName,
  renderPdf,
  zipFolder,
  generateCSVFileName,
  untildify,
} from './file-utils.js';
import { progressBar, generateLogText, logStats, log } from './log-utils.js';
import {
  setDefaultConfig,
  getTimetablePagesForAgency,
  getFormattedTimetablePage,
  generateTimetableHTML,
  generateTimetableCSV,
  generateOverviewHTML,
  generateStats,
} from './utils.js';
import {
  GtfsToHtmlError,
  GtfsToHtmlErrorCategory,
  GtfsToHtmlErrorCode,
  toGtfsToHtmlError,
} from './errors.js';

import type {
  Config,
  ConfigAgency,
  TimetablePageSummary,
} from '../types/index.ts';

/*
 * Generate HTML timetables from GTFS.
 */
const generateSource = async (initialConfig: Config) => {
  const config = setDefaultConfig(initialConfig);

  // Start timer
  const startTime = process.hrtime.bigint();

  const agencyKey = config.agencies
    .map((agency: ConfigAgency) => sourceId(agency))
    .join('-');
  const outputPath = config.outputPath
    ? untildify(config.outputPath)
    : path.join(process.cwd(), 'html', sanitize(agencyKey));

  const gtfs = openGtfs(config, config.agencies[0]);
  const data = createGtfsReader(gtfs);

  try {
    if (!config.agencies || config.agencies.length === 0) {
      throw new GtfsToHtmlError('No agencies defined in `config.json`', {
        code: GtfsToHtmlErrorCode.CONFIG_MISSING_AGENCIES,
        category: GtfsToHtmlErrorCategory.CONFIG,
        details: { field: 'agencies' },
      });
    }

    if (!config.skipImport) {
      try {
        const result = await gtfs.import();
        if (!result.success) {
          throw new Error(
            `GTFS import failed: ${JSON.stringify(result.errors)}`,
          );
        }
      } catch (error: unknown) {
        if (isGtfsError(error)) {
          throw error;
        }

        throw toGtfsToHtmlError(error, {
          message:
            error instanceof Error ? error.message : 'GTFS import failed',
          code: GtfsToHtmlErrorCode.GTFS_IMPORT_FAILED,
          category: GtfsToHtmlErrorCategory.GTFS,
        });
      }
    }

    if ((await data.agencies()).length === 0) {
      throw new Error(
        `No agencies imported for source ${sourceId(config.agencies[0])}`,
      );
    }
    await prepDirectory(outputPath, config);

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

    const timetablePageSummaries: TimetablePageSummary[] = [];
    const timetablePageIds = (
      await getTimetablePagesForAgency(data, config)
    ).map((timetablePage) => timetablePage.timetable_page_id);

    if (
      config.noHead !== true &&
      ['html', 'pdf'].includes(config.outputFormat)
    ) {
      await copyStaticAssets(config, outputPath);
    }

    const bar = progressBar(
      `${agencyKey}: Generating ${config.outputFormat.toUpperCase()} timetables {bar} {value}/{total}`,
      timetablePageIds.length,
      config,
    );

    for (const timetablePageId of timetablePageIds) {
      try {
        const timetablePage = await getFormattedTimetablePage(
          data,
          timetablePageId as string,
          config,
          (warning) => {
            const message = `timetable_page_id=${timetablePageId}: ${warning}`;
            stats.warnings.push(message);
            bar?.interrupt(message);
          },
        );

        for (const timetable of timetablePage.consolidatedTimetables) {
          if (timetable.warnings) {
            for (const warning of timetable.warnings) {
              stats.warnings.push(warning);
              bar?.interrupt(warning);
            }
          }
        }

        if (timetablePage.consolidatedTimetables.length === 0) {
          throw new GtfsToHtmlError(
            `No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`,
            {
              code: GtfsToHtmlErrorCode.TIMETABLE_GENERATION_FAILED,
              category: GtfsToHtmlErrorCategory.QUERY,
              details: { timetablePageId: timetablePage.timetable_page_id },
            },
          );
        }

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
              generateCSVFileName(timetable, config),
            );
            await writeFile(csvPath, csv);
          }
        } else {
          const html = await generateTimetableHTML(data, timetablePage, config);
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

        stats.timetables += timetablePage.consolidatedTimetables.length;
        stats.timetablePages += 1;

        // Only keep the fields the overview page template actually needs.
        timetablePageSummaries.push({
          timetable_page_id: timetablePage.timetable_page_id,
          relativePath: timetablePage.relativePath,
          filename: timetablePage.filename,
          timetable_page_label: timetablePage.timetable_page_label,
          dayList: timetablePage.dayList,
          route_ids: timetablePage.route_ids,
          agency_ids: timetablePage.agency_ids,
          consolidatedTimetables: timetablePage.consolidatedTimetables.map(
            (timetable) => ({ routes: timetable.routes }),
          ),
        });
        const timetableStats = generateStats(timetablePage);

        stats.stops += timetableStats.stops;
        stats.routes += timetableStats.routes;
        stats.trips += timetableStats.trips;
        stats.calendars += timetableStats.calendars;
      } catch (error: unknown) {
        if (!config.ignoreErrors) {
          throw error;
        }
        const warning = `Skipping timetable_page_id=${timetablePageId}: ${error instanceof Error ? error.message : String(error)}`;
        stats.warnings.push(warning);
        bar?.interrupt(warning);
      }

      bar?.increment();
    }

    if (config.outputFormat === 'html') {
      // Generate overview HTML
      config.assetPath = '';
      const html = await generateOverviewHTML(
        data,
        timetablePageSummaries,
        config,
      );
      await writeFile(path.join(outputPath, 'index.html'), html);
    }

    // Generate log.txt
    const logText = await generateLogText(data, stats, config);
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

    const endTime = process.hrtime.bigint();
    const elapsedSeconds = Number(endTime - startTime) / 1_000_000_000;

    log(config)(
      `${agencyKey}: ${config.outputFormat.toUpperCase()} timetable generation required ${elapsedSeconds.toFixed(1)} seconds`,
    );

    return fullOutputPath;
  } finally {
    await gtfs.close();
  }
};

const gtfsToHtml = async (initialConfig: Config) => {
  const config = setDefaultConfig(normalizeAgencyKeys(initialConfig));
  const outputPath = config.outputPath
    ? untildify(config.outputPath)
    : path.join(
        process.cwd(),
        'html',
        sanitize(config.agencies.map(sourceId).join('-')),
      );
  try {
    if (config.agencies.length === 1) {
      return await generateSource({ ...config, outputPath });
    }
    // Source directories avoid collisions in route IDs and feed-defined filenames.
    // Import/render each source with its own explicitly scoped instance.
    const links: string[] = [];
    for (const agency of config.agencies) {
      const folder = `source-${encodeURIComponent(sourceId(agency))}`;
      await generateSource({
        ...config,
        agencies: [agency],
        outputPath: path.join(outputPath, folder),
        zipOutput: false,
      });
      links.push(
        `<li><a href="${encodeURIComponent(folder)}/index.html">${sourceId(agency).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)}</a></li>`,
      );
    }
    if (config.outputFormat === 'html') {
      await writeFile(
        path.join(outputPath, 'index.html'),
        `<!doctype html><title>Transit timetables</title><ul>${links.join('')}</ul>`,
      );
    }
    if (config.zipOutput) {
      await zipFolder(outputPath);
      return path.join(outputPath, 'timetables.zip');
    }
    return outputPath;
  } finally {
    if (
      config.db === undefined &&
      config.deleteDbAfter &&
      config.sqlitePath &&
      config.sqlitePath !== ':memory:'
    ) {
      // Only remove a database after all owned connections have closed.
      // Recheck before deletion, including when opening/importing failed.
      const { assertCompatibleDatabase } = await import('./gtfs-config.js');
      const databasePath = untildify(config.sqlitePath);
      assertCompatibleDatabase(databasePath);
      await rm(databasePath, { force: true });
    }
  }
};

export default gtfsToHtml;
