// 모은 아이템 착용: 카메라 화면 속 내 머리·얼굴·목에 씌우고, '친구' 아이템은 어깨 옆에서 따라다님
import { FONT } from "./fx.js?v=61";

// slot: head 머리 · face 얼굴 · neck 목 · pet 친구. s: 머리(또는 어깨) 너비에 대한 크기, up: 눈에서 위로 올리는 정도
export const WEAR = {
  cap: { slot: "head", s: 1.2, up: 0.78 }, tophat: { slot: "head", s: 1.3, up: 1.05 }, crown: { slot: "head", s: 1.0, up: 0.98 },
  ribbon: { slot: "head", s: 0.62, up: 0.78, side: 0.42 }, grad: { slot: "head", s: 1.25, up: 0.92 }, helmet: { slot: "head", s: 1.25, up: 0.72 },
  shades: { slot: "face", s: 1.05 }, goggles: { slot: "face", s: 1.05 },
  scarf: { slot: "neck", s: 0.5 }, medal: { slot: "neck", s: 0.4, chest: true },
  parrot: { slot: "pet", s: 0.55 }, butterfly: { slot: "pet", s: 0.45, fly: true }, unicorn: { slot: "pet", s: 0.6 }, bear: { slot: "pet", s: 0.55 },
  dino: { slot: "pet", s: 0.6 }, dolphin: { slot: "pet", s: 0.6, fly: true }, ufo: { slot: "pet", s: 0.6, fly: true }, rocket: { slot: "pet", s: 0.55, fly: true },
  balloon: { slot: "pet", s: 0.6, fly: true }, star: { slot: "pet", s: 0.45, fly: true }, owl: { slot: "pet", s: 0.55 }, dragon: { slot: "pet", s: 0.65, fly: true },
  fox: { slot: "pet", s: 0.55 }, penguin: { slot: "pet", s: 0.55 }, frog: { slot: "pet", s: 0.5 },
};
export const WEAR_SLOTS = [["head", "머리"], ["face", "얼굴"], ["neck", "목"], ["pet", "친구"]];
export const wearSlotOf = id => (WEAR[id] || {}).slot || null;

// 그림 글자(이모지)를 한 번만 그려 두고 크기만 바꿔 씀 (빠름)
const cache = new Map();
function glyph(icon) {
  let c = cache.get(icon);
  if (!c) {
    c = document.createElement("canvas"); c.width = c.height = 160;
    const g = c.getContext("2d"); g.font = `128px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(icon, 80, 88);
    cache.set(icon, c);
  }
  return c;
}
function put(ctx, icon, x, y, size, ang = 0, flip = false) {
  const c = glyph(icon), k = size / 128;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(c, -80 * k, -88 * k, 160 * k, 160 * k); ctx.restore();
}
const vis = (P, i) => P[i] && P[i].v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function headGeo(P) {
  if (!vis(P, 0)) return null;
  const sw = vis(P, 11) && vis(P, 12) ? dist(P[11], P[12]) : 0;
  let a = null, b = null, w = 0;
  if (vis(P, 7) && vis(P, 8)) { a = P[7]; b = P[8]; w = dist(a, b) * 1.08; }
  else if (vis(P, 2) && vis(P, 5)) { a = P[2]; b = P[5]; w = dist(a, b) * 2.5; }
  if (sw) w = Math.max(sw * 0.38, Math.min(sw * 0.8, w || sw * 0.55));
  if (!w) return null;
  let ang = 0;
  if (a && b) { if (b.x < a.x) [a, b] = [b, a]; ang = Math.max(-0.6, Math.min(0.6, Math.atan2(b.y - a.y, b.x - a.x))); }
  const eye = vis(P, 2) && vis(P, 5) ? { x: (P[2].x + P[5].x) / 2, y: (P[2].y + P[5].y) / 2 } : { x: P[0].x, y: P[0].y - w * 0.12 };
  return { x: eye.x, y: eye.y, w, ang, ux: Math.sin(ang), uy: -Math.cos(ang) };
}
// wear: { head, face, neck, pet } 아이템 id. st: 선수마다 하나 (친구 아이템 위치를 부드럽게 따라가게)
export function drawWear(ctx, P, wear, items, st, t, dt) {
  if (!P || !wear) return;
  const icon = id => (items(id) || {}).icon;
  const h = headGeo(P);
  const sh = vis(P, 11) && vis(P, 12) ? { x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2, w: dist(P[11], P[12]) } : null;
  if (sh && wear.neck && WEAR[wear.neck]) {
    const o = WEAR[wear.neck], ic = icon(wear.neck);
    if (ic) {
      if (o.chest) put(ctx, ic, sh.x, sh.y + sh.w * 0.42, sh.w * o.s);
      else if (vis(P, 0)) { const nx = P[0].x + (sh.x - P[0].x) * 0.9, ny = P[0].y + (sh.y - P[0].y) * 0.9; put(ctx, ic, nx, ny, sh.w * o.s); }
    }
  }
  if (h && wear.face && WEAR[wear.face]) { const ic = icon(wear.face); if (ic) put(ctx, ic, h.x, h.y + h.w * 0.02, h.w * WEAR[wear.face].s, h.ang); }
  if (h && wear.head && WEAR[wear.head]) {
    const o = WEAR[wear.head], ic = icon(wear.head);
    if (ic) {
      const side = o.side || 0, x = h.x + h.ux * h.w * o.up + Math.cos(h.ang) * h.w * side, y = h.y + h.uy * h.w * o.up + Math.sin(h.ang) * h.w * side;
      put(ctx, ic, x, y, h.w * o.s, h.ang);
    }
  }
  if (sh && wear.pet && WEAR[wear.pet]) {
    const o = WEAR[wear.pet], ic = icon(wear.pet);
    if (ic) {
      // 화면 왼쪽 어깨 위쪽 옆에서 따라다님
      const L = P[11].x < P[12].x ? P[11] : P[12];
      const tx = L.x - sh.w * 0.45, ty = L.y - sh.w * (o.fly ? 0.95 : 0.45);
      if (st.px == null || Math.hypot(st.px - tx, st.py - ty) > sh.w * 6) { st.px = tx; st.py = ty; }
      const k = Math.min(1, (dt || 0.016) * 4); st.px += (tx - st.px) * k; st.py += (ty - st.py) * k;
      const bob = Math.sin(t * (o.fly ? 3 : 5)) * sh.w * (o.fly ? 0.08 : 0.04);
      put(ctx, ic, st.px, st.py + bob, sh.w * o.s, Math.sin(t * 2) * 0.08);
    }
  }
}
