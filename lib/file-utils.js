const path = require('path');

const archiver = require('archiver');
const beautify = require('js-beautify').html_beautify;
const fs = require('fs-extra');
const pug = require('pug');
const sanitize = require('sanitize-filename');
const untildify = require('untildify');

const formatters = require('./formatters');

/*
 * Get the full path of the template file for generating timetables based on
 * config.
 */
function getTemplatePath(templateFileName, config) {
  const defaultFolderPath = path.join(__dirname, '..', 'views/timetable/');
  const folderPath = (config.templatePath === undefined) ? defaultFolderPath : path.join(untildify(config.templatePath));
  let templatePath;

  if (config.noHead === true) {
    templatePath = path.join(folderPath, `${templateFileName}.pug`);
  } else {
    templatePath = path.join(folderPath, `${templateFileName}_full.pug`);
  }

  return templatePath;
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
exports.generateFileName = timetable => {
  let routeName = timetable.route.route_short_name;
  if (routeName !== '' && routeName !== undefined) {
    routeName = timetable.route.route_long_name;
  }

  let filename = `${timetable.timetable_id}_${routeName}_`;

  if (timetable.direction_id !== '' && timetable.direction_id !== null) {
    filename += `${timetable.direction_id}_`;
  }

  filename += `${formatters.formatDays(timetable).toLowerCase()}.html`;

  return sanitize(filename).replace(/\s/g, '');
};

/*
 * Generates the folder name for a timetable page based on the date.
 */
exports.generateFolderName = timetablePage => {
  // Use first timetable in timetable page for start date and end date
  const timetable = timetablePage.timetables[0];
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
  let html = await pug.renderFile(templatePath, templateVars);

  // Beautify HTML if setting is set
  if (config.beautify === true) {
    html = await beautify(html, {indent_size: 2});
  }
  return html;
};
