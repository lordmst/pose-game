// 손가락 씨름 (스포츠 리조트처럼 3D): 경기장 위에서 깍지 낀 큰 두 손을 내려다봄. 내 엄지(앞쪽)가 손을 따라다님
// 동그란 경기장 안에서 내 엄지(손을 따라다님)로 상대 엄지를 눌러 '하나, 둘, 셋' 버티면 이김
// 누르기 = 상대 엄지 위에서 손을 아래로 콱 내리기(또는 주먹 쥐기). 누른 뒤엔 상대가 빠져나가지 못하게 계속 따라가기
// 상대 엄지가 내 엄지 위로 올라와 누르려 하면(노란 경고) 얼른 빠져나가기. 못 빠져나가면 짐
import { burst, popup, rr, outlinedText } from "../../fx.js?v=37";
import { sfx } from "../../audio.js?v=37";
import { stage, THREE, box, ball as sphere, cyl, mesh, ground, tree, cloud } from "./kit3d.js?v=37";

const PRESS = 1.6;        // 누르기로 치는 손이 아래로 내려가는 빠르기 (어깨너비/초)
const COUNT = 1.5;        // 하나·둘·셋 (초)
const WARN = 0.7;         // 상대가 누르기 전 경고 시간(초, 보통)
const WORDS = ["하나!", "둘!", "셋!"];
const AR = 1.45;          // 3D에서 엄지 끝이 다니는 원 반지름(m) — 깍지 낀 두 주먹 위
const SKIN = "#f5c9a0", NAIL = "#ffe3ea";

// 3D 손: 주먹(가운데서 깍지) + 소매 + 엄지(뿌리→끝 통통한 막대, 손톱). sgn +1 = 내 손(카메라 쪽), -1 = 상대
function hand3d(scene, sgn, sleeve, skin) {
  const g = new THREE.Group(); scene.add(g);
  const base = new THREE.Vector3(0.25 * sgn, 0.95, 0.45 * sgn);
  const fist = mesh(new THREE.SphereGeometry(1, 24, 16), skin, { rough: 0.7 }); fist.scale.set(0.85, 0.6, 0.75); fist.position.set(0, 0.45, 0.55 * sgn); g.add(fist);
  for (let i = 0; i < 4; i++) { const f = mesh(new THREE.CapsuleGeometry(0.15, 0.35, 4, 10), skin, { rough: 0.7 }); f.rotation.x = Math.PI / 2; f.position.set(-0.5 + i * 0.33 + 0.08 * sgn, 0.55 + (i % 2) * 0.05, -0.2 * sgn); g.add(f); }   // 깍지 낀 손가락
  const arm = cyl(0.5, 0.56, 3, sleeve); arm.rotation.x = Math.PI / 2; arm.position.set(0, 0.35, 2.2 * sgn); g.add(arm);
  const cuff = cyl(0.53, 0.53, 0.25, "#ffffff"); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, 0.35, 0.95 * sgn); g.add(cuff);
  const seg = cyl(0.22, 0.27, 1, skin, { rough: 0.7 }); g.add(seg);
  const knuckle = sphere(0.28, skin, { rough: 0.7 }); knuckle.position.copy(base); g.add(knuckle);
  const tip = new THREE.Group(); g.add(tip);
  const ball_ = sphere(0.26, skin, { rough: 0.7 }); ball_.scale.set(1, 1.1, 1); tip.add(ball_);
  const nail = sphere(0.16, NAIL, { rough: 0.3 }); nail.scale.set(1, 0.35, 1.2); nail.position.set(0, 0.22, -0.05 * sgn); tip.add(nail);
  const up = new THREE.Vector3(0, 1, 0), glowM = {};
  return {
    g,
    set(p, h) {
      const top = new THREE.Vector3(p.x, h, p.z), mid = base.clone().add(top).multiplyScalar(0.5), d = top.clone().sub(base);
      seg.position.copy(mid); seg.scale.set(1, Math.max(0.1, d.length()), 1); seg.quaternion.setFromUnitVectors(up, d.normalize());
      tip.position.copy(top); tip.quaternion.copy(seg.quaternion);
    },
    glow(c) { ball_.material = c ? (glowM[c] || (glowM[c] = new THREE.MeshStandardMaterial({ color: skin, emissive: c, emissiveIntensity: 0.6 }))) : seg.material; },
  };
}
function arena(scene) {
  ground(scene, "#86c96a", 200, -1.6);
  const table = cyl(3.4, 3.6, 1.2, "#c98a4b", { receive: true }); table.position.y = -0.62; scene.add(table);
  const top = mesh(new THREE.CircleGeometry(3.3, 48), "#f2d3a2", { receive: true, cast: false }); top.rotation.x = -Math.PI / 2; top.position.y = 0.0; scene.add(top);
  [1.2, 2.2, 3.1].forEach((k, i) => { const r = mesh(new THREE.RingGeometry(k - 0.05, k + 0.05, 64), i === 2 ? "#7a4a1a" : "#c9965f", { cast: false }); r.rotation.x = -Math.PI / 2; r.position.y = 0.01; scene.add(r); });
  const rim = mesh(new THREE.TorusGeometry(3.45, 0.16, 10, 64), "#ff6b6b"); rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; scene.add(rim);
  // 엄지 경기장 테두리 (주먹 위 공중에 뜬 고리)
  const lim = mesh(new THREE.TorusGeometry(AR + 0.3, 0.035, 8, 64), "#ffffff", { cast: false, opacity: 0.7 }); lim.rotation.x = Math.PI / 2; lim.position.y = 1.0; scene.add(lim);
  // 뒤쪽 관중석 (알록달록 응원단)
  const cols = ["#ff6b6b", "#ffd43b", "#69db7c", "#74c0fc", "#f783ac", "#ffa94d"];
  for (let r = 0; r < 3; r++) {
    const step = box(18, 0.6, 1.3, "#cfd8e3"); step.position.set(0, -1.3 + r * 0.7, -AR - 4.5 - r * 1.2); scene.add(step);
    for (let i = 0; i < 14; i++) { const f = sphere(0.32, cols[(i + r * 2) % cols.length], { rough: 0.9 }); f.position.set(-8 + i * 1.23, -0.68 + r * 0.7, -AR - 4.5 - r * 1.2); scene.add(f); }
  }
  for (let i = 0; i < 12; i++) scene.add(tree(-16 + i * 3, -14 - (i % 3) * 2.5, 2 + (i % 2) * 0.6));
  for (let i = 0; i < 5; i++) scene.add(cloud(-30 + i * 15, 16 + (i % 2) * 4, -45, 3));
}

export default {
  id: "thumb", title: "손가락 씨름", icon: "👍", sec: 60, cursor: "", cat: "sport", bg: "#fddb92", desc: "엄지로 눌러 하나둘셋", scene3d: true,
  how: "손을 들면 내 엄지가 손을 따라가요. 상대 엄지 위에서 손을 아래로 콱 내려 누르고, 하나·둘·셋 동안 따라가며 버텨요. 상대가 누르려 하면 얼른 빠져나가요!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const st = stage(env, { fov: 44, sky: ["#6ec6ff", "#e8f7ff"], shadowSize: 8 });
    const { scene, camera } = st;
    arena(scene);
    camera.position.set(0, 4.6, 5.4); camera.lookAt(0, 0.7, 0.2); camera.updateMatrixWorld();
    const T3 = [hand3d(scene, 1, env.color || "#ff6b6b", SKIN), hand3d(scene, -1, "#7a3fbf", "#e0ac69")];
    // 게임 좌표(화면 원) → 3D 경기장 위치
    const to3 = q => { const R = ring(); return new THREE.Vector3((q.x - R.x) / R.r * AR, 0, (q.y - R.y) / R.r * AR); };
    const scr = (q, h = 1) => { const p = to3(q); p.y = h; return st.toScreen(p); };
    const ring = () => ({ x: z.cx, y: v.H * 0.5, r: Math.min(z.w * 0.4, v.H * 0.32) });
    const TR = () => Math.max(v.U * 0.05, ring().r * 0.19);            // 엄지 크기
    const me = { x: z.cx - 60, y: v.H * 0.5, seen: false }, cpu = { x: z.cx + 60, y: v.H * 0.45, vx: 0, vy: 0, wan: 0 };
    let t = 0, pin = null, cpuPin = null, rest = 1.0, wins = 0, losses = 0, escapes = 0, round = 1, pressT = 0, hint = 0;
    const speedK = () => D.speed * (1 + 0.4 * env.progress());
    function reset(msg, col) {
      const R = ring(); pin = null; cpuPin = null; rest = 1.2; round++;
      cpu.x = R.x + R.r * 0.45 * (Math.random() < 0.5 ? -1 : 1); cpu.y = R.y - R.r * 0.3; cpu.vx = cpu.vy = 0;
      if (msg) popup(z.cx, v.H * 0.3, msg, { size: v.U * 0.05, color: "#fff", stroke: col, life: 1.1 });
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
          if (n > pin.n) { pin.n = n; sfx.tick(); popup(z.cx, v.H * 0.28, WORDS[n - 1], { size: v.U * 0.09, color: "#fff", stroke: env.color, life: 0.5 }); }
          if (dist > r * 1.6) { pin = null; const q = scr(cpu, 2.2); popup(q.x, q.y, "빠져나갔다!", { size: v.U * 0.04, color: "#fff", stroke: "#888" }); sfx.whoosh(); }
          else if (pin.t >= COUNT) {
            wins++; sfx.fanfare(); const q = scr(cpu); env.award(3, z.cx, v.H * 0.4);
            burst(q.x, q.y, { n: 30, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 0.9, gravity: v.U * 0.8, size: v.U * 0.016 });
            reset("이겼다! 👍", "#2fb65a"); return;
          }
        } else if (cpuPin) {   // 상대가 누르려 함 → 경고 후 누름
          cpuPin.t += dt;
          if (!cpuPin.on) {
            cpu.vx = (me.x - cpu.x) * 4; cpu.vy = (me.y - cpu.y) * 4;      // 내 엄지를 쫓아옴
            if (dist > r * 2.0) { escapes++; cpuPin = null; const q = scr(me, 2); env.award(1, q.x, q.y - r); popup(q.x, q.y + r, "피했다!", { size: v.U * 0.04, color: "#fff", stroke: "#2fb65a" }); }
            else if (cpuPin.t >= cpuPin.T) { cpuPin.on = true; cpuPin.t = 0; sfx.bonk(); }
          } else {             // 눌렸다: 셋 세기 전에 빠져나가야 함
            cpu.vx = (me.x - cpu.x) * 5; cpu.vy = (me.y - cpu.y) * 5;
            if (dist > r * 1.7) { escapes++; cpuPin = null; const q = scr(me, 2); env.award(1, q.x, q.y - r); popup(q.x, q.y + r, "탈출!", { size: v.U * 0.045, color: "#fff", stroke: "#2fb65a" }); }
            else if (cpuPin.t >= COUNT * 1.1) { losses++; env.penalty(1, z.cx, v.H * 0.4, "눌렸다!"); sfx.bad(); reset("다시 해 봐요!", "#b30000"); return; }
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
          const q = scr(cpu); burst(q.x, q.y, { n: 12, colors: ["#ffffff", "#ffe14d"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.3, size: v.U * 0.014, life: 0.4 });
        } else if (!pin && pressT > 0 && d2 < r * 2.2 && hint <= 0) { hint = 1.5; const q = scr(me, 2.2); popup(q.x, q.y, "더 가까이!", { size: v.U * 0.035, color: "#fff", stroke: "#b87a00" }); }
      },
      draw(ctx) {
        const R = ring(), r = TR(), U = v.U;
        // 엄지 3D 위치: 평소엔 서 있고, 누를 땐 상대 쪽으로 낮게 덮침
        const pm = to3(me), pc = to3(cpu), wob = Math.sin(t * 9) * 0.06;
        T3[0].set(pm, pin ? 1.15 : 1.75 + wob);
        T3[1].set(pc, cpuPin && cpuPin.on ? 1.15 : 1.75 - wob);
        const warn = cpuPin && !cpuPin.on ? 0.5 + 0.5 * Math.sin(t * 25) : 0;
        T3[1].glow(warn > 0.5 ? 0xffc800 : 0); T3[0].glow(pin ? 0x33ff88 : 0);
        st.draw(ctx);
        // 이름표
        const qm = scr(me, 2.25), qc = scr(cpu, 2.25), top = v.H * 0.23;   // 위쪽 점수판에 겹치지 않게
        qm.y = Math.max(top, qm.y); qc.y = Math.max(top, qc.y);
        outlinedText(ctx, "나", qm.x, qm.y, U * 0.032, "#fff", env.color, 3);
        outlinedText(ctx, "상대", qc.x, qc.y, U * 0.032, "#fff", "#7a3fbf", 3);
        const lim = z.w / 13, by = v.H * 0.83;
        // 누르는 중: 셋까지 원형 게이지
        if (pin) {
          const q = scr(cpu, 1); ctx.strokeStyle = env.color; ctx.lineWidth = U * 0.014;
          ctx.beginPath(); ctx.arc(q.x, q.y, U * 0.09, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pin.t / COUNT)); ctx.stroke();
          outlinedText(ctx, "따라가며 버텨요!", z.cx, by, Math.min(U * 0.04, lim), "#fff", env.color, 3);
        }
        if (cpuPin) {
          const k = cpuPin.on ? Math.min(1, cpuPin.t / (COUNT * 1.1)) : 0;
          if (cpuPin.on) { const q = scr(me, 1); ctx.strokeStyle = "#7a3fbf"; ctx.lineWidth = U * 0.014; ctx.beginPath(); ctx.arc(q.x, q.y, U * 0.09, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); }
          outlinedText(ctx, cpuPin.on ? "눌렸다! 빨리 빠져나가요!" : "! 상대가 누르려 해요 — 피해요!", z.cx, by, Math.min(U * 0.04, lim), "#fff", "#c00000", 3);
        }
        if (!pin && !cpuPin && rest <= 0 && !me.seen) outlinedText(ctx, "손을 들어 엄지를 움직여요", z.cx, by, Math.min(U * 0.04, lim), "#fff", "#333", 3);
        const bw = Math.min(z.w * 0.6, U * 0.5), bh = U * 0.07, bx = z.cx - bw / 2, bty = v.H * 0.11;
        ctx.fillStyle = "rgba(90,50,10,.82)"; rr(ctx, bx, bty, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, `${round}판 · ${wins}승 ${losses}패`, z.cx, bty + bh / 2, Math.min(U * 0.036, z.w / 12), "#fff", "#5a320a", 3);
      },
      stop() { st.dispose(); },
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
