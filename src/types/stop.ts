import { Stop } from 'gtfs';
import type { FormattedStopTime } from './stoptime.ts';
import type { Mutable } from './mutable.ts';

export interface FormattedStop extends Mutable<Stop> {
  type?: 'arrival' | 'departure';
  trips: FormattedStopTime[];
  hourlyTimes?: string[];
  is_timepoint?: boolean;
  stop_city?: string | null;
}
