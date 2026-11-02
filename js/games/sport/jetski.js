// 수상오토바이 (스포츠 리조트처럼 3D): 내 캐릭터 뒤에서 파도치는 바다를 달리며 부표 사이로 통과
// 두 손을 앞으로 내밀어 손잡이를 잡은 것처럼 들고 있으면 출발, 내리면 멈춤. 방향 = 몸을 왼쪽·오른쪽으로 옮기기(내 몸 위치 = 수상오토바이 위치)
// 다음 부표 문 가운데를 물 위 점선·점선 원·방향 글자·카메라 작은 창 세로 점선으로 안내. 빨강·노랑 부표 사이로 통과하면 점수, 별도 모으고 바위는 피하기
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=42";
import { sfx } from "../../audio.js?v=42";
import { stage, THREE, sea, palm, cloud, box, ball as sphere, cyl, mesh, playerAvatar, bodyMover, moveGuide, moveText } from "./kit3d.js?v=42";

const TOP = 60;                         // 최고 속도(km/h, 보통)
const JS = 6, ZD = 80;                  // 게임 좌표 → 3D(m): 옆 1 = 6m, 앞 1 = 80m
const XMAX = 1.4;                       // 좌우 끝(게임 좌표)
const GUIDE_Z = -7;                     // 안내 점선을 그릴 곳(앞쪽, m)
const waveY = (x, zz, t) => Math.sin(x * 0.15 + t * 1.6) * 0.18 + Math.cos(-zz * 0.12 + t * 1.2) * 0.15;   // kit3d sea()와 같은 물결

function jetski(color) {
  const g = new THREE.Group();
  const hull = box(0.95, 0.42, 2.6, color, { rough: 0.35 }); hull.position.y = 0.25; g.add(hull);
  const nose = mesh(new THREE.ConeGeometry(0.67, 1.1, 4), color, { rough: 0.35 }); nose.rotation.set(-Math.PI / 2, Math.PI / 4, 0); nose.scale.set(1, 1, 0.45); nose.position.set(0, 0.27, -1.8); g.add(nose);
  const stripe = box(0.97, 0.08, 2.62, "#ffffff"); stripe.position.y = 0.1; g.add(stripe);
  const seat = box(0.5, 0.22, 1.2, "#222"); seat.position.set(0, 0.55, 0.35); g.add(seat);
  const col = box(0.3, 0.45, 0.3, color); col.position.set(0, 0.65, -0.65); col.rotation.x = -0.4; g.add(col);
  const bar = new THREE.Group(); bar.position.set(0, 0.92, -0.75); g.add(bar);
  const hb = cyl(0.035, 0.035, 0.9, "#333"); hb.rotation.z = Math.PI / 2; bar.add(hb);
  [-1, 1].forEach(s => { const gr = cyl(0.05, 0.05, 0.16, "#111"); gr.rotation.z = Math.PI / 2; gr.position.x = s * 0.47; bar.add(gr); });
  g.bar = bar; return g;
}
function buoy(color) {
  const g = new THREE.Group();
  const b = sphere(0.5, color, { rough: 0.35 }); b.position.y = 0.3; g.add(b);
  const band = cyl(0.51, 0.51, 0.12, "#ffffff"); band.position.y = 0.3; g.add(band);
  const pole = cyl(0.04, 0.04, 1.3, "#333"); pole.position.y = 1.2; g.add(pole);
  const flag = box(0.04, 0.35, 0.5, color); flag.position.set(0, 1.7, 0.25); g.add(flag);
  return g;
}
let starGeo = null, starMat = null;
function star() {
  if (!starGeo) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.25 : 0.6, a = i / 10 * Math.PI * 2 + Math.PI / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    starGeo = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }); starGeo.translate(0, 0, -0.09);
  }
  starMat = starMat || new THREE.MeshStandardMaterial({ color: "#ffd400", emissive: "#7a5a00", metalness: 0.4, roughness: 0.3 });
  const m = new THREE.Mesh(starGeo, starMat); m.castShadow = true;
  const g = new THREE.Group(); g.add(m); g.position.y = 1.2; return g;
}
function rock() {
  const g = new THREE.Group();
  const r = mesh(new THREE.DodecahedronGeometry(1.1, 0), "#6b6b74", { rough: 0.9 }); r.scale.set(1.2, 0.8, 1); r.position.y = 0.2; g.add(r);
  const r2 = mesh(new THREE.DodecahedronGeometry(0.6, 0), "#80808a", { rough: 0.9 }); r2.position.set(0.9, 0.05, 0.3); g.add(r2);
  return g;
}

export default {
  id: "jetski", title: "수상오토바이", icon: "🚤", sec: 50, cursor: "", cat: "sport", bg: "#66a6ff", desc: "좌우로 움직여 부표 통과", scene3d: true,
  how: "두 손을 가슴 앞으로 들어 손잡이를 잡아요(들고 있으면 출발). 몸을 왼쪽·오른쪽으로 옮기면 수상오토바이도 따라가요. 점선 자리로 가서 부표 사이를 통과하고, 바위는 피해요!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const st = stage(env, { fov: 58, sky: ["#3aa6f2", "#e2f5ff"], fog: ["#d6efff", 90, 330], shadowSize: 16 });
    const { scene, camera } = st;
    const water = sea(scene, 500, 0); water.material.color.set("#1f95d3");
    // 멀리 섬 · 해변 · 구름
    [[-70, -220, 40], [80, -260, 50], [0, -330, 70]].forEach(([x, zz, r], i) => {
      const g = new THREE.Group();
      const sand = cyl(r * 1.1, r * 1.2, 1, "#f3e2a9"); g.add(sand);
      const hill = mesh(new THREE.ConeGeometry(r * 0.8, r * 0.5, 10), i === 2 ? "#5a9e4b" : "#3e8e4f", { rough: 0.9 }); hill.position.y = r * 0.25; g.add(hill);
      for (let k = 0; k < 6; k++) { const a = k; g.add(palm(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, 3)); }
      g.position.set(x, 0, zz); scene.add(g);
    });
    for (let i = 0; i < 8; i++) scene.add(cloud(-110 + i * 30, 26 + (i % 3) * 6, -210 - (i % 2) * 50, 5));
    // 나: 수상오토바이 + 앉은 캐릭터
    const ski = jetski(env.color || "#ff6b6b"); scene.add(ski);
    const me = playerAvatar(env); me.rotation.y = Math.PI; me.position.set(0, 0.32, 0.25); ski.add(me);
    me.leg(0, 1.25); me.leg(1, 1.25); me.legs.forEach((l, k) => { l.rotation.z = (k ? 1 : -1) * 0.25; });
    // 물보라 입자 · 하얀 물자국
    const sprayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const sprayGeo = new THREE.SphereGeometry(0.12, 6, 4);
    const spray = Array.from({ length: 60 }, () => { const m = new THREE.Mesh(sprayGeo, sprayMat); m.visible = false; scene.add(m); return { m, life: 0, v: new THREE.Vector3() }; });
    const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    const wakeGeo = new THREE.PlaneGeometry(1, 1);
    const wake = Array.from({ length: 26 }, () => { const m = new THREE.Mesh(wakeGeo, wakeMat.clone()); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return { m, life: 0 }; });
    let si = 0, wi = 0, wakeT = 0;
    // 이동 안내: 물결에 묻히지 않게 조금 띄운 묶음에 그림
    const guideHold = new THREE.Group(); guideHold.position.y = 0.42; scene.add(guideHold);
    const mover = bodyMover(env, XMAX), guideM = moveGuide(guideHold);
    let goalG = null, prevX = 0, gxNow = null;

    let X = 0, speed = 0, steer = 0, t = 0, dist = 0, objs = [], spawnT = 0.5, gateX = 0, safe = 0, holding = false, sprayT = 0;
    let gates = 0, missedG = 0, stars = 0, bumps = 0;
    const wpos = (x, zz) => new THREE.Vector3(x * JS, 0, -zz * ZD);
    const drop = o => { (o.meshes || [o.mesh]).forEach(m => { scene.remove(m); m.traverse(c => { if (c.geometry && c.geometry !== starGeo) c.geometry.dispose(); }); }); };
    function add(o) {
      if (o.kind === "gate") { o.meshes = [buoy("#e23b3b"), buoy("#ffd400")]; const line = new THREE.Group(); for (let i = 0; i < 9; i++) { const f = sphere(0.09, i % 2 ? "#ffffff" : "#ff922b", { cast: false }); line.add(f); } o.meshes.push(line); o.line = line; }
      else o.meshes = [o.kind === "star" ? star() : rock()];
      o.meshes.forEach(m => scene.add(m)); objs.push(o);
    }
    function spawn() {
      const p = env.progress(), r = Math.random();
      gateX = clamp(gateX + (Math.random() - 0.5) * 1.1, -1, 1);
      const w = (0.34 - 0.08 * p) * D.reach;
      add({ kind: "gate", x: gateX, w, z: 1 });
      if (r < 0.45) add({ kind: "star", x: clamp(gateX + (Math.random() - 0.5) * 0.4, -1.1, 1.1), z: 1.18 });
      else if (r < 0.75) add({ kind: "rock", x: clamp(gateX + (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.3), -1.3, 1.3), z: 1.12 });
      spawnT = (1.6 - 0.4 * p) / D.speed;
    }
    return {
      update(dt) {
        t += dt; safe -= dt; sprayT -= dt; wakeT -= dt;
        const p = env.tracker.pts, hs = env.tracker.hands, sc = env.tracker.scale || v.U * 0.13;
        // 손잡이: 두 손이 보이고 엉덩이보다 위(가슴 앞)에 있으면 잡은 것
        const hipY = p && p[23].v && p[24].v ? (p[23].y + p[24].y) / 2 : (p && p[11].v ? p[11].y + sc * 1.7 : v.H);
        holding = hs[0].vis && hs[1].vis && hs[0].y < hipY - sc * 0.15 && hs[1].y < hipY - sc * 0.15;
        const top = TOP * D.speed;
        speed = holding ? Math.min(top, speed + dt * 30) : Math.max(0, speed - dt * 25);
        // 좌우: 내 몸 위치를 그대로 따라감. steer는 옆으로 움직이는 빠르기(손잡이·몸 기울기 모양에만 씀)
        X = clamp(mover.follow(X, dt), -XMAX, XMAX);
        steer += (clamp((X - prevX) / Math.max(dt, 1e-3) * 0.6, -1, 1) - steer) * Math.min(1, dt * 7); prevX = X;
        const zr = speed / 60 * 0.42;
        dist += zr * dt;
        if (speed > 5) { spawnT -= dt; if (spawnT <= 0) spawn(); }
        const meS = st.toScreen(new THREE.Vector3(X * JS, 1.6, 0));
        for (const o of objs) {
          o.z -= zr * dt;
          if (o.done || o.z > 0.04) continue;
          o.done = true;
          const dx = Math.abs(o.x - X), q = meS;
          if (o.kind === "gate") {
            if (dx < o.w) { gates++; sfx.catch(env.player.combo); env.award(1, q.x, q.y - v.U * 0.07); popup(q.x, q.y - v.U * 0.13, "통과!", { size: v.U * 0.045, color: "#fff", stroke: "#1d8f47" }); o.passed = 1; }
            else { missedG++; env.miss(z.cx, q.y - v.U * 0.07, "놓쳤어요"); }
          } else if (o.kind === "star" && dx < 0.22 * D.reach) {
            stars++; o.meshes[0].visible = false; sfx.pop(); env.award(2, q.x, q.y - v.U * 0.07);
            burst(q.x, q.y - v.U * 0.04, { n: 16, colors: ["#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.4, size: v.U * 0.016 });
          } else if (o.kind === "rock" && dx < 0.22 && safe <= 0) {
            bumps++; safe = 1; speed *= 0.3; sfx.thud(); shake(v.U * 0.02, 0.3); env.miss(q.x, q.y - v.U * 0.07, "바위에 쿵!");
          }
        }
        objs = objs.filter(o => { if (o.z > -0.12) return true; drop(o); return false; });
        // 가야 할 자리: 다음 부표 문 가운데 (바위가 문 가운데와 겹치면 바위 반대쪽으로 조금)
        goalG = objs.filter(o => o.kind === "gate" && !o.done && o.z > 0.01).sort((a, b) => a.z - b.z)[0] || null;
        let gx = null;
        if (goalG) {
          gx = goalG.x;
          const rk = objs.find(o => o.kind === "rock" && !o.done && o.z > 0 && o.z < goalG.z && Math.abs(o.x - gx) < 0.3);
          if (rk) gx = clamp(gx + (gx >= rk.x ? 1 : -1) * goalG.w * 0.6, -XMAX, XMAX);
        }
        gxNow = gx;
        const okG = gx != null && Math.abs(X - gx) < goalG.w * 0.8;
        if (gx != null) guideM.show(X * JS, gx * JS, GUIDE_Z, okG, t); else guideM.hide();
        st.pipMark = gx != null ? { x: mover.toScreenX(gx), ok: okG } : null;
        // 3D 반영: 물체
        for (const o of objs) {
          if (o.kind === "gate") {
            const a = wpos(o.x - o.w, o.z), b = wpos(o.x + o.w, o.z);
            [a, b].forEach((pt, k) => { o.meshes[k].position.set(pt.x, waveY(pt.x, pt.z, t) - 0.05, pt.z); o.meshes[k].rotation.z = Math.sin(t * 2 + k) * 0.08; });
            o.line.children.forEach((f, i) => { const u = i / 8; f.position.set(a.x + (b.x - a.x) * u, 0.15 + (o.passed ? 0.3 : 0), a.z); });
          } else {
            const pt = wpos(o.x, o.z), m = o.meshes[0];
            m.position.set(pt.x, o.kind === "star" ? 1.3 + Math.sin(t * 4) * 0.2 : waveY(pt.x, pt.z, t) - 0.1, pt.z);
            if (o.kind === "star") m.rotation.y = t * 3;
          }
        }
        water.position.z = (dist * ZD) % (Math.PI * 2 / 0.12);      // 물결이 앞에서 다가옴
        water.update(t);
        // 나: 파도 위에서 출렁, 손잡이 돌리면 기울어짐
        const x = X * JS, bob = waveY(x, 0, t) + Math.sin(t * 7) * 0.04 * (speed / top);
        ski.position.set(x, bob, 0);
        ski.rotation.set(-0.06 * (speed / top) + Math.sin(t * 3.3) * 0.03, -steer * 0.35, -steer * 0.35);
        ski.bar.rotation.y = steer * 0.45;
        // 팔: 손잡이를 잡은 모양 (돌리는 쪽 손이 내려감)
        me.arm(0, 0.45 + steer * 0.3, 1.0, 0.5); me.arm(1, 0.45 - steer * 0.3, 1.0, 0.5);
        me.body.rotation.z = steer * 0.2; me.body.rotation.x = -0.2 * (speed / top);
        me.visible = !(safe > 0 && Math.floor(t * 10) % 2);
        // 물보라
        if (speed > 15 && sprayT <= 0) {
          sprayT = 0.03;
          for (const s of [-1, 1]) {
            const P = spray[si = (si + 1) % spray.length]; P.life = 0.6; P.m.visible = true;
            P.m.position.set(x + s * 0.55, bob + 0.1, 0.9 + Math.random() * 0.5);
            P.v.set(s * (1.5 + Math.random() * 1.5) - steer * 1.5, 2 + Math.random() * 2.5 * (speed / top), 2 + Math.random() * 2);
          }
        }
        spray.forEach(P => { if (P.life <= 0) return; P.life -= dt; P.v.y -= 9.8 * dt; P.m.position.addScaledVector(P.v, dt); P.m.scale.setScalar(0.6 + (0.6 - P.life) * 2); if (P.life <= 0) P.m.visible = false; });
        // 물자국 (뒤로 흘러가며 퍼지고 사라짐)
        if (speed > 8 && wakeT <= 0) { wakeT = 0.06; const W = wake[wi = (wi + 1) % wake.length]; W.life = 1.2; W.m.visible = true; W.m.position.set(x, 0.32, 1.4); W.m.rotation.z = -steer * 0.35; }
        wake.forEach(W => { if (W.life <= 0) return; W.life -= dt; W.m.position.z += 2.4 * dt; const k = 1.2 - W.life; W.m.scale.set(0.9 + k * 2.6, 0.5, 1); W.m.material.opacity = Math.max(0, W.life / 1.2) * 0.55; if (W.life <= 0) W.m.visible = false; });
      },
      draw(ctx) {
        // 카메라: 수상오토바이 뒤 위쪽
        const x = X * JS;
        camera.position.set(x * 0.8, 3.2, 7.5);
        camera.lookAt(x * 0.7, 0.6, -20);
        st.draw(ctx);
        const U = v.U;
        const bw = Math.min(z.w * 0.86, U * 0.62), bh = U * 0.07, top = v.H * 0.11;
        ctx.fillStyle = "rgba(8,60,110,.8)"; rr(ctx, z.cx - bw / 2, top, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, `${Math.round(speed)} km/h · 통과 ${gates} · ⭐ ${stars}`, z.cx, top + bh / 2, Math.min(U * 0.038, z.w / 15), "#fff", "#0b3c6e", 3);
        if (!holding) outlinedText(ctx, "두 손을 가슴 앞으로 들어 손잡이를 잡아요!", z.cx, v.H * 0.8, Math.min(U * 0.042, z.w / 20), "#fff", "#b04a00", 4);
        if (gxNow != null && goalG) {   // 어디로 얼마나
          const ok = Math.abs(X - gxNow) < goalG.w * 0.8;
          outlinedText(ctx, moveText((gxNow - X) * JS, ok, "좋아요! 그대로", 3), z.cx, top + bh + U * 0.06, Math.min(U * 0.045, z.w / 13), "#fff", ok ? "#2f8f2f" : "#c07800", 4);
        }
      },
      stop() { st.dispose(); },
      result: () => `부표 통과 ${gates} · 놓침 ${missedG} · 별 ${stars} · 바위 ${bumps}`,
      // 설명 시연용
      get X() { return X; }, get speed() { return speed; },
      get moveTo() { return gxNow == null ? null : mover.toScreenX(gxNow); },
      get objs() { return objs.filter(o => !o.done && o.z > 0); },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1; p.walk = 1.6;
      if (g.moveTo != null) p.tcx = g.moveTo;                                   // 점선 자리로 옆걸음
      if (T < 4) say("수상오토바이! 두 손을 가슴 앞으로 들면 출발해요");
      else if (T < 10) say("몸을 옆으로 옮기면 그쪽으로 가요. 점선 자리로!");
      else if (T < 14) say("빨강·노랑 부표 사이로 통과하면 점수! 바위는 피해요");
      else say("이제 직접 해 봐요!");
      const u = p.u, cx = p.cx, y = p.shoulderY + 1.0 * u;
      p.reach(0, cx - 0.85 * u, y, 1.5);   // 두 손으로 손잡이를 잡은 모양
      p.reach(1, cx + 0.85 * u, y, 1.5);
    },
  },
};
