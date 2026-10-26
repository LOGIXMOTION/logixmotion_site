/* ==========================================================
   LOGIX PULSE - /pulse exhibits and the home page's Work case 03.
   Real data from assets/pulse/*.json, drawn into SVG at the
   container's own pixel width so labels stay app-sized; the
   geometry and colours are the app's (EcgStrip, MorningChart).
   anime.js plays each exhibit when it scrolls into view, and
   again when it comes back. Without anime, or with reduced
   motion, every exhibit renders its final state.
   ========================================================== */
(function () {
  "use strict";

  var REDUCED =
    window.matchMedia &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  var HAS_ANIME = typeof anime !== "undefined";
  var MOTION = !REDUCED && HAS_ANIME;
  var HAS_IO = "IntersectionObserver" in window;
  var NS = "http://www.w3.org/2000/svg";

  // App palette (Material 3 dark, teal seed) - mirrors pulse.css
  var C = {
    text: "#dde4e1",
    muted: "#bec9c5",
    accent: "#83d5c6",
    grid: "#3f4946",
    hr: "#a6c8e8",
    band: "rgba(131, 213, 198, 0.25)",
    card: "#171d1b",
  };

  function $(s, c) {
    return (c || document).querySelector(s);
  }
  function $all(s, c) {
    return Array.prototype.slice.call((c || document).querySelectorAll(s));
  }
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function label(parent, x, y, str, attrs) {
    var t = el("text", attrs || {}, parent);
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    t.textContent = str;
    return t;
  }
  function r1(v) {
    return Math.round(v * 10) / 10;
  }
  function widthOf(svg) {
    return Math.max(240, Math.round(svg.getBoundingClientRect().width));
  }
  function reset(svg, W, H) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  }
  function getJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + " → " + r.status);
      return r.json();
    });
  }
  function fail(svgs) {
    svgs.forEach(function (svg) {
      var p = document.createElement("p");
      p.className = "pl-fail";
      p.textContent = "Recording unavailable";
      svg.parentNode.replaceChild(p, svg);
    });
  }

  /** Calls enter() whenever target is 40 % visible after having been fully
   *  out of view, and leave() when it goes out of view. */
  function watch(target, enter, leave) {
    if (!HAS_IO) {
      enter();
      return;
    }
    var away = true;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) {
            if (!away && leave) leave();
            away = true;
          } else if (away && en.intersectionRatio >= 0.4) {
            away = false;
            enter();
          }
        });
      },
      { threshold: [0, 0.4] }
    );
    io.observe(target);
  }
  function watchOnce(target, enter) {
    if (!HAS_IO) {
      enter();
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            io.disconnect();
            enter();
          }
        });
      },
      { threshold: 0.3 }
    );
    io.observe(target);
  }

  // Re-draw an SVG chart when its width changes enough to matter.
  var refits = [];
  var refitTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(refitTimer);
    refitTimer = setTimeout(function () {
      refits.forEach(function (fn) {
        fn();
      });
    }, 180);
  });

  // Text counter; the tween object lives on the element so a restart
  // cancels the previous count.
  function countTo(node, from, to, decimals, duration, delay) {
    if (node._plCount) anime.remove(node._plCount);
    var o = (node._plCount = { v: from });
    node.textContent = from.toFixed(decimals);
    anime({
      targets: o,
      v: to,
      duration: duration || 900,
      delay: delay || 0,
      easing: "easeOutExpo",
      update: function () {
        node.textContent = o.v.toFixed(decimals);
      },
    });
  }

  /* ==========================================================
     HERO - words rise, phones stagger in, then float.
     Hidden start states live in CSS (html.anim:not(.pl-off)).
     ========================================================== */
  (function hero() {
    var root = $("#pl-hero");
    if (!root || !MOTION) return;
    var words = $all(".pl-w > span", root);
    var ins = $all("[data-pl-in]", root);
    var phones = $all(".pl-phone", root); // back, then front

    watchOnce(root, function () {
      anime
        .timeline({ easing: "easeOutExpo" })
        .add({
          targets: words,
          translateY: ["112%", "0%"],
          duration: 950,
          delay: anime.stagger(70),
        })
        .add(
          {
            targets: phones,
            opacity: [0, 1],
            translateY: [110, 0],
            rotate: function (e, i) {
              return [i ? -7 : 8, 0];
            },
            duration: 1400,
            delay: anime.stagger(190),
          },
          "-=900"
        )
        .add(
          {
            targets: ins,
            opacity: [0, 1],
            translateY: [14, 0],
            duration: 700,
            delay: anime.stagger(110),
          },
          "-=1300"
        )
        .finished.then(function () {
          anime({
            targets: phones,
            translateY: [0, -9],
            duration: 3400,
            direction: "alternate",
            loop: true,
            easing: "easeInOutSine",
            delay: anime.stagger(700),
          });
        });
    });
  })();

  /* ==========================================================
     ECG STRIP - the app's EcgStrip: grid every 0.2 s and 0.5 mV,
     seconds along the bottom, 0.1/99.9-percentile vertical fit.
     ========================================================== */
  function drawEcg(svg, ecg, heightFor) {
    var W = widthOf(svg);
    var H = heightFor(W);
    reset(svg, W, H);

    var uv = ecg.microvolts;
    var n = uv.length;
    var fs = ecg.sample_rate_hz;
    var secs = n / fs;
    var pps = W / secs;
    var sorted = uv.slice().sort(function (a, b) {
      return a - b;
    });
    var lo = sorted[Math.floor(n * 0.001)];
    var hi = sorted[Math.floor(n * 0.999)];
    var centre = (lo + hi) / 2;
    var span = Math.max(1000, hi - lo);
    var plotH = H - 18; // seconds ruler below the trace
    var k = (plotH * 0.9) / span;
    function x(i) {
      return (i / fs) * pps;
    }
    function y(v) {
      return plotH / 2 - (v - centre) * k;
    }

    var grid = el("g", { stroke: C.grid, "stroke-width": 1, opacity: 0.75 }, svg);
    var cols = [];
    for (var c = 0; c <= Math.round(secs * 5); c++) {
      var gx = Math.min(W - 0.5, Math.max(0.5, r1((c * pps) / 5)));
      cols.push(el("line", { x1: gx, y1: 0, x2: gx, y2: H }, grid));
    }
    var row = 500 * k;
    for (var gy = y(0) % row; gy <= H; gy += row) {
      el("line", { x1: 0, y1: r1(gy), x2: W, y2: r1(gy) }, grid);
    }
    var ruler = el("g", {}, svg);
    for (var s = 0; s < secs; s++) label(ruler, r1(s * pps + 3), H - 5, s + " s");

    var d = "M" + r1(x(0)) + " " + r1(y(uv[0]));
    var cum = new Float64Array(n);
    var px = x(0);
    var py = y(uv[0]);
    for (var i = 1; i < n; i++) {
      var xi = x(i);
      var yi = y(uv[i]);
      d += "L" + r1(xi) + " " + r1(yi);
      cum[i] = cum[i - 1] + Math.sqrt((xi - px) * (xi - px) + (yi - py) * (yi - py));
      px = xi;
      py = yi;
    }
    var trace = el(
      "path",
      {
        d: d,
        fill: "none",
        stroke: C.text,
        "stroke-width": 1.5,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      },
      svg
    );

    var ringG = el("g", { fill: "none", stroke: C.accent, "stroke-width": 1.2 }, svg);
    var dotG = el("g", { fill: C.accent }, svg);
    var beats = ecg.beat_sample_indices;
    var rings = [];
    var dots = beats.map(function (b) {
      var at = { cx: r1(x(b)), cy: r1(y(uv[b])) };
      rings.push(el("circle", { cx: at.cx, cy: at.cy, r: 3.5, opacity: 0 }, ringG));
      return el("circle", { cx: at.cx, cy: at.cy, r: 3.5 }, dotG);
    });

    return {
      W: W,
      n: n,
      x: x,
      y: y,
      uv: uv,
      beats: beats,
      cols: cols,
      ruler: ruler,
      trace: trace,
      cum: cum,
      dots: dots,
      rings: rings,
    };
  }

  // Easing that moves the dash front at constant x speed (the trace's
  // length per sample varies wildly between baseline and QRS).
  function constantX(cum) {
    var n = cum.length;
    var total = cum[n - 1];
    return function () {
      return function (t) {
        var s = t * (n - 1);
        var i = Math.floor(s);
        if (i >= n - 1) return 1;
        return (cum[i] + (cum[i + 1] - cum[i]) * (s - i)) / total;
      };
    };
  }

  function ecgExhibit(ecg) {
    var fig = $("#pl-ecg");
    var svg = $("#pl-ecg-svg");
    var replay = $("#pl-ecg-replay");
    if (!fig || !svg) return;
    var nums = $all("[data-key]", fig);
    var g = null;
    var head = null;

    function height(W) {
      return Math.round(Math.max(170, Math.min(240, W * 0.21)));
    }
    function render() {
      g = drawEcg(svg, ecg, height);
      head = el("g", { opacity: 0 }, svg);
      el("circle", { r: 8, fill: C.accent, opacity: 0.22 }, head);
      el("circle", { r: 2.8, fill: "#fff" }, head);
    }
    function showNumbers() {
      nums.forEach(function (b) {
        b.textContent = String(Math.round(ecg[b.getAttribute("data-key")]));
      });
    }
    function stop() {
      anime.remove([g.trace, head].concat(g.dots, g.rings, g.cols, g.ruler));
      nums.forEach(function (b) {
        if (b._plCount) anime.remove(b._plCount);
      });
    }

    render();
    showNumbers();
    refits.push(function () {
      if (Math.abs(widthOf(svg) - g.W) < 24) return;
      if (MOTION) stop();
      render();
      showNumbers();
    });
    if (!MOTION) {
      replay.style.display = "none";
      return;
    }

    var DRAW = 3600;
    function arm() {
      anime.set(g.trace, { strokeDashoffset: anime.setDashoffset });
      anime.set(g.cols, { opacity: 0 });
      anime.set(g.ruler, { opacity: 0 });
      g.dots.forEach(function (c) {
        c.setAttribute("r", 0);
      });
      nums.forEach(function (b) {
        b.textContent = "0";
      });
    }
    function play() {
      stop();
      arm();
      anime({
        targets: g.cols,
        opacity: [0, 1],
        duration: 420,
        delay: anime.stagger(7),
        easing: "easeOutQuad",
      });
      anime({ targets: g.ruler, opacity: [0, 1], duration: 600, delay: 200, easing: "linear" });
      head.setAttribute("opacity", 1);
      anime({
        targets: g.trace,
        strokeDashoffset: [anime.setDashoffset, 0],
        duration: DRAW,
        delay: 260,
        easing: constantX(g.cum),
        update: function (a) {
          var i = Math.min(g.n - 1, Math.round((a.progress / 100) * (g.n - 1)));
          head.setAttribute(
            "transform",
            "translate(" + r1(g.x(i)) + "," + r1(g.y(g.uv[i])) + ")"
          );
        },
        complete: function () {
          anime({ targets: head, opacity: [1, 0], duration: 400, easing: "linear" });
        },
      });
      var beatAt = function (e, i) {
        return 260 + (DRAW * g.beats[i]) / (g.n - 1);
      };
      anime({
        targets: g.dots,
        r: [0, 3.5],
        duration: 460,
        delay: beatAt,
        easing: "easeOutBack",
      });
      anime({
        targets: g.rings,
        r: [3.5, 15],
        opacity: [0.8, 0],
        duration: 900,
        delay: beatAt,
        easing: "easeOutQuad",
      });
      nums.forEach(function (b, i) {
        countTo(b, 0, Math.round(ecg[b.getAttribute("data-key")]), 0, 1100, 260 + DRAW - 200 + i * 140);
      });
    }

    arm();
    watch(fig, play);
    replay.addEventListener("click", play);
  }

  function ecgMini(ecg) {
    var svg = $("#pl-ecg-mini");
    if (!svg) return;
    var W = 0;
    function height(w) {
      return Math.round(Math.max(150, Math.min(200, w * 0.34)));
    }
    function render() {
      W = drawEcg(svg, ecg, height).W;
    }
    render();
    refits.push(function () {
      if (Math.abs(widthOf(svg) - W) >= 24) render();
    });
  }

  /* ==========================================================
     TREND - the Today page's MorningChart: 28 mornings, usual
     range band, 7-day average, hollow = not counted, HR track.
     Illustrative values (labelled as such on the page).
     ========================================================== */
  var TREND = {
    last: Date.UTC(2026, 9, 26),
    // ms per morning; null = no check that day, "x" = check not counted
    rmssd: [41, 44, 39, 43, 46, 40, 38, null, 45, 41, 37, 43, "x", 44, 39, 42, 36, 41, 38, 40, 37, 34, 31, 30, 27, 28, 25, 24],
    hr: [52, 50, 53, 51, 50, 52, 54, null, 50, 53, 52, 51, 53, 52, 50, 54, 53, 52, 55, 53, 54, 56, 57, 58, 60, 59, 61, 62],
    usual: { low: 37, high: 45 },
    notCounted: "too short for HRV",
  };

  function padded(values, minimumPadding) {
    var lo = Math.min.apply(null, values);
    var hi = Math.max.apply(null, values);
    var pad = Math.max((hi - lo) * 0.1, minimumPadding);
    return { lo: lo - pad, hi: hi + pad };
  }
  function dayLabel(i, withYear) {
    var d = new Date(TREND.last - (TREND.rmssd.length - 1 - i) * 864e5);
    var o = { month: "short", day: "numeric", timeZone: "UTC" };
    if (withYear) o.year = "numeric";
    return d.toLocaleDateString("en-US", o);
  }

  function drawTrend(svg) {
    var DAYS = TREND.rmssd.length;
    var W = widthOf(svg);
    var H = 196;
    var LG = 28, RG = 24, RT = 22, RB = 136, HT = 158, HB = 186;
    reset(svg, W, H);

    var slot = (W - LG - RG) / DAYS;
    function cx(i) {
      return r1(LG + (i + 0.5) * slot);
    }
    var counted = TREND.rmssd.map(function (v) {
      return typeof v === "number" ? v : null;
    });
    var ext = padded(
      counted.filter(function (v) { return v !== null; }).concat([TREND.usual.low, TREND.usual.high]),
      3
    );
    function ry(v) {
      return r1(RB - ((v - ext.lo) / (ext.hi - ext.lo)) * (RB - RT));
    }
    var hrExt = padded(TREND.hr.filter(function (v) { return v !== null; }), 2);
    function hy(v) {
      return r1(HB - ((v - hrExt.lo) / (hrExt.hi - hrExt.lo)) * (HB - HT));
    }

    var bandTop = ry(TREND.usual.high);
    var bandBottom = ry(TREND.usual.low);
    var band = el("rect", {
      x: LG,
      y: bandTop,
      width: W - LG - RG,
      height: r1(bandBottom - bandTop),
      fill: C.band,
    }, svg);
    var bandLabels = el("g", {}, svg);
    label(bandLabels, 0, bandTop, String(TREND.usual.high), { "dominant-baseline": "central" });
    label(bandLabels, 0, bandBottom, String(TREND.usual.low), { "dominant-baseline": "central" });
    label(bandLabels, 0, bandBottom + 17, "ms");
    label(bandLabels, W - RG, bandTop - 4, "your usual range", { "text-anchor": "end" });

    // 7-day average of counted mornings, broken where a window has none
    var d = "";
    var broken = true;
    for (var i = 6; i < DAYS; i++) {
      var win = counted.slice(i - 6, i + 1).filter(function (v) { return v !== null; });
      if (!win.length) {
        broken = true;
        continue;
      }
      var mean = win.reduce(function (a, b) { return a + b; }, 0) / win.length;
      d += (broken ? "M" : "L") + cx(i) + " " + ry(mean);
      broken = false;
    }
    var line = el("path", {
      d: d,
      fill: "none",
      stroke: C.accent,
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }, svg);

    var dots = [];
    var ring = null;
    var ringLabel = null;
    var today = null;
    var ripple = null;
    TREND.rmssd.forEach(function (v, i) {
      if (v === "x") {
        ring = el("circle", { cx: cx(i), cy: (RT + RB) / 2, r: 3.5, fill: "none", stroke: C.muted, "stroke-width": 1.25 }, svg);
        ring._day = i;
        ringLabel = label(svg, cx(i), (RT + RB) / 2 + 17, "not counted", { "text-anchor": "middle", style: "font-size:10px" });
      } else if (v !== null && i === DAYS - 1) {
        ripple = el("circle", { cx: cx(i), cy: ry(v), r: 5.5, fill: "none", stroke: C.accent, "stroke-width": 1.5, opacity: 0 }, svg);
        today = el("circle", { cx: cx(i), cy: ry(v), r: 5.5, fill: C.accent }, svg);
      } else if (v !== null) {
        var c = el("circle", { cx: cx(i), cy: ry(v), r: 3.5, fill: C.text }, svg);
        c._day = i;
        dots.push(c);
      }
    });

    var hrDots = [];
    TREND.hr.forEach(function (v, i) {
      if (v === null) return;
      var c = el("circle", { cx: cx(i), cy: hy(v), r: 3, fill: C.hr }, svg);
      c._day = i;
      hrDots.push(c);
    });
    var hrLabels = el("g", {}, svg);
    label(hrLabels, 0, (HT + HB) / 2, "HR", { "dominant-baseline": "central" });
    var latestHr = TREND.hr.filter(function (v) { return v !== null; }).pop();
    label(hrLabels, W, (HT + HB) / 2, String(latestHr), {
      "dominant-baseline": "central",
      "text-anchor": "end",
      style: "fill:" + C.hr,
    });

    return {
      W: W,
      LG: LG,
      slot: slot,
      band: band,
      bandW: W - LG - RG,
      bandLabels: bandLabels,
      line: line,
      dots: dots,
      ring: ring,
      ringLabel: ringLabel,
      today: today,
      ripple: ripple,
      hrDots: hrDots,
      hrLabels: hrLabels,
    };
  }

  function trendExhibit() {
    var fig = $("#pl-trend");
    var svg = $("#pl-trend-svg");
    var replay = $("#pl-trend-replay");
    var snack = $("#pl-trend-snack");
    if (!fig || !svg) return;
    var DAYS = TREND.rmssd.length;
    var lastMs = TREND.rmssd[DAYS - 1];
    var lastHr = TREND.hr[DAYS - 1];
    $("#pl-trend-head").textContent = "Resting HRV " + lastMs + " ms · HR " + lastHr;
    $("#pl-trend-d0").textContent = dayLabel(0);
    $("#pl-trend-d1").textContent = dayLabel(DAYS - 1);

    var g = drawTrend(svg);

    // Tap a day: what it measured or why it was left out (as in the app)
    var snackTimer = null;
    svg.addEventListener("click", function (e) {
      var box = svg.getBoundingClientRect();
      var x = ((e.clientX - box.left) / box.width) * g.W;
      var i = Math.max(0, Math.min(DAYS - 1, Math.floor((x - g.LG) / g.slot)));
      var v = TREND.rmssd[i];
      if (v === null) return;
      var parts = [dayLabel(i, true)];
      if (v === "x") parts.push(TREND.notCounted);
      else parts.push(v + " ms", "HR " + TREND.hr[i]);
      snack.textContent = parts.join(" · ");
      snack.classList.add("on");
      clearTimeout(snackTimer);
      snackTimer = setTimeout(function () {
        snack.classList.remove("on");
      }, 2800);
    });

    function all() {
      return [g.band, g.bandLabels, g.line, g.ring, g.ringLabel, g.today, g.ripple, g.hrLabels].concat(g.dots, g.hrDots);
    }
    refits.push(function () {
      if (Math.abs(widthOf(svg) - g.W) < 24) return;
      if (MOTION) anime.remove(all());
      g = drawTrend(svg);
    });
    if (!MOTION) {
      replay.style.display = "none";
      return;
    }

    var STEP = 45;
    function dayDelay(e) {
      return 300 + e._day * STEP;
    }
    function arm() {
      g.band.setAttribute("width", 0);
      g.dots.concat(g.hrDots, [g.ring]).forEach(function (c) {
        c.setAttribute("r", 0);
      });
      g.today.setAttribute("r", 0);
      g.ripple.setAttribute("opacity", 0);
      anime.set([g.bandLabels, g.ringLabel, g.hrLabels], { opacity: 0 });
      anime.set(g.line, { strokeDashoffset: anime.setDashoffset });
    }
    function play() {
      anime.remove(all());
      arm();
      anime({ targets: g.band, width: [0, g.bandW], duration: 900, easing: "easeOutCubic" });
      anime({ targets: g.bandLabels, opacity: [0, 1], duration: 500, delay: 350, easing: "linear" });
      anime({ targets: g.dots, r: [0, 3.5], duration: 420, delay: dayDelay, easing: "easeOutBack" });
      anime({ targets: g.ring, r: [0, 3.5], duration: 420, delay: dayDelay(g.ring), easing: "easeOutBack" });
      anime({ targets: g.ringLabel, opacity: [0, 1], translateY: [4, 0], duration: 500, delay: dayDelay(g.ring) + 120, easing: "easeOutQuad" });
      anime({ targets: g.hrDots, r: [0, 3], duration: 380, delay: function (e) { return dayDelay(e) + 160; }, easing: "easeOutBack" });
      anime({ targets: g.hrLabels, opacity: [0, 1], duration: 500, delay: 300 + DAYS * STEP, easing: "linear" });
      anime({
        targets: g.line,
        strokeDashoffset: [anime.setDashoffset, 0],
        duration: (DAYS - 6) * STEP + 400,
        delay: 300 + 6 * STEP + 120,
        easing: "easeInOutSine",
      });
      var end = 300 + (DAYS - 1) * STEP + 260;
      anime({ targets: g.today, r: [0, 5.5], duration: 900, delay: end, easing: "easeOutElastic(1, .5)" });
      anime({ targets: g.ripple, r: [5.5, 17], opacity: [0.8, 0], duration: 1300, delay: end + 200, loop: 3, easing: "easeOutQuad" });
    }

    arm();
    watch(fig, play);
    replay.addEventListener("click", play);
  }

  /* ==========================================================
     BREATHING - the strap's chest motion scrolls past the paced
     stages (12 min in 24 s); each stage's first full 60 s window
     lands as the big number, and every window's reading drops
     onto the rate track against the paced target.
     ========================================================== */
  function breathExhibit(br) {
    var fig = $("#pl-breath");
    var waveSvg = $("#pl-wave-svg");
    var ratesSvg = $("#pl-rates-svg");
    var out = $("#pl-rate");
    var stageOut = $("#pl-rate-stage");
    if (!fig || !waveSvg || !ratesSvg) return;

    var fs = br.sample_rate_hz;
    var cm = br.chest_motion;
    var T = cm.length / fs;
    var WIN = 60;
    var LOOP_MS = 24000;
    var STATIC_T = 547; // reduced motion: mid 20 per minute, its reading in
    // Breaths sit near ±0.3; posture changes swing out to the ±1.2 clip.
    // Scale to the 95th percentile and let those rare swings hit the edge.
    var mags = cm.map(Math.abs).sort(function (a, b) {
      return a - b;
    });
    var A = mags[Math.floor(cm.length * 0.95)] * 1.15;
    function norm(v) {
      return Math.max(-1.08, Math.min(1.08, v / A));
    }
    var stages = br.stages.map(function (s, i, a) {
      return { from: s.from_s, to: i + 1 < a.length ? a[i + 1].from_s : T, target: s.target };
    });
    var readings = [];
    stages.forEach(function (st, si) {
      var w = br.windows.filter(function (w) {
        return w.start_s >= st.from && w.start_s + WIN <= st.to;
      })[0];
      if (w) readings.push({ at: w.start_s + WIN, rate: w.rate, stage: si });
    });

    var wv = null;
    var rt = null;

    function drawWave() {
      var W = widthOf(waveSvg);
      var H = W < 520 ? 112 : 132;
      reset(waveSvg, W, H);
      var VIS = W < 520 ? 40 : 60;
      var nowX = W - 10;
      var pps = nowX / VIS;
      var top = 18;
      var mid = (H + top) / 2;
      var amp = (H - top) / 2 - 6;

      var defs = el("defs", {}, waveSvg);
      var clip = el("clipPath", { id: "pl-wave-clip" }, defs);
      el("rect", { x: 0, y: 0, width: nowX, height: H }, clip);
      var fade = el("linearGradient", { id: "pl-wave-fade", x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
      el("stop", { offset: 0, "stop-color": C.card, "stop-opacity": 1 }, fade);
      el("stop", { offset: 1, "stop-color": C.card, "stop-opacity": 0 }, fade);

      el("line", { x1: 0, y1: mid, x2: W, y2: mid, stroke: C.grid, "stroke-width": 1, opacity: 0.75 }, waveSvg);
      var clipped = el("g", { "clip-path": "url(#pl-wave-clip)" }, waveSvg);
      var mover = el("g", {}, clipped);
      stages.forEach(function (st, i) {
        var sx = r1(st.from * pps);
        if (i) el("line", { x1: sx, y1: top - 2, x2: sx, y2: H, stroke: C.grid, "stroke-width": 1, "stroke-dasharray": "3 4" }, mover);
        label(mover, sx + 6, 11, st.target ? st.target + " per minute" : "as usual");
      });
      var d = "";
      for (var i = 0; i < cm.length; i++) {
        d += (i ? "L" : "M") + r1((i / fs) * pps) + " " + r1(mid - norm(cm[i]) * amp);
      }
      el("path", { d: d, fill: "none", stroke: C.text, "stroke-width": 1.5, "stroke-linejoin": "round" }, mover);
      el("rect", { x: 0, y: 0, width: r1(W * 0.16), height: H, fill: "url(#pl-wave-fade)" }, waveSvg);
      var head = el("g", {}, waveSvg);
      el("circle", { r: 8, fill: C.accent, opacity: 0.22 }, head);
      el("circle", { r: 3.2, fill: C.accent }, head);

      wv = { W: W, nowX: nowX, pps: pps, mid: mid, amp: amp, mover: mover, head: head };
    }

    function drawRates() {
      var W = widthOf(ratesSvg);
      var H = 122;
      reset(ratesSvg, W, H);
      var L = 22, R = W - 6, TOP = 6, BOT = 100, MAX = 24;
      function xr(s) {
        return r1(L + (s / T) * (R - L));
      }
      function yr(v) {
        return r1(BOT - (v / MAX) * (BOT - TOP));
      }
      [5, 10, 15, 20].forEach(function (v) {
        el("line", { x1: L, y1: yr(v), x2: R, y2: yr(v), stroke: C.grid, "stroke-width": 1, opacity: 0.45 }, ratesSvg);
        label(ratesSvg, 0, yr(v), String(v), { "dominant-baseline": "central", style: "font-size:10px" });
      });
      el("line", { x1: L, y1: BOT, x2: R, y2: BOT, stroke: C.grid, "stroke-width": 1 }, ratesSvg);
      var shade = el("rect", { x: L, y: TOP, width: 0, height: BOT - TOP, fill: C.accent, opacity: 0.07 }, ratesSvg);
      var targets = stages.map(function (st, i) {
        if (i) el("line", { x1: xr(st.from), y1: TOP, x2: xr(st.from), y2: BOT, stroke: C.grid, "stroke-width": 1 }, ratesSvg);
        label(ratesSvg, xr((st.from + st.to) / 2), H - 6, st.target ? String(st.target) : "usual", { "text-anchor": "middle" });
        if (!st.target) return null;
        return el("line", {
          x1: xr(st.from) + 2,
          y1: yr(st.target),
          x2: xr(st.to) - 2,
          y2: yr(st.target),
          stroke: C.muted,
          "stroke-width": 1.4,
          "stroke-dasharray": "3 3",
          opacity: 0.55,
        }, ratesSvg);
      });
      var dots = br.windows.map(function (w) {
        return el("circle", { cx: xr(w.start_s + WIN / 2), cy: yr(w.rate), r: 0, fill: C.accent }, ratesSvg);
      });
      var playhead = el("line", { x1: L, y1: TOP - 2, x2: L, y2: BOT + 2, stroke: C.accent, "stroke-width": 1.5 }, ratesSvg);
      rt = { W: W, L: L, xr: xr, shade: shade, targets: targets, dots: dots, playhead: playhead };
    }

    // ---- state per frame ----
    var dotOn = [];
    var shown = -1;
    var lastT = -1;

    function chestAt(t) {
      var s = Math.min(cm.length - 1.001, t * fs);
      var i = Math.floor(s);
      return cm[i] + (cm[i + 1] - cm[i]) * (s - i);
    }
    function setTarget(si, hit) {
      var line = rt.targets[si];
      if (!line) return;
      line.setAttribute("stroke", hit ? C.accent : C.muted);
      line.setAttribute("opacity", hit ? 1 : 0.55);
    }
    function clearState() {
      dotOn = br.windows.map(function () {
        return false;
      });
      rt.dots.forEach(function (c) {
        if (MOTION) anime.remove(c);
        c.setAttribute("r", 0);
      });
      stages.forEach(function (st, si) {
        setTarget(si, false);
      });
      shown = -1;
      if (out._plCount) anime.remove(out._plCount);
      out.textContent = "–";
      stageOut.innerHTML = "&nbsp;";
    }
    function show(k, instant) {
      var prev = shown >= 0 ? readings[shown].rate : 0;
      shown = k;
      if (k < 0) return;
      var r = readings[k];
      var st = stages[r.stage];
      stageOut.textContent = st.target ? "paced " + st.target + " per minute" : "breathing as usual";
      setTarget(r.stage, true);
      if (instant || !MOTION) {
        out.textContent = r.rate.toFixed(1);
        return;
      }
      countTo(out, prev, r.rate, 1, 900);
      anime({ targets: out, scale: [1.12, 1], duration: 650, easing: "easeOutElastic(1, .6)" });
    }
    function frame(t, instant) {
      if (t < lastT) clearState();
      lastT = t;
      wv.mover.setAttribute("transform", "translate(" + r1(wv.nowX - t * wv.pps) + ",0)");
      wv.head.setAttribute(
        "transform",
        "translate(" + wv.nowX + "," + r1(wv.mid - norm(chestAt(t)) * wv.amp) + ")"
      );
      var px = rt.xr(t);
      rt.shade.setAttribute("width", r1(px - rt.L));
      rt.playhead.setAttribute("x1", px);
      rt.playhead.setAttribute("x2", px);
      br.windows.forEach(function (w, i) {
        if (dotOn[i] || t < w.start_s + WIN) return;
        dotOn[i] = true;
        if (instant || !MOTION) rt.dots[i].setAttribute("r", 2.8);
        else anime({ targets: rt.dots[i], r: [0, 2.8], duration: 420, easing: "easeOutBack" });
      });
      var k = -1;
      readings.forEach(function (r, i) {
        if (t >= r.at) k = i;
      });
      if (k !== shown) show(k, instant);
    }
    function render(t) {
      drawWave();
      drawRates();
      lastT = -1;
      clearState();
      frame(t, true);
    }

    if (!MOTION) {
      // Final state: the window at STATIC_T, every reading on the track.
      render(STATIC_T);
      rt.dots.forEach(function (c) {
        c.setAttribute("r", 2.8);
      });
      stages.forEach(function (st, si) {
        setTarget(si, true);
      });
      rt.playhead.setAttribute("opacity", 0);
      rt.shade.setAttribute("opacity", 0);
      refits.push(function () {
        if (Math.abs(widthOf(waveSvg) - wv.W) < 24) return;
        render(STATIC_T);
        rt.dots.forEach(function (c) {
          c.setAttribute("r", 2.8);
        });
        stages.forEach(function (st, si) {
          setTarget(si, true);
        });
        rt.playhead.setAttribute("opacity", 0);
        rt.shade.setAttribute("opacity", 0);
      });
      return;
    }

    var clock = { t: 0 };
    render(0);
    var driver = anime({
      targets: clock,
      t: [0, T],
      duration: LOOP_MS,
      easing: "linear",
      loop: true,
      autoplay: false,
      update: function () {
        frame(clock.t);
      },
    });
    refits.push(function () {
      if (Math.abs(widthOf(waveSvg) - wv.W) < 24) return;
      render(clock.t);
    });
    watch(
      fig,
      function () {
        driver.play();
      },
      function () {
        driver.pause();
      }
    );
  }

  /* ==========================================================
     "Free." - letters rise, the full stop lands last.
     ========================================================== */
  (function free() {
    var node = $("#pl-free");
    if (!node || !MOTION) return;
    var word = node.textContent;
    node.textContent = "";
    var sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = word;
    node.appendChild(sr);
    var letters = word.split("").map(function (ch) {
      var s = document.createElement("span");
      s.setAttribute("aria-hidden", "true");
      s.textContent = ch;
      node.appendChild(s);
      return s;
    });
    anime.set(letters, { opacity: 0, translateY: "45%" });
    watchOnce(node, function () {
      anime
        .timeline({ easing: "easeOutExpo" })
        .add({
          targets: letters,
          opacity: [0, 1],
          translateY: ["45%", "0%"],
          duration: 1000,
          delay: anime.stagger(85),
        })
        .add(
          {
            targets: letters[letters.length - 1],
            scale: [1, 1.7, 1],
            duration: 900,
            easing: "easeOutElastic(1, .45)",
          },
          "-=500"
        );
    });
  })();

  /* ---------- data ---------- */
  trendExhibit();
  getJson("/assets/pulse/ecg-10s.json")
    .then(function (ecg) {
      ecgExhibit(ecg);
      ecgMini(ecg);
    })
    .catch(function (err) {
      console.warn("Logix Pulse ECG:", err);
      fail([$("#pl-ecg-svg"), $("#pl-ecg-mini")].filter(Boolean));
    });
  if ($("#pl-breath")) {
    getJson("/assets/pulse/breathing.json")
      .then(breathExhibit)
      .catch(function (err) {
        console.warn("Logix Pulse breathing:", err);
        fail([$("#pl-wave-svg"), $("#pl-rates-svg")].filter(Boolean));
      });
  }
})();
