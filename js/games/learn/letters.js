// 몸으로 글자: 화면에 나온 글자(한글 자모·영어 알파벳) 모양을 두 팔로 만들어 잠깐 버티면 성공
// 화면은 거울이라 내 왼팔이 화면 왼쪽에 보임 → 글자 모양도 화면에 보이는 그대로 맞추면 됨
// 몸 위에 '가야 할 팔 방향'을 반투명 선으로 그려 줌 (맞으면 초록). 2인은 같은 글자를 같은 때에
import { burst, popup, rr, outlinedText, FONT } from "../../fx.js?v=54";
import { sfx } from "../../audio.js?v=54";

const HOLD = 0.6;       // 모양을 이만큼(초) 유지하면 성공 (난이도 hold 배수)
const ANSWER = 6.5;     // 한 글자 제한 시간(초, 난이도 poseTime 배수)
const SHOW = 1.3;       // 성공·시간 끝 뒤 결과 보여 주는 시간(초)
const TOL = 32;         // 팔 방향 허용 오차(도, 난이도 reach 배수)

// 팔 모양: 방향은 화면 기준 각도(0 = 오른쪽, 90 = 아래, 180 = 왼쪽, -90 = 위). L = 화면 왼쪽 팔(내 왼팔), R = 화면 오른쪽 팔(내 오른팔)
const S = d => ({ t: "dir", d });                 // 쭉 편 팔, 이 방향
const DOWN = { t: "down" };                       // 내린 팔
const BEND = (u, f) => ({ t: "bend", u, f });     // 위팔 방향 u, 아래팔 방향 f (팔꿈치 꺾기)
const FREE = { t: "free" };                       // 따로 봄 (ㅇ·O)
// lv: 0 쉬움부터, 1 보통부터. say: 읽어 줄 말, tip: 만드는 법, word: 그 글자로 시작하는 낱말
export const LETTERS = [
  { id: "i_ko", ch: "ㅣ", lv: 0, say: "이", L: S(-90), R: S(-90), tip: "두 팔을 머리 위로 쭉!", word: "이: 이빨" },
  { id: "T", ch: "T", lv: 0, say: "영어 티", L: S(180), R: S(0), tip: "두 팔을 옆으로 쭉!", word: "T: Tiger 호랑이" },
  { id: "Y", ch: "Y", lv: 0, say: "영어 와이", L: S(-135), R: S(-45), tip: "두 팔을 비스듬히 위로!", word: "Y: Yellow 노랑" },
  { id: "L", ch: "L", lv: 0, say: "영어 엘", L: S(-90), R: S(0), tip: "왼팔은 위로, 오른팔은 옆으로!", word: "L: Lion 사자" },
  { id: "o_ko", ch: "ㅇ", lv: 0, say: "이응", L: FREE, R: FREE, ring: true, tip: "두 손을 머리 위에서 동그랗게!", word: "ㅇ: 오리" },
  { id: "s_ko", ch: "ㅅ", lv: 1, say: "시옷", L: S(135), R: S(45), tip: "두 팔을 비스듬히 아래로, 지붕처럼!", word: "ㅅ: 사과" },
  { id: "a_ko", ch: "ㅏ", lv: 1, say: "아", L: DOWN, R: S(0), tip: "오른팔만 옆으로 쭉!", word: "ㅏ: 아기" },
  { id: "eo_ko", ch: "ㅓ", lv: 1, say: "어", L: S(180), R: DOWN, tip: "왼팔만 옆으로 쭉!", word: "ㅓ: 어항" },
  { id: "u_ko", ch: "ㅜ", lv: 1, say: "우", L: S(180), R: S(0), tip: "두 팔을 옆으로 쭉! 영어 T와 닮았어요", word: "ㅜ: 우유" },
  { id: "n_ko", ch: "ㄴ", lv: 1, say: "니은", L: S(-90), R: S(0), tip: "왼팔은 위로, 오른팔은 옆으로! 영어 L과 닮았어요", word: "ㄴ: 나비" },
  { id: "g_ko", ch: "ㄱ", lv: 1, say: "기역", L: DOWN, R: BEND(0, 90), tip: "오른팔을 옆으로 뻗고 손은 아래로 툭!", word: "ㄱ: 기차" },
  { id: "O", ch: "O", lv: 1, say: "영어 오", L: FREE, R: FREE, ring: true, tip: "두 손을 머리 위에서 동그랗게!", word: "O: Orange 오렌지" },
  { id: "I", ch: "I", lv: 1, say: "영어 아이", L: S(-90), R: S(-90), tip: "두 팔을 머리 위로 쭉!", word: "I: Ice cream 아이스크림" },
];
const LV = { easy: 0, normal: 1, hard: 2 };

const deg = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const adiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const elbowAng = (s, e, w) => { const v1x = s.x - e.x, v1y = s.y - e.y, v2x = w.x - e.x, v2y = w.y - e.y; const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1; return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / m))) * 180 / Math.PI; };
const ARM_IDX = [[11, 13, 15], [12, 14, 16]];

// 팔 하나가 모양에 맞는지 (tol: 허용 각도)
function armOK(spec, P, k, tol) {
  const [si, ei, wi] = ARM_IDX[k], s = P[si], e = P[ei], w = P[wi];
  if (!s.v || !e.v || !w.v) return false;
  if (spec.t === "free") return true;
  if (spec.t === "down") { const a = deg(s, w); return a > 45 && a < 135 && w.y > s.y; }
  if (spec.t === "dir") return adiff(deg(s, w), spec.d) <= tol && elbowAng(s, e, w) >= 165 - tol;
  if (spec.t === "bend") return adiff(deg(s, e), spec.u) <= tol * 1.1 && adiff(deg(e, w), spec.f) <= tol * 1.3;
  return false;
}
// 글자 전체가 맞는지 (팔별 결과도 함께)
function check(L, P, tol, reach) {
  if (!P || !P[11].v || !P[12].v) return { ok: false, arms: [false, false] };
  const arms = [armOK(L.L, P, 0, tol), armOK(L.R, P, 1, tol)];
  let ok = arms[0] && arms[1];
  if (L.ring) {   // ㅇ·O: 두 손이 머리 위에서 가까이, 팔꿈치는 굽힘
    const sw = dist(P[11], P[12]) || 1, top = P[0].v ? P[0].y : Math.min(P[11].y, P[12].y) - sw * 0.6;
    const up = P[15].v && P[16].v && P[15].y < top && P[16].y < top;
    const close = up && dist(P[15], P[16]) < sw * 1.0 * reach;
    const bent = up && elbowAng(P[11], P[13], P[15]) < 168 && elbowAng(P[12], P[14], P[16]) < 168;
    arms[0] = arms[1] = !!(up && bent);
    ok = !!(up && close && bent);
  }
  return { ok, arms };
}

// 2인이 같은 글자를 같은 때에: 함께 쓰는 진행 상태
let shared = null;
const now = () => performance.now() / 1000;
function getShared() {
  if (!shared) shared = { idx: -1, start: now() + 0.8, endAt: null, slots: {}, letter: null, last: null };
  return shared;
}
function advance(Sh) {
  const lv = Math.min(...Object.values(Sh.slots).map(s => s.lv));
  const pool = LETTERS.filter(l => l.lv <= lv && l.id !== (Sh.letter && Sh.letter.id) && !(Sh.letter && l.ch === Sh.letter.ch));
  Sh.letter = pool[Math.floor(Math.random() * pool.length)];
  Sh.idx++; Sh.start = now(); Sh.endAt = null;
  for (const s of Object.values(Sh.slots)) { s.done = false; s.result = null; }
}

export default {
  id: "letters", title: "몸으로 글자", icon: "🔠", sec: 60, cursor: "", cat: "learn", bg: "#a0c4ff", desc: "팔로 글자 모양 만들기",
  how: "화면에 나온 한글·영어 글자 모양을 두 팔로 만들어 잠깐 버텨요. 몸 위에 그려진 선을 따라 팔을 뻗으면 돼요",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const Sh = getShared();
    const me = Sh.slots[env.slot] = { lv: LV[D.id] ?? 1, limit: ANSWER * D.poseTime, done: false, result: null };
    const tol = TOL * D.reach, need = HOLD * D.hold;
    let myIdx = -1, hold = 0, okCount = 0, missCount = 0, arms = [false, false], matched = false, flash = 0;
    const L = () => Sh.letter;

    function finish(good) {
      me.done = true; me.result = good ? "good" : "late";
      const x = z.cx, y = v.H * 0.36;
      if (good) {
        okCount++; const fast = now() - Sh.start < 2.5 * D.poseTime;
        env.award(fast ? 2 : 1, x, y - v.U * 0.08); sfx.catch(env.player.combo);
        popup(x, y, `${L().ch} 완성!`, { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.2 });
        burst(x, y, { n: 26, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 0.9, gravity: v.U * 1.2, size: v.U * 0.016 });
        flash = 1;
      } else { missCount++; env.miss(x, y, "시간이 지났어요"); }
    }
    // 카드: 글자 + 막대 사람 그림 (1P·2P의 1P는 왼쪽, 2P는 오른쪽 가장자리)
    const card = () => {
      const w = Math.min(z.w * 0.34, v.U * 0.3), h = w * 1.5;
      const x = env.slot === 1 ? z.x1 - w - v.U * 0.03 : z.x0 + v.U * 0.03;
      return { x, y: Math.max(v.H * 0.2, v.H * 0.56 - h / 2), w, h };
    };
    // 막대 사람 그림 (상자 안 좌표). 팔은 글자 모양대로
    function figure(ctx, L, x, y, w, h) {
      const u = w * 0.17, cx = x + w / 2, sy = y + h * 0.36, hy = sy + 1.9 * u, sh = [{ x: cx - 0.6 * u, y: sy }, { x: cx + 0.6 * u, y: sy }];
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#2b2b2b"; ctx.lineWidth = u * 0.42;
      const line = pts => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); };
      line([{ x: cx, y: sy - 0.3 * u }, { x: cx, y: hy }]);
      line([sh[0], sh[1]]);
      line([{ x: cx - 0.5 * u, y: hy + 1.6 * u }, { x: cx, y: hy }, { x: cx + 0.5 * u, y: hy + 1.6 * u }]);
      ctx.fillStyle = "#ffd27f"; ctx.lineWidth = u * 0.25;
      ctx.beginPath(); ctx.arc(cx, sy - 0.75 * u, 0.5 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // 머리 먼저, 팔은 그 위에
      ctx.strokeStyle = "#e0306a"; ctx.lineWidth = u * 0.42;
      [L.L, L.R].forEach((sp, k) => line(armPts(sp, sh[k], k, u * 0.75, L.ring, cx, sy)));
      ctx.restore();
    }
    // 팔 모양의 점들 (어깨 → 팔꿈치 → 손). seg: 팔 한 마디 길이
    function armPts(sp, s, k, seg, ring, cx, sy) {
      const side = k ? 1 : -1, at = (p, d, l) => ({ x: p.x + Math.cos(d * Math.PI / 180) * l, y: p.y + Math.sin(d * Math.PI / 180) * l });
      if (ring) { const e = { x: s.x + side * seg * 0.9, y: s.y - seg * 0.75 }; return [s, e, { x: cx + side * seg * 0.15, y: sy - seg * 1.75 }]; }
      if (sp.t === "dir") { const e = at(s, sp.d, seg); return [s, e, at(e, sp.d, seg)]; }
      if (sp.t === "bend") { const e = at(s, sp.u, seg); return [s, e, at(e, sp.f, seg)]; }
      const e = at(s, 90 - side * 12, seg); return [s, e, at(e, 90 - side * 6, seg)];
    }
    return {
      update(dt) {
        flash = Math.max(0, flash - dt * 2);
        const t = now();
        if (t < Sh.start && Sh.idx < 0) return;
        if (Sh.idx < 0) advance(Sh);
        // 모두 끝났으면 결과를 잠깐 보여 주고 다음 글자
        const all = Object.values(Sh.slots).every(s => s.done);
        if (all && Sh.endAt == null) Sh.endAt = t;
        if (Sh.endAt != null && t - Sh.endAt > SHOW) advance(Sh);
        if (Sh.idx !== myIdx) {
          myIdx = Sh.idx; hold = 0;
          if (env.slot === 0) env.speak(`${L().say}! ${L().tip}`, "ko-KR");
        }
        if (me.done) return;
        const r = check(L(), env.tracker.pts, tol, D.reach);
        arms = r.arms; matched = r.ok;
        hold = matched ? hold + dt : Math.max(0, hold - dt * 1.5);
        if (hold >= need) finish(true);
        else if (t - Sh.start > me.limit) finish(false);
      },
      draw(ctx) {
        const Lt = L(), U = v.U;
        if (!Lt) { outlinedText(ctx, "글자 모양을 몸으로 만들어요!", z.cx, v.H * 0.2, Math.min(U * 0.05, z.w / 14), "#fff", env.color, 4); return; }
        const t = now(), P = env.tracker.pts;
        // 위쪽: 큰 글자 + 만드는 법
        const fs = Math.min(U * 0.05, z.w / 15);
        outlinedText(ctx, me.done ? (me.result === "good" ? `${Lt.ch} 완성! ${Lt.word}` : `${Lt.ch}: ${Lt.word}`) : `${Lt.ch} 만들기 · ${Lt.tip}`, z.cx, v.H * 0.17, fs, "#fff", me.result === "good" ? "#2fb65a" : env.color, 4);
        // 몸 위에 가야 할 팔 방향 (반투명, 맞으면 초록)
        if (P && P[11].v && P[12].v && !me.done) {
          const seg = Math.max(dist(P[11], P[13] || P[11]), dist(P[11], P[12]) * 0.75) * 1.0;
          const cx = (P[11].x + P[12].x) / 2, sy = (P[11].y + P[12].y) / 2;
          ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
          [Lt.L, Lt.R].forEach((sp, k) => {
            const pts = armPts(sp, P[11 + k], k, seg, Lt.ring, cx, sy - seg * 0.25);
            ctx.strokeStyle = arms[k] ? "rgba(55,214,122,.55)" : "rgba(255,225,77,.5)"; ctx.lineWidth = U * 0.045;
            ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
          });
          ctx.restore();
        }
        // 카드
        const c = card(), r = U * 0.03;
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, c.x + 6, c.y + 8, c.w, c.h, r); ctx.fill();
        ctx.fillStyle = flash > 0 ? "#fff6c8" : "#fff"; rr(ctx, c.x, c.y, c.w, c.h, r); ctx.fill();
        ctx.lineWidth = U * 0.012; ctx.strokeStyle = matched || me.result === "good" ? "#2fd36b" : env.color; ctx.stroke();
        ctx.font = `${Math.round(c.w * 0.5)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#e0306a";
        ctx.fillText(Lt.ch, c.x + c.w / 2, c.y + c.h * 0.21);
        figure(ctx, Lt, c.x, c.y + c.h * 0.3, c.w, c.h * 0.7);
        // 남은 시간 (카드 위 가는 막대)
        if (!me.done) {
          const k = Math.max(0, 1 - (t - Sh.start) / me.limit);
          ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.fillRect(c.x + r, c.y + U * 0.008, c.w - r * 2, U * 0.01);
          ctx.fillStyle = env.color; ctx.fillRect(c.x + r, c.y + U * 0.008, (c.w - r * 2) * k, U * 0.01);
        }
        // 버티기 게이지 (몸 가운데 원)
        if (hold > 0 && !me.done) {
          const hx = P && P[11].v ? (P[11].x + P[12].x) / 2 : z.cx, hy = P && P[11].v ? (P[11].y + P[12].y) / 2 + U * 0.12 : v.H * 0.5;
          ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = U * 0.014; ctx.beginPath(); ctx.arc(hx, hy, U * 0.06, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = "#2fd36b"; ctx.beginPath(); ctx.arc(hx, hy, U * 0.06, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, hold / need)); ctx.stroke();
        }
        if (me.done) outlinedText(ctx, me.result === "good" ? "⭕" : "❌", z.cx, v.H * 0.45, U * 0.1, "#fff", "#333", 2);
      },
      stop() { shared = null; },
      result: () => `만든 글자 ${okCount} · 놓친 글자 ${missCount}`,
      // 설명 시연용
      get letter() { return Sh.letter; },
      get done() { return me.done; },
      get matched() { return matched; },
    };
  },
  demo: {
    dur: 22,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4) say("몸으로 글자! 나온 글자 모양을 두 팔로 만들어요");
      else if (T < 9) say("몸 위의 노란 선을 따라 팔을 뻗고 잠깐 버티면 성공");
      else if (T < 15) say("한글 자음·모음과 영어 알파벳이 나와요");
      else if (T > 19) say("이제 직접 해 봐요!");
      const L = g.letter, P = p.pts, u = p.u;
      if (!L || !P || g.done) { p.rest(0, "down", 1.2); p.rest(1, "down", 1.2); return; }
      if (T < 1.5) return;
      const cx = (P[11].x + P[12].x) / 2, sy = P[11].y;
      [L.L, L.R].forEach((sp, k) => {
        const s = P[11 + k], side = k ? 1 : -1, at = d => ({ x: s.x + Math.cos(d * Math.PI / 180) * 1.95 * u, y: s.y + Math.sin(d * Math.PI / 180) * 1.95 * u });
        let tgt;
        if (L.ring) tgt = { x: cx + side * 0.18 * u, y: sy - 1.55 * u };
        else if (sp.t === "dir") tgt = at(sp.d);
        else if (sp.t === "bend") tgt = { x: s.x + side * 1.0 * u, y: s.y + 1.0 * u };
        else { p.rest(k, "down", 1.3); return; }
        p.reach(k, tgt.x, tgt.y, 1.4);
      });
    },
  },
};
