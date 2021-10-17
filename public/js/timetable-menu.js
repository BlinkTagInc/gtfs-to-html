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
      showTimetable($('.timetable').attr('id'));
      return false;
    }

    $('#day_list_selector input[name="dayList"]').each((index, element) => {
      $(element)
        .parents('label')
        .toggleClass('text-white bg-blue-600', $(element).is(':checked'));
      $(element)
        .parents('label')
        .toggleClass(
          'text-gray-600 bg-gray-300',
          $(element).is(':not(:checked)')
        );
    });

    $('#direction_name_selector input[name="directionName"]').each(
      (index, element) => {
        $(element)
          .parents('label')
          .toggleClass('text-white bg-blue-600', $(element).is(':checked'));
        $(element)
          .parents('label')
          .toggleClass(
            'text-gray-600 bg-gray-300',
            $(element).is(':not(:checked)')
          );
      }
    );

    const dayList = $('#day_list_selector input[name="dayList"]:checked').val();
    const directionName = $(
      '#direction_name_selector input[name="directionName"]:checked'
    ).val();

    $('.timetable').hide();
    const id = $(
      '.timetable[data-day-list="' +
        dayList +
        '"][data-direction-name="' +
        directionName +
        '"]'
    ).attr('id');
    showTimetable(id);
  }

  function showTimetable(id) {
    $('#' + id).show();
    if (typeof maps !== 'undefined' && maps[id]) {
      maps[id].resize();
    }
  }
});
