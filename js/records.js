// 선수 목록 · 게임 기록 · 순위 (이 기기의 브라우저에 저장)
const KEY = "posegame.v2";
const MAX_RECORDS = 3000;
let db = { players: [], records: [], settings: {}, items: {} };
try { const s = localStorage.getItem(KEY); if (s) db = Object.assign(db, JSON.parse(s)); } catch (e) {}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const players = () => db.players;
export function addPlayer(name) {
  name = String(name || "").trim().slice(0, 8);
  if (!name) return null;
  let p = db.players.find(x => x.name === name);
  if (p) return p;
  p = { id: "p" + uid(), name, level: "add10", diff: "normal" };
  db.players.push(p); persist(); return p;
}
export function removePlayer(id) { db.players = db.players.filter(p => p.id !== id); persist(); }
export function setLevel(id, level) { const p = db.players.find(x => x.id === id); if (p) { p.level = level; persist(); } }
export function setProp(id, key, val) { const p = db.players.find(x => x.id === id); if (p) { p[key] = val; persist(); } }
export function setDiff(id, diff) { const p = db.players.find(x => x.id === id); if (p) { p.diff = diff; persist(); } }

export const getSettings = () => db.settings || {};
export function setSettings(s) { db.settings = s; persist(); }

// 모은 아이템: 선수(프로필)별 아이템 id 목록
export const items = pid => (db.items && db.items[pid]) || [];
export function addItem(pid, id) {
  db.items = db.items || {}; const a = db.items[pid] = db.items[pid] || [];
  const isNew = !a.includes(id); if (isNew) a.push(id); persist(); return isNew;
}

export const gameKey = (game, level) => level ? `${game}:${level}` : game;

export function addRecord(r) {
  const rec = { id: uid(), at: Date.now(), ...r };
  db.records.push(rec);
  if (db.records.length > MAX_RECORDS) db.records.splice(0, db.records.length - MAX_RECORDS);
  persist();
  const list = sorted(rec.key);
  const mine = db.records.filter(x => x.key === rec.key && x.playerId === rec.playerId && !x.coopPart);
  const best = mine.length > 1 && mine.every(x => x === rec || x.score < rec.score);
  return { record: rec, rank: list.indexOf(rec) + 1, total: list.length, best, first: mine.length === 1 };
}
// coopPart: 협동 판에서 한 사람이 보탠 점수 (혼자·대결 순위에는 안 넣음, 리그 판수에만 셈)
function sorted(key) { return db.records.filter(x => x.key === key && !x.coopPart).sort((a, b) => b.score - a.score || a.at - b.at); }
export const ranking = (key, n = 10) => sorted(key).slice(0, n);

export function bests(key) {
  const m = new Map();
  for (const r of db.records) {
    if (r.key !== key || r.coopPart) continue;
    const cur = m.get(r.playerId);
    if (!cur || r.score > cur.score) m.set(r.playerId, r);
  }
  return [...m.values()].map(r => ({ name: (db.players.find(p => p.id === r.playerId) || r).name, score: r.score })).sort((a, b) => b.score - a.score);
}
export const allRecords = () => db.records;
export function clearRecords() { db.records = []; persist(); }
