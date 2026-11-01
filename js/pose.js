// 카메라 · 자세 인식 · 선수별 손 추적
const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const VIS = 0.5;                 // 이 값보다 신뢰도가 낮은 관절은 '안 보임'으로 처리

// ?sim=1 / ?sim=2 : 카메라 없이 가상 선수로 동작 (개발·점검용)
export const SIM = (() => { const m = location.search.match(/sim=(\d)/); return m ? Math.min(2, +m[1]) : 0; })();

export async function createDetector() {
  if (SIM) return new SimDetector(SIM);
  const { PoseLandmarker, FilesetResolver } = await import(MP_URL);
  const vision = await FilesetResolver.forVisionTasks(MP_URL + "/wasm");
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
  constructor() { this.vis = false; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.speed = 0; this.bodySpeed = 0; this.hist = []; }
  lose() { this.vis = false; this.hist.length = 0; this.speed = 0; this.bodySpeed = 0; this.vx = this.vy = 0; }
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
  constructor(slot) { this.slot = slot; this.pts = null; this.present = false; this.lostT = 9; this.hands = [new Hand(), new Hand()]; this.scale = 0; this.fullBody = false; this.lowerT = 0; this.meters = 0; }
  update(raw, cam, dt, t, visSupported) {
    if (!raw) { this.present = false; this.lostT += dt; this.pts = null; this.fullBody = false; this.hands.forEach(h => h.lose()); this.lowerT = Math.max(0, this.lowerT - dt); return; }
    this.present = true; this.lostT = 0;
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
  }
  get lowerSeen() { return this.lowerT > 0; }
}

/* ---------- 선수 배정: 태블릿 조작하는 사람 제외 ----------
   1) 새로 잡을 때: 어깨와 엉덩이가 모두 보이고, 카메라에 너무 가깝지 않은 사람만 선수로 인정
      (태블릿을 들고 있는 사람은 얼굴·상체만 크게 잡히므로 제외됨)
   2) 한 번 잡은 선수는 위치를 따라가며 고정 → 다른 사람이 화면에 들어와도 바뀌지 않음
   3) 고정된 선수가 2초 넘게 안 보이면 해제하고 다시 찾음 */
export const TOO_CLOSE = 0.45;     // 어깨너비가 화면 높이의 45%를 넘으면 '너무 가까움'
const LOST_SEC = 2.0;
export class Assigner {
  constructor(n) { this.n = n; this.locks = Array.from({ length: n }, () => null); this.ignored = []; }
  reset() { this.locks = this.locks.map(() => null); }
  assign(raws, cam, view, dt, visSupported) {
    const vis = p => p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02 && (!visSupported || (p.visibility == null ? 1 : p.visibility) > VIS);
    const cands = raws.map(r => {
      const a = cam.toScreen(r[11]), b = cam.toScreen(r[12]);
      const sc = Math.hypot(a.x - b.x, a.y - b.y), near = sc > view.H * TOO_CLOSE;
      return { r, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, sc, near, ok: !near && [11, 12, 23, 24].every(i => vis(r[i])), used: false };
    });
    const out = this.locks.map(() => null);
    // 1) 이미 잡아 둔 선수 따라가기 (직전 위치에서 가장 가까운 사람)
    this.locks.forEach((L, i) => {
      if (!L) return;
      let best = null, bd = Infinity;
      for (const c of cands) {
        if (c.used) continue;
        const d = Math.hypot(c.cx - L.x, c.cy - L.y), ratio = c.sc / L.sc;
        if (d < Math.max(L.sc * 1.6, view.U * 0.12) && ratio > 0.5 && ratio < 2 && d < bd) { best = c; bd = d; }
      }
      if (best) { best.used = true; out[i] = best.r; L.x = best.cx; L.y = best.cy; L.sc = L.sc * 0.8 + best.sc * 0.2; L.lostT = 0; }
      else if ((L.lostT += dt) > LOST_SEC) this.locks[i] = null;
    });
    // 2) 빈자리 새로 잡기: 자격 있는 사람 중 자기 구역 가운데에 가장 가까운 사람
    this.locks.forEach((L, i) => {
      if (L) return;
      const x0 = view.W * i / this.n, x1 = view.W * (i + 1) / this.n, zc = (x0 + x1) / 2;
      let best = null, bd = Infinity;
      for (const c of cands) {
        if (c.used || !c.ok) continue;
        if (this.n === 2 && (c.cx < x0 || c.cx > x1)) continue;
        const d = Math.abs(c.cx - zc);
        if (d < bd) { best = c; bd = d; }
      }
      if (best) { best.used = true; out[i] = best.r; this.locks[i] = { x: best.cx, y: best.cy, sc: best.sc, lostT: 0 }; }
    });
    this.ignored = cands.filter(c => !c.used).map(c => ({ cx: c.cx, cy: c.cy, sc: c.sc, near: c.near }));
    return out;
  }
}

/* ---------- 가상 선수 (점검용) ---------- */
class SimDetector {
  constructor(n) {
    this.people = Array.from({ length: n }, (_, i) => new SimPerson(n === 1 ? 0.5 : (i === 0 ? 0.72 : 0.28)));
    // &op=1 : 카메라 바로 앞에서 태블릿을 조작하는 사람(크게 보이고 엉덩이는 화면 밖)을 맨 앞에 추가
    if (/op=1/.test(location.search)) this.op = new SimPerson(0.45, 0.26, 0.7);
  }
  detect(video, ts) { const t = ts / 1000; const L = this.people.map(p => p.landmarks(t)); if (this.op) L.unshift(this.op.landmarks(t)); return L; }
}
class SimPerson {
  constructor(cx, sw = 0.07, sy = 0.32) { this.cx = cx; this.sw = sw; this.sy = sy; this.lastT = null; this.hands = [0.1, -0.1].map(o => ({ x: cx + o, y: sy + 0.18, tx: cx + o, ty: sy + 0.18, sp: 0.5, next: 0 })); }
  landmarks(t) {
    const dt = this.lastT == null ? 0.016 : Math.min(0.1, Math.max(0.001, t - this.lastT)); this.lastT = t;
    const k = this.sw / 0.07;
    for (const h of this.hands) {
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
    return L;
  }
}
