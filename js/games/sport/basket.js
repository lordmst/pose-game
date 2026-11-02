// 농구 (스포츠 리조트 3점 슛 대회처럼 3D): 바닷가 야외 코트, 3점 라인을 따라 놓인 공 랙 5곳에서 차례로 슛
// 두 손을 머리 위로 올리면 슛 준비 → 힘 막대가 오르내림 → 초록 칸일 때 손을 위로 '휙' 튕기면 슛
// 랙 5개 × 공 5개, 랙의 마지막 공(무지개 머니볼)은 2배. 깨끗하게 들어가면(스위시) 보너스
// 2인: 같은 골대에 동시에 슛하는 대결. 상대 캐릭터가 내 옆에서 자기 랙 순서대로 슛하는 모습이 실시간으로 보임. 위쪽에 두 사람 점수·랙 진행
import { burst, popup, outlinedText, rr } from "../../fx.js?v=48";
import { sfx } from "../../audio.js?v=48";
import { stage, THREE, ground, sea, box, cyl, mesh, palm, cloud, avatar, playerAvatar, textBoard } from "./kit3d.js?v=48";

const AUTO = /simauto=1/.test(typeof location !== "undefined" ? location.search : "");   // 점검용: 가상 선수가 저절로 슛
let shared = null;   // 2인 대결: 두 화면이 서로의 상태를 공개(p[slot])하고 상대를 그대로 그림

const FLICK = 1.6;                  // 튕기기로 인정하는 손 속도(어깨너비/초)
const SWEET = 0.8;                  // 힘 막대의 가장 좋은 자리 (0~1)
const RIM = new THREE.Vector3(0, 3.05, 0), RIM_R = 0.23, BR = 0.13, SPOT_R = 6.9;
const SPOTS = [-78, -40, 0, 40, 78].map(d => d * Math.PI / 180);   // 랙 자리 (골대 기준 각도)
const arc = (a, b, h, u) => new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + 4 * h * u * (1 - u), a.z + (b.z - a.z) * u);
const spotPos = (a, r = SPOT_R) => new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);

// 농구공 무늬 (머니볼은 무지개 줄무늬)
const texCache = {};
function ballMat(money) {
  const key = money ? "m" : "n";
  if (!texCache[key]) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 128; const g = c.getContext("2d");
    if (money) { const cols = ["#ff4d4d", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#b197fc"]; cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 128 / cols.length, 256, 128 / cols.length + 1); }); }
    else { g.fillStyle = "#e8711c"; g.fillRect(0, 0, 256, 128); }
    g.strokeStyle = "#2a1205"; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(192, 0); g.lineTo(192, 128); g.stroke();
    g.beginPath(); g.ellipse(128, 64, 40, 64, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.ellipse(0, 64, 40, 64, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.ellipse(256, 64, 40, 64, 0, Math.PI / 2, Math.PI * 1.5); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texCache[key] = t;
  }
  return new THREE.MeshStandardMaterial({ map: texCache[key], roughness: 0.7 });
}
const bball = money => { const m = new THREE.Mesh(new THREE.SphereGeometry(BR, 20, 14), ballMat(money)); m.castShadow = true; return m; };

function court(scene) {
  ground(scene, "#e9d8a6", 400);                                       // 모래
  const s = sea(scene, 600, -0.3); s.position.z = -150; scene.userData.sea = s;
  const floor = box(16, 0.04, 15, "#2f6fb5", { receive: true, cast: false }); floor.position.set(0, 0.02, 4.5); scene.add(floor);
  const key = box(4.9, 0.045, 5.8, "#ff8c3a", { receive: true, cast: false }); key.position.set(0, 0.025, 2.9 - 1.2 + 0.3); scene.add(key);
  const line = (geo, x, z, ry = 0) => { const m = mesh(geo, "#ffffff", { cast: false, receive: true }); m.rotation.x = -Math.PI / 2; m.rotation.z = ry; m.position.set(x, 0.05, z); scene.add(m); };
  line(new THREE.RingGeometry(6.7, 6.78, 64, 1, -Math.PI / 2 - 1.45, Math.PI - 0.2 + 0.1), 0, 0, 0);   // 3점 라인(반원)
  line(new THREE.RingGeometry(1.75, 1.82, 40, 1, 0, Math.PI), 0, 4.6);                              // 자유투 원
  line(new THREE.PlaneGeometry(16, 0.08), 0, -1.2);                                                  // 엔드 라인
  // 골대: 기둥 · 팔 · 백보드(빨간 네모) · 림 · 그물
  const pole = cyl(0.1, 0.12, 3.6, "#3d4b5c"); pole.position.set(0, 1.8, -1.9); scene.add(pole);
  const armB = box(0.12, 0.12, 1.5, "#3d4b5c"); armB.position.set(0, 3.45, -1.15); scene.add(armB);
  const board = box(1.8, 1.05, 0.05, "#ffffff", { opacity: 0.92 }); board.position.set(0, 3.45, -0.4); scene.add(board);
  const sq = (w, h, x, y) => { const m = box(w, h, 0.01, "#e03131", { cast: false }); m.position.set(x, y, -0.37); scene.add(m); };
  sq(0.59, 0.04, 0, 3.4); sq(0.59, 0.04, 0, 3.15); sq(0.04, 0.29, -0.28, 3.27); sq(0.04, 0.29, 0.28, 3.27);
  const frame = box(1.84, 0.06, 0.06, "#e03131"); frame.position.set(0, 3.97, -0.4); scene.add(frame);
  const rim = mesh(new THREE.TorusGeometry(RIM_R, 0.02, 8, 32), "#ff5a1a", { metal: 0.4, rough: 0.4 }); rim.rotation.x = Math.PI / 2; rim.position.copy(RIM); scene.add(rim);
  const brk = box(0.06, 0.04, 0.2, "#ff5a1a"); brk.position.set(0, RIM.y, -0.3); scene.add(brk);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(RIM_R, 0.14, 0.42, 12, 3, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.9 }));
  net.position.set(RIM.x, RIM.y - 0.21, RIM.z); scene.add(net); scene.userData.net = net;
  // 바닷가 리조트: 야자수 · 구름 · 관중석
  for (let i = 0; i < 12; i++) { const sd = i % 2 ? 1 : -1; scene.add(palm(sd * (10 + (i % 3) * 2.5), -6 + i * 1.8, 1.1 + (i % 3) * 0.2)); }
  const colors = ["#ff6b6b", "#ffd43b", "#69db7c", "#74c0fc", "#f783ac", "#ffa94d"];
  scene.userData.fans = [];
  [-1, 1].forEach(sd => { for (let r = 0; r < 3; r++) {
    const step = box(0.9, 0.4, 10, "#d0d7e2"); step.position.set(sd * (8.8 + r * 0.9), 0.4 + r * 0.45, 3); scene.add(step);
    for (let i = 0; i < 9; i++) { const f = mesh(new THREE.SphereGeometry(0.22, 12, 10), colors[(i + r) % colors.length]); f.position.set(sd * (8.8 + r * 0.9), 0.8 + r * 0.45, -1 + i * 1.0); f.userData.bob = Math.random() * 6; scene.add(f); scene.userData.fans.push(f); }
  } });
  for (let i = 0; i < 6; i++) scene.add(cloud(-50 + i * 20, 16 + (i % 3) * 3, -80, 4));
}

export default {
  id: "basket", title: "농구", icon: "🏀", sec: 60, cursor: "", cat: "sport", bg: "#ffb347", desc: "3점 슛 대회", scene3d: true,
  how: "두 손을 머리 위로 올리면 힘 막대가 움직여요. 초록 칸일 때 손을 위로 휙 튕기면 슛! 무지개 공은 2점",
  create(env) {
    const z = env.zone, v = env.view;
    const st = stage(env, { fov: 42, sky: ["#3fa3ef", "#dff3ff"], shadowSize: 14 });
    const { scene, camera } = st;
    court(scene);
    const two = env.mode === 2, slot = two ? env.slot : 0, other = 1 - slot;
    if (two && slot === 0) shared = { p: [null, null] };   // 새 경기마다 1P 화면이 먼저 만들어지며 새로 시작 (끝난 뒤 결과 글자에도 쓰려고 stop에서 지우지 않음)
    const SIDE = slot === 0 ? 1 : -1;    // 상대는 내 오른쪽(1P 화면) / 왼쪽(2P 화면)에 1.3m 떨어져 섬
    // 랙 5곳 × 공 5개 (마지막은 머니볼)
    const racks = SPOTS.map(a => {
      const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), base = spotPos(a, SPOT_R - 0.9).add(side.clone().multiplyScalar(-1.1));   // 내 캐릭터 왼쪽 앞 (오른쪽 아래 카메라 화면에 안 가리게)
      const g = new THREE.Group(); g.position.copy(base); g.rotation.y = a; scene.add(g);
      const stand = box(1.15, 0.06, 0.32, "#c0c6cf"); stand.position.y = 0.75; g.add(stand);
      [-0.5, 0.5].forEach(x => { const l = box(0.05, 0.75, 0.05, "#7a828c"); l.position.set(x, 0.375, 0); g.add(l); });
      const balls = [0, 1, 2, 3, 4].map(i => { const b = bball(i === 4); b.position.set(0.44 - i * 0.22, 0.75 + 0.03 + BR, 0); g.add(b); return b; });
      return { g, balls };
    });
    const me = playerAvatar(env); scene.add(me);
    const held = bball(false); scene.add(held); held.visible = false;
    const fly = bball(false); scene.add(fly); fly.visible = false;
    const shadow = mesh(new THREE.CircleGeometry(BR * 1.1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }), { cast: false }); shadow.rotation.x = -Math.PI / 2; scene.add(shadow); shadow.visible = false;

    let pts = 0, autoQ = null, finDone = false, finText = "", opp = null;
    let lastQ = 0, phase = "ready", setT = 0, stillT = 0, meter = 0, ball = null, rack = 1, idx = 0, waitT = 0.6, t = 0, made = 0, shots = 0, swish = 0, net = 0, flickT = 9, cheer = 0;
    const halfW = 0.07 * env.diff.reach, inW = 0.15 * env.diff.reach, period = 1.5 / env.diff.speed;
    const spotA = () => SPOTS[(rack - 1) % SPOTS.length];
    function body() {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return null;
      return { sy: (p[11].y + p[12].y) / 2, sw: Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1 };
    }
    function setHeld() { const money = idx === 4; held.material = ballMat(money); held.userData.money = money; }
    setHeld();
    function shoot(q) {
      const d = q - SWEET, res = Math.abs(d) <= halfW ? "swish" : Math.abs(d) <= inW ? "rim" : d < 0 ? "short" : "long";
      const money = idx === 4, a = spotA(), toward = spotPos(a).normalize().negate();   // 골대 쪽
      const from = held.position.clone();
      // 결과에 따라 공이 닿는 곳: 깨끗하게(가운데) · 림(살짝 옆) · 짧음(앞 림) · 김(백보드)
      const side = new THREE.Vector3(toward.z, 0, -toward.x);
      let to = RIM.clone().add(new THREE.Vector3(0, 0.05, 0));
      if (res === "rim") to.add(side.clone().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 0.16));
      if (res === "short") to.add(toward.clone().multiplyScalar(-0.3)).add(new THREE.Vector3(0, -0.05, 0));
      if (res === "long") to = new THREE.Vector3(side.x * 0.3 * (Math.random() - 0.5), 3.5, -0.32);
      fly.material = ballMat(money); fly.visible = true; held.visible = false;
      lastQ = q; ball = { t: 0, T: 1.0, from, to, res, money, vel: new THREE.Vector3(), done: false, after: 0, toward };
      shots++; phase = "fly"; flickT = 0; sfx.whoosh();
    }
    function score() {
      const b = ball, inn = b.res === "swish" || b.res === "rim", s = st.toScreen(RIM);
      if (inn) {
        made++; net = 1; cheer = 1.4; pts += (b.money ? 2 : 1) + (b.res === "swish" ? 1 : 0);
        env.award(b.money ? 2 : 1, s.x, s.y - v.U * 0.08);
        if (b.res === "swish") { swish++; env.award(1, s.x + v.U * 0.1, s.y - v.U * 0.02); popup(s.x, s.y + v.U * 0.12, "깨끗하게!", { size: v.U * 0.05, color: "#fff", stroke: "#e0306a" }); sfx.fever(); }
        else { popup(s.x, s.y + v.U * 0.12, "들어갔다!", { size: v.U * 0.045, color: "#fff", stroke: "#2fb65a" }); sfx.catch(env.player.combo); }
        burst(s.x, s.y + v.U * 0.03, { n: 24, colors: ["#ff9f1c", "#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.6, size: v.U * 0.016 });
        b.vel.set(0, -1.5, 0);
        if (b.res === "rim") b.vel.add(new THREE.Vector3(0, 1.2, 0));
      } else {
        sfx.bonk(); env.miss(s.x, s.y + v.U * 0.15, b.res === "short" ? "조금 짧아요" : "조금 길어요");
        // 앞 림·백보드에 맞고 내 쪽으로 튕겨 나옴
        b.vel.copy(b.toward).multiplyScalar(b.res === "short" ? -1.5 : -2.4).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, b.res === "short" ? 2.4 : 1.4, 0));
      }
      b.done = true; b.after = 0;
    }
    function placeMe() {
      const a = spotA(), p = spotPos(a);
      me.position.copy(p); me.rotation.y = a + Math.PI;
      return { a, p };
    }
    // 내 상태 공개 (상대 화면이 그대로 그림)
    if (two) shared.p[slot] = { name: env.name, color: env.color, get pts() { return pts; }, get made() { return made; }, get shots() { return shots; }, get rack() { return rack; }, get idx() { return idx; },
      get phase() { return phase; }, get flickT() { return flickT; }, get fly() { return fly.visible ? fly.position : null; }, get money() { return !!(ball && ball.money); }, get pose() { return env.tracker.pts; } };
    // 상대: 같은 골대에 슛. 자기 랙 자리에서 내 옆(SIDE)으로 비켜 서서 보임
    function syncOpp(dt) {
      const O = two && shared.p[other]; if (!O) return;
      if (!opp) {
        const av = avatar({ shirt: O.color || "#3b5bdb", pants: "#2b3a67", girl: /엄마|연제/.test(O.name || "") }); scene.add(av);
        const hb = bball(false), fb = bball(false); scene.add(hb, fb);
        const tag = textBoard(1.3, 0.3, { bg: "rgba(0,0,0,.55)" }); tag.set(O.name || "상대"); scene.add(tag);
        opp = { av, hb, fb, tag };
      }
      const a = SPOTS[(O.rack - 1) % SPOTS.length], tan = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), off = tan.multiplyScalar(1.3 * SIDE);
      const base = spotPos(a).add(off), { av, hb, fb, tag } = opp;
      av.position.copy(base); av.rotation.y = a + Math.PI;
      if (O.flickT < 0.45) { av.arm(0, 2.9, 0.4, 0.1); av.arm(1, 2.9, 0.4, 0.1); }
      else if (O.phase === "set") { av.arm(0, 2.7, 0.3, 1.4); av.arm(1, 2.7, 0.3, 1.4); }
      else av.mimic(O.pose, true);
      av.idle(t + 1.3);
      tag.position.copy(base).add(new THREE.Vector3(0, 2.25, 0)); tag.lookAt(camera.position);
      hb.visible = O.phase !== "fly";
      if (hb.visible) { av.updateMatrixWorld(true); hb.position.copy(av.handWorld(0).add(av.handWorld(1)).multiplyScalar(0.5)); }
      const F = O.fly; fb.visible = !!F;
      if (F) { const k = Math.min(1, F.distanceTo(RIM) / SPOT_R); fb.position.copy(F).add(off.clone().multiplyScalar(k)); fb.rotation.x -= dt * 8; }   // 골대 가까이 갈수록 옆으로 비킨 만큼을 줄여 골대로 들어감
    }
    // 게임 끝: 점수가 높은 쪽 승리 보너스
    function finish() {
      if (!two || finDone || env.progress() < 0.985) return;
      finDone = true; const O = shared.p[other], th = O ? O.pts : 0;
      if (pts > th) { finText = `🏆 ${env.name} 승리!`; env.award(10, z.cx, v.H * 0.4); sfx.fanfare(); }
      else if (pts === th) finText = "무승부!"; else finText = `${O.name} 승리! 다음엔 이겨요`;
    }
    return {
      update(dt) {
        t += dt; net = Math.max(0, net - dt * 1.5); flickT += dt; cheer = Math.max(0, cheer - dt);
        const b = body(), hs = env.tracker.hands.filter(h => h.vis);
        if (AUTO && phase === "ready" && waitT <= 0) { phase = "set"; setT = 0; stillT = 0.2; meter = 0; autoQ = null; }   // 점검용: 저절로 슛 준비
        if (AUTO && phase === "set") {
          if (autoQ == null) autoQ = Math.random() < 0.75 ? SWEET + (Math.random() - 0.5) * 0.08 : Math.random();
          setT += dt; meter = 0.5 - 0.5 * Math.cos(Math.PI * 2 * setT / period);
          if (setT > 0.25 && Math.abs(meter - autoQ) < 0.04) shoot(meter); else if (setT > 3.2) shoot(meter);
        } else if (phase === "ready") {
          waitT -= dt;
          if (waitT <= 0 && b && hs.length && hs.every(h => h.y < b.sy - b.sw * 0.5)) { phase = "set"; setT = 0; stillT = 0; meter = 0; }   // 두 손을 머리 위로
        } else if (phase === "set") {
          const sp = hs.length ? Math.max(...hs.map(h => h.bodySpeed)) : 0;
          if (sp < 1.0) stillT += dt;                                    // 손을 들어 올리는 동작은 슛이 아님: 잠깐 멈춘 뒤부터 힘 막대가 움직임
          if (stillT > 0.15) setT += dt;
          meter = 0.5 - 0.5 * Math.cos(Math.PI * 2 * setT / period);
          const up = hs.length && hs.reduce((s, h) => s + h.vy, 0) / hs.length < 0 && sp > FLICK * env.diff.punch;
          if (setT > 0 && up) shoot(meter);
          else if (setT > 3.2) shoot(meter);                                                            // 너무 오래 들고 있으면 그냥 던짐
          else if (b && hs.length && hs.every(h => h.y > b.sy + b.sw * 0.3)) phase = "ready";           // 손을 내리면 취소
        } else if (phase === "fly") {
          ball.t += dt;
          if (!ball.done) {
            const k = Math.min(1, ball.t / ball.T);
            fly.position.copy(arc(ball.from, ball.to, 1.6, k)); fly.rotation.x -= dt * 8;
            if (ball.t >= ball.T) score();
          } else {
            ball.after += dt; ball.vel.y -= 9.8 * dt; fly.position.addScaledVector(ball.vel, dt); fly.rotation.x -= dt * 5;
            if (fly.position.y < BR && ball.vel.y < 0) { fly.position.y = BR; ball.vel.y *= -0.55; ball.vel.x *= 0.8; ball.vel.z *= 0.8; }
            if (ball.after > 1.0) {
              ball = null; fly.visible = false; phase = "ready"; waitT = 0.5;
              racks[(rack - 1) % 5].balls[idx].visible = false;
              idx++; if (idx >= 5) { idx = 0; rack++; if ((rack - 1) % 5 === 0) racks.forEach(r => r.balls.forEach(x => { x.visible = true; })); }
              setHeld();
            }
          }
        }
        // 캐릭터: 현재 랙 자리에서 골대를 봄. 선수 자세를 따라 하고, 슛하면 손을 위로 뻗음
        placeMe();
        if (flickT < 0.45) { me.arm(0, 2.9, 0.4, 0.1); me.arm(1, 2.9, 0.4, 0.1); }
        else if (phase === "set") { me.arm(0, 2.7, 0.3, 1.4); me.arm(1, 2.7, 0.3, 1.4); }
        else me.mimic(env.tracker.pts, true);
        me.idle(t);
        held.visible = phase !== "fly";
        if (held.visible) {
          me.updateMatrixWorld(true);
          const h0 = me.handWorld(0), h1 = me.handWorld(1), fwd = spotPos(spotA()).normalize().multiplyScalar(-0.12);
          held.position.copy(h0.add(h1).multiplyScalar(0.5)).add(fwd).add(new THREE.Vector3(0, phase === "set" ? 0.08 : 0, 0));
        }
        racks[(rack - 1) % 5].balls.forEach((x, i) => { if (i === idx && phase !== "fly") x.visible = false; });
        const nt = scene.userData.net; nt.scale.set(1 - net * 0.15, 1 + Math.sin(net * 18) * net * 0.25, 1 - net * 0.15);
        scene.userData.fans.forEach(f => { f.position.y += Math.sin(t * (cheer ? 14 : 3) + f.userData.bob) * dt * (cheer ? 1.2 : 0.12); });
        scene.userData.sea.update(t);
        shadow.visible = fly.visible; if (fly.visible) shadow.position.set(fly.position.x, 0.06, fly.position.z);
        syncOpp(dt); finish();
      },
      draw(ctx) {
        // 카메라: 내 캐릭터 뒤 오른쪽 위에서 골대를 봄
        const a = spotA(), out = spotPos(a).normalize(), side = new THREE.Vector3(out.z, 0, -out.x);
        const cp = spotPos(a, SPOT_R + (two ? 4.8 : 3.9)).add(side.multiplyScalar(two ? 0.6 * SIDE : -0.7)); cp.y = two ? 3.1 : 2.75;   // 2인: 옆의 상대도 보이게
        camera.position.copy(cp); camera.lookAt(0, 2.2, 0);
        st.draw(ctx);
        const U = v.U;
        // 힘 막대 (왼쪽: 오른쪽 아래 카메라 화면을 피함)
        const mx = z.x0 + Math.max(U * 0.06, z.w * 0.07), my = v.H * 0.3, mh = v.H * 0.42, mw = Math.max(14, U * 0.032);
        ctx.fillStyle = "rgba(0,0,0,.5)"; rr(ctx, mx - mw / 2, my, mw, mh, mw / 2); ctx.fill();
        ctx.fillStyle = "rgba(255,212,0,.6)"; ctx.fillRect(mx - mw / 2, my + mh * (1 - SWEET - inW), mw, mh * inW * 2);
        ctx.fillStyle = "#37d67a"; ctx.fillRect(mx - mw / 2, my + mh * (1 - SWEET - halfW), mw, mh * halfW * 2);
        if (phase === "set" && setT > 0) { const yy = my + mh * (1 - meter); ctx.fillStyle = "#fff"; ctx.fillRect(mx - mw, yy - 3, mw * 2, 6); }
        // 2인 점수판: 두 사람 점수 · 랙 진행(머니볼까지 누가 먼저)
        if (two) {
          const P = [shared.p[0], shared.p[1]], bw2 = Math.min(z.w * 0.94, U * 0.8), bx2 = z.cx - bw2 / 2, by2 = v.H * 0.1, bh2 = U * 0.1;
          ctx.fillStyle = "rgba(120,50,0,.85)"; rr(ctx, bx2, by2, bw2, bh2, U * 0.02); ctx.fill();
          const fs = Math.min(U * 0.034, z.w / 20);
          P.forEach((p, r) => {
            const cx2 = bx2 + bw2 * (r ? 0.75 : 0.25), Q = P[1 - r], lead = p && Q && p.pts > Q.pts;
            outlinedText(ctx, `${r + 1}P ${p ? p.name : ""} ${p ? p.pts : 0}점${lead ? " 👑" : ""}`, cx2, by2 + bh2 * 0.35, fs, "#fff", p ? p.color : "#555", 3);
            outlinedText(ctx, p ? `랙 ${p.rack} · ${p.idx + 1}번째 공 ${p.idx === 4 ? "🌈" : ""}` : "", cx2, by2 + bh2 * 0.75, fs * 0.8, "#ffe8c0", "#4a1d00", 2);
          });
          outlinedText(ctx, ":", z.cx, by2 + bh2 * 0.35, fs, "#fff", "#4a1d00", 2);
          if (finDone) outlinedText(ctx, finText, z.cx, v.H * 0.45, Math.min(U * 0.08, z.w / 9), "#ffe14d", "#7a3000", 6);
          else if (phase === "ready") outlinedText(ctx, idx === 4 ? "머니볼! 두 손을 머리 위로!" : "두 손을 머리 위로!", z.cx, v.H * 0.8, Math.min(U * 0.045, z.w / 12), "#fff", "#c05000");
          else if (phase === "set") outlinedText(ctx, "초록 칸에서 위로 휙!", z.cx, v.H * 0.8, Math.min(U * 0.045, z.w / 12), "#fff", "#1d8f47");
          return;
        }
        // 점수판: 랙 · 성공 · 남은 공 (머니볼은 무지개)
        const bw = Math.min(z.w * 0.86, U * 0.72), bx = z.cx - bw / 2, by = v.H * 0.11, bh = U * 0.075;
        ctx.fillStyle = "rgba(120,50,0,.82)"; rr(ctx, bx, by, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, `랙 ${rack} · 성공 ${made}/${shots}`, bx + bw * 0.3, by + bh / 2, Math.min(U * 0.034, z.w / 18), "#fff", "#4a1d00", 3);
        for (let i = 0; i < 5; i++) {
          const x = bx + bw * 0.62 + i * Math.min(U * 0.05, bw * 0.075), y = by + bh / 2, r = Math.min(U * 0.018, bw * 0.03);
          ctx.globalAlpha = i < idx ? 0.25 : 1;
          ctx.fillStyle = i === 4 ? `hsl(${(t * 200) % 360},90%,60%)` : "#e8711c"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#2a1205"; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (phase === "ready") outlinedText(ctx, idx === 4 ? "머니볼! 두 손을 머리 위로!" : "두 손을 머리 위로!", z.cx, v.H * 0.8, Math.min(U * 0.045, z.w / 12), "#fff", "#c05000");
        else if (phase === "set") outlinedText(ctx, "초록 칸에서 위로 휙!", z.cx, v.H * 0.8, Math.min(U * 0.045, z.w / 12), "#fff", "#1d8f47");
      },
      stop() { st.dispose(); },
      result: () => `${shots}개 중 ${made}개 성공 · 깨끗한 슛 ${swish}` + (two && shared && shared.p[other] ? ` · 대결 ${pts}:${shared.p[other].pts}` : ""),
      // 설명 시연용
      get phase() { return phase; },
      get meter() { return meter; },
      get lastQ() { return lastQ; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "open"; }); p.active = -1;
      if (T < 4) say("농구! 두 손을 머리 위로 올리면 슛 준비");
      else if (T < 9) say("힘 막대가 초록 칸일 때 위로 휙 튕겨요");
      else if (T < 14) say("마지막 무지개 공은 2점!");
      else say("이제 직접 해 봐요!");
      if (g.phase !== S.lastPh) { S.lastPh = g.phase; S.flick = false; S.lastM = 0; }   // 새 슛마다 처음부터
      if (g.phase === "set") {
        if (!S.flick && g.meter > 0.74 && g.meter < 0.84 && S.lastM < g.meter) S.flick = true;
        S.lastM = g.meter;
        const k = S.flick ? "up" : "head"; p.rest(0, k, S.flick ? 5 : 2); p.rest(1, k, S.flick ? 5 : 2);
        return;
      }
      if (g.phase === "ready") { p.rest(0, "head", 2); p.rest(1, "head", 2); return; }
      p.rest(0, "up", 2); p.rest(1, "up", 2);
    },
  },
};
