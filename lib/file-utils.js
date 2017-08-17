const path = require('path');

const archiver = require('archiver');
const beautify = require('js-beautify').html_beautify;
const fs = require('fs-extra');
const pug = require('pug');
const sanitize = require('sanitize-filename');
const untildify = require('untildify');

const formatters = require('./formatters');

exports.prepDirectory = (exportPath, assetPath) => {
  return fs.remove(exportPath)
  .then(() => fs.ensureDir(exportPath))
  .then(() => fs.copy(path.join(assetPath, 'css'), path.join(exportPath, 'css')))
  .then(() => fs.copy(path.join(assetPath, 'js'), path.join(exportPath, 'js')));
};

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

exports.generateFileName = (timetable, route) => {
  let routeName = route.route_short_name;
  if (routeName !== '' && routeName !== undefined) {
    routeName = route.route_long_name;
  }

  let filename = `${timetable.timetable_id}_${routeName}_`;

  if (timetable.direction_id !== '' && timetable.direction_id !== null) {
    filename += `${timetable.direction_id}_`;
  }

  filename += `${formatters.formatDays(timetable).toLowerCase()}.html`;

  return sanitize(filename).replace(/\s/g, '');
};

exports.generateFolderName = timetablePage => {
  // Use first timetable in timetable page for start date and end date
  const timetable = timetablePage.timetables[0];
  return sanitize(`${timetable.start_date}-${timetable.end_date}`);
};

exports.getTemplateFile = config => {
  if (config.templatePath !== undefined) {
    return untildify(config.templatePath);
  } else if (config.noHead === true) {
    return path.join(__dirname, '..', 'views/timetable/timetablepage.pug');
  }

  return path.join(__dirname, '..', 'views/timetable/timetablepage_full.pug');
};

exports.getOverviewTemplateFile = config => {
  if (config.templatePath !== undefined) {
    return path.join(path.dirname(untildify(config.templatePath)), 'overview.pug');
  } else if (config.noHead === true) {
    return path.join(__dirname, '..', 'views/timetable/overview.pug');
  }

  return path.join(__dirname, '..', 'views/timetable/overview_full.pug');
};

exports.renderFile = async (templatePath, templateVars, config) => {
  let html = await pug.renderFile(templatePath, templateVars);

  // Beautify HTML if setting is set
  if (config.beautify === true) {
    html = await beautify(html, {indent_size: 2});
  }
  return html;
};
