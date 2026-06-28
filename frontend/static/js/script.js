// =============================================================================
// script.js — AI Business Analytics Landing Page
// Mirrors dashboard.js patterns: animateCounters, scroll effects, UI handlers
// =============================================================================

document.addEventListener('DOMContentLoaded', function () {
    animateCounters();
    setupScrollEffects();
    setupPricingToggle();
    setupMobileNav();
    setupRevealAnimations();
});

// =============================================================================
// COUNTER ANIMATION (mirrors dashboard.js animateCounters)
// =============================================================================
function animateCounters() {
    const counters = document.querySelectorAll('.stat-num[data-target]');
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el       = entry.target;
            const target   = parseInt(el.dataset.target, 10);
            const duration = 1600;
            const step     = Math.ceil(target / (duration / 16));
            let current    = 0;
            const timer = setInterval(() => {
                current = Math.min(current + step, target);
                el.textContent = current.toLocaleString();
                if (current >= target) clearInterval(timer);
            }, 16);
            observer.unobserve(el);
        });
    }, { threshold: 0.4 });
    counters.forEach(c => observer.observe(c));
}

// =============================================================================
// NAVBAR SCROLL SHADOW
// =============================================================================
function setupScrollEffects() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    window.addEventListener('scroll', function () {
        if (window.scrollY > 40) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }, { passive: true });
}

// =============================================================================
// PRICING TOGGLE — monthly / annual
// =============================================================================
function setupPricingToggle() {
    const toggle    = document.getElementById('pricingToggle');
    const proPrice  = document.getElementById('proPrice');
    const proPeriod = document.getElementById('proPeriod');
    const proBilling= document.getElementById('proBillingNote');
    const proCta    = document.getElementById('proCta');

    if (!toggle) return;

    // Default state: annual (toggle is active = annual)
    let isAnnual = true;

    toggle.addEventListener('click', function () {
        isAnnual = !isAnnual;

        if (isAnnual) {
            toggle.classList.remove('monthly');
            proPrice.textContent   = '99';
            proPeriod.textContent  = '/yr';
            if (proBilling) proBilling.textContent = 'Billed once annually — save $21.';
            if (proCta) {
                proCta.textContent = 'Activate Pro — $99/yr';
                proCta.href = 'payment.html?plan=annual';
            }
        } else {
            toggle.classList.add('monthly');
            proPrice.textContent   = '10';
            proPeriod.textContent  = '/mo';
            if (proBilling) proBilling.textContent = 'Billed monthly. Cancel any time.';
            if (proCta) {
                proCta.textContent = 'Activate Pro — $10/mo';
                proCta.href = 'payment.html?plan=monthly';
            }
        }
    });
}

// =============================================================================
// MOBILE NAV DRAWER
// =============================================================================
function setupMobileNav() {
    const hamburger = document.getElementById('hamburger');
    const drawer    = document.getElementById('navDrawer');
    if (!hamburger || !drawer) return;

    hamburger.addEventListener('click', function () {
        const isOpen = drawer.classList.toggle('open');
        hamburger.classList.toggle('open', isOpen);
    });
}

function closeDrawer() {
    const hamburger = document.getElementById('hamburger');
    const drawer    = document.getElementById('navDrawer');
    if (drawer)    drawer.classList.remove('open');
    if (hamburger) hamburger.classList.remove('open');
}

// =============================================================================
// SCROLL REVEAL — fade-up for cards and sections
// =============================================================================
function setupRevealAnimations() {
    // Add reveal class to elements we want to animate
    const targets = document.querySelectorAll(
        '.feature-card, .step-content, .testimonial-card, .pricing-card, .trust-sectors'
    );

    targets.forEach(el => el.classList.add('reveal'));

    const observer = new IntersectionObserver(entries => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                // Stagger children within the same parent
                const siblings = Array.from(entry.target.parentElement.querySelectorAll('.reveal'));
                const idx = siblings.indexOf(entry.target);
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, idx * 80);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(el => observer.observe(el));
}

// =============================================================================
// SMOOTH SCROLL for anchor links (polyfill for older Safari)
// =============================================================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        closeDrawer();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});  