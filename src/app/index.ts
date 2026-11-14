import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { openGtfs, normalizeAgencyKeys, sourceId } from '../lib/gtfs-config.js';
import { createGtfsReader, type GtfsReader } from '../lib/gtfs-reader.js';
import express from 'express';

import { formatTimetableLabel } from '../lib/formatters.js';
import { getPathToViewsFolder, untildify } from '../lib/file-utils.js';
import {
  setDefaultConfig,
  getTimetablePagesForAgency,
  getFormattedTimetablePage,
  generateOverviewHTML,
  generateTimetableHTML,
} from '../lib/utils.js';
import { GtfsToHtmlErrorCode, isGtfsToHtmlError } from '../lib/errors.js';

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

const config = setDefaultConfig(normalizeAgencyKeys(selectedConfig));
// Override noHead config option so full HTML pages are generated
config.noHead = false;
config.assetPath = '/';
config.logFunction = console.log;

const readers = new Map<string, GtfsReader>();
try {
  for (const agency of config.agencies) {
    const gtfs = openGtfs({ ...config, skipImport: true }, agency);
    readers.set(sourceId(agency), createGtfsReader(gtfs));
    const inspection = await gtfs.schema.validate();
    if (!inspection.compatible) {
      throw new Error(
        'Incompatible GTFS database schema; run gtfs-to-html to reimport first',
      );
    }
  }
} catch (error) {
  await Promise.all([...readers.values()].map((reader) => reader.gtfs.close()));
  throw error;
}

const closeReaders = async () => {
  await Promise.all([...readers.values()].map((reader) => reader.gtfs.close()));
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await closeReaders();
    process.exit(0);
  });
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

const browserAssetsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../browser',
);

app.use('/js', express.static(browserAssetsPath));
app.use('/css', express.static(browserAssetsPath));

if (config.agencies.length > 1) {
  app.get('/', (req, res) => {
    res.send(
      `<!doctype html><title>Transit timetables</title><ul>${config.agencies
        .map((agency) => {
          const id = sourceId(agency);
          const label = id.replace(
            /[&<>"']/g,
            (character) => `&#${character.charCodeAt(0)};`,
          );
          return `<li><a href="/sources/${encodeURIComponent(id)}/">${label}</a></li>`;
        })
        .join('')}</ul>`,
    );
  });
}
for (const agency of config.agencies) {
  const data = readers.get(sourceId(agency))!;
  const sourceConfig = { ...config, agencies: [agency] };
  const basePath =
    config.agencies.length > 1
      ? `/sources/${encodeURIComponent(sourceId(agency))}`
      : '';
  const router = express.Router();
  app.use(basePath || '/', router);
  // Show all timetable pages
  router.get('/', async (req, res, next) => {
    try {
      const timetablePages = [];
      const timetablePageIds = (
        await getTimetablePagesForAgency(data, sourceConfig)
      ).map((timetablePage) => timetablePage.timetable_page_id);

      for (const timetablePageId of timetablePageIds) {
        if (!timetablePageId) {
          continue;
        }

        const timetablePage = await getFormattedTimetablePage(
          data,
          timetablePageId,
          sourceConfig,
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

        timetablePage.relativePath = `${basePath}/timetables/${encodeURIComponent(timetablePage.timetable_page_id)}`;
        for (const timetable of timetablePage.consolidatedTimetables) {
          timetable.timetable_label = formatTimetableLabel(timetable);
        }

        timetablePages.push(timetablePage);
      }

      const html = await generateOverviewHTML(
        data,
        timetablePages,
        sourceConfig,
      );
      res.send(html);
    } catch (error) {
      next(error);
    }
  });

  // Show a specific timetable page
  router.get('/timetables/:timetablePageId', async (req, res, next) => {
    const { timetablePageId } = req.params;

    if (!timetablePageId) {
      res.status(400).send('No timetablePageId provided');
      return;
    }

    try {
      const timetablePage = await getFormattedTimetablePage(
        data,
        timetablePageId,
        sourceConfig,
      );

      if (
        !timetablePage ||
        !timetablePage.consolidatedTimetables ||
        timetablePage.consolidatedTimetables.length === 0
      ) {
        res.status(404).send('Timetable page not found');
        return;
      }

      const html = await generateTimetableHTML(
        data,
        timetablePage,
        sourceConfig,
      );
      res.send(html);
    } catch (error: any) {
      if (
        isGtfsToHtmlError(error) &&
        error.code === GtfsToHtmlErrorCode.QUERY_RESULT_NOT_FOUND
      ) {
        res.status(404).send('Timetable page not found');
        return;
      }

      next(error);
    }
  });
}

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
    await closeReaders();
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
startServer(port);
