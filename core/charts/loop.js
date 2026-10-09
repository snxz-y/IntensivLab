/**
 * Sløyfe (x–y-plott), f.eks. trykk–volum eller flow–volum. Viser forrige pust svakt og
 * pågående pust sterkt.
 */
import { setupCanvas, scaleLinear, ticks } from './canvas.js';

export function createLoop(wrap, { title = '', xLabel = '', yLabel = '', color = '#fff', xRange = [0, 40], yRange = [0, 600], height = 200 } = {}) {
  const c = setupCanvas(wrap, { height });
  let current = [];
  let previous = [];
  let [xMin, xMax] = xRange;
  let [yMin, yMax] = yRange;
  const PAD = { l: 36, r: 8, t: 18, b: 20 };

  function drawPath(ctx, pts, x, y, alpha) {
    if (pts.length < 2) return;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const px = x(pts[i].x), py = y(pts[i].y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function draw() {
    const { ctx, width, height: h } = c;
    const area = { x: PAD.l, y: PAD.t, w: width - PAD.l - PAD.r, h: h - PAD.t - PAD.b };
    ctx.clearRect(0, 0, width, h);
    const x = scaleLinear(xMin, xMax, area.x, area.x + area.w);
    const y = scaleLinear(yMin, yMax, area.y + area.h, area.y);

    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#6b7784';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (const t of ticks(xMin, xMax, 4)) {
      const px = Math.round(x(t)) + 0.5;
      ctx.strokeStyle = t === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.moveTo(px, area.y); ctx.lineTo(px, area.y + area.h); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(t), px, area.y + area.h + 3);
    }
    for (const t of ticks(yMin, yMax, 4)) {
      const py = Math.round(y(t)) + 0.5;
      ctx.strokeStyle = t === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.moveTo(area.x, py); ctx.lineTo(area.x + area.w, py); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(t), area.x - 4, py);
    }
    ctx.fillStyle = color;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, area.x + 4, 2);
    ctx.fillStyle = '#9aa7b5';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(xLabel, area.x + area.w, 2);
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    drawPath(ctx, previous, x, y, 0.3);
    ctx.lineWidth = 2;
    drawPath(ctx, current, x, y, 1);
    ctx.restore();
  }

  return {
    wrap,
    draw,
    setData(cur, prev) { current = cur; if (prev) previous = prev; },
    setRanges(xr, yr) { if (xr) [xMin, xMax] = xr; if (yr) [yMin, yMax] = yr; },
    destroy: c.destroy,
  };
}
