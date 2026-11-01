// 지휘자: 오케스트라 지휘하기 (VR 지휘 게임 방식)
// 화면 가운데로 금색 삼각형(왼손·오른손 한 쌍)이 위에서 내려옴. 가로 지휘선에 닿는 순간
// 삼각형이 가리키는 방향으로 그 손을 휘두르기 (4박: 아래 ▼▼ → 안쪽 → 바깥쪽 → 위 ▲▲)
// 지휘가 잘 맞을수록 오케스트라 소리가 커지고 연주자들이 신나게 움직임, 놓치면 작아짐
import { burst, popup, outlinedText, rr, FONT } from "../fx.js?v=22";
import { sfx, rhythm, clock, SONGS, songOf, onsetAt } from "../audio.js?v=22";

const PERFECT = 0.1, GOOD = 0.22;   // 판정 시간 폭(초, 보통)
const SWING = 1.8;                  // 휘두르기로 인정하는 손 속도(어깨너비/초)
const ANGLE = 55;                   // 방향 허용 오차(도)
const TRAVEL = 2.0;                 // 삼각형이 위에서 지휘선까지 내려오는 시간(초, 보통)
// 손별 휘두를 방향 (화면 좌표: x 오른쪽 +, y 아래 +). 거울 화면이라 왼손이 화면 왼쪽
const DIR = {
  down: [[0, 1], [0, 1]], up: [[0, -1], [0, -1]],
  in: [[0.94, 0.34], [-0.94, 0.34]],          // 두 손을 몸 가운데로
  out: [[-0.94, 0.34], [0.94, 0.34]],         // 두 손을 바깥으로
};
const PATTERN = { 4: ["down", "in", "out", "up"], 2: ["down", null, "up", null] };   // 쉬움은 2박 지휘
const SECTIONS = ["🎻", "🎺", "🎷", "🥁", "🎻", "🎺"];

export default {
  id: "conductor", title: "지휘자", icon: "🎼", sec: 50, cursor: "🪄", cat: "move", bg: "#e8a87c", desc: "오케스트라 지휘하기", music: false,
  songs: SONGS.map(({ id, title, icon, bpm }) => ({ id, title, icon, bpm })), demoSong: "ode",
  how: "금색 삼각형이 내려와 가로선에 닿는 순간, 삼각형이 가리키는 방향으로 손을 휘둘러요. 왼쪽 삼각형은 왼손, 오른쪽은 오른손!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, id = D.id || "normal", wide = D.reach;
    const song = songOf(env.song || "ode"), pat = PATTERN[id === "easy" ? 2 : 4], travel = TRAVEL / D.speed;
    let t0 = null, spb = 0.6, nextJ = 8, notes = [], now = 0, lastT = null, energy = 0.7, lastLevel = -1, flare = 0, flick = 0;
    const cnt = { PERFECT: 0, GOOD: 0, MISS: 0 }, trail = [[], []];
    const lay = () => { const L = Math.min(z.w * 0.32, v.U * 0.24); return { L, lineY: v.H * 0.5, topY: v.H * 0.1, xs: [z.cx - L * 0.32, z.cx + L * 0.32], s: L * 0.15 }; };

    // 반 박(j)마다: 박마다 지휘 모양대로, 어려움은 가락의 엇박에 한 손 '톡'(아래)도 추가
    function addStep(j) {
      const time = t0 + j * spb / 2;
      if (j % 2 === 0) {
        const b = j / 2, key = pat[b % 4];
        if (!key || b < 4) return;                        // 첫 마디는 준비
        notes.push({ time, key, hands: [0, 1], parts: [null, null], done: false });
      } else if (id === "hard" && j > rhythm.INTRO && onsetAt(song, j)) {
        const k = (flick++) % 2;
        notes.push({ time, key: "down", hands: [k], parts: [null, null], done: false });
      }
    }
    function judgePart(n, k, name) {
      n.parts[k] = name; const Lo = lay(), x = Lo.xs[k], y = Lo.lineY;
      if (name === "MISS") { cnt.MISS++; energy = Math.max(0, energy - 0.12); env.miss(x, y + Lo.s * 2, null); return; }
      cnt[name]++; energy = Math.min(1, energy + (name === "PERFECT" ? 0.08 : 0.05)); flare = 1;
      env.award(name === "PERFECT" ? 2 : 1, x, y - Lo.s * 2.2);
      popup(x, y + Lo.s * 2.4, name === "PERFECT" ? "완벽!" : "좋아요", { size: v.U * 0.032, color: "#fff", stroke: name === "PERFECT" ? "#e0306a" : "#3d8bff", life: 0.5 });
      sfx.catch(env.player.combo);
      burst(x, y, { n: name === "PERFECT" ? 14 : 8, colors: ["#fff6a0", "#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.3, size: v.U * 0.014, life: 0.5 });
    }
    // 금색 삼각형 (방향 벡터 쪽을 가리킴)
    function tri(ctx, x, y, s, dir, alpha, hot) {
      const a = Math.atan2(dir[1], dir[0]);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = alpha;
      ctx.shadowColor = "#ffb400"; ctx.shadowBlur = s * (hot ? 1.4 : 0.8);
      ctx.beginPath(); ctx.moveTo(s * 1.05, 0); ctx.lineTo(-s * 0.7, -s * 0.9); ctx.lineTo(-s * 0.7, s * 0.9); ctx.closePath();
      const g = ctx.createLinearGradient(-s, 0, s, 0); g.addColorStop(0, "#ff9d00"); g.addColorStop(1, "#fff2a0");
      ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(2, s * 0.14); ctx.strokeStyle = "#5a3500"; ctx.lineJoin = "round"; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.35, 0); ctx.lineTo(-s * 0.35, -s * 0.38); ctx.lineTo(-s * 0.35, s * 0.38); ctx.closePath(); ctx.fillStyle = "rgba(90,53,0,.75)"; ctx.fill();
      ctx.restore();
    }
    return {
      update() {
        if (t0 === null) { t0 = rhythm.start(song.id, { orch: true }); spb = rhythm.spb; }
        now = clock();
        const dt = lastT === null ? 0.016 : Math.min(0.1, now - lastT); lastT = now;
        flare = Math.max(0, flare - dt * 3);
        while (t0 + nextJ * spb / 2 - now < travel) { addStep(nextJ); nextJ++; }
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
        if (Math.abs(energy - lastLevel) > 0.02) { rhythm.level(env.slot, energy); lastLevel = energy; }
      },
      draw(ctx) {
        if (t0 === null) now = clock();
        const U = v.U, Lo = lay(), beatPh = t0 !== null && now > t0 ? ((now - t0) / spb) % 1 : 0, pulse = Math.max(0, 1 - beatPh * 3);
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
        // 오케스트라 소리 크기
        const gw = Math.min(z.w * 0.6, U * 0.5), gx = z.cx - gw / 2, gy = v.H * 0.125, gh = Math.max(8, U * 0.016);
        ctx.fillStyle = "rgba(0,0,0,.45)"; rr(ctx, gx, gy, gw, gh, gh / 2); ctx.fill();
        ctx.fillStyle = energy > 0.6 ? "#37d67a" : energy > 0.3 ? "#ffd400" : "#ff5a5a"; rr(ctx, gx, gy, Math.max(gh, gw * energy), gh, gh / 2); ctx.fill();
        outlinedText(ctx, "🎵", gx - U * 0.025, gy + gh / 2, U * 0.03, "#fff", "#333", 2);
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
        // 내려오는 삼각형 쌍
        const speed = (y - Lo.topY) / travel;
        for (const nt of notes) {
          const ny = y - (nt.time - now) * speed;
          if (ny < Lo.topY - Lo.s * 2) continue;
          const past = now > nt.time, fade = past ? Math.max(0, 1 - (now - nt.time) / 0.4) : Math.min(1, (ny - Lo.topY + Lo.s * 2) / (Lo.s * 4));
          for (const k of nt.hands) {
            const part = nt.parts[k];
            if (part === "MISS") continue;
            const hot = !!part, s = Lo.s * (hot ? 1 + 0.5 * (1 - fade) : 1);
            tri(ctx, Lo.xs[k], hot ? y : ny, s, DIR[nt.key][k], fade, hot);
          }
        }
        // 첫 마디: 준비 숫자
        if (t0 !== null && now >= t0 && now < t0 + 4 * spb) outlinedText(ctx, String(Math.floor((now - t0) / spb) + 1), z.cx, v.H * 0.3, U * 0.1 * (1 + pulse * 0.2), "#fff", "#8a5a00");
        outlinedText(ctx, `♪ ${song.title}`, z.cx, v.H * 0.965, U * 0.028, "#fff", "rgba(0,0,0,.6)", 3);
      },
      stop() { rhythm.stop(); },
      result: () => `${song.title} · 완벽 ${cnt.PERFECT} · 좋아요 ${cnt.GOOD} · 놓침 ${cnt.MISS}`,
      // 설명 시연용
      get notes() { return notes.filter(n => !n.done).map(n => ({ time: n.time, key: n.key, hands: n.hands, parts: n.parts })); },
      get now() { return now; },
      dir: (key, k) => DIR[key][k],
    };
  },
};
