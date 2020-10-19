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
