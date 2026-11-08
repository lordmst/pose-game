// 영어 몸 이름 (Simon Says): 영어 지시를 듣고 몸으로 따라 하기. 머리·어깨·무릎 같은 몸 이름과 동작 단어를 영어로 익힘
// 쉬움: 들리는 대로 다 따라 하기. 보통·어려움: "Simon says"가 붙은 지시만 따라 하기 (없으면 가만히)
import { burst, popup, rr, outlinedText, FONT } from "../../fx.js?v=74";
import { sfx } from "../../audio.js?v=74";
import { COMMANDS as SIMON } from "../simon.js?v=74";

const ROUND = 4.6;       // 한 판(초): 듣고 따라 하는 시간 + 결과 보여 주는 시간
const ANSWER = 3.3;      // 따라 하는 시간(초, 보통)
const HOLD = 0.4;        // 자세를 이만큼 유지하면 '했다'로 인정
const TRAP_RATE = 0.3;   // "Simon says"가 없는 함정 지시 비율 (보통·어려움)

// 영어 지시 (자세 판정은 가라사대 게임 것을 그대로 씀)
const EN = [
  { id: "head", en: "Touch your head!", ko: "머리 만지기" },
  { id: "shoulders", en: "Touch your shoulders!", ko: "어깨 만지기" },
  { id: "up", en: "Hands up!", ko: "두 손 위로 (만세)" },
  { id: "wide", en: "Arms out!", ko: "양팔 옆으로 벌리기" },
  { id: "hips", en: "Hands on your hips!", ko: "허리에 손" },
  { id: "clap", en: "Clap your hands!", ko: "가슴 앞에서 손 모으기" },
  { id: "left", en: "Raise your left hand!", ko: "왼손 들기" },
  { id: "right", en: "Raise your right hand!", ko: "오른손 들기" },
  { id: "squat", en: "Touch your knees!", ko: "무릎 짚고 앉기", lower: true },
  { id: "jump", en: "Jump!", ko: "제자리 뛰기", lower: true, jump: true },
  { id: "lknee", en: "Lift your left leg!", ko: "왼발 들기", lower: true },
  { id: "rknee", en: "Lift your right leg!", ko: "오른발 들기", lower: true },
].map(c => ({ ...c, check: (SIMON.find(s => s.id === c.id) || {}).check || (() => false) }));

const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

// 2인이 같은 지시를 받도록 시작 시각·지시 목록을 함께 씀
let shared = null, trapsAny = false;   // trapsAny: 한 명이라도 함정 난이도면 "Simon says"를 붙여 읽음
function sharedStart(lower) {
  if (!shared) shared = { t0: performance.now() / 1000 + 0.8, seed: 1 + Math.floor(Math.random() * 1e6), rounds: [], lower };
  return shared;
}
function roundAt(i) {
  const S = shared, list = EN.filter(c => S.lower || !c.lower), N = list.length;
  while (S.rounds.length <= i) {
    const k = S.rounds.length;
    let idx = Math.floor(hash(S.seed, k) * N);
    if (k > 0 && list[idx].id === S.rounds[k - 1].cmd.id) idx = (idx + 1) % N;     // 같은 지시 연속 금지
    S.rounds.push({ cmd: list[idx], says: k < 2 || hash(S.seed, k * 7 + 3) >= TRAP_RATE });
  }
  return S.rounds[i];
}

export default {
  id: "bodyen", title: "영어 몸 이름", icon: "🙋", sec: 60, cursor: "", cat: "learn", bg: "#ffd6a5", desc: "영어 지시 듣고 몸으로",
  how: "영어로 들리는 지시를 몸으로 따라 해요. Touch your head는 머리 만지기! 보통·어려움에서는 'Simon says'가 붙은 지시만 따라 해요",
  create(env) {
    const z = env.zone, v = env.view, answer = ANSWER * Math.max(0.75, Math.min(1.25, env.diff.poseTime));
    const trapsOn = env.diff.id !== "easy";
    if (trapsOn) trapsAny = true;
    const ankleBase = [null, null, null]; let jumping = false;
    let cur = -1, matchT = 0, result = null, okN = 0, failN = 0, now = 0, R = null;
    const mustDo = () => !trapsOn || R.says;      // 쉬움은 늘 따라 하기
    function finish(kind, label) {
      result = kind;
      const y = v.H * 0.62;
      if (kind === "good" || kind === "safe") {
        okN++; sfx.catch(env.player.combo); env.award(1, z.cx, y - v.U * 0.08);
        popup(z.cx, y, label, { size: v.U * 0.055, color: "#fff", stroke: "#2fb65a", life: 1.1 });
        burst(z.cx, y, { n: 20, colors: ["#ffd400", "#9dff7a", "#7ae0ff"], shape: "confetti", speed: v.U * 0.8, gravity: v.U, size: v.U * 0.015 });
      } else { failN++; sfx.bad(); env.miss(z.cx, y, label); }
    }
    return {
      update(dt = 1 / 60) {
        const S = sharedStart(!!env.tracker.lowerSeen);
        // 뛰기 판정: 두 발목과 엉덩이가 '서 있을 때 높이'보다 함께 올라가면
        const P = env.tracker.pts;
        jumping = false;
        if (P && [23, 24, 27, 28].every(i => P[i].v)) {
          const sw = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y) || 1, base = (k, y) => (ankleBase[k] = ankleBase[k] == null ? y : Math.max(y, ankleBase[k] - dt * sw * 0.08));
          const ys = [P[27].y, P[28].y, (P[23].y + P[24].y) / 2];
          ys.forEach((y, k) => base(k, y));
          jumping = ys.every((y, k) => ankleBase[k] - y > sw * (k < 2 ? 0.3 : 0.2));
        }
        now = performance.now() / 1000;
        const el = now - S.t0;
        if (el < 0) return;
        const i = Math.floor(el / ROUND), tIn = el - i * ROUND;
        if (i !== cur) {   // 새 지시
          cur = i; matchT = 0; result = null; R = roundAt(i);
          if (env.slot === 0) env.speak(trapsAny && R.says ? `Simon says, ${R.cmd.en}` : R.cmd.en, "en-US");
        }
        if (result || tIn > answer) {
          if (!result && tIn > answer) { if (mustDo()) finish("late", "시간이 지났어요"); else finish("safe", "속지 않았어요!"); }
          return;
        }
        const ok = R.cmd.jump ? jumping : !!(P && R.cmd.check(P));
        matchT = ok ? matchT + dt : Math.max(0, matchT - dt);
        const need = R.cmd.jump ? 0.05 : HOLD * env.diff.hold;
        if (mustDo() && matchT >= need) finish("good", "Good job!");
        if (!mustDo() && matchT >= (R.cmd.jump ? 0.05 : HOLD * 0.75)) finish("caught", "Simon says가 없었어요!");
      },
      draw(ctx) {
        const U = v.U, w = Math.min(z.w * 0.92, U * 1.0), h = U * 0.24, x = z.x0 + (z.w - w) / 2, y = v.H * 0.13;
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, x + 5, y + 7, w, h, h * 0.25); ctx.fill();
        const tint = result === "good" || result === "safe" ? "#d8ffe6" : result ? "#ffe0e0" : "#fff";
        ctx.fillStyle = tint; rr(ctx, x, y, w, h, h * 0.25); ctx.fill(); ctx.lineWidth = U * 0.01; ctx.strokeStyle = env.color; ctx.stroke();
        if (!R) { outlinedText(ctx, "Listen and move!", x + w / 2, y + h * 0.4, h * 0.26, "#333", "#fff", 2); outlinedText(ctx, "잘 듣고 따라 해요", x + w / 2, y + h * 0.75, h * 0.17, "#666", "#fff", 2); return; }
        const fit = (txt, size, maxW) => { ctx.font = `${Math.round(size)}px ${FONT}`; const mw = ctx.measureText(txt).width; return mw > maxW ? size * maxW / mw : size; };
        // 세 줄: Simon says(함정 난이도에서만) · 영어 지시 · 한국어 뜻
        if (trapsOn) {
          const t = R.says ? "Simon says," : " ";
          outlinedText(ctx, t, x + w / 2, y + h * 0.2, fit(t, h * 0.2, w * 0.9), "#e0306a", "#fff", 2);
        }
        const en = R.cmd.en;
        outlinedText(ctx, en, x + w / 2, y + h * (trapsOn ? 0.52 : 0.42), fit(en, h * 0.32, w * 0.92), "#1a3d7c", "#fff", 2);
        const ko = R.cmd.ko;
        outlinedText(ctx, ko, x + w / 2, y + h * 0.82, fit(ko, h * 0.17, w * 0.9), "#555", "#fff", 2);
        // 남은 시간
        const el = now - (shared ? shared.t0 : now), tIn = el - cur * ROUND, k = Math.max(0, 1 - tIn / answer);
        if (!result) { ctx.fillStyle = env.color; ctx.fillRect(x + h * 0.3, y + h - U * 0.012, (w - h * 0.6) * k, U * 0.008); }
        if (trapsOn && !result) outlinedText(ctx, "Simon says가 있을 때만 따라 해요", z.cx, y + h + U * 0.035, Math.min(U * 0.03, z.w / 22), "#fff", "#e0306a", 3);
        if (matchT > 0 && !result) {
          ctx.strokeStyle = "#2fd36b"; ctx.lineWidth = U * 0.012; ctx.beginPath();
          ctx.arc(z.cx, v.H * 0.5, U * 0.06, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, matchT / (HOLD * env.diff.hold))); ctx.stroke();
        }
        if (result) outlinedText(ctx, result === "good" || result === "safe" ? "⭕" : "❌", z.cx, v.H * 0.5, U * 0.12, "#fff", "#333", 2);
      },
      stop() { shared = null; trapsAny = false; },
      result: () => `맞힘 ${okN} · 틀림 ${failN}`,
      // 설명 시연용
      get round() { if (!shared || !R) return null; const el = now - shared.t0; return { i: cur, cmd: R.cmd, says: R.says, must: mustDo(), tIn: el - cur * ROUND, result }; },
      forceSays(i, says, cmdId) { sharedStart(true); const r = roundAt(i); r.says = says; if (cmdId) r.cmd = EN.find(c => c.id === cmdId) || r.cmd; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (!S.init) { S.init = 1; g.forceSays(0, true, "head"); g.forceSays(1, false, "up"); g.forceSays(2, true, "wide"); }
      const r = g.round;
      if (!r) { say("영어 몸 이름! 영어로 들리는 지시를 몸으로 따라 해요"); p.setPose("rest"); return; }
      if (r.i >= 3) { say("이제 직접 해 봐요!"); p.setPose("rest"); S.endAt = S.endAt || T + 1.2; if (T > S.endAt) S.end = true; return; }
      if (r.must) say(`${r.cmd.en} 는 '${r.cmd.ko}'예요. 따라 해요!`);
      else say(`Simon says가 없으면 움직이지 않아요!`);
      if (r.must && r.tIn > 0.9) { if (r.cmd.jump) { if (!S.j || T - S.j > 0.8) { p.jump(); S.j = T; } } else p.setPose(r.cmd.id); }
      else p.setPose("rest");
    },
  },
};
