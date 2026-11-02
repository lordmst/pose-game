// 지휘자: 오케스트라 지휘하기 (VR 지휘 게임 방식)
// 화면 가운데로 금색 삼각형(왼손·오른손 한 쌍)이 위에서 내려옴. 가로 지휘선에 닿는 순간
// 삼각형이 가리키는 방향으로 그 손을 휘두르기 (4박: 아래 ▼▼ → 안쪽 → 바깥쪽 → 위 ▲▲)
// 음악은 실제 오케스트라 연주 녹음(위키미디어 공용, 퍼블릭 도메인·CC)을 처음부터 끝까지 틀고, 녹음에서 찾은 박자에 화살표를 맞춤
// (녹음을 못 받으면 합성 오케스트라 소리). 맞히든 못 맞히든 음악은 똑같이 나옴. 잘 맞을수록 관객 호응 게이지가 차고 연주자들이 신나게 움직임
// 중간중간 왼손 동작: ✋ '왼손 올리기'(크레셴도: 왼손을 머리 위로 쭉 올려 게이지 채우기),
//                     ⊙ '왼손 터치'(왼쪽 위에 나온 동그라미를 왼손으로 짚어 악기 파트 불러내기). 그동안 화살표는 오른손만
import { burst, popup, outlinedText, rr, FONT } from "../fx.js?v=42";
import { rhythm, clock, CLASSICS, songOf, songPlan } from "../audio.js?v=42";
import * as REAL from "../realmusic.js?v=42";

const PERFECT = 0.1, GOOD = 0.22;   // 판정 시간 폭(초, 보통)
const SWING = 1.8;                  // 휘두르기로 인정하는 손 속도(어깨너비/초)
const ANGLE = 55;                   // 방향 허용 오차(도)
const TRAVEL = 2.0;                 // 삼각형이 위에서 지휘선까지 내려오는 시간(초, 보통)
// 손별 휘두를 방향 (화면 좌표: x 오른쪽 +, y 아래 +). 거울 화면이라 왼손이 화면 왼쪽
const DIR = {
  down: [[0, 1], [0, 1]], up: [[0, -1], [0, -1]],
  in: [[1, 0], [-1, 0]],                      // 두 손을 몸 가운데로 모으기
  out: [[-1, 0], [1, 0]],                     // 두 손을 바깥으로 벌리기
};
const LABEL = { down: "↓ 아래로 ↓", up: "↑ 위로 ↑", in: "→ 안쪽으로 모으기 ←", out: "← 바깥으로 벌리기 →" };
const PATTERN = { 4: ["down", "in", "out", "up"], 2: ["down", null, "up", null] };   // 쉬움은 2박 지휘
const SECTIONS = ["🎻", "🎺", "🎷", "🥁", "🎻", "🎺"];
const SINGLE = { down: "↓ 아래로", up: "↑ 위로", in: "← 안쪽으로", out: "→ 바깥으로" };   // 오른손만 휘두를 때
const EVENT_EVERY = 16, EVENT_LEN = 8;      // 왼손 동작: 16박(4마디)마다 8박(2마디) 동안
const RAISE_HOLD = 0.6, TOUCH_HOLD = 0.25;   // 성공으로 치는 유지 시간(초)

export default {
  id: "conductor", title: "지휘자", icon: "🎼", sec: 50, cursor: "🪄", cat: "move", bg: "#e8a87c", desc: "오케스트라 지휘하기", music: false,
  songs: [...CLASSICS.map(({ id, title, by, icon, bpm }) => ({ id, title, by, icon, bpm, real: REAL.has(id), synth: true })), ...REAL.extraSongs(CLASSICS.map(c => c.id))], demoSong: "ode",
  // 게임 시간 = 곡이 끝날 때까지 (실제 연주는 녹음 길이 그대로, 합성음은 50초에 가장 가깝게 곡 단위로)
  secFor: songId => { const r = REAL.ready(songId); return r ? r.duration + 1.0 : songPlan(CLASSICS.some(c => c.id === songId) ? songId : "ode", 50).sec; },
  prepare: songId => REAL.load(songId),                          // 노래를 고르면 녹음을 받아 박자를 찾음
  preview: songId => { if (!REAL.preview(songId)) rhythm.preview(songId); },
  stopPreview: () => { REAL.stopPreview(); rhythm.stopPreview(); },
  how: "화살표가 가로선 칸에 겹치는 순간 그 방향으로 손을 휘둘러요(왼쪽 화살표는 왼손). ✋가 나오면 왼손을 머리 위로 쭉, ⊙가 나오면 왼손으로 터치! 클래식 명곡 6곡",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, id = D.id || "normal", wide = D.reach;
    // 고른 곡: 실제 녹음만 있는 곡은 받아 둔 게 있어야 함 (없으면 환희의 송가 합성음으로)
    let sid = env.song || "ode"; const hasSynth = x => CLASSICS.some(c => c.id === x);
    if (!hasSynth(sid) && !REAL.ready(sid)) sid = "ode";
    const song = hasSynth(sid) ? songOf(sid) : { id: sid, title: REAL.RECORDINGS[sid].title, by: REAL.RECORDINGS[sid].by };
    const plan = songPlan(hasSynth(sid) ? sid : "ode", 50), pat = PATTERN[id === "easy" ? 2 : 4], travel = TRAVEL / D.speed;
    let t0 = null, spb = 0.6, nextJ = 8, notes = [], now = 0, lastT = null, energy = 0.7, flare = 0, events = [], raiseLv = 0;
    // 실제 연주: 녹음에서 찾은 박 중 너무 촘촘한 것은 건너뛰어 지휘할 박(cb)을 고름 (빠른 곡은 두 박에 한 번)
    const real = REAL.ready(song.id), rec = REAL.RECORDINGS[song.id];
    let cb = null, rpat = pat;
    if (real) {
      const minGap = { easy: 0.7, normal: 0.45, hard: 0.36 }[id] || 0.45; cb = [];
      for (const b of real.beats) if (!cb.length || b - cb[cb.length - 1] >= minGap * 0.92) cb.push(b);
      const gaps = cb.slice(1).map((b, i) => b - cb[i]).sort((p, q) => p - q); spb = gaps.length ? gaps[gaps.length >> 1] : 0.6;
      if (rec.meter === 2) rpat = id === "easy" ? ["down", null, "up", null] : ["down", "up"];
      if (rec.meter === 3) rpat = id === "easy" ? ["down", null, "up"] : ["down", "out", "up"];   // 3박(왈츠): 세모 지휘
      nextJ = 0;
    }
    const cnt = { PERFECT: 0, GOOD: 0, MISS: 0 }, ev = { ok: 0, all: 0 }, trail = [[], []];
    // 화살표 칸 크기: 한 박 간격보다 크면 겹치므로 빠른 곡은 조금 작게
    const lay = () => {
      const L = Math.min(z.w * 0.4, v.U * 0.32), lineY = v.H * 0.52, topY = v.H * 0.1, gap = (lineY - topY) / travel * spb;
      return { L, lineY, topY, xs: [z.cx - L * 0.36, z.cx + L * 0.36], s: Math.max(v.U * 0.028, Math.min(L * 0.16, gap / 2.5)) };
    };

    // 반 박(j)마다: 박마다 지휘 모양대로 (어려움은 더 빨리 내려오고 판정이 좁음)
    // 실제 연주: 지휘할 박 하나씩 (b = 박 번호)
    function addBeat(b) {
      const time = t0 + cb[b];
      if (b >= 8 && (b - 8) % EVENT_EVERY === 0 && b + EVENT_LEN < cb.length) {
        const type = ((b - 8) / EVENT_EVERY) % 2 ? "touch" : "raise";
        events.push({ type, start: time - 0.3, end: t0 + cb[b + EVENT_LEN], hold: 0, done: null, sec: events.length % 6, pos: null }); ev.all++;
      }
      const key = rpat[b % rpat.length];
      if (!key || b < 4) return;                        // 첫 네 박은 준비
      const left = events.some(e => time >= e.start + 0.3 && time < e.end);
      notes.push({ time, key, hands: left ? [1] : [0, 1], parts: [null, null], done: false });
    }
    // 지금 박 안에서 어디쯤인지(0~1)와 몇 번째 박인지
    function beatAt(t) {
      if (!cb) { const x = (t - t0) / spb; return { i: Math.floor(x), ph: x % 1 }; }
      let i = 0; while (i + 1 < cb.length && t0 + cb[i + 1] <= t) i++;
      const a = t0 + cb[i], b = i + 1 < cb.length ? t0 + cb[i + 1] : a + spb;
      return { i: t < a ? -1 : i, ph: Math.max(0, Math.min(1, (t - a) / (b - a))) };
    }
    function addStep(j) {
      if (j >= plan.endStep) return;                                   // 곡이 끝나면 지휘도 끝
      const time = t0 + j * spb / 2;
      if (j % 2 === 0) {
        const b = j / 2, key = pat[b % 4];
        // 왼손 동작 시작: 셋째 마디부터 16박마다, 올리기와 터치를 번갈아
        if (b >= 8 && (b - 8) % EVENT_EVERY === 0 && (b + EVENT_LEN) * 2 <= plan.endStep) {   // 곡 끝 전에 끝나는 것만
          const type = ((b - 8) / EVENT_EVERY) % 2 ? "touch" : "raise";
          events.push({ type, start: time - 0.3, end: t0 + (b + EVENT_LEN) * spb, hold: 0, done: null, sec: events.length % 6, pos: null }); ev.all++;
        }
        if (!key || b < 4) return;                        // 첫 마디는 준비
        const left = events.some(e => time >= e.start + 0.3 && time < e.end);   // 왼손 동작 중엔 오른손만
        notes.push({ time, key, hands: left ? [1] : [0, 1], parts: [null, null], done: false });
      }
    }
    function judgePart(n, k, name) {
      n.parts[k] = name; const Lo = lay(), x = Lo.xs[k], y = Lo.lineY;
      if (name === "MISS") { cnt.MISS++; energy = Math.max(0, energy - 0.12); env.miss(x, y + Lo.s * 2, null); return; }
      cnt[name]++; energy = Math.min(1, energy + (name === "PERFECT" ? 0.08 : 0.05)); flare = 1;
      env.award(name === "PERFECT" ? 2 : 1, x, y - Lo.s * 3.4);
      popup(x, y - Lo.s * 1.9, name === "PERFECT" ? "완벽!" : "좋아요", { size: v.U * 0.032, color: "#fff", stroke: name === "PERFECT" ? "#e0306a" : "#3d8bff", life: 0.5 });
      burst(x, y, { n: name === "PERFECT" ? 14 : 8, colors: ["#fff6a0", "#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.3, size: v.U * 0.014, life: 0.5 });
    }
    // 왼손 터치 자리: 왼쪽 어깨에서 바깥 위로 팔이 닿는 곳 (화살표 길과 겹치지 않게)
    function touchPos(P, sw) {
      const Lo = lay(), r = Math.max(v.U * 0.045, Math.min(sw * 0.4, v.U * 0.07));
      let x = z.cx - Lo.L * 1.1, y = v.H * 0.35;
      if (P && P[11].v) { x = P[11].x - sw * 1.1; y = P[11].y - sw * 0.6; }
      return { x: Math.max(z.x0 + r * 1.3, Math.min(z.cx - Lo.L * 0.7 - r, x)), y: Math.max(v.H * 0.2, Math.min(v.H * 0.6, y)), r };
    }
    const gaugePos = () => ({ x: z.x0 + Math.max(v.U * 0.07, z.w * 0.08), y: v.H * 0.3 });
    // 화살표 칸: 어두운 네모 + 굵은 금색 화살표 (방향 벡터 쪽을 가리킴). kind: note | frame(지휘선의 빈 칸)
    function tile(ctx, x, y, s, dir, alpha, kind, hot) {
      const T = s * 2.3;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
      rr(ctx, -T / 2, -T / 2, T, T, T * 0.22);
      if (kind === "frame") { ctx.lineWidth = Math.max(3, s * 0.16); ctx.strokeStyle = hot ? "#ffd400" : "rgba(255,255,255,.85)"; ctx.setLineDash([s * 0.35, s * 0.25]); ctx.stroke(); ctx.restore(); return; }
      ctx.shadowColor = "#ffb400"; ctx.shadowBlur = hot ? s * 1.6 : s * 0.5;
      ctx.fillStyle = hot ? "rgba(255,200,40,.95)" : "rgba(25,12,0,.82)"; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(3, s * 0.18); ctx.strokeStyle = "#ffcf3a"; ctx.stroke();
      ctx.rotate(Math.atan2(dir[1], dir[0]));
      const P = [[0.95, 0], [0.15, -0.72], [0.15, -0.3], [-0.85, -0.3], [-0.85, 0.3], [0.15, 0.3], [0.15, 0.72]];
      ctx.beginPath(); P.forEach(([px, py], i) => (i ? ctx.lineTo(px * s, py * s) : ctx.moveTo(px * s, py * s))); ctx.closePath();
      ctx.fillStyle = hot ? "#ffffff" : "#ffd400"; ctx.fill(); ctx.lineWidth = Math.max(2, s * 0.1); ctx.strokeStyle = hot ? "#c07a00" : "#fff6c0"; ctx.stroke();
      ctx.restore();
    }
    return {
      update() {
        if (t0 === null) {
          if (real) t0 = REAL.start(song.id) ?? clock() + 0.15;
          else { t0 = rhythm.start(song.id, { orch: true, loops: plan.loops }); spb = rhythm.spb; }
        }
        if (!real) rhythm.tick();
        now = clock();
        const dt = lastT === null ? 0.016 : Math.min(0.1, now - lastT); lastT = now;
        flare = Math.max(0, flare - dt * 3);
        if (real) while (nextJ < cb.length && t0 + cb[nextJ] - now < travel) addBeat(nextJ++);
        else while (t0 + nextJ * spb / 2 - now < travel) { addStep(nextJ); nextJ++; }
        const hands = env.tracker.hands;
        hands.forEach((h, k) => { const tr = trail[k]; if (h.vis) tr.push({ x: h.x, y: h.y, t: now }); else tr.length = 0; while (tr.length && now - tr[0].t > 0.3) tr.shift(); });
        const W = GOOD * wide;
        for (const n of notes) {
          if (n.done) continue;
          const d = now - n.time;
          for (const k of n.hands) {
            if (n.parts[k]) continue;
            const h = hands[k], want = DIR[n.key][k];
            if (Math.abs(d) <= W && h.vis && h.bodySpeed >= SWING * D.punch) {
              const dot = (h.vx * want[0] + h.vy * want[1]) / (h.speed || 1);
              if (dot >= Math.cos(ANGLE * Math.PI / 180)) judgePart(n, k, Math.abs(d) <= PERFECT * wide ? "PERFECT" : "GOOD");
            }
            if (!n.parts[k] && d > W) judgePart(n, k, "MISS");
          }
          if (n.hands.every(k => n.parts[k])) { n.done = true; n.doneAt = now; }
        }
        notes = notes.filter(n => !n.done || now - n.doneAt < 0.4);
        // 왼손 동작
        const P = env.tracker.pts, sw = P && P[11].v && P[12].v ? Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y) : v.U * 0.13;
        raiseLv = P && P[11].v && P[15].v ? Math.max(0, Math.min(1, (P[11].y + sw * 0.4 - P[15].y) / (sw * 1.8))) : 0;
        for (const e of events) {
          if (e.done || now < e.start) continue;
          if (e.type === "touch" && !e.pos) e.pos = touchPos(P, sw);
          let on = false;
          if (e.type === "raise") on = raiseLv >= 0.75;
          else { const h = hands[0]; on = h.vis && Math.hypot(h.x - e.pos.x, h.y - e.pos.y) < e.pos.r * 1.3 * wide; }
          e.hold = on ? e.hold + dt : Math.max(0, e.hold - dt * 0.5);
          if (e.hold >= (e.type === "raise" ? RAISE_HOLD : TOUCH_HOLD)) {
            e.done = "ok"; e.doneAt = now; ev.ok++; energy = Math.min(1, energy + 0.2); flare = 1;
            if (real) REAL.swell(4); else rhythm.accent(16);   // 효과음 대신 소리가 커짐(실제 연주) / 금관이 더해짐(합성음)
            const at = e.type === "raise" ? gaugePos() : e.pos;
            env.award(3, at.x, at.y - v.U * 0.08);
            popup(at.x + (e.type === "raise" ? v.U * 0.12 : 0), at.y + v.U * 0.06, e.type === "raise" ? "크레셴도!" : "브라보!", { size: v.U * 0.045, color: "#fff", stroke: "#e08a00", life: 1.0 });
            burst(at.x, at.y, { n: 24, colors: ["#fff6a0", "#ffd400", "#ffffff", "#ff9ae0"], shape: "star", speed: v.U * 0.7, gravity: v.U * 0.4, size: v.U * 0.018, life: 0.8 });
          } else if (now > e.end) { e.done = "miss"; e.doneAt = now; energy = Math.max(0, energy - 0.1); const at = e.type === "raise" ? gaugePos() : e.pos; env.miss(at.x, at.y, "놓쳤어요"); }
        }
        events = events.filter(e => !e.done || now - e.doneAt < 1);
      },
      draw(ctx) {
        if (t0 === null) now = clock();
        const U = v.U, Lo = lay(), BA = t0 !== null && now > t0 ? beatAt(now) : { i: -1, ph: 0 }, beatPh = BA.ph, pulse = Math.max(0, 1 - beatPh * 3);
        // 무대와 연주자 (잘할수록 크게 들썩임)
        const stY = v.H * 0.88;
        ctx.fillStyle = "rgba(90,40,20,.55)"; ctx.beginPath(); ctx.ellipse(z.cx, v.H * 1.04, z.w * 0.56, v.H * 0.2, 0, Math.PI, 0); ctx.fill();
        ctx.font = `${Math.round(U * 0.05)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const n = Math.max(4, Math.min(8, Math.round(z.w / (U * 0.11))));
        for (let i = 0; i < n; i++) {
          const x = z.x0 + z.w * (i + 0.5) / n, amp = (0.15 + 0.85 * energy) * (0.3 + 0.7 * pulse);
          ctx.globalAlpha = 0.45 + 0.55 * energy; ctx.fillText(SECTIONS[i % SECTIONS.length], x, stY - (i % 2) * U * 0.035 - amp * U * 0.014);
        }
        ctx.globalAlpha = 1;
        // 관객 호응 (음악 크기와는 상관없음)
        const gw = Math.min(z.w * 0.6, U * 0.5), gx = z.cx - gw / 2, gy = v.H * 0.125, gh = Math.max(8, U * 0.016);
        ctx.fillStyle = "rgba(0,0,0,.45)"; rr(ctx, gx, gy, gw, gh, gh / 2); ctx.fill();
        ctx.fillStyle = energy > 0.6 ? "#37d67a" : energy > 0.3 ? "#ffd400" : "#ff5a5a"; rr(ctx, gx, gy, Math.max(gh, gw * energy), gh, gh / 2); ctx.fill();
        outlinedText(ctx, "👏", gx - U * 0.025, gy + gh / 2, U * 0.03, "#fff", "#333", 2);
        // 지휘선 (맞히면 금빛으로 번쩍)
        const lx0 = Math.max(z.x0, z.cx - Lo.L * 1.6), lx1 = Math.min(z.x1, z.cx + Lo.L * 1.6), y = Lo.lineY;
        const lg = ctx.createLinearGradient(lx0, 0, lx1, 0);
        lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.5, flare > 0 ? `rgba(255,200,40,${0.6 + 0.4 * flare})` : "rgba(255,255,255,.85)"); lg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.save(); ctx.shadowColor = "#ffb400"; ctx.shadowBlur = U * 0.04 * flare;
        ctx.fillStyle = lg; ctx.fillRect(lx0, y - U * (0.004 + 0.01 * flare), lx1 - lx0, U * (0.008 + 0.02 * flare)); ctx.restore();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(z.cx - U * 0.012, y - U * 0.03); ctx.lineTo(z.cx + U * 0.012, y - U * 0.03); ctx.lineTo(z.cx, y - U * 0.012); ctx.closePath(); ctx.fill();
        // 지휘봉 자국
        ctx.lineCap = "round";
        trail.forEach(tr => { for (let i = 1; i < tr.length; i++) { const k = i / tr.length; ctx.strokeStyle = `rgba(255,236,150,${(0.15 + 0.7 * k).toFixed(2)})`; ctx.lineWidth = 2 + U * 0.012 * k; ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke(); } });
        // 화살표 길(어두운 띠)과 지휘선 위의 빈 칸
        const colW = Lo.L * 1.25;
        ctx.fillStyle = "rgba(0,0,0,.35)"; rr(ctx, z.cx - colW / 2, Lo.topY - Lo.s * 1.5, colW, y - Lo.topY + Lo.s * 3, Lo.s); ctx.fill();
        const nextN = notes.filter(n => !n.done && n.time > now - 0.15).sort((a, b) => a.time - b.time)[0];
        [0, 1].forEach(k => tile(ctx, Lo.xs[k], y, Lo.s, [0, 1], 1, "frame", flare > 0.5));
        // 내려오는 화살표 쌍
        const speed = (y - Lo.topY) / travel;
        for (const nt of notes) {
          const ny = y - (nt.time - now) * speed;
          if (ny < Lo.topY - Lo.s * 2) continue;
          const past = now > nt.time, fade = past ? Math.max(0, 1 - (now - nt.time) / 0.4) : Math.min(1, (ny - Lo.topY + Lo.s * 2) / (Lo.s * 4));
          for (const k of nt.hands) {
            const part = nt.parts[k];
            if (part === "MISS") continue;
            const hot = !!part, s = Lo.s * (hot ? 1 + 0.4 * (1 - fade) : 1);
            tile(ctx, Lo.xs[k], hot ? y : ny, s, DIR[nt.key][k], nt === nextN || hot ? fade : fade * 0.75, "note", hot);
          }
        }
        // 다음에 할 동작을 글자로 (지휘선 바로 아래)
        if (nextN && nextN.time - now < 1.2) {
          const txt = nextN.hands.length === 2 ? LABEL[nextN.key] : `오른손 ${SINGLE[nextN.key]}`;
          outlinedText(ctx, txt, z.cx, y + Lo.s * 2.3, Math.min(U * 0.045, z.w / 12), "#fff", "#8a5a00", 4);
        }
        // 왼손 동작
        for (const e of events) {
          if (now < e.start - 1.0) continue;
          const a = e.done ? Math.max(0, 1 - (now - e.doneAt)) : Math.min(1, (now - e.start + 1.0) / 0.5);
          const left = Math.max(0, Math.min(1, (e.end - now) / (e.end - e.start)));
          ctx.save(); ctx.globalAlpha = a;
          if (e.type === "raise") {
            // ✋ + 세로 게이지: 왼손을 올린 만큼 차오름, 위쪽 금색 칸까지
            const g = gaugePos(), gh = v.H * 0.38, gw = Math.max(14, U * 0.03), gx = g.x - gw / 2, gy = v.H * 0.24;
            ctx.fillStyle = "rgba(0,0,0,.5)"; rr(ctx, gx, gy, gw, gh, gw / 2); ctx.fill();
            ctx.fillStyle = "rgba(255,212,0,.35)"; rr(ctx, gx, gy, gw, gh * 0.25, gw / 2); ctx.fill();
            const lv = e.done === "ok" ? 1 : raiseLv, gr = ctx.createLinearGradient(0, gy + gh, 0, gy);
            gr.addColorStop(0, "#ff5a5a"); gr.addColorStop(0.5, "#ffd400"); gr.addColorStop(1, "#37d67a");
            ctx.fillStyle = gr; rr(ctx, gx, gy + gh * (1 - lv), gw, gh * lv, gw / 2); ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = "#ffd400"; rr(ctx, gx, gy, gw, gh, gw / 2); ctx.stroke();
            const bob = Math.sin(now * 8) * U * 0.01;
            ctx.shadowColor = "#ffb400"; ctx.shadowBlur = U * 0.03;
            outlinedText(ctx, "✋", g.x, gy - U * 0.05 + bob, U * 0.075, "#fff", "#c07a00", 3); ctx.shadowBlur = 0;
            if (!e.done) {
              const fs = Math.min(U * 0.034, z.w / 14); outlinedText(ctx, "왼손 위로 쭉!", Math.max(g.x, z.x0 + fs * 3.4), gy + gh + U * 0.04, fs, "#fff", "#c07a00", 3);   // 화면 밖으로 잘리지 않게
              ctx.strokeStyle = "#fff"; ctx.lineWidth = U * 0.008; ctx.beginPath(); ctx.arc(g.x, gy - U * 0.05, U * 0.055, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, e.hold / RAISE_HOLD)); ctx.stroke();
            }
          } else if (e.pos || !e.done) {
            // ⊙ 터치 동그라미 + 그 악기에 조명
            const Pp = e.pos || touchPos(env.tracker.pts, v.U * 0.13), sec = e.sec % n, sx = z.x0 + z.w * (sec + 0.5) / n;
            if (!e.done || e.done === "ok") {
              const cg = ctx.createLinearGradient(0, v.H * 0.12, 0, stY);
              cg.addColorStop(0, "rgba(255,240,170,0)"); cg.addColorStop(1, `rgba(255,240,170,${e.done ? 0.45 : 0.28})`);
              ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(sx - U * 0.015, v.H * 0.12); ctx.lineTo(sx + U * 0.015, v.H * 0.12); ctx.lineTo(sx + z.w * 0.09, stY + U * 0.04); ctx.lineTo(sx - z.w * 0.09, stY + U * 0.04); ctx.closePath(); ctx.fill();
            }
            ctx.fillStyle = e.done === "ok" ? "rgba(255,220,80,.7)" : "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.arc(Pp.x, Pp.y, Pp.r, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = U * 0.01; ctx.strokeStyle = "#ffffff"; ctx.stroke();
            ctx.beginPath(); ctx.arc(Pp.x, Pp.y, Pp.r * 0.35, 0, Math.PI * 2); ctx.stroke();
            if (!e.done) {
              ctx.strokeStyle = "#ffd400"; ctx.lineWidth = U * 0.008; ctx.beginPath(); ctx.arc(Pp.x, Pp.y, Pp.r * 1.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
              outlinedText(ctx, "왼손 터치!", Pp.x, Pp.y - Pp.r * 1.7, Math.min(U * 0.034, z.w / 14), "#fff", "#c07a00", 3);
            }
          }
          ctx.restore();
        }
        // 첫 마디: 준비 숫자
        if (t0 !== null && BA.i >= 0 && BA.i < 4) outlinedText(ctx, String(BA.i + 1), z.cx, v.H * 0.3, U * 0.1 * (1 + pulse * 0.2), "#fff", "#8a5a00");
        outlinedText(ctx, real ? `♪ ${song.title} · 연주 ${rec.performer} (${rec.license})` : `♪ ${song.title}`, z.cx, v.H * 0.965, Math.min(U * 0.028, z.w / 40), "#fff", "rgba(0,0,0,.6)", 3);
      },
      stop() { REAL.stop(); rhythm.stop(); },
      result: () => `${song.title} · 완벽 ${cnt.PERFECT} · 좋아요 ${cnt.GOOD} · 놓침 ${cnt.MISS} · 왼손 동작 ${ev.ok}/${ev.all}`,
      // 설명 시연용
      get notes() { return notes.filter(n => !n.done).map(n => ({ time: n.time, key: n.key, hands: n.hands, parts: n.parts })); },
      get now() { return now; },
      dir: (key, k) => DIR[key][k],
      get event() { const e = events.find(e => !e.done && now >= e.start); return e ? { type: e.type, pos: e.pos } : null; },
    };
  },
};
