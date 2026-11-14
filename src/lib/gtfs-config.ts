import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Gtfs, type GtfsScheduleSourceConfig } from 'gtfs';
import type { Config, ConfigAgency } from '../types/config.js';
import { untildify } from './file-utils.js';

export function sourceId(agency: ConfigAgency): string {
  const id = agency.agencyKey ?? agency.agency_key;
  if (!id?.trim()) {
    throw new Error('Agency key has not been initialized');
  }
  return id;
}

export function normalizeAgencyKeys(config: Config) {
  if (!config.agencies?.length) {
    throw new Error('No agencies defined in config');
  }
  const explicitKeys = config.agencies
    .map((agency) => agency.agencyKey ?? agency.agency_key)
    .filter((key): key is string => Boolean(key?.trim()));
  if (new Set(explicitKeys).size !== explicitKeys.length) {
    throw new Error('Each explicit agencyKey must be unique');
  }
  const usedKeys = new Set(explicitKeys);
  const agencies = config.agencies.map((agency) => {
    const explicitKey = agency.agencyKey ?? agency.agency_key;
    if (explicitKey?.trim()) {
      return { ...agency, agencyKey: explicitKey };
    }
    // Stable across imports/reopens and reordering distinct feed inputs. Do not
    // include headers or feed contents: credentials and schedules can change.
    const input = agency.path
      ? `path:${resolve(untildify(agency.path))}`
      : agency.url
        ? `url:${agency.url}`
        : undefined;
    const base = input
      ? `feed-${createHash('sha256').update(input).digest('hex').slice(0, 16)}`
      : 'default';
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${base}-${suffix++}`;
    }
    usedKeys.add(key);
    return { ...agency, agencyKey: key };
  });
  for (const key of ['gtfsRealtimeExpirationSeconds']) {
    if (key in config) {
      throw new Error(`Unsupported legacy GTFS option ${key}`);
    }
  }
  for (const key of Object.keys(config.csvOptions ?? {})) {
    if (
      ![
        'encoding',
        'delimiter',
        'quote',
        'escape',
        'trim',
        'skip_empty_lines',
        'relax_quotes',
      ].includes(key)
    ) {
      throw new Error(
        `Unsupported csvOptions.${key}; use agencies[].import.csv with supported CSV options`,
      );
    }
  }
  for (const agency of config.agencies) {
    if ('prefix' in agency) {
      throw new Error(
        'The prefix option is no longer supported; use agencyKey. Original GTFS identifiers are preserved.',
      );
    }
  }
  return { ...config, agencies };
}

// Read-only preflight runs before Gtfs can enable WAL or alter the file.
export function assertCompatibleDatabase(path: string | undefined) {
  if (!path || path === ':memory:' || !existsSync(path)) {
    return;
  }
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const columns = db.prepare('PRAGMA table_info(agency)').all();
    if (
      columns.length > 0 &&
      !columns.some((column) => column.name === 'source_id')
    ) {
      throw new Error(
        `Database ${path} uses an incompatible database schema. Keep it for rollback and import the original feeds into a new database path.`,
      );
    }
  } finally {
    db.close();
  }
}

export function openGtfs(config: Config, agency: ConfigAgency): Gtfs {
  const path = config.sqlitePath ? untildify(config.sqlitePath) : ':memory:';
  if (config.db !== undefined) {
    if (!config.db || typeof config.db.prepare !== 'function') {
      throw new Error('db must be an open better-sqlite3 connection');
    }
    // Inspect the borrowed connection without opening or modifying another file.
    const columns = config.db.prepare('PRAGMA table_info(agency)').all() as {
      name: string;
    }[];
    if (
      columns.length > 0 &&
      !columns.some((column) => column.name === 'source_id')
    ) {
      throw new Error(
        'The supplied db uses an incompatible database schema. Keep it for rollback and import the original feeds into a new database.',
      );
    }
  } else {
    assertCompatibleDatabase(path);
  }
  if (config.skipImport && config.db === undefined && path === ':memory:') {
    throw new Error(
      'skipImport requires a persistent sqlitePath or db connection',
    );
  }
  if (agency.fillEmptyAgencyId && !agency.agencyId) {
    throw new Error('fillEmptyAgencyId requires agencyId');
  }
  const { skip_empty_lines, relax_quotes, ...csv } = config.csvOptions ?? {};
  const common = {
    excludeFiles: agency.exclude?.map((file) =>
      /\.(txt|csv|geojson)$/.test(file) ? file : `${file}.txt`,
    ) as GtfsScheduleSourceConfig['excludeFiles'],
    defaultAgencyId: agency.agencyId,
    import: {
      ...agency.import,
      csv: {
        ...csv,
        skipEmptyLines: skip_empty_lines,
        relaxQuotes: relax_quotes,
        ...agency.import?.csv,
      },
      validation: {
        ...(config.ignoreDuplicates === undefined
          ? {}
          : {
              onDuplicateKey: config.ignoreDuplicates
                ? ('keep-first' as const)
                : ('reject' as const),
            }),
        ...agency.import?.validation,
      },
    },
  };
  const schedule: GtfsScheduleSourceConfig | undefined = agency.path
    ? { ...common, path: untildify(agency.path) }
    : agency.url
      ? {
          ...common,
          url: agency.url,
          requestHeaders: agency.headers,
          timeoutMs: config.downloadTimeout,
        }
      : undefined;
  if (!config.skipImport && !schedule) {
    throw new Error(`No GTFS path or URL for source ${sourceId(agency)}`);
  }
  return new Gtfs({
    database: config.db === undefined ? { path } : { client: config.db },
    sources: [
      schedule
        ? { sourceId: sourceId(agency), schedule }
        : { sourceId: sourceId(agency) },
    ],
    extensions: ['gtfs-to-html', 'gtfs-plus'],
    reporting: {
      level:
        config.logLevel === 'warning'
          ? 'warn'
          : (config.logLevel ?? (config.verbose === false ? 'silent' : 'info')),
      reporter: (event) => {
        if (event.type === 'message') {
          (config.logFunction ?? console.log)(event.message);
        }
      },
    },
  });
}
