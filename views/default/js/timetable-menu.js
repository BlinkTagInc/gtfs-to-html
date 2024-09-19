/* global jQuery */
/* eslint no-unused-vars: "off" */

function showSelectedTimetable() {
  if (jQuery('.timetable').length === 1) {
    showTimetable(jQuery('.timetable').data('timetable-id'));
    return false;
  }

  jQuery('#day_list_selector input[name="dayList"]').each((index, element) => {
    jQuery(element)
      .parents('label')
      .toggleClass('btn-blue', jQuery(element).is(':checked'));
    jQuery(element)
      .parents('label')
      .toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
  });

  jQuery('#direction_name_selector input[name="directionId"]').each(
    (index, element) => {
      jQuery(element)
        .parents('label')
        .toggleClass('btn-blue', jQuery(element).is(':checked'));
      jQuery(element)
        .parents('label')
        .toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
    },
  );

  const dayList = jQuery(
    '#day_list_selector input[name="dayList"]:checked',
  ).val();

  const directionId = jQuery(
    '#direction_name_selector input[name="directionId"]:checked',
  ).val();

  jQuery('.timetable').hide();

  const id = jQuery(
    `.timetable[data-day-list="${dayList}"][data-direction-id="${directionId}"]`,
  ).data('timetable-id');

  showTimetable(id);
}

function showTimetable(id) {
  jQuery(`#timetable_id_${id}`).show();
  toggleMap(id);
}

jQuery(() => {
  showSelectedTimetable();

  jQuery('#day_list_selector input[name="dayList"]').change(() => {
    showSelectedTimetable();
  });

  jQuery('#direction_name_selector input[name="directionId"]').change(() => {
    showSelectedTimetable();
  });
});
