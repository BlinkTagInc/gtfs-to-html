import type {
  GtfsScheduleImportConfig,
  GtfsCsvParseOptions,
  GtfsBorrowedNativeSqliteDatabaseConfig,
} from 'gtfs';

export interface ConfigAgency {
  agencyKey?: string;
  /** @deprecated Use `agencyKey`. */
  agency_key?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string>;
  exclude?: string[];
  agencyId?: string;
  fillEmptyAgencyId?: boolean;
  import?: GtfsScheduleImportConfig;
  realtimeAlerts?: { url: string; headers?: Record<string, string> };
  realtimeTripUpdates?: { url: string; headers?: Record<string, string> };
  realtimeVehiclePositions?: { url: string; headers?: Record<string, string> };
}

export interface Config {
  agencies: ConfigAgency[];
  ignoreErrors?: boolean;
  ignoreDuplicates?: boolean;
  downloadTimeout?: number;
  csvOptions?: Omit<GtfsCsvParseOptions, 'skipEmptyLines' | 'relaxQuotes'> & {
    skip_empty_lines?: boolean;
    relax_quotes?: boolean;
  };
  logLevel?: 'silent' | 'error' | 'warning' | 'info';
  assetPath?: string;
  sqlitePath?: string;
  /** Caller-owned better-sqlite3 connection; takes precedence over sqlitePath. */
  db?: GtfsBorrowedNativeSqliteDatabaseConfig['client'];
  allowEmptyTimetables?: boolean;
  beautify?: boolean;
  coordinatePrecision?: number;
  dateFormat?: string;
  daysShortStrings?: string[];
  daysStrings?: string[];
  defaultOrientation?: string;
  deleteDbAfter?: boolean;
  effectiveDate?: string;
  endDate?: string;
  groupTimetablesIntoPages?: boolean;
  gtfsToHtmlVersion?: string;
  hasGtfsRealtimeVehiclePositions?: boolean;
  hasGtfsRealtimeTripUpdates?: boolean;
  hasGtfsRealtimeAlerts?: boolean;
  interpolatedStopSymbol?: string;
  interpolatedStopText?: string;
  linkStopUrls?: boolean;
  mapStyleUrl?: string;
  menuType?: 'none' | 'simple' | 'jump' | 'radio';
  noDropoffSymbol?: string;
  noDropoffText?: string;
  noHead?: boolean;
  noPickupSymbol?: string;
  noPickupText?: string;
  noRegularServiceDaysText?: string;
  noServiceSymbol?: string;
  noServiceText?: string;
  outputFormat?: 'html' | 'pdf' | 'csv';
  overwriteExistingFiles?: boolean;
  outputPath?: string;
  requestDropoffSymbol?: string;
  requestDropoffText?: string;
  requestPickupSymbol?: string;
  requestPickupText?: string;
  serviceNotProvidedOnText?: string;
  serviceProvidedOnText?: string;
  showArrivalOnDifference?: number;
  showCalendarExceptions?: boolean;
  showDuplicateTrips?: boolean;
  showMap?: boolean;
  showOnlyTimepoint?: boolean;
  showRouteTitle?: boolean;
  showStopCity?: boolean;
  showStopDescription?: boolean;
  showStoptimesForRequestStops?: boolean;
  skipImport?: boolean;
  sortingAlgorithm?: string;
  startDate?: string;
  templatePath?: string;
  timeFormat?: string;
  useParentStation?: boolean;
  verbose?: boolean;
  zipOutput?: boolean;
  logFunction?: (text: string) => void;
}
