import { Route, Trip } from 'gtfs';
import type { FormattedStopTime } from './stoptime.ts';

/*
 * A trip with the same `block_id` as another trip, used to determine
 * "continues from"/"continues as" relationships between trips. Only the
 * fields actually read for that purpose are declared.
 */
export interface BlockTrip extends Pick<Trip, 'trip_id' | 'route_id'> {
  firstStoptime?: FormattedStopTime;
  lastStoptime?: FormattedStopTime;
  route?: Route;
}

export interface FormattedTrip extends Trip {
  stoptimes: FormattedStopTime[];
  firstStoptime?: number;
  lastStoptime?: number;
  additional_service_ids?: string[];
  dayList?: string;
  dayListLong?: string;
  route_short_name?: string | null;
  continues_from_route?: BlockTrip;
  continues_as_route?: BlockTrip;
}
