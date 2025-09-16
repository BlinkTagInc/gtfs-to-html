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
  groupTimetablesIntoPages?: boolean;
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
  timetable_id: string;
  route_ids: string[];
  routes: Route[];
  direction_id?: null | 0 | 1;
  start_date?: null | number;
  end_date?: null | number;
  monday?: null | 0 | 1;
  tuesday?: null | 0 | 1;
  wednesday?: null | 0 | 1;
  thursday?: null | 0 | 1;
  friday?: null | 0 | 1;
  saturday?: null | 0 | 1;
  sunday?: null | 0 | 1;
  service_ids?: string[];
  start_time?: null | string;
  start_timestamp?: null | UnixTimestamp;
  end_time?: null | string;
  end_timestamp?: null | UnixTimestamp;
  timetable_label?: null | string;
  service_notes?: null | string;
  orientation?: null | string;
  timetable_page_id?: null | string;
  timetable_sequence?: null | number;
  direction_name?: null | string;
  include_exceptions?: null | number;
  show_trip_continuation?: null | string;
  warnings?: string[];
  has_continues_as_route?: boolean;
  has_continues_from_route?: boolean;
}

export interface TimetablePage {
  timetable_page_id: string;
  timetable_page_label?: null | string;
  filename?: null | string;
  timetables: Timetable[];
  routes: Route[];
  relativePath?: string;
}
