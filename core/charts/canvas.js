/**
 * Felles lerretshjelp: skalerer for devicePixelRatio, reagerer på størrelsesendring,
 * tegner akser og rutenett. Brukes av scope.js (rullende kurver) og loop.js (sløyfer).
 */

/** Opprett og koble et lerret til en beholder. Returnerer { canvas, ctx, width, height, onResize, destroy }. */
export function setupCanvas(wrap, { height = 160 } = {}) {
  const canvas = document.createElement('canvas');
  wrap.classList.add('canvas-wrap');
  wrap.style.height = `${height}px`;
  wrap.append(canvas);
  const ctx = canvas.getContext('2d');
  const state = { canvas, ctx, width: 0, height: 0, dpr: 1, listeners: new Set() };

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width));
    const hgt = Math.max(1, Math.round(rect.height));
    if (w === state.width && hgt === state.height && dpr === state.dpr) return;
    state.width = w; state.height = hgt; state.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.listeners.forEach((fn) => fn(w, hgt));
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(wrap);
  resize();

  return {
    canvas, ctx,
    get width() { return state.width; },
    get height() { return state.height; },
    onResize(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); },
    resize,
    destroy() { ro?.disconnect(); canvas.remove(); },
  };
}

/** Lineær avbildning fra verdiområde til piksler. */
export function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
  const d = domainMax - domainMin || 1;
  const fn = (v) => rangeMin + ((v - domainMin) / d) * (rangeMax - rangeMin);
  fn.invert = (p) => domainMin + ((p - rangeMin) / (rangeMax - rangeMin)) * d;
  return fn;
}

/** Les CSS-variabel fra :root (for kurvefarger i tema). */
export function cssVar(name, fallback = '#fff') {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** Pene akseinndelinger ("nice ticks"). */
export function ticks(min, max, count = 4) {
  const span = max - min;
  if (span <= 0) return [min];
  const rough = span / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  const step = candidates.find((c) => c >= rough) ?? candidates[candidates.length - 1];
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * Tegn rutenett og y-akse-etiketter i et plottområde.
 * area: {x, y, w, h}; yScale: scaleLinear; yTicks: tall[]
 */
export function drawGrid(ctx, area, yScale, yTicks, { label = '', color = 'rgba(255,255,255,0.08)', textColor = '#6b7784', zeroColor = 'rgba(255,255,255,0.25)' } = {}) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  for (const t of yTicks) {
    const y = Math.round(yScale(t)) + 0.5;
    ctx.strokeStyle = t === 0 ? zeroColor : color;
    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.w, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(String(t), area.x - 4, y);
  }
  if (label) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, area.x + 4, area.y + 2);
  }
  ctx.restore();
}
