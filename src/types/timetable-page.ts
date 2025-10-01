import { Route, TimetablePage } from 'gtfs';
import { FormattedTimetable } from './timetable.ts';

export interface FormattedTimetablePage extends TimetablePage {
  timetables: FormattedTimetable[];
  routes: Route[];
  relativePath?: string;
}
