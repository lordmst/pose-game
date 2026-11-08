/* 비행 기록기 (v77): 아이패드에서 멈추는 원인을 가려내기 위한 기록 장치. 게임 동작에는 영향 없음.
   1) 화면 왼쪽 아래 작은 표시: JS 프레임 수 · 카메라 시각 · 초당 프레임 · 인식 장치. 옆의 점은 CSS 애니메이션(브라우저 합성기)으로 돎.
      멈춘 화면 사진 한 장으로 종류를 가림 → 숫자 멈춤+점 돎 = JS 멈춤 / 둘 다 멈춤 = 브라우저 그리기 멈춤 / 숫자 돎+카메라 시각 멈춤 = 카메라만 멈춤
   2) 1초마다 localStorage에 심장 박동(상태·게임·최근 발자취·긴 프레임)을 적음. 다음에 열면 지난번 기록을 선수 고르기 화면에 보여 줌
   3) 별도 스레드(Worker)가 본 스레드의 응답을 감시해, 2초 넘게 응답이 없으면 IndexedDB에 적음 → 다음에 열면 'JS 멈춤'인지 '강제 종료'인지 구분 */
const KEY = "posegame.diag", MAX = 50, SID = Date.now().toString(36);
const now = () => (performance.now() / 1000).toFixed(1);
const rec = { sid: SID, v: 0, ua: navigator.userAgent, scr: `${screen.width}x${screen.height}@${devicePixelRatio}`, cores: navigator.hardwareConcurrency || 0, start: new Date().toISOString(), crumbs: [], gaps: [], hb: {}, end: "" };
let frames = 0, hbAt = 0, fpsN = 0, fpsAt = 0, fps = 0, ctxFn = null, dirty = true;
export const info = {};   // 인식 장치(GPU/CPU), WebGL 종류 등 외부에서 채움

export function crumb(s) { rec.crumbs.push(`${now()} ${s}`); if (rec.crumbs.length > MAX) rec.crumbs.shift(); dirty = true; }
export function gap(ms, ctx) { rec.gaps.push(`${now()} ${Math.round(ms)}ms ${ctx}`); if (rec.gaps.length > 20) rec.gaps.shift(); dirty = true; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) {} }

/* 매 프레임: ctx() → { state, game, camT } */
export function frame(nowMs, ctx) {
  frames++; fpsN++;
  if (nowMs - fpsAt >= 1000) { fps = Math.round(fpsN * 1000 / (nowMs - fpsAt)); fpsN = 0; fpsAt = nowMs; }
  const tx = document.getElementById("diagTx");
  if (tx) tx.textContent = `v${rec.v} ${frames} 캠${ctx.camT.toFixed(1)} ${fps}fps ${info.det || ""}`;
  if (nowMs - hbAt >= 1000) {
    hbAt = nowMs;
    rec.hb = { at: new Date().toISOString(), t: now(), state: ctx.state, game: ctx.game, frames, fps, camT: +ctx.camT.toFixed(1), ...info };
    save(); dirty = false;
    if (worker) worker.postMessage({ k: "hb", ctx: `${ctx.state} ${ctx.game || ""} f${frames} 캠${ctx.camT.toFixed(1)}` });
  }
}

/* ---------- 감시 스레드 ---------- */
let worker = null;
const WORKER_SRC = `
let last = Date.now(), ctx = "", paused = false, sid = "";
onmessage = e => { const d = e.data; if (d.k === "hb") { last = Date.now(); ctx = d.ctx; } else if (d.k === "pause") paused = true; else if (d.k === "resume") { paused = false; last = Date.now(); } else if (d.k === "sid") sid = d.sid; };
function put(v) { try { const r = indexedDB.open("posegame-diag", 1); r.onupgradeneeded = () => r.result.createObjectStore("wd"); r.onsuccess = () => { try { r.result.transaction("wd", "readwrite").objectStore("wd").put(v, "last"); } catch (e) {} }; } catch (e) {} }
setInterval(() => { if (paused) return; const s = Date.now() - last; if (s > 2000) put({ sid, at: new Date().toISOString(), silentMs: s, ctx }); }, 1000);
`;
function startWorker() {
  try {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
    worker.postMessage({ k: "sid", sid: SID });
    document.addEventListener("visibilitychange", () => worker.postMessage({ k: document.hidden ? "pause" : "resume" }));
  } catch (e) { worker = null; }
}
function readWatchdog() {
  return new Promise(ok => {
    try {
      const r = indexedDB.open("posegame-diag", 1); r.onupgradeneeded = () => r.result.createObjectStore("wd");
      r.onerror = () => ok(null);
      r.onsuccess = () => { try { const g = r.result.transaction("wd", "readonly").objectStore("wd").get("last"); g.onsuccess = () => ok(g.result || null); g.onerror = () => ok(null); } catch (e) { ok(null); } };
    } catch (e) { ok(null); }
  });
}

/* ---------- 시작: 지난번 기록 읽고 판정 ---------- */
export async function init(appV) {
  rec.v = appV;
  let prev = null; try { prev = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  const wd = await readWatchdog();
  startWorker();
  for (const ev of ["pagehide", "beforeunload"]) window.addEventListener(ev, () => { rec.end = ev; crumb(ev); save(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { rec.end = "hidden"; crumb("hidden"); save(); } else { rec.end = ""; crumb("visible"); } });
  crumb("load");
  save();
  return prev ? verdict(prev, wd && wd.sid === prev.sid ? wd : null) : null;
}
function verdict(p, wd) {
  const hb = p.hb || {}, inGame = ["select", "ready", "countdown", "play"].includes(hb.state);
  let kind, why;
  if (wd && wd.silentMs > 2000) { kind = "JS 멈춤"; why = `본 스레드가 ${(wd.silentMs / 1000).toFixed(0)}초 넘게 응답 없음 (${wd.ctx})`; }
  else if (!p.end && inGame) { kind = "강제 종료"; why = "마지막 박동 뒤 종료 기록 없음, 감시 스레드도 함께 죽음 → 브라우저가 페이지를 통째로 끝냄(메모리 부족·GPU 오류 뒤 다시 열기 등)"; }
  else if (p.end && inGame) { kind = "JS 살아 있었음"; why = `종료 기록(${p.end})이 남음 → 멈춘 것처럼 보였다면 카메라 영상이나 브라우저 그리기만 멈춘 것`; }
  else { kind = "정상"; why = `마지막 화면 ${hb.state || "?"}`; }
  return { kind, why, hb, p, wd };
}

/* ---------- 지난번 기록을 선수 고르기 화면에 ---------- */
export function showPrev(v, mount) {
  if (!v || !mount) return;
  const hb = v.hb, show = v.kind !== "정상";
  const box = document.createElement("div"); box.className = "diagprev" + (show ? " bad" : "");
  const det = `${v.p.start ? v.p.start.slice(5, 16).replace("T", " ") : ""} v${v.p.v} ${hb.state || ""} ${hb.game || ""} ${hb.fps != null ? hb.fps + "fps" : ""} ${hb.det || ""}`;
  box.innerHTML = `<b>지난 실행: ${v.kind}</b> <span>${det}</span> <button type="button" class="mini">자세히</button><pre hidden></pre>`;
  const pre = box.querySelector("pre");
  pre.textContent = [`판정: ${v.kind} — ${v.why}`, `기기: ${v.p.scr} cores${v.p.cores}`, `UA: ${v.p.ua}`, `마지막 박동: ${JSON.stringify(hb)}`, v.wd ? `감시: ${JSON.stringify(v.wd)}` : "감시: 기록 없음", "", "긴 프레임:", ...(v.p.gaps || []), "", "발자취:", ...(v.p.crumbs || [])].join("\n");
  box.querySelector("button").onclick = () => { pre.hidden = !pre.hidden; };
  mount.appendChild(box);
}
