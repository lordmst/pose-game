// 화면 흐름: 선수 고르기 → (카메라) 게임 고르기 → 자리 잡기 → 3·2·1 → 게임 → 결과 → 순위
import { Camera, Tracker, Assigner, createDetector, createHandShape, SIM } from "./pose.js?v=30";
import { sfx, bgm, speak, stopSpeak, unlock, settings, applyVolumes, rhythm as rhythmAudio } from "./audio.js?v=30";
import * as R from "./records.js?v=30";
import { popup, shakeOffset, updateFx, drawFx, clearFx, outlinedText, rr, P1C, P2C } from "./fx.js?v=30";
import copy from "./games/copy.js?v=30";
import math from "./games/math.js?v=30";
import ice from "./games/ice.js?v=30";
import star from "./games/star.js?v=30";
import fruit from "./games/fruit.js?v=30";
import mole from "./games/mole.js?v=30";
import wall from "./games/wall.js?v=30";
import rhythm from "./games/rhythm.js?v=30";
import goalie from "./games/goalie.js?v=30";
import { hangul, english } from "./games/word.js?v=30";
import clockGame from "./games/clock.js?v=30";
import run from "./games/run.js?v=30";
import simon from "./games/simon.js?v=30";
import conductor from "./games/conductor.js?v=30";
import SPORTS from "./games/sports.js?v=30";
import { ITEMS, itemOf, pickItem } from "./items.js?v=30";
import { DIFFS, diffOf } from "./difficulty.js?v=30";
import { startDemo } from "./demo.js?v=30";

const GAMES = { copy, math, ice, star, fruit, mole, wall, rhythm, goalie, run, conductor, hangul, english, clock: clockGame, simon };
const GAME_ORDER = ["copy", "ice", "star", "fruit", "mole", "wall", "rhythm", "conductor", "goalie", "run", "math", "hangul", "english", "clock", "simon"];
for (const g of SPORTS) { GAMES[g.id] = g; GAME_ORDER.push(g.id); }   // 스포츠 탭 (스포츠 리조트 종목들)
// 카드 하나로 묶는 게임: 카드를 고른 뒤 자리 잡기 화면에서 과목을 고름 (기록·순위는 게임별 그대로)
const GROUPS = [];   // 예: { id, members: [게임 id...], icon, title, desc, bg, cat }
const groupOf = id => GROUPS.find(g => g.members.includes(id));
const CATS = [{ id: "move", label: "🏃 운동" }, { id: "sport", label: "🏅 스포츠" }, { id: "learn", label: "📚 학습" }];
const LEVEL_GAMES = GAME_ORDER.filter(id => GAMES[id].levels);   // 선수별로 단계를 고르는 게임 (수학 풍선, 글자 풍선)
const firstLevel = g => Object.keys(subOf(g))[0];
// 순위 세부 탭: 선수별 단계(수학·글자) 또는 노래(리듬)
const subOf = g => g.levels || (g.songs ? Object.fromEntries(g.songs.map(s => [s.id, `${s.icon} ${s.title}`])) : null);
// 기록을 나누는 기준: 선수별 단계, 또는 이번 판 노래
const recLevel = p => GAMES[gameId].levelField ? p[GAMES[gameId].levelField] : GAMES[gameId].songs ? curSong : null;
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
// 손 모양(편 손/주먹) 판정기: 몸 인식이 준비된 뒤 이어서 불러옴. 실패해도 게임은 '들어 올린 손' 방식으로 동작
let handShape = null, shapeErr = 0, shapeSeenAt = -99, shapeRR = 0;
detectorP.then(() => createHandShape()).then(h => { handShape = h; }).catch(e => console.warn("손 모양 인식 불러오기 실패", e));

let state = "setup";
let sel = [];
// 고정 선수(지울 수 없음)와 손님 자리. 손님 이름은 이번 접속 동안만 유지
const FIXED = ["아빠", "엄마", "우영", "연제"];
const MAX_GUESTS = 6;
const guests = [{ id: "guest1", n: 1, name: "", level: "add10", wordLevel: "ko2", diff: "normal" }, { id: "guest2", n: 2, name: "", level: "add10", wordLevel: "ko2", diff: "normal" }];
const guestOf = id => guests.find(g => g.id === id);
const guestName = g => g.name.trim() || `손님 ${g.n}`;
FIXED.forEach(n => R.addPlayer(n));
let slots = [], trackers = [], players = [], insts = [];
let gameId = "copy";
let timeLeft = 0, fever = false, readyT = 0, cdT = 0, goT = 0;
let visSupported = false, loopOn = false, lastT = 0, uiCool = 0, assigner = null;
let rankView = { game: "copy", level: null }, rankBackTo = "setup", justSaved = new Set();

/* ---------- 설정 불러오기 ---------- */
const saved = R.getSettings();
for (const k of ["sfx", "bgm", "tts"]) if (typeof saved[k] === "boolean") settings[k] = saved[k];
if (saved.vol) for (const k of ["sfx", "bgm", "voice"]) if (typeof saved.vol[k] === "number") settings.vol[k] = saved.vol[k];
sel = (saved.lastSel || []).filter(id => !id.startsWith("guest") && R.players().some(p => p.id === id)).slice(0, 2);
let songSel = saved.lastSong || "basic", curSong = "basic";   // 리듬 박자 노래 ("random" = 아무거나)
function saveSettings() { R.setSettings({ ...R.getSettings(), sfx: settings.sfx, bgm: settings.bgm, tts: settings.tts, vol: { ...settings.vol }, lastSel: sel }); }

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
const SCREENS = { setup: "scr-setup", select: "scr-select", song: "scr-song", demo: "scr-demo", ready: "scr-ready", result: "scr-result", ranking: "scr-ranking" };
function setState(s) {
  state = s;
  $$(".screen").forEach(el => el.classList.toggle("on", el.id === SCREENS[s]));
  const inGame = s === "countdown" || s === "play";
  $("#hud").hidden = !inGame; $("#btnQuit").hidden = !inGame;
  $("#btnVoice").hidden = !(inGame || s === "demo" || s === "ready");
  if (s !== "countdown") $("#cd").hidden = true;
  $$("[data-hand]").forEach(el => { el._d = 0; el.style.setProperty("--p", 0); el.classList.remove("hover"); });
  uiCool = 0.7;
}
function setMsg(t, err) { const el = $("#setupMsg"); el.textContent = t; el.classList.toggle("err", !!err); }
let toastT = 0;
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2400); }

/* ---------- 1. 선수 고르기 ---------- */
function allChoices() {
  const ps = R.players();
  const fixed = FIXED.map(n => ps.find(p => p.name === n)).filter(Boolean).map(p => ({ id: p.id, name: p.name, kind: "fixed" }));
  const others = ps.filter(p => !FIXED.includes(p.name)).map(p => ({ id: p.id, name: p.name, kind: "saved" }));   // 이전에 추가해 둔 선수(지울 수 있음)
  return [...fixed, ...others, ...guests.map(g => ({ id: g.id, name: guestName(g), kind: "guest" }))];
}
function nameOf(id) { const g = guestOf(id); if (g) return guestName(g); return (R.players().find(p => p.id === id) || { name: "?" }).name; }
// 선수별 게임 단계 (수학 풍선 level, 글자 풍선 wordLevel)
function propOf(id, field, def) { const g = guestOf(id); const v = g ? g[field] : (R.players().find(p => p.id === id) || {})[field]; return v || def; }
function diffIdOf(id) { const g = guestOf(id); if (g) return g.diff; return (R.players().find(p => p.id === id) || {}).diff || "normal"; }
// 손님은 이름을 적었을 때만 그 이름으로 기록 저장
function profileOf(id) { const g = guestOf(id); if (!g) return id; return g.name.trim() ? "guest:" + g.name.trim() : null; }

function renderSetup() { renderChips(); renderSlots(); }
function renderChips() {
  const chips = $("#chips"); chips.innerHTML = "";
  for (const c of allChoices()) {
    const i = sel.indexOf(c.id);
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (i >= 0 ? ` picked p${i + 1}` : "") + (c.kind === "guest" ? " guest" : "");
    b.innerHTML = `${i >= 0 ? `<span class="badge">${i + 1}P</span>` : ""}<span class="nm">${esc(c.name)}</span>${c.kind === "saved" ? '<span class="del" aria-label="삭제">×</span>' : ""}`;
    b.onclick = e => {
      if (e.target.classList.contains("del")) {
        if (confirm(`'${c.name}' 선수를 목록에서 지울까요? 이미 저장된 기록은 순위에 남습니다.`)) { R.removePlayer(c.id); sel = sel.filter(x => x !== c.id); saveSettings(); renderSetup(); }
        return;
      }
      if (i >= 0) sel.splice(i, 1);
      else if (sel.length < 2) sel.push(c.id);
      else { toast("최대 2명까지 함께할 수 있어요"); return; }
      saveSettings(); renderSetup();
      if (c.kind === "guest" && i < 0) { const inp = $(`#slotRows input[data-guest="${c.id}"]`); if (inp && !guestOf(c.id).name) inp.focus(); }
    };
    chips.appendChild(b);
  }
  if (guests.length < MAX_GUESTS) {
    const add = document.createElement("button");
    add.type = "button"; add.className = "chip addguest"; add.textContent = "+ 손님";
    add.onclick = () => { const n = Math.max(...guests.map(g => g.n)) + 1; guests.push({ id: "guest" + n, n, name: "", level: "add10", wordLevel: "ko2", diff: "normal" }); renderChips(); };
    chips.appendChild(add);
  }
}
function renderSlots() {
  const rows = $("#slotRows"); rows.innerHTML = "";
  sel.forEach((id, i) => {
    const g = guestOf(id);
    const row = document.createElement("div");
    row.className = `slotrow p${i + 1}`;
    const pos = sel.length === 2 ? (i === 0 ? "화면 왼쪽에 서기" : "화면 오른쪽에 서기") : "화면 가운데 서기";
    const nameEl = g
      ? `<input class="gname" data-guest="${id}" maxlength="8" placeholder="손님 ${g.n} 이름 입력" value="${esc(g.name)}">`
      : `<b class="nm">${esc(nameOf(id))}</b>`;
    row.innerHTML = `<span class="badge">${i + 1}P</span>${nameEl}<span class="pos">${pos}</span><span class="diffs"></span><span class="lvls"></span>` +
      (g ? `<span class="gnote">이름을 적으면 기록이 저장돼요</span>` : "");
    if (g) {
      const inp = row.querySelector("input");
      inp.oninput = () => { g.name = inp.value.slice(0, 8); renderChips(); };
      inp.onkeydown = e => { if (e.key === "Enter") inp.blur(); };
    }
    const lv = row.querySelector(".lvls");
    for (const gid of LEVEL_GAMES) {
      const G = GAMES[gid], lab = document.createElement("label"), s = document.createElement("select");
      lab.textContent = G.levelLabel + " ";
      for (const [k, v] of Object.entries(G.levels)) s.add(new Option(v, k));
      s.value = propOf(id, G.levelField, firstLevel(G));
      s.onchange = () => { if (g) g[G.levelField] = s.value; else R.setProp(id, G.levelField, s.value); };
      lab.appendChild(s); lv.appendChild(lab);
    }
    // 난이도: 쉬움 · 보통 · 어려움
    const dbox = row.querySelector(".diffs");
    for (const d of Object.values(DIFFS)) {
      const b = document.createElement("button"); b.type = "button"; b.innerHTML = `${d.label} <small>×${d.points}</small>`;
      b.className = "dbtn " + d.id + (diffIdOf(id) === d.id ? " on" : "");
      b.onclick = () => { if (g) g.diff = d.id; else R.setDiff(id, d.id); renderSlots(); };
      dbox.appendChild(b);
    }
    rows.appendChild(row);
  });
  const btn = $("#btnStart");
  btn.disabled = sel.length === 0;
  btn.textContent = sel.length === 0 ? "선수를 골라 주세요" : sel.length === 1 ? "혼자 하기 시작" : "둘이 대결 시작";
}
/* ---------- 소리 크기 ---------- */
const VOL_KEY = { tts: "voice", sfx: "sfx", bgm: "bgm" };
function syncSoundUI() {
  for (const k of ["tts", "sfx", "bgm"]) { $("#opt-" + k).checked = settings[k]; $("#vol-" + VOL_KEY[k]).value = Math.round(settings.vol[VOL_KEY[k]] * 100); }
  updateVoiceBtn();
}
for (const k of ["tts", "sfx", "bgm"]) {
  const el = $("#opt-" + k), sl = $("#vol-" + VOL_KEY[k]);
  el.onchange = () => { settings[k] = el.checked; if (k === "tts" && !el.checked) stopSpeak(); applyVolumes(); saveSettings(); updateVoiceBtn(); };
  sl.oninput = () => { settings.vol[VOL_KEY[k]] = sl.value / 100; if (sl.value > 0 && !settings[k]) { settings[k] = true; el.checked = true; } applyVolumes(); };
  // 손을 떼면 그 크기로 들려줌
  sl.onchange = () => {
    saveSettings(); updateVoiceBtn(); unlock(); applyVolumes();
    if (k === "tts") speak("이 크기로 읽어 줄게요"); else if (k === "sfx") sfx.catch(4); else { bgm.stop(); bgm.start(); setTimeout(() => { if (state === "setup") bgm.stop(); }, 1800); }
  };
}
// 게임 중·설명 중 음성 크기 바로 바꾸기: 크게 → 보통 → 작게 → 끔
const VOICE_STEPS = [{ v: 1, label: "크게" }, { v: 0.6, label: "보통" }, { v: 0.3, label: "작게" }, { v: 0, label: "끔" }];
function updateVoiceBtn() {
  const off = !settings.tts || settings.vol.voice === 0;
  const cur = off ? VOICE_STEPS[3] : VOICE_STEPS.reduce((a, b) => Math.abs(b.v - settings.vol.voice) < Math.abs(a.v - settings.vol.voice) ? b : a);
  $("#btnVoice").textContent = `${off ? "🔇" : "🔊"} 음성 ${cur.label}`;
}
$("#btnVoice").onclick = () => {
  const off = !settings.tts || settings.vol.voice === 0;
  const i = off ? 3 : VOICE_STEPS.findIndex(s => Math.abs(s.v - settings.vol.voice) < 0.05);
  const next = VOICE_STEPS[(i < 0 ? 0 : i + 1) % VOICE_STEPS.length];
  if (next.v === 0) { settings.tts = false; stopSpeak(); } else { settings.tts = true; settings.vol.voice = next.v; speak(`음성 ${next.label}`); }
  saveSettings(); syncSoundUI();
};
syncSoundUI();
$("#btnRankSetup").onclick = () => openRanking("setup");
$("#btnReset").onclick = () => { if (confirm("모든 순위 기록을 지울까요? 되돌릴 수 없습니다.")) { R.clearRecords(); toast("기록을 모두 지웠어요"); } };

$("#btnStart").onclick = async () => {
  if (!sel.length) return;
  unlock(); goFullscreen();
  slots = sel.map((id, i) => {
    const s = { id, profileId: profileOf(id), name: nameOf(id), diff: diffIdOf(id), color: SLOT_COLORS[i] };
    for (const gid of LEVEL_GAMES) { const G = GAMES[gid]; s[G.levelField] = propOf(id, G.levelField, firstLevel(G)); }
    return s;
  });
  setMsg("카메라를 켜는 중...");
  try { await cam.open(); }
  catch (e) { setMsg(cameraErrorText(e), true); return; }
  if (!detector) {
    setMsg("게임 엔진 불러오는 중... 잠시만 기다려 주세요");
    try { await detectorP; } catch (e) { cam.close(); return; }
  }
  trackers = slots.map((s, i) => new Tracker(i));
  assigner = new Assigner(slots.length);
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
function stopInsts() { insts.forEach(g => { try { if (g.stop) g.stop(); } catch (e) {} }); }   // 리듬 반주 등 게임이 켠 소리 끄기
function backToSetup() {
  stopInsts(); stopLoop(); bgm.stop(); stopSpeak(); cam.close(); trackers = [];
  document.body.classList.remove("live"); hideCursors();
  setState("setup"); renderSetup();
}

/* ---------- 2. 게임 고르기 ---------- */
function renderSelect() {
  const el = $("#selPlayers"); el.innerHTML = ""; selCache = "";
  slots.forEach((s, i) => { const b = document.createElement("span"); b.className = "badge-lg"; b.style.setProperty("--c", s.color); el.appendChild(b); });
  updateSelBadges();
}
let selCache = "";
function updateSelBadges() {
  // 만세 진행 정도를 배지 안 막대로 표시 (게임 고르기 화면에서는 카드에 가려 링이 안 보임)
  $$("#selPlayers .badge-lg").forEach((b, i) => b.style.setProperty("--k", assigner && !(trackers[i] && trackers[i].present) ? assigner.claimProgress(i).toFixed(2) : 0));
  const st = trackers.map(tr => tr.present ? 1 : 0).join("");
  if (st === selCache) return; selCache = st;
  $$("#selPlayers .badge-lg").forEach((b, i) => {
    const on = trackers[i] && trackers[i].present;
    b.classList.toggle("off", !on);
    b.textContent = `${i + 1}P ${slots[i].name} · ${on ? "인식됨" : "만세 해 주세요"}`;
  });
}
// 게임 카드: 운동 / 학습 탭. 묶인 게임은 첫 게임 자리에 카드 하나로
function cardIds(cat) {
  const out = [];
  for (const id of GAME_ORDER) {
    if (GAMES[id].cat !== cat) continue;
    const g = groupOf(id);
    if (!g) out.push(id); else if (!out.includes(g.id)) out.push(g.id);
  }
  return out;
}
let catTab = "move";
function renderCards() {
  const tabs = $("#catTabs"); tabs.innerHTML = "";
  for (const c of CATS) {
    const n = cardIds(c.id).length;
    const b = document.createElement("button"); b.type = "button"; b.className = "tab" + (catTab === c.id ? " on" : ""); b.setAttribute("data-hand", "");
    b.textContent = `${c.label} ${n}`; b.onclick = () => { catTab = c.id; renderCards(); }; tabs.appendChild(b);
  }
  const box = $("#cards"); box.innerHTML = "";
  const ids = cardIds(catTab);
  box.classList.toggle("many", ids.length > 4);
  box.classList.toggle("lots", ids.length > 8 || ids.length === 5);   // 5개나 9개 이상이면 한 줄에 5개
  box.classList.toggle("tons", ids.length > 12);                         // 13개 이상이면 한 줄에 7개, 작게
  for (const id of ids) {
    const grp = GROUPS.find(g => g.id === id), G = grp || GAMES[id], b = document.createElement("button");
    b.type = "button"; b.className = "card"; b.setAttribute("data-hand", ""); b.dataset.game = id; b.style.setProperty("--bg", G.bg);
    b.innerHTML = `<span class="ico">${G.icon}</span><span class="lbl">${esc(G.title)}</span><span class="desc">${esc(G.desc)}</span>`;
    b.onclick = () => { unlock(); chooseGame(grp ? (grp.members.includes(R.getSettings()["last_" + grp.id]) ? R.getSettings()["last_" + grp.id] : grp.members[0]) : id); };
    box.appendChild(b);
  }
}
renderCards();
$("#btnRank").onclick = () => openRanking("select");
$("#btnSetup").onclick = backToSetup;

/* ---------- 3. 자리 잡기 ---------- */
let readyCache = "";
function chooseGame(id) {
  gameId = id;
  const grp = groupOf(id); if (grp) R.setSettings({ ...R.getSettings(), ["last_" + grp.id]: id });
  if (needDemo(id)) openDemo(); else goReady();
}
function goReady() {
  const g = GAMES[gameId];
  $("#readyTitle").textContent = `${g.icon} ${g.title}`;
  $("#readyHow").textContent = g.how;
  $("#readyHint").textContent = slots.length === 2
    ? "1P는 화면 왼쪽, 2P는 오른쪽에 서서 두 손을 머리 위로 올려(만세) 주세요"
    : "화면 가운데에 서서 두 손을 머리 위로 올려(만세) 주세요";
  readyT = 0; readyCache = ""; tutOk = slots.map(() => false); tutT = slots.map(() => 0); presentT = slots.map(() => 0); readyStartT = lastT;
  $(".readybar").classList.remove("compact");
  $("#tutorial").hidden = !g.oneHand;
  renderSubjPick();
  setState("ready");
}
// 과목 고르기 (풍선 퀴즈): 바꾸면 그 게임의 자리 잡기 화면으로 (처음이면 설명부터)
function renderSubjPick() {
  const grp = groupOf(gameId), box = $("#subjPick");
  box.hidden = !grp; box.innerHTML = "";
  if (!grp) return;
  for (const id of grp.members) {
    const G = GAMES[id], b = document.createElement("button"); b.type = "button"; b.setAttribute("data-hand", "");
    b.className = "tab" + (gameId === id ? " on" : ""); b.textContent = `${G.icon} ${G.title}`;
    b.onclick = () => { if (id === gameId) return; unlock(); sfx.select(); R.setSettings({ ...R.getSettings(), ["last_" + grp.id]: id }); chooseGame(id); };
    box.appendChild(b);
  }
}
// 노래 고르기 (리듬 박자·지휘자): 시작을 누른 뒤 노래 고르기 화면 → 고르면 카운트다운
let songStartSec = 3;
function startGame(sec) {
  if (!GAMES[gameId].songs) return beginCountdown(sec);
  songStartSec = sec; renderSongCards(); setState("song");
}
function renderSongCards() {
  const g = GAMES[gameId], box = $("#songCards");
  $("#songHead").textContent = `${g.icon} ${g.title} · 노래를 골라요`;
  const list = [...g.songs, { id: "random", icon: "🎲", title: "아무거나" }];
  const last = R.getSettings()["lastSong_" + gameId];
  box.innerHTML = ""; box.classList.toggle("many", list.length > 4); box.classList.toggle("lots", list.length > 6);
  list.forEach((S, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "card song" + (S.id === last ? " last" : ""); b.setAttribute("data-hand", ""); b.dataset.song = S.id;
    b.style.setProperty("--bg", S.id === "random" ? "#dfe6e9" : ["#ffeaa7", "#fab1a0", "#81ecec", "#a29bfe", "#ffb8d1", "#b8e994"][i % 6]);
    const speed = S.bpm ? (S.bpm >= 120 ? "빠름" : S.bpm >= 100 ? "보통" : "느림") : "";
    b.innerHTML = `<span class="ico">${S.icon}</span><span class="lbl">${esc(S.title)}</span><span class="desc">${esc([S.by, speed].filter(Boolean).join(" · ") || "무작위")}</span>`;
    b.onmouseenter = () => { if (S.id !== "random") rhythmAudio.preview(S.id); };
    b.onclick = () => {
      unlock(); rhythmAudio.stopPreview();
      songSel = S.id; R.setSettings({ ...R.getSettings(), ["lastSong_" + gameId]: S.id });
      beginCountdown(songStartSec);
    };
    box.appendChild(b);
  });
}
$("#btnSongBack").onclick = () => { rhythmAudio.stopPreview(); goReady(); };
let tutOk = [], tutT = [], readyStartT = 0, presentT = [];
const TUT_SKIP = 5;        // 한 손 연습을 못 해도 이 시간(초)이 지나면 준비 완료로 침
const upperOk = tr => !!(tr && tr.present && tr.pts && [0, 11, 12].every(i => tr.pts[i].v));
const TUT_HOLD = 0.8;      // 연습: 들어 올린 손을 펴서 이만큼 유지하면 통과
const TUT_MIN_SHOW = 3;    // 한 손 게임은 안내를 읽을 수 있게 자리 잡기 화면을 최소 3초 보여줌(자동 시작 기준)
// 손 모양을 3초 넘게 한 번도 판정 못 했으면(너무 멀거나 손 인식 모델이 없으면) 튜토리얼 확인을 건너뜀
const shapeUnavailable = () => !handShape || (lastT - shapeSeenAt > 3 && lastT - readyStartT > 3);
function renderReadyStat(ok) {
  const html = slots.map((s, i) => {
    const tr = trackers[i];
    const msg = ok[i] ? (GAMES[gameId].oneHand && tutOk[i] ? "✋ 확인! 준비 완료" : "준비 완료") : !tr.present ? "만세 해 주세요" : !upperOk(tr) ? "얼굴과 어깨가 보이게" : "손을 들어 손바닥을 펴 보세요";
    return `<span class="rs${ok[i] ? " ok" : ""}" style="--c:${s.color}">${i + 1}P ${esc(s.name)} · ${msg}</span>`;
  }).join("");
  if (html !== readyCache) { $("#readyStat").innerHTML = html; readyCache = html; }
}
$("#btnGo").onclick = () => startGame(3);
$("#btnGo5").onclick = () => startGame(5);      // 태블릿을 누른 사람이 자리로 갈 시간
$("#btnReadyBack").onclick = () => { rhythmAudio.stopPreview(); setState("select"); };
$("#btnDemo").onclick = () => openDemo();

/* ---------- 게임 설명 시연 (선수별로 게임마다 처음 한 번, 이후엔 '설명 보기') ---------- */
let demo = null, demoCap = "";
const sessionSeen = new Set();       // 이름 없는 손님은 이번 접속 동안만 기억
function needDemo(id) {
  const seen = R.getSettings().demoSeen || {};
  return slots.some(s => s.profileId ? !(seen[s.profileId] || []).includes(id) : !sessionSeen.has(s.id + ":" + id));
}
function markDemo(id) {
  const st = R.getSettings(), seen = { ...(st.demoSeen || {}) };
  slots.forEach(s => {
    if (s.profileId) { const a = (seen[s.profileId] || []).slice(); if (!a.includes(id)) a.push(id); seen[s.profileId] = a; }
    else sessionSeen.add(s.id + ":" + id);
  });
  R.setSettings({ ...st, demoSeen: seen });
}
function openDemo() {
  const g = GAMES[gameId];
  if (demo) try { demo.stop(); } catch (e) {}
  clearFx(); stopSpeak();
  demo = startDemo(gameId, g, view); demoCap = "";
  $("#demoTitle").textContent = `${g.icon} ${g.title}`;
  $("#demoCap").textContent = ""; $("#demoProg").style.width = "0%";
  setState("demo");
}
function finishDemo() {
  if (!demo) return;
  try { demo.stop(); } catch (e) {}
  demo = null; markDemo(gameId); clearFx(); stopSpeak();
  goReady();
}
$("#btnSkip").onclick = finishDemo;

/* ---------- 4. 카운트다운 · 게임 ---------- */
function beginCountdown(sec = 3) {
  const g = GAMES[gameId];
  rhythmAudio.stopPreview();
  if (g.songs) curSong = songSel === "random" || !g.songs.some(x => x.id === songSel) ? g.songs[Math.floor(Math.random() * g.songs.length)].id : songSel;
  clearFx(); fever = false; timeLeft = g.sec;
  $("#hud").classList.remove("fever"); bgm.setTempo(1);
  players = slots.map(s => ({ ...s, score: 0, combo: 0, maxCombo: 0, misses: 0 }));
  trackers.forEach(tr => { tr.meters = 0; });
  insts = players.map((p, i) => g.create(makeEnv(i)));
  setupHud();
  cdT = sec; setState("countdown"); showCd(String(sec)); sfx.tick();
}
function beginPlay() { setState("play"); showCd("시작!"); goT = 0.7; sfx.go(); if (GAMES[gameId].music !== false) bgm.start(); }
function showCd(txt) { const el = $("#cd"); el.hidden = false; el.textContent = txt; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }

function makeEnv(i) {
  const p = players[i];
  return {
    slot: i, player: p, tracker: trackers[i], zone: zones[i], view, mode: slots.length,
    level: GAMES[gameId].levelField ? p[GAMES[gameId].levelField] : null, song: curSong, diff: diffOf(p.diff), color: p.color, name: p.name,
    progress: () => 1 - Math.max(0, timeLeft) / GAMES[gameId].sec,
    fever: () => fever,
    award: (base, x, y) => award(i, base, x, y),
    miss: (x, y, label) => miss(i, x, y, label),
    penalty: (n, x, y, label) => penalty(i, n, x, y, label),
    speak: (text, lang) => speak(slots.length === 2 && !lang ? `${p.name}, ${text}` : text, slots.length === 2, lang),
    pip: (c, x, y, w, h) => drawPip(c, i, x, y, w, h),
  };
}
// 3D 스포츠용 카메라 작은 화면: 그 선수 몸 주변만 잘라 구석에 보여 줌 (뼈대 선 포함)
function drawPip(c, i, x, y, w, h) {
  const z = zones[i], tr = trackers[i], P = tr && tr.pts, U = view.U, s = h / view.H;
  let cx = P && P[11].v && P[12].v ? (P[11].x + P[12].x) / 2 : z.cx;
  cx = Math.max(z.x0 + w / s / 2, Math.min(z.x1 - w / s / 2, cx));
  c.save();
  c.beginPath(); c.roundRect(x, y, w, h, U * 0.02); c.clip();
  c.translate(x + w / 2, y); c.scale(s, s); c.translate(-cx, 0);
  cam.draw(c, view.W, view.H);
  if (P) {
    c.strokeStyle = slots[i].color; c.lineWidth = U * 0.02; c.lineCap = "round"; c.beginPath();
    for (const [a, b] of BONES) if (P[a].v && P[b].v) { c.moveTo(P[a].x, P[a].y); c.lineTo(P[b].x, P[b].y); }
    c.stroke();
  }
  c.restore();
  c.lineWidth = U * 0.006; c.strokeStyle = "#fff"; c.beginPath(); c.roundRect(x, y, w, h, U * 0.02); c.stroke();
}
function award(i, base, x, y) {
  const p = players[i], k = diffOf(p.diff).points, pts = base * k * (fever ? 2 : 1);   // 난이도 배점 × 피버 2배
  p.combo++; p.maxCombo = Math.max(p.maxCombo, p.combo);
  let bonus = 0;
  if (p.combo >= 5 && p.combo % 5 === 0) {
    bonus = k;
    popup(x, y - view.U * 0.08, `${p.combo} 콤보! +${bonus}`, { size: view.U * 0.05, color: "#ffe14d", stroke: "#7a4a00" });
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
  const p = players[i], amt = n * diffOf(p.diff).points; p.combo = 0; p.score = Math.max(0, p.score - amt);
  popup(x, y, `${label} -${amt}`, { size: view.U * 0.06, color: "#fff", stroke: "#d02020" });
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
  players.forEach((p, i) => { const b = $("#pb" + i); b.style.setProperty("--c", p.color); b.querySelector(".pn").textContent = `${i + 1}P ${p.name}` + (p.diff !== "normal" ? ` · ${diffOf(p.diff).label}` : ""); });
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
$("#btnQuit").onclick = () => { stopInsts(); bgm.stop(); stopSpeak(); setState("select"); };

/* ---------- 5. 결과 ---------- */
function endGame() {
  stopInsts(); bgm.stop(); stopSpeak(); sfx.fanfare();
  $("#hud").classList.remove("fever");
  justSaved = new Set();
  const results = players.map((p, i) => {
    const meters = Math.round(trackers[i].meters * 10) / 10;
    let rec = null;
    if (p.profileId) {
      const lvl = recLevel(p);
      rec = R.addRecord({ key: R.gameKey(GAMES[gameId].recId || gameId, lvl), game: gameId, level: lvl, playerId: p.profileId, name: p.name, score: p.score, mode: players.length, meters, diff: p.diff });
      justSaved.add(rec.record.id);
    }
    // 아이템 획득: 점수를 낸 선수(이름 있는 선수)는 아이템 하나를 받음
    let item = null;
    if (p.profileId && p.score > 0) { const it = pickItem(R.items(p.profileId)); item = { ...it, isNew: R.addItem(p.profileId, it.id), count: R.items(p.profileId).length }; }
    return { p, meters, rec, item, extra: (insts[i].result && insts[i].result()) || "" };
  });
  renderResult(results);
  rankView = { game: gameId, level: recLevel(players[0]) };
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
  results.forEach(({ p, meters, rec, extra, item }, i) => {
    let badge = "";
    if (rec) badge = rec.rank === 1 && rec.total > 1 ? "전체 1위!" : rec.best ? "개인 최고 기록!" : rec.first ? "첫 기록!" : "";
    const col = document.createElement("div");
    col.className = "rcol"; col.style.setProperty("--c", p.color);
    col.innerHTML =
      `<div class="rname">${decided && p.score === top ? "👑 " : ""}${i + 1}P ${esc(p.name)}</div>` +
      `<div class="rscore">${p.score}<small>점</small></div>` +
      (badge ? `<div class="rbadge">${badge}</div>` : "") +
      `<div class="rmeta">${rec ? `전체 ${rec.rank}위 (기록 ${rec.total}개 중)` : "손님 이름을 적으면 다음부터 기록이 저장돼요"}</div>` +
      `<div class="rmeta">난이도 ${diffOf(p.diff).label} · ${esc(extra)}${extra ? " · " : ""}최대 콤보 ${p.maxCombo}</div>` +
      `<div class="rmeta">손이 움직인 거리 약 ${meters}m</div>` +
      (item ? `<div class="ritem"><span class="ico">${item.icon}</span><span>아이템 획득! <b>${esc(item.name)}</b>${item.isNew ? "" : " (또 받았어요)"}<small>모은 아이템 ${item.count}/${ITEMS.length}</small></span></div>` : "");
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
  const sub = $("#rankSub"); sub.innerHTML = "";
  const RG = GAMES[rankView.game];
  const SUB = subOf(RG);
  sub.hidden = !SUB;
  if (SUB) {
    if (!SUB[rankView.level]) rankView.level = firstLevel(RG);
    for (const [k, v] of Object.entries(SUB)) sub.appendChild(tabBtn(v, rankView.level === k, () => { rankView.level = k; renderRanking(); }));
  } else rankView.level = null;
  const key = R.gameKey(RG.recId || rankView.game, rankView.level);
  const ol = $("#rankList"); ol.innerHTML = "";
  const list = R.ranking(key, 10);
  if (!list.length) ol.innerHTML = '<li class="empty">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</li>';
  list.forEach((r, i) => {
    const d = new Date(r.at), li = document.createElement("li");
    if (justSaved.has(r.id)) li.className = "new";
    li.innerHTML = `<b class="rk">${i + 1}</b><span class="nm">${esc(r.name)}</span><span class="sc">${r.score}점</span><span class="df ${r.diff || "normal"}">${diffOf(r.diff).label}</span><span class="dt">${d.getMonth() + 1}/${d.getDate()}${r.mode === 2 ? " · 대결" : ""}</span>`;
    ol.appendChild(li);
  });
  // 선수별 모은 아이템
  const ib = $("#rankItems"); ib.innerHTML = "<h4>모은 아이템</h4>";
  const owners = R.players().filter(pl => R.items(pl.id).length);
  if (!owners.length) ib.insertAdjacentHTML("beforeend", '<p class="empty">게임을 끝내면 아이템을 받아요</p>');
  owners.forEach(pl => ib.insertAdjacentHTML("beforeend", `<p><span>${esc(pl.name)} ${R.items(pl.id).length}/${ITEMS.length}</span><b class="its">${R.items(pl.id).map(id => (itemOf(id) || {}).icon || "").join("")}</b></p>`));
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
  const inGame = state === "play" || state === "countdown";
  const as = assigner ? assigner.assign(raws, cam, view, dt, visSupported, !inGame) : [];
  trackers.forEach((tr, i) => tr.update(as[i], cam, dt, t, visSupported));
  if (assigner) for (const i of assigner.takeFresh()) {
    const L = assigner.locks[i];
    sfx.select(); popup(L.x, L.y, `${i + 1}P ${slots[i].name} 인식!`, { size: view.U * 0.06, color: "#fff", stroke: slots[i].color, life: 1.2 });
  }
  if (state === "select") updateSelBadges();
  updateShapes(t);
  tick(dt);
  updateFx(dt);
  draw(t);
  if (HAND_UI) handUI(dt);
  drawCursors();
}
function tick(dt) {
  if (state === "demo" && demo) {
    demo.update(dt);
    if (demo.caption !== demoCap) { demoCap = demo.caption; $("#demoCap").textContent = demoCap; }
    $("#demoProg").style.width = (demo.progress * 100).toFixed(1) + "%";
    if (demo.done) finishDemo();
  } else if (state === "ready") {
    const g = GAMES[gameId], noShape = shapeUnavailable();
    if (g.oneHand) trackers.forEach((tr, i) => {
      const a = tr.present && tr.activeHand;
      tutT[i] = a && a.shape === "open" ? tutT[i] + dt : Math.max(0, tutT[i] - dt);
      if (tutT[i] >= TUT_HOLD && !tutOk[i]) { tutOk[i] = true; sfx.catch(3); }
    });
    trackers.forEach((tr, i) => { presentT[i] = tr.present ? (presentT[i] || 0) + dt : 0; });
    // 준비 완료: 윗몸(얼굴·두 어깨)만 보이면 됨. 한 손 연습은 5초 넘게 안 되면 건너뜀 (멈춰서 시작이 안 되는 일 방지)
    const ok = trackers.map((tr, i) => upperOk(tr) && (!g.oneHand || tutOk[i] || noShape || presentT[i] > TUT_SKIP));
    // 선수가 다 인식되면 안내 창을 작게 접어 화면(내 몸)이 잘 보이게
    $(".readybar").classList.toggle("compact", trackers.every(tr => tr.present) && (!g.oneHand || ok.every(Boolean)));   // 한 손 연습 안내는 끝날 때까지 보여 줌
    const minShown = !g.oneHand || lastT - readyStartT >= TUT_MIN_SHOW;
    if (g.oneHand) {
      const note = noShape ? "멀어서 손 모양이 잘 안 보여요. 이럴 땐 허리 위로 들어 올린 손으로 골라요" : "";
      const el = $("#tutNote"); if (el.textContent !== note) el.textContent = note;
    }
    readyT = ok.every(Boolean) ? readyT + dt : 0;
    renderReadyStat(ok);
    if (readyT >= 1.2 && minShown) startGame(3);
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
  if (state === "demo" && demo) { demo.draw(ctx); drawFx(ctx); ctx.restore(); return; }
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
    if (!p[0].v) return;
    const setup = state === "ready" || state === "countdown" || state === "select";
    if (setup) {   // 자리 잡을 때는 위쪽 안내판에 가리지 않도록 가슴 높이에 이름 표시
      const chx = (p[11].x + p[12].x) / 2, chy = (p[11].y + p[12].y + p[23].y + p[24].y) / 4;
      outlinedText(ctx, `${i + 1}P ${slots[i].name}`, chx, Math.max(view.H * 0.36, chy), view.U * 0.05, "#fff", c);
    }
    else if (slots.length === 2) outlinedText(ctx, `${i + 1}P`, p[0].x, p[0].y - tr.scale * 0.6, view.U * 0.04, "#fff", c);
  });
  if (!assigner || !(state === "ready" || state === "countdown" || state === "select")) return;
  // 만세 인식 진행 링
  assigner.claims.forEach((C, i) => {
    const k = assigner.claimProgress(i);
    if (k <= 0) return;
    const r = Math.max(view.U * 0.06, C.sc * 0.7);
    ctx.lineWidth = view.U * 0.014; ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(C.x, C.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = slots[i].color; ctx.beginPath(); ctx.arc(C.x, C.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    outlinedText(ctx, `${i + 1}P ${slots[i].name} 인식 중`, C.x, C.y + r + view.U * 0.04, view.U * 0.04, "#fff", slots[i].color);
  });
  // 선수가 아닌 사람: 빈자리가 있으면 참가 방법, 다 찼으면 '제외'
  const open = assigner.locks.some(L => !L);
  for (const o of assigner.ignored) {
    if (o.up) continue;
    const y = Math.max(view.H * 0.36, Math.min(view.H * 0.74, o.cy));
    outlinedText(ctx, open ? "선수는 만세!" : "제외", Math.max(view.U * 0.2, Math.min(view.W - view.U * 0.2, o.cx)), y, view.U * 0.04, "#eee", "#555");
  }
}
function drawReady() {
  const { H, U } = view;
  zones.forEach((z, i) => {
    const ok = upperOk(trackers[i]);
    const w = Math.min(z.w * 0.6, U * 0.75), x = z.cx - w / 2, y = H * 0.3, h = H * 0.66;
    ctx.save(); ctx.setLineDash(ok ? [] : [U * 0.025, U * 0.018]); ctx.lineWidth = U * 0.01;
    ctx.strokeStyle = ok ? "#2fd36b" : "rgba(255,255,255,.85)"; rr(ctx, x, y, w, h, U * 0.04); ctx.stroke(); ctx.restore();
    const label = ok ? "좋아요!" : trackers[i] && trackers[i].present ? "얼굴과 어깨가 보이게" : `${i + 1}P ${slots[i].name} 여기서 만세!`;
    outlinedText(ctx, label, z.cx, y + h - U * 0.05, U * 0.05, "#fff", ok ? "#1d8f47" : slots[i].color);
  });
}
function drawLost() {
  trackers.forEach((tr, i) => {
    if (tr.lostT < 0.6) return;
    const z = zones[i];
    outlinedText(ctx, `${i + 1}P ${slots[i].name}`, z.cx, view.H * 0.45, view.U * 0.06, "#fff", slots[i].color);
    outlinedText(ctx, "화면 안으로 들어와서 만세!", z.cx, view.H * 0.53, view.U * 0.045, "#fff", "#333");
  });
}

/* ---------- 손 모양 판정 (한 프레임에 손 하나씩 돌아가며) ---------- */
function updateShapes(t) {
  trackers.forEach(tr => tr.hands.forEach(h => h.ageShape(t)));
  if (!handShape || !cam.ready || state === "setup") return;
  if ((state === "play" || state === "countdown") && !GAMES[gameId].oneHand) return;   // 두 손 다 쓰는 게임은 판정 안 함(속도 확보)
  const list = [];
  trackers.forEach(tr => { if (tr.raw) [0, 1].forEach(k => { if (tr.hands[k].vis) list.push([tr, k]); }); });
  if (!list.length) return;
  const [tr, k] = list[shapeRR++ % list.length];
  const w = tr.raw[k ? 16 : 15], e = tr.raw[k ? 14 : 13], vw = cam.vw, vh = cam.vh;
  const wx = w.x * vw, wy = w.y * vh, ex = e.x * vw, ey = e.y * vh;
  const fore = Math.hypot(wx - ex, wy - ey);
  const size = Math.max(64, Math.min(vh * 0.7, fore * 1.8));        // 손 크기 ≈ 아래팔 길이 → 넉넉히 잘라냄
  try {
    const r = handShape.check(video, wx + (wx - ex) * 0.45, wy + (wy - ey) * 0.45, size, k);
    tr.hands[k].setShape(r, t);
    if (r === "open" || r === "closed") shapeSeenAt = t;
  } catch (err) { console.warn(err); if (++shapeErr > 20) handShape = null; }
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
  const inGame = state === "play" || state === "countdown";
  // 하나만 고르는 게임(수학 풍선)과 메뉴에서는 '쓰는 손'만 진하게, 나머지 손은 흐리게
  const oneHand = !inGame || !!GAMES[gameId].oneHand;
  for (const c of curEls) {
    const tr = trackers[c.i], h = tr && tr.hands[c.k];
    if (!h || !h.vis) { if (c.d.style.display !== "none") c.d.style.display = "none"; continue; }
    if (c.d.style.display !== "flex") c.d.style.display = "flex";
    const idle = oneHand && tr.active !== c.k;
    c.d.classList.toggle("idle", idle);
    // 하나만 고를 때: 편 손 ✋, 주먹 ✊ 으로 손 모양을 그대로 보여줌
    const shapeIcon = h.shape === "open" ? "✋" : h.shape === "closed" ? "✊" : "";
    const emoji = oneHand ? (shapeIcon || (inGame && !idle ? GAMES[gameId].cursor || "" : "")) : (GAMES[gameId].cursor || "");
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
  trackers.forEach(tr => { if (tr.activeHand) hs.push(tr.activeHand); });   // 메뉴도 들어 올린 한 손으로만 선택
  for (const el of els) {
    if (el.disabled || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    const inside = uiCool <= 0 && hs.some(h => h.x >= r.left && h.x <= r.right && h.y >= r.top && h.y <= r.bottom);
    const d = inside ? (el._d || 0) + dt : Math.max(0, (el._d || 0) - dt * 2);
    if (d !== el._d) { el._d = d; el.style.setProperty("--p", Math.min(1, d / UI_DWELL).toFixed(3)); }
    if (inside && !el.classList.contains("hover") && el.dataset.song && el.dataset.song !== "random") rhythmAudio.preview(el.dataset.song);   // 손을 대면 미리 듣기
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

if (SIM) window.__dbg = { get demo() { return demo; }, get state() { return state; }, setTime: s => { timeLeft = s; }, players: () => players, scales: () => trackers.map(t => Math.round(t.scale)) };

renderSetup();
setState("setup");
if (detector) setMsg("준비 완료! 선수를 고르고 시작하세요"); else setMsg("게임 엔진 불러오는 중...");

window.__appReady = true;
