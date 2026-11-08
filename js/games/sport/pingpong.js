// 탁구 (스포츠 리조트처럼 3D): 실내 경기장, 내 캐릭터 뒤에서 탁구대를 봄
// 상대가 친 공이 내 쪽 탁구대에 한 번 튀고 오면 팔을 휘둘러 받아치기. 아주 세게 휘두르면 스매시(상대가 잘 못 받음)
// 몸을 좌우로 움직이면 캐릭터도 좌우로 움직임(옆걸음). 공이 오면 가야 할 자리를 점선으로 안내, 그 자리에서만 받아칠 수 있음
// 캐릭터의 라켓 팔은 내 손을 그대로 따라 하고, 휘두르면 휘두른 방향·세기대로 포핸드·백핸드·스매시 동작. 공은 라켓에 맞는 자리에서 날아감
// 1인: 컴퓨터 상대 · 2인: 한 탁구대에서 둘이 대결(각자 화면은 자기 쪽에서 봄). 11점 먼저(2점 차), 서브는 2점마다 바뀜
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=73";
import { sfx } from "../../audio.js?v=73";
import { stage, THREE, box, cyl, ball as sphere, mesh, playerAvatar, randomAvatar, racket, bodyMover, moveGuide, moveText, fan } from "./kit3d.js?v=73";

const FLIGHT = 1.1;    // 공이 상대에게서 나에게 오는 시간(초, 보통)
const SWING = 2.4;     // 받아치기로 인정하는 손 속도(어깨너비/초)
const SMASH = 7;       // 스매시 손 속도
const WIN0 = 0.72, WIN1 = 1.15;
const CPU_RETURN = { easy: 0.55, normal: 0.7, hard: 0.82 };
const TL = 1.37, TW = 0.76, TH = 0.76;   // 탁구대 반 길이·반 너비·높이(m)
const KB = 0.58;                          // 비행 중 탁구대에 튀는 순간(비율)
const RANGE = 1.0;     // 캐릭터가 움직일 수 있는 좌우 범위(m)
const REACH = 0.35;    // 표시한 자리에서 이만큼(m) 안에 있으면 받아칠 수 있음
const FORE = 0.4;      // 공이 몸 오른쪽(포핸드)에 오도록 자리와 공 사이 거리(m)
const GS = 0.45;       // 이동 안내(점선) 크기 비율 (탁구대에 맞게 작게)
const AUTO = /simauto=1/.test(typeof location !== "undefined" ? location.search : "");   // 점검용: 선수가 저절로 움직이고 침

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const arc = (a, b, h, u) => new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + 4 * h * u * (1 - u), a.z + (b.z - a.z) * u);
const SIDE = s => (s === 0 ? 1 : -1);    // 0번 선수는 +z 쪽, 1번(상대)은 -z 쪽. 각자 자기 오른쪽이 +x가 되게 '자기 좌표'를 씀 → 세계 x = SIDE × 자기 x

function arena(scene) {
  scene.background = new THREE.Color("#141c33");
  const floor = mesh(new THREE.PlaneGeometry(60, 60), "#2c4f8f", { receive: true, cast: false }); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const mat_ = mesh(new THREE.PlaneGeometry(7, 9), "#b8430f", { receive: true, cast: false }); mat_.rotation.x = -Math.PI / 2; mat_.position.y = 0.005; scene.add(mat_);
  // 탁구대: 파란 판 + 흰 테두리·가운데 줄 + 네트 + 다리
  const top = box(TW * 2, 0.04, TL * 2, "#1f5fbf", { receive: true, rough: 0.35 }); top.position.y = TH - 0.02; scene.add(top);
  const line = (w, d, x, z) => { const m = box(w, 0.005, d, "#ffffff", { cast: false }); m.position.set(x, TH + 0.002, z); scene.add(m); };
  line(TW * 2, 0.03, 0, TL - 0.015); line(TW * 2, 0.03, 0, -TL + 0.015); line(0.03, TL * 2, TW - 0.015, 0); line(0.03, TL * 2, -TW + 0.015, 0); line(0.006, TL * 2, 0, 0);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => { const l = box(0.06, TH - 0.04, 0.06, "#222"); l.position.set(sx * (TW - 0.15), (TH - 0.04) / 2, sz * (TL - 0.25)); scene.add(l); });
  const net = mesh(new THREE.PlaneGeometry(TW * 2 + 0.3, 0.15), new THREE.MeshStandardMaterial({ color: "#111", transparent: true, opacity: 0.6, side: THREE.DoubleSide }), { cast: false });
  net.position.set(0, TH + 0.075, 0); scene.add(net);
  const tape = box(TW * 2 + 0.3, 0.015, 0.012, "#fff"); tape.position.set(0, TH + 0.15, 0); scene.add(tape);
  // 둘레 펜스(광고판 색) · 관중석 · 조명 (양쪽 끝 모두 → 2인에서 반대쪽에서 봐도 경기장)
  const cols = ["#e03131", "#1971c2", "#f08c00", "#2f9e44"];
  [-1, 1].forEach(e => { for (let i = 0; i < 8; i++) { const b = box(2.1, 0.7, 0.08, cols[(i + (e > 0 ? 2 : 0)) % 4]); b.position.set(-7.35 + i * 2.1, 0.35, e * 6); scene.add(b); } });
  [-1, 1].forEach(s => { for (let i = 0; i < 5; i++) { const b = box(0.08, 0.7, 2.1, cols[(i + 1) % 4]); b.position.set(s * 4.5, 0.35, -5 + i * 2.2); scene.add(b); } });
  const fanCols = ["#ff8787", "#ffd43b", "#8ce99a", "#74c0fc", "#f783ac", "#ffa94d"];
  scene.userData.fans = [];
  [-1, 1].forEach(e => {
    for (let r = 0; r < 4; r++) {
      const step = box(18, 0.5, 1.2, "#3b4a6b"); step.position.set(0, 0.6 + r * 0.6, e * (8 + r * 1.1)); scene.add(step);
      for (let i = 0; i < 18; i++) { const f = fan(fanCols[(i + r * 2) % 6], 0.26, i + r * 5); f.position.set(-8.5 + i, 1.15 + r * 0.6, e * (8 + r * 1.1)); f.userData.bob = Math.random() * 6; scene.add(f); scene.userData.fans.push(f); }
    }
  });
  for (let i = 0; i < 4; i++) {   // 천장 조명
    const lamp = mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.25, 16), new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff8d0", emissiveIntensity: 1 }), { cast: false });
    lamp.position.set(-3 + i * 2, 7, -2 + (i % 2) * 2); scene.add(lamp);
  }
  const spot = new THREE.PointLight(0xfff3d0, 30, 20); spot.position.set(0, 5, 0); scene.add(spot);
}

/* ---------- 경기(match): 1인이면 이 화면만, 2인이면 두 화면이 함께 씀 ---------- */
let shared = null;      // 2인 대결용 (두 화면이 같은 경기를 봄). 0번 화면이 공을 움직이고 판정함
function newMatch(versus) {
  return { versus, players: [null, null], ball: null, wait: 1.2, score: [0, 0], games: [0, 0], pts: 0, ev: [[], []], cheer: 0, t: 0, over: 0 };
}
function newPlayer(o) {
  return { name: "", color: "#e03131", myX: 0, vx: 0, swingT: 9, swingDir: 1, swingHard: false, amp: 1, pts: null, auto: false, autoP: 0.85, D: null, stats: { returns: 0, smashes: 0, points: 0 }, stepPh: 0, ...o };
}
// 지금 자리에서 lo~hi(m) 떨어진 자리 (범위 안쪽으로). pref: 가고 싶은 쪽(+1 오른쪽, -1 왼쪽, 0 아무 쪽)
function spotFrom(x, lo, hi, min, max, pref = 0) {
  let sides = [-1, 1].filter(sd => x + sd * lo >= min && x + sd * lo <= max);
  if (pref && sides.includes(pref)) sides = [pref];
  const sd = sides.length ? sides[Math.floor(Math.random() * sides.length)] : (x > (min + max) / 2 ? -1 : 1);
  return clamp(x + sd * (lo + Math.random() * (hi - lo)), min, max);
}
const nearOf = (M, s) => !!M.ball && M.ball.to === s && Math.abs(M.players[s].myX - M.ball.spot) <= REACH * (M.players[s].D ? M.players[s].D.reach : 1);
// 공 보내기: from → to. 받는 사람 자기 좌표의 자리(spot)를 정하고, 공이 그 사람 포핸드 쪽으로 오게
function launch(M, from, to, { p0 = null, smash = false, pref = 0, progress = 0 } = {}) {
  const R = M.players[to], sd = SIDE(to), D = R.D || { speed: 1 };
  const [lo, hi] = M.versus ? [0.3, 0.75] : [0.45, 0.95];
  const spot = spotFrom(R.myX, lo, hi, -RANGE, TW + 0.2 - FORE, pref), hx = spot + FORE, wx = sd * hx;
  const F = M.players[from], start = p0 || V(SIDE(from) * (F.myX + 0.25), TH + 0.25, SIDE(from) * (TL + 0.3));
  M.ball = {
    from, to, spot, p0: start, bnc: V(wx * 0.8, TH + 0.035, sd * (0.45 + Math.random() * 0.6)), p1: V(wx, TH + (smash ? 0.18 : 0.3), sd * (TL + 0.45)),
    h1: smash ? 0.06 : 0.28, h2: 0.22, t: 0, T: (smash ? 0.72 : 1) * FLIGHT * (1 - 0.2 * progress) / (D.speed || 1), smash,
  };
}
function ballAt(b) {
  const k = b.t / b.T;
  return { k, p: k < KB ? arc(b.p0, b.bnc, b.h1, k / KB) : arc(b.bnc, b.p1, b.h2, (k - KB) / (1 - KB)) };
}
// 점수: 이긴 쪽 +1. 11점(2점 차)이면 게임. 서브는 2점마다 바뀜
function point(M, w) {
  const l = 1 - w;
  M.score[w]++; M.pts++; M.players[w].stats.points++;
  M.ev[w].push({ k: "award", n: 1, text: "득점!", color: "#e0306a" }); M.ev[l].push({ k: "miss", text: M.versus ? "상대 득점" : "놓쳤어요" });
  if ((M.score[w] >= 11 || M.score[l] >= 11) && Math.abs(M.score[w] - M.score[l]) >= 2) {
    M.games[w]++; M.score = [0, 0]; M.pts = 0;
    M.ev[w].push({ k: "game", n: 3, text: M.versus ? `${M.players[w].name} 게임 승리!` : "게임 승리!", win: true });
    M.ev[l].push({ k: "game", text: M.versus ? `${M.players[w].name} 게임 승리!` : "상대 게임", win: false });
  }
  M.ball = null; M.wait = 1.3; M.cheer = 1.4;
}
// 경기 한 걸음 (0번 화면만 부름). hooks.paddle(s): 그 선수 라켓의 경기 좌표, hooks.sound(name)
function step(M, dt, hooks) {
  M.t += dt; M.cheer = Math.max(0, M.cheer - dt);
  const B = M.ball;
  M.players.forEach((P, s) => {
    if (!P) return;
    P.swingT += dt;
    if (!P.auto) return;
    // 저절로 하는 선수(컴퓨터·점검용): 공 올 자리로 옆걸음, 알맞은 때 휘두름
    const goal = B && B.to === s && !B.swung ? B.spot : 0, d = goal - P.myX, sp = 1.8 * dt;
    const nx = P.myX + clamp(d, -sp, sp); P.vx = (nx - P.myX) / Math.max(dt, 1e-3); P.myX = nx;
    if (B && B.to === s && !B.swung && !B.autoDone && B.t / B.T >= 0.93) {
      B.autoDone = true;
      if (Math.random() < P.autoP - (B.smash ? 0.3 : 0)) { P.swingT = 0; P.swingDir = Math.random() < 0.5 ? 1 : -1; P.swingHard = Math.random() < (P.cpu ? 0.12 : 0.2); P.amp = 1; }
    }
  });
  if (!B) {
    M.wait -= dt;
    if (M.wait <= 0 && M.players[0] && M.players[1]) {
      const srv = M.versus ? Math.floor(M.pts / 2) % 2 : 1;      // 1인은 늘 컴퓨터가 서브
      launch(M, srv, 1 - srv, { progress: hooks.progress() }); hooks.sound("pop");
    }
    return;
  }
  B.t += dt;
  const { k, p } = ballAt(B), r = B.to, R = M.players[r];
  if (k > KB - 0.02 && !B.bounced) { B.bounced = true; hooks.sound("tick"); }
  if (B.swung) return;
  if (k > WIN0 && k < WIN1 && R.swingT < 0.12) {
    if (!nearOf(M, r)) { if (!B.whiff && !R.auto) { B.whiff = true; M.ev[r].push({ k: "pop", text: "닿지 않아요! 점선 자리로", color: "#d07a00" }); } }
    else {
      // 받아침: 공을 라켓 자리에서 상대 쪽으로. 휘두른 방향으로 감(받는 사람 자기 좌표로 바꿔서)
      B.swung = true;
      const smash = R.swingHard, q = 1 - Math.min(1, Math.abs(k - 0.95) / 0.2);
      R.stats.returns++; if (smash) R.stats.smashes++;
      M.ev[r].push({ k: "award", n: smash ? 2 : q > 0.7 ? 2 : 1, text: smash ? "스매시!" : R.swingDir < 0 ? "포핸드!" : "백핸드!", color: smash ? "#e0306a" : "#d06a00", at: p.clone(), smash });
      hooks.sound(smash ? "smash" : "hit");
      const pref = Math.random() < 0.7 ? SIDE(r) * R.swingDir * SIDE(1 - r) : 0;   // 휘두른 쪽으로 (받는 사람 자기 좌표로)
      const pad = hooks.paddle(r) || p;
      launch(M, r, 1 - r, { p0: pad, smash, pref, progress: hooks.progress() });
      return;
    }
  }
  if (k >= WIN1 + 0.08) { M.ev[r].push({ k: "missSound" }); point(M, 1 - r); }
}

/* ---------- 캐릭터 동작 ---------- */
// 실제 선수 팔(화면 관절)을 캐릭터 팔로: 손목·팔꿈치 위치로 들기·굽히기, 탁구대 쪽으로 앞으로 뻗기. 부드럽게 따라감
function followArms(av, pts, a) {
  if (!pts || !pts[11].v || !pts[12].v) return false;
  const sw = Math.hypot(pts[11].x - pts[12].x, pts[11].y - pts[12].y) || 1, st = av.userData.armSt || (av.userData.armSt = [[0.3, 0.5, 0.8], [0.6, 0.7, 0.9]]);
  [[11, 13, 15], [12, 14, 16]].forEach(([S, E, W], k) => {
    if (!pts[E].v || !pts[W].v) return;
    const side = k ? 1 : -1, ux = (pts[E].x - pts[S].x) * side, uy = pts[E].y - pts[S].y;
    const raise = clamp(Math.atan2(ux, uy), -0.3, 3.0);
    const a1 = Math.atan2(pts[E].y - pts[S].y, pts[E].x - pts[S].x), a2 = Math.atan2(pts[W].y - pts[E].y, pts[W].x - pts[E].x);
    const bend = clamp(Math.abs(((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI), 0, 2.4);
    const fwd = 0.45 + 0.45 * clamp(1 - Math.abs(pts[W].y - pts[S].y) / (sw * 1.6), 0, 1);   // 손이 어깨 높이 근처면 앞으로 더
    const c = st[k], w = a;
    c[0] += (raise - c[0]) * w; c[1] += (fwd - c[1]) * w; c[2] += (bend - c[2]) * w;
    av.arm(k, c[0], c[1], c[2]);
  });
  return true;
}
// 휘두르기: 세 장면(뒤로 뺌 → 공 맞는 순간 → 마무리)을 부드럽게 이어서. 값 = [몸 돌림, 오른팔 옆, 앞, 팔꿈치, 왼팔 옆, 앞, 팔꿈치]
// 탁구는 팔꿈치를 굽힌 채 짧게 휘두름(팔을 쭉 펴고 크게 돌리면 어색함). 스매시만 위에서 앞 아래로 크게
const STROKE = {
  fore:  [[0.5, 0.6, -0.1, 1.25, 0.45, 0.85, 1.2], [0.0, 0.45, 1.05, 1.0, 0.4, 0.7, 1.1], [-0.42, 0.22, 1.85, 1.45, 0.35, 0.55, 1.0]],
  back:  [[-0.22, -0.42, 0.75, 1.7, 0.35, 0.6, 1.0], [0.0, 0.08, 1.1, 1.1, 0.35, 0.6, 1.0], [0.14, 0.5, 1.35, 0.65, 0.35, 0.6, 1.0]],
  smash: [[0.55, 0.75, 2.7, 1.4, 0.6, 1.6, 0.6], [0.1, 0.42, 1.85, 0.45, 0.4, 1.0, 0.8], [-0.38, 0.02, 0.95, 0.6, 0.3, 0.6, 1.0]],
};
const IMPACT = 0.45;   // 휘두르는 시간 중 공 맞는 때(비율)
export function stroke(av, T, fore, hard, amp) {
  const dur = hard ? 0.22 : 0.3; if (T > dur + 0.2) return false;
  const u = clamp(T / dur, 0, 1), K = STROKE[hard ? "smash" : fore ? "fore" : "back"], a = clamp(amp, 0.7, 1.15);
  const [A, B, w] = u < IMPACT ? [K[0], K[1], u / IMPACT] : [K[1], K[2], (u - IMPACT) / (1 - IMPACT)], e = w * w * (3 - 2 * w);
  const v = A.map((x, i) => x + (B[i] - x) * e);
  av.body.rotation.x = 0.16 + (hard ? 0.18 * u : 0.05 * u);
  av.body.rotation.y = v[0] * a;
  av.arm(1, v[1], v[2], v[3]); av.arm(0, v[4], v[5], v[6]);
  return true;
}
// 준비 자세(무릎 살짝 굽히고 앞으로) + 옆걸음(좌우로 움직일 때 다리를 번갈아)
function stance(av, P, dt, t) {
  const moving = Math.abs(P.vx) > 0.12;
  P.stepPh += moving ? Math.min(1.5, Math.abs(P.vx)) * dt * 14 : 0;
  const s = Math.sin(P.stepPh);
  av.leg(0, moving ? Math.max(0, s) * 0.55 : 0.12); av.leg(1, moving ? Math.max(0, -s) * 0.55 : 0.12);
  av.body.position.y = -0.04 + (moving ? Math.abs(s) * 0.03 : Math.abs(Math.sin(t * 2.2)) * 0.012);
}

export default {
  id: "pingpong", title: "탁구", icon: "🏓", sec: 60, cursor: "", cat: "sport", bg: "#ffc3a0", desc: "좌우로 움직여 받아치기 · 2인 대결", scene3d: true,
  how: "몸을 좌우로 움직이면 캐릭터도 움직여요. 공이 오면 점선 자리로 가서, 공이 튀고 오면 팔을 휘둘러 받아쳐요. 아주 세게 휘두르면 스매시! 둘이 하면 서로 대결",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, slot = env.mode === 2 ? env.slot : 0, other = 1 - slot;
    // 경기: 2인은 둘이 함께 쓰는 경기, 1인은 컴퓨터 상대
    let M;
    if (env.mode === 2) { if (!shared) shared = newMatch(true); M = shared; }
    else { M = newMatch(false); M.players[1] = newPlayer({ name: "상대", color: "#e03131", auto: true, cpu: true, autoP: CPU_RETURN[D.id] || 0.7, D }); }
    M.players[slot] = newPlayer({ name: env.name || `${slot + 1}P`, color: env.color || "#e03131", D, auto: AUTO });
    const owner = slot === 0;
    const st = stage(env, { outfit: "pingpong", fov: 48, sky: ["#141c33", "#141c33"], shadowSize: 6 });
    const { scene, camera, hemi, sun } = st;
    arena(scene); hemi.intensity = 0.9; sun.position.set(2, 9, 4);
    // 경기 좌표 묶음: 1번 선수 화면은 180° 돌려서 자기가 앞(+z)에 오게
    const W = new THREE.Group(); W.rotation.y = slot === 1 ? Math.PI : 0; scene.add(W);
    const avs = [null, null];
    function makeAvatar(s) {
      const P = M.players[s]; if (!P) return null;
      const a = P.cpu ? randomAvatar(3) : playerAvatar({ color: P.color, name: P.name });
      a.scale.setScalar(P.cpu ? 1.1 : 1.0); a.hold(1, racket(P.color, true)); W.add(a); return a;
    }
    avs[slot] = makeAvatar(slot);
    const pb = sphere(0.035, "#ffffff", { rough: 0.3 }); W.add(pb);
    const ghosts = [0, 1, 2, 3, 4].map(i => { const g = mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.35 - i * 0.06 }), { cast: false }); W.add(g); return g; });
    const shadow = mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }), { cast: false }); shadow.rotation.x = -Math.PI / 2; W.add(shadow);
    const ring = mesh(new THREE.RingGeometry(0.09, 0.13, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), { cast: false }); ring.rotation.x = -Math.PI / 2; ring.position.y = TH + 0.006; W.add(ring);
    const trail = []; let lastBall = null;
    // 몸으로 좌우 이동 + 이동 안내 (내 화면 좌표 그대로: 내 쪽 탁구대 가장자리 위)
    const mover = bodyMover(env, RANGE), guideG = new THREE.Group(); guideG.scale.setScalar(GS); scene.add(guideG);
    guideG.position.y = TH + 0.004;
    const guideM = moveGuide(guideG), FEET_Z = TL - 0.2;
    let t = 0, camX = 0, lastSeenScore = "";
    const me = () => M.players[slot];
    const near = () => nearOf(M, slot);
    const toScr = p => st.toScreen(W.localToWorld(p.clone()));
    const hooks = {
      progress: () => env.progress(),
      sound: n => { if (n === "pop") sfx.pop(); else if (n === "tick") sfx.tick(); else if (n === "hit") sfx.hit(1); else if (n === "smash") { sfx.hit(3); shake(v.U * 0.01, 0.15); } },
      // 라켓 자리(경기 좌표): 그 선수 캐릭터의 라켓 손 + 라켓 판까지 조금
      paddle: s => { const a = avs[s]; if (!a) return null; const w = a.handWorld(1); const loc = W.worldToLocal(w); loc.y = Math.max(TH + 0.08, loc.y - 0.08); return loc; },
    };
    // 이 화면 선수에게 온 알림(점수·글자) 처리
    function drain() {
      const q = M.ev[slot]; if (!q.length) return;
      for (const e of q.splice(0)) {
        if (e.k === "award") {
          const s = e.at ? toScr(e.at) : { x: z.cx, y: v.H * 0.35 };
          env.award(e.n, s.x, s.y - v.U * 0.08);
          popup(s.x, s.y + v.U * 0.06, e.text, { size: v.U * (e.smash ? 0.055 : e.text === "득점!" ? 0.07 : 0.04), color: "#fff", stroke: e.color, life: 0.8 });
          if (e.at) burst(s.x, s.y, { n: e.smash ? 20 : 10, colors: ["#ffffff", "#ffb36b"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.4, size: v.U * 0.014, life: 0.5 });
          if (e.text === "득점!" && owner) sfx.fever();
        } else if (e.k === "miss") env.miss(z.cx, v.H * 0.75, e.text);
        else if (e.k === "missSound") { if (owner || !M.versus) sfx.thud(); }
        else if (e.k === "pop") popup(z.cx, v.H * 0.62, e.text, { size: v.U * 0.04, color: "#fff", stroke: e.color, life: 0.9 });
        else if (e.k === "game") {
          if (e.win) { env.award(e.n, z.cx, v.H * 0.4); sfx.fanfare(); }
          popup(z.cx, v.H * 0.48, e.text, { size: v.U * (e.win ? 0.07 : 0.05), color: "#fff", stroke: e.win ? "#2fb65a" : "#555", life: 1.4 });
        }
      }
    }
    // 두 캐릭터 그리기 준비: 자리·방향·옆걸음·팔(실제 손 따라 하기)·휘두르기
    function animate(dt) {
      for (const s of [0, 1]) {
        const P = M.players[s]; if (!P) continue;
        if (!avs[s]) avs[s] = makeAvatar(s);
        const a = avs[s];
        a.position.set(SIDE(s) * P.myX, 0, SIDE(s) * (TL + 0.75)); a.rotation.y = s === 0 ? Math.PI : 0;
        stance(a, P, dt, t + s);
        if (!stroke(a, P.swingT, P.swingDir < 0, P.swingHard, P.amp)) {
          a.body.rotation.y *= 0.8; a.body.rotation.x += (0.15 - a.body.rotation.x) * 0.2;   // 준비 자세: 살짝 앞으로
          if (!(P.pts && followArms(a, P.pts, Math.min(1, dt * 14)))) { a.arm(1, 0.55, 0.8, 1.0); a.arm(0, 0.35, 0.5, 0.8); }
        }
      }
    }
    return {
      update(dt) {
        t += dt;
        const P = me();
        // 내 몸 → 내 캐릭터 (좌우 위치, 실제 손, 휘두르기)
        if (!P.auto) {
          const nx = mover.follow(P.myX, dt); P.vx = (nx - P.myX) / Math.max(dt, 1e-3); P.myX = nx;
          const hands = env.tracker.hands, fast = hands.find(h => h.vis && h.bodySpeed >= SWING * D.punch);
          if (fast && P.swingT > 0.4) { P.swingT = 0; P.swingDir = fast.vx > 0 ? 1 : -1; P.swingHard = fast.bodySpeed >= SMASH * D.punch; P.amp = fast.bodySpeed / (SMASH * D.punch) + 0.4; }
        }
        P.pts = env.tracker.pts;
        if (owner) step(M, dt, hooks);                                   // 공·판정은 0번 화면이 맡음 (2인이면 두 선수 모두)
        if (!M.versus) M.ev[1].length = 0;                               // 1인: 컴퓨터 쪽 알림은 버림
        drain();
        animate(dt);
        // 공·자국·그림자
        const B = M.ball;
        if (B !== lastBall) { trail.length = 0; lastBall = B; }
        pb.visible = shadow.visible = !!B; ring.visible = false;
        if (B) {
          const { k, p } = ballAt(B);
          pb.position.copy(p);
          const onTable = Math.abs(p.x) < TW && Math.abs(p.z) < TL;
          shadow.position.set(p.x, onTable ? TH + 0.004 : 0.01, p.z);
          trail.unshift(p.clone()); if (trail.length > 10) trail.pop();
          if (B.to === slot && k < KB) { ring.visible = true; ring.position.x = B.bnc.x; ring.position.z = B.bnc.z; }
        }
        ghosts.forEach((g, i) => { const q = B && trail[i * 2 + 2]; g.visible = !!q; if (q) g.position.copy(q); });
        // 받을 차례인 선수에게만 이동 안내
        const guide = !!B && B.to === slot && !B.swung;
        if (guide) guideM.show(P.myX / GS, B.spot / GS, FEET_Z / GS, near(), t); else guideM.hide();
        st.pipMark = guide ? { x: mover.toScreenX(B.spot), ok: near() } : null;
        scene.userData.fans.forEach(f => { f.position.y += Math.sin(t * (M.cheer ? 14 : 3) + f.userData.bob) * dt * (M.cheer ? 1.2 : 0.12); });
      },
      draw(ctx) {
        // 카메라: 내 캐릭터 뒤 위쪽에서 탁구대를 내려다봄
        const P = me(), B = M.ball, narrow = camera.aspect < 1.2 ? 1 : 0;   // 2인 화면(좁은 구역)은 조금 뒤에서
        const cx = B && B.to === slot && !B.swung ? (P.myX + B.spot) / 2 : P.myX;
        camX += (cx - camX) * 0.12;
        camera.position.set(camX * 0.75 + 0.3, 3.1 + narrow * 0.5, TL + 3.1 + narrow * 1.3); camera.lookAt(camX * 0.3, 0.6, -1.0);
        st.draw(ctx);
        const U = v.U, bw = Math.min(z.w * 0.92, U * 0.8), by = v.H * 0.11, bh = U * 0.075;
        ctx.fillStyle = "rgba(120,30,10,.85)"; rr(ctx, z.cx - bw / 2, by, bw, bh, U * 0.02); ctx.fill();
        const A = M.players[0], Bp = M.players[1];
        const txt = M.versus
          ? `1P ${A ? A.name : ""} ${M.score[0]} : ${M.score[1]} ${Bp ? Bp.name : ""} 2P  ·  게임 ${M.games[0]}:${M.games[1]}`
          : `나 ${M.score[0]} - ${M.score[1]} 상대  ·  게임 ${M.games[0]}:${M.games[1]}`;
        outlinedText(ctx, txt, z.cx, by + bh / 2, Math.min(U * 0.036, z.w / 17), "#fff", "#4a1004", 3);
        if (M.versus && !Bp) outlinedText(ctx, "상대를 기다려요", z.cx, v.H * 0.27, Math.min(U * 0.045, z.w / 12), "#fff", "#555", 4);
        if (B && B.to === slot && !B.swung) {
          const ok = near();
          if (!ok) outlinedText(ctx, moveText((B.spot - P.myX) * 3, false), z.cx, v.H * 0.27, Math.min(U * 0.05, z.w / 12), "#fff", "#c07800", 4);   // 어디로 얼마나
          else if (B.t / B.T > 0.4) outlinedText(ctx, "휘둘러요!", z.cx, v.H * 0.27, Math.min(U * 0.05, z.w / 10), "#fff", "#d06a00", 4);
          else outlinedText(ctx, "좋아요! 그 자리", z.cx, v.H * 0.27, Math.min(U * 0.045, z.w / 12), "#fff", "#2f8f2f", 4);
        } else if (M.versus && B && B.to === other && !B.swung) outlinedText(ctx, `${Bp && slot === 0 ? Bp.name : A ? A.name : "상대"} 차례`, z.cx, v.H * 0.27, Math.min(U * 0.04, z.w / 14), "#fff", "#555", 3);
      },
      stop() { st.dispose(); shared = null; },
      result: () => {
        const P = me();
        return `받아친 공 ${P.stats.returns} · 스매시 ${P.stats.smashes} · 득점 ${P.stats.points} · 게임 ${M.games[slot]}:${M.games[other]}`;
      },
      // 설명 시연용 (1인)
      get ball() { const B = M.ball; return B && B.to === slot ? { incoming: true, k: B.t / B.T, moveTo: mover.toScreenX(B.spot), near: near() } : B ? { incoming: false, k: B.t / B.T } : null; },
      get match() { return M; },   // 점검용
    };
  },
  demo: {
    dur: 14,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.walk = 1.6;
      if (T < 4.5) say("탁구! 몸을 좌우로 움직여 점선 자리로 가요");
      else if (T < 9) say("아주 세게 휘두르면 스매시! 상대가 잘 못 받아요");
      else if (T < 12.5) say("둘이 하면 서로 대결해요!");
      else say("이제 직접 해 봐요!");
      const b = g.ball, u = p.u, s = p.pts && p.pts[12], fast = T > 4.5 && T < 9;
      if (b && b.incoming && b.moveTo != null) p.tcx = b.moveTo;            // 점선 자리로 걸어감
      if (!b || !b.incoming || !s || !b.near) { p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }
      p.rest(0, "guard", 1);
      if (b.k < (fast ? 0.86 : 0.8)) p.reach(1, s.x + 1.4 * u, s.y + 0.6 * u, 1.6);       // 뒤로 빼기
      else p.reach(1, s.x - 1.6 * u, s.y + 0.2 * u, fast ? 4.5 : 0.9);                    // 보통은 살살, 스매시 구간은 아주 세게
    },
  },
};
