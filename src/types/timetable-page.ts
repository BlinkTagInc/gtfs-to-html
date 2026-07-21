import { Route, TimetablePage } from 'gtfs';
import { FormattedTimetable } from './timetable.ts';

export interface FormattedTimetablePage extends TimetablePage {
  timetables: FormattedTimetable[];
  routes: Route[];
  relativePath?: string;
}

/*
 * A trimmed-down copy of a `FormattedTimetablePage` retaining only the
 * fields the `overview` template actually reads.
 */
export interface TimetablePageSummary {
  timetable_page_id?: string;
  relativePath?: string;
  filename?: string;
  timetable_page_label?: string;
  dayList?: string;
  route_ids: string[];
  agency_ids: string[];
  consolidatedTimetables: { routes: Route[] }[];
}
