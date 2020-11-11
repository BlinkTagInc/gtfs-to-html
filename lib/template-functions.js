const { every } = require('lodash');

/*
 * Format an id to be used as an HTML attribute.
 */
exports.formatHtmlId = id => id.replace(/([^\w[\]{}.:-])\s?/g, '');

/*
 * Discern if a day list should be shown for a specific timetable (if some
 * trips happen on different days).
 */
exports.timetableHasDifferentDays = timetable => {
  return !every(timetable.orderedTrips, (trip, idx) => {
    if (idx === 0) {
      return true;
    }

    return trip.dayList === timetable.orderedTrips[idx - 1].dayList;
  });
};

/*
 * Discern if a day list should be shown for a specific timetable page's menu (if some
 * timetables are for different days).
 */
exports.timetablePageHasDifferentDays = timetablePage => {
  return !every(timetablePage.consolidatedTimetables, (timetable, idx) => {
    if (idx === 0) {
      return true;
    }

    return timetable.dayListLong === timetablePage.consolidatedTimetables[idx - 1].dayListLong;
  });
};

/*
 * Discern if individual timetable labels should be shown (if some
 * timetables have different labels).
 */
exports.timetablePageHasDifferentLabels = timetablePage => {
  return !every(timetablePage.consolidatedTimetables, (timetable, idx) => {
    if (idx === 0) {
      return true;
    }

    return timetable.timetable_label === timetablePage.consolidatedTimetables[idx - 1].timetable_label;
  });
};

/*
 * Discern if a timetable has any notes or notices to display.
 */
exports.hasNotesOrNotices = timetable => {
  return timetable.requestPickupSymbolUsed ||
    timetable.noPickupSymbolUsed ||
    timetable.requestDropoffSymbolUsed ||
    timetable.noDropoffSymbolUsed ||
    timetable.noServiceSymbolUsed ||
    timetable.interpolatedStopSymbolUsed ||
    timetable.notes.length > 0;
};

/*
 * Return an array of all timetable notes that relate to the entire timetable or route.
 */
exports.getNotesForTimetableLabel = notes => {
  return notes.filter(note => {
    return !note.stop_id && !note.trip_id;
  });
};

/*
 * Return an array of all timetable notes for a specific stop and stop_sequence.
 */
exports.getNotesForStop = (notes, stop) => {
  return notes.filter(note => {
    // Don't show if note applies only to a specific trip.
    if (note.trip_id) {
      return false;
    }

    // Don't show if note applies only to a specific stop_sequence that is not found.
    if (note.stop_sequence && !stop.trips.find(trip => trip.stop_sequence === note.stop_sequence)) {
      return false;
    }

    return note.stop_id === stop.stop_id;
  });
};

/*
 * Return an array of all timetable notes for a specific trip.
 */
exports.getNotesForTrip = (notes, trip) => {
  return notes.filter(note => {
    // Don't show if note applies only to a specific stop.
    if (note.stop_id) {
      return false;
    }

    return note.trip_id === trip.trip_id;
  });
};

/*
 * Return an array of all timetable notes for a specific stoptime.
 */
exports.getNotesForStoptime = (notes, stoptime) => {
  return notes.filter(note => {
    // Show notes that apply to all trips at this stop if `show_on_stoptime` is true.
    if (!note.trip_id && note.stop_id === stoptime.stop_id && note.show_on_stoptime === 1) {
      return true;
    }

    // Show notes that apply to all stops of this trip if `show_on_stoptime` is true.
    if (!note.stop_id && note.trip_id === stoptime.trip_id && note.show_on_stoptime === 1) {
      return true;
    }

    return note.trip_id === stoptime.trip_id && note.stop_id === stoptime.stop_id;
  });
};
