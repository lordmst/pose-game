// 리듬 박자 (펌프 방식): 머리 높이에 판정판 5개(↙ ↖ ● ↗ ↘)가 한 줄로 있고,
// 화살표가 아래에서 올라와 판에 겹치는 순간 그 판에 손을 넣음. 긴 막대(홀드)는 끝날 때까지 손을 대고 있기
import { burst, popup, outlinedText, rr, FONT } from "../fx.js?v=20";
import { sfx, rhythm, clock, SONGS, songOf, onsetAt } from "../audio.js?v=20";

const TRAVEL = 1.6;                                   // 화살표가 화면 아래에서 판까지 올라오는 시간(초, 보통)
// 판정 시간 폭(초, 보통). 쉬움은 넓고 어려움은 좁음
const JUDGE = [["PERFECT", 0.07], ["GREAT", 0.12], ["GOOD", 0.17], ["BAD", 0.23]];
const J_STYLE = {
  PERFECT: ["#fff6b0", "#ff8a00"], GREAT: ["#c8ffb0", "#1f9e3a"], GOOD: ["#b8e4ff", "#1f6fd1"],
  BAD: ["#e7c8ff", "#7a3fbf"], MISS: ["#dddddd", "#a02020"],
};
const LIFE = { PERFECT: 0.02, GREAT: 0.015, GOOD: 0.005, BAD: -0.04, MISS: -0.08 };
// 판: 펌프와 같은 색 (아래 대각선 파랑, 위 대각선 빨강, 가운데 노랑)
export const LANES = [
  { rot: -135, color: "#2f8bff" }, { rot: -45, color: "#ff3b5c" }, { center: true, color: "#ffc400" },
  { rot: 45, color: "#ff3b5c" }, { rot: 135, color: "#2f8bff" },
];
const MIN_GAP = { easy: 0.7, normal: 0.4, hard: 0.24 };   // 음표 사이 최소 간격(초)
const DEG = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];        // 반음 → 음계 자리(도=0 … 시=6)
const scaleIdx = m => Math.floor(m / 12) * 7 + DEG[m % 12];
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

// 펌프 화살표 모양: 위를 가리키는 화살표를 돌려서 씀. 가운데 판은 둥근 네모
function arrowPath(ctx, x, y, s, lane) {
  const L = LANES[lane];
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  if (L.center) { rr(ctx, -s * 0.72, -s * 0.72, s * 1.44, s * 1.44, s * 0.32); }
  else {
    ctx.rotate(L.rot * Math.PI / 180);
    const P = [[0, -1.05], [0.95, -0.08], [0.42, -0.08], [0.42, 0.95], [-0.42, 0.95], [-0.42, -0.08], [-0.95, -0.08]];
    P.forEach(([px, py], i) => (i ? ctx.lineTo(px * s, py * s) : ctx.moveTo(px * s, py * s))); ctx.closePath();
  }
  ctx.restore();
}
function drawArrow(ctx, x, y, s, lane, kind, glow = 0) {
  const col = LANES[lane].color;
  arrowPath(ctx, x, y, s, lane);
  if (kind === "receptor") {
    ctx.fillStyle = glow > 0 ? `rgba(255,255,255,${0.25 + 0.6 * glow})` : "rgba(30,30,40,.45)"; ctx.fill();
    ctx.lineWidth = Math.max(3, s * 0.16); ctx.strokeStyle = glow > 0 ? col : "rgba(235,235,245,.85)"; ctx.lineJoin = "round"; ctx.stroke();
  } else {
    const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, col); g.addColorStop(1, col);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.12); ctx.strokeStyle = "#ffffff"; ctx.lineJoin = "round"; ctx.stroke();
  }
}

export default {
  id: "rhythm", title: "리듬 박자", icon: "🥁", sec: 45, cursor: "✋", cat: "move", bg: "#c39bff", desc: "펌프처럼 화살표 맞춰 치기", music: false,
  songs: SONGS.map(({ id, title, icon, bpm }) => ({ id, title, icon, bpm })),
  how: "펌프처럼 화살표가 아래에서 올라와요. 머리 높이의 판에 화살표가 겹치는 순간 그 판에 손을 넣어요. 긴 막대는 끝까지 손을 대고 있기!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, id = D.id || "normal";
    const song = songOf(env.song), minGap = MIN_GAP[id] || 0.4, travel = TRAVEL / D.speed, wide = D.reach;
    const badW = JUDGE[3][1] * wide;
    let t0 = null, spb = 0.6, seed = 1, nextJ = 8, notes = [], now = 0, lastT = null;
    let lastLane = null, lastIdx = null, lastTime = -9, alt = 0, holdUntil = -9;
    const count = { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 };
    let life = 0.6, judge = null, judgeT = 0;
    const flash = [0, 0, 0, 0, 0], inside = [Array(5).fill(false), Array(5).fill(false)];
    const anchor = { x: z.cx, y: v.H * 0.45, sw: v.U * 0.13, init: false };

    // 판정판은 몸을 천천히 따라감 (어깨 가운데 기준, 머리 높이)
    function follow(dt) {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return;
      const x = (p[11].x + p[12].x) / 2, y = (p[11].y + p[12].y) / 2, sw = Math.max(v.U * 0.07, Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y));
      if (!anchor.init) { Object.assign(anchor, { x, y, sw, init: true }); return; }
      const a = Math.min(1, dt * 2.5);
      anchor.x += (x - anchor.x) * a; anchor.y += (y - anchor.y) * a; anchor.sw += (sw - anchor.sw) * a;
    }
    function layout() {
      const L = Math.max(v.U * 0.07, Math.min(anchor.sw * 0.95, z.w / 5.6));
      const cx = Math.max(z.x0 + L * 2.6, Math.min(z.x1 - L * 2.6, anchor.x));
      const y = Math.max(v.H * 0.2, Math.min(v.H * 0.5, anchor.y - anchor.sw * 1.0));
      return { L, y, r: L * 0.42, pads: [0, 1, 2, 3, 4].map(i => ({ x: cx + (i - 2) * L, y, r: L * 0.42 })) };
    }
    // 가락의 높낮이를 판의 좌우 움직임으로: 올라가면 오른쪽, 내려가면 왼쪽, 같은 음이면 반대편
    function laneFor(midi) {
      const si = scaleIdx(midi);
      let lane;
      if (lastLane == null) lane = 2;
      else {
        const step = si - lastIdx;
        if (step === 0) lane = lastLane === 2 ? ((alt ^= 1) ? 1 : 3) : 4 - lastLane;
        else {
          lane = lastLane + Math.max(-2, Math.min(2, step));
          if (lane < 0) lane = Math.min(4, -lane);
          if (lane > 4) lane = Math.max(0, 8 - lane);
          if (lane === lastLane) lane = lane === 2 ? ((alt ^= 1) ? 1 : 3) : 4 - lane;
        }
      }
      lastIdx = si; return lane;
    }
    // 반 박(j)마다 음표 만들기: 앞 2마디는 준비(둘째 마디에 ↙ ↘ 연습), 그다음은 노래 가락이 시작하는 곳
    function addStep(j) {
      const time = t0 + j * spb / 2, p = env.progress(), half = spb / 2;
      let lane, hold = 0;
      if (j < rhythm.INTRO) {
        if (j < 8 || j % (id === "easy" ? 4 : 2)) return;
        lane = (j / 2) % 2 ? 4 : 0;
      } else {
        const o = onsetAt(song, j);
        if (!o || time - lastTime < minGap - 0.01 || time < holdUntil + 0.05) return;
        if (j % 2 && (id === "easy" || (id === "normal" && p < 0.4))) return;   // 엇박 음표는 보통은 후반부터, 쉬움은 없음
        lane = laneFor(o[0]);
        const dur = o[1] * half;
        if (id !== "easy" && o[1] >= 4) hold = dur * 0.85;                       // 두 박 이상 긴 음은 홀드
      }
      lastLane = lane; lastTime = time; if (hold) holdUntil = time + hold;
      const bar = j >= rhythm.INTRO && (j - rhythm.INTRO) % 8 === 0;
      const pair = !hold && bar && lane !== 2 && id !== "easy" && p > (id === "hard" ? 0.3 : 0.5) && hash(seed, j * 13 + 2) < (id === "hard" ? 0.35 : 0.15);   // 양쪽 대칭 두 판 동시에
      for (const l of pair ? [lane, 4 - lane] : [lane]) notes.push({ time, lane: l, hold, done: null, holding: false, pair });
    }
    function show(name, x, y) {
      judge = name; judgeT = now; count[name]++; life = Math.max(0, Math.min(1, life + LIFE[name]));
      if (name === "BAD" || name === "MISS") env.miss(x, y, null);
    }
    function hit(li) {
      let best = null, bd = Infinity;
      for (const n of notes) if (!n.done && !n.holding && n.lane === li) { const d = Math.abs(n.time - now); if (d < bd) { best = n; bd = d; } }
      if (!best || bd > badW) return;
      const P = layout().pads[li];
      const name = JUDGE.find(([, w]) => bd <= w * wide)[0];
      flash[li] = 1;
      if (name === "BAD") { best.done = "BAD"; best.doneAt = now; show("BAD", P.x, P.y); return; }
      env.award(name === "PERFECT" ? 2 : 1, P.x, P.y - P.r * 1.6); show(name, P.x, P.y);
      sfx.catch(env.player.combo);
      burst(P.x, P.y, { n: name === "PERFECT" ? 16 : 10, colors: [LANES[li].color, "#ffffff"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.4, size: v.U * 0.015, life: 0.5 });
      if (best.hold) { best.holding = true; best.end = best.time + best.hold; best.lostT = 0; }
      else { best.done = name; best.doneAt = now; }
    }
    return {
      update() {
        if (t0 === null) { t0 = rhythm.start(song.id); spb = rhythm.spb; seed = rhythm.seed; }
        now = clock();
        const dt = lastT === null ? 0.016 : Math.min(0.1, now - lastT); lastT = now;
        follow(dt);
        for (let i = 0; i < 5; i++) flash[i] = Math.max(0, flash[i] - dt * 4);
        while (t0 + nextJ * spb / 2 - now < travel) { addStep(nextJ); nextJ++; }
        const Lo = layout(), P = Lo.pads, hands = env.tracker.hands;
        const isIn = (h, pd, k = 1) => h.vis && Math.hypot(h.x - pd.x, h.y - pd.y) < pd.r * 1.3 * k * wide;
        hands.forEach((h, k) => P.forEach((pd, li) => {
          const inn = isIn(h, pd);
          if (inn && !inside[k][li]) hit(li);              // 판에 '들어오는 순간'만 판정
          inside[k][li] = inn;
        }));
        for (const n of notes) {
          if (n.holding) {                                  // 홀드: 끝까지 손을 대고 있어야 함 (잠깐 0.15초 떨어지는 건 봐줌)
            const pd = P[n.lane], on = hands.some(h => isIn(h, pd, 1.25));
            n.lostT = on ? 0 : n.lostT + dt;
            if (on) flash[n.lane] = Math.max(flash[n.lane], 0.6);
            if (now >= n.end) { n.holding = false; n.done = "PERFECT"; n.doneAt = now; env.award(1, pd.x, pd.y - pd.r * 1.6); show("PERFECT", pd.x, pd.y); }
            else if (n.lostT > 0.15) { n.holding = false; n.done = "MISS"; n.doneAt = now; show("MISS", pd.x, pd.y); }
          } else if (!n.done && now - n.time > badW) { n.done = "MISS"; n.doneAt = now; show("MISS", P[n.lane].x, P[n.lane].y); }
        }
        notes = notes.filter(n => !n.done || now - n.doneAt < 0.3);
      },
      draw(ctx) {
        if (t0 === null) { now = clock(); follow(0.5); }
        const U = v.U, Lo = layout(), P = Lo.pads, s = Lo.L * 0.42;
        const speed = (v.H * 1.05 - Lo.y) / travel;
        // 생명 게이지 (판 위)
        const gw = Math.min(z.w * 0.8, Lo.L * 5.4), gx = (P[0].x + P[4].x) / 2 - gw / 2, gy = Math.max(v.H * 0.115, Lo.y - Lo.L * 0.95), gh = Math.max(8, U * 0.016);
        ctx.fillStyle = "rgba(0,0,0,.45)"; rr(ctx, gx, gy, gw, gh, gh / 2); ctx.fill();
        const lg = ctx.createLinearGradient(gx, 0, gx + gw, 0); lg.addColorStop(0, "#ff4d4d"); lg.addColorStop(0.5, "#ffd400"); lg.addColorStop(1, "#37d67a");
        ctx.globalAlpha = life < 0.2 ? 0.5 + 0.5 * Math.sin(now * 14) : 1;
        ctx.fillStyle = lg; rr(ctx, gx, gy, Math.max(gh, gw * life), gh, gh / 2); ctx.fill(); ctx.globalAlpha = 1;
        // 판정판
        const beat = t0 !== null && now > t0 ? Math.max(0, 1 - (((now - t0) / spb) % 1) * 3) : 0;
        P.forEach((pd, li) => drawArrow(ctx, pd.x, pd.y, s * (1 + 0.06 * beat), li, "receptor", flash[li]));
        // 올라오는 화살표 (홀드는 긴 막대)
        for (const n of notes) {
          const pd = P[n.lane];
          if (n.done) {
            if (n.done === "MISS" || n.done === "BAD") continue;
            const a = Math.max(0, 1 - (now - n.doneAt) / 0.3);
            ctx.globalAlpha = a; drawArrow(ctx, pd.x, pd.y, s * (1 + (1 - a) * 0.6), n.lane, "note"); ctx.globalAlpha = 1; continue;
          }
          const y = pd.y + (n.time - now) * speed;
          if (y > v.H + Lo.L) continue;
          if (n.hold) {
            const yEnd = pd.y + (n.time + n.hold - now) * speed, yTop = n.holding ? pd.y : y;
            if (yEnd > yTop) {
              ctx.fillStyle = LANES[n.lane].color; ctx.globalAlpha = n.holding ? 0.85 : 0.6;
              rr(ctx, pd.x - s * 0.5, yTop, s, yEnd - yTop, s * 0.4); ctx.fill();
              ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.stroke();
            }
            drawArrow(ctx, pd.x, n.holding ? pd.y : y, s, n.lane, "note");
          } else drawArrow(ctx, pd.x, y, s, n.lane, "note");
        }
        // 판정 글자와 콤보 (가운데)
        const jy = Lo.y + (v.H - Lo.y) * 0.42, cx = (P[0].x + P[4].x) / 2;
        if (judge && now - judgeT < 0.7) {
          const k = Math.min(1, (now - judgeT) / 0.08), sc = 1.25 - 0.25 * k, [fill, stroke] = J_STYLE[judge];
          ctx.globalAlpha = Math.min(1, (0.7 - (now - judgeT)) / 0.2);
          outlinedText(ctx, judge, cx, jy, Math.min(U * 0.075, z.w / 6) * sc, fill, stroke, Math.max(4, U * 0.012));
          const c = env.player.combo || 0;
          if (c >= 4 && judge !== "MISS" && judge !== "BAD") {
            outlinedText(ctx, String(c), cx, jy + U * 0.085, U * 0.075, "#ffffff", "#222", Math.max(4, U * 0.01));
            outlinedText(ctx, "COMBO", cx, jy + U * 0.14, U * 0.03, "#ffe14d", "#222", 3);
          }
          ctx.globalAlpha = 1;
        }
        // 노래 제목
        ctx.font = `${Math.round(U * 0.028)}px ${FONT}`;
        outlinedText(ctx, `♪ ${song.title}`, cx, v.H * 0.955, U * 0.03, "#fff", "rgba(0,0,0,.6)", 3);
      },
      stop() { rhythm.stop(); },
      result: () => `${song.title} · PERFECT ${count.PERFECT} · GREAT ${count.GREAT} · GOOD ${count.GOOD} · BAD ${count.BAD} · MISS ${count.MISS}`,
      // 설명 시연용
      get notes() { return notes; },
      get now() { return now; },
      get pads() { return layout().pads; },
    };
  },
};
