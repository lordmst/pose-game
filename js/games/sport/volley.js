// 배구 (스포츠 리조트처럼 3D 비치발리볼 2:2): 내 캐릭터 뒤에서 코트를 봄
// 리시브(두 손 모아 아래로) → 같은 편 토스 → 스파이크(높이 들었다 세게 내려치기) → 상대가 공격하면 블로킹(두 손 번쩍) 또는 리시브
// 몸을 좌우로 움직이면 캐릭터도 좌우로 움직임(앞뒤는 저절로). 공이 오면 가야 할 자리를 점선으로 안내, 그 자리에서만 받기·때리기·막기 가능
// 내 캐릭터 팔은 내 팔을 그대로 따라 하고(동작 사이), 받기·때리기·막기 때는 배구 동작(무릎 굽혀 받기, 도움닫기 점프 스파이크, 점프 블로킹)
// 1인: 컴퓨터 두 명과 대결. 2인: 1P와 2P가 네트를 사이에 두고 서로 대결(각 편에 토스해 주는 컴퓨터 한 명).
//      경기 상태(공·점수·단계)는 둘이 함께 쓰고, 각 화면은 자기 편 뒤에서 같은 경기를 봄
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=58";
import { sfx } from "../../audio.js?v=58";
import { stage, THREE, sea, box, cyl, mesh, palm, cloud, playerAvatar, randomAvatar, avatar, bodyMover, moveGuide, moveText } from "./kit3d.js?v=58";

const SERVE = 1.6;     // 서브가 넘어오는 시간(초, 보통)
const FAST = 0.95;     // 스파이크가 넘어오는 시간(초, 보통)
const SPIKE = 3.0;     // 스파이크로 인정하는 손 속도(어깨너비/초, 아래 방향)
const CPU_DIG = { easy: 0.2, normal: 0.32, hard: 0.45 };   // 컴퓨터가 스파이크를 받아낼 확률 (서브는 0.9)
const L = 8, HW = 4, NET = 2.24;                            // 코트 반 길이·반 너비, 네트 높이(m)
const RECV_Z = 5.6, NET_Z = 0.9, SET_Z = 2.4;               // 받는 자리 · 네트 앞 자리 · 토스하는 같은 편 자리 (네트에서 거리)
const COURT_X = HW - 0.6;   // 캐릭터가 움직일 수 있는 좌우 범위(m)
const REACH = 0.8;          // 표시한 자리에서 이만큼(m) 안에 있으면 받기·때리기·막기 가능
const POINTS = 15;          // 세트 점수 (2점 차)
const SIMAUTO = typeof location !== "undefined" && /simauto=1/.test(location.search);   // 점검용: 가상 선수가 알아서 움직이고 동작

const arc = (a, b, h, u) => new THREE.Vector3(a.x + (b.x - a.x) * u, Math.max(0.15, a.y + (b.y - a.y) * u + 4 * h * u * (1 - u)), a.z + (b.z - a.z) * u);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sgn = s => (s === 0 ? 1 : -1);          // 편 0 = 화면 앞쪽(z+), 편 1 = 네트 건너(z-)

// 비치볼 무늬
function ballTex() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  ["#ffd43b", "#ffffff", "#1c7ed6", "#ffffff", "#ffd43b", "#ffffff", "#1c7ed6", "#ffffff"].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 32, 0, 32, 128); });
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function beach(scene) {
  const water = sea(scene, 600, -0.7);                                                   // 물결이 모래 위로 올라오지 않게 낮게
  const sand = cyl(38, 41, 1, "#f1d39a", { receive: true, cast: false }); sand.position.y = -0.5; scene.add(sand);   // 섬
  const line = (w, d, x, z) => { const m = box(w, 0.03, d, "#1c7ed6", { cast: false, receive: true }); m.position.set(x, 0.02, z); scene.add(m); };
  const T = 0.08;
  line(HW * 2, T, 0, L); line(HW * 2, T, 0, -L); line(T, L * 2, -HW, 0); line(T, L * 2, HW, 0);
  // 네트 (기둥 + 그물 + 위아래 띠)
  [-1, 1].forEach(s => { const p = cyl(0.07, 0.07, NET + 0.15, "#e9ecef"); p.position.set(s * (HW + 0.7), (NET + 0.15) / 2, 0); scene.add(p); });
  const net = mesh(new THREE.PlaneGeometry(HW * 2 + 1.4, 1.0), new THREE.MeshStandardMaterial({ color: "#111", transparent: true, opacity: 0.45, side: THREE.DoubleSide }), { cast: false });
  net.position.set(0, NET - 0.5, 0); scene.add(net);
  const top = box(HW * 2 + 1.4, 0.08, 0.04, "#ffffff"); top.position.set(0, NET, 0); scene.add(top);
  const bot = box(HW * 2 + 1.4, 0.05, 0.03, "#ffffff"); bot.position.set(0, NET - 1.0, 0); scene.add(bot);
  // 야자수·파라솔·구름 (리조트 섬 해변)
  for (let i = 0; i < 12; i++) { const s = i % 2 ? 1 : -1; scene.add(palm(s * (HW + 6 + (i % 3) * 3), -L - 4 + i * 2.6, 1.1 + (i % 3) * 0.25)); }
  ["#ff6b6b", "#ffd43b", "#4dabf7", "#69db7c"].forEach((col, i) => {
    const g = new THREE.Group(), pole = cyl(0.04, 0.04, 2.2, "#ddd"); pole.position.y = 1.1;
    const cone = mesh(new THREE.ConeGeometry(1.3, 0.55, 10), col); cone.position.y = 2.3; g.add(pole, cone);
    g.position.set((i % 2 ? 1 : -1) * (HW + 3.2), 0, -L + 2 + i * 4.5); scene.add(g);
  });
  for (let i = 0; i < 6; i++) scene.add(cloud(-50 + i * 20, 16 + (i % 3) * 3, -80 - (i % 2) * 20, 3 + (i % 2)));
  return water;
}

/* ---------- 경기 (2인은 둘이 함께 씀) ----------
   단계(ph): wait(서브 전) → recv(side 편이 받기) → toSet(같은 편에게) → set(토스, side 편이 때릴 차례. 상대 편은 블로킹 준비)
             → (스파이크) → recv(상대 편) … / blocked(막혀서 떨어짐) */
function newMatch(mode) {
  const M = {
    mode, t: 0, ph: "wait", wait: 1.4, side: 0, B: null, score: [0, 0], sets: [0, 0], server: 1, ev: [],
    info: [null, null], human: [true, mode === 2],            // 편마다 사람이 하는지 (1인이면 건너편은 컴퓨터)
    mx: [0, 0], mz: [RECV_Z, -RECV_Z],                         // 편마다 주 선수(받고 때리는 사람) 위치
    goal: [{ x: 0, z: RECV_Z }, { x: 0, z: -RECV_Z }],
    setX: [-1.6, 1.4],                                         // 토스해 주는 같은 편 x
    act: { main: [null, null], set: [null, null] },          // 지금 하는 동작 { k, t }
    blockUpT: [-9, -9], blockAct: [-9, -9], pose: [null, null],
  };
  const D = s => (M.info[s] && M.info[s].D) || M.info[0].D;
  const reach = s => REACH * (D(s).reach || 1);
  M.near = s => Math.abs(M.mx[s] - M.goal[s].x) <= reach(s);
  M.emit = (k, side, extra = {}) => M.ev.push({ k, side, t: M.t, ...extra });
  const fly = (p0, p1, h, T) => { M.B = { p0, p1, h, t: 0, T }; };
  M.at = () => { const B = M.B, k = B.t / B.T; return { k, p: arc(B.p0, B.p1, B.h, k) }; };
  // 공이 갈 좌우 자리: 그 편 선수의 지금 자리에서 lo~hi(m) 떨어진 곳
  const spot = (s, lo, hi) => { const x = M.mx[s]; let d = Math.random() < 0.5 ? -1 : 1; if (Math.abs(x + d * (lo + hi) / 2) > COURT_X) d = -d; return clamp(x + d * (lo + Math.random() * (hi - lo)), -COURT_X, COURT_X); };
  const recvTo = (s, x, from, h, T, cpuP) => {
    M.goal[s] = { x, z: sgn(s) * RECV_Z }; fly(from, V(x, 0.85, sgn(s) * (RECV_Z - 0.1)), h, T);
    M.ph = "recv"; M.side = s; M.B.cpuP = cpuP; M.B.cpuTry = false;
  };
  M.serve = s => {
    const r = 1 - s, x = spot(r, 1.0, 3.0);
    M.act.main[s] = { k: "serve", t: 0 };
    recvTo(r, x, V(M.mx[s] + 0.3, 2.7, M.mz[s]), 3.0, SERVE * (1 - 0.2 * M.progress()) / (D(r).speed || 1), 0.9);
    M.goal[s] = { x: M.mx[s], z: sgn(s) * RECV_Z };
    M.emit("serve", s);
  };
  M.point = (w, why) => {
    M.score[w]++; M.emit("point", w, { why });
    const [a, b] = M.score;
    if ((a >= POINTS || b >= POINTS) && Math.abs(a - b) >= 2) { const sw = a > b ? 0 : 1; M.sets[sw]++; M.score = [0, 0]; M.emit("set", sw); }
    M.B = null; M.ph = "wait"; M.wait = 1.6; M.server = w;
    M.goal = [{ x: M.mx[0], z: RECV_Z }, { x: M.mx[1], z: -RECV_Z }];
  };
  // 받기 성공 → 같은 편에게 → 토스 받을 자리 정하기. 상대 편은 같은 x의 네트 앞(블로킹 자리)으로
  M.receive = s => {
    const { p } = M.at(), d = 1 - s;
    M.act.main[s] = { k: "recv", t: 0 }; M.emit("recv", s, { p: p.clone() });
    fly(p.clone(), V(M.setX[s], 2.6, sgn(s) * SET_Z), 1.8, 0.85); M.ph = "toSet"; M.side = s;
    const sx = spot(s, 0.8, 2.4);
    M.goal[s] = { x: sx, z: sgn(s) * (NET_Z + 0.5) }; M.goal[d] = { x: sx, z: sgn(d) * NET_Z };
  };
  // 스파이크: 상대가 그 자리에서 두 손을 들고 있었으면 블로킹
  M.spike = (s, aimX) => {
    const { p } = M.at(), d = 1 - s;
    M.act.main[s] = { k: "spike", t: 0 }; M.emit("spike", s, { p: p.clone() });
    const blocked = M.human[d] && M.t - M.blockUpT[d] < 0.4 && M.near(d);
    if (blocked) {
      M.act.main[d] = { k: "block", t: 0 }; M.emit("block", d, { p: p.clone() });
      fly(p.clone(), V(p.x + (Math.random() - 0.5), 0.15, sgn(s) * 1.6), 0.2, 0.4); M.ph = "blocked"; M.side = d; return;
    }
    const x = clamp(aimX != null ? aimX : spot(d, 0.2, 0.9), -COURT_X, COURT_X);
    recvTo(d, Math.abs(x - M.mx[d]) > 1.6 ? M.mx[d] + Math.sign(x - M.mx[d]) * 1.6 : x, p.clone(), 0.4, FAST / Math.min(1.3, D(d).speed || 1), CPU_DIG[D(d).id] || 0.32);
  };
  // 시간 흐름 (2인이면 1P 화면이 한 번만 돌림)
  M.step = dt => {
    M.t += dt;
    for (const g of ["main", "set"]) for (const s of [0, 1]) { const a = M.act[g][s]; if (a) { a.t += dt; if (a.t > 0.9) M.act[g][s] = null; } }
    for (const s of [0, 1]) {
      if (!M.human[s]) M.mx[s] += clamp(M.goal[s].x - M.mx[s], -3 * dt, 3 * dt);   // 컴퓨터 선수는 알아서 감
      M.mz[s] += (M.goal[s].z - M.mz[s]) * Math.min(1, dt * 4.5);                       // 앞뒤는 모두 저절로
    }
    if (M.ph === "wait") { M.wait -= dt; if (M.wait <= 0) M.serve(M.server); return; }
    const B = M.B; B.t += dt; const k = B.t / B.T, s = M.side;
    if (M.ph === "recv") {
      if (!M.human[s] && !B.cpuTry && k >= 0.95) { B.cpuTry = true; if (Math.random() < B.cpuP) { M.receive(s); return; } }
      if (k >= 1.18) { M.emit("miss", s, { why: "recv" }); M.point(1 - s, "recv"); }
    } else if (M.ph === "toSet" && k >= 1) {
      const { p } = M.at(); M.act.set[s] = { k: "set", t: 0 }; M.emit("toss", s, { p: p.clone() });
      fly(p.clone(), V(M.goal[s].x, 3.0, sgn(s) * (NET_Z + 0.25)), 1.5, 1.05 / Math.min(1.2, D(s).speed || 1)); M.ph = "set";
    } else if (M.ph === "set") {
      if (!M.human[s] && k >= 1.0) { M.spike(s, null); return; }
      if (k >= 1.3) { M.emit("miss", s, { why: "spike" }); M.point(1 - s, "spike"); }
    } else if (M.ph === "blocked" && k >= 1) M.point(s, "block");
  };
  return M;
}
let shared = null;

// 캐릭터 자세를 복사하고 붙이기 (2인: 상대 화면에도 내 캐릭터가 똑같이 움직이게)
function snap(av) {
  return { p: av.position.toArray(), b: av.body.rotation.toArray(), by: av.body.position.y, h: av.headG.rotation.toArray(),
    a: av.arms.map(A => [A.sh.rotation.toArray(), A.el.rotation.toArray()]), l: av.legs.map(g => g.rotation.toArray()) };
}
function applySnap(av, S) {
  if (!S) return;
  av.position.fromArray(S.p); av.body.rotation.fromArray(S.b); av.body.position.y = S.by; av.headG.rotation.fromArray(S.h);
  av.arms.forEach((A, k) => { A.sh.rotation.fromArray(S.a[k][0]); A.el.rotation.fromArray(S.a[k][1]); });
  av.legs.forEach((g, k) => g.rotation.fromArray(S.l[k]));
}
// 배구 기본 자세: 무릎을 굽힌 듯 낮추고 앞으로 살짝 숙임, 옆으로 움직일 땐 발을 번갈아
function stance(av, t, vx, low = 1) {
  av.body.rotation.x = 0.18 * low; av.body.position.y = -0.06 * low;
  const step = Math.min(1, Math.abs(vx) / 1.5), sw = Math.sin(t * 13) * 0.32 * step;
  av.legs[0].rotation.set(-0.15 * low - Math.max(0, sw) * 0.4, 0, 0.12 + sw); av.legs[1].rotation.set(-0.15 * low - Math.max(0, -sw) * 0.4, 0, -0.12 + sw);
  av.body.position.y += Math.abs(sw) * 0.05;
}
// 동작별 자세 (u: 0~1 진행)
function actPose(av, a) {
  const u = Math.min(1, a.t / 0.75);
  if (a.k === "recv") {                                                   // 무릎 굽혀 두 팔을 앞에 모으고, 닿는 순간 살짝 들어 올림
    const lift = Math.sin(Math.min(1, a.t / 0.35) * Math.PI) * 0.35;
    av.body.rotation.x = 0.4 - lift * 0.5; av.body.position.y = -0.14 + lift * 0.12;
    av.arm(0, -0.2, 0.75 + lift, 0); av.arm(1, -0.2, 0.75 + lift, 0); return 0;
  }
  if (a.k === "spike") {                                                  // 도움닫기 점프 → 팔을 머리 뒤로 젖혔다가 세게 내려침
    const sw = Math.min(1, a.t / 0.16);
    av.arm(1, 2.9 - 1.6 * sw, -0.5 + 2.0 * sw, 1.4 - 1.2 * sw); av.arm(0, 2.2, 0.6, 0.4); av.body.rotation.x = -0.2 + 0.5 * sw;
    return Math.sin(u * Math.PI) * 0.95;
  }
  if (a.k === "block") { av.arm(0, 2.95, 0.3, 0); av.arm(1, 2.95, 0.3, 0); av.body.rotation.x = 0; return Math.sin(u * Math.PI) * 0.85; }
  if (a.k === "serve") { const sw = Math.min(1, a.t / 0.25); av.arm(1, 2.8 - 1.2 * sw, 0.2 + 1.2 * sw, 0.3); av.arm(0, 2.4 - 1.5 * sw, 0.4, 0.3); return Math.sin(u * Math.PI) * 0.4; }
  if (a.k === "set") { const e = Math.min(1, a.t / 0.3); av.arm(0, 2.6, 0.5, 1.3 - 1.0 * e); av.arm(1, 2.6, 0.5, 1.3 - 1.0 * e); av.body.rotation.x = -0.1; return e < 1 ? 0.1 * Math.sin(e * Math.PI) : 0; }
  return 0;
}

export default {
  id: "volley", title: "배구", icon: "🏐", sec: 60, cursor: "", cat: "sport", bg: "#a1c4fd", desc: "리시브·스파이크·블로킹 (2인 대결)", scene3d: true,
  how: "몸을 좌우로 움직여 점선 자리로 가요. 공이 오면 두 손 모아 아래에서 받고(리시브), 같은 편이 올려 주면 높이 들었다 내려쳐요(스파이크)! 상대 공격엔 두 손 번쩍(블로킹). 둘이 하면 네트를 사이에 두고 대결!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, two = env.mode === 2;
    const mine = two ? env.slot : 0, other = 1 - mine, sg = sgn(mine);
    const M = two ? (shared = shared || newMatch(2)) : newMatch(1);
    M.info[mine] = { color: env.color, name: env.name, D };
    M.progress = () => env.progress();
    const st = stage(env, { fov: 50, sky: ["#4fb0f2", "#dff4ff"], shadowSize: 16 });
    const { scene, camera } = st;
    const water = beach(scene);
    const vb = mesh(new THREE.SphereGeometry(0.17, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex(), roughness: 0.5 })); scene.add(vb);
    const shadow = mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }), { cast: false }); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    const ring = mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), { cast: false }); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; scene.add(ring);
    vb.visible = shadow.visible = ring.visible = false;
    const mover = bodyMover(env, COURT_X), guideM = moveGuide(scene);
    // 캐릭터는 첫 update 때 만듦 (2인은 그때 상대 색을 앎). main[편] = 받고 때리는 선수, setter[편] = 토스해 주는 같은 편
    let main = null, setter = null;
    function buildAvatars() {
      main = [0, 1].map(s => {
        let av;
        if (s === mine) av = playerAvatar(env);
        else if (M.human[s] && M.info[s]) av = avatar({ shirt: M.info[s].color || "#4dabf7", pants: "#2b3a67", girl: /엄마|연제/.test(M.info[s].name || "") });
        else av = randomAvatar(1);
        av.scale.setScalar(1.25); av.rotation.y = s === 0 ? Math.PI : 0; scene.add(av); return av;
      });
      setter = [0, 1].map(s => { const av = randomAvatar(s === mine ? 2 : 4); av.scale.setScalar(1.25); av.rotation.y = s === 0 ? Math.PI : 0; av.position.set(M.setX[s], 0, sgn(s) * SET_Z); scene.add(av); return av; });
    }
    // 내 몸 위치(화면) ↔ 코트 x: 건너편(2P)은 반대 방향에서 보므로 좌우가 뒤집힘
    const toWorld = cx => cx * sg, toCourt = wx => wx * sg;
    let whiff = false, camX = 0, lastPh = "", lastSide = -1, evIdx = 0, prevX = 0, vxMe = 0, auto = null;
    let recv = 0, spikes = 0, blocks = 0, pts = 0, t = 0;
    evIdx = M.ev.length;
    function tooFar() { if (whiff) return; whiff = true; popup(z.cx, v.H * 0.62, "닿지 않아요! 점선 자리로", { size: v.U * 0.04, color: "#fff", stroke: "#d07a00", life: 0.9 }); }
    function body() {
      const p = env.tracker.pts;
      if (p && p[11].v && p[12].v) { const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y); return { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2, sw: Math.max(sw, v.U * 0.08) }; }
      return { x: z.cx, y: v.H * 0.45, sw: v.U * 0.13 };
    }
    // 나에게 지금 필요한 동작: recv(받기) · spike(때리기) · block(막기) · null
    const need = () => {
      if (M.ph === "recv" && M.side === mine) return "recv";
      if ((M.ph === "toSet" || M.ph === "set") && M.side === mine) return "spike";
      if ((M.ph === "toSet" || M.ph === "set") && M.side === other) return "block";
      return null;
    };
    const near = () => M.near(mine);
    const scr = p => st.toScreen(p);
    // 경기 소식(이벤트) 반영: 내 편이면 점수·실패 표시, 상대 편이면 짧은 알림만
    function onEvent(e) {
      const at = e.p ? scr(e.p) : { x: z.cx, y: v.H * 0.45 }, U = v.U, lead = !two || env.slot === 0;
      const meSide = e.side === mine;
      if (e.k === "recv") {
        if (lead) sfx.bonk();
        if (meSide && M.human[mine]) { recv++; env.award(1, at.x, at.y - U * 0.08); popup(at.x, at.y + U * 0.06, "리시브!", { size: U * 0.045, color: "#fff", stroke: "#2f6fd1", life: 0.8 }); burst(at.x, at.y, { n: 10, colors: ["#ffffff", "#ffd400"], shape: "star", speed: U * 0.4, gravity: U * 0.4, size: U * 0.014, life: 0.5 }); }
        else popup(at.x, at.y - U * 0.05, two ? `${M.info[e.side].name} 리시브` : "상대가 받았어요", { size: U * 0.035, color: "#fff", stroke: "#555" });
      } else if (e.k === "toss") { if (lead) sfx.pop(); popup(at.x, at.y - U * 0.06, "토스!", { size: U * 0.035, color: "#fff", stroke: "#555", life: 0.6 }); }
      else if (e.k === "spike") {
        if (lead) sfx.hit(3);
        if (meSide) { spikes++; shake(U * 0.014, 0.2); env.award(2, at.x, at.y - U * 0.06); popup(at.x, at.y + U * 0.07, "스파이크!", { size: U * 0.055, color: "#fff", stroke: "#e0306a", life: 0.9 }); burst(at.x, at.y, { n: 22, colors: ["#ffffff", "#ffd400", "#ff7aa2"], shape: "star", speed: U * 0.8, gravity: U * 0.4, size: U * 0.018, life: 0.6 }); }
        else popup(at.x, at.y - U * 0.05, "상대 스파이크!", { size: U * 0.04, color: "#fff", stroke: "#a02020", life: 0.7 });
      } else if (e.k === "block") {
        if (lead) sfx.hit(3);
        if (meSide) { blocks++; shake(U * 0.012, 0.2); env.award(2, at.x, at.y - U * 0.06); popup(at.x, at.y + U * 0.07, "블로킹!", { size: U * 0.06, color: "#fff", stroke: "#f08c00", life: 1.0 }); burst(at.x, at.y, { n: 18, colors: ["#ffffff", "#ffd400"], shape: "star", speed: U * 0.7, gravity: U * 0.4, size: U * 0.016, life: 0.6 }); }
        else env.miss(z.cx, v.H * 0.62, "막혔어요!");
      } else if (e.k === "miss") { if (lead) sfx.thud(); if (meSide) env.miss(z.cx, v.H * 0.75, e.why === "recv" ? "못 받았어요" : "놓쳤어요"); }
      else if (e.k === "point") {
        if (meSide) { pts++; if (lead || two) sfx.fever(); env.award(1, z.cx, v.H * 0.35); popup(z.cx, v.H * 0.42, "득점!", { size: U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.0 }); }
      } else if (e.k === "set") {
        if (meSide) { sfx.fanfare(); env.award(3, z.cx, v.H * 0.4); popup(z.cx, v.H * 0.5, "세트 승리!", { size: U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.3 }); }
        else popup(z.cx, v.H * 0.5, two ? `${M.info[e.side].name} 세트 승리` : "상대 세트", { size: U * 0.05, color: "#eee", stroke: "#555" });
      } else if (e.k === "serve" && lead) sfx.whoosh();
    }
    // 내 동작 판정 (자세 또는 점검용 자동)
    function judge() {
      const n = need(); if (!n || !M.B) return;
      const { k } = M.at(), P = env.tracker.pts, b = body(), hands = env.tracker.hands;
      if (n === "recv" && k > 0.72 && k < 1.18) {
        let ok = false;
        if (SIMAUTO) { if (!auto || auto.id !== M.B) auto = { id: M.B, at: 0.8 + Math.random() * 0.2, ok: Math.random() < 0.8 }; ok = k >= auto.at && auto.ok; }
        else if (P && P[15].v && P[16].v) {
          const close = Math.hypot(P[15].x - P[16].x, P[15].y - P[16].y) < b.sw * 0.9 / Math.max(0.8, D.reach);
          ok = close && P[15].y > b.y + b.sw * 0.25 && P[16].y > b.y + b.sw * 0.25;
        }
        if (ok && !near()) tooFar(); else if (ok) M.receive(mine);
      } else if (n === "spike" && M.ph === "set" && k > 0.68 && k < 1.3) {
        let h = null;
        if (SIMAUTO) { if (!auto || auto.id !== M.B) auto = { id: M.B, at: 0.85 + Math.random() * 0.2, ok: Math.random() < 0.8 }; if (k >= auto.at && auto.ok) h = { vx: (Math.random() - 0.5) * 2, speed: 1 }; }
        else h = hands.find(h => h.vis && h.vy > 0 && h.bodySpeed >= SPIKE * D.punch && h.y < b.y + b.sw * 0.8);
        if (h && !near()) tooFar();
        else if (h) { const aimC = clamp((h.vx / (h.speed || 1)) * 3 + (Math.random() - 0.5) * 3, -COURT_X, COURT_X); M.spike(mine, toWorld(aimC)); }
      } else if (n === "block" && M.ph === "set" && k > 0.4) {
        let up;
        if (SIMAUTO) { if (!auto || auto.id !== M.B) auto = { id: M.B, ok: Math.random() < 0.5 }; up = auto.ok; }
        else up = !!(P && P[0].v && P[15].v && P[16].v && P[15].y < P[0].y && P[16].y < P[0].y);   // 두 손목이 코보다 위
        if (up && near()) { M.blockUpT[mine] = M.t; if (M.t - M.blockAct[mine] > 0.8) { M.blockAct[mine] = M.t; M.act.main[mine] = { k: "block", t: 0 }; } }
        else if (up && !near()) tooFar();
      }
    }
    // 내 캐릭터 움직임: 동작 중이면 배구 동작, 아니면 기본 자세 + 내 팔을 그대로
    function animMine(dt) {
      const av = main[mine], a = M.act.main[mine];
      av.position.set(M.mx[mine], 0, M.mz[mine]);
      stance(av, t, vxMe, need() === "recv" ? 1.4 : 1);
      av.headG.rotation.x = 0;
      let y = 0;
      if (a) y = actPose(av, a);
      else {
        av.mimic(env.tracker.pts, true);
        if (SIMAUTO || !env.tracker.pts) {   // 팔이 안 보이면 준비 자세
          const n = need(), k = M.B ? M.B.t / M.B.T : 0;
          if (n === "recv" && k > 0.4) { av.arm(0, -0.2, 0.75, 0); av.arm(1, -0.2, 0.75, 0); }
          else if (n === "spike" && M.ph === "set" && k > 0.4) { av.arm(1, 2.9, -0.5, 1.4); av.arm(0, 2.2, 0.5, 0.4); }
          else if (n === "block" && M.ph === "set" && k > 0.5) { av.arm(0, 2.8, 0.3, 0); av.arm(1, 2.8, 0.3, 0); }
          else { av.arm(0, 0.35, 0.7, 0.9); av.arm(1, 0.35, 0.7, 0.9); }
        }
      }
      av.position.y = y;
      M.pose[mine] = snap(av);
    }
    // 컴퓨터 선수(같은 편 토스·1인 상대) 움직임
    function animCpu(av, s, isMain, prevX) {
      const a = isMain ? M.act.main[s] : M.act.set[s];
      if (isMain) av.position.set(M.mx[s], 0, M.mz[s]);
      else { const tx = M.ph === "toSet" && M.side === s && M.B ? M.B.p1.x : M.setX[s]; av.position.x += (tx - av.position.x) * Math.min(1, 0.05); }
      const vx = (av.position.x - prevX) * 60;
      stance(av, t + s, vx, isMain && M.ph === "recv" && M.side === s ? 1.4 : 1);
      av.headG.rotation.x = 0;
      let y = 0;
      if (a) y = actPose(av, a);
      else if (isMain && M.side === s && M.ph === "recv" && M.B && M.B.t / M.B.T > 0.4) { av.arm(0, -0.2, 0.75, 0); av.arm(1, -0.2, 0.75, 0); }
      else if (isMain && M.side === s && M.ph === "set" && M.B && M.B.t / M.B.T > 0.4) { av.arm(1, 2.9, -0.5, 1.4); av.arm(0, 2.2, 0.5, 0.4); y = Math.max(0, (M.B.t / M.B.T - 0.75) * 2) * 0.6; }
      else { av.arm(0, 0.35, 0.7, 0.9 + Math.sin(t * 2 + s) * 0.05); av.arm(1, 0.35, 0.7, 0.9); }
      av.position.y = y;
    }
    return {
      update(dt) {
        t += dt;
        if (!main) buildAvatars();
        if (!two || env.slot === 0) M.step(dt);                      // 경기 시간은 한 화면만 돌림
        water.update(t);
        // 내 선수 좌우 = 내 몸 (점검용 자동이면 점선 자리로)
        const g = M.goal[mine];
        if (SIMAUTO) M.mx[mine] += clamp(g.x - M.mx[mine], -3 * dt, 3 * dt);
        else M.mx[mine] = toWorld(mover.follow(toCourt(M.mx[mine]), dt));
        vxMe += ((M.mx[mine] - prevX) / Math.max(dt, 0.016) - vxMe) * Math.min(1, dt * 8); prevX = M.mx[mine];
        if (M.ph !== lastPh || M.side !== lastSide) { whiff = false; lastPh = M.ph; lastSide = M.side; }
        judge();
        // 경기 소식
        while (evIdx < M.ev.length) onEvent(M.ev[evIdx++]);
        // 캐릭터
        const px = [main[0].position.x, main[1].position.x, setter[0].position.x, setter[1].position.x];
        animMine(dt);
        if (M.human[other] && two) applySnap(main[other], M.pose[other]);
        else animCpu(main[other], other, true, px[other]);
        setter.forEach((av, s) => animCpu(av, s, false, px[2 + s]));
        // 공
        if (M.B) {
          const { k, p } = M.at();
          vb.visible = shadow.visible = true; vb.position.copy(p); vb.rotation.x += dt * 6; vb.rotation.z += dt * 3; shadow.position.set(p.x, 0.04, p.z);
          ring.visible = M.ph === "recv"; if (ring.visible) { ring.position.x = M.B.p1.x; ring.position.z = M.B.p1.z; ring.scale.setScalar(1 + Math.sin(t * 8) * 0.08); }
        } else vb.visible = shadow.visible = ring.visible = false;
        // 이동 안내 (내가 할 차례일 때만)
        const n = need();
        if (n) guideM.show(M.mx[mine], g.x, M.mz[mine], near(), t); else guideM.hide();
        st.pipMark = n ? { x: mover.toScreenX(toCourt(g.x)), ok: near() } : null;
      },
      draw(ctx) {
        // 카메라: 내 캐릭터 뒤 위쪽에서 상대 코트를 봄 (2P는 건너편에서)
        const mz = M.mz[mine], n = need(), mx = n ? (M.mx[mine] + M.goal[mine].x) / 2 : M.mx[mine];
        camX += (mx - camX) * 0.12;
        camera.position.set(camX * 0.8, 4.0, mz + sg * 7.2); camera.lookAt(camX * 0.6, 1.5, mz - sg * 7);
        st.draw(ctx);
        const U = v.U;
        const bw = Math.min(z.w * 0.9, U * 0.75), by = v.H * 0.11, bh = U * 0.075;
        ctx.fillStyle = "rgba(10,30,80,.82)"; rr(ctx, z.cx - bw / 2, by, bw, bh, U * 0.02); ctx.fill();
        const txt = two ? `1P ${M.info[0].name} ${M.score[0]} : ${M.score[1]} ${M.info[1] ? M.info[1].name : ""} 2P · 세트 ${M.sets[0]}:${M.sets[1]}`
          : `우리 ${M.score[0]} - ${M.score[1]} 상대  ·  세트 ${M.sets[0]}:${M.sets[1]}`;
        outlinedText(ctx, txt, z.cx, by + bh / 2, Math.min(U * 0.036, z.w / (two ? 19 : 15)), "#fff", "#0a1e46", 3);
        // 해야 할 동작 안내
        const k = M.B ? M.B.t / M.B.T : 0, fs = Math.min(U * 0.045, z.w / 13), py = v.H * 0.27;
        if (n && !near()) outlinedText(ctx, moveText(toCourt(M.goal[mine].x) - toCourt(M.mx[mine]), false), z.cx, py, fs, "#fff", "#c07800", 4);   // 어디로 얼마나
        else if (n === "recv" && k > 0.25) outlinedText(ctx, "리시브! 두 손 모아 아래로", z.cx, py, fs, "#fff", "#2f6fd1", 4);
        else if (n === "spike" && M.ph === "set") outlinedText(ctx, "스파이크! 높이 들었다 내려치기", z.cx, py, fs, "#fff", "#e0306a", 4);
        else if (n === "block" && M.ph === "set") outlinedText(ctx, "블로킹! 두 손 번쩍", z.cx, py, fs, "#fff", "#f08c00", 4);
      },
      stop() { st.dispose(); shared = null; },
      result: () => `리시브 ${recv} · 스파이크 ${spikes} · 블로킹 ${blocks} · 득점 ${pts} · 세트 ${M.sets[mine]}:${M.sets[other]}`,
      // 설명 시연용 (예전 단계 이름으로)
      get phase() {
        const n = need();
        if (n === "recv") return "recv";
        if (n === "spike") return M.ph === "toSet" ? "toMate" : "spike";
        if (n === "block") return M.ph === "toSet" ? "oppSet" : "oppSpike";
        return M.ph === "wait" ? "wait" : "attack";
      },
      get ball() { return M.B ? { k: M.B.t / M.B.T } : null; },
      get moveTo() { return need() ? mover.toScreenX(toCourt(M.goal[mine].x)) : null; },
      get near() { return near(); },
      get match() { return M; },   // 점검용
    };
  },
  demo: {
    dur: 17,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.walk = 1.6;
      const ph = g.phase, b = g.ball, u = p.u, s = p.pts && p.pts[12];
      if (g.moveTo != null) p.tcx = g.moveTo;                                     // 점선 자리로 걸어감
      if (T > 15.5) say("이제 직접 해 봐요!");
      else if (ph === "recv") say("공이 오면 두 손 모아 아래에서 받아요. 리시브!");
      else if (ph === "toMate" || ph === "spike") say("같은 편이 올려 주면 높이 들었다 세게 내려쳐요. 스파이크!");
      else if (ph === "oppSet" || ph === "oppSpike") say("상대가 공격하려 하면 두 손 번쩍! 블로킹");
      else if (T < 3) say("배구! 몸을 좌우로 움직여 점선 자리로 가요");
      if (!g.near) { S.j = 0; p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }   // 자리 잡을 때까지
      if (ph === "recv" && b && b.k > 0.55) { p.rest(0, "clap", 2); p.rest(1, "clap", 2); return; }
      if (ph === "oppSpike" && b && b.k > 0.5) { p.rest(0, "up", 2); p.rest(1, "up", 2); return; }
      if (ph === "spike" && b && s) {
        p.rest(0, "guard", 1);
        if (b.k < 0.85) p.reach(1, s.x, s.y - 2.2 * u, 2.2);                     // 손을 높이
        else { p.reach(1, s.x - 0.3 * u, s.y + 0.5 * u, 3.5); if (!S.j) { p.jump(); S.j = 1; } }   // 아래로 내려치기
        return;
      }
      S.j = 0; p.rest(0, "guard", 1); p.rest(1, "guard", 1);
    },
  },
};
