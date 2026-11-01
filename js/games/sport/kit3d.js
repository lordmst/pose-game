// 스포츠 리조트용 3D 도구: three.js 장면(하늘·땅·바다·나무), 미이 같은 캐릭터(아바타), 카메라 작은 화면(PiP)
// 게임은 stage()로 장면을 만들고, 매 프레임 stage.draw(ctx)로 자기 구역에 그림. 끝나면 stage.dispose()
import * as THREE from "../../vendor/three.module.min.js";
export { THREE };

// 화질 단계: 느린 기기면 저절로 낮춤 (그림자 끄기 → 해상도 낮추기). 기기마다 기억하고, 새로 열 때 한 단계 높여서 다시 시도
const QUALITY = [{ res: 0.8, shadow: true }, { res: 0.8, shadow: false }, { res: 0.62, shadow: false }, { res: 0.48, shadow: false }];
const SLOW_MS = 30;   // 한 장 그리는 데 평균 이만큼(ms, 약 33장/초) 넘으면 한 단계 낮춤
let quality = 0, lastStep = 0;
try { quality = Math.max(0, Math.min(QUALITY.length - 1, (+localStorage.getItem("posegame.q3d") || 0) - 1)); } catch (e) {}
const saveQuality = () => { try { localStorage.setItem("posegame.q3d", String(quality)); } catch (e) {} };

/* ---------- 장면 ---------- */
// opts: { fov, sky: [위색, 아래색], fog: [색, 가까이, 멀리], shadows, pip: "br"|"bl"|false }
export function stage(env, opts = {}) {
  const z = env.zone, v = env.view;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality < 2, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(1);
  if (opts.shadows !== false) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 50, z.w / v.H, 0.1, 2000);
  const [top, bottom] = opts.sky || ["#6ec6ff", "#e6f6ff"];
  scene.background = gradientTexture(top, bottom);
  if (opts.fog) scene.fog = new THREE.Fog(opts.fog[0], opts.fog[1], opts.fog[2]);
  // 빛: 하늘빛 + 해 (그림자)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8db36b, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(8, 18, 10);
  if (opts.shadows !== false) {
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const s = opts.shadowSize || 20; Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun, sun.target);
  let w = 0, h = 0, prev = 0, ema = 0, frames = 0, applied = -1;
  // 화질 단계 적용 (그림자 켜고 끄기)
  function applyQuality() {
    if (applied === quality) return;
    applied = quality;
    const on = QUALITY[quality].shadow && opts.shadows !== false;
    renderer.shadowMap.enabled = on; sun.castShadow = on;
  }
  // 그리는 시간 재기: 계속 느리면 화질을 한 단계 낮춤 (모든 3D 게임이 함께 씀)
  function measure() {
    const now = performance.now(), dt = prev ? now - prev : 0; prev = now;
    if (dt <= 0 || dt > 500) return;                       // 화면이 멈췄다 돌아온 경우는 빼기
    frames++; ema = frames < 10 ? dt : ema * 0.92 + dt * 0.08;
    if (frames > 60 && ema > SLOW_MS && now - lastStep > 2500 && quality < QUALITY.length - 1) {
      quality++; lastStep = now; ema = SLOW_MS * 0.8; saveQuality();
    }
  }
  const api = {
    THREE, scene, camera, renderer, sun, hemi, pipMark: null,
    // 자기 구역에 장면을 그림 (+ 카메라 작은 화면)
    draw(ctx) {
      measure(); applyQuality();
      const RES = QUALITY[quality].res;
      const W = Math.max(2, Math.round(z.w * RES)), H = Math.max(2, Math.round(v.H * RES));
      if (W !== w || H !== h) { w = W; h = H; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
      ctx.drawImage(canvas, z.x0, 0, z.w, v.H);
      if (opts.pip !== false) api.pip(ctx, opts.pip || "br");
    },
    // 선수 카메라 작은 화면: 내 몸이 어떻게 움직이는지 보이게 (구석에)
    pip(ctx, where = "br") {
      const two = env.mode === 2;
      if (two && where === "br" && env.slot === 0) where = "bl";      // 2인: 각자 바깥쪽 구석 (가운데 캐릭터를 가리지 않게)
      const pw = Math.min(z.w * (two ? 0.2 : 0.24), v.U * 0.3), ph = pw * 1.25, m = v.U * 0.02;
      const x = where.includes("l") ? z.x0 + m : z.x1 - pw - m, y = where.includes("t") ? v.H * 0.12 : v.H - ph - v.U * 0.085;   // 아래 버튼(음성 크게 등)을 가리지 않게
      if (env.pip) env.pip(ctx, x, y, pw, ph, api.pipMark);   // pipMark: 몸을 옮길 자리(화면 x) 점선 표시
    },
    // 3D 위치 → 화면 좌표 (글자·효과를 2D로 얹을 때)
    get quality() { return quality; },
    toScreen(p) { const q = p.clone().project(camera); return { x: z.x0 + (q.x + 1) / 2 * z.w, y: (1 - q.y) / 2 * v.H, behind: q.z > 1 }; },
    dispose() { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }); renderer.dispose(); renderer.forceContextLoss(); },
  };
  return api;
}

export function gradientTexture(top, bottom) {
  const c = document.createElement("canvas"); c.width = 4; c.height = 256;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- 재료 · 기본 모양 ---------- */
const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, transparent: o.opacity != null, opacity: o.opacity ?? 1, emissive: o.glow || 0x000000 }));
  return matCache.get(key);
}
export function mesh(geo, color, o = {}) {
  const m = new THREE.Mesh(geo, typeof color === "string" || typeof color === "number" ? mat(color, o) : color);
  m.castShadow = o.cast !== false; m.receiveShadow = !!o.receive; return m;
}
export const box = (w, h, d, color, o) => mesh(new THREE.BoxGeometry(w, h, d), color, o);
export const ball = (r, color, o) => mesh(new THREE.SphereGeometry(r, 20, 14), color, o);
export const cyl = (r1, r2, h, color, o) => mesh(new THREE.CylinderGeometry(r1, r2, h, 18), color, o);
// 바닥(그림자 받음)
export function ground(scene, color = "#7cc35a", size = 200, y = 0) {
  const g = mesh(new THREE.PlaneGeometry(size, size), color, { receive: true, cast: false }); g.rotation.x = -Math.PI / 2; g.position.y = y; scene.add(g); return g;
}
// 바다: 파란 면 + 반짝이는 물결 (update(t)로 움직임)
export function sea(scene, size = 600, y = 0) {
  const geo = new THREE.PlaneGeometry(size, size, 60, 60);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#2f9bd6", roughness: 0.25, metalness: 0.1, flatShading: true }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m);
  const pos = geo.attributes.position, base = pos.array.slice();
  m.update = t => { for (let i = 0; i < pos.count; i++) { const x = base[i * 3], yy = base[i * 3 + 1]; pos.array[i * 3 + 2] = Math.sin(x * 0.15 + t * 1.6) * 0.18 + Math.cos(yy * 0.12 + t * 1.2) * 0.15; } pos.needsUpdate = true; };
  return m;
}
export function tree(x, z, s = 1, leaf = "#3f9b3f") {
  const g = new THREE.Group();
  const trunk = cyl(0.12 * s, 0.16 * s, 1.2 * s, "#8a5a2b"); trunk.position.y = 0.6 * s;
  const crown = mesh(new THREE.IcosahedronGeometry(0.85 * s, 1), leaf, { rough: 0.9 }); crown.position.y = 1.7 * s;
  g.add(trunk, crown); g.position.set(x, 0, z); return g;
}
export function palm(x, z, s = 1) {
  const g = new THREE.Group(), trunk = cyl(0.1 * s, 0.16 * s, 3 * s, "#a77b4f"); trunk.position.y = 1.5 * s; trunk.rotation.z = 0.12; g.add(trunk);
  for (let i = 0; i < 6; i++) { const l = box(1.6 * s, 0.05 * s, 0.45 * s, "#2f9e44"); l.position.set(Math.cos(i) * 0.7 * s, 3 * s, Math.sin(i) * 0.7 * s); l.rotation.y = -i; l.rotation.z = -0.35; g.add(l); }
  g.position.set(x, 0, z); return g;
}
export function cloud(x, y, z, s = 1) {
  const g = new THREE.Group();
  [[0, 0, 1], [0.9, -0.1, 0.8], [-0.9, -0.1, 0.75], [0.4, 0.4, 0.7]].forEach(([dx, dy, r]) => { const b = ball(r * s, "#ffffff", { cast: false, rough: 1 }); b.position.set(dx * s, dy * s, 0); g.add(b); });
  g.position.set(x, y, z); return g;
}
// 글자 판(점수판 등): 캔버스 글자를 붙인 판. set(text)로 바꿈
export function textBoard(w, h, opts = {}) {
  const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * h / w);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.set = (text, sub) => {
    const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = opts.bg || "rgba(20,30,40,.85)"; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 30); g.fill();
    g.fillStyle = opts.color || "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `bold ${Math.round(c.height * (sub ? 0.42 : 0.6))}px sans-serif`; g.fillText(text, c.width / 2, c.height * (sub ? 0.38 : 0.52));
    if (sub) { g.font = `${Math.round(c.height * 0.26)}px sans-serif`; g.fillText(sub, c.width / 2, c.height * 0.78); }
    tex.needsUpdate = true;
  };
  return m;
}

/* ---------- 캐릭터 (미이 같은 아바타) ----------
   발바닥이 y=0, 키 약 1.7. 기본은 +z(카메라 쪽)를 봄. 뒤에서 보는 내 캐릭터는 rotation.y = Math.PI
   팔: arm(k, 옆으로 든 각도, 앞으로 든 각도, 팔꿈치 굽힘) — k 0 = 왼팔, 1 = 오른팔 (캐릭터 기준) */
const SKINS = ["#ffd7b5", "#f1c27d", "#e0ac69", "#c68642"], HAIRS = ["#3b2414", "#1f1f1f", "#7a4a1f", "#d9a441", "#a33b1f"];
export function avatar({ shirt = "#ff6b6b", pants = "#3b5bdb", skin = SKINS[0], hair = HAIRS[0], girl = false, scale = 1 } = {}) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const legs = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(0.1 * s, 0.78, 0); const l = cyl(0.085, 0.075, 0.74, pants); l.position.y = -0.37; const shoe = box(0.15, 0.08, 0.24, "#ffffff"); shoe.position.set(0, -0.76, 0.04); p.add(l, shoe); body.add(p); return p; });
  const torso = mesh(new THREE.CapsuleGeometry(0.2, 0.32, 6, 14), shirt); torso.position.y = 1.08; torso.scale.set(1, 1, 0.75); body.add(torso);
  const headG = new THREE.Group(); headG.position.y = 1.56; body.add(headG);
  const head = ball(0.21, skin); head.scale.set(1, 1.08, 1); headG.add(head);
  const hairM = mesh(new THREE.SphereGeometry(0.225, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair); hairM.position.y = 0.03; hairM.rotation.x = -0.25; headG.add(hairM);
  if (girl) { const tail = ball(0.09, hair); tail.position.set(0, 0.02, -0.22); headG.add(tail); }
  [-1, 1].forEach(s => { const e = ball(0.03, "#1d1d1d", { cast: false }); e.scale.set(1, 1.5, 0.6); e.position.set(0.075 * s, 0.03, 0.19); headG.add(e); const ch = ball(0.035, "#ff9fae", { cast: false, opacity: 0.7 }); ch.scale.set(1, 0.6, 0.3); ch.position.set(0.12 * s, -0.05, 0.17); headG.add(ch); });
  const mouth = mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), "#7a3b1a", { cast: false }); mouth.position.set(0, -0.08, 0.195); mouth.rotation.z = Math.PI; headG.add(mouth);
  const arms = [1, -1].map(s => {        // 캐릭터 자신의 왼팔(+x쪽, 정면 기준)·오른팔
    const sh = new THREE.Group(); sh.position.set(0.27 * s, 1.34, 0); body.add(sh);
    const up = cyl(0.06, 0.055, 0.3, shirt); up.position.y = -0.15; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const fo = cyl(0.05, 0.045, 0.27, skin); fo.position.y = -0.135; el.add(fo);
    const hand = new THREE.Group(); hand.position.y = -0.29; el.add(hand);
    hand.add(ball(0.065, skin));
    return { sh, el, hand, s };
  });
  root.scale.setScalar(scale);
  const api = Object.assign(root, {
    body, headG, arms, legs,
    // 팔 자세 (라디안): raise 옆으로(0 내림, π/2 수평, π 만세), fwd 앞으로, bend 팔꿈치
    arm(k, raise = 0, fwd = 0, bend = 0) { const a = arms[k]; a.sh.rotation.set(-fwd, 0, raise * a.s); a.el.rotation.set(-bend, 0, 0); },
    leg(k, lift = 0) { legs[k].rotation.x = -lift; },
    // 손에 물건 들기 (라켓 등). 손 기준 위치·회전은 물건 쪽에서 맞춤
    hold(k, obj) { arms[k].hand.add(obj); return obj; },
    handWorld(k) { const v = new THREE.Vector3(); arms[k].hand.getWorldPosition(v); return v; },
    // 선수 자세를 그대로 따라 하기 (화면 좌표 관절 → 팔 각도). back: 뒤에서 보는 캐릭터인지
    mimic(pts, back = true) {
      if (!pts || !pts[11].v || !pts[12].v) return;
      [[11, 13, 15], [12, 14, 16]].forEach(([s, e, w], k) => {
        if (!pts[e].v || !pts[w].v) return;
        const side = k ? 1 : -1;                                   // 화면에서 바깥쪽 (왼팔은 왼쪽)
        const ux = (pts[e].x - pts[s].x) * side, uy = pts[e].y - pts[s].y;
        const raise = Math.atan2(ux, uy);                          // 0 아래, π/2 옆, π 위
        const a1 = Math.atan2(pts[e].y - pts[s].y, pts[e].x - pts[s].x), a2 = Math.atan2(pts[w].y - pts[e].y, pts[w].x - pts[e].x);
        const bend = Math.abs(((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);   // 0 = 쭉 편 팔
        const kk = back ? k : 1 - k;                               // 뒤에서 보면 같은 팔, 마주 보면 거울처럼
        api.arm(kk, Math.max(-0.3, Math.min(3.1, raise)), 0, Math.max(0, Math.min(2.4, bend)));
      });
      // 몸 기울기
      const tilt = Math.atan2((pts[12].y - pts[11].y), (pts[12].x - pts[11].x));
      body.rotation.z = (back ? -1 : 1) * Math.max(-0.4, Math.min(0.4, tilt)) * 0.6;
    },
    // 가만히 서 있을 때 살짝 들썩
    idle(t) { body.position.y = Math.abs(Math.sin(t * 2)) * 0.02; },
  });
  api.arm(0, 0.15, 0, 0.2); api.arm(1, 0.15, 0, 0.2);
  return api;
}
// 상대·같은 편 캐릭터를 다양하게
export function randomAvatar(i = 0) {
  const shirts = ["#4dabf7", "#ff922b", "#51cf66", "#cc5de8", "#fcc419", "#ff6b6b", "#20c997"];
  return avatar({ shirt: shirts[i % shirts.length], pants: i % 2 ? "#495057" : "#1c7ed6", skin: SKINS[i % SKINS.length], hair: HAIRS[(i * 3) % HAIRS.length], girl: i % 2 === 1 });
}
// 선수 색으로 내 캐릭터
export const playerAvatar = env => avatar({ shirt: env.color || "#ff6b6b", pants: "#2b3a67", girl: /엄마|연제/.test(env.name || "") });

/* ---------- 소품 ---------- */
export function racket(color = "#ff6b6b", paddle = false) {
  const g = new THREE.Group();
  const handle = cyl(0.025, 0.025, paddle ? 0.12 : 0.25, "#333"); handle.position.y = paddle ? -0.06 : -0.12; g.add(handle);
  const head = paddle ? cyl(0.09, 0.09, 0.02, color) : mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 24), color);
  head.position.y = paddle ? -0.2 : -0.38; if (paddle) head.rotation.x = Math.PI / 2;
  g.add(head);
  if (!paddle) { const net = mesh(new THREE.CircleGeometry(0.14, 20), "#ffffff", { opacity: 0.5 }); net.position.y = -0.38; g.add(net); }
  return g;
}

/* ---------- 몸으로 좌우 이동 (테니스·배구 등) ----------
   선수 몸(어깨 가운데)의 좌우 위치 → 코트 위 x. 화면은 거울이라 내가 오른쪽으로 가면 캐릭터도 오른쪽
   range: 캐릭터가 갈 수 있는 좌우 끝(m), span: 몸을 구역 가운데에서 너비의 이 비율만큼 옮기면 끝까지 감 */
export function bodyMover(env, range, span = 0.33) {
  const z = env.zone;
  return {
    bodyX() { const P = env.tracker.pts; return P && P[11].v && P[12].v ? (P[11].x + P[12].x) / 2 : null; },
    toCourt(sx) { return Math.max(-1, Math.min(1, (((sx - z.x0) / z.w) - 0.5) / span)) * range; },
    toScreenX(cx) { return z.x0 + z.w * (0.5 + cx / range * span); },
    // 몸 위치를 따라 x를 부드럽게 옮김 (몸이 안 보이면 그대로)
    follow(x, dt) { const b = this.bodyX(); return b == null ? x : x + (this.toCourt(b) - x) * Math.min(1, dt * 8); },
  };
}
// 이동 안내: 발밑에서 가야 할 자리까지 바닥 점선 + 가야 할 자리에 점선 원 (도착하면 초록)
export function moveGuide(scene, color = 0xffe14d) {
  const dashMat = new THREE.MeshBasicMaterial({ color }), spotMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const dashes = Array.from({ length: 30 }, () => { const d = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.09), dashMat); d.visible = false; scene.add(d); return d; });
  const spot = new THREE.Group(); spot.visible = false; scene.add(spot);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const seg = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.76, 6, 1, a, Math.PI / 14 * 1.1), spotMat); seg.rotation.x = -Math.PI / 2; spot.add(seg); }
  const feet = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), spotMat); feet.rotation.x = -Math.PI / 2; feet.position.y = 0.002; spot.add(feet);
  return {
    show(fromX, toX, zz, ok, t) {
      spot.visible = true; spot.position.set(toX, 0.06, zz); spot.scale.setScalar(ok ? 1 : 1 + Math.sin(t * 9) * 0.06);
      const c = ok ? 0x37d67a : color; spotMat.color.set(c); dashMat.color.set(c);
      const n = ok ? 0 : Math.min(dashes.length, Math.floor(Math.abs(toX - fromX) / 0.4));
      dashes.forEach((d, i) => { d.visible = i < n; if (i < n) d.position.set(fromX + Math.sign(toX - fromX) * (0.35 + i * 0.4), 0.07, zz); });
    },
    hide() { spot.visible = false; dashes.forEach(d => { d.visible = false; }); },
  };
}
// 방향·거리 글자: "◀◀ 왼쪽으로" / "오른쪽으로 ▶▶▶" / 도착하면 okText
export function moveText(d, ok, okText = "좋아요! 그 자리", per = 1.2) {
  if (ok) return okText;
  const n = Math.min(4, Math.max(1, Math.round(Math.abs(d) / per)));
  return d > 0 ? `오른쪽으로 ${"▶".repeat(n)}` : `${"◀".repeat(n)} 왼쪽으로`;
}
