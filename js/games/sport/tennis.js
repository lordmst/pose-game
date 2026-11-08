// 테니스 (스포츠 리조트처럼 3D 복식): 내 캐릭터 뒤에서 코트를 봄. 상대가 친 공이 바운드되어 오면 타이밍 맞춰 팔을 휘둘러 받아치기
// 몸을 좌우로 움직이면 캐릭터도 좌우로 움직임(옆걸음). 공이 오면 가야 할 자리를 점선으로 안내, 그 자리에서만 받아칠 수 있음
// 캐릭터의 라켓 팔은 내 손을 그대로 따라 하고, 휘두르면 휘두른 방향·세기대로 포핸드·백핸드·스매시. 공은 라켓에 맞는 자리에서 날아감
// 1인: 컴퓨터 상대 · 2인: 네트를 사이에 두고 둘이 대결(각자 화면은 자기 편 뒤에서 봄, 편마다 네트 앞에 컴퓨터 짝꿍)
// 점수는 테니스식(15·30·40, 듀스·어드밴티지, 게임). 2인은 게임마다 서브가 바뀜
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=76";
import { sfx } from "../../audio.js?v=76";
import { stage, THREE, ground, box, ball as sphere, mesh, tree, cloud, playerAvatar, randomAvatar, racket, bodyMover, moveGuide, moveText, fan as makeFan } from "./kit3d.js?v=76";

const FLIGHT = 1.7;    // 공이 상대에게서 나에게 오는 시간(초, 보통)
const SWING = 2.4;     // 스윙으로 인정하는 손 속도(어깨너비/초)
const SMASH = 7;       // 스매시 손 속도
const WIN0 = 0.8, WIN1 = 1.14, SWEET = 0.97;   // 받아칠 수 있는 구간(비행 비율)과 가장 좋은 순간
const CPU_RETURN = { easy: 0.5, normal: 0.66, hard: 0.78 };
const PTS = ["0", "15", "30", "40"];
const L = 11.9, HW = 5.5;   // 코트 반 길이·반 너비(복식, m)
const COURT_X = HW - 0.8;   // 캐릭터가 움직일 수 있는 좌우 범위(m)
const SPAN = 0.33;          // 몸을 화면(내 구역) 가운데에서 너비의 이 비율만큼 옮기면 코트 끝까지 감
const REACH = 0.75;         // 표시한 자리에서 이만큼(m) 안에 있으면 칠 수 있음
const FORE = 0.75;          // 공이 몸 오른쪽(포핸드)에 오도록 자리와 공 사이 거리(m)
const KB = 0.62;            // 비행 중 바운드되는 순간(비율)
const AUTO = /simauto=1/.test(typeof location !== "undefined" ? location.search : "");   // 점검용: 선수가 저절로 움직이고 침

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const arc = (a, b, h, u) => new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + 4 * h * u * (1 - u), a.z + (b.z - a.z) * u);
const SIDE = s => (s === 0 ? 1 : -1);    // 0번 선수는 +z 쪽, 1번(상대)은 -z 쪽. 각자 자기 오른쪽이 +x인 '자기 좌표' → 세계 x = SIDE × 자기 x

// 코트·관중석은 경기 좌표 묶음(W) 안에 둠 → 2인에서 1번 화면은 묶음째 돌려 보니 관중석이 늘 상대 뒤에 보임
function court(W) {
  const outer = box(HW * 2 + 7, 0.02, L * 2 + 9, "#3f7fd0", { receive: true, cast: false }); outer.position.y = 0.01; W.add(outer);
  const inner = box(HW * 2, 0.02, L * 2, "#2f6bc2", { receive: true, cast: false }); inner.position.y = 0.02; W.add(inner);
  const line = (w, d, x, z) => { const m = box(w, 0.025, d, "#ffffff", { cast: false, receive: true }); m.position.set(x, 0.03, z); W.add(m); };
  const T = 0.07;
  line(HW * 2, T, 0, L); line(HW * 2, T, 0, -L);
  [-HW, HW, -HW + 1.37, HW - 1.37].forEach(x => line(T, L * 2, x, 0));
  line((HW - 1.37) * 2, T, 0, 6.4); line((HW - 1.37) * 2, T, 0, -6.4);
  line(T, 12.8, 0, 0);
  const net = mesh(new THREE.PlaneGeometry(HW * 2 + 1, 0.9), new THREE.MeshStandardMaterial({ color: "#222", transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  net.position.set(0, 0.45, 0); W.add(net);
  const tape = box(HW * 2 + 1, 0.07, 0.04, "#ffffff"); tape.position.set(0, 0.92, 0); W.add(tape);
  [-1, 1].forEach(s => { const p = box(0.1, 1.07, 0.1, "#ddd"); p.position.set(s * (HW + 0.5), 0.53, 0); W.add(p); });
  const wall = box(HW * 2 + 9, 1.2, 0.3, "#1f4f9a"); wall.position.set(0, 0.6, -L - 4.6); W.add(wall);
  [-1, 1].forEach(s => { const w = box(0.3, 1.2, L * 2 + 9, "#1f4f9a"); w.position.set(s * (HW + 3.6), 0.6, 0); W.add(w); });
  const colors = ["#ff6b6b", "#ffd43b", "#69db7c", "#74c0fc", "#f783ac", "#ffa94d"];
  W.userData.fans = [];
  for (let r = 0; r < 4; r++) {
    const step = box(HW * 2 + 9, 0.5, 1.2, "#cfd8e3"); step.position.set(0, 1.4 + r * 0.6, -L - 5.6 - r * 1.1); W.add(step);
    for (let i = 0; i < 16; i++) { const fan = makeFan(colors[(i + r * 3) % colors.length], 0.28, i + r * 5); fan.position.set(-HW - 3.5 + i * ((HW * 2 + 7) / 15), 1.95 + r * 0.6, -L - 5.6 - r * 1.1); fan.userData.bob = Math.random() * 6; W.add(fan); W.userData.fans.push(fan); }
  }
  for (let i = 0; i < 14; i++) { const s = i % 2 ? 1 : -1; W.add(tree(s * (HW + 7 + (i % 3) * 2.5), -L - 2 + i * 2.4, 1.3 + (i % 3) * 0.3, i % 3 ? "#3f9b3f" : "#2f8a4f")); }
  for (let i = 0; i < 6; i++) W.add(cloud(-40 + i * 16, 18 + (i % 3) * 3, -70 - (i % 2) * 20, 3 + (i % 2)));
}

/* ---------- 경기(match): 1인이면 이 화면만, 2인이면 두 화면이 함께 씀 ---------- */
let shared = null;      // 2인 대결용. 0번 화면이 공을 움직이고 판정함
function newMatch(versus) {
  return { versus, players: [null, null], ball: null, wait: 1.4, score: [0, 0], games: [0, 0], ev: [[], []], cheer: 0, t: 0 };
}
function newPlayer(o) {
  return { name: "", color: "#e03131", myX: 0, vx: 0, swingT: 9, swingDir: 1, swingHard: false, amp: 1, pts: null, auto: false, autoP: 0.85, D: null, stats: { returns: 0, winners: 0, smashes: 0 }, stepPh: 0, ...o };
}
function spotFrom(x, lo, hi, min, max, pref = 0) {
  let sides = [-1, 1].filter(sd => x + sd * lo >= min && x + sd * lo <= max);
  if (pref && sides.includes(pref)) sides = [pref];
  const sd = sides.length ? sides[Math.floor(Math.random() * sides.length)] : (x > (min + max) / 2 ? -1 : 1);
  return clamp(x + sd * (lo + Math.random() * (hi - lo)), min, max);
}
const nearOf = (M, s) => !!M.ball && M.ball.to === s && Math.abs(M.players[s].myX - M.ball.spot) <= REACH * (M.players[s].D ? M.players[s].D.reach : 1);
// 공 보내기: from → to. 받는 사람 자기 좌표의 자리(spot)를 정하고, 공이 그 사람 포핸드 쪽으로 오게. q: 친 공의 좋은 정도(0~1)
function launch(M, from, to, { p0 = null, q = 0.4, smash = false, pref = 0, progress = 0 } = {}) {
  const R = M.players[to], sd = SIDE(to), D = R.D || { speed: 1 };
  const far = q > 0.7 || smash;                                    // 좋은 샷은 멀리(코너로)
  const [lo, hi] = M.versus ? (far ? [1.6, 2.8] : [0.8, 2.0]) : [1.0, 3.6];
  const spot = spotFrom(R.myX, lo, hi, -COURT_X, COURT_X, pref);
  let hx = spot + FORE; if (hx > COURT_X + 0.5) hx = spot - FORE;  // 오른쪽 끝이면 백핸드 쪽으로
  const wx = sd * hx, F = M.players[from];
  const start = p0 || V(SIDE(from) * (F.myX + 0.5), 1.4, SIDE(from) * (L + 0.4));
  const base = M.versus || to === 0 ? FLIGHT : 1.25;              // 1인: 내 쪽으로 오는 공 1.7초, 컴퓨터로 가는 공은 빠르게
  M.ball = {
    from, to, spot, p0: start, bnc: V(wx * 0.9, 0.06, sd * (6.5 + Math.random() * 2.5)), p1: V(wx, 1.0, sd * (L + 0.2)),
    h1: smash ? 0.6 : 2.2, t: 0, T: base * (smash ? 0.72 : 1.12 - 0.25 * q) * (1 - 0.2 * progress) / (D.speed || 1), smash, far, q,
  };
}
function ballAt(b) {
  const k = b.t / b.T;
  return { k, p: k < KB ? arc(b.p0, b.bnc, b.h1, k / KB) : arc(b.bnc, b.p1, 0.9, (k - KB) / (1 - KB)) };
}
// 점수 (테니스식): 4점 이상 + 2점 차이면 게임
function point(M, w, winner) {
  const l = 1 - w;
  M.score[w]++;
  M.ev[w].push({ k: "award", n: winner ? 2 : 1, text: winner ? "위너!" : "득점!", color: "#e0306a", big: true });
  M.ev[l].push({ k: "miss", text: M.versus ? "상대 득점" : "놓쳤어요" });
  if ((M.score[w] >= 4 || M.score[l] >= 4) && Math.abs(M.score[w] - M.score[l]) >= 2) {
    M.games[w]++; M.score = [0, 0];
    M.ev[w].push({ k: "game", n: 3, text: M.versus ? `${M.players[w].name} 게임 승리!` : "게임 승리!", win: true });
    M.ev[l].push({ k: "game", text: M.versus ? `${M.players[w].name} 게임 승리!` : "상대 게임", win: false });
  }
  M.ball = null; M.wait = 1.5; M.cheer = 1.6;
}
// 경기 한 걸음 (0번 화면만 부름)
function step(M, dt, hooks) {
  M.t += dt; M.cheer = Math.max(0, M.cheer - dt);
  const B = M.ball;
  M.players.forEach((P, s) => {
    if (!P) return;
    P.swingT += dt;
    if (!P.auto) return;
    // 저절로 하는 선수(컴퓨터·점검용): 공 올 자리로 옆걸음, 알맞은 때 휘두름
    const goal = B && B.to === s && !B.swung ? B.spot : 0, d = goal - P.myX, sp = 4.2 * dt;
    const nx = P.myX + clamp(d, -sp, sp); P.vx = (nx - P.myX) / Math.max(dt, 1e-3); P.myX = nx;
    if (B && B.to === s && !B.swung && !B.autoDone && B.t / B.T >= SWEET - 0.03) {
      B.autoDone = true;
      const p = P.autoP - (P.cpu ? (B.far ? 0.12 : 0) + (B.q > 0.75 || B.smash ? 0.18 : 0) : 0);
      if (Math.random() < p) { P.swingT = 0; P.swingDir = Math.random() < 0.6 ? -1 : 1; P.swingHard = Math.random() < (P.cpu ? 0.08 : 0.15); P.amp = 1; P.autoQ = 0.3 + Math.random() * 0.6; }
    }
  });
  if (!B) {
    M.wait -= dt;
    if (M.wait <= 0 && M.players[0] && M.players[1]) {
      const srv = M.versus ? (M.games[0] + M.games[1]) % 2 : 1;      // 1인은 늘 상대가 보냄, 2인은 게임마다 서브 교대
      launch(M, srv, 1 - srv, { progress: hooks.progress() }); hooks.sound("whoosh");
    }
    return;
  }
  B.t += dt;
  const { k, p } = ballAt(B), r = B.to, R = M.players[r];
  if (k > KB && !B.bounced) { B.bounced = true; hooks.sound("tick"); }
  if (B.swung) return;
  if (k > WIN0 && k < WIN1 && R.swingT < 0.12) {
    if (!nearOf(M, r)) { if (!B.whiff && !R.auto) { B.whiff = true; M.ev[r].push({ k: "pop", text: "닿지 않아요! 점선 자리로", color: "#d07a00" }); } }
    else {
      B.swung = true;
      const smash = R.swingHard, q = R.auto && R.autoQ != null ? R.autoQ : 1 - Math.min(1, Math.abs(k - SWEET) / 0.17);
      R.stats.returns++; if (smash) R.stats.smashes++;
      M.ev[r].push({ k: "award", n: smash || q > 0.7 ? 2 : 1, text: smash ? "스매시!" : q > 0.7 ? "나이스 샷!" : R.swingDir < 0 ? "포핸드!" : "백핸드!", color: smash ? "#e0306a" : "#2f8f2f", at: p.clone(), smash });
      hooks.sound(smash ? "smash" : "hit");
      const pref = Math.random() < 0.7 ? SIDE(r) * R.swingDir * SIDE(1 - r) : 0;      // 휘두른 쪽으로
      launch(M, r, 1 - r, { p0: hooks.racketAt(r) || p, q, smash, pref, progress: hooks.progress() });
      return;
    }
  }
  if (k >= WIN1 + 0.1) {
    M.ev[r].push({ k: "missSound" });
    const winner = !!(M.players[1 - r] && (B.far || B.smash));
    if (winner) M.players[1 - r].stats.winners++;
    point(M, 1 - r, winner);
  }
}

/* ---------- 캐릭터 동작 ---------- */
// 실제 선수 팔(화면 관절)을 캐릭터 팔로: 손목·팔꿈치 위치로 들기·굽히기. 부드럽게 따라감
function followArms(av, pts, a) {
  if (!pts || !pts[11].v || !pts[12].v) return false;
  const sw = Math.hypot(pts[11].x - pts[12].x, pts[11].y - pts[12].y) || 1, st = av.userData.armSt || (av.userData.armSt = [[0.3, 0.4, 0.6], [0.6, 0.6, 0.8]]);
  [[11, 13, 15], [12, 14, 16]].forEach(([S, E, W], k) => {
    if (!pts[E].v || !pts[W].v) return;
    const side = k ? 1 : -1, ux = (pts[E].x - pts[S].x) * side, uy = pts[E].y - pts[S].y;
    const raise = clamp(Math.atan2(ux, uy), -0.3, 3.0);
    const a1 = Math.atan2(pts[E].y - pts[S].y, pts[E].x - pts[S].x), a2 = Math.atan2(pts[W].y - pts[E].y, pts[W].x - pts[E].x);
    const bend = clamp(Math.abs(((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI), 0, 2.4);
    const fwd = 0.3 + 0.4 * clamp(1 - Math.abs(pts[W].y - pts[S].y) / (sw * 1.6), 0, 1);
    const c = st[k];
    c[0] += (raise - c[0]) * a; c[1] += (fwd - c[1]) * a; c[2] += (bend - c[2]) * a;
    av.arm(k, c[0], c[1], c[2]);
  });
  return true;
}
// 휘두르기: 포핸드(오른쪽 뒤 → 왼쪽 앞, 몸 비틀기) · 백핸드(왼쪽에서 몸 앞을 가로질러) · 스매시(머리 위에서 내려치기). 크기는 휘두른 세기
function stroke(av, T, fore, hard, amp) {
  const dur = hard ? 0.22 : 0.3; if (T > dur + 0.22) return false;
  const u = clamp(T / dur, 0, 1), e = u * u * (3 - 2 * u), a = clamp(amp, 0.6, 1.3);
  av.body.rotation.x = 0.12 + (hard ? 0.3 * e : 0.08 * e);
  if (hard) { av.body.rotation.y = (0.5 - 1.1 * e) * a; av.arm(1, 2.9 - 1.9 * e, 0.2 + 1.2 * e, 0.4 - 0.3 * e); av.arm(0, 2.2 - 1.2 * e, 0.6, 0.5); }
  else if (fore) { av.body.rotation.y = (0.9 - 1.8 * e) * a; av.arm(1, 1.35 + 0.2 * Math.sin(e * Math.PI), -0.5 + 1.9 * e * a, 0.35); av.arm(0, 0.6 + 0.4 * e, 0.8, 0.9); }
  else { av.body.rotation.y = (-0.9 + 1.7 * e) * a; av.arm(1, -0.2 + 1.4 * e, 1.1 - 0.3 * e, 1.2 - 0.9 * e); av.arm(0, 0.5, 0.7, 1.3); }
  return true;
}
// 준비 자세(무릎 살짝 굽히고 앞으로) + 옆걸음(좌우로 움직일 때 다리를 번갈아)
function stance(av, P, dt, t) {
  const moving = Math.abs(P.vx) > 0.25;
  P.stepPh += moving ? Math.min(2.5, Math.abs(P.vx)) * dt * 9 : 0;
  const s = Math.sin(P.stepPh);
  av.leg(0, moving ? Math.max(0, s) * 0.6 : 0.14); av.leg(1, moving ? Math.max(0, -s) * 0.6 : 0.14);
  av.body.position.y = -0.04 + (moving ? Math.abs(s) * 0.04 : Math.abs(Math.sin(t * 2.4)) * 0.015);
}

export default {
  id: "tennis", title: "테니스", icon: "🎾", sec: 60, cursor: "", cat: "sport", bg: "#9be15d", desc: "좌우로 움직여 받아치기 · 2인 대결", scene3d: true,
  how: "몸을 좌우로 움직이면 캐릭터도 움직여요. 공이 오면 점선 자리로 가서, 공이 왔을 때 팔을 크게 휘둘러요. 딱 맞는 순간이면 강한 샷! 둘이 하면 서로 대결",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, slot = env.mode === 2 ? env.slot : 0, other = 1 - slot;
    let M;
    if (env.mode === 2) { if (!shared) shared = newMatch(true); M = shared; }
    else { M = newMatch(false); M.players[1] = newPlayer({ name: "상대", color: "#20c997", auto: true, cpu: true, autoP: CPU_RETURN[D.id] || 0.66, D }); }
    M.players[slot] = newPlayer({ name: env.name || `${slot + 1}P`, color: env.color || "#ff6b6b", D, auto: AUTO });
    const owner = slot === 0;
    const st = stage(env, { outfit: "tennis", fov: 52, sky: ["#58b7f5", "#d9f1ff"], shadowSize: 18 });
    const { scene, camera } = st;
    ground(scene, "#5aa646", 300);
    // 경기 좌표 묶음: 1번 선수 화면은 180° 돌려서 자기가 앞(+z)에 오게
    const W = new THREE.Group(); W.rotation.y = slot === 1 ? Math.PI : 0; scene.add(W);
    court(W);
    const avs = [null, null];
    function makeAvatar(s) {
      const P = M.players[s]; if (!P) return null;
      const a = P.cpu ? randomAvatar(1) : playerAvatar({ color: P.color, name: P.name });
      a.scale.setScalar(1.25); a.hold(1, racket(P.color)); W.add(a); return a;
    }
    avs[slot] = makeAvatar(slot);
    // 편마다 네트 앞 짝꿍(복식 느낌, 저절로 준비 자세)
    const mates = [0, 1].map(s => { const a = randomAvatar(s ? 4 : 2); a.scale.setScalar(1.25); a.hold(1, racket(s ? "#845ef7" : "#ffd43b")); a.position.set(SIDE(s) * -2.2, 0, SIDE(s) * 3.3); a.rotation.y = s === 0 ? Math.PI : 0; W.add(a); return a; });
    const tball = sphere(0.11, "#e4ff3a", { rough: 0.4 }); W.add(tball);
    const shadow = mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }), { cast: false }); shadow.rotation.x = -Math.PI / 2; W.add(shadow);
    const ring = mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), { cast: false }); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; W.add(ring);
    tball.visible = shadow.visible = ring.visible = false;
    // 몸으로 좌우 이동 + 이동 안내 (내 화면에서는 늘 내가 +z 쪽 → 세계 좌표 그대로)
    const mover = bodyMover(env, COURT_X, SPAN), guideM = moveGuide(scene);
    let t = 0, camX = 0;
    const me = () => M.players[slot];
    const near = () => nearOf(M, slot);
    const toScr = p => st.toScreen(W.localToWorld(p.clone()));
    const hooks = {
      progress: () => env.progress(),
      sound: n => { if (n === "whoosh") sfx.whoosh(); else if (n === "tick") sfx.tick(); else if (n === "hit") { sfx.hit(2); shake(v.U * 0.006, 0.12); } else if (n === "smash") { sfx.hit(3); shake(v.U * 0.012, 0.18); } },
      // 라켓 자리(경기 좌표): 그 선수 캐릭터의 라켓 손 조금 아래
      racketAt: s => { const a = avs[s]; if (!a) return null; const loc = W.worldToLocal(a.handWorld(1)); loc.y = Math.max(0.5, loc.y - 0.3); return loc; },
    };
    function drain() {
      const q = M.ev[slot]; if (!q.length) return;
      for (const e of q.splice(0)) {
        if (e.k === "award") {
          const s = e.at ? toScr(e.at) : { x: z.cx, y: v.H * 0.35 };
          env.award(e.n, s.x, s.y - v.U * 0.08);
          popup(s.x, s.y + v.U * 0.05, e.text, { size: v.U * (e.big ? 0.075 : e.smash ? 0.055 : 0.045), color: "#fff", stroke: e.color, life: e.big ? 1.1 : 0.8 });
          if (e.at) burst(s.x, s.y, { n: e.smash ? 20 : 14, colors: ["#e8ff6a", "#ffffff"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.4, size: v.U * 0.016, life: 0.5 });
          if (e.big) sfx.fever();
        } else if (e.k === "miss") env.miss(z.cx, v.H * 0.75, e.text);
        else if (e.k === "missSound") sfx.thud();
        else if (e.k === "pop") popup(z.cx, v.H * 0.62, e.text, { size: v.U * 0.04, color: "#fff", stroke: e.color, life: 0.9 });
        else if (e.k === "game") {
          if (e.win) { env.award(e.n, z.cx, v.H * 0.4); sfx.fanfare(); }
          popup(z.cx, v.H * 0.48, e.text, { size: v.U * (e.win ? 0.07 : 0.05), color: "#fff", stroke: e.win ? "#2fb65a" : "#555", life: 1.4 });
        }
      }
    }
    function animate(dt) {
      for (const s of [0, 1]) {
        const P = M.players[s]; if (!P) continue;
        if (!avs[s]) avs[s] = makeAvatar(s);
        const a = avs[s];
        a.position.set(SIDE(s) * P.myX, 0, SIDE(s) * (L + 0.5)); a.rotation.y = s === 0 ? Math.PI : 0;
        stance(a, P, dt, t + s);
        if (!stroke(a, P.swingT, P.swingDir < 0, P.swingHard, P.amp)) {
          a.body.rotation.y *= 0.8; a.body.rotation.x += (0.12 - a.body.rotation.x) * 0.2;
          if (!(P.pts && followArms(a, P.pts, Math.min(1, dt * 14)))) { a.arm(1, 0.6, 0.6, 0.6); a.arm(0, 0.35, 0.4, 0.6); }
        }
      }
      mates.forEach((a, s) => { a.arm(1, 0.5, 0.6, 0.6); a.arm(0, 0.3, 0.4, 0.5); a.leg(0, 0.14); a.leg(1, 0.14); a.body.rotation.x = 0.12; a.idle(t + s * 2); });
    }
    return {
      update(dt) {
        t += dt;
        const P = me();
        if (!P.auto) {
          const nx = mover.follow(P.myX, dt); P.vx = (nx - P.myX) / Math.max(dt, 1e-3); P.myX = nx;
          const hands = env.tracker.hands, fast = hands.find(h => h.vis && h.bodySpeed >= SWING * D.punch);
          if (fast && P.swingT > 0.5) { P.swingT = 0; P.swingDir = fast.vx > 0 ? 1 : -1; P.swingHard = fast.bodySpeed >= SMASH * D.punch && fast.vy > 0; P.amp = fast.bodySpeed / (SMASH * D.punch) + 0.5; }
        }
        P.pts = env.tracker.pts;
        if (owner) step(M, dt, hooks);
        if (!M.versus) M.ev[1].length = 0;
        drain();
        animate(dt);
        const B = M.ball;
        tball.visible = shadow.visible = !!B; ring.visible = false;
        if (B) {
          const { k, p } = ballAt(B);
          tball.position.copy(p); shadow.position.set(p.x, 0.04, p.z);
          if (B.to === slot && k < KB) { ring.visible = true; ring.position.x = B.bnc.x; ring.position.z = B.bnc.z; ring.scale.setScalar(1 + Math.sin(t * 8) * 0.08); }
        }
        const guide = !!B && B.to === slot && !B.swung;
        if (guide) guideM.show(P.myX, B.spot, L + 0.5, near(), t); else guideM.hide();
        st.pipMark = guide ? { x: mover.toScreenX(B.spot), ok: near() } : null;
        W.userData.fans.forEach(f => { f.position.y += Math.sin(t * (M.cheer ? 14 : 3) + f.userData.bob) * dt * (M.cheer ? 1.4 : 0.15); });
      },
      draw(ctx) {
        // 카메라: 내 캐릭터 뒤 위쪽에서 상대 코트를 봄 (내 캐릭터와 가야 할 자리가 함께 보이게)
        const P = me(), B = M.ball;
        const cx = B && B.to === slot && !B.swung ? (P.myX + B.spot) / 2 : P.myX;
        camX += (cx - camX) * 0.12;
        camera.position.set(camX * 0.75, 4.3, L + 7.2); camera.lookAt(camX * 0.55, 0, 4);
        st.draw(ctx);
        const U = v.U, bw = Math.min(z.w * 0.92, U * 0.8), bx = z.cx - bw / 2, by = v.H * 0.11, bh = U * 0.075;
        ctx.fillStyle = "rgba(10,30,70,.82)"; rr(ctx, bx, by, bw, bh, U * 0.02); ctx.fill();
        const A = M.players[0], Bp = M.players[1], s0 = M.score[0], s1 = M.score[1];
        const special = s0 >= 3 && s1 >= 3;
        const pts = special ? (s0 === s1 ? "듀스" : `어드밴티지 ${M.versus ? (s0 > s1 ? A : Bp).name : s0 > s1 ? "우리 편" : "상대"}`) : `${PTS[Math.min(3, s0)]} : ${PTS[Math.min(3, s1)]}`;
        const txt = M.versus
          ? (special ? `1P ${A ? A.name : ""} · ${pts} · ${Bp ? Bp.name : ""} 2P  ·  게임 ${M.games[0]}:${M.games[1]}` : `1P ${A ? A.name : ""} ${pts} ${Bp ? Bp.name : ""} 2P  ·  게임 ${M.games[0]}:${M.games[1]}`)
          : `게임 ${M.games[0]}:${M.games[1]}  ·  ${special ? pts : `우리 ${pts} 상대`}`;
        outlinedText(ctx, txt, z.cx, by + bh / 2, Math.min(U * 0.036, z.w / 17), "#fff", "#0a1e46", 3);
        if (M.versus && !Bp) outlinedText(ctx, "상대를 기다려요", z.cx, v.H * 0.25, Math.min(U * 0.045, z.w / 12), "#fff", "#555", 4);
        if (B && B.to === slot && !B.swung) {
          const ok = near();
          if (!ok) outlinedText(ctx, moveText(B.spot - P.myX, false), z.cx, v.H * 0.25, Math.min(U * 0.05, z.w / 12), "#fff", "#c07800", 4);
          else if (B.t / B.T > 0.45) outlinedText(ctx, "휘둘러요!", z.cx, v.H * 0.25, Math.min(U * 0.05, z.w / 10), "#fff", "#2f8f2f", 4);
          else outlinedText(ctx, "좋아요! 그 자리", z.cx, v.H * 0.25, Math.min(U * 0.045, z.w / 12), "#fff", "#2f8f2f", 4);
        } else if (M.versus && B && B.to === other && !B.swung) outlinedText(ctx, `${(M.players[other] || {}).name || "상대"} 차례`, z.cx, v.H * 0.25, Math.min(U * 0.04, z.w / 14), "#fff", "#555", 3);
      },
      stop() { st.dispose(); shared = null; },
      result: () => { const P = me(); return `받아친 공 ${P.stats.returns} · 위너 ${P.stats.winners} · 스매시 ${P.stats.smashes} · 게임 ${M.games[slot]}:${M.games[other]}`; },
      // 설명 시연용 (1인)
      get ball() { const B = M.ball; return B && B.to === slot ? { incoming: true, k: B.t / B.T, moveTo: mover.toScreenX(B.spot), near: near() } : B ? { incoming: false, k: B.t / B.T } : null; },
      get match() { return M; },   // 점검용
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.walk = 1.6;
      if (T < 4.5) say("테니스! 몸을 좌우로 움직이면 캐릭터도 따라 움직여요");
      else if (T < 9) say("공이 오면 점선 자리로 가서, 공이 왔을 때 팔을 크게 휘둘러요");
      else if (T < 13.5) say("상대가 못 받으면 위너! 둘이 하면 서로 대결해요");
      else say("이제 직접 해 봐요!");
      const b = g.ball, u = p.u, s = p.pts && p.pts[12];
      if (b && b.incoming) p.tcx = b.moveTo;                             // 점선 자리로 걸어감
      if (!b || !b.incoming || !s || !b.near) { p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }
      p.rest(0, "guard", 1);
      if (b.k < 0.9) p.reach(1, s.x + 1.6 * u, s.y + 0.2 * u, 1.6);    // 라켓 뒤로 빼기
      else p.reach(1, s.x - 1.8 * u, s.y - 0.2 * u, 3);                // 앞으로 휘두르기
    },
  },
};
