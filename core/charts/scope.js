/**
 * Sveipende sanntidskurve (som på en respiratorskjerm): kurven tegnes fra venstre mot høyre,
 * og en markør med et lite tomrom foran overskriver gamle data.
 */
import { setupCanvas, scaleLinear, ticks, drawGrid } from './canvas.js';

export function createScope(wrap, { label = '', unit = '', color = '#fff', sweepSeconds = 8, range = [0, 40], height = 140, bins = 800, fill = false, zeroLine = true } = {}) {
  const c = setupCanvas(wrap, { height });
  const values = new Float64Array(bins).fill(NaN);
  let lastIdx = -1;
  let [min, max] = range;
  const GAP = Math.round(bins * 0.03);
  const PAD = { l: 34, r: 6, t: 4, b: 4 };
  let runMin = Infinity, runMax = -Infinity; // for autoskalering
  let markers = []; // [{ value, color, dash }]

  function push(t, v) {
    const idx = Math.floor(((t % sweepSeconds) / sweepSeconds) * bins) % bins;
    if (lastIdx >= 0 && idx !== lastIdx) {
      // fyll hull hvis flere binner passerte, og tøm tomrommet foran markøren
      let i = (lastIdx + 1) % bins;
      let guard = 0;
      while (i !== idx && guard++ < bins) { values[i] = v; i = (i + 1) % bins; }
      for (let g = 1; g <= GAP; g++) values[(idx + g) % bins] = NaN;
    }
    values[idx] = v;
    lastIdx = idx;
    if (v < runMin) runMin = v;
    if (v > runMax) runMax = v;
  }

  function draw() {
    const { ctx, width, height: h } = c;
    const area = { x: PAD.l, y: PAD.t, w: width - PAD.l - PAD.r, h: h - PAD.t - PAD.b };
    ctx.clearRect(0, 0, width, h);
    const y = scaleLinear(min, max, area.y + area.h, area.y);
    const tk = ticks(min, max, 3);
    drawGrid(ctx, area, y, tk, { zeroColor: zeroLine ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)' });

    for (const mk of markers) {
      if (mk.value < min || mk.value > max) continue;
      const py = Math.round(y(mk.value)) + 0.5;
      ctx.save();
      ctx.strokeStyle = mk.color; ctx.lineWidth = 1; ctx.setLineDash(mk.dash ?? [6, 4]);
      ctx.beginPath(); ctx.moveTo(area.x, py); ctx.lineTo(area.x + area.w, py); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < bins; i++) {
      const v = values[i];
      if (Number.isNaN(v)) { pen = false; continue; }
      const px = area.x + (i / bins) * area.w;
      const py = y(Math.max(min - 1000, Math.min(max + 1000, v)));
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (fill) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = color;
      ctx.lineTo(area.x + (lastIdx / bins) * area.w, y(0));
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // markør
    if (lastIdx >= 0) {
      const cx = area.x + (lastIdx / bins) * area.w;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + 0.5, area.y); ctx.lineTo(cx + 0.5, area.y + area.h); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${label}${unit ? '  ' + unit : ''}`, area.x + 6, area.y + 2);
    ctx.restore();
  }

  return {
    wrap,
    push,
    draw,
    setRange(lo, hi) { min = lo; max = hi; },
    setMarkers(list) { markers = list; },
    setSweep(seconds) { sweepSeconds = seconds; values.fill(NaN); lastIdx = -1; },
    getRange: () => [min, max],
    /** Hent og nullstill løpende min/maks siden sist (til autoskalering). */
    takeExtremes() { const r = [runMin, runMax]; runMin = Infinity; runMax = -Infinity; return r; },
    clear() { values.fill(NaN); lastIdx = -1; },
    destroy: c.destroy,
  };
}
