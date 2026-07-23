import { dirname, join, resolve } from 'node:path';
import cssEscape from 'css.escape';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  access,
  cp,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
} from 'node:fs/promises';
import { homedir } from 'node:os';

import * as _ from 'lodash-es';
import { uniqBy } from 'lodash-es';
import { ZipArchive } from 'archiver';
import beautify from 'js-beautify';
import xss from 'xss';
import { renderFile } from 'pug';
import puppeteer from 'puppeteer';
import sanitize from 'sanitize-filename';
import { marked } from 'marked';

import {
  isNullOrEmpty,
  formatDays,
  formatRouteColor,
  formatRouteTextColor,
  formatRouteNameForFilename,
} from './formatters.js';
import * as templateFunctions from './template-functions.js';
import {
  GtfsToHtmlError,
  GtfsToHtmlErrorCategory,
  GtfsToHtmlErrorCode,
} from './errors.js';

import type {
  Config,
  FormattedTimetable,
  FormattedTimetablePage,
} from '../types/index.ts';

const homeDirectory = homedir();

const localRequire = createRequire(import.meta.url);

interface ConfigArgv {
  configPath: string;
  skipImport?: boolean;
  showOnlyTimepoint?: boolean;
}

/*
 * Attempt to parse the specified config JSON file.
 */
export async function getConfig(argv: ConfigArgv) {
  let data;
  let config;

  try {
    data = await readFile(resolve(untildify(argv.configPath)), 'utf8');
  } catch (error) {
    throw new GtfsToHtmlError(
      `Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`,
      {
        code: GtfsToHtmlErrorCode.CONFIG_FILE_NOT_FOUND,
        category: GtfsToHtmlErrorCategory.CONFIG,
        details: { configPath: argv.configPath },
        cause: error,
      },
    );
  }

  try {
    config = JSON.parse(data);
  } catch (error) {
    throw new GtfsToHtmlError(
      `Cannot parse configuration file at \`${argv.configPath}\`. Check to ensure that it is valid JSON.`,
      {
        code: GtfsToHtmlErrorCode.CONFIG_PARSE_FAILED,
        category: GtfsToHtmlErrorCategory.CONFIG,
        details: { configPath: argv.configPath },
        cause: error,
      },
    );
  }

  if (argv.skipImport === true) {
    config.skipImport = argv.skipImport;
  }

  if (argv.showOnlyTimepoint === true) {
    config.showOnlyTimepoint = argv.showOnlyTimepoint;
  }

  return config;
}

/*
 * Get the full path to this module's folder. Resolve via the package name
 * (`gtfs-to-html/package.json`) so that bundlers and static-analysis tools
 * can statically determine the package root. The fallback handles local
 * development where the package isn't installed under `node_modules/gtfs-to-html`.
 */
export function getPathToThisModuleFolder() {
  try {
    return dirname(localRequire.resolve('gtfs-to-html/package.json'));
  } catch {
    const moduleDirectory = dirname(fileURLToPath(import.meta.url));

    if (
      moduleDirectory.endsWith('/dist/bin') ||
      moduleDirectory.endsWith('/dist/app')
    ) {
      return resolve(moduleDirectory, '../../');
    }

    if (moduleDirectory.endsWith('/dist')) {
      return resolve(moduleDirectory, '../');
    }

    return resolve(moduleDirectory, '../../');
  }
}

/*
 * Get the full path to the views folder.
 */
export function getPathToViewsFolder(config: Config) {
  if (config.templatePath) {
    return untildify(config.templatePath);
  }

  return join(getPathToThisModuleFolder(), 'views/default');
}

/*
 * Get the full path of a template file.
 */
function getPathToTemplateFile(templateFileName: string, config: Config) {
  const fullTemplateFileName =
    config.noHead !== true
      ? `${templateFileName}_full.pug`
      : `${templateFileName}.pug`;

  return join(getPathToViewsFolder(config), fullTemplateFileName);
}

/*
 * Prepare the outputPath directory for writing timetable files.
 */
export async function prepDirectory(outputPath: string, config: Config) {
  // Check if outputPath exists
  try {
    await access(outputPath);
  } catch (error: any) {
    try {
      await mkdir(outputPath, { recursive: true });
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new GtfsToHtmlError(
          `Unable to write to ${outputPath}. Try running this command from a writable directory.`,
          {
            code: GtfsToHtmlErrorCode.FILE_SYSTEM_WRITE_FAILED,
            category: GtfsToHtmlErrorCategory.FILE_SYSTEM,
            details: { outputPath, fsCode: error.code },
            cause: error,
          },
        );
      }

      throw error;
    }
  }

  // Check if outputPath is empty
  const files = await readdir(outputPath);
  if (config.overwriteExistingFiles === false && files.length > 0) {
    throw new GtfsToHtmlError(
      `Output directory ${outputPath} is not empty. Please specify an empty directory.`,
      {
        code: GtfsToHtmlErrorCode.OUTPUT_DIRECTORY_NOT_EMPTY,
        category: GtfsToHtmlErrorCategory.FILE_SYSTEM,
        details: { outputPath, fileCount: files.length },
      },
    );
  }

  // Delete all files in outputPath if `overwriteExistingFiles` is true
  if (config.overwriteExistingFiles === true) {
    await rm(join(outputPath, '*'), { recursive: true, force: true });
  }
}

/*
 * Copy needed CSS and JS to export path.
 */
export async function copyStaticAssets(config: Config, outputPath: string) {
  const viewsFolderPath = getPathToViewsFolder(config);
  const thisModuleFolderPath = getPathToThisModuleFolder();

  const foldersToCopy = ['css', 'js', 'img'];

  for (const folder of foldersToCopy) {
    if (
      await access(join(viewsFolderPath, folder))
        .then(() => true)
        .catch(() => false)
    ) {
      await cp(join(viewsFolderPath, folder), join(outputPath, folder), {
        recursive: true,
      });
    }
  }

  // Copy js libraries from node_modules if needed for GTFS-Realtime
  if (
    config.hasGtfsRealtimeVehiclePositions ||
    config.hasGtfsRealtimeTripUpdates ||
    config.hasGtfsRealtimeAlerts
  ) {
    await copyFile(
      join(thisModuleFolderPath, 'dist/browser/pbf.js'),
      join(outputPath, 'js/pbf.js'),
    );

    await copyFile(
      join(thisModuleFolderPath, 'dist/browser/gtfs-realtime.browser.proto.js'),
      join(outputPath, 'js/gtfs-realtime.browser.proto.js'),
    );
  }

  if (config.hasGtfsRealtimeAlerts) {
    await copyFile(
      join(thisModuleFolderPath, 'dist/browser/anchorme.min.js'),
      join(outputPath, 'js/anchorme.min.js'),
    );
  }

  if (config.showMap) {
    await copyFile(
      join(thisModuleFolderPath, 'dist/browser/maplibre-gl.js'),
      join(outputPath, 'js/maplibre-gl.js'),
    );

    await copyFile(
      join(thisModuleFolderPath, 'dist/browser/maplibre-gl.js.map'),
      join(outputPath, 'js/maplibre-gl.js.map'),
    );

    await copyFile(
      join(thisModuleFolderPath, 'dist/browser/maplibre-gl.css'),
      join(outputPath, 'css/maplibre-gl.css'),
    );

    await copyFile(
      join(thisModuleFolderPath, 'dist/browser/maplibre-gl-geocoder.js'),
      join(outputPath, 'js/maplibre-gl-geocoder.js'),
    );

    await copyFile(
      join(thisModuleFolderPath, 'dist/browser/maplibre-gl-geocoder.css'),
      join(outputPath, 'css/maplibre-gl-geocoder.css'),
    );
  }
}

/*
 * Zips the content of the specified folder.
 */
export function zipFolder(outputPath: string) {
  const output = createWriteStream(join(outputPath, 'timetables.zip'));
  const archive = new ZipArchive();

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob('**/*.{txt,css,js,png,jpg,jpeg,svg,csv,pdf,html}', {
      cwd: outputPath,
    });
    archive.finalize();
  });
}

/*
 * Generate the filename for an html file.
 */
export function generateTimetablePageFileName(
  timetablePage: FormattedTimetablePage,
  config: Config,
) {
  // If the timetable page is from timetable_pages.txt, use the filename specified.
  if (timetablePage.filename) {
    return sanitize(timetablePage.filename);
  }

  // Else if config.groupTimetablesIntoPages is true and all timetables share the same route, use the route as the filename
  if (
    config.groupTimetablesIntoPages === true &&
    uniqBy(timetablePage.timetables, 'route_id').length === 1
  ) {
    const route = timetablePage.timetables[0].routes[0];
    return sanitize(`${formatRouteNameForFilename(route).toLowerCase()}.html`);
  }

  const timetable = timetablePage.timetables[0];

  // Else use timetable_id for filename
  if (timetable.timetable_id) {
    return sanitize(
      `${timetable.timetable_id.replace(/\|/g, '_').toLowerCase()}.html`,
    );
  }

  // Else generate a detailed filename
  let filename = '';

  for (const route of timetable.routes) {
    filename += `_${formatRouteNameForFilename(route)}`;
  }

  if (!isNullOrEmpty(timetable.direction_id)) {
    filename += `_${timetable.direction_id}`;
  }

  filename += `_${formatDays(timetable, config).replace(/\s/g, '')}.html`;

  return sanitize(filename.toLowerCase());
}

/*
 * Generate the filename for a csv file.
 */
export function generateCSVFileName(
  timetable: FormattedTimetable,
  config: Config,
) {
  let filename = timetable.timetable_id ?? '';

  for (const route of timetable.routes) {
    filename += `_${formatRouteNameForFilename(route)}`;
  }

  if (!isNullOrEmpty(timetable.direction_id)) {
    filename += `_${timetable.direction_id}`;
  }

  filename += `_${formatDays(timetable, config).replace(/\s/g, '')}.csv`;

  return sanitize(filename).toLowerCase();
}

/*
 * Generates the folder name for a timetable page based on the date.
 */
export function generateFolderName(timetablePage: {
  consolidatedTimetables: Pick<FormattedTimetable, 'start_date' | 'end_date'>[];
}) {
  // Use first timetable in timetable page for start date and end date
  const timetable = timetablePage.consolidatedTimetables[0];
  if (!timetable.start_date || !timetable.end_date) {
    return 'timetables';
  }

  return sanitize(`${timetable.start_date}-${timetable.end_date}`);
}

/*
 * Render the HTML for a timetable based on the config.
 */
export async function renderTemplate(
  templateFileName: string,
  templateVars: Record<string, unknown>,
  config: Config,
) {
  const templatePath = getPathToTemplateFile(templateFileName, config);

  // Make template functions, lodash and marked available inside pug templates.
  const html = await renderFile(templatePath, {
    _,
    cssEscape,
    md: (text: string) => xss(marked.parseInline(text) as string),
    ...templateFunctions,
    formatRouteColor,
    formatRouteTextColor,
    ...templateVars,
  });

  // Beautify HTML if `beautify` is set in config.
  if (config.beautify === true) {
    return beautify.html_beautify(html, {
      indent_size: 2,
    });
  }

  return html;
}

/*
 * Render the PDF for a timetable based on the config.
 */
export async function renderPdf(htmlPath: string) {
  const pdfPath = htmlPath.replace(/html$/, 'pdf');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.emulateMediaType('print');
  await page.goto(`file://${htmlPath}`, {
    waitUntil: 'networkidle0',
  });
  await page.pdf({
    path: pdfPath,
  });

  await browser.close();
}

/**
 * Converts a tilde path to a full path
 * @param pathWithTilde The path to convert
 * @returns The full path
 */
export function untildify(pathWithTilde: string): string {
  return homeDirectory
    ? pathWithTilde.replace(/^~(?=$|\/|\\)/, homeDirectory)
    : pathWithTilde;
}
