// 손가락 씨름: 동그란 경기장 안에서 내 엄지(손을 따라다님)로 상대 엄지를 눌러 '하나, 둘, 셋' 버티면 이김
// 누르기 = 상대 엄지 위에서 손을 아래로 콱 내리기(또는 주먹 쥐기). 누른 뒤엔 상대가 빠져나가지 못하게 계속 따라가기
// 상대 엄지가 내 엄지 위로 올라와 누르려 하면(노란 경고) 얼른 빠져나가기. 못 빠져나가면 짐
import { burst, popup, rr, outlinedText } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const PRESS = 1.6;        // 누르기로 치는 손이 아래로 내려가는 빠르기 (어깨너비/초)
const COUNT = 1.5;        // 하나·둘·셋 (초)
const WARN = 0.7;         // 상대가 누르기 전 경고 시간(초, 보통)
const WORDS = ["하나!", "둘!", "셋!"];

export default {
  id: "thumb", title: "손가락 씨름", icon: "👍", sec: 60, cursor: "", cat: "sport", bg: "#fddb92", desc: "엄지로 눌러 하나둘셋",
  how: "손을 들면 내 엄지가 손을 따라가요. 상대 엄지 위에서 손을 아래로 콱 내려 누르고, 하나·둘·셋 동안 따라가며 버텨요. 상대가 누르려 하면 얼른 빠져나가요!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const ring = () => ({ x: z.cx, y: v.H * 0.5, r: Math.min(z.w * 0.4, v.H * 0.32) });
    const TR = () => Math.max(v.U * 0.05, ring().r * 0.19);            // 엄지 크기
    const me = { x: z.cx - 60, y: v.H * 0.5, seen: false }, cpu = { x: z.cx + 60, y: v.H * 0.45, vx: 0, vy: 0, wan: 0 };
    let t = 0, pin = null, cpuPin = null, rest = 1.0, wins = 0, losses = 0, escapes = 0, round = 1, pressT = 0, hint = 0;
    const speedK = () => D.speed * (1 + 0.4 * env.progress());
    function reset(msg, col) {
      const R = ring(); pin = null; cpuPin = null; rest = 1.2; round++;
      cpu.x = R.x + R.r * 0.45 * (Math.random() < 0.5 ? -1 : 1); cpu.y = R.y - R.r * 0.3; cpu.vx = cpu.vy = 0;
      if (msg) popup(R.x, R.y - R.r - v.U * 0.02, msg, { size: v.U * 0.05, color: "#fff", stroke: col, life: 1.1 });
    }
    reset(); round = 1;
    const inRing = (p, R, m) => { const d = Math.hypot(p.x - R.x, p.y - R.y), lim = R.r - m; if (d > lim) { p.x = R.x + (p.x - R.x) / d * lim; p.y = R.y + (p.y - R.y) / d * lim; } };
    return {
      update(dt) {
        t += dt; hint = Math.max(0, hint - dt);
        const R = ring(), r = TR(), tr = env.tracker, sw = Math.max(tr.scale || 0, v.U * 0.06);
        // 내 엄지: 더 높이 든 손을 따라감 (경기장 안으로 제한)
        const hs = tr.hands.filter(h => h.vis), h = hs.length ? hs.reduce((a, b) => (b.y < a.y ? b : a)) : null;
        if (h) { const a = Math.min(1, dt * 14); me.x += (h.x - me.x) * a; me.y += (h.y - me.y) * a; me.seen = true; }
        inRing(me, R, r);
        // 누르기: 손을 아래로 빠르게 내리거나 주먹
        const press = h && ((h.vy / sw) > PRESS * D.punch || h.shape === "closed");
        pressT = press ? 0.25 : Math.max(0, pressT - dt);
        const dist = Math.hypot(me.x - cpu.x, me.y - cpu.y);
        if (rest > 0) { rest -= dt; return; }
        // 상대 엄지 움직임
        const sp = R.r * (0.55 + 0.35 * Math.random()) * speedK();
        if (pin) {   // 내가 누르는 중: 상대가 빠져나가려 버둥댐
          pin.t += dt;
          const ang = t * 7 + pin.dir;
          cpu.vx = Math.cos(ang) * R.r * 0.9 * speedK(); cpu.vy = Math.sin(ang * 0.7) * R.r * 0.6 * speedK();
          const n = Math.min(3, Math.floor(pin.t / (COUNT / 3)) + 1);
          if (n > pin.n) { pin.n = n; sfx.tick(); popup(R.x, R.y - R.r * 0.62, WORDS[n - 1], { size: v.U * 0.07, color: "#fff", stroke: env.color, life: 0.5 }); }
          if (dist > r * 1.6) { pin = null; popup(cpu.x, cpu.y - r * 1.4, "빠져나갔다!", { size: v.U * 0.04, color: "#fff", stroke: "#888" }); sfx.whoosh(); }
          else if (pin.t >= COUNT) {
            wins++; sfx.fanfare(); env.award(3, R.x, R.y - R.r * 0.3);
            burst(cpu.x, cpu.y, { n: 30, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 0.9, gravity: v.U * 0.8, size: v.U * 0.016 });
            reset("이겼다! 👍", "#2fb65a"); return;
          }
        } else if (cpuPin) {   // 상대가 누르려 함 → 경고 후 누름
          cpuPin.t += dt;
          if (!cpuPin.on) {
            cpu.vx = (me.x - cpu.x) * 4; cpu.vy = (me.y - cpu.y) * 4;      // 내 엄지를 쫓아옴
            if (dist > r * 2.0) { escapes++; cpuPin = null; env.award(1, me.x, me.y - r * 1.5); popup(me.x, me.y + r * 1.6, "피했다!", { size: v.U * 0.04, color: "#fff", stroke: "#2fb65a" }); }
            else if (cpuPin.t >= cpuPin.T) { cpuPin.on = true; cpuPin.t = 0; sfx.bonk(); }
          } else {             // 눌렸다: 셋 세기 전에 빠져나가야 함
            cpu.vx = (me.x - cpu.x) * 5; cpu.vy = (me.y - cpu.y) * 5;
            if (dist > r * 1.7) { escapes++; cpuPin = null; env.award(1, me.x, me.y - r * 1.5); popup(me.x, me.y + r * 1.6, "탈출!", { size: v.U * 0.045, color: "#fff", stroke: "#2fb65a" }); }
            else if (cpuPin.t >= COUNT * 1.1) { losses++; env.penalty(1, R.x, R.y - R.r * 0.3, "눌렸다!"); sfx.bad(); reset("다시 해 봐요!", "#b30000"); return; }
          }
        } else {
          // 평소: 돌아다니다가 가까우면 누르러 옴. 내 엄지가 너무 가까이 오면 피함
          cpu.wan -= dt;
          if (cpu.wan <= 0) { const a = Math.random() * Math.PI * 2; cpu.vx = Math.cos(a) * sp; cpu.vy = Math.sin(a) * sp; cpu.wan = 0.6 + Math.random() * 0.8; }
          if (dist < r * 2.2 && pressT <= 0) { cpu.vx += (cpu.x - me.x) / (dist || 1) * sp * dt * 3; cpu.vy += (cpu.y - me.y) / (dist || 1) * sp * dt * 3; }
          if (dist < r * 1.5 && Math.random() < dt * 0.9 * speedK()) cpuPin = { t: 0, T: WARN / D.speed, on: false };
        }
        cpu.x += cpu.vx * dt; cpu.y += cpu.vy * dt;
        { const d = Math.hypot(cpu.x - R.x, cpu.y - R.y), lim = R.r - r; if (d > lim) { cpu.x = R.x + (cpu.x - R.x) / d * lim; cpu.y = R.y + (cpu.y - R.y) / d * lim; cpu.vx *= -0.6; cpu.vy *= -0.6; } }
        // 내가 누르기 시작
        const d2 = Math.hypot(me.x - cpu.x, me.y - cpu.y);
        if (!pin && pressT > 0 && d2 < r * 1.15 * D.reach && !(cpuPin && cpuPin.on)) {
          pin = { t: 0, n: 0, dir: Math.random() * 6 }; cpuPin = null; sfx.hit(2);
          burst(cpu.x, cpu.y, { n: 12, colors: ["#ffffff", "#ffe14d"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.3, size: v.U * 0.014, life: 0.4 });
        } else if (!pin && pressT > 0 && d2 < r * 2.2 && hint <= 0) { hint = 1.5; popup(me.x, me.y - r * 1.6, "더 가까이!", { size: v.U * 0.035, color: "#fff", stroke: "#b87a00" }); }
      },
      draw(ctx) {
        const R = ring(), r = TR(), U = v.U;
        // 경기장: 나무 원판 + 줄무늬
        ctx.save(); ctx.globalAlpha = 0.82;
        const g = ctx.createRadialGradient(R.x, R.y - R.r * 0.3, R.r * 0.1, R.x, R.y, R.r);
        g.addColorStop(0, "#f7d9a8"); g.addColorStop(1, "#c98a4b");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(R.x, R.y, R.r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = U * 0.012; ctx.strokeStyle = "#7a4a1a"; ctx.stroke();
        ctx.strokeStyle = "rgba(122,74,26,.35)"; ctx.lineWidth = U * 0.004;
        for (const k of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(R.x, R.y, R.r * k, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
        // 엄지 그리기 (위에서 본 모양: 손톱 있는 둥근 막대)
        const thumb = (x, y, col, label, pressed, hi) => {
          const s = r * (pressed ? 0.92 : 1);
          ctx.save(); ctx.translate(x, y);
          ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(s * 0.15, s * (pressed ? 0.2 : 0.45), s * 0.8, s * 0.95, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#f2c49b"; rr(ctx, -s * 0.72, -s, s * 1.44, s * 2, s * 0.72); ctx.fill();
          ctx.lineWidth = Math.max(3, s * 0.12); ctx.strokeStyle = hi || col; ctx.stroke();
          ctx.fillStyle = "#ffe4ea"; rr(ctx, -s * 0.45, -s * 0.85, s * 0.9, s * 0.8, s * 0.35); ctx.fill();
          ctx.strokeStyle = "rgba(180,120,120,.6)"; ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke();
          ctx.restore();
          outlinedText(ctx, label, x, y + s * 1.45, U * 0.026, "#fff", col, 3);
        };
        const warn = cpuPin && !cpuPin.on ? 0.5 + 0.5 * Math.sin(t * 25) : 0;
        thumb(me.x, me.y, env.color, "나", !!pin, null);
        thumb(cpu.x, cpu.y, "#7a3fbf", "상대", cpuPin && cpuPin.on, warn ? `rgba(255,212,0,${warn.toFixed(2)})` : null);
        // 누르는 중: 셋까지 원형 게이지
        if (pin) {
          ctx.strokeStyle = env.color; ctx.lineWidth = U * 0.014;
          ctx.beginPath(); ctx.arc(cpu.x, cpu.y, r * 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pin.t / COUNT)); ctx.stroke();
          outlinedText(ctx, "따라가며 버텨요!", R.x, R.y + R.r + U * 0.04, Math.min(U * 0.04, z.w / 12), "#fff", env.color, 3);
        }
        if (cpuPin) {
          const k = cpuPin.on ? Math.min(1, cpuPin.t / (COUNT * 1.1)) : 0;
          if (cpuPin.on) { ctx.strokeStyle = "#7a3fbf"; ctx.lineWidth = U * 0.014; ctx.beginPath(); ctx.arc(me.x, me.y, r * 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); }
          outlinedText(ctx, cpuPin.on ? "눌렸다! 빨리 빠져나가요!" : "! 상대가 누르려 해요 — 피해요!", R.x, R.y + R.r + U * 0.04, Math.min(U * 0.04, z.w / 13), "#fff", "#c00000", 3);
        }
        if (!pin && !cpuPin && rest <= 0 && !me.seen) outlinedText(ctx, "손을 들어 엄지를 움직여요", R.x, R.y + R.r + U * 0.04, Math.min(U * 0.04, z.w / 12), "#fff", "#333", 3);
        outlinedText(ctx, `${round}판 · ${wins}승 ${losses}패`, R.x, R.y - R.r - U * 0.035, Math.min(U * 0.035, z.w / 12), "#fff", "#7a4a1a", 3);
      },
      result: () => `이김 ${wins} · 짐 ${losses} · 빠져나감 ${escapes}`,
      // 설명 시연용
      get me() { return { x: me.x, y: me.y }; }, get cpu() { return { x: cpu.x, y: cpu.y }; },
      get pinning() { return !!pin; }, get threat() { return cpuPin ? (cpuPin.on ? "on" : "warn") : null; },
      forceThreat() { if (!pin && !cpuPin && rest <= 0) cpuPin = { t: 0, T: WARN / D.speed, on: false }; },
      get resting() { return rest > 0; }, get r() { return TR(); }, get ring() { return ring(); },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2; p.rest(0, "down", 1);
      if (T < 4) say("손가락 씨름! 손을 들면 내 엄지가 따라와요");
      else if (T < 9) say("상대 엄지 위에서 손을 아래로 콱! 하나, 둘, 셋 버텨요");
      else if (T < 14) say("상대가 누르려 하면 얼른 빠져나가요");
      else say("이제 직접 해 봐요!");
      const c = g.cpu, me = g.me, R = g.ring, u = p.u, h = p.hands[1];
      if (T > 9.5 && !S.threat && !g.pinning && !g.resting) { S.threat = 1; g.forceThreat(); }   // 빠져나가기 장면 보여주기
      if (g.threat) {                // 빠져나가기: 경기장 반대편으로
        const ax = me.x - c.x, ay = me.y - c.y, d = Math.hypot(ax, ay) || 1;
        p.reach(1, R.x + ax / d * R.r * 0.6, R.y + ay / d * R.r * 0.6, 2.5); S.ph = "aim"; return;
      }
      if (g.pinning) { p.reach(1, c.x, c.y + u * 0.05, 3); S.ph = "aim"; return; }   // 누른 채 따라가기
      if (g.resting) { p.reach(1, R.x - R.r * 0.3, R.y, 1.5); S.ph = "aim"; return; }
      if (S.ph !== "press") {        // 상대 엄지 바로 위로
        p.reach(1, c.x, c.y - u * 0.3, 2.5);
        if (Math.hypot(h.x - c.x, h.y - (c.y - u * 0.3)) < u * 0.15) { S.ph = "press"; S.t0 = T; }
      } else {                       // 아래로 콱
        p.reach(1, c.x, c.y + u * 0.15, 4);
        if (T - S.t0 > 0.25) S.ph = "aim";
      }
    },
  },
};
