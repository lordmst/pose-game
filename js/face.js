// 얼굴로 같은 사람인지 확인 (선수 인식 보조)
// - 만세로 선수가 잡히면 얼굴 특징값(숫자 128개)을 몇 번 모아 기억
// - 선수가 가려졌다 다시 보일 때만 얼굴을 비교 → 평소에는 계산하지 않아 게임이 느려지지 않음
// - 얼굴 정보는 이 기기 안에서만 계산하고 저장하지 않음 (게임을 끝내면 사라짐)
// 엔진: @vladmandic/face-api (MIT), 몸 인식과 같은 jsDelivr에서 처음 한 번 받음 (약 8MB)
const BASE = (() => { const q = new URLSearchParams(location.search).get("facebase"); return q || "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15"; })();
let fa = null, state = "idle", busy = false, cv = null, cx = null;
export const faceState = () => state;
export const faceReady = () => state === "ready";
export const faceBusy = () => busy;

export async function initFace() {
  if (state !== "idle" || /noface=1/.test(location.search)) return;
  state = "loading";
  try {
    fa = await import(BASE + "/dist/face-api.esm.js");
    try { await fa.tf.setBackend("webgl"); } catch (e) {}
    await fa.tf.ready();
    const M = BASE + "/model";
    await Promise.all([fa.nets.tinyFaceDetector.loadFromUri(M), fa.nets.faceLandmark68TinyNet.loadFromUri(M), fa.nets.faceRecognitionNet.loadFromUri(M)]);
    cv = document.createElement("canvas"); cv.width = cv.height = 192; cx = cv.getContext("2d", { willReadFrequently: true });
    // 처음 계산할 때 그래픽 준비로 잠깐 멈추므로, 게임 전에 미리 한 번 돌려 둠
    cx.fillStyle = "#888"; cx.fillRect(0, 0, 192, 192);
    await fa.detectSingleFace(cv, opts()).withFaceLandmarks(true).withFaceDescriptor();
    if (fa.tf.getBackend() !== "webgl" && !/facebase=/.test(location.search)) { state = "slow"; return; }   // 그래픽 가속이 안 되면 너무 느려서(1초 이상) 쓰지 않음
    const t0 = performance.now(); await fa.computeFaceDescriptor(cv);
    if (performance.now() - t0 > 250 && !/facebase=/.test(location.search)) { state = "slow"; return; }   // 이 기기에서 너무 느리면 쓰지 않음 (게임이 끊기지 않게)
    state = "ready";
  } catch (e) { console.warn("face", e); state = "failed"; }
}
const opts = () => new fa.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.45 });

// 두 얼굴 특징값의 거리: 같은 사람 ≈ 0.3~0.5, 다른 사람 ≈ 0.6 이상
export function faceDist(a, b) {
  if (!a || !b) return -1;
  let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// 몸 관절(카메라 원본 좌표 0~1)로 머리 둘레를 잘라 얼굴 특징값을 계산. 얼굴이 작거나 옆을 보면 null
export function faceBox(r, vw, vh) {
  const V = p => p && (p.visibility == null || p.visibility > 0.6) && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;
  if (![0, 2, 5].every(i => V(r[i]))) return null;                  // 코와 두 눈이 보여야 함
  const P = i => ({ x: r[i].x * vw, y: r[i].y * vh }), n = P(0), eL = P(2), eR = P(5);
  const ed = Math.hypot(eL.x - eR.x, eL.y - eR.y);
  const ears = V(r[7]) && V(r[8]) ? Math.hypot(r[7].x * vw - r[8].x * vw, r[7].y * vh - r[8].y * vh) : 0;
  const s = Math.max(ears, ed * 2.3);
  if (s < 34) return null;                                          // 얼굴이 너무 작음 (멀리 있음)
  const mid = (eL.x + eR.x) / 2;
  if (Math.abs(n.x - mid) > ed * 0.6) return null;                  // 옆을 많이 봄
  const side = s * 2.2;
  return { x: n.x - side / 2, y: n.y - 0.15 * s - side / 2, side, s };
}
export async function describe(video, r) {
  if (r.face) return r.face;                                         // 가상 선수(점검용)
  if (state !== "ready" || busy || !video) return null;
  const vw = video.videoWidth || video.width, vh = video.videoHeight || video.height;
  const b = vw && vh ? faceBox(r, vw, vh) : null; if (!b) return null;
  busy = true;
  try {
    cx.drawImage(video, b.x, b.y, b.side, b.side, 0, 0, 192, 192);
    const d = await fa.detectSingleFace(cv, opts()).withFaceLandmarks(true).withFaceDescriptor();
    if (!d || d.detection.score < 0.5 || d.detection.box.width < 48) return null;
    return d.descriptor;
  } catch (e) { return null; }
  finally { busy = false; }
}
