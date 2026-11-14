import type * as Gtfs from 'gtfs';
import type { Row } from './gtfs.js';
import { FormattedTimetable } from './timetable.ts';

export interface FormattedTimetablePage extends Omit<
  Row<Gtfs.TimetablePages>,
  'timetable_page_label' | 'filename'
> {
  // Overridden as optional: synthesized timetable pages (built when no
  // `timetable_pages.txt` is present) don't set these fields right away.
  timetable_page_label?: string | null;
  filename?: string | null;
  timetables: FormattedTimetable[];
  routes: Row<Gtfs.Routes>[];
  relativePath?: string;
  consolidatedTimetables?: FormattedTimetable[];
  dayList?: string;
  dayLists?: (string | undefined)[];
  route_ids?: string[];
  agency_ids?: string[];
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
  consolidatedTimetables: { routes: Row<Gtfs.Routes>[] }[];
}
