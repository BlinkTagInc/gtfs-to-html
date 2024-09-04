export interface IConfig {
  agencies: {
    agencyKey: string;
    agency_key?: string;
    url?: string;
    path?: string;
    exclude?: string[];
  }[];
  coordinatePrecision?: number;
  outputType?: string;
  outputFormat?: string;
  startDate?: string;
  endDate?: string;
  verbose?: boolean;
  zipOutput?: boolean;
  sqlitePath?: string;
  log: (text: string) => void;
  logWarning: (text: string) => void;
  logError: (text: string) => void;
}

export interface ITimetable {
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

export interface ITimetablePage {
  timetable_page_id: string;
  timetable_page_label?: string;
  filename?: string;
  timetables: ITimetable[];
  routes: Record<string, string>;
  relativePath?: string;
}
