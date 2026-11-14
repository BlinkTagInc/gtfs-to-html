import type * as Gtfs from 'gtfs';
import type { Row } from './gtfs.js';
import type { FormattedStopTime } from './stoptime.ts';
import type { Mutable } from './mutable.ts';

/*
 * A trip with the same `block_id` as another trip, used to determine
 * "continues from"/"continues as" relationships between trips. Only the
 * fields actually read for that purpose are declared.
 */
export interface BlockTrip extends Pick<
  Row<Gtfs.Trips>,
  'trip_id' | 'route_id'
> {
  firstStoptime?: FormattedStopTime;
  lastStoptime?: FormattedStopTime;
  route?: Row<Gtfs.Routes>;
}

export interface FormattedTrip extends Mutable<Row<Gtfs.Trips>> {
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
