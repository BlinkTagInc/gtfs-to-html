import { Route, UnixTimestamp } from 'gtfs';

export interface Config {
  agencies: {
    agencyKey: string;
    agency_key?: string;
    url?: string;
    path?: string;
    exclude?: string[];
  }[];
  assetPath?: string;
  sqlitePath?: string;
  allowEmptyTimetables?: boolean;
  beautify?: boolean;
  coordinatePrecision?: number;
  dateFormat?: string;
  daysShortStrings?: string[];
  daysStrings?: string[];
  defaultOrientation?: string;
  effectiveDate?: string;
  endDate?: string;
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

export interface Timetable {
  timetable_id?: string;
  route_ids: string[];
  routes: Route[];
  direction_id?: 0 | 1;
  start_date?: number;
  end_date?: number;
  monday?: 0 | 1;
  tuesday?: 0 | 1;
  wednesday?: 0 | 1;
  thursday?: 0 | 1;
  friday?: 0 | 1;
  saturday?: 0 | 1;
  sunday?: 0 | 1;
  service_ids?: string[];
  start_time?: string;
  start_timestamp?: UnixTimestamp;
  end_time?: string;
  end_timestamp?: UnixTimestamp;
  timetable_label?: string;
  service_notes?: string;
  orientation?: string;
  timetable_page_id?: string;
  timetable_sequence?: number;
  direction_name?: string;
  include_exceptions?: number;
  show_trip_continuation?: string;
  warnings?: string[];
  has_continues_as_route?: boolean;
  has_continues_from_route?: boolean;
}

export interface TimetablePage {
  timetable_page_id: string;
  timetable_page_label?: string;
  filename?: string;
  timetables: Timetable[];
  routes: Route[];
  relativePath?: string;
}
