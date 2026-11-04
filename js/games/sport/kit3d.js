// 스포츠 리조트용 3D 도구: three.js 장면(하늘·땅·바다·나무), 미이 같은 캐릭터(아바타), 카메라 작은 화면(PiP)
// 게임은 stage()로 장면을 만들고, 매 프레임 stage.draw(ctx)로 자기 구역에 그림. 끝나면 stage.dispose()
import * as THREE from "../../vendor/three.module.min.js";
export { THREE };

// 화질 단계: 느린 기기면 저절로 낮추고(그림자 끄기 → 해상도 낮추기), 여유가 생기면 다시 올림. 기기마다 기억
// res: 화면 실제 화소(기기 화소 배율 포함) 대비 3D를 그리는 비율. 1이면 태블릿 고해상도 화면 그대로라 가장 매끈함
const QUALITY = [
  { res: 1.0, shadow: true, shadowMap: 2048 }, { res: 1.0, shadow: true, shadowMap: 1024 }, { res: 0.85, shadow: false },
  { res: 0.7, shadow: false }, { res: 0.55, shadow: false }, { res: 0.42, shadow: false },
];
const SLOW_MS = 30;   // 한 장 그리는 데 평균 이만큼(ms, 약 33장/초) 넘으면 한 단계 낮춤
const FAST_MS = 15;   // 평균 이만큼(ms, 약 66장/초)보다 빠르면 한 단계 올림
const MAX_PIXELS = 2.6e6;   // 한 구역을 그리는 최대 화소 수 (너무 큰 화면에서 버벅이지 않게)
let quality = 0, lastStep = 0;
try { quality = Math.max(0, Math.min(QUALITY.length - 1, (+localStorage.getItem("posegame.q3d2") || 0) - 1)); } catch (e) {}
// 점검용: 주소에 ?q3d=0 처럼 쓰면 화질 단계를 고정 (자동 조절 안 함)
const LOCK_Q = (() => { try { const v = new URLSearchParams(location.search).get("q3d"); return v == null ? null : Math.max(0, Math.min(QUALITY.length - 1, +v || 0)); } catch (e) { return null; } })();
if (LOCK_Q != null) quality = LOCK_Q;
const saveQuality = () => { try { localStorage.setItem("posegame.q3d2", String(quality)); } catch (e) {} };

/* ---------- 보기 좋게: 색감·빛 ---------- */
// env: 주변 빛 반사 세기. 효과에 비해 느린 기기에서 무거워서 기본은 끔(0). 켜려면 0.5 정도
const LOOK = { tm: "none", exposure: 1, hemi: 0.6, sun: 1.55, rim: 0.32, env: 0, spec: 0.3, grain: 0.09 };
try { const q = new URLSearchParams(location.search).get("look"); if (q) for (const kv of q.split(",")) { const [k, v] = kv.split(":"); if (k in LOOK) LOOK[k] = isNaN(+v) ? v : +v; } } catch (e) {}   // 점검용: ?look=grain:0,env:0
// 둘레 그림: 위는 하늘색, 가운데는 지평선, 아래는 땅색, 해 자리는 아주 밝게 → PMREM(흐린 반사용 그림)으로
function makeEnv(renderer, top, bottom, groundC) {
  const c = document.createElement("canvas"); c.width = 8; c.height = 256;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(0.48, bottom); gr.addColorStop(0.52, groundC); gr.addColorStop(1, "#2e3a24");
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: tex }));
  const sunM = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.5, 2.2) }));
  sunM.position.set(4.2, 7.5, 5); s.add(sky, sunM);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(s, 0.035);
  pm.dispose(); sky.geometry.dispose(); sky.material.dispose(); sunM.geometry.dispose(); sunM.material.dispose(); tex.dispose();
  return rt.texture;
}
// 표면 얼룩: 세상 좌표로 만든 부드러운 잡음으로 색을 아주 조금 밝게·어둡게 (그림 파일 없이 질감)
const GRAIN_V = ["#include <project_vertex>", `#include <project_vertex>
  vec4 gw_ = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  gw_ = instanceMatrix * gw_;
  #endif
  vGrainW = (modelMatrix * gw_).xyz;`];
const GRAIN_F = ["#include <color_fragment>", `#include <color_fragment>
  if (uGrain > 0.0) { vec3 q = vGrainW; float n = gNoise(q * 1.3) * 0.62 + gNoise(q * 5.1) * 0.38;
    diffuseColor.rgb *= 1.0 + (n - 0.5) * uGrain; }`];
const GRAIN_FN = `varying vec3 vGrainW; uniform float uGrain;
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const SPEC_F = ["#include <lights_fragment_maps>", "#include <lights_fragment_maps>\n  radiance *= uSpecEnv;"];
// 테두리 빛(캐릭터만): 가장자리를 살짝 밝게 해서 배경에서 또렷이 떠 보이게
const RIM_F = ["#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  if (uRim > 0.0) totalEmissiveRadiance += vec3(0.92, 0.97, 1.0) * uRim * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);`];
function lookMat(m) {
  if (!m || m.userData.look) return;
  m.userData.look = true;
  if (!m.isMeshStandardMaterial) return;
  m.envMapIntensity = m.userData.env ?? LOOK.env;
  // spec: 하늘이 비치는 번들거림의 세기 (넓은 바닥이 하얗게 번들거리지 않게 낮춤, 눈·머리카락은 높게)
  const amt = m.transparent ? 0 : (m.userData.grain ?? LOOK.grain), spec = m.userData.spec ?? LOOK.spec, rim = m.userData.rim || 0;
  // 모든 재질이 같은 셰이더 하나를 함께 씀(값만 재질마다 다름) → 게임 시작 때 셰이더 만드는 시간이 늘지 않음
  m.onBeforeCompile = sh => {
    sh.uniforms.uGrain = { value: amt }; sh.uniforms.uSpecEnv = { value: spec }; sh.uniforms.uRim = { value: rim };
    sh.vertexShader = "varying vec3 vGrainW;\n" + sh.vertexShader.replace(GRAIN_V[0], GRAIN_V[1]);
    sh.fragmentShader = "uniform float uSpecEnv; uniform float uRim;\n" + GRAIN_FN + sh.fragmentShader.replace(GRAIN_F[0], GRAIN_F[1]).replace(SPEC_F[0], SPEC_F[1]).replace(RIM_F[0], RIM_F[1]);
  };
  m.customProgramCacheKey = () => "look2";
  m.needsUpdate = true;
}

/* ---------- 장면 ---------- */
// opts: { fov, sky: [위색, 아래색], fog: [색, 가까이, 멀리], shadows, pip: "br"|"bl"|false,
//         band: [위 비율, 아래 비율] → 화면의 그 띠에만 투명 배경으로 그림 (예: 지휘자 게임 아래쪽 오케스트라) }
export function stage(env, opts = {}) {
  const z = env.zone, v = env.view;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !!opts.band, powerPreference: "high-performance" });   // 테두리 계단 없애기(MSAA)
  if (opts.band) renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 영화 같은 색감: 밝은 곳이 하얗게 날아가지 않고 부드럽게 (ACES)
  if (LOOK.tm === "aces") { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = opts.exposure ?? LOOK.exposure; }
  renderer.setPixelRatio(1);
  if (opts.shadows !== false) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 50, z.w / v.H, 0.1, 2000);
  const [top, bottom] = opts.sky || ["#6ec6ff", "#e6f6ff"];
  if (!opts.band) scene.background = gradientTexture(top, bottom);   // 띠로 그릴 땐 배경 없이(뒤의 카메라 화면이 보이게)
  if (opts.fog) scene.fog = new THREE.Fog(opts.fog[0], opts.fog[1], opts.fog[2]);
  // 주변 빛: 하늘·땅 색으로 만든 둘레 그림 → 모든 물건에 은은한 반사와 입체감
  const envTex = LOOK.env > 0 ? makeEnv(renderer, top, bottom, opts.envGround || "#6f8a52") : null;
  // 빛: 하늘빛 + 해 (그림자)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8db36b, LOOK.hemi); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, LOOK.sun); sun.position.set(8, 18, 10);

  if (opts.shadows !== false) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const s = opts.shadowSize || 20; Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun, sun.target);
  let w = 0, h = 0, prev = 0, ema = 0, frames = 0, applied = -1, skipN = 0;
  // 화질 단계 적용 (그림자 켜고 끄기)
  function applyQuality() {
    if (applied === quality) return;
    applied = quality;
    const Q = QUALITY[quality], on = Q.shadow && opts.shadows !== false;
    // 주변 빛 반사는 화질 3단계까지만 (더 느린 기기는 끄고 하늘빛을 조금 밝게)
    const envOn = quality < 3 && LOOK.env > 0; scene.environment = envOn ? envTex : null; hemi.intensity = envOn ? LOOK.hemi : LOOK.hemi + 0.55;
    renderer.shadowMap.enabled = on; sun.castShadow = on;
    if (on && sun.shadow.mapSize.x !== Q.shadowMap) { sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  }
  // 그리는 시간 재기: 계속 느리면 화질을 한 단계 낮춤 (모든 3D 게임이 함께 씀)
  function measure() {
    const now = performance.now(), dt = prev ? now - prev : 0; prev = now;
    if (dt <= 0 || dt > 2000) return;                      // 화면이 멈췄다 돌아온 경우는 빼기
    if (LOCK_Q != null) return;
    frames++; ema = frames < 10 ? dt : ema * 0.92 + dt * 0.08;
    const verySlow = frames > 20 && ema > SLOW_MS * 2 && now - lastStep > 800;   // 아주 느리면 빨리 낮춤
    if ((verySlow || (frames > 60 && ema > SLOW_MS && now - lastStep > 2500)) && quality < QUALITY.length - 1) {
      quality++; lastStep = now; ema = SLOW_MS * 0.8; saveQuality();
    } else if (frames > 120 && ema < FAST_MS && now - lastStep > 6000 && quality > 0) {   // 여유가 있으면 다시 매끈하게
      quality--; lastStep = now; ema = SLOW_MS * 0.7; saveQuality();
    }
  }
  // 둥근 모양을 더 매끈하게: 공·원기둥·원·고리의 면 수를 늘림 (각 게임이 만든 모양도 처음 그릴 때 한 번 바꿈)
  const smoothCache = new Map();
  function smoother(g) {
    const P = g.parameters, T = g.type;
    if (!P || g.userData.smooth) return null;
    const up = (n, min, max = 64) => Math.min(max, Math.max(n, min));
    let ng = null;
    if (T === "SphereGeometry" && P.radius > 0.04 && P.widthSegments < 32)
      ng = new THREE.SphereGeometry(P.radius, up(P.widthSegments * 2, 32), up(P.heightSegments * 2, 20, 40), P.phiStart, P.phiLength, P.thetaStart, P.thetaLength);
    else if (T === "CylinderGeometry" && Math.max(P.radiusTop, P.radiusBottom) > 0.03 && P.radialSegments < 32)
      ng = new THREE.CylinderGeometry(P.radiusTop, P.radiusBottom, P.height, up(P.radialSegments * 2, 32), P.heightSegments, P.openEnded, P.thetaStart, P.thetaLength);
    else if (T === "ConeGeometry" && P.radius > 0.05 && P.radialSegments < 24)
      ng = new THREE.ConeGeometry(P.radius, P.height, up(P.radialSegments * 2, 24), P.heightSegments, P.openEnded, P.thetaStart, P.thetaLength);
    else if (T === "CircleGeometry" && P.segments < 40)
      ng = new THREE.CircleGeometry(P.radius, up(P.segments * 2, 40), P.thetaStart, P.thetaLength);
    else if (T === "RingGeometry" && P.thetaSegments < 40 && P.thetaLength > Math.PI)
      ng = new THREE.RingGeometry(P.innerRadius, P.outerRadius, up(P.thetaSegments * 2, 48), P.phiSegments, P.thetaStart, P.thetaLength);
    else if (T === "TorusGeometry" && (P.tubularSegments < 48 || P.radialSegments < 12))
      ng = new THREE.TorusGeometry(P.radius, P.tube, up(P.radialSegments, 12, 16), up(P.tubularSegments * 2, 48, 96), P.arc);
    else if (T === "CapsuleGeometry" && P.radialSegments < 24)
      ng = new THREE.CapsuleGeometry(P.radius, P.length, up(P.capSegments, 8, 12), 24);
    if (ng) ng.userData.smooth = true;
    return ng;
  }
  // 재질 다듬기: 주변 빛 반사 세기, 표면의 아주 옅은 얼룩(잔디·나무·천 같은 질감). 새로 생긴 물건도 1초마다 확인
  let lookT = -1e9;
  function lookScene(now) {
    if (now - lookT < 1000) return;
    lookT = now;
    scene.traverse(o => { if (o.isMesh && o.material) [].concat(o.material).forEach(lookMat); });
  }
  let smoothT = 0;
  function smoothScene(now) {
    if (now - smoothT < 1000) return;                      // 새로 생긴 물건도 1초마다 확인
    smoothT = now;
    scene.traverse(o => {
      if (!o.isMesh || !o.geometry || o.geometry.userData.smooth) return;
      const g = o.geometry;
      if (!smoothCache.has(g.uuid)) smoothCache.set(g.uuid, smoother(g) || (g.userData.smooth = true, g));
      const ng = smoothCache.get(g.uuid);
      if (ng !== g) o.geometry = ng;
    });
  }
  const api = {
    THREE, scene, camera, renderer, sun, hemi, pipMark: null,
    // 자기 구역에 장면을 그림 (+ 카메라 작은 화면)
    draw(ctx) {
      measure(); applyQuality(); const now = performance.now(); if (opts.smooth !== false) smoothScene(now); lookScene(now);   // smooth: false = 작게 보이는 장면은 면 수를 늘리지 않음
      // every: N장면에 한 번만 3D를 새로 그리고, 그 사이에는 지난 그림을 그대로 씀 (무거운 장면을 가볍게)
      if (opts.every > 1 && w && (++skipN % opts.every)) { const [b0, b1] = opts.band || [0, 1]; ctx.drawImage(canvas, z.x0, v.H * b0, z.w, v.H * (b1 - b0)); return; }
      // 기기 화소 배율(태블릿은 2)까지 반영해 화면 실제 화소에 맞춰 그림 → 흐릿하거나 계단지지 않게
      const dpr = v.dpr || Math.min(window.devicePixelRatio || 1, 2);
      let k = dpr * QUALITY[quality].res;
      const [b0, b1] = opts.band || [0, 1], bh = v.H * (b1 - b0);
      k = Math.min(k, Math.sqrt(MAX_PIXELS / Math.max(1, z.w * bh)));
      const W = Math.max(2, Math.round(z.w * k)), H = Math.max(2, Math.round(bh * k));
      if (W !== w || H !== h) { w = W; h = H; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, z.x0, v.H * b0, z.w, bh);
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
    toScreen(p) { const q = p.clone().project(camera), [b0, b1] = opts.band || [0, 1]; return { x: z.x0 + (q.x + 1) / 2 * z.w, y: v.H * (b0 + (1 - q.y) / 2 * (b1 - b0)), behind: q.z > 1 }; },
    dispose() { if (envTex) envTex.dispose(); scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }); renderer.dispose(); renderer.forceContextLoss(); },
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
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, transparent: o.opacity != null, opacity: o.opacity ?? 1, emissive: o.glow || 0x000000 });
    if (o.grain != null) m.userData.grain = o.grain; if (o.env != null) m.userData.env = o.env; if (o.spec != null) m.userData.spec = o.spec; if (o.rim != null) m.userData.rim = o.rim;
    lookMat(m); matCache.set(key, m);
  }
  return matCache.get(key);
}
export function mesh(geo, color, o = {}) {
  const m = new THREE.Mesh(geo, typeof color === "string" || typeof color === "number" ? mat(color, o) : color);
  m.castShadow = o.cast !== false; m.receiveShadow = !!o.receive; return m;
}
export const box = (w, h, d, color, o) => mesh(new THREE.BoxGeometry(w, h, d), color, o);
// 같은 모양은 한 번만 만들어 함께 씀 (메모리·불러오기 절약)
const geoCache = new Map();
const geo = (key, make) => { if (!geoCache.has(key)) { const g = make(); g.userData.shared = true; geoCache.set(key, g); } return geoCache.get(key); };
// 공: 작을수록 면 수를 적게 (눈·볼처럼 작은 것은 12×8이면 충분)
const segOf = r => (r < 0.05 ? [12, 8] : r < 0.12 ? [20, 14] : [32, 22]);
export const ball = (r, color, o) => { const [a, b] = segOf(r); return mesh(geo(`s${r}`, () => Object.assign(new THREE.SphereGeometry(r, a, b), { userData: { smooth: true } })), color, o); };
const capsule = (r, len, cap, rad) => geo(`c${r},${len},${cap},${rad}`, () => Object.assign(new THREE.CapsuleGeometry(r, len, cap, rad), { userData: { smooth: true } }));
export const cyl = (r1, r2, h, color, o) => mesh(new THREE.CylinderGeometry(r1, r2, h, 32), color, o);
// 바닥(그림자 받음)
export function ground(scene, color = "#7cc35a", size = 200, y = 0) {
  const g = mesh(new THREE.PlaneGeometry(size, size), color, { receive: true, cast: false }); g.rotation.x = -Math.PI / 2; g.position.y = y; scene.add(g); return g;
}
// 바다: 파란 면 + 반짝이는 물결 (update(t)로 움직임)
export function sea(scene, size = 600, y = 0) {
  const geo = new THREE.PlaneGeometry(size, size, 60, 60);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#2f9bd6", roughness: 0.25, metalness: 0.1 }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m);
  const pos = geo.attributes.position, base = pos.array.slice();
  let nT = 0;
  m.update = t => { for (let i = 0; i < pos.count; i++) { const x = base[i * 3], yy = base[i * 3 + 1]; pos.array[i * 3 + 2] = Math.sin(x * 0.15 + t * 1.6) * 0.18 + Math.cos(yy * 0.12 + t * 1.2) * 0.15; } pos.needsUpdate = true; if (t - nT > 0.1) { nT = t; geo.computeVertexNormals(); } };   // 물결 빛 반사가 부드럽게
  return m;
}
export function tree(x, z, s = 1, leaf = "#3f9b3f") {
  const g = new THREE.Group();
  const trunk = cyl(0.12 * s, 0.16 * s, 1.2 * s, "#8a5a2b"); trunk.position.y = 0.6 * s;
  const crown = mesh(new THREE.SphereGeometry(0.85 * s, 24, 16), leaf, { rough: 0.9 }); crown.scale.y = 0.92; crown.position.y = 1.7 * s;
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
// 발밑 그림자(동그란 흐린 얼룩): 그림자 기능이 꺼진 낮은 화질에서도 땅에 서 있는 느낌
let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.5, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c); return blobTex;
}
const _bw = new THREE.Vector3();
function footBlob(root, r = 0.42) {
  const m = new THREE.Mesh(geo("blob", () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.4, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.scale.set(r * 2, r * 1.5, 1); m.renderOrder = -1; m.userData.look = true;
  // 땅 위에 서 있을 때만 (탈것에 앉았거나 하늘을 날 땐 숨김), 뛰어오르면 옅어짐
  m.onBeforeRender = () => { root.getWorldPosition(_bw); const y = Math.max(0, _bw.y); m.material.opacity = y > 0.6 ? 0 : 0.4 * (1 - y / 0.6); };
  root.add(m); return m;
}
export function avatar({ shirt = "#ff6b6b", pants = "#3b5bdb", skin = SKINS[0], hair = HAIRS[0], girl = false, scale = 1 } = {}) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const R = LOOK.rim, SK = { rough: 0.55, grain: 0.03, rim: R }, CL = { rough: 0.85, rim: R }, HR = { rough: 0.42, grain: 0.05, env: 1, spec: 0.9, rim: R };
  const legs = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(0.1 * s, 0.78, 0);
    const l = mesh(capsule(0.08, 0.58, 4, 14), mat(pants, CL)); l.position.y = -0.37;
    const shoe = mesh(capsule(0.065, 0.12, 3, 10), "#ffffff", { rough: 0.5 }); shoe.rotation.x = Math.PI / 2; shoe.scale.set(1.1, 1, 0.65); shoe.position.set(0, -0.76, 0.04);
    const sole = mesh(capsule(0.068, 0.13, 3, 10), shirt, { rough: 0.6 }); sole.rotation.x = Math.PI / 2; sole.scale.set(1.12, 1.02, 0.3); sole.position.set(0, -0.795, 0.04);   // 옷 색 밑창
    p.add(l, shoe, sole); body.add(p); return p;
  });
  const torso = mesh(capsule(0.2, 0.32, 6, 20), mat(shirt, CL)); torso.position.y = 1.08; torso.scale.set(1, 1, 0.75); body.add(torso);
  // 옷깃(흰 줄)·허리띠: 옷이 한 덩어리처럼 안 보이게
  if (shirt !== skin) { const collar = mesh(new THREE.TorusGeometry(0.105, 0.028, 8, 28), "#ffffff", { rough: 0.7 }); collar.rotation.x = Math.PI / 2; collar.position.y = 1.395; collar.scale.set(1, 0.8, 1); body.add(collar); }   // 맨몸(복싱)엔 옷깃 없음
  const belt = mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 32), "#2b2b33", { rough: 0.5 }); belt.rotation.x = Math.PI / 2; belt.position.y = 0.83; belt.scale.set(1.02, 0.78, 1); body.add(belt);
  const headG = new THREE.Group(); headG.position.y = 1.56; body.add(headG);
  const head = ball(0.21, mat(skin, SK)); head.scale.set(1, 1.08, 1); headG.add(head);
  [-1, 1].forEach(s => { const ear = ball(0.045, mat(skin, SK)); ear.scale.set(0.6, 1, 0.8); ear.position.set(0.205 * s, 0.0, -0.01); headG.add(ear); });
  const hairM = mesh(geo("hair", () => Object.assign(new THREE.SphereGeometry(0.225, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), { userData: { smooth: true } })), mat(hair, HR)); hairM.position.y = 0.03; hairM.rotation.x = -0.25; headG.add(hairM);
  // 앞머리: 이마를 살짝 덮는 둥근 머리카락 (여자는 옆머리까지 길게)
  const bang = ball(0.12, mat(hair, HR)); bang.scale.set(1.55, 0.45, 0.7); bang.position.set(0.03, 0.135, 0.15); bang.rotation.z = -0.18; headG.add(bang);
  if (girl) {
    [-1, 1].forEach(s => { const side = mesh(capsule(0.06, 0.16, 4, 12), mat(hair, HR)); side.position.set(0.19 * s, -0.04, -0.03); side.rotation.z = 0.12 * s; headG.add(side); });
    const tail = ball(0.1, mat(hair, HR)); tail.scale.set(1, 1.25, 1); tail.position.set(0, -0.02, -0.23); headG.add(tail);
    const tie = ball(0.035, shirt); tie.position.set(0, 0.07, -0.215); headG.add(tie);
  }
  // 얼굴: 눈(반짝이는 빛 점) · 눈썹 · 코 · 볼 · 입
  [-1, 1].forEach(s => {
    const e = ball(0.03, "#1d1d1d", { cast: false, rough: 0.25, env: 1.4, spec: 1 }); e.scale.set(1, 1.5, 0.6); e.position.set(0.075 * s, 0.03, 0.19); headG.add(e);
    const hl = ball(0.009, "#ffffff", { cast: false, glow: 0xffffff }); hl.position.set(0.075 * s + 0.01, 0.048, 0.207); headG.add(hl);
    const brow = mesh(capsule(0.008, 0.035, 3, 6), mat(hair, HR), { cast: false }); brow.rotation.z = Math.PI / 2 + 0.15 * s; brow.position.set(0.078 * s, 0.112, 0.193); headG.add(brow);
    const ch = ball(0.035, "#ff9fae", { cast: false, opacity: 0.7 }); ch.scale.set(1, 0.6, 0.3); ch.position.set(0.12 * s, -0.05, 0.17); headG.add(ch);
  });
  const nose = ball(0.024, mat(skin, SK), { cast: false }); nose.scale.set(1, 0.85, 0.8); nose.position.set(0, -0.015, 0.212); headG.add(nose);
  const mouth = mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), "#7a3b1a", { cast: false }); mouth.position.set(0, -0.08, 0.195); mouth.rotation.z = Math.PI; headG.add(mouth);
  const arms = [1, -1].map(s => {        // 캐릭터 자신의 왼팔(+x쪽, 정면 기준)·오른팔
    const sh = new THREE.Group(); sh.position.set(0.27 * s, 1.34, 0); body.add(sh);
    const up = mesh(capsule(0.06, 0.2, 4, 12), mat(shirt, CL)); up.position.y = -0.15; sh.add(up);   // 어깨·팔꿈치가 둥글게
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const fo = mesh(capsule(0.05, 0.19, 4, 12), mat(skin, SK)); fo.position.y = -0.135; el.add(fo);
    const hand = new THREE.Group(); hand.position.y = -0.29; el.add(hand);
    hand.add(ball(0.065, mat(skin, SK)));
    return { sh, el, hand, s };
  });
  root.scale.setScalar(scale);
  const blob = footBlob(root);
  const api = Object.assign(root, {
    body, headG, arms, legs, blob,
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

/* ---------- 관중 ---------- */
// 관중 한 명: 머리·머리카락·몸·팔을 한 덩어리(정점 색)로 합쳐 그리기 한 번에 → 수십 명이어도 가벼움
// 위치는 머리 가운데 (예전 공 모양 관중과 같은 자리에 그대로 바꿔 넣을 수 있음)
const fanGeoCache = new Map(), fanMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
function partGeo(g, color, m) {
  g.applyMatrix4(m); const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color).convertSRGBToLinear(), n = ng.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  ng.setAttribute("color", new THREE.BufferAttribute(col, 3)); return ng;
}
function mergeParts(parts) {
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0; for (const g of parts) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.count * 3; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.userData = { shared: true, smooth: true }; return out;
}
export function fan(shirt, r = 0.25, i = 0) {
  const skin = SKINS[i % SKINS.length], hair = HAIRS[(i * 7 + 3) % HAIRS.length], up = i % 3 !== 1;   // 셋 중 둘은 두 팔 번쩍
  const key = [shirt, r, skin, hair, up].join("|");
  if (!fanGeoCache.has(key)) {
    const M = (x, y, z, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz));
    const parts = [
      partGeo(new THREE.SphereGeometry(r, 14, 10), skin, M(0, 0, 0, 0, 0, 1, 1.06, 1)),
      partGeo(new THREE.SphereGeometry(r * 1.07, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, M(0, r * 0.08, -r * 0.05, -0.28)),
      partGeo(new THREE.CapsuleGeometry(r * 1.0, r * 1.1, 4, 12), shirt, M(0, -r * 2.05, 0, 0, 0, 1, 1, 0.75)),
    ];
    [-1, 1].forEach(sd => {
      const ang = up ? sd * 2.6 : sd * 0.25;                         // 팔: 위로 번쩍 또는 아래로
      const len = r * 1.25, sx = sd * r * 0.95, sy = -r * 1.45;
      const cx = sx + Math.sin(ang) * len * 0.5 * -1 * -1, cy = sy - Math.cos(ang) * len * 0.5;
      parts.push(partGeo(new THREE.CapsuleGeometry(r * 0.28, len, 3, 8), shirt, M(cx, cy, 0, 0, ang)));
      parts.push(partGeo(new THREE.SphereGeometry(r * 0.32, 8, 6), skin, M(sx + Math.sin(ang) * len, sy - Math.cos(ang) * len, 0)));
    });
    fanGeoCache.set(key, mergeParts(parts));
  }
  const m = new THREE.Mesh(fanGeoCache.get(key), fanMat); m.castShadow = false; m.receiveShadow = false; return m;
}

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
