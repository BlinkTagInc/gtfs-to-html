import { StopTime } from 'gtfs';
import type { Mutable } from './mutable.ts';

export type FormattedStopTime = Omit<Mutable<StopTime>, 'stop_sequence'> & {
  // Overridden to allow `null`, used as a sentinel for a synthetic stoptime
  // representing a trip that doesn't stop at a given stop.
  stop_sequence: number | null;
  id?: string | number | null;
  type?: 'arrival' | 'departure';
  classes?: string[];
  formatted_time?: string;
  noPickup?: boolean;
  requestPickup?: boolean;
  noDropoff?: boolean;
  requestDropoff?: boolean;
  interpolated?: boolean;
  skipped?: boolean;
  _id?: unknown;
};
