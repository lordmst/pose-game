// 수학 풍선: 정답이 적힌 풍선을 손으로 터뜨리기 (손을 잠깐 대거나 빠르게 치면 터짐)
import { burst, popup, rr, outlinedText, shade, rnd, shuffle } from "../fx.js?v=12";
import { sfx } from "../audio.js?v=12";

export const LEVELS = { add10: "덧셈 (10까지)", addsub20: "덧셈·뺄셈 (20까지)", mul: "구구단", mix: "사칙 혼합" };
const OPS = { add10: ["+"], addsub20: ["+", "-"], mul: ["×"], mix: ["+", "-", "×", "÷"] };
const READ = { "+": "더하기", "-": "빼기", "×": "곱하기", "÷": "나누기" };
const COLORS = ["#ff5a5a", "#4da6ff", "#ffc233", "#a07bff", "#37d67a", "#ff8fd0"];
const DWELL = 0.25;          // 손을 풍선에 이만큼 대고 있으면 터짐
const AFTER_POP_LOCK = 0.6; // 하나 터진 뒤 다른 풍선이 바로 이어서 터지지 않게 잠깐 멈춤
const RISE_START = 0.12;   // 시작할 때 상승 속도 (초당 화면 높이 비율) — 화면 아래→위 약 8초
const RISE_END = 0.2;      // 끝날 무렵 속도 — 약 5초
const josa = n => [0, 1, 3, 6, 7, 8].includes(n % 10) ? "은" : "는";   // 영·일·삼·육·칠·팔 → 은

export function makeProblem(level) {
  const ops = OPS[level] || OPS.add10, op = ops[rnd(0, ops.length - 1)];
  let a, b, ans;
  if (op === "+") { const max = level === "add10" ? 10 : 20; a = rnd(1, max - 1); b = rnd(1, max - a); ans = a + b; }
  else if (op === "-") { a = rnd(3, 20); b = rnd(1, a - 1); ans = a - b; }
  else if (op === "×") { a = rnd(2, 9); b = rnd(2, 9); ans = a * b; }
  else { b = rnd(2, 9); ans = rnd(2, 9); a = b * ans; }
  // 오답: 아이들이 자주 하는 실수(연산 혼동, 한 단 차이)를 섞음
  const trap = op === "×" ? [a * (b + 1), a * (b - 1), a + b] : op === "-" ? [a + b] : op === "+" ? [Math.abs(a - b)] : [ans + b];
  const pick = new Set();
  const t = shuffle(trap.filter(w => w !== ans && w >= 0));
  if (t.length && Math.random() < 0.6) pick.add(t[0]);
  for (const w of shuffle([ans + 1, ans - 1, ans + 2, ans - 2, ans + 3])) { if (pick.size >= 2) break; if (w !== ans && w >= 0) pick.add(w); }
  return { ans, text: `${a} ${op} ${b} = ?`, speech: `${a} ${READ[op]} ${b}${josa(b)}?`, choices: shuffle([ans, ...pick]) };
}

function drawBalloon(ctx, x, y, r, color, val, alpha, hover) {
  ctx.save(); ctx.globalAlpha = alpha;
  const s = hover ? 1.08 : 1;
  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = Math.max(2, r * 0.04);
  ctx.beginPath(); ctx.moveTo(x, y + r * 1.05); ctx.bezierCurveTo(x + r * 0.3, y + r * 1.5, x - r * 0.3, y + r * 1.9, x + r * 0.1, y + r * 2.4); ctx.stroke();
  ctx.fillStyle = shade(color, -0.2);
  ctx.beginPath(); ctx.moveTo(x, y + r * 0.95); ctx.lineTo(x - r * 0.13, y + r * 1.13); ctx.lineTo(x + r * 0.13, y + r * 1.13); ctx.closePath(); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.1);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.28, color); g.addColorStop(0.85, color); g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 0.9 * s, r * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.05); ctx.strokeStyle = shade(color, -0.45); ctx.stroke();
  outlinedText(ctx, String(val), x, y + r * 0.05, r * (String(val).length > 2 ? 0.75 : 0.95), "#fff", "#222");
  ctx.restore();
}

export default {
  id: "math", title: "수학 풍선", icon: "🎈", sec: 60, cursor: "👊", oneHand: true,
  how: "문제의 정답이 적힌 풍선을 손으로 터뜨려요. 틀린 풍선은 조심!",
  create(env) {
    const z = env.zone, v = env.view;
    let prob = null, balloons = [], phase = "ask", doneT = 0, lock = 0, tAll = 0, boxBad = 0, boxOk = false, needSpeak = false, correct = 0, wrong = 0;
    const R = () => Math.min(z.w * 0.11, v.U * 0.095);
    const box = () => { const w = Math.min(z.w * 0.82, v.U * 0.8), h = v.U * 0.13; return { x: z.x0 + (z.w - w) / 2, y: v.H * 0.15, w, h }; };
    function next() {
      prob = makeProblem(env.level);
      const lanes = shuffle([0.2, 0.5, 0.8]);
      balloons = prob.choices.map((val, i) => ({ val, fx: lanes[i], fy: 0.98 + i * 0.07, ph: Math.random() * 6, color: COLORS[(i + rnd(0, 5)) % COLORS.length], dwell: 0, alive: true, hover: false, x: 0, y: 0 }));
      phase = "ask"; boxOk = false; lock = 0.4; needSpeak = true;
    }
    function pop(b) {
      b.alive = false; sfx.pop(); lock = AFTER_POP_LOCK;
      balloons.forEach(o => { o.dwell = 0; });
      const r = R();
      if (b.val === prob.ans) {
        phase = "done"; doneT = 0.85; boxOk = true; correct++;
        env.award(1, b.x, b.y - r * 0.4);
        setTimeout(() => sfx.catch(env.player.combo), 70);
        burst(b.x, b.y, { n: 34, colors: [b.color, "#fff", "#ffd400", "#7ae0ff"], shape: "confetti", speed: v.U * 1.0, gravity: v.U * 1.3, size: v.U * 0.016 });
      } else {
        wrong++; boxBad = 0.45; sfx.bad();
        env.miss(b.x, b.y - r * 0.4, "땡!");
        burst(b.x, b.y, { n: 12, color: "#c8c8c8", shape: "smoke", speed: v.U * 0.25, gravity: -v.U * 0.2, size: r * 0.5, life: 0.6 });
      }
    }
    next();
    return {
      update(dt) {
        tAll += dt; lock = Math.max(0, lock - dt); boxBad = Math.max(0, boxBad - dt);
        if (needSpeak) { env.speak(prob.speech); needSpeak = false; }
        if (phase === "done") { doneT -= dt; if (doneT <= 0) next(); }
        const rise = (RISE_START + (RISE_END - RISE_START) * env.progress()) * env.diff.speed * (env.fever() ? 1.15 : 1), r = R();
        for (const b of balloons) {
          if (!b.alive) continue;
          b.fy -= rise * dt; if (b.fy < -0.15) b.fy = 1.1;
          b.x = z.x0 + b.fx * z.w + Math.sin(tAll * 1.6 + b.ph) * r * 0.3; b.y = b.fy * v.H;
        }
        // 들어 올린 '한 손'만 쓰고, 그 손에 가장 가까운 풍선 하나만 선택 대상
        const h = phase === "ask" && lock === 0 ? env.tracker.activeHand : null;
        let target = null, bd = Infinity;
        if (h) for (const b of balloons) {
          if (!b.alive) continue;
          const d = Math.hypot(h.x - b.x, h.y - b.y);
          if (d < r * 1.1 && d < bd) { target = b; bd = d; }
        }
        for (const b of balloons) {
          b.hover = b === target;
          b.dwell = b.hover ? b.dwell + dt : Math.max(0, b.dwell - dt * 2);
        }
        if (target && (target.dwell >= DWELL || h.bodySpeed > 4)) pop(target);   // 프레임마다 최대 하나만 터짐
      },
      draw(ctx) {
        const r = R();
        for (const b of balloons) {
          if (!b.alive) continue;
          drawBalloon(ctx, b.x, b.y, r, b.color, b.val, phase === "ask" ? 1 : 0.35, b.hover);
          if (b.dwell > 0 && phase === "ask") { ctx.strokeStyle = "#ffd400"; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.dwell / DWELL)); ctx.stroke(); }
        }
        const bx = box(), jx = boxBad > 0 ? Math.sin(boxBad * 60) * v.U * 0.012 : 0;
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, bx.x + jx + 5, bx.y + 7, bx.w, bx.h, bx.h * 0.3); ctx.fill();
        ctx.fillStyle = boxOk ? "#d8ffe6" : boxBad > 0 ? "#ffe0e0" : "#fff"; rr(ctx, bx.x + jx, bx.y, bx.w, bx.h, bx.h * 0.3); ctx.fill();
        ctx.lineWidth = v.U * 0.01; ctx.strokeStyle = boxOk ? "#2fb65a" : boxBad > 0 ? "#e04040" : env.color; ctx.stroke();
        const txt = boxOk ? prob.text.replace("?", prob.ans) : prob.text;
        outlinedText(ctx, txt, bx.x + jx + bx.w / 2, bx.y + bx.h * 0.54, Math.min(bx.h * 0.62, bx.w / (txt.length * 0.55)), "#222", "#fff", 2);
      },
      result: () => `정답 ${correct} · 틀림 ${wrong}`,
      get balloons() { return balloons; },   // 점검용
    };
  },
};
