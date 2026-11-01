// 탁구 (스포츠 리조트처럼 3D): 실내 경기장, 내 캐릭터 뒤에서 탁구대를 봄
// 상대가 친 공이 내 쪽 탁구대에 한 번 튀고 오면 팔을 휘둘러 받아치기. 아주 세게 휘두르면 스매시(상대가 잘 못 받음)
// 캐릭터는 공 쪽으로 저절로 움직임. 11점 먼저 내면 게임(2점 차)
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=31";
import { sfx } from "../../audio.js?v=31";
import { stage, THREE, box, cyl, ball as sphere, mesh, playerAvatar, randomAvatar, racket } from "./kit3d.js?v=31";

const FLIGHT = 1.1;    // 공이 상대에게서 나에게 오는 시간(초, 보통)
const BACK = 0.75;     // 받아친 공이 상대에게 가는 시간(초)
const SWING = 2.4;     // 받아치기로 인정하는 손 속도(어깨너비/초)
const SMASH = 7;       // 스매시 손 속도
const WIN0 = 0.72, WIN1 = 1.15;
const CPU_RETURN = { easy: 0.55, normal: 0.7, hard: 0.82 };
const TL = 1.37, TW = 0.76, TH = 0.76;   // 탁구대 반 길이·반 너비·높이(m)
const KB = 0.58;                          // 비행 중 탁구대에 튀는 순간(비율)

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const arc = (a, b, h, u) => new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + 4 * h * u * (1 - u), a.z + (b.z - a.z) * u);

function arena(scene) {
  scene.background = new THREE.Color("#141c33");
  const floor = mesh(new THREE.PlaneGeometry(60, 60), "#2c4f8f", { receive: true, cast: false }); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const mat_ = mesh(new THREE.PlaneGeometry(7, 9), "#b8430f", { receive: true, cast: false }); mat_.rotation.x = -Math.PI / 2; mat_.position.y = 0.005; scene.add(mat_);
  // 탁구대: 파란 판 + 흰 테두리·가운데 줄 + 네트 + 다리
  const top = box(TW * 2, 0.04, TL * 2, "#1f5fbf", { receive: true, rough: 0.35 }); top.position.y = TH - 0.02; scene.add(top);
  const line = (w, d, x, z) => { const m = box(w, 0.005, d, "#ffffff", { cast: false }); m.position.set(x, TH + 0.002, z); scene.add(m); };
  line(TW * 2, 0.03, 0, TL - 0.015); line(TW * 2, 0.03, 0, -TL + 0.015); line(0.03, TL * 2, TW - 0.015, 0); line(0.03, TL * 2, -TW + 0.015, 0); line(0.006, TL * 2, 0, 0);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => { const l = box(0.06, TH - 0.04, 0.06, "#222"); l.position.set(sx * (TW - 0.15), (TH - 0.04) / 2, sz * (TL - 0.25)); scene.add(l); });
  const net = mesh(new THREE.PlaneGeometry(TW * 2 + 0.3, 0.15), new THREE.MeshStandardMaterial({ color: "#111", transparent: true, opacity: 0.6, side: THREE.DoubleSide }), { cast: false });
  net.position.set(0, TH + 0.075, 0); scene.add(net);
  const tape = box(TW * 2 + 0.3, 0.015, 0.012, "#fff"); tape.position.set(0, TH + 0.15, 0); scene.add(tape);
  // 둘레 펜스(광고판 색) · 관중석 · 조명
  const cols = ["#e03131", "#1971c2", "#f08c00", "#2f9e44"];
  for (let i = 0; i < 8; i++) { const b = box(2.1, 0.7, 0.08, cols[i % 4]); b.position.set(-7.35 + i * 2.1, 0.35, -6); scene.add(b); }
  [-1, 1].forEach(s => { for (let i = 0; i < 5; i++) { const b = box(0.08, 0.7, 2.1, cols[(i + 1) % 4]); b.position.set(s * 4.5, 0.35, -5 + i * 2.2); scene.add(b); } });
  const fanCols = ["#ff8787", "#ffd43b", "#8ce99a", "#74c0fc", "#f783ac", "#ffa94d"];
  scene.userData.fans = [];
  for (let r = 0; r < 4; r++) {
    const step = box(18, 0.5, 1.2, "#3b4a6b"); step.position.set(0, 0.6 + r * 0.6, -8 - r * 1.1); scene.add(step);
    for (let i = 0; i < 18; i++) { const f = sphere(0.26, fanCols[(i + r * 2) % 6]); f.position.set(-8.5 + i, 1.15 + r * 0.6, -8 - r * 1.1); f.userData.bob = Math.random() * 6; scene.add(f); scene.userData.fans.push(f); }
  }
  for (let i = 0; i < 4; i++) {   // 천장 조명
    const lamp = mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.25, 16), new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff8d0", emissiveIntensity: 1 }), { cast: false });
    lamp.position.set(-3 + i * 2, 7, -2 + (i % 2) * 2); scene.add(lamp);
  }
  const spot = new THREE.PointLight(0xfff3d0, 30, 20); spot.position.set(0, 5, 0); scene.add(spot);
}

export default {
  id: "pingpong", title: "탁구", icon: "🏓", sec: 60, cursor: "", cat: "sport", bg: "#ffc3a0", desc: "통통 튀는 공 받아치기", scene3d: true,
  how: "공이 탁구대에 튀고 내 쪽으로 오면 팔을 휘둘러 받아쳐요. 아주 세게 휘두르면 스매시! 캐릭터는 저절로 움직여요",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const st = stage(env, { fov: 48, sky: ["#141c33", "#141c33"], shadowSize: 6 });
    const { scene, camera, hemi, sun } = st;
    arena(scene); hemi.intensity = 0.9; sun.position.set(2, 9, 4);
    const me = playerAvatar(env); me.scale.setScalar(1.0); me.rotation.y = Math.PI; me.position.set(0, 0, TL + 0.75); scene.add(me);
    me.hold(1, racket(env.color || "#e03131", true));
    const opp = randomAvatar(3); opp.scale.setScalar(1.15); opp.position.set(0, 0, -TL - 0.75); opp.hold(1, racket("#e03131", true)); scene.add(opp);
    const pb = sphere(0.035, "#ffffff", { rough: 0.3 }); scene.add(pb);
    const ghosts = [0, 1, 2, 3, 4].map(i => { const g = mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.35 - i * 0.06 }), { cast: false }); scene.add(g); return g; });
    const shadow = mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }), { cast: false }); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    const ring = mesh(new THREE.RingGeometry(0.09, 0.13, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), { cast: false }); ring.rotation.x = -Math.PI / 2; ring.position.y = TH + 0.006; scene.add(ring);
    const hide = () => { pb.visible = shadow.visible = ring.visible = false; ghosts.forEach(g => { g.visible = false; }); };
    hide();
    const trail = [];

    let B = null, wait = 1.0, sMe = 0, sCpu = 0, gMe = 0, gCpu = 0, returns = 0, smashes = 0, winners = 0, t = 0, myX = 0, cheer = 0;
    let swingT = 9, swingDir = 1, swingHard = false, oppSwing = 9;
    // 비행: p0 → 탁구대에 튐(bnc) → p1. 높이 h1·h2
    function at(b) {
      const k = b.t / b.T;
      return { k, p: k < KB ? arc(b.p0, b.bnc, b.h1, k / KB) : arc(b.bnc, b.p1, b.h2, (k - KB) / (1 - KB)) };
    }
    function send() {   // 상대가 공을 보냄
      const side = Math.random() < 0.5 ? -1 : 1, hx = clamp(myX + side * (0.2 + Math.random() * 0.45), -TW - 0.2, TW + 0.2);
      const p0 = opp.position.clone().add(V(-0.25, 0.95, 0.45));
      B = { dir: 1, p0, bnc: V(hx * 0.8, TH + 0.035, 0.45 + Math.random() * 0.6), p1: V(hx, TH + 0.3, TL + 0.45), h1: 0.28, h2: 0.22, t: 0, T: FLIGHT * (1 - 0.2 * env.progress()) / D.speed, hx };
      oppSwing = 0; sfx.pop(); trail.length = 0;
    }
    function point(mine) {
      if (mine) sMe++; else sCpu++;
      if ((sMe >= 11 || sCpu >= 11) && Math.abs(sMe - sCpu) >= 2) {
        const won = sMe > sCpu; if (won) gMe++; else gCpu++; sMe = sCpu = 0;
        if (won) { sfx.fanfare(); env.award(3, z.cx, v.H * 0.4); popup(z.cx, v.H * 0.48, "게임 승리!", { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.3 }); }
        else popup(z.cx, v.H * 0.48, "상대 게임", { size: v.U * 0.05, color: "#eee", stroke: "#555" });
      }
      B = null; wait = 1.1; hide();
    }
    function swingPose(a, T, dir, hard) {
      if (T > 0.4) return false;
      const u = Math.min(1, T / (hard ? 0.14 : 0.22));
      a.body.rotation.y = dir * (0.8 - 1.6 * u);
      a.arm(1, hard ? 2.0 - 0.8 * u : 1.2, 0.3 + 0.9 * u, 0.5);
      return true;
    }
    return {
      update(dt) {
        t += dt; swingT += dt; oppSwing += dt; cheer = Math.max(0, cheer - dt);
        const hands = env.tracker.hands, fast = hands.find(h => h.vis && h.bodySpeed >= SWING * D.punch);
        if (fast && swingT > 0.4) { swingT = 0; swingDir = fast.vx > 0 ? 1 : -1; swingHard = fast.bodySpeed >= SMASH * D.punch; }
        const goal = B && B.dir === 1 ? clamp(B.hx - 0.4, -1.0, 0.9) : 0;
        myX += (goal - myX) * Math.min(1, dt * 4); me.position.x = myX;
        if (!swingPose(me, swingT, swingDir, swingHard)) { me.body.rotation.y *= 0.8; me.mimic(env.tracker.pts, true); }
        me.idle(t);
        if (!swingPose(opp, oppSwing, -1, false)) { opp.body.rotation.y *= 0.8; opp.arm(1, 0.5, 0.8, 1.0); opp.arm(0, 0.3, 0.4, 0.6); }
        opp.idle(t + 1);
        scene.userData.fans.forEach(f => { f.position.y += Math.sin(t * (cheer ? 14 : 3) + f.userData.bob) * dt * (cheer ? 1.2 : 0.12); });
        if (!B) { wait -= dt; if (wait <= 0) send(); return; }
        B.t += dt;
        const { k, p } = at(B);
        pb.visible = shadow.visible = true; pb.position.copy(p);
        const onTable = Math.abs(p.x) < TW && Math.abs(p.z) < TL;
        shadow.position.set(p.x, onTable ? TH + 0.004 : 0.01, p.z);
        trail.unshift(p.clone()); if (trail.length > 10) trail.pop();
        ghosts.forEach((g, i) => { const q = trail[i * 2 + 2]; g.visible = !!q; if (q) g.position.copy(q); });
        if (k > KB - 0.02 && !B.bounced) { B.bounced = true; sfx.tick(); }
        if (B.dir === 1) {
          ring.visible = k < KB; if (ring.visible) { ring.position.x = B.bnc.x; ring.position.z = B.bnc.z; }
          if (k > WIN0 && k < WIN1 && swingT < 0.12 && !B.swung) {
            B.swung = true;
            const smash = swingHard;
            returns++; if (smash) smashes++;
            sfx.hit(smash ? 3 : 1); if (smash) shake(v.U * 0.01, 0.15);
            const s = st.toScreen(p);
            env.award(smash ? 2 : 1, s.x, s.y - v.U * 0.08);
            popup(s.x, s.y + v.U * 0.06, smash ? "스매시!" : swingDir > 0 ? "포핸드!" : "백핸드!", { size: v.U * (smash ? 0.055 : 0.04), color: "#fff", stroke: smash ? "#e0306a" : "#d06a00", life: 0.7 });
            burst(s.x, s.y, { n: smash ? 20 : 10, colors: ["#ffffff", "#ffb36b"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.4, size: v.U * 0.014, life: 0.5 });
            const aim = clamp(swingDir * (0.25 + Math.random() * 0.4), -TW + 0.1, TW - 0.1);
            B = { dir: -1, p0: p.clone(), bnc: V(aim * 0.9, TH + 0.035, -0.5 - Math.random() * 0.6), p1: V(aim, TH + (smash ? 0.15 : 0.3), -TL - 0.45), h1: smash ? 0.05 : 0.25, h2: 0.2, t: 0, T: BACK / (smash ? 1.5 : 1), aim, smash };
            ring.visible = false; trail.length = 0;
            return;
          }
          if (k >= WIN1 + 0.08) { sfx.thud(); env.miss(z.cx, v.H * 0.75, "놓쳤어요"); point(false); }
        } else {
          opp.position.x += (B.aim + 0.25 - opp.position.x) * Math.min(1, dt * 3);
          if (k >= 1) {
            if (Math.random() < (CPU_RETURN[D.id] || 0.7) - (B.smash ? 0.3 : 0) - (Math.abs(B.aim) > 0.5 ? 0.1 : 0)) send();
            else { winners++; cheer = 1.4; env.award(1, z.cx, v.H * 0.35); popup(z.cx, v.H * 0.42, "득점!", { size: v.U * 0.07, color: "#fff", stroke: "#e0306a", life: 1.0 }); sfx.fever(); point(true); }
          }
        }
      },
      draw(ctx) {
        // 카메라: 내 캐릭터 뒤 위쪽에서 탁구대를 내려다봄
        const narrow = camera.aspect < 1.2 ? 1 : 0;   // 2인 화면(좁은 구역)은 조금 뒤에서
        camera.position.set(myX * 0.75 + 0.3, 3.1 + narrow * 0.5, TL + 3.1 + narrow * 1.3); camera.lookAt(myX * 0.3, 0.6, -1.0);
        st.draw(ctx);
        const U = v.U, bw = Math.min(z.w * 0.86, U * 0.7), by = v.H * 0.11, bh = U * 0.075;
        ctx.fillStyle = "rgba(120,30,10,.85)"; rr(ctx, z.cx - bw / 2, by, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, `나 ${sMe} - ${sCpu} 상대  ·  게임 ${gMe}:${gCpu}`, z.cx, by + bh / 2, Math.min(U * 0.038, z.w / 15), "#fff", "#4a1004", 3);
        if (B && B.dir === 1 && B.t / B.T > 0.4 && !B.swung) outlinedText(ctx, "휘둘러요!", z.cx, v.H * 0.27, Math.min(U * 0.05, z.w / 10), "#fff", "#d06a00", 4);
      },
      stop() { st.dispose(); },
      result: () => `받아친 공 ${returns} · 스매시 ${smashes} · 득점 ${winners} · 게임 ${gMe}:${gCpu}`,
      get ball() { return B ? { incoming: B.dir === 1, k: B.t / B.T } : null; },
    };
  },
  demo: {
    dur: 14,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4.5) say("탁구! 공이 탁구대에 튀고 오면 팔을 휘둘러요");
      else if (T < 9) say("아주 세게 휘두르면 스매시! 상대가 잘 못 받아요");
      else if (T < 12.5) say("상대가 못 받으면 내 점수");
      else say("이제 직접 해 봐요!");
      const b = g.ball, u = p.u, s = p.pts && p.pts[12], fast = T > 4.5 && T < 9;
      if (!b || !b.incoming || !s) { p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }
      p.rest(0, "guard", 1);
      if (b.k < (fast ? 0.86 : 0.8)) p.reach(1, s.x + 1.4 * u, s.y + 0.6 * u, 1.6);       // 뒤로 빼기
      else p.reach(1, s.x - 1.6 * u, s.y + 0.2 * u, fast ? 4.5 : 0.9);                    // 보통은 살살, 스매시 구간은 아주 세게
    },
  },
};
