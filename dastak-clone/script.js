// Runs once per real browser page load (never on a router-driven swap
// back to the homepage) — the knock/door splash is a first-impression
// effect, not something that should replay every time the citizen
// navigates back to "/".
let homePageEverInitialized = false;
let homeScrollListenersBound = false;
let homeAnimObserver = null;
let homeScrollSpyObserver = null;

function dismissPreloader() {
    const preloader = document.getElementById('preloader');
    if (!preloader) return;
    if (!homePageEverInitialized) {
        // First real load — keep the original timed animation.
        setTimeout(() => {
            preloader.classList.add('loaded');
            document.body.classList.add('page-loaded');
            setTimeout(() => {
                document.querySelectorAll('.home_3_hero .animate-on-scroll').forEach(el => el.classList.add('is-visible'));
            }, 600);
        }, 200);
    } else {
        // Router swapped the homepage fragment back in — the fetched
        // markup has a fresh, un-dismissed #preloader. Skip the splash.
        preloader.classList.add('loaded');
        document.body.classList.add('page-loaded');
        document.querySelectorAll('.home_3_hero .animate-on-scroll').forEach(el => el.classList.add('is-visible'));
    }
}

function initHomePage() {
    dismissPreloader();
    homePageEverInitialized = true;

    // Navbar scroll effect
    // Window-level listeners are bound once ever (not once per mount) and
    // re-query the live elements each time, so they keep working after a
    // router-driven remount without piling up duplicate listeners.
    if (!homeScrollListenersBound) {
        homeScrollListenersBound = true;
        window.addEventListener('scroll', () => {
            const navbar = document.querySelector('.navbar');
            if (navbar) {
                navbar.classList.toggle('scrolled', window.scrollY > 50);
                navbar.classList.toggle('shadow-sm', window.scrollY > 50);
            }
            const scrollUpBtn = document.getElementById('scrollUpBtn');
            if (scrollUpBtn) scrollUpBtn.classList.toggle('show', window.scrollY > 300);
        });
    }

    // Scroll-triggered animations — disconnect any observer from a prior
    // mount before creating a new one, so detached elements aren't held
    // onto indefinitely across repeated home revisits.
    if (homeAnimObserver) homeAnimObserver.disconnect();
    homeAnimObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                obs.unobserve(entry.target);
            }
        });
    }, { root: null, rootMargin: '0px 0px -50px 0px', threshold: 0.1 });

    document.querySelectorAll('.animate-on-scroll:not(.home_3_hero *)').forEach(el => homeAnimObserver.observe(el));

    // Close mobile offcanvas menu
    function closeMobileMenu() {
        const el = document.getElementById('dastakNavbar');
        if (el && window.bootstrap) {
            const inst = bootstrap.Offcanvas.getInstance(el);
            if (inst) inst.hide();
        }
    }

    // Scrollspy
    const sections = document.querySelectorAll('section[id], footer[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    if (homeScrollSpyObserver) homeScrollSpyObserver.disconnect();
    homeScrollSpyObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => link.classList.remove('active'));
                const activeLink = document.querySelector(`.nav-link[href="#${id}"]`);
                if (activeLink) activeLink.classList.add('active');
            }
        });
    }, { threshold: 0.3 });
    sections.forEach(section => homeScrollSpyObserver.observe(section));

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (!targetId || targetId === '#') return;
            const target = document.querySelector(targetId);
            if (!target) return;
            e.preventDefault();
            navLinks.forEach(link => link.classList.remove('active'));
            this.classList.add('active');
            closeMobileMenu();
            target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Scroll-up button click handler (element-scoped — safe to rebind per mount)
    const scrollUpBtn = document.getElementById('scrollUpBtn');
    if (scrollUpBtn) {
        scrollUpBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    // Language toggle is handled by assets/js/i18n.js

    // Client-side filter for service category cards
    const serviceSearch = document.getElementById('serviceSearch');
    const clearIcon = document.querySelector('.search-clear-icon');
    const cards = document.querySelectorAll('#serviceGrid .explore_slide_item');

    serviceSearch?.addEventListener('input', () => {
        const query = serviceSearch.value.trim().toLowerCase();
        clearIcon.style.display = query.length ? 'block' : 'none';
        cards.forEach(card => {
            const name = card.getAttribute('data-name') || '';
            card.classList.toggle('hidden', query.length > 0 && !name.includes(query));
        });
    });

    clearIcon?.addEventListener('click', () => {
        serviceSearch.value = '';
        clearIcon.style.display = 'none';
        cards.forEach(card => card.classList.remove('hidden'));
        serviceSearch.focus();
    });

    initHomeSliders();
}
window.initHomePage = initHomePage;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomePage);
} else {
    initHomePage();
}

// jQuery-driven sliders — re-run on every mount (router swap-ins give the
// slider elements a fresh, un-initialized DOM each time; slick tracks its
// own "already initialized" state per element via the slick-initialized
// class, so calling this again on the same live elements is a no-op).
function initHomeSliders() {
    if (typeof $ === 'undefined') return;

    if ($('.explore_services_slider').length && !$('.explore_services_slider').hasClass('slick-initialized')) {
        $('.explore_services_slider').slick({
            dots: true,
            arrows: false,
            infinite: true,
            autoplay: true,
            autoplaySpeed: 3000,
            slidesToShow: 5,
            slidesToScroll: 1,
            pauseOnHover: true,
            responsive: [
                { breakpoint: 1200, settings: { slidesToShow: 3 } },
                { breakpoint: 992, settings: { slidesToShow: 2 } },
                { breakpoint: 576, settings: { slidesToShow: 1 } }
            ]
        });
    }

    if ($('.partners_slider').length && !$('.partners_slider').hasClass('slick-initialized')) {
        $('.partners_slider').slick({
            dots: false,
            arrows: false,
            infinite: true,
            autoplay: true,
            autoplaySpeed: 0,
            speed: 8000,
            cssEase: 'linear',
            slidesToShow: 3,
            slidesToScroll: 1,
            pauseOnHover: true,
            responsive: [
                { breakpoint: 1024, settings: { slidesToShow: 2 } },
                { breakpoint: 768, settings: { slidesToShow: 1 } }
            ]
        });
    }

    $('.explore_services_slider, .partners_slider').off('mouseenter.homeSlider mouseleave.homeSlider')
        .on('mouseenter.homeSlider', function () {
            $(this).slick('slickPause');
        }).on('mouseleave.homeSlider', function () {
            $(this).slick('slickPlay');
        });
}
