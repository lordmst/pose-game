// 파티클 · 점수 팝업 · 화면 흔들림 · 그리기 도우미
export const P1C = "#ff4d4d", P2C = "#3d8bff";
export const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

const parts = [], pops = [], rings = [];
let shakeT = 0, shakeDur = 1, shakeMag = 0;

export function burst(x, y, o = {}) {
  const n = o.n ?? 14, colors = o.colors || [o.color || "#fff"];
  // 큰 터짐에는 퍼지는 빛 고리 + 순간 번쩍 (smoke는 제외, ring: false로 끌 수 있음)
  if (o.ring !== false && n >= 8 && o.shape !== "smoke" && rings.length < 24)
    rings.push({ x, y, t: 0, life: 0.42, r0: (o.size ?? 8) * 1.2, r1: Math.max(36, (o.speed ?? 300) * 0.2), color: colors[0] });
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
export function clearFx() { parts.length = 0; pops.length = 0; rings.length = 0; shakeT = 0; }

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
  j = 0;
  for (const r of rings) { r.t += dt; if (r.t < r.life) rings[j++] = r; }
  rings.length = j;
}
// 빛 번짐 그림: 색마다 한 번만 만들어 두고 크기만 바꿔 씀
const glowCache = new Map();
function glowOf(color) {
  let c = glowCache.get(color);
  if (!c) {
    c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.9; g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    if (glowCache.size > 60) glowCache.clear();
    glowCache.set(color, c);
  }
  return c;
}
const HEX6 = /^#[0-9a-f]{6}$/i;

export function drawFx(ctx) {
  // 1) 빛: 고리·번쩍·파편 둘레 번짐 (밝게 더하기)
  if (rings.length || parts.length) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const r of rings) {
      const k = r.t / r.life, e = 1 - Math.pow(1 - k, 3), rad = r.r0 + (r.r1 - r.r0) * e;
      if (r.t < 0.14) { const f = 1 - r.t / 0.14, s = r.r1 * 0.9; ctx.globalAlpha = 0.55 * f; ctx.drawImage(glowOf("#ffffff"), r.x - s, r.y - s, s * 2, s * 2); }
      ctx.globalAlpha = 0.85 * (1 - k); ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(2, r.r1 * 0.09 * (1 - k));
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.6 * (1 - k); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, r.r1 * 0.03 * (1 - k));
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of parts) {
      if (p.shape === "smoke" || p.shape === "confetti") continue;
      const k = 1 - p.t / p.life, s = p.size * 1.5;
      ctx.globalAlpha = 0.5 * k; ctx.drawImage(glowOf(p.color), p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.restore();
  }
  // 2) 파편
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
    else {
      // 점수 글자: 그림자 + 위가 밝은 그러데이션 + 굵은 테두리
      const S = q.size * sc, fill = HEX6.test(q.color) ? (() => { const g = ctx.createLinearGradient(0, q.y - S * 0.5, 0, q.y + S * 0.5); g.addColorStop(0, shade(q.color, 0.55)); g.addColorStop(0.55, q.color); g.addColorStop(1, shade(q.color, -0.12)); return g; })() : q.color;
      const a = ctx.globalAlpha; ctx.globalAlpha = a * 0.35; outlinedText(ctx, q.text, q.x + S * 0.05, q.y + S * 0.08, S, "#000", "#000"); ctx.globalAlpha = a;
      outlinedText(ctx, q.text, q.x, q.y, S, fill, q.stroke, Math.max(4, S * 0.19));
    }
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
