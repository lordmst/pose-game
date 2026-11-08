// 화면 흐름: 선수 고르기 → (카메라) 게임 고르기 → 자리 잡기 → 3·2·1 → 게임 → 결과 → 순위
import { Camera, Tracker, Assigner, SigSampler, createDetector, createHandShape, SIM } from "./pose.js?v=74";
import { sfx, bgm, speak, stopSpeak, unlock, wake, audioState, settings, applyVolumes, rhythm as rhythmAudio } from "./audio.js?v=74";
import * as R from "./records.js?v=74";
import { popup, burst, starPath, shakeOffset, updateFx, drawFx, clearFx, outlinedText, rr, FONT, P1C, P2C } from "./fx.js?v=74";
import copy from "./games/copy.js?v=74";
import math from "./games/math.js?v=74";
import ice from "./games/ice.js?v=74";
import star from "./games/star.js?v=74";
import fruit from "./games/fruit.js?v=74";
import mole from "./games/mole.js?v=74";
import wall from "./games/wall.js?v=74";
import rhythm from "./games/rhythm.js?v=74";
import goalie from "./games/goalie.js?v=74";
import { hangul, english } from "./games/word.js?v=74";
import clockGame from "./games/clock.js?v=74";
import run from "./games/run.js?v=74";
import simon from "./games/simon.js?v=74";
import conductor from "./games/conductor.js?v=74";
import SPORTS from "./games/sports.js?v=74";
import LEARN from "./games/learn.js?v=74";
import { ITEMS, SPECIAL, itemOf, pickItem } from "./items.js?v=74";
import * as FUN from "./fun.js?v=74";
import { WEAR, WEAR_SLOTS, wearSlotOf, drawWear } from "./wear.js?v=74";
import { makeShots, saveShot } from "./photo.js?v=74";
import { DIFFS, diffOf } from "./difficulty.js?v=74";
import { startDemo } from "./demo.js?v=74";
import * as REAL from "./realmusic.js?v=74";
import * as FACE from "./face.js?v=74";

const GAMES = { copy, math, ice, star, fruit, mole, wall, rhythm, goalie, run, conductor, hangul, english, clock: clockGame, simon };
const GAME_ORDER = ["copy", "ice", "star", "fruit", "mole", "wall", "rhythm", "conductor", "goalie", "run", "math", "hangul", "english", "clock", "simon"];
for (const g of LEARN) { GAMES[g.id] = g; GAME_ORDER.push(g.id); }   // 생각 탭에 더한 게임들
for (const g of SPORTS) { GAMES[g.id] = g; GAME_ORDER.push(g.id); }   // 올림픽 탭 (스포츠 리조트 종목들)
// 카드 하나로 묶는 게임: 카드를 고른 뒤 자리 잡기 화면에서 과목을 고름 (기록·순위는 게임별 그대로)
const GROUPS = [];   // 예: { id, members: [게임 id...], icon, title, desc, bg, cat }
const groupOf = id => GROUPS.find(g => g.members.includes(id));
// 게임 탭: 놀이(몸놀이·음악놀이) · 생각(배우는 게임) · 올림픽(스포츠 종목). id는 기록·설정과 이어지므로 그대로 둠
const CATS = [{ id: "move", label: "🎈 놀이" }, { id: "learn", label: "💡 생각" }, { id: "sport", label: "🏅 올림픽" }];
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
const VS_ONLY = ["tennis", "pingpong", "volley", "boxing", "thumb"];   // 서로 맞붙는 종목: 협동으로는 못 함
const PARTY_SKIP = ["rhythm", "conductor"];                         // 노래를 골라야 하는 게임은 파티에서 뺌

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const view = { W: 0, H: 0, U: 0, dpr: 1 };
const canvas = $("#canvas"), ctx = canvas.getContext("2d"), video = $("#video");
const cam = new Camera(video);
const sampler = new SigSampler();
const zones = [];

let detector = null;
const detectorP = createDetector()
  .then(d => { detector = d; if (state === "setup") setMsg("준비 완료! 선수를 고르고 시작하세요"); return d; })
  .catch(e => { setMsg("게임 엔진을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.", true); console.error(e); throw e; });
detectorP.catch(() => {});
// 손 모양(편 손/주먹) 판정기: 몸 인식이 준비된 뒤 이어서 불러옴. 실패해도 게임은 '들어 올린 손' 방식으로 동작
let handShape = null, shapeErr = 0, shapeSeenAt = -99, shapeRR = 0;
detectorP.then(() => createHandShape()).then(h => { handShape = h; }).catch(e => console.warn("손 모양 인식 불러오기 실패", e));
// 얼굴 확인(선수 인식 보조): 손 모양 다음에 불러옴. 실패해도 옷 색으로만 구분해서 동작
// 얼굴 엔진은 처음 준비할 때 그래픽을 잠깐 붙잡아서(아이패드에서 1~2초 멈춤), 만세·게임 중이 아닌 조용한 화면에서만 준비함
const CALM = ["setup", "result", "ranking", "mission", "party"];
function faceInitWhenCalm() { if (SIM) return; if (CALM.includes(state)) FACE.initFace(); else setTimeout(faceInitWhenCalm, 2000); }
detectorP.then(() => new Promise(r => setTimeout(r, 1500))).then(faceInitWhenCalm);
let faceT = 0, faceHold = 0, sampAt = -1e9;
function faceTick(t) {
  // 얼굴 계산은 그래픽을 많이 써서 몸 인식과 겹치면 화면이 끊김 → 간격을 넉넉히, 만세로 막 인식된 직후 1초는 쉬고, 화면이 버벅이는 중엔 건너뜀
  const gap = state === "play" ? 0.4 : 0.7;
  if (!assigner || !(SIM || FACE.faceReady()) || FACE.faceBusy() || t - faceT < gap || t < faceHold || lastDt > 0.05) return;
  const need = assigner.faceNeeds(); if (!need.length) return;
  faceT = t; const n = need[0], a = assigner;
  FACE.describe(SIM ? null : video, n.r).then(d => { if (d && a === assigner) a.setFace(n.tid, d); });
}

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
let timeLeft = 0, gameSec = 60, fever = false, readyT = 0, cdT = 0, goT = 0;
let visSupported = false, loopOn = false, lastT = 0, uiCool = 0, assigner = null;
let rankView = { game: "copy", level: null }, rankBackTo = "setup", justSaved = new Set();
let coop = false;            // 이번 판: 둘이 협동 (점수를 합쳐 팀 기록)
let fun = null;              // 이번 판 재미 장치 상태: 돌발 이벤트 · 따라잡기 · 우정 별 · 함께 성공
let party = null;            // 파티 모드: { list, i, res, n }
let lastDt = 0.016;
const shots = makeShots(canvas);
const wearSt = [{}, {}], wearPipSt = [{}, {}];

/* ---------- 설정 불러오기 ---------- */
const saved = R.getSettings();
for (const k of ["sfx", "bgm", "tts"]) if (typeof saved[k] === "boolean") settings[k] = saved[k];
if (saved.vol) for (const k of ["sfx", "bgm", "voice"]) if (typeof saved.vol[k] === "number") settings.vol[k] = saved.vol[k];
sel = (saved.lastSel || []).filter(id => !id.startsWith("guest") && R.players().some(p => p.id === id)).slice(0, 2);
let songSel = saved.lastSong || "basic", curSong = "basic";
let coopSel = !!saved.coop, catchOn = saved.catchUp !== false, wearOn = saved.wearOn !== false;   // 둘이 할 때 협동/대결 · 대결 따라잡기 보너스   // 리듬 박자 노래 ("random" = 아무거나)
function saveSettings() { R.setSettings({ ...R.getSettings(), sfx: settings.sfx, bgm: settings.bgm, tts: settings.tts, vol: { ...settings.vol }, lastSel: sel, coop: coopSel, catchUp: catchOn, wearOn }); }

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

/* ---------- 새 버전 자동 적용 ----------
   아이패드 홈 화면 앱·사파리 탭은 며칠씩 예전 버전을 그대로 띄워 둘 수 있음.
   고르는 화면으로 올 때·앱을 다시 볼 때 version.json을 확인해서, 새 버전이 있으면 그 자리에서 새로 불러옴 (게임 중에는 안 함) */
const APP_V = 74;
{ const el = document.createElement("div"); el.id = "appVer"; el.textContent = "v" + APP_V; document.body.appendChild(el); }
let verAt = 0;
async function checkVersion(force = false) {
  const n = Date.now(); if (!force && n - verAt < 60000) return; verAt = n;
  if (/[?&](sim|nover)=/.test(location.search)) return;
  try {
    const r = await fetch("version.json?t=" + n, { cache: "no-store" }); if (!r.ok) return;
    const { v } = await r.json();
    const u = new URL(location.href);
    if (+v > APP_V && +(u.searchParams.get("_v") || 0) < +v && !["play", "countdown", "result"].includes(state)) {   // 같은 버전으로 두 번 새로 불러오지 않음
      u.searchParams.set("_v", v); location.replace(u.toString());
    }
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersion(true); });

/* ---------- 화면 전환 ---------- */
const SCREENS = { setup: "scr-setup", select: "scr-select", song: "scr-song", demo: "scr-demo", ready: "scr-ready", result: "scr-result", ranking: "scr-ranking", party: "scr-party", mission: "scr-mission" };
function setState(s) {
  state = s;
  $$(".screen").forEach(el => el.classList.toggle("on", el.id === SCREENS[s]));
  const inGame = s === "countdown" || s === "play";
  $("#hud").hidden = !inGame; $("#btnQuit").hidden = !inGame;
  $("#btnVoice").hidden = !(inGame || s === "demo" || s === "ready");
  updateWearBtn(inGame || s === "ready");
  updateFullBtn();
  // 다음 게임 배경음악은 카메라 인식이 없는 조용한 화면에서 미리 받아 둠 (자리 잡기·만세 중엔 받지 않음)
  if (["setup", "result", "ranking", "mission"].includes(s)) setTimeout(() => { if (["setup", "result", "ranking", "mission"].includes(state)) REAL.prefetchBgm(); }, 800);
  if (s !== "countdown") $("#cd").hidden = true;
  $$("[data-hand]").forEach(el => { el._d = 0; el.style.setProperty("--p", 0); el.classList.remove("hover"); });
  uiCool = 0.7;
  if (s === "select" || s === "setup") checkVersion();
  if (s === "select" && loopOn) updateLeagueLine();
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
  const champ = FUN.lastWeekChampion();   // 지난주 리그 1위는 이름 앞에 왕관
  for (const c of allChoices()) {
    const i = sel.indexOf(c.id);
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (i >= 0 ? ` picked p${i + 1}` : "") + (c.kind === "guest" ? " guest" : "");
    b.innerHTML = `${i >= 0 ? `<span class="badge">${i + 1}P</span>` : ""}<span class="nm">${champ && champ.id === c.id ? "👑 " : ""}${esc(c.name)}</span>${c.kind === "saved" ? '<span class="del" aria-label="삭제">×</span>' : ""}`;
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
    // 꾸미기: 모은 아이템 착용 (저장된 선수만)
    if (!g && wearOn) {
      const wb = document.createElement("button"); wb.type = "button"; wb.className = "wearbtn";
      const w = propOf(id, "wear", null) || {}, icons = WEAR_SLOTS.map(([k]) => w[k] && itemOf(w[k]) ? itemOf(w[k]).icon : "").join("");
      wb.textContent = `꾸미기 ${icons || "+"}`; wb.onclick = () => openWear(id);
      row.querySelector(".diffs").after(wb);
    }
    rows.appendChild(row);
  });
  // 둘이 할 때: 대결 / 협동
  if (sel.length === 2) {
    const m = document.createElement("div"); m.className = "moderow";
    m.innerHTML = `<span>둘이 할 때</span><span class="seg"><button type="button" class="${coopSel ? "" : "on"}" data-m="vs">대결</button><button type="button" class="${coopSel ? "on" : ""}" data-m="co">협동</button></span>` +
      (coopSel ? "" : `<label><input type="checkbox" id="optCatch" ${catchOn ? "checked" : ""}>지고 있는 사람에게 역전 찬스 주기</label>`) +
      `<small>${coopSel ? "협동: 두 사람 점수를 합쳐 팀 기록에 도전해요. 둘이 함께 터치하는 우정 별, 함께 통과하면 보너스" : "대결: 점수 차이가 크게 나면 지고 있는 사람에게 '역전 찬스'(점수 1.5배, 황금 목표물 더 자주)"}</small>`;
    m.querySelectorAll(".seg button").forEach(b => { b.onclick = () => { coopSel = b.dataset.m === "co"; saveSettings(); renderSlots(); }; });
    const cb = m.querySelector("#optCatch"); if (cb) cb.onchange = () => { catchOn = cb.checked; saveSettings(); };
    rows.appendChild(m);
  }
  const btn = $("#btnStart");
  btn.disabled = sel.length === 0;
  btn.textContent = sel.length === 0 ? "선수를 골라 주세요" : sel.length === 1 ? "혼자 하기 시작" : coopSel ? "둘이 협동 시작" : "둘이 대결 시작";
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
/* ---------- 꾸미기 보이기 켜기·끄기 (선수 고르기 화면 · 게임 중 버튼) ---------- */
// 끄면 화면에 그리지 않을 뿐, 모은 아이템과 착용해 둔 것은 그대로 남음
function setWearOn(on) { wearOn = on; $("#opt-wear").checked = on; saveSettings(); if (state === "setup") renderSlots(); updateWearBtn(!$("#btnWear").hidden); }
function updateWearBtn(show) {
  const b = $("#btnWear"), any = slots.some(s => s && s.wear && Object.keys(s.wear).length);
  b.hidden = !(show && (any || !wearOn)); b.textContent = wearOn ? "꾸미기 끄기" : "꾸미기 켜기";
}
$("#opt-wear").checked = wearOn;
$("#opt-wear").onchange = () => setWearOn($("#opt-wear").checked);
$("#btnWear").onclick = () => setWearOn(!wearOn);
$("#btnRankSetup").onclick = () => openRanking("setup");
$("#btnMissionSetup").onclick = () => openMissions("setup");

/* ---------- 꾸미기 (모은 아이템 착용) ---------- */
let wearFor = null;
const WEARABLE = [...ITEMS, ...SPECIAL].filter(x => WEAR[x.id]);
function openWear(id) { wearFor = id; renderWear(); $("#wearBox").hidden = false; }
function renderWear() {
  const id = wearFor, own = R.items(id), w = { ...(propOf(id, "wear", null) || {}) };
  $("#wearTitle").textContent = `${nameOf(id)} 꾸미기 · 모은 아이템 ${own.length}개`;
  const box = $("#wearSlots"); box.innerHTML = "";
  for (const [slot, label] of WEAR_SLOTS) {
    const row = document.createElement("div"); row.className = "wslot"; row.innerHTML = `<b>${label}</b><span class="wits"></span>`;
    const its = row.querySelector(".wits");
    const mk = (it) => {
      const b = document.createElement("button"); b.type = "button";
      const has = !it || own.includes(it.id), on = it ? w[slot] === it.id : !w[slot];
      b.className = "witem" + (it ? "" : " none") + (on ? " on" : "") + (has ? "" : " locked");
      b.textContent = it ? (has ? it.icon : "?") : "없음"; b.title = it ? (has ? it.name : "아직 없는 아이템") : "안 쓰기";
      b.onclick = () => { if (!has) { toast("게임을 끝내면 아이템을 받아요. 모으면 쓸 수 있어요"); return; } if (it) w[slot] = it.id; else delete w[slot]; R.setProp(id, "wear", w); renderWear(); renderSlots(); };
      its.appendChild(b);
    };
    mk(null); WEARABLE.filter(x => WEAR[x.id].slot === slot).forEach(mk);
    box.appendChild(row);
  }
}
$("#btnWearClose").onclick = () => { $("#wearBox").hidden = true; };
$("#btnReset").onclick = () => { if (confirm("모든 순위 기록을 지울까요? 되돌릴 수 없습니다.")) { R.clearRecords(); toast("기록을 모두 지웠어요"); } };

// 선수 고르기 화면을 처음 누르면(소리 장치가 켜진 뒤) 첫 게임 배경음악을 미리 받기 시작
$("#scr-setup").addEventListener("click", () => { if (state === "setup") setTimeout(() => REAL.prefetchBgm(), 50); });
$("#btnStart").onclick = async () => {
  if (!sel.length) return;
  unlock(); goFullscreen();
  slots = sel.map((id, i) => {
    const s = { id, profileId: profileOf(id), name: nameOf(id), diff: diffIdOf(id), color: SLOT_COLORS[i], wear: guestOf(id) ? null : propOf(id, "wear", null) };
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
  coop = slots.length === 2 && coopSel; party = null;
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
  stopInsts(); stopLoop(); stopBgm(); stopSpeak(); cam.close(); trackers = [];
  document.body.classList.remove("live"); hideCursors();
  setState("setup"); renderSetup();
}

/* ---------- 2. 게임 고르기 ---------- */
function renderSelect() {
  const el = $("#selPlayers"); el.innerHTML = ""; selCache = "";
  slots.forEach((s, i) => { const b = document.createElement("span"); b.className = "badge-lg"; b.style.setProperty("--c", s.color); el.appendChild(b); });
  updateSelBadges(); renderCards(); updateLeagueLine();
}
// 이번 주 리그 1위 (게임 고르기 화면 위쪽)
function updateLeagueLine() {
  const top = FUN.league()[0], le = $("#selLeague");
  le.hidden = !top; if (top) le.textContent = `이번 주 가족 리그 1위: 👑 ${top.name} ${top.pts}점${coop ? " · 지금은 협동 모드" : ""}`;
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
// 게임 카드: 놀이 / 올림픽 / 생각 탭. 묶인 게임은 첫 게임 자리에 카드 하나로
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
  box.classList.toggle("tons", ids.length > 10);                         // 11개 이상이면 한 줄에 7개, 작게
  for (const id of ids) {
    const grp = GROUPS.find(g => g.id === id), G = grp || GAMES[id], b = document.createElement("button");
    b.type = "button"; b.className = "card"; b.setAttribute("data-hand", ""); b.dataset.game = id; b.style.setProperty("--bg", G.bg);
    b.innerHTML = `<span class="ico">${G.icon}</span><span class="lbl">${esc(G.title)}</span><span class="desc">${esc(coop && VS_ONLY.includes(id) ? "대결로만 해요" : G.desc)}</span>`;
    if (coop && VS_ONLY.includes(id)) { b.classList.add("off"); b.onclick = () => toast("서로 맞붙는 종목이라 협동으로는 못 해요. 선수 바꾸기에서 대결로 바꿔 주세요"); box.appendChild(b); continue; }
    b.onclick = () => { unlock(); chooseGame(grp ? (grp.members.includes(R.getSettings()["last_" + grp.id]) ? R.getSettings()["last_" + grp.id] : grp.members[0]) : id); };
    box.appendChild(b);
  }
}
renderCards();
$("#btnRank").onclick = () => openRanking("select");
$("#btnMission").onclick = () => openMissions("select");
$("#btnParty").onclick = () => openParty();
$("#btnSetup").onclick = backToSetup;

/* ---------- 3. 자리 잡기 ---------- */
let readyCache = "";
function chooseGame(id) {
  if (party && (party.done || party.list[party.i] !== id)) party = null;   // 파티 중에 다른 게임을 고르면 파티는 끝
  gameId = id;
  const grp = groupOf(id); if (grp) R.setSettings({ ...R.getSettings(), ["last_" + grp.id]: id });
  if (needDemo(id)) openDemo(); else goReady();
}
// 배경음악: 신나는 무료 음원(realmusic)을 게임마다 골라 자리 잡는 동안 미리 받음. 못 받았으면 합성 댄스곡
let nextBgm = null;
function stopBgm() { bgm.stop(); REAL.bgmStop(); }
function goReady() {
  const g = GAMES[gameId];
  if (g.music !== false) nextBgm = REAL.pickBgm();
  $("#readyTitle").textContent = `${g.icon} ${g.title}` + (party ? ` · 파티 ${party.i + 1}/${party.n}` : "") + (coop ? " · 협동" : "");
  $("#readyHow").textContent = "";   // 자리 잡기 화면의 분홍 설명 글은 뺌 (설명은 게임 설명 시연에서)
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
let songStartSec = 3, songLoading = false;
// 미리 듣기: 게임이 따로 정하면(지휘자 = 실제 연주 녹음) 그것으로
const songPreview = id => { const g = GAMES[gameId]; if (g && g.preview) g.preview(id); else rhythmAudio.preview(id); };
function stopSongPreview() { const g = GAMES[gameId]; if (g && g.stopPreview) g.stopPreview(); rhythmAudio.stopPreview(); }
const pickSong = (g, sel) => sel === "random" || !g.songs.some(x => x.id === sel) ? g.songs[Math.floor(Math.random() * g.songs.length)].id : sel;
function startGame(sec) {
  if (!GAMES[gameId].songs) return beginCountdown(sec);
  songStartSec = sec; renderSongCards(); setState("song");
}
function renderSongCards() {
  const g = GAMES[gameId], box = $("#songCards");
  $("#songHead").textContent = `${g.icon} ${g.title} · 노래를 골라요`;
  const list = [...g.songs, { id: "random", icon: "🎲", title: "아무거나" }];
  const last = R.getSettings()["lastSong_" + gameId];
  box.innerHTML = ""; box.classList.toggle("many", list.length > 4); box.classList.toggle("lots", list.length > 6); box.classList.toggle("tons", list.length > 10);
  list.forEach((S, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "card song" + (S.id === last ? " last" : ""); b.setAttribute("data-hand", ""); b.dataset.song = S.id;
    b.style.setProperty("--bg", S.id === "random" ? "#dfe6e9" : ["#ffeaa7", "#fab1a0", "#81ecec", "#a29bfe", "#ffb8d1", "#b8e994"][i % 6]);
    const speed = S.real ? "실제 연주" : S.bpm ? (S.bpm >= 120 ? "빠름" : S.bpm >= 100 ? "보통" : "느림") : "";
    b.innerHTML = `<span class="ico">${S.icon}</span><span class="lbl">${esc(S.title)}</span><span class="desc">${esc([S.by, speed].filter(Boolean).join(" · ") || "무작위")}</span>`;
    b.onmouseenter = () => { if (S.id !== "random") songPreview(S.id); };
    b.onclick = async () => {
      if (songLoading) return;
      unlock(); stopSongPreview();
      songSel = S.id; R.setSettings({ ...R.getSettings(), ["lastSong_" + gameId]: S.id });
      const id = pickSong(g, songSel);
      // 실제 연주 녹음처럼 미리 받아야 하는 곡: 받는 동안 안내 (실패하면 합성음으로)
      if (g.prepare) {
        songLoading = true; box.classList.add("loading");
        $("#songHead").textContent = `🎵 ${g.songs.find(x => x.id === id).title} 연주를 불러오는 중…`;
        const r = await Promise.race([g.prepare(id), new Promise(ok => setTimeout(() => ok(null), 25000))]);
        songLoading = false; box.classList.remove("loading");
        if (state !== "song") return;
        if (!r) {
          const S = g.songs.find(x => x.id === id);
          if (S && S.synth === false) { $("#songHead").textContent = "연주를 불러오지 못했어요. 인터넷을 확인하거나 다른 곡을 골라요"; return; }   // 합성음 대신이 없는 곡
          $("#songHead").textContent = "연주를 불러오지 못해 기본 소리로 해요"; await new Promise(ok => setTimeout(ok, 1200));
        }
      }
      beginCountdown(songStartSec, id);
    };
    box.appendChild(b);
  });
}
$("#btnSongBack").onclick = () => { stopSongPreview(); goReady(); };
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
$("#btnReadyBack").onclick = () => { stopSongPreview(); setState("select"); };
$("#btnDemo").onclick = () => openDemo();

/* ---------- 게임 설명 시연 (선수별로 게임마다 처음 한 번, 이후엔 '설명 보기') ---------- */
let demo = null, demoCap = "", demoStep = 0;
// 설명 글: 단계 번호 + 글. 바뀔 때마다 톡 튀어나옴
function showDemoCap(text) {
  const el = $("#demoCap"); el.innerHTML = "";
  if (!text) return;
  const last = /직접 해 봐요/.test(text);
  const b = document.createElement("span"); b.className = "demo-step" + (last ? " go" : ""); b.textContent = last ? "GO" : String(++demoStep);
  const t = document.createElement("span"); t.className = "demo-text"; t.textContent = text;
  el.append(b, t); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}
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
  demo = startDemo(gameId, g, view); demoCap = ""; demoStep = 0;
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
function beginCountdown(sec = 3, song = null) {
  const g = GAMES[gameId];
  stopSongPreview();
  if (g.songs) curSong = song || pickSong(g, songSel);
  clearFx(); fever = false;
  $("#hud").classList.remove("fever"); bgm.setTempo(1);
  players = slots.map(s => ({ ...s, score: 0, combo: 0, maxCombo: 0, misses: 0, stats: {} }));
  fun = newFun(g); shots.reset();
  // 게임 시간: 게임이 정하면 그대로 (리듬·지휘자 = 곡이 끝날 때까지, OX 퀴즈 = 10문제)
  gameSec = g.secFor ? g.secFor(curSong, players.map(p => diffOf(p.diff))) : g.sec; timeLeft = gameSec;
  trackers.forEach(tr => { tr.meters = 0; });
  insts = players.map((p, i) => g.create(makeEnv(i)));
  setupHud();
  cdT = sec; setState("countdown"); showCd(String(sec)); sfx.tick();
}
function beginPlay() { unlock(); setState("play"); showCd("시작!"); goT = 0.7; sfx.go(); if (GAMES[gameId].music !== false && !(nextBgm && REAL.bgmPlay(nextBgm))) bgm.start(); }
function showCd(txt) { const el = $("#cd"); el.hidden = false; el.textContent = txt; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }

function makeEnv(i) {
  const p = players[i];
  return {
    slot: i, player: p, tracker: trackers[i], zone: zones[i], view, mode: slots.length,
    level: GAMES[gameId].levelField ? p[GAMES[gameId].levelField] : null, song: curSong, diff: diffOf(p.diff), color: p.color, name: p.name,
    progress: () => 1 - Math.max(0, timeLeft) / gameSec,
    fever: () => fever,
    award: (base, x, y) => award(i, base, x, y),
    miss: (x, y, label) => miss(i, x, y, label),
    penalty: (n, x, y, label) => penalty(i, n, x, y, label),
    speak: (text, lang) => speak(slots.length === 2 && !lang ? `${p.name}, ${text}` : text, slots.length === 2, lang),
    pip: (c, x, y, w, h, mark) => drawPip(c, i, x, y, w, h, mark),
    // 재미 장치
    rush: () => (fun && fun.rush ? fun.rush : null),            // 돌발 이벤트 중이면 { name, t }
    catchUp: () => !!(fun && fun.catch[i]),                       // 대결에서 지고 있는 사람 '역전 찬스'
    stat: (k, n = 1) => { p.stats[k] = (p.stats[k] || 0) + n; if (k === "gold") shots.want(slots.length === 2 ? `${p.name} 대박!` : "대박!", 3); },   // 미션용 집계
    moment: (label, pri, delay) => shots.want(label, pri, delay),   // 웃긴 순간 사진
    rand: coop ? FUN.seeded(fun.seed) : null,                     // 협동: 두 선수가 같은 순서
    together: coop ? (key, x, y) => together(i, key, x, y) : null,
  };
}
/* ---------- 재미 장치: 돌발 이벤트 · 따라잡기 · 우정 별 · 함께 성공 ---------- */
const RUSH_SEC = 5;
function newFun(g) {
  const fr = coop && g.cat === "move" && g.music !== false && !g.scene3d;   // 우정 별: 카메라 화면에서 하는 놀이 게임
  return {
    seed: (Math.random() * 1e9) | 0,
    rushAt: g.rush ? 0.26 + Math.random() * 0.12 : 9, rush: null, rushDone: false,
    catch: [false, false],
    friendOn: fr, friend: null, friendT: 7 + Math.random() * 4,
    tog: new Map(), snaps: 0,
    teamBest: coop ? teamBest() : 0, beatBest: false,
  };
}
const teamKeyOf = () => R.gameKey(GAMES[gameId].recId || gameId, recLevel(players[0])) + "#coop";
const teamIdOf = () => "team:" + slots.map(s => s.profileId || s.id).sort().join("+");
function teamBest() { const r = R.allRecords().filter(x => x.key === teamKeyOf() && x.playerId === teamIdOf()); return r.length ? Math.max(...r.map(x => x.score)) : 0; }
const teamScore = () => players.reduce((a, p) => a + p.score, 0);
function funTick(dt) {
  if (!fun) return;
  const g = GAMES[gameId], prog = 1 - Math.max(0, timeLeft) / gameSec, { W, H, U } = view;
  // 돌발 이벤트: 한 판에 한 번, 5초 동안 목표물이 쏟아짐 (두 선수 동시에)
  if (!fun.rushDone && prog >= fun.rushAt && !fever) {
    fun.rushDone = true; fun.rush = { name: g.rush, t: RUSH_SEC };
    sfx.fever(); popup(W / 2, H * 0.4, `돌발! ${g.rush}`, { size: U * 0.09, color: "#fff", stroke: "#ff6a00", life: 1.6, vy: -30 });
    shots.want(`돌발! ${g.rush}`, 2, 1.6);
  }
  if (fun.rush) { fun.rush.t -= dt; if (fun.rush.t <= 0) fun.rush = null; }
  // 사진: 특별한 일이 없어도 두 장은 찍어 둠
  if (fun.snaps === 0 && prog > 0.3) { fun.snaps = 1; shots.want("열심히!", 0); }
  if (fun.snaps === 1 && prog > 0.72) { fun.snaps = 2; shots.want("집중!", 0); }
  // 따라잡기: 대결에서 점수 차가 크면 지고 있는 사람 점수 1.5배 + 황금 목표물 더 자주 (차이가 절반으로 줄면 끝)
  if (players.length === 2 && !coop && catchOn && prog > 0.15) {
    const a = players[0].score, b = players[1].score, gap = Math.abs(a - b), th = Math.max(10, Math.max(a, b) * 0.3), lo = a < b ? 0 : 1;
    [0, 1].forEach(k => {
      const was = fun.catch[k], on = gap > 0 && k === lo && (was ? gap >= th * 0.5 : gap >= th);
      fun.catch[k] = on;
      if (on && !was) { sfx.select(); popup(zones[k].cx, H * 0.32, "역전 찬스! 점수 1.5배", { size: U * 0.055, color: "#fff", stroke: "#7a1fd6", life: 1.4 }); }
    });
  } else fun.catch = [false, false];
  // 협동: 팀 최고 기록을 넘으면 알림
  if (coop && fun.teamBest > 0 && !fun.beatBest && teamScore() > fun.teamBest) {
    fun.beatBest = true; sfx.fever(); popup(W / 2, H * 0.36, "팀 최고 기록 넘었다!", { size: U * 0.07, color: "#fff", stroke: "#1d8f47", life: 1.6 }); shots.want("팀 기록!", 3);
  }
  if (fun.friendOn) friendTick(dt, prog);
}
// 우정 별: 가운데 선 위에 나타남. 두 선수가 0.6초 안에 함께 손을 대면 둘 다 3점
function friendY() {
  const ys = trackers.map(tr => tr.pts && tr.pts[11].v && tr.pts[12].v ? (tr.pts[11].y + tr.pts[12].y) / 2 : null).filter(y => y != null);
  const y = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length - view.U * 0.05 : view.H * 0.45;
  return Math.max(view.H * 0.3, Math.min(view.H * 0.7, y + (Math.random() - 0.5) * view.U * 0.12));
}
function friendTick(dt, prog) {
  const F = fun.friend, U = view.U;
  if (!F) {
    fun.friendT -= dt;
    if (fun.friendT <= 0 && prog < 0.95) { fun.friend = { x: view.W / 2, y: friendY(), t: 0, life: 7, touch: [-9, -9], done: false, rt: 0 }; sfx.select(); }
    return;
  }
  F.t += dt;
  if (F.done) { F.rt += dt; if (F.rt > 0.8) { fun.friend = null; fun.friendT = 10 + Math.random() * 5; } return; }
  const r = U * 0.085;
  trackers.forEach((tr, k) => { if (tr.hands.some(h => h.vis && Math.hypot(h.x - F.x, h.y - F.y) < r * 1.5)) F.touch[k] = F.t; });
  if (F.t - F.touch[0] < 0.6 && F.t - F.touch[1] < 0.6) {
    F.done = true; award(0, 3, F.x - r * 1.5, F.y - r); award(1, 3, F.x + r * 1.5, F.y - r);
    popup(F.x, F.y - r * 2, "우정 별!", { size: U * 0.07, color: "#fff", stroke: "#e0306a", life: 1.3 });
    burst(F.x, F.y, { n: 36, colors: ["#ff4d4d", "#ffd400", "#7ae0ff", "#9dff7a", "#ff8ad8"], shape: "star", speed: U * 1.0, gravity: U * 0.5, size: U * 0.022, life: 1.0 });
    sfx.fever(); shots.want("우정 별!", 4); players.forEach(p => { p.stats.friend = (p.stats.friend || 0) + 1; });
  } else if (F.t > F.life) { fun.friend = null; fun.friendT = 8 + Math.random() * 4; }
}
// 협동: 같은 벽·같은 카드를 둘 다 성공하면 보너스
function together(i, key, x, y) {
  const e = fun.tog.get(key) || {}; e[i] = true; fun.tog.set(key, e);
  if (e[0] && e[1] && !e.done) {
    e.done = true; award(0, 2, zones[0].cx, view.H * 0.25); award(1, 2, zones[1].cx, view.H * 0.25);
    popup(view.W / 2, view.H * 0.36, "함께 성공! 협동 보너스", { size: view.U * 0.06, color: "#fff", stroke: "#1d8f47", life: 1.3 });
    sfx.fever(); shots.want("함께 성공!", 4); players.forEach(p => { p.stats.friend = (p.stats.friend || 0) + 1; });
  }
}
function drawFun(t) {
  if (!fun || state !== "play") return;
  const { W, H, U } = view;
  if (fun.rush) {   // 돌발 이벤트 띠
    const txt = `돌발! ${fun.rush.name} ${Math.ceil(fun.rush.t)}초`, fs = U * 0.05;
    ctx.save(); ctx.font = `${fs}px ${FONT}`; const w = ctx.measureText(txt).width + U * 0.08, y = U * 0.19;
    ctx.fillStyle = `hsl(${(t * 200) % 360},90%,55%)`; rr(ctx, W / 2 - w / 2, y - fs * 0.85, w, fs * 1.7, fs * 0.85); ctx.fill();
    ctx.lineWidth = U * 0.006; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.restore();
    outlinedText(ctx, txt, W / 2, y, fs, "#fff", "#333");
  }
  players.forEach((p, k) => {   // 역전 찬스 표시
    if (!fun.catch[k]) return;
    const z = zones[k], a = 0.75 + 0.25 * Math.sin(t * 8);
    ctx.save(); ctx.globalAlpha = a; ctx.lineWidth = U * 0.012; ctx.strokeStyle = "#b46bff"; ctx.strokeRect(z.x0 + U * 0.02, U * 0.13, z.w - U * 0.04, H - U * 0.15); ctx.restore();
    outlinedText(ctx, "역전 찬스 · 점수 1.5배", z.cx, U * (fun.rush ? 0.27 : 0.19), U * 0.04, "#fff", "#7a1fd6");
  });
  const F = fun.friend;
  if (F) {
    const r = U * 0.085, k = F.done ? 1 + F.rt * 1.5 : 1, al = F.done ? Math.max(0, 1 - F.rt / 0.8) : Math.min(1, F.t * 3);
    ctx.save(); ctx.globalAlpha = al;
    ctx.shadowColor = "#fff"; ctx.shadowBlur = r * (0.6 + 0.4 * Math.sin(t * 7));
    starPath(ctx, F.x, F.y, r * k, 0.5, Math.sin(t * 2) * 0.2);
    const g = ctx.createLinearGradient(F.x - r, F.y - r, F.x + r, F.y + r);
    ["#ff4d4d", "#ffd400", "#37d67a", "#3d8bff", "#b46bff"].forEach((c, i) => g.addColorStop(i / 4, c));
    ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = r * 0.08; ctx.strokeStyle = "#fff"; ctx.stroke();
    if (!F.done) {
      [0, 1].forEach(i => { if (F.t - F.touch[i] < 0.6) { ctx.strokeStyle = slots[i].color; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.arc(F.x, F.y, r * 1.35, i ? -Math.PI / 2 : Math.PI / 2, i ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke(); } });
      ctx.lineWidth = U * 0.008; ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(F.x, F.y, r * 1.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, 1 - F.t / F.life)); ctx.stroke();
    }
    ctx.restore();
    if (!F.done) outlinedText(ctx, "둘이 함께 터치!", F.x, F.y + r * 1.9, U * 0.042, "#fff", "#e0306a");
  }
}
// 3D 스포츠용 카메라 작은 화면: 그 선수 몸 주변만 잘라 구석에 보여 줌 (카메라 모습만)
function drawPip(c, i, x, y, w, h, mark) {
  const z = zones[i], tr = trackers[i], P = tr && tr.pts, U = view.U, s = h / view.H;
  let cx = P && P[11].v && P[12].v ? (P[11].x + P[12].x) / 2 : z.cx;
  if (mark) cx = (cx + mark.x) / 2;           // 내 몸과 옮길 자리가 함께 보이게
  cx = Math.max(z.x0 + w / s / 2, Math.min(z.x1 - w / s / 2, cx));
  c.save();
  c.beginPath(); c.roundRect(x, y, w, h, U * 0.02); c.clip();
  c.translate(x + w / 2, y); c.scale(s, s); c.translate(-cx, 0);
  cam.draw(c, view.W, view.H);
  if (wearOn && P && tr.present && slots[i] && slots[i].wear) drawWear(c, P, slots[i].wear, itemOf, wearPipSt[i], lastT, lastDt);   // 작은 창 속 내 모습에도 꾸미기
  // 뼈대 선(다각형 모양)은 그리지 않음: 작은 창에는 카메라에 비친 모습만 (점검용 ?bones=1 일 때만 표시)
  if (P && SHOW_BONES) {
    c.strokeStyle = slots[i].color; c.lineWidth = U * 0.02; c.lineCap = "round"; c.beginPath();
    for (const [a, b] of BONES) if (P[a].v && P[b].v) { c.moveTo(P[a].x, P[a].y); c.lineTo(P[b].x, P[b].y); }
    c.stroke();
  }
  if (mark) {   // 몸을 옮길 자리: 세로 점선 (가까우면 초록)
    c.save(); c.setLineDash([U * 0.03 / s, U * 0.022 / s]); c.lineWidth = U * 0.012 / s; c.strokeStyle = mark.ok ? "#37d67a" : "#ffe14d";
    c.beginPath(); c.moveTo(mark.x, view.H * 0.04); c.lineTo(mark.x, view.H); c.stroke(); c.restore();
  }
  c.restore();
  c.lineWidth = U * 0.006; c.strokeStyle = "#fff"; c.beginPath(); c.roundRect(x, y, w, h, U * 0.02); c.stroke();
}
function award(i, base, x, y) {
  const p = players[i], k = diffOf(p.diff).points, boost = fun && fun.catch[i] ? 1.5 : 1;
  const pts = Math.ceil(base * k * (fever ? 2 : 1) * boost);   // 난이도 배점 × 피버 2배 × 역전 찬스 1.5배
  p.combo++; p.maxCombo = Math.max(p.maxCombo, p.combo);
  let bonus = 0;
  if (p.combo >= 5 && p.combo % 5 === 0) {
    bonus = k;
    popup(x, y - view.U * 0.08, `${p.combo} 콤보! +${bonus}`, { size: view.U * 0.05, color: "#ffe14d", stroke: "#7a4a00" });
  }
  if (p.combo >= 10 && p.combo % 10 === 0) shots.want(`${p.combo} 콤보!`, 3);
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
  shots.want(label || "앗!", 4, 0.15);
  bump(i);
}
function enterFever() {
  fever = true; sfx.fever(); bgm.setTempo(1.35); REAL.bgmRate(1.08);
  $("#hud").classList.add("fever");
  popup(view.W / 2, view.H * 0.45, "피버 타임! 점수 2배", { size: view.U * 0.09, color: "#fff", stroke: "#e0306a", life: 1.6, vy: -20 });
  shots.want("피버 타임!", 1, 0.6);
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
    const key = p.score + "|" + p.combo + "|" + (fun && fun.catch[i] ? 1 : 0);
    if (hudCache[i] === key) return; hudCache[i] = key;
    const b = $("#pb" + i);
    b.querySelector(".ps").textContent = p.score;
    b.querySelector(".pc").textContent = fun && fun.catch[i] ? "역전 찬스 ×1.5" : p.combo >= 2 ? `${p.combo} 콤보` : "";
  });
  const tt = $("#teamTag");
  if (coop) { const txt = `팀 ${teamScore()}점` + (fun && fun.teamBest ? ` · 최고 ${fun.teamBest}` : ""); if (tt.textContent !== txt) tt.textContent = txt; }
  tt.hidden = !coop;
  const sec = gameSec;
  $("#tfill").style.width = Math.max(0, timeLeft / sec * 100) + "%";
  $("#ttxt").textContent = Math.max(0, Math.ceil(timeLeft));
}
function bump(i) { const el = $(`#pb${i} .ps`); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
$("#btnQuit").onclick = () => { stopInsts(); stopBgm(); stopSpeak(); shots.stop(); fun = null; if (party) { party = null; toast("파티를 멈췄어요"); } setState("select"); };

/* ---------- 5. 결과 ---------- */
function endGame() {
  stopInsts(); stopBgm(); stopSpeak(); sfx.fanfare();
  $("#hud").classList.remove("fever");
  justSaved = new Set();
  const g = GAMES[gameId], photos = shots.pick(3); shots.stop();
  // 파티: 이번 게임 점수 기록
  let partyEnd = false;
  if (party) { party.res[party.i] = players.map(p => p.score); party.i++; partyEnd = party.i >= party.n; }
  // 협동: 팀 기록 (두 선수 모두 이름이 있을 때)
  let team = null;
  if (coop) {
    team = { score: teamScore(), best: fun ? fun.teamBest : 0, rec: null };
    if (slots.every(s => s.profileId)) {
      team.rec = R.addRecord({ key: teamKeyOf(), game: gameId, level: recLevel(players[0]), playerId: teamIdOf(), name: slots.map(s => s.name).join("·"), score: team.score, mode: 2, meters: 0, diff: "normal" });
      justSaved.add(team.rec.record.id);
    }
  }
  const results = players.map((p, i) => {
    const meters = Math.round(trackers[i].meters * 10) / 10;
    let rec = null;
    if (p.profileId) {
      const lvl = recLevel(p);
      rec = R.addRecord({ key: R.gameKey(GAMES[gameId].recId || gameId, lvl), game: gameId, level: lvl, playerId: p.profileId, name: p.name, score: p.score, mode: players.length, meters, diff: p.diff, ...(coop ? { coopPart: true } : {}) });
      if (coop) rec = null; else justSaved.add(rec.record.id);
    }
    // 아이템 획득: 점수를 낸 선수(이름 있는 선수)는 아이템 하나를 받음. 쓸 수 있는 아이템이고 그 자리가 비어 있으면 바로 착용
    let item = null;
    if (p.profileId && p.score > 0) { const it = pickItem(R.items(p.profileId)); item = { ...it, isNew: R.addItem(p.profileId, it.id), count: R.items(p.profileId).length }; item.worn = autoWear(i, it); }
    // 오늘의 미션
    let mis = null;
    if (p.profileId) {
      mis = FUN.updateMissions(p.profileId, { id: gameId, cat: g.cat, maxCombo: p.maxCombo, meters, gold: p.stats.gold || 0, boss: p.stats.boss || 0, partyDone: partyEnd }, missionGames());
      if (mis.reward) mis.reward.worn = autoWear(i, mis.reward);
    }
    return { p, meters, rec, item, mis, extra: (insts[i].result && insts[i].result()) || "" };
  });
  fun = null;
  renderResult(results, photos, team, partyEnd);
  rankView = { game: gameId, level: recLevel(players[0]) };
  setState("result");
  fitResult(); requestAnimationFrame(fitResult); setTimeout(fitResult, 300);   // 글꼴·그림이 늦게 그려져도 다시 맞춤
  countUp();
}
// 결과 점수가 0부터 올라가며 나타남 (0.9초)
function countUp() {
  const els = [...document.querySelectorAll("#resCols .rnum")], t0 = performance.now(), D = 900;
  const step = now => {
    const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
    els.forEach(el => { el.textContent = Math.round(+el.dataset.v * e); });
    if (k < 1 && state === "result") requestAnimationFrame(step); else els.forEach(el => { el.textContent = el.dataset.v; });
  };
  requestAnimationFrame(step);
}
// 새로 받은 아이템이 쓸 수 있는 것이고 그 자리가 비었으면 바로 착용 (저장된 선수만)
function autoWear(i, it) {
  const s = slots[i]; if (!it || !WEAR[it.id] || guestOf(s.id) || !R.players().some(x => x.id === s.id)) return false;
  const w = { ...(propOf(s.id, "wear", null) || {}) }, slot = WEAR[it.id].slot;
  if (w[slot]) return false;
  w[slot] = it.id; R.setProp(s.id, "wear", w); s.wear = w; return true;
}
const missionGames = () => GAME_ORDER.filter(id => !PARTY_SKIP.includes(id) && !VS_ONLY.includes(id)).map(id => ({ id, icon: GAMES[id].icon, title: GAMES[id].title }));
// 결과 화면이 기기 화면보다 크면 통째로 줄여서 한 화면에 다 보이게 (스크롤 없이)
function fitResult() {
  const panel = $("#scr-result .res"); if (!panel || state !== "result") return;
  panel.style.transform = ""; panel.style.maxHeight = "none"; panel.style.overflow = "visible";
  const h = panel.offsetHeight, w = panel.offsetWidth, H = window.innerHeight * 0.96, W = window.innerWidth * 0.98;
  const k = Math.min(1, H / h, W / w);
  if (k < 1) panel.style.transform = `scale(${k.toFixed(3)})`;
}
window.addEventListener("resize", () => { if (state === "result") fitResult(); });
function renderResult(results, photos = [], team = null, partyEnd = false) {
  const g = GAMES[gameId];
  let title = "끝!";
  if (team) title = `협동 팀 ${team.score}점`;
  else if (results.length === 2) {
    const [a, b] = results;
    title = a.p.score === b.p.score ? "무승부!" : `${(a.p.score > b.p.score ? a : b).p.name} 승리!`;
  }
  $("#resTitle").textContent = `${g.icon} ${g.title} · ${title}`;
  // 협동: 팀 점수
  const tb = $("#resTeam"); tb.hidden = !team;
  if (team) {
    const badge = team.best > 0 && team.score > team.best ? "팀 최고 기록!" : team.rec && team.rec.first ? "첫 팀 기록!" : "";
    tb.innerHTML = `<span>팀 점수</span><b>${team.score}</b><span>점</span>` + (team.best ? `<small>지난 최고 ${team.best}점</small>` : "") + (badge ? `<span class="rbadge">${badge}</span>` : "") + (!team.rec ? `<small>두 사람 모두 이름이 있으면 팀 기록이 저장돼요</small>` : "");
  }
  const box = $("#resCols"); box.innerHTML = ""; box.classList.toggle("two", results.length === 2);   // 2인은 두 칸 나란히 (한 화면에 다 보이게)
  const decided = !team && results.length === 2 && results[0].p.score !== results[1].p.score;
  const top = Math.max(...results.map(r => r.p.score));
  results.forEach(({ p, meters, rec, extra, item, mis }, i) => {
    let badge = "";
    if (rec) badge = rec.rank === 1 && rec.total > 1 ? "전체 1위!" : rec.best ? "개인 최고 기록!" : rec.first ? "첫 기록!" : "";
    const col = document.createElement("div");
    col.className = "rcol" + (decided && p.score === top && results.length === 2 ? " rwin" : ""); col.style.setProperty("--c", p.color); col.style.animationDelay = `${i * 0.12}s`;
    const misHtml = mis ? mis.newly.map(t => `<div class="rmis">미션 완료! ${esc(t)}</div>`).join("") + (mis.stamp ? `<div class="rstamp">오늘의 미션 다 했어요! 도장 ${mis.stamps}개</div>` : "") : "";
    const itemHtml = it => `<div class="ritem"><span class="ico">${it.icon}</span><span>${it.special ? "특별 아이템!" : "아이템 획득!"} <b>${esc(it.name)}</b>${it.isNew ? "" : " (또 받았어요)"}${it.worn && wearOn ? " · 바로 착용!" : ""}${it.count ? `<small>모은 아이템 ${it.count}/${ITEMS.length}</small>` : ""}</span></div>`;
    col.innerHTML =
      `<div class="rname">${decided && p.score === top ? "👑 " : ""}${i + 1}P ${esc(p.name)}</div>` +
      `<div class="rscore"><span class="rnum" data-v="${p.score}">${p.score}</span><small>점</small></div>` +
      (badge ? `<div class="rbadge">${badge}</div>` : "") +
      `<div class="rmeta">${team ? "팀에 보탠 점수" : rec ? `전체 ${rec.rank}위 (기록 ${rec.total}개 중)` : "손님 이름을 적으면 다음부터 기록이 저장돼요"}</div>` +
      `<div class="rmeta">난이도 ${diffOf(p.diff).label} · ${esc(extra)}${extra ? " · " : ""}최대 콤보 ${p.maxCombo}</div>` +
      `<div class="rmeta">손이 움직인 거리 약 ${meters}m</div>` +
      (item ? itemHtml(item) : "") + misHtml + (mis && mis.reward ? itemHtml(mis.reward) : "");
    box.appendChild(col);
  });
  // 웃긴 순간 사진
  const sb = $("#resShots"); sb.innerHTML = ""; sb.hidden = !photos.length;
  photos.forEach((ph, k) => {
    const f = document.createElement("button"); f.type = "button"; f.className = "shot"; f.style.setProperty("--r", `${(k - (photos.length - 1) / 2) * 3}deg`);
    f.innerHTML = `<img src="${ph.url}" alt=""><span>${esc(ph.label)}</span>`;
    f.onclick = () => openShot(ph);
    sb.appendChild(f);
  });
  // 파티
  const pr = $("#resParty"), inParty = !!party;
  pr.hidden = !inParty;
  $("#btnNext").hidden = !inParty; $("#btnPartyStop").hidden = !inParty || partyEnd;
  $("#btnAgain").hidden = inParty; $("#btnOther").hidden = inParty;
  if (inParty) {
    pr.textContent = `파티 ${party.i}/${party.n} · ` + partyStand().map(x => `${x.name} ${x.label}`).join(" · ");
    $("#btnNext").textContent = partyEnd ? "파티 결과 보기" : `다음 게임 (${party.i + 1}/${party.n}) ${GAMES[party.list[party.i]].icon}`;
  }
}
/* ---------- 사진 크게 보기 · 저장 ---------- */
let shotCur = null;
function openShot(ph) { shotCur = ph; $("#shotImg").src = ph.url; $("#shotCap").textContent = ph.label; $("#shotView").hidden = false; }
$("#btnShotClose").onclick = () => { $("#shotView").hidden = true; };
$("#shotView").onclick = e => { if (e.target.id === "shotView") $("#shotView").hidden = true; };
$("#btnShotSave").onclick = async () => {
  if (!shotCur) return;
  const d = new Date(), name = `우리집게임_${GAMES[gameId].title}_${FUN.dayKey(d)}_${d.getHours()}${String(d.getMinutes()).padStart(2, "0")}`;
  const ok = await saveShot(shotCur.canvas, name.replace(/\s+/g, ""));
  if (ok) toast("사진을 저장했어요");
};

/* ---------- 파티 모드 ---------- */
function partyPool() {
  const ok = id => !PARTY_SKIP.includes(id) && !GAMES[id].songs && !(coop && VS_ONLY.includes(id));
  return { move: GAME_ORDER.filter(id => GAMES[id].cat === "move" && ok(id)), sport: GAME_ORDER.filter(id => GAMES[id].cat === "sport" && ok(id)) };
}
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
// 지금까지 순위: 혼자는 점수 합, 대결은 이긴 게임 3점·비기면 1점(같으면 점수 합), 협동은 팀 점수 합
function partyStand() {
  if (!party) return [];
  const sum = k => party.res.reduce((a, r) => a + (r[k] || 0), 0);
  if (coop) return [{ name: "팀", pts: sum(0) + sum(1), label: `${sum(0) + sum(1)}점` }];
  if (slots.length === 1) return [{ name: slots[0].name, pts: sum(0), label: `${sum(0)}점` }];
  return [0, 1].map(k => {
    const w = party.res.reduce((a, r) => a + (r[k] > r[1 - k] ? 3 : r[k] === r[1 - k] ? 1 : 0), 0);
    return { name: slots[k].name, pts: w, total: sum(k), label: `승점 ${w}` };
  });
}
function partyBtn(txt, fn, cls = "pill") {
  const b = document.createElement("button"); b.type = "button"; b.className = cls; b.setAttribute("data-hand", ""); b.textContent = txt; b.onclick = fn;
  $("#partyBtns").appendChild(b); return b;
}
function openParty() { party = null; partyPick(); setState("party"); }
function partyPick() {
  $("#partyHead").textContent = "🎉 파티 모드";
  $("#partySub").textContent = slots.length === 2
    ? (coop ? "룰렛이 고른 게임을 이어서 해요. 둘이 합친 팀 점수로 파티 기록에 도전!" : "룰렛이 고른 게임을 이어서 해요. 이긴 게임마다 승점 3점, 비기면 1점!")
    : "룰렛이 고른 게임을 이어서 해요. 점수를 모두 더해요!";
  $("#partyReel").innerHTML = ""; $("#partyTable").innerHTML = ""; $("#partyBtns").innerHTML = "";
  partyBtn("3게임 파티", () => partySpin(3)); partyBtn("5게임 파티", () => partySpin(5)); partyBtn("뒤로", () => { party = null; setState("select"); }, "pill ghost");
}
function partySpin(n) {
  const P = partyPool(), all = [...P.move, ...P.sport];
  const list = shuffle([...shuffle(P.move).slice(0, n === 3 ? 2 : 3), ...shuffle(P.sport).slice(0, n === 3 ? 1 : 2)]);
  const me = party = { list, i: 0, n, res: [] };
  $("#partySub").textContent = "룰렛을 돌려요!"; $("#partyBtns").innerHTML = ""; $("#partyTable").innerHTML = "";
  const reel = $("#partyReel"); reel.innerHTML = "";
  const els = list.map((id, k) => {
    const d = document.createElement("div"); d.className = "slot spin";
    d.innerHTML = `<span class="no">${k + 1}번째</span><span class="ico">❔</span><span class="lbl"></span>`;
    reel.appendChild(d); return d;
  });
  const spin = setInterval(() => { els.forEach(d => { if (d.classList.contains("spin")) d.querySelector(".ico").textContent = GAMES[all[Math.floor(Math.random() * all.length)]].icon; }); sfx.tick(); }, 110);
  list.forEach((id, k) => setTimeout(() => {
    if (party !== me || state !== "party") { clearInterval(spin); return; }
    const d = els[k]; d.classList.remove("spin"); d.classList.add("stop");
    d.querySelector(".ico").textContent = GAMES[id].icon; d.querySelector(".lbl").textContent = GAMES[id].title; sfx.select();
    if (k < n - 1) return;
    clearInterval(spin);
    $("#partySub").textContent = `첫 번째 게임은 ${GAMES[list[0]].title}!`; speak(`첫 번째 게임은 ${GAMES[list[0]].title}!`);
    partyBtn("시작!", partyGo, "pill go"); partyBtn("다시 돌리기", () => partySpin(n), "pill ghost"); partyBtn("뒤로", () => { party = null; setState("select"); }, "pill ghost");
    setTimeout(() => { if (party === me && state === "party" && !me.started) partyGo(); }, 5000);   // 손을 안 대도 5초 뒤 시작
  }, 1000 + k * 650));
}
function partyGo() { if (!party) return; party.started = true; chooseGame(party.list[party.i]); }
function partyFinal() {
  const st = partyStand(), best = Math.max(...st.map(x => x.pts));
  const win = coop || slots.length === 1 ? null : st.filter(x => x.pts === best);
  const tie = win && win.length === 2 && win[0].total === win[1].total;
  const champ = win ? (win.length === 1 ? win[0] : tie ? null : win.reduce((a, b) => (b.total > a.total ? b : a))) : null;
  $("#partyHead").textContent = "🎉 파티 결과";
  const msg = coop ? `팀 점수 ${st[0].pts}점! 둘이 함께 해냈어요` : slots.length === 1 ? `${slots[0].name} 모두 ${st[0].pts}점!` : champ ? `파티 우승은 ${champ.name}!` : "파티 무승부!";
  $("#partySub").textContent = msg; speak(msg); sfx.fanfare();
  const reel = $("#partyReel"); reel.innerHTML = "";
  party.list.forEach((id, k) => { const d = document.createElement("div"); d.className = "slot past"; d.innerHTML = `<span class="no">${k + 1}번째</span><span class="ico">${GAMES[id].icon}</span><span class="lbl">${esc(GAMES[id].title)}</span>`; reel.appendChild(d); });
  const head = `<tr><th>게임</th>${slots.map((s, k) => `<th style="color:${s.color}">${k + 1}P ${esc(s.name)}</th>`).join("")}</tr>`;
  const rows = party.list.map((id, k) => { const r = party.res[k] || []; return `<tr><td>${GAMES[id].icon} ${esc(GAMES[id].title)}</td>${slots.map((s, j) => `<td class="${!coop && slots.length === 2 && r[j] > r[1 - j] ? "win" : ""}">${r[j] ?? "-"}</td>`).join("")}</tr>`; }).join("");
  const tot = coop ? `<tr class="tot"><td>팀 합계</td><td colspan="2">${st[0].pts}점</td></tr>`
    : slots.length === 1 ? `<tr class="tot"><td>합계</td><td>${st[0].pts}점</td></tr>`
    : `<tr class="tot"><td>승점 (점수 합)</td>${st.map(x => `<td>${champ && champ.name === x.name ? "👑 " : ""}${x.pts} (${x.total})</td>`).join("")}</tr>`;
  $("#partyTable").innerHTML = `<table>${head}${rows}${tot}</table>`;
  $("#partyBtns").innerHTML = "";
  partyBtn("다시 파티", () => { party = null; partyPick(); }, "pill go"); partyBtn("다른 게임", () => { party = null; setState("select"); });
  burst(view.W / 2, view.H * 0.3, { n: 60, colors: ["#ff4d4d", "#ffd400", "#7ae0ff", "#9dff7a", "#ff8ad8"], shape: "confetti", speed: view.U * 1.4, gravity: view.U * 0.7, size: view.U * 0.02, life: 1.6 });
  party.done = true;
  setState("party");
}
$("#btnNext").onclick = () => { if (!party) { setState("select"); return; } if (party.i >= party.n) partyFinal(); else partyGo(); };
$("#btnPartyStop").onclick = () => { party = null; toast("파티를 멈췄어요"); setState("select"); };

/* ---------- 오늘의 미션 · 주간 리그 ---------- */
let misBackTo = "setup";
function openMissions(from) { misBackTo = from; renderMissions(); setState("mission"); }
function renderMissions() {
  const list = $("#misList"); list.innerHTML = "";
  const games = missionGames();
  const who = loopOn && slots.length ? slots.filter(s => s.profileId).map(s => ({ id: s.profileId, name: s.name })) : R.players().map(p => ({ id: p.id, name: p.name }));
  if (!who.length) list.innerHTML = '<div class="mcard">이름이 있는 선수만 미션을 받아요. 손님은 이름을 적어 주세요</div>';
  for (const w of who) {
    const day = FUN.missionsOf(w.id, games), st = FUN.stampsOf(w.id).length, cyc = st % FUN.STAMP_EVERY;
    const card = document.createElement("div"); card.className = "mcard";
    card.innerHTML = `<h4><span>${esc(w.name)}</span><small>${day.stamped ? "오늘 도장 받음 · " : ""}도장 ${st}개</small></h4>` +
      day.list.map(m => { const d = FUN.missionDone(m), h = FUN.missionHint(m); return `<div class="mrow${d ? " done" : ""}"><span class="ck">${d ? "✔" : ""}</span><span class="tx">${esc(FUN.missionText(m))}</span><span class="pr">${m.prog}/${m.goal}</span>${h ? `<span class="hn">${esc(h)}</span>` : ""}</div>`; }).join("") +
      `<div class="stamps">${"🟠".repeat(cyc)}${"⚪".repeat(FUN.STAMP_EVERY - cyc)} <small>도장 ${FUN.STAMP_EVERY}개마다 특별 아이템</small></div>`;
    list.appendChild(card);
  }
  const lg = FUN.league(), champ = FUN.lastWeekChampion(), P = FUN.LEAGUE_PTS;
  $("#leagueBox").innerHTML = `<h4>이번 주 가족 리그 <small>(점수 높은 순)</small></h4>` +
    (lg.length ? lg.map((x, i) => `<div class="lrow${i < 3 ? " top" + (i + 1) : ""}"><b class="rk">${i + 1}<small>위</small></b><span>${i === 0 ? "👑 " : ""}${esc(x.name)}</span><b>${x.pts}<small>점</small></b><small>${x.play}판 했어요 · 게임 1등 ${x.win}번 · 내 최고 기록 깬 횟수 ${x.best}번 · 미션 도장 ${x.stamp}개</small></div>`).join("") : '<p class="rule">이번 주 기록이 아직 없어요</p>') +
    (champ ? `<p class="champ">지난주 챔피언: 👑 ${esc(champ.name)} (${champ.pts}점)</p>` : "") +
    `<p class="rule">한 판 ${P.play}점 · 이번 주 게임별 1등 ${P.win}점 · 개인 최고 기록 경신 ${P.best}점 · 미션 도장 ${P.stamp}점. 월요일마다 새로 시작해요</p>`;
}
$("#btnMisBack").onclick = () => { if (!loopOn) { setState("setup"); renderSetup(); return; } setState(misBackTo === "result" ? "result" : "select"); };
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
  $("#rankTitle").textContent = `${RG.icon} ${RG.title}${SUB ? " · " + SUB[rankView.level] : ""} 순위 (점수 높은 순)`;
  const list = R.ranking(key, 10);
  if (!list.length) ol.innerHTML = '<li class="empty">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</li>';
  list.forEach((r, i) => {
    const d = new Date(r.at), li = document.createElement("li");
    if (justSaved.has(r.id)) li.className = "new";
    const meta = [diffOf(r.diff).label, `${d.getMonth() + 1}월 ${d.getDate()}일`, r.mode === 2 ? "대결" : "혼자"].join(" · ");
    li.className = (li.className ? li.className + " " : "") + (i < 3 ? "top" + (i + 1) : "");
    li.innerHTML = `<b class="rk">${i + 1}<small>위</small></b><span class="who"><b class="nm">${esc(r.name)}</b><small class="meta"><i class="df ${r.diff || "normal"}"></i>${esc(meta)}</small></span><span class="sc">${r.score}<small>점</small></span>`;
    ol.appendChild(li);
  });
  // 선수별 모은 아이템
  const ib = $("#rankItems"); ib.innerHTML = "<h4>모은 아이템</h4>";
  const owners = R.players().filter(pl => R.items(pl.id).length);
  if (!owners.length) ib.insertAdjacentHTML("beforeend", '<p class="empty">게임을 끝내면 아이템을 받아요</p>');
  owners.forEach(pl => ib.insertAdjacentHTML("beforeend", `<p><span>${esc(pl.name)} ${R.items(pl.id).length}/${ITEMS.length}</span><b class="its">${R.items(pl.id).map(id => (itemOf(id) || {}).icon || "").join("")}</b></p>`));
  // 협동 팀 기록
  const tl = R.ranking(key + "#coop", 5), tb = $("#rankTeam");
  tb.hidden = !tl.length; tb.innerHTML = tl.length ? "<h4>협동 팀 기록</h4>" + tl.map(r => `<p><span>${esc(r.name)}</span><b>${r.score}점</b></p>`).join("") : "";
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
  // 한 장면에서 오류가 나도 화면이 멈추지 않게: 계산과 그리기를 따로 감싸고, 오류는 화면 아래에 작게 알림
  try { frameBody(now); } catch (e) { reportErr(e); try { draw(lastT); } catch (e2) {} }
}
let errShown = -1e9;
function reportErr(e) {
  console.error(e);
  const now = performance.now(); if (now - errShown < 15000) return; errShown = now;
  const el = $("#errBox"); if (!el) return;
  el.textContent = `오류 v${APP_V} [${state}${gameId ? " " + gameId : ""}] ${(e && (e.message || e)) || ""} ${(e && e.stack ? e.stack.split("\n")[1] || "" : "").trim().slice(0, 90)}`;
  el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 12000);
}
function frameBody(now) {
  const t = now / 1000, dt = lastT ? Math.min(0.1, Math.max(0, t - lastT)) : 0.016; lastT = t; lastDt = dt;
  wake();   // 소리 장치가 멈췄으면 다시 깨움 (아이패드)
  cam.layout(view.W, view.H);
  let raws = [];
  if (detector && cam.ready) { try { raws = detector.detect(video, now); } catch (e) { console.warn(e); } }
  if (!visSupported && raws.some(r => r.some(p => p.visibility > 0.01))) visSupported = true;
  const inGame = state === "play" || state === "countdown";
  if (raws.length && now - sampAt > 120) { sampAt = now; sampler.frame(cam.sim ? null : video); }   // 몸통 옷 색: 카메라 화면을 작게 한 장 읽음 (읽기가 무거워서 0.12초마다만)
  const as = assigner ? assigner.assign(raws, cam, view, dt, visSupported, !inGame, sampler) : [];
  faceTick(t);
  trackers.forEach((tr, i) => tr.update(as[i], cam, dt, t, visSupported));
  if (assigner) for (const i of assigner.takeFresh()) {
    const L = assigner.locks[i]; faceHold = t + 1.0;
    sfx.select(); popup(L.x, L.y, `${i + 1}P ${slots[i].name} 인식!`, { size: view.U * 0.06, color: "#fff", stroke: slots[i].color, life: 1.2 });
  }
  if (state === "select") updateSelBadges();
  updateShapes(t);
  tick(dt);
  updateFx(dt);
  draw(t);
  shots.afterDraw();   // 웃긴 순간: 다 그린 화면을 찍음
  if (HAND_UI) handUI(dt);
  drawCursors();
}
function tick(dt) {
  if (state === "demo" && demo) {
    demo.update(dt);
    if (demo.caption !== demoCap) { demoCap = demo.caption; showDemoCap(demoCap); }
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
    $(".readybar").classList.toggle("compact", trackers.every(tr => tr.present));   // 선수가 다 인식되면 안내판을 작게 (한 손 연습은 한 줄 안내만 남김)
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
    shots.tick(dt); funTick(dt);
    insts.forEach(g => g.update(dt));
    renderHud();
    if (timeLeft <= 0 || (insts.length && insts.every(g => g.done))) endGame();   // 시간이 끝나거나 게임이 다 끝났다고 알리면
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
  drawWears(t);
  drawSkeletons();
  if (state === "ready") drawReady();
  if (state === "countdown" || state === "play") insts.forEach(g => g.draw(ctx));
  if (slots.length === 2 && state !== "select" && state !== "ranking") drawDivider();   // 게임 그림 위에 그려서 항상 보이게
  drawFun(t);
  if (state === "countdown" || state === "play") drawLost();
  drawFx(ctx);
  ctx.restore();
}
// 꾸미기: 카메라 화면 속 선수에게 모은 아이템을 씌움
function drawWears(t) {
  if (!wearOn) return;
  trackers.forEach((tr, i) => { if (tr.pts && tr.present && slots[i] && slots[i].wear) drawWear(ctx, tr.pts, slots[i].wear, itemOf, wearSt[i], t, lastDt); });
}
// 2인: 화면 가운데 경계선. 어두운 테두리 + 흰 선 + 양쪽에 선수 색 띠, 아래에 '◀ 1P | 2P ▶' 이름표
function drawDivider() {
  const { W, H, U } = view, x = W / 2, top = U * 0.13, c0 = slots[0].color, c1 = slots[1].color;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(x - U * 0.02, top, U * 0.04, H - top);
  ctx.fillStyle = c0; ctx.fillRect(x - U * 0.014, top, U * 0.009, H - top);
  ctx.fillStyle = c1; ctx.fillRect(x + U * 0.005, top, U * 0.009, H - top);
  ctx.fillStyle = "#fff"; ctx.fillRect(x - U * 0.005, top, U * 0.01, H - top);
  // 이름표
  const fs = U * 0.032, y = H - U * 0.05, pad = U * 0.016;
  ctx.font = `800 ${fs}px ${FONT}`; ctx.textBaseline = "middle";
  [[0, "◀ 1P " + slots[0].name, c0], [1, "2P " + slots[1].name + " ▶", c1]].forEach(([i, t, c]) => {
    const w = ctx.measureText(t).width + pad * 2, h = fs * 1.5, bx = i === 0 ? x - U * 0.03 - w : x + U * 0.03;
    ctx.fillStyle = c; rr(ctx, bx, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.lineWidth = U * 0.005; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(t, bx + pad, y + fs * 0.04);
  });
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
let readyBottom = 0, readyRectAt = -1e9;
function drawReady() {
  const { H, U } = view;
  // 서 있을 자리 틀은 위 안내판 아래부터 (안내판에 머리·든 손이 가리지 않게)
  const nowMs = performance.now();
  if (nowMs - readyRectAt > 300) { readyRectAt = nowMs; readyBottom = $(".readybar").getBoundingClientRect().bottom; }
  const rb = { bottom: readyBottom };
  const y = Math.min(H * 0.5, Math.max(H * 0.2, rb.bottom + U * 0.025)), h = H * 0.9 - y;
  zones.forEach((z, i) => {
    const ok = upperOk(trackers[i]);
    const w = Math.min(z.w * 0.78, U * 0.75), x = z.cx - w / 2;
    ctx.save(); ctx.setLineDash(ok ? [] : [U * 0.025, U * 0.018]); ctx.lineWidth = U * 0.01;
    ctx.strokeStyle = ok ? "#2fd36b" : "rgba(255,255,255,.85)"; rr(ctx, x, y, w, h, U * 0.04); ctx.stroke(); ctx.restore();
    const lines = ok ? ["좋아요!"] : trackers[i] && trackers[i].present ? ["얼굴과 어깨가", "보이게"] : [`${i + 1}P ${slots[i].name}`, "여기서 만세!"];
    // 구역 너비에 맞춰 글자 크기를 줄임 (2인에서 옆 사람 글자와 겹치지 않게)
    ctx.font = `${Math.round(U * 0.05)}px ${FONT}`;
    const fs = U * 0.05 * Math.min(1, ...lines.map(t => w * 0.95 / Math.max(1, ctx.measureText(t).width)));
    lines.forEach((t, k) => outlinedText(ctx, t, z.cx, y + h - U * 0.035 - (lines.length - 1 - k) * fs * 1.15, fs, "#fff", ok ? "#1d8f47" : slots[i].color));
  });
}
function drawLost() {
  trackers.forEach((tr, i) => {
    if (tr.lostT < 0.6) return;
    const z = zones[i];
    outlinedText(ctx, `${i + 1}P ${slots[i].name}`, z.cx, view.H * 0.45, view.U * 0.06, "#fff", slots[i].color);
    // 2인은 구역이 좁으니 두 줄로, 구역 너비에 맞춰 글자 크기를 줄임
    ctx.font = `${Math.round(view.U * 0.045)}px ${FONT}`;
    const fit = t => view.U * 0.045 * Math.min(1, z.w * 0.88 / ctx.measureText(t).width);
    outlinedText(ctx, "화면 안으로 들어와요", z.cx, view.H * 0.53, fit("화면 안으로 들어와요"), "#fff", "#333");
    outlinedText(ctx, "안 되면 만세!", z.cx, view.H * 0.59, fit("화면 안으로 들어와요") * 0.85, "#fff", "#333");
  });
}

/* ---------- 손 모양 판정 (한 프레임에 손 하나씩 돌아가며) ---------- */
function updateShapes(t) {
  trackers.forEach(tr => tr.hands.forEach(h => h.ageShape(t)));
  if (!handShape || !cam.ready || state === "setup") return;
  if ((state === "play" || state === "countdown" || state === "ready") && !GAMES[gameId].oneHand) return;   // 두 손 다 쓰는 게임은 자리 잡기·게임 중 판정 안 함(속도 확보)
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
    if (inside && !el.classList.contains("hover") && el.dataset.song && el.dataset.song !== "random") songPreview(el.dataset.song);   // 손을 대면 미리 듣기
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
/* ---------- 전체 화면 버튼 (오른쪽 위) ----------
   아이패드 Safari: 주소창·탭 막대를 숨김. 끄려면 이 버튼이나 왼쪽 위 X
   아이폰 Safari는 화면 전체 보기를 지원하지 않아 '홈 화면에 추가'를 안내. 홈 화면 아이콘으로 열었으면 이미 전체 화면이라 버튼을 숨김 */
function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
function fsOk() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
function standalone() { return window.navigator.standalone === true || !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches); }
function updateFullBtn() {
  const b = $("#btnFull"), on = !!fsEl();
  b.hidden = standalone() || ["countdown", "play", "demo", "ready"].includes(state);
  b.classList.toggle("on", on);
  b.querySelector(".tx").textContent = on ? "전체 화면 끄기" : "전체 화면";
}
$("#btnFull").onclick = () => {
  unlock();
  if (fsEl()) { const x = document.exitFullscreen || document.webkitExitFullscreen; try { const r = x && x.call(document); if (r && r.catch) r.catch(() => {}); } catch (e) {} return; }
  if (!fsOk()) { toast("이 기기는 Safari 전체 화면이 안 돼요. 공유 버튼 → '홈 화면에 추가'로 만든 아이콘으로 열면 전체 화면이에요"); return; }
  goFullscreen();
};
for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(ev, () => { updateFullBtn(); setTimeout(() => window.dispatchEvent(new Event("resize")), 120); });
updateFullBtn();

if (SIM) window.__dbg = { get demo() { return demo; }, get state() { return state; }, setTime: s => { timeLeft = s; }, players: () => players, scales: () => trackers.map(t => Math.round(t.scale)),
  bgmReal: () => REAL.bgmPlaying(),
  fun: () => fun && { rush: fun.rush, catch: fun.catch.slice(), friend: fun.friend, teamBest: fun.teamBest, rushAt: fun.rushAt },
  party: () => party, shots: () => shots.count, coop: () => coop, insts: () => insts,
  setScore: (i, v) => { players[i].score = v; },
  audio: () => audioState(),
  face: () => ({ state: FACE.faceState(), locks: assigner ? assigner.locks.map(L => L && { tid: L.tid, lost: !!L.lost, faceN: L.faceN }) : [] }),   // 점검: 실제 음원 배경음악이 나오는지
  bodyX: () => trackers.map(t => (t.pts && t.pts[11].v && t.pts[12].v ? Math.round((t.pts[11].x + t.pts[12].x) / 2) : null)) };   // 점검: 선수 몸 위치(화면 x)

renderSetup();
setState("setup");
if (detector) setMsg("준비 완료! 선수를 고르고 시작하세요"); else setMsg("게임 엔진 불러오는 중...");

window.__appReady = true;
