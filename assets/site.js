/* ==========================================================
   LOGIXMOTION - shared motion (home page and Logix Pulse pages).
   Unhides what CSS pre-hid when anime.js is missing, and plays
   [data-reveal] blocks as they scroll into view (IO → anime).
   ========================================================== */
(function () {
  "use strict";

  var REDUCED =
    window.matchMedia &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MOTION = !REDUCED && typeof anime !== "undefined";

  // If anime failed to load, unhide everything that CSS pre-hid.
  if (!MOTION) {
    document.documentElement.classList.remove("anim");
    document.documentElement.classList.add("no-anim");
    return;
  }
  if (!("IntersectionObserver" in window)) return;

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        anime({
          targets: en.target,
          opacity: [0, 1],
          translateY: [26, 0],
          duration: 820,
          delay: parseInt(en.target.getAttribute("data-delay") || 0, 10),
          easing: "easeOutCubic",
        });
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -60px 0px" }
  );
  document.querySelectorAll("[data-reveal]").forEach(function (el) {
    io.observe(el);
  });
})();
