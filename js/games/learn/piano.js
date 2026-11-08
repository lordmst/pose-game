// 계이름 피아노: 화면 위쪽 건반 8개(도레미파솔라시도)를 손으로 눌러 소리 내기. 들려준 가락을 그대로 따라 치기(기억 놀이)
// 맞히면 한 음씩 길어짐(최대 8음). 어려움은 동요 첫 소절(학교종·나비야·작은별·산토끼)을 앞에서부터 늘려 가며 익힘
// 2인: 각자 자기 건반·자기 가락으로 따로 진행
import { burst, popup, rr, outlinedText, FONT, rnd, shade } from "../../fx.js?v=76";
import { sfx, settings } from "../../audio.js?v=76";

const KEYS = [
  ["도", "#ff5a5a", 60], ["레", "#ff9f43", 62], ["미", "#ffd23f", 64], ["파", "#37d67a", 65],
  ["솔", "#36c5f0", 67], ["라", "#3d7bff", 69], ["시", "#a35bff", 71], ["도", "#ff7ac6", 72],
];
const DWELL = 0.12;     // 손이 건반 안에 이만큼 있으면 눌림 (스치기만 한 건반은 안 눌림)
const GAP = 0.6;        // 들려줄 때 음 사이 간격(초)
const WAIT = 5;         // 다음 음을 이만큼(초) 안 누르면 다시 들려줌
const MAXLEN = 8;
const START = { easy: 2, normal: 3, hard: 4 };
// 동요 첫 소절 (건반 번호 0=도 … 7=높은 도)
const SONGS = [
  ["학교종", [4, 4, 5, 5, 4, 4, 2, 4, 4, 2, 2, 1]],
  ["나비야", [4, 2, 2, 3, 1, 1, 0, 1, 2, 3, 4, 4, 4]],
  ["작은별", [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0]],
  ["산토끼", [4, 2, 2, 4, 2, 0, 1, 2, 1, 0, 2, 4]],
];

/* ---------- 피아노 소리 (이 파일 안에서 합성) ----------
   아이패드는 사용자가 화면을 누를 때 소리 장치를 깨워야 하므로, 첫 터치 때 만들어 둠 */
let pac = null, pbus = null;
function audio() {
  try {
    if (!pac) { pac = new (window.AudioContext || window.webkitAudioContext)(); pbus = pac.createGain(); pbus.connect(pac.destination); }
    if (pac.state === "suspended") pac.resume();
  } catch (e) { pac = null; }
  return pac;
}
if (typeof window !== "undefined") ["pointerdown", "touchend", "keydown"].forEach(ev => window.addEventListener(ev, () => audio(), { once: true, passive: true }));
export function playNote(midiNum, when = 0, len = 1.1) {
  if (!settings.sfx) return;
  const ac = audio(); if (!ac) return;
  const t0 = ac.currentTime + when + 0.01, f = 440 * Math.pow(2, (midiNum - 69) / 12), vol = 0.32 * (settings.vol.sfx ?? 0.8);
  const g = ac.createGain(); g.connect(pbus);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(vol * 0.35, t0 + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(f * 8, t0); lp.frequency.exponentialRampToValueAtTime(f * 2, t0 + len); lp.connect(g);
  // 배음을 섞어 피아노처럼 (기음 + 2·3·4배음, 위로 갈수록 작게)
  [[1, 1, "triangle"], [2, 0.45, "sine"], [3, 0.2, "sine"], [4, 0.1, "sine"]].forEach(([m, a, type]) => {
    const o = ac.createOscillator(), og = ac.createGain(); o.type = type; o.frequency.value = f * m * (m > 1 ? 1.001 : 1); og.gain.value = a;
    o.connect(og); og.connect(lp); o.start(t0); o.stop(t0 + len + 0.05);
  });
}

export default {
  id: "piano", title: "계이름 피아노", icon: "🎹", sec: 60, cursor: "", cat: "learn", bg: "#ffc6ff", desc: "들은 가락 따라 치기",
  how: "위쪽 건반에 손을 대면 소리가 나요. 먼저 들려주는 가락을 잘 듣고, 같은 순서로 건반을 눌러요. 맞히면 한 음씩 길어져요!",
  create(env) {
    const z = env.zone, v = env.view, lvl = env.diff.id;
    let seq = [], len = START[lvl] || 3, song = null, songName = "", phase = "intro", t = 0, pt = 0, idx = 0, waitT = 0, okN = 0, badN = 0, best = 0;
    let lit = -1, litT = 0, bigT = 0, bigK = -1, flash = 0, wrongK = -1;
    const keyState = KEYS.map(() => ({ dwell: 0, down: false, glow: 0 }));
    // 건반 자리: 구역 너비의 거의 전부, 화면 높이 22%~48% (손을 어깨 위로 들면 닿는 높이)
    const kb = () => { const w = Math.min(z.w * 0.94, v.U * 1.9), x = z.x0 + (z.w - w) / 2; return { x, y: v.H * 0.22, w, h: v.H * 0.26, kw: w / 8 }; };
    const keyRect = k => { const b = kb(); return { x: b.x + k * b.kw, y: b.y, w: b.kw, h: b.h, cx: b.x + (k + 0.5) * b.kw, cy: b.y + b.h * 0.5 }; };
    function newSeq() {
      if (lvl === "hard") { const s = SONGS[rnd(0, SONGS.length - 1)]; song = s[1]; songName = s[0]; seq = song.slice(); }
      else {
        song = null; songName = ""; seq = [rnd(0, 7)];
        while (seq.length < MAXLEN) { let n = seq[seq.length - 1] + rnd(-2, 2); n = Math.max(0, Math.min(7, n)); seq.push(n); }   // 가까운 음으로 이어지는 가락
      }
    }
    const curLen = () => Math.min(len, seq.length);
    function listen(delay = 0.9) { phase = "listen"; pt = -delay; idx = 0; lit = -1; }
    newSeq();
    function press(k) {
      const S = keyState[k]; S.glow = 1; bigK = k; bigT = 0.9;
      playNote(KEYS[k][2]);
      const r = keyRect(k);
      if (phase !== "play") { burst(r.cx, r.cy, { n: 6, colors: [KEYS[k][1], "#fff"], shape: "dot", speed: v.U * 0.3, gravity: v.U * 0.5, size: v.U * 0.01, life: 0.4 }); return; }
      if (k === seq[idx]) {
        idx++; waitT = 0;
        burst(r.cx, r.cy, { n: 10, colors: [KEYS[k][1], "#fff", "#ffd400"], shape: "star", speed: v.U * 0.45, gravity: v.U * 0.5, size: v.U * 0.013, life: 0.5 });
        if (idx >= curLen()) {        // 가락 끝까지 맞힘
          okN++; best = Math.max(best, curLen());
          env.award(Math.max(1, curLen() - 1), z.cx, kb().y + kb().h + v.U * 0.08);
          popup(z.cx, v.H * 0.66, curLen() >= MAXLEN || curLen() >= seq.length ? "가락 완성!" : "잘했어요! 한 음 더", { size: v.U * 0.05, color: "#fff", stroke: "#2fb65a", life: 1.1 });
          setTimeout(() => sfx.catch(env.player.combo), 250);
          flash = 1;
          if (curLen() >= Math.min(MAXLEN, seq.length)) { newSeq(); len = START[lvl] || 3; } else len++;
          phase = "good"; pt = 0;
        }
      } else {
        badN++; wrongK = k; flash = -1; sfx.bad(); env.miss(r.cx, r.cy + r.h * 0.6, `${KEYS[seq[idx]][0]} 였어요`);
        phase = "bad"; pt = 0;
      }
    }
    listen(1.2);
    return {
      update(dt) {
        t += dt; pt += dt; litT = Math.max(0, litT - dt); bigT = Math.max(0, bigT - dt); flash *= Math.pow(0.1, dt);
        keyState.forEach(S => { S.glow = Math.max(0, S.glow - dt * 2.5); });
        if (phase === "intro") return;
        if (phase === "listen") {
          // 가락 들려주기: GAP 간격으로 건반이 빛나며 소리
          const i = Math.floor(pt / GAP);
          if (pt >= 0 && i < curLen() && i !== lit) { lit = i; litT = GAP * 0.8; const k = seq[i]; keyState[k].glow = 1; playNote(KEYS[k][2]); }
          if (pt >= curLen() * GAP + 0.2) { phase = "play"; idx = 0; waitT = 0; lit = -1; if (env.mode === 1 && t < 4) env.speak("따라 쳐요!"); }
        } else if (phase === "good" || phase === "bad") {
          if (pt > (phase === "good" ? 1.2 : 1.4)) listen(0.3);
        } else if (phase === "play") {
          waitT += dt;
          if (waitT > WAIT) { popup(z.cx, v.H * 0.66, "다시 들어 봐요", { size: v.U * 0.04, color: "#fff", stroke: "#555" }); listen(0.3); }
        }
        // 건반 누르기: 손이 건반 안에 잠깐 머물면 눌림. 손이 빠져나가야 다시 누를 수 있음
        const hands = env.tracker.hands.filter(h => h.vis);
        KEYS.forEach((K, k) => {
          const r = keyRect(k), S = keyState[k];
          const inside = hands.some(h => h.x >= r.x && h.x < r.x + r.w && h.y >= r.y - r.h * 0.1 && h.y <= r.y + r.h);
          if (!inside) { S.dwell = 0; S.down = false; return; }
          S.dwell += dt;
          if (!S.down && S.dwell >= DWELL && phase !== "listen") { S.down = true; press(k); }
        });
      },
      draw(ctx) {
        const b = kb(), U = v.U;
        // 위쪽 안내
        const msg = phase === "listen" ? "🎵 잘 들어요" : phase === "play" ? "따라 쳐요!" : phase === "good" ? "딩동댕!" : phase === "bad" ? "다시 들어 봐요" : "";
        const fs = Math.min(U * 0.048, z.w / 11);
        outlinedText(ctx, (songName && phase !== "bad" ? `${songName} · ` : "") + msg, z.cx, v.H * 0.15, fs, "#fff", phase === "bad" ? "#d02020" : "#7a2fbf", 4);
        // 진행 점: 몇 번째 음까지 쳤는지
        const n = curLen(), dr = Math.min(U * 0.016, b.w / (n * 5)), dy = v.H * 0.15 + fs * 0.85;
        for (let i = 0; i < n; i++) {
          const x = z.cx + (i - (n - 1) / 2) * dr * 3.2, on = phase === "play" ? i < idx : phase === "listen" ? i <= lit : phase === "good";
          ctx.fillStyle = on ? (phase === "listen" ? KEYS[seq[i]][1] : "#37d67a") : "rgba(255,255,255,.6)";
          ctx.beginPath(); ctx.arc(x, dy, dr, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.stroke();
        }
        // 건반
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, b.x + 5, b.y + 8, b.w, b.h, U * 0.02); ctx.fill();
        KEYS.forEach(([name, col], k) => {
          const r = keyRect(k), S = keyState[k], g = S.glow, pad = r.w * 0.05;
          const bad = phase === "bad" && wrongK === k, want = phase === "bad" && seq[idx] === k;
          ctx.fillStyle = g > 0 ? shade(col, 0.35 * g) : shade(col, -0.05);
          rr(ctx, r.x + pad, r.y + (S.dwell > 0 ? U * 0.008 : 0), r.w - pad * 2, r.h, U * 0.02); ctx.fill();
          ctx.lineWidth = g > 0.3 || want ? U * 0.01 : U * 0.004; ctx.strokeStyle = want ? "#ffffff" : bad ? "#333" : g > 0.3 ? "#fff" : shade(col, -0.4); ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,.35)"; rr(ctx, r.x + pad * 2, r.y + U * 0.01, r.w - pad * 4, r.h * 0.18, U * 0.012); ctx.fill();
          outlinedText(ctx, name, r.cx, r.y + r.h * 0.72, Math.min(r.w * 0.5, U * 0.07), "#fff", shade(col, -0.45), 3);
          if (S.dwell > 0 && !S.down) { ctx.strokeStyle = "#ffd400"; ctx.lineWidth = U * 0.008; ctx.beginPath(); ctx.arc(r.cx, r.y + r.h * 0.35, r.w * 0.28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, S.dwell / DWELL)); ctx.stroke(); }
        });
        // 방금 누른 계이름을 크게
        if (bigT > 0 && bigK >= 0) {
          ctx.save(); ctx.globalAlpha = Math.min(1, bigT * 2);
          const s = 1 + (0.9 - bigT) * 0.4;
          outlinedText(ctx, KEYS[bigK][0], keyRect(bigK).cx < z.x0 + U * 0.15 ? z.x0 + U * 0.15 : keyRect(bigK).cx > z.x1 - U * 0.15 ? z.x1 - U * 0.15 : keyRect(bigK).cx, b.y + b.h + U * 0.1, U * 0.11 * s, "#fff", KEYS[bigK][1], 6);
          ctx.restore();
        }
        if (phase === "play" && waitT < 2.5 && idx === 0) outlinedText(ctx, "손을 위로 올려 건반에 대요", z.cx, b.y + b.h + U * 0.21, Math.min(U * 0.035, z.w / 15), "#fff", "#555", 3);
        if (best) outlinedText(ctx, `최고 ${best}음`, z.x0 + Math.min(z.w * 0.14, U * 0.13), v.H * 0.15, Math.min(U * 0.03, z.w / 18), "#fff", "#555", 3);
      },
      result: () => `완성한 가락 ${okN} · 최고 ${best}음 · 틀림 ${badN}`,
      // 설명 시연·점검용
      get keys() { return KEYS.map((K, k) => ({ ...keyRect(k), name: K[0] })); },
      get target() { return phase === "play" ? seq[idx] : -1; },
      get phase() { return phase; },
      get idx() { return idx; },
    };
  },
  demo: {
    dur: 24,
    run(T, g, p, S, say) {
      const u = p.u, ks = g.keys, tg = g.target, sh = p.pts && p.pts[12];
      p.hands.forEach(h => { h.shape = "open"; }); p.active = -1; p.walk = 1.4;
      if (T < 3.5) say("계이름 피아노! 위쪽 건반에 손을 대면 소리가 나요");
      else if (g.phase === "listen") say("먼저 가락을 잘 들어요");
      else if (g.phase === "play") say("들은 순서대로 건반을 눌러요");
      else if (g.phase === "good") say("맞히면 한 음씩 길어져요!");
      if (T > 21) { say("이제 직접 해 봐요!"); p.rest(0, "cheer"); p.rest(1, "cheer"); return; }
      p.rest(0, "down");
      if (tg < 0 || !sh) { p.rest(1, "down"); S.k = -1; return; }
      const K = ks[tg];
      // 새 건반: 손을 아래로 뺐다가 건반 바로 아래에서 위로 쏙 (다른 건반을 스치지 않게)
      if (S.k !== tg || S.i !== g.idx) { S.k = tg; S.i = g.idx; S.ph = "down"; S.t0 = T; }
      p.tcx = K.cx - 0.75 * u;
      if (S.ph === "down") { p.reach(1, K.cx, K.y + K.h + 0.6 * u, 2.2); if (T - S.t0 > 0.35 && Math.abs(p.cx - p.tcx) < 0.25 * u) { S.ph = "up"; S.t0 = T; } }
      else p.reach(1, K.cx, K.y + K.h * 0.55, 1.6);
    },
  },
};
