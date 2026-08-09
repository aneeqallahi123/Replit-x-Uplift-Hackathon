// Persistent-shell client-side router.
//
// Why this exists: index.html / services.html / apply.html are three
// separate documents. A real navigation between them tears down the
// WebRTC/LiveKit connection maryam-agent.js holds open, destroys the JS
// heap, and forces a brand-new Uplift session + agent-worker join on
// every single page — which is what made Maryam appear to "forget"
// context and go silent after navigating. This router intercepts clicks
// on in-app links, fetches the target page, and swaps only the
// #page-root region — the Maryam widget (injected directly onto
// <body>, outside #page-root, by maryam-agent.js) and the shared
// <script> tags at the bottom of the shell are never touched, so the
// LiveKit room/session simply never disconnects for in-app navigation.
(function () {
  'use strict';

  const PAGE_INIT = {
    '/index.html':    () => window.initHomePage && window.initHomePage(),
    '/':              () => window.initHomePage && window.initHomePage(),
    '/services.html': () => window.initServicesPage && window.initServicesPage(),
    '/apply.html':    () => window.initApplyPage && window.initApplyPage(),
  };

  function pathKey(url) {
    return new URL(url, location.href).pathname;
  }

  // The very first real page load has no pushState entry of its own, so
  // going "back" past every in-app navigation would otherwise land on a
  // history entry with no state and nothing telling the router what to
  // restore. Give it one retroactively.
  history.replaceState({ url: location.pathname + location.search }, '', location.href);

  async function navigateTo(url, opts) {
    const push = !opts || opts.push !== false;
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      console.warn('[Router] fetch failed, falling back to a real navigation:', e);
      location.href = url;
      return;
    }
    if (!res.ok) {
      console.warn('[Router] fetch returned', res.status, '— falling back to a real navigation.');
      location.href = url;
      return;
    }
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.querySelector('#page-root');
    const curMain = document.querySelector('#page-root');
    if (!newMain || !curMain) {
      console.warn('[Router] #page-root missing in fetched document — falling back to a real navigation.');
      location.href = url;
      return;
    }

    curMain.replaceWith(newMain);
    document.title = doc.title;
    window.scrollTo(0, 0);
    if (push) history.pushState({ url: url }, '', url);

    const init = PAGE_INIT[pathKey(url)];
    if (init) init();

    // Tell Maryam what page she's on now. Same mechanism as a real
    // reload used to trigger via connectAndRegisterTools() — just
    // invoked directly, since there is no reconnect to hang it off of
    // anymore.
    if (window.__maryam) {
      try {
        if (window.__maryam.preRenderPendingFlowStep) window.__maryam.preRenderPendingFlowStep();
        if (window.__maryam.preRenderPendingQuickActionStep) window.__maryam.preRenderPendingQuickActionStep();
        if (window.__maryam.pushPageContext) await window.__maryam.pushPageContext('client-side navigation');
      } catch (e) {
        console.warn('[Router] Failed to notify Maryam of the page swap:', e);
      }
    }

    window.dispatchEvent(new CustomEvent('maryam:page-swapped', { detail: { url: url } }));
  }

  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') ||
        a.target === '_blank' || a.hasAttribute('data-full-reload')) return;
    if (!/\.html($|\?)/.test(href) && href !== '/') return;
    e.preventDefault();
    navigateTo(href);
  });

  window.addEventListener('popstate', function (e) {
    if (e.state && e.state.url) navigateTo(e.state.url, { push: false });
  });

  window.__maryamRouter = { navigateTo: navigateTo };
})();
