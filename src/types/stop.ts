import type * as Gtfs from 'gtfs';
import type { Row } from './gtfs.js';
import type { FormattedStopTime } from './stoptime.ts';
import type { Mutable } from './mutable.ts';

export interface FormattedStop extends Mutable<Row<Gtfs.Stops>> {
  type?: 'arrival' | 'departure';
  trips: FormattedStopTime[];
  hourlyTimes?: string[];
  is_timepoint?: boolean;
  stop_city?: string | null;
}
