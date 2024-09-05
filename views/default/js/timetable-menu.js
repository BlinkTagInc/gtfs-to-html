/* global window, document, $, maps */
/* eslint no-unused-vars: "off" */

$(() => {
  showSelectedTimetable();

  $('#day_list_selector input[name="dayList"]').change(() => {
    showSelectedTimetable();
  });

  $('#direction_name_selector input[name="directionName"]').change(() => {
    showSelectedTimetable();
  });

  function showSelectedTimetable() {
    if ($('.timetable').length === 1) {
      showTimetable($('.timetable').data('timetable-id'));
      return false;
    }

    $('#day_list_selector input[name="dayList"]').each((index, element) => {
      $(element)
        .parents('label')
        .toggleClass('btn-blue', $(element).is(':checked'));
      $(element)
        .parents('label')
        .toggleClass('btn-gray', $(element).is(':not(:checked)'));
    });

    $('#direction_name_selector input[name="directionName"]').each(
      (index, element) => {
        $(element)
          .parents('label')
          .toggleClass('btn-blue', $(element).is(':checked'));
        $(element)
          .parents('label')
          .toggleClass('btn-gray', $(element).is(':not(:checked)'));
      },
    );

    const dayList = $('#day_list_selector input[name="dayList"]:checked').val();
    const directionName = $(
      '#direction_name_selector input[name="directionName"]:checked',
    ).val();

    $('.timetable').hide();
    const id = $(
      `.timetable[data-day-list="${dayList}"][data-direction-name="${directionName}"]`,
    ).data('timetable-id');
    showTimetable(id);
  }

  function showTimetable(id) {
    $(`#timetable_id_${id}`).show();
    toggleMap(id);
  }
});
