import { dirname, join, resolve } from 'node:path';
import { createWriteStream } from 'node:fs';
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

import * as _ from 'lodash-es';
import archiver from 'archiver';
import beautify from 'js-beautify';
import sanitizeHtml from 'sanitize-html';
import { renderFile } from 'pug';
import puppeteer from 'puppeteer';
import sanitize from 'sanitize-filename';
import untildify from 'untildify';
import { marked } from 'marked';

import {
  isNullOrEmpty,
  formatDays,
  formatRouteColor,
  formatRouteTextColor,
} from './formatters.js';
import * as templateFunctions from './template-functions.js';

import type { Config } from '../types/global_interfaces.js';

/*
 * Attempt to parse the specified config JSON file.
 */
export async function getConfig(argv) {
  let data;
  let config;

  try {
    data = await readFile(resolve(untildify(argv.configPath)), 'utf8');
  } catch (error) {
    throw new Error(
      `Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`,
    );
  }

  try {
    config = JSON.parse(data);
  } catch (error) {
    throw new Error(
      `Cannot parse configuration file at \`${argv.configPath}\`. Check to ensure that it is valid JSON.`,
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
 * Get the full path to the views folder.
 */
export function getPathToViewsFolder(config: Config) {
  if (config.templatePath) {
    return untildify(config.templatePath);
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Dynamically calculate the path to the views directory
  let viewsFolderPath;
  if (__dirname.endsWith('/dist/bin') || __dirname.endsWith('/dist/app')) {
    // When the file is in 'dist/bin' or 'dist/app'
    viewsFolderPath = resolve(__dirname, '../../views/default');
  } else if (__dirname.endsWith('/dist')) {
    // When the file is in 'dist'
    viewsFolderPath = resolve(__dirname, '../views/default');
  } else {
    // In case it's neither, fallback to project root
    viewsFolderPath = resolve(__dirname, '../../views/default');
  }

  return viewsFolderPath;
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
        throw new Error(
          `Unable to write to ${outputPath}. Try running this command from a writable directory.`,
        );
      }

      throw error;
    }
  }

  // Check if outputPath is empty
  const files = await readdir(outputPath);
  if (config.overwriteExistingFiles === false && files.length > 0) {
    throw new Error(
      `Output directory ${outputPath} is not empty. Please specify an empty directory.`,
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

  // Add libraries needed for GTFS-Realtime if present
  if (
    config.hasGtfsRealtimeVehiclePositions ||
    config.hasGtfsRealtimeTripUpdates ||
    config.hasGtfsRealtimeAlerts
  ) {
    await copyFile(
      'node_modules/pbf/dist/pbf.js',
      join(outputPath, 'js/pbf.js'),
    );
    await copyFile(
      'node_modules/gtfs-realtime-pbf-js-module/gtfs-realtime.browser.proto.js',
      join(outputPath, 'js/gtfs-realtime.browser.proto.js'),
    );
  }

  if (config.hasGtfsRealtimeAlerts) {
    await copyFile(
      'node_modules/anchorme/dist/browser/anchorme.min.js',
      join(outputPath, 'js//anchorme.min.js'),
    );
  }
}

/*
 * Zips the content of the specified folder.
 */
export function zipFolder(outputPath) {
  const output = createWriteStream(join(outputPath, 'timetables.zip'));
  const archive = archiver('zip');

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
 * Generate the filename for a given timetable.
 */
export function generateFileName(timetable, config, extension = 'html') {
  let filename = timetable.timetable_id;

  for (const route of timetable.routes) {
    filename += isNullOrEmpty(route.route_short_name)
      ? `_${route.route_long_name.replace(/\s/g, '-')}`
      : `_${route.route_short_name.replace(/\s/g, '-')}`;
  }

  if (!isNullOrEmpty(timetable.direction_id)) {
    filename += `_${timetable.direction_id}`;
  }

  filename += `_${formatDays(timetable, config).replace(/\s/g, '')}.${extension}`;

  return sanitize(filename).toLowerCase();
}

/*
 * Generates the folder name for a timetable page based on the date.
 */
export function generateFolderName(timetablePage) {
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
  templateVars,
  config: Config,
) {
  const templatePath = getPathToTemplateFile(templateFileName, config);

  // Make template functions, lodash and marked available inside pug templates.
  const html = await renderFile(templatePath, {
    _,
    md: (text: string) => sanitizeHtml(marked.parseInline(text) as string),
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
