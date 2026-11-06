// 패턴 이어 가기: 규칙대로 늘어선 그림·숫자의 마지막 "?"에 올 것을 골라 풍선을 터뜨리기
// 쉬움: AB 반복 · 보통: AAB·ABB·ABC·AABB 반복 · 어려움: 수 규칙(2씩·5씩·줄어들기)·ABCD·커지는 패턴
// 2인: 같은 문제를 동시에 풀고, 둘 다 맞히거나 시간이 지나면 함께 다음 문제로
import { burst, popup, rr, outlinedText, FONT, rnd, shuffle } from "../../fx.js?v=65";
import { sfx } from "../../audio.js?v=65";
import { drawBalloon } from "../math.js?v=65";

const DWELL = 0.25;          // 손을 풍선에 이만큼 대고 있으면 터짐 (숫자 풍선과 같음)
const ROUND_MAX = 14;        // 한 문제 최대 시간(초). 지나면 정답을 보여 주고 다음 문제
const NEXT_GAP = 1.3;        // 정답을 보여 준 뒤 다음 문제까지(초)
const BAL_COLORS = ["#ff8fd0", "#4da6ff", "#ffc233", "#a07bff", "#37d67a", "#ff9f43"];

// 그림 재료
const COLORS = [["#ff4d4d", "빨강"], ["#3d8bff", "파랑"], ["#ffd23f", "노랑"], ["#2fcf6a", "초록"], ["#a35bff", "보라"], ["#ff9a2e", "주황"]];
const SETS = [
  ["⭐", "❤️", "🔺", "🟦", "🌙"],
  ["🍎", "🍌", "🍇", "🍓", "🍊"],
  ["🐶", "🐱", "🐰", "🐻", "🐸"],
  ["🚗", "✈️", "🚀", "🚲", "⛵"],
];
const pickItems = n => {
  if (Math.random() < 0.4) return shuffle(COLORS.slice()).slice(0, n).map(([c, name]) => ({ kind: "color", c, name, key: c }));
  const set = SETS[rnd(0, SETS.length - 1)];
  return shuffle(set.slice()).slice(0, n).map(e => ({ kind: "emoji", e, key: e }));
};
const num = n => ({ kind: "num", n, key: "n" + n });

// 반복 규칙 하나로 문제 만들기: unit(예: [0,0,1]) 을 이어 붙이고 마지막을 "?"로
function repeatQ(unit, shown) {
  const kinds = Math.max(...unit) + 1, items = pickItems(Math.min(5, kinds + 1)), use = items.slice(0, kinds), extra = items[kinds];
  const seq = Array.from({ length: shown + 1 }, (_, i) => use[unit[i % unit.length]]);
  const ans = seq[shown];
  const wrong = shuffle([...use.filter(x => x !== ans), extra].filter(Boolean)).slice(0, 2);
  return { seq: seq.slice(0, shown), ans, choices: shuffle([ans, ...wrong]), speech: "다음에 올 것은 무엇일까요?" };
}
function numberQ() {
  const kinds = [
    () => { const s = rnd(1, 4), a = rnd(0, 6); return [a, a + s, a + 2 * s, a + 3 * s, a + 4 * s]; },          // 일정하게 커짐
    () => { const s = [2, 5, 10][rnd(0, 2)], a = s * rnd(0, 3); return [a, a + s, a + 2 * s, a + 3 * s, a + 4 * s]; },   // 2씩·5씩·10씩 뛰어 세기
    () => { const s = rnd(1, 3), a = rnd(4 * s + 1, 4 * s + 8); return [a, a - s, a - 2 * s, a - 3 * s, a - 4 * s]; },   // 줄어듦
    () => { const a = rnd(1, 3); return [a, a + 1, a + 3, a + 6, a + 10]; },                                  // 커지는 폭이 1씩 늘어남
  ];
  const v = kinds[rnd(0, kinds.length - 1)](), ans = v[4], step = Math.abs(v[4] - v[3]) || 1;
  const wrong = new Set();
  for (const w of shuffle([ans + 1, ans - 1, ans + step, ans - step, v[3], ans + 2])) { if (wrong.size >= 2) break; if (w !== ans && w >= 0) wrong.add(w); }
  return { seq: v.slice(0, 4).map(num), ans: num(ans), choices: shuffle([num(ans), ...[...wrong].map(num)]), speech: `${v.slice(0, 4).join(", ")}, 다음 수는?` };
}
// 커지는 패턴: 같은 그림이 한 개, 두 개, 세 개… 다음 묶음의 개수 (그림 묶음 대신 숫자로 고름)
function growQ() {
  const e = SETS[rnd(0, SETS.length - 1)][rnd(0, 4)], a = rnd(1, 2), s = rnd(1, 2);
  const counts = [a, a + s, a + 2 * s], ans = a + 3 * s;
  const wrong = shuffle([ans - 1, ans + 1, ans + s + 1, ans - s].filter(w => w > 0 && w !== ans)).slice(0, 2);
  return { seq: counts.map(n => ({ kind: "group", e, n, key: "g" + n })), ans: num(ans), choices: shuffle([num(ans), ...wrong.map(num)]), speech: "그림이 몇 개씩 늘어나요. 다음은 몇 개일까요?", grow: e };
}
export function makeQuestion(level) {
  if (level === "easy") return repeatQ([0, 1], rnd(5, 6));
  if (level === "hard") { const r = Math.random(); return r < 0.45 ? numberQ() : r < 0.7 ? growQ() : repeatQ(shuffle([[0, 1, 2, 3], [0, 0, 1, 2], [0, 1, 1, 2]])[0], 7); }
  return repeatQ(shuffle([[0, 0, 1], [0, 1, 1], [0, 1, 2], [0, 0, 1, 1]])[0], rnd(6, 7));
}

// 그림 하나 그리기 (크기 s = 칸 크기)
function drawItem(ctx, it, x, y, s, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (it.kind === "color") {
    ctx.fillStyle = it.c; ctx.beginPath(); ctx.arc(x, y, s * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.05); ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(x - s * 0.12, y - s * 0.12, s * 0.1, 0, Math.PI * 2); ctx.fill();
  } else if (it.kind === "emoji") {
    ctx.font = `${Math.round(s * 0.66)}px ${FONT}`; ctx.fillText(it.e, x, y + s * 0.03);
  } else if (it.kind === "group") {      // 같은 그림 n개를 작게 모아서
    const cols = Math.ceil(Math.sqrt(it.n)), rows = Math.ceil(it.n / cols), g = s * 0.8 / Math.max(cols, rows);
    ctx.font = `${Math.round(g * 0.9)}px ${FONT}`;
    for (let i = 0; i < it.n; i++) { const cx = i % cols, cy = Math.floor(i / cols); ctx.fillText(it.e, x + (cx - (cols - 1) / 2) * g, y + (cy - (rows - 1) / 2) * g); }
  } else outlinedText(ctx, String(it.n), x, y + s * 0.03, s * (String(it.n).length > 1 ? 0.5 : 0.62), "#222", "#fff", 2);
  ctx.restore();
}

// 2인이 같은 문제를 함께 풀도록 문제 목록과 진행을 공유
let shared = null;
function getShared(env) {
  if (!shared) shared = { qs: [], idx: 0, start: performance.now() / 1000 + 0.6, done: new Set(), nextAt: 0, n: env.mode || 1, level: env.diff.id };
  return shared;
}
const qAt = (S, i) => { while (S.qs.length <= i) S.qs.push(makeQuestion(S.level)); return S.qs[i]; };

export default {
  id: "pattern", title: "패턴 이어 가기", icon: "🔷", sec: 60, cursor: "✋", oneHand: true, cat: "learn", bg: "#bdb2ff", desc: "다음에 올 것 고르기",
  how: "그림이 규칙대로 늘어서 있어요. 마지막 ? 자리에 올 것을 찾아, 한 손을 활짝 펴서 그 풍선에 대요",
  create(env) {
    const z = env.zone, v = env.view;
    let cur = -1, q = null, balloons = [], lock = 0, t = 0, okN = 0, badN = 0, mine = false, shake = 0, fill = 0, revealed = false;
    const R = () => Math.min(z.w * 0.11, v.U * 0.095);
    const box = () => { const w = Math.min(z.w * 0.92, v.U * 1.25), h = Math.min(v.U * 0.17, w / 6); return { x: z.x0 + (z.w - w) / 2, y: v.H * 0.13, w, h }; };
    function load(i) {
      cur = i; q = qAt(shared, i); mine = false; fill = 0; revealed = false; lock = 0.5;
      const lanes = shuffle([0.2, 0.5, 0.8]);
      balloons = q.choices.map((it, k) => ({ it, fx: lanes[k], fy: 1.05 + k * 0.08, ty: 0.56 + (k % 2) * 0.06, ph: Math.random() * 6, color: BAL_COLORS[(k + rnd(0, 5)) % BAL_COLORS.length], dwell: 0, alive: true, hover: false, x: 0, y: 0 }));
      if (env.slot === 0) env.speak(q.speech);
    }
    function pop(b) {
      b.alive = false; sfx.pop(); lock = 0.6; balloons.forEach(o => { o.dwell = 0; });
      const r = R();
      if (b.it.key === q.ans.key) {
        mine = true; okN++; shared.done.add(env.slot);
        const first = env.mode === 2 && shared.done.size === 1;
        env.award(first ? 2 : 1, b.x, b.y - r * 0.4);
        if (first) popup(b.x, b.y + r * 0.5, "먼저 맞혔어요!", { size: v.U * 0.04, color: "#fff", stroke: "#e0306a" });
        setTimeout(() => sfx.catch(env.player.combo), 70);
        burst(b.x, b.y, { n: 34, colors: [b.color, "#fff", "#ffd400", "#7ae0ff"], shape: "confetti", speed: v.U * 1.0, gravity: v.U * 1.3, size: v.U * 0.016 });
      } else {
        badN++; shake = 0.45; sfx.bad(); env.miss(b.x, b.y - r * 0.4, "땡!");
        burst(b.x, b.y, { n: 12, color: "#c8c8c8", shape: "smoke", speed: v.U * 0.25, gravity: -v.U * 0.2, size: r * 0.5, life: 0.6 });
      }
    }
    return {
      update(dt) {
        t += dt; lock = Math.max(0, lock - dt); shake = Math.max(0, shake - dt);
        const S = getShared(env), now = performance.now() / 1000;
        if (now < S.start) return;
        if (S.idx !== cur) load(S.idx);
        // 다음 문제로: 모두 맞혔거나 시간이 지남 (먼저 확인한 쪽이 넘김)
        const el = now - (S.roundT ?? (S.roundT = now));
        if (!S.nextAt && (S.done.size >= S.n || el > ROUND_MAX)) S.nextAt = now + NEXT_GAP;
        if (S.nextAt && !revealed) { revealed = true; if (!mine) { sfx.bad(); popup(z.cx, v.H * 0.36, "정답은 이거예요", { size: v.U * 0.04, color: "#fff", stroke: "#555" }); } }
        if (S.nextAt && now >= S.nextAt) { S.idx++; S.done.clear(); S.nextAt = 0; S.roundT = now; }
        if (mine || revealed) fill = Math.min(1, fill + dt * 3);
        // 풍선: 아래에서 올라와 가운데쯤에서 둥실
        const r = R();
        for (const b of balloons) {
          if (!b.alive) continue;
          b.fy += (b.ty - b.fy) * Math.min(1, dt * 1.6);
          b.x = z.x0 + b.fx * z.w + Math.sin(t * 1.4 + b.ph) * r * 0.25; b.y = (b.fy + Math.sin(t * 1.9 + b.ph) * 0.012) * v.H;
        }
        const h = !mine && !revealed && lock === 0 ? env.tracker.activeHand : null;
        let target = null, bd = Infinity;
        if (h) for (const b of balloons) { if (!b.alive) continue; const d = Math.hypot(h.x - b.x, h.y - b.y); if (d < r * 1.1 && d < bd) { target = b; bd = d; } }
        for (const b of balloons) { b.hover = b === target; b.dwell = b.hover ? b.dwell + dt : Math.max(0, b.dwell - dt * 2); }
        if (target && target.dwell >= DWELL) pop(target);
      },
      draw(ctx) {
        if (!q) { const bx = box(); outlinedText(ctx, "규칙을 찾아요!", z.cx, bx.y + bx.h / 2, bx.h * 0.4, "#333", "#fff", 2); return; }
        const r = R(), done = mine || revealed;
        // 문제 줄: 그림들 + 마지막 ? 칸
        const bx = box(), n = q.seq.length + 1, jx = shake > 0 ? Math.sin(shake * 60) * v.U * 0.012 : 0;
        const cell = Math.min(bx.h * 0.95, (bx.w - bx.h * 0.3) / n);
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, bx.x + jx + 5, bx.y + 7, bx.w, bx.h, bx.h * 0.25); ctx.fill();
        ctx.fillStyle = mine ? "#d8ffe6" : shake > 0 ? "#ffe0e0" : "#fff"; rr(ctx, bx.x + jx, bx.y, bx.w, bx.h, bx.h * 0.25); ctx.fill();
        ctx.lineWidth = v.U * 0.008; ctx.strokeStyle = mine ? "#2fb65a" : shake > 0 ? "#e04040" : env.color; ctx.stroke();
        const x0 = bx.x + jx + (bx.w - cell * n) / 2 + cell / 2, cy = bx.y + bx.h / 2;
        q.seq.forEach((it, i) => drawItem(ctx, it, x0 + i * cell, cy, cell));
        const qx = x0 + (n - 1) * cell, pulse = 1 + Math.sin(t * 6) * 0.05;
        ctx.save(); ctx.setLineDash([cell * 0.08, cell * 0.06]); ctx.lineWidth = Math.max(2, cell * 0.05); ctx.strokeStyle = done ? "#2fb65a" : "#ff5a8a";
        rr(ctx, qx - cell * 0.44 * pulse, cy - cell * 0.44 * pulse, cell * 0.88 * pulse, cell * 0.88 * pulse, cell * 0.15); ctx.stroke(); ctx.restore();
        if (done) drawItem(ctx, q.ans, qx, cy, cell * (0.6 + 0.4 * fill), fill);     // 정답이 쏙 들어감
        else outlinedText(ctx, "?", qx, cy + cell * 0.03, cell * 0.62, "#ff5a8a", "#fff", 3);
        if (q.grow && !done) outlinedText(ctx, "몇 개?", qx, cy + cell * 0.62, cell * 0.24, "#555", "#fff", 2);
        // 풍선
        for (const b of balloons) {
          if (!b.alive) continue;
          const isColor = b.it.kind === "color";
          drawBalloon(ctx, b.x, b.y, r, isColor ? "#eef1f5" : b.color, "", done ? 0.35 : 1, b.hover);   // 색 문제는 풍선을 흰색으로 (헷갈리지 않게)
          drawItem(ctx, b.it, b.x, b.y, r * 1.35, done ? 0.35 : 1);
          if (b.dwell > 0 && !done) { ctx.strokeStyle = "#ffd400"; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.dwell / DWELL)); ctx.stroke(); }
        }
        if (!done) outlinedText(ctx, "? 에 올 것을 골라요", z.cx, bx.y + bx.h + v.U * 0.045, Math.min(v.U * 0.04, z.w / 12), "#fff", "#5a3fc0", 3);
        else if (mine && env.mode === 2 && shared && shared.done.size < shared.n) outlinedText(ctx, "정답! 친구를 기다려요", z.cx, bx.y + bx.h + v.U * 0.045, Math.min(v.U * 0.04, z.w / 12), "#fff", "#2fb65a", 3);
      },
      stop() { shared = null; },
      result: () => `정답 ${okN} · 틀림 ${badN}`,
      // 설명 시연·점검용
      get balloons() { return balloons; },
      get answerKey() { return q ? q.ans.key : null; },
      get phase() { return !q ? "wait" : mine || revealed ? "done" : "ask"; },
    };
  },
  demo: {
    dur: 22,
    run(T, g, p, S, say) {
      const u = p.u, bal = g.balloons.filter(b => b.alive), ok = bal.find(b => b.it.key === g.answerKey);
      const reachOk = b => { p.tcx = b.x - 0.7 * u; if (Math.abs(p.cx - p.tcx) < 0.3 * u) { p.active = 1; p.reach(1, b.x, b.y, 0.6); } else { p.active = -1; p.rest(1, "down"); } };
      switch (S.step || 0) {
        case 0: say("패턴 이어 가기! 그림이 규칙대로 늘어서 있어요"); p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.rest(0); p.rest(1);
          if (T > 3.2) S.step = 1; break;
        case 1: say("마지막 물음표에 올 것을 찾아, 편 손으로 그 풍선에 대요"); p.hands[1].shape = "open"; p.hands[0].shape = "closed"; p.rest(0, "guard");
          if (ok && g.phase === "ask") reachOk(ok); else { p.active = -1; p.rest(1, "down"); }
          if (g.phase === "done") { S.step = 2; S.t0 = T; S.n = (S.n || 0) + 1; } break;
        case 2: say(S.n > 1 ? "또 맞혔어요! 규칙을 찾으면 쉬워요" : "정답! 물음표 자리에 쏙 들어가요"); p.active = -1; p.rest(1, "cheer"); p.rest(0, "cheer");
          if (g.phase === "ask" && T - S.t0 > 1.2) S.step = S.n >= 2 ? 3 : 1;
          if (S.n >= 2 && T - S.t0 > 1.5) { S.step = 3; S.t0 = T; } break;
        case 3: say("이제 직접 해 봐요!"); p.rest(0, "cheer"); p.rest(1, "cheer"); if (T - S.t0 > 2) S.end = true; break;
      }
    },
  },
};
