// 깡통 맞추기 (스포츠 리조트 탁구 '깡통 챌린지'처럼 3D): 탁구대 끝에 쌓인 깡통 피라미드를 탁구공으로 무너뜨리기
// 공 기계가 보낸 공이 내 쪽에 바운드되어 오면 타이밍 맞춰 휘둘러 받아침. 손을 휘두른 방향(옆)과 손 높이(위·아래)로 노리는 곳이 정해짐
// 몸을 좌우로 움직이면 캐릭터도 좌우로 움직임. 공이 오면 가야 할 자리를 점선으로 안내, 그 자리에서만 받아칠 수 있음
// 깡통 하나에 1점, 받침이 없어진 깡통은 같이 무너짐. 다 쓰러뜨리면 보너스
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=48";
import { sfx } from "../../audio.js?v=48";
import { stage, THREE, ground, box, ball as sphere, cyl, mesh, tree, cloud, playerAvatar, racket, bodyMover, moveGuide, moveText } from "./kit3d.js?v=48";

const FLIGHT = 1.2;    // 공이 나에게 오는 시간(초, 보통)
const SHOT = 0.55;     // 받아친 공이 깡통까지 가는 시간(초)
const SWING = 2.3;     // 받아치기로 인정하는 손 속도(어깨너비/초)
const WIN0 = 0.72, WIN1 = 1.15;   // 받아칠 수 있는 구간(비행 비율)
const ROWS = [4, 3, 2, 1];
const COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6"];
const TOP = 0.76, TL = 1.37, TW = 0.76;          // 탁구대 높이·반 길이·반 너비(m)
const CR = 0.085, CH = 0.21, GAP = 0.012, CZ = -0.95;   // 깡통 반지름·높이·간격, 피라미드 위치(z)
const RANGE = 1.0;     // 내 캐릭터가 움직일 수 있는 좌우 범위(m)
const REACH = 0.35;    // 표시한 자리에서 이만큼(m) 안에 있으면 받아칠 수 있음
const FORE = 0.35;     // 공이 몸 오른쪽(포핸드)에 오도록 자리와 공 사이 거리(m)
const GS = 0.42;       // 이동 안내(점선) 크기 비율 (탁구대에 맞게 작게)

const arc = (a, b, h, u) => new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + 4 * h * u * (1 - u), a.z + (b.z - a.z) * u);

function hall(scene) {
  ground(scene, "#2c4a78", 200);
  const floor = box(9, 0.02, 12, "#3a6fb0", { receive: true, cast: false }); floor.position.y = 0.01; scene.add(floor);
  // 탁구대: 파란 판 + 흰 줄 + 다리 + 네트
  const top = box(TW * 2, 0.04, TL * 2, "#1f5fa8", { receive: true }); top.position.y = TOP - 0.02; scene.add(top);
  const line = (w, d, x, z) => { const m = box(w, 0.005, d, "#ffffff", { cast: false, receive: true }); m.position.set(x, TOP + 0.002, z); scene.add(m); };
  line(TW * 2, 0.02, 0, TL - 0.01); line(TW * 2, 0.02, 0, -TL + 0.01); line(0.02, TL * 2, TW - 0.01, 0); line(0.02, TL * 2, -TW + 0.01, 0); line(0.006, TL * 2, 0, 0);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => { const l = box(0.06, TOP - 0.04, 0.06, "#333"); l.position.set(sx * (TW - 0.15), (TOP - 0.04) / 2, sz * (TL - 0.25)); scene.add(l); });
  const net = mesh(new THREE.PlaneGeometry(TW * 2 + 0.3, 0.15), new THREE.MeshStandardMaterial({ color: "#111", transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  net.position.set(0, TOP + 0.075, 0); scene.add(net);
  const tape = box(TW * 2 + 0.3, 0.015, 0.01, "#fff"); tape.position.set(0, TOP + 0.15, 0); scene.add(tape);
  // 공 기계 (먼 쪽 왼편)
  const mc = new THREE.Group(), body = box(0.3, 0.35, 0.3, "#ff8c1a"); body.position.y = 0.95; const pole = cyl(0.03, 0.03, 0.8, "#555"); pole.position.y = 0.4;
  const mouth = cyl(0.07, 0.07, 0.12, "#222"); mouth.rotation.x = Math.PI / 2; mouth.position.set(0, 0.98, 0.18);
  const hop = cyl(0.18, 0.1, 0.18, "#ffffff", { opacity: 0.7 }); hop.position.y = 1.2;
  mc.add(body, pole, mouth, hop); mc.position.set(-TW - 0.35, 0, -TL - 0.2); mc.rotation.y = 0.35; scene.add(mc);
  // 경기장 울타리·관중석·바깥 나무
  [-1, 1].forEach(s => { const w = box(0.15, 0.7, 12, "#1d3f73"); w.position.set(s * 4.4, 0.35, 0); scene.add(w); });
  const back = box(9, 0.7, 0.15, "#1d3f73"); back.position.set(0, 0.35, -5.9); scene.add(back);
  const colors = ["#ff6b6b", "#ffd43b", "#69db7c", "#74c0fc", "#f783ac", "#ffa94d"];
  scene.userData.fans = [];
  for (let r = 0; r < 4; r++) {
    const step = box(10, 0.45, 1, "#cfd8e3"); step.position.set(0, 0.9 + r * 0.55, -6.7 - r * 0.95); scene.add(step);
    for (let i = 0; i < 14; i++) { const f = sphere(0.24, colors[(i + r * 2) % colors.length]); f.position.set(-4.4 + i * 0.68, 1.35 + r * 0.55, -6.7 - r * 0.95); f.userData.bob = Math.random() * 6; scene.add(f); scene.userData.fans.push(f); }
  }
  for (let i = 0; i < 10; i++) scene.add(tree((i % 2 ? 1 : -1) * (7 + (i % 3) * 2), -8 + i * 1.6, 1.4 + (i % 3) * 0.3));
  for (let i = 0; i < 5; i++) scene.add(cloud(-30 + i * 15, 14 + (i % 2) * 3, -50, 3));
}
function makeCan(col) {
  const g = new THREE.Group();
  const c = cyl(CR, CR, CH, col, { rough: 0.35, metal: 0.3 }); g.add(c);
  const band = cyl(CR * 1.01, CR * 1.01, CH * 0.28, "#ffffff", { rough: 0.5 }); g.add(band);
  [-1, 1].forEach(s => { const rim = cyl(CR * 0.98, CR * 0.98, 0.01, "#c8c8c8", { metal: 0.6, rough: 0.3 }); rim.position.y = s * CH / 2; g.add(rim); });
  return g;
}

export default {
  id: "cans", title: "깡통 맞추기", icon: "🥫", sec: 60, cursor: "", cat: "sport", bg: "#fbc2eb", desc: "좌우로 움직여 깡통 맞히기", scene3d: true,
  how: "몸을 좌우로 움직여 점선 자리로 가요. 날아오는 공을 휘둘러 깡통을 맞혀요. 휘두르는 방향으로 옆이, 손 높이로 위아래가 정해져요. 다 쓰러뜨리면 보너스!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const st = stage(env, { fov: 42, sky: ["#4aa8f0", "#d4efff"], shadowSize: 8 });
    const { scene, camera } = st;
    hall(scene);
    const me = playerAvatar(env); me.scale.setScalar(0.85); me.rotation.y = Math.PI; me.position.set(0.55, 0, TL + 0.45); scene.add(me);
    me.hold(1, racket(env.color || "#ff6b6b", true));
    const pball = sphere(0.035, "#ffffff", { rough: 0.3 }); scene.add(pball);
    const pshadow = mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }), { cast: false }); pshadow.rotation.x = -Math.PI / 2; scene.add(pshadow);
    const mark = mesh(new THREE.RingGeometry(0.07, 0.1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), { cast: false }); mark.rotation.x = -Math.PI / 2; scene.add(mark);
    pball.visible = pshadow.visible = mark.visible = false;
    const machine = new THREE.Vector3(-TW - 0.25, 0.98, -TL);
    // 몸으로 좌우 이동 + 이동 안내 (점선은 탁구대 크기에 맞게 줄인 묶음 안에 그림)
    const mover = bodyMover(env, RANGE), guideG = new THREE.Group(); guideG.scale.setScalar(GS); scene.add(guideG);
    guideG.position.y = TOP + 0.004;   // 발밑은 화면 아래로 가려서, 탁구대 내 쪽 가장자리 위에 표시
    const guideM = moveGuide(guideG), FEET_Z = TL - 0.2;

    let B = null, wait = 1.0, cans = [], refill = 0, knocked = 0, clears = 0, shots = 0, t = 0, swingT = 9, swingDir = -1, myX = 0, cheer = 0, camX = 0;
    const near = () => !!B && B.dir === 1 && Math.abs(myX - B.spot) <= REACH * D.reach;
    // 지금 자리에서 lo~hi(m) 떨어진 자리 (범위 안쪽으로)
    function spotFrom(lo, hi, min, max) {
      const sides = [-1, 1].filter(sd => myX + sd * lo >= min && myX + sd * lo <= max);   // 최소 거리만큼 갈 수 있는 쪽 중에서 무작위
      const sd = sides.length ? sides[Math.floor(Math.random() * sides.length)] : (myX > (min + max) / 2 ? -1 : 1);
      return clamp(myX + sd * (lo + Math.random() * (hi - lo)), min, max);
    }
    function stack() {
      cans.forEach(c => scene.remove(c.m)); cans = [];
      ROWS.forEach((n, r) => { for (let i = 0; i < n; i++) {
        const m = makeCan(COLORS[(r + i) % COLORS.length]), x = (i - (n - 1) / 2) * (CR * 2 + GAP);
        m.position.set(x, TOP + CH / 2 + r * CH, CZ); scene.add(m);
        cans.push({ m, r, st: "stand", v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, scored: false });
      } });
    }
    stack();
    function knock(c, from, power) {
      c.st = "fall";
      c.v.set((c.m.position.x - from.x) * 6 + (Math.random() - 0.5) * 0.6, 0.6 + 1.2 * power, -0.8 - 1.6 * power);
      c.w.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 10);
    }
    function send() {
      const spot = spotFrom(0.45, 0.95, -RANGE, TW + 0.15 - FORE), hx = spot + FORE;   // 몸을 옮겨야 칠 수 있는 곳으로
      const bnc = new THREE.Vector3(hx * 0.8, TOP + 0.02, 0.45 + Math.random() * 0.4), hit = new THREE.Vector3(hx, TOP + 0.38, TL + 0.15);
      B = { dir: 1, p0: machine.clone(), bnc, hit, t: 0, T: FLIGHT / D.speed, hx, spot };
      sfx.pop();
    }
    function at(Bl) {
      const k = Bl.t / Bl.T;
      if (Bl.dir === 1) { const kb = 0.58; return { k, p: k < kb ? arc(Bl.p0, Bl.bnc, 0.28, k / kb) : arc(Bl.bnc, Bl.hit, 0.22, (k - kb) / (1 - kb)) }; }
      return { k, p: arc(Bl.p0, Bl.to, 0.12, k) };
    }
    function swingPose(T, dir) {
      if (T > 0.4) return false;
      const u = Math.min(1, T / 0.22);
      me.body.rotation.y = dir * (0.7 - 1.4 * u); me.arm(1, 1.1, 0.5 + 0.7 * u, 0.5);
      return true;
    }
    const body = () => {
      const p = env.tracker.pts;
      if (p && p[11].v && p[12].v) { const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y); return { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2, sw: Math.max(sw, v.U * 0.08) }; }
      return { x: z.cx, y: v.H * 0.45, sw: v.U * 0.13 };
    };
    return {
      update(dt) {
        t += dt; swingT += dt; cheer = Math.max(0, cheer - dt);
        const hands = env.tracker.hands, fast = hands.find(h => h.vis && h.bodySpeed >= SWING * D.punch);
        if (fast && swingT > 0.45) { swingT = 0; swingDir = fast.vx > 0 ? 1 : -1; B && (B.hand = fast); }
        myX = mover.follow(myX, dt); me.position.x = myX;                      // 좌우는 내 몸으로
        const guide = !!B && B.dir === 1;
        if (guide) guideM.show(myX / GS, B.spot / GS, FEET_Z / GS, near(), t); else guideM.hide();
        st.pipMark = guide ? { x: mover.toScreenX(B.spot), ok: near() } : null;
        if (!swingPose(swingT, swingDir)) { me.body.rotation.y *= 0.8; me.mimic(env.tracker.pts, true); }
        scene.userData.fans.forEach(f => { f.position.y += Math.sin(t * (cheer ? 14 : 3) + f.userData.bob) * dt * (cheer ? 1.2 : 0.12); });
        // 깡통: 받침이 없어지면 무너짐. 떨어지는 깡통은 중력·튕김
        for (const c of cans) {
          const P = c.m.position;
          if (c.st === "stand" && c.r > 0) {
            const below = cans.filter(o => o.r === c.r - 1 && o.st === "stand" && Math.abs(o.m.position.x - P.x) < CR * 2 * 0.95);
            if (below.length < 2) knock(c, P.clone().add(new THREE.Vector3(below.length ? below[0].m.position.x - P.x : (Math.random() - 0.5) * 0.1, 0, 0)), 0.1);
          }
          if (c.st === "fall") {
            c.life += dt; c.v.y -= 9.8 * dt; P.addScaledVector(c.v, dt);
            c.m.rotation.x += c.w.x * dt; c.m.rotation.z += c.w.z * dt; c.m.rotation.y += c.w.y * dt;
            const onTable = Math.abs(P.x) < TW && Math.abs(P.z) < TL, floorY = (onTable ? TOP : 0) + CR;
            if (P.y < floorY && c.v.y < 0 && (onTable ? P.y > TOP - 0.1 : true)) { P.y = floorY; c.v.y *= -0.35; c.v.x *= 0.7; c.v.z *= 0.7; c.w.multiplyScalar(0.6); }
            if (!c.scored) { c.scored = true; knocked++; const s = st.toScreen(P); env.award(1, s.x, s.y - v.U * 0.05); sfx.bonk(); }
            if (c.life > 2.6) { c.st = "gone"; c.m.visible = false; }
          }
        }
        if (refill > 0) { refill -= dt; if (refill <= 0) stack(); }
        else if (cans.length && cans.every(c => c.st !== "stand")) {
          clears++; refill = 1.6; cheer = 1.6; sfx.fanfare(); env.award(5, z.cx, v.H * 0.4);
          popup(z.cx, v.H * 0.32, "올 클리어!", { size: v.U * 0.07, color: "#fff", stroke: "#e0306a", life: 1.3 });
        }
        if (!B) { wait -= dt; if (wait <= 0) send(); pball.visible = pshadow.visible = mark.visible = false; return; }
        B.t += dt;
        const { k, p } = at(B);
        pball.visible = pshadow.visible = true; pball.position.copy(p);
        pshadow.position.set(p.x, (Math.abs(p.x) < TW && Math.abs(p.z) < TL ? TOP : 0) + 0.004, p.z);
        mark.visible = B.dir === 1; if (mark.visible) mark.position.set(B.bnc.x, TOP + 0.004, B.bnc.z);
        if (B.dir === 1) {
          if (k > WIN0 && k < WIN1 && swingT < 0.12 && !near() && !B.whiff) {   // 너무 멀리서 휘두름
            B.whiff = true; popup(z.cx, v.H * 0.62, "닿지 않아요! 점선 자리로", { size: v.U * 0.04, color: "#fff", stroke: "#d07a00", life: 0.9 });
          }
          if (k > WIN0 && k < WIN1 && swingT < 0.12 && near()) {
            const h = B.hand || fast || hands.find(h => h.vis);
            shots++; sfx.hit(1);
            const sp = st.toScreen(p);
            burst(sp.x, sp.y, { n: 8, colors: ["#ffffff", "#ffb36b"], shape: "star", speed: v.U * 0.4, gravity: v.U * 0.4, size: v.U * 0.012, life: 0.4 });
            // 옆: 손 위치와 휘두른 방향 / 높이: 손 높이 (허리 = 아랫줄, 머리 위 = 꼭대기)
            const b = body();
            const xf = h ? clamp(((h.x - b.x) / (b.sw * 1.6)) * 0.5 + (h.vx / (h.speed || 1)) * 0.35 + (Math.random() - 0.5) * 0.15, -1, 1) : 0;
            const lvl = h ? clamp((b.y + b.sw - h.y) / b.sw, 0, 3.2) : 0.5;
            const to = new THREE.Vector3(xf * 0.36, TOP + CH * (0.5 + lvl), CZ);
            B = { dir: -1, p0: p.clone(), to, t: 0, T: SHOT, power: h ? Math.min(1, h.bodySpeed / 12) : 0.5 };
            return;
          }
          if (k >= WIN1 + 0.1) { env.miss(z.cx, v.H * 0.78, "놓쳤어요"); B = null; wait = 0.9; }
        } else if (k >= 1) {
          // 공이 닿은 자리의 깡통 쓰러뜨리기
          const to = B.to, hit = cans.filter(o => o.st === "stand" && Math.abs(o.m.position.x - to.x) < CR * 1.7 && Math.abs(o.m.position.y - to.y) < CH * 0.95);
          if (hit.length) { hit.forEach(o => knock(o, to, B.power)); shake(v.U * 0.008, 0.15); sfx.hit(3); }
          else { const s = st.toScreen(to); popup(s.x, s.y, "아깝다!", { size: v.U * 0.03, color: "#fff", stroke: "#888", life: 0.6 }); }
          B = null; wait = 0.8;
        }
      },
      draw(ctx) {
        const cx = B && B.dir === 1 ? (myX + B.spot) / 2 : myX;   // 내 캐릭터와 가야 할 자리가 함께 보이게
        camX += (cx - camX) * 0.12;
        camera.position.set(camX * 0.5 + 0.1, 3.0, TL + 2.9); camera.lookAt(camX * 0.25, TOP - 0.2, CZ + 0.3);
        st.draw(ctx);
        const U = v.U, left = cans.filter(c => c.st === "stand").length;
        const bw = Math.min(z.w * 0.86, U * 0.7), bx = z.cx - bw / 2, by = v.H * 0.11, bh = U * 0.07;
        ctx.fillStyle = "rgba(120,20,70,.8)"; rr(ctx, bx, by, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, `남은 깡통 ${left} · 쓰러뜨린 깡통 ${knocked}`, z.cx, by + bh / 2, Math.min(U * 0.034, z.w / 16), "#fff", "#5a0d33", 3);
        if (B && B.dir === 1) {
          const ok = near(), fs = Math.min(U * 0.045, z.w / 12), y = by + bh + U * 0.1;   // 안내 줄 아래
          if (!ok) outlinedText(ctx, moveText((B.spot - myX) * 3, false), z.cx, y, fs, "#fff", "#c07800", 4);   // 어디로 얼마나
          else if (B.t / B.T > 0.35) outlinedText(ctx, "휘둘러요!", z.cx, y, fs, "#fff", "#e0306a", 4);
          else outlinedText(ctx, "좋아요! 그 자리", z.cx, y, fs, "#fff", "#2f8f2f", 4);
        }
        outlinedText(ctx, "옆으로 휘두르면 옆으로, 손을 높이 치면 위쪽 깡통!", z.cx, by + bh + U * 0.03, Math.min(U * 0.028, z.w / 22), "#fff", "#555", 3);
      },
      stop() { st.dispose(); },
      result: () => `쓰러뜨린 깡통 ${knocked} · 올 클리어 ${clears}번 · 받아친 공 ${shots}`,
      get ball() { return B ? { incoming: B.dir === 1, k: B.t / B.T, moveTo: B.dir === 1 ? mover.toScreenX(B.spot) : null, near: near() } : null; },
      get left() { return cans.filter(c => c.st === "stand").length; },
    };
  },
  demo: {
    dur: 15,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.walk = 1.6;
      if (T < 4.5) say("깡통 맞추기! 몸을 좌우로 움직여 점선 자리로 가요");
      else if (T < 9.5) say("옆으로 휘두르는 방향, 손 높이로 맞힐 곳을 골라요");
      else if (T < 13.5) say("깡통을 다 쓰러뜨리면 보너스!");
      else say("이제 직접 해 봐요!");
      const b = g.ball, u = p.u, s = p.pts && p.pts[12];
      if (b && b.incoming && b.moveTo != null) p.tcx = b.moveTo;            // 점선 자리로 걸어감
      if (!b || !b.incoming || !s || !b.near) { p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }
      p.rest(0, "guard", 1);
      // 오른손을 허리 높이에서 몸 쪽으로 휘둘러 피라미드 가운데 아랫줄을 노림
      if (b.k < 0.8) p.reach(1, s.x + 1.5 * u, s.y + 1.1 * u, 1.6);
      else p.reach(1, s.x - 1.4 * u, s.y + 1.1 * u, 3);
    },
  },
};
