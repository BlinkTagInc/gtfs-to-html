import { Route, Timetable } from 'gtfs';

export interface FormattedTimetable extends Timetable {
  route_ids: string[];
  trip_ids: string[];
  routes: Route[];
  service_ids?: string[];
  warnings?: string[];
  has_continues_as_route?: boolean;
  has_continues_from_route?: boolean;
}
