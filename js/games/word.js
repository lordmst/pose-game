// 한글·영어 풍선: 그림 낱말의 글자를 앞에서부터 순서대로 풍선에서 골라 터뜨리기 (한 손으로 고름)
import { burst, rr, outlinedText, FONT, rnd, shuffle } from "../fx.js?v=71";
import { sfx } from "../audio.js?v=71";
import { drawBalloon } from "./math.js?v=71";

export const WORD_LEVELS = { ko2: "한글 2글자", ko3: "한글 3글자", en3: "영어 3글자", en45: "영어 4~5글자" };
const WORDS = {
  ko2: [["사과", "🍎"], ["포도", "🍇"], ["우유", "🥛"], ["기차", "🚂"], ["나비", "🦋"], ["오리", "🦆"], ["하마", "🦛"], ["토끼", "🐰"], ["사자", "🦁"], ["구름", "☁️"],
    ["바다", "🌊"], ["모자", "🧢"], ["가방", "🎒"], ["시계", "⏰"], ["우산", "☂️"], ["양말", "🧦"], ["의자", "🪑"], ["딸기", "🍓"], ["수박", "🍉"], ["당근", "🥕"],
    ["피자", "🍕"], ["공룡", "🦖"], ["로봇", "🤖"], ["버스", "🚌"], ["연필", "✏️"], ["침대", "🛏️"], ["사탕", "🍬"], ["선물", "🎁"], ["고래", "🐳"], ["여우", "🦊"]],
  ko3: [["자동차", "🚗"], ["바나나", "🍌"], ["코끼리", "🐘"], ["비행기", "✈️"], ["고양이", "🐱"], ["강아지", "🐶"], ["거북이", "🐢"], ["호랑이", "🐯"], ["무지개", "🌈"], ["오렌지", "🍊"],
    ["햄버거", "🍔"], ["케이크", "🎂"], ["눈사람", "⛄"], ["해바라기", null], ["원숭이", "🐵"], ["다람쥐", "🐿️"], ["펭귄", null], ["기린", null], ["옥수수", "🌽"], ["소방차", "🚒"],
    ["경찰차", "🚓"], ["자전거", "🚲"], ["거미줄", "🕸️"], ["달팽이", "🐌"], ["앵무새", "🦜"], ["도토리", "🌰"], ["아이스", null], ["토마토", "🍅"], ["복숭아", "🍑"], ["허수아비", null]],
  en3: [["CAT", "🐱"], ["DOG", "🐶"], ["SUN", "☀️"], ["BUS", "🚌"], ["CAR", "🚗"], ["PIG", "🐷"], ["COW", "🐮"], ["HAT", "🎩"], ["BED", "🛏️"], ["EGG", "🥚"],
    ["FOX", "🦊"], ["BEE", "🐝"], ["ANT", "🐜"], ["OWL", "🦉"], ["CUP", "☕"], ["KEY", "🔑"], ["BOX", "📦"], ["MAP", "🗺️"], ["PEN", "🖊️"], ["BAT", "🦇"]],
  en45: [["FISH", "🐟"], ["BEAR", "🐻"], ["LION", "🦁"], ["FROG", "🐸"], ["DUCK", "🦆"], ["CAKE", "🎂"], ["BOOK", "📖"], ["STAR", "⭐"], ["MOON", "🌙"], ["TREE", "🌳"],
    ["APPLE", "🍎"], ["GRAPE", "🍇"], ["HORSE", "🐴"], ["TIGER", "🐯"], ["ZEBRA", "🦓"], ["PIZZA", "🍕"], ["ROBOT", "🤖"], ["TRAIN", "🚂"], ["MOUSE", "🐭"], ["SHEEP", "🐑"]],
};
// 그림이 없는 낱말과 3글자가 아닌 낱말은 3글자 단계에서 제외
WORDS.ko3 = WORDS.ko3.filter(([w, e]) => e && [...w].length === 3);
const KO_POOL = [...new Set(Object.values(WORDS).slice(0, 2).flat().flatMap(([w]) => [...w]))];
const EN_POOL = "ABCDEFGHIJKLMNOPRSTUVWYZ".split("");
const COLORS = ["#ff5a5a", "#4da6ff", "#ffc233", "#a07bff", "#37d67a", "#ff8fd0"];
const DWELL = 0.25, AFTER_POP_LOCK = 0.6, RISE = 0.12;

// 한글 풍선과 영어 풍선은 같은 규칙, 낱말만 다름. 기록은 예전 '글자 풍선' 기록을 이어 씀 (recId: "word")
const pickLevels = keys => Object.fromEntries(keys.map(k => [k, WORD_LEVELS[k]]));
const makeWordGame = meta => ({
  sec: 60, cursor: "✋", oneHand: true, cat: "learn", recId: "word",
  how: "그림 낱말의 글자를 앞에서부터 순서대로 터뜨려요. 한 손만 활짝 펴서 대기!",
  ...meta,
  create(env) {
    const keys = Object.keys(meta.levels), z = env.zone, v = env.view, level = keys.includes(env.level) ? env.level : keys[0], en = level.startsWith("en");
    let word = null, letters = [], idx = 0, balloons = [], phase = "ask", doneT = 0, lock = 0, tAll = 0, bad = 0, words = 0, wrong = 0, needSpeak = false, last = null;
    const R = () => Math.min(z.w * 0.11, v.U * 0.095);
    const box = () => { const w = Math.min(z.w * 0.86, v.U * 0.85), h = v.U * 0.14; return { x: z.x0 + (z.w - w) / 2, y: v.H * 0.13, w, h }; };
    function newWord() {
      let pick; do { pick = WORDS[level][rnd(0, WORDS[level].length - 1)]; } while (pick[0] === last && WORDS[level].length > 1);
      last = pick[0]; word = pick; letters = [...pick[0]]; idx = 0; needSpeak = true; makeBalloons();
    }
    function makeBalloons() {
      const ans = letters[idx], pool = en ? EN_POOL : KO_POOL, wrongs = new Set();
      while (wrongs.size < 2) { const c = pool[rnd(0, pool.length - 1)]; if (!letters.includes(c)) wrongs.add(c); }   // 낱말에 든 글자는 오답으로 안 씀
      const lanes = shuffle([0.2, 0.5, 0.8]);
      balloons = shuffle([ans, ...wrongs]).map((val, i) => ({ val, fx: lanes[i], fy: 0.98 + i * 0.07, ph: Math.random() * 6, color: COLORS[(i + rnd(0, 5)) % COLORS.length], dwell: 0, alive: true, hover: false, x: 0, y: 0 }));
      phase = "ask"; lock = 0.4;
    }
    function pop(b) {
      b.alive = false; sfx.pop(); lock = AFTER_POP_LOCK; balloons.forEach(o => { o.dwell = 0; });
      const r = R();
      if (b.val === letters[idx]) {
        idx++; env.award(1, b.x, b.y - r * 0.4); setTimeout(() => sfx.catch(env.player.combo), 70);
        burst(b.x, b.y, { n: 26, colors: [b.color, "#fff", "#ffd400"], shape: "confetti", speed: v.U * 0.9, gravity: v.U * 1.3, size: v.U * 0.015 });
        if (idx >= letters.length) {   // 낱말 완성 보너스
          words++; phase = "done"; doneT = 1.3; env.award(1, box().x + box().w / 2, box().y + box().h + v.U * 0.05);
          env.speak(en ? word[0].toLowerCase() : word[0], en ? "en-US" : undefined);
        } else { phase = "done"; doneT = 0.45; }
      } else {
        wrong++; bad = 0.45; sfx.bad(); env.miss(b.x, b.y - r * 0.4, "땡!");
        burst(b.x, b.y, { n: 12, color: "#c8c8c8", shape: "smoke", speed: v.U * 0.25, gravity: -v.U * 0.2, size: r * 0.5, life: 0.6 });
      }
    }
    newWord();
    return {
      update(dt) {
        tAll += dt; lock = Math.max(0, lock - dt); bad = Math.max(0, bad - dt);
        if (needSpeak) { needSpeak = false; env.speak(en ? word[0].toLowerCase() : word[0], en ? "en-US" : undefined); }
        if (phase === "done") { doneT -= dt; if (doneT <= 0) { if (idx >= letters.length) newWord(); else makeBalloons(); } }
        const rise = RISE * (1 + 0.6 * env.progress()) * env.diff.speed * (env.fever() ? 1.15 : 1), r = R();
        for (const b of balloons) {
          if (!b.alive) continue;
          b.fy -= rise * dt; if (b.fy < -0.15) b.fy = 1.1;
          b.x = z.x0 + b.fx * z.w + Math.sin(tAll * 1.6 + b.ph) * r * 0.3; b.y = b.fy * v.H;
        }
        const h = phase === "ask" && lock === 0 ? env.tracker.activeHand : null;
        let target = null, bd = Infinity;
        if (h) for (const b of balloons) { if (!b.alive) continue; const d = Math.hypot(h.x - b.x, h.y - b.y); if (d < r * 1.1 && d < bd) { target = b; bd = d; } }
        for (const b of balloons) { b.hover = b === target; b.dwell = b.hover ? b.dwell + dt : Math.max(0, b.dwell - dt * 2); }
        if (target && target.dwell >= DWELL) pop(target);
      },
      draw(ctx) {
        const r = R();
        for (const b of balloons) {
          if (!b.alive) continue;
          drawBalloon(ctx, b.x, b.y, r, b.color, b.val, phase === "ask" ? 1 : 0.35, b.hover);
          if (b.dwell > 0 && phase === "ask") { ctx.strokeStyle = "#ffd400"; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.dwell / DWELL)); ctx.stroke(); }
        }
        // 문제 칸: 그림 + 글자 칸 (채운 글자, 지금 고를 칸 강조)
        const bx = box(), jx = bad > 0 ? Math.sin(bad * 60) * v.U * 0.012 : 0;
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, bx.x + jx + 5, bx.y + 7, bx.w, bx.h, bx.h * 0.3); ctx.fill();
        ctx.fillStyle = idx >= letters.length ? "#d8ffe6" : bad > 0 ? "#ffe0e0" : "#fff"; rr(ctx, bx.x + jx, bx.y, bx.w, bx.h, bx.h * 0.3); ctx.fill();
        ctx.lineWidth = v.U * 0.01; ctx.strokeStyle = idx >= letters.length ? "#2fb65a" : env.color; ctx.stroke();
        const pic = word[1], n = letters.length, cell = Math.min(bx.h * 0.78, (bx.w - bx.h * 1.4) / n), y = bx.y + bx.h / 2;
        const startX = bx.x + jx + bx.h * 1.15 + (bx.w - bx.h * 1.3 - cell * n) / 2;
        ctx.font = `${Math.round(bx.h * 0.62)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(pic, bx.x + jx + bx.h * 0.65, y);
        letters.forEach((c, i) => {
          const cx = startX + cell * (i + 0.5);
          ctx.lineWidth = 3; ctx.strokeStyle = i === idx && phase === "ask" ? "#ff8a00" : "#bbb"; ctx.fillStyle = i < idx ? "#fff8d0" : "#f4f4f4";
          rr(ctx, cx - cell * 0.44, y - cell * 0.44, cell * 0.88, cell * 0.88, cell * 0.15); ctx.fill(); ctx.stroke();
          if (i < idx) outlinedText(ctx, c, cx, y + cell * 0.03, cell * 0.68, "#222", "#fff", 2);
          else if (i === idx && phase === "ask") outlinedText(ctx, "?", cx, y + cell * 0.03, cell * 0.6, "#ff8a00", "#fff", 2);
        });
      },
      result: () => `완성한 낱말 ${words} · 틀림 ${wrong}`,
      // 설명 시연·점검용 (수학 풍선과 같은 모양)
      get balloons() { return balloons; },
      get answer() { return letters[idx]; },
      get phase() { return phase; },
    };
  },
});
export const hangul = makeWordGame({ id: "hangul", title: "한글 풍선", icon: "가", bg: "#80d0ff", desc: "한글 낱말 순서대로", levels: pickLevels(["ko2", "ko3"]), levelField: "koLevel", levelLabel: "한글 풍선" });
export const english = makeWordGame({ id: "english", title: "영어 풍선", icon: "🔤", bg: "#a29bfe", desc: "영어 낱말 순서대로", levels: pickLevels(["en3", "en45"]), levelField: "enLevel", levelLabel: "영어 풍선" });

