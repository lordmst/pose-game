// 스케이트보드 (스포츠 리조트처럼 3D): 내 캐릭터 뒤에서 바닷가 내리막길을 달리며 동전 모으기
// 방향 = 몸을 왼쪽·오른쪽으로 옮기기(내 몸 위치 = 보드 위치), 속도 = 제자리에서 무릎 들기(발 구르기)
// 다음 동전 줄(또는 앞에 고깔이 있으면 피할 자리)을 바닥 점선·점선 원·방향 글자·카메라 작은 창 세로 점선으로 안내
// 점프 = 두 손을 머리 위로 번쩍(또는 제자리 점프). 고깔·울타리는 피하거나 점프, 점프대에서 점프하면 트릭 보너스
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=77";
import { sfx } from "../../audio.js?v=77";
import { makeStepCounter } from "../run.js?v=77";
import { stage, THREE, sea, palm, cloud, tree, box, cyl, mesh, playerAvatar, bodyMover, moveGuide, moveText } from "./kit3d.js?v=77";

const AIR = 0.8;                         // 점프 시간(초)
const RS = 2.2, ZD = 70;                 // 게임 좌표 → 3D(m): 옆 1 = 2.2m, 앞 1 = 70m
const ROAD = 1.25 * RS;                  // 길 반 너비
const SPAN = 140;                        // 풍경이 되풀이되는 길이
const LMAX = 1;                          // 보드가 갈 수 있는 좌우 끝(게임 좌표)
const GUIDE_Z = -3.2;                    // 안내 점선을 그릴 곳(보드 앞, m)

const AUTO = /simauto=1/.test(typeof location !== "undefined" ? location.search : "");   // 점검용: 가상 선수가 저절로 점선 자리로 가고 발 구르기·점프
// 코스: 동전·고깔·점프대·울타리를 '출발점에서의 거리(cz)'에 놓음. 2인은 같은 코스를 함께 씀
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
function makeCourse() { return { items: [], nextCz: 0.5, id: 1, rnd: rng(1 + Math.floor(Math.random() * 1e9)), racers: [null, null] }; }
let shared = null;   // 2인 경주: 같은 코스·서로의 위치
function extend(C, upTo, p) {
  while (C.nextCz < upTo) {
    const r = C.rnd(), x = (C.rnd() - 0.5) * 1.6, cz = C.nextCz, push = (kind, xx, z, high) => C.items.push({ id: C.id++, kind, x: xx, cz: z, high });
    if (r < 0.45) for (let i = 0; i < 3; i++) push("coin", x, cz + i * 0.08);
    else if (r < 0.7) push("cone", x, cz);
    else if (r < 0.85) { push("ramp", x, cz); push("coin", x, cz + 0.12, true); }
    else push("bar", 0, cz);                                              // 길 전체 울타리: 점프로만
    C.nextCz += 0.36 - 0.1 * p;
  }
}
// 스케이트보드 자세: 보드 위에 옆으로 서서(발은 보드 앞뒤로 벌림) 윗몸·머리만 가는 쪽으로 돌림, 두 팔은 앞뒤로 벌려 균형
export const STANCE = Math.PI / 2;
export function skaterPose(av, board, crouch, air, steer, armsUp, mimicPts) {
  const spread = 0.2 + crouch * 0.5;                                    // 웅크릴수록 다리를 더 벌림(무릎 대신)
  av.legs[0].rotation.set(0, 0, -spread); av.legs[1].rotation.set(0, 0, spread);
  av.body.position.y = 0.1 - 0.78 * (1 - Math.cos(spread)) - crouch * 0.12;
  av.body.rotation.set(0.18 + crouch * 0.5, -0.75, 0);                   // 살짝 숙이고 윗몸을 앞(가는 쪽)으로
  av.headG.rotation.set(-0.1, -0.7, 0);                                   // 고개는 앞을 봄
  if (air > 0 || armsUp) { av.arm(0, 2.3, 0.2, 0.3); av.arm(1, 2.3, 0.2, 0.3); }
  else if (mimicPts) av.mimic(mimicPts, true);
  else { av.arm(0, 1.05, 0.15, 0.35); av.arm(1, 1.05, -0.1, 0.35); }   // 앞뒤로 벌린 팔
  board.rotation.y = -STANCE - steer * 0.25;                              // 보드는 늘 가는 방향
}
export function skateboard(color) {
  const g = new THREE.Group();
  const deck = box(0.26, 0.05, 0.95, color, { rough: 0.5 }); deck.position.y = 0.12; g.add(deck);
  [-1, 1].forEach(s => { const kick = box(0.26, 0.05, 0.16, color); kick.position.set(0, 0.16, s * 0.53); kick.rotation.x = s * 0.45; g.add(kick); });
  [-0.32, 0.32].forEach(z => [-0.1, 0.1].forEach(x => { const w = cyl(0.05, 0.05, 0.05, "#ffe066"); w.rotation.z = Math.PI / 2; w.position.set(x, 0.05, z); g.add(w); }));
  return g;
}
// 원뿔 고깔
function cone() { const g = new THREE.Group(); const c = mesh(new THREE.ConeGeometry(0.28, 0.75, 14), "#ff7a1a"); c.position.y = 0.38; g.add(c); const s = cyl(0.17, 0.2, 0.1, "#ffffff"); s.position.y = 0.4; g.add(s); const b = box(0.6, 0.05, 0.6, "#ff7a1a"); b.position.y = 0.025; g.add(b); return g; }
// 점프대 (경사판)
function ramp() {
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(2.2, 0); shape.lineTo(2.2, 0.7); shape.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: false }); geo.translate(-1.1, 0, -0.9); geo.rotateY(Math.PI / 2);
  const m = mesh(geo, "#c8873a"); const g = new THREE.Group(); g.add(m);
  const lip = box(1.8, 0.06, 0.12, "#ffd43b"); lip.position.set(0, 0.7, -1.1); g.add(lip); return g;
}
// 길 전체 울타리
function bar() {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) { const b = box(ROAD * 2 / 7, 0.22, 0.08, i % 2 ? "#ffffff" : "#e23b3b"); b.position.set(-ROAD + ROAD / 7 + i * ROAD * 2 / 7, 0.55, 0); g.add(b); }
  [-1, 1].forEach(s => { const p = box(0.1, 0.65, 0.1, "#555"); p.position.set(s * (ROAD - 0.05), 0.33, 0); g.add(p); });
  return g;
}
let coinMat = null;
function coin() {
  coinMat = coinMat || new THREE.MeshStandardMaterial({ color: "#ffd400", metalness: 0.6, roughness: 0.25, emissive: "#6b4f00" });
  const m = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 24), coinMat);
  m.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(m); return g;
}

export default {
  id: "skate", title: "스케이트보드", icon: "🛹", sec: 50, cursor: "", cat: "sport", bg: "#cfd9df", desc: "좌우로 움직여 내리막 달리기", scene3d: true,
  how: "몸을 왼쪽·오른쪽으로 옮기면 보드도 따라가요. 점선 자리로 가서 동전을 모으고, 제자리에서 무릎을 들면 빨라져요. 두 손을 머리 위로 번쩍 들면 점프! 장애물은 피하거나 넘어요",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, steps = makeStepCounter();
    const st = stage(env, { outfit: "skate", fov: 58, sky: ["#4fb3f6", "#e6f7ff"], fog: ["#dff2ff", 60, 170], shadowSize: 14 });
    const { scene, camera } = st;
    // 바닷가 길: 오른쪽은 바다·모래, 왼쪽은 풀밭·언덕
    const grass = mesh(new THREE.PlaneGeometry(300, 600), "#7cc35a", { receive: true, cast: false }); grass.rotation.x = -Math.PI / 2; grass.position.set(-150 + ROAD + 2, -0.02, -150); scene.add(grass);
    const water = sea(scene, 600, -0.25); water.position.x = ROAD + 313;
    const sand = box(12, 0.1, 600, "#f1dfa8", { receive: true, cast: false }); sand.position.set(ROAD + 7.5, -0.03, -150); scene.add(sand);
    const road = box(ROAD * 2, 0.06, 600, "#7d7f88", { receive: true, cast: false }); road.position.set(0, 0, -150); scene.add(road);
    [-1, 1].forEach(s => { const c = box(0.25, 0.14, 600, "#e9ecef", { receive: true }); c.position.set(s * (ROAD + 0.12), 0.05, -150); scene.add(c); });
    for (let i = 0; i < 8; i++) scene.add(cloud(-60 + i * 22, 22 + (i % 3) * 5, -170 - (i % 2) * 40, 4));
    const hills = [];
    for (let i = 0; i < 5; i++) { const h = mesh(new THREE.SphereGeometry(18 + i * 3, 16, 10), i % 2 ? "#5fae4a" : "#4c9c43", { cast: false }); h.position.set(-45 - i * 6, -8, -60 - i * 45); h.scale.y = 0.6; scene.add(h); hills.push(h); }
    // 흘러가는 풍경: 가운데 점선, 야자수, 나무, 가로등
    const deco = [];
    const add = (o, zz) => { o.position.z = zz; o.userData.z0 = zz; scene.add(o); deco.push(o); };
    for (let i = 0; i < 14; i++) add(box(0.14, 0.02, 1.6, "#ffffff", { cast: false }), -i * (SPAN / 14));
    for (let i = 0; i < 10; i++) { const p = palm(ROAD + 3 + (i % 2) * 4, 0, 1.1 + (i % 3) * 0.15); add(p, -i * (SPAN / 10) - 5); }
    for (let i = 0; i < 8; i++) { const tr = tree(-ROAD - 3 - (i % 3) * 3, 0, 1.2 + (i % 2) * 0.3, i % 2 ? "#3f9b3f" : "#2f8a4f"); add(tr, -i * (SPAN / 8) - 9); }
    for (let i = 0; i < 4; i++) { const g = new THREE.Group(); const pole = cyl(0.06, 0.08, 4, "#495057"); pole.position.y = 2; const lamp = box(0.6, 0.12, 0.25, "#495057"); lamp.position.set(0.3, 4, 0); g.add(pole, lamp); g.position.x = -ROAD - 0.6; add(g, -i * (SPAN / 4) - 20); }
    // 나
    const me = playerAvatar(env); me.rotation.order = "ZYX"; me.rotation.y = Math.PI + STANCE; scene.add(me);
    const board = skateboard(env.color || "#3b5bdb"); me.add(board); board.position.y = -0.12; board.rotation.y = -STANCE;
    me.body.position.y = 0.1;
    const mover = bodyMover(env, LMAX), guideM = moveGuide(scene);
    let target = null, prevL = 0;

    let L = 0, speed = 18, t = 0, dist = 0, objs = [], air = 0, safe = 0, steer = 0, armsUp = false, hipBase = null;
    let coins = 0, tricks = 0, crashes = 0, onRamp = false, pushT = 9, pushLeg = 0, finalDone = false, autoPush = 0;
    // 코스: 1인은 혼자, 2인은 함께 (같은 동전·장애물, 동전은 먼저 잡은 사람 것)
    const two = env.mode === 2;
    const C = two ? (shared = shared || makeCourse()) : makeCourse();
    const done = new Set(), live = new Map();
    let rival = null;                              // 2인: 상대 보드 (상대 정보가 처음 들어오면 만듦)
    function show(it) {
      const o = { ...it, src: it, z: it.cz - dist };
      o.mesh = o.kind === "coin" ? coin() : o.kind === "cone" ? cone() : o.kind === "ramp" ? ramp() : bar();
      scene.add(o.mesh); live.set(it.id, o);
    }
    // 2인 경주 안내: 순위·거리 차이·두 사람 점수
    function raceHud(ctx, y0) {
      const U = v.U, Rv = C.racers[1 - env.slot], A = C.racers[0], B = C.racers[1]; if (!Rv || !A || !B) return;
      const first = dist >= Rv.dist, gap = Math.round(Math.abs(dist - Rv.dist) * ZD);
      const fs = Math.min(U * 0.032, z.w / 20), y = y0 + U * 0.045;
      outlinedText(ctx, gap < 3 ? "🤝 나란히!" : `${first ? "🥇 1등" : "🥈 2등"} · ${first ? `${gap}m 앞서요` : `${gap}m 뒤져요`}`, z.cx, y, fs * 1.15, "#fff", first ? "#d08a00" : "#5a6b7d", 3);
      outlinedText(ctx, `1P ${A.name} ${A.score} : ${B.score} ${B.name} 2P`, z.cx, y + fs * 1.35, fs, "#fff", "#333", 3);
    }
    function jump() { if (air <= 0) { air = AIR; onRamp = false; sfx.whoosh(); } }
    const wpos = (x, zz, y = 0) => new THREE.Vector3(x * RS, y, -zz * ZD);
    const drop = m => { scene.remove(m); m.traverse(c => { if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose(); }); };
    return {
      update(dt) {
        t += dt; safe -= dt; pushT += dt;
        const p = env.tracker.pts, sc = env.tracker.scale || v.U * 0.13;
        // 좌우: 내 몸 위치를 그대로 따라감. steer는 옆으로 움직이는 빠르기(보드·몸 기울기 모양에만 씀)
        if (AUTO) { if (target != null) L += (target - L) * Math.min(1, dt * 2.5); }
        else L = clamp(mover.follow(L, dt), -LMAX, LMAX);
        steer += (clamp((L - prevL) / Math.max(dt, 1e-3) * 0.7, -1, 1) - steer) * Math.min(1, dt * 8); prevL = L;
        if (p && p[11].v && p[12].v) {
          // 점프: 두 손을 머리 위로 번쩍 (들어가는 순간), 또는 엉덩이가 확 올라감
          const up = p[15].v && p[16].v && p[0].v && p[15].y < p[0].y - sc * 0.2 && p[16].y < p[0].y - sc * 0.2;
          if (up && !armsUp) jump(); armsUp = up;
          if (p[23].v && p[24].v) { const hy = (p[23].y + p[24].y) / 2; hipBase = hipBase == null ? hy : Math.max(hy, hipBase - dt * sc * 0.1); if (hipBase - hy > sc * 0.35) jump(); }
        }
        // 발 구르기(무릎 들기)마다 빨라짐, 가만히 있으면 천천히 느려짐
        let n = steps.update(p, t, dt);
        if (AUTO) { autoPush -= dt; if (autoPush <= 0 && speed < (env.slot ? 38 : 44)) { n = 1; autoPush = 0.35; } else n = 0;   // 가상 선수: 발 구르기
          const dz = objs.find(o => !o.done && (o.kind === "bar" || (o.kind === "cone" && Math.abs(o.x - L) < 0.3)) && o.z > 0 && o.z < 0.06);
          if (dz && Math.random() < 0.85) jump(); }
        if (n) { speed = Math.min(48, speed + 3.5 * n); sfx.step(n % 2); pushT = 0; pushLeg = 1 - pushLeg; }
        speed = Math.max(10, speed - dt * 1.6);
        air = Math.max(0, air - dt);
        const zr = speed / 30 * 0.32 * D.speed;
        dist += zr * dt;
        extend(C, dist + 1.1, env.progress());
        for (const it of C.items) { const rz = it.cz - dist; if (rz < 1.1 && rz > -0.12 && !live.has(it.id) && !done.has(it.id)) show(it); }
        objs = [...live.values()];
        for (const o of objs) if (!o.retry) o.z = o.src.cz - dist; else o.z -= zr * dt;
        if (two) C.racers[env.slot] = { L, dist, speed, steer, air, onRamp, color: env.color, name: env.name, score: env.player.score || 0 };   // 내 위치·점수
        const meS = () => st.toScreen(new THREE.Vector3(L * RS, 1.2, 0));
        for (const o of objs) {
          if (o.done || o.z > 0.05) continue;
          o.done = true; done.add(o.id);
          if (o.kind === "coin" && o.src.takenBy != null) continue;            // 상대가 먼저 잡은 동전
          const near = o.kind === "bar" || Math.abs(o.x - L) < 0.26 * D.reach, q = meS();
          if (!near) continue;
          if (o.kind === "coin") {
            if (o.high && air <= 0) { o.retry = true; o.z = -1; continue; }   // 점프대 위 동전은 점프해야
            coins++; o.src.takenBy = env.slot; o.mesh.visible = false; sfx.catch(env.player.combo); env.award(1, q.x, q.y - v.U * 0.06);
            burst(q.x, q.y, { n: 10, colors: ["#ffd400", "#fff3a0"], shape: "star", speed: v.U * 0.4, gravity: v.U * 0.4, size: v.U * 0.013, life: 0.5 });
          } else if (o.kind === "ramp") {
            if (air <= 0) air = AIR * 1.1;                                    // 점프대를 타면 저절로 붕~ (한 바퀴 돌기)
            onRamp = true;
            tricks++; env.award(2, q.x, q.y - v.U * 0.08); sfx.fanfare();
            popup(q.x, q.y - v.U * 0.14, "트릭!", { size: v.U * 0.05, color: "#fff", stroke: "#e0306a" });
          } else if (air > 0) { env.award(1, q.x, q.y - v.U * 0.06); popup(q.x, q.y - v.U * 0.12, "점프!", { size: v.U * 0.04, color: "#fff", stroke: "#1d8f47" }); }
          else if (safe <= 0) {
            crashes++; safe = 1; speed = 10; sfx.thud(); shake(v.U * 0.02, 0.3); env.miss(q.x, q.y - v.U * 0.06, "쿵!");
            burst(q.x, q.y, { n: 14, colors: ["#ff8a3d", "#ffffff"], speed: v.U * 0.5, gravity: v.U, size: v.U * 0.014 });
            o.mesh.rotation.x = -1.2; o.mesh.position.y = 0.2;
          }
        }
        for (const o of objs) if (o.z <= -0.12) { drop(o.mesh); live.delete(o.id); }
        objs = objs.filter(o => o.z > -0.12);
        if (C.items.length > 300) { const lo = Math.min(dist, ...C.racers.filter(Boolean).map(r => r.dist)) - 0.3; C.items = C.items.filter(it => it.cz > lo); }
        const Rv0 = two ? C.racers[1 - env.slot] : null;   // 경주가 끝날 무렵 앞선 사람에게 1등 보너스
        if (Rv0 && !finalDone && env.progress() > 0.97) { finalDone = true; if (dist >= Rv0.dist) { env.award(5, z.cx, v.H * 0.4); popup(z.cx, v.H * 0.47, "1등!", { size: v.U * 0.09, color: "#fff", stroke: "#e0306a", life: 1.6 }); sfx.fanfare(); } }
        // 가야 할 자리: 앞에 내 줄을 막는 고깔이 먼저 오면 피할 자리, 아니면 다음 동전 줄(점프대 포함)
        const ahead = objs.filter(o => !o.done && o.z > 0.02 && o.z < 0.95).sort((a, b) => a.z - b.z);
        const goodO = ahead.find(o => (o.kind === "coin" && !o.high) || o.kind === "ramp");
        const cone_ = ahead.find(o => o.kind === "cone" && Math.abs(o.x - L) < 0.4 && (!goodO || o.z <= goodO.z));
        if (cone_) { const side = cone_.x > 0 ? -1 : 1; target = clamp(cone_.x + side * 0.6, -0.9, 0.9); }
        else target = goodO ? goodO.x : null;
        const ok = target != null && Math.abs(target - L) < 0.22 * D.reach;
        if (target != null) guideM.show(L * RS, target * RS, GUIDE_Z, ok, t); else guideM.hide();
        st.pipMark = target != null ? { x: mover.toScreenX(target), ok } : null;
        // 3D 반영
        for (const o of objs) {
          if (o.z < -0.9) continue;
          const y = o.kind === "coin" ? (o.high ? 2.0 : 0.7) : (o.mesh.position.y || 0);
          o.mesh.position.copy(wpos(o.x, o.z, y));
          if (o.kind === "coin") { o.mesh.rotation.y = t * 4 + o.x * 9; if (o.src.takenBy != null && o.src.takenBy !== env.slot) o.mesh.visible = false; }   // 상대가 잡은 동전은 사라짐
        }
        const ws = zr * ZD;
        deco.forEach(d => { d.position.z += ws * dt; if (d.position.z > 12) d.position.z -= SPAN; });
        water.update(t);
        const k = air > 0 ? 1 - air / AIR : 0, jy = air > 0 ? Math.sin(Math.min(1, k) * Math.PI) * (onRamp ? 2.2 : 1.3) : 0;
        me.position.set(L * RS, jy, 0);
        me.rotation.y = Math.PI + STANCE + (air > 0 && onRamp ? Math.min(1, k) * Math.PI * 2 : 0);
        me.rotation.z = steer * 0.28;                                       // 가는 방향 축으로 기울며 돎 (회전 순서 ZYX라 옆으로 서 있어도 맞게 기욺)
        // 몸: 웅크리기(점프 직전·공중), 발로 밀 때 살짝 들썩, 팔
        const crouch = air > 0 ? 0.3 : 0.12 + (pushT < 0.3 && air <= 0 ? 0.08 * Math.sin(pushT / 0.3 * Math.PI) : 0);
        skaterPose(me, board, crouch, air, steer, armsUp, env.tracker.pts && !(air > 0 || armsUp) ? env.tracker.pts : null);
        me.visible = !(safe > 0 && Math.floor(t * 10) % 2);
        // 상대: 같은 길에서 앞뒤·옆 위치 그대로, 점프도 같이
        if (two) {
          const Rv = C.racers[1 - env.slot];
          if (Rv && !rival) { rival = playerAvatar({ color: Rv.color, name: Rv.name }); rival.rotation.order = "ZYX"; rival.rotation.y = Math.PI + STANCE; const bd = skateboard(Rv.color || "#4dabf7"); rival.add(bd); bd.position.y = -0.12; rival.userData.board = bd; scene.add(rival); }
          if (rival) {
            rival.visible = Rv.dist - dist < 1.2 && (Rv.dist - dist) * ZD > -1.5;   // 뒤처진 상대는 카메라 앞을 가리지 않게 숨김
            const ra = Rv.air || 0, rk = ra > 0 ? 1 - ra / AIR : 0, ry = ra > 0 ? Math.sin(Math.min(1, rk) * Math.PI) * (Rv.onRamp ? 2.2 : 1.3) : 0;
            rival.position.set(Rv.L * RS, ry, -(Rv.dist - dist) * ZD);
            rival.rotation.z = (Rv.steer || 0) * 0.28;
            skaterPose(rival, rival.userData.board, ra > 0 ? 0.3 : 0.12, ra, Rv.steer || 0, false, null);
          }
        }
      },
      draw(ctx) {
        // 카메라: 캐릭터 뒤 위쪽에서 내리막길 아래를 봄
        camera.position.set(L * RS * 0.6, 3.0, 6.2);
        camera.lookAt(L * RS * 0.5, 0.2, -18);
        st.draw(ctx);
        const U = v.U;
        const bw = Math.min(z.w * 0.86, U * 0.62), bh = U * 0.07, top = v.H * 0.11;
        ctx.fillStyle = "rgba(40,40,50,.78)"; rr(ctx, z.cx - bw / 2, top, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, `${Math.round(speed)} km/h · 🪙 ${coins}`, z.cx, top + bh / 2, Math.min(U * 0.04, z.w / 13), "#fff", "#333", 3);
        if (two) raceHud(ctx, top + bh);
        if (rival && rival.visible) {   // 상대 이름표
          const Rv = C.racers[1 - env.slot], q = st.toScreen(rival.position.clone().add(new THREE.Vector3(0, 2.3, 0)));
          if (!q.behind && q.x > z.x0 && q.x < z.x1) outlinedText(ctx, Rv.name || "상대", q.x, q.y, Math.min(U * 0.03, z.w / 22), "#fff", Rv.color || "#555", 3);
        }
        if (target != null) {   // 어디로 얼마나
          const ok = Math.abs(target - L) < 0.22 * D.reach;
          outlinedText(ctx, moveText((target - L) * RS, ok, "좋아요! 그대로"), z.cx, top + bh + U * (two ? 0.16 : 0.06), Math.min(U * 0.045, z.w / 13), "#fff", ok ? "#2f8f2f" : "#c07800", 4);
        }
        if (speed < 13 && t > 2) outlinedText(ctx, "무릎을 들어 발을 굴러요!", z.cx, v.H * 0.8, Math.min(U * 0.045, z.w / 14), "#fff", "#b04a00", 4);
      },
      stop() { st.dispose(); shared = null; },
      result: () => `동전 ${coins} · 트릭 ${tricks} · 쿵 ${crashes}`,
      // 설명 시연용
      get L() { return L; }, get speed() { return speed; }, get air() { return air; },
      get moveTo() { return target == null ? null : mover.toScreenX(target); },
      get objs() { return objs.filter(o => !o.done && o.z > 0); },
      get dist() { return dist; },
    };
  },
  demo: {
    dur: 17,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.walk = 1.6; p.leanT = 0;
      if (g.moveTo != null) p.tcx = g.moveTo;                                   // 점선 자리로 옆걸음
      if (T < 4) say("스케이트보드! 몸을 옆으로 옮기면 보드도 따라가요");
      else if (T < 9) say("제자리에서 무릎을 들면 빨라져요");
      else if (T < 15) say("두 손을 머리 위로 번쩍! 점프해서 장애물을 넘어요");
      else say("이제 직접 해 봐요!");
      const os = g.objs.sort((a, b) => a.z - b.z);
      // 가까운 장애물이 길 안에 있으면 점프, 아니면 동전 쪽으로 기울이기
      const danger = os.find(o => (o.kind === "bar" || (o.kind === "cone" && Math.abs(o.x - g.L) < 0.35)) && o.z < 0.2);
      if (danger && g.air <= 0 && (!S.jt || T - S.jt > 0.9)) { S.jt = T; S.up = T; }
      const arms = S.up && T - S.up < 0.35;
      p.rest(0, arms ? "up" : "down", arms ? 6 : 2); p.rest(1, arms ? "up" : "down", arms ? 6 : 2);
      // 발 구르기: 속도가 느리면 무릎을 번갈아
      if (g.speed < 30 && !arms) { const ph = Math.floor(T / 0.33); if (ph !== S.ph) { S.ph = ph; p.legs = ph % 2 ? ["stand", "raise"] : ["raise", "stand"]; } }
      else p.legs = ["stand", "stand"];
    },
  },
};
