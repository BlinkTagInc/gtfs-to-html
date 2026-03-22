import { GtfsErrorCategory, isGtfsError } from 'gtfs';

export enum GtfsToHtmlErrorCategory {
  CONFIG = 'config',
  DATABASE = 'database',
  GTFS = 'gtfs',
  FILE_SYSTEM = 'file_system',
  TEMPLATE = 'template',
  QUERY = 'query',
  VALIDATION = 'validation',
  INTERNAL = 'internal',
}

/**
 * Error codes are a public API contract and should remain stable.
 */
export enum GtfsToHtmlErrorCode {
  CONFIG_INVALID = 'GTFS_TO_HTML_CONFIG_INVALID',
  CONFIG_FILE_NOT_FOUND = 'GTFS_TO_HTML_CONFIG_FILE_NOT_FOUND',
  CONFIG_PARSE_FAILED = 'GTFS_TO_HTML_CONFIG_PARSE_FAILED',
  CONFIG_DATE_INVALID = 'GTFS_TO_HTML_CONFIG_DATE_INVALID',
  CONFIG_MISSING_AGENCIES = 'GTFS_TO_HTML_CONFIG_MISSING_AGENCIES',
  DATABASE_OPEN_FAILED = 'GTFS_TO_HTML_DATABASE_OPEN_FAILED',
  GTFS_IMPORT_FAILED = 'GTFS_TO_HTML_GTFS_IMPORT_FAILED',
  FILE_SYSTEM_WRITE_FAILED = 'GTFS_TO_HTML_FILE_SYSTEM_WRITE_FAILED',
  OUTPUT_DIRECTORY_NOT_EMPTY = 'GTFS_TO_HTML_OUTPUT_DIRECTORY_NOT_EMPTY',
  QUERY_RESULT_NOT_FOUND = 'GTFS_TO_HTML_QUERY_RESULT_NOT_FOUND',
  QUERY_RESULT_AMBIGUOUS = 'GTFS_TO_HTML_QUERY_RESULT_AMBIGUOUS',
  QUERY_INVALID = 'GTFS_TO_HTML_QUERY_INVALID',
  TIMETABLE_GENERATION_FAILED = 'GTFS_TO_HTML_TIMETABLE_GENERATION_FAILED',
}

interface GtfsToHtmlErrorOptions {
  code: GtfsToHtmlErrorCode;
  category: GtfsToHtmlErrorCategory;
  isOperational?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class GtfsToHtmlError extends Error {
  code: GtfsToHtmlErrorCode;
  category: GtfsToHtmlErrorCategory;
  isOperational: boolean;
  details?: Record<string, unknown>;

  constructor(message: string, options: GtfsToHtmlErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'GtfsToHtmlError';
    this.code = options.code;
    this.category = options.category;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
  }
}

export function isGtfsToHtmlError(error: unknown): error is GtfsToHtmlError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as Partial<GtfsToHtmlError> & { name?: unknown };

  return (
    candidate.name === 'GtfsToHtmlError' &&
    typeof candidate.message === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.isOperational === 'boolean'
  );
}

/**
 * GTFS parsing failures can come from parsing, validation or GTFS zip structure checks.
 */
export function isGtfsParsingError(error: unknown): boolean {
  return (
    isGtfsError(error) &&
    [
      GtfsErrorCategory.PARSE,
      GtfsErrorCategory.VALIDATION,
      GtfsErrorCategory.ZIP,
    ].includes(error.category)
  );
}

export function toGtfsToHtmlError(
  error: unknown,
  fallback: Omit<GtfsToHtmlErrorOptions, 'cause'> & { message: string },
): GtfsToHtmlError {
  if (isGtfsToHtmlError(error)) {
    return error;
  }

  return new GtfsToHtmlError(fallback.message, {
    ...fallback,
    cause: error,
  });
}

export function formatGtfsToHtmlError(
  error: unknown,
  options: { verbosity: 'user' | 'developer' } = { verbosity: 'developer' },
): string {
  if (!isGtfsToHtmlError(error)) {
    const message = error instanceof Error ? error.message : String(error);
    return options.verbosity === 'user' ? message : `UNKNOWN_ERROR: ${message}`;
  }

  if (options.verbosity === 'user') {
    return error.message;
  }

  return [
    `${error.code}: ${error.message}`,
    `category=${error.category}`,
    error.details ? `details=${JSON.stringify(error.details)}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}
