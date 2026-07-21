import { Frequency, Route, Timetable } from 'gtfs';
import type { FormattedTrip } from './trip.ts';
import type { FormattedStop } from './stop.ts';

export interface FormattedTimetable extends Timetable {
  route_ids: string[];
  trip_ids: string[];
  routes: Route[];
  orderedTrips: FormattedTrip[];
  stops: FormattedStop[];
  service_ids?: string[];
  warnings?: string[];
  has_continues_as_route?: boolean;
  has_continues_from_route?: boolean;
  dayList?: string;
  dayListLong?: string;
  calendarDates?: { excludedDates: string[]; includedDates: string[] };
  notes?: unknown[];
  geojson?: unknown;
  frequencies?: Frequency[];
  frequencyExactTimes?: boolean;
  noServiceSymbolUsed?: boolean;
  requestDropoffSymbolUsed?: boolean;
  noDropoffSymbolUsed?: boolean;
  requestPickupSymbolUsed?: boolean;
  noPickupSymbolUsed?: boolean;
  interpolatedStopSymbolUsed?: boolean;
  showStopCity?: boolean;
  showStopDescription?: boolean;
  noServiceSymbol?: string | null;
  requestDropoffSymbol?: string | null;
  noDropoffSymbol?: string | null;
  requestPickupSymbol?: string | null;
  noPickupSymbol?: string | null;
  interpolatedStopSymbol?: string | null;
}
