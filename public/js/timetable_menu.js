$(function() {
  showSelectedTimetable();

  $('#day_list_selector input[name="dayList"]').change(function() {
    showSelectedTimetable();
  });

  $('#direction_name_selector input[name="directionName"]').change(function() {
    showSelectedTimetable();
  });

  function showSelectedTimetable() {
    var dayList = $('#day_list_selector input[name="dayList"]:checked').val();
    var directionName = $('#direction_name_selector input[name="directionName"]:checked').val();
    $('.timetable').hide();
    $('.timetable[data-day-list="' + dayList + '"][data-direction-name="' + directionName + '"]').show();
  }
});
