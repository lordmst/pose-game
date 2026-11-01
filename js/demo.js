// 게임 설명 시연: 만화 캐릭터가 '진짜 게임'을 직접 해 보이는 방식
// 캐릭터 몸의 좌표를 선수 인식 결과처럼 게임에 넣어 주므로, 터지고 깨지는 장면이 실제 규칙 그대로 나옴
import { popup, rr, outlinedText, FONT, clamp } from "./fx.js?v=30";
import { DIFFS } from "./difficulty.js?v=30";
import { speak } from "./audio.js?v=30";

/* ---------- 캐릭터 자세 ----------
   팔: 어깨 기준 손목 위치 (바깥쪽 +, 아래쪽 +, 단위 = 팔 한 마디 길이)
   다리: 엉덩이 기준 무릎·발목 위치, drop = 몸이 내려가는 정도 */
const ARM = { up: [0.25, -2.0], wide: [2.0, 0], down: [0.35, 1.9], hips: [0.15, 1.6], heart: [-0.5, -1.7], guard: [0.45, 0.85], cheer: [0.9, -1.7],
  head: [-0.35, -0.9], shoulders: [0.15, 0.25], cross: [-1.1, 0.2], clap: [-0.62, 0.8], diag: [0.95, -1.7] };
const LEG = { stand: { drop: 0, k: [0.05, 1.3], a: [0.1, 2.6] }, squat: { drop: 0.9, k: [0.5, 0.4], a: [0.4, 1.7] }, raise: { drop: 0, k: [0.25, 0.15], a: [0.25, 1.1] }, out: { drop: 0.1, k: [0.45, 1.2], a: [0.95, 2.4] } };
const POSE = {
  rest: ["down", "down"], up: ["up", "up"], wide: ["wide", "wide"], left: ["up", "down"], right: ["down", "up"],
  hips: ["hips", "hips"], heart: ["heart", "heart"], squat: ["wide", "wide", "squat", "squat"],
  lknee: ["wide", "wide", "raise", "stand"], rknee: ["wide", "wide", "stand", "raise"],
  head: ["head", "head"], shoulders: ["shoulders", "shoulders"], crossL: ["down", "cross"], crossR: ["cross", "down"], clap: ["clap", "clap"],
  runL: ["guard", "hips", "raise", "stand"], runR: ["hips", "guard", "stand", "raise"],
  leanL: ["up", "up", "stand", "stand", -1.0], leanR: ["up", "up", "stand", "stand", 1.0],   // 다섯째 값: 윗몸 기울기
};

class Puppet {
  constructor(view) {
    this.v = view; this.cx = view.W / 2; this.tcx = this.cx; this.drop = 0; this.jumpT = 0; this.walk = 0.9;
    this.arms = [0, 1].map(() => ({ mode: "preset", preset: "down", tx: 0, ty: 0, speed: 1, w: null, e: null }));
    this.legs = ["stand", "stand"]; this.legCur = null;
    this.hands = [0, 1].map(() => ({ vis: true, x: 0, y: 0, vx: 0, vy: 0, speed: 0, bodySpeed: 0, shape: "unknown" }));
    this.lean = 0; this.leanT = 0; this.active = -1; this.present = true; this.fullBody = true; this.lowerSeen = true; this.lostT = 0; this.pts = null;
    this.update(0.016);
  }
  get u() { return Math.min(this.v.U * 0.115, this.v.H * 0.11); }
  get scale() { return this.u * 1.2; }        // 어깨너비 (게임의 손 속도 기준)
  get shoulderY() { return this.v.H * 0.44; }
  get activeHand() { return this.active >= 0 ? this.hands[this.active] : null; }
  setPose(id) { const [la, ra, ll = "stand", rl = "stand", lean = 0] = POSE[id] || POSE.rest; this.rest(0, la, 1.3); this.rest(1, ra, 1.3); this.legs = [ll, rl]; this.leanT = lean; }
  rest(k, preset = "down", speed = 1.0) { const a = this.arms[k]; a.mode = "preset"; a.preset = preset; a.speed = speed; }
  reach(k, x, y, speed = 0.9) { const a = this.arms[k]; a.mode = "reach"; a.tx = x; a.ty = y; a.speed = speed; }
  jump() { if (this.jumpT <= 0) this.jumpT = 0.45; }
  update(dt) {
    const v = this.v, u = this.u;
    const dx = this.tcx - this.cx, st = this.walk * v.U * dt;
    this.cx = clamp(this.cx + (Math.abs(dx) < st ? dx : Math.sign(dx) * st), v.W * 0.1, v.W * 0.9);
    const drop = Math.max(LEG[this.legs[0]].drop, LEG[this.legs[1]].drop);
    this.drop += (drop - this.drop) * Math.min(1, dt * 8);
    this.jumpT = Math.max(0, this.jumpT - dt);
    const jy = this.jumpT > 0 ? Math.sin((1 - this.jumpT / 0.45) * Math.PI) * u * 0.7 : 0;
    const sy = this.shoulderY + this.drop * u - jy, hy = sy + 2 * u, cx = this.cx;
    this.lean += (this.leanT - this.lean) * Math.min(1, dt * 6);
    const lx = this.lean * u;                               // 윗몸 기울기만큼 어깨·머리가 옆으로
    const S = [{ x: cx - 0.6 * u + lx, y: sy + Math.abs(this.lean) * 0.15 * u }, { x: cx + 0.6 * u + lx, y: sy + Math.abs(this.lean) * 0.15 * u }];
    const HIP = [{ x: cx - 0.45 * u, y: hy }, { x: cx + 0.45 * u, y: hy }];
    this.arms.forEach((a, k) => {
      const side = k === 0 ? -1 : 1, s = S[k];
      let tx, ty;
      if (a.mode === "reach") { tx = a.tx; ty = a.ty; } else { const o = ARM[a.preset]; tx = s.x + side * o[0] * u; ty = s.y + o[1] * u; }
      [tx, ty] = within(s, tx, ty, 1.98 * u);
      if (!a.w) a.w = { x: tx, y: ty };
      const ox = a.w.x, oy = a.w.y, mx = tx - ox, my = ty - oy, md = Math.hypot(mx, my), step = a.speed * v.U * dt;
      if (md <= step) { a.w.x = tx; a.w.y = ty; } else { a.w.x += mx / md * step; a.w.y += my / md * step; }
      [a.w.x, a.w.y] = within(s, a.w.x, a.w.y, 1.98 * u);
      a.e = ik(s, a.w, u, side, cx);
      const h = this.hands[k], ddt = Math.max(dt, 1e-3);
      h.vx = (a.w.x - ox) / ddt; h.vy = (a.w.y - oy) / ddt; h.x = a.w.x; h.y = a.w.y;
      h.speed = Math.hypot(h.vx, h.vy); h.bodySpeed = h.speed / this.scale;
    });
    // 다리 (부드럽게 바뀜)
    const target = [0, 1].map(k => { const L = LEG[this.legs[k]], side = k === 0 ? -1 : 1, hp = HIP[k];
      return { k: { x: hp.x + side * L.k[0] * u, y: hp.y + L.k[1] * u }, a: { x: hp.x + side * L.a[0] * u, y: hp.y + L.a[1] * u } }; });
    if (!this.legCur) this.legCur = target;
    const f = Math.min(1, dt * 9);
    this.legCur = this.legCur.map((c, k) => ({ k: lerpP(c.k, target[k].k, f), a: lerpP(c.a, target[k].a, f) }));
    // 선수 인식 결과와 같은 모양의 관절 목록
    const head = { x: cx + lx * 1.25, y: sy - 0.8 * u + Math.abs(this.lean) * 0.2 * u };
    const P = Array.from({ length: 33 }, () => ({ ...head, v: true }));
    P[11] = { ...S[0], v: true }; P[12] = { ...S[1], v: true };
    P[13] = { ...this.arms[0].e, v: true }; P[14] = { ...this.arms[1].e, v: true };
    P[15] = { ...this.arms[0].w, v: true }; P[16] = { ...this.arms[1].w, v: true };
    P[23] = { ...HIP[0], v: true }; P[24] = { ...HIP[1], v: true };
    P[25] = { ...this.legCur[0].k, v: true }; P[26] = { ...this.legCur[1].k, v: true };
    P[27] = { ...this.legCur[0].a, v: true }; P[28] = { ...this.legCur[1].a, v: true };
    this.pts = P; this.head = head;
  }
  draw(ctx) {
    const u = this.u, P = this.pts, line = (pts, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); };
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [h, k, a] of [[23, 25, 27], [24, 26, 28]]) line([P[h], P[k], P[a]], u * 0.42, "#3b5bdb");
    ctx.fillStyle = "#2b2b2b";
    for (const a of [27, 28]) { ctx.beginPath(); ctx.ellipse(P[a].x, P[a].y + u * 0.12, u * 0.32, u * 0.16, 0, 0, Math.PI * 2); ctx.fill(); }
    // 몸통: 엉덩이 가운데 → 어깨 가운데 (기울이면 같이 기욺)
    const shm = { x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2 }, hpm = { x: (P[23].x + P[24].x) / 2, y: (P[23].y + P[24].y) / 2 + 0.1 * u };
    const ta = Math.atan2(shm.x - hpm.x, hpm.y - shm.y), tl = Math.hypot(shm.x - hpm.x, shm.y - hpm.y);
    ctx.save(); ctx.translate(hpm.x, hpm.y + 0.15 * u); ctx.rotate(ta);
    ctx.fillStyle = "#ff8a3d"; rr(ctx, -0.75 * u, -tl - 0.3 * u, 1.5 * u, tl + 0.3 * u, 0.4 * u); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#ffd23d"; ctx.beginPath(); ctx.arc(shm.x + (hpm.x - shm.x) * 0.38, shm.y + (hpm.y - shm.y) * 0.38, 0.28 * u, 0, Math.PI * 2); ctx.fill();   // 셔츠 무늬
    for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) { line([P[s], P[e]], u * 0.36, "#ff8a3d"); line([P[e], P[w]], u * 0.28, "#ffcf9e"); }
    // 얼굴
    const hx = this.head.x, hy = this.head.y, r = 0.55 * u;
    ctx.fillStyle = "#ffcf9e"; ctx.strokeStyle = "#c98a5a"; ctx.lineWidth = u * 0.05; ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#4a2b12"; ctx.beginPath(); ctx.arc(hx, hy, r * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#222"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + s * 0.2 * u, hy + 0.02 * u, 0.065 * u, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "rgba(255,120,140,.45)"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + s * 0.33 * u, hy + 0.18 * u, 0.09 * u, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = "#7a3b1a"; ctx.lineWidth = u * 0.05; ctx.beginPath(); ctx.arc(hx, hy + 0.1 * u, 0.2 * u, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    // 손: 손 모양 그대로 표시, 고르는 손은 노란 테두리
    this.hands.forEach((h, k) => {
      if (this.active === k) { ctx.strokeStyle = "#ffd400"; ctx.lineWidth = u * 0.1; ctx.beginPath(); ctx.arc(h.x, h.y, u * 0.48, 0, Math.PI * 2); ctx.stroke(); }
      if (h.shape === "open" || h.shape === "closed") {
        ctx.font = `${Math.round(u * 0.75)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(h.shape === "open" ? "✋" : "✊", h.x, h.y);
      } else { ctx.fillStyle = "#ffcf9e"; ctx.beginPath(); ctx.arc(h.x, h.y, u * 0.2, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.restore();
  }
}
function within(s, x, y, max) { const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy); return d > max ? [s.x + dx / d * max, s.y + dy / d * max] : [x, y]; }
function lerpP(a, b, f) { return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
// 팔꿈치 위치(두 마디 팔): 몸 바깥쪽으로 굽힘
function ik(s, w, u, side, cx) {
  const dx = w.x - s.x, dy = w.y - s.y, d = clamp(Math.hypot(dx, dy), 1e-3, 1.98 * u);
  const base = Math.atan2(dy, dx), a = Math.acos(d / (2 * u));
  const c = [base + a, base - a].map(t => ({ x: s.x + Math.cos(t) * u, y: s.y + Math.sin(t) * u }));
  return (c[0].x - cx) * side >= (c[1].x - cx) * side ? c[0] : c[1];
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------- 게임별 시연 대본 ---------- */
// 정한 시각에 한 번만 실행
const once = (S, T, t, fn) => { S.done = S.done || {}; if (T >= t && !S.done[t]) { S.done[t] = 1; fn(); } };
// 풍선 게임 공용: 편 손으로 정답 → 주먹은 무시되는 장면 → 다시 정답
function balloonScript(tx) {
  return {
    dur: 24,
    run(T, g, p, S, say) {
      const bal = g.balloons.filter(b => b.alive), ok = bal.find(b => b.val === g.answer), u = p.u;
      const reachOk = b => { p.tcx = b.x - 0.7 * u; if (Math.abs(p.cx - p.tcx) < 0.3 * u) { p.active = 1; p.reach(1, b.x, b.y, 0.6); } else { p.active = -1; p.rest(1, "down"); } };
      switch (S.step) {
        case 0: say(tx.intro); p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.rest(0); p.rest(1);
          if (T > 2.6) S.step = 1; break;
        case 1: say(tx.pick); p.hands[1].shape = "open"; p.hands[0].shape = "closed"; p.rest(0, "guard");
          if (ok) reachOk(ok);
          if (g.phase === "done") { S.step = 2; S.t0 = T; } break;
        case 2: say(tx.good); p.rest(1, "cheer"); p.rest(0, "cheer");
          if (g.phase === "ask" && T - S.t0 > 1.4) { S.step = 3; S.t0 = T; } break;
        case 3: {   // 주먹 쥔 손은 풍선에 닿아도 무시되는 장면
          say("다른 손은 주먹! 주먹은 풍선에 닿아도 안 터져요"); p.active = -1; p.hands[1].shape = "open"; p.rest(1, "down");
          const wrong = bal.filter(b => b.val !== g.answer).sort((a, b) => b.y - a.y)[0];
          if (wrong) { p.tcx = wrong.x + 0.7 * u; if (Math.abs(p.cx - p.tcx) < 0.3 * u) p.reach(0, wrong.x, wrong.y, 0.6); else p.rest(0, "down"); }
          if (T - S.t0 > 3.4) { S.step = 4; S.t0 = T; } break;
        }
        case 4: say(tx.again); p.rest(0, "guard"); if (ok) reachOk(ok);
          if (g.phase === "done") { S.step = 5; S.t0 = T; } break;
        case 5: say("이제 직접 해 봐요!"); p.rest(0, "cheer"); p.rest(1, "cheer"); if (T - S.t0 > 2) S.end = true; break;
      }
    },
  };
}
const SCRIPTS = {
  math: balloonScript({ intro: "숫자 풍선! 문제의 정답이 적힌 풍선을 터뜨려요", pick: "고르는 손은 활짝 펴서 정답 풍선에 대요", good: "정답! 점수를 얻어요", again: "편 손으로 정답을 골라요!" }),
  hangul: balloonScript({ intro: "한글 풍선! 그림 낱말의 글자를 앞에서부터 순서대로 터뜨려요", pick: "고르는 손은 활짝 펴서 첫 글자 풍선에 대요", good: "맞았어요! 다음 글자도 순서대로", again: "편 손으로 다음 글자를 골라요!" }),
  english: balloonScript({ intro: "영어 풍선! 그림 낱말의 알파벳을 앞에서부터 순서대로 터뜨려요", pick: "고르는 손은 활짝 펴서 첫 글자 풍선에 대요", good: "맞았어요! 다음 글자도 순서대로", again: "편 손으로 다음 글자를 골라요!" }),
  ice: {
    dur: 18,
    run(T, g, p, S, say) {
      const u = p.u; p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1; p.walk = 0.3;   // 천천히 걸어야 옆 손이 얼음을 건드리지 않음
      if (!S.cur || S.cur.b.broken || !g.targets.some(t => t.b === S.cur.b)) {
        if (S.cur && S.cur.b.broken) S.broke = (S.broke || 0) + 1;
        if (S.broke >= 2) { say("이제 직접 해 봐요!"); p.rest(0, "cheer", 0.3); p.rest(1, "cheer", 0.3); S.endAt = S.endAt || T + 2.2; if (T > S.endAt) S.end = true; return; }
        const ts = g.targets.sort((a, b) => (a.y - b.y) || (Math.abs(a.x - p.cx) - Math.abs(b.x - p.cx)));   // 어깨 높이(윗줄) 얼음 먼저
        S.cur = ts[0]; S.ph = "back"; S.t0 = T; S.hits = 0;
        if (!S.broke) say("얼음 깨기! 주먹을 빠르게 휘둘러 얼음을 쳐요");
        else { say("세게 치면 강펀치! 두 번 친 것과 같아요"); S.strong = true; }
        if (!S.cur) return;
      }
      const t = g.targets.find(x => x.b === S.cur.b) || S.cur;
      // 얼음 왼쪽에 설 자리가 있으면 왼쪽에 서서 오른손으로, 없으면 오른쪽에 서서 왼손으로 침
      const leftStand = t.x - 2.5 * u >= p.v.W * 0.1, k = leftStand ? 1 : 0, dir = leftStand ? -1 : 1, h = p.hands[k];
      p.tcx = t.x + dir * 2.5 * u; p.rest(1 - k, "guard", 0.3);   // 쉬는 손이 얼음 범위 밖에 오도록 조금 떨어져 섬
      if (Math.abs(p.cx - p.tcx) > 0.3 * u) { p.rest(k, "guard", 0.3); S.ph = "back"; S.t0 = T; return; }   // 자리 잡을 때까지 기다림
      if (S.ph === "back") {   // 뒤로 천천히 빼기 (얼음 밖으로)
        p.reach(k, t.x + dir * t.s * 0.95, t.y + 0.4 * u, 0.6);
        if (T - S.t0 > 0.85) { S.ph = "hit"; S.t0 = T; if (!S.broke && S.hits === 1) say("세 번 치면 깨지고, 안에 든 선물이 나와요!"); }
      } else {                 // 빠르게 치기
        p.reach(k, t.x, t.y, S.strong ? 2.0 : 0.7);
        if (dist(h, t) < 0.1 * u || T - S.t0 > 0.7) { S.ph = "back"; S.t0 = T; S.hits = (S.hits || 0) + 1; }
      }
    },
  },
  star: {
    dur: 14,
    run(T, g, p, S, say) {
      const u = p.u; p.hands.forEach(h => { h.shape = "open"; }); p.active = -1;
      once(S, T, 0, () => say("별 따기! 떨어지는 별을 손으로 잡아요"));
      once(S, T, 0.3, () => g.forceSpawn("star", 0.38)); once(S, T, 1.8, () => g.forceSpawn("star", 0.64));
      once(S, T, 4.6, () => { g.forceSpawn("big", 0.5); say("반짝이는 큰 별은 두 손으로 함께 잡아요! 3점"); });
      once(S, T, 8.8, () => { g.forceSpawn("star", 0.3); g.forceSpawn("star", 0.72); say("양쪽에서 오면 양손으로!"); });
      once(S, T, 12, () => say("이제 직접 해 봐요!"));
      const stars = g.stars.filter(s => s.y > 0), big = stars.find(s => s.kind === "big");
      if (big) {   // 큰 별: 두 손을 별 양옆으로
        p.tcx = big.x; p.reach(0, big.x - 0.25 * u, big.y, 1.1); p.reach(1, big.x + 0.25 * u, big.y, 1.1); return;
      }
      if (!stars.length) { p.rest(0); p.rest(1); return; }
      // 별마다 가까운 손
      const L = stars.filter(s => s.x < p.cx).sort((a, b) => b.y - a.y)[0], R = stars.filter(s => s.x >= p.cx).sort((a, b) => b.y - a.y)[0];
      if (!L !== !R) { const tg = L || R; p.tcx = tg.x + (L ? 0.9 : -0.9) * u; }
      else p.tcx = (L.x + R.x) / 2;
      if (L) p.reach(0, L.x, L.y, 1.1); else p.rest(0, "guard");
      if (R) p.reach(1, R.x, R.y, 1.1); else p.rest(1, "guard");
    },
  },
  copy: {
    dur: 13,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1;
      if (T < 3.8) say("따라쟁이! 카드 그림과 같은 자세를 해요");
      else if (T < 8) say("잠깐 멈추면 성공! 빨리 하면 2점");
      else if (T < 11.2) say("다음 자세도 따라 해요");
      else say("이제 직접 해 봐요!");
      const id = g.current;
      if (id !== S.id) { S.id = id; S.t0 = T; }
      p.setPose(T - S.t0 > 0.9 ? id : "rest");
    },
  },
  fruit: {
    dur: 14,
    run(T, g, p, S, say) {
      const u = p.u; p.hands.forEach(h => { h.shape = "open"; }); p.active = -1;
      once(S, T, 0, () => say("과일 자르기! 손을 빠르게 휘둘러 과일을 잘라요"));
      once(S, T, 0.2, () => g.forceLaunch("fruit", 0.42)); once(S, T, 1.8, () => g.forceLaunch("fruit", 0.6));
      once(S, T, 4.4, () => { say("나란히 오면 한 번에 휘둘러 둘 다! 보너스예요"); g.forceLaunch("fruit", 0.47); g.forceLaunch("fruit", 0.53); });
      once(S, T, 8.4, () => { say("폭탄은 자르면 안 돼요!"); g.forceLaunch("bomb", 0.5); });
      once(S, T, 11.8, () => say("이제 직접 해 봐요!"));
      const bomb = g.items.find(i => i.kind === "bomb" && i.y < p.v.H);
      if (bomb && Math.abs(bomb.x - p.cx) < 4 * u) {   // 폭탄이 가까우면 손 내리고 비킴
        p.tcx = bomb.x + (p.cx <= bomb.x ? -4.5 * u : 4.5 * u); p.rest(0, "down", 0.4); p.rest(1, "down", 0.4); return;
      }
      const fr = g.items.filter(i => i.kind === "fruit" && i.y > p.v.H * 0.15 && i.y < p.v.H * 0.75).sort((a, b) => Math.abs(a.x - p.cx) - Math.abs(b.x - p.cx))[0];
      if (!fr) { p.rest(0, "guard", 0.5); p.rest(1, "guard", 0.5); return; }
      const k = fr.x < p.cx ? 0 : 1, h = p.hands[k];
      p.tcx = fr.x + (k ? -0.9 : 0.9) * u;
      const dx = fr.x - h.x, dy = fr.y - h.y, d = Math.hypot(dx, dy) || 1;
      p.reach(k, fr.x + dx / d * u, fr.y + dy / d * u, 1.6);           // 과일을 지나가도록 휘두름
      p.rest(1 - k, "guard", 0.5);
    },
  },
  mole: {
    dur: 14,
    run(T, g, p, S, say) {
      const u = p.u, W = p.v.W; p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1; p.walk = 0.3; p.tcx = W / 2;
      if (S.A == null) {   // 캐릭터 손이 닿는 윗줄 가운데 구멍 두 개
        const idx = [...Array(g.holeCount).keys()].filter(i => g.holePos(i).y < p.v.H * 0.6).sort((a, b) => Math.abs(g.holePos(a).x - W / 2) - Math.abs(g.holePos(b).x - W / 2));
        S.A = idx[0]; S.B = idx[1];
      }
      once(S, T, 0, () => say("두더지 잡기! 튀어나온 두더지를 주먹으로 콩!"));
      once(S, T, 0.6, () => g.forcePop(S.A)); once(S, T, 3.0, () => g.forcePop(S.B));
      once(S, T, 5.4, () => { g.forcePop(S.A, "helmet"); say("헬멧 쓴 두더지는 두 번 콩! 2점"); });
      once(S, T, 8.2, () => { g.forcePop(S.B, "rabbit"); say("토끼는 치면 안 돼요!"); });
      once(S, T, 11.6, () => say("이제 직접 해 봐요!"));
      const t = g.targets.filter(x => x.kind !== "rabbit" && Math.abs(x.x - p.cx) < 2.6 * u).sort((a, b) => Math.abs(a.x - p.cx) - Math.abs(b.x - p.cx))[0];
      if (!t) { p.rest(0, "guard", 0.3); p.rest(1, "guard", 0.3); S.ph = "back"; S.t0 = T; return; }
      const k = t.x < p.cx ? 0 : 1, h = p.hands[k];
      p.rest(1 - k, "guard", 0.3);
      if (S.ph !== "hit") {          // 두더지 위로 천천히 손 올리기
        p.reach(k, t.x, t.y - t.r * 2.4, 0.45);
        if (T - S.t0 > 0.55) { S.ph = "hit"; S.t0 = T; }
      } else {                       // 아래로 콩!
        p.reach(k, t.x, t.y + t.r * 0.2, 0.9);
        if (dist(h, t) < t.r * 0.4 || T - S.t0 > 0.5) { S.ph = "back"; S.t0 = T; }
      }
    },
  },
  wall: {
    dur: 20,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = g.holeX ?? p.v.W / 2; p.walk = 1.2;
      const i = g.index, id = g.current, k = g.progressK;
      if (i <= 1) { if (k >= 0.45) S.c1 = true; say(S.c1 ? "구멍 모양대로 자세를 잡으면 통과!" : "벽 통과! 다가오는 벽의 구멍 모양을 잘 봐요"); }
      else if (i === 2) { say("자세가 다르면 쿵! 부딪혀요"); once(S, T, 0, () => g.forceOff(0.26)); }
      else if (i === 3) say("구멍이 옆에 있으면 그 자리로 가서 모양을 맞춰요");
      else { say("이제 직접 해 봐요!"); S.endAt = S.endAt || T + 1.2; if (T > S.endAt) S.end = true; }
      p.setPose(i !== 2 && id && k > 0.4 ? id : "rest");                 // 두 번째 벽은 일부러 못 맞춤
    },
  },
  rhythm: {
    dur: 17,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4.4) say("리듬 박자! 화살표가 아래에서 올라와요");
      else if (T < 9) say("↖ 왼손, ↗ 오른손은 옆으로 쭉 뻗어요");
      else if (T < 14) say("↙ 왼발, ↘ 오른발은 다리를 들어요");
      else say("이제 직접 해 봐요!");
      // 판마다 지금 밟아야 하는지: 화살표가 곧 닿거나 홀드 중이면
      const want = [false, false, false, false], now = g.now;
      for (const n of g.notes) if (n.holding || (!n.done && n.time - now < 0.12 && n.time - now > -0.15)) want[n.lane] = true;
      p.rest(0, want[1] ? "wide" : "down", 3); p.rest(1, want[2] ? "wide" : "down", 3);
      p.legs = [want[0] ? "raise" : "stand", want[3] ? "raise" : "stand"];
    },
  },
  conductor: {
    dur: 26,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4.5) say("지휘자! 클래식에 맞춰 화살표가 내려와요");
      else if (T < 9.5) say("화살표가 가로선 칸에 겹치는 순간, 그 방향으로 손을 휘둘러요");
      else if (T < 24) say("아래, 안쪽, 바깥쪽, 위! 박자에 맞춰 지휘해요");
      else say("이제 직접 해 봐요!");
      const u = p.u, now = g.now, e = g.event;
      if (e) {   // 왼손 동작: 올리기는 머리 위로, 터치는 동그라미로
        if (e.type === "raise") p.rest(0, "up", 2.5); else if (e.pos) p.reach(0, e.pos.x, e.pos.y, 2.5);
        say(e.type === "raise" ? "✋가 나오면 왼손을 머리 위로 쭉! 크레셴도" : "⊙가 나오면 왼손으로 터치! 악기를 불러요");
      }
      [0, 1].forEach(k => {
        if (k === 0 && e) return;
        const sh = p.pts[11 + k], side = k ? 1 : -1, cx = sh.x + side * 0.9 * u, cy = sh.y + 0.5 * u, A = 0.85 * u;
        const n = g.notes.filter(n => n.hands.includes(k) && !n.parts[k] && n.time - now > -0.1).sort((a, b) => a.time - b.time)[0];
        if (!n) return;
        const d = g.dir(n.key, k), t = n.time - now;
        if (t > 0.12) p.reach(k, cx - d[0] * A, cy - d[1] * A, 2.2);       // 휘두르기 전에 반대쪽으로 준비
        else p.reach(k, cx + d[0] * A, cy + d[1] * A, 4);                   // 박자에 맞춰 휘두르기
      });
    },
  },
  goalie: {
    dur: 15,
    run(T, g, p, S, say) {
      const u = p.u, cx = p.v.W / 2, sy = p.shoulderY; p.hands.forEach(h => { h.shape = "open"; }); p.active = -1; p.walk = 1.2;
      once(S, T, 0, () => say("골키퍼! 날아오는 공을 손으로 막아요"));
      once(S, T, 0.4, () => g.forceShot(cx - 2.0 * u, sy - 0.6 * u)); once(S, T, 3.0, () => g.forceShot(cx + 2.1 * u, sy + 0.9 * u));
      once(S, T, 4.6, () => say("동그라미가 공이 올 자리예요. 미리 손을 대요!"));
      once(S, T, 5.8, () => g.forceShot(cx - 1.3 * u, sy - 1.6 * u));
      once(S, T, 8.0, () => { g.forceShot(cx + 4.2 * u, sy + 0.3 * u, true); say("화살표가 나오면 옆으로 가서 막아요! 2점"); });
      once(S, T, 12.4, () => say("이제 직접 해 봐요!"));
      const s = g.shots.filter(x => x.k > 0.15).sort((a, b) => b.k - a.k)[0];
      if (!s) { p.tcx = cx; p.rest(0, "guard", 0.6); p.rest(1, "guard", 0.6); return; }
      const k = s.dx < p.cx ? 0 : 1;
      if (s.far) p.tcx = s.dx + (k ? -1.5 : 1.5) * u;          // 먼 공은 옆걸음
      if (s.k > 0.25) p.reach(k, s.dx, s.dy, 1.0); p.rest(1 - k, "guard", 0.6);
    },
  },
  run: {
    dur: 12,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4) say("달리기 경주! 제자리에서 무릎을 번갈아 높이 들어요");
      else if (T < 8) say("빨리 들수록 빨리 달려요. 토끼보다 먼저 결승선에!");
      else say("이제 직접 해 봐요!");
      if (T < 1 || T > 10.6) { p.setPose("rest"); return; }
      const ph = Math.floor((T - 1) / 0.32);
      if (ph !== S.ph) { S.ph = ph; p.setPose(ph % 2 ? "runR" : "runL"); }
    },
  },
  simon: {
    dur: 15,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (!S.init) { S.init = 1; g.forceSays(0, true, "up"); g.forceSays(1, false, "left"); g.forceSays(2, true, "lknee"); }
      const r = g.round;
      if (!r) { say("가라사대! '가라사대'가 붙은 말만 따라 해요"); p.setPose("rest"); return; }
      if (r.i >= 3) { say("이제 직접 해 봐요!"); p.setPose("rest"); S.endAt = S.endAt || T + 1.2; if (T > S.endAt) S.end = true; return; }
      if (r.says) say(`"가라사대"가 붙으면 따라 해요: ${r.cmd.text}`);
      else say(`"가라사대"가 없으면 움직이지 않아요!`);
      p.setPose(r.says && r.tIn > 0.9 ? r.cmd.id : "rest");
    },
  },
  clock: {
    dur: 16,
    run(T, g, p, S, say) {
      const u = p.u; p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      const { H, M, h, m } = g.target, key = `${h}:${m}`;
      if (key !== S.key) { if (S.key) S.solved = (S.solved || 0) + 1; S.key = key; S.t0 = T; }
      if (S.solved >= 2) { say("이제 직접 해 봐요!"); p.rest(0, "cheer"); p.rest(1, "cheer"); S.endAt = S.endAt || T + 1.8; if (T > S.endAt) S.end = true; return; }
      if (T < 3.4) say("시계 만들기! 몸이 시계의 가운데, 두 팔이 시곗바늘이에요");
      else say(`${h}시${m ? " " + m + "분" : ""}: 짧은바늘은 ${m === 30 ? h + "와 " + (h % 12 + 1) + " 사이" : h}, 긴바늘은 ${m === 0 ? 12 : m / 5}`);
      if (T < 3.4 || T - S.t0 < 1.2) { p.rest(0, "down", 0.8); p.rest(1, "down", 0.8); return; }
      const dir = a => ({ x: Math.sin(a * Math.PI / 180), y: -Math.cos(a * Math.PI / 180) });
      const [aL, aR] = Math.sin(H * Math.PI / 180) <= Math.sin(M * Math.PI / 180) ? [H, M] : [M, H];   // 왼쪽을 가리키는 바늘은 왼팔로
      [[0, aL], [1, aR]].forEach(([k, a]) => { const s = p.pts[11 + k], d = dir(a); p.reach(k, s.x + d.x * 1.9 * u, s.y + d.y * 1.9 * u, 0.7); });
    },
  },
};

export function startDemo(id, game, view) {
  const p = new Puppet(view), zone = { x0: 0, x1: view.W, w: view.W, cx: view.W / 2 };
  const me = { combo: 0 }, stats = { ok: 0, miss: 0, pen: 0 };
  const env = {
    slot: 0, player: me, tracker: p, zone, view, mode: 1, level: "add10", song: game.demoSong || "london", diff: DIFFS.normal, color: "#ff8a3d", name: "도우미",
    progress: () => 0.1, fever: () => false, speak: () => {},
    award: (base, x, y) => { me.combo++; stats.ok++; popup(x, y, `+${base * DIFFS.normal.points}`, { size: view.U * 0.065, color: "#fff", stroke: "#ff8a3d" }); },
    miss: (x, y, label) => { me.combo = 0; stats.miss++; if (label) popup(x, y, label, { size: view.U * 0.04, color: "#eee", stroke: "#555" }); },
    penalty: (n, x, y, label) => { me.combo = 0; stats.pen++; popup(x, y, `${label} -${n * DIFFS.normal.points}`, { size: view.U * 0.06, color: "#fff", stroke: "#d02020" }); },
    // 3D 스포츠의 카메라 작은 화면 자리에 도우미 캐릭터를 줄여서 그림
    pip: (c, x, y, w, h) => {
      const s = h / view.H, P = p.pts, cx = P ? (P[11].x + P[12].x) / 2 : view.W / 2;
      c.save(); c.beginPath(); c.roundRect(x, y, w, h, view.U * 0.02); c.clip();
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#5b6f80"); g.addColorStop(1, "#2b3540"); c.fillStyle = g; c.fillRect(x, y, w, h);
      c.translate(x + w / 2, y); c.scale(s, s); c.translate(-cx, 0); p.draw(c);
      c.restore(); c.lineWidth = view.U * 0.006; c.strokeStyle = "#fff"; c.beginPath(); c.roundRect(x, y, w, h, view.U * 0.02); c.stroke();
    },
  };
  const inst = game.create(env), sc = SCRIPTS[id] || game.demo, S = { step: 0 };   // 시연 대본: 여기 SCRIPTS 또는 게임 파일 안의 demo
  let T = 0, caption = "";
  const say = text => { if (text !== caption) { caption = text; speak(text); } };
  return {
    get caption() { return caption; },
    get stats() { return stats; },     // 점검용
    get time() { return T; },
    get inst() { return inst; }, get puppet() { return p; },
    stop() { if (inst.stop) inst.stop(); },
    get progress() { return Math.min(1, T / sc.dur); },
    get done() { return S.end || T >= sc.dur; },
    update(dt) {
      T += dt;
      zone.x1 = zone.w = view.W; zone.cx = view.W / 2;
      sc.run(T, inst, p, S, say, once);
      p.update(dt);
      inst.update(dt);
    },
    draw(ctx) {
      const { W, H } = view;
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#bfe3ff"); g.addColorStop(0.75, "#fff3d6"); g.addColorStop(1, "#ffe2a8");
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.fillStyle = "#c9e8a6"; ctx.fillRect(-20, H * 0.965, W + 40, H);
      // 리듬·지휘자·탈것 게임은 게임 화면을 캐릭터 위에 (판정 글자·탈것이 가려지지 않게), 나머지는 캐릭터를 위에
      if (game.scene3d) inst.draw(ctx);    // 3D 스포츠: 캐릭터는 구석 작은 화면(pip)에만
      else if (["rhythm", "conductor", "plane", "skate", "jetski"].includes(id)) { p.draw(ctx); inst.draw(ctx); }
      else { inst.draw(ctx); p.draw(ctx); }
    },
  };
}
