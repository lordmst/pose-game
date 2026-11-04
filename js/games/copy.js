// 따라쟁이: 카드 속 자세를 0.6초 유지하면 성공, 2초 안에 해내면 2점
import { burst, popup, rr, outlinedText } from "../fx.js?v=63";
import { sfx } from "../audio.js?v=63";

const HOLD = 0.6;
const ang = (a, b, c) => {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / m))) * 180 / Math.PI;
};
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function measure(p) {
  return {
    p, sw: d(p[11], p[12]) || 1,
    lsh: ang(p[13], p[11], p[23]), rsh: ang(p[14], p[12], p[24]),   // 어깨 각도: 0 내림 · 90 수평 · 180 만세
    lel: ang(p[11], p[13], p[15]), rel: ang(p[12], p[14], p[16]),   // 팔꿈치: 180 쭉 폄
    lkn: ang(p[23], p[25], p[27]), rkn: ang(p[24], p[26], p[28]),
  };
}
// 정면에서 스쿼트하면 무릎 각도가 잘 안 변하므로, 허벅지가 짧아 보이는지(원근)도 함께 봄
const squatLeg = (m, h, k, a, kn) => kn < 120 || d(m.p[h], m.p[k]) < d(m.p[k], m.p[a]) * 0.62;

const ARMS = [11, 12, 13, 14, 15, 16, 23, 24];
const DOWN_L = [[84, 110], [78, 146]], DOWN_R = [[116, 110], [122, 146]];
const UP_L = [[72, 44], [64, 10]], UP_R = [[128, 44], [136, 10]];
const SIDE_L = [[60, 76], [22, 76]], SIDE_R = [[140, 76], [178, 76]];
const HIP_L = [[64, 100], [86, 126]], HIP_R = [[136, 100], [114, 126]];
const HEART_L = [[64, 46], [94, 6]], HEART_R = [[136, 46], [106, 6]];
const LEG_L = [[88, 168], [84, 208]], LEG_R = [[112, 168], [116, 208]];
const DIAGU_L = [[70, 50], [42, 22]], DIAGU_R = [[130, 50], [158, 22]];       // 비스듬히 위 (V)
const DIAGD_L = [[72, 102], [46, 126]], DIAGD_R = [[128, 102], [154, 126]];    // 비스듬히 아래 (펭귄)
const STRONG_L = [[62, 78], [60, 42]], STRONG_R = [[138, 78], [140, 42]];      // 알통 (팔꿈치 옆, 손 위로)
const HEAD_L = [[66, 50], [86, 18]], HEAD_R = [[134, 50], [114, 18]];          // 머리 위에 손
const WLEG_L = [[78, 168], [56, 208]], WLEG_R = [[122, 168], [144, 208]];      // 다리 벌리기
const KNEE_L = [[70, 140], [78, 178]], KNEE_R = [[130, 140], [122, 178]];
const SQ = { hip: [100, 140], ll: [[68, 164], [78, 208]], rl: [[132, 164], [122, 208]] };
const LOW = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const feetApart = m => m.p[27].v && m.p[28].v && d(m.p[27], m.p[28]) > m.sw * 1.7;
const straight = m => m.lel > 140 && m.rel > 140;

// 그림 좌표(200×220 상자): 머리 (100,40), 어깨 (100,76), 엉덩이 hip
export function figData({ la = DOWN_L, ra = DOWN_R, ll = LEG_L, rl = LEG_R, hip = [100, 130] } = {}) {
  const sh = [100, 76];
  return { head: [100, 40], neck: [100, 62], hip, lines: [[[100, 62], hip], [sh, ...la], [sh, ...ra], [hip, ...ll], [hip, ...rl]] };
}
function fig(o) {
  const { hip, la = DOWN_L, ra = DOWN_R, ll = LEG_L, rl = LEG_R } = { hip: [100, 130], ...o };
  const pl = pts => pts.map(p => p.join(",")).join(" "), sh = [100, 76];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="200" height="220">` +
    `<g fill="none" stroke="#2b2b2b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">` +
    `<line x1="100" y1="62" x2="${hip[0]}" y2="${hip[1]}"/>` +
    `<polyline points="${pl([sh, ...la])}"/><polyline points="${pl([sh, ...ra])}"/>` +
    `<polyline points="${pl([hip, ...ll])}"/><polyline points="${pl([hip, ...rl])}"/></g>` +
    `<circle cx="100" cy="40" r="22" fill="#ffd27f" stroke="#2b2b2b" stroke-width="10"/></svg>`;
}
// 화면은 거울처럼 보이므로 '왼손'은 그림에서도 왼쪽 팔
export const POSES = [
  { id: "up", name: "만세!", need: ARMS, f: ({ la: UP_L, ra: UP_R }), ok: m => m.lsh > 140 && m.rsh > 140 },
  { id: "wide", name: "양팔 벌리기", need: ARMS, f: ({ la: SIDE_L, ra: SIDE_R }), ok: m => m.lsh > 65 && m.lsh < 120 && m.rsh > 65 && m.rsh < 120 && m.lel > 140 && m.rel > 140 },
  { id: "left", name: "왼손 들기", need: ARMS, f: ({ la: UP_L }), ok: m => m.lsh > 140 && m.rsh < 55 },
  { id: "right", name: "오른손 들기", need: ARMS, f: ({ ra: UP_R }), ok: m => m.rsh > 140 && m.lsh < 55 },
  { id: "hips", name: "허리에 손", need: ARMS, f: ({ la: HIP_L, ra: HIP_R }), ok: m => m.lsh > 15 && m.lsh < 75 && m.rsh > 15 && m.rsh < 75 && m.lel < 125 && m.rel < 125 && d(m.p[15], m.p[23]) < m.sw * 1.1 && d(m.p[16], m.p[24]) < m.sw * 1.1 },
  { id: "heart", name: "머리 위 하트", need: [0, ...ARMS], f: ({ la: HEART_L, ra: HEART_R }), ok: m => m.p[15].y < m.p[0].y && m.p[16].y < m.p[0].y && d(m.p[15], m.p[16]) < m.sw * 0.9 && m.lel < 155 && m.rel < 155 },
  { id: "squat", name: "스쿼트!", lower: true, need: [23, 24, 25, 26, 27, 28], f: ({ la: SIDE_L, ra: SIDE_R, hip: [100, 140], ll: [[68, 164], [78, 208]], rl: [[132, 164], [122, 208]] }), ok: m => squatLeg(m, 23, 25, 27, m.lkn) && squatLeg(m, 24, 26, 28, m.rkn) },
  { id: "lknee", name: "왼무릎 들기", lower: true, need: [11, 12, 23, 24, 25, 26], f: ({ la: SIDE_L, ra: SIDE_R, ll: [[70, 140], [78, 178]] }), ok: m => m.p[25].y < m.p[26].y - m.sw * 0.5 },
  { id: "rknee", name: "오른무릎 들기", lower: true, need: [11, 12, 23, 24, 25, 26], f: ({ la: SIDE_L, ra: SIDE_R, rl: [[130, 140], [122, 178]] }), ok: m => m.p[26].y < m.p[25].y - m.sw * 0.5 },
  // 팔 자세 (더 다양하게)
  { id: "vup", name: "브이(V) 자세", need: ARMS, f: ({ la: DIAGU_L, ra: DIAGU_R }), ok: m => m.lsh > 108 && m.lsh < 165 && m.rsh > 108 && m.rsh < 165 && straight(m) },
  { id: "penguin", name: "펭귄 자세", need: ARMS, f: ({ la: DIAGD_L, ra: DIAGD_R }), ok: m => m.lsh > 18 && m.lsh < 62 && m.rsh > 18 && m.rsh < 62 && m.lel > 135 && m.rel > 135 && d(m.p[15], m.p[23]) > m.sw * 0.55 && d(m.p[16], m.p[24]) > m.sw * 0.55 },
  { id: "strong", name: "힘센 알통 자세", need: ARMS, f: ({ la: STRONG_L, ra: STRONG_R }), ok: m => m.lsh > 60 && m.lsh < 130 && m.rsh > 60 && m.rsh < 130 && m.lel > 40 && m.lel < 130 && m.rel > 40 && m.rel < 130 && m.p[15].y < m.p[13].y && m.p[16].y < m.p[14].y },
  { id: "handhead", name: "머리 위에 두 손", need: [0, ...ARMS], f: ({ la: HEAD_L, ra: HEAD_R }), ok: m => m.p[15].y < m.p[11].y - m.sw * 0.3 && m.p[16].y < m.p[12].y - m.sw * 0.3 && m.lel < 135 && m.rel < 135 && d(m.p[15], m.p[0]) < m.sw * 1.3 && d(m.p[16], m.p[0]) < m.sw * 1.3 },
  { id: "upwideL", name: "왼손 위 · 오른손 옆", need: ARMS, f: ({ la: UP_L, ra: SIDE_R }), ok: m => m.lsh > 140 && m.rsh > 65 && m.rsh < 120 && m.rel > 140 },
  { id: "upwideR", name: "오른손 위 · 왼손 옆", need: ARMS, f: ({ la: SIDE_L, ra: UP_R }), ok: m => m.rsh > 140 && m.lsh > 65 && m.lsh < 120 && m.lel > 140 },
  { id: "uphipL", name: "왼손 위 · 오른손 허리", need: ARMS, f: ({ la: UP_L, ra: HIP_R }), ok: m => m.lsh > 140 && m.rel < 125 && d(m.p[16], m.p[24]) < m.sw * 1.1 },
  { id: "uphipR", name: "오른손 위 · 왼손 허리", need: ARMS, f: ({ la: HIP_L, ra: UP_R }), ok: m => m.rsh > 140 && m.lel < 125 && d(m.p[15], m.p[23]) < m.sw * 1.1 },
  // 전신 자세 (발까지 보일 때)
  { id: "star", name: "별 자세", lower: true, need: LOW, f: ({ la: DIAGU_L, ra: DIAGU_R, ll: WLEG_L, rl: WLEG_R }), ok: m => m.lsh > 100 && m.lsh < 170 && m.rsh > 100 && m.rsh < 170 && feetApart(m) },
  { id: "widehips", name: "다리 벌리고 허리에 손", lower: true, need: LOW, f: ({ la: HIP_L, ra: HIP_R, ll: WLEG_L, rl: WLEG_R }), ok: m => m.lel < 125 && m.rel < 125 && d(m.p[15], m.p[23]) < m.sw * 1.1 && d(m.p[16], m.p[24]) < m.sw * 1.1 && feetApart(m) },
  { id: "squatup", name: "앉아서 만세", lower: true, need: LOW, f: ({ la: UP_L, ra: UP_R, ...SQ }), ok: m => m.lsh > 130 && m.rsh > 130 && squatLeg(m, 23, 25, 27, m.lkn) && squatLeg(m, 24, 26, 28, m.rkn) },
  { id: "craneL", name: "왼무릎 들고 만세", lower: true, need: [11, 12, 13, 14, 15, 16, 23, 24, 25, 26], f: ({ la: UP_L, ra: UP_R, ll: KNEE_L }), ok: m => m.lsh > 130 && m.rsh > 130 && m.p[25].y < m.p[26].y - m.sw * 0.5 },
  { id: "craneR", name: "오른무릎 들고 만세", lower: true, need: [11, 12, 13, 14, 15, 16, 23, 24, 25, 26], f: ({ la: UP_L, ra: UP_R, rl: KNEE_R }), ok: m => m.lsh > 130 && m.rsh > 130 && m.p[26].y < m.p[25].y - m.sw * 0.5 },
];
for (const p of POSES) { p.svg = fig(p.f); p.img = new Image(); p.img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(p.svg); }
/* ---------- 자세 그림 (캔버스) + 팔다리별 맞음 표시 ----------
   limbHints: 내 팔다리 방향을 그림의 팔다리 방향과 비교 (몸통 기준 각도) → [왼팔, 오른팔, 왼다리, 오른다리] 맞음 여부
   맞는 팔다리는 초록, 아직인 팔다리는 노랗게 깜빡여서 '어디를 고치면 되는지' 바로 보이게 */
const angOf = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const angDiff = (a, b) => { let x = Math.abs(a - b) % (Math.PI * 2); return x > Math.PI ? Math.PI * 2 - x : x; };
export function limbHints(pose, pts) {
  if (!pts || pose.tilt || ![11, 12].every(i => pts[i].v)) return [null, null, null, null];   // 기울이기는 몸통 방향이 달라 팔다리 표시를 하지 않음
  const f = figData(pose.f), a = (pose.tilt || 0) * Math.PI / 180;
  const rot = ([x, y]) => { const [hx, hy] = f.hip; return [hx + (x - hx) * Math.cos(a) - (y - hy) * Math.sin(a), hy + (x - hx) * Math.sin(a) + (y - hy) * Math.cos(a)]; };
  const hipOk = pts[23].v && pts[24].v;
  const shm = { x: (pts[11].x + pts[12].x) / 2, y: (pts[11].y + pts[12].y) / 2 }, hpm = hipOk ? { x: (pts[23].x + pts[24].x) / 2, y: (pts[23].y + pts[24].y) / 2 } : { x: shm.x, y: shm.y + 1 };
  const bodyA = angOf(shm.x, shm.y, hpm.x, hpm.y), [nx, ny] = rot(f.neck), [hx, hy] = f.hip, figA = angOf(nx, ny, hx, hy);
  const seg = (line, upper, j0, j1, j2, tol) => {
    if (![j0, j1, j2].every(i => pts[i].v)) return null;
    const P = upper ? line.map(rot) : line;
    const okSeg = (p0, p1, q0, q1) => angDiff(angOf(p0[0], p0[1], p1[0], p1[1]) - (upper ? figA : 0), angOf(q0.x, q0.y, q1.x, q1.y) - (upper ? bodyA : 0)) < tol;
    return okSeg(P[0], P[1], pts[j0], pts[j1]) && okSeg(P[1], P[2], pts[j1], pts[j2]);
  };
  const T = 0.75;   // 약 43도 (넉넉하게: 판정은 자세 규칙으로 따로 함)
  return [seg(f.lines[1], true, 11, 13, 15, T), seg(f.lines[2], true, 12, 14, 16, T), pose.lower ? seg(f.lines[3], false, 23, 25, 27, T) : null, pose.lower ? seg(f.lines[4], false, 24, 26, 28, T) : null];
}
// 자세 그림: 굵은 만화 팔다리. hints가 있으면 팔다리마다 초록(맞음)/노랑(고칠 곳), all: 전체 맞음
export function drawPoseFig(ctx, pose, x, y, w, h, { hints = null, all = false, t = 0, ink = "#2b2b2b", skin = "#ffd27f" } = {}) {
  const f = figData(pose.f), k = Math.min(w / 200, h / 220), ox = x + (w - 200 * k) / 2, oy = y + (h - 220 * k) / 2;
  const a = (pose.tilt || 0) * Math.PI / 180, [hx0, hy0] = f.hip;
  const rot = ([px, py]) => [hx0 + (px - hx0) * Math.cos(a) - (py - hy0) * Math.sin(a), hy0 + (px - hx0) * Math.sin(a) + (py - hy0) * Math.cos(a)];
  const P = (p, up) => { const [rx, ry] = up ? rot(p) : p; return [ox + rx * k, oy + ry * k]; };
  const blink = 0.55 + 0.45 * Math.sin(t * 9);
  const colOf = li => {
    if (all) return "#22b455";
    const hi = hints && hints[[-1, 0, 1, 2, 3][li]];
    if (li === 0 || hi == null) return ink;
    return hi ? "#22b455" : `rgba(255,${Math.round(150 + 60 * blink)},0,1)`;
  };
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  f.lines.forEach((line, li) => {
    const path = () => { ctx.beginPath(); line.forEach((p, i) => { const [px, py] = P(p, li < 3); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); };
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 22 * k; path(); ctx.stroke();      // 흰 테두리 (어두운 화면 위에서도 잘 보이게)
    ctx.strokeStyle = colOf(li); ctx.lineWidth = 14 * k; path(); ctx.stroke();
    const end = P(line[line.length - 1], li < 3);                                   // 손·발 끝 동그라미
    if (li > 0) { ctx.fillStyle = colOf(li); ctx.beginPath(); ctx.arc(end[0], end[1], 9 * k, 0, Math.PI * 2); ctx.fill(); }
  });
  const [hx, hy] = P(f.head, true);
  ctx.fillStyle = skin; ctx.strokeStyle = all ? "#22b455" : ink; ctx.lineWidth = 9 * k; ctx.beginPath(); ctx.arc(hx, hy, 22 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + s * 7 * k, hy - 2 * k, 2.6 * k, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = ink; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.arc(hx, hy + 4 * k, 7 * k, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.restore();
}
// 사람 관절 좌표가 이 자세와 맞는지
export const poseMatches = (pose, pts) => !!(pts && pose.need.every(i => pts[i].v) && pose.ok(measure(pts)));

export default {
  id: "copy", title: "따라쟁이", icon: "🙆", sec: 40, cursor: "", cat: "move", bg: "#b39ddb", desc: "그림 자세 따라하기",
  how: "카드 그림과 똑같은 자세를 잠깐 유지하면 성공! 2초 안에 하면 2점",
  create(env) {
    const z = env.zone, v = env.view;
    let cur = null, lastId = null, hold = 0, shown = 0, matched = false, flashT = 0, done = 0;
    const rand = env.rand || Math.random;   // 협동: 두 선수가 같은 순서의 카드를 받음
    function next() {
      const pool = POSES.filter(p => (!p.lower || env.tracker.lowerSeen) && p.id !== lastId);
      cur = pool[Math.floor(rand() * pool.length)]; lastId = cur.id; hold = 0; shown = 0;
    }
    next();
    const card = () => {
      const w = Math.min(z.w * 0.36, v.U * 0.3), h = w * 1.2;
      const x = env.slot === 1 ? z.x1 - w - v.U * 0.03 : z.x0 + v.U * 0.03;
      return { x, y: v.H * 0.55 - h / 2, w, h };
    };
    return {
      update(dt) {
        shown += dt; flashT = Math.max(0, flashT - dt);
        const pts = env.tracker.pts;
        matched = poseMatches(cur, pts);
        hold = matched ? hold + dt : Math.max(0, hold - dt * 1.5);
        const c = card(), cx = c.x + c.w / 2;
        if (hold >= HOLD * env.diff.hold) {
          const fast = shown < 2.0 * env.diff.poseTime;
          env.award(fast ? 2 : 1, cx, c.y - v.U * 0.03);
          if (fast) popup(cx, c.y + c.h + v.U * 0.06, "빨라요!", { size: v.U * 0.045, color: "#fff", stroke: "#e0306a" });
          sfx.catch(env.player.combo);
          burst(cx, c.y + c.h / 2, { n: 30, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 0.9, gravity: v.U * 1.2, size: v.U * 0.016 });
          flashT = 0.3; done++; if (env.together) env.together("copy" + done, cx, c.y); next();
        } else if (shown > (7 - 3 * env.progress()) * env.diff.poseTime) {
          env.miss(cx, c.y - v.U * 0.03, "다음 자세!"); next();
        }
      },
      draw(ctx) {
        const c = card(), r = v.U * 0.03, limit = (7 - 3 * env.progress()) * env.diff.poseTime;
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, c.x + 6, c.y + 8, c.w, c.h, r); ctx.fill();
        ctx.fillStyle = flashT > 0 ? "#fff6c8" : "#fff"; rr(ctx, c.x, c.y, c.w, c.h, r); ctx.fill();
        ctx.lineWidth = v.U * 0.012; ctx.strokeStyle = matched ? "#2fd36b" : env.color; ctx.stroke();
        const iw = c.w * 0.78, ih = iw * 1.1;
        drawPoseFig(ctx, cur, c.x + (c.w - iw) / 2, c.y + c.h * 0.06, iw, ih, { hints: limbHints(cur, env.tracker.pts), all: matched, t: shown });
        outlinedText(ctx, cur.name, c.x + c.w / 2, c.y + c.h * 0.9, c.w * 0.12, "#333", "#fff");
        // 남은 시간(카드 위쪽 가는 막대)
        ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.fillRect(c.x + r, c.y + v.U * 0.008, c.w - r * 2, v.U * 0.01);
        ctx.fillStyle = env.color; ctx.fillRect(c.x + r, c.y + v.U * 0.008, (c.w - r * 2) * Math.max(0, 1 - shown / limit), v.U * 0.01);
        // 자세 유지 게이지(카드 아래)
        const by = c.y + c.h + v.U * 0.015, bh = v.U * 0.028;
        ctx.fillStyle = "rgba(255,255,255,.85)"; rr(ctx, c.x, by, c.w, bh, bh / 2); ctx.fill();
        if (hold > 0) { ctx.fillStyle = "#2fd36b"; rr(ctx, c.x, by, c.w * Math.min(1, hold / (HOLD * env.diff.hold)), bh, bh / 2); ctx.fill(); }
      },
      result: () => `성공한 자세 ${done}개`,
      get current() { return cur.id; },   // 설명 시연용
    };
  },
};
