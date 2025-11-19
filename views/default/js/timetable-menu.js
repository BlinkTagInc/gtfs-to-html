/* global toggleMap */

function showSelectedTimetable() {
  const timetables = document.querySelectorAll('.timetable');

  if (timetables.length === 1) {
    showTimetable(timetables[0].dataset.timetableId);
    return;
  }

  document
    .querySelectorAll('#day_list_selector input[name="dayList"]')
    .forEach((element) => {
      const label = element.closest('label');
      if (label) {
        label.classList.toggle('btn-active', element.checked);
        label.classList.toggle('btn-inactive', !element.checked);
      }
    });

  document
    .querySelectorAll('#direction_name_selector input[name="directionId"]')
    .forEach((element) => {
      const label = element.closest('label');
      if (label) {
        label.classList.toggle('btn-active', element.checked);
        label.classList.toggle('btn-inactive', !element.checked);
      }
    });

  const dayListInput = document.querySelector(
    '#day_list_selector input[name="dayList"]:checked',
  );
  const dayList = dayListInput ? dayListInput.value : null;

  const directionIdInput = document.querySelector(
    '#direction_name_selector input[name="directionId"]:checked',
  );
  const directionId = directionIdInput ? directionIdInput.value : null;

  timetables.forEach((timetable) => {
    timetable.style.display = 'none';
  });

  const selectedTimetable = document.querySelector(
    `.timetable[data-day-list="${dayList}"][data-direction-id="${directionId}"]`,
  );

  if (selectedTimetable) {
    const id = selectedTimetable.dataset.timetableId;
    showTimetable(id);
  }
}

function showTimetable(id) {
  const timetable = document.querySelector(
    `.timetable[data-timetable-id="${id}"]`,
  );
  if (timetable) {
    timetable.style.display = 'block';
  }
  // Check if toggleMap is defined
  if (typeof toggleMap === 'function') {
    toggleMap(id);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  showSelectedTimetable();

  document
    .querySelectorAll('#day_list_selector input[name="dayList"]')
    .forEach((input) => {
      input.addEventListener('change', () => {
        showSelectedTimetable();
      });
    });

  document
    .querySelectorAll('#direction_name_selector input[name="directionId"]')
    .forEach((input) => {
      input.addEventListener('change', () => {
        showSelectedTimetable();
      });
    });
});
