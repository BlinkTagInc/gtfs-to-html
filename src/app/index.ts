import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { openDb } from 'gtfs';
import express from 'express';
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

const configPath =
  (argv.configPath as string) || join(process.cwd(), 'config.json');
const selectedConfig = JSON.parse(readFileSync(configPath, 'utf8'));

const config = setDefaultConfig(selectedConfig);
// Override noHead config option so full HTML pages are generated
config.noHead = false;
config.assetPath = '/';
config.logFunction = console.log;

try {
  openDb(config);
} catch (error: any) {
  console.error(
    `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists and run gtfs-to-html to import GTFS before running this app.`,
  );
  throw error;
}

app.set('views', getPathToViewsFolder(config));
app.set('view engine', 'pug');

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

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
app.use(
  '/js',
  express.static(
    join(
      dirname(fileURLToPath(import.meta.resolve('anchorme'))),
      '../../dist/browser',
    ),
  ),
);

// Show all timetable pages
app.get('/', async (req, res, next) => {
  try {
    const timetablePages = [];
    const timetablePageIds = getTimetablePagesForAgency(config).map(
      (timetablePage) => timetablePage.timetable_page_id,
    );

    for (const timetablePageId of timetablePageIds) {
      if (!timetablePageId) {
        continue;
      }

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
        continue;
      }

      timetablePage.relativePath = `/timetables/${timetablePage.timetable_page_id}`;
      for (const timetable of timetablePage.consolidatedTimetables) {
        timetable.timetable_label = formatTimetableLabel(timetable);
      }

      timetablePages.push(timetablePage);
    }

    const html = await generateOverviewHTML(timetablePages, config);
    res.send(html);
  } catch (error) {
    next(error);
  }
});

// Show a specific timetable page
app.get('/timetables/:timetablePageId', async (req, res, next) => {
  const { timetablePageId } = req.params;

  if (!timetablePageId) {
    res.status(400).send('No timetablePageId provided');
    return;
  }

  try {
    const timetablePage = await getFormattedTimetablePage(
      timetablePageId,
      config,
    );

    if (
      !timetablePage ||
      !timetablePage.consolidatedTimetables ||
      timetablePage.consolidatedTimetables.length === 0
    ) {
      res.status(404).send('Timetable page not found');
      return;
    }

    const html = await generateTimetableHTML(timetablePage, config);
    res.send(html);
  } catch (error: any) {
    if (error?.message.startsWith('No timetable found')) {
      res.status(404).send('Timetable page not found');
      return;
    }

    next(error);
  }
});

// Fallback 404 route
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
  },
);

const startServer = async (port: number): Promise<void> => {
  try {
    await new Promise<void>((resolve, reject) => {
      const server = app
        .listen(port)
        .once('listening', () => {
          console.log(`Express server listening on port ${port}`);
          resolve();
        })
        .once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying ${port + 1}`);
            server.close();
            resolve(startServer(port + 1));
          } else {
            reject(err);
          }
        });
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
startServer(port);
