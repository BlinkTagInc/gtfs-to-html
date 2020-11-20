/* global window, document, $, maps */
/* eslint no-unused-vars: "off" */

jQuery(($) => {
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

    $('#day_list_selector input[name="dayList"]').each((index, el) => {
      $(el).parents('label').toggleClass('text-white bg-blue-600', $(el).is(':checked'));
      $(el).parents('label').toggleClass('text-gray-600 bg-gray-300', $(el).is(':not(:checked)'));
    });

    $('#direction_name_selector input[name="directionName"]').each((index, el) => {
      $(el).parents('label').toggleClass('text-white bg-blue-600', $(el).is(':checked'));
      $(el).parents('label').toggleClass('text-gray-600 bg-gray-300', $(el).is(':not(:checked)'));
    });

    const dayList = $('#day_list_selector input[name="dayList"]:checked').val();
    const directionName = $('#direction_name_selector input[name="directionName"]:checked').val();
    
    $('.timetable').hide();
    const id = $('.timetable[data-day-list="' + dayList + '"][data-direction-name="' + directionName + '"]').attr('id');
    showTimetable(id);
  }

  function showTimetable(id) {
    $('#' + id).show();
    if (typeof maps !== 'undefined' && maps[id]) {
      maps[id].resize();
    }
  }
});
