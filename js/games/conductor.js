// 지휘자: 오케스트라 지휘하기 (닌텐도 스위치 '마에스트로' 같은 방식)
// 1) 박자마다 지휘 모양(아래 → 왼쪽 → 오른쪽 → 위) 자리에 원이 나오고, 원이 작아져 딱 맞을 때 손(지휘봉)으로 지나가기
// 2) 조명이 비춘 악기 파트는 손으로 가리켜 연주 시키기 (그동안 박자 원은 쉼)
// 3) 지휘가 잘 맞을수록 오케스트라 소리가 커지고, 놓치면 작아짐
import { burst, popup, outlinedText, rr, FONT } from "../fx.js?v=21";
import { sfx, rhythm, clock, SONGS, songOf } from "../audio.js?v=21";

const PERFECT = 0.09, GOOD = 0.22;    // 판정 시간 폭(초, 보통)
// 박자 자리 (몸 중심 기준, R 단위). 화면은 거울이라 '왼쪽'이 화면 왼쪽
const SPOT = { down: [0, 1.0], left: [-1.1, 0.35], right: [1.1, 0.35], up: [0, -0.75] };
const PATTERN = { 4: ["down", "left", "right", "up"], 2: ["down", null, "up", null] };   // 쉬움은 2박 지휘
const SECTIONS = [
  { name: "바이올린", icon: "🎻", color: "#ff9f43" }, { name: "트럼펫", icon: "🎺", color: "#feca57" },
  { name: "색소폰", icon: "🎷", color: "#48dbfb" }, { name: "북", icon: "🥁", color: "#ff6b6b" },
];
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

export default {
  id: "conductor", title: "지휘자", icon: "🎼", sec: 50, cursor: "🪄", cat: "move", bg: "#e8a87c", desc: "오케스트라 지휘하기", music: false,
  songs: SONGS.map(({ id, title, icon, bpm }) => ({ id, title, icon, bpm })), demoSong: "ode",
  how: "박자마다 빛나는 원이 나와요. 원이 작아져 딱 맞을 때 손으로 지나가요(아래 → 왼쪽 → 오른쪽 → 위). 조명이 비춘 악기는 손으로 가리켜요!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, id = D.id || "normal", wide = D.reach;
    const song = songOf(env.song || "ode"), pat = PATTERN[id === "easy" ? 2 : 4];
    const cueEvery = id === "hard" ? 8 : 16;             // 파트 지시 간격(박)
    let t0 = null, spb = 0.6, seed = 1, nextB = 4, beats = [], cues = [], now = 0, lastT = null, energy = 0.7, lastLevel = -1;
    const cnt = { PERFECT: 0, GOOD: 0, MISS: 0 }, cueCnt = { ok: 0, all: 0 }, bounce = [0, 0, 0, 0], trail = [[], []];
    const anchor = { x: z.cx, y: v.H * 0.42, sw: v.U * 0.13, init: false };
    function follow(dt) {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return;
      const x = (p[11].x + p[12].x) / 2, y = (p[11].y + p[12].y) / 2, sw = Math.max(v.U * 0.07, Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y));
      if (!anchor.init) { Object.assign(anchor, { x, y, sw, init: true }); return; }
      const a = Math.min(1, dt * 2); anchor.x += (x - anchor.x) * a; anchor.y += (y - anchor.y) * a; anchor.sw += (sw - anchor.sw) * a;
    }
    const RR = () => Math.max(v.U * 0.12, Math.min(anchor.sw * 1.3, z.w * 0.3));
    const rad = () => Math.max(v.U * 0.045, Math.min(anchor.sw * 0.42, v.U * 0.07, z.w * 0.11)) * wide;   // 너무 크지 않게
    function posOf(key) {
      const R = RR(), [fx, fy] = SPOT[key], r = rad();
      return { x: Math.max(z.x0 + r, Math.min(z.x1 - r, anchor.x + fx * R)), y: Math.max(v.H * 0.2, Math.min(v.H * 0.8, anchor.y + fy * R)), r };
    }
    // 악기 자리(화면 아래 무대)와 가리킬 자리(허리 높이)
    const seatX = i => z.x0 + z.w * (0.14 + 0.24 * i);
    function cuePos(i) {
      const R = RR(), r = rad() * 1.15;
      return { x: Math.max(z.x0 + r, Math.min(z.x1 - r, anchor.x + (i - 1.5) * R * 0.75)), y: Math.min(v.H * 0.78, anchor.y + R * 0.9), r };   // 팔이 닿는 허리 높이
    }
    function judgeBeat(b, name) {
      b.done = name; b.doneAt = now; cnt[name]++;
      const P = posOf(b.key);
      if (name === "MISS") { energy = Math.max(0, energy - 0.18); env.miss(P.x, P.y - P.r * 1.4, null); return; }
      energy = Math.min(1, energy + (name === "PERFECT" ? 0.12 : 0.07));
      env.award(name === "PERFECT" ? 2 : 1, P.x, P.y - P.r * 1.5);
      popup(P.x, P.y + P.r * 1.6, name === "PERFECT" ? "완벽!" : "좋아요", { size: v.U * 0.035, color: "#fff", stroke: name === "PERFECT" ? "#e0306a" : "#3d8bff", life: 0.6 });
      sfx.catch(env.player.combo);
      burst(P.x, P.y, { n: name === "PERFECT" ? 14 : 8, colors: ["#fff6a0", "#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.45, gravity: v.U * 0.3, size: v.U * 0.014, life: 0.5 });
      bounce.forEach((_, i) => { bounce[i] = Math.max(bounce[i], 0.5); });
    }
    function addBeat(b) {
      // 파트 지시: 정해진 간격마다, 그 뒤 3박은 박자 원을 쉼
      if (b >= 8 && b % cueEvery === 0) {
        const sec = Math.floor(hash(seed, b) * 4);
        cues.push({ b, sec, start: t0 + b * spb - 0.4, end: t0 + (b + 3) * spb, hold: 0, done: null }); cueCnt.all++;
      }
      if (cues.some(c => b >= c.b && b < c.b + 3)) return;
      const key = pat[b % 4];
      if (!key) return;
      beats.push({ b, key, time: t0 + b * spb, best: Infinity, done: null, num: (b % 4) + 1 });
    }
    return {
      update() {
        if (t0 === null) { t0 = rhythm.start(song.id, { orch: true }); spb = rhythm.spb; seed = rhythm.seed; }
        now = clock();
        const dt = lastT === null ? 0.016 : Math.min(0.1, now - lastT); lastT = now;
        follow(dt);
        for (let i = 0; i < 4; i++) bounce[i] = Math.max(0, bounce[i] - dt * 1.5);
        while (t0 + nextB * spb - now < spb * 1.15) { addBeat(nextB); nextB++; }
        const hands = env.tracker.hands;
        hands.forEach((h, k) => { const tr = trail[k]; if (h.vis) tr.push({ x: h.x, y: h.y, t: now }); else tr.length = 0; while (tr.length && now - tr[0].t > 0.35) tr.shift(); });
        const inside = P => hands.some(h => h.vis && Math.hypot(h.x - P.x, h.y - P.y) < P.r * 1.25);
        for (const b of beats) {
          if (b.done) continue;
          const d = now - b.time, ad = Math.abs(d);
          if (ad <= GOOD * wide && inside(posOf(b.key))) {
            b.best = Math.min(b.best, ad);
            if (ad <= PERFECT * wide) judgeBeat(b, "PERFECT");
          }
          if (!b.done && d > GOOD * wide) judgeBeat(b, b.best <= GOOD * wide ? "GOOD" : "MISS");
        }
        for (const c of cues) {
          if (c.done || now < c.start) continue;
          const P = cuePos(c.sec);
          if (inside(P)) c.hold += dt;
          if (c.hold >= 0.3) {
            c.done = "ok"; c.doneAt = now; cueCnt.ok++; energy = Math.min(1, energy + 0.2); bounce[c.sec] = 1.5;
            rhythm.accent(16); env.award(3, P.x, P.y - P.r * 1.5); sfx.fever();
            popup(P.x, P.y + P.r * 1.7, `${SECTIONS[c.sec].name} 브라보!`, { size: v.U * 0.045, color: "#fff", stroke: SECTIONS[c.sec].color, life: 1.0 });
          } else if (now > c.end) { c.done = "miss"; c.doneAt = now; energy = Math.max(0, energy - 0.15); env.miss(P.x, P.y, "파트를 놓쳤어요"); }
        }
        beats = beats.filter(b => !b.done || now - b.doneAt < 0.35);
        cues = cues.filter(c => !c.done || now - c.doneAt < 0.8);
        if (Math.abs(energy - lastLevel) > 0.02) { rhythm.level(env.slot, energy); lastLevel = energy; }
      },
      draw(ctx) {
        if (t0 === null) { now = clock(); follow(0.5); }
        const U = v.U, beatPh = t0 !== null && now > t0 ? ((now - t0) / spb) % 1 : 0, pulse = Math.max(0, 1 - beatPh * 3);
        // 무대와 연주자
        const stY = v.H * 0.86;
        ctx.fillStyle = "rgba(90,40,20,.55)"; ctx.beginPath(); ctx.ellipse(z.cx, v.H * 1.02, z.w * 0.55, v.H * 0.2, 0, Math.PI, 0); ctx.fill();
        const act = cues.find(c => !c.done && now >= c.start - 0.6);
        SECTIONS.forEach((S, i) => {
          const x = seatX(i), lit = act && act.sec === i;
          if (lit) {   // 조명
            const g = ctx.createLinearGradient(0, v.H * 0.1, 0, stY);
            g.addColorStop(0, "rgba(255,250,200,0)"); g.addColorStop(1, "rgba(255,250,200,.42)");
            ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - z.w * 0.02, v.H * 0.1); ctx.lineTo(x + z.w * 0.02, v.H * 0.1); ctx.lineTo(x + z.w * 0.11, stY + U * 0.05); ctx.lineTo(x - z.w * 0.11, stY + U * 0.05); ctx.closePath(); ctx.fill();
          }
          const amp = (0.15 + 0.85 * energy) * (0.4 + pulse * 0.6) + bounce[i];
          ctx.font = `${Math.round(U * 0.055)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          [-1, 0, 1].forEach(o => ctx.fillText(S.icon, x + o * z.w * 0.055, stY - (o ? 0 : U * 0.03) - amp * U * 0.012 * (o === 0 ? 1 : 0.7)));
          if (lit) outlinedText(ctx, S.name, x, stY + U * 0.05, U * 0.028, "#fff", S.color, 3);
        });
        // 오케스트라 소리 크기
        const gw = Math.min(z.w * 0.6, U * 0.5), gx = z.cx - gw / 2, gy = v.H * 0.125, gh = Math.max(8, U * 0.016);
        ctx.fillStyle = "rgba(0,0,0,.45)"; rr(ctx, gx, gy, gw, gh, gh / 2); ctx.fill();
        ctx.fillStyle = energy > 0.6 ? "#37d67a" : energy > 0.3 ? "#ffd400" : "#ff5a5a"; rr(ctx, gx, gy, Math.max(gh, gw * energy), gh, gh / 2); ctx.fill();
        outlinedText(ctx, "🎵", gx - U * 0.025, gy + gh / 2, U * 0.03, "#fff", "#333", 2);
        // 지휘봉 자국
        ctx.lineCap = "round";
        trail.forEach(tr => { for (let i = 1; i < tr.length; i++) { const k = i / tr.length; ctx.strokeStyle = `rgba(255,236,150,${(0.15 + 0.7 * k).toFixed(2)})`; ctx.lineWidth = 2 + U * 0.012 * k; ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke(); } });
        // 파트 지시 원 (가리킬 자리 → 악기까지 점선)
        for (const c of cues) {
          if (now < c.start - 0.6) continue;
          const P = cuePos(c.sec), S = SECTIONS[c.sec], a = c.done ? Math.max(0, 1 - (now - c.doneAt) / 0.8) : 1;
          ctx.globalAlpha = a;
          ctx.setLineDash([U * 0.012, U * 0.01]); ctx.strokeStyle = S.color; ctx.lineWidth = U * 0.006;
          ctx.beginPath(); ctx.moveTo(P.x, P.y + P.r); ctx.lineTo(seatX(c.sec), stY - U * 0.05); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = c.done === "ok" ? "rgba(255,240,150,.6)" : "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.arc(P.x, P.y, P.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = S.color; ctx.lineWidth = U * 0.012; ctx.stroke();
          if (!c.done) { ctx.strokeStyle = "#fff"; ctx.lineWidth = U * 0.01; ctx.beginPath(); ctx.arc(P.x, P.y, P.r * 1.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, c.hold / 0.3)); ctx.stroke(); }
          outlinedText(ctx, S.icon, P.x, P.y, P.r * 0.95, "#fff", "#333", 2);
          if (!c.done) outlinedText(ctx, "가리키기!", P.x, P.y - P.r * 1.55, U * 0.032, "#fff", S.color, 3);
          ctx.globalAlpha = 1;
        }
        // 박자 원: 지휘 모양을 따라 점선으로 이어 줌
        const live = beats.filter(b => !b.done).sort((a, b) => a.time - b.time);
        if (live.length > 1) {
          ctx.setLineDash([U * 0.01, U * 0.012]); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = U * 0.006; ctx.beginPath();
          live.slice(0, 3).forEach((b, i) => { const P = posOf(b.key); i ? ctx.lineTo(P.x, P.y) : ctx.moveTo(P.x, P.y); }); ctx.stroke(); ctx.setLineDash([]);
        }
        for (const b of beats) {
          const P = posOf(b.key);
          if (b.done) {
            const a = Math.max(0, 1 - (now - b.doneAt) / 0.35);
            ctx.globalAlpha = a; ctx.strokeStyle = b.done === "MISS" ? "#999" : "#ffd400"; ctx.lineWidth = U * 0.01;
            ctx.beginPath(); ctx.arc(P.x, P.y, P.r * (1 + (1 - a) * 0.6), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; continue;
          }
          const k = (b.time - now) / spb;        // 1 → 0: 한 박 전에 나타나서 작아짐
          if (k > 1.15) continue;
          const first = b === live[0];
          ctx.globalAlpha = first ? 1 : 0.5;
          const g = ctx.createRadialGradient(P.x, P.y, P.r * 0.1, P.x, P.y, P.r);
          g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(1, "rgba(255,214,90,.35)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x, P.y, P.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#ffd400"; ctx.lineWidth = U * 0.008; ctx.stroke();
          if (first && k > -0.2) { ctx.save(); ctx.beginPath(); ctx.rect(z.x0, 0, z.w, v.H); ctx.clip(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = U * 0.009; ctx.beginPath(); ctx.arc(P.x, P.y, P.r * (1 + 1.6 * Math.max(0, k)), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }   // 다가오는 링은 자기 구역 안에서만
          outlinedText(ctx, String(b.num), P.x, P.y, P.r * 0.8, "#8a5a00", "#fff", 3);
          ctx.globalAlpha = 1;
        }
        // 첫 마디: 준비 숫자
        if (t0 !== null && now >= t0 && now < t0 + 4 * spb) outlinedText(ctx, String(Math.floor((now - t0) / spb) + 1), z.cx, v.H * 0.3, U * 0.1 * (1 + pulse * 0.2), "#fff", "#8a5a00");
        outlinedText(ctx, `♪ ${song.title}`, z.cx, v.H * 0.965, U * 0.028, "#fff", "rgba(0,0,0,.6)", 3);
      },
      stop() { rhythm.stop(); },
      result: () => `${song.title} · 박자 완벽 ${cnt.PERFECT} · 좋아요 ${cnt.GOOD} · 놓침 ${cnt.MISS} · 파트 지시 ${cueCnt.ok}/${cueCnt.all}`,
      // 설명 시연용
      get beats() { return beats.filter(b => !b.done).map(b => ({ ...posOf(b.key), time: b.time, key: b.key })); },
      get cue() { const c = cues.find(c => !c.done && now >= c.start); return c ? cuePos(c.sec) : null; },
      get now() { return now; },
      get spb() { return spb; },
    };
  },
};
