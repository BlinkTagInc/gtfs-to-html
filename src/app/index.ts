import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { map } from 'lodash-es';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { openDb } from 'gtfs';
import express from 'express';
import logger from 'morgan';
import untildify from 'untildify';

import { formatTimetableLabel } from '../lib/formatters.js';
import { getPathToViewsFolder } from '../lib/file-utils.js';
import {
  setDefaultConfig,
  getTimetablePagesForAgency,
  getFormattedTimetablePage,
  generateOverviewHTML,
  generateTimetableHTML,
} from '../lib/utils.js';

const argv = yargs(hideBin(process.argv))
  .option('c', {
    alias: 'configPath',
    describe: 'Path to config file',
    default: './config.json',
    type: 'string',
  })
  .parseSync();

const app = express();
const router: express.Router = express.Router();

const configPath =
  (argv.configPath as string) || join(process.cwd(), 'config.json');
const selectedConfig = JSON.parse(readFileSync(configPath, 'utf8'));

const config = setDefaultConfig(selectedConfig);
// Override noHead config option so full HTML pages are generated
config.noHead = false;
config.assetPath = '/';
config.log = console.log;
config.logWarning = console.warn;
config.logError = console.error;

try {
  openDb(config);
} catch (error: any) {
  if (error?.code === 'SQLITE_CANTOPEN') {
    config.logError(
      `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`,
    );
  }

  throw error;
}

/*
 * Show all timetable pages
 */
router.get('/', async (request, response, next) => {
  try {
    const timetablePages = [];
    const timetablePageIds = map(
      getTimetablePagesForAgency(config),
      'timetable_page_id',
    );

    for (const timetablePageId of timetablePageIds) {
      // eslint-disable-next-line no-await-in-loop
      const timetablePage = await getFormattedTimetablePage(
        timetablePageId,
        config,
      );

      if (
        !timetablePage.consolidatedTimetables ||
        timetablePage.consolidatedTimetables.length === 0
      ) {
        console.error(
          `No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`,
        );
      }

      timetablePage.relativePath = `/timetables/${timetablePage.timetable_page_id}`;
      for (const timetable of timetablePage.consolidatedTimetables) {
        timetable.timetable_label = formatTimetableLabel(timetable);
      }

      timetablePages.push(timetablePage);
    }

    const html = await generateOverviewHTML(timetablePages, config);
    response.send(html);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

/*
 * Show a specific timetable page
 */
router.get('/timetables/:timetablePageId', async (request, response, next) => {
  const { timetablePageId } = request.params;

  if (!timetablePageId) {
    return next(new Error('No timetablePageId provided'));
  }

  try {
    const timetablePage = await getFormattedTimetablePage(
      timetablePageId,
      config,
    );

    const html = await generateTimetableHTML(timetablePage, config);
    response.send(html);
  } catch (error) {
    next(error);
  }
});

app.set('views', getPathToViewsFolder(config));
app.set('view engine', 'pug');

app.use(logger('dev'));

// Serve static assets
const staticAssetPath =
  config.templatePath === undefined
    ? getPathToViewsFolder(config)
    : untildify(config.templatePath);

app.use(express.static(staticAssetPath));
app.use(
  '/js',
  express.static(
    join(dirname(fileURLToPath(import.meta.resolve('pbf'))), 'dist'),
  ),
);
app.use(
  '/js',
  express.static(
    dirname(fileURLToPath(import.meta.resolve('gtfs-realtime-pbf-js-module'))),
  ),
);

app.use('/', router);
app.set('port', process.env.PORT || 3000);

const server = app.listen(app.get('port'), () => {
  console.log(`Express server listening on port ${app.get('port')}`);
});
