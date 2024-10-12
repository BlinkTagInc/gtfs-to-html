export interface Config {
  agencies: {
    agencyKey: string;
    agency_key?: string;
    url?: string;
    path?: string;
    exclude?: string[];
  }[];
  sqlitePath?: string;
  allowEmptyTimetables?: boolean;
  beautify?: boolean;
  coordinatePrecision?: number;
  dateFormat?: string;
  daysShortStrings?: string[];
  daysStrings?: string[];
  defaultOrientation?: string;
  effectiveDate?: string;
  interpolatedStopSymbol?: string;
  interpolatedStopText?: string;
  linkStopUrls?: boolean;
  mapboxAccessToken?: string;
  menuType?: 'simple' | 'jump' | 'radio';
  noDropoffSymbol?: string;
  noDropoffText?: string;
  noHead?: boolean;
  noPickupSymbol?: string;
  noPickupText?: string;
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
  showMap?: boolean;
  showOnlyTimepoint?: boolean;
  showRouteTitle?: boolean;
  showStopCity?: boolean;
  showStopDescription?: boolean;
  showStoptimesForRequestStops?: boolean;
  skipImport?: boolean;
  sortingAlgorithm?: string;
  templatePath?: string;
  timeFormat?: string;
  useParentStation?: boolean;
  verbose?: boolean;
  zipOutput?: boolean;
  log?: (text: string) => void;
  logWarning?: (text: string) => void;
  logError?: (text: string) => void;
}

export interface Timetable {
  timetable_id: string;
  route_id: string;
  direction_id: number;
  start_date?: number;
  end_date?: number;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  start_time?: string;
  start_timestamp?: number;
  end_time?: string;
  end_timestamp?: number;
  timetable_label?: string;
  service_notes?: string;
  orientation?: string;
  timetable_page_id?: string;
  timetable_sequence?: number;
  direction_name?: string;
  include_exceptions?: number;
  show_trip_continuation?: string;
  warnings: string[];
}

export interface TimetablePage {
  timetable_page_id: string;
  timetable_page_label?: string;
  filename?: string;
  timetables: Timetable[];
  routes: Record<string, string>;
  relativePath?: string;
}
