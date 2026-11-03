// 양궁 (스포츠 리조트처럼 3D 야외 사로): 내 캐릭터 어깨 뒤에서 과녁을 봄. 한 팔은 옆으로 쭉 뻗고(활), 다른 손은 가슴·얼굴 쪽으로 당기면(시위) 화면이 과녁으로 확대되고 조준점이 나타남
// 활 든 팔을 위아래로, 몸을 옆으로 움직여 조준점을 과녁 가운데로 → 당긴 손을 휙 놓으면(빠르게 떼면) 발사. 화살이 날아가 꽂힘. 바람(깃발)도 계산!
import { burst, popup, outlinedText, rr, clamp } from "../../fx.js?v=59";
import { sfx } from "../../audio.js?v=59";
import { stage, THREE, ground, box, ball as sphere, mesh, cyl, tree, cloud, sea, palm, playerAvatar } from "./kit3d.js?v=59";

const RINGS = ["#ffffff", "#ffffff", "#2b2b2b", "#2b2b2b", "#3d8bff", "#3d8bff", "#ff4d4d", "#ff4d4d", "#ffd400", "#ffd400"];
const RELEASE = 2.2;                 // 놓기로 인정하는 당긴 손 속도(어깨너비/초)
const TR = 1.1;                      // 과녁 반지름(m)
const DISTS = [18, 24, 30];          // 과녁 거리(m): 3발마다 바뀜
const FLY = 0.75;                    // 화살이 날아가는 시간(초)

function targetMesh() {
  const g = new THREE.Group();
  const boss = cyl(TR * 1.12, TR * 1.12, 0.35, "#d9b56a"); boss.rotation.x = Math.PI / 2; g.add(boss);
  for (let i = 0; i < 10; i++) {
    const r = TR * (1 - i / 10), m = mesh(new THREE.CircleGeometry(r, 48), RINGS[i], { cast: false });
    m.position.z = 0.18 + i * 0.002; g.add(m);
    const line = mesh(new THREE.RingGeometry(r - 0.006, r, 48), i === 2 || i === 3 ? "#888" : "#333", { cast: false }); line.position.z = 0.181 + i * 0.002; g.add(line);
  }
  const x = mesh(new THREE.PlaneGeometry(0.05, 0.004), "#333", { cast: false }); x.position.z = 0.2; g.add(x);
  [-1, 1].forEach(s => { const leg = box(0.1, 2.4, 0.1, "#7a4a1f"); leg.position.set(s * 0.75, -0.6, -0.45); leg.rotation.x = -0.3; leg.rotation.z = s * 0.25; g.add(leg); });
  return g;
}
const AUTO = /simauto=1/.test(typeof location !== "undefined" ? location.search : "");   // 점검용: 가상 선수가 저절로 쏨
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
// 2인 대결: 두 화면이 함께 쓰는 정보 (같은 바람 순서, 선수별 점수·꽂힌 화살)
let shared = null;
function arrowMesh(fletch = "#ff3b5c") {
  const g = new THREE.Group();
  const shaft = cyl(0.012, 0.012, 0.8, "#6b3d14"); shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const tip = mesh(new THREE.ConeGeometry(0.025, 0.08, 8), "#9aa0a6"); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.44; g.add(tip);
  [0, 1, 2].forEach(i => { const f = box(0.004, 0.06, 0.14, i ? "#ffffff" : fletch, { cast: false }); f.position.z = 0.33; f.rotation.z = i * Math.PI * 2 / 3; f.translateY(0.03); g.add(f); });
  return g;   // -z 방향이 앞
}
function bowMesh() {
  const g = new THREE.Group();
  const limb = mesh(new THREE.TorusGeometry(0.55, 0.022, 8, 32, Math.PI * 0.75), "#8b4a16"); limb.rotation.z = Math.PI / 2 + Math.PI * 0.125; limb.position.x = -0.42; g.add(limb);
  const grip = box(0.05, 0.14, 0.05, "#2b2b2b"); g.add(grip);
  return g;
}
function flagPole(x, z) {
  const g = new THREE.Group(), pole = cyl(0.03, 0.03, 3, "#ddd"); pole.position.y = 1.5; g.add(pole);
  const cloth = mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ color: "#ff4d4d", side: THREE.DoubleSide }), { cast: false });
  cloth.position.set(0.45, 2.7, 0); const piv = new THREE.Group(); piv.position.y = 0; piv.add(cloth); g.add(piv);
  g.position.set(x, 0, z); g.cloth = piv; return g;
}

export default {
  id: "archery", title: "양궁", icon: "🏹", sec: 60, cursor: "", cat: "sport", bg: "#84fab0", desc: "활 당겨 과녁 맞히기 · 2인 대결", scene3d: true,
  how: "한 팔은 옆으로 쭉, 다른 손은 가슴 쪽으로 당겨요. 조준점을 과녁 가운데로 옮긴 뒤 당긴 손을 휙 놓으면 발사! 깃발로 바람을 봐요. 둘이 하면 같은 과녁·같은 바람으로 점수 대결",
  create(env) {
    const z = env.zone, v = env.view;
    const versus = env.mode === 2, slot = versus ? env.slot : 0, other = 1 - slot;
    if (versus && !shared) shared = { seed: 1 + Math.floor(Math.random() * 1e6), players: [null, null] };
    const S = versus ? shared : { seed: 1 + Math.floor(Math.random() * 1e6), players: [null, null] };
    const P = S.players[slot] = { name: env.name || `${slot + 1}P`, color: env.color || "#ff3b5c", tracker: env.tracker, phase: "idle", shots: 0, total: 0, rings: [], dist: DISTS[0], group: 0, stuck: [] };
    const O = () => (versus ? S.players[other] : null);
    const st = stage(env, { fov: 50, sky: ["#4fb3f2", "#e6f7ff"], shadowSize: 14 });
    const { scene, camera } = st;
    ground(scene, "#74c25a", 400);
    const water = sea(scene, 800, -0.4); water.position.z = -300;
    const range = box(10, 0.02, 40, "#8fd16a", { receive: true, cast: false }); range.position.set(0, 0.01, -16); scene.add(range);
    for (let i = 0; i < 8; i++) { const l = box(10, 0.025, 0.06, "#ffffff", { cast: false }); l.position.set(0, 0.02, -6 * i); scene.add(l); }
    for (let i = 0; i < 10; i++) { const s = i % 2 ? 1 : -1; scene.add(i % 3 ? tree(s * (7 + (i % 4)), -4 - i * 4, 1.4) : palm(s * (7 + (i % 4)), -4 - i * 4, 1.2)); }
    for (let i = 0; i < 5; i++) scene.add(cloud(-50 + i * 25, 22 + (i % 2) * 5, -120, 5));
    const hill = mesh(new THREE.SphereGeometry(40, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), "#5aa646", { cast: false }); hill.position.set(-30, -8, -130); scene.add(hill);
    const hill2 = mesh(new THREE.SphereGeometry(30, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), "#4f9a3f", { cast: false }); hill2.position.set(35, -6, -110); scene.add(hill2);
    const flags = [flagPole(-4.5, -8), flagPole(4.5, -16), flagPole(-4.5, -26)]; flags.forEach(f => scene.add(f));
    const target = targetMesh(); scene.add(target);
    const me = playerAvatar(env); me.scale.setScalar(1.15); me.rotation.y = Math.PI; me.position.set(0, 0, 0.6); scene.add(me);
    const bow = me.hold(0, bowMesh()); bow.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    const flying = arrowMesh(P.color); flying.visible = false; scene.add(flying);
    const nocked = arrowMesh(P.color); nocked.visible = false; scene.add(nocked);
    const stuckObjs = [];
    // 2인: 옆 사로의 상대 궁수(상대 색, 상대 자세 따라 함)와 상대가 같은 과녁에 꽂은 화살(상대 색 깃)
    let rival = null, rivalBow = null, oppKey = "";
    const oppArrows = [];
    let autoT = 0, autoErr = null;

    let phase = "idle", aimT = 0, lostT = 0, start = null, aim = { x: 0, y: 0 }, wind = 0, arrow = null, t = 0, shots = 0, total = 0, tens = 0, fov = 50, dist = DISTS[0];
    const tgt = () => ({ x: z.cx, y: v.H * 0.3, R: Math.min(z.w * 0.22, v.U * 0.17) });   // 조준 계산용 가상 과녁(화면 단위)
    const center = () => new THREE.Vector3(0, 1.55, -dist);
    const toWorld = (ax, ay) => { const T = tgt(); return center().add(new THREE.Vector3((ax - T.x) / T.R * TR, -(ay - T.y) / T.R * TR, 0.2)); };
    // 바람: 화살 순서마다 정해진 값 (2인은 두 사람이 같은 순서의 바람)
    const newWind = () => { wind = Math.round((hash(S.seed, shots) - 0.5) * 6 * env.diff.speed); };
    function placeTarget() { dist = DISTS[Math.floor(shots / 3) % DISTS.length]; P.dist = dist; P.group = Math.floor(shots / 3); P.stuck = []; target.position.copy(center()); stuckObjs.forEach(o => scene.remove(o)); stuckObjs.length = 0; }
    newWind(); placeTarget();
    // 지금 활을 당기고 있는지: 활 손(바깥으로 뻗은 손)과 시위 손(몸 가까이)
    function bowState() {
      const p = env.tracker.pts, hs = env.tracker.hands;
      if (!p || !p[11].v || !p[12].v || !hs[0].vis || !hs[1].vis) return null;
      const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1, mx = (p[11].x + p[12].x) / 2, my = (p[11].y + p[12].y) / 2;
      const k = Math.abs(hs[0].x - mx) > Math.abs(hs[1].x - mx) ? 0 : 1, bow = hs[k], pull = hs[1 - k];
      const drawn = Math.abs(bow.x - mx) > sw * 1.1 && Math.abs(bow.x - pull.x) > sw * 1.4 && Math.hypot(pull.x - mx, pull.y - my) < sw * 1.1;
      return { bow, pull, sw, mx, my, drawn };
    }
    function shoot() {
      const T = tgt(), land = { x: aim.x + wind * T.R * 0.05 + (Math.random() - 0.5) * T.R * 0.06, y: aim.y + (Math.random() - 0.5) * T.R * 0.06 };
      me.updateMatrixWorld(true);
      const from = me.handWorld(0).add(new THREE.Vector3(0, 0.05, -0.3));
      arrow = { t: 0, from, to: land, toW: toWorld(land.x, land.y) };
      phase = "fly"; shots++; sfx.whoosh();
    }
    function hitTarget() {
      const T = tgt(), d = Math.hypot(arrow.to.x - T.x, arrow.to.y - T.y), ring = d > T.R ? 0 : 10 - Math.floor(d / (T.R / 10));
      P.rings.push(ring); P.total = total + ring; P.shots = shots;
      if (ring > 0) P.stuck.push({ dx: (arrow.toW.x - center().x) / TR, dy: (arrow.toW.y - center().y) / TR, dir: arrow.dir.clone() });
      if (ring > 0) { const a = arrowMesh(P.color); a.position.copy(arrow.toW).addScaledVector(arrow.dir, -0.34); a.lookAt(a.position.clone().add(arrow.dir)); a.rotateY(Math.PI); scene.add(a); stuckObjs.push(a); }
      total += ring; phase = "idle"; aimT = 0; newWind();
      const Pm = st.toScreen(center().add(new THREE.Vector3(0, -TR * 1.3, 0)));
      arrow = null;
      if (ring === 0) { sfx.thud(); env.miss(Pm.x, Pm.y, "빗나갔어요"); }
      else {
        sfx.bonk();
        const C = st.toScreen(center());
        env.award(ring >= 9 ? 3 : ring >= 7 ? 2 : 1, C.x + v.U * 0.12, C.y - v.U * 0.08);
        if (ring === 10) { tens++; sfx.fanfare(); burst(C.x, C.y, { n: 36, colors: ["#ffd400", "#ff7aa2", "#ffffff"], shape: "star", speed: v.U * 0.9, gravity: v.U * 0.4, size: v.U * 0.02 }); }
        popup(z.cx, v.H * 0.62, ring === 10 ? "10점! 정중앙!" : `${ring}점`, { size: v.U * (ring === 10 ? 0.08 : 0.06), color: "#fff", stroke: ring >= 9 ? "#e0a000" : "#2f8bff", life: 1.3 });
      }
      if (shots % 3 === 0) setTimeout(placeTarget, 900);
    }
    return {
      update(dt) {
        t += dt;
        const T = tgt();
        let b = bowState();
        if (AUTO) {   // 점검용: 0.7초 쉬었다가 당기고, 조준점을 가운데 근처(80%)나 조금 먼 곳으로 옮겨 1.3초 뒤 발사
          b = null;
          if (phase === "idle") { autoT += dt; if (autoT > 0.7) { autoT = 0; phase = "aim"; aimT = 0; const a = Math.random() * Math.PI * 2; aim = { x: T.x + Math.cos(a) * T.R * 0.7, y: T.y + Math.sin(a) * T.R * 0.7 }; const r = Math.random() < 0.8 ? Math.random() * 0.25 : 0.5 + Math.random() * 0.6, a2 = Math.random() * Math.PI * 2; autoErr = { x: Math.cos(a2) * r * T.R - wind * T.R * 0.05, y: Math.sin(a2) * r * T.R }; } }
          else if (phase === "aim") { aimT += dt; aim.x += (T.x + autoErr.x - aim.x) * Math.min(1, dt * 3); aim.y += (T.y + autoErr.y - aim.y) * Math.min(1, dt * 3); if (aimT > 1.3) { shoot(); return; } }
        }
        P.phase = phase;
        if (AUTO) { /* 위에서 처리 */ }
        else if (phase === "idle") {
          if (b && b.drawn) { phase = "aim"; aimT = 0; lostT = 0; start = { bx: b.bow.x, by: b.bow.y, mx: b.mx }; const a = Math.random() * Math.PI * 2; aim = { x: T.x + Math.cos(a) * T.R * 0.7, y: T.y + Math.sin(a) * T.R * 0.7 }; start.ax = aim.x; start.ay = aim.y; sfx.tick && sfx.tick(); }
        } else if (phase === "aim") {
          aimT += dt;
          if (b && aimT < 0.35) { start.bx = b.bow.x; start.by = b.bow.y; start.mx = b.mx; }   // 자세가 자리 잡을 때까지 기준을 따라감
          if (b) {
            // 활 팔을 올리면 조준점이 위로, 몸을 옆으로 옮기면 조준점도 옆으로. 오래 버틸수록 덜 흔들림
            const sway = T.R * 0.1 * (1 + 1.6 * Math.exp(-aimT * 1.5)) / env.diff.reach;
            aim.x = start.ax + (b.bow.x - start.bx) * 0.6 + (b.mx - start.mx) * 1.5 + Math.sin(t * 2.3) * sway;
            aim.y = start.ay + (b.bow.y - start.by) * 1.6 + Math.sin(t * 3.1 + 1) * sway * 0.8;
            aim.x = clamp(aim.x, T.x - T.R * 2.2, T.x + T.R * 2.2); aim.y = clamp(aim.y, T.y - T.R * 1.8, T.y + T.R * 1.8);
            if (aimT > 0.4 && b.pull.bodySpeed > RELEASE * env.diff.punch) { shoot(); return; }   // 당긴 손을 휙 놓음
          }
          lostT = b && b.drawn ? 0 : lostT + dt;
          if (lostT > 0.25) { if (aimT > 0.6) shoot(); else phase = "idle"; }                    // 자세가 풀리면: 충분히 조준했으면 발사, 아니면 취소
        }
        if (phase === "fly") { arrow.t += dt; if (arrow.t >= FLY) hitTarget(); }
        // 2인: 상대 궁수와 상대 화살
        const Op = O();
        if (Op && !rival) {
          rival = playerAvatar({ color: Op.color, name: Op.name }); rival.scale.setScalar(1.15); rival.rotation.y = Math.PI; rival.position.set(-0.8, 0, -2.4); scene.add(rival);
          rivalBow = rival.hold(0, bowMesh()); rivalBow.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        }
        if (Op && rival) {
          if (Op.phase === "aim") { rival.arm(0, 0.05, Math.PI / 2, 0); rival.arm(1, 0.2, Math.PI / 2 - 0.1, 2.3); rival.body.rotation.y = 0.25; }
          else if (Op.phase === "fly") { rival.arm(0, 0.05, Math.PI / 2, 0); rival.arm(1, 0.6, Math.PI / 2 - 0.2, 0.4); }
          else { rival.body.rotation.y *= 0.9; rival.mimic(Op.tracker && Op.tracker.pts, true); }
          rival.idle(t + 1);
          // 같은 거리 과녁이면 상대 화살도 내 과녁에 보임
          const key = `${Op.dist}:${Op.group}:${Op.stuck.length}:${dist}`;
          if (key !== oppKey) {
            oppKey = key; oppArrows.forEach(o => scene.remove(o)); oppArrows.length = 0;
            if (Op.dist === dist) for (const s2 of Op.stuck) {
              const a = arrowMesh(Op.color), at = center().add(new THREE.Vector3(s2.dx * TR, s2.dy * TR, 0.2));
              a.position.copy(at).addScaledVector(s2.dir, -0.34); a.lookAt(a.position.clone().add(s2.dir)); a.rotateY(Math.PI); scene.add(a); oppArrows.push(a);
            }
          }
          // 끝나기 직전 승자 발표
          if (!S.ended && env.progress() > 0.985) {
            S.ended = true;
            const A = S.players[0], B = S.players[1], tie = A.total === B.total, w = A.total > B.total ? A : B;
            popup(z.cx, v.H * 0.4, tie ? "무승부!" : `${w.name} 승리!`, { size: v.U * 0.075, color: "#fff", stroke: tie ? "#555" : w.color, life: 2 });
          }
          if (S.ended && !P.bonus && P.total > Op.total) { P.bonus = true; env.award(5, z.cx, v.H * 0.32); sfx.fanfare(); }
        }
        // 캐릭터: 당기는 동안은 활 쏘는 자세, 아니면 내 팔 따라 하기
        if (phase === "aim") { me.arm(0, 0.05, Math.PI / 2, 0); me.arm(1, 0.2, Math.PI / 2 - 0.1, 2.3); me.body.rotation.y = 0.25; }
        else if (phase === "fly") { me.arm(0, 0.05, Math.PI / 2, 0); me.arm(1, 0.6, Math.PI / 2 - 0.2, 0.4); }
        else { me.body.rotation.y *= 0.9; me.mimic(env.tracker.pts, true); }
        me.idle(t);
        flags.forEach((f, i) => { f.cloth.rotation.y = -wind * 0.18 + Math.sin(t * 6 + i) * 0.1 * (1 + Math.abs(wind) * 0.3); f.cloth.scale.x = 0.4 + Math.min(1, Math.abs(wind) / 3) * 0.6; });
        // 화살
        nocked.visible = phase === "aim";
        if (nocked.visible) { me.updateMatrixWorld(true); nocked.position.copy(me.handWorld(0)).add(new THREE.Vector3(0, 0.03, 0.15)); nocked.lookAt(toWorld(aim.x, aim.y)); nocked.rotateY(Math.PI); }
        flying.visible = !!arrow;
        if (arrow) {
          const k = Math.min(1, arrow.t / FLY), e = 1 - (1 - k) * (1 - k);
          const p = arrow.from.clone().lerp(arrow.toW, e); p.y += Math.sin(e * Math.PI) * dist * 0.03;
          const k2 = Math.min(1, e + 0.02), q = arrow.from.clone().lerp(arrow.toW, k2); q.y += Math.sin(k2 * Math.PI) * dist * 0.03;
          arrow.dir = q.clone().sub(p).normalize();
          flying.position.copy(p); flying.lookAt(q); flying.rotateY(Math.PI);
        }
      },
      draw(ctx) {
        // 카메라: 캐릭터 오른쪽 어깨 뒤. 당기면 과녁 쪽으로 확대(줌)
        const zoom = phase === "aim" ? 1 : phase === "fly" ? 0.85 : 0;
        const goal = 50 - zoom * (dist > 24 ? 34 : 30);
        fov += (goal - fov) * 0.1;
        if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
        const zk = clamp((50 - fov) / 28, 0, 1);              // 확대된 정도: 많이 당기면 캐릭터 머리 너머(눈높이)로 들어감
        camera.position.set(1.15 - 0.85 * zk, 2.35 - 0.45 * zk, 4.4 - 3.6 * zk); camera.lookAt(0, 1.45, -dist);
        me.visible = zk < 0.55;
        st.draw(ctx);
        const U = v.U, C = st.toScreen(center());
        // 바람 (위 오른쪽)
        const bx = z.x1 - Math.min(z.w * 0.3, U * 0.32) - U * 0.02, by = v.H * 0.105, bw = Math.min(z.w * 0.3, U * 0.32), bh = U * 0.075;
        ctx.fillStyle = "rgba(10,40,70,.75)"; rr(ctx, bx, by, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, wind ? `바람 ${wind > 0 ? "→" : "←"} ${Math.abs(wind)}` : "바람 없음", bx + bw / 2, by + bh / 2, Math.min(U * 0.034, bw / 7), "#fff", "#0a2846", 3);
        // 점수 (위 왼쪽)
        const sx = z.x0 + U * 0.02, sw2 = Math.min(z.w * 0.3, U * 0.32);
        ctx.fillStyle = "rgba(10,40,70,.75)"; rr(ctx, sx, by, sw2, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, versus ? `${dist}m · ${shots}발` : `${dist}m · ${shots}발 · ${total}점`, sx + sw2 / 2, by + bh / 2, Math.min(U * 0.03, sw2 / 9), "#fff", "#0a2846", 3);
        // 2인: 두 화면 같은 점수판 "1P 이름 합계 : 합계 이름 2P" + 화살별 점수 + 앞선 사람 👑
        const Op = O();
        if (Op) {
          const A = S.players[0], B = S.players[1], ww = Math.min(z.w * 0.94, U * 0.8), wx = z.cx - ww / 2, wy = by + bh + U * 0.015, wh = U * 0.13;
          ctx.fillStyle = "rgba(10,40,70,.82)"; rr(ctx, wx, wy, ww, wh, U * 0.02); ctx.fill();
          const lead = A.total === B.total ? -1 : A.total > B.total ? 0 : 1, fs = Math.min(U * 0.05, ww / 10);
          outlinedText(ctx, `${lead === 0 ? "👑" : ""}${A.total}`, wx + ww * 0.25, wy + wh * 0.36, fs, "#fff", A.color, 4);
          outlinedText(ctx, ":", z.cx, wy + wh * 0.36, fs * 0.8, "#fff", "#333", 3);
          outlinedText(ctx, `${B.total}${lead === 1 ? "👑" : ""}`, wx + ww * 0.75, wy + wh * 0.36, fs, "#fff", B.color, 4);
          const last = R2 => R2.rings.slice(-3).map(r => (r ? r : "×")).join(" · ") || "-", ns = Math.min(U * 0.024, ww / 20);
          outlinedText(ctx, `1P ${A.name}  ${last(A)}`, wx + ww * 0.25, wy + wh * 0.78, ns, "#fff", A.color, 3);
          outlinedText(ctx, `${last(B)}  ${B.name} 2P`, wx + ww * 0.75, wy + wh * 0.78, ns, "#fff", B.color, 3);
        }
        // 조준점 (3D 과녁 위의 점을 화면에 표시)
        if (phase === "aim") {
          const A = st.toScreen(toWorld(aim.x, aim.y)), r = U * 0.03;
          ctx.strokeStyle = "#ff2d55"; ctx.lineWidth = Math.max(2.5, U * 0.006);
          ctx.beginPath(); ctx.arc(A.x, A.y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(A.x - r * 1.8, A.y); ctx.lineTo(A.x - r * 0.5, A.y); ctx.moveTo(A.x + r * 0.5, A.y); ctx.lineTo(A.x + r * 1.8, A.y);
          ctx.moveTo(A.x, A.y - r * 1.8); ctx.lineTo(A.x, A.y - r * 0.5); ctx.moveTo(A.x, A.y + r * 0.5); ctx.lineTo(A.x, A.y + r * 1.8); ctx.stroke();
          ctx.fillStyle = "#ff2d55"; ctx.beginPath(); ctx.arc(A.x, A.y, U * 0.005, 0, Math.PI * 2); ctx.fill();
          if (wind) { const T = tgt(), W = st.toScreen(toWorld(aim.x + wind * T.R * 0.05, aim.y)); ctx.setLineDash([U * 0.008, U * 0.008]); ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W.x, W.y, r * 0.6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        }
        const pw = Math.min(z.w * 0.24, U * 0.3), hx = z.x0 + (z.w - pw) / 2;
        const hint = phase === "idle" ? "한 팔은 옆으로 쭉, 다른 손은 가슴으로 당겨요" : phase === "aim" ? "조준점을 가운데로! 당긴 손을 휙 놓으면 발사" : "";
        if (hint) outlinedText(ctx, hint, hx, v.H * 0.88, Math.min(U * 0.04, (z.w - pw) / (hint.length * 0.95)), "#fff", "#2d6a1e", 4);
        if (phase === "idle" && C) outlinedText(ctx, `${dist}m`, C.x, C.y - Math.max(U * 0.05, (C.y - st.toScreen(center().add(new THREE.Vector3(0, TR, 0))).y) * 1.3), U * 0.035, "#fff", "#2d6a1e", 3);
      },
      stop() { st.dispose(); shared = null; },
      result: () => { const Op = O(), vs = Op ? ` · ${Op.name} ${Op.total}점 ${total > Op.total ? "(승)" : total < Op.total ? "(패)" : "(무)"}` : ""; return `${shots}발 · 합계 ${total}점 · 10점 ${tens}번${vs}`; },
      // 설명 시연용
      get phase() { return phase; },
      get aimErr() { const T = tgt(); return { dx: aim.x - T.x, dy: aim.y - T.y, R: T.R }; },
      get aimT() { return aimT; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      const u = p.u, sy = p.shoulderY;
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1;
      if (T < 4) say("양궁! 한 팔은 옆으로 쭉, 다른 손은 가슴으로 당겨요");
      else if (T < 9) say("팔을 올리고 내려서 조준점을 가운데로");
      else if (T < 14) say("당긴 손을 휙 놓으면 발사! 깃발로 바람을 봐요");
      else say("이제 직접 해 봐요!");
      if (g.phase === "fly") { S.rel = false; return; }
      if (g.phase === "idle" && !S.rel) { S.by = sy; p.tcx = p.v.W / 2; }
      const bx = p.cx - 2.3 * u;
      if (S.rel) { p.reach(1, p.cx + 1.7 * u, sy + 0.3 * u, 5); if (g.phase === "idle") { S.rt = (S.rt || 0) + 1 / 60; if (S.rt > 0.6) { S.rel = false; S.rt = 0; } } return; }
      if (g.phase === "aim") {   // 조준점이 가운데로 가도록 활 팔 높이와 몸 위치를 조금씩 고침
        const e = g.aimErr;
        S.by = Math.max(sy - 1.2 * u, Math.min(sy + 1 * u, S.by - e.dy / 1.6 * 0.05));
        p.tcx = p.cx - e.dx / 1.5 * 0.08; p.walk = 0.4;
        if ((g.aimT > 1.2 && Math.hypot(e.dx, e.dy) < e.R * 0.15) || g.aimT > 3.5) S.rel = true;
      }
      p.reach(0, bx, S.by, 1.2);
      p.reach(1, p.cx - 0.15 * u, sy + 0.15 * u, 1.5);
    },
  },
};
