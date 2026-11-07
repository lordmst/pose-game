// 골프 (스포츠 리조트처럼 3D 섬 코스): 내 캐릭터 뒤에서 깃발 쪽을 봄. 두 손을 모아 머리 위로 들어 올렸다가(백스윙) 빠르게 아래로 휘두르면 샷
// 손을 높이 들수록 멀리 날아감 → 깃발까지 거리에 맞게 높이를 조절. 휘두를 때 손이 옆으로 쏠리면 공이 휨, 바람도 있음
// 카메라가 날아가는 공을 따라감. 그린 위에 올라가면 퍼팅(작게 들었다가 툭)으로 컵에 넣기. 오른쪽 위에 작은 지도
import { burst, popup, outlinedText, rr, clamp } from "../../fx.js?v=68";
import { sfx } from "../../audio.js?v=68";
import { stage, THREE, box, ball as sphere, mesh, cyl, tree, palm, cloud, sea, playerAvatar } from "./kit3d.js?v=68";

const SWING = 2.2;                         // 다운스윙으로 인정하는 손 속도(어깨너비/초)
const MAX_DIST = 170;                      // 끝까지 들었을 때 날아가는 거리(m)
const PUTT_MAX = 12;                       // 퍼팅: 끝까지 들었을 때 굴러가는 거리(m)
const GREEN_R = 11;                        // 그린 반지름(m): 이 안에 떨어지면 퍼팅
const carry = lv => 20 + (MAX_DIST - 20) * lv;
const needOf = d => clamp((d - 20) / (MAX_DIST - 20), 0, 1);

function flagMesh() {
  const g = new THREE.Group();
  const pole = cyl(0.03, 0.03, 2.6, "#ffffff"); pole.position.y = 1.3; g.add(pole);
  const cloth = mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: "#ff3b3b", side: THREE.DoubleSide }));
  cloth.position.set(0.45, 2.3, 0); const piv = new THREE.Group(); piv.add(cloth); g.add(piv); g.cloth = piv;
  const cup = mesh(new THREE.CircleGeometry(0.16, 20), "#1d1d1d", { cast: false }); cup.rotation.x = -Math.PI / 2; cup.position.y = 0.035; g.add(cup);
  return g;
}
function club() {
  const g = new THREE.Group();
  const shaft = cyl(0.012, 0.012, 1.0, "#c9ced6", { metal: 0.6, rough: 0.3 }); shaft.position.y = -0.45; g.add(shaft);
  const grip = cyl(0.02, 0.02, 0.22, "#222"); grip.position.y = -0.02; g.add(grip);
  const head = box(0.11, 0.05, 0.05, "#9aa0a6", { metal: 0.7, rough: 0.3 }); head.position.set(0.04, -0.96, 0); g.add(head);
  return g;
}
/* ---------- 스윙 자세 ----------
   s: -1 백스윙 꼭대기 · 0 어드레스(=공 맞는 순간) · +1 피니시. 한 줄로 이어진 동작이라 중간에 튀지 않음
   캐릭터는 공을 바라보고 서 있고, 깃발은 캐릭터의 왼쪽(+x) */
const DOWN_T = 0.09, FOLLOW_T = 0.42;      // 휘두른 뒤: 공까지 내려오는 시간 · 피니시까지 시간(초)
const ease = k => 1 - Math.pow(1 - k, 3);
export function swingS(A) {
  if (A.swingT < DOWN_T + FOLLOW_T + 0.1 || A.phase === "fly" || A.phase === "result" || A.phase === "wait") {
    const top = -Math.max(0.35, Math.min(1, A.maxLv || 0.6)) * (A.putting ? 0.5 : 1);
    if (A.swingT < DOWN_T) { const k = A.swingT / DOWN_T; return top * (1 - k * k); }         // 꼭대기 → 공 (점점 빠르게)
    const k = Math.min(1, (A.swingT - DOWN_T) / FOLLOW_T); return ease(k) * (A.putting ? 0.45 : 1);   // 공 → 피니시
  }
  const lv = A.phase === "back" ? Math.max(A.level, (A.maxLv || 0) * 0.9) : A.level;
  return -Math.min(1, lv || 0) * (A.putting ? 0.5 : 1);
}
const mix = (a, b, k) => a + (b - a) * k;
export function golfPose(a, s, putting = false) {
  const b = Math.max(0, -s), f = Math.max(0, s);               // b: 백스윙 정도, f: 팔로스루 정도
  // 몸 전체가 발을 축으로 돌아서 많이 숙이면 넘어지는 것처럼 보임 → 아주 조금만
  a.body.rotation.set(0.08 * (1 - f), -b * 1.05 + f * 1.35, 0);   // 어깨 회전: 뒤로 비틀었다가 깃발 쪽으로
  a.headG.rotation.set(-0.35 + f * 0.3, b * 0.85 - f * 0.55, 0); // 공을 계속 보다가 피니시에서 깃발 쪽으로
  // 팔: 어드레스는 두 손을 몸 앞 가운데 모아 아래로 → 백스윙은 오른쪽 어깨 위로 → 피니시는 왼쪽 어깨 위로
  const lift = 0.3 + (b ? b * 1.95 : f * 2.05);
  // 왼팔(0): 백스윙에선 가슴을 가로질러 쭉 펴고, 피니시에선 팔꿈치를 접음 / 오른팔(1): 반대
  a.arm(0, mix(-0.45, -0.62, b) + f * 0.5, lift, 0.05 + f * 1.25);
  a.arm(1, mix(-0.45, 0.05, b) - f * 0.17, lift, 0.12 + b * 1.25);
  const club = a.userData.club;
  if (club) {
    // 클럽: 손목을 꺾어 백스윙 꼭대기·피니시에서 머리 뒤로 눕게, 어드레스에선 공에 닿게
    const cock = Math.max(b, f);
    club.rotation.set(-0.15 - cock * 1.25, 0, -0.45 + b * 0.25 + f * 0.1);
  }
  if (putting) { a.headG.rotation.y *= 0.3; }
}
const AUTO = /simauto=1/.test(typeof location !== "undefined" ? location.search : "");   // 점검용: 가상 선수가 저절로 침
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
// 2인 대결: 두 화면이 같은 홀(거리·위치·바람)을 치고, 두 사람이 홀을 마치면 깃발에 더 가까이 붙인 사람이 그 홀 승리
let shared = null;
const flat = (geo, color, y = 0.02) => { const m = mesh(geo, color, { cast: false, receive: true }); m.rotation.x = -Math.PI / 2; m.position.y = y; return m; };

export default {
  id: "golf", title: "골프", icon: "⛳", sec: 60, cursor: "", cat: "sport", bg: "#96e6a1", desc: "깃발 가까이 샷, 그린에선 퍼팅 · 2인 대결", scene3d: true,
  how: "두 손을 모아 머리 위로 들었다가 빠르게 아래로 휘둘러요. 높이 들수록 멀리! 그린에 올라가면 조금만 들었다가 툭 쳐서 컵에 넣어요. 둘이 하면 같은 홀에서 깃발에 더 가까이 붙인 사람이 이겨요",
  create(env) {
    const z = env.zone, v = env.view;
    const versus = env.mode === 2, slot = versus ? env.slot : 0, other = 1 - slot, owner = !versus || slot === 0;
    if (versus && !shared) shared = { seed: 1 + Math.floor(Math.random() * 1e6), hole: 1, players: [null, null], wins: [0, 0], last: null, waitT: 0, ended: false };
    const G = versus ? shared : { seed: 1 + Math.floor(Math.random() * 1e6), hole: 1, players: [null, null], wins: [0, 0] };
    const P = G.players[slot] = { name: env.name || `${slot + 1}P`, color: env.color || "#ff6b6b", tracker: env.tracker, hole: 0, done: false, best: Infinity, ball: new THREE.Vector3(), stance: new THREE.Vector3(), yaw: 0, anim: null };
    const O = () => (versus ? G.players[other] : null);
    // n번 홀: 두 사람이 같은 거리·위치·바람 (씨앗 값으로 정함)
    const holeDef = i => ({ dist: 60 + Math.round(hash(G.seed, i * 5) * 80), px: (hash(G.seed, i * 5 + 1) - 0.5) * 16, wind: Math.round((hash(G.seed, i * 5 + 2) - 0.5) * 8 * env.diff.speed), pondSide: hash(G.seed, i * 5 + 3) < 0.5 ? -1 : 1 });
    const st = stage(env, { outfit: "golf", fov: 50, sky: ["#3fa9f5", "#dff3ff"], shadowSize: 10 });
    const { scene, camera, sun } = st;
    // 섬: 바다 + 모래 해변 + 잔디
    const water = sea(scene, 2000, -0.35);
    const beach = flat(new THREE.CircleGeometry(250, 64), "#f1dca0", -0.1); beach.position.z = -90; scene.add(beach);
    const isl = flat(new THREE.CircleGeometry(240, 64), "#5aa646", 0); isl.position.z = -90; scene.add(isl);
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, r = 225 + (i % 3) * 6; scene.add(i % 2 ? palm(Math.cos(a) * r, -90 + Math.sin(a) * r, 2.2) : tree(Math.cos(a) * r, -90 + Math.sin(a) * r, 3)); }
    for (let i = 0; i < 7; i++) scene.add(cloud(-200 + i * 70, 45 + (i % 3) * 10, -380, 10));
    const mtn = mesh(new THREE.ConeGeometry(70, 90, 10), "#4c8f3e", { cast: false }); mtn.position.set(-120, 30, -330); scene.add(mtn);
    const mtn2 = mesh(new THREE.ConeGeometry(55, 60, 10), "#5aa646", { cast: false }); mtn2.position.set(140, 20, -300); scene.add(mtn2);
    const teeBox = flat(new THREE.PlaneGeometry(6, 6), "#7dd35e", 0.03); scene.add(teeBox);
    let course = new THREE.Group(); scene.add(course);
    const flag = flagMesh(); scene.add(flag);
    const me = playerAvatar(env); me.scale.setScalar(1.15); me.rotation.y = Math.PI / 2; scene.add(me);
    me.userData.club = me.hold(1, club());
    const gball = sphere(0.09, "#ffffff", { rough: 0.3 }); scene.add(gball);
    const shadow = flat(new THREE.CircleGeometry(0.12, 14), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3 }), 0.04); scene.add(shadow);
    const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 40 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })); trail.frustumCulled = false; scene.add(trail);
    const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1, gapSize: 0.8, transparent: true, opacity: 0.6 })); scene.add(aimLine);

    let hole = null, phase = "address", level = 0, maxLv = 0, backT = -9, t = 0, shot = null, holes = 0, best = Infinity, sumScore = 0, cups = 0, swingT = 9;
    let putting = false, pos = new THREE.Vector3(), stance = new THREE.Vector3(), aimDir = new THREE.Vector3(0, 0, -1), camPos = new THREE.Vector3(0, 2.4, 5.5), camLook = new THREE.Vector3(0, 1, -40);
    const tmp = new THREE.Vector3();
    function buildCourse() {
      scene.remove(course); course.traverse(o => { if (o.geometry) o.geometry.dispose(); }); course = new THREE.Group(); scene.add(course);
      const hx = hole.px, hz = -hole.dist, len = Math.hypot(hx, hz), ang = Math.atan2(hx, -hz);
      const fair = flat(new THREE.PlaneGeometry(26, len + 30), "#79c95a", 0.015); fair.position.set(hx / 2, 0.015, hz / 2 - 5); fair.rotation.z = -ang; course.add(fair);
      for (let i = 0; i < 9; i++) { const s = flat(new THREE.PlaneGeometry(26, 4), i % 2 ? "#79c95a" : "#86d466", 0.018); const k = (i + 0.5) / 9; s.position.set(hx * k, 0.018, hz * k); s.rotation.z = -ang; course.add(s); }
      const green = flat(new THREE.CircleGeometry(GREEN_R, 40), "#9be879", 0.03); green.position.set(hx, 0.03, hz); course.add(green);
      const fringe = flat(new THREE.RingGeometry(GREEN_R, GREEN_R + 1.5, 40), "#8bdc6a", 0.025); fringe.position.set(hx, 0.025, hz); course.add(fringe);
      hole.bunkers = [[hx - 13, hz + 6, 4.5], [hx + 12, hz - 4, 3.8], [hx + 8, hz + 30, 5]];
      hole.bunkers.forEach(([x, zz, r]) => { const b = flat(new THREE.CircleGeometry(r, 24), "#f3e2a9", 0.035); b.scale.y = 0.65; b.position.set(x, 0.035, zz); course.add(b); });
      const side = hole.pondSide; hole.pond = [hx * 0.5 + side * 24, hz * 0.55, 9];
      const pond = flat(new THREE.CircleGeometry(hole.pond[2], 30), "#3aa0e0", 0.04); pond.position.set(hole.pond[0], 0.04, hole.pond[1]); course.add(pond);
      for (let i = 0; i < 12; i++) { const k = i / 11, s = i % 2 ? 1 : -1; const tr = (i % 3 ? tree : palm)(hx * k + s * (22 + (i % 3) * 5), hz * k - 5, 1.6 + (i % 3) * 0.4); course.add(tr); }
      flag.position.set(hx, 0, hz);
      const a = aimLine.geometry.attributes.position; a.setXYZ(0, 0, 0.05, 0); a.setXYZ(1, hx, 0.05, hz); a.needsUpdate = true; aimLine.computeLineDistances();
    }
    function newHole() {
      holes++;
      if (!versus) G.hole = holes;
      hole = holeDef(G.hole); P.hole = G.hole; P.done = false; P.best = Infinity;
      phase = "address"; maxLv = 0; shot = null; putting = false; pos.set(0, 0, 0);
      buildCourse();
    }
    // 2인: 내 홀이 끝나면 상대를 기다림 → 둘 다 끝나면(또는 오래 기다리면) 더 가까이 붙인 사람이 홀 승리, 다음 홀로
    function finishHole() {
      if (!versus) { newHole(); return; }
      P.done = true; phase = "wait";
    }
    function judgeHoles(dt) {   // 0번 화면이 판정
      const A = G.players[0], B = G.players[1];
      if (!A || !B || A.hole !== G.hole) return;
      if (A.done || B.done) G.waitT += dt;
      if ((A.done && B.done) || G.waitT > 15) {
        const da = A.best, db = B.best, w = da === db ? -1 : da < db ? 0 : 1;
        if (w >= 0) G.wins[w]++;
        G.last = { hole: G.hole, w, da, db }; G.hole++; G.waitT = 0;
      }
    }
    let shownLast = 0;
    newHole();
    const flagPos = () => new THREE.Vector3(hole.px, 0, -hole.dist);
    const distLeft = () => Math.hypot(pos.x - hole.px, -pos.z - hole.dist);
    function body() {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return null;
      return { sy: (p[11].y + p[12].y) / 2, sw: Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1 };
    }
    function hit(vxSw) {
      const lv = clamp(maxLv, 0.05, 1);
      swingT = 0;
      if (putting) {   // 퍼팅: 깃발 쪽으로 굴림
        const d = PUTT_MAX * lv * (0.96 + Math.random() * 0.08), dir = flagPos().sub(pos).setY(0).normalize();
        const err = clamp(vxSw * 0.012, -0.12, 0.12) + (Math.random() - 0.5) * 0.04 / env.diff.reach;
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), err);
        shot = { t: 0, T: 0.8 + lv * 1.4, from: pos.clone(), dir, d, lv, putt: true };
        phase = "fly"; sfx.bonk(); return;
      }
      const d = carry(lv) * (0.97 + Math.random() * 0.06);
      const ang = clamp(vxSw * 0.03, -0.28, 0.28) + (Math.random() - 0.5) * 0.04 / env.diff.reach;   // 휘는 정도
      const T = 1.6 + lv * 1.2, side = Math.sin(ang) * d + hole.wind * T * 1.3;
      shot = { t: 0, T, x: side, y: Math.cos(ang) * d, roll: d * 0.05, lv, top: 6 + lv * 26, ang };
      phase = "fly"; sfx.whoosh(); sfx.bonk();
    }
    // 공 위치 (샷 중)
    function ballAt(S, tt) {
      if (S.putt) { const k = Math.min(1, tt / S.T), e = 1 - (1 - k) * (1 - k); return S.from.clone().addScaledVector(S.dir, S.d * e).setY(0.09); }
      const k = Math.min(1, tt / S.T), rk = Math.min(1, Math.max(0, (tt - S.T) / 0.6)), re = 1 - (1 - rk) * (1 - rk);
      // 휘는 공: 옆으로 가는 양이 뒤로 갈수록 커짐
      const sx = S.x * (k * k * 0.6 + k * 0.4) + S.x * (S.roll / S.y) * re, sy = S.y * k + S.roll * re;
      return new THREE.Vector3(sx, 0.09 + Math.sin(k * Math.PI) * S.top, -sy);
    }
    function land() {
      const P0 = ballAt(shot, 99); pos.copy(P0).setY(0);
      const dm = distLeft(), P = st.toScreen(P0);
      best = Math.min(best, dm); P.best = Math.min(P.best, dm < 0.6 && shot.putt ? 0 : dm); phase = "result"; shot.res = 0;
      let pts = 0, label = "";
      const inPond = Math.hypot(pos.x - hole.pond[0], pos.z - hole.pond[1]) < hole.pond[2];
      if (shot.putt) {
        if (dm < 0.6) { pts = 5; label = "컵인!"; cups++; sfx.fanfare(); burst(z.cx, v.H * 0.45, { n: 50, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 1.1, gravity: v.U, size: v.U * 0.018 }); }
        else if (dm < 1.8) { pts = 1; label = "아까워요!"; sfx.catch(1); }
        sumScore += pts;
        if (pts) env.award(pts, z.cx, v.H * 0.45); else env.miss(z.cx, v.H * 0.55, "안 들어갔어요");
        popup(z.cx, v.H * 0.4, dm < 0.6 ? label : `${label ? label + " " : ""}컵까지 ${dm.toFixed(1)}m`, { size: Math.min(v.U * 0.06, z.w / 12), color: "#fff", stroke: "#2d6a1e", life: 1.6 });
        putting = false; return;
      }
      if (inPond) { label = "퐁당! 물에 빠졌어요"; }
      else if (dm < 1.2) { pts = 10; label = "홀인원!"; cups++; sfx.fanfare(); burst(P.x, P.y, { n: 50, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 1.1, gravity: v.U, size: v.U * 0.018 }); }
      else if (dm < 4) { pts = 6; label = "나이스 샷!"; sfx.fever(); }
      else if (dm < GREEN_R) { pts = 4; label = "온 그린!"; sfx.catch(3); }
      else if (dm < 18) { pts = 2; label = "가까워요"; sfx.catch(1); }
      else if (dm < 30) { pts = 1; label = "괜찮아요"; }
      sumScore += pts;
      if (pts) env.award(pts, z.cx, v.H * 0.45); else env.miss(z.cx, v.H * 0.55, inPond ? "" : "너무 멀어요");
      popup(z.cx, v.H * 0.4, inPond ? label : `${label ? label + " " : ""}깃발까지 ${dm.toFixed(1)}m`, { size: Math.min(v.U * 0.055, z.w / 13), color: "#fff", stroke: inPond ? "#1d5f8f" : "#2d6a1e", life: 1.8 });
      shot.toPutt = !inPond && dm >= 1.2 && dm < GREEN_R;
    }
    function placeGolfer() {
      // 칠 자리와 방향은 치기 전에만 바꿈 (공이 컵 가까이 가도 화면이 뒤집히지 않게)
      if ((phase === "address" || phase === "back") && distLeft() > 0.3) { aimDir.copy(flagPos().sub(pos).setY(0).normalize()); stance.copy(pos); }
      // 공 왼쪽에 서서 깃발 쪽을 옆으로 봄 (공을 향해 섬)
      const dir = aimDir, yaw = Math.atan2(dir.x, dir.z);
      me.rotation.y = yaw - Math.PI / 2;
      const left = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(-0.75);
      me.position.copy(stance).add(left);
      return { dir, yaw };
    }
    // 골퍼 자세 (내 캐릭터·상대 캐릭터 같이 씀). A = { phase, level, maxLv, swingT, putting }
    function animAv(a, A) { golfPose(a, swingS(A), A.putting); }
    function animGolfer() { P.anim = { phase, level, maxLv, swingT, putting }; animAv(me, P.anim); }
    // 2인: 상대 골퍼와 상대 공 (같은 홀일 때만 보임)
    let rival = null, rivalBall = null, autoT = 0, autoLv = 0;
    return {
      update(dt) {
        t += dt; swingT += dt; water.update(t);
        const b = AUTO ? null : body(), hs = env.tracker.hands.filter(h => h.vis);
        if (AUTO && (phase === "address" || phase === "back")) {   // 점검용: 필요한 높이(80%는 거의 맞게)까지 들었다가 1.4초 뒤 휘두름
          if (autoT === 0) autoLv = clamp(this_need() * (Math.random() < 0.8 ? 0.94 + Math.random() * 0.12 : 0.6 + Math.random() * 0.8), 0.05, 1);
          autoT += dt; level = Math.min(autoLv, autoT / 1.0 * autoLv);
          if (autoT > 0.3) { phase = "back"; maxLv = Math.max(maxLv, level); }
          if (autoT > 1.4) { autoT = 0; hit((Math.random() - 0.5) * 2); }
        }
        if (b && hs.length) {
          const midY = hs.reduce((s, h) => s + h.y, 0) / hs.length;
          level = clamp((b.sy - midY) / (1.7 * b.sw), 0, 1);
          if (phase === "address" || phase === "back") {
            const thr = putting ? 0.08 : 0.2;
            if (level > thr) { phase = "back"; backT = t; maxLv = Math.max(maxLv, level); }
            const down = hs.reduce((s, h) => s + h.vy, 0) / hs.length > 0, fast = Math.max(...hs.map(h => h.bodySpeed)) > SWING * env.diff.punch * (putting ? 0.6 : 1);
            if (phase === "back" && t - backT < 1.5 && down && fast && midY > b.sy + b.sw * 0.2) hit(hs.reduce((s, h) => s + h.vx, 0) / hs.length / b.sw);
            if (phase === "back" && t - backT > 1.5 && level < 0.06) { phase = "address"; maxLv = 0; }
          }
        }
        if (phase === "fly") { shot.t += dt; if (shot.t >= shot.T + (shot.putt ? 0.15 : 0.6)) land(); }
        else if (phase === "result") {
          shot.res += dt;
          if (shot.res > 2.2) {
            if (shot.toPutt) { putting = true; phase = "address"; maxLv = 0; shot = null; }
            else finishHole();
          }
        }
        // 2인: 판정·다음 홀
        if (versus) {
          if (owner) judgeHoles(dt);
          if (P.hole !== G.hole) {          // 홀이 넘어감(둘 다 끝났거나 오래 기다림) → 결과 알리고 다음 홀
            const L = G.last;
            if (L && L.hole !== shownLast) {
              shownLast = L.hole;
              const Wn = L.w >= 0 ? G.players[L.w] : null;
              popup(z.cx, v.H * 0.34, Wn ? `${L.hole}번 홀 ${Wn.name} 승리!` : `${L.hole}번 홀 무승부`, { size: Math.min(v.U * 0.06, z.w / 12), color: "#fff", stroke: Wn ? Wn.color : "#555", life: 2.2 });
              if (L.w === slot) { env.award(3, z.cx, v.H * 0.28); sfx.fanfare(); }
            }
            newHole();
          }
          const Op = O();
          if (Op && !rival) {
            rival = playerAvatar({ color: Op.color, name: Op.name }); rival.scale.setScalar(1.15); rival.userData.club = rival.hold(1, club()); scene.add(rival);
            rivalBall = sphere(0.1, Op.color, { rough: 0.3 }); scene.add(rivalBall);
          }
          if (Op && rival) {
            const same = Op.hole === P.hole;
            rival.visible = rivalBall.visible = same;
            if (same) {
              rivalBall.position.copy(Op.ball);
              // 같은 자리(티)에 서면 겹치지 않게 옆으로 비켜 섬
              // 공 왼쪽에 서는 건 나와 같고, 같은 자리(티)면 공 건너편(오른쪽)으로 비켜 서서 겹치지 않게
              const side = Op.stance.distanceTo(P.stance) < 1.6 ? -2.4 : 1;
              rival.position.copy(Op.stance).add(new THREE.Vector3(Math.cos(Op.yaw) * 0.75 * side, 0, -Math.sin(Op.yaw) * 0.75 * side));
              rival.rotation.y = Op.yaw - Math.PI / 2;
              if (Op.anim) animAv(rival, Op.anim); rival.idle(t + 1);
            }
          }
          if (!G.ended && env.progress() > 0.985 && Op) {
            G.ended = true;
            const w = G.wins[0] === G.wins[1] ? null : G.players[G.wins[0] > G.wins[1] ? 0 : 1];
            popup(z.cx, v.H * 0.42, w ? `${w.name} 최종 승리!` : "무승부!", { size: v.U * 0.07, color: "#fff", stroke: w ? w.color : "#555", life: 2 });
          }
          if (G.ended && !P.bonus && G.wins[slot] > G.wins[other]) { P.bonus = true; env.award(5, z.cx, v.H * 0.3); }
        }
        placeGolfer(); animGolfer(); me.idle(t);
        flag.cloth.rotation.y = -hole.wind * 0.12 + Math.sin(t * 5) * 0.12;
        // 공·그림자·자국
        const bp = shot && phase !== "address" ? ballAt(shot, shot.t) : pos.clone().setY(0.09);
        gball.position.copy(bp); shadow.position.set(bp.x, 0.045, bp.z);
        P.ball.copy(bp); P.stance.copy(stance); P.yaw = Math.atan2(aimDir.x, aimDir.z) ;
        trail.visible = !!shot && !shot.putt;
        if (trail.visible) { const a = trail.geometry.attributes.position; for (let i = 0; i < 40; i++) { const p = ballAt(shot, shot.t * i / 39); a.setXYZ(i, p.x, p.y, p.z); } a.needsUpdate = true; }
        aimLine.visible = phase === "address" || phase === "back";
        if (aimLine.visible) { const a = aimLine.geometry.attributes.position; a.setXYZ(0, pos.x, 0.06, pos.z); a.setXYZ(1, hole.px, 0.06, -hole.dist); a.needsUpdate = true; aimLine.computeLineDistances(); }
        sun.position.set(pos.x + 6, 20, pos.z + 8); sun.target.position.copy(pos);
      },
      draw(ctx) {
        // 카메라: 칠 때는 공 뒤, 날아가면 공을 쫓아감, 떨어지면 공 쪽에서 깃발을 봄
        const fp = flagPos(), dir = aimDir;
        let wantPos, wantLook;
        if (phase === "fly" && !shot.putt) {
          const bp = ballAt(shot, shot.t), back = new THREE.Vector3(shot.x, 0, -shot.y).normalize();
          wantPos = bp.clone().addScaledVector(back, -13).setY(bp.y + 4.5); wantLook = bp.clone().addScaledVector(back, 12).setY(bp.y * 0.55);
        } else if (putting || (phase === "fly" && shot.putt) || (phase === "result" && shot && shot.putt)) {
          wantPos = stance.clone().addScaledVector(dir, -5).setY(2.2); wantLook = stance.clone().addScaledVector(dir, 8).setY(0.2);
        } else if (phase === "result") {
          wantPos = pos.clone().addScaledVector(dir, -9).setY(5); wantLook = pos.clone().lerp(fp, 0.5);
        } else { wantPos = stance.clone().addScaledVector(dir, -5.5).setY(2.4); wantLook = pos.clone().addScaledVector(dir, 40).setY(1.0); }
        const k = phase === "fly" ? 0.2 : 0.08;
        camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
        camera.position.copy(camPos); camera.lookAt(camLook);
        st.draw(ctx);
        const U = v.U;
        // 깃발 위 거리 표시
        const F = st.toScreen(fp.clone().setY(2.8));
        if (!F.behind && F.x > z.x0 && F.x < z.x1) outlinedText(ctx, `${Math.round(distLeft())}m`, F.x, F.y - U * 0.03, U * 0.032, "#fff", "#c02020", 3);
        // 오른쪽 위: 홀·거리·바람 + 작은 지도
        const iw = Math.min(z.w * 0.27, U * 0.3), ix = z.x1 - iw - U * 0.02, iy = v.H * 0.105, ih = U * 0.11;
        ctx.fillStyle = "rgba(10,50,30,.8)"; rr(ctx, ix, iy, iw, ih, U * 0.02); ctx.fill();
        outlinedText(ctx, `${holes}번 홀 · ${putting ? "퍼팅" : `${hole.dist}m`}`, ix + iw / 2, iy + ih * 0.3, Math.min(U * 0.03, iw / 9), "#fff", "#0a3a1e", 3);
        outlinedText(ctx, hole.wind ? `바람 ${hole.wind > 0 ? "→" : "←"} ${Math.abs(hole.wind)}` : "바람 없음", ix + iw / 2, iy + ih * 0.72, Math.min(U * 0.03, iw / 8), "#bff", "#0a3a1e", 3);
        const my = iy + ih + U * 0.012, pipTop = v.H - Math.min(z.w * 0.24, U * 0.3) * 1.25 - U * 0.085, mh = Math.max(U * 0.12, Math.min(iw * 1.25, pipTop - my - U * 0.015));
        ctx.fillStyle = "rgba(40,120,200,.75)"; rr(ctx, ix, my, iw, mh, U * 0.02); ctx.fill();
        const sc = (mh - U * 0.04) / (MAX_DIST + 10), mx = ix + iw / 2, mb = my + mh - U * 0.02, M = (x, zz) => ({ x: mx + x * sc, y: mb + zz * sc });
        ctx.fillStyle = "#5aa646"; ctx.beginPath(); ctx.ellipse(mx, mb - (MAX_DIST / 2) * sc, iw * 0.42, (MAX_DIST / 2 + 8) * sc, 0, 0, Math.PI * 2); ctx.fill();
        const Fm = M(hole.px, -hole.dist), T0 = M(0, 0);
        ctx.strokeStyle = "#86d466"; ctx.lineWidth = 26 * sc; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(T0.x, T0.y); ctx.lineTo(Fm.x, Fm.y); ctx.stroke();
        ctx.fillStyle = "#3aa0e0"; const Pm = M(hole.pond[0], hole.pond[1]); ctx.beginPath(); ctx.arc(Pm.x, Pm.y, hole.pond[2] * sc, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#b5f59a"; ctx.beginPath(); ctx.arc(Fm.x, Fm.y, GREEN_R * sc, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff3b3b"; ctx.fillRect(Fm.x - 1, Fm.y - U * 0.025, 2, U * 0.025); ctx.beginPath(); ctx.moveTo(Fm.x, Fm.y - U * 0.025); ctx.lineTo(Fm.x + U * 0.014, Fm.y - U * 0.019); ctx.lineTo(Fm.x, Fm.y - U * 0.013); ctx.fill();
        const Op2 = O();
        if (Op2 && Op2.hole === P.hole) { const Rm = M(Op2.ball.x, Op2.ball.z); ctx.fillStyle = Op2.color; ctx.beginPath(); ctx.arc(Rm.x, Rm.y, U * 0.007, 0, Math.PI * 2); ctx.fill(); }   // 상대 공
        const Bm = M(gball.position.x, gball.position.z); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#333"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(Bm.x, Bm.y, U * 0.007, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // 힘 막대 (왼쪽): 지금 손 높이, 깃발까지 필요한 높이 표시
        const gx = z.x0 + Math.max(U * 0.05, z.w * 0.06), gh = v.H * 0.4, gy = v.H * 0.22, gw = Math.max(14, U * 0.028);
        ctx.fillStyle = "rgba(0,0,0,.5)"; rr(ctx, gx - gw / 2, gy, gw, gh, gw / 2); ctx.fill();
        const shown = (phase === "fly" || phase === "result") && shot ? shot.lv : phase === "back" ? Math.max(level, maxLv) : level;
        const pg = ctx.createLinearGradient(0, gy + gh, 0, gy); pg.addColorStop(0, "#37d67a"); pg.addColorStop(0.6, "#ffd400"); pg.addColorStop(1, "#ff5a5a");
        ctx.fillStyle = pg; rr(ctx, gx - gw / 2, gy + gh * (1 - shown), gw, gh * shown, gw / 2); ctx.fill();
        const ny = gy + gh * (1 - this_need());
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(gx + gw / 2 + 2, ny); ctx.lineTo(gx + gw / 2 + U * 0.028, ny - U * 0.015); ctx.lineTo(gx + gw / 2 + U * 0.028, ny + U * 0.015); ctx.closePath(); ctx.fill();
        outlinedText(ctx, "힘", gx, gy - U * 0.028, U * 0.032, "#fff", "#333", 3);
        const pw = Math.min(z.w * 0.24, U * 0.3), hx = z.x0 + (z.w - pw) / 2;
        const hint = phase === "address" ? (putting ? "조금만 들었다가 툭! 컵에 넣어요" : "두 손 모아 위로 들었다가 휙!") : phase === "back" ? "이제 아래로 빠르게 휘둘러요!" : phase === "wait" ? "상대가 칠 때까지 기다려요" : "";
        // 2인: 두 화면 같은 점수판 "1P 이름 이긴 홀 : 이긴 홀 이름 2P" + 이번 홀 깃발까지 거리 + 앞선 사람 👑
        const Op = O();
        if (Op) {
          const A = G.players[0], B = G.players[1], bx0 = z.x0 + U * 0.02, bw = Math.max(U * 0.3, ix - U * 0.02 - bx0), by0 = v.H * 0.105, bh0 = U * 0.12;
          ctx.fillStyle = "rgba(10,50,30,.82)"; rr(ctx, bx0, by0, bw, bh0, U * 0.02); ctx.fill();
          const lead = G.wins[0] === G.wins[1] ? -1 : G.wins[0] > G.wins[1] ? 0 : 1, fs = Math.min(U * 0.048, bw / 9), mid = bx0 + bw / 2;
          outlinedText(ctx, `${lead === 0 ? "👑" : ""}${G.wins[0]}`, bx0 + bw * 0.25, by0 + bh0 * 0.36, fs, "#fff", A.color, 4);
          outlinedText(ctx, ":", mid, by0 + bh0 * 0.36, fs * 0.8, "#fff", "#333", 3);
          outlinedText(ctx, `${G.wins[1]}${lead === 1 ? "👑" : ""}`, bx0 + bw * 0.75, by0 + bh0 * 0.36, fs, "#fff", B.color, 4);
          const dd = Q => (Q.hole === G.hole && Q.best < Infinity ? `${Q.best.toFixed(1)}m` : "-"), ns = Math.min(U * 0.024, bw / 18);
          outlinedText(ctx, `1P ${A.name} ${dd(A)}`, bx0 + bw * 0.25, by0 + bh0 * 0.78, ns, "#fff", A.color, 3);
          outlinedText(ctx, `${dd(B)} ${B.name} 2P`, bx0 + bw * 0.75, by0 + bh0 * 0.78, ns, "#fff", B.color, 3);
        }
        if (hint) outlinedText(ctx, hint, hx, v.H * 0.88, Math.min(U * 0.042, (z.w - pw) / (hint.length * 0.95)), "#fff", phase === "back" ? "#c05000" : "#2d6a1e", 4);
      },
      stop() { st.dispose(); shared = null; },
      result: () => {
        const Op = O(), vs = Op ? ` · 이긴 홀 ${G.wins[slot]}:${G.wins[other]} ${G.wins[slot] > G.wins[other] ? "(승)" : G.wins[slot] < G.wins[other] ? "(패)" : "(무)"}` : "";
        return `${holes - (phase === "result" ? 0 : 1)}번 홀 · 가장 가까이 ${best === Infinity ? "-" : best.toFixed(1) + "m"} · 홀인원·컵인 ${cups}${vs}`;
      },
      // 설명 시연용
      get phase() { return phase; },
      get need() { return this_need(); },
      get putting() { return putting; },
    };
    function this_need() { return putting ? clamp(distLeft() / PUTT_MAX, 0.05, 1) : needOf(hole.dist * 0.95); }
  },
  demo: {
    dur: 18,
    run(T, g, p, S, say) {
      const u = p.u, cx = p.cx, sy = p.shoulderY;
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1;
      if (T < 4) say("골프! 두 손을 모아 머리 위로 들어요");
      else if (T < 8.5) say("그리고 아래로 빠르게 휘두르면 샷!");
      else if (T < 13.5) say("깃발이 멀면 높이, 가까우면 조금만 들어요");
      else if (T < 16.5) say("그린에 올라가면 살짝 들었다가 툭! 퍼팅");
      else say("이제 직접 해 봐요!");
      if (g.phase === "fly" || g.phase === "result") { p.rest(0, "down", 1); p.rest(1, "down", 1); S.ph = 0; return; }
      if (!S.ph) { S.ph = 1; S.t0 = T; }
      const sc = 1.7 * p.scale;   // 손 높이 1 = 어깨 위 1.7 어깨너비
      if (S.ph === 1) {             // 백스윙: 필요한 높이까지 천천히
        const y = sy - g.need * sc - 0.08 * u;
        p.reach(0, cx + 0.05 * u, y, 1.2); p.reach(1, cx + 0.2 * u, y, 1.2);
        if (T - S.t0 > 1.6) { S.ph = 2; S.t0 = T; }
      } else {                      // 다운스윙
        p.reach(0, cx - 0.1 * u, sy + 1.6 * u, 3.5); p.reach(1, cx + 0.05 * u, sy + 1.6 * u, 3.5);
      }
    },
  },
};
