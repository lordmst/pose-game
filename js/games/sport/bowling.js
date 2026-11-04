// 볼링 (스포츠 리조트처럼 3D 실내 레인): 내 캐릭터 뒤에서 레인을 봄. 공 든 손을 허리 아래로 내렸다가 앞(위)으로 빠르게 휘두르면 공이 굴러감
// 조준 = 내 몸의 좌우 위치(옆으로 걸어서 맞춤), 휘두를 때 손이 옆으로 쏠리면 공이 휘어짐(커브). 굴러가는 공을 카메라가 따라감
// 던지기 전에 추천 자리(1구: 1·3번 핀 사이, 2구: 남은 핀 쪽)를 점선으로 안내. 안내일 뿐이라 어디서 던져도 됨
// 2인: 같은 볼링장의 바로 옆 레인에서 상대가 동시에 침(상대 캐릭터·공·핀이 실시간으로 보임). 위쪽 점수표는 두 줄(1P·2P), 프레임마다 이긴 쪽 표시
import { burst, popup, shake, outlinedText, rr, clamp, FONT } from "../../fx.js?v=62";
import { sfx } from "../../audio.js?v=62";
import { stage, THREE, box, ball as sphere, mesh, mat, cyl, avatar, playerAvatar, textBoard, bodyMover, moveGuide, moveText } from "./kit3d.js?v=62";

const AUTO = /simauto=1/.test(typeof location !== "undefined" ? location.search : "");   // 점검용: 가상 선수가 저절로 조준하고 던짐
// 2인 대결: 두 화면이 서로의 상태를 공개(pub)하고, 상대 레인을 그 상태대로 그림. 각자 자기 공·핀은 자기 화면이 계산
let shared = null;

const LANE_LEN = 18;            // 레인 길이(레인 좌표, 레인 폭 = 2)
const PIN_R = 0.12, BALL_R = 0.21;
const SWING = 2.0;              // 휘두르기로 인정하는 손 속도(어깨너비/초)
const LW = 0.53;                // 레인 좌표 1 = 0.53m (레인 폭 1.06m)
const AIM_MAX = 0.85, AIM_SPAN = 0.238;   // 조준 범위(레인 좌표)·몸을 구역 너비의 이 비율만큼 옮기면 끝까지
const AIM_OK = 0.28;            // 추천 자리에서 이만큼(레인 좌표, 약 15cm) 안이면 초록
const POCKET = 0.15;            // 1구 추천 자리: 1번과 3번 핀 사이(포켓)
const GUIDE_S = 0.35;           // 이동 안내 크기(코트용 점선 도구를 레인 크기로 줄임)
// 핀 10개: 1번 핀이 앞, 4줄 삼각형
const PINS = []; for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) PINS.push({ x: (i - r / 2) * 0.58, y: 15.6 + r * 0.52 });
const wx = x => x * LW, wz = y => -y * LW * 1.9;   // 레인 좌표 → 3D (길이 방향은 실제 레인처럼 18m 남짓)

// 나뭇결 레인 무늬
function woodTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 512;
  const g = c.getContext("2d");
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#e0b073" : "#d6a264"; g.fillRect(i * 16, 0, 16, 512); g.fillStyle = "rgba(120,70,20,.12)"; for (let k = 0; k < 6; k++) g.fillRect(i * 16 + Math.random() * 14, Math.random() * 512, 1, 40 + Math.random() * 80); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6); return t;
}
// 볼링 핀: 돌림체 + 빨간 줄 두 개
function pinMesh(cast = true) {
  const prof = [[0, 0], [0.026, 0], [0.04, 0.03], [0.06, 0.1], [0.062, 0.14], [0.05, 0.2], [0.025, 0.26], [0.022, 0.29], [0.034, 0.33], [0.032, 0.37], [0.018, 0.39], [0, 0.395]].map(([x, y]) => new THREE.Vector2(x * 1.25, y * 1.25));
  const g = new THREE.Group();
  const body = mesh(new THREE.LatheGeometry(prof, cast ? 18 : 10), "#fbfbf6", { rough: 0.25, cast }); g.add(body);
  [0.3, 0.325].forEach(y => { const r = mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.012, 16), "#e03131", { cast: false }); r.position.y = y * 1.25; g.add(r); });
  return g;
}
function arrowShape(color) {
  const s = new THREE.Shape(); s.moveTo(0, 0.09); s.lineTo(-0.035, -0.04); s.lineTo(0.035, -0.04); s.lineTo(0, 0.09);
  const m = mesh(new THREE.ShapeGeometry(s), color, { cast: false }); m.rotation.x = -Math.PI / 2; return m;
}
function hall(scene, oppN = 0) {
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.38, metalness: 0.05 });
  const len = -wz(LANE_LEN + 1.5);
  // 내 레인 + 양옆 레인들 (도랑 포함)
  for (let n = -3; n <= 3; n++) {
    const ox = n * 1.9;
    const lane = mesh(new THREE.BoxGeometry(1.06, 0.06, len + 2), wood, { receive: true, cast: false }); lane.position.set(ox, -0.03, -len / 2 + 1); scene.add(lane);
    [-1, 1].forEach(s => {
      const gut = mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 12, 1, true, 0, Math.PI), "#4a4f5c", { cast: false, receive: true });
      gut.material = new THREE.MeshStandardMaterial({ color: "#4a4f5c", side: THREE.DoubleSide, roughness: 0.4, metalness: 0.4 });
      gut.rotation.set(Math.PI / 2, 0, Math.PI); gut.position.set(ox + s * 0.65, 0.0, -len / 2); scene.add(gut);
      const cap = box(0.14, 0.08, len + 2, "#2d3142", { receive: true }); cap.position.set(ox + s * 0.84, 0.0, -len / 2 + 1); scene.add(cap);
    });
    // 핀 뒤 검은 벽 + 레인 번호 판
    const back = box(1.7, 1.2, 0.2, "#151826"); back.position.set(ox, 0.6, -len - 0.6); scene.add(back);
    const hood = box(1.9, 0.5, 1.6, n === 0 ? "#ff6b9d" : n === oppN ? "#ffd43b" : n % 2 ? "#4dabf7" : "#845ef7", { glow: n === 0 ? "#40102a" : n === oppN ? "#403000" : "#0a1830" }); hood.position.set(ox, 1.45, -len + 0.2); scene.add(hood);
    if (n !== 0 && n !== oppN) {   // 옆 레인 핀(가만히 서 있음). 상대 레인은 상대 상태대로 따로 그림
      PINS.forEach(p => { const m = pinMesh(false); m.position.set(ox + wx(p.x), 0, wz(p.y)); scene.add(m); });
    }
  }
  // 화살표·점 표시
  [-3, -2, -1, 0, 1, 2, 3].forEach(i => { const a = arrowShape("#6b3a12"); a.position.set(wx(i * 0.26), 0.005, wz(5 + Math.abs(i) * 0.35)); scene.add(a); const d = mesh(new THREE.CircleGeometry(0.018, 10), "#6b3a12", { cast: false }); d.rotation.x = -Math.PI / 2; d.position.set(wx(i * 0.26), 0.005, wz(2.2)); scene.add(d); });
  // 파울 라인
  const foul = box(1.06, 0.005, 0.03, "#222", { cast: false }); foul.position.set(0, 0.003, wz(0.3)); scene.add(foul);
  // 바닥(어프로치)·천장·벽·간판
  const floor = box(16, 0.05, 6, "#e9d7b8", { receive: true, cast: false }); floor.position.set(0, -0.04, 3); scene.add(floor);
  const carpet = box(30, 0.04, 30, "#2b2357", { receive: true, cast: false }); carpet.position.set(0, -0.07, 14); scene.add(carpet);
  const ceil = box(16, 0.2, len + 10, "#1c1838", { cast: false }); ceil.position.set(0, 4.2, -len / 2); scene.add(ceil);
  for (let i = 0; i < 6; i++) { const l = box(12, 0.05, 0.3, "#fff6d0", { glow: "#fff2b0", cast: false }); l.position.set(0, 4.05, 2 - i * 4); scene.add(l); }
  const wall = box(16, 3, 0.3, "#2a2a5e"); wall.position.set(0, 2.6, -len - 1.2); scene.add(wall);
  const sign = textBoard(5, 0.9, { bg: "rgba(255,80,150,.95)" }); sign.set("RESORT BOWL"); sign.position.set(0, 3.3, -len - 1.0); scene.add(sign);
  [-1, 1].forEach(s => { const w = box(0.3, 4.4, len + 12, "#3b2f74"); w.position.set(s * 7.5, 2, -len / 2); scene.add(w); });
  // 내 레인 위 화면(점수 모니터 대신 장식 조명)
  for (let i = 0; i < 12; i++) { const b = sphere(0.06, ["#ff6b6b", "#ffd43b", "#69db7c", "#74c0fc"][i % 4], { glow: ["#802020", "#806010", "#206030", "#204060"][i % 4], cast: false }); b.position.set(-3 + i * 0.55, 3.75, -len - 0.95); scene.add(b); }
}

export default {
  id: "bowling", title: "볼링", icon: "🎳", sec: 60, cursor: "", cat: "sport", bg: "#f6d365", desc: "공 굴려 핀 쓰러뜨리기", scene3d: true,
  how: "공 든 손을 허리 아래로 내렸다가 앞으로 쭉 휘둘러 굴려요. 옆으로 걸어서 조준! 점선 자리가 추천 자리예요. 휘두를 때 손이 옆으로 가면 공이 휘어요",
  create(env) {
    const z = env.zone, v = env.view;
    const st = stage(env, { fov: 50, sky: ["#1c1838", "#2b2357"], shadowSize: 6 });
    const { scene, camera, sun, hemi } = st;
    hemi.intensity = 1.3; sun.intensity = 1.2; sun.position.set(3, 9, 4); sun.target.position.set(0, 0, -6);
    // 2인: 상대 레인은 내 레인 바로 옆 (1P 화면에선 오른쪽, 2P 화면에선 왼쪽)
    const two = env.mode === 2, slot = two ? env.slot : 0, other = 1 - slot, oppN = two ? (slot === 0 ? 1 : -1) : 0, OX = oppN * 1.9;
    if (two && slot === 0) shared = { p: [null, null] };   // 새 경기마다 1P 화면이 먼저 만들어지며 새로 시작 (끝난 뒤 결과 글자에도 쓰려고 stop에서 지우지 않음)
    hall(scene, oppN);
    const me = playerAvatar(env); me.scale.setScalar(1.0); me.rotation.y = Math.PI; scene.add(me);
    // 공 (손가락 구멍 3개)
    const bmesh = new THREE.Group(), core = sphere(0.11, env.color || "#3b5bdb", { rough: 0.12, metal: 0.25 }); bmesh.add(core);
    [[0, 0.06, 0.09], [-0.03, 0.09, 0.05], [0.03, 0.09, 0.05]].forEach(([x, y, zz]) => { const h = sphere(0.016, "#111", { cast: false }); h.position.set(x, y, zz); bmesh.add(h); });
    scene.add(bmesh);
    const pinObjs = PINS.map(() => { const m = pinMesh(); scene.add(m); return m; });
    // 조준선
    const aimGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const aimLine = new THREE.Line(aimGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.75 })); scene.add(aimLine);
    // 추천 자리 안내: 레인 크기에 맞게 줄인 무리 안에 점선 도구를 둠
    const guideG = new THREE.Group(); guideG.scale.setScalar(GUIDE_S); scene.add(guideG);
    const guide = moveGuide(guideG), mover = bodyMover(env, AIM_MAX, AIM_SPAN);
    const GUIDE_Z = 0.35;           // 파울 라인 바로 앞(어프로치) 바닥

    let phase = "aim", ball = null, pins = [], frame = 1, roll = 1, settleT = 0, aimX = 0, lowT = -9, t = 0;
    let total = 0, strikes = 0, spares = 0, frameDown = 0, lastRelease = -9, swingT = 9, camZ = 3.4;
    const frames = [];       // 프레임 기록 [{a, b, mark}]
    let autoT = 0, finDone = false, finText = "";
    // 내 상태 공개 (상대 화면이 내 레인을 그대로 그림)
    if (two) shared.p[slot] = { name: env.name, color: env.color, get aimX() { return aimX; }, get phase() { return phase; }, get ball() { return ball; }, get pins() { return pins; },
      get frames() { return frames; }, get total() { return total; }, get frame() { return frame; }, get roll() { return roll; }, get swingT() { return swingT; }, get pts() { return env.tracker.pts; } };
    // 상대 레인 물건 (상대가 화면에 들어오면 만듦)
    let opp = null;
    function makeOpp(O) {
      const av = avatar({ shirt: O.color || "#3b5bdb", pants: "#2b3a67", girl: /엄마|연제/.test(O.name || "") }); av.scale.setScalar(1.15); av.rotation.y = Math.PI; scene.add(av);
      const ob = sphere(0.11, O.color || "#3b5bdb", { rough: 0.12, metal: 0.25 }); scene.add(ob);
      const op = PINS.map(() => { const m = pinMesh(false); scene.add(m); return m; });
      const tag = textBoard(1.4, 0.32, { bg: "rgba(0,0,0,.55)" }); tag.set(O.name || "상대"); scene.add(tag);
      return { av, ob, op, tag };
    }
    function syncOpp(dt) {
      const O = two && shared.p[other]; if (!O) return;
      if (!opp) opp = makeOpp(O);
      const { av, ob, op, tag } = opp;
      av.position.set(OX + wx(O.aimX), 0, 1.2);
      if (O.swingT < 0.7) { const u = Math.min(1, O.swingT / 0.3); av.arm(1, 0.1, -0.9 + 2.2 * u, 0.1); av.body.rotation.x = 0.35 * Math.sin(u * Math.PI); }
      else { av.body.rotation.x = 0; av.mimic(O.pts, true); if (O.phase === "aim") av.arm(1, 0.12, 0.25, 0.9); }
      av.idle(t + 1);
      tag.position.set(OX + wx(O.aimX), 2.35, 1.2); tag.lookAt(camera.position);
      const B = O.ball;
      if (B) { ob.visible = true; ob.position.set(OX + wx(B.x), 0.11 + (B.gutter ? -0.05 : 0), wz(B.y)); ob.rotation.x -= B.vy * dt * 3.2; }
      else if (O.phase === "aim") { av.updateMatrixWorld(true); ob.visible = true; ob.position.copy(av.handWorld(1)).add(new THREE.Vector3(0, -0.03, -0.08)); }
      else ob.visible = false;
      O.pins.forEach((p, i) => {
        const m = op[i]; m.visible = !p.gone; if (p.gone) return;
        m.position.set(OX + wx(p.x), p.down ? 0.06 * Math.sin(p.tilt) : 0, wz(p.y));
        m.rotation.set(0, 0, 0); m.rotateY(-p.head); m.rotateX(-p.tilt);
      });
    }
    // 게임 끝: 더 많이 쓰러뜨린 쪽이 승리 보너스
    function finish() {
      if (!two || finDone || env.progress() < 0.985) return;
      finDone = true; const O = shared.p[other], mine = total, theirs = O ? O.total : 0;
      if (mine > theirs) { finText = `🏆 ${env.name} 승리!`; env.award(10, z.cx, v.H * 0.4); sfx.fanfare(); }
      else if (mine === theirs) finText = "무승부!";
      else finText = `${O.name} 승리! 다음엔 이겨요`;
    }
    const resetPins = () => { pins = PINS.map(p => ({ ...p, vx: 0, vy: 0, down: false, gone: false, tilt: 0, head: 0, spinR: 0 })); };
    resetPins();
    function body() {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return null;
      const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1;
      const hipY = p[23].v && p[24].v ? (p[23].y + p[24].y) / 2 : (p[11].y + p[12].y) / 2 + sw * 1.7;
      return { x: (p[11].x + p[12].x) / 2, sy: (p[11].y + p[12].y) / 2, hipY, sw };
    }
    function release(h, b) {
      const sp = Math.min(h.bodySpeed, 14);
      ball = { x: aimX, y: 0.6, vy: 8 + sp * 0.75, spin: clamp(h.vx / (b.sw || 1) * 0.035, -0.9, 0.9), gutter: false, rot: 0 };
      phase = "roll"; settleT = 0; lastRelease = t; swingT = 0; sfx.whoosh();
    }
    function knock(pin, dx, dy, power) {
      if (pin.down) return;
      const d = Math.hypot(dx, dy) || 1;
      pin.down = true; pin.vx = dx / d * power + (Math.random() - 0.5) * 0.8; pin.vy = dy / d * power + 1.2; pin.spinR = (Math.random() - 0.5) * 12;
      sfx.hit(1);
    }
    // 추천 자리(레인 좌표): 1구는 포켓, 2구는 남은 핀 중 맨 앞 핀과 남은 핀 가운데의 중간
    function recommend() {
      const up = pins.filter(p => !p.down);
      if (!up.length || up.length === 10) return POCKET;
      const fy = Math.min(...up.map(p => p.y)), front = up.filter(p => p.y - fy < 0.1);
      const fx = front.reduce((a, p) => a + p.x, 0) / front.length, cx = up.reduce((a, p) => a + p.x, 0) / up.length;
      return clamp((fx + cx) / 2, -AIM_MAX, AIM_MAX);
    }
    const aimOk = () => Math.abs(aimX - recommend()) <= AIM_OK;
    function pinScreen() { return st.toScreen(new THREE.Vector3(0, 0.4, wz(16.2))); }
    function endRoll() {
      const downNow = pins.filter(p => p.down && !p.gone).length, standing = pins.filter(p => !p.down).length;
      const P = pinScreen();
      frameDown += downNow; total += downNow;
      if (roll === 1) frames.push({ a: downNow, b: null, mark: "" }); else frames[frames.length - 1].b = downNow;
      const F = frames[frames.length - 1];
      if (downNow) env.award(downNow, P.x, P.y - v.U * 0.05);
      if (standing === 0 && roll === 1) {
        strikes++; F.mark = "X"; env.award(5, P.x, P.y - v.U * 0.12); sfx.fanfare(); shake(v.U * 0.02, 0.4);
        popup(z.cx, v.H * 0.42, "STRIKE!", { size: Math.min(v.U * 0.13, z.w / 6), color: "#ffe14d", stroke: "#e0306a", life: 1.8 });
        burst(z.cx, v.H * 0.42, { n: 50, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 1.2, gravity: v.U, size: v.U * 0.018 });
      } else if (standing === 0) {
        spares++; F.mark = "/"; env.award(3, P.x, P.y - v.U * 0.12); sfx.fever();
        popup(z.cx, v.H * 0.42, "SPARE!", { size: Math.min(v.U * 0.11, z.w / 7), color: "#fff", stroke: "#2f8bff", life: 1.5 });
      } else if (downNow === 0) { env.miss(P.x, P.y, ball && ball.gutter ? "거터!" : "아깝다!"); }
      else popup(z.cx, v.H * 0.42, `${downNow}개!`, { size: v.U * 0.07, color: "#fff", stroke: "#8a5a00", life: 1.0 });
      pins.forEach(p => { if (p.down) p.gone = true; });
      if (roll === 1 && standing > 0) roll = 2;
      else { frame++; roll = 1; frameDown = 0; resetPins(); }
      ball = null; phase = "aim";
    }
    function syncScene(dt) {
      // 캐릭터: 조준 위치에 서서, 던질 땐 팔을 앞으로 휘두름
      me.position.set(wx(aimX), 0, 1.2);
      if (swingT < 0.7) {
        const u = Math.min(1, swingT / 0.3);
        me.arm(1, 0.1, -0.9 + 2.2 * u, 0.1); me.body.rotation.x = 0.35 * Math.sin(u * Math.PI); me.leg(0, 0.5 * Math.sin(u * Math.PI));
      } else {
        me.body.rotation.x = 0; me.leg(0, 0); me.mimic(env.tracker.pts, true);
        if (phase === "aim") me.arm(1, 0.12, 0.25, 0.9);      // 공을 가슴 앞에 받쳐 듦
      }
      me.idle(t);
      // 공
      if (ball) {
        bmesh.position.set(wx(ball.x), 0.11 + (ball.gutter ? -0.05 : 0), wz(ball.y));
        bmesh.rotation.x -= ball.vy * dt * 3.2; bmesh.rotation.z = ball.spin * 0.6;
        bmesh.visible = true;
      } else if (phase === "aim") { me.updateMatrixWorld(true); bmesh.position.copy(me.handWorld(1)).add(new THREE.Vector3(0, -0.03, -0.08)); bmesh.visible = true; }
      else bmesh.visible = false;
      // 핀
      pins.forEach((p, i) => {
        const m = pinObjs[i]; m.visible = !p.gone;
        if (p.gone) return;
        if (p.down) { p.tilt = Math.min(Math.PI / 2, p.tilt + dt * 9); p.head = Math.atan2(p.vx, p.vy); }
        m.position.set(wx(p.x), p.down ? 0.06 * Math.sin(p.tilt) : 0, wz(p.y));
        m.rotation.set(0, 0, 0); m.rotateY(-p.head); m.rotateX(-p.tilt); m.rotateY(p.spinR * p.tilt * 0.05);
      });
      // 조준선
      aimLine.visible = phase === "aim";
      if (aimLine.visible) { const a = aimGeo.attributes.position; a.setXYZ(0, wx(aimX), 0.02, wz(0.9)); a.setXYZ(1, wx(aimX), 0.02, wz(15.2)); a.needsUpdate = true; aimLine.computeLineDistances(); }
      // 추천 자리 안내 (굴러가는 동안은 숨김)
      if (phase === "aim") {
        const rec = recommend(), ok = aimOk();
        guide.show(wx(aimX) / GUIDE_S, wx(rec) / GUIDE_S, GUIDE_Z / GUIDE_S, ok, t);
        st.pipMark = { x: mover.toScreenX(rec), ok };
      } else { guide.hide(); st.pipMark = null; }
    }
    // 2인 점수표: 두 줄(1P·2P) × 최근 5프레임 + 합계. 둘 다 끝낸 프레임은 이긴 쪽 칸을 초록으로
    const done = F => F && (F.mark === "X" || F.b != null);
    function drawVersus(ctx) {
      const U = v.U, P = [shared.p[0], shared.p[1]], n = 5;
      const nm = Math.min(U * 0.13, z.w * 0.2), cw = Math.min(U * 0.075, (z.w * 0.92 - nm) / (n + 1.4)), ch = cw * 0.72, w = nm + cw * n + cw * 1.4, x0 = z.cx - w / 2, y0 = v.H * 0.1;
      const maxF = Math.max(...P.map(p => (p ? p.frames.length : 0))), first = Math.max(0, maxF - n);
      ctx.fillStyle = "rgba(20,16,50,.88)"; rr(ctx, x0 - 6, y0 - 6, w + 12, ch * 2 + 16, U * 0.015); ctx.fill();
      P.forEach((p, r) => {
        const y = y0 + r * (ch + 4), Q = P[1 - r];
        ctx.fillStyle = p ? p.color : "#888"; ctx.fillRect(x0, y, nm - 4, ch);
        ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(ch * 0.42)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(`${r + 1}P ${p ? p.name : ""}`.slice(0, 7), x0 + (nm - 4) / 2, y + ch / 2);
        for (let i = 0; i < n; i++) {
          const k = first + i, F = p && p.frames[k], G = Q && Q.frames[k], x = x0 + nm + i * cw;
          const sum = H => (H ? (H.a || 0) + (H.b || 0) : 0), win = done(F) && done(G) && sum(F) > sum(G);
          ctx.fillStyle = win ? "#b9f6ca" : "#ffffff"; ctx.fillRect(x + 1, y, cw - 2, ch);
          if (r === 0) { ctx.fillStyle = "#999"; ctx.font = `${Math.round(ch * 0.26)}px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(String(k + 1), x + 3, y + 1); }
          if (!F) continue;
          const s1 = F.mark === "X" ? "X" : F.a === 0 ? "-" : String(F.a), s2 = F.mark === "/" ? "/" : F.b == null ? "" : F.b === 0 ? "-" : String(F.b);
          ctx.font = `bold ${Math.round(ch * 0.5)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillStyle = F.mark === "X" ? "#e0306a" : "#222"; ctx.fillText(s1, x + cw * 0.32, y + ch * 0.58);
          ctx.fillStyle = F.mark === "/" ? "#2f8bff" : "#222"; ctx.fillText(s2, x + cw * 0.7, y + ch * 0.58);
        }
        const lead = p && Q && p.total > Q.total;
        ctx.fillStyle = lead ? "#ffd43b" : "#e9ecef"; ctx.fillRect(x0 + nm + n * cw + 1, y, cw * 1.4 - 2, ch);
        ctx.fillStyle = "#222"; ctx.font = `bold ${Math.round(ch * 0.58)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(p ? p.total : 0), x0 + nm + n * cw + cw * 0.7, y + ch * 0.55);
      });
      // 앞서는 사람 · 이번 프레임
      const a = P[0] ? P[0].total : 0, b2 = P[1] ? P[1].total : 0, ly = y0 + ch * 2 + U * 0.04;
      const lt = a === b2 ? "동점!" : `${(a > b2 ? P[0] : P[1]).name} ${Math.abs(a - b2)}점 앞섬`;
      outlinedText(ctx, `${frame}프레임 · ${roll}구 · ${lt}`, z.cx, ly, Math.min(U * 0.03, z.w / 20), "#fff", "#2b2357", 3);
      if (phase === "aim" && !finDone) {
        const ok = aimOk(), mt = moveText(recommend() - aimX, ok, "좋아요! 추천 자리", 0.3);
        outlinedText(ctx, mt, z.cx, ly + U * 0.055, Math.min(U * 0.04, z.w / 13), "#fff", ok ? "#2f8f2f" : "#c07800", 4);
        const pw = Math.min(z.w * 0.2, U * 0.3), left = env.slot === 0, hx = left ? z.x0 + pw + (z.w - pw) / 2 : z.x0 + (z.w - pw) / 2;
        const txt = roll === 1 ? "손을 내렸다가 앞으로 쭉!" : "남은 핀을 노려요!";
        outlinedText(ctx, txt, hx, v.H * 0.88, Math.min(U * 0.04, (z.w - pw) / (txt.length * 0.95)), "#fff", "#8a2a5a", 4);
      }
      if (finDone) outlinedText(ctx, finText, z.cx, v.H * 0.45, Math.min(U * 0.08, z.w / 9), "#ffe14d", "#7a1a4a", 6);
    }
    return {
      update(dt) {
        t += dt; swingT += dt;
        const b = body(), hands = env.tracker.hands;
        if (phase === "aim") {
          if (b) aimX = mover.toCourt(b.x);                                 // 옆으로 걸어서 조준
          if (AUTO) {                                                        // 점검용: 추천 자리 근처로 가서 던짐
            autoT += dt; aimX = clamp(recommend() + (Math.random() - 0.5) * 0.02 + (slot ? 0.05 : -0.05), -AIM_MAX, AIM_MAX);
            if (autoT > 1.6 && t - lastRelease > 1) { autoT = 0; release({ bodySpeed: 7 + Math.random() * 5, vx: (Math.random() - 0.5) * 0.5 }, { sw: 1 }); }
          }
          if (b && t - lastRelease > 1) hands.forEach(h => {
            if (!h.vis || phase !== "aim") return;
            if (h.y > b.hipY - b.sw * 0.35) lowT = t;                       // 손을 허리 아래로 내림
            const rising = h.vy < 0 && h.y < b.hipY - b.sw * 0.9;           // 앞(위)으로 올라오는 중
            if (t - lowT < 1.5 && rising && h.bodySpeed > SWING * env.diff.punch) release(h, b);
          });
        } else if (phase === "roll") {
          settleT += dt;
          if (ball) {
            ball.y += ball.vy * dt; ball.rot += ball.vy * dt * 2;
            if (!ball.gutter) {
              ball.x += ball.spin * dt * (ball.y / LANE_LEN) * 2.2;         // 레인 끝으로 갈수록 휘어짐
              if (Math.abs(ball.x) > 1.02) { ball.gutter = true; ball.x = Math.sign(ball.x) * 1.22; sfx.thud(); }
              for (const p of pins) {
                if (p.down) continue;
                const dx = p.x - ball.x, dy = p.y - ball.y;
                if (Math.hypot(dx, dy) < PIN_R + BALL_R) { knock(p, dx, dy, ball.vy * 0.45); ball.vy *= 0.93; ball.x -= dx * 0.05; shake(v.U * 0.004, 0.1); }
              }
            }
            if (ball.y > LANE_LEN + 1) ball = null;
          }
          // 쓰러진 핀이 굴러가며 다른 핀을 넘어뜨림
          for (const p of pins) {
            if (!p.down || p.gone) continue;
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5;
            if (Math.abs(p.x) > 1.15) { p.x = Math.sign(p.x) * 1.15; p.vx *= -0.3; }
            for (const q of pins) if (!q.down && Math.hypot(q.x - p.x, q.y - p.y) < PIN_R * 2.2 && Math.hypot(p.vx, p.vy) > 0.6) knock(q, q.x - p.x, q.y - p.y, Math.hypot(p.vx, p.vy) * 0.8);
          }
          if (!ball && settleT > 1.0) endRoll();
          if (settleT > 6) endRoll();
        }
        syncScene(dt); syncOpp(dt); finish();
      },
      draw(ctx) {
        // 카메라: 던지기 전엔 캐릭터 뒤, 굴러가면 공을 따라 핀 쪽으로
        const target = phase === "roll" && ball ? Math.max(wz(LANE_LEN) + 6.5, wz(ball.y) + 3.6) : phase === "roll" ? camZ : 5.0;
        camZ += (target - camZ) * 0.12;
        const near = clamp((camZ - 1) / 4, 0, 1);             // 1 = 캐릭터 뒤(던지기 전), 0 = 레인 위(공 따라감)
        // 던지기 전: 캐릭터 오른쪽 어깨 위 높은 곳에서 → 캐릭터는 화면 왼쪽 아래, 레인과 핀이 가운데에 트여 보임
        const cx = wx(aimX) * 0.5 + 0.95 * near + (two ? OX * 0.32 : 0);   // 2인: 옆 레인 상대도 보이게
        camera.position.set(cx, 1.5 + 2.1 * near, camZ); camera.lookAt(cx * 0.5 - 0.35 * near, 0.2 - 0.3 * near, camZ - 10);
        me.visible = !(camZ < me.position.z + 1.8 && camZ > me.position.z - 1.5 && near < 0.95);   // 공을 따라가는 카메라가 캐릭터를 지나갈 땐 숨김(머리가 화면을 가득 가리지 않게)
        st.draw(ctx);
        const U = v.U;
        if (two) { drawVersus(ctx); return; }
        // 점수표 (위쪽): 최근 5프레임 + 합계
        const n = 5, cw = Math.min(U * 0.1, z.w * 0.13), ch = cw * 0.95, w = cw * n + cw * 1.4, x0 = z.cx - w / 2, y0 = v.H * 0.105;
        ctx.fillStyle = "rgba(20,16,50,.85)"; rr(ctx, x0 - 6, y0 - 6, w + 12, ch + 12, U * 0.015); ctx.fill();
        const first = Math.max(0, frames.length - (roll === 2 ? n : n - 1));
        for (let i = 0; i < n; i++) {
          const k = first + i, F = frames[k], x = x0 + i * cw, cur = k === frames.length - (roll === 2 ? 1 : 0);
          ctx.fillStyle = cur ? "#fff6c4" : "#ffffff"; ctx.fillRect(x + 2, y0, cw - 4, ch);
          ctx.fillStyle = "#555"; ctx.font = `${Math.round(ch * 0.22)}px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(String(k + 1), x + 5, y0 + 3);
          if (!F) continue;
          const s1 = F.mark === "X" ? "X" : F.a === 0 ? "-" : String(F.a), s2 = F.mark === "/" ? "/" : F.b == null ? "" : F.b === 0 ? "-" : String(F.b);
          ctx.fillStyle = F.mark === "X" ? "#e0306a" : "#222"; ctx.font = `bold ${Math.round(ch * 0.42)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(s1, x + cw * 0.32, y0 + ch * 0.62); ctx.fillStyle = F.mark === "/" ? "#2f8bff" : "#222"; ctx.fillText(s2, x + cw * 0.7, y0 + ch * 0.62);
        }
        ctx.fillStyle = "#ffd43b"; ctx.fillRect(x0 + n * cw + 2, y0, cw * 1.4 - 4, ch);
        ctx.fillStyle = "#222"; ctx.font = `bold ${Math.round(ch * 0.5)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(total), x0 + n * cw + cw * 0.7, y0 + ch * 0.58);
        outlinedText(ctx, `${frame}프레임 · ${roll}구`, z.cx, y0 + ch + U * 0.04, U * 0.032, "#fff", "#2b2357", 3);
        if (phase === "aim") {   // 어디로 얼마나: 프레임 글자 아래
          const ok = aimOk(), mt = moveText(recommend() - aimX, ok, "좋아요! 추천 자리", 0.3);
          outlinedText(ctx, mt, z.cx, y0 + ch + U * 0.1, Math.min(U * 0.042, z.w / 13), "#fff", ok ? "#2f8f2f" : "#c07800", 4);
        }
        if (phase === "aim") {
          // 아래 안내 글자는 카메라 작은 창(1인·2P는 오른쪽, 1P는 왼쪽 구석)을 피해 남은 자리 가운데에
          const two = env.mode === 2, pw = Math.min(z.w * (two ? 0.2 : 0.24), U * 0.3), left = two && env.slot === 0;
          const hx = left ? z.x0 + pw + (z.w - pw) / 2 : z.x0 + (z.w - pw) / 2, txt = roll === 1 ? "손을 내렸다가 앞으로 쭉 휘둘러요!" : "남은 핀을 노려요!";
          outlinedText(ctx, txt, hx, v.H * 0.88, Math.min(U * 0.04, (z.w - pw) / (txt.length * 0.95)), "#fff", "#8a2a5a", 4);
        }
      },
      stop() { st.dispose(); },
      result: () => `쓰러뜨린 핀 ${total} · 스트라이크 ${strikes} · 스페어 ${spares}` + (two && shared && shared.p[other] ? ` · 상대 ${shared.p[other].total}` : ""),
      // 설명 시연용
      get phase() { return phase; },
      get aimX() { return aimX; },
      get standing() { return pins.filter(p => !p.down).map(p => p.x); },
      get moveTo() { return phase === "aim" ? mover.toScreenX(recommend()) : null; },
      get aimOk() { return aimOk(); },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      const u = p.u, cx = p.cx, sy = p.shoulderY;
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1;
      if (T < 4) say("볼링! 공 든 손을 허리 아래로 내렸다가");
      else if (T < 9) say("앞으로 쭉 휘두르면 공이 굴러가요");
      else if (T < 14) say("옆으로 걸어서 점선 자리로! 남은 핀을 노려요");
      else say("이제 직접 해 봐요!");
      // 점선 추천 자리로 걸어감
      if (g.moveTo != null) p.tcx = g.moveTo; p.walk = 1.2;
      p.rest(0, "down", 1);
      if (g.phase !== "aim" || Math.abs(p.cx - p.tcx) > 0.2 * u) { p.rest(1, "down", 1.2); S.ph = 0; S.t0 = T; return; }
      if (!S.ph) { S.ph = 1; S.t0 = T; }
      if (S.ph === 1) { p.reach(1, cx + 0.5 * u, sy + 1.95 * u, 1.2); if (T - S.t0 > 1.0) { S.ph = 2; S.t0 = T; } }   // 아래로 내리기
      else { p.reach(1, cx + 0.4 * u, sy - 0.4 * u, 3.2); }                                                             // 앞으로 휘두르기
    },
  },
};
