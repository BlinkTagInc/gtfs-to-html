import { Stop } from 'gtfs';
import type { FormattedStopTime } from './stoptime.ts';

export interface FormattedStop extends Stop {
  type?: 'arrival' | 'departure';
  trips: FormattedStopTime[];
  hourlyTimes?: string[];
  is_timepoint?: boolean;
  stop_city?: string | null;
}
