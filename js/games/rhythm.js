// 리듬 박자: 반주에 맞춰 위에서 내려오는 음표가 동그라미에 닿는 순간 손을 넣기
import { burst, popup, outlinedText, FONT } from "../fx.js?v=16";
import { sfx, rhythm, clock } from "../audio.js?v=16";

const BPM = 100;
const PERFECT = 0.09, GOOD = 0.22;     // 판정 시간 폭(초)
const TRAVEL = 1.8;                     // 음표가 위에서 동그라미까지 오는 시간(초, 보통)
// 두 선수가 같은 음표 패턴을 받도록 씨앗값 기반으로 만듦
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

export default {
  id: "rhythm", title: "리듬 박자", icon: "🥁", sec: 45, cursor: "✋", cat: "move", bg: "#c39bff", desc: "박자 맞춰 치기", music: false,
  how: "음악에 맞춰 내려오는 음표가 동그라미에 닿을 때 손을 쏙 넣어요. 딱 맞으면 '완벽!'",
  create(env) {
    const z = env.zone, v = env.view, travel = TRAVEL / env.diff.speed, good = GOOD * env.diff.reach;
    let t0 = null, spb = 0.6, seed = 1, nextJ = 8, notes = [], perfect = 0, goodN = 0, missN = 0, now = 0;
    const inside = [[false, false], [false, false]];
    const lanes = () => [{ x: z.cx - v.U * 0.2, y: v.H * 0.44 }, { x: z.cx + v.U * 0.2, y: v.H * 0.44 }];
    const RR = () => v.U * 0.075 * env.diff.reach;
    // 반 박자(j) 단위로 음표 만들기. 처음 4박은 준비
    function addStep(j) {
      const time = t0 + j * spb / 2, p = env.progress(), on = j % 2 === 0, beat = j / 2;
      const hard = env.diff.speed > 1.2;
      let want;
      if (on) want = (p < 0.25 && !hard ? beat % 2 === 0 : true) && hash(seed, j) < 0.85;
      else want = (hard || p > 0.6) && hash(seed, j * 7 + 1) < (hard ? 0.35 : 0.2);
      if (!want) return;
      const both = p > 0.3 && on && hash(seed, j * 13 + 2) < 0.12;
      const lane = hash(seed, j * 3 + 5) < 0.5 ? 0 : 1;
      for (const l of both ? [0, 1] : [lane]) notes.push({ time, lane: l, done: null, both });
    }
    function judge(li) {
      let best = null, bd = Infinity;
      for (const n of notes) if (!n.done && n.lane === li) { const d = Math.abs(n.time - now); if (d < bd) { best = n; bd = d; } }
      if (!best || bd > good) return;
      const L = lanes()[li], r = RR();
      if (bd <= PERFECT * env.diff.reach) {
        best.done = "perfect"; perfect++; env.award(2, L.x, L.y - r * 1.6);
        popup(L.x, L.y + r * 1.9, "완벽!", { size: v.U * 0.045, color: "#fff", stroke: "#e0306a" });
      } else {
        best.done = "good"; goodN++; env.award(1, L.x, L.y - r * 1.6);
        popup(L.x, L.y + r * 1.9, "좋아요", { size: v.U * 0.038, color: "#fff", stroke: "#3d8bff" });
      }
      best.doneAt = now; sfx.catch(env.player.combo);
      burst(L.x, L.y, { n: 14, colors: li ? ["#7ab8ff", "#ffffff"] : ["#ff8fc5", "#ffffff"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.4, size: v.U * 0.016, life: 0.5 });
    }
    return {
      update() {
        if (t0 === null) { t0 = rhythm.start(BPM); spb = rhythm.spb; seed = rhythm.seed; }
        now = clock();
        while (t0 + nextJ * spb / 2 - now < travel) { addStep(nextJ); nextJ++; }
        const L = lanes(), r = RR();
        env.tracker.hands.forEach((h, k) => L.forEach((ln, li) => {
          const inn = h.vis && Math.hypot(h.x - ln.x, h.y - ln.y) < r * 1.35;
          if (inn && !inside[k][li]) judge(li);           // 동그라미에 '들어오는 순간'만 판정
          inside[k][li] = inn;
        }));
        for (const n of notes) if (!n.done && now - n.time > good) { n.done = "miss"; n.doneAt = now; missN++; env.miss(L[n.lane].x, L[n.lane].y + r * 1.9, "놓침"); }
        notes = notes.filter(n => !n.done || now - n.doneAt < 0.35);
      },
      draw(ctx) {
        if (t0 === null) now = clock();
        const L = lanes(), r = RR(), top = v.H * 0.12;
        const ph = t0 === null ? 0 : ((now - t0) / spb) % 1, pulse = t0 !== null && now > t0 ? Math.max(0, 1 - ph * 3) : 0;
        L.forEach((ln, li) => {
          const col = li ? "#3d8bff" : "#ff4d9d";
          ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = r * 1.2; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(ln.x, top); ctx.lineTo(ln.x, ln.y); ctx.stroke();
          ctx.lineWidth = v.U * 0.012; ctx.strokeStyle = col; ctx.fillStyle = "rgba(255,255,255,.25)";
          ctx.beginPath(); ctx.arc(ln.x, ln.y, r * (1 + 0.12 * pulse), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.globalAlpha = 0.6; ctx.font = `${Math.round(r * 0.9)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("✋", ln.x, ln.y); ctx.globalAlpha = 1;
        });
        for (const n of notes) {
          const ln = L[n.lane], col = n.lane ? "#3d8bff" : "#ff4d9d";
          if (n.done) {
            const a = Math.max(0, 1 - (now - n.doneAt) / 0.35);
            ctx.globalAlpha = a; ctx.strokeStyle = n.done === "miss" ? "#999" : "#ffd400"; ctx.lineWidth = v.U * 0.01;
            ctx.beginPath(); ctx.arc(ln.x, ln.y, r * (1 + (1 - a) * 0.8), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; continue;
          }
          const y = ln.y - (n.time - now) / travel * (ln.y - top);
          if (y < top - r) continue;
          ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = v.U * 0.008;
          ctx.beginPath(); ctx.arc(ln.x, y, r * 0.78, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          outlinedText(ctx, "♪", ln.x, y + r * 0.04, r * 0.85, "#fff", col, 3);
        }
        // 두 손 동시 음표는 선으로 이어서 표시
        const pairs = {};
        for (const n of notes) if (n.both && !n.done) (pairs[n.time] = pairs[n.time] || []).push(n);
        for (const k in pairs) if (pairs[k].length === 2) {
          const y = L[0].y - (pairs[k][0].time - now) / travel * (L[0].y - top);
          ctx.strokeStyle = "rgba(255,212,0,.8)"; ctx.lineWidth = v.U * 0.01; ctx.beginPath(); ctx.moveTo(L[0].x + r * 0.8, y); ctx.lineTo(L[1].x - r * 0.8, y); ctx.stroke();
        }
      },
      stop() { rhythm.stop(); },
      result: () => `완벽 ${perfect} · 좋아요 ${goodN} · 놓침 ${missN}`,
      // 설명 시연용
      get notes() { return notes; },
      get now() { return now; },
      get lanes() { return lanes().map(l => ({ ...l, r: RR() })); },
    };
  },
};
