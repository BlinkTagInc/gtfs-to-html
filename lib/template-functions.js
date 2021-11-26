import { every } from 'lodash-es';

/*
 * Format an id to be used as an HTML attribute.
 */
export function formatHtmlId(id) {
  return id.replace(/([^\w[\]{}.:-])\s?/g, '');
}

/*
 * Discern if a day list should be shown for a specific timetable (if some
 * trips happen on different days).
 */
export function timetableHasDifferentDays(timetable) {
  return !every(timetable.orderedTrips, (trip, idx) => {
    if (idx === 0) {
      return true;
    }

    return trip.dayList === timetable.orderedTrips[idx - 1].dayList;
  });
}

/*
 * Discern if a day list should be shown for a specific timetable page's menu (if some
 * timetables are for different days).
 */
export function timetablePageHasDifferentDays(timetablePage) {
  return !every(timetablePage.consolidatedTimetables, (timetable, idx) => {
    if (idx === 0) {
      return true;
    }

    return (
      timetable.dayListLong ===
      timetablePage.consolidatedTimetables[idx - 1].dayListLong
    );
  });
}

/*
 * Discern if individual timetable labels should be shown (if some
 * timetables have different labels).
 */
export function timetablePageHasDifferentLabels(timetablePage) {
  return !every(timetablePage.consolidatedTimetables, (timetable, idx) => {
    if (idx === 0) {
      return true;
    }

    return (
      timetable.timetable_label ===
      timetablePage.consolidatedTimetables[idx - 1].timetable_label
    );
  });
}

/*
 * Discern if a timetable has any notes or notices to display.
 */
export function hasNotesOrNotices(timetable) {
  return (
    timetable.requestPickupSymbolUsed ||
    timetable.noPickupSymbolUsed ||
    timetable.requestDropoffSymbolUsed ||
    timetable.noDropoffSymbolUsed ||
    timetable.noServiceSymbolUsed ||
    timetable.interpolatedStopSymbolUsed ||
    timetable.notes.length > 0
  );
}

/*
 * Return an array of all timetable notes that relate to the entire timetable or route.
 */
export function getNotesForTimetableLabel(notes) {
  return notes.filter((note) => !note.stop_id && !note.trip_id);
}

/*
 * Return an array of all timetable notes for a specific stop and stop_sequence.
 */
export function getNotesForStop(notes, stop) {
  return notes.filter((note) => {
    // Don't show if note applies only to a specific trip.
    if (note.trip_id) {
      return false;
    }

    // Don't show if note applies only to a specific stop_sequence that is not found.
    if (
      note.stop_sequence &&
      !stop.trips.some((trip) => trip.stop_sequence === note.stop_sequence)
    ) {
      return false;
    }

    return note.stop_id === stop.stop_id;
  });
}

/*
 * Return an array of all timetable notes for a specific trip.
 */
export function getNotesForTrip(notes, trip) {
  return notes.filter((note) => {
    // Don't show if note applies only to a specific stop.
    if (note.stop_id) {
      return false;
    }

    return note.trip_id === trip.trip_id;
  });
}

/*
 * Return an array of all timetable notes for a specific stoptime.
 */
export function getNotesForStoptime(notes, stoptime) {
  return notes.filter((note) => {
    // Show notes that apply to all trips at this stop if `show_on_stoptime` is true.
    if (
      !note.trip_id &&
      note.stop_id === stoptime.stop_id &&
      note.show_on_stoptime === 1
    ) {
      return true;
    }

    // Show notes that apply to all stops of this trip if `show_on_stoptime` is true.
    if (
      !note.stop_id &&
      note.trip_id === stoptime.trip_id &&
      note.show_on_stoptime === 1
    ) {
      return true;
    }

    return (
      note.trip_id === stoptime.trip_id && note.stop_id === stoptime.stop_id
    );
  });
}

/*
 * Formats a trip name.
 */
export function formatTripName(trip, index, timetable) {
  let tripName = '';
  if (timetable.routes.length > 1) {
    tripName = trip.route_short_name;
  } else if (trip.trip_short_name) {
    tripName += trip.trip_short_name;
  } else {
    tripName += `Run #${index + 1}`;
  }

  if (timetableHasDifferentDays(timetable)) {
    tripName += ` ${trip.dayList}`;
  }

  return tripName;
}

/*
 * Formats a trip name.
 */
export function formatTripNameForCSV(trip, timetable) {
  let tripName = '';
  if (timetable.routes.length > 1) {
    tripName += `${trip.route_short_name} - `;
  }

  if (trip.trip_short_name) {
    tripName += trip.trip_short_name;
  } else {
    tripName += trip.trip_id;
  }

  if (timetableHasDifferentDays(timetable)) {
    tripName += ` - ${trip.dayList}`;
  }

  return tripName;
}
