// 가라사대: "가라사대"가 붙은 지시만 따라 하기. 없으면 움직이면 안 됨. 왼쪽·오른쪽 구분과 잘 듣기 연습
import { burst, popup, rr, outlinedText, FONT } from "../fx.js?v=66";
import { sfx } from "../audio.js?v=66";
import { POSES, poseMatches } from "./copy.js?v=66";

const ROUND = 4.4;      // 한 판(초): 지시를 듣고 따라 하는 시간 + 결과 보여 주는 시간
const ANSWER = 3.2;     // 따라 하는 시간(초, 보통)
const HOLD = 0.4;       // 자세를 이만큼 유지하면 '했다'로 인정
const TRAP_RATE = 0.32; // '가라사대' 없는 함정 지시 비율

const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sw = p => d(p[11], p[12]) || 1;
const vis = (p, ids) => ids.every(i => p[i].v);
const fromCopy = id => { const P = POSES.find(x => x.id === id); return p => poseMatches(P, p); };
// 왼쪽·오른쪽은 '내 몸' 기준 (화면은 거울처럼 보이므로 내 왼손이 화면 왼쪽에 보임)
// 자세끼리 겹치지 않게: 손이 머리보다 얼마나 높은지(above)와 두 손 간격으로 만세·하트·머리에 손을 구분
const above = (p, w) => (p[0].y - p[w].y) / sw(p);
const apart = p => d(p[15], p[16]) / sw(p);
export const COMMANDS = [
  { id: "up", text: "만세", check: p => fromCopy("up")(p) && above(p, 15) > 0.6 && above(p, 16) > 0.6 && apart(p) > 0.8 },
  { id: "wide", text: "양팔 벌리기", check: fromCopy("wide") },
  { id: "left", text: "왼손 들기", check: fromCopy("left") },
  { id: "right", text: "오른손 들기", check: fromCopy("right") },
  { id: "hips", text: "허리에 손", check: p => fromCopy("hips")(p) && apart(p) > 1.0 },
  { id: "heart", text: "머리 위 하트", check: p => fromCopy("heart")(p) && above(p, 15) > 0.45 && above(p, 16) > 0.45 },
  { id: "head", text: "머리에 두 손", check: p => vis(p, [0, 11, 12, 15, 16]) && d(p[15], p[0]) < sw(p) * 0.95 && d(p[16], p[0]) < sw(p) * 0.95 && p[15].y < p[11].y && p[16].y < p[12].y && above(p, 15) < 0.45 && above(p, 16) < 0.45 },
  { id: "shoulders", text: "어깨에 두 손", check: p => vis(p, [11, 12, 15, 16]) && d(p[15], p[11]) < sw(p) * 0.6 && d(p[16], p[12]) < sw(p) * 0.6 },
  { id: "crossL", text: "오른손으로 왼쪽 어깨", check: p => vis(p, [11, 12, 15, 16]) && d(p[16], p[11]) < sw(p) * 0.6 && d(p[15], p[11]) > sw(p) * 0.5 },
  { id: "crossR", text: "왼손으로 오른쪽 어깨", check: p => vis(p, [11, 12, 15, 16]) && d(p[15], p[12]) < sw(p) * 0.6 && d(p[16], p[12]) > sw(p) * 0.5 },
  // 하체 지시 (발까지 화면에 보일 때만 나옴)
  { id: "squat", text: "앉기", lower: true, check: fromCopy("squat") },
  { id: "lknee", text: "왼발 들기", lower: true, check: fromCopy("lknee") },
  { id: "rknee", text: "오른발 들기", lower: true, check: fromCopy("rknee") },
  { id: "jump", text: "제자리 뛰기", lower: true, jump: true, check: () => false },
  { id: "vup", text: "브이 자세", check: fromCopy("vup") },
  { id: "penguin", text: "펭귄 자세", check: fromCopy("penguin") },
  { id: "strong", text: "알통 자세", check: fromCopy("strong") },
  { id: "upwideL", text: "왼손은 위로, 오른손은 옆으로", check: fromCopy("upwideL") },
  { id: "upwideR", text: "오른손은 위로, 왼손은 옆으로", check: fromCopy("upwideR") },
  { id: "star", text: "별 자세", lower: true, check: fromCopy("star") },
  { id: "squatup", text: "앉아서 만세", lower: true, check: fromCopy("squatup") },
  { id: "craneL", text: "왼발 들고 만세", lower: true, check: fromCopy("craneL") },
  { id: "craneR", text: "오른발 들고 만세", lower: true, check: fromCopy("craneR") },
  { id: "clap", text: "가슴 앞에서 손 모으기", check: p => vis(p, [0, 15, 16, 23, 24]) && apart(p) < 0.5 && p[15].y > p[0].y && p[15].y < (p[23].y + p[24].y) / 2 },
];
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

// 2인이 같은 지시를 받도록 시작 시각·지시 목록을 함께 씀
let shared = null;
function sharedStart(lower = true) {
  if (!shared) shared = { t0: performance.now() / 1000 + 0.8, seed: 1 + Math.floor(Math.random() * 1e6), rounds: [], lower };
  return shared;
}
function roundAt(i) {
  const S = shared, list = COMMANDS.filter(c => S.lower || !c.lower), N = list.length;
  while (S.rounds.length <= i) {
    const k = S.rounds.length;
    let idx = Math.floor(hash(S.seed, k) * N);
    if (k > 0 && list[idx].id === S.rounds[k - 1].cmd.id) idx = (idx + 1) % N;   // 같은 지시 연속 금지
    S.rounds.push({ cmd: list[idx], says: k < 2 || hash(S.seed, k * 7 + 3) >= TRAP_RATE });   // 처음 두 번은 항상 '가라사대'
  }
  return S.rounds[i];
}

export default {
  id: "simon", title: "가라사대", icon: "🗣️", sec: 60, cursor: "", cat: "learn", bg: "#b5e48c", desc: "가라사대 붙은 말만 따라 하기",
  how: "'가라사대'가 붙은 지시만 따라 해요. '가라사대'가 없으면 움직이면 안 돼요! 왼쪽·오른쪽은 내 몸 기준",
  create(env) {
    const z = env.zone, v = env.view, answer = ANSWER * Math.max(0.75, Math.min(1.2, env.diff.poseTime));
    const ankleBase = [null, null, null]; let jumping = false;
    let cur = -1, matchT = 0, result = null, resultAt = 0, okN = 0, failN = 0, now = 0, R = null;
    function finish(kind, label) {
      result = kind; resultAt = now;
      const y = v.H * 0.6;
      if (kind === "good" || kind === "safe") {
        okN++; sfx.catch(env.player.combo); env.award(1, z.cx, y - v.U * 0.08);
        popup(z.cx, y, label, { size: v.U * 0.055, color: "#fff", stroke: "#2fb65a", life: 1.1 });
        burst(z.cx, y, { n: 20, colors: ["#ffd400", "#9dff7a", "#7ae0ff"], shape: "confetti", speed: v.U * 0.8, gravity: v.U, size: v.U * 0.015 });
      } else {
        failN++; sfx.bad(); env.miss(z.cx, y, label);
      }
    }
    return {
      update(dt = 1 / 60) {
        const S = sharedStart(!!env.tracker.lowerSeen);
        // 뛰기 판정: 두 발목이 '서 있을 때 높이'보다 함께 올라가면 (앉기·한 발 들기와 구별됨)
        const P = env.tracker.pts;
        jumping = false;
        if (P && [23, 24, 27, 28].every(i => P[i].v)) {
          const sw = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y) || 1, base = (k, y) => (ankleBase[k] = ankleBase[k] == null ? y : Math.max(y, ankleBase[k] - dt * sw * 0.08));
          const ys = [P[27].y, P[28].y, (P[23].y + P[24].y) / 2];
          ys.forEach((y, k) => base(k, y));
          jumping = ys.every((y, k) => ankleBase[k] - y > sw * (k < 2 ? 0.3 : 0.2));   // 두 발목과 엉덩이가 함께 떠야 뛰기
        }
        now = performance.now() / 1000;
        const el = now - S.t0;
        if (el < 0) return;
        const i = Math.floor(el / ROUND), tIn = el - i * ROUND;
        if (i !== cur) {   // 새 지시
          cur = i; matchT = 0; result = null; R = roundAt(i);
          if (env.slot === 0) env.speak(R.says ? `가라사대, ${R.cmd.text}!` : `${R.cmd.text}!`, "ko-KR");
        }
        if (result || tIn > answer) {
          if (!result && tIn > answer) { if (R.says) finish("late", "시간이 지났어요"); else finish("safe", "속지 않았어요!"); }
          return;
        }
        const pts = env.tracker.pts, ok = R.cmd.jump ? jumping : !!(pts && R.cmd.check(pts));
        matchT = ok ? matchT + dt : Math.max(0, matchT - dt);
        const need = R.cmd.jump ? 0.05 : HOLD * env.diff.hold;     // 뛰기는 한순간이면 됨
        if (R.says && matchT >= need) finish("good", "잘했어요!");
        if (!R.says && matchT >= (R.cmd.jump ? 0.05 : HOLD * 0.75)) finish("caught", "가라사대가 없었어요!");
      },
      draw(ctx) {
        const U = v.U, w = Math.min(z.w * 0.9, U * 0.95), h = U * 0.2, x = z.x0 + (z.w - w) / 2, y = v.H * 0.14;
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, x + 5, y + 7, w, h, h * 0.3); ctx.fill();
        const tint = result === "good" || result === "safe" ? "#d8ffe6" : result ? "#ffe0e0" : "#fff";
        ctx.fillStyle = tint; rr(ctx, x, y, w, h, h * 0.3); ctx.fill(); ctx.lineWidth = U * 0.01; ctx.strokeStyle = env.color; ctx.stroke();
        if (!R) { outlinedText(ctx, "잘 듣고 따라 해요!", x + w / 2, y + h / 2, h * 0.4, "#333", "#fff", 2); return; }
        // 두 줄: 윗줄 '가라사대,'(함정이면 비움) · 아랫줄 지시. 칸 너비에 맞춰 글자 크기 줄임
        const fit = (txt, size, maxW) => { ctx.font = `${Math.round(size)}px ${FONT}`; const mw = ctx.measureText(txt).width; return mw > maxW ? size * maxW / mw : size; };
        if (R.says) outlinedText(ctx, "가라사대,", x + w / 2, y + h * 0.27, fit("가라사대,", h * 0.27, w * 0.9), "#e0306a", "#fff", 2);
        const cmd = `${R.cmd.text}!`;
        outlinedText(ctx, cmd, x + w / 2, y + h * 0.66, fit(cmd, h * 0.36, w * 0.9), "#222", "#fff", 2);
        // 남은 시간
        const el = now - (shared ? shared.t0 : now), tIn = el - cur * ROUND, k = Math.max(0, 1 - tIn / answer);
        if (!result) { ctx.fillStyle = env.color; ctx.fillRect(x + h * 0.3, y + h - U * 0.012, (w - h * 0.6) * k, U * 0.008); }
        if (matchT > 0 && !result) { ctx.strokeStyle = "#2fd36b"; ctx.lineWidth = U * 0.012; ctx.beginPath(); ctx.arc(z.cx, v.H * 0.45, U * 0.06, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, matchT / (HOLD * env.diff.hold))); ctx.stroke(); }
        if (result) outlinedText(ctx, result === "good" || result === "safe" ? "⭕" : "❌", z.cx, v.H * 0.45, U * 0.12, "#fff", "#333", 2);
      },
      stop() { shared = null; },
      result: () => `맞힘 ${okN} · 틀림 ${failN}`,
      // 설명 시연용
      get round() { if (!shared || !R) return null; const el = now - shared.t0; return { i: cur, cmd: R.cmd, says: R.says, tIn: el - cur * ROUND, result }; },
      forceSays(i, says, cmdId) { sharedStart(true); const r = roundAt(i); r.says = says; if (cmdId) r.cmd = COMMANDS.find(c => c.id === cmdId) || r.cmd; },
    };
  },
};
