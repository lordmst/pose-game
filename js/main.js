// 화면 흐름: 선수 고르기 → (카메라) 게임 고르기 → 자리 잡기 → 3·2·1 → 게임 → 결과 → 순위
import { Camera, Tracker, createDetector, assign, SIM } from "./pose.js";
import { sfx, bgm, speak, stopSpeak, unlock, settings } from "./audio.js";
import * as R from "./records.js";
import { popup, shakeOffset, updateFx, drawFx, clearFx, outlinedText, rr, P1C, P2C } from "./fx.js";
import copy from "./games/copy.js";
import math, { LEVELS } from "./games/math.js";
import ice from "./games/ice.js";
import star from "./games/star.js";

const GAMES = { copy, math, ice, star };
const GAME_ORDER = ["copy", "math", "ice", "star"];
const SLOT_COLORS = [P1C, P2C];
const UI_DWELL = 1.0;                 // 손을 버튼 위에 이만큼 대고 있으면 선택
const FEVER_SEC = 10;                 // 마지막 N초는 점수 2배
const HAND_UI = !SIM || /handui=1/.test(location.search);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const view = { W: 0, H: 0, U: 0, dpr: 1 };
const canvas = $("#canvas"), ctx = canvas.getContext("2d"), video = $("#video");
const cam = new Camera(video);
const zones = [];

let detector = null;
const detectorP = createDetector()
  .then(d => { detector = d; if (state === "setup") setMsg("준비 완료! 선수를 고르고 시작하세요"); return d; })
  .catch(e => { setMsg("게임 엔진을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.", true); console.error(e); throw e; });
detectorP.catch(() => {});

let state = "setup";
let sel = [];
const guestLevels = { guest1: "add10", guest2: "add10" };
let slots = [], trackers = [], players = [], insts = [];
let gameId = "copy";
let timeLeft = 0, fever = false, readyT = 0, cdT = 0, goT = 0;
let visSupported = false, loopOn = false, lastT = 0, uiCool = 0;
let rankView = { game: "copy", level: "add10" }, rankBackTo = "setup", justSaved = new Set();

/* ---------- 설정 불러오기 ---------- */
const saved = R.getSettings();
for (const k of ["sfx", "bgm", "tts"]) if (typeof saved[k] === "boolean") settings[k] = saved[k];
sel = (saved.lastSel || []).filter(id => id.startsWith("guest") || R.players().some(p => p.id === id)).slice(0, 2);
function saveSettings() { R.setSettings({ sfx: settings.sfx, bgm: settings.bgm, tts: settings.tts, lastSel: sel }); }

/* ---------- 화면 크기 ---------- */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.W = window.innerWidth; view.H = window.innerHeight; view.U = Math.min(view.W, view.H); view.dpr = dpr;
  canvas.width = Math.round(view.W * dpr); canvas.height = Math.round(view.H * dpr);
  canvas.style.width = view.W + "px"; canvas.style.height = view.H + "px";
  cam.layout(view.W, view.H); layoutZones();
}
function layoutZones() {
  const n = Math.max(1, slots.length);
  for (let i = 0; i < n; i++) {
    const z = zones[i] || (zones[i] = {});
    z.x0 = view.W * i / n; z.x1 = view.W * (i + 1) / n; z.w = view.W / n; z.cx = (z.x0 + z.x1) / 2;
  }
  zones.length = n;
}
window.addEventListener("resize", resize);
resize();

/* ---------- 화면 전환 ---------- */
const SCREENS = { setup: "scr-setup", select: "scr-select", ready: "scr-ready", result: "scr-result", ranking: "scr-ranking" };
function setState(s) {
  state = s;
  $$(".screen").forEach(el => el.classList.toggle("on", el.id === SCREENS[s]));
  const inGame = s === "countdown" || s === "play";
  $("#hud").hidden = !inGame; $("#btnQuit").hidden = !inGame;
  if (s !== "countdown") $("#cd").hidden = true;
  $$("[data-hand]").forEach(el => { el._d = 0; el.style.setProperty("--p", 0); el.classList.remove("hover"); });
  uiCool = 0.7;
}
function setMsg(t, err) { const el = $("#setupMsg"); el.textContent = t; el.classList.toggle("err", !!err); }
let toastT = 0;
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2400); }

/* ---------- 1. 선수 고르기 ---------- */
function allChoices() {
  return [...R.players().map(p => ({ id: p.id, name: p.name, guest: false })),
    { id: "guest1", name: "손님 1", guest: true }, { id: "guest2", name: "손님 2", guest: true }];
}
const nameOf = id => (allChoices().find(c => c.id === id) || { name: "?" }).name;
const levelOf = id => id.startsWith("guest") ? guestLevels[id] : ((R.players().find(p => p.id === id) || {}).level || "add10");

function renderSetup() {
  const chips = $("#chips"); chips.innerHTML = "";
  for (const c of allChoices()) {
    const i = sel.indexOf(c.id);
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (i >= 0 ? ` picked p${i + 1}` : "") + (c.guest ? " guest" : "");
    b.innerHTML = `${i >= 0 ? `<span class="badge">${i + 1}P</span>` : ""}<span class="nm">${esc(c.name)}</span>${c.guest ? "" : '<span class="del" aria-label="삭제">×</span>'}`;
    b.onclick = e => {
      if (e.target.classList.contains("del")) {
        if (confirm(`'${c.name}' 선수를 목록에서 지울까요? 이미 저장된 기록은 순위에 남습니다.`)) { R.removePlayer(c.id); sel = sel.filter(x => x !== c.id); saveSettings(); renderSetup(); }
        return;
      }
      if (i >= 0) sel.splice(i, 1);
      else if (sel.length < 2) sel.push(c.id);
      else { toast("최대 2명까지 함께할 수 있어요"); return; }
      saveSettings(); renderSetup();
    };
    chips.appendChild(b);
  }
  const rows = $("#slotRows"); rows.innerHTML = "";
  sel.forEach((id, i) => {
    const row = document.createElement("div");
    row.className = `slotrow p${i + 1}`;
    const pos = sel.length === 2 ? (i === 0 ? "화면 왼쪽에 서기" : "화면 오른쪽에 서기") : "화면 가운데 서기";
    row.innerHTML = `<span class="badge">${i + 1}P</span><b class="nm">${esc(nameOf(id))}</b><span class="pos">${pos}</span><label>수학 풍선 <select></select></label>`;
    const s = row.querySelector("select");
    for (const [k, v] of Object.entries(LEVELS)) s.add(new Option(v, k));
    s.value = levelOf(id);
    s.onchange = () => { if (id.startsWith("guest")) guestLevels[id] = s.value; else R.setLevel(id, s.value); };
    rows.appendChild(row);
  });
  const btn = $("#btnStart");
  btn.disabled = sel.length === 0;
  btn.textContent = sel.length === 0 ? "선수를 골라 주세요" : sel.length === 1 ? "혼자 하기 시작" : "둘이 대결 시작";
}

$("#addForm").onsubmit = e => {
  e.preventDefault();
  const inp = $("#newName"), p = R.addPlayer(inp.value);
  if (!p) return;
  inp.value = ""; inp.blur();
  if (!sel.includes(p.id) && sel.length < 2) sel.push(p.id);
  saveSettings(); renderSetup();
};
for (const k of ["tts", "sfx", "bgm"]) {
  const el = $("#opt-" + k); el.checked = settings[k];
  el.onchange = () => { settings[k] = el.checked; saveSettings(); };
}
$("#btnRankSetup").onclick = () => openRanking("setup");
$("#btnReset").onclick = () => { if (confirm("모든 순위 기록을 지울까요? 되돌릴 수 없습니다.")) { R.clearRecords(); toast("기록을 모두 지웠어요"); } };

$("#btnStart").onclick = async () => {
  if (!sel.length) return;
  unlock(); goFullscreen();
  slots = sel.map((id, i) => ({ id, profileId: id.startsWith("guest") ? null : id, name: nameOf(id), level: levelOf(id), color: SLOT_COLORS[i] }));
  setMsg("카메라를 켜는 중...");
  try { await cam.open(); }
  catch (e) { setMsg(cameraErrorText(e), true); return; }
  if (!detector) {
    setMsg("게임 엔진 불러오는 중... 잠시만 기다려 주세요");
    try { await detectorP; } catch (e) { cam.close(); return; }
  }
  trackers = slots.map((s, i) => new Tracker(i));
  document.body.classList.add("live");
  resize(); buildCursors(); renderSelect(); keepAwake();
  setMsg("");
  setState("select");
  startLoop();
};
function cameraErrorText(e) {
  if (!window.isSecureContext) return "카메라는 https 주소에서만 켜집니다. 게임 주소(https://…)로 다시 접속해 주세요.";
  if (e && e.name === "NotAllowedError") return "카메라 권한이 거부되었습니다. 주소창의 자물쇠 아이콘(아이폰·아이패드는 설정 > Safari > 카메라)에서 허용한 뒤 다시 눌러 주세요.";
  if (e && e.name === "NotFoundError") return "카메라를 찾지 못했습니다.";
  if (e && e.name === "NotReadableError") return "다른 앱이 카메라를 쓰고 있습니다. 다른 앱을 닫고 다시 시도해 주세요.";
  return "카메라를 열 수 없습니다: " + ((e && e.message) || e);
}
function backToSetup() {
  stopLoop(); bgm.stop(); stopSpeak(); cam.close(); trackers = [];
  document.body.classList.remove("live"); hideCursors();
  setState("setup"); renderSetup();
}

/* ---------- 2. 게임 고르기 ---------- */
function renderSelect() {
  const el = $("#selPlayers"); el.innerHTML = "";
  slots.forEach((s, i) => { const b = document.createElement("span"); b.className = "badge-lg"; b.style.setProperty("--c", s.color); b.textContent = `${i + 1}P ${s.name}`; el.appendChild(b); });
}
$$(".card[data-game]").forEach(c => { c.onclick = () => { unlock(); chooseGame(c.dataset.game); }; });
$("#btnRank").onclick = () => openRanking("select");
$("#btnSetup").onclick = backToSetup;

/* ---------- 3. 자리 잡기 ---------- */
let readyCache = "";
function chooseGame(id) {
  gameId = id; const g = GAMES[id];
  $("#readyTitle").textContent = `${g.icon} ${g.title}`;
  $("#readyHow").textContent = g.how;
  $("#readyHint").textContent = slots.length === 2
    ? "1P는 화면 왼쪽, 2P는 오른쪽에 서서 머리부터 허리, 두 팔이 다 보이게 해 주세요"
    : "화면 가운데에 서서 머리부터 허리, 두 팔이 다 보이게 해 주세요";
  readyT = 0; readyCache = "";
  setState("ready");
}
function renderReadyStat(ok) {
  const html = slots.map((s, i) => `<span class="rs${ok[i] ? " ok" : ""}" style="--c:${s.color}">${i + 1}P ${esc(s.name)} · ${ok[i] ? "준비 완료" : "몸이 다 안 보여요"}</span>`).join("");
  if (html !== readyCache) { $("#readyStat").innerHTML = html; readyCache = html; }
}
$("#btnGo").onclick = () => beginCountdown();
$("#btnReadyBack").onclick = () => setState("select");

/* ---------- 4. 카운트다운 · 게임 ---------- */
function beginCountdown() {
  const g = GAMES[gameId];
  clearFx(); fever = false; timeLeft = g.sec;
  $("#hud").classList.remove("fever"); bgm.setTempo(1);
  players = slots.map(s => ({ ...s, score: 0, combo: 0, maxCombo: 0, misses: 0 }));
  trackers.forEach(tr => { tr.meters = 0; });
  insts = players.map((p, i) => g.create(makeEnv(i)));
  setupHud();
  cdT = 3; setState("countdown"); showCd("3"); sfx.tick();
}
function beginPlay() { setState("play"); showCd("시작!"); goT = 0.7; sfx.go(); bgm.start(); }
function showCd(txt) { const el = $("#cd"); el.hidden = false; el.textContent = txt; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }

function makeEnv(i) {
  const p = players[i];
  return {
    slot: i, player: p, tracker: trackers[i], zone: zones[i], view, mode: slots.length,
    level: p.level, color: p.color, name: p.name,
    progress: () => 1 - Math.max(0, timeLeft) / GAMES[gameId].sec,
    fever: () => fever,
    award: (base, x, y) => award(i, base, x, y),
    miss: (x, y, label) => miss(i, x, y, label),
    penalty: (n, x, y, label) => penalty(i, n, x, y, label),
    speak: text => speak(slots.length === 2 ? `${p.name}, ${text}` : text, slots.length === 2),
  };
}
function award(i, base, x, y) {
  const p = players[i], pts = base * (fever ? 2 : 1);
  p.combo++; p.maxCombo = Math.max(p.maxCombo, p.combo);
  let bonus = 0;
  if (p.combo >= 5 && p.combo % 5 === 0) {
    bonus = 1;
    popup(x, y - view.U * 0.08, `${p.combo} 콤보! +1`, { size: view.U * 0.05, color: "#ffe14d", stroke: "#7a4a00" });
  }
  p.score += pts + bonus;
  popup(x, y, `+${pts}`, { size: view.U * (fever ? 0.085 : 0.065), color: "#fff", stroke: p.color });
  bump(i);
  return pts + bonus;
}
function miss(i, x, y, label) {
  const p = players[i]; p.combo = 0; p.misses++;
  if (label) popup(x, y, label, { size: view.U * 0.04, color: "#eee", stroke: "#555" });
}
function penalty(i, n, x, y, label) {
  const p = players[i]; p.combo = 0; p.score = Math.max(0, p.score - n);
  popup(x, y, label, { size: view.U * 0.06, color: "#fff", stroke: "#d02020" });
  bump(i);
}
function enterFever() {
  fever = true; sfx.fever(); bgm.setTempo(1.35);
  $("#hud").classList.add("fever");
  popup(view.W / 2, view.H * 0.45, "피버 타임! 점수 2배", { size: view.U * 0.09, color: "#fff", stroke: "#e0306a", life: 1.6, vy: -20 });
}

/* ---------- HUD ---------- */
let hudCache = [];
function setupHud() {
  hudCache = [];
  players.forEach((p, i) => { const b = $("#pb" + i); b.style.setProperty("--c", p.color); b.querySelector(".pn").textContent = `${i + 1}P ${p.name}`; });
  $("#pb1").style.visibility = players.length === 2 ? "visible" : "hidden";
  renderHud();
}
function renderHud() {
  players.forEach((p, i) => {
    const key = p.score + "|" + p.combo;
    if (hudCache[i] === key) return; hudCache[i] = key;
    const b = $("#pb" + i);
    b.querySelector(".ps").textContent = p.score;
    b.querySelector(".pc").textContent = p.combo >= 2 ? `${p.combo} 콤보` : "";
  });
  const sec = GAMES[gameId].sec;
  $("#tfill").style.width = Math.max(0, timeLeft / sec * 100) + "%";
  $("#ttxt").textContent = Math.max(0, Math.ceil(timeLeft));
}
function bump(i) { const el = $(`#pb${i} .ps`); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
$("#btnQuit").onclick = () => { bgm.stop(); stopSpeak(); setState("select"); };

/* ---------- 5. 결과 ---------- */
function endGame() {
  bgm.stop(); stopSpeak(); sfx.fanfare();
  $("#hud").classList.remove("fever");
  justSaved = new Set();
  const results = players.map((p, i) => {
    const meters = Math.round(trackers[i].meters * 10) / 10;
    let rec = null;
    if (p.profileId) {
      rec = R.addRecord({ key: R.gameKey(gameId, p.level), game: gameId, level: gameId === "math" ? p.level : null, playerId: p.profileId, name: p.name, score: p.score, mode: players.length, meters });
      justSaved.add(rec.record.id);
    }
    return { p, meters, rec, extra: (insts[i].result && insts[i].result()) || "" };
  });
  renderResult(results);
  rankView = { game: gameId, level: players[0].level };
  setState("result");
}
function renderResult(results) {
  const g = GAMES[gameId];
  let title = "끝!";
  if (results.length === 2) {
    const [a, b] = results;
    title = a.p.score === b.p.score ? "무승부!" : `${(a.p.score > b.p.score ? a : b).p.name} 승리!`;
  }
  $("#resTitle").textContent = `${g.icon} ${g.title} · ${title}`;
  const box = $("#resCols"); box.innerHTML = "";
  const decided = results.length === 2 && results[0].p.score !== results[1].p.score;
  const top = Math.max(...results.map(r => r.p.score));
  results.forEach(({ p, meters, rec, extra }, i) => {
    let badge = "";
    if (rec) badge = rec.rank === 1 && rec.total > 1 ? "전체 1위!" : rec.best ? "개인 최고 기록!" : rec.first ? "첫 기록!" : "";
    const col = document.createElement("div");
    col.className = "rcol"; col.style.setProperty("--c", p.color);
    col.innerHTML =
      `<div class="rname">${decided && p.score === top ? "👑 " : ""}${i + 1}P ${esc(p.name)}</div>` +
      `<div class="rscore">${p.score}<small>점</small></div>` +
      (badge ? `<div class="rbadge">${badge}</div>` : "") +
      `<div class="rmeta">${rec ? `전체 ${rec.rank}위 (기록 ${rec.total}개 중)` : "손님 기록은 저장되지 않아요"}</div>` +
      `<div class="rmeta">${esc(extra)}${extra ? " · " : ""}최대 콤보 ${p.maxCombo}</div>` +
      `<div class="rmeta">손이 움직인 거리 약 ${meters}m</div>`;
    box.appendChild(col);
  });
}
$("#btnAgain").onclick = () => chooseGame(gameId);
$("#btnOther").onclick = () => setState("select");
$("#btnResRank").onclick = () => openRanking("result");

/* ---------- 6. 순위 ---------- */
function openRanking(from) { rankBackTo = from; renderRanking(); setState("ranking"); }
function tabBtn(text, on, fn) {
  const b = document.createElement("button"); b.type = "button"; b.className = "tab" + (on ? " on" : "");
  b.textContent = text; b.setAttribute("data-hand", ""); b.onclick = fn; return b;
}
function renderRanking() {
  const tabs = $("#rankTabs"); tabs.innerHTML = "";
  for (const id of GAME_ORDER) tabs.appendChild(tabBtn(`${GAMES[id].icon} ${GAMES[id].title}`, rankView.game === id, () => { rankView.game = id; renderRanking(); }));
  const sub = $("#rankSub"); sub.innerHTML = ""; sub.hidden = rankView.game !== "math";
  if (rankView.game === "math") for (const [k, v] of Object.entries(LEVELS)) sub.appendChild(tabBtn(v, rankView.level === k, () => { rankView.level = k; renderRanking(); }));
  const key = R.gameKey(rankView.game, rankView.level);
  const ol = $("#rankList"); ol.innerHTML = "";
  const list = R.ranking(key, 10);
  if (!list.length) ol.innerHTML = '<li class="empty">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</li>';
  list.forEach((r, i) => {
    const d = new Date(r.at), li = document.createElement("li");
    if (justSaved.has(r.id)) li.className = "new";
    li.innerHTML = `<b class="rk">${i + 1}</b><span class="nm">${esc(r.name)}</span><span class="sc">${r.score}점</span><span class="dt">${d.getMonth() + 1}/${d.getDate()}${r.mode === 2 ? " · 대결" : ""}</span>`;
    ol.appendChild(li);
  });
  const bx = $("#rankBests"); bx.innerHTML = "<h4>선수별 최고 기록</h4>";
  const bs = R.bests(key);
  if (!bs.length) bx.insertAdjacentHTML("beforeend", '<p class="empty">-</p>');
  bs.forEach(b => bx.insertAdjacentHTML("beforeend", `<p><span>${esc(b.name)}</span><b>${b.score}점</b></p>`));
}
$("#btnRankBack").onclick = () => {
  if (!loopOn) { setState("setup"); renderSetup(); return; }
  setState(rankBackTo === "result" ? "result" : "select");
};

/* ---------- 메인 루프 ---------- */
function startLoop() { if (loopOn) return; loopOn = true; lastT = 0; requestAnimationFrame(frame); }
function stopLoop() { loopOn = false; }
function frame(now) {
  if (!loopOn) return;
  requestAnimationFrame(frame);
  const t = now / 1000, dt = lastT ? Math.min(0.1, Math.max(0, t - lastT)) : 0.016; lastT = t;
  cam.layout(view.W, view.H);
  let raws = [];
  if (detector && cam.ready) { try { raws = detector.detect(video, now); } catch (e) { console.warn(e); } }
  if (!visSupported && raws.some(r => r.some(p => p.visibility > 0.01))) visSupported = true;
  const as = assign(raws, trackers, cam, view.W);
  trackers.forEach((tr, i) => tr.update(as[i], cam, dt, t, visSupported));
  tick(dt);
  updateFx(dt);
  draw(t);
  if (HAND_UI) handUI(dt);
  drawCursors();
}
function tick(dt) {
  if (state === "ready") {
    const ok = trackers.map(tr => tr.fullBody);
    readyT = ok.every(Boolean) ? readyT + dt : 0;
    renderReadyStat(ok);
    if (readyT >= 0.8) beginCountdown();
  } else if (state === "countdown") {
    const before = Math.ceil(cdT); cdT -= dt; const after = Math.ceil(cdT);
    if (after !== before && after > 0) { showCd(String(after)); sfx.tick(); }
    if (cdT <= 0) beginPlay();
  } else if (state === "play") {
    if (goT > 0) { goT -= dt; if (goT <= 0) $("#cd").hidden = true; }
    timeLeft -= dt;
    if (!fever && timeLeft <= FEVER_SEC) enterFever();
    insts.forEach(g => g.update(dt));
    renderHud();
    if (timeLeft <= 0) endGame();
  }
}

/* ---------- 그리기 ---------- */
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
function draw(t) {
  const { W, H, dpr, U } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [sx, sy] = shakeOffset();
  ctx.save(); ctx.translate(sx, sy);
  cam.draw(ctx, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(-20, -20, W + 40, H + 40);
  if (fever && state === "play") {
    ctx.lineWidth = U * 0.022; ctx.strokeStyle = `hsla(${(t * 140) % 360},90%,60%,0.9)`;
    ctx.strokeRect(U * 0.011, U * 0.011, W - U * 0.022, H - U * 0.022);
  }
  if (slots.length === 2 && state !== "select" && state !== "ranking") {
    ctx.save(); ctx.setLineDash([U * 0.025, U * 0.02]); ctx.lineWidth = U * 0.006; ctx.strokeStyle = "rgba(255,255,255,.6)";
    ctx.beginPath(); ctx.moveTo(W / 2, U * 0.14); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.restore();
  }
  drawSkeletons();
  if (state === "ready") drawReady();
  if (state === "countdown" || state === "play") { insts.forEach(g => g.draw(ctx)); drawLost(); }
  drawFx(ctx);
  ctx.restore();
}
// 몸 위의 뼈대 선은 기본으로 숨김 (인식은 그대로 함). 주소 끝에 ?bones=1 을 붙이면 점검용으로 보임
const SHOW_BONES = /bones=1/.test(location.search);
function drawSkeletons() {
  trackers.forEach((tr, i) => {
    if (!tr.pts) return;
    const p = tr.pts, c = slots[i].color;
    if (SHOW_BONES) {
      ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = c; ctx.lineWidth = Math.max(3, view.U * 0.008); ctx.lineCap = "round";
      ctx.beginPath();
      for (const [a, b] of BONES) if (p[a].v && p[b].v) { ctx.moveTo(p[a].x, p[a].y); ctx.lineTo(p[b].x, p[b].y); }
      ctx.stroke(); ctx.restore();
    }
    // 2인일 때만 머리 위에 1P/2P 표시
    if (p[0].v && slots.length === 2) outlinedText(ctx, `${i + 1}P`, p[0].x, p[0].y - tr.scale * 0.6, view.U * 0.04, "#fff", c);
  });
}
function drawReady() {
  const { H, U } = view;
  zones.forEach((z, i) => {
    const ok = trackers[i] && trackers[i].fullBody;
    const w = Math.min(z.w * 0.6, U * 0.75), x = z.cx - w / 2, y = H * 0.24, h = H * 0.72;
    ctx.save(); ctx.setLineDash(ok ? [] : [U * 0.025, U * 0.018]); ctx.lineWidth = U * 0.01;
    ctx.strokeStyle = ok ? "#2fd36b" : "rgba(255,255,255,.85)"; rr(ctx, x, y, w, h, U * 0.04); ctx.stroke(); ctx.restore();
    outlinedText(ctx, ok ? "좋아요!" : `${i + 1}P ${slots[i].name} 여기`, z.cx, y + h - U * 0.05, U * 0.05, "#fff", ok ? "#1d8f47" : slots[i].color);
  });
}
function drawLost() {
  trackers.forEach((tr, i) => {
    if (tr.lostT < 0.6) return;
    const z = zones[i];
    outlinedText(ctx, `${i + 1}P ${slots[i].name}`, z.cx, view.H * 0.45, view.U * 0.06, "#fff", slots[i].color);
    outlinedText(ctx, "화면 안으로 들어와요", z.cx, view.H * 0.53, view.U * 0.045, "#fff", "#333");
  });
}

/* ---------- 손 커서 · 손으로 버튼 누르기 ---------- */
const curEls = [];
function buildCursors() {
  const box = $("#cursors"); box.innerHTML = ""; curEls.length = 0;
  slots.forEach((s, i) => [0, 1].forEach(k => {
    const d = document.createElement("div"); d.className = "cur"; d.style.setProperty("--c", s.color);
    box.appendChild(d); curEls.push({ d, i, k });
  }));
}
function drawCursors() {
  const emoji = (state === "play" || state === "countdown") ? (GAMES[gameId].cursor || "") : "";
  for (const c of curEls) {
    const tr = trackers[c.i], h = tr && tr.hands[c.k];
    if (!h || !h.vis) { if (c.d.style.display !== "none") c.d.style.display = "none"; continue; }
    if (c.d.style.display !== "flex") c.d.style.display = "flex";
    if (c.d._e !== emoji) { c.d.textContent = emoji; c.d._e = emoji; }
    const k = 1 + Math.min(0.7, h.bodySpeed / 12);
    c.d.style.transform = `translate(${h.x.toFixed(1)}px, ${h.y.toFixed(1)}px) scale(${k.toFixed(2)})`;
  }
}
function hideCursors() { curEls.forEach(c => { c.d.style.display = "none"; }); }
function handUI(dt) {
  uiCool = Math.max(0, uiCool - dt);
  if (state === "play" || state === "countdown" || state === "setup") return;
  const els = $$(".screen.on [data-hand]");
  if (!els.length) return;
  const hs = [];
  trackers.forEach(tr => tr.hands.forEach(h => { if (h.vis) hs.push(h); }));
  for (const el of els) {
    if (el.disabled || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    const inside = uiCool <= 0 && hs.some(h => h.x >= r.left && h.x <= r.right && h.y >= r.top && h.y <= r.bottom);
    const d = inside ? (el._d || 0) + dt : Math.max(0, (el._d || 0) - dt * 2);
    if (d !== el._d) { el._d = d; el.style.setProperty("--p", Math.min(1, d / UI_DWELL).toFixed(3)); }
    el.classList.toggle("hover", inside);
    if (d >= UI_DWELL) {
      els.forEach(e => { e._d = 0; e.style.setProperty("--p", 0); e.classList.remove("hover"); });
      uiCool = 0.8; sfx.select(); el.click(); break;
    }
  }
}

/* ---------- 기기 관련 ---------- */
async function keepAwake() { try { if (navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (!document.hidden && loopOn) keepAwake(); });
function goFullscreen() {
  const d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen;
  try { const r = f && f.call(d); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}

if (SIM) window.__dbg = { get state() { return state; }, setTime: s => { timeLeft = s; }, players: () => players };

renderSetup();
setState("setup");
if (detector) setMsg("준비 완료! 선수를 고르고 시작하세요"); else setMsg("게임 엔진 불러오는 중...");
