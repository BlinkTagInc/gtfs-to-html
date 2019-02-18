/* global window, document, $, maps */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

$(function () {
  showSelectedTimetable();

  $('#day_list_selector input[name="dayList"]').change(function () {
    showSelectedTimetable();
  });

  $('#direction_name_selector input[name="directionName"]').change(function () {
    showSelectedTimetable();
  });

  function showSelectedTimetable() {
    if ($('.timetable').length === 1) {
      showTimetable($('.timetable').attr('id'));
      return false;
    }

    var dayList = $('#day_list_selector input[name="dayList"]:checked').val();
    var directionName = $('#direction_name_selector input[name="directionName"]:checked').val();
    $('.timetable').hide();
    var id = $('.timetable[data-day-list="' + dayList + '"][data-direction-name="' + directionName + '"]').attr('id');
    showTimetable(id);
  }
});

function showTimetable(id) {
  $('#' + id).show();
  if (typeof maps !== 'undefined' && maps[id]) {
    maps[id].resize();
  }
}
