(function () {
  var BASE = document.body.getAttribute('data-base') || '';

  // Today's date in the top bar (the site is static, so this is computed in the browser).
  var hoy = document.getElementById('hoy');
  if (hoy) {
    try {
      hoy.textContent = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    } catch (e) { /* keep city only */ }
  }

  // Copy link button.
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-copy]');
    if (!btn) return;
    var url = btn.getAttribute('data-copy');
    var label = btn.querySelector('span');
    function done() {
      btn.classList.add('is-done');
      if (label) label.textContent = 'Enlace copiado';
      setTimeout(function () { btn.classList.remove('is-done'); if (label) label.textContent = 'Copiar enlace'; }, 2500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copia el enlace:', url); });
    } else {
      window.prompt('Copia el enlace:', url);
    }
  });

  // Video: load Facebook's player only when the reader presses play.
  document.addEventListener('click', function (ev) {
    var link = ev.target.closest('.video-facade');
    if (!link || ev.metaKey || ev.ctrlKey) return;
    ev.preventDefault();
    var frame = document.createElement('iframe');
    frame.src = link.getAttribute('data-embed');
    frame.title = link.getAttribute('data-title') || 'Video';
    frame.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    link.replaceWith(frame);
  });

  // Search page.
  var results = document.getElementById('search-results');
  if (!results) return;
  var input = document.getElementById('q');
  var status = document.getElementById('search-status');
  var index = null;

  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmt(d) {
    try {
      return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z')).replace('.', '');
    } catch (e) { return d; }
  }
  function highlight(text, terms) {
    var out = esc(text);
    terms.forEach(function (t) {
      if (t.length < 3) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  function run(q) {
    var terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) { results.innerHTML = ''; status.textContent = ''; return; }
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var p = index[i];
      var title = norm(p.t), all = title + ' ' + norm(p.s);
      var ok = true, score = 0;
      for (var j = 0; j < terms.length; j++) {
        if (all.indexOf(terms[j]) === -1) { ok = false; break; }
        if (title.indexOf(terms[j]) !== -1) score += 3; else score += 1;
      }
      if (ok) hits.push({ p: p, s: score });
    }
    hits.sort(function (a, b) { return b.s - a.s || (a.p.d < b.p.d ? 1 : -1); });
    var shown = hits.slice(0, 60);
    status.textContent = hits.length
      ? (hits.length === 1 ? '1 resultado' : hits.length + ' resultados') + (hits.length > 60 ? ', se muestran los 60 más relevantes' : '') + '.'
      : 'No hay notas con esas palabras. Prueba con menos palabras o revisa la ortografía.';
    var rawTerms = q.split(/\s+/).filter(Boolean);
    results.innerHTML = shown.map(function (h) {
      var p = h.p;
      return '<article class="row' + (p.i ? '' : ' row--noimg') + '">' +
        (p.i ? '<a class="row__media" href="' + BASE + p.u + '" tabindex="-1" aria-hidden="true"><img src="' + BASE + '/' + p.i + '" alt="" loading="lazy" width="96" height="96"></a>' : '') +
        '<div><h3 class="row__title"><a href="' + BASE + p.u + '">' + highlight(p.t, rawTerms) + '</a></h3>' +
        (p.x ? '<p class="x">' + highlight(p.x, rawTerms) + '</p>' : '') +
        '<p class="card__meta"><time datetime="' + p.d + '">' + fmt(p.d) + '</time></p></div></article>';
    }).join('');
  }

  var params = new URLSearchParams(location.search);
  var initial = params.get('q') || '';
  input.value = initial;
  status.textContent = initial ? 'Buscando…' : '';

  fetch(BASE + '/search-index.json').then(function (r) { return r.json(); }).then(function (data) {
    index = data;
    if (initial) run(initial);
    var timer;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var q = input.value.trim();
        history.replaceState(null, '', q ? '?q=' + encodeURIComponent(q) : location.pathname);
        run(q);
      }, 180);
    });
  }).catch(function () {
    status.textContent = 'No se pudo cargar el buscador. Recarga la página para intentarlo de nuevo.';
  });

  input.form.addEventListener('submit', function (ev) {
    if (index) { ev.preventDefault(); run(input.value.trim()); }
  });
})();
