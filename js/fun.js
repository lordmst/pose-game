// 다시 하고 싶게 만드는 장치: 오늘의 미션(도장) · 주간 가족 리그 · 같은 순서를 만드는 난수
import * as R from "./records.js?v=75";
import { pickSpecial } from "./items.js?v=75";

// 같은 씨앗이면 같은 순서 (협동에서 두 선수가 같은 벽·같은 카드를 받게)
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashStr = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pad = n => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayTime = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
// 이번 주 월요일 0시 (기기 시간 기준)
export function weekStart(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x.getTime(); }
const WEEK = 7 * 86400000;

/* ---------- 오늘의 미션 ---------- */
// 하루 3개. 날짜와 선수로 정해져서 새로고침해도 같음. 셋 다 하면 도장, 도장 5개마다 특별 아이템
export const STAMP_EVERY = 5;
const MISSIONS = {
  plays:  { goal: () => 3,  text: m => `게임 ${m.goal}판 하기`, add: (m, g) => 1 },
  meters: { goal: () => 50, text: m => `손을 ${m.goal}m 움직이기`, add: (m, g) => g.meters, unit: "m" },
  game:   { goal: () => 1,  text: m => `${m.icon} ${m.title} 한 판 하기`, add: (m, g) => g.id === m.game ? 1 : 0 },
  combo:  { goal: () => 1,  text: m => `한 게임에서 ${m.n} 콤보 만들기`, add: (m, g) => g.maxCombo >= m.n ? 1 : 0 },
  gold:   { goal: () => 2,  text: m => `황금 목표물 ${m.goal}개 잡기`, add: (m, g) => g.gold, hint: "황금 두더지·과일·얼음·공, 별똥별" },
  boss:   { goal: () => 1,  text: () => "보스 물리치기", add: (m, g) => g.boss, hint: "두더지·얼음·과일·별·골키퍼 중간에 나와요" },
  learn:  { goal: () => 1,  text: () => "💡 생각 게임 한 판 하기", add: (m, g) => g.cat === "learn" ? 1 : 0 },
  sport:  { goal: () => 1,  text: () => "🏅 올림픽 종목 한 판 하기", add: (m, g) => g.cat === "sport" ? 1 : 0 },
  party:  { goal: () => 1,  text: () => "🎉 파티 모드 끝까지 하기", add: (m, g) => g.partyDone ? 1 : 0 },
};
function makeMissions(pid, date, games) {
  const rnd = seeded(hashStr(pid + "|" + date));
  const pick = a => a[Math.floor(rnd() * a.length)];
  const types = [pick(["plays", "meters"])];
  const rest = ["game", "combo", "gold", "boss", "learn", "sport", "party"];
  while (types.length < 3) { const t = pick(rest); if (!types.includes(t)) types.push(t); }
  return types.map(type => {
    const m = { type, prog: 0 };
    if (type === "game") { const g = pick(games); Object.assign(m, { game: g.id, icon: g.icon, title: g.title }); }
    if (type === "combo") m.n = pick([6, 8, 10]);
    m.goal = MISSIONS[type].goal(m);
    return m;
  });
}
const store = () => { const s = R.getSettings(); return { s, ms: { ...(s.missions || {}) }, st: { ...(s.stamps || {}) } }; };
// 오늘 미션 (없거나 날짜가 바뀌었으면 새로 만듦)
export function missionsOf(pid, games) {
  const date = dayKey(), { s, ms } = store();
  if (!ms[pid] || ms[pid].date !== date) { ms[pid] = { date, list: makeMissions(pid, date, games), stamped: false }; R.setSettings({ ...s, missions: ms }); }
  return ms[pid];
}
export const missionText = m => MISSIONS[m.type].text(m);
export const missionHint = m => MISSIONS[m.type].hint || "";
export const missionDone = m => m.prog >= m.goal;
export const stampsOf = pid => (R.getSettings().stamps || {})[pid] || [];
// 한 판 끝: g = { id, cat, maxCombo, meters, gold, boss, partyDone }. 새로 끝낸 미션·도장·특별 아이템을 돌려줌
export function updateMissions(pid, g, games) {
  const cur = missionsOf(pid, games), { s, ms, st } = store();
  const day = { ...cur, list: cur.list.map(m => ({ ...m })) }, newly = [];
  for (const m of day.list) {
    if (missionDone(m)) continue;
    m.prog = Math.min(m.goal, Math.round((m.prog + (MISSIONS[m.type].add(m, g) || 0)) * 10) / 10);
    if (missionDone(m)) newly.push(missionText(m));
  }
  let stamp = false, reward = null;
  if (!day.stamped && day.list.every(missionDone)) {
    day.stamped = true; stamp = true;
    const a = (st[pid] || []).slice(); a.push(day.date); st[pid] = a;
    if (a.length % STAMP_EVERY === 0) { const it = pickSpecial(R.items(pid)); reward = { ...it, isNew: R.addItem(pid, it.id) }; }
  }
  ms[pid] = day;
  R.setSettings({ ...R.getSettings(), missions: ms, stamps: st });
  return { newly, stamp, stamps: (st[pid] || []).length, reward, list: day.list };
}

/* ---------- 주간 가족 리그 ---------- */
// 리그 점수 = 한 판 1점 + 이번 주 게임별 1등 3점 + 개인 최고 기록 경신 2점 + 미션 도장 3점
// (노력한 만큼 오르게: 어른이 점수로 다 이기더라도 아이가 많이 하고 기록을 깨면 따라잡을 수 있음)
export const LEAGUE_PTS = { play: 1, win: 3, best: 2, stamp: 3 };
export function league(from = weekStart(), to = from + WEEK) {
  const recs = R.allRecords().slice().sort((a, b) => a.at - b.at), names = new Map(R.players().map(p => [p.id, p.name]));
  const T = new Map(), row = (id, name) => { if (!T.has(id)) T.set(id, { id, name: names.get(id) || name, play: 0, win: 0, best: 0, stamp: 0 }); return T.get(id); };
  const prevBest = new Map(), top = new Map();
  for (const r of recs) {
    if (!r.playerId || String(r.playerId).startsWith("team:")) continue;
    const k = r.key + "|" + r.playerId, pb = prevBest.get(k);
    if (r.at >= from && r.at < to) {
      const x = row(r.playerId, r.name); x.play++;
      if (r.coopPart) continue;   // 협동 판: 판수만
      if (pb != null && r.score > pb) x.best++;
      if (r.score > 0) { const t = top.get(r.key) || { score: 0, ids: new Map() }; if (r.score > t.score) { t.score = r.score; t.ids = new Map(); } if (r.score === t.score) t.ids.set(r.playerId, r.name); top.set(r.key, t); }
    }
    if (r.coopPart) continue;
    if (pb == null || r.score > pb) prevBest.set(k, r.score);
  }
  for (const t of top.values()) for (const [id, name] of t.ids) row(id, name).win++;   // 같은 점수면 둘 다 1등
  const st = R.getSettings().stamps || {};
  for (const [pid, dates] of Object.entries(st)) {
    const n = dates.filter(d => { const t = dayTime(d); return t >= from && t < to; }).length;
    if (n && (names.has(pid) || T.has(pid))) row(pid, pid.replace(/^guest:/, "")).stamp += n;
  }
  const out = [...T.values()].map(x => ({ ...x, pts: x.play * LEAGUE_PTS.play + x.win * LEAGUE_PTS.win + x.best * LEAGUE_PTS.best + x.stamp * LEAGUE_PTS.stamp }));
  return out.filter(x => x.pts > 0).sort((a, b) => b.pts - a.pts || b.win - a.win);
}
export const lastWeekChampion = () => { const w = weekStart(); const l = league(w - WEEK, w); return l.length ? l[0] : null; };
