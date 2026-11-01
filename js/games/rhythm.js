// 리듬 박자: 몸 둘레 7개 판. 판 위로 줄어드는 링이 판에 딱 닿는 순간 그 판에 손을 넣기 (펌프처럼)
import { burst, popup, outlinedText, FONT } from "../fx.js?v=17";
import { sfx, rhythm, clock } from "../audio.js?v=17";

const BPM = 100;
const PERFECT = 0.09, GOOD = 0.22;     // 판정 시간 폭(초)
const TRAVEL = 1.5;                     // 링이 줄어들기 시작해서 판에 닿기까지(초, 보통)
// 판 위치: 몸 중심(어깨 가운데) 기준 시계 방향 각도. 왼쪽 아래 → 왼쪽 → 왼쪽 위 → 머리 위 → 오른쪽 위 → 오른쪽 → 오른쪽 아래
export const PAD_ANGLES = [235, 270, 315, 0, 45, 90, 125];
const PAD_COLORS = ["#ff4d9d", "#ff4d9d", "#ff4d9d", "#ffb800", "#3d8bff", "#3d8bff", "#3d8bff"];
const PAD_ICONS = ["↙", "←", "↖", "↑", "↗", "→", "↘"];
// 두 선수가 같은 음표 패턴을 받도록 씨앗값 기반
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

export default {
  id: "rhythm", title: "리듬 박자", icon: "🥁", sec: 45, cursor: "✋", cat: "move", bg: "#c39bff", desc: "7개 판 박자 맞추기", music: false,
  how: "몸 둘레 7개 판 중 링이 줄어드는 판을, 링이 판에 닿는 순간 손으로 쳐요. 딱 맞으면 '완벽!'",
  create(env) {
    const z = env.zone, v = env.view, travel = TRAVEL / env.diff.speed, good = GOOD * env.diff.reach;
    let t0 = null, spb = 0.6, seed = 1, nextJ = 8, notes = [], perfect = 0, goodN = 0, missN = 0, now = 0, lastLane = 3;
    const inside = [Array(7).fill(false), Array(7).fill(false)];
    const anchor = { x: z.cx, y: v.H * 0.45, sw: v.U * 0.13, init: false };
    // 판은 몸을 따라 천천히 움직임 (흔들림 방지)
    function follow(dt) {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return;
      const x = (p[11].x + p[12].x) / 2, y = (p[11].y + p[12].y) / 2, sw = Math.max(v.U * 0.07, Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y));
      if (!anchor.init) { Object.assign(anchor, { x, y, sw, init: true }); return; }
      const a = Math.min(1, dt * 2.5);
      anchor.x += (x - anchor.x) * a; anchor.y += (y - anchor.y) * a; anchor.sw += (sw - anchor.sw) * a;
    }
    const RR = () => Math.min(v.U * 0.062, anchor.sw * 0.42) * env.diff.reach;     // 판 반지름
    function pads() {
      const R = Math.min(anchor.sw * 1.55, z.w * 0.4, v.H * 0.4), r = RR();
      return PAD_ANGLES.map(a => {
        const t = a * Math.PI / 180;
        return { x: Math.max(z.x0 + r, Math.min(z.x1 - r, anchor.x + Math.sin(t) * R)), y: Math.max(v.H * 0.14 + r, Math.min(v.H - r, anchor.y - Math.cos(t) * R)), r };
      });
    }
    // 반 박자(j) 단위로 음표 만들기. 처음 4박은 준비
    function addStep(j) {
      const time = t0 + j * spb / 2, p = env.progress(), on = j % 2 === 0, beat = j / 2, hard = env.diff.speed > 1.2;
      let want;
      if (on) want = (p < 0.25 && !hard ? beat % 2 === 0 : true) && hash(seed, j) < 0.85;
      else want = (hard || p > 0.6) && hash(seed, j * 7 + 1) < (hard ? 0.3 : 0.18);
      if (!want) return;
      // 같은 판이 연달아 나오지 않게, 좌우를 번갈아 쓰기 좋게
      let lane = Math.floor(hash(seed, j * 3 + 5) * 7);
      if (lane === lastLane) lane = (lane + 3) % 7;
      lastLane = lane;
      const pair = p > 0.3 && on && lane !== 3 && hash(seed, j * 13 + 2) < 0.15;    // 양쪽 대칭 두 판 동시에
      for (const l of pair ? [lane, 6 - lane] : [lane]) notes.push({ time, lane: l, done: null, pair });
    }
    function judge(li) {
      let best = null, bd = Infinity;
      for (const n of notes) if (!n.done && n.lane === li) { const d = Math.abs(n.time - now); if (d < bd) { best = n; bd = d; } }
      if (!best || bd > good) return;
      const P = pads()[li];
      if (bd <= PERFECT * env.diff.reach) {
        best.done = "perfect"; perfect++; env.award(2, P.x, P.y - P.r * 1.6);
        popup(P.x, P.y + P.r * 1.8, "완벽!", { size: v.U * 0.04, color: "#fff", stroke: "#e0306a" });
      } else {
        best.done = "good"; goodN++; env.award(1, P.x, P.y - P.r * 1.6);
        popup(P.x, P.y + P.r * 1.8, "좋아요", { size: v.U * 0.034, color: "#fff", stroke: "#3d8bff" });
      }
      best.doneAt = now; sfx.catch(env.player.combo);
      burst(P.x, P.y, { n: 14, colors: [PAD_COLORS[li], "#ffffff"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.4, size: v.U * 0.015, life: 0.5 });
    }
    let lastT = null;
    return {
      update() {
        if (t0 === null) { t0 = rhythm.start(BPM); spb = rhythm.spb; seed = rhythm.seed; }
        now = clock();
        const dt = lastT === null ? 0.016 : Math.min(0.1, now - lastT); lastT = now;
        follow(dt);
        while (t0 + nextJ * spb / 2 - now < travel) { addStep(nextJ); nextJ++; }
        const P = pads();
        env.tracker.hands.forEach((h, k) => P.forEach((pd, li) => {
          const inn = h.vis && Math.hypot(h.x - pd.x, h.y - pd.y) < pd.r * 1.4;
          if (inn && !inside[k][li]) judge(li);           // 판에 '들어오는 순간'만 판정
          inside[k][li] = inn;
        }));
        for (const n of notes) if (!n.done && now - n.time > good) { n.done = "miss"; n.doneAt = now; missN++; env.miss(P[n.lane].x, P[n.lane].y + P[n.lane].r * 1.8, "놓침"); }
        notes = notes.filter(n => !n.done || now - n.doneAt < 0.35);
      },
      draw(ctx) {
        if (t0 === null) { now = clock(); follow(0.5); }
        const P = pads(), ph = t0 === null ? 0 : ((now - t0) / spb) % 1, pulse = t0 !== null && now > t0 ? Math.max(0, 1 - ph * 3) : 0;
        // 판
        P.forEach((pd, li) => {
          const pending = notes.some(n => !n.done && n.lane === li && n.time - now < travel);
          ctx.fillStyle = pending ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.18)";
          ctx.strokeStyle = PAD_COLORS[li]; ctx.lineWidth = v.U * (pending ? 0.012 : 0.007);
          ctx.beginPath(); ctx.arc(pd.x, pd.y, pd.r * (1 + 0.08 * pulse), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          outlinedText(ctx, PAD_ICONS[li], pd.x, pd.y + pd.r * 0.05, pd.r * 0.9, "#fff", PAD_COLORS[li], 3);
        });
        // 다가오는 링: 판보다 크게 시작해서 판 크기로 줄어듦 (닿는 순간이 치는 때)
        const pairs = {};
        for (const n of notes) {
          const pd = P[n.lane], col = PAD_COLORS[n.lane];
          if (n.done) {
            const a = Math.max(0, 1 - (now - n.doneAt) / 0.35);
            ctx.globalAlpha = a; ctx.strokeStyle = n.done === "miss" ? "#999" : "#ffd400"; ctx.lineWidth = v.U * 0.01;
            ctx.beginPath(); ctx.arc(pd.x, pd.y, pd.r * (1 + (1 - a) * 0.8), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; continue;
          }
          const k = (n.time - now) / travel;
          if (k > 1) continue;
          ctx.globalAlpha = Math.min(1, 1.3 - k); ctx.strokeStyle = col; ctx.lineWidth = v.U * 0.011;
          ctx.beginPath(); ctx.arc(pd.x, pd.y, pd.r * (1 + 2.2 * Math.max(0, k)), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
          if (n.pair) (pairs[n.time] = pairs[n.time] || []).push(pd);
        }
        for (const k in pairs) if (pairs[k].length === 2) {   // 두 판 동시 음표는 점선으로 연결
          ctx.save(); ctx.setLineDash([v.U * 0.012, v.U * 0.01]); ctx.strokeStyle = "rgba(255,212,0,.8)"; ctx.lineWidth = v.U * 0.006;
          ctx.beginPath(); ctx.moveTo(pairs[k][0].x, pairs[k][0].y); ctx.lineTo(pairs[k][1].x, pairs[k][1].y); ctx.stroke(); ctx.restore();
        }
      },
      stop() { rhythm.stop(); },
      result: () => `완벽 ${perfect} · 좋아요 ${goodN} · 놓침 ${missN}`,
      // 설명 시연용
      get notes() { return notes; },
      get now() { return now; },
      get pads() { return pads(); },
    };
  },
};
