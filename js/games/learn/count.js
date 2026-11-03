// 수 세기 점프: 화면의 물건 개수만큼 제자리 뛰기 (발이 안 보이면 박수)
// 뛸 때마다 큰 숫자가 올라가고 물건이 하나씩 빛남. 개수와 같아진 뒤 1초 쉬면 정답. 어려움은 덧셈(🍎 3 + 🍎 2)
// 2인은 같은 문제를 같은 때에 받고 각자 셈
import { burst, popup, outlinedText, rr, FONT } from "../../fx.js?v=52";
import { sfx } from "../../audio.js?v=52";

const STILL = 1.0;     // 개수를 맞춘 뒤 이만큼(초) 멈추면 정답
const SHOW = 1.6;      // 결과를 보여 주는 시간(초)
const GAP = 0.28;      // 뛰기·박수 사이 최소 간격(초)
const OBJS = [["🍎", "사과"], ["⭐", "별"], ["🐟", "물고기"], ["🎈", "풍선"], ["🐥", "병아리"], ["🍓", "딸기"], ["🚗", "자동차"], ["🌸", "꽃"], ["🐶", "강아지"], ["🍪", "쿠키"]];
const subj = w => { const c = w.slice(-1).charCodeAt(0) - 0xac00; return w + (c >= 0 && c < 11172 && c % 28 ? "이" : "가"); };
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

// 2인이 같은 문제를 받도록 시작 시각·문제 목록을 함께 씀
let shared = null;
function sharedStart(level) {
  if (!shared) shared = { t0: performance.now() / 1000 + 1.0, seed: 1 + Math.floor(Math.random() * 1e6), rounds: [], level };
  return shared;
}
function roundAt(i) {
  const S = shared;
  while (S.rounds.length <= i) {
    const k = S.rounds.length, h = r => hash(S.seed, k * 11 + r), prev = S.rounds[k - 1];
    const obj = OBJS[Math.floor(h(1) * OBJS.length)];
    let a, b = 0;
    if (S.level === "hard") { a = 1 + Math.floor(h(2) * 5); b = 1 + Math.floor(h(3) * 4); }
    else { const max = S.level === "easy" ? 5 : 10; a = 1 + Math.floor(h(2) * max); if (prev && prev.n === a) a = a % max + 1; }
    const n = a + b, start = prev ? prev.start + prev.dur : S.t0;
    S.rounds.push({ obj, a, b, n, start, win: 3.2 + n * 0.75, dur: 3.2 + n * 0.75 + SHOW });
  }
  return S.rounds[i];
}

export default {
  id: "count", title: "수 세기 점프", icon: "🦘", sec: 60, cursor: "", cat: "learn", bg: "#9bf6ff", desc: "개수만큼 깡충",
  how: "화면의 물건을 세고, 그 개수만큼 제자리에서 깡충 뛰어요. 발이 안 보이면 박수! 다 뛰고 1초 쉬면 정답이에요",
  create(env) {
    const z = env.zone, v = env.view;
    const level = env.diff.id === "easy" ? "easy" : env.diff.id === "hard" ? "hard" : "normal";
    let cur = -1, R = null, cnt = 0, lastHit = -9, result = null, now = 0, ok = 0, bad = 0, flash = 0;
    const base = [null, null, null];
    let up = false, clapIn = false, lower = true;
    // 뛰기: 두 발목과 엉덩이가 함께 '서 있을 때 높이'보다 올라가면 (가라사대와 같은 방식)
    function jumping(P, dt) {
      const sw = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y) || 1;
      const ys = [P[27].y, P[28].y, (P[23].y + P[24].y) / 2];
      ys.forEach((y, k) => { base[k] = base[k] == null ? y : Math.max(y, base[k] - dt * sw * 0.08); });
      return ys.every((y, k) => base[k] - y > sw * (k < 2 ? 0.3 : 0.2));
    }
    // 박수: 두 손목이 가슴 앞에서 붙음 (벌렸다가 다시 붙어야 한 번)
    function clapping(P) {
      const sw = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y) || 1, d = Math.hypot(P[15].x - P[16].x, P[15].y - P[16].y) / sw;
      const hipY = P[23].v && P[24].v ? (P[23].y + P[24].y) / 2 : P[11].y + sw * 1.6;
      const chest = P[15].y > P[0].y && P[15].y < hipY && P[16].y > P[0].y && P[16].y < hipY;
      if (clapIn && d > 0.9) clapIn = false;
      if (!clapIn && d < 0.45 && chest) { clapIn = true; return true; }
      return false;
    }
    function hit() {
      cnt++; lastHit = now; flash = 1; sfx.step(cnt % 2);
      if (cnt > R.n) finish(false, "너무 많아요!");
    }
    function finish(good, label) {
      result = good ? "good" : "bad";
      const y = v.H * 0.62;
      if (good) {
        ok++; sfx.catch(env.player.combo); env.award(R.b ? 2 : 1, z.cx, y - v.U * 0.08);
        popup(z.cx, y, `${R.n}! 정답!`, { size: v.U * 0.06, color: "#fff", stroke: "#2fb65a", life: 1.2 });
        burst(z.cx, y, { n: 24, colors: ["#ffd400", "#9dff7a", "#7ae0ff", "#ff7aa2"], shape: "confetti", speed: v.U * 0.8, gravity: v.U, size: v.U * 0.015 });
      } else { bad++; sfx.bad(); env.miss(z.cx, y, label); popup(z.cx, y + v.U * 0.07, `정답은 ${R.n}`, { size: v.U * 0.04, color: "#fff", stroke: "#555", life: 1.4 }); }
    }
    return {
      update(dt = 1 / 60) {
        const S = sharedStart(level);
        now = performance.now() / 1000; flash = Math.max(0, flash - dt * 3);
        const P = env.tracker.pts;
        if (P && P[11].v && P[12].v) {
          lower = [23, 24, 27, 28].every(i => P[i].v);
          if (lower) { const j = jumping(P, dt); if (j && !up && now - lastHit > GAP && R && !result && now >= R.start) hit(); up = j; }
          else if (P[0].v && P[15].v && P[16].v && clapping(P) && now - lastHit > GAP && R && !result && now >= R.start) hit();
        }
        if (now < S.t0) return;
        // 지금 몇 번째 문제인지
        let i = Math.max(0, cur);
        while (roundAt(i).start + roundAt(i).dur <= now) i++;
        if (i !== cur) {
          cur = i; R = roundAt(i); cnt = 0; result = null; lastHit = now;
          if (env.slot === 0) env.speak(R.b ? `${R.obj[1]} ${R.a}개 더하기 ${R.b}개는? 모두 몇 개만큼 뛰어요!` : `${subj(R.obj[1])} 몇 개일까요? 개수만큼 뛰어요!`);
        }
        if (result) return;
        const tIn = now - R.start;
        if (cnt === R.n && now - lastHit >= STILL) finish(true);
        else if (tIn >= R.win) finish(false, cnt < R.n ? "조금 모자라요" : "너무 많아요!");
      },
      draw(ctx) {
        const U = v.U;
        if (!R) { outlinedText(ctx, "물건을 세고 그만큼 깡충!", z.cx, v.H * 0.3, Math.min(U * 0.05, z.w / 12), "#fff", env.color, 4); return; }
        // 물건 늘어놓기 (한 줄에 5개, 덧셈은 두 무리 + 기호)
        const groups = R.b ? [R.a, R.b] : [R.n], cols = 5, maxW = z.w * 0.9;
        const cell = Math.min(U * 0.1, maxW / (R.b ? 11.5 : 5.6), v.H * 0.1);
        const totalW = R.b ? cell * (Math.min(cols, R.a) + Math.min(cols, R.b) + 1.5) : cell * Math.min(cols, R.n);
        let gx = z.cx - totalW / 2, idx = 0;
        const y0 = v.H * 0.2, panelH = cell * (Math.ceil(Math.max(...groups) / cols)) + cell * 0.4;
        ctx.fillStyle = "rgba(255,255,255,.55)"; rr(ctx, z.cx - totalW / 2 - cell * 0.3, y0 - cell * 0.2, totalW + cell * 0.6, panelH, cell * 0.25); ctx.fill();
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        groups.forEach((g, gi) => {
          const c = Math.min(cols, g);
          for (let k = 0; k < g; k++) {
            const cx = gx + cell * ((k % cols) + 0.5), cy = y0 + cell * (Math.floor(k / cols) + 0.5), lit = idx < cnt;
            if (lit) { ctx.fillStyle = "rgba(55,214,122,.55)"; ctx.beginPath(); ctx.arc(cx, cy, cell * 0.48, 0, Math.PI * 2); ctx.fill(); }
            ctx.globalAlpha = lit || !cnt ? 1 : 0.75; ctx.font = `${Math.round(cell * 0.78)}px ${FONT}`; ctx.fillStyle = "#000"; ctx.fillText(R.obj[0], cx, cy + cell * 0.04); ctx.globalAlpha = 1;
            idx++;
          }
          gx += cell * c;
          if (R.b && gi === 0) { outlinedText(ctx, "+", gx + cell * 0.75, y0 + cell * 0.5, cell * 0.8, "#fff", "#e0306a", 4); gx += cell * 1.5; }
        });
        // 큰 숫자(뛴 횟수)는 몸을 가리지 않게 옆쪽에
        const br = Math.min(U * 0.1, z.w * 0.12), bx = z.x0 + Math.max(z.w * 0.15, br + U * 0.04), by = Math.min(v.H * 0.66, Math.max(v.H * 0.48, y0 + panelH + br + U * 0.04));
        ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = U * 0.008; ctx.strokeStyle = result === "good" ? "#2fb65a" : result === "bad" ? "#d02020" : env.color; ctx.stroke();
        outlinedText(ctx, String(cnt), bx, by + br * 0.05, br * (1.15 + 0.25 * flash), "#fff", ctx.strokeStyle, 6);
        if (!result) {
          const tIn = now - R.start, k = Math.max(0, 1 - tIn / R.win);
          ctx.strokeStyle = "rgba(0,0,0,.2)"; ctx.lineWidth = U * 0.012; ctx.beginPath(); ctx.arc(bx, by, br + U * 0.015, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = env.color; ctx.beginPath(); ctx.arc(bx, by, br + U * 0.015, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();   // 남은 시간
          const hint = cnt === R.n ? "그대로 멈춰요!" : lower ? "깡충 뛰어요!" : "발이 안 보이면 박수!";
          outlinedText(ctx, hint, z.cx, v.H * 0.84, Math.min(U * 0.042, z.w / 12), "#fff", cnt === R.n ? "#2fb65a" : "#555", 3);
        }
      },
      stop() { shared = null; },
      result: () => `맞힘 ${ok} · 틀림 ${bad}`,
      // 설명 시연용
      get need() { return R && !result && now >= R.start ? R.n - cnt : 0; },
      get round() { return R ? { n: R.n, cnt, result, tIn: now - R.start } : null; },
    };
  },
  demo: {
    dur: 18,
    run(T, g, p, S, say) {
      p.rest(0, "hips", 1); p.rest(1, "hips", 1);
      if (T < 4) say("수 세기 점프! 화면의 물건을 세어 봐요");
      else if (T < 10) say("개수만큼 제자리에서 깡충! 다 뛰면 1초 멈춰요");
      else if (T < 15) say("발이 안 보이면 박수로 세도 돼요");
      else say("이제 직접 해 봐요!");
      const r = g.round;
      if (!r || r.tIn < 1.6) return;                       // 문제를 듣고 나서
      if (g.need > 0 && (!S.jt || T - S.jt > 0.8)) { p.jump(); S.jt = T; }
    },
  },
};
