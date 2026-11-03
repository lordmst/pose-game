// 카메라 · 자세 인식 · 선수별 손 추적
const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const VIS = 0.5;                 // 이 값보다 신뢰도가 낮은 관절은 '안 보임'으로 처리

// ?sim=1 / ?sim=2 : 카메라 없이 가상 선수로 동작 (개발·점검용)
export const SIM = (() => { const m = location.search.match(/sim=(\d)/); return m ? Math.min(2, +m[1]) : 0; })();

const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
let mpP = null;     // 몸 인식·손 인식이 같은 엔진을 함께 씀
function loadMP() {
  return mpP || (mpP = import(MP_URL).then(async mod => ({ mod, vision: await mod.FilesetResolver.forVisionTasks(MP_URL + "/wasm") })));
}

export async function createDetector() {
  if (SIM) return new SimDetector(SIM);
  const { mod: { PoseLandmarker }, vision } = await loadMP();
  const opts = delegate => ({
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: "VIDEO", numPoses: 3,      // 선수 2명 + 조작하는 사람 1명까지 감지해야 선수를 놓치지 않음
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  let lm;
  try { lm = await PoseLandmarker.createFromOptions(vision, opts("GPU")); }
  catch (e) { lm = await PoseLandmarker.createFromOptions(vision, opts("CPU")); }
  let lastTs = 0;
  return {
    detect(video, ts) {
      if (ts <= lastTs) ts = lastTs + 1;
      lastTs = ts;
      return lm.detectForVideo(video, ts).landmarks || [];
    },
  };
}

/* ---------- 손 모양(편 손 / 주먹) 판정 ----------
   몸 인식 모델은 손가락을 모르므로 손 전용 모델을 씀.
   2~3m 떨어지면 손이 작게 찍히므로, 손목 주변만 잘라 크게 확대한 뒤 판정 */
const CROP = 224;
export async function createHandShape() {
  if (SIM) return /palm=1/.test(location.search) ? { check: (v, x, y, s, k) => (k === 0 ? "open" : "closed") } : null;   // 점검용: 왼손 펴고 오른손 주먹
  const { mod: { HandLandmarker }, vision } = await loadMP();
  const opts = delegate => ({ baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: "IMAGE", numHands: 1, minHandDetectionConfidence: 0.35, minHandPresenceConfidence: 0.35 });
  let hl;
  try { hl = await HandLandmarker.createFromOptions(vision, opts("GPU")); }
  catch (e) { hl = await HandLandmarker.createFromOptions(vision, opts("CPU")); }
  const cv = document.createElement("canvas"); cv.width = cv.height = CROP;
  const c2 = cv.getContext("2d");
  return {
    // (cx, cy, size): 영상 픽셀 기준 손 중심과 잘라낼 크기 → "open" | "closed" | "unsure"(애매) | null(손을 못 찾음)
    check(video, cx, cy, size) {
      const vw = video.videoWidth, vh = video.videoHeight;
      let sx = cx - size / 2, sy = cy - size / 2, sw = size, sh = size;
      const x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(vw, sx + sw), y1 = Math.min(vh, sy + sh);
      if (x1 - x0 < 8 || y1 - y0 < 8) return null;
      const k = CROP / size;
      c2.fillStyle = "#000"; c2.fillRect(0, 0, CROP, CROP);
      c2.drawImage(video, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * k, (y0 - sy) * k, (x1 - x0) * k, (y1 - y0) * k);
      const r = hl.detect(cv), L = r.landmarks && r.landmarks[0];
      return L ? classifyHand(L) : null;
    },
  };
}
// 손가락 끝이 둘째 마디보다 손목에서 충분히 멀면 '펴짐'. 4손가락 중 3개 이상 펴짐 → 편 손, 1개 이하 → 주먹
export function classifyHand(L) {
  const d = (a, b) => Math.hypot(L[a].x - L[b].x, L[a].y - L[b].y);
  let ext = 0;
  for (const [pip, tip] of [[6, 8], [10, 12], [14, 16], [18, 20]]) if (d(tip, 0) > d(pip, 0) * 1.12) ext++;
  return ext >= 3 ? "open" : ext <= 1 ? "closed" : "unsure";
}

export class Camera {
  constructor(video) { this.video = video; this.stream = null; this.vw = 1280; this.vh = 720; this.m = { s: 1, ox: 0, oy: 0, W: 0 }; this.sim = !!SIM; }
  async open() {
    if (this.sim) return;
    let err = null;
    // Safari는 세부 해상도 조건을 거부하는 경우가 있어 단계적으로 완화
    for (const c of [{ facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, { facingMode: "user" }, true]) {
      try { this.stream = await navigator.mediaDevices.getUserMedia({ video: c, audio: false }); break; }
      catch (e) { err = e; if (e && e.name === "NotAllowedError") break; }
    }
    if (!this.stream) throw err || new Error("camera");
    this.video.srcObject = this.stream;
    await new Promise(r => { if (this.video.readyState >= 1) r(); else this.video.onloadedmetadata = () => r(); });
    await this.video.play().catch(() => {});
  }
  close() { if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; this.video.srcObject = null; }
  get ready() { return this.sim || (this.video.readyState >= 2 && this.video.videoWidth > 0); }
  layout(W, H) {
    if (!this.sim && this.video.videoWidth) { this.vw = this.video.videoWidth; this.vh = this.video.videoHeight; }
    const s = Math.max(W / this.vw, H / this.vh);   // 화면을 꽉 채우도록(넘치는 부분은 잘림)
    this.m = { s, ox: (W - this.vw * s) / 2, oy: (H - this.vh * s) / 2, W };
  }
  // 영상 좌표(0~1) → 화면 좌표(px), 거울처럼 좌우 반전
  toScreen(p) { const m = this.m; return { x: m.W - (m.ox + p.x * this.vw * m.s), y: m.oy + p.y * this.vh * m.s }; }
  draw(ctx, W, H) {
    if (this.sim) {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#5b6f80"); g.addColorStop(1, "#2b3540");
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40); return;
    }
    if (!this.ready) { ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H); return; }
    const m = this.m;
    ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.drawImage(this.video, m.ox, m.oy, this.vw * m.s, this.vh * m.s);
    ctx.restore();
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export class Hand {
  constructor() { this.vis = false; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.speed = 0; this.bodySpeed = 0; this.hist = []; this.shape = "unknown"; this.shapeT = -9; }
  lose() { this.vis = false; this.hist.length = 0; this.speed = 0; this.bodySpeed = 0; this.vx = this.vy = 0; this.shape = "unknown"; }
  // 손 모양 판정 결과 반영. 0.8초 넘게 판정을 못 하면 '모름'
  setShape(r, t) { if (r === "open" || r === "closed") { this.shape = r; this.shapeT = t; } else if (r === "unsure") this.shapeT = t; }
  ageShape(t) { if (t - this.shapeT > 0.8) this.shape = "unknown"; }
  update(x, y, t, dt, scale) {
    if (!this.vis) { this.x = x; this.y = y; this.hist.length = 0; }
    else { const a = 1 - Math.exp(-dt / 0.035); this.x += (x - this.x) * a; this.y += (y - this.y) * a; }   // 떨림 완화
    this.vis = true;
    this.hist.push({ t, x: this.x, y: this.y });
    while (this.hist.length > 2 && t - this.hist[1].t >= 0.1) this.hist.shift();     // 최근 0.1초 구간으로 속도 계산
    const o = this.hist[0], d = t - o.t;
    if (d > 0.02) { this.vx = (this.x - o.x) / d; this.vy = (this.y - o.y) / d; } else { this.vx = this.vy = 0; }
    this.speed = Math.hypot(this.vx, this.vy);
    this.bodySpeed = this.speed / scale;       // 어깨너비/초 단위 → 카메라와의 거리에 상관없이 비교 가능
  }
}

export class Tracker {
  constructor(slot) { this.slot = slot; this.pts = null; this.present = false; this.lostT = 9; this.hands = [new Hand(), new Hand()]; this.active = -1; this.scale = 0; this.fullBody = false; this.lowerT = 0; this.meters = 0; }
  update(raw, cam, dt, t, visSupported) {
    if (!raw) { this.present = false; this.lostT += dt; this.pts = null; this.raw = null; this.fullBody = false; this.hands.forEach(h => h.lose()); this.active = -1; this.lowerT = Math.max(0, this.lowerT - dt); return; }
    this.present = true; this.lostT = 0; this.raw = raw;
    const pts = raw.map(p => {
      const s = cam.toScreen(p);
      const inFrame = p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
      s.v = inFrame && (!visSupported || (p.visibility == null ? 1 : p.visibility) > VIS);
      return s;
    });
    this.pts = pts;
    const sc = Math.max(dist(pts[11], pts[12]), dist(mid(pts[11], pts[12]), mid(pts[23], pts[24])) * 0.7, 20);
    this.scale = this.scale ? this.scale * 0.85 + sc * 0.15 : sc;
    this.fullBody = [11, 12, 15, 16, 23, 24].every(i => pts[i].v);
    this.lowerT = [25, 26].every(i => pts[i].v) ? 2 : Math.max(0, this.lowerT - dt);
    [[15, 13], [16, 14]].forEach(([w, e], k) => {
      const W = pts[w], E = pts[e], h = this.hands[k];
      if (!W.v) { h.lose(); return; }
      // 손목에서 팔꿈치 반대 방향으로 조금 연장 → 주먹 중심
      const x = E.v ? W.x + (W.x - E.x) * 0.3 : W.x, y = E.v ? W.y + (W.y - E.y) * 0.3 : W.y;
      h.update(x, y, t, dt, this.scale);
      if (h.bodySpeed > 0.6) this.meters += h.bodySpeed * dt * 0.4;   // 어깨너비 ≈ 0.4m 가정
    });
    this.pickActive(pts);
  }
  /* 하나만 고르는 게임·메뉴에서 쓸 '한 손'
     1순위: 허리 위로 올려 손바닥을 편 손 (주먹 쥔 손, 힘 빼고 내려 둔 손은 무시)
     2순위: 손 모양을 판정 못 할 때(멀거나 흐릴 때)는 허리 위로 올린 손
     둘 다 해당하면 더 높이 든 손. 조금만(어깨너비 15%) 더 높아도 바뀌므로 한쪽에 고정되지 않음 */
  pickActive(pts) {
    const hipY = pts[23].v && pts[24].v ? (pts[23].y + pts[24].y) / 2 : (pts[11].y + pts[12].y) / 2 + this.scale * 1.4;
    const rank = this.hands.map(h => !h.vis || h.y >= hipY || h.shape === "closed" ? 0 : h.shape === "open" ? 2 : 1);
    const best = Math.max(rank[0], rank[1]);
    if (best === 0) { this.active = -1; return; }
    if (rank[0] !== rank[1]) { this.active = rank[0] > rank[1] ? 0 : 1; return; }
    const cur = this.active;
    if (cur >= 0) { const o = 1 - cur; if (this.hands[o].y < this.hands[cur].y - this.scale * 0.15) this.active = o; }
    else this.active = this.hands[0].y <= this.hands[1].y ? 0 : 1;
  }
  get activeHand() { return this.active >= 0 ? this.hands[this.active] : null; }
  get lowerSeen() { return this.lowerT > 0; }
}

/* ---------- 선수 배정: '만세'를 한 사람만 선수로 인정 ----------
   1) 어깨가 보이는 사람이 두 팔을 머리 위로 올려 CLAIM_SEC 동안 유지하면 그 자리의 선수가 됨
      (태블릿을 들고 있는 사람, 구경하는 사람은 만세를 하지 않으므로 선수가 되지 않음)
   2) 화면의 사람마다 번호를 붙여(위치가 이어지고 몸 크기가 비슷해야 같은 사람) 따라가고, 선수는 자기 번호로만 따라감
      → 다른 사람이 앞으로 걸어 들어오거나 선수 앞을 지나가도 선수가 바뀌지 않음 (가까이 온 사람은 몸 크기가 확 달라서 구분됨)
   3) 게임 밖(메뉴·자리 잡기)에서는 다른 사람이 같은 구역에서 만세하면 선수가 바뀜. 게임 중에는 안 바뀜
   4) 사람마다 윗옷 색(몸통 색)을 기억함. 선수가 가려진 사이 비슷한 크기의 사람이 그 자리를 지나가도
      옷 색이 다르면 선수로 착각하지 않음
   5) 선수가 오래 안 보여도 해제하지 않고 기다림. 다시 보이면(옷 색·위치가 맞으면) 만세 없이 그대로 이어서 인식.
      그래도 못 찾으면 그 자리에서 만세하면 다시 인식 */
export const CLAIM_SEC = 0.7;
// 만세 판정 (선수 인식용). 예전엔 엉덩이까지 보이고 두 손목이 화면 안에서 코보다 위여야 했음 → 가까이 서거나 손이 화면 위로 나가면 실패
// 지금: 두 어깨만 보이면 되고, 팔마다 ① 손목이 머리보다 위 또는 ② 팔꿈치가 어깨보다 확실히 위(손목은 화면 밖이어도 됨)면 '든 팔'
export function armsUp(r, cam, visSupported) {
  const conf = (p, v) => !visSupported || (p.visibility == null ? 1 : p.visibility) > v;
  const inX = p => p.x > -0.05 && p.x < 1.05;
  if (![11, 12].every(i => inX(r[i]) && r[i].y > -0.02 && r[i].y < 1.02 && conf(r[i], VIS))) return false;
  const S = i => cam.toScreen(r[i]), a = S(11), b = S(12), sw = Math.hypot(a.x - b.x, a.y - b.y) || 1, shY = (a.y + b.y) / 2;
  const headY = conf(r[0], 0.3) && r[0].y > -0.02 ? Math.min(S(0).y, shY - 0.6 * sw) : shY - 0.9 * sw;
  const usable = p => inX(p) && (conf(p, 0.25) || p.y < 0.03);      // 화면 위로 나간 관절은 신뢰도가 낮아도 씀
  const side = (el, wr) => {
    const W = S(wr), E = S(el), wOk = usable(r[wr]), eOk = usable(r[el]);
    if (wOk && W.y < headY) return true;                                                  // 손목이 머리보다 위
    return eOk && E.y < shY - 0.35 * sw && (!wOk || W.y < E.y + 0.25 * sw);               // 팔꿈치가 어깨보다 위로 쭉
  };
  return side(13, 15) && side(14, 16);
}
const LOST_SEC = 3.0;   // 사람 번호(track)는 이만큼(초) 안 보이면 지움. 선수 자리는 지우지 않고 '찾는 중'으로 기다림
// 몸통 색 표(윗몸통·아랫몸통 각각 밝기 Y와 색 Cb·Cr) 사이의 차이. 같은 옷 ≈ 0.03~0.08, 다른 옷 ≈ 0.3 이상
export function sigDist(a, b) {
  if (!a || !b) return -1;
  let s = 0;
  for (let k = 0; k < a.length; k += 3) s += (a[k] - b[k]) ** 2 * 1.0 + (2 * (a[k + 1] - b[k + 1])) ** 2 + (2 * (a[k + 2] - b[k + 2])) ** 2;
  return Math.sqrt(s / (a.length / 3));
}
const SIG_REJECT = 0.26;   // 가려졌다 나타난 사람의 옷 색 차이가 이보다 크면 다른 사람
const SIG_SAME = 0.17;     // 이보다 작으면 같은 사람으로 보고 다시 이어 붙임
// 카메라 화면에서 사람마다 몸통 색을 뽑음 (작게 줄인 화면에서 몸통 안쪽 점 30개의 평균)
export class SigSampler {
  constructor() { this.cv = document.createElement("canvas"); this.ctx = this.cv.getContext("2d", { willReadFrequently: true }); this.data = null; }
  frame(video) {
    this.data = null;
    const vw = video && (video.videoWidth || video.width), vh = video && (video.videoHeight || video.height);
    if (!vw || !vh) return;
    const w = 96, h = Math.max(1, Math.round(96 * vh / vw));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    try { this.ctx.drawImage(video, 0, 0, w, h); this.data = this.ctx.getImageData(0, 0, w, h).data; } catch (e) { this.data = null; }
  }
  sig(r) {
    if (r.sig) return r.sig;                       // 가상 선수(점검용)
    const D = this.data; if (!D) return null;
    const w = this.cv.width, h = this.cv.height, A = r[11], B = r[12];
    if (!A || !B) return null;
    const asp = w / h, swx = (A.x - B.x), swy = (A.y - B.y) / asp, sw = Math.hypot(swx, swy);
    if (sw < 0.02) return null;
    // 엉덩이가 화면 안에 보이면 그 사이, 아니면 어깨 아래로 어깨너비 1.3배까지를 몸통으로 봄
    const hipOk = [23, 24].every(i => r[i] && r[i].y < 0.98 && (r[i].visibility == null || r[i].visibility > 0.4));
    const C = hipOk ? r[24] : { x: B.x, y: B.y + 1.3 * sw * asp }, Dd = hipOk ? r[23] : { x: A.x, y: A.y + 1.3 * sw * asp };
    const out = new Float32Array(6), n = [0, 0];
    for (let j = 0; j < 6; j++) for (let i = 0; i < 5; i++) {
      const u = 0.22 + 0.56 * i / 4, v = 0.14 + 0.72 * j / 5;
      const tx = B.x + (A.x - B.x) * u, ty = B.y + (A.y - B.y) * u, bx = C.x + (Dd.x - C.x) * u, by = C.y + (Dd.y - C.y) * u;
      const x = tx + (bx - tx) * v, y = ty + (by - ty) * v;
      if (x < 0 || x >= 1 || y < 0 || y >= 1) continue;
      const o = (Math.floor(y * h) * w + Math.floor(x * w)) * 4, R = D[o] / 255, G = D[o + 1] / 255, Bl = D[o + 2] / 255;
      const g = j < 3 ? 0 : 1, Y = 0.299 * R + 0.587 * G + 0.114 * Bl;
      out[g * 3] += Y; out[g * 3 + 1] += (Bl - Y) * 0.564; out[g * 3 + 2] += (R - Y) * 0.713; n[g]++;
    }
    if (n[0] < 6 || n[1] < 6) return null;          // 몸통이 거의 화면 밖
    for (let g = 0; g < 2; g++) for (let k = 0; k < 3; k++) out[g * 3 + k] /= n[g];
    return out;
  }
}
export class Assigner {
  constructor(n) {
    this.n = n; this.locks = Array.from({ length: n }, () => null);
    this.claims = Array.from({ length: n }, () => ({ t: 0, x: 0, y: 0, sc: 0, tid: -1 }));   // 만세 진행 중인 사람
    this.ignored = []; this.tracks = []; this.nextId = 1;
  }
  reset() { this.locks = this.locks.map(() => null); this.claims.forEach(c => { c.t = 0; c.tid = -1; }); }
  claimProgress(i) { return Math.min(1, this.claims[i].t / CLAIM_SEC); }
  // 화면에 보이는 사람마다 번호(track)를 붙여 따라감: 위치가 이어지고 크기가 비슷해야 같은 사람.
  // 앞으로 걸어 들어온 사람은 갑자기 크게(가깝게) 보이므로 선수와 다른 사람으로 구분됨
  matchTracks(cands, dt, view) {
    const pairs = [];
    for (const T of this.tracks) {
      const px = T.x + T.vx * Math.min(T.miss + dt, 0.3), py = T.y + T.vy * Math.min(T.miss + dt, 0.3);
      for (const c of cands) {
        const ratio = c.sz / T.sz;
        if (ratio < 0.67 || ratio > 1.5) continue;                                   // 크기가 확 달라지면 다른 사람
        const d = Math.hypot(c.cx - px, c.cy - py);
        if (d > T.sz * (1.0 + 2.5 * Math.min(T.miss, 1.5)) + view.U * 0.03) continue;  // 너무 멀리 튀면 다른 사람 (안 보인 시간만큼 넉넉히)
        // 옷 색: 잠깐이라도 안 보였던 사람(가려졌던 선수)에게는 옷 색이 맞아야만 이어 붙임 → 지나가던 사람이 선수 자리를 뺏지 못함
        const sd = T.sigN >= 6 && !c.mixed ? sigDist(T.sig, c.sig) : -1;
        if (sd > SIG_REJECT && (T.miss > 0.08 || d > T.sz * 0.6)) continue;
        pairs.push({ T, c, cost: d / T.sz + 2.5 * Math.abs(Math.log(ratio)) + (sd > 0 ? 4 * sd : 0) });
      }
    }
    pairs.sort((a, b) => a.cost - b.cost);
    for (const T of this.tracks) T.cand = null;
    for (const { T, c, cost } of pairs) {
      if (T.cand || c.tid) continue;
      T.cand = c; c.tid = T.id;
      const k = Math.min(1, dt / 0.15);
      T.vx += ((c.cx - T.x) / Math.max(dt, 0.016) - T.vx) * k; T.vy += ((c.cy - T.y) / Math.max(dt, 0.016) - T.vy) * k;
      // 옷 색 기억: 다른 사람과 겹치지 않고 계속 보일 때만 조금씩 갱신 (조명 변화는 따라가고, 겹친 사람 색은 안 섞임)
      if (c.sig && !c.mixed && T.miss === 0) { if (!T.sig) { T.sig = Float32Array.from(c.sig); T.sigN = 1; } else { const a = T.sigN < 10 ? 1 / (T.sigN + 1) : 0.04; for (let q = 0; q < 6; q++) T.sig[q] += (c.sig[q] - T.sig[q]) * a; T.sigN++; } }
      T.x = c.cx; T.y = c.cy; T.sz = T.sz * 0.8 + c.sz * 0.2; T.sc = c.sc; T.miss = 0;
    }
    for (const T of this.tracks) if (!T.cand) { T.miss += dt; T.vx *= 0.9; T.vy *= 0.9; }
    this.tracks = this.tracks.filter(T => T.miss <= LOST_SEC);
    for (const c of cands) if (!c.tid) { const T = { id: this.nextId++, x: c.cx, y: c.cy, vx: 0, vy: 0, sz: c.sz, sc: c.sc, miss: 0, cand: c, sig: c.sig && !c.mixed ? Float32Array.from(c.sig) : null, sigN: c.sig && !c.mixed ? 1 : 0, born: this.now }; c.tid = T.id; this.tracks.push(T); }
  }
  assign(raws, cam, view, dt, visSupported, allowTakeover, sampler) {
    this.now = (this.now || 0) + dt;
    const cands = raws.map(r => {
      const a = cam.toScreen(r[11]), b = cam.toScreen(r[12]), sc = Math.hypot(a.x - b.x, a.y - b.y);
      // 몸 크기: 어깨너비와 몸통 길이 중 큰 쪽 (옆으로 돌아서 어깨너비가 줄어도 크기는 그대로)
      let sz = sc;
      if (r[23] && r[24] && [23, 24].every(i => r[i].y < 1.05 && (!visSupported || (r[i].visibility == null ? 1 : r[i].visibility) > 0.3))) {
        const h1 = cam.toScreen(r[23]), h2 = cam.toScreen(r[24]);
        sz = Math.max(sc, 0.75 * Math.hypot((a.x + b.x - h1.x - h2.x) / 2, (a.y + b.y - h1.y - h2.y) / 2));
      }
      return { r, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, sc, sz: Math.max(sz, view.U * 0.02), up: armsUp(r, cam, visSupported), used: false, tid: 0, sig: sampler ? sampler.sig(r) : null, mixed: false };
    });
    // 두 사람이 겹쳐 보이면(몸통이 서로 가까움) 그 순간의 옷 색은 섞였을 수 있으니 기억·비교에 쓰지 않음
    for (const c of cands) for (const o of cands) if (o !== c && Math.hypot(o.cx - c.cx, o.cy - c.cy) < Math.max(o.sc, c.sc) * 1.1) c.mixed = true;
    this.matchTracks(cands, dt, view);
    const out = this.locks.map(() => null);
    // 1) 이미 잡힌 선수: 자기 번호(track)만 따라감. 다른 사람이 그 자리로 와도 바뀌지 않음
    this.locks.forEach((L, i) => {
      if (!L) return;
      const T = L.lost ? null : this.tracks.find(t => t.id === L.tid);
      if (!T) {   // 오래 가려져 번호가 없어짐 → 해제하지 않고 '찾는 중'
        if (!L.lost) { L.lost = true; L.tid = -1; L.lostAt = this.now; }
        L.lostT = this.now - L.lostAt + LOST_SEC;
        return;
      }
      if (T.sig && T.sigN >= 6) { L.sig = T.sig; L.sz = T.sz; }       // 다시 찾을 때 쓸 옷 색·크기
      L.lostT = T.miss;
      if (T.cand) { T.cand.used = true; out[i] = T.cand.r; L.x = T.x; L.y = T.y; L.sc = T.sc; }
    });
    // 1-2) 찾는 중인 선수: 새로 나타난 사람 중 옷 색(없으면 위치·크기)이 맞는 사람을 만세 없이 다시 이어 붙임
    const taken = new Set(this.locks.filter(L => L && !L.lost).map(L => L.tid));
    this.locks.forEach((L, i) => {
      if (!L || !L.lost) return;
      const x0 = view.W * i / this.n, x1 = view.W * (i + 1) / this.n;
      let best = null, bs = Infinity;
      for (const c of cands) {
        if (c.used || taken.has(c.tid)) continue;
        const T = this.tracks.find(t => t.id === c.tid); if (!T || T.born < L.lostAt - LOST_SEC) continue;   // 선수가 사라지기 전부터 있던 사람(구경꾼)은 아님
        if (this.n === 2 && (c.cx < x0 - view.W * 0.06 || c.cx > x1 + view.W * 0.06)) continue;
        const near = Math.hypot(c.cx - L.x, c.cy - L.y) / (L.sz || L.sc || view.U * 0.1), ratio = c.sz / (L.sz || c.sz);
        if (ratio < 0.6 || ratio > 1.65) continue;
        const sd = sigDist(L.sig, T.sig && T.sigN >= 3 ? T.sig : c.mixed ? null : c.sig);
        let ok;
        if (sd >= 0) ok = sd < SIG_SAME || (sd < SIG_REJECT && near < 1.5);
        else ok = near < 1.5 && (T.miss === 0);                      // 옷 색을 못 볼 때: 사라진 자리 근처에 비슷한 크기로 나타나면
        if (!ok) continue;
        const score = (sd >= 0 ? sd * 4 : 0) + near * 0.3;
        if (score < bs) { bs = score; best = c; }
      }
      if (best) { best.used = true; out[i] = best.r; taken.add(best.tid); Object.assign(L, { tid: best.tid, lost: false, x: best.cx, y: best.cy, sc: best.sc, lostT: 0 }); }
    });
    // 2) 만세 하는 사람 찾기 (빈자리, 또는 게임 밖이면 선수 교체). 다른 자리 선수는 후보에서 뺌
    const lockedIds = new Set(this.locks.filter(L => L && !L.lost).map(L => L.tid));
    this.claims.forEach((C, i) => {
      if (this.locks[i] && !this.locks[i].lost && !allowTakeover) { C.t = 0; return; }   // 찾는 중인 자리는 게임 중에도 만세로 다시 잡을 수 있음
      const x0 = view.W * i / this.n, x1 = view.W * (i + 1) / this.n;
      let best = null, bd = Infinity;
      for (const c of cands) {
        if (c.used || !c.up || (lockedIds.has(c.tid) && !(this.locks[i] && this.locks[i].tid === c.tid))) continue;
        if (this.locks[i] && this.locks[i].tid === c.tid) continue;     // 이미 이 자리 선수면 다시 셀 필요 없음
        if (this.n === 2 && (c.cx < x0 - view.W * 0.06 || c.cx > x1 + view.W * 0.06)) continue;   // 가운데 선 근처에 서도 인식
        const d = c.tid === C.tid ? -1 : Math.abs(c.cx - (x0 + x1) / 2);   // 세던 사람을 먼저
        if (d < bd) { best = c; bd = d; }
      }
      if (!best) { C.t = Math.max(0, C.t - dt); return; }                       // 잠깐 끊겨도 바로 0이 되지 않게 천천히 줄어듦
      if (best.tid !== C.tid) { C.t = 0; C.tid = best.tid; }                     // 다른 사람이면 처음부터
      C.t += dt; C.x = best.cx; C.y = best.cy; C.sc = best.sc;
      if (C.t >= CLAIM_SEC) {
        best.used = true; out[i] = best.r; C.t = 0;
        this.locks[i] = { tid: best.tid, x: best.cx, y: best.cy, sc: best.sc, lostT: 0, fresh: true };
      }
    });
    this.ignored = cands.filter(c => !c.used).map(c => ({ cx: c.cx, cy: c.cy, sc: c.sc, up: c.up }));
    return out;
  }
  // 이번 프레임에 새로 잡힌 선수 번호 목록 (효과음용)
  takeFresh() { const f = []; this.locks.forEach((L, i) => { if (L && L.fresh) { f.push(i); L.fresh = false; } }); return f; }
}

/* ---------- 가상 선수 (점검용) ---------- */
// 가상 선수 옷 색 (윗몸통·아랫몸통 Y, Cb, Cr)
const SIG_RED = Float32Array.from([0.45, -0.08, 0.25, 0.3, 0.02, 0.0]), SIG_GREEN = Float32Array.from([0.55, -0.1, -0.15, 0.3, 0.02, 0.0]), SIG_BLUE = Float32Array.from([0.4, 0.22, -0.08, 0.3, 0.02, 0.0]);
class SimDetector {
  constructor(n) {
    this.people = Array.from({ length: n }, (_, i) => new SimPerson(n === 1 ? 0.5 : (i === 0 ? 0.72 : 0.28)));
    this.people.forEach((p, i) => { p.sig = i === 0 ? SIG_RED : SIG_GREEN; });
    // &op=1 : 카메라 바로 앞에서 태블릿을 조작하는 사람(크게 보이고 엉덩이는 화면 밖)을 맨 앞에 추가
    if (/op=1/.test(location.search)) { this.op = new SimPerson(0.45, 0.26, 0.7); this.op.op = true; }
  }
  detect(video, ts) {
    const t = ts / 1000; let L = this.people.map(p => p.landmarks(t)); if (this.op) L.unshift(this.op.landmarks(t));
    // &intruder=1 : 시작 8초 뒤 크게(가까이) 보이는 사람이 오른쪽에서 왼쪽으로 선수 앞을 지나감. 지나가는 동안 선수는 가려져 안 보임
    if (/intruder=1/.test(location.search)) {
      if (this.t00 == null) this.t00 = t;
      const e = t - this.t00 - 8;
      if (e > 0 && e < 6) {
        if (!this.intr) this.intr = new SimPerson(0.95, 0.12, 0.42);
        this.intr.cx = 0.95 - 0.9 * (e / 6);
        const I = this.intr.landmarks(t);
        L = L.filter((P, i) => !(Math.abs(this.people[i] ? this.people[i].cx - this.intr.cx : 9) < 0.12));   // 가려진 선수는 안 보임
        L.unshift(I);
      }
    }
    // &intruder=2 : 선수와 같은 거리(같은 크기)·다른 옷의 사람이 8초 뒤 천천히 선수 앞을 지나감 (가려지는 동안 선수 안 보임)
    // &intruder=3 : 같은 크기의 사람이 선수 앞에 와서 5초 동안 서 있다가 나감
    const im = location.search.match(/intruder=([23])/);
    if (im) {
      if (this.t00 == null) this.t00 = t;
      const e = t - this.t00 - 8, dur = im[1] === "2" ? 8 : 11;
      if (e > 0 && e < dur) {
        if (!this.intr) { this.intr = new SimPerson(0.95); this.intr.sig = SIG_BLUE; this.intr.t0 = -99; }
        const tx = this.people[0].cx;
        this.intr.cx = im[1] === "2" ? 0.95 - 0.9 * (e / dur) : e < 3 ? 0.95 + (tx - 0.95) * e / 3 : e < 8 ? tx : tx + (0.05 - tx) * (e - 8) / 3;
        const I = this.intr.landmarks(t);
        L = L.filter((P, i) => !(this.people[i] && Math.abs(this.people[i].cx - this.intr.cx) < 0.1));
        L.unshift(I);
      }
    }
    if (/nosig=1/.test(location.search)) L.forEach(P => { P.sig = null; });
    return L;
  }
}
class SimPerson {
  constructor(cx, sw = 0.07, sy = 0.32) { this.cx = cx; this.sw = sw; this.sy = sy; this.lastT = null; this.hands = [0.1, -0.1].map(o => ({ x: cx + o, y: sy + 0.18, tx: cx + o, ty: sy + 0.18, sp: 0.5, next: 0 })); }
  landmarks(t) {
    const dt = this.lastT == null ? 0.016 : Math.min(0.1, Math.max(0.001, t - this.lastT)); this.lastT = t;
    const k = this.sw / 0.07;
    if (this.t0 == null) this.t0 = t;
    const cheer = !this.op && !/nocheer=1/.test(location.search) && t - this.t0 < 1.5;           // 처음 1.5초는 만세(선수 인식용)
    for (const h of this.hands) {
      if (cheer) { h.x = h.tx = this.cx + (h === this.hands[0] ? 0.05 : -0.05); h.y = h.ty = this.sy - 0.25 * k; h.next = t; continue; }
      if (t > h.next) { h.tx = this.cx + (Math.random() - 0.5) * 0.44 * k; h.ty = this.sy - 0.2 * k + Math.random() * 0.72 * k; h.sp = Math.random() < 0.4 ? 3.2 : 0.6; h.next = t + 0.3 + Math.random() * 0.9; }
      const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy), step = Math.min(d, h.sp * dt);
      if (d > 1e-4) { h.x += dx / d * step; h.y += dy / d * step; }
    }
    const c = this.cx, sw = this.sw, sy = this.sy, L = [];
    const set = (i, x, y) => { L[i] = { x, y, z: 0, visibility: 0.95 }; };
    for (let i = 0; i < 33; i++) set(i, c, sy - 0.12 * k);
    set(11, c + sw, sy); set(12, c - sw, sy); set(23, c + sw * 0.7, sy + 0.26 * k); set(24, c - sw * 0.7, sy + 0.26 * k);
    set(25, c + sw * 0.75, sy + 0.43 * k); set(26, c - sw * 0.75, sy + 0.43 * k); set(27, c + sw * 0.8, sy + 0.6 * k); set(28, c - sw * 0.8, sy + 0.6 * k);
    const [hl, hr] = this.hands;
    set(15, hl.x, hl.y); set(13, (L[11].x + hl.x) / 2 + 0.03, (L[11].y + hl.y) / 2 + 0.03);
    set(16, hr.x, hr.y); set(14, (L[12].x + hr.x) / 2 - 0.03, (L[12].y + hr.y) / 2 + 0.03);
    // &simclose=1 : 태블릿 가까이 선 사람 (엉덩이는 화면 밖, 만세하면 손목이 화면 위로 나가 신뢰도가 낮음)
    if (/simclose=1/.test(location.search)) {
      [23, 24, 25, 26, 27, 28].forEach(i => { L[i] = { ...L[i], y: 1.1, visibility: 0.05 }; });
      if (cheer) { L[15] = { ...L[15], y: -0.06, visibility: 0.08 }; L[16] = { ...L[16], y: -0.06, visibility: 0.08 }; L[13].y = sy - 0.1 * k; L[14].y = sy - 0.1 * k; }
    }
    if (this.sig) L.sig = this.sig.map(v => v + (Math.random() - 0.5) * 0.02);
    return L;
  }
}
