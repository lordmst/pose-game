// 비행기 (스포츠 리조트의 섬 비행처럼 3D): 빨간 프로펠러 비행기 뒤에서 열대 섬 바다 위를 날기
// 두 팔을 날개처럼 벌리고 날기. 기울이기 = 두 손 높이 차이(오른손이 낮으면 오른쪽으로), 날갯짓(두 손을 함께 아래로 휘두르기) = 위로 올라감
// 팔을 벌리고 있으면 천천히 내려가고(활공), 팔을 내리면 빨리 내려감. 풍선·링을 모으고 섬 산에 부딪히지 않기
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=76";
import { sfx } from "../../audio.js?v=76";
import { stage, THREE, sea, palm, cloud, box, ball as sphere, cyl, mesh, avatar } from "./kit3d.js?v=76";

const ZRATE = 0.33;          // 물체가 멀리서 다가오는 속도(1/초, 보통)
const FLAP = 2.0;            // 날갯짓으로 인정하는 손 아래 방향 속도(어깨너비/초)
const XS = 7, AS = 16, Y0 = 1.2, ZD = 90;   // 게임 좌표 → 3D(m): 옆 1 = 7m, 높이 1 = 16m, 앞 1 = 90m

const SHOW_RIVAL = false;   // 2인에서 상대 비행기를 내 화면에도 보일지 (가족 의견: 각자 자기 것만)
const AUTO = /simauto=1/.test(typeof location !== "undefined" ? location.search : "");   // 점검용: 가상 선수가 저절로 목표 쪽으로 기울이고 날갯짓
// 코스: 풍선·링·섬을 '출발점에서의 거리(cz)'에 놓음. 2인은 같은 코스를 함께 씀. 링을 통과하면 잠깐 빨라짐(경주)
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
// 비행기 빨간 몸통을 선수 색으로 (2인에서 누구 비행기인지 알아보게)
function tint(g, color) { g.traverse(c => { if (c.isMesh && c.material && c.material.color && c.material.color.getHexString() === "e8332f") { c.material = c.material.clone(); c.material.color.set(color); } }); }
function makeCourse() { return { items: [], nextCz: 0.55, ox: 0, id: 1, rnd: rng(1 + Math.floor(Math.random() * 1e9)), racers: [null, null] }; }
let shared = null;   // 2인 경주: 같은 하늘길·서로의 위치
function extend(C, upTo, p) {
  while (C.nextCz < upTo) {
    const r = C.rnd(), cz = C.nextCz, alt = 0.25 + C.rnd() * 0.6, push = (kind, ox, a, z) => C.items.push({ id: C.id++, kind, ox, a, cz: z, col: Math.floor(C.rnd() * 5) });
    C.ox = clamp(C.ox + (C.rnd() - 0.5) * 1.4, -1.4, 1.4);
    if (r < 0.55) push("balloon", C.ox, alt, cz);
    else if (r < 0.8) { const sgn = C.rnd() < 0.5 ? -1 : 1; for (let i = 0; i < 3; i++) push("ring", C.ox + i * 0.08 * sgn, alt, cz + i * 0.13); }
    else { push("island", C.ox, 0, cz); push("balloon", C.ox, 0.75, cz + 0.02); }
    C.nextCz += 0.41 - 0.115 * p;
  }
}
// 작은 섬: 모래 + 초록 산 + 야자수
function island(r = 4, h = 9) {
  const g = new THREE.Group();
  const sand = cyl(r * 1.25, r * 1.4, 0.6, "#f3e2a9", { receive: true }); sand.position.y = 0.1; g.add(sand);
  const hill = mesh(new THREE.ConeGeometry(r, h, 9), "#3e9b4f", { rough: 0.9 }); hill.position.y = h / 2; g.add(hill);
  const rock = mesh(new THREE.ConeGeometry(r * 0.45, h * 0.35, 6), "#8d7a63"); rock.position.set(r * 0.25, h * 0.88, 0); g.add(rock);
  for (let i = 0; i < 3; i++) { const a = i * 2.1; g.add(palm(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, 0.8)); }
  return g;
}
// 빨간 프로펠러 비행기 (+조종사). 앞은 -z
function airplane(color) {
  const g = new THREE.Group();
  const body = cyl(0.42, 0.22, 3.2, "#e8332f"); body.rotation.x = Math.PI / 2; g.add(body);
  const nose = sphere(0.43, "#e8332f"); nose.position.z = -1.55; nose.scale.set(1, 1, 0.8); g.add(nose);
  const cap = cyl(0.12, 0.12, 0.2, "#ffd43b"); cap.rotation.x = Math.PI / 2; cap.position.z = -1.95; g.add(cap);
  const wing = box(5.2, 0.1, 0.95, "#ffffff"); wing.position.set(0, -0.1, -0.5); g.add(wing);
  [-1, 1].forEach(s => { const tip = box(0.6, 0.11, 0.96, "#e8332f"); tip.position.set(s * 2.35, -0.1, -0.5); g.add(tip); });
  const tailH = box(1.8, 0.08, 0.5, "#ffffff"); tailH.position.set(0, 0.05, 1.45); g.add(tailH);
  const tailV = box(0.08, 0.75, 0.55, "#e8332f"); tailV.position.set(0, 0.42, 1.45); g.add(tailV);
  const prop = new THREE.Group(); prop.position.z = -2.05; g.add(prop);
  const b1 = box(0.12, 1.5, 0.04, "#333"); prop.add(b1); const b2 = b1.clone(); b2.rotation.z = Math.PI / 2; prop.add(b2);
  const disc = mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }), { cast: false }); disc.position.z = -2.07; g.add(disc);
  // 조종사 (윗몸만 보임)
  const pilot = avatar({ shirt: color || "#ff6b6b", pants: "#2b3a67" }); pilot.scale.setScalar(0.62); pilot.rotation.y = Math.PI; pilot.position.set(0, -0.35, -0.1); g.add(pilot);
  const glass = mesh(new THREE.SphereGeometry(0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35 }), { cast: false }); glass.position.set(0, 0.3, -0.45); glass.scale.set(1, 0.9, 1.4); g.add(glass);
  g.prop = prop; g.pilot = pilot;
  return g;
}

export default {
  id: "plane", title: "비행기", icon: "✈️", sec: 50, cursor: "", cat: "sport", bg: "#89f7fe", desc: "팔 날개로 섬 하늘 날기", scene3d: true,
  how: "두 팔을 날개처럼 벌려요. 오른쪽으로 가려면 오른손을 내리고, 두 팔을 아래로 힘껏 휘저으면 위로 올라가요. 풍선과 링을 모아요!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const st = stage(env, { outfit: "plane", fov: 55, sky: ["#3fa9f5", "#dff4ff"], fog: ["#cfeeff", 120, 480], shadowSize: 30 });
    const { scene, camera } = st;
    st.sun.position.set(20, 40, 10);
    const water = sea(scene, 700, 0); water.material.color.set("#29a3d6");
    // 멀리 있는 큰 섬 (수평선) + 구름
    const far = island(40, 34); far.position.set(-60, 0, -330); scene.add(far);
    const far2 = island(26, 22); far2.position.set(110, 0, -300); scene.add(far2);
    for (let i = 0; i < 9; i++) scene.add(cloud(-120 + i * 32, 30 + (i % 3) * 8, -200 - (i % 2) * 60, 5 + (i % 3)));
    // 지나가는 작은 섬들 (풍경, 계속 돌아옴)
    const deco = [];
    for (let i = 0; i < 6; i++) { const s = island(3 + (i % 3), 5 + (i % 3) * 2); s.position.set((i % 2 ? 1 : -1) * (30 + (i * 13) % 25), 0, -i * 45); scene.add(s); deco.push(s); }
    const plane = airplane(env.color); scene.add(plane);
    const geo = { balloon: new THREE.SphereGeometry(1, 18, 14), ring: new THREE.TorusGeometry(2.1, 0.22, 10, 32) };
    const balloonMats = ["#ff5a7a", "#ffd43b", "#4dabf7", "#69db7c", "#cc5de8"].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
    const ringMat = new THREE.MeshStandardMaterial({ color: "#ffd400", emissive: "#7a5a00", roughness: 0.3 });

    let X = 0, A = 0.55, vA = 0, steer = 0, objs = [], t = 0, dist = 0, flapCool = 0, wet = 0, flapN = 0;
    let got = 0, rings = 0, streak = 0, lastRing = -9, wide = false, flapFx = 0, roll = 0, boost = 0, slow = 0, finalDone = false, autoFlapT = 0;
    const wpos = (ox, a, oz) => new THREE.Vector3(ox * XS, Y0 + a * AS, -oz * ZD);
    // 코스: 1인은 혼자, 2인은 함께 (같은 풍선·링·섬, 풍선은 먼저 터뜨린 사람 것)
    const two = env.mode === 2;
    const C = two ? (shared = shared || makeCourse()) : makeCourse();
    const done = new Set(), live = new Map();
    let rival = null;                              // 2인: 상대 비행기 — 각 화면엔 그 화면 선수만 보이게 해서 만들지 않음(SHOW_RIVAL)
    if (two && env.color) tint(plane, env.color);
    function show(it) {
      const o = { ...it, src: it, z: it.cz - dist, done: false };
      if (o.kind === "balloon") { o.mesh = new THREE.Group(); const b = new THREE.Mesh(geo.balloon, balloonMats[it.col]); b.scale.set(1, 1.2, 1); b.castShadow = true; o.mesh.add(b); const str = cyl(0.02, 0.02, 1.6, "#666"); str.position.y = -2; o.mesh.add(str); }
      else if (o.kind === "ring") { o.mesh = new THREE.Mesh(geo.ring, ringMat); o.mesh.castShadow = true; }
      else { o.mesh = island(3.2, 10); o.a = 0; }
      scene.add(o.mesh); live.set(it.id, o);
    }
    // 2인 경주 안내: 순위·거리 차이·두 사람 점수
    function raceHud(ctx, y0) {
      const U = v.U, Rv = C.racers[1 - env.slot], Aa = C.racers[0], B = C.racers[1]; if (!Rv || !Aa || !B) return;
      const first = dist >= Rv.dist, gap = Math.round(Math.abs(dist - Rv.dist) * ZD);
      const fs = Math.min(U * 0.032, z.w / 20), y = y0 + U * 0.045;
      outlinedText(ctx, gap < 4 ? "🤝 나란히!" : `${first ? "🥇 1등" : "🥈 2등"} · ${first ? `${gap}m 앞서요` : `${gap}m 뒤져요`}`, z.cx, y, fs * 1.15, "#fff", first ? "#d08a00" : "#5a6b7d", 3);
      outlinedText(ctx, `1P ${Aa.name} ${Aa.score} : ${B.score} ${B.name} 2P`, z.cx, y + fs * 1.35, fs, "#fff", "#0a3c6e", 3);
    }
    // 지나간 물체 치우기 (함께 쓰는 모양은 남김)
    const drop = m => { scene.remove(m); m.traverse(c => { if (c.geometry && c.geometry !== geo.balloon && c.geometry !== geo.ring) c.geometry.dispose(); }); };
    const scr = (ox, a, oz) => st.toScreen(wpos(ox, a, oz));
    return {
      update(dt) {
        t += dt; flapCool -= dt; flapFx = Math.max(0, flapFx - dt * 3); wet -= dt;
        const p = env.tracker.pts, hs = env.tracker.hands, sc = env.tracker.scale || v.U * 0.13;
        // 기울이기: 오른손(화면 오른쪽)이 낮으면 오른쪽으로
        if (AUTO) {   // 가상 선수: 가장 가까운 풍선·링 쪽으로 기울이고, 낮으면 날갯짓
          const tg = objs.filter(o => !o.done && o.kind !== "island" && o.z > 0.03).sort((a, b) => a.z - b.z)[0];
          steer += (clamp(tg ? (tg.ox - X) * 3 : 0, -1, 1) - steer) * Math.min(1, dt * 6);
          autoFlapT -= dt; if (autoFlapT <= 0 && A < (tg ? tg.a : 0.5) + 0.02) { vA = Math.min(0.4, vA + 0.2); autoFlapT = env.slot ? 0.4 : 0.3; flapN++; flapFx = 1; }
          wide = true;
        } else if (hs[0].vis && hs[1].vis) {
          const tilt = (hs[1].y - hs[0].y) / sc;
          steer += (clamp(tilt / 0.9, -1, 1) - steer) * Math.min(1, dt * 6);
          // 날갯짓: 두 손이 함께 빠르게 아래로
          const down = Math.min(hs[0].vy, hs[1].vy) / sc;
          if (down > FLAP * D.punch && flapCool <= 0) { vA = Math.min(0.4, vA + 0.2); flapCool = 0.28; flapN++; flapFx = 1; sfx.whoosh(); }
          wide = p && p[11].v && p[12].v && (p[11].x - hs[0].x) / sc > 0.9 && (hs[1].x - p[12].x) / sc > 0.9;
        } else steer *= 0.9;
        X = clamp(X + steer * 0.95 * dt, -1.6, 1.6);
        vA -= (wide ? 0.12 : 0.24) * dt; vA *= Math.pow(0.6, dt); vA = clamp(vA, -0.3, 0.4);
        A = clamp(A + vA * dt, 0.03, 1);
        const pp = wpos(X, A, 0), ps = st.toScreen(pp);
        if (A <= 0.03) { vA = Math.max(vA, 0.05); if (wet <= 0) { wet = 2; env.miss(ps.x, ps.y, "물에 닿았어요! 날갯짓!"); burst(ps.x, ps.y + v.U * 0.05, { n: 16, colors: ["#bfefff", "#ffffff"], speed: v.U * 0.5, gravity: v.U, size: v.U * 0.012 }); } }
        boost = Math.max(0, boost - dt); slow = Math.max(0, slow - dt);
        const zr = ZRATE * D.speed * (boost > 0 ? 1.35 : 1) * (slow > 0 ? 0.6 : 1);   // 링 통과 = 잠깐 빨라짐, 섬 부딪힘 = 느려짐
        dist += zr * dt;
        extend(C, dist + 1.1, env.progress());
        for (const it of C.items) { const rz = it.cz - dist; if (rz < 1.1 && rz > -0.1 && !live.has(it.id) && !done.has(it.id)) show(it); }
        objs = [...live.values()];
        for (const o of objs) o.z = o.src.cz - dist;
        if (two) C.racers[env.slot] = { X, A, dist, steer, roll, vA, color: env.color, name: env.name, score: env.player.score || 0 };   // 내 위치·점수
        for (const o of objs) {
          if (o.done || o.z > 0.04) continue;
          o.done = true; done.add(o.id);
          if (o.kind === "balloon" && o.src.takenBy != null) continue;          // 상대가 먼저 터뜨린 풍선
          const dx = Math.abs(o.ox - X), dh = Math.abs(o.a - A), q = scr(o.ox, o.a, 0);
          if (o.kind === "island") {
            if (dx < 0.3 && A < 0.5) { vA = 0.45; slow = 1; shake(v.U * 0.02, 0.3); sfx.thud(); env.miss(ps.x, ps.y, "산에 쿵!"); streak = 0; }
          } else if (dx < 0.2 * D.reach && dh < 0.17 * D.reach) {
            if (o.kind === "balloon") { got++; o.src.takenBy = env.slot; o.mesh.visible = false; sfx.pop(); env.award(1, q.x, q.y - v.U * 0.05); burst(q.x, q.y, { n: 18, colors: ["#ff5a7a", "#ffd400", "#ffffff"], speed: v.U * 0.6, gravity: v.U * 0.5, size: v.U * 0.015 }); }
            else {
              rings++; o.hit = 1; boost = 1.5; streak = t - lastRing < 1.2 ? streak + 1 : 1; lastRing = t; sfx.catch(env.player.combo);
              env.award(streak >= 3 ? 2 : 1, q.x, q.y - v.U * 0.05);
              if (streak >= 3) popup(q.x, q.y + v.U * 0.05, `링 ${streak}개 연속!`, { size: v.U * 0.04, color: "#fff", stroke: "#1d8f47" });
            }
          } else if (o.kind === "ring") streak = 0;
        }
        for (const o of objs) if (o.z <= (o.kind === "island" ? -0.03 : -0.08)) { drop(o.mesh); live.delete(o.id); }
        objs = objs.filter(o => o.z > (o.kind === "island" ? -0.03 : -0.08));
        if (C.items.length > 300) { const lo = Math.min(dist, ...C.racers.filter(Boolean).map(r => r.dist)) - 0.3; C.items = C.items.filter(it => it.cz > lo); }
        const Rv0 = two ? C.racers[1 - env.slot] : null;   // 경주가 끝날 무렵 앞선 사람에게 1등 보너스
        if (Rv0 && !finalDone && env.progress() > 0.97) { finalDone = true; if (dist >= Rv0.dist) { env.award(5, z.cx, v.H * 0.4); popup(z.cx, v.H * 0.47, "1등!", { size: v.U * 0.09, color: "#fff", stroke: "#e0306a", life: 1.6 }); sfx.fanfare(); } }
        // 3D 반영
        roll += (-steer * 0.75 - roll) * Math.min(1, dt * 5);
        plane.position.copy(pp); plane.rotation.set(clamp(vA * 1.4, -0.35, 0.45), -steer * 0.15, roll);
        plane.prop.rotation.z += dt * 40;
        plane.pilot.arm(0, 1.3 + Math.sin(t * 9) * flapFx * 0.6, 0, 0.1); plane.pilot.arm(1, 1.3 + Math.sin(t * 9) * flapFx * 0.6, 0, 0.1);
        for (const o of objs) {
          o.mesh.position.copy(wpos(o.ox, o.a, o.z));
          if (o.kind === "balloon") { o.mesh.position.y += Math.sin(t * 2 + o.ox * 5) * 0.3; if (o.src.takenBy != null && o.src.takenBy !== env.slot) o.mesh.visible = false; }   // 상대가 터뜨린 풍선은 사라짐
          if (o.kind === "ring") { o.mesh.rotation.z = t * 0.6; if (o.hit) { o.hit = Math.max(0, o.hit - dt * 2); o.mesh.scale.setScalar(1 + (1 - o.hit) * 0.6); } }
        }
        // 상대 비행기: 같은 하늘에서 앞뒤·옆·높이 그대로
        if (two) {
          const Rv = C.racers[1 - env.slot];
          if (SHOW_RIVAL && Rv && !rival) { rival = airplane(Rv.color); if (Rv.color) tint(rival, Rv.color); scene.add(rival); }
          if (rival) {
            rival.visible = Rv.dist - dist < 1.3 && (Rv.dist - dist) * ZD > -2;   // 뒤처진 상대는 카메라 앞을 가리지 않게 숨김
            rival.position.copy(wpos(Rv.X, Rv.A, Rv.dist - dist)); rival.rotation.set(clamp((Rv.vA || 0) * 1.4, -0.35, 0.45), -(Rv.steer || 0) * 0.15, Rv.roll || 0);
            rival.prop.rotation.z += dt * 40;
          }
        }
        const worldSpeed = zr * ZD;
        deco.forEach(s => { s.position.z += worldSpeed * dt; if (s.position.z > 30) { s.position.z -= 270; s.position.x = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 40); } });
        water.update(t * 2.5);
      },
      draw(ctx) {
        // 카메라: 비행기 뒤 조금 위에서 (기울기 따라 살짝 흔들림)
        const pp = plane.position;
        camera.position.set(pp.x * 0.85, pp.y + 2.6, pp.z + 10);
        camera.up.set(Math.sin(roll * 0.25), 1, 0).normalize();
        camera.lookAt(pp.x, pp.y + 0.8, pp.z - 25);
        st.draw(ctx);
        const U = v.U;
        // 날갯짓 효과
        if (flapFx > 0) { const q = st.toScreen(pp); ctx.strokeStyle = `rgba(255,255,255,${flapFx})`; ctx.lineWidth = U * 0.008; ctx.beginPath(); ctx.arc(q.x, q.y, U * 0.18, 0.2, Math.PI - 0.2); ctx.stroke(); }
        // 높이 막대 (왼쪽)
        const bx = z.x0 + U * 0.05, by0 = v.H * 0.25, by1 = v.H * 0.7;
        ctx.fillStyle = "rgba(0,0,0,.35)"; rr(ctx, bx - U * 0.012, by0, U * 0.024, by1 - by0, U * 0.012); ctx.fill();
        ctx.fillStyle = "#4dabf7"; rr(ctx, bx - U * 0.012, by1 - (by1 - by0) * 0.05, U * 0.024, (by1 - by0) * 0.05, U * 0.012); ctx.fill();
        outlinedText(ctx, "✈️", bx, by1 - (by1 - by0) * A, U * 0.04, "#fff", "#333", 2);
        // 점수판 (위쪽 가운데)
        const bw = Math.min(z.w * 0.8, U * 0.55), bh = U * 0.07, top = v.H * 0.11;
        ctx.fillStyle = "rgba(10,60,110,.8)"; rr(ctx, z.cx - bw / 2, top, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, `🎈 ${got}  ·  ⭕ ${rings}${boost > 0 ? "  · 🚀" : ""}`, z.cx, top + bh / 2, Math.min(U * 0.04, z.w / 12), "#fff", "#0a3c6e", 3);
        if (two) raceHud(ctx, top + bh);
        if (rival && rival.visible) {   // 상대 이름표
          const Rv = C.racers[1 - env.slot], q = st.toScreen(rival.position.clone().add(new THREE.Vector3(0, 2.2, 0)));
          if (!q.behind && q.x > z.x0 && q.x < z.x1) outlinedText(ctx, Rv.name || "상대", q.x, q.y, Math.min(U * 0.03, z.w / 22), "#fff", Rv.color || "#555", 3);
        }
        if (A < 0.15) outlinedText(ctx, "너무 낮아요! 두 팔로 날갯짓!", z.cx, v.H * 0.8, Math.min(U * 0.045, z.w / 14), "#fff", "#c0392b", 4);
      },
      stop() { st.dispose(); shared = null; },
      result: () => `풍선 ${got} · 링 ${rings} · 날갯짓 ${flapN}번`,
      // 설명 시연용
      get X() { return X; }, get A() { return A; },
      get objs() { return objs.filter(o => !o.done && o.kind !== "island"); },
      get dist() { return dist; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4) say("비행기! 두 팔을 날개처럼 벌려요");
      else if (T < 9) say("오른쪽으로 가려면 오른손을 내려요. 왼쪽은 왼손을 내리고");
      else if (T < 14) say("두 팔을 아래로 힘껏 휘저으면 위로 올라가요!");
      else say("이제 직접 해 봐요!");
      const u = p.u, sh = p.shoulderY, cx = p.cx;
      // 가장 가까운 풍선·링을 목표로
      const tg = g.objs.filter(o => o.z > 0.05).sort((a, b) => a.z - b.z)[0];
      const want = tg ? clamp((tg.ox - g.X) * 4, -1, 1) : 0, gap = (tg ? tg.a : 0.5) - g.A;
      if (gap > 0.07) S.climb = true; else if (gap < 0.0) S.climb = false;   // 목표보다 낮을 때만 날갯짓
      const climb = S.climb;
      const dive = gap < -0.1;                 // 목표보다 높으면 팔을 내려 빨리 내려감
      const flapUp = climb && Math.floor(T / 0.2) % 2 === 0;
      const yBase = climb ? (flapUp ? sh - 0.9 * u : sh + 0.7 * u) : dive ? sh + 1.2 * u : sh;
      const sp = climb ? 3.2 : 1.2, ax = dive ? 1.0 : 1.9;
      p.reach(0, cx - ax * u, yBase - want * 0.8 * u, sp);   // 왼손: 오른쪽으로 갈 땐 위로
      p.reach(1, cx + ax * u, yBase + want * 0.8 * u, sp);   // 오른손: 오른쪽으로 갈 땐 아래로
    },
  },
};
