document.addEventListener('DOMContentLoaded', () => {
  const fadeStartPx = 40;
  const containers = document.querySelectorAll('.table-container');

  function updateScrollEnd(el) {
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const distanceFromEnd = scrollWidth - clientWidth - scrollLeft;
    if (distanceFromEnd >= fadeStartPx) {
      el.style.setProperty('--scroll-fade', '1');
    } else if (distanceFromEnd <= 0) {
      el.style.setProperty('--scroll-fade', '0');
    } else {
      el.style.setProperty(
        '--scroll-fade',
        String(distanceFromEnd / fadeStartPx),
      );
    }
  }

  containers.forEach((el) => {
    updateScrollEnd(el);
    el.addEventListener('scroll', () => updateScrollEnd(el), { passive: true });
  });
});
