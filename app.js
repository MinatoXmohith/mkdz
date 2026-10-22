/* ==========================================================
   MKDZ studio — behaviour
   boot → desk (pan / zoom) → windows + lightbox
   ========================================================== */
(() => {
  "use strict";
  const D = window.MKDZ;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isSmall = () => innerWidth < 760;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, "0");
  const posterSrc = (n, s = "sm") => `assets/posters/${n}-${s}.jpg`;
  const brandSrc = (id, i, s = "sm") => `assets/brands/${id}/${pad2(i)}-${s}.jpg`;
  const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function html(str) {
    const t = document.createElement("template");
    t.innerHTML = str.trim();
    return t.content.firstElementChild;
  }

  function seeded(seed) {
    let s = seed % 2147483647 || 1;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  }

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => clamp(Math.round(c + amt * 255), 0, 255);
    return "#" + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  const NOTE_COLOURS = ["#ffd23f", "#ff9ec7", "#7fb2ff", "#b8e07a", "#ffb36b"];

  /* ---------------- Sound (tiny synth, no files) ---------------- */
  const sfx = {
    on: false,
    ctx: null,
    enable() {
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        this.on = true;
      } catch (e) { this.on = false; }
      $("#soundState").textContent = this.on ? "on" : "off";
    },
    disable() { this.on = false; $("#soundState").textContent = "off"; },
    tone(freq, dur, type = "sine", vol = 0.12, to) {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    pop() { this.tone(420, 0.12, "sine", 0.16, 900); },
    close() { this.tone(700, 0.1, "triangle", 0.1, 260); },
    tick() { this.tone(1800, 0.03, "square", 0.025); },
    shuffle() { [0, 60, 120, 180].forEach((d, i) => setTimeout(() => this.tone(300 + i * 140, 0.08, "triangle", 0.08), d)); },
  };

  /* ---------------- Toast & cursor tag ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
  }

  const tag = $("#cursorTag");
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    tag.style.left = e.clientX + "px";
    tag.style.top = e.clientY + "px";
  }, { passive: true });
  function showTag(text) {
    if (!text || pan.moved) return tag.classList.remove("on");
    tag.textContent = text;
    tag.classList.add("on");
  }

  /* ==========================================================
     DESK
     ========================================================== */
  const CW = 300, CH = 400, COLS = 12, ROWS = 6, PAD = 160;
  const W = COLS * CW + PAD * 2, H = ROWS * CH + PAD * 2;
  const HERO = { x: PAD + 6 * CW, y: PAD + 3 * CH };
  const desk = $("#desk");
  const viewport = $("#viewport");
  desk.style.width = W + "px";
  desk.style.height = H + "px";

  const deskPosters = D.posters.map((p, i) => ({ ...p, i })).filter((p) => p.t !== "September").slice(0, 48);
  const items = []; // { el, kind, x, y, data }

  function buildDesk() {
    // rulers & cutting-mat diagonals
    const top = html(`<div class="ruler" style="left:0;top:14px;width:${W}px"></div>`);
    const left = html(`<div class="ruler" style="left:14px;top:0;height:${H}px"></div>`);
    for (let x = 200, i = 1; x < W; x += 200, i++) top.append(html(`<span style="left:${x - 4}px">${i * 5}</span>`));
    for (let y = 200, i = 1; y < H; y += 200, i++) left.append(html(`<span style="top:${y - 7}px">${i * 5}</span>`));
    desk.append(top, left);
    const diagLen = Math.hypot(W, H);
    const ang = Math.atan2(H, W) * 180 / Math.PI;
    desk.append(html(`<div class="diag" style="left:0;top:0;width:${diagLen}px;transform:rotate(${ang}deg)"></div>`));
    desk.append(html(`<div class="diag" style="left:0;top:${H}px;width:${diagLen}px;transform:rotate(${-ang}deg)"></div>`));

    // hand-written labels
    const labels = [
      [HERO.x, PAD + 2 * CH + 30, -2, `↑ ${D.posters.reduce((a, p) => a + p.v.length, 0)} posters in 60 days. zero chill.`, "experimental outlet"],
      [HERO.x + 40, PAD + 4 * CH - 30, 2, "more posters, keep dragging ↓", ""],
      [PAD + 2 * CW, PAD + 2 * CH + 18, -3, "brands I've built ↓", "tap a folder"],
      [PAD + 10 * CW, PAD + 2 * CH + 18, 2.5, "what I do ↓", "tap a note"],
    ];
    labels.forEach(([x, y, r, t, s]) => desk.append(html(`<div class="label" style="left:${x}px;top:${y}px;--r:${r}deg">${t}${s ? `<small>${s}</small>` : ""}</div>`)));
    // star doodles
    [[PAD + 4 * CW - 20, PAD + 2 * CH + 70, 34], [PAD + 8 * CW + 20, PAD + 4 * CH - 60, 26], [PAD + 30, PAD + 4 * CH - 20, 22], [W - PAD - 20, PAD + 2 * CH + 40, 30]]
      .forEach(([x, y, s]) => desk.append(html(`<svg class="doodle" style="left:${x}px;top:${y}px;width:${s}px;height:${s}px" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0z"/></svg>`)));

    // posters
    deskPosters.forEach((p) => {
      const el = html(`<button class="item poster" aria-label="${esc(p.t)} poster"><img src="${posterSrc(p.v[0])}" alt="" decoding="async" draggable="false"><span class="cap">${esc(p.t)}${p.v.length > 1 ? ` <b>· ${p.v.length} colourways</b>` : ""}</span></button>`);
      const img = el.querySelector("img");
      const shape = () => {
        const r = img.naturalWidth / img.naturalHeight;
        if (r > 1.15) el.classList.add("wide");
        else if (r > 0.9) el.classList.add("square");
      };
      img.complete ? shape() : img.addEventListener("load", shape, { once: true });
      el.addEventListener("click", () => !pan.suppress && openPosterViewer(D.posters, p.i));
      el.addEventListener("pointerenter", () => { showTag("view ↗"); sfx.tick(); });
      el.addEventListener("pointerleave", () => showTag(""));
      desk.append(el);
      items.push({ el, kind: "poster", data: p });
    });

    // brand folders
    D.brands.forEach((b) => {
      const base = b.palette[0];
      const dark = luminance(base) < 0.2;
      const el = html(`
        <button class="item folder" aria-label="${esc(b.name)} branding case study" style="--fc:${shade(base, -0.1)};--fc2:${base}">
          <span class="back"></span>
          <span class="peek"><img src="${brandSrc(b.id, 1)}" alt="" draggable="false"></span>
          <span class="front" style="color:${dark ? "#f4eee2" : "#151413"}">
            <span><span class="fname">${esc(b.name)}</span><span class="fkind" style="display:block">${esc(b.kind)} · ${b.n} files</span></span>
            <span class="chips">${b.palette.map((c) => `<i style="background:${c}"></i>`).join("")}</span>
          </span>
        </button>`);
      el.addEventListener("click", () => !pan.suppress && openBrand(b.id));
      el.addEventListener("pointerenter", () => { showTag("open case"); sfx.tick(); });
      el.addEventListener("pointerleave", () => showTag(""));
      desk.append(el);
      items.push({ el, kind: "folder", data: b });
    });

    // service sticky notes
    let a = 0, bb = 0;
    D.services.forEach((s, i) => {
      const n = s.side === "A" ? ++a : ++bb;
      const el = html(`
        <button class="item sticky" style="--sc:${NOTE_COLOURS[i % NOTE_COLOURS.length]}" aria-label="${esc(s.t)}">
          ${s.star ? '<span class="star" aria-hidden="true">✦</span>' : ""}
          <span class="sn">SIDE ${s.side} · ${pad2(n)}</span>
          <span class="st">${esc(s.t)}</span>
          <span class="sd">${esc(s.d)}</span>
        </button>`);
      el.addEventListener("click", () => !pan.suppress && openServices(i));
      el.addEventListener("pointerenter", () => { showTag("read"); sfx.tick(); });
      el.addEventListener("pointerleave", () => showTag(""));
      desk.append(el);
      items.push({ el, kind: "sticky", data: s, i });
    });

    // hero sheet
    const hero = html(`
      <div class="item hero" style="--r:-1deg">
        <div class="stamp" aria-hidden="true">
          <svg viewBox="0 0 150 150"><circle class="disc" cx="75" cy="75" r="62"/><defs><path id="circ" d="M75,75 m-48,0 a48,48 0 1,1 96,0 a48,48 0 1,1 -96,0"/></defs>
            <text><textPath href="#circ">MKDZ STUDIO ✦ SINCE ${D.since} ✦ MADE LOUD ✦ </textPath></text></svg>
          <span class="core">✦</span>
        </div>
        <div class="hero-top"><span>/${esc(D.role)} — creating since ${D.since}</span><span class="avail"><span class="dot"></span>Open for projects</span></div>
        <h1 aria-label="Hey! I'm Mohith. I make brands loud.">
          <span class="ln" data-fit>Hey! I'm Mohith,</span>
          <span class="ln" data-fit>I make brands</span>
          <span class="ln"><span class="loud">loud.<svg class="scrib" viewBox="0 0 300 26" preserveAspectRatio="none"><path d="M4 16 C 60 4, 120 24, 180 12 S 270 6, 296 14"/></svg></span></span>
        </h1>
        <div class="hero-bottom">
          <p>Graphic designer &amp; brand strategist based in ${esc(D.location)}. <b>Designer, experimenter, occasional chaos agent.</b> I build bold, story-driven identities, packaging and poster series that look as good as the idea sounds.</p>
          <div class="hero-ctas">
            <button class="pill" data-go="work">See the work</button>
            <button class="pill solid" data-go="contact">Start a project →</button>
          </div>
        </div>
      </div>`);
    hero.querySelector("[data-go=work]").addEventListener("click", () => !pan.suppress && openWork());
    hero.querySelector("[data-go=contact]").addEventListener("click", () => !pan.suppress && openContact());
    desk.append(hero);
    items.push({ el: hero, kind: "hero" });
    setupHeroType(hero);
  }

  function layout(seed) {
    const rnd = seeded(seed);
    // posters: rows 0,1,4,5 × 12 cols, shuffled order
    const cells = [];
    [0, 1, 4, 5].forEach((r) => { for (let c = 0; c < COLS; c++) cells.push([c, r]); });
    const order = deskPosters.map((_, i) => i).sort(() => rnd() - 0.5);
    let pi = 0;
    items.forEach((it) => {
      let x, y, r;
      if (it.kind === "poster") {
        const [c, row] = cells[order.indexOf(pi++)];
        x = PAD + c * CW + CW / 2 + (rnd() - 0.5) * 60;
        y = PAD + row * CH + CH / 2 + (rnd() - 0.5) * 50;
        r = (rnd() - 0.5) * 14;
        it.el.style.setProperty("--tr", `${(rnd() - 0.5) * 16}deg`);
      } else if (it.kind === "folder") {
        const k = D.brands.indexOf(it.data);
        x = PAD + (k % 4) * CW + CW / 2 + (rnd() - 0.5) * 24;
        y = PAD + (2 + Math.floor(k / 4)) * CH + CH / 2 + 30 + (rnd() - 0.5) * 20;
        r = (rnd() - 0.5) * 10;
      } else if (it.kind === "sticky") {
        const k = it.i;
        x = PAD + 8 * CW + (k % 3) * 400 + 200 + (rnd() - 0.5) * 40;
        y = PAD + 2 * CH + 110 + Math.floor(k / 3) * 250 + (rnd() - 0.5) * 20;
        r = (rnd() - 0.5) * 12;
      } else {
        x = HERO.x; y = HERO.y; r = -1;
      }
      it.x = x; it.y = y;
      it.el.style.left = x + "px";
      it.el.style.top = y + "px";
      it.el.style.setProperty("--r", r.toFixed(2) + "deg");
    });
    drawMinimap();
  }

  /* hero: letters stretch toward the cursor */
  function setupHeroType(hero) {
    const h1 = hero.querySelector("h1");
    $$(".ln", h1).forEach((ln) => {
      const walk = (node) => {
        [...node.childNodes].forEach((n) => {
          if (n.nodeType === 3) {
            const frag = document.createDocumentFragment();
            [...n.textContent].forEach((ch) => {
              const s = document.createElement("span");
              s.className = "ch";
              s.textContent = ch;
              if (ch === " ") s.style.width = ".22em";
              frag.append(s);
            });
            n.replaceWith(frag);
          } else if (n.nodeType === 1 && n.tagName !== "svg") walk(n);
        });
      };
      walk(ln);
    });
    const chars = $$(".ch", h1);
    let raf = 0, px = -1e4, py = -1e4;
    const update = () => {
      raf = 0;
      chars.forEach((c) => {
        const r = c.getBoundingClientRect();
        const d = Math.hypot(r.left + r.width / 2 - px, r.top + r.height / 2 - py) / view.s;
        c.style.setProperty("--w", (75 + 50 * Math.max(0, 1 - d / 240)).toFixed(1));
      });
    };
    hero.addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; raf ||= requestAnimationFrame(update); });
    hero.addEventListener("pointerleave", () => { px = py = -1e4; raf ||= requestAnimationFrame(update); });
  }

  function fitHero() {
    const hero = $(".hero");
    if (!hero) return;
    const h1 = hero.querySelector("h1");
    const avail = hero.clientWidth - 108;
    let last = 132;
    $$(".ln", h1).forEach((ln) => {
      if (!ln.hasAttribute("data-fit")) { ln.style.fontSize = last * 1.25 + "px"; return; }
      ln.style.fontSize = "100px";
      ln.style.display = "inline-block";
      const w = ln.scrollWidth;
      ln.style.display = "";
      last = Math.floor(100 * avail / w);
      ln.style.fontSize = last + "px";
    });
  }

  /* ---------------- Pan & zoom ---------------- */
  const view = { x: 0, y: 0, s: 1 };
  const pan = { start: null, moved: false, suppress: false, vx: 0, vy: 0, last: null, inertia: 0, pointers: new Map(), pinch: null };

  function defaultScale() {
    if (isSmall()) return clamp((innerWidth - 28) / 620, 0.4, 0.9); // hero sheet is 620 wide on phones
    if (innerWidth < 900) return 0.62;
    if (innerWidth < 1300) return 0.74;
    return 0.85;
  }

  function clampView() {
    const dw = W * view.s, dh = H * view.s, m = 120;
    view.x = dw + m * 2 < innerWidth ? (innerWidth - dw) / 2 : clamp(view.x, innerWidth - dw - m, m);
    view.y = dh + m * 2 < innerHeight ? (innerHeight - dh) / 2 : clamp(view.y, innerHeight - dh - m, m);
  }

  function apply() {
    clampView();
    desk.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`;
    updateMinimap();
  }

  let flyRaf = 0;
  function centerOn(px, py, animate = true, s = view.s) {
    cancelAnimationFrame(flyRaf);
    cancelAnimationFrame(pan.inertia);
    const to = { x: innerWidth / 2 - px * s, y: innerHeight / 2 - py * s, s };
    if (!animate || reduceMotion) { Object.assign(view, to); return apply(); }
    const from = { ...view }, t0 = performance.now(), dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      view.x = from.x + (to.x - from.x) * e;
      view.y = from.y + (to.y - from.y) * e;
      view.s = from.s + (to.s - from.s) * e;
      apply();
      if (k < 1) flyRaf = requestAnimationFrame(step);
    };
    flyRaf = requestAnimationFrame(step);
  }

  function zoomAt(cx, cy, f) {
    const ns = clamp(view.s * f, 0.3, 1.6);
    view.x = cx - (cx - view.x) * (ns / view.s);
    view.y = cy - (cy - view.y) * (ns / view.s);
    view.s = ns;
    apply();
  }

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(pan.inertia);
    cancelAnimationFrame(flyRaf);
    pan.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pan.pointers.size === 2) {
      const [a, b] = [...pan.pointers.values()];
      pan.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      pan.moved = true;
      return;
    }
    pan.start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    pan.moved = false;
    pan.last = { x: e.clientX, y: e.clientY, t: performance.now() };
    pan.vx = pan.vy = 0;
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!pan.pointers.has(e.pointerId)) return;
    pan.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pan.pinch && pan.pointers.size === 2) {
      const [a, b] = [...pan.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pan.pinch.d);
      pan.pinch.d = d;
      return;
    }
    if (!pan.start) return;
    const dx = e.clientX - pan.start.x, dy = e.clientY - pan.start.y;
    if (!pan.moved && Math.hypot(dx, dy) > 6) {
      pan.moved = true;
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add("dragging");
      showTag("");
      hideHint();
    }
    if (!pan.moved) return;
    view.x = pan.start.vx + dx;
    view.y = pan.start.vy + dy;
    const now = performance.now(), dt = Math.max(1, now - pan.last.t);
    pan.vx = 0.8 * ((e.clientX - pan.last.x) / dt) + 0.2 * pan.vx;
    pan.vy = 0.8 * ((e.clientY - pan.last.y) / dt) + 0.2 * pan.vy;
    pan.last = { x: e.clientX, y: e.clientY, t: now };
    apply();
  });

  function endPan(e) {
    pan.pointers.delete(e.pointerId);
    if (pan.pointers.size) return;
    pan.pinch = null;
    viewport.classList.remove("dragging");
    if (pan.moved) {
      pan.suppress = true;
      setTimeout(() => (pan.suppress = false), 60);
      if (!reduceMotion && performance.now() - pan.last.t < 80) {
        let vx = pan.vx * 16, vy = pan.vy * 16;
        const glide = () => {
          vx *= 0.92; vy *= 0.92;
          view.x += vx; view.y += vy;
          apply();
          if (Math.abs(vx) + Math.abs(vy) > 0.3) pan.inertia = requestAnimationFrame(glide);
        };
        pan.inertia = requestAnimationFrame(glide);
      }
    }
    pan.start = null;
    setTimeout(() => (pan.moved = false), 0);
  }
  viewport.addEventListener("pointerup", endPan);
  viewport.addEventListener("pointercancel", endPan);

  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    cancelAnimationFrame(flyRaf);
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    else { view.x -= e.deltaX; view.y -= e.deltaY; apply(); }
    hideHint();
  }, { passive: false });

  $("#zoomIn").addEventListener("click", () => { zoomAt(innerWidth / 2, innerHeight / 2, 1.2); sfx.tick(); });
  $("#zoomOut").addEventListener("click", () => { zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.2); sfx.tick(); });
  addEventListener("resize", () => { apply(); fitHero(); });

  let hintTimer;
  function hideHint() { $("#hint").classList.add("gone"); clearTimeout(hintTimer); }

  /* ---------------- Minimap ---------------- */
  const mm = $("#minimap"), mmView = $("#mmView");
  const MMW = 170, MMS = MMW / W;
  mm.style.height = H * MMS + "px";
  function drawMinimap() {
    $$(".mm-z", mm).forEach((n) => n.remove());
    items.forEach((it) => {
      let w = 26, h = 34, c = "rgba(236,229,210,.55)";
      if (it.kind === "folder") { w = 34; h = 34; c = it.data.palette[0]; }
      if (it.kind === "sticky") { w = 26; h = 26; c = NOTE_COLOURS[it.i % NOTE_COLOURS.length]; }
      if (it.kind === "hero") { w = 1000; h = 620; c = "#f4eee2"; }
      if (it.kind === "poster") { w = 190; h = 260; }
      if (it.kind === "folder") { w = 260; h = 300; }
      if (it.kind === "sticky") { w = 206; h = 200; }
      const n = document.createElement("i");
      n.className = "mm-z";
      Object.assign(n.style, { left: (it.x - w / 2) * MMS + "px", top: (it.y - h / 2) * MMS + "px", width: w * MMS + "px", height: h * MMS + "px", background: c });
      mm.insertBefore(n, mmView);
    });
  }
  function updateMinimap() {
    Object.assign(mmView.style, {
      left: (-view.x / view.s) * MMS + "px", top: (-view.y / view.s) * MMS + "px",
      width: (innerWidth / view.s) * MMS + "px", height: (innerHeight / view.s) * MMS + "px",
    });
  }
  let mmDrag = false;
  const mmGo = (e, anim) => {
    const r = mm.getBoundingClientRect();
    centerOn((e.clientX - r.left) / MMS, (e.clientY - r.top) / MMS, anim);
  };
  mm.addEventListener("pointerdown", (e) => { mmDrag = true; mm.setPointerCapture(e.pointerId); mmGo(e, true); hideHint(); });
  mm.addEventListener("pointermove", (e) => mmDrag && mmGo(e, false));
  mm.addEventListener("pointerup", () => (mmDrag = false));

  /* ==========================================================
     WINDOWS
     ========================================================== */
  const wins = new Map();
  const layer = $("#windows");
  let zTop = 50, cascade = 0;

  function focusWin(w) {
    w.style.zIndex = ++zTop;
    wins.forEach((o) => o.classList.toggle("inactive", o !== w));
  }

  function syncDock() {
    $$(".dock button").forEach((b) => b.classList.toggle("on", wins.has(b.dataset.open)));
  }

  function openWin(key, { title, path = "", w = 900, h = 640, build }) {
    if (wins.has(key)) {
      const ex = wins.get(key);
      ex.classList.remove("min");
      focusWin(ex);
      return ex;
    }
    const width = Math.min(w, innerWidth - 24), height = Math.min(h, innerHeight - 110);
    const off = (cascade++ % 5) * 26 - 52;
    const win = html(`
      <section class="win" role="dialog" aria-label="${esc(title)}" style="width:${width}px;height:${height}px">
        <div class="win-bar"><span class="wt">${esc(title)} <span>${esc(path)}</span></span>
          <button data-w="min" aria-label="Minimise">−</button><button data-w="max" aria-label="Maximise">□</button><button data-w="close" aria-label="Close">×</button>
        </div>
        <div class="win-body"></div>
      </section>`);
    win.style.left = clamp((innerWidth - width) / 2 + off, 12, Math.max(12, innerWidth - width - 12)) + "px";
    win.style.top = clamp((innerHeight - 70 - height) / 2 + off, 12, Math.max(12, innerHeight - height - 80)) + "px";
    layer.append(win);
    wins.set(key, win);
    win.dataset.key = key;
    build($(".win-body", win), win);
    focusWin(win);
    syncDock();
    sfx.pop();

    win.addEventListener("pointerdown", () => focusWin(win));
    $("[data-w=close]", win).addEventListener("click", () => closeWin(key));
    $("[data-w=max]", win).addEventListener("click", () => win.classList.toggle("max"));
    $("[data-w=min]", win).addEventListener("click", () => win.classList.toggle("min"));

    const bar = $(".win-bar", win);
    bar.addEventListener("dblclick", (e) => !e.target.closest("button") && win.classList.toggle("max"));
    let drag = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || isSmall() || win.classList.contains("max")) return;
      drag = { x: e.clientX, y: e.clientY, l: win.offsetLeft, t: win.offsetTop };
      bar.setPointerCapture(e.pointerId);
      bar.style.cursor = "grabbing";
    });
    bar.addEventListener("pointermove", (e) => {
      if (!drag) return;
      win.style.left = clamp(drag.l + e.clientX - drag.x, 80 - win.offsetWidth, innerWidth - 80) + "px";
      win.style.top = clamp(drag.t + e.clientY - drag.y, 0, innerHeight - 50) + "px";
    });
    bar.addEventListener("pointerup", () => { drag = null; bar.style.cursor = ""; });
    requestAnimationFrame(() => $("[data-w=close]", win).focus({ preventScroll: true }));
    return win;
  }

  function closeWin(key) {
    const w = wins.get(key);
    if (!w) return;
    wins.delete(key);
    syncDock();
    sfx.close();
    w.classList.add("closing");
    w.addEventListener("animationend", () => w.remove(), { once: true });
    setTimeout(() => w.remove(), 400);
  }

  function topWinKey() {
    let best = null, z = -1;
    wins.forEach((w, k) => { if (+w.style.zIndex > z) { z = +w.style.zIndex; best = k; } });
    return best;
  }

  /* ---------------- Work ---------------- */
  function openWork(tab = "posters") {
    const win = openWin("work", {
      title: "Work", path: "~/mkdz/work", w: 1040, h: 720,
      build(body) {
        const total = D.posters.reduce((a, p) => a + p.v.length, 0);
        body.innerHTML = `
          <div class="tabs" role="tablist">
            <button role="tab" data-tab="posters">Posters<sup>${D.posters.length}</sup></button>
            <button role="tab" data-tab="brands">Branding<sup>${D.brands.length}</sup></button>
          </div>
          <div class="tabpane"></div>`;
        const pane = $(".tabpane", body);
        const show = (t) => {
          $$(".tabs button", body).forEach((b) => { b.classList.toggle("on", b.dataset.tab === t); b.setAttribute("aria-selected", b.dataset.tab === t); });
          body.scrollTop = 0;
          if (t === "posters") renderPosters(pane, "All", total);
          else renderBrands(pane);
        };
        $$(".tabs button", body).forEach((b) => b.addEventListener("click", () => { show(b.dataset.tab); sfx.tick(); }));
        body._show = show;
        show(tab);
      },
    });
    $(".win-body", win)._show?.(tab);
  }

  function renderPosters(pane, month, total) {
    const months = ["All", "Aug", "Sep", "Oct"];
    const list = month === "All" ? D.posters : D.posters.filter((p) => p.m === month);
    pane.innerHTML = `
      <div class="chips-row">${months.map((m) => `<button class="chip ${m === month ? "on" : ""}" data-m="${m}">${m === "All" ? `All · ${total} files` : m + " 2026"}</button>`).join("")}</div>
      <div class="pgrid">${list.map((p, i) => `
        <button class="pcard" data-i="${i}">
          <div class="pimg"><img src="${posterSrc(p.v[0])}" alt="${esc(p.t)} poster" loading="lazy">${p.v.length > 1 ? `<span class="vdots">${"●".repeat(Math.min(p.v.length, 5))} ${p.v.length}</span>` : ""}</div>
          <div class="pt"><span>${esc(p.t)}</span><span>${p.m}</span></div>
        </button>`).join("")}</div>`;
    $$(".chip", pane).forEach((c) => c.addEventListener("click", () => { renderPosters(pane, c.dataset.m, total); sfx.tick(); }));
    $$(".pcard", pane).forEach((c) => c.addEventListener("click", () => openPosterViewer(list, +c.dataset.i)));
  }

  function renderBrands(pane) {
    pane.innerHTML = `<div class="bgrid">${D.brands.map((b) => `
      <button class="bcard" data-id="${b.id}">
        <div class="bimg"><img src="${brandSrc(b.id, 1)}" alt="${esc(b.name)}" loading="lazy"></div>
        <div class="binfo"><h3>${esc(b.name)}</h3><p>${esc(b.line)}</p>
          <div class="swatches">${b.palette.map((c) => `<i style="background:${c}"></i>`).join("")}</div></div>
      </button>`).join("")}</div>`;
    $$(".bcard", pane).forEach((c) => c.addEventListener("click", () => openBrand(c.dataset.id)));
  }

  /* ---------------- Brand case study ---------------- */
  function openBrand(id) {
    const existing = wins.get("brand");
    if (existing) { fillBrand(existing, id); focusWin(existing); existing.classList.remove("min"); sfx.pop(); return; }
    openWin("brand", { title: "Brand", w: 1120, h: 760, build: (body, win) => fillBrand(win, id) });
  }

  function fillBrand(win, id) {
    const k = D.brands.findIndex((b) => b.id === id);
    const b = D.brands[k];
    const prev = D.brands[(k - 1 + D.brands.length) % D.brands.length];
    const next = D.brands[(k + 1) % D.brands.length];
    const s = slug(b.name);
    $(".wt", win).innerHTML = `${esc(b.name)} <span>~/brands/${s}</span>`;
    win.setAttribute("aria-label", b.name);
    const body = $(".win-body", win);
    const imgs = Array.from({ length: b.n }, (_, i) => i + 1);
    body.innerHTML = `
      <div class="case">
        <aside class="readme">
          <div class="path">~/brands/${s} $ <b>cat README.md</b></div>
          <h2>${esc(b.name)}</h2>
          <p class="kicker">“${esc(b.line)}”</p>
          <h4>The brief</h4><p>${esc(b.about)}</p>
          <h4>What I made</h4><ul>${b.did.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
          <h4>Palette <span style="color:#6d6a63">(click to copy)</span></h4>
          <div class="pal">${b.palette.map((c) => `<button data-hex="${c}"><i style="background:${c}"></i>${c}</button>`).join("")}</div>
          <div class="nav2"><button data-id="${prev.id}">← ${esc(prev.name)}</button><button data-id="${next.id}">${esc(next.name)} →</button></div>
        </aside>
        <div class="gallery">${imgs.map((i) => `<button data-i="${i - 1}" aria-label="${esc(b.name)} image ${i}"><img src="${brandSrc(b.id, i)}" alt="" loading="lazy"></button>`).join("")}</div>
      </div>`;
    body.scrollTop = 0;
    $$(".pal button", body).forEach((p) => p.addEventListener("click", () => {
      navigator.clipboard?.writeText(p.dataset.hex).catch(() => {});
      toast(`copied ${p.dataset.hex} ✦`);
      sfx.tick();
    }));
    $$(".nav2 button", body).forEach((n) => n.addEventListener("click", () => { fillBrand(win, n.dataset.id); sfx.pop(); }));
    const list = imgs.map((i) => ({ title: b.name, sub: `${pad2(i)} / ${pad2(b.n)}`, v: [brandSrc(b.id, i, "lg")], th: [brandSrc(b.id, i)] }));
    $$(".gallery button", body).forEach((g) => g.addEventListener("click", () => openLightbox(list, +g.dataset.i)));
  }

  /* ---------------- Services ---------------- */
  function openServices(openIndex = -1) {
    const startSide = openIndex >= 0 ? D.services[openIndex].side : "A";
    const win = openWin("services", {
      title: "Services", path: "~/mkdz/what-i-do", w: 820, h: 600,
      build(body) {
        body.innerHTML = `
          <div class="sides">
            <button data-side="A"><small>Side A · Design studio</small><span>Make it look right</span></button>
            <button data-side="B"><small>Side B · Direction</small><span>Make it land</span></button>
          </div>
          <ul class="slist"></ul>`;
        const ul = $(".slist", body);
        const render = (side, openI) => {
          $$(".sides button", body).forEach((b) => b.classList.toggle("on", b.dataset.side === side));
          let n = 0;
          ul.innerHTML = D.services.map((s, i) => s.side !== side ? "" : `
            <li class="srow ${i === openI ? "open" : ""}" style="--sc:${NOTE_COLOURS[i % NOTE_COLOURS.length]}" data-i="${i}">
              <button aria-expanded="${i === openI}"><span class="num">${side}${pad2(++n)}</span><span class="stt">${esc(s.t)}${s.star ? ' <span class="star-mark">✦</span>' : ""}</span><span class="plus">+</span></button>
              <div class="sbody"><div><div class="in">
                <p>${esc(s.d)}</p>
                <div class="tags">${s.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
                <button class="link-btn" data-talk="${esc(s.t)}">Talk to me about this →</button>
              </div></div></div>
            </li>`).join("");
          $$(".srow > button", ul).forEach((btn) => btn.addEventListener("click", () => {
            const row = btn.parentElement;
            const open = !row.classList.contains("open");
            $$(".srow", ul).forEach((r) => { r.classList.remove("open"); $("button", r).setAttribute("aria-expanded", "false"); });
            row.classList.toggle("open", open);
            btn.setAttribute("aria-expanded", open);
            sfx.tick();
          }));
          $$("[data-talk]", ul).forEach((b) => b.addEventListener("click", () => openContact(b.dataset.talk)));
        };
        $$(".sides button", body).forEach((b) => b.addEventListener("click", () => { render(b.dataset.side, -1); sfx.tick(); }));
        body._render = render;
        render(startSide, openIndex);
      },
    });
    if (openIndex >= 0) {
      $(".win-body", win)._render(startSide, openIndex);
      setTimeout(() => $(`.srow[data-i="${openIndex}"]`, win)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
    }
  }

  /* ---------------- About ---------------- */
  function openAbout() {
    const files = D.posters.reduce((a, p) => a + p.v.length, 0);
    const ways = D.posters.filter((p) => p.v.length > 1).length;
    openWin("about", {
      title: "About", path: "~/mkdz", w: 760, h: 680,
      build(body) {
        body.innerHTML = `
          <div class="term">
            <div class="p"><b>~/mkdz</b> $ whoami</div>
            <div class="out big">${esc(D.name)}<em>.</em></div>
            <div class="out">designer, experimenter, occasional chaos agent.</div>
            <div class="p"><b>~/mkdz</b> $ cat about.md</div>
            <p class="out">I'm a graphic designer and brand strategist based in ${esc(D.location)}, with a strong focus on building bold, expressive, story-driven visual identities.</p>
            <p class="out">I've created and shipped posters, brand systems and design series for clients and creatives, helping ideas look as good as they sound. From concept to canvas: clarity, intention, and unapologetic creativity.</p>
            <div class="p"><b>~/mkdz</b> $ mkdz --stats</div>
            <table>
              <tr><td>posters_last_60_days</td><td>${D.posters.length} pieces · ${files} files</td></tr>
              <tr><td>series_with_colourways</td><td>${ways}</td></tr>
              <tr><td>brands_built</td><td>${D.brands.length}</td></tr>
              <tr><td>creating_since</td><td>${D.since}</td></tr>
              <tr><td>based_in</td><td>${esc(D.location)}</td></tr>
              <tr><td>favourite_tool</td><td>the pen tool, obviously</td></tr>
            </table>
            <div class="p"><b>~/mkdz</b> $ ls ./disciplines</div>
            <div class="out">${D.services.map((s) => esc(s.t.toLowerCase().replace(/ & /g, "-and-").replace(/\s+/g, "-"))).join("  ")}</div>
            <div class="p cursor"><b>~/mkdz</b> $ </div>
          </div>`;
      },
    });
  }

  /* ---------------- Contact ---------------- */
  function openContact(preselect) {
    const win = openWin("contact", {
      title: "Contact", path: "~/mkdz/new-project", w: 680, h: 760,
      build(body) {
        const needs = D.services.map((s) => s.t);
        body.innerHTML = `
          <form class="contact" novalidate>
            <h2>Let's make<br>something <em>loud.</em></h2>
            <p class="sub">Tick what you need, tell me a little, and I'll get back to you soon.</p>
            <fieldset><legend>I need</legend><div class="chips-row need">${needs.map((n) => `<button type="button" class="chip" aria-pressed="false" data-v="${esc(n)}">${esc(n)}</button>`).join("")}</div></fieldset>
            <fieldset><legend>Timeline</legend><div class="chips-row time">${["ASAP", "1–2 months", "Just exploring"].map((n) => `<button type="button" class="chip" aria-pressed="false" data-v="${n}">${n}</button>`).join("")}</div></fieldset>
            <div class="row2">
              <label><span>Name</span><input name="name" required autocomplete="name"></label>
              <label><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
            </div>
            <label><span>Your project</span><textarea name="msg" placeholder="A bakery for dogs? A poster series? Tell me everything."></textarea></label>
            <div class="send">
              <button class="pill solid" type="submit">Send it →</button>
              <span class="direct">or email <a href="mailto:${esc(D.email)}">${esc(D.email)}</a></span>
            </div>
            <div class="socials">${D.socials.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join("")}</div>
          </form>`;
        const form = $("form", body);
        $$(".need .chip", form).forEach((c) => c.addEventListener("click", () => { c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true"); sfx.tick(); }));
        $$(".time .chip", form).forEach((c) => c.addEventListener("click", () => {
          $$(".time .chip", form).forEach((o) => o.setAttribute("aria-pressed", o === c && c.getAttribute("aria-pressed") !== "true"));
          sfx.tick();
        }));
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const f = new FormData(form);
          if (!f.get("name") || !form.email.checkValidity()) { toast("need your name & a valid email ✦"); (f.get("name") ? form.email : form.name).focus(); return; }
          const need = $$(".need .chip[aria-pressed=true]", form).map((c) => c.dataset.v);
          const time = $(".time .chip[aria-pressed=true]", form)?.dataset.v || "—";
          const text = `Hi Mohith,\n\n${f.get("msg") || ""}\n\nI need: ${need.join(", ") || "—"}\nTimeline: ${time}\n\n${f.get("name")} · ${f.get("email")}`;
          location.href = `mailto:${D.email}?subject=${encodeURIComponent("New project via MKDZ — " + f.get("name"))}&body=${encodeURIComponent(text)}`;
          toast("opening your mail app ✦");
        });
      },
    });
    if (preselect) {
      const c = $$(".need .chip", win).find((c) => c.dataset.v === preselect);
      c?.setAttribute("aria-pressed", "true");
    }
  }

  const OPENERS = { work: () => openWork(), services: () => openServices(), about: openAbout, contact: () => openContact() };
  $$(".dock button").forEach((b) => b.addEventListener("click", () => {
    if (wins.has(b.dataset.open) && +wins.get(b.dataset.open).style.zIndex === zTop) closeWin(b.dataset.open);
    else OPENERS[b.dataset.open]();
  }));

  /* ==========================================================
     LIGHTBOX
     ========================================================== */
  const lb = $("#lightbox"), lbImg = $("img", lb);
  const lbState = { list: [], i: 0, v: 0, opener: null };

  function openPosterViewer(source, i) {
    const list = source.map((p) => ({ title: p.t, sub: `${p.m} 2026`, v: p.v.map((n) => posterSrc(n, "lg")), th: p.v.map((n) => posterSrc(n)) }));
    openLightbox(list, i);
  }

  function openLightbox(list, i) {
    Object.assign(lbState, { list, i, v: 0, opener: document.activeElement });
    lb.hidden = false;
    renderLb();
    $(".lb-close", lb).focus({ preventScroll: true });
    sfx.pop();
  }

  function renderLb() {
    const it = lbState.list[lbState.i];
    lbImg.classList.add("loading");
    lbImg.onload = () => lbImg.classList.remove("loading");
    lbImg.src = it.v[lbState.v];
    lbImg.alt = it.title;
    $(".lb-title", lb).textContent = it.title;
    $(".lb-sub", lb).textContent = it.sub;
    $(".lb-count", lb).textContent = `${pad2(lbState.i + 1)} / ${pad2(lbState.list.length)}`;
    const vv = $(".lb-variants", lb);
    vv.innerHTML = it.v.length > 1 ? it.th.map((t, k) => `<button class="${k === lbState.v ? "on" : ""}" data-k="${k}" aria-label="Colourway ${k + 1}"><img src="${t}" alt=""></button>`).join("") : "";
    $$("button", vv).forEach((b) => b.addEventListener("click", () => { lbState.v = +b.dataset.k; renderLb(); sfx.tick(); }));
    // warm neighbours
    [1, -1].forEach((d) => { const n = lbState.list[(lbState.i + d + lbState.list.length) % lbState.list.length]; new Image().src = n.v[0]; });
  }

  function lbStep(d) {
    lbState.i = (lbState.i + d + lbState.list.length) % lbState.list.length;
    lbState.v = 0;
    renderLb();
    sfx.tick();
  }

  function closeLb() {
    lb.hidden = true;
    lbImg.removeAttribute("src");
    sfx.close();
    lbState.opener?.focus?.({ preventScroll: true });
  }

  $(".lb-close", lb).addEventListener("click", closeLb);
  $(".lb-prev", lb).addEventListener("click", () => lbStep(-1));
  $(".lb-next", lb).addEventListener("click", () => lbStep(1));
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target.tagName === "FIGURE") closeLb(); });
  let swipe = null;
  lb.addEventListener("pointerdown", (e) => (swipe = { x: e.clientX, y: e.clientY }));
  lb.addEventListener("pointerup", (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) lbStep(dx < 0 ? 1 : -1);
    swipe = null;
  });

  /* ---------------- Keyboard ---------------- */
  addEventListener("keydown", (e) => {
    if (!$("#boot").classList.contains("gone")) return;
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
    if (!lb.hidden) {
      if (e.key === "Escape") closeLb();
      if (e.key === "ArrowRight") lbStep(1);
      if (e.key === "ArrowLeft") lbStep(-1);
      return;
    }
    if (e.key === "Escape") {
      if (!$("#menu").hidden) return toggleMenu(false);
      const k = topWinKey();
      if (k) closeWin(k);
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const inWin = document.activeElement?.closest?.(".win");
    if (!inWin && ["1", "2", "3", "4"].includes(e.key)) OPENERS[["work", "services", "about", "contact"][+e.key - 1]]();
    if (inWin) return;
    const step = 140;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      centerOn((innerWidth / 2 - view.x - dx) / view.s, (innerHeight / 2 - view.y - dy) / view.s, true);
      hideHint();
    }
    if (e.key === "0" || e.key.toLowerCase() === "h") home();
    if (e.key === "+" || e.key === "=") zoomAt(innerWidth / 2, innerHeight / 2, 1.2);
    if (e.key === "-") zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.2);
  });

  /* ---------------- Menu ---------------- */
  const menuBtn = $("#menuBtn"), menu = $("#menu");
  function toggleMenu(open = menu.hidden) {
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", open);
  }
  menuBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); sfx.tick(); });
  addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest(".menu-wrap")) toggleMenu(false); });
  menu.addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (act === "sound") { sfx.on ? sfx.disable() : (sfx.enable(), sfx.pop()); return; }
    toggleMenu(false);
    if (act === "shuffle") shuffle();
    if (act === "home") home();
    if (act === "intro") runBoot(true);
  });

  let seed = 7;
  function shuffle() {
    desk.classList.add("shuffling");
    layout(++seed * 9973);
    sfx.shuffle();
    toast("desk shuffled ✦");
    setTimeout(() => desk.classList.remove("shuffling"), 900);
  }
  function home() { centerOn(HERO.x, HERO.y, true, defaultScale()); }

  /* ---------------- Clock ---------------- */
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
  const tickClock = () => ($("#clock").textContent = fmt.format(new Date()));
  tickClock();
  setInterval(tickClock, 15000);

  /* ==========================================================
     BOOT
     ========================================================== */
  const boot = $("#boot");
  const cells = $("#bootCells");
  for (let i = 0; i < 48; i++) cells.append(document.createElement("i"));
  const LOG = [
    ["loading posters", `${D.posters.reduce((a, p) => a + p.v.length, 0)} files`],
    ["unpacking brands", `${D.brands.length} identities`],
    ["kerning feelings", "done"],
    ["mixing CMYK", "100% K"],
    ["sharpening the pen tool", "ok"],
    ["chaos level", "optimal"],
  ];
  let booted = false, bootRaf = 0;

  function preload(urls) {
    let done = 0;
    urls.forEach((u) => { const im = new Image(); im.onload = im.onerror = () => done++; im.src = u; });
    return () => done / urls.length;
  }

  function runBoot(replay = false) {
    booted = false;
    boot.classList.remove("gone");
    $("#bootActions").classList.remove("show");
    $("#bootLog").innerHTML = "";
    $("#bootLabel").textContent = "PRINTING";
    const path = $(".pen-path"), anchors = $$(".pen-anchors rect"), cellEls = $$("i", cells);
    const loaded = replay ? () => 1 : preload([...deskPosters.map((p) => posterSrc(p.v[0])), ...D.brands.map((b) => brandSrc(b.id, 1))]);
    const t0 = performance.now(), minDur = reduceMotion ? 300 : 3200, maxDur = 9000;
    let shown = 0;
    const frame = (t) => {
      const el = t - t0;
      const p = Math.min(1, el / minDur, Math.max(loaded(), el / maxDur));
      path.style.strokeDashoffset = 900 * (1 - p);
      anchors.forEach((a, k) => a.classList.toggle("on", p >= k / (anchors.length - 1) - 0.001));
      $("#bootInk").textContent = (p * 100).toFixed(1) + "%";
      $("#bootPct").textContent = Math.round(p * 100) + "%";
      cellEls.forEach((c, k) => c.classList.toggle("on", k < Math.round(p * 48)));
      $("#bootStat").textContent = `layer ${Math.round(p * 412)}/412 · ${Math.round(p * deskPosters.length)} posters pinned · coffee ${Math.round(100 - p * 93)}%`;
      while (shown < LOG.length && p >= (shown + 1) / (LOG.length + 1)) {
        const [a, b] = LOG[shown++];
        const dots = ".".repeat(Math.max(2, 26 - a.length));
        $("#bootLog").append(html(`<li>[ <span class="ok">OK</span> ]  ${a} ${dots} ${b}</li>`));
        sfx.tick();
      }
      if (p < 1) bootRaf = requestAnimationFrame(frame);
      else finishBoot();
    };
    cancelAnimationFrame(bootRaf);
    bootRaf = requestAnimationFrame(frame);
  }

  function finishBoot() {
    booted = true;
    while ($("#bootLog").children.length < LOG.length) {
      const [a, b] = LOG[$("#bootLog").children.length];
      $("#bootLog").append(html(`<li>[ <span class="ok">OK</span> ]  ${a} ${".".repeat(Math.max(2, 26 - a.length))} ${b}</li>`));
    }
    $("#bootLabel").textContent = "PRINT-READY";
    $("#bootActions").classList.add("show");
    $("[data-enter=sound]").focus({ preventScroll: true });
  }

  function enter(mode) {
    cancelAnimationFrame(bootRaf);
    if (mode === "sound") { sfx.enable(); sfx.pop(); }
    boot.classList.add("gone");
    fitHero();
    home();
    // drop everything onto the desk, rippling out from the hero sheet
    items.forEach((it) => {
      if (reduceMotion) return;
      const d = Math.hypot(it.x - HERO.x, it.y - HERO.y);
      it.el.style.setProperty("--d", (0.1 + d / 2600).toFixed(2) + "s");
      it.el.classList.add("drop");
      it.el.addEventListener("animationend", () => it.el.classList.remove("drop"), { once: true });
    });
    $(".hero").classList.remove("inked");
    void $(".hero").offsetWidth;
    $(".hero").classList.add("inked");
    $("#hint").classList.remove("gone");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 8000);
    viewport.focus({ preventScroll: true });
    const h = location.hash.slice(1);
    if (OPENERS[h]) setTimeout(OPENERS[h], 500);
  }

  $$("[data-enter]").forEach((b) => b.addEventListener("click", () => enter(b.dataset.enter)));
  addEventListener("keydown", (e) => {
    if (boot.classList.contains("gone")) return;
    if (booted && (e.key === "Enter" || e.key === " ")) return; // let the focused button handle it
    e.preventDefault();
    enter("quiet");
  });

  /* ---------------- Go ---------------- */
  buildDesk();
  layout(seed * 9973);
  view.s = defaultScale();
  centerOn(HERO.x, HERO.y, false);
  document.fonts?.ready.then(fitHero);
  runBoot();
})();
