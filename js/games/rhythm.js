// 리듬 박자 (펌프 방식): 화면 위에 판정판 4개(↙ ↖ ↗ ↘)가 한 줄로 있고 화살표가 아래에서 올라옴.
// 판을 손으로 누르는 게 아니라 몸으로 '밟음': 왼손(↖) · 오른손(↗)은 옆으로 뻗기, 왼발(↙) · 오른발(↘)은 다리 들기
// 화살표가 판에 겹치는 순간 그 동작을 함. 긴 막대(홀드)는 끝날 때까지 그대로. 맞혀도 효과음은 없음(음악만)
import { burst, outlinedText, rr, FONT } from "../fx.js?v=33";
import { rhythm, clock, SONGS, songOf, onsetAt } from "../audio.js?v=33";

const TRAVEL = 1.6;                                   // 화살표가 화면 아래에서 판까지 올라오는 시간(초, 보통)
// 판정 시간 폭(초, 보통). 쉬움은 넓고 어려움은 좁음
const JUDGE = [["PERFECT", 0.08], ["GREAT", 0.14], ["GOOD", 0.2], ["BAD", 0.27]];
const J_STYLE = {
  PERFECT: ["#fff6b0", "#ff8a00"], GREAT: ["#c8ffb0", "#1f9e3a"], GOOD: ["#b8e4ff", "#1f6fd1"],
  BAD: ["#e7c8ff", "#7a3fbf"], MISS: ["#dddddd", "#a02020"],
};
const LIFE = { PERFECT: 0.02, GREAT: 0.015, GOOD: 0.005, BAD: -0.04, MISS: -0.08 };
// 판 (왼쪽부터): 왼발 7시 ↙ · 왼손 11시 ↖ · 오른손 1시 ↗ · 오른발 5시 ↘. 펌프처럼 발은 파랑, 손은 빨강
export const LANES = [
  { rot: -135, color: "#2f8bff", limb: "왼발", icon: "🦶", clock: "들기" },
  { rot: -45, color: "#ff3b5c", limb: "왼손", icon: "✋", clock: "옆으로" },
  { rot: 45, color: "#ff3b5c", limb: "오른손", icon: "✋", clock: "옆으로" },
  { rot: 135, color: "#2f8bff", limb: "오른발", icon: "🦶", clock: "들기" },
];
const MIN_GAP = { easy: 0.75, normal: 0.45, hard: 0.3 };  // 음표 사이 최소 간격(초)
const DEG = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];        // 반음 → 음계 자리(도=0 … 시=6)
const scaleIdx = m => Math.floor(m / 12) * 7 + DEG[m % 12];
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

// 팔다리 자세 판정 (화면 좌표, 거울 화면이라 선수의 왼쪽이 화면 왼쪽). 들어가는 기준과 풀리는 기준을 달리 해 떨림 방지
// 손: 옆으로 뻗기만 해도 인정(허리보다 위에서 바깥쪽으로 쭉), 대각선 위로 들어도 인정
// 다리: 한쪽 다리를 듦 = 그 무릎(또는 발목)이 서 있을 때 높이보다 올라가고, 다른 다리보다 확실히 높음
//       (두 다리가 같이 움직이는 앉았다 일어나기는 다리 들기로 치지 않음). 무릎이 안 보이면 손을 대각선 아래로 뻗는 것으로 대신
// base: { knee: [왼, 오], ankle: [왼, 오] } 서 있을 때 높이를 천천히 따라가는 기준값 (부르는 쪽에서 계속 넘겨줌)
export function limbStates(p, prev, footByHand, base = { knee: [null, null], ankle: [null, null] }, dt = 1 / 30) {
  const out = [false, false, false, false];
  if (!p || !p[11].v || !p[12].v) return out;
  const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1;
  const hipY = p[23].v && p[24].v ? (p[23].y + p[24].y) / 2 : p[11].y + sw * 1.6;
  const hand = (w, s, side, was) => {
    if (!p[w].v) return false;
    const up = (p[s].y - p[w].y) / sw, outward = (p[w].x - p[s].x) * side / sw, aboveHip = p[w].y < hipY - sw * 0.25;
    const sideways = aboveHip && outward > (was ? 0.5 : 0.75);       // 옆으로 뻗기
    const raised = up > (was ? 0.35 : 0.7) && outward > (was ? -0.4 : -0.25);   // 위로 들기
    return sideways || raised;
  };
  out[1] = hand(15, 11, -1, prev[1]); out[2] = hand(16, 12, 1, prev[2]);
  if (!footByHand) {
    const lift = (ids, key) => ids.map((i, k) => {
      if (!p[i].v) return null;
      const b = base[key][k] = base[key][k] == null ? p[i].y : Math.max(p[i].y, base[key][k] - dt * sw * 0.08);
      return (b - p[i].y) / sw;
    });
    const kn = lift([25, 26], "knee"), an = lift([27, 28], "ankle");
    // 무릎이 둘 다 보이면 무릎으로, 아니면 발목으로 비교
    const L = kn[0] != null && kn[1] != null ? kn : an[0] != null && an[1] != null ? an : null;
    if (L) [0, 1].forEach(k => {
      const d = L[k] - L[1 - k], lane = k ? 3 : 0;
      out[lane] = prev[lane] ? d > 0.1 : d > 0.25;
    });
  } else {
    const low = (w, s, side, was) => {
      if (!p[w].v) return false;
      const down = (p[w].y - p[s].y) / sw, outward = (p[w].x - p[s].x) * side / sw;
      return was ? down > 0.6 && outward > 0.35 : down > 0.9 && outward > 0.6;
    };
    out[0] = low(15, 11, -1, prev[0]); out[3] = low(16, 12, 1, prev[3]);
  }
  return out;
}

// 펌프 화살표 모양: 위를 가리키는 화살표를 돌려서 씀
function arrowPath(ctx, x, y, s, lane) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(LANES[lane].rot * Math.PI / 180); ctx.beginPath();
  const P = [[0, -1.05], [0.95, -0.08], [0.42, -0.08], [0.42, 0.95], [-0.42, 0.95], [-0.42, -0.08], [-0.95, -0.08]];
  P.forEach(([px, py], i) => (i ? ctx.lineTo(px * s, py * s) : ctx.moveTo(px * s, py * s))); ctx.closePath();
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
  id: "rhythm", title: "리듬 박자", icon: "🥁", sec: 45, cursor: "", cat: "move", bg: "#c39bff", desc: "펌프처럼 손발로 박자 밟기", music: false,
  songs: SONGS.map(({ id, title, icon, bpm }) => ({ id, title, icon, bpm })),
  how: "화살표가 위 판에 겹치는 순간 몸으로 밟아요. ↖ 왼손 · ↗ 오른손은 옆으로 쭉 뻗고, ↙ 왼발 · ↘ 오른발은 다리를 들어요! 긴 막대는 끝까지 그대로",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, id = D.id || "normal";
    const song = songOf(env.song), minGap = MIN_GAP[id] || 0.45, travel = TRAVEL / D.speed, wide = D.reach;
    const badW = JUDGE[3][1] * wide;
    let t0 = null, spb = 0.6, seed = 1, nextJ = 8, notes = [], now = 0, lastT = null;
    let lastLane = null, lastIdx = null, lastTime = -9, holdUntil = -9;
    const count = { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 };
    let life = 0.6, judge = null, judgeT = 0, limbs = [false, false, false, false], feetSeenT = -9, footByHand = false;
    const legBase = { knee: [null, null], ankle: [null, null] };
    const flash = [0, 0, 0, 0];

    function layout() {
      const L = Math.min(z.w / 4.6, v.U * 0.17), cx = z.cx, y = v.H * 0.22;
      return { L, y, pads: [0, 1, 2, 3].map(i => ({ x: cx + (i - 1.5) * L, y, r: L * 0.42 })) };
    }
    // 가락의 높낮이를 판의 좌우 움직임으로: 올라가면 오른쪽, 내려가면 왼쪽, 같은 음이면 반대편
    function laneFor(midi) {
      const si = scaleIdx(midi);
      let lane;
      if (lastLane == null) lane = 1;
      else {
        const step = si - lastIdx;
        lane = step === 0 ? 3 - lastLane : lastLane + Math.max(-2, Math.min(2, step));
        if (lane < 0) lane = Math.min(3, -lane);
        if (lane > 3) lane = Math.max(0, 6 - lane);
        if (lane === lastLane) lane = 3 - lane;
      }
      lastIdx = si; return lane;
    }
    // 반 박(j)마다 음표 만들기: 앞 2마디는 준비(둘째 마디에 ↖ ↗ 연습), 그다음은 노래 가락이 시작하는 곳
    function addStep(j) {
      const time = t0 + j * spb / 2, p = env.progress(), half = spb / 2;
      let lane, hold = 0;
      if (j < rhythm.INTRO) {
        if (j < 8 || j % 4) return;
        lane = (j / 4) % 2 ? 2 : 1;
      } else {
        const o = onsetAt(song, j);
        if (!o || time - lastTime < minGap - 0.01 || time < holdUntil + 0.05) return;
        if (j % 2 && (id === "easy" || (id === "normal" && p < 0.4))) return;   // 엇박 음표는 보통은 후반부터, 쉬움은 없음
        lane = laneFor(o[0]);
        if (id !== "easy" && o[1] >= 4) hold = o[1] * half * 0.85;               // 두 박 이상 긴 음은 홀드
      }
      lastLane = lane; lastTime = time; if (hold) holdUntil = time + hold;
      const bar = j >= rhythm.INTRO && (j - rhythm.INTRO) % 8 === 0;
      // 두 손 동시 (두 발 동시는 없음: 두 다리를 같이 들 수 없으니까)
      const pair = !hold && bar && (lane === 1 || lane === 2) && id !== "easy" && p > (id === "hard" ? 0.3 : 0.5) && hash(seed, j * 13 + 2) < (id === "hard" ? 0.35 : 0.15);
      for (const l of pair ? [lane, 3 - lane] : [lane]) notes.push({ time, lane: l, hold, done: null, holding: false, pair });
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
      if (name === "BAD") { best.done = "BAD"; best.doneAt = now; show("BAD", P.x, P.y); return; }
      env.award(name === "PERFECT" ? 2 : 1, P.x, P.y - P.r * 1.6); show(name, P.x, P.y);
      burst(P.x, P.y, { n: name === "PERFECT" ? 16 : 10, colors: [LANES[li].color, "#ffffff"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.4, size: v.U * 0.015, life: 0.5 });
      if (best.hold) { best.holding = true; best.end = best.time + best.hold; best.lostT = 0; }
      else { best.done = name; best.doneAt = now; }
    }
    return {
      update() {
        if (t0 === null) { t0 = rhythm.start(song.id); spb = rhythm.spb; seed = rhythm.seed; }
        rhythm.tick(); now = clock();
        const dt = lastT === null ? 0.016 : Math.min(0.1, now - lastT); lastT = now;
        while (t0 + nextJ * spb / 2 - now < travel) { addStep(nextJ); nextJ++; }
        // 발이 1초 넘게 안 보이면 발 화살표는 손을 대각선 아래로 뻗는 것으로 대신
        const p = env.tracker.pts;
        if (p && ((p[25].v && p[26].v) || (p[27].v && p[28].v))) feetSeenT = now;
        footByHand = now - feetSeenT > 1;
        const st = limbStates(p, limbs, footByHand, legBase, dt), P = layout().pads;
        st.forEach((on, li) => { if (on && !limbs[li]) hit(li); if (on) flash[li] = 1; });   // 그 자세로 '들어가는 순간'만 판정
        limbs = st;
        for (let i = 0; i < 4; i++) if (!limbs[i]) flash[i] = Math.max(0, flash[i] - dt * 5);
        for (const n of notes) {
          if (n.holding) {                                  // 홀드: 끝까지 그 자세 유지 (잠깐 0.15초 풀리는 건 봐줌)
            n.lostT = limbs[n.lane] ? 0 : n.lostT + dt;
            const pd = P[n.lane];
            if (now >= n.end) { n.holding = false; n.done = "PERFECT"; n.doneAt = now; env.award(1, pd.x, pd.y - pd.r * 1.6); show("PERFECT", pd.x, pd.y); }
            else if (n.lostT > 0.15) { n.holding = false; n.done = "MISS"; n.doneAt = now; show("MISS", pd.x, pd.y); }
          } else if (!n.done && now - n.time > badW) { n.done = "MISS"; n.doneAt = now; show("MISS", P[n.lane].x, P[n.lane].y); }
        }
        notes = notes.filter(n => !n.done || now - n.doneAt < 0.3);
      },
      draw(ctx) {
        if (t0 === null) now = clock();
        const U = v.U, Lo = layout(), P = Lo.pads, s = Lo.L * 0.42;
        const speed = (v.H * 1.05 - Lo.y) / travel;
        // 생명 게이지 (판 위)
        const gw = Lo.L * 4.2, gx = z.cx - gw / 2, gy = Math.max(v.H * 0.115, Lo.y - Lo.L * 0.75), gh = Math.max(8, U * 0.016);
        ctx.fillStyle = "rgba(0,0,0,.45)"; rr(ctx, gx, gy, gw, gh, gh / 2); ctx.fill();
        const lg = ctx.createLinearGradient(gx, 0, gx + gw, 0); lg.addColorStop(0, "#ff4d4d"); lg.addColorStop(0.5, "#ffd400"); lg.addColorStop(1, "#37d67a");
        ctx.globalAlpha = life < 0.2 ? 0.5 + 0.5 * Math.sin(now * 14) : 1;
        ctx.fillStyle = lg; rr(ctx, gx, gy, Math.max(gh, gw * life), gh, gh / 2); ctx.fill(); ctx.globalAlpha = 1;
        // 판정판 + 어느 손발인지 (밟고 있으면 빛남)
        const beat = t0 !== null && now > t0 ? Math.max(0, 1 - (((now - t0) / spb) % 1) * 3) : 0;
        P.forEach((pd, li) => {
          drawArrow(ctx, pd.x, pd.y, s * (1 + 0.06 * beat), li, "receptor", flash[li]);
          const L = LANES[li], foot = li === 0 || li === 3;
          const label = foot && footByHand ? `${li ? "오른손" : "왼손"} 아래로` : `${L.limb} ${L.clock}`;
          outlinedText(ctx, label, pd.x, pd.y + s * 1.45, Math.min(U * 0.026, Lo.L * 0.2), "#fff", L.color, 3);
        });
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
        const jy = v.H * 0.52;
        if (judge && now - judgeT < 0.7) {
          const k = Math.min(1, (now - judgeT) / 0.08), sc = 1.25 - 0.25 * k, [fill, stroke] = J_STYLE[judge];
          ctx.globalAlpha = Math.min(1, (0.7 - (now - judgeT)) / 0.2);
          outlinedText(ctx, judge, z.cx, jy, Math.min(U * 0.075, z.w / 6) * sc, fill, stroke, Math.max(4, U * 0.012));
          const c = env.player.combo || 0;
          if (c >= 4 && judge !== "MISS" && judge !== "BAD") {
            outlinedText(ctx, String(c), z.cx, jy + U * 0.085, U * 0.075, "#ffffff", "#222", Math.max(4, U * 0.01));
            outlinedText(ctx, "COMBO", z.cx, jy + U * 0.14, U * 0.03, "#ffe14d", "#222", 3);
          }
          ctx.globalAlpha = 1;
        }
        if (footByHand && t0 !== null) outlinedText(ctx, "다리가 안 보여요: 발 화살표는 손을 대각선 아래로 뻗어요", z.cx, v.H * 0.9, Math.min(U * 0.028, z.w / 22), "#fff", "#b04a00", 3);
        ctx.font = `${Math.round(U * 0.028)}px ${FONT}`;
        outlinedText(ctx, `♪ ${song.title}`, z.cx, v.H * 0.955, U * 0.03, "#fff", "rgba(0,0,0,.6)", 3);
      },
      stop() { rhythm.stop(); },
      result: () => `${song.title} · PERFECT ${count.PERFECT} · GREAT ${count.GREAT} · GOOD ${count.GOOD} · BAD ${count.BAD} · MISS ${count.MISS}`,
      // 설명 시연용
      get notes() { return notes; },
      get now() { return now; },
      get limbs() { return limbs; },
    };
  },
};
