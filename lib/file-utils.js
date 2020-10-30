const path = require('path');

const _ = require('lodash');
const archiver = require('archiver');
const beautify = require('js-beautify').html_beautify;
const fs = require('fs-extra');
const pug = require('pug');
const puppeteer = require('puppeteer');
const sanitize = require('sanitize-filename');
const untildify = require('untildify');

const { isNullOrEmpty, formatDays } = require('./formatters');
const templateFunctions = require('./template-functions');

/*
 * Attempt to parse the specified config JSON file.
 */
exports.getConfig = async argv => {
  try {
    const data = await fs.readFile(path.resolve(untildify(argv.configPath)), 'utf8').catch(error => {
      console.error(new Error(`Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`));
      throw error;
    });
    const config = JSON.parse(data);

    if (argv.skipImport === true) {
      config.skipImport = argv.skipImport;
    }

    if (argv.showOnlyTimepoint === true) {
      config.showOnlyTimepoint = argv.showOnlyTimepoint;
    }

    return config;
  } catch (error) {
    console.error(new Error(`Cannot parse configuration file at \`${argv.configPath}\`. Check to ensure that it is valid JSON.`));
    throw error;
  }
};

/*
 * Get the full path of the template file for generating timetables based on
 * config.
 */
function getTemplatePath(templateFileName, config) {
  const folderPath = config.templatePath === undefined ? path.join(__dirname, '..', 'views/timetable/') : path.join(untildify(config.templatePath));
  const filename = `${templateFileName}${(config.noHead === true) ? '' : '_full'}.pug`;

  return path.join(folderPath, filename);
}

/*
 * Prepare the specified directory for saving HTML timetables by deleting
 * everything and creating the expected folders.
 */
exports.prepDirectory = async exportPath => {
  const staticAssetPath = path.join(__dirname, '..', 'public');
  await fs.remove(exportPath);
  await fs.ensureDir(exportPath);
  await fs.copy(path.join(staticAssetPath, 'css'), path.join(exportPath, 'css'));
  await fs.copy(path.join(staticAssetPath, 'js'), path.join(exportPath, 'js'));
};

/*
 * Zips the content of the specified folder.
 */
exports.zipFolder = exportPath => {
  const output = fs.createWriteStream(path.join(exportPath, 'timetables.zip'));
  const archive = archiver('zip');

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob(`${exportPath}/**/*.{txt,css,html}`);
    archive.finalize();
  });
};

/*
 * Generate the filename for a given timetable.
 */
exports.generateFileName = (timetable, config) => {
  let filename = timetable.timetable_id;

  for (const route of timetable.routes) {
    filename += isNullOrEmpty(route.route_short_name) ? `_${route.route_long_name.replace(/\s/g, '-')}` : `_${route.route_short_name.replace(/\s/g, '-')}`;
  }

  if (!isNullOrEmpty(timetable.direction_id)) {
    filename += `_${timetable.direction_id}`;
  }

  filename += `_${formatDays(timetable, config).replace(/\s/g, '')}.html`;

  return sanitize(filename).toLowerCase();
};

/*
 * Generates the folder name for a timetable page based on the date.
 */
exports.generateFolderName = timetablePage => {
  // Use first timetable in timetable page for start date and end date
  const timetable = timetablePage.consolidatedTimetables[0];
  if (!timetable.start_date || !timetable.end_date) {
    return 'timetables';
  }

  return sanitize(`${timetable.start_date}-${timetable.end_date}`);
};

/*
 * Render the HTML for a timetable based on the config.
 */
exports.renderFile = async (templateFileName, templateVars, config) => {
  const templatePath = getTemplatePath(templateFileName, config);

  // Make template functions and lodash available inside pug templates.
  const html = await pug.renderFile(templatePath, {
    _,
    ...templateFunctions,
    ...templateVars
  });

  // Beautify HTML if `beautify` is set in config.
  if (config.beautify === true) {
    return beautify(html, { indent_size: 2 });
  }

  return html;
};

/*
 * Render the PDF for a timetable based on the config.
 */
exports.renderPdf = async htmlPath => {
  const pdfPath = htmlPath.replace(/html$/, 'pdf');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.emulateMediaType('screen');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await page.pdf({ path: pdfPath });

  await browser.close();
};
