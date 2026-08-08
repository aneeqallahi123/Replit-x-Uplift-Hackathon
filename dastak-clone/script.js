// Preloader
window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
        setTimeout(() => {
            preloader.classList.add('loaded');
            document.body.classList.add('page-loaded');
            setTimeout(() => {
                document.querySelectorAll('.home_3_hero .animate-on-scroll').forEach(el => el.classList.add('is-visible'));
            }, 600);
        }, 200);
    }
});

document.addEventListener('DOMContentLoaded', () => {

    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled', 'shadow-sm');
        } else {
            navbar.classList.remove('scrolled', 'shadow-sm');
        }
    });

    // Scroll-triggered animations
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                obs.unobserve(entry.target);
            }
        });
    }, { root: null, rootMargin: '0px 0px -50px 0px', threshold: 0.1 });

    document.querySelectorAll('.animate-on-scroll:not(.home_3_hero *)').forEach(el => observer.observe(el));

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
    const scrollSpyObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => link.classList.remove('active'));
                const activeLink = document.querySelector(`.nav-link[href="#${id}"]`);
                if (activeLink) activeLink.classList.add('active');
            }
        });
    }, { threshold: 0.3 });
    sections.forEach(section => scrollSpyObserver.observe(section));

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

    // Scroll-up button
    const scrollUpBtn = document.getElementById('scrollUpBtn');
    if (scrollUpBtn) {
        window.addEventListener('scroll', () => {
            scrollUpBtn.classList.toggle('show', window.scrollY > 300);
        });
        scrollUpBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    // Language toggle (visual only)
    const langToggle = document.getElementById('langToggle');
    langToggle?.addEventListener('click', () => langToggle.classList.toggle('on'));

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
});

// jQuery-driven sliders
$(document).ready(function () {
    if ($('.explore_services_slider').length) {
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

    if ($('.partners_slider').length) {
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

    $('.explore_services_slider, .partners_slider').on('mouseenter', function () {
        $(this).slick('slickPause');
    }).on('mouseleave', function () {
        $(this).slick('slickPlay');
    });
});
