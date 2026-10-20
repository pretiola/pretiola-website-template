// Leave the links visible when JavaScript is unavailable.
(function () {
  'use strict';
  var nav = document.getElementById('navbar');
  var button = document.getElementById('menu-toggle');
  if (!nav || !button) return;
  nav.classList.add('nav-enhanced');
  button.hidden = false;

  function closeMenu() {
    button.setAttribute('aria-expanded', 'false');
    nav.classList.remove('menu-open');
  }
  button.addEventListener('click', function () {
    var open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('menu-open', open);
  });
  nav.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      button.focus({ preventScroll: true });
    }
  });
  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });
})();
