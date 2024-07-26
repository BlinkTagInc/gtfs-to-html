import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readFile, rm, mkdir } from 'node:fs/promises';

import copydir from 'copy-dir';
import _ from 'lodash-es';
import archiver from 'archiver';
import beautify from 'js-beautify';
import { renderFile } from 'pug';
import puppeteer from 'puppeteer';
import sanitize from 'sanitize-filename';
import untildify from 'untildify';
import insane from 'insane';
import { marked } from 'marked';

import {
  isNullOrEmpty,
  formatDays,
  formatRouteColor,
  formatRouteTextColor,
} from './formatters.js';
import * as templateFunctions from './template-functions.js';

/*
 * Attempt to parse the specified config JSON file.
 */
export async function getConfig(argv) {
  let data;
  let config;

  try {
    data = await readFile(path.resolve(untildify(argv.configPath)), 'utf8');
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
 * Get the full path of the template file for generating timetables based on
 * config.
 */
function getTemplatePath(templateFileName, config) {
  let fullTemplateFileName = templateFileName;
  if (config.noHead !== true) {
    fullTemplateFileName += '_full';
  }

  const templatePath =
    config.templatePath === undefined
      ? path.join(fileURLToPath(import.meta.url), '../../views/default')
      : untildify(config.templatePath);

  return path.join(templatePath, `${fullTemplateFileName}.pug`);
}

/*
 * Prepare the specified directory for saving HTML timetables by deleting everything.
 */
export async function prepDirectory(exportPath) {
  await rm(exportPath, { recursive: true, force: true });
  try {
    await mkdir(exportPath, { recursive: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Unable to write to ${exportPath}. Try running this command from a writable directory.`,
      );
    }

    throw error;
  }
}

/*
 * Copy needed CSS and JS to export path.
 */
export function copyStaticAssets(config, exportPath) {
  const staticAssetPath =
    config.templatePath === undefined
      ? path.join(fileURLToPath(import.meta.url), '../../views/default')
      : untildify(config.templatePath);

  copydir.sync(path.join(staticAssetPath, 'css'), path.join(exportPath, 'css'));
  copydir.sync(path.join(staticAssetPath, 'js'), path.join(exportPath, 'js'));
}

/*
 * Zips the content of the specified folder.
 */
export function zipFolder(exportPath) {
  const output = createWriteStream(path.join(exportPath, 'timetables.zip'));
  const archive = archiver('zip');

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob('**/*.{txt,css,js,html}', {
      cwd: exportPath,
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
export async function renderTemplate(templateFileName, templateVars, config) {
  const templatePath = getTemplatePath(templateFileName, config);

  // Make template functions, lodash and marked available inside pug templates.
  const html = await renderFile(templatePath, {
    _,
    md: (text) => insane(marked.parseInline(text)),
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
export async function renderPdf(htmlPath) {
  const pdfPath = htmlPath.replace(/html$/, 'pdf');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.emulateMediaType('screen');
  await page.goto(`file://${htmlPath}`, {
    waitUntil: 'networkidle0',
  });
  await page.pdf({
    path: pdfPath,
  });

  await browser.close();
}
