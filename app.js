/* Fidget Pad - a fake controller that controls nothing. Vanilla JS, no build step. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------------- settings ---------------- */
const settings = { sound: true, haptics: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('fidgetpad-settings') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('fidgetpad-settings', JSON.stringify(settings)); } catch (e) {} };

/* ---------------- block zoom / scroll / selection ---------------- */
const stop = e => e.preventDefault();
['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick', 'selectstart', 'dragstart']
  .forEach(t => document.addEventListener(t, stop, { passive: false }));
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
});

/* ---------------- haptics ---------------- */
function buzz(p) {
  if (!settings.haptics || !navigator.vibrate) return;
  try { navigator.vibrate(p); } catch (e) {}
}

/* ---------------- audio (Web Audio synth, no files) ---------------- */
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  function ac() {
    if (!settings.sound) return null;
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain(); master.gain.value = 0.6;
      master.connect(comp); comp.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function osc({ type = 'sine', f0 = 440, f1 = 0, dur = 0.15, vol = 0.3, delay = 0, attack = 0.005, lin = false,
                 vib = null, am = null, filter = null }) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) lin ? o.frequency.linearRampToValueAtTime(f1, t + dur) : o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); env(g, t, attack, vol, dur);
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter(); f.type = filter.type || 'lowpass';
      f.frequency.value = filter.f; f.Q.value = filter.q || 1; node.connect(f); node = f;
    }
    const extra = [];
    if (am) { // amplitude wobble
      const ag = c.createGain(); ag.gain.value = 0.5; node.connect(ag); node = ag;
      const l = c.createOscillator(); l.frequency.value = am.rate;
      const lg = c.createGain(); lg.gain.value = am.depth; l.connect(lg); lg.connect(ag.gain); extra.push(l);
    }
    if (vib) { // pitch wobble
      const l = c.createOscillator(); l.frequency.value = vib.rate;
      const lg = c.createGain(); lg.gain.value = vib.depth; l.connect(lg); lg.connect(o.frequency); extra.push(l);
    }
    node.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
    extra.forEach(l => { l.start(t); l.stop(t + dur + 0.05); });
  }
  function noise({ dur = 0.03, vol = 0.4, f = 2000, q = 1, type = 'bandpass', delay = 0 }) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); env(g, t, 0.001, vol, dur);
    s.connect(fl); fl.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const v = () => rand(0.94, 1.06);
  return {
    unlock: ac,
    // grown-up mode
    click(f = 1200, strong = 0.5) {
      const k = v();
      noise({ dur: 0.028, vol: strong, f: f * 3 * k, q: 2.2 });
      osc({ type: 'sine', f0: f * k, f1: f * 0.55 * k, dur: 0.045, vol: 0.14 });
    },
    release(f = 1200) { noise({ dur: 0.016, vol: 0.18, f: f * 4, q: 3 }); },
    thunk() {
      noise({ dur: 0.07, vol: 0.55, f: 700, q: 0.8, type: 'lowpass' });
      osc({ type: 'sine', f0: 150, f1: 70, dur: 0.09, vol: 0.28 });
    },
    tick() { noise({ dur: 0.012, vol: 0.16, f: 3200, q: 4 }); },
    blip(f) { osc({ type: 'square', f0: f, f1: f * 1.5, dur: 0.07, vol: 0.04, filter: { f: 3000 } }); },
    coin() {
      osc({ type: 'square', f0: 988, dur: 0.07, vol: 0.045, filter: { f: 4000 } });
      osc({ type: 'square', f0: 1319, dur: 0.16, vol: 0.045, delay: 0.07, filter: { f: 4000 } });
    },
    // kids mode
    twinkle() { [1047, 1319, 1568, 2093].forEach((f, i) => osc({ type: 'triangle', f0: f * v(), dur: 0.22, vol: 0.16, delay: i * 0.06 })); },
    giggle() {
      for (let i = 0; i < 5; i++) osc({ type: 'sine', f0: (i % 2 ? 760 : 620) * (1 + i * 0.06) * v(), f1: 900, dur: 0.07, vol: 0.22, delay: i * 0.085, vib: { rate: 30, depth: 40 } });
    },
    raspberry() { osc({ type: 'sawtooth', f0: 115 * v(), f1: 75, dur: 0.5, vol: 0.32, filter: { f: 900, q: 2 }, am: { rate: 27, depth: 0.5 } }); },
    zap() { osc({ type: 'square', f0: 1800 * v(), f1: 110, dur: 0.3, vol: 0.12, filter: { f: 3000 } }); },
    honk() {
      const n = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        osc({ type: 'sawtooth', f0: 290 * v(), f1: 255, dur: 0.24, vol: 0.2, delay: i * 0.28, filter: { f: 1300, q: 5 } });
        osc({ type: 'sawtooth', f0: 296, f1: 260, dur: 0.24, vol: 0.14, delay: i * 0.28, filter: { f: 1300, q: 5 } });
      }
    },
    boing() {
      const c = ac(); if (!c) return;
      osc({ type: 'sine', f0: 160 * v(), f1: 620, dur: 0.06, vol: 0.32, lin: true });
      osc({ type: 'sine', f0: 620, f1: 170, dur: 0.5, vol: 0.3, delay: 0.06, vib: { rate: 16, depth: 70 } });
    },
    pop() { osc({ type: 'sine', f0: 900 * v(), f1: 140, dur: 0.09, vol: 0.3 }); },
    slide(up = true) { osc({ type: 'sine', f0: up ? 380 : 1100, f1: up ? 1100 : 380, dur: 0.35, vol: 0.18, lin: true, vib: { rate: 7, depth: 18 } }); },
    wobble(f) { osc({ type: 'triangle', f0: f, f1: f * 1.3, dur: 0.22, vol: 0.16, vib: { rate: 11, depth: f * 0.08 } }); },
    tada() { [523, 659, 784, 1047].forEach((f, i) => osc({ type: 'triangle', f0: f, dur: i === 3 ? 0.5 : 0.12, vol: 0.18, delay: i * 0.09 })); }
  };
})();

/* ---------------- input helpers (pointer events = multitouch) ---------------- */
function bindPress(el, down, up) {
  const ids = new Set();
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sound.unlock();
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    ids.add(e.pointerId);
    if (ids.size === 1) { el.classList.add('pressed'); down && down(e); }
  });
  const end = e => {
    if (!ids.delete(e.pointerId)) return;
    if (ids.size === 0) { el.classList.remove('pressed'); up && up(e); }
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, end));
}

function bindStick(base, knob, travel, onMove, onRelease, onClick) {
  let id = null, cx = 0, cy = 0, R = 1, t0 = 0, maxM = 0;
  const spring = 'transform .32s cubic-bezier(.25,1.9,.45,1)';
  base.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sound.unlock();
    if (id !== null) return;
    id = e.pointerId;
    try { base.setPointerCapture(id); } catch (err) {}
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width * travel;
    t0 = performance.now(); maxM = 0;
    knob.style.transition = 'transform .05s linear';
    move(e);
  });
  function move(e) {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    const nx = dx / R, ny = dy / R;
    maxM = Math.max(maxM, Math.hypot(nx, ny));
    knob.style.transform = `translate(${dx}px,${dy}px) rotateX(${-ny * 18}deg) rotateY(${nx * 18}deg)`;
    onMove(nx, ny);
  }
  base.addEventListener('pointermove', move);
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    knob.style.transition = spring;
    knob.style.transform = '';
    onMove(0, 0);
    onRelease && onRelease();
    if (onClick && maxM < 0.25 && performance.now() - t0 < 300) onClick();
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => base.addEventListener(t, end));
}

/* ---------------- full-screen confetti / stars layer ---------------- */
const FX = (() => {
  const cv = $('#fx'), g = cv.getContext('2d');
  let P = [], raf = null, last = 0, dpr = 1;
  const PALETTE = ['#ff5fa2', '#ffc93c', '#3ec5ff', '#5be37d', '#a77bff', '#ff8b3d', '#ffffff'];
  function resize() { dpr = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
  addEventListener('resize', resize); resize();
  function burst(x, y, kind = 'confetti', n = 40, colors) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), s = rand(250, 750);
      P.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: rand(0, 6.28), vr: rand(-10, 10),
        size: kind === 'confetti' ? rand(7, 13) : rand(12, 24), life: rand(1.2, 2.2),
        col: (colors || PALETTE)[(Math.random() * (colors || PALETTE).length) | 0],
        kind: kind === 'mixed' ? ['confetti', 'star', 'heart', 'dot'][i % 4] : kind
      });
    }
    if (P.length > 450) P.splice(0, P.length - 450);
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }
  function star(s) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.45 : s, a = i * Math.PI / 5 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  }
  function heart(s) {
    g.beginPath(); g.moveTo(0, s * 0.35);
    g.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
    g.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
    g.fill();
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const H = innerHeight + 60;
    P = P.filter(p => (p.life -= dt) > 0 && p.y < H);
    for (const p of P) {
      p.vy += 900 * dt; p.vx *= 1 - 1.2 * dt; p.vy *= 1 - 0.6 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      g.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
      g.rotate(p.rot);
      g.globalAlpha = Math.min(1, p.life * 2);
      g.fillStyle = p.col;
      if (p.kind === 'confetti') { g.scale(1, Math.cos(p.rot * 2)); g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      else if (p.kind === 'star') star(p.size / 2);
      else if (p.kind === 'heart') heart(p.size / 2);
      else { g.beginPath(); g.arc(0, 0, p.size / 3, 0, 6.29); g.fill(); }
    }
    g.globalAlpha = 1;
    raf = P.length ? requestAnimationFrame(loop) : null;
    if (!raf) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); }
  }
  function clear() { P = []; }
  return { burst, clear };
})();

/* =========================================================
   GROWN-UP MODE
   ========================================================= */
const input = { lx: 0, ly: 0, rx: 0, ry: 0 };
const level = {}; // decaying 0..1 per button for the visualiser
const BTN_PITCH = { a: 1350, b: 1250, x: 1200, y: 1450, lb: 800, rb: 800, select: 1900, start: 1900, home: 2100, up: 950, down: 950, left: 950, right: 950 };

function adultPress(b) {
  input[b] = true; level[b] = 1;
  if (b === 'lt' || b === 'rt') { Sound.thunk(); buzz(28); }
  else { Sound.click(BTN_PITCH[b] || 1200, b.length === 1 ? 0.55 : 0.45); buzz(12); }
  const led = $('#led'); led.classList.add('flash'); requestAnimationFrame(() => requestAnimationFrame(() => led.classList.remove('flash')));
  Mini.onPress(b);
}
function adultRelease(b) {
  input[b] = false;
  if (b !== 'lt' && b !== 'rt') Sound.release(BTN_PITCH[b] || 1200); else Sound.release(500);
  if (b === 'home') show('menu');
}

$$('#adult [data-btn]').forEach(el => {
  const b = el.dataset.btn;
  bindPress(el, () => adultPress(b), () => adultRelease(b));
});

// D-pad: one surface so a thumb can roll between directions and diagonals
(() => {
  const pad = $('#dpad'), cross = $('#cross');
  const arms = {}; $$('#dpad .arm').forEach(a => arms[a.dataset.dir] = a);
  const pointers = new Map();
  let state = { up: false, down: false, left: false, right: false };
  function recompute() {
    const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const next = { up: false, down: false, left: false, right: false };
    for (const p of pointers.values()) {
      const dx = (p.x - cx) / (r.width / 2), dy = (p.y - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len < 0.18) continue;
      const nx = dx / len, ny = dy / len;
      if (nx > 0.38) next.right = true; if (nx < -0.38) next.left = true;
      if (ny > 0.38) next.down = true; if (ny < -0.38) next.up = true;
    }
    for (const d in next) {
      if (next[d] !== state[d]) {
        arms[d].classList.toggle('on', next[d]);
        next[d] ? adultPress(d) : adultRelease(d);
      }
    }
    state = next;
    const tx = (next.up ? 14 : 0) - (next.down ? 14 : 0), ty = (next.right ? 14 : 0) - (next.left ? 14 : 0);
    cross.style.transform = `rotateX(${tx}deg) rotateY(${ty}deg)`;
  }
  pad.addEventListener('pointerdown', e => {
    e.preventDefault(); Sound.unlock();
    try { pad.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); recompute();
  });
  pad.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); recompute();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => pad.addEventListener(t, e => {
    if (pointers.delete(e.pointerId)) recompute();
  }));
})();

// Analog sticks
[['#lstick', 'l'], ['#rstick', 'r']].forEach(([sel, s]) => {
  const base = $(sel), knob = base.querySelector('.knob');
  let atEdge = false;
  bindStick(base, knob, 0.2, (x, y) => {
    input[s + 'x'] = x; input[s + 'y'] = y;
    const m = Math.hypot(x, y);
    if (m > 0.97 && !atEdge) { atEdge = true; Sound.tick(); buzz(6); }
    else if (m < 0.8) atEdge = false;
  }, () => { Sound.release(700); }, () => {
    base.classList.add('clicked'); setTimeout(() => base.classList.remove('clicked'), 120);
    Sound.click(900, 0.5); buzz(14); level[s + '3'] = 1; Mini.onPress(s + '3');
  });
});

/* ---------------- mini screen: toy game + visualiser ---------------- */
const Mini = (() => {
  const cv = $('#mini'), g = cv.getContext('2d');
  const W = 230, H = 121, GROUND = H - 9, R = 5;
  const MODES = ['GAME', 'VISUALISER', 'SCREEN OFF'];
  const COLORS = ['#5ef2c2', '#ffcf5a', '#ff6f91', '#8fa8ff', '#ffffff'];
  const THEMES = [
    { bg: '#0b1a1f', bg2: '#123039', ground: '#1d5a63', star: '#ffe27a' },
    { bg: '#1a0f24', bg2: '#33184a', ground: '#5d2d7c', star: '#7af7ff' },
    { bg: '#1f140b', bg2: '#3d2612', ground: '#7a4b1c', star: '#b6ff7a' },
    { bg: '#0d0f1f', bg2: '#1c2147', ground: '#2f3b85', star: '#ff9ad5' }
  ];
  let mode = 0, theme = 0, score = 0, paused = false, toast = { text: '', t: 0 }, raf = null, last = 0, time = 0;
  const P = { x: W / 2, y: GROUND - R, vx: 0, vy: 0, jumps: 0, color: 0, trail: [] };
  let stars = [], parts = [];
  const bg = Array.from({ length: 34 }, () => ({ x: Math.random() * W, y: Math.random() * (GROUND - 10), z: rand(0.2, 1) }));

  function resize() {
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 3);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  }
  addEventListener('resize', resize);
  const say = t => { toast = { text: t, t: 1.3 }; };
  function burst(x, y, n, col, sp = 70) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = rand(15, sp);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(0.4, 1), col });
    }
    if (parts.length > 350) parts.splice(0, parts.length - 350);
  }

  function onPress(b) {
    if (b === 'select') { mode = (mode + 1) % 3; say(MODES[mode]); return; }
    if (mode !== 0) return;
    if (b === 'start') { paused = !paused; say(paused ? 'PAUSED' : 'GO!'); return; }
    if (paused) return;
    switch (b) {
      case 'a': case 'up':
        if (P.jumps < 2) { P.vy = P.jumps ? -125 : -150; P.jumps++; burst(P.x, P.y + R, 6, '#ffffffaa', 40); Sound.blip(P.jumps === 1 ? 520 : 780); }
        break;
      case 'b': P.vx += (P.vx >= 0 ? 1 : -1) * 260; burst(P.x, P.y, 10, COLORS[P.color], 40); break;
      case 'x': case 'l3': case 'r3': burst(P.x, P.y, 34, COLORS[(Math.random() * COLORS.length) | 0], 110); break;
      case 'y': P.color = (P.color + 1) % COLORS.length; burst(P.x, P.y, 12, COLORS[P.color], 50); break;
      case 'lb': theme = (theme + THEMES.length - 1) % THEMES.length; break;
      case 'rb': theme = (theme + 1) % THEMES.length; break;
      case 'down': P.vy += 260; break;
    }
  }

  function update(dt) {
    for (const k in level) level[k] = input[k] ? 1 : level[k] * Math.exp(-dt * 4);
    time += dt;
    if (toast.t > 0) toast.t -= dt;
    if (mode !== 0 || paused) return;
    const ts = input.lt ? 0.35 : 1; dt *= ts;
    const ax = clamp(input.lx + (input.right ? 1 : 0) - (input.left ? 1 : 0), -1, 1);
    const target = ax * 95 * (input.rt ? 1.9 : 1);
    P.vx += (target - P.vx) * Math.min(1, dt * 7);
    P.vy += 400 * dt;
    P.x += P.vx * dt; P.y += P.vy * dt;
    if (P.y > GROUND - R) {
      if (P.vy > 160) burst(P.x, GROUND, 8, '#ffffff88', 35);
      P.y = GROUND - R; P.vy = 0; P.jumps = 0;
    }
    if (P.x < -R) P.x = W + R; if (P.x > W + R) P.x = -R;
    P.trail.push({ x: P.x, y: P.y }); if (P.trail.length > 14) P.trail.shift();
    while (stars.length < 3) stars.push({ x: rand(12, W - 12), y: rand(28, GROUND - 14), p: Math.random() * 6 });
    stars = stars.filter(s => {
      if (Math.hypot(s.x - P.x, s.y - P.y) < R + 6) { score++; burst(s.x, s.y, 18, THEMES[theme].star, 60); Sound.coin(); return false; }
      return true;
    });
    for (const s of bg) {
      s.x -= (P.vx * 0.15 + input.rx * 60) * s.z * dt; s.y += input.ry * 40 * s.z * dt;
      if (s.x < 0) s.x += W; if (s.x > W) s.x -= W; if (s.y < 0) s.y += GROUND; if (s.y > GROUND) s.y -= GROUND;
    }
    parts = parts.filter(p => (p.life -= dt) > 0);
    for (const p of parts) { p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  }

  function drawGame() {
    const th = THEMES[theme];
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, th.bg); grad.addColorStop(1, th.bg2);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    for (const s of bg) { g.globalAlpha = s.z * 0.8; g.fillStyle = '#fff'; g.fillRect(s.x, s.y, s.z * 1.4, s.z * 1.4); }
    g.globalAlpha = 1;
    g.fillStyle = th.ground; g.fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, GROUND, W, 1);
    for (const s of stars) {
      const bob = Math.sin(time * 4 + s.p) * 2;
      g.fillStyle = th.star; g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 2 : 4.5, a = i * Math.PI / 5 - Math.PI / 2 + time; g.lineTo(s.x + Math.cos(a) * r, s.y + bob + Math.sin(a) * r); }
      g.fill();
    }
    const col = COLORS[P.color];
    P.trail.forEach((t, i) => { g.globalAlpha = i / P.trail.length * 0.4; g.fillStyle = col; g.beginPath(); g.arc(t.x, t.y, R * i / P.trail.length, 0, 6.29); g.fill(); });
    g.globalAlpha = 1;
    // aim line from right stick
    if (Math.hypot(input.rx, input.ry) > 0.15) {
      g.strokeStyle = col; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(P.x, P.y); g.lineTo(P.x + input.rx * 22, P.y + input.ry * 22); g.stroke(); g.globalAlpha = 1;
    }
    const sq = clamp(P.vy / 600, -0.25, 0.25);
    g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8;
    g.beginPath(); g.ellipse(P.x, P.y, R * (1 - sq), R * (1 + sq), 0, 0, 6.29); g.fill();
    g.shadowBlur = 0;
    for (const p of parts) { g.globalAlpha = Math.min(1, p.life * 2); g.fillStyle = p.col; g.fillRect(p.x - 1, p.y - 1, 2, 2); }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 8px monospace'; g.textAlign = 'left';
    g.fillText('★ ' + score, 6, 11);
    g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.45)';
    g.fillText(input.lt ? 'SLOW-MO' : input.rt ? 'TURBO' : '', W - 6, 11);
  }

  function drawVis() {
    g.fillStyle = '#07090d'; g.fillRect(0, 0, W, H);
    const sticks = [[38, 60, input.lx, input.ly, level.l3], [W - 38, 60, input.rx, input.ry, level.r3]];
    for (const [cx, cy, x, y, l3] of sticks) {
      g.strokeStyle = '#2a3340'; g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, 26, 0, 6.29); g.stroke();
      g.beginPath(); g.moveTo(cx - 26, cy); g.lineTo(cx + 26, cy); g.moveTo(cx, cy - 26); g.lineTo(cx, cy + 26); g.stroke();
      g.strokeStyle = '#5ef2c2'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + x * 24, cy + y * 24); g.stroke();
      g.fillStyle = l3 > 0.1 ? '#ffffff' : '#5ef2c2'; g.beginPath(); g.arc(cx + x * 24, cy + y * 24, 3.5 + (l3 || 0) * 3, 0, 6.29); g.fill();
    }
    const keys = [['lt', '#9aa3b5'], ['lb', '#9aa3b5'], ['up', '#cfd5e2'], ['down', '#cfd5e2'], ['left', '#cfd5e2'], ['right', '#cfd5e2'], ['select', '#7c8496'],
      ['home', '#5fe3a1'], ['start', '#7c8496'], ['x', '#5fb4ff'], ['y', '#ffd25f'], ['a', '#5fe3a1'], ['b', '#ff6b6b'], ['rb', '#9aa3b5'], ['rt', '#9aa3b5']];
    const bw = 5, gap = 1.6, total = keys.length * (bw + gap), x0 = W / 2 - total / 2;
    keys.forEach(([k, c], i) => {
      const l = level[k] || 0, h = 4 + l * 60;
      g.fillStyle = '#151a22'; g.fillRect(x0 + i * (bw + gap), 30, bw, 64);
      g.fillStyle = c; g.globalAlpha = 0.35 + l * 0.65; g.fillRect(x0 + i * (bw + gap), 94 - h, bw, h); g.globalAlpha = 1;
    });
    let energy = 0; for (const k in level) energy += level[k];
    energy += Math.hypot(input.lx, input.ly) + Math.hypot(input.rx, input.ry);
    g.strokeStyle = '#5ef2c2'; g.globalAlpha = 0.6; g.beginPath();
    for (let x = 0; x <= W; x += 2) g.lineTo(x, 108 + Math.sin(x * 0.12 + time * 8) * Math.min(8, energy * 2.5) * Math.sin(x / W * Math.PI));
    g.stroke(); g.globalAlpha = 1;
  }

  function drawOff() {
    g.fillStyle = '#040506'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.font = 'bold 7px monospace'; g.textAlign = 'center';
    g.fillText('SELECT  ▸  SCREEN ON', W / 2, H / 2 + 3);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt);
    g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    if (mode === 0) drawGame(); else if (mode === 1) drawVis(); else drawOff();
    if (toast.t > 0) {
      g.globalAlpha = Math.min(1, toast.t * 3);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, H / 2 - 10, W, 18);
      g.fillStyle = '#fff'; g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.fillText(toast.text, W / 2, H / 2 + 2);
      g.globalAlpha = 1;
    }
    raf = requestAnimationFrame(frame);
  }
  return {
    onPress,
    start() { resize(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop() { if (raf) cancelAnimationFrame(raf); raf = null; }
  };
})();

/* =========================================================
   KIDS MODE
   ========================================================= */
const Kids = (() => {
  const svg = $('#charSvg'), anim = $('#charAnim'), lean = $('#charLean');
  const pupils = { l: $('#pupilL'), r: $('#pupilR') };
  const sticks = { l: { x: 0, y: 0 }, r: { x: 0, y: 0 } };
  const REACT = {
    jump: ['r-jump', 'grin', 'happy'], spin: ['r-spin', 'open', 'wide'], squish: ['r-squish', 'grin', 'open'],
    wiggle: ['r-wiggle', 'tongue', 'happy'], surprise: ['r-pop', 'open', 'wide'], blush: ['r-wiggle', 'smile', 'happy', 1],
    laugh: ['r-shake', 'grin', 'happy', 1]
  };
  let faceTimer = null, blinkTimer = null;
  function react(kind) {
    const [cls, mouth, eyes, blush] = REACT[kind];
    anim.className = 'charAnim'; void anim.offsetWidth; anim.classList.add(cls);
    svg.dataset.mouth = mouth; svg.dataset.eyes = eyes; svg.dataset.blush = blush ? '1' : '0';
    clearTimeout(faceTimer);
    faceTimer = setTimeout(() => { svg.dataset.mouth = 'smile'; svg.dataset.eyes = 'open'; svg.dataset.blush = '0'; }, 850);
  }
  anim.addEventListener('animationend', () => { anim.className = 'charAnim'; });

  const BTN = {
    star:   { sound: 'twinkle',   fx: 'star',     colors: ['#ffc93c', '#fff4b0', '#ffffff'], react: 'jump' },
    heart:  { sound: 'giggle',    fx: 'heart',    colors: ['#ff5fa2', '#ff9ad5', '#ffffff'], react: 'blush' },
    tri:    { sound: 'raspberry', fx: 'confetti', react: 'wiggle' },
    square: { sound: 'zap',       fx: 'mixed',    react: 'spin' },
    honk:   { sound: 'honk',      fx: 'confetti', react: 'surprise' },
    boing:  { sound: 'boing',     fx: 'dot',      colors: ['#3ec5ff', '#b3ecff', '#ffffff'], react: 'squish' }
  };
  function center(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }

  $$('#kids .kbtn').forEach(el => {
    const cfg = BTN[el.dataset.k];
    bindPress(el, () => {
      Sound[cfg.sound]();
      buzz([18, 30, 18]);
      const [x, y] = center(el);
      FX.burst(x, y, cfg.fx, 38, cfg.colors);
      if (Math.random() < 0.3) { const [cx, cy] = center($('#charbox')); FX.burst(cx, cy - 40, 'star', 12, ['#ffffff', '#ffe27a']); }
      react(cfg.react);
    });
  });

  bindPress($('#charbox'), () => {
    Sound.giggle(); buzz(25); react('laugh');
    const [x, y] = center($('#charbox')); FX.burst(x, y - 30, 'heart', 18, ['#ff5fa2', '#ff9ad5']);
  });

  function updateFace() {
    for (const s of ['l', 'r']) pupils[s].setAttribute('transform', `translate(${sticks[s].x * 7} ${sticks[s].y * 7})`);
    const sx = sticks.l.x + sticks.r.x, sy = sticks.l.y + sticks.r.y;
    lean.style.transform = `translate(${sx * 5}%, ${sy * 3}%) rotate(${sx * 7}deg)`;
  }
  [['#kstickL', 'l'], ['#kstickR', 'r']].forEach(([sel, s]) => {
    const base = $(sel), knob = base.querySelector('.kknob');
    let far = false, lastSpark = 0, lastSound = 0;
    bindStick(base, knob, 0.26, (x, y) => {
      sticks[s].x = x; sticks[s].y = y; updateFace();
      const m = Math.hypot(x, y), now = performance.now();
      if (m > 0.85 && !far && now - lastSound > 180) {
        far = true; lastSound = now;
        const ang = Math.atan2(y, x);
        Sound.wobble(300 + ((ang + Math.PI) / (2 * Math.PI)) * 700); buzz(10);
      } else if (m < 0.6) far = false;
      if (m > 0.5 && now - lastSpark > 90) {
        lastSpark = now;
        const [kx, ky] = center(knob);
        FX.burst(kx, ky, 'star', 3, ['#ffffff', '#fff4b0', getComputedStyle(base).getPropertyValue('--c').trim()]);
      }
    }, () => { Sound.pop(); }, () => {
      Sound.slide(Math.random() < 0.5); buzz(20); react('surprise');
      const [kx, ky] = center(base); FX.burst(kx, ky, 'mixed', 20);
    });
  });

  // parent lock: hold 3 s
  (() => {
    const lock = $('#lock'), tip = $('#locktip'), HOLD = 3000;
    let t0 = 0, raf = null, timer = null, id = null;
    function step(now) {
      lock.style.setProperty('--p', (clamp((now - t0) / HOLD, 0, 1) * 100).toFixed(1));
      raf = requestAnimationFrame(step);
    }
    function finish() {
      cancelAnimationFrame(raf); clearTimeout(timer); raf = timer = null; id = null;
      lock.style.setProperty('--p', 0); tip.classList.remove('show');
    }
    lock.addEventListener('pointerdown', e => {
      e.preventDefault(); if (id !== null) return;
      id = e.pointerId; try { lock.setPointerCapture(id); } catch (err) {}
      t0 = performance.now(); tip.classList.add('show'); raf = requestAnimationFrame(step);
      timer = setTimeout(() => { finish(); Sound.tada(); buzz([30, 40, 60]); show('menu'); }, HOLD);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => lock.addEventListener(t, e => { if (e.pointerId === id) finish(); }));
    lock.addEventListener('click', e => e.preventDefault());
  })();

  function blink() {
    blinkTimer = setTimeout(() => {
      if (svg.dataset.eyes === 'open') { svg.dataset.eyes = 'closed'; setTimeout(() => { if (svg.dataset.eyes === 'closed') svg.dataset.eyes = 'open'; }, 130); }
      blink();
    }, rand(2200, 5200));
  }
  return {
    start() { if (!blinkTimer) blink(); },
    stop() { clearTimeout(blinkTimer); blinkTimer = null; }
  };
})();

/* =========================================================
   SCREENS
   ========================================================= */
function resetInputs() {
  for (const k in input) input[k] = typeof input[k] === 'number' ? 0 : false;
  $$('.pressed').forEach(el => el.classList.remove('pressed'));
}
function show(id) {
  resetInputs();
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  id === 'adult' ? Mini.start() : Mini.stop();
  id === 'kids' ? Kids.start() : Kids.stop();
  if (id !== 'kids') FX.clear();
}
function immersive() {
  const de = document.documentElement;
  try {
    const p = de.requestFullscreen ? de.requestFullscreen({ navigationUI: 'hide' }) : de.webkitRequestFullscreen && de.webkitRequestFullscreen();
    Promise.resolve(p).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {});
  } catch (e) {}
}
$('#goAdult').addEventListener('click', () => { Sound.unlock(); Sound.click(1400, 0.5); buzz(12); immersive(); show('adult'); });
$('#goKids').addEventListener('click', () => { Sound.unlock(); Sound.tada(); buzz(20); immersive(); show('kids'); });

function syncToggles() {
  $('#togSound').setAttribute('aria-pressed', settings.sound);
  $('#togHaptic').setAttribute('aria-pressed', settings.haptics);
}
$('#togSound').addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); syncToggles(); if (settings.sound) Sound.click(1500, 0.5); });
$('#togHaptic').addEventListener('click', () => { settings.haptics = !settings.haptics; saveSettings(); syncToggles(); buzz(30); });
syncToggles();
if (!navigator.vibrate) $('#togHaptic').title = 'Vibration is not supported on this device/browser';

document.addEventListener('visibilitychange', () => { if (document.hidden) resetInputs(); });
})();
