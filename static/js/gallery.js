document.addEventListener('DOMContentLoaded', function () {
  var lightbox = document.createElement('dialog');
  var supportsDialog = typeof lightbox.showModal === 'function';
  var trigger;
  var previousOverflow;
  var suppressClickUntil = 0;

  if (supportsDialog) {
    lightbox.id = 'gallery-lightbox';
    lightbox.setAttribute('aria-label', 'Enlarged photograph');
    lightbox.innerHTML = '<div class="lightbox-content"><button type="button" class="lightbox-close" aria-label="Close photograph">&times;</button><img alt=""></div>';
    document.body.appendChild(lightbox);
    lightbox.querySelector('button').addEventListener('click', function () { lightbox.close(); });
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener('close', function () {
      document.body.style.overflow = previousOverflow;
      if (trigger && trigger.isConnected) trigger.focus();
    });
  }

  function openLightbox(element, image) {
    if (!supportsDialog || lightbox.open) return;
    trigger = element;
    var enlarged = lightbox.querySelector('img');
    enlarged.src = element.href || (image.currentSrc || image.src).replace(/_(400|800)w\./, '_1200w.');
    enlarged.alt = image.alt || '';
    previousOverflow = document.body.style.overflow;
    lightbox.showModal();
    document.body.style.overflow = 'hidden';
  }

  document.querySelectorAll('[data-gallery]').forEach(function (gallery) {
    // Without inert, offscreen links would remain in the keyboard tab order.
    // Keep the readable, stacked fallback in those browsers.
    if (!('inert' in gallery)) return;
    var track = gallery.querySelector('[data-gallery-track]');
    if (!track) return;
    var slides = track.querySelectorAll('[data-gallery-slide]');
    if (!slides.length) return;
    var prevBtn = gallery.querySelector('[data-gallery-prev]');
    var nextBtn = gallery.querySelector('[data-gallery-next]');
    var dotsContainer = gallery.querySelector('[data-gallery-dots]');
    var current = 0;
    var touchStart;
    var dots = [];
    var status = document.createElement('p');
    status.className = 'sr-only';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    gallery.appendChild(status);
    gallery.setAttribute('role', 'region');
    gallery.setAttribute('aria-roledescription', 'carousel');
    if (!gallery.hasAttribute('aria-label') && !gallery.hasAttribute('aria-labelledby')) {
      gallery.setAttribute('aria-label', 'Photo gallery');
    }

    slides.forEach(function (slide, index) {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', (index + 1) + ' of ' + slides.length);
      if (!dotsContainer) return;
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gallery-dot';
      dot.setAttribute('aria-label', 'Go to slide ' + (index + 1));
      dot.addEventListener('click', function () { goTo(index); });
      dotsContainer.appendChild(dot);
      dots.push(dot);
    });

    function goTo(index) {
      current = ((index % slides.length) + slides.length) % slides.length;
      track.style.transform = 'translateX(-' + (current * 100) + '%)';
      slides.forEach(function (slide, slideIndex) {
        var active = slideIndex === current;
        slide.setAttribute('aria-hidden', String(!active));
        slide.toggleAttribute('inert', !active);
      });
      dots.forEach(function (dot, dotIndex) {
        var active = dotIndex === current;
        dot.classList.toggle('active', active);
        dot.setAttribute('aria-current', String(active));
      });
      status.textContent = 'Slide ' + (current + 1) + ' of ' + slides.length;
    }

    // Readers control the pace; there is no automatic slide timer.
    if (prevBtn) {
      prevBtn.disabled = slides.length < 2;
      prevBtn.addEventListener('click', function () { goTo(current - 1); });
    }
    if (nextBtn) {
      nextBtn.disabled = slides.length < 2;
      nextBtn.addEventListener('click', function () { goTo(current + 1); });
    }
    gallery.addEventListener('keydown', function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      var focusWasInSlide = event.target.closest('[data-gallery-slide]');
      goTo(current + (event.key === 'ArrowRight' ? 1 : -1));
      if (focusWasInSlide) {
        var link = slides[current].querySelector('a, button, [tabindex="0"]');
        if (link) link.focus();
      }
    });
    track.addEventListener('touchstart', function (event) {
      var touch = event.changedTouches[0];
      touchStart = { x: touch.screenX, y: touch.screenY };
    }, { passive: true });
    track.addEventListener('touchend', function (event) {
      if (!touchStart) return;
      var touch = event.changedTouches[0];
      var x = touchStart.x - touch.screenX;
      var y = touchStart.y - touch.screenY;
      touchStart = null;
      if (Math.abs(x) > 50 && Math.abs(x) > Math.abs(y)) {
        goTo(current + (x > 0 ? 1 : -1));
        suppressClickUntil = Date.now() + 500;
      }
    }, { passive: true });
    track.addEventListener('touchcancel', function () { touchStart = null; }, { passive: true });

    // Older data-gallery markup without anchors keeps keyboard activation.
    // New galleries should use image links for a no-JavaScript fallback.
    if (supportsDialog) {
      track.querySelectorAll('img').forEach(function (image) {
        if (image.closest('a')) return;
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute('aria-label', 'Enlarge photograph' + (image.alt ? ': ' + image.alt : ''));
        image.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openLightbox(image, image);
          }
        });
      });
    }
    goTo(0);
    gallery.classList.add('is-initialized');
  });

  document.addEventListener('click', function (event) {
    var link = event.target.closest('.gallery-image-link');
    var image = link ? link.querySelector('img') : event.target.closest('[data-gallery] img');
    if (!image || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!link && image.closest('a')) return;
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      return;
    }
    if (!supportsDialog) return;
    event.preventDefault();
    openLightbox(link || image, image);
  });
});
