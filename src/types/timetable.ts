import { Route, Stop, Timetable, Trip } from 'gtfs';

export interface FormattedTimetable extends Timetable {
  route_ids: string[];
  trip_ids: string[];
  routes: Route[];
  orderedTrips: Trip[];
  stops: Stop[];
  service_ids?: string[];
  warnings?: string[];
  has_continues_as_route?: boolean;
  has_continues_from_route?: boolean;
}
