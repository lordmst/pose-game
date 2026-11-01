// 복싱 (스포츠 리조트처럼 3D 링): 내 눈높이에서 상대 선수를 봄. 화면 아래 빨간 내 글러브가 내 손을 그대로 따라감
// 상대가 막고 있는 곳(얼굴/몸)이 아닌 빈 곳을 주먹으로 침. 상대가 주먹을 뒤로 빼면(빨간 경고) → 두 손으로 얼굴 막기, 또는 머리를 옆으로 피하기
// 상대 체력을 다 깎으면 KO 보너스, 다음 상대 등장. 내가 맞으면 감점, 체력이 다 떨어지면 다운
import { burst, popup, shake, rr, outlinedText } from "../../fx.js?v=35";
import { sfx } from "../../audio.js?v=35";
import { stage, THREE, box, ball as sphere, cyl, mesh, avatar } from "./kit3d.js?v=35";

const PUNCH = 3.0;       // 펀치로 인정하는 손 속도 (어깨너비/초)
const STRONG = 7.0;      // 이 이상이면 강펀치(체력 2칸)
const WIND = 0.85;       // 상대 공격 예고 시간(초, 보통)
const MY_HP = 5;
const SKIN = ["#f2c49b", "#c98b5e", "#8d5a3b"], TRUNKS = ["#3d8bff", "#2fb65a", "#a24bd6", "#ff8a00"], HAIR = ["#3b2414", "#1f1f1f", "#7a4a1f"];
const RS = 3.6;          // 링 반 너비(m)

// 링·관중·조명
function arena(scene) {
  const floor = box(RS * 2 + 0.6, 0.5, RS * 2 + 0.6, "#dfe9f5", { receive: true, cast: false }); floor.position.y = -0.25; scene.add(floor);
  const apron = box(RS * 2 + 1.2, 0.9, RS * 2 + 1.2, "#1b3d8f", { cast: false }); apron.position.y = -0.7; scene.add(apron);
  const logo = mesh(new THREE.CircleGeometry(1.4, 40), "#c9d8ee", { cast: false, receive: true }); logo.rotation.x = -Math.PI / 2; logo.position.y = 0.01; scene.add(logo);
  const corners = [[-1, -1, "#e03131"], [1, -1, "#1c7ed6"], [-1, 1, "#e9ecef"], [1, 1, "#e9ecef"]];
  corners.forEach(([sx, sz, c]) => { const p = cyl(0.09, 0.09, 1.6, "#cfd4da", { metal: 0.5, rough: 0.3 }); p.position.set(sx * RS, 0.8, sz * RS); scene.add(p); const pad = box(0.3, 1.0, 0.3, c); pad.position.set(sx * RS, 0.9, sz * RS); scene.add(pad); });
  const rope = (x1, z1, x2, z2, y, c) => { const len = Math.hypot(x2 - x1, z2 - z1), r = cyl(0.035, 0.035, len, c, { cast: false }); r.rotation.z = Math.PI / 2; r.rotation.y = -Math.atan2(z2 - z1, x2 - x1); r.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); scene.add(r); };
  [[0.55, "#e03131"], [0.95, "#ffffff"], [1.35, "#1c7ed6"]].forEach(([y, c]) => { rope(-RS, -RS, RS, -RS, y, c); rope(-RS, -RS, -RS, RS, y, c); rope(RS, -RS, RS, RS, y, c); });
  // 관중: 어두운 객석에 알록달록 머리들
  const cols = ["#ff8787", "#ffd43b", "#8ce99a", "#74c0fc", "#e599f7", "#ffa94d", "#dee2e6"], fans = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 22; i++) {
    const a = -Math.PI * 0.95 + (i / 21) * Math.PI * 0.9 - Math.PI * 0.05, d = 7 + r * 1.3;
    const f = sphere(0.3, cols[(i * 3 + r) % cols.length], { cast: false, rough: 0.9 }); f.position.set(Math.cos(a) * d, 0.2 + r * 0.75, Math.sin(a) * d);
    f.userData.b = Math.random() * 6; f.userData.y = f.position.y; scene.add(f); fans.push(f);
  }
  // 천장 조명: 빛 기둥 + 램프
  const beams = [];
  [[-3, -3, "#ffe8a3"], [3, -3, "#a3d8ff"], [0, -5, "#ffffff"], [-5, 0, "#ffb3d9"], [5, 0, "#b3ffcc"]].forEach(([x, z, c], i) => {
    const lamp = sphere(0.35, c, { glow: c, cast: false }); lamp.position.set(x, 8, z); scene.add(lamp);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 8, 24, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(x * 0.6, 4, z * 0.6); beam.lookAt(0, 0, 0); beam.rotateX(Math.PI / 2); beam.userData.i = i; scene.add(beam); beams.push(beam);
  });
  const spot = new THREE.SpotLight(0xffffff, 60, 30, 0.6, 0.5, 1.5); spot.position.set(0, 9, 2); spot.target.position.set(0, 0, 0); scene.add(spot, spot.target);
  return { fans, beams };
}
// 글러브: +z 쪽이 주먹 앞. mine이면 손목(흰 띠)이 아래·앞쪽(내 쪽)으로 비스듬히 → 1인칭에서 손등이 보임
function glove(r, mine = false) {
  const g = new THREE.Group(), fist = sphere(r, "#e02424", { rough: 0.35 }); fist.scale.set(1, 1.05, 1.15); g.add(fist);
  const thumb = sphere(r * 0.42, "#e02424", { rough: 0.35 }); thumb.position.set(r * 0.75, -r * 0.15, r * 0.35); g.add(thumb);
  const cuff = cyl(r * 0.62, r * 0.7, r * 0.8, "#ffffff"); cuff.rotation.x = Math.PI / 2 - (mine ? 0.9 : 0); cuff.position.set(0, mine ? -r * 0.75 : 0, -r * (mine ? 0.75 : 1.05)); g.add(cuff);
  return g;
}

export default {
  id: "boxing", title: "복싱", icon: "🥊", sec: 60, cursor: "", cat: "sport", bg: "#ff9a9e", desc: "빈 곳 치고 막고 피하기", scene3d: true,
  how: "빠르게 주먹을 뻗어 상대가 막지 않은 곳(얼굴/몸)을 쳐요. 빨간 경고가 뜨면 두 손으로 얼굴을 막거나 머리를 옆으로 피해요!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const st = stage(env, { fov: 52, sky: ["#07091c", "#2b1d4d"], shadowSize: 6 });
    const { scene, camera } = st;
    st.hemi.intensity = 0.75; st.sun.intensity = 0.7;
    const A = arena(scene);
    camera.position.set(0, 1.95, 3.6); camera.lookAt(0, 1.55, 0); camera.updateMatrixWorld();
    // 내 글러브 두 개 (화면 아래, 내 손을 따라감)
    const myG = [glove(0.11, true), glove(0.11, true)]; myG.forEach(g => { g.traverse(o => { o.castShadow = false; }); scene.add(g); });
    const gState = [{ d: 1, push: 0 }, { d: 1, push: 0 }];
    let oppA = null, oppG = [];
    const R = () => Math.min(z.w * 0.2, v.U * 0.11);
    const opp = { x: z.cx, maxHp: 12 + D.hp * 3, hp: 0, guard: "head", guardT: 0, hitT: 0, n: 0, ko: 0, sway: 0 };
    let t = 0, myHp = MY_HP, atk = null, atkT = 2.2, cool = [0, 0], hits = 0, blocked = 0, kos = 0, taken = 0, defended = 0, downs = 0, noseBase = null, cheer = 0;
    function newOpp() {
      opp.n++; opp.maxHp = 12 + D.hp * 3 + (opp.n - 1) * 3; opp.hp = opp.maxHp; opp.guard = "head"; opp.guardT = 1.5; opp.ko = 0;
      opp.skin = SKIN[(opp.n - 1) % 3]; opp.trunk = TRUNKS[(opp.n - 1) % 4];
      if (oppA) scene.remove(oppA);
      oppA = avatar({ shirt: opp.skin, pants: opp.trunk, skin: opp.skin, hair: HAIR[(opp.n - 1) % 3], girl: opp.n % 2 === 0 });
      oppA.scale.setScalar(1.3); scene.add(oppA);
      const gear = mesh(new THREE.SphereGeometry(0.235, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), "#c92a2a"); gear.position.y = 0.02; gear.rotation.x = -0.15; oppA.headG.add(gear);
      oppG = [0, 1].map(k => { const g = glove(0.1); g.rotation.x = -Math.PI / 2; g.position.y = -0.02; oppA.hold(k, g); return g; });
    }
    newOpp();
    const wpos = (o, dy = 0) => { const p = new THREE.Vector3(); o.getWorldPosition(p); p.y += dy; return p; };
    // 상대 몸 위치(화면 좌표): 3D 상대의 머리·가슴을 화면에 투영
    const head = () => { const q = st.toScreen(wpos(oppA.headG)); return { x: q.x, y: q.y, r: R() * 0.75 }; };
    const body = () => { const q = st.toScreen(wpos(oppA.body, 1.12 * 1.3)); return { x: q.x, y: q.y, r: R() * 0.9 }; };
    function strike(k, h, part) {
      const P = part === "head" ? head() : body();
      cool[k] = 0.35; gState[k].push = 1;
      if (opp.guard === part) {               // 막힌 곳
        blocked++; sfx.bonk(); popup(P.x, P.y - P.r * 1.3, "막혔다!", { size: v.U * 0.04, color: "#fff", stroke: "#666" });
        burst(h.x, h.y, { n: 6, colors: ["#ffffff", "#cccccc"], speed: v.U * 0.4, gravity: v.U, size: v.U * 0.01, life: 0.3 });
        return;
      }
      const strong = h.bodySpeed >= STRONG * D.punch, dmg = strong ? 2 : 1;
      hits++; opp.hp = Math.max(0, opp.hp - dmg); opp.hitT = 0.25; opp.hitPart = part;
      sfx.hit(dmg); shake(v.U * (strong ? 0.014 : 0.007), 0.18);
      env.award(strong ? 2 : 1, P.x, P.y - P.r * 1.4);
      if (strong) popup(P.x, P.y + P.r * 1.5, "강펀치!", { size: v.U * 0.05, color: "#fff", stroke: "#d0451b" });
      burst(h.x, h.y, { n: strong ? 18 : 10, colors: ["#ffffff", "#ffe14d", "#ff7a7a"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.5, size: v.U * 0.016, life: 0.5 });
      if (opp.hp <= 0) {                      // KO!
        kos++; opp.ko = 1.6; atk = null; cheer = 2; sfx.fanfare(); env.award(5, z.cx, v.H * 0.36);
        popup(z.cx, v.H * 0.2, "K.O.!", { size: v.U * 0.1, color: "#ffe14d", stroke: "#b30000", life: 1.4 });
      } else if (Math.random() < 0.45) { opp.guard = part === "head" ? "body" : "head"; opp.guardT = 1 + Math.random(); }   // 맞은 곳을 막으러 감
    }
    // 내 방어: 두 손목이 코 가까이(얼굴 막기) 또는 머리를 공격 반대쪽으로 피함
    function defended_(a) {
      const p = env.tracker.pts;
      if (!p || !p[0].v) return null;
      const sw = Math.max(env.tracker.scale || 0, v.U * 0.06);
      const guard = [15, 16].every(i => p[i].v && Math.hypot(p[i].x - p[0].x, p[i].y - p[0].y) < sw * 1.1);
      if (guard) return "guard";
      const dx = (p[0].x - noseBase.x) / sw, dy = (p[0].y - noseBase.y) / sw;
      if (a.side === "left" && dx > 0.5) return "dodge";
      if (a.side === "right" && dx < -0.5) return "dodge";
      if (a.side === "mid" && (Math.abs(dx) > 0.5 || dy > 0.45)) return "dodge";
      return null;
    }
    // 상대 자세 (3D): 막기·공격·맞음·KO
    function poseOpp(dt) {
      const a = oppA, fall = opp.ko > 0 ? Math.min(1, (1.6 - opp.ko) * 2) : 0;
      a.position.x = opp.sway; a.rotation.x = -fall * 1.35; a.position.z = -fall * 0.6;
      a.body.position.y = Math.abs(Math.sin(t * 5)) * 0.04;
      const hit = opp.hitT > 0 ? opp.hitT / 0.25 : 0;
      a.headG.rotation.x = opp.hitPart === "head" ? -0.45 * hit : 0; a.body.rotation.x = opp.hitPart === "body" ? 0.3 * hit : 0;
      a.headG.rotation.z = Math.sin(t * 2.3) * 0.06;
      if (opp.ko > 0) { a.arm(0, 1.2, 0.2, 0.2); a.arm(1, 1.2, 0.2, 0.2); return; }
      [0, 1].forEach(k => {
        // 공격하는 팔: 화면 왼쪽 공격 = 상대의 오른팔(k=1), 오른쪽·가운데 = 왼팔(k=0)
        const mine = atk && ((atk.side === "left" && k === 1) || (atk.side !== "left" && k === 0));
        if (mine && !atk.done) { const u = atk.t / atk.T; a.arm(k, 0.4 + 0.6 * u, 0.5 - 0.4 * u, 2.2); a.body.rotation.y = (k ? -1 : 1) * 0.35 * u; }
        else if (mine) { const u = Math.min(1, atk.rt / 0.12); a.arm(k, 0.25, 0.4 + 1.15 * u, 2.2 * (1 - u)); a.body.rotation.y = (k ? 1 : -1) * 0.3 * u; a.position.z = 0.4 * u * (1 - Math.max(0, atk.rt - 0.25) / 0.2); }
        else if (opp.guard === "head") a.arm(k, 0.45, 0.55, 2.35);
        else a.arm(k, 0.35, 0.65, 1.55);
      });
      if (!atk) a.body.rotation.y *= Math.max(0, 1 - dt * 6);
    }
    // 내 글러브: 손의 화면 위치로. 펀치하면 앞으로 쭉
    function poseMine(dt) {
      env.tracker.hands.forEach((h, k) => {
        const g = myG[k], s = gState[k];
        s.push = Math.max(0, s.push - dt * 4);
        const nx = h.vis ? ((h.x - z.x0) / z.w) * 2 - 1 : (k ? 0.3 : -0.3), ny = h.vis ? -((h.y / v.H) * 2 - 1) : -0.55;
        const dir = new THREE.Vector3(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
        const dist = 1.0 + (h.vis ? Math.min(1, h.bodySpeed / 8) * 0.5 : 0) + s.push * 0.9;
        s.d += (dist - s.d) * Math.min(1, dt * 14);
        g.position.copy(camera.position).addScaledVector(dir, s.d);
        g.lookAt(camera.position.clone().addScaledVector(dir, 5)); g.rotation.z += (k ? -0.4 : 0.4);
      });
    }
    return {
      update(dt) {
        t += dt; cool[0] = Math.max(0, cool[0] - dt); cool[1] = Math.max(0, cool[1] - dt); cheer = Math.max(0, cheer - dt);
        opp.hitT = Math.max(0, opp.hitT - dt); opp.sway = Math.sin(t * 1.7) * 0.32;
        oppA.updateMatrixWorld(true);
        const p = env.tracker.pts;
        // 코 위치 기준값: 공격이 없을 때 천천히 따라감 (피했는지 판단용)
        if (p && p[0].v) { if (!noseBase) noseBase = { x: p[0].x, y: p[0].y }; else if (!atk) { const a = Math.min(1, dt * 1.5); noseBase.x += (p[0].x - noseBase.x) * a; noseBase.y += (p[0].y - noseBase.y) * a; } }
        A.fans.forEach(f => { f.position.y = f.userData.y + Math.abs(Math.sin(t * (cheer ? 12 : 2.5) + f.userData.b)) * (cheer ? 0.35 : 0.06); });
        A.beams.forEach(b => { b.material.opacity = 0.04 + 0.025 * Math.sin(t * 2 + b.userData.i); });
        poseMine(dt);
        if (opp.ko > 0) { poseOpp(dt); opp.ko -= dt; if (opp.ko <= 0) { newOpp(); popup(z.cx, v.H * 0.2, `${opp.n}번째 상대!`, { size: v.U * 0.05, color: "#fff", stroke: opp.trunk }); atkT = 1.8; } return; }
        // 상대 가드 바꾸기
        opp.guardT -= dt;
        if (opp.guardT <= 0 && !atk) { opp.guard = Math.random() < 0.5 ? "head" : "body"; opp.guardT = (1.4 + Math.random() * 1.6) / D.speed; }
        // 내 펀치: 빠르게, 그리고 상대 쪽으로 다가가는 손만
        env.tracker.hands.forEach((h, k) => {
          if (!h.vis || cool[k] > 0 || h.bodySpeed < PUNCH * D.punch) return;
          for (const part of ["head", "body"]) {
            const P = part === "head" ? head() : body();
            if (Math.hypot(h.x - P.x, h.y - P.y) > P.r * 1.25 * D.reach) continue;
            if ((P.x - h.x) * h.vx + (P.y - h.y) * h.vy <= 0 && Math.hypot(h.x - P.x, h.y - P.y) > P.r * 0.4) continue;
            strike(k, h, part); break;
          }
        });
        // 상대 공격: 예고 → 때림
        if (!atk) {
          atkT -= dt;
          if (atkT <= 0 && p && p[0].v) {   // 선수가 보일 때만 공격
            const side = ["left", "right", "mid"][Math.floor(Math.random() * (env.progress() > 0.3 ? 3 : 2))];
            atk = { side, t: 0, T: WIND / D.speed * (1 - 0.2 * env.progress()), done: false, rt: 0 };
            sfx.whoosh();
          }
        } else if (!atk.done) {
          atk.t += dt;
          if (atk.t >= atk.T) {
            atk.done = true; atk.rt = 0;
            const d = defended_(atk), x = atk.side === "left" ? z.x0 + z.w * 0.3 : atk.side === "right" ? z.x0 + z.w * 0.7 : z.cx;
            if (d) {
              defended++; atk.res = d; sfx.catch(env.player.combo); env.award(1, x, v.H * 0.4);
              popup(x, v.H * 0.48, d === "guard" ? "막았다!" : "피했다!", { size: v.U * 0.05, color: "#fff", stroke: "#2fb65a" });
            } else {
              taken++; atk.res = "hit"; myHp--; sfx.thud(); shake(v.U * 0.03, 0.4);
              env.penalty(1, x, v.H * 0.45, "맞았다!");
              if (myHp <= 0) { downs++; myHp = MY_HP; env.penalty(1, z.cx, v.H * 0.55, "다운!"); popup(z.cx, v.H * 0.62, "일어나요! 다시!", { size: v.U * 0.045, color: "#fff", stroke: "#b30000" }); }
            }
          }
        } else {
          atk.rt += dt;
          if (atk.rt > 0.45) { atk = null; atkT = (2.0 + Math.random() * 1.8) / D.speed * (1 - 0.3 * env.progress()); }
        }
        poseOpp(dt);
      },
      draw(ctx) {
        // 맞으면 화면이 흔들림
        const hitShake = atk && atk.done && atk.res === "hit" ? (1 - atk.rt / 0.45) : 0;
        camera.position.set(Math.sin(t * 60) * 0.05 * hitShake, 1.95, 3.6); camera.lookAt(0, 1.55, 0);
        st.draw(ctx);
        const U = v.U;
        // 체력 막대: 상대(위 왼쪽), 나(위 오른쪽)
        const bw = z.w * 0.38, by = v.H * 0.115, bh = Math.max(12, U * 0.024);
        const bar = (x, label, k, col) => {
          ctx.fillStyle = "rgba(0,0,0,.6)"; rr(ctx, x - 3, by - 3, bw + 6, bh + 6, bh / 2 + 3); ctx.fill();
          ctx.fillStyle = col; rr(ctx, x, by, Math.max(bh, bw * k), bh, bh / 2); ctx.fill();
          outlinedText(ctx, label, x + bw / 2, by + bh + U * 0.026, U * 0.027, "#fff", "#333", 3);
        };
        bar(z.x0 + z.w * 0.06, `상대 ${opp.n}`, opp.hp / opp.maxHp, "#ff5a5a");
        bar(z.x1 - z.w * 0.06 - bw, "나", myHp / MY_HP, env.color);
        outlinedText(ctx, `ROUND ${opp.n}`, z.cx, by + bh / 2, Math.min(U * 0.035, z.w / 14), "#ffe14d", "#7a0000", 3);
        // 막고 있는 곳 표시와 노릴 곳
        if (opp.ko <= 0) {
          const H = head(), B = body(), P = opp.guard === "head" ? H : B, O = opp.guard === "head" ? B : H;
          ctx.save(); ctx.globalAlpha = 0.85; ctx.setLineDash([U * 0.012, U * 0.01]); ctx.lineWidth = U * 0.006;
          ctx.strokeStyle = "#ffe14d"; ctx.beginPath(); ctx.arc(O.x, O.y, O.r * 1.05, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
          outlinedText(ctx, "여기!", O.x + O.r * 1.45, O.y, U * 0.03, "#ffe14d", "#333", 3);
          outlinedText(ctx, "🛡️", P.x + P.r * 1.3, P.y, U * 0.035, "#fff", "#333", 2);
        }
        // 공격 예고: 빨간 경고와 피할 방향
        if (atk && !atk.done) {
          const k = atk.t / atk.T, lx = atk.side === "left" ? z.x0 : atk.side === "right" ? z.cx : z.x0 + z.w * 0.25, lw = z.w * 0.5;
          ctx.fillStyle = `rgba(255,40,40,${(0.12 + 0.2 * k * (0.6 + 0.4 * Math.sin(t * 30))).toFixed(3)})`; ctx.fillRect(lx, v.H * 0.15, lw, v.H * 0.7);
          const hint = atk.side === "left" ? "막거나 → 피하기!" : atk.side === "right" ? "막거나 ← 피하기!" : "막거나 숙이기!";
          outlinedText(ctx, "! " + hint, z.cx, v.H * 0.66, Math.min(U * 0.05, z.w / 10), "#fff", "#c00000", 4);
        }
        if (hitShake) { ctx.fillStyle = `rgba(255,0,0,${(0.3 * hitShake).toFixed(3)})`; ctx.fillRect(z.x0, 0, z.w, v.H); }
      },
      stop() { st.dispose(); },
      result: () => `맞힘 ${hits} · 막힘 ${blocked} · KO ${kos} · 방어 ${defended} · 맞음 ${taken}${downs ? ` · 다운 ${downs}` : ""}`,
      // 설명 시연용
      get head() { return head(); }, get body() { return body(); },
      get guard() { return opp.guard; }, get ko() { return opp.ko > 0; },
      get attack() { return atk && !atk.done ? { side: atk.side, k: atk.t / atk.T } : null; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1; p.tcx = p.v.W / 2;
      const u = p.u, a = g.attack;
      if (T < 4) say("복싱! 상대가 막지 않은 곳을 빠르게 쳐요");
      else if (T < 9) say("노란 점선이 빈 곳! 얼굴이나 몸을 노려요");
      else if (T < 14.5) say("빨간 경고가 뜨면 두 손으로 얼굴을 막거나 옆으로 피해요");
      else say("이제 직접 해 봐요!");
      if (a) {                      // 방어: 첫 번째는 막기, 그다음은 피하기
        if (S.atkSeen !== a.side + S.atkN) { S.atkN = (S.atkN || 0) + 1; S.atkSeen = a.side + S.atkN; }
        if (S.atkN % 2 === 1 || a.side === "mid") { p.rest(0, "head", 2); p.rest(1, "head", 2); p.leanT = 0; }
        else { p.leanT = a.side === "left" ? 1 : -1; p.rest(0, "guard", 1.5); p.rest(1, "guard", 1.5); }
        S.ph = "back"; S.t0 = T; return;
      }
      p.leanT = 0;
      if (g.ko) { p.rest(0, "cheer", 1); p.rest(1, "cheer", 1); return; }
      const tg = g.guard === "head" ? g.body : g.head, k = S.k || 0, sh = p.pts[11 + k];
      p.rest(1 - k, "guard", 1.2);
      if (S.ph !== "hit") {          // 주먹 당기기
        p.reach(k, sh.x + (k ? 0.4 : -0.4) * u, sh.y + 0.6 * u, 1.2);
        if (T - (S.t0 || 0) > 0.45) { S.ph = "hit"; S.t0 = T; }
      } else {                       // 빠르게 뻗기
        p.reach(k, tg.x, tg.y, 1.6);
        if (Math.hypot(p.hands[k].x - tg.x, p.hands[k].y - tg.y) < u * 0.15 || T - S.t0 > 0.4) { S.ph = "back"; S.t0 = T; S.k = 1 - k; }
      }
    },
  },
};
