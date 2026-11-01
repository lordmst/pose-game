// 파티클 · 점수 팝업 · 화면 흔들림 · 그리기 도우미
export const P1C = "#ff4d4d", P2C = "#3d8bff";
export const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

const parts = [], pops = [];
let shakeT = 0, shakeDur = 1, shakeMag = 0;

export function burst(x, y, o = {}) {
  const n = o.n ?? 14, colors = o.colors || [o.color || "#fff"];
  for (let i = 0; i < n; i++) {
    const a = o.spread != null ? (o.angle || 0) + (Math.random() - 0.5) * o.spread : Math.random() * Math.PI * 2;
    const sp = (o.speed ?? 300) * (0.35 + Math.random() * 0.85);
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0), g: o.gravity ?? 900,
      life: (o.life ?? 0.8) * (0.6 + Math.random() * 0.6), t: 0, size: (o.size ?? 8) * (0.6 + Math.random() * 0.8),
      color: colors[i % colors.length], shape: o.shape || "dot", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, drag: o.drag ?? 0.985,
    });
  }
}
export function popup(x, y, text, o = {}) {
  pops.push({ x, y, text, t: 0, life: o.life ?? 0.9, size: o.size ?? 40, color: o.color || "#fff", stroke: o.stroke || "#222", vy: o.vy ?? -90, emoji: !!o.emoji });
}
export function shake(mag, dur = 0.25) {
  const cur = shakeT > 0 ? shakeMag * (shakeT / shakeDur) : 0;
  if (mag >= cur) { shakeMag = mag; shakeDur = dur; shakeT = dur; }
}
export function shakeOffset() {
  if (shakeT <= 0) return [0, 0];
  const k = shakeMag * (shakeT / shakeDur);
  return [(Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k];
}
export function clearFx() { parts.length = 0; pops.length = 0; shakeT = 0; }

export function updateFx(dt) {
  shakeT = Math.max(0, shakeT - dt);
  let j = 0;
  for (const p of parts) {
    p.t += dt; if (p.t >= p.life) continue;
    const d = Math.pow(p.drag, dt * 60);
    p.vx *= d; p.vy = p.vy * d + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    parts[j++] = p;
  }
  parts.length = j;
  j = 0;
  for (const q of pops) { q.t += dt; if (q.t >= q.life) continue; q.y += q.vy * dt; q.vy *= Math.pow(0.96, dt * 60); pops[j++] = q; }
  pops.length = j;
}

export function drawFx(ctx) {
  for (const p of parts) {
    const k = 1 - p.t / p.life;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = p.color;
    const s = p.size;
    if (p.shape === "dot") { ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.5, 0, Math.PI * 2); ctx.fill(); continue; }
    if (p.shape === "smoke") { ctx.globalAlpha = k * 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, s * (0.6 + p.t * 2.5), 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    if (p.shape === "shard") { ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.65, s * 0.5); ctx.lineTo(-s * 0.5, s * 0.4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1; ctx.stroke(); }
    else if (p.shape === "confetti") { ctx.scale(Math.cos(p.rot * 2), 1); ctx.fillRect(-s / 2, -s / 4, s, s / 2); }
    else if (p.shape === "star") { starPath(ctx, 0, 0, s * 0.6); ctx.fill(); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const q of pops) {
    const k = q.t / q.life;
    const sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : 1.15 - Math.min(0.15, (k - 0.15) * 0.5);
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    if (q.emoji) { ctx.font = `${Math.round(q.size * sc)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(q.text, q.x, q.y); }
    else outlinedText(ctx, q.text, q.x, q.y, q.size * sc, q.color, q.stroke);
  }
  ctx.globalAlpha = 1;
}

export function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function outlinedText(ctx, text, x, y, size, fill = "#fff", stroke = "#222", lw) {
  ctx.font = `${Math.round(size)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  ctx.lineWidth = lw ?? Math.max(3, size * 0.16); ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
export function starPath(ctx, x, y, r, inner = 0.48, rot = 0) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = rot - Math.PI / 2 + k * Math.PI / 5, d = k % 2 ? r * inner : r;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16), f = amt < 0 ? 0 : 255, k = Math.abs(amt);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (f - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
