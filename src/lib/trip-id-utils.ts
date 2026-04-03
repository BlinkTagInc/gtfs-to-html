/*
 * Frequency-based timetable expansion creates synthetic ids like `trip_freq_0`.
 * Convert them back to the underlying GTFS trip id for GTFS-backed lookups.
 */
export const getBaseTripId = (tripId: string): string =>
  tripId.replace(/_freq_\d+$/, '');

export const getBaseTripIds = (trips: { trip_id: string }[]): string[] =>
  Array.from(new Set(trips.map((trip) => getBaseTripId(trip.trip_id))));
