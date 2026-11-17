/* SO-101 Study Hub: reading path, route map, and the simulations added in the merged page.
   Older sims (packet bus, counting, redundancy, encoder seam) stay inline in the page. */
(function () {
  "use strict";
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const tok = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const num = (n) => Math.round(n).toLocaleString("en-GB");
  const signed = (d) => (d > 0 ? "+" : "") + Math.round(d);

  function fitCanvas(cv, aspect, maxH, minH) {
    const w = cv.parentElement.clientWidth;
    const h = Math.max(minH || 0, Math.min(maxH, Math.round(w * aspect)));
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  const themeCbs = [];
  const onTheme = (f) => themeCbs.push(f);
  const fireTheme = () => themeCbs.forEach((f) => f());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", fireTheme);
  new MutationObserver(fireTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  function whenVisible(el, cb, margin) {
    if (!("IntersectionObserver" in window)) { cb(); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); cb(); }
    }, { rootMargin: margin || "600px" });
    io.observe(el);
  }
  function trackVisible(el, cb) {
    if (!("IntersectionObserver" in window)) { cb(true); return; }
    new IntersectionObserver((es) => cb(es[es.length - 1].isIntersecting)).observe(el);
  }

  /* ---------- reading path, ticks, top bar ---------- */
  const KEY = "so101-study-v1";
  let done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { done = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* storage blocked: ticks last this visit */ } };
  const fmt = (min) => {
    const r = Math.round(min / 5) * 5, h = Math.floor(r / 60), m = r % 60;
    return "about " + [h ? h + " h" : "", m ? m + " min" : ""].filter(Boolean).join(" ");
  };
  document.querySelectorAll(".day").forEach((day) => {
    const mins = Array.from(day.querySelectorAll("[data-min]")).reduce((s, li) => s + Number(li.dataset.min || 0), 0);
    const t = day.querySelector(".day-time");
    if (t) t.textContent = fmt(mins);
  });
  const tracked = Array.from(document.querySelectorAll("#day-1 [data-min], #day-2 [data-min]"));
  const trackedBox = (el) => el.querySelector("input[type=checkbox]");
  const totalMin = tracked.reduce((s, el) => s + Number(el.dataset.min || 0), 0);
  function meter() {
    const n = tracked.filter((el) => trackedBox(el).checked).length;
    const left = tracked.filter((el) => !trackedBox(el).checked).reduce((s, el) => s + Number(el.dataset.min || 0), 0);
    $("p-fill").style.width = (100 * n) / tracked.length + "%";
    $("p-text").textContent = "Days 1–2: " + n + " of " + tracked.length + " · " + (left ? fmt(left).replace("about ", "") + " left" : "done") + " of " + fmt(totalMin).replace("about ", "");
  }
  document.querySelectorAll('input[type=checkbox][id^="c-"], input[type=checkbox][id^="r-"]').forEach((b) => {
    const holder = b.closest(".item, .chapter, li");
    if (done[b.id]) b.checked = true;
    if (holder) holder.classList.toggle("done", b.checked);
    b.addEventListener("change", () => {
      done[b.id] = b.checked;
      if (holder) holder.classList.toggle("done", b.checked);
      save();
      meter();
    });
  });
  meter();

  const spyMap = { plan: "plan", "day-1": "day-1", "day-2": "day-2", rig: "rig", later: "later", reference: "reference", failures: "reference", glossary: "reference" };
  const navLinks = Array.from(document.querySelectorAll(".topbar nav a"));
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        const target = "#" + spyMap[e.target.id];
        navLinks.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === target));
      });
    }, { rootMargin: "-25% 0px -70% 0px" });
    Object.keys(spyMap).forEach((id) => { const el = $(id); if (el) spy.observe(el); });
  }

  /* ---------- copy buttons ---------- */
  document.querySelectorAll("pre .copy").forEach((btn) => {
    // The button sits outside the scrolling pre so long commands can't push it out of view.
    const pre = btn.parentElement;
    const wrap = document.createElement("div");
    wrap.className = "pre-wrap";
    pre.before(wrap);
    wrap.append(pre, btn);
    btn.addEventListener("click", () => {
      const text = pre.textContent.trim();
      const mark = (label) => { btn.textContent = label; setTimeout(() => { btn.textContent = "Copy"; }, 1400); };
      const fallback = () => {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        mark("Press ⌘C");
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => mark("Copied"), fallback);
      } else fallback();
    });
  });

  /* ---------- failure filter ---------- */
  (function () {
    const box = $("f-chips");
    const cards = Array.from(document.querySelectorAll("#f-list .fail"));
    if (!box || !cards.length) return;
    const cats = ["All"].concat(Array.from(new Set(cards.map((c) => c.dataset.cat))));
    box.innerHTML = cats.map((c) => {
      const n = c === "All" ? cards.length : cards.filter((k) => k.dataset.cat === c).length;
      return '<button type="button" data-c="' + c + '" aria-pressed="' + (c === "All") + '">' + c + " · " + n + "</button>";
    }).join("");
    const setCat = (cat) => {
      box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === cat)));
      cards.forEach((k) => { k.hidden = cat !== "All" && k.dataset.cat !== cat; });
    };
    box.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setCat(b.dataset.c); });
    document.querySelectorAll('a[href^="#f-"]').forEach((a) => a.addEventListener("click", () => setCat("All")));
  })();

  /* ---------- route map ---------- */
  (function () {
    const svg = $("route-svg");
    if (!svg) return;
    const S = [
      { id: "teleop", x: 50, y: 110, name: "Teleop", sub: "29 Oct", state: "done", when: "Done, 29 Oct", title: "Both arms built, first teleop clean", what: "Calibrated, 80 s of teleop, Status 0 on every motor afterwards, follower 32–38 °C. Wrist camera and Insta360 both open in the modes you'll record.", out: "21 snags logged, which is the raw material for the first post." },
      { id: "days12", x: 150, y: 110, name: "Days 1–2", sub: "now", state: "now", when: "Now · five evenings, or two on the short route", title: "This page", what: "Catch up on the bench week, classical robotics and ACT. Both days come before recording, so the demos are collected with ACT's inputs and action chunks in mind.", out: "Answers in your own words, and your 1-D compounding error toy.", href: "#day-1" },
      { id: "rig", x: 250, y: 110, name: "Rig", sub: "alongside", state: "next", when: "Alongside the reading", title: "Finish the rig", what: "Wrist camera bolted and focused, scene camera taped down, heat test, both cameras in teleop, 12 V 5 A brick ordered.", out: "Teleop with both cameras showing in Rerun.", href: "#rig" },
      { id: "d10", x: 340, y: 110, name: "10 demos", sub: "smoke test", state: "next", when: "Once the rig is done", title: "10 demos, all the way through", what: "Record 10 episodes and push them through training and deployment. The result doesn't matter yet: this catches rig and pipeline problems while they're cheap.", out: "A policy, however bad, moving the real arm." },
      { id: "d50", x: 430, y: 110, name: "50 demos", sub: "", state: "next", when: "Before 20 Dec", title: "50 demos, scene frozen", what: "One task. Pick-and-place into a bin is the default, and a gravity-fed dispenser (Bercik) makes demos and evaluations repeatable. The scene stays unchanged from recording through evaluation.", out: "A dataset on the Hub." },
      { id: "act", x: 540, y: 110, name: "ACT", sub: "20 Dec", r: 12, state: "next", when: "By 20 Dec 2026", title: "LeRobot's ACT on the real arm", what: "Train, deploy, 20 trials, log every failure and its cause, film it. Measured on your Mac: 0.92 s per training step at batch 8, so LeRobot's default 100k steps is about 26 hours before data loading. Rented GPU or fewer steps gets decided here.", out: "A success rate out of 20. Everything to the right is compared against it and waits for it." },
      { id: "myact", x: 670, y: 40, name: "Your own ACT", sub: "22 Jan", side: true, state: "next", when: "By 22 Jan 2027", title: "Minimal ACT, written by hand", what: "CVAE and z, transformer decoder and chunks, temporal ensembling. Same demos, same 20 trials. Read LeRobot's implementation only after yours runs, and note what differs. Writing it yourself is how the method sticks.", out: "A comparison against LeRobot's number." },
      { id: "vla", x: 670, y: 110, name: "SmolVLA", sub: "31 Jan", state: "next", when: "By 31 Jan 2027", title: "Fine-tune a VLA", what: "Inference first, to see where it fails. Then fine-tune on the same demos. Same 20 trials against both ACTs, then unseen objects and positions.", out: "\"From Scratch vs Fine-Tuned\" post." },
      { id: "voice", x: 780, y: 110, name: "Voice", sub: "one evening", state: "next", when: "One evening, after SmolVLA", title: "Voice control", what: "Local speech-to-text feeding SmolVLA's instruction string. A good demo with little to learn, so it stays capped at one evening.", out: "A short clip." },
      { id: "elegnt", x: 890, y: 110, name: "ELEGNT", sub: "reliable pick", state: "next", when: "Once a pick is reliable over 20 trials", title: "Expressive motion", what: "Two-evening version: glance and pause before the pick, lift on success, slump on failure, hand-keyed. ELEGNT's F(τ) + γE(τ) never computes E either, so that's a fair start. Then a paired video study with 15–20 friends.", out: "A measured answer to whether the motion changes how people read the robot." },
      { id: "days34", x: 670, y: 185, name: "Days 3–4", sub: "", side: true, state: "next", when: "After the first ACT run", title: "Diffusion Policy, VLAs, π0.5", what: "About 7 hours. These land better once your training curves and failures are real.", out: "Your four-papers post, about the arc rather than four summaries.", href: "#later" },
      { id: "twin", x: 670, y: 250, name: "MuJoCo twin", sub: "", side: "below", state: "next", when: "After the ACT video · two evenings", title: "Digital twin", what: "A MuJoCo copy of the real follower that runs on the Mac. Then numerical IK to a moving target on the same model, with your own solver.", out: "Twin mirroring the real arm." },
      { id: "simdata", x: 790, y: 250, name: "Sim data", sub: "", side: "below", state: "next", when: "After the twin", title: "Sim data as a measured experiment", what: "Isaac Lab and LeIsaac on a rented GPU, real + sim against real alone, same 20 trials. LeRobot's EnvHub guide pins 0.4.1 and your repo is on 0.7.0, so check that first.", out: "Whether sim data helped, as a number." },
      { id: "robo", x: 250, y: 315, name: "RoboScholar v0.1", sub: "20 Nov", low: true, state: "track", when: "Alongside · by 20 Nov 2026", title: "RoboScholar v0.1", what: "A RAG assistant over robotics papers, with an eval harness. It runs alongside all of the above and competes with this page for the same evenings.", out: "A shipped v0.1." },
      { id: "llm", x: 430, y: 315, name: "LLM post", sub: "11 Dec", low: true, state: "track", when: "Alongside · by 11 Dec 2026", title: "LLM blog post", what: "A blog post on LLMs, due nine days before the ACT deadline.", out: "A published post." },
    ];
    const byId = Object.fromEntries(S.map((s) => [s.id, s]));
    const P = [
      '<path d="M50 110 H540" style="fill:none;stroke:var(--muted);stroke-width:3"/>',
      '<path d="M540 110 H890" style="fill:none;stroke:var(--mat);stroke-width:7;stroke-linecap:round"/>',
      '<path d="M540 110 C 590 110 610 40 670 40" style="fill:none;stroke:var(--muted);stroke-width:2.5"/>',
      '<path d="M540 110 C 590 110 610 185 670 185" style="fill:none;stroke:var(--muted);stroke-width:2.5"/>',
      '<path d="M540 110 C 580 110 600 250 670 250 H790" style="fill:none;stroke:var(--muted);stroke-width:2.5"/>',
      '<path d="M50 315 H900" style="fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:5 5"/>',
      '<text x="50" y="299" font-size="12" class="sub">Other projects, in parallel</text>',
      '<text x="835" y="160" font-size="12" text-anchor="middle" style="fill:var(--mat)">your chain</text>',
    ];
    S.forEach((s) => {
      const r = s.r || 9;
      const fill = s.state === "done" ? "var(--mat)" : s.state === "now" ? "var(--signal)" : "var(--surface)";
      const stroke = s.state === "done" ? "var(--mat)" : s.state === "now" ? "var(--signal)" : s.state === "track" ? "var(--muted)" : "var(--ink)";
      let lab;
      if (s.low) {
        lab = '<text x="' + s.x + '" y="' + (s.y + 26) + '" text-anchor="middle" font-size="12">' + s.name + ' <tspan class="sub">' + s.sub + "</tspan></text>";
      } else if (s.side === "below") {
        lab = '<text x="' + s.x + '" y="' + (s.y + 26) + '" text-anchor="middle" font-size="13">' + s.name + "</text>";
      } else if (s.side) {
        lab = '<text x="' + (s.x + 16) + '" y="' + (s.y + 5) + '" font-size="13">' + s.name + (s.sub ? ' <tspan class="sub" font-size="12">' + s.sub + "</tspan>" : "") + "</text>";
      } else {
        lab = '<text x="' + s.x + '" y="' + (s.y - 20) + '" text-anchor="middle" font-size="13">' + s.name + "</text>" + (s.sub ? '<text x="' + s.x + '" y="' + (s.y + 28) + '" text-anchor="middle" font-size="12" class="sub">' + s.sub + "</text>" : "");
      }
      P.push('<g class="stop" data-id="' + s.id + '" tabindex="0" role="button" aria-label="' + s.title + '"><circle cx="' + s.x + '" cy="' + s.y + '" r="20" style="fill:transparent"/><circle class="halo" cx="' + s.x + '" cy="' + s.y + '" r="' + (r + 5) + '"/><circle class="dot" cx="' + s.x + '" cy="' + s.y + '" r="' + r + '" style="fill:' + fill + ";stroke:" + stroke + ';stroke-width:2.5"/>' + lab + "</g>");
    });
    svg.innerHTML = P.join("");
    const detail = $("route-detail");
    const select = (id) => {
      const s = byId[id];
      svg.querySelectorAll(".stop").forEach((g) => g.classList.toggle("sel", g.dataset.id === id));
      detail.innerHTML = '<span class="when">' + s.when + "</span><h4>" + s.title + "</h4><p>" + s.what + '</p><p class="out">' + s.out + (s.href ? ' <a href="' + s.href + '">Go there</a>' : "") + "</p>";
    };
    const pick = (e) => { const g = e.target.closest(".stop"); if (g) select(g.dataset.id); };
    svg.addEventListener("click", pick);
    svg.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(e); } });
    select("days12");
  })();

  /* ---------- gear ratio ---------- */
  (function () {
    const cv = $("gear-cv");
    if (!cv) return;
    const M = {
      C047: { N: 345, V: 12, use: "follower, all six joints" },
      C001: { N: 345, V: 7.4, use: "leader shoulder_lift" },
      C044: { N: 191, V: 7.4, use: "leader shoulder_pan and elbow_flex" },
      C046: { N: 147, V: 7.4, use: "leader wrist_flex, wrist_roll and gripper" },
    };
    let cur = "C046", target = 0, horn = 0, travelled = 0, raf = 0, last = 0, dragging = false, lastA = 0, geom = null;
    const seg = $("gear-seg");
    seg.innerHTML = Object.keys(M).map((k) => '<button type="button" data-v="' + k + '" aria-pressed="' + (k === cur) + '">' + k + " · 1:" + M[k].N + "</button>").join("");
    const bars = () => {
      const N = M[cur].N, f = N / 147, j = f * f, W = (v) => (100 * v) / 5.51;
      $("gear-bars").innerHTML = "<h4>Felt at the horn, against C046</h4>" + [["friction", f, "∝ N"], ["reflected inertia", j, "∝ N²"]].map((r) =>
        '<div class="load-row"><span>' + r[0] + '</span><div class="load-track"><div class="load-fill" style="width:' + W(r[1]) + '%"></div></div><span class="v">×' + r[1].toFixed(1) + " " + r[2] + "</span></div>").join("");
    };
    const log = () => {
      const m = M[cur];
      $("gear-log").innerHTML = cur + ", " + m.V + " V, 1:" + m.N + ": " + m.use + ". Horn moved " + Math.round(travelled) + "°, rotor turned " + ((travelled * m.N) / 360).toFixed(1) + " times. Encoder reads " + Math.round((travelled * 4096) / 360) + " counts: 4096 per horn turn on every variant.";
    };
    function draw() {
      const { ctx, w, h } = fitCanvas(cv, 0.36, 250, 200);
      const ink = tok("--ink"), muted = tok("--muted"), rule = tok("--rule"), servo = tok("--servo"), pla = tok("--pla"), mark = tok("--mark"), mat = tok("--mat");
      ctx.clearRect(0, 0, w, h);
      const r = Math.min(h * 0.33, w * 0.17), cx = w * 0.3, cy = h * 0.47;
      geom = { cx, cy, r };
      const rx = w * 0.72, rr = r * 0.62;
      ctx.fillStyle = servo;
      ctx.beginPath();
      ctx.roundRect(cx - r * 1.35, cy - r * 1.2, r * 2.7, r * 2.4, 10);
      ctx.fill();
      ctx.strokeStyle = mark;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(rad(target) - Math.PI / 2) * r * 1.32, cy + Math.sin(rad(target) - Math.PI / 2) * r * 1.32);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rad(horn));
      ctx.fillStyle = pla;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-r * 0.16, -r * 1.08, r * 0.32, r * 1.08, r * 0.14);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rule;
      ctx.beginPath();
      ctx.moveTo(cx + r * 1.45, cy);
      ctx.lineTo(rx - rr - 8, cy);
      ctx.stroke();
      ctx.save();
      ctx.translate(rx, cy);
      ctx.rotate(rad(horn * M[cur].N));
      ctx.fillStyle = servo;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pla;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -rr * 0.85);
        ctx.stroke();
      }
      ctx.restore();
      ctx.textAlign = "center";
      ctx.font = "12px " + tok("--f-mono");
      ctx.fillStyle = muted;
      ctx.fillText("gearbox 1:" + M[cur].N, (cx + r * 1.45 + rx - rr) / 2, cy - 8);
      ctx.fillStyle = ink;
      ctx.fillText("horn, drag it: " + signed(horn) + "°", cx, h - 12);
      ctx.fillText("rotor: " + ((horn * M[cur].N) / 360).toFixed(1) + " turns", rx, h - 12);
      ctx.fillStyle = mat;
      ctx.textAlign = "left";
    }
    function tick(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const N = M[cur].N, f = N / 147, dead = 1.5 * f, k = 14 / (f * f);
      const err = target - horn;
      if (Math.abs(err) > dead) {
        const step = (err - Math.sign(err) * dead) * (1 - Math.exp(-k * dt));
        horn += step;
        travelled += Math.abs(step);
        raf = requestAnimationFrame(tick);
      }
      draw();
      log();
    }
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    const angle = (e) => {
      const b = cv.getBoundingClientRect();
      return deg(Math.atan2(e.clientY - b.top - geom.cy, e.clientX - b.left - geom.cx)) + 90;
    };
    cv.addEventListener("pointerdown", (e) => {
      const b = cv.getBoundingClientRect();
      if (Math.hypot(e.clientX - b.left - geom.cx, e.clientY - b.top - geom.cy) > geom.r * 1.7) return;
      dragging = true;
      lastA = angle(e);
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const a = angle(e);
      let d = a - lastA;
      d = ((d + 540) % 360) - 180;
      lastA = a;
      target += d;
      $("gear-range").value = clamp(((target + 180) % 360 + 360) % 360 - 180, -180, 180);
      kick();
    });
    const up = () => { dragging = false; };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.style.touchAction = "none";
    $("gear-range").addEventListener("input", (e) => { target = +e.target.value; kick(); });
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      cur = b.dataset.v;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      travelled = 0;
      bars();
      log();
      draw();
    });
    bars();
    log();
    whenVisible(cv, draw);
    onTheme(draw);
    window.addEventListener("resize", draw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  })();

  /* ---------- bus fault-finder ---------- */
  (function () {
    const svg = $("ff-svg");
    if (!svg) return;
    const NAMES = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"];
    const fresh = () => ({
      brick: true, loose: false, ids: [1, 2, 3, 4, 5, 6], dead: new Set(), swapped: [0, 0, 0, 0, 0, 0],
      cables: [[-1, 1, 0, 0], [0, 1, 1, 0], [1, 1, 2, 0], [2, 1, 3, 0], [3, 1, 4, 0], [4, 1, 5, 0]].map((c) => ({ a: [c[0], c[1]], b: [c[2], c[3]], seated: true })),
    });
    const SC = [
      { cause: "brick", where: null, make: (s) => { s.brick = false; }, why: "Failures 1 and 8. USB powers the board's serial chip, so the port looks alive while every motor is dead. No LEDs is the giveaway.", hint: "Look at the LEDs before thinking about the wiring." },
      { cause: "terminal", where: null, make: (s) => { s.loose = true; }, why: "Failure 9. The terminal screws were never tightened, so power came and went. Faults that change between identical pings are nearly always power.", hint: "Ping several times without touching anything. Does the answer stay the same?" },
      { cause: "skipped", where: [4], make: (s) => { s.cables[4] = { a: [3, 1], b: [5, 0], seated: true }; s.cables.splice(5, 1); }, why: "Failure 10. wrist_flex was cabled straight to the gripper. One ID missing from the middle of the list can't be a broken chain, because a break would take everything after it too.", hint: "One ID is missing but the IDs after it still answer. What wiring allows that?" },
      { cause: "dead", where: [0], make: (s) => { s.dead.add("0:1"); }, why: "Failure 11. Dead right socket on shoulder_pan. Reseating changes nothing, and swapping that motor's plugs puts the dead socket on the board's side, so even ID 1 vanishes. That's the test that separates a bad socket from a bad cable.", hint: "Reseat first. If nothing changes, try ⇄ on the last motor that answers." },
      { cause: "unseated", where: [4, 5], make: (s) => { s.cables[5].seated = false; }, why: "Failure 12. The gripper plug came loose during cable tidying. Only the end of the chain goes missing, and a reseat fixes it.", hint: "The end of the chain is missing. Reseat and ping again." },
      { cause: "unseated", where: [2, 3], make: (s) => { s.cables[3].seated = false; }, why: "A half-seated plug between elbow_flex and wrist_flex, the sort of thing closing a joint does. Everything past the break disappears together.", hint: "Everything past one point is missing. Reseat and ping again." },
      { cause: "dup", where: [3], make: (s) => { s.ids[3] = 1; }, why: "Two motors both answering to ID 1: a factory-fresh replacement in the wrist_flex position that never got its ID. Their replies collide, which is a different error from silence.", hint: "Read the error text. Is ID 1 silent, or is its reply corrupted? And why is ID 4 gone while 5 and 6 answer?" },
    ];
    let s = fresh(), mode = "mystery", scenario = null, order = [], revealed = false, solved = false, pingN = 0, lastPower = true, answers = null, focusKey = null;
    const X = (m) => 136 + m * 104, W = 84, BY = 46, BH = 72;
    const sockX = (m, k) => (m === -1 ? 92 : X(m) + (k === 0 ? 18 : W - 18));
    const SY = BY + BH;
    const reach = () => {
      const seen = new Set(), q = [-1];
      const ok = (m, k) => m === -1 || !s.dead.has(m + ":" + k);
      while (q.length) {
        const n = q.shift();
        s.cables.forEach((c) => {
          if (!c.seated) return;
          let f, t;
          if (c.a[0] === n) { f = c.a; t = c.b; } else if (c.b[0] === n) { f = c.b; t = c.a; } else return;
          if (!ok(f[0], f[1]) || !ok(t[0], t[1])) return;
          if (t[0] !== -1 && !seen.has(t[0])) { seen.add(t[0]); q.push(t[0]); }
        });
      }
      return seen;
    };
    function draw() {
      const showTrue = mode === "free" || revealed;
      const r = reach();
      const P = [];
      P.push('<rect x="16" y="' + BY + '" width="92" height="' + BH + '" rx="6" class="ff-box"/><text x="62" y="' + (BY + 22) + '" text-anchor="middle" font-size="13">Board</text><text x="62" y="' + (BY + 40) + '" text-anchor="middle" font-size="11" class="sub">' + (s.brick ? "brick on" : "brick off") + "</text>");
      if (showTrue && s.loose) P.push('<text x="62" y="' + (BY + 56) + '" text-anchor="middle" font-size="11" style="fill:var(--signal)">loose</text>');
      const cableList = showTrue ? s.cables : fresh().cables;
      cableList.forEach((c, i) => {
        const x1 = sockX(c.a[0], c.a[1]), x2 = sockX(c.b[0], c.b[1]);
        const dip = 26 + Math.abs(x2 - x1) * 0.14;
        const d = "M" + x1 + " " + SY + " C" + x1 + " " + (SY + dip) + " " + x2 + " " + (SY + dip) + " " + x2 + " " + SY;
        const off = showTrue && !c.seated;
        P.push('<path d="' + d + '" class="cable" style="stroke:' + (off ? "var(--signal)" : showTrue ? "var(--ink)" : "var(--rule)") + (off ? ";stroke-dasharray:4 6" : "") + '"/>');
        if (mode === "free") P.push('<path d="' + d + '" class="hit" data-cable="' + i + '"><title>Toggle this cable</title></path>');
      });
      for (let m = 0; m < 6; m++) {
        const lit = r.has(m) && s.brick && lastPower;
        const a = answers ? answers[m] : null;
        const cls = a === "ok" ? " ok" : a === "bad" ? " bad" : "";
        P.push('<rect x="' + X(m) + '" y="' + BY + '" width="' + W + '" height="' + BH + '" rx="6" class="ff-box' + cls + '"/>');
        P.push('<text x="' + (X(m) + W / 2) + '" y="' + (BY + 24) + '" text-anchor="middle" font-size="14">' + (showTrue ? "ID " + s.ids[m] : "ID " + (m + 1)) + "</text>");
        P.push('<text x="' + (X(m) + W / 2) + '" y="' + (BY + 42) + '" text-anchor="middle" font-size="10" class="sub">' + NAMES[m] + "</text>");
        P.push('<circle cx="' + (X(m) + W - 11) + '" cy="' + (BY + 11) + '" r="4" style="fill:' + (lit ? "var(--mat)" : "var(--rule)") + '"/>');
        P.push('<g class="swap" data-swap="' + m + '" tabindex="0" role="button" aria-label="Swap the two plugs on ' + NAMES[m] + '"><rect x="' + (X(m) + W / 2 - 16) + '" y="' + (BY - 30) + '" width="32" height="22" rx="4" style="fill:var(--paper);stroke:var(--rule)"/><text x="' + (X(m) + W / 2) + '" y="' + (BY - 14) + '" text-anchor="middle" font-size="13">⇄</text></g>');
        [0, 1].forEach((k) => {
          const dead = showTrue && s.dead.has(m + ":" + k);
          P.push('<circle cx="' + sockX(m, k) + '" cy="' + SY + '" r="6" class="sock" data-sock="' + m + ":" + k + '" style="fill:' + (dead ? "var(--signal)" : "var(--surface)") + ';stroke:var(--ink);stroke-width:1.5"><title>' + NAMES[m] + (k ? " right" : " left") + " socket</title></circle>");
        });
        if (s.swapped[m]) P.push('<text x="' + (X(m) + W / 2) + '" y="' + (BY + 60) + '" text-anchor="middle" font-size="10" style="fill:var(--mark)">plugs swapped</text>');
      }
      P.push('<circle cx="92" cy="' + SY + '" r="6" style="fill:var(--surface);stroke:var(--ink);stroke-width:1.5"/>');
      if (mode === "mystery" && !revealed) P.push('<text x="400" y="190" text-anchor="middle" font-size="11" class="sub">The cables are buried in the arm. You only get LEDs, pings and your hands.</text>');
      svg.innerHTML = P.join("");
      $("ff-brick").textContent = "Brick: " + (s.brick ? "on" : "off");
      $("ff-tighten").textContent = mode === "free" ? (s.loose ? "Tighten terminals" : "Loosen terminals") : "Tighten terminals";
      if (focusKey !== null) {
        const g = svg.querySelector('[data-swap="' + focusKey + '"]');
        if (g) g.focus();
        focusKey = null;
      }
    }
    const logEl = $("ff-log");
    const say = (html) => { logEl.innerHTML = html; };
    function ping() {
      pingN++;
      const r = reach();
      lastPower = s.brick && (!s.loose || Math.random() < 0.45);
      answers = [0, 0, 0, 0, 0, 0].map(() => "bad");
      const found = [], collide = [];
      if (lastPower) {
        for (let id = 1; id <= 6; id++) {
          const who = [0, 1, 2, 3, 4, 5].filter((m) => r.has(m) && s.ids[m] === id);
          if (who.length === 1) { found.push(id); answers[who[0]] = "ok"; }
          if (who.length > 1) collide.push(id);
        }
      }
      const missing = [1, 2, 3, 4, 5, 6].filter((id) => !found.includes(id));
      const lines = ["<b>Ping " + pingN + "</b>"];
      if (!missing.length) lines.push('<span class="good">All six answer. Full found motor list (id: model): {' + found.map((i) => i + ": 777").join(", ") + "}</span>");
      else {
        lines.push('<span class="bad">Missing motor IDs: ' + missing.join(", ") + "</span>");
        lines.push("Full found motor list (id: model): {" + found.map((i) => i + ": 777").join(", ") + "}");
        collide.forEach((id) => lines.push('<span class="bad">ID ' + id + ": [TxRxResult] Incorrect status packet!</span>"));
      }
      say(lines.join("<br>"));
      draw();
    }
    function newMystery() {
      if (!order.length) order = SC.map((x, i) => i).sort(() => Math.random() - 0.5);
      scenario = SC[order.pop()];
      s = fresh();
      scenario.make(s);
      revealed = false;
      solved = false;
      answers = null;
      lastPower = true;
      pingN = 0;
      $("ff-cause").value = "";
      $("ff-where").value = "";
      say("Something's wrong with this follower. Ping it, look at the LEDs, try a fix, then name the fault.");
      draw();
    }
    function setMode(m) {
      mode = m;
      $("ff-mode").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
      $("ff-diag").hidden = m !== "mystery";
      $("ff-new").hidden = m !== "mystery";
      if (m === "free") {
        s = fresh();
        answers = null;
        lastPower = true;
        pingN = 0;
        revealed = true;
        say("Click a cable to pull it out, a socket to kill it, ⇄ to swap a motor's plugs. Predict the ping before you press it.");
        draw();
      } else newMystery();
    }
    svg.addEventListener("click", (e) => {
      const sw = e.target.closest("[data-swap]");
      if (sw) {
        const m = +sw.dataset.swap;
        s.cables.forEach((c) => { [c.a, c.b].forEach((end) => { if (end[0] === m) end[1] = 1 - end[1]; }); });
        s.swapped[m] = 1 - s.swapped[m];
        answers = null;
        focusKey = m;
        say(NAMES[m] + ": plugs swapped. Ping to see what changed.");
        draw();
        return;
      }
      if (mode !== "free") return;
      const hit = e.target.closest("[data-cable]");
      if (hit) { const c = s.cables[+hit.dataset.cable]; c.seated = !c.seated; answers = null; draw(); return; }
      const so = e.target.closest("[data-sock]");
      if (so) { const k = so.dataset.sock; if (s.dead.has(k)) s.dead.delete(k); else s.dead.add(k); answers = null; draw(); }
    });
    svg.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-swap]")) { e.preventDefault(); e.target.closest("[data-swap]").dispatchEvent(new MouseEvent("click", { bubbles: true })); }
    });
    $("ff-ping").addEventListener("click", ping);
    $("ff-brick").addEventListener("click", () => { s.brick = !s.brick; lastPower = true; answers = null; say("Brick " + (s.brick ? "on." : "off.") + " Ping to check."); draw(); });
    $("ff-reseat").addEventListener("click", () => { s.cables.forEach((c) => { c.seated = true; }); answers = null; say("Every plug pushed in until it clicks. Ping to check."); draw(); });
    $("ff-tighten").addEventListener("click", () => {
      if (mode === "free") s.loose = !s.loose; else s.loose = false;
      lastPower = true;
      answers = null;
      say(s.loose ? "Terminal screws backed off. Ping a few times." : "Terminal screws tight. Ping to check.");
      draw();
    });
    $("ff-new").addEventListener("click", newMystery);
    $("ff-mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setMode(b.dataset.mode); });
    $("ff-check").addEventListener("click", () => {
      if (!scenario) return;
      const cause = $("ff-cause").value, where = $("ff-where").value;
      if (!cause) { say("Pick a cause first."); return; }
      const whereOK = !scenario.where || (where !== "" && scenario.where.includes(+where));
      if (cause === scenario.cause && whereOK) {
        revealed = true;
        solved = true;
        say('<span class="good">Right.</span> ' + scenario.why + " The diagram now shows the real wiring. Press New mystery for another.");
        draw();
      } else if (cause === scenario.cause) {
        say("Right kind of fault, wrong place. Which motors does it sit between?");
      } else {
        say('<span class="bad">Not that.</span> ' + scenario.hint);
      }
    });
    setMode("mystery");
    onTheme(draw);
  })();

  /* ---------- shared pose and 3D core ---------- */
  const JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"];
  const LIMITS = { shoulder_pan: [-110, 110], shoulder_lift: [-100, 100], elbow_flex: [-96, 96], wrist_flex: [-95, 95], wrist_roll: [-157, 162], gripper: [0, 100] };
  const POSES = {
    "Mid-range": { shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0, gripper: 50 },
    Rest: { shoulder_pan: 0, shoulder_lift: -100, elbow_flex: 90, wrist_flex: 60, wrist_roll: 0, gripper: 5 },
    "Reach forward": { shoulder_pan: 0, shoulder_lift: 60, elbow_flex: -60, wrist_flex: 0, wrist_roll: 0, gripper: 50 },
    "Pick down": { shoulder_pan: 0, shoulder_lift: 34, elbow_flex: -19, wrist_flex: 75, wrist_roll: 0, gripper: 60 },
  };
  const pose = Object.assign({}, POSES["Mid-range"]);
  const poseCbs = [];
  const setPose = (p) => { Object.assign(pose, p); poseCbs.forEach((f) => f()); };
  let tween = 0;
  function tweenPose(target) {
    if (reduceMotion) { setPose(target); return; }
    const from = Object.assign({}, pose), t0 = performance.now();
    cancelAnimationFrame(tween);
    const step = (now) => {
      const k = clamp((now - t0) / 500, 0, 1), e = k * k * (3 - 2 * k), p = {};
      JOINTS.forEach((n) => { p[n] = from[n] + (target[n] - from[n]) * e; });
      setPose(p);
      if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }
  function buildSliders(box, onHover) {
    box.innerHTML = JOINTS.map((n, i) => '<div class="slider" data-j="' + n + '"><div class="lab"><b>' + (i + 1) + " " + n + "</b><span></span></div><input type=\"range\" min=\"" + LIMITS[n][0] + '" max="' + LIMITS[n][1] + '" step="1" aria-label="' + n + '"></div>').join("");
    const rows = Array.from(box.querySelectorAll(".slider"));
    const sync = () => rows.forEach((row) => {
      const n = row.dataset.j, inp = row.querySelector("input");
      if (document.activeElement !== inp || Math.abs(+inp.value - pose[n]) > 1) inp.value = pose[n];
      row.querySelector("span").textContent = n === "gripper" ? Math.round(pose[n]) + " / 100" : signed(pose[n]) + "°";
    });
    rows.forEach((row) => {
      const n = row.dataset.j, inp = row.querySelector("input");
      inp.addEventListener("input", () => { cancelAnimationFrame(tween); setPose({ [n]: +inp.value }); });
      if (onHover) {
        row.addEventListener("pointerenter", () => onHover(n));
        row.addEventListener("pointerleave", () => onHover(null));
        inp.addEventListener("focus", () => onHover(n));
        inp.addEventListener("blur", () => onHover(null));
      }
    });
    poseCbs.push(sync);
    sync();
  }
  function buildPoseButtons(box) {
    box.innerHTML = Object.keys(POSES).map((k) => '<button type="button" data-p="' + k + '">' + k + "</button>").join("");
    box.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) tweenPose(POSES[b.dataset.p]); });
  }
  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("Couldn't load " + src));
    document.head.appendChild(s);
  });
  let depsP = null;
  const loadDeps = () => depsP || (depsP = loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js")
    .then(() => loadScript("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"))
    .then(() => loadScript("so101-arm-data.js")));

  const CORE = {};
  function core() {
    if (CORE.ready) return CORE;
    const T = window.THREE, DATA = window.SO101_ARM;
    const bytes = (b64) => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; };
    const cache = {};
    CORE.geom = (stem) => {
      if (cache[stem]) return cache[stem];
      const g = DATA.geoms[stem], pI = new Int16Array(bytes(g.p)), nI = new Int8Array(bytes(g.n)), idx = new Uint16Array(bytes(g.i));
      const pos = new Float32Array(pI.length), nrm = new Float32Array(nI.length);
      for (let i = 0; i < pI.length; i++) pos[i] = pI[i] * DATA.quant;
      for (let i = 0; i < nI.length; i += 3) {
        const x = nI[i], y = nI[i + 1], z = nI[i + 2], l = Math.hypot(x, y, z) || 1;
        nrm[i] = x / l; nrm[i + 1] = y / l; nrm[i + 2] = z / l;
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      geo.setAttribute("normal", new T.BufferAttribute(nrm, 3));
      geo.setIndex(new T.BufferAttribute(idx, 1));
      return (cache[stem] = geo);
    };
    CORE.col = (t) => new T.Color(tok(t)).convertSRGBToLinear();
    CORE.place = (o, xyz, rpy) => { o.position.set(xyz[0], xyz[1], xyz[2]); o.rotation.set(rpy[0], rpy[1], rpy[2], "ZYX"); };
    CORE.makeMats = () => ({
      pla: new T.MeshStandardMaterial({ color: CORE.col("--pla"), roughness: 0.62, metalness: 0 }),
      servo: new T.MeshStandardMaterial({ color: CORE.col("--servo"), roughness: 0.42, metalness: 0.05 }),
    });
    CORE.makeRobot = (name, mats) => {
      const R = DATA.robots[name], links = {}, joints = {}, children = new Set();
      Object.keys(R.links).forEach((ln) => {
        const l = R.links[ln], group = new T.Group(), motors = [], meshes = [];
        l.v.forEach((v) => {
          const isServo = v.mat === "sts3215";
          const mesh = new T.Mesh(CORE.geom(v.g), isServo ? mats.servo : mats.pla);
          CORE.place(mesh, v.xyz, v.rpy);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
          meshes.push(mesh);
          if (isServo) motors.push(mesh);
        });
        links[ln] = { group, motors, meshes, m: l.m, com: new T.Vector3(l.com[0], l.com[1], l.com[2]) };
      });
      R.joints.forEach((j) => {
        const origin = new T.Group(), spin = new T.Group();
        CORE.place(origin, j.xyz, j.rpy);
        origin.add(spin);
        links[j.parent].group.add(origin);
        spin.add(links[j.child].group);
        children.add(j.child);
        joints[j.name] = { spin, axis: new T.Vector3(j.axis[0], j.axis[1], j.axis[2]), lower: j.lower, upper: j.upper, parent: j.parent, child: j.child, type: j.type };
      });
      const subtree = (ln) => {
        const out = [ln];
        R.joints.forEach((j) => { if (j.parent === ln) out.push(...subtree(j.child)); });
        return out;
      };
      Object.values(joints).forEach((j) => { j.subtree = subtree(j.child); });
      const group = new T.Group();
      group.add(links[Object.keys(links).find((k) => !children.has(k))].group);
      const tip = name === "follower" ? "gripper_frame_link" : "handle_frame_link";
      const apply = () => {
        JOINTS.forEach((n) => {
          const j = joints[n];
          const a = n === "gripper" ? j.lower + (pose.gripper / 100) * (j.upper - j.lower) : rad(pose[n]);
          j.spin.quaternion.setFromAxisAngle(j.axis, a);
        });
        group.updateMatrixWorld(true);
      };
      return { name, group, links, joints, tip, apply };
    };
    CORE.makeChain = (name, tip) => {
      const R = DATA.robots[name], byChild = {};
      R.joints.forEach((j) => { byChild[j.child] = j; });
      const path = [];
      let l = tip;
      while (byChild[l]) { path.unshift(byChild[l]); l = byChild[l].parent; }
      return path.map((j) => {
        const e = new T.Euler(j.rpy[0], j.rpy[1], j.rpy[2], "ZYX");
        const m = new T.Matrix4().makeRotationFromEuler(e);
        m.setPosition(j.xyz[0], j.xyz[1], j.xyz[2]);
        return { name: j.name, rev: j.type === "revolute", T: m, axis: new T.Vector3(j.axis[0], j.axis[1], j.axis[2]) };
      });
    };
    const tmpM = new T.Matrix4();
    CORE.fk = (chain, q, out) => {
      out.identity();
      chain.forEach((s) => {
        out.multiply(s.T);
        if (s.rev) out.multiply(tmpM.makeRotationAxis(s.axis, q[s.name] || 0));
      });
      return out;
    };
    CORE.addLights = (scene) => {
      const hemi = new T.HemisphereLight(0xffffff, 0x4c5850, 0.52);
      hemi.position.set(0, 0, 1);
      scene.add(hemi);
      const key = new T.DirectionalLight(0xffffff, 0.66);
      key.position.set(0.55, -0.5, 1.1);
      key.target.position.set(0.16, 0, 0);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      const c = key.shadow.camera;
      c.left = -0.8; c.right = 0.8; c.top = 0.8; c.bottom = -0.8; c.near = 0.1; c.far = 3;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.0015;
      scene.add(key, key.target);
      const fill = new T.DirectionalLight(0xffffff, 0.16);
      fill.position.set(-0.6, 0.5, 0.35);
      scene.add(fill);
    };
    CORE.makeStage = (canvas, holder, draw, resize) => {
      const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const st = { renderer, onscreen: true, queued: false, pending: false };
      st.invalidate = () => {
        if (st.queued) return;
        if (!st.onscreen) { st.pending = true; return; }
        st.queued = true;
        requestAnimationFrame(() => { st.queued = false; draw(); });
      };
      trackVisible(holder, (v) => {
        st.onscreen = v;
        if (v && st.pending) { st.pending = false; st.invalidate(); }
      });
      if ("ResizeObserver" in window) new ResizeObserver(() => { resize(); st.invalidate(); }).observe(holder);
      else window.addEventListener("resize", () => { resize(); st.invalidate(); });
      return st;
    };
    CORE.wheelGuard = (cv, get) => {
      cv.addEventListener("wheel", (e) => { const c = get(); if (c) c.enableZoom = e.ctrlKey || e.metaKey; }, { capture: true, passive: true });
    };
    /* where the jaws can come straight down onto the bench */
    CORE.pickRange = () => {
      const chain = CORE.makeChain("follower", "gripper_frame_link");
      const m = new T.Matrix4(), TABLE = -0.0024, PAN_X = 0.0388353;
      const toolZ = new T.Vector3(), d = new T.Vector3(0, 0, -1), n = new T.Vector3(), cross = new T.Vector3();
      const liftChain = CORE.makeChain("follower", "upper_arm_link");
      CORE.fk(liftChain, {}, m);
      n.copy(liftChain[liftChain.length - 1].axis).transformDirection(m);
      const ang = (q) => {
        CORE.fk(chain, q, m);
        toolZ.setFromMatrixColumn(m, 2);
        return Math.atan2(n.dot(cross.crossVectors(d, toolZ)), d.dot(toolZ));
      };
      let rmin = Infinity, rmax = -Infinity;
      for (let l = -100; l <= 100; l += 2) for (let e = -96; e <= 96; e += 2) {
        const q = { shoulder_lift: rad(l), elbow_flex: rad(e), wrist_flex: 0 };
        const a0 = ang(q);
        q.wrist_flex = 0.3;
        const a1 = ang(q);
        let dd = a1 - a0;
        dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        const w = -a0 / (dd / 0.3);
        if (Math.abs(deg(w)) > 95) continue;
        q.wrist_flex = w;
        CORE.fk(chain, q, m);
        const r = m.elements[12] - PAN_X, z = m.elements[14];
        if (r > 0 && Math.abs(z - (TABLE + 0.012)) <= 0.008) { rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
      }
      return { rmin, rmax, panX: PAN_X, table: TABLE };
    };
    CORE.ready = true;
    return CORE;
  }
  function failStage(holder, err) {
    const msg = document.createElement("div");
    msg.className = "fallback";
    msg.textContent = "The 3D view couldn't start here (" + err.message + "). The sliders and the rest of the page still work.";
    holder.innerHTML = "";
    holder.appendChild(msg);
  }

  /* ---------- 3D arm ---------- */
  (function () {
    const holder = $("arm-stage");
    if (!holder) return;
    let hoverCb = null;
    buildSliders($("arm-sliders"), (n) => { if (hoverCb) hoverCb(n); });
    buildPoseButtons($("arm-poses"));
    const CAL = {
      follower: { shoulder_pan: [619, 3366], shoulder_lift: [915, 3305], elbow_flex: [947, 3169], wrist_flex: [1012, 3294], wrist_roll: [0, 4095], gripper: [1310, 2809] },
      leader: { shoulder_pan: [680, 3240], shoulder_lift: [1107, 3475], elbow_flex: [898, 3095], wrist_flex: [915, 3230], wrist_roll: [0, 4095], gripper: [1462, 2644] },
    };
    const STALL = 2.94, STALL_A = 2.7, BRICK_A = 2.0;
    $("arm-load").innerHTML = '<div class="load-head"><label for="arm-pay">Payload in the jaws <input type="range" id="arm-pay" min="0" max="500" step="10" value="0"></label><b class="num" id="arm-pay-v">0 g</b><span class="load-total" id="arm-total"></span></div><div id="arm-bars"></div>';
    let payload = 0;
    $("arm-pay").addEventListener("input", (e) => {
      payload = +e.target.value / 1000;
      $("arm-pay-v").textContent = e.target.value + " g";
      if (api) api.invalidate();
    });
    let api = null;
    whenVisible(holder, () => {
      loadDeps().then(() => { api = init(); }).catch((err) => failStage(holder, err));
    });
    function init() {
      const C = core(), T = window.THREE;
      const cv = $("arm-cv"), labels = $("arm-labels");
      let W = 0, H = 0;
      const resize = () => {
        W = holder.clientWidth;
        H = clamp(Math.round(W * 0.62), 320, 560);
        cv.style.height = H + "px";
        stage.renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
      };
      const scene = new T.Scene();
      C.addLights(scene);
      const camera = new T.PerspectiveCamera(30, 1.5, 0.01, 10);
      camera.up.set(0, 0, 1);
      camera.position.set(0.72, -0.72, 0.46);
      let controls = null;
      C.wheelGuard(cv, () => controls);
      const stage = C.makeStage(cv, holder, draw, resize);
      controls = new T.OrbitControls(camera, cv);
      controls.target.set(0.16, 0, 0.14);
      controls.update();
      controls.addEventListener("change", () => stage.invalidate());
      resize();

      /* cutting mat */
      const texCv = document.createElement("canvas");
      texCv.width = texCv.height = 1024;
      const tex = new T.CanvasTexture(texCv);
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = stage.renderer.capabilities.getMaxAnisotropy();
      const paintMat = () => {
        const c = texCv.getContext("2d"), n = 80, s = 1024 / n;
        c.fillStyle = tok("--cut-mat");
        c.fillRect(0, 0, 1024, 1024);
        for (let i = 0; i <= n; i++) {
          const bold = i % 5 === 0;
          c.strokeStyle = tok(bold ? "--cut-bold" : "--cut-line");
          c.lineWidth = bold ? 1.6 : 0.8;
          c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, 1024); c.stroke();
          c.beginPath(); c.moveTo(0, i * s); c.lineTo(1024, i * s); c.stroke();
        }
        tex.needsUpdate = true;
      };
      paintMat();
      const groundMat = new T.MeshStandardMaterial({ map: tex, roughness: 0.92 });
      const ground = new T.Mesh(new T.PlaneGeometry(0.8, 0.8), groundMat);
      ground.position.set(0.2, 0, -0.0024);
      ground.receiveShadow = true;
      scene.add(ground);

      const mats = C.makeMats();
      mats.hi = new T.MeshStandardMaterial({ color: C.col("--servo"), emissive: C.col("--mark"), emissiveIntensity: 0.85, roughness: 0.42 });
      const robots = { follower: C.makeRobot("follower", mats), leader: C.makeRobot("leader", mats) };
      scene.add(robots.follower.group, robots.leader.group);
      robots.leader.group.visible = false;
      let robot = robots.follower;

      /* overlays */
      const axisGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
      const axisLine = new T.Line(axisGeo, new T.LineBasicMaterial({ color: C.col("--mark"), depthTest: false, transparent: true }));
      axisLine.visible = false;
      axisLine.renderOrder = 5;
      scene.add(axisLine);
      const planeMat = new T.MeshBasicMaterial({ color: C.col("--mark"), transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false });
      const plane = new T.Mesh(new T.PlaneGeometry(0.68, 0.52), planeMat);
      plane.visible = false;
      scene.add(plane);

      labels.innerHTML = JOINTS.map((n, i) => '<span data-j="' + n + '">' + (i + 1) + "</span>").join("");
      const labelEls = Array.from(labels.children);
      labels.hidden = false;
      let hovered = null;
      hoverCb = (n) => {
        if (hovered && robot.joints[hovered]) robot.links[robot.joints[hovered].parent].motors.forEach((m) => { m.material = mats.servo; });
        hovered = n;
        if (n && robot.joints[n]) robot.links[robot.joints[n].parent].motors.forEach((m) => { m.material = mats.hi; });
        labelEls.forEach((el) => el.classList.toggle("hi", el.dataset.j === n));
        stage.invalidate();
      };

      /* workspace + top-down ring */
      let work = null, pick = null;
      const buildWorkspace = () => {
        const chain = C.makeChain("follower", "gripper_frame_link"), m = new T.Matrix4(), pts = [];
        const rnd = (a, b) => rad(a + Math.random() * (b - a));
        for (let i = 0; i < 9000; i++) {
          C.fk(chain, { shoulder_pan: rnd(-110, 110), shoulder_lift: rnd(-100, 100), elbow_flex: rnd(-96, 96), wrist_flex: rnd(-95, 95) }, m);
          if (m.elements[14] > -0.002) pts.push(m.elements[12], m.elements[13], m.elements[14]);
        }
        const g = new T.BufferGeometry();
        g.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
        const cloud = new T.Points(g, new T.PointsMaterial({ color: C.col("--mat"), size: 0.005, transparent: true, opacity: 0.45, depthWrite: false }));
        pick = C.pickRange();
        const ringG = new T.RingGeometry(pick.rmin, pick.rmax, 96, 1, rad(-110), rad(220));
        const ring = new T.Mesh(ringG, new T.MeshBasicMaterial({ color: C.col("--mark"), transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
        ring.position.set(pick.panX, 0, pick.table + 0.0012);
        work = new T.Group();
        work.add(cloud, ring);
        scene.add(work);
      };

      const VIEWS = {
        whole: { p: [0.72, -0.72, 0.46], t: [0.16, 0, 0.14] },
        side: { p: [0.2, -1.05, 0.2], t: [0.2, 0, 0.16] },
      };
      const seg = (id, cb) => {
        const box = $(id);
        box.addEventListener("click", (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          cb(b.dataset.v);
        });
      };
      const setView = (v) => {
        robot.group.updateMatrixWorld(true);
        if (VIEWS[v]) {
          camera.position.fromArray(VIEWS[v].p);
          controls.target.fromArray(VIEWS[v].t);
        } else {
          const g = robot.links.gripper_link.group.getWorldPosition(new T.Vector3());
          camera.position.set(g.x + 0.1, g.y - 0.2, g.z + 0.09);
          controls.target.copy(g);
        }
        controls.update();
        stage.invalidate();
      };
      seg("arm-view", setView);
      seg("arm-model", (v) => {
        if (hovered && robot.joints[hovered]) robot.links[robot.joints[hovered].parent].motors.forEach((m) => { m.material = mats.servo; });
        hovered = null;
        robot.group.visible = false;
        robot = robots[v];
        robot.group.visible = true;
        const box = $("arm-work");
        box.disabled = v !== "follower";
        if (work) work.visible = v === "follower" && box.checked;
        stage.invalidate();
      });
      $("arm-nums").addEventListener("change", (e) => { labels.hidden = !e.target.checked; stage.invalidate(); });
      $("arm-plane").addEventListener("change", (e) => { plane.visible = e.target.checked; stage.invalidate(); });
      $("arm-work").addEventListener("change", (e) => {
        if (e.target.checked && !work) buildWorkspace();
        if (work) work.visible = e.target.checked;
        stage.invalidate();
      });

      const vA = new T.Vector3(), vB = new T.Vector3(), vC = new T.Vector3(), G = new T.Vector3(0, 0, -9.81);
      const basis = new T.Matrix4();
      function gravity(j) {
        const o = vA.setFromMatrixPosition(j.spin.matrixWorld).clone();
        const a = j.axis.clone().transformDirection(j.spin.matrixWorld);
        const sum = new T.Vector3();
        const add = (world, m) => { vB.copy(world).sub(o); vC.copy(G).multiplyScalar(m); sum.add(vB.cross(vC)); };
        j.subtree.forEach((ln) => {
          const l = robot.links[ln];
          if (l.m > 0) add(l.com.clone().applyMatrix4(l.group.matrixWorld), l.m);
        });
        if (payload > 0) add(new T.Vector3().setFromMatrixPosition(robot.links[robot.tip].group.matrixWorld), payload);
        return Math.abs(a.dot(sum));
      }
      function draw() {
        robot.apply();
        if (plane.visible) {
          const lift = robot.joints.shoulder_lift;
          const n = lift.axis.clone().transformDirection(lift.spin.matrixWorld);
          const up = new T.Vector3(0, 0, 1), f = new T.Vector3().crossVectors(n, up).normalize();
          if (f.x * Math.cos(rad(pose.shoulder_pan)) + f.y * Math.sin(rad(pose.shoulder_pan)) < 0) f.negate();
          const u = new T.Vector3().crossVectors(n, f).normalize();
          if (u.z < 0) { u.negate(); }
          const nn = new T.Vector3().crossVectors(f, u);
          basis.makeBasis(f, u, nn);
          plane.quaternion.setFromRotationMatrix(basis);
          const o = new T.Vector3().setFromMatrixPosition(lift.spin.matrixWorld);
          plane.position.copy(o).addScaledVector(f, 0.28).addScaledVector(u, 0.2);
          plane.position.z = 0.26;
        }
        if (hovered && robot.joints[hovered]) {
          const j = robot.joints[hovered];
          const o = new T.Vector3().setFromMatrixPosition(j.spin.matrixWorld);
          const a = j.axis.clone().transformDirection(j.spin.matrixWorld);
          axisGeo.setFromPoints([o.clone().addScaledVector(a, -0.09), o.clone().addScaledVector(a, 0.09)]);
          axisLine.visible = true;
        } else axisLine.visible = false;
        stage.renderer.render(scene, camera);

        if (!labels.hidden) labelEls.forEach((el) => {
          const j = robot.joints[el.dataset.j];
          const p = new T.Vector3().setFromMatrixPosition(j.spin.matrixWorld).project(camera);
          el.style.transform = "translate(" + ((p.x * 0.5 + 0.5) * W).toFixed(1) + "px," + ((-p.y * 0.5 + 0.5) * H).toFixed(1) + "px)";
        });

        const tip = new T.Vector3().setFromMatrixPosition(robot.links[robot.tip].group.matrixWorld);
        const tipR = Math.hypot(tip.x - 0.0388, tip.y);
        const raw = (n) => {
          const c = CAL[robot.name][n];
          if (n === "gripper") return Math.round(c[0] + (pose.gripper / 100) * (c[1] - c[0]));
          return Math.round((c[0] + c[1]) / 2 + (pose[n] * 4095) / 360);
        };
        let html = "<span>tool <b>x " + Math.round(tip.x * 1000) + " y " + Math.round(tip.y * 1000) + " z " + Math.round(tip.z * 1000) + " mm</b></span><span>from pan axis <b>" + Math.round(tipR * 1000) + " mm</b></span><span>raw <b>" + JOINTS.map(raw).join(" · ") + "</b></span>";
        if (work && work.visible && pick) html += "<span>top-down picks <b>" + Math.round(pick.rmin * 1000) + "–" + Math.round(pick.rmax * 1000) + " mm from pan axis</b>, ignoring self-collision</span>";
        $("arm-readout").innerHTML = html;

        const names = JOINTS.slice(0, 5), taus = names.map((n) => gravity(robot.joints[n]));
        const isFollower = robot.name === "follower";
        $("arm-bars").innerHTML = names.map((n, i) => {
          const t = taus[i];
          return '<div class="load-row"><span>' + (i + 1) + " " + n + '</span><div class="load-track"><div class="load-fill" style="width:' + clamp((100 * t) / STALL, 0, 100) + "%" + (t > 0.5 * STALL ? ";background:var(--signal)" : "") + '"></div></div><span class="v">' + t.toFixed(2) + " N·m" + (isFollower ? " · " + Math.round((100 * t) / STALL) + "%" : "") + "</span></div>";
        }).join("");
        const sum = taus.reduce((a, b) => a + b, 0), amps = (sum / STALL) * STALL_A;
        $("arm-total").innerHTML = isFollower
          ? "Static current estimate <b>" + amps.toFixed(1) + " A</b> of your " + BRICK_A.toFixed(0) + " A brick" + (amps > BRICK_A ? ' <b style="color:var(--signal)">over</b>' : "")
          : "No sourced stall figures for the leader's motors on 5 V, so torque only.";
      }
      poseCbs.push(() => stage.invalidate());
      onTheme(() => {
        paintMat();
        groundMat.needsUpdate = true;
        axisLine.material.color = C.col("--mark");
        planeMat.color = C.col("--mark");
        mats.hi.emissive = C.col("--mark");
        stage.invalidate();
      });
      stage.invalidate();
      return stage;
    }
  })();

  /* ---------- teleop loop ---------- */
  (function () {
    const cv = $("tl-cv");
    if (!cv) return;
    const G = 9.81, M = 0.317, LC = 0.13, LP = 0.29, OMEGA0 = rad(270), STALL = 2.94, STALL_A = 2.7, LIM = rad(97), DT = 0.001;
    const S = { th: rad(20), om: 0, goal: rad(20), lead: rad(20), t: 0, next: 0, tau: 0, sat: false, dragHold: rad(20) };
    const buf = [];
    let P = 16, D = 32, pay = 0, hz = 60, mrt = 0, mode = reduceMotion ? "drag" : "slow";
    let onscreen = false, raf = 0, lastT = 0, sampleT = 0, geom = null, dragging = false, lagMs = null, frame = 0;
    $("tl-mode").value = mode;
    const bind = (id, cb, vId, f) => {
      const el = $(id);
      el.addEventListener("input", () => { cb(el.value); if (vId) $(vId).textContent = f ? f(el.value) : el.value; });
    };
    bind("tl-p", (v) => { P = +v; }, "tl-p-v");
    bind("tl-d", (v) => { D = +v; }, "tl-d-v");
    bind("tl-load", (v) => { pay = v / 1000; }, "tl-load-v", (v) => v + " g");
    bind("tl-hz", (v) => { hz = +v; });
    bind("tl-mrt", (v) => { mrt = rad(+v); });
    bind("tl-mode", (v) => { mode = v; S.dragHold = S.lead; });
    $("tl-jerk").addEventListener("click", () => {
      mode = "drag";
      $("tl-mode").value = "drag";
      S.lead = S.dragHold = rad(60);
      S.th = rad(-30);
      S.om = 0;
      S.goal = S.th;
      S.next = S.t;
      buf.length = 0;
    });
    const leaderAt = (t) => {
      if (mode === "slow") return rad(20 + 45 * Math.sin(2 * Math.PI * 0.25 * t));
      if (mode === "fast") return rad(20 + 45 * Math.sin(2 * Math.PI * 1.2 * t));
      return S.dragHold;
    };
    function step() {
      S.t += DT;
      S.lead = leaderAt(S.t);
      if (S.t >= S.next) {
        S.next += 1 / hz;
        if (S.next < S.t) S.next = S.t + 1 / hz;
        S.goal = mrt > 0 ? clamp(S.lead, S.th - mrt, S.th + mrt) : S.lead;
      }
      const kp = 0.6 * P, kd = 0.01 * D;
      const cmd = kp * (S.goal - S.th) - kd * S.om;
      const lim = Math.sign(cmd) === Math.sign(S.om) ? STALL * Math.max(0.05, 1 - Math.abs(S.om) / OMEGA0) : STALL;
      S.sat = Math.abs(cmd) >= lim;
      S.tau = clamp(cmd, -lim, lim);
      const tg = (M * G * LC + pay * G * LP) * Math.cos(S.th);
      const J = 0.01 + pay * LP * LP;
      let net = S.tau - tg - 0.02 * S.om;
      const stiction = 0.03;
      if (Math.abs(S.om) < 0.002 && Math.abs(net) < stiction) { S.om = 0; return; }
      net -= stiction * Math.sign(S.om || net);
      S.om += (net / J) * DT;
      S.th += S.om * DT;
      if (Math.abs(S.th) > LIM) { S.th = Math.sign(S.th) * LIM; S.om = 0; }
    }
    function computeLag() {
      const n = buf.length;
      if (n < 350 || mode === "drag") { lagMs = null; return; }
      let best = 0, bestE = Infinity;
      for (let L = 0; L <= 40; L++) {
        let e = 0;
        for (let i = n - 300; i < n; i += 2) { const d = buf[i - L].a - buf[i].s; e += d * d; }
        if (e < bestE) { bestE = e; best = L; }
      }
      lagMs = best * 10;
    }
    function draw() {
      const { ctx, w, h } = fitCanvas(cv, 0.42, 360, 340);
      const ink = tok("--ink"), muted = tok("--muted"), rule = tok("--rule"), pla = tok("--pla"), servo = tok("--servo"), a = tok("--plot-a"), b = tok("--plot-b"), signal = tok("--signal");
      const mono = tok("--f-mono");
      ctx.clearRect(0, 0, w, h);
      const narrow = w < 560;
      const L = narrow ? { x: 0, y: 0, w, h: h * 0.46 } : { x: 0, y: 0, w: w * 0.38, h };
      const R = narrow ? { x: 0, y: h * 0.46, w, h: h * 0.54 } : { x: w * 0.38, y: 0, w: w * 0.62, h };
      /* schematic */
      const len = Math.min(L.w * 0.56, L.h * 0.42), cx = L.x + L.w * 0.3, cy = L.y + L.h * 0.56;
      geom = { cx, cy, L };
      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + len * 1.12, cy); ctx.stroke();
      ctx.setLineDash([]);
      const end = (t, l) => [cx + Math.cos(t) * l, cy - Math.sin(t) * l];
      const ghost = end(S.lead, len);
      ctx.strokeStyle = a;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ghost[0], ghost[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(ghost[0], ghost[1], 8, 0, Math.PI * 2); ctx.fill();
      const tip = end(S.th, len);
      ctx.lineCap = "round";
      ctx.strokeStyle = ink;
      ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.strokeStyle = pla;
      ctx.lineWidth = 13;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.lineCap = "butt";
      ctx.fillStyle = servo;
      ctx.beginPath(); ctx.roundRect(cx - 20, cy - 20, 40, 40, 6); ctx.fill();
      ctx.fillStyle = pla;
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b;
      ctx.beginPath(); ctx.arc(tip[0], tip[1], 6, 0, Math.PI * 2); ctx.fill();
      if (pay > 0) {
        ctx.fillStyle = ink;
        ctx.font = "11px " + mono;
        ctx.textAlign = "center";
        ctx.fillText(Math.round(pay * 1000) + " g", tip[0], tip[1] - 12);
      }
      ctx.font = "12px " + mono;
      ctx.textAlign = "left";
      ctx.fillStyle = muted;
      ctx.fillText(mode === "drag" ? "drag the dot: that's your leader" : "click to take over the leader", L.x + 12, L.y + 18);
      /* traces */
      const pad = { l: 36, r: 72, t: 16, b: 6 };
      const gapH = Math.max(46, R.h * 0.22);
      const mainB = R.y + R.h - gapH - 22;
      const px = (i, n, x0, x1) => x1 - ((n - 1 - i) / 600) * (x1 - x0);
      const x0 = R.x + pad.l, x1 = R.x + R.w - pad.r;
      const yMain = (d) => R.y + pad.t + ((100 - d) / 160) * (mainB - R.y - pad.t);
      ctx.font = "11px " + mono;
      ctx.textAlign = "right";
      ctx.lineWidth = 1;
      [-60, 0, 50, 100].forEach((d) => {
        ctx.strokeStyle = rule;
        ctx.beginPath(); ctx.moveTo(x0, yMain(d)); ctx.lineTo(x1, yMain(d)); ctx.stroke();
        ctx.fillStyle = muted;
        ctx.fillText(d + "°", x0 - 5, yMain(d) + 4);
      });
      const n = buf.length;
      const line = (key, col, yf) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = Math.max(0, n - 600); i < n; i++) {
          const x = px(i, n, x0, x1), y = yf(buf[i][key]);
          if (i === Math.max(0, n - 600)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      if (n > 1) {
        line("a", a, yMain);
        line("s", b, yMain);
        ctx.fillStyle = ink;
        ctx.textAlign = "left";
        const ya = yMain(buf[n - 1].a), ys = yMain(buf[n - 1].s);
        const apart = Math.abs(ya - ys) >= 13;
        const up = ya <= ys;
        ctx.fillText("action", x1 + 6, (apart ? ya : ya + (up ? -7 : 7)) + 4);
        ctx.fillText("state", x1 + 6, (apart ? ys : ys + (up ? 7 : -7)) + 4);
      }
      const gapT = mainB + 22, gapB = R.y + R.h - pad.b - 12;
      const yGap = (d) => (gapT + gapB) / 2 - clamp(d / 30, -1, 1) * ((gapB - gapT) / 2);
      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, yGap(0)); ctx.lineTo(x1, yGap(0)); ctx.stroke();
      ctx.fillStyle = muted;
      ctx.textAlign = "right";
      ctx.fillText("+30°", x0 - 5, gapT + 8);
      ctx.fillText("−30°", x0 - 5, gapB + 2);
      ctx.textAlign = "left";
      ctx.fillStyle = ink;
      ctx.fillText("action − state, clipped at ±30°", x0, gapT - 6);
      if (n > 1) {
        ctx.strokeStyle = muted;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = Math.max(0, n - 600); i < n; i++) {
          const x = px(i, n, x0, x1), y = yGap(buf[i].a - buf[i].s);
          if (i === Math.max(0, n - 600)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = muted;
      ctx.textAlign = "right";
      ctx.fillText("6 s, newest at right", x1, h - 3);
      /* readout */
      const gap = deg(S.lead - S.th);
      let peak = 0;
      for (let i = Math.max(0, n - 600); i < n; i++) peak = Math.max(peak, Math.abs(buf[i].t));
      const satRecent = buf.slice(-300).some((x) => x.sat);
      $("tl-readout").innerHTML = "<span>gap <b>" + gap.toFixed(1) + "°</b></span><span>lag <b>" + (lagMs === null ? "–" : "≈ " + lagMs + " ms") + "</b></span><span>peak torque <b>" + peak.toFixed(2) + " N·m</b></span><span>peak current <b>≈ " + ((peak / STALL) * STALL_A).toFixed(1) + " A</b></span>" + (satRecent ? '<span><b style="color:' + signal + '">torque saturated</b></span>' : "");
    }
    function loop(now) {
      raf = 0;
      if (!onscreen) return;
      const steps = Math.min(40, Math.round((now - lastT) / 1));
      lastT = now;
      for (let i = 0; i < steps; i++) {
        step();
        sampleT += DT;
        if (sampleT >= 0.01) {
          sampleT -= 0.01;
          buf.push({ a: deg(S.lead), s: deg(S.th), t: S.tau, sat: S.sat });
          if (buf.length > 700) buf.shift();
        }
      }
      frame++;
      if (frame % 20 === 0) computeLag();
      draw();
      raf = requestAnimationFrame(loop);
    }
    trackVisible(cv, (v) => {
      onscreen = v;
      if (v && !raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
    });
    const lead = (e) => {
      const b = cv.getBoundingClientRect();
      const x = e.clientX - b.left - geom.cx, y = geom.cy - (e.clientY - b.top);
      S.dragHold = clamp(Math.atan2(y, x), -LIM, LIM);
    };
    cv.addEventListener("pointerdown", (e) => {
      const b = cv.getBoundingClientRect(), X = e.clientX - b.left, Y = e.clientY - b.top, L = geom.L;
      if (X < L.x || X > L.x + L.w || Y < L.y || Y > L.y + L.h) return;
      dragging = true;
      mode = "drag";
      $("tl-mode").value = "drag";
      lead(e);
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => { if (dragging) lead(e); });
    const up = () => { dragging = false; };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    fitCanvas(cv, 0.42, 360, 340);
    window.addEventListener("resize", () => { if (!onscreen) fitCanvas(cv, 0.42, 360, 340); });
  })();

  /* ---------- camera views ---------- */
  (function () {
    const holder = $("cam-stage");
    if (!holder) return;
    let invalidate = () => {};
    buildSliders($("cam-sliders"));
    buildPoseButtons($("cam-poses"));
    const cfg = { d: 50, h: 30, lat: 0, fov: 90, leader: 45, bx: 24, by: 0 };
    const units = { d: " cm", h: " cm", lat: " cm", fov: "°", leader: " cm", bx: " cm" };
    Object.keys(units).forEach((k) => {
      const el = $("cam-" + k), v = $("cam-" + k + "-v");
      const show = () => { v.textContent = el.value + units[k]; };
      el.addEventListener("input", () => { cfg[k] = +el.value; if (k === "bx") cfg.by = 0; show(); invalidate(); });
      show();
    });
    $("cam-grid").addEventListener("change", () => invalidate());
    whenVisible(holder, () => {
      loadDeps().then(init).catch((err) => failStage(holder, err));
    });
    function init() {
      const C = core(), T = window.THREE;
      const cv = $("cam-cv"), ov = $("cam-ov");
      const TABLE = -0.0024, PAN_X = 0.0388;
      let W = 0, H = 0, rects = null;
      const scene = new T.Scene();
      C.addLights(scene);
      const overview = new T.PerspectiveCamera(32, 1.2, 0.01, 12);
      overview.up.set(0, 0, 1);
      overview.position.set(0.95, -1.05, 0.72);
      overview.layers.enable(1);
      const wristCam = new T.PerspectiveCamera(92, 4 / 3, 0.015, 3);
      const sceneCam = new T.PerspectiveCamera(60, 16 / 9, 0.02, 4);
      sceneCam.up.set(0, 0, 1);
      let controls = null;
      C.wheelGuard(cv, () => controls);
      const resize = () => {
        W = holder.clientWidth;
        if (W >= 620) {
          H = Math.round(Math.min(W * 0.56, 560));
          const cw = (H - 8) / 1.3125;
          rects = {
            over: { x: 0, y: 0, w: Math.round(W - cw - 8), h: H },
            wrist: { x: Math.round(W - cw), y: 0, w: Math.round(cw), h: Math.round(cw * 0.75) },
            scene: { x: Math.round(W - cw), y: Math.round(cw * 0.75) + 8, w: Math.round(cw), h: Math.round((cw * 9) / 16) },
          };
        } else {
          const col = Math.floor((W - 8) / 2), overH = Math.round(W * 0.62);
          H = overH + 8 + Math.round(col * 0.75);
          rects = {
            over: { x: 0, y: 0, w: W, h: overH },
            wrist: { x: 0, y: overH + 8, w: col, h: Math.round(col * 0.75) },
            scene: { x: col + 8, y: overH + 8, w: col, h: Math.round((col * 9) / 16) },
          };
        }
        cv.style.height = H + "px";
        stage.renderer.setSize(W, H, false);
        overview.aspect = rects.over.w / rects.over.h;
        overview.updateProjectionMatrix();
        const dpr = window.devicePixelRatio || 1;
        ov.width = Math.round(W * dpr);
        ov.height = Math.round(H * dpr);
        ov.style.width = W + "px";
        ov.style.height = H + "px";
      };
      const stage = C.makeStage(cv, holder, draw, resize);
      invalidate = stage.invalidate;
      controls = new T.OrbitControls(overview, cv);
      controls.target.set(0.2, 0.08, 0.08);
      controls.update();
      controls.addEventListener("change", () => stage.invalidate());
      resize();

      const desk = new T.Mesh(new T.PlaneGeometry(2.4, 2.0), new T.MeshStandardMaterial({ color: C.col("--desk"), roughness: 0.95 }));
      desk.position.set(0.3, 0, TABLE - 0.0005);
      desk.receiveShadow = true;
      scene.add(desk);
      const PATCH_C = [PAN_X + 0.2, 0];
      const patch = new T.Mesh(new T.PlaneGeometry(0.4, 0.4), new T.MeshStandardMaterial({ color: C.col("--patch"), roughness: 0.9 }));
      patch.position.set(PATCH_C[0], PATCH_C[1], TABLE);
      patch.receiveShadow = true;
      scene.add(patch);
      const block = new T.Mesh(new T.BoxGeometry(0.025, 0.025, 0.025), new T.MeshStandardMaterial({ color: C.col("--signal"), roughness: 0.55 }));
      block.castShadow = true;
      scene.add(block);

      const mats = C.makeMats();
      const follower = C.makeRobot("follower", mats), leader = C.makeRobot("leader", mats);
      scene.add(follower.group, leader.group);
      const pick = C.pickRange();
      const camLink = follower.links.wrist_camera_link, camMeshes = camLink.meshes.concat(follower.links.wrist_camera_mount_link.meshes);
      const flip = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
      const roll = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2);
      wristCam.quaternion.copy(flip).multiply(roll);
      wristCam.position.set(0, 0, 0.0265);
      camLink.group.add(wristCam);

      /* scene camera marker, overview only */
      const body = new T.Mesh(new T.BoxGeometry(0.04, 0.028, 0.03), new T.MeshStandardMaterial({ color: C.col("--servo"), roughness: 0.5 }));
      body.layers.set(1);
      scene.add(body);
      const frustumGeo = new T.BufferGeometry();
      const frustum = new T.LineSegments(frustumGeo, new T.LineBasicMaterial({ color: C.col("--mark") }));
      frustum.layers.set(1);
      scene.add(frustum);
      const LOOK = new T.Vector3(PAN_X + 0.15, 0, 0.02);

      const inView = (p, cam) => {
        const c = p.clone().applyMatrix4(cam.matrixWorldInverse);
        if (c.z > -cam.near) return null;
        const n = p.clone().project(cam);
        return n;
      };
      const inFrame = (p, cam) => { const n = inView(p, cam); return !!n && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1; };
      function blockBox(cam, pw, ph) {
        const c = block.position, s = 0.0125;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const dx of [-s, s]) for (const dy of [-s, s]) for (const dz of [-s, s]) {
          const n = inView(new T.Vector3(c.x + dx, c.y + dy, c.z + dz), cam);
          if (!n) return null;
          const px = ((n.x + 1) / 2) * pw, py = ((1 - n.y) / 2) * ph;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
        if (x1 < 0 || y1 < 0 || x0 > pw || y0 > ph) return null;
        return { x0: Math.max(0, x0), x1: Math.min(pw, x1), y0: Math.max(0, y0), y1: Math.min(ph, y1), w: x1 - x0, h: y1 - y0 };
      }
      const tokensIn = (b, cols, rows) => {
        if (!b) return { n: 0, c0: 0, c1: -1, r0: 0, r1: -1 };
        const c0 = Math.floor(b.x0 / 32), c1 = Math.min(cols - 1, Math.floor((b.x1 - 0.001) / 32));
        const r0 = Math.floor(b.y0 / 32), r1 = Math.min(rows - 1, Math.floor((b.y1 - 0.001) / 32));
        return { n: (c1 - c0 + 1) * (r1 - r0 + 1), c0, c1, r0, r1 };
      };
      function renderView(cam, r) {
        const y = H - r.y - r.h;
        stage.renderer.setViewport(r.x, y, r.w, r.h);
        stage.renderer.setScissor(r.x, y, r.w, r.h);
        stage.renderer.render(scene, cam);
      }
      function overlayView(ctx, r, label, info, grid, nw, nh, tk) {
        const showGrid = $("cam-grid").checked;
        const ink = tok("--ink"), mark = tok("--mark");
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        if (grid && showGrid) {
          const sx = r.w / nw, sy = r.h / nh;
          ctx.strokeStyle = "rgba(255,255,255,.35)";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          for (let c = 0; c <= grid[0]; c++) { ctx.moveTo(r.x + c * 32 * sx, r.y); ctx.lineTo(r.x + c * 32 * sx, r.y + r.h); }
          for (let w = 0; w <= grid[1]; w++) { ctx.moveTo(r.x, r.y + w * 32 * sy); ctx.lineTo(r.x + r.w, r.y + w * 32 * sy); }
          ctx.stroke();
          if (tk.n) {
            ctx.strokeStyle = mark;
            ctx.lineWidth = 2;
            ctx.fillStyle = mark;
            ctx.globalAlpha = 0.28;
            ctx.fillRect(r.x + tk.c0 * 32 * sx, r.y + tk.r0 * 32 * sy, (tk.c1 - tk.c0 + 1) * 32 * sx, (tk.r1 - tk.r0 + 1) * 32 * sy);
            ctx.globalAlpha = 1;
            ctx.strokeRect(r.x + tk.c0 * 32 * sx, r.y + tk.r0 * 32 * sy, (tk.c1 - tk.c0 + 1) * 32 * sx, (tk.r1 - tk.r0 + 1) * 32 * sy);
          }
        }
        ctx.restore();
        ctx.font = "11px " + tok("--f-mono");
        const text = label + (info ? " · " + info : "");
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = tok("--surface");
        ctx.fillRect(r.x + 6, r.y + 6, tw + 10, 18);
        ctx.fillStyle = ink;
        ctx.textAlign = "left";
        ctx.fillText(text, r.x + 11, r.y + 19);
      }
      function draw() {
        if (!rects) return;
        follower.apply();
        leader.group.position.set(0, cfg.leader / 100, 0);
        leader.apply();
        if (cfg.by === 0) block.position.set(PAN_X + cfg.bx / 100, 0, TABLE + 0.0125);
        else block.position.set(cfg.bxW, cfg.by, TABLE + 0.0125);
        sceneCam.position.set(PAN_X + cfg.d / 100, cfg.lat / 100, TABLE + cfg.h / 100);
        sceneCam.lookAt(LOOK);
        sceneCam.fov = deg(2 * Math.atan(Math.tan(rad(cfg.fov / 2)) * (9 / 16)));
        sceneCam.updateProjectionMatrix();
        sceneCam.updateMatrixWorld();
        body.position.copy(sceneCam.position);
        body.quaternion.copy(sceneCam.quaternion);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map((c) => {
          const v = new T.Vector3(c[0], c[1], 0.5).unproject(sceneCam).sub(sceneCam.position).normalize();
          const t = v.z < -0.001 ? clamp((TABLE - sceneCam.position.z) / v.z, 0.05, 1.3) : 1.3;
          return sceneCam.position.clone().addScaledVector(v, t);
        });
        const pts = [];
        corners.forEach((c, i) => { pts.push(sceneCam.position, c, c, corners[(i + 1) % 4]); });
        frustumGeo.setFromPoints(pts);

        const r3 = stage.renderer;
        r3.setScissorTest(true);
        r3.shadowMap.autoUpdate = false;
        r3.shadowMap.needsUpdate = true;
        renderView(overview, rects.over);
        renderView(sceneCam, rects.scene);
        camMeshes.forEach((m) => { m.visible = false; });
        renderView(wristCam, rects.wrist);
        camMeshes.forEach((m) => { m.visible = true; });
        r3.setScissorTest(false);

        const bw = blockBox(wristCam, 640, 480), bs = blockBox(sceneCam, 640, 360);
        const tw = tokensIn(bw, 20, 15), ts = tokensIn(bs, 20, 12);
        const dpr = window.devicePixelRatio || 1, ctx = ov.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        overlayView(ctx, rects.over, "bench", "drag to orbit");
        overlayView(ctx, rects.wrist, "wrist 640×480", "", [20, 15], 640, 480, tw);
        overlayView(ctx, rects.scene, "scene 640×360", "", [20, 12], 640, 360, ts);

        const leaderPts = Object.values(leader.links).map((l) => new T.Vector3().setFromMatrixPosition(l.group.matrixWorld));
        const leaderIn = leaderPts.filter((p) => inFrame(p, sceneCam)).length;
        const patchIn = [[-1, -1], [1, -1], [1, 1], [-1, 1]].filter((c) => inFrame(new T.Vector3(PATCH_C[0] + c[0] * 0.2, PATCH_C[1] + c[1] * 0.2, TABLE), sceneCam)).length;
        let reachIn = 0, reachN = 0;
        for (let a = -110; a <= 110; a += 10) {
          reachN++;
          if (inFrame(new T.Vector3(pick.panX + pick.rmax * Math.cos(rad(a)), pick.rmax * Math.sin(rad(a)), TABLE), sceneCam)) reachIn++;
        }
        const baseIn = inFrame(new T.Vector3(0.02, 0, 0.02), sceneCam);
        const fmtB = (b, t, tot) => (b ? Math.round(b.w) + "×" + Math.round(b.h) + " px · " + t.n + " of " + tot + " tokens" : "out of frame");
        const warn = (s) => '<b style="color:var(--signal)">' + s + "</b>";
        $("cam-readout").innerHTML =
          "<span>wrist block <b>" + fmtB(bw, tw, 300) + "</b></span><span>scene block <b>" + fmtB(bs, ts, 240) + "</b></span>" +
          "<span>leader " + (leaderIn ? warn("in frame, " + leaderIn + " of " + leaderPts.length + " links") : "<b>out of frame</b>") + "</span>" +
          "<span>patch corners <b>" + patchIn + " of 4</b></span><span>outer pick reach <b>" + reachIn + " of " + reachN + " points</b></span><span>base " + (baseIn ? "<b>in frame</b>" : warn("out of frame")) + "</span>";
      }
      $("cam-under").addEventListener("click", () => {
        follower.apply();
        const tip = new T.Vector3().setFromMatrixPosition(follower.links.gripper_frame_link.group.matrixWorld);
        cfg.by = Math.abs(tip.y) < 1e-4 ? 1e-4 : tip.y;
        cfg.bxW = tip.x;
        $("cam-bx").value = clamp(Math.round((tip.x - PAN_X) * 100), 10, 40);
        $("cam-bx-v").textContent = Math.round((tip.x - PAN_X) * 100) + " cm";
        stage.invalidate();
      });
      poseCbs.push(() => stage.invalidate());
      onTheme(() => stage.invalidate());
      stage.invalidate();
    }
  })();

  /* ---------- ACT explorer ---------- */
  (function () {
    const svg = $("act-svg");
    if (!svg) return;
    const PAR = { vae: 17332736, enc: 17332736, res: 11166912, dec: 5385856, proj: 262656, muP: 32832, stV: 3584, actV: 3584, cls: 512, zP: 16896, stP: 3584, head: 3078, pos1d: 1024 };
    const TOTAL0 = 51597190 - 51200;
    const st = { chunk: 100, steps: 100, cams: "both", mode: "train", sel: "enc" };
    const camsOn = () => ({ wrist: st.cams !== "front", front: st.cams !== "wrist" });
    const tokens = () => { const c = camsOn(); return { w: c.wrist ? 300 : 0, f: c.front ? 240 : 0, T: 2 + (c.wrist ? 300 : 0) + (c.front ? 240 : 0) }; };
    const B = () => {
      const C = st.chunk, t = tokens(), c = camsOn();
      return {
        act: { x: 16, y: 34, w: 136, h: 52, t: "action chunk", s: "(B, " + C + ", 6)", train: true, name: "Leader positions for the next C frames", code: "batch[\"action\"]", note: "From your demos. It only exists during training, which is why the encoder above it can't run on the robot." },
        stv: { x: 16, y: 94, w: 136, h: 52, t: "joint state", s: "(B, 6)", train: true, name: "Follower positions at this frame", code: "batch[\"observation.state\"]", note: "Projected to 512 and fed to the VAE encoder as one token." },
        vae: { x: 192, y: 54, w: 160, h: 72, t: "VAE encoder", s: "(" + (C + 2) + ", B, 512)", s2: "4 layers", train: true, name: "Transformer VAE encoder", code: "vae_encoder", params: PAR.vae + PAR.stV + PAR.actV + PAR.cls, note: "Tokens: one CLS, one state, and " + C + " actions. The CLS token's output summarises how this particular demo did the task. It's the biggest module in the model, and it never runs on the robot." },
        mu: { x: 392, y: 54, w: 120, h: 72, t: "μ, log σ²", s: "(B, 32) each", train: true, name: "Latent distribution", code: "vae_encoder_latent_output_proj", params: PAR.muP, note: "A Linear from 512 to 64, split in half. Note that LeRobot's variable is called log_sigma_x2." },
        z: { x: 552, y: 62, w: 104, h: 58, t: "z", s: st.mode === "train" ? "sampled" : "all zeros", s2: "(B, 32)", name: "Style variable", code: "latent_sample", note: st.mode === "train" ? "Sampled with the reparameterisation trick so the KL term can pull it towards a unit Gaussian." : "No actions at test time, so no encoder. z is the mean of the prior, all zeros. The policy behaves the same way every time for the same observation." },
        zp: { x: 552, y: 150, w: 104, h: 44, t: "Linear", s: "32 → 512", name: "Latent projection", code: "encoder_latent_input_proj", params: PAR.zP, note: "Makes z one token in the main encoder." },
        wrist: { x: 16, y: 186, w: 136, h: 52, t: "wrist cam", s: "(B, 3, 480, 640)", off: !c.wrist, name: "Wrist camera frame", code: "observation.images.wrist", note: "Your ET-S231 at 640×480." },
        front: { x: 16, y: 246, w: 136, h: 52, t: "front cam", s: "(B, 3, 360, 640)", off: !c.front, name: "Scene camera frame", code: "observation.images.front", note: "Your Insta360 at 640×360." },
        res: { x: 192, y: 196, w: 160, h: 92, t: "ResNet18, shared", s: c.wrist ? "(B, 512, 15, 20)" : "", s2: c.front ? "(B, 512, 12, 20)" : "", name: "Vision backbone", code: "backbone", params: PAR.res, note: "ImageNet weights, stride 32. One backbone is called once per camera, so adding a camera adds tokens and no parameters. 360/32 is 11.25, which rounds up to 12 rows." },
        proj: { x: 392, y: 196, w: 120, h: 92, t: "1×1 conv", s: "+ 2D sine pos", s2: t.w + t.f + " tokens", name: "Image tokens", code: "encoder_img_feat_input_proj", params: PAR.proj, note: "Each cell of the feature map becomes one token with a position encoding. " + (t.w ? t.w + " from the wrist" : "") + (t.w && t.f ? " and " : "") + (t.f ? t.f + " from the front" : "") + "." },
        st: { x: 16, y: 318, w: 136, h: 52, t: "joint state", s: "(B, 6)", name: "Follower positions", code: "observation.state", note: "The robot's present position, which the VAE path sees separately. At inference this is your only proprioception." },
        stp: { x: 392, y: 318, w: 120, h: 52, t: "Linear", s: "6 → 512", name: "State projection", code: "encoder_robot_state_input_proj", params: PAR.stP, note: "One token." },
        enc: { x: 696, y: 150, w: 124, h: 112, t: "Encoder", s: "(" + t.T + ", B, 512)", s2: "4 layers", name: "Transformer encoder", code: "encoder", params: PAR.enc + PAR.pos1d, note: t.T + " tokens: 1 latent, 1 state" + (t.w ? ", " + t.w + " wrist" : "") + (t.f ? ", " + t.f + " front" : "") + ". Self-attention lets the two views and the state inform each other." },
        qry: { x: 696, y: 318, w: 124, h: 52, t: C + " queries", s: "(" + C + ", B, 512)", name: "Decoder queries", code: "decoder_pos_embed", params: C * 512, note: "Starts as zeros plus a learned embedding per chunk position. That embedding is the only part of the model whose size depends on chunk_size." },
        dec: { x: 856, y: 196, w: 110, h: 72, t: "Decoder", s: "(" + C + ", B, 512)", s2: "1 layer", name: "Transformer decoder", code: "decoder", params: PAR.dec, note: "Queries cross-attend to the encoder's output. It's 1 layer, because the original ACT's 7 only used the first (a bug noted in LeRobot's config, tonyzhaozh/act#25)." },
        head: { x: 856, y: 288, w: 110, h: 44, t: "Linear", s: "512 → 6", name: "Action head", code: "action_head", params: PAR.head, note: "One 6-vector per query." },
        out: { x: 856, y: 352, w: 110, h: 44, t: "actions", s: "(B, " + C + ", 6)", name: "Predicted chunk", code: "actions", note: "The whole chunk from one forward pass. Your n_action_steps setting decides how many of them get played before the next query." },
        loss: { x: 856, y: 54, w: 110, h: 72, t: "Loss", s: "L1 + 10 · KL", train: true, name: "Training loss", code: "kl_weight = 10.0", note: "L1 between the predicted and recorded chunks, plus KL pulling μ and σ towards a unit Gaussian." },
      };
    };
    const W = [["act", "vae"], ["stv", "vae"], ["vae", "mu"], ["mu", "z"], ["z", "zp"], ["zp", "enc"], ["wrist", "res"], ["front", "res"], ["res", "proj"], ["proj", "enc"], ["st", "stp"], ["stp", "enc"], ["enc", "dec"], ["qry", "dec"], ["dec", "head"], ["head", "out"], ["mu", "loss"], ["out", "loss"]];
    let blocks = B();
    const isOff = (b) => (b.train && st.mode !== "train") || b.off;
    function renderSvg() {
      blocks = B();
      const P = ['<defs><marker id="act-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" style="fill:var(--muted)"/></marker></defs>'];
      P.push('<rect x="6" y="12" width="660" height="124" rx="6" style="fill:none;stroke:var(--rule);stroke-dasharray:4 4"/><text x="16" y="26" font-size="11" class="sub">Training only, up to z</text>');
      W.forEach(([a, b]) => {
        const A = blocks[a], Z = blocks[b];
        const off = isOff(A) || isOff(Z);
        let d;
        const x1 = A.x + A.w, y1 = A.y + A.h / 2;
        if (a === "z") d = "M" + (A.x + A.w / 2) + " " + (A.y + A.h) + " V" + Z.y;
        else if (a === "zp") d = "M" + x1 + " " + y1 + " H" + Z.x;
        else if (a === "stp") d = "M" + x1 + " " + y1 + " H674 V" + (Z.y + Z.h - 8) + " H" + Z.x;
        else if (a === "proj") d = "M" + x1 + " " + y1 + " H" + Z.x;
        else if (a === "st") d = "M" + x1 + " " + y1 + " H" + Z.x;
        else if (a === "qry") d = "M" + x1 + " " + y1 + " H838 V" + (Z.y + Z.h - 16) + " H" + Z.x;
        else if (a === "enc") d = "M" + x1 + " " + (A.y + 66) + " H" + Z.x;
        else if (a === "dec" || a === "head") d = "M" + (A.x + A.w / 2) + " " + (A.y + A.h) + " V" + Z.y;
        else if (a === "out") d = "M" + x1 + " " + y1 + " H975 V" + (Z.y + Z.h / 2) + " H" + x1;
        else if (a === "mu" && b === "loss") d = "M" + (A.x + A.w / 2) + " " + A.y + " V8 H" + (Z.x + Z.w / 2) + " V" + Z.y;
        else d = "M" + x1 + " " + y1 + " C" + (x1 + 22) + " " + y1 + " " + (Z.x - 22) + " " + (Z.y + Z.h / 2) + " " + Z.x + " " + (Z.y + Z.h / 2);
        P.push('<path d="' + d + '" class="wire' + (off ? " off" : "") + '" marker-end="url(#act-arrow)"/>');
      });
      Object.keys(blocks).forEach((k) => {
        const b = blocks[k];
        const cx = b.x + b.w / 2;
        const lines = [b.s, b.s2].filter(Boolean);
        const y0 = b.y + b.h / 2 - (lines.length ? 6 * lines.length : -4);
        P.push('<g class="blk' + (isOff(b) ? " off" : "") + (k === st.sel ? " sel" : "") + '" data-b="' + k + '" tabindex="0" role="button" aria-label="' + b.name + '"><rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="5"/><text x="' + cx + '" y="' + y0 + '" text-anchor="middle" font-size="13" font-weight="500">' + b.t + "</text>" + lines.map((l, i) => '<text x="' + cx + '" y="' + (y0 + 15 + i * 14) + '" text-anchor="middle" font-size="11" class="sub">' + l + "</text>").join("") + "</g>");
      });
      svg.innerHTML = P.join("");
    }
    function renderDetail() {
      const b = blocks[st.sel];
      $("act-detail").innerHTML = '<span class="when"><code>' + b.code + "</code>" + (b.params ? " · " + num(b.params) + " parameters" : " · no parameters") + "</span><h4>" + b.name + "</h4><p>" + b.note + "</p>";
    }
    function renderStats() {
      const C = st.chunk, n = st.steps, t = tokens(), total = TOTAL0 + C * 512;
      const atInf = total - PAR.vae - PAR.muP - PAR.stV - PAR.actV - PAR.cls;
      const q10 = Math.ceil(300 / n);
      const measured = st.cams === "both" && C === 100;
      const every = n / 30;
      const late = measured && n === 1;
      const H = [
        "<span>horizon <b>" + (C / 30).toFixed(2) + " s</b></span>",
        "<span>open loop for <b>" + (every < 0.1 ? Math.round(every * 1000) + " ms" : every.toFixed(2) + " s") + "</b></span>",
        "<span>queries in a 10 s episode <b>" + q10 + "</b></span>",
        "<span>encoder tokens <b>" + t.T + "</b></span>",
        "<span>parameters <b>" + num(total) + "</b></span>",
        "<span>used on the robot <b>" + num(atInf) + "</b></span>",
      ];
      if (measured) {
        H.push("<span>inference on your Mac <b" + (late ? ' style="color:var(--signal)"' : "") + ">41 ms against a 33 ms frame" + (late ? ", misses 30 fps" : ", every " + every.toFixed(2) + " s") + "</b></span>");
        H.push("<span>training <b>0.92 s/step, 100k steps ≈ 26 h</b> before data loading</span>");
      } else H.push("<span>timings <b>measured only for both cameras and chunk 100</b></span>");
      $("act-stats").innerHTML = H.join("");
      const mods = [["vae_encoder", PAR.vae, true], ["encoder", PAR.enc, false], ["backbone", PAR.res, false], ["decoder", PAR.dec, false], ["img projection", PAR.proj, false], ["everything else", total - PAR.vae - PAR.enc - PAR.res - PAR.dec - PAR.proj, false]];
      $("act-bars").innerHTML = "<h4>Parameters by module</h4>" + mods.map((m) => {
        const dim = m[2] && st.mode !== "train";
        return '<div class="load-row"' + (dim ? ' style="opacity:.4"' : "") + "><span>" + m[0] + '</span><div class="load-track"><div class="load-fill" style="width:' + (100 * m[1]) / PAR.vae + '%"></div></div><span class="v">' + (m[1] / 1e6).toFixed(m[1] < 1e6 ? 2 : 1) + " M</span></div>";
      }).join("");
    }
    const refresh = () => { renderSvg(); renderDetail(); renderStats(); };
    svg.addEventListener("click", (e) => {
      const g = e.target.closest(".blk");
      if (!g) return;
      st.sel = g.dataset.b;
      svg.querySelectorAll(".blk").forEach((x) => x.classList.toggle("sel", x === g));
      renderDetail();
    });
    svg.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const g = e.target.closest(".blk");
      if (!g) return;
      e.preventDefault();
      st.sel = g.dataset.b;
      svg.querySelectorAll(".blk").forEach((x) => x.classList.toggle("sel", x === g));
      renderDetail();
    });
    $("act-mode").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      st.mode = b.dataset.v;
      $("act-mode").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (st.mode !== "train" && blocks[st.sel].train) st.sel = "z";
      refresh();
    });
    const chunkEl = $("act-chunk"), stepsEl = $("act-steps");
    const syncCtl = () => {
      stepsEl.max = st.chunk;
      if (st.steps > st.chunk) st.steps = st.chunk;
      stepsEl.value = st.steps;
      $("act-chunk-v").textContent = st.chunk;
      $("act-steps-v").textContent = st.steps;
    };
    chunkEl.addEventListener("input", () => { st.chunk = +chunkEl.value; syncCtl(); refresh(); });
    stepsEl.addEventListener("input", () => { st.steps = +stepsEl.value; syncCtl(); refresh(); });
    $("act-cams").addEventListener("change", (e) => { st.cams = e.target.value; refresh(); });
    syncCtl();
    refresh();
  })();
})();
