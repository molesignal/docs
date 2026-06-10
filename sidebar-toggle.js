/*
 * Collapsible left sidebar for the MoleSignal docs.
 *
 * Injects a small round chevron button that straddles the sidebar / content
 * divider, vertically level with the first nav group ("Getting Started"). It
 * flips an `ms-sidebar-collapsed` class on <html>; style.css then slides the
 * sidebar out (translateX) and lets #content-area reclaim the width, both with
 * a ~200ms transition. The button is faint by default and becomes fully opaque
 * on hover of itself or the sidebar.
 *
 * State persists in localStorage and survives the SPA's client-side navigation
 * (the button lives on <body>, outside the swapped content). Desktop only — on
 * mobile the sidebar is a drawer and the button stays hidden (CSS media query).
 *
 * Mintlify auto-loads any .js at the docs root, the same way it auto-loads .css.
 */
(function () {
  var KEY = 'ms-sidebar-collapsed';
  var root = document.documentElement;
  var animTimer;

  // Apply the persisted state before first paint (no transition yet — see the
  // ms-sb-anim gate below) so a collapsed reload doesn't animate open.
  try {
    if (localStorage.getItem(KEY) === '1') root.classList.add('ms-sidebar-collapsed');
  } catch (e) {}

  // Chevron-left; CSS rotates it 180° when collapsed to point right.
  var CHEVRON =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10 3 5 8l5 5"/></svg>';

  function setLabel(btn) {
    var collapsed = root.classList.contains('ms-sidebar-collapsed');
    btn.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.title = collapsed ? 'Show sidebar' : 'Hide sidebar';
  }

  // Vertical: centre on the first group header (locale-independent class).
  // Horizontal: straddle the sidebar's right edge when open; the collapsed
  // position is pinned to the viewport edge in CSS.
  //
  // The sidebar's right edge is read via offsetLeft + offsetWidth, which ignore
  // the collapse transform — so the button never drifts when toggled mid-anim,
  // and the slide-out distance (--ms-sb-shift) always clears the *whole* sidebar
  // regardless of the centred layout's left offset (otherwise a sliver of the
  // active item shows through on wide viewports).
  function place(btn) {
    var gh = document.querySelector('#sidebar .sidebar-group-header');
    if (gh) {
      var g = gh.getBoundingClientRect();
      btn.style.top = Math.round(g.top + g.height / 2 - btn.offsetHeight / 2) + 'px';
    }
    var sb = document.getElementById('sidebar');
    if (!sb) return;
    var right = sb.offsetLeft + sb.offsetWidth; // transform-independent
    if (right <= 0) return;
    root.style.setProperty('--ms-sb-shift', right + 24 + 'px');
    if (!root.classList.contains('ms-sidebar-collapsed')) {
      btn.style.left = Math.round(right - btn.offsetWidth / 2) + 'px';
    }
  }

  function bindSidebarHover() {
    var sb = document.getElementById('sidebar');
    if (!sb || sb.__msHoverBound) return;
    sb.__msHoverBound = true;
    sb.addEventListener('mouseenter', function () { root.classList.add('ms-sb-hover'); });
    sb.addEventListener('mouseleave', function () { root.classList.remove('ms-sb-hover'); });
  }

  function ensureButton() {
    if (!document.body) return null;
    var btn = document.getElementById('ms-sidebar-toggle');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'ms-sidebar-toggle';
    btn.type = 'button';
    btn.innerHTML = CHEVRON;
    setLabel(btn);
    btn.addEventListener('click', function () {
      // Enable the slide/reflow transitions just for this toggle, then disable
      // them again — so nothing else (scroll, resize) ever animates these.
      root.classList.add('ms-sb-animating');
      clearTimeout(animTimer);
      animTimer = setTimeout(function () { root.classList.remove('ms-sb-animating'); }, 280);
      var collapsed = root.classList.toggle('ms-sidebar-collapsed');
      try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) {}
      setLabel(btn);
      place(btn);
    });
    document.body.appendChild(btn);
    return btn;
  }

  function boot() {
    var btn = ensureButton();
    if (btn) place(btn);
    bindSidebarHover();
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);

  // Re-place after late layout, on resize, and across SPA route changes.
  [120, 400, 1000].forEach(function (d) { setTimeout(boot, d); });
  window.addEventListener('resize', function () {
    var btn = document.getElementById('ms-sidebar-toggle');
    if (btn) place(btn);
  });
  window.addEventListener('popstate', boot);
})();
