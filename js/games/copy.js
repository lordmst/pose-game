// 따라쟁이: 카드 속 자세를 0.6초 유지하면 성공, 2초 안에 해내면 2점
import { burst, popup, rr, outlinedText } from "../fx.js?v=52";
import { sfx } from "../audio.js?v=52";

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
];
for (const p of POSES) { p.svg = fig(p.f); p.img = new Image(); p.img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(p.svg); }
// 사람 관절 좌표가 이 자세와 맞는지
export const poseMatches = (pose, pts) => !!(pts && pose.need.every(i => pts[i].v) && pose.ok(measure(pts)));

export default {
  id: "copy", title: "따라쟁이", icon: "🙆", sec: 40, cursor: "", cat: "move", bg: "#b39ddb", desc: "그림 자세 따라하기",
  how: "카드 그림과 똑같은 자세를 잠깐 유지하면 성공! 2초 안에 하면 2점",
  create(env) {
    const z = env.zone, v = env.view;
    let cur = null, lastId = null, hold = 0, shown = 0, matched = false, flashT = 0, done = 0;
    function next() {
      const pool = POSES.filter(p => (!p.lower || env.tracker.lowerSeen) && p.id !== lastId);
      cur = pool[Math.floor(Math.random() * pool.length)]; lastId = cur.id; hold = 0; shown = 0;
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
          flashT = 0.3; done++; next();
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
        if (cur.img.complete) ctx.drawImage(cur.img, c.x + (c.w - iw) / 2, c.y + c.h * 0.06, iw, ih);
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
