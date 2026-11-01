// 게임 설명 시연: 만화 캐릭터가 '진짜 게임'을 직접 해 보이는 방식
// 캐릭터 몸의 좌표를 선수 인식 결과처럼 게임에 넣어 주므로, 터지고 깨지는 장면이 실제 규칙 그대로 나옴
import { popup, rr, outlinedText, FONT, clamp } from "./fx.js?v=14";
import { DIFFS } from "./difficulty.js?v=14";
import { speak } from "./audio.js?v=14";

/* ---------- 캐릭터 자세 ----------
   팔: 어깨 기준 손목 위치 (바깥쪽 +, 아래쪽 +, 단위 = 팔 한 마디 길이)
   다리: 엉덩이 기준 무릎·발목 위치, drop = 몸이 내려가는 정도 */
const ARM = { up: [0.25, -2.0], wide: [2.0, 0], down: [0.35, 1.9], hips: [0.15, 1.6], heart: [-0.5, -1.7], guard: [0.45, 0.85], cheer: [0.9, -1.7] };
const LEG = { stand: { drop: 0, k: [0.05, 1.3], a: [0.1, 2.6] }, squat: { drop: 0.9, k: [0.5, 0.4], a: [0.4, 1.7] }, raise: { drop: 0, k: [0.25, 0.15], a: [0.25, 1.1] } };
const POSE = {
  rest: ["down", "down"], up: ["up", "up"], wide: ["wide", "wide"], left: ["up", "down"], right: ["down", "up"],
  hips: ["hips", "hips"], heart: ["heart", "heart"], squat: ["wide", "wide", "squat", "squat"],
  lknee: ["wide", "wide", "raise", "stand"], rknee: ["wide", "wide", "stand", "raise"],
};

class Puppet {
  constructor(view) {
    this.v = view; this.cx = view.W / 2; this.tcx = this.cx; this.drop = 0; this.jumpT = 0; this.walk = 0.9;
    this.arms = [0, 1].map(() => ({ mode: "preset", preset: "down", tx: 0, ty: 0, speed: 1, w: null, e: null }));
    this.legs = ["stand", "stand"]; this.legCur = null;
    this.hands = [0, 1].map(() => ({ vis: true, x: 0, y: 0, vx: 0, vy: 0, speed: 0, bodySpeed: 0, shape: "unknown" }));
    this.active = -1; this.present = true; this.fullBody = true; this.lowerSeen = true; this.lostT = 0; this.pts = null;
    this.update(0.016);
  }
  get u() { return Math.min(this.v.U * 0.115, this.v.H * 0.11); }
  get scale() { return this.u * 1.2; }        // 어깨너비 (게임의 손 속도 기준)
  get shoulderY() { return this.v.H * 0.44; }
  get activeHand() { return this.active >= 0 ? this.hands[this.active] : null; }
  setPose(id) { const [la, ra, ll = "stand", rl = "stand"] = POSE[id] || POSE.rest; this.rest(0, la, 1.3); this.rest(1, ra, 1.3); this.legs = [ll, rl]; }
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
    const S = [{ x: cx - 0.6 * u, y: sy }, { x: cx + 0.6 * u, y: sy }];
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
    const head = { x: cx, y: sy - 0.8 * u };
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
    const top = Math.min(P[11].y, P[12].y) - 0.15 * u;
    ctx.fillStyle = "#ff8a3d"; rr(ctx, this.cx - 0.75 * u, top, 1.5 * u, P[23].y - top + 0.25 * u, 0.4 * u); ctx.fill();
    ctx.fillStyle = "#ffd23d"; ctx.beginPath(); ctx.arc(this.cx, top + 0.9 * u, 0.28 * u, 0, Math.PI * 2); ctx.fill();   // 셔츠 무늬
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
const SCRIPTS = {
  math: {
    dur: 22,
    run(T, g, p, S, say) {
      const bal = g.balloons.filter(b => b.alive), ok = bal.find(b => b.val === g.answer), u = p.u;
      const reachOk = b => { p.tcx = b.x - 0.7 * u; if (Math.abs(p.cx - p.tcx) < 0.3 * u) { p.active = 1; p.reach(1, b.x, b.y, 0.6); } else { p.active = -1; p.rest(1, "down"); } };
      switch (S.step) {
        case 0: say("수학 풍선! 문제의 정답이 적힌 풍선을 터뜨려요"); p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.rest(0); p.rest(1);
          if (T > 2.4) S.step = 1; break;
        case 1: say("고르는 손은 활짝 펴서 정답 풍선에 대요"); p.hands[1].shape = "open"; p.hands[0].shape = "closed"; p.active = 1; p.rest(0, "guard");
          if (ok) reachOk(ok);
          if (g.phase === "done") { S.step = 2; S.t0 = T; } break;
        case 2: say("정답! 점수를 얻어요"); p.rest(1, "cheer"); p.rest(0, "cheer");
          if (g.phase === "ask" && T - S.t0 > 1.4) { S.step = 3; S.t0 = T; } break;
        case 3: {   // 주먹 쥔 손은 풍선에 닿아도 무시되는 장면
          say("다른 손은 주먹! 주먹은 풍선에 닿아도 안 터져요"); p.active = -1; p.hands[1].shape = "open"; p.rest(1, "down");
          const wrong = bal.filter(b => b.val !== g.answer).sort((a, b) => b.y - a.y)[0];
          if (wrong) { p.tcx = wrong.x + 0.7 * u; if (Math.abs(p.cx - p.tcx) < 0.3 * u) p.reach(0, wrong.x, wrong.y, 0.6); else p.rest(0, "down"); }
          if (T - S.t0 > 3.4) { S.step = 4; S.t0 = T; } break;
        }
        case 4: say("편 손으로 정답을 골라요!"); p.active = 1; p.rest(0, "guard"); if (ok) reachOk(ok);
          if (g.phase === "done") { S.step = 5; S.t0 = T; } break;
        case 5: say("이제 직접 해 봐요!"); p.rest(0, "cheer"); p.rest(1, "cheer"); if (T - S.t0 > 2) S.end = true; break;
      }
    },
  },
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
    dur: 15,
    run(T, g, p, S, say) {
      const u = p.u; p.hands.forEach(h => { h.shape = "open"; }); p.active = -1;
      const at = (t, fn) => { S.done = S.done || {}; if (T >= t && !S.done[t]) { S.done[t] = 1; fn(); } };
      at(0, () => say("별 따기! 떨어지는 별을 손으로 잡아요"));
      at(0.3, () => g.forceSpawn("star", 0.38)); at(1.8, () => g.forceSpawn("star", 0.64));
      at(4.6, () => { g.forceSpawn("gold", 0.5); say("높이 뜬 금별은 3점! 손을 높이 뻗어요"); });
      at(8.6, () => { g.forceSpawn("bomb", 0.5); g.forceSpawn("star", 0.82); say("폭탄은 피해요! 닿으면 점수가 깎여요"); });
      at(12.6, () => say("이제 직접 해 봐요!"));
      const stars = g.stars, bombs = stars.filter(s => s.kind === "bomb" && s.y > 0);
      const goods = stars.filter(s => s.kind !== "bomb" && s.y > 0 && !bombs.some(bm => Math.hypot(bm.x - s.x, bm.y - s.y) < 2.5 * u));
      const danger = bombs.find(bm => Math.abs(bm.x - p.cx) < 3.2 * u && bm.y > p.shoulderY - 3.5 * u);
      if (danger && !goods.length) {   // 폭탄 피하기: 손 모으고 옆으로 비킴
        p.tcx = danger.x + (p.cx <= danger.x ? -3.4 * u : 3.4 * u); p.rest(0, "guard"); p.rest(1, "guard"); return;
      }
      const tg = goods.find(s => s.kind === "gold") || goods.sort((a, b) => b.y - a.y)[0];
      if (!tg) { p.rest(0); p.rest(1); return; }
      const k = tg.x < p.cx ? 0 : 1;
      p.tcx = tg.x + (k === 0 ? 0.9 * u : -0.9 * u); p.reach(k, tg.x, tg.y, 1.1); p.rest(1 - k, "guard");
      if (tg.y < p.shoulderY - 1.7 * u && dist(p.hands[k], tg) > 0.4 * u && (!S.jt || T - S.jt > 0.8)) { p.jump(); S.jt = T; }
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
};

export function startDemo(id, game, view) {
  const p = new Puppet(view), zone = { x0: 0, x1: view.W, w: view.W, cx: view.W / 2 };
  const me = { combo: 0 }, stats = { ok: 0, miss: 0, pen: 0 };
  const env = {
    slot: 0, player: me, tracker: p, zone, view, mode: 1, level: "add10", diff: DIFFS.normal, color: "#ff8a3d", name: "도우미",
    progress: () => 0.1, fever: () => false, speak: () => {},
    award: (base, x, y) => { me.combo++; stats.ok++; popup(x, y, `+${base * DIFFS.normal.points}`, { size: view.U * 0.065, color: "#fff", stroke: "#ff8a3d" }); },
    miss: (x, y, label) => { me.combo = 0; stats.miss++; if (label) popup(x, y, label, { size: view.U * 0.04, color: "#eee", stroke: "#555" }); },
    penalty: (n, x, y, label) => { me.combo = 0; stats.pen++; popup(x, y, `${label} -${n * DIFFS.normal.points}`, { size: view.U * 0.06, color: "#fff", stroke: "#d02020" }); },
  };
  const inst = game.create(env), sc = SCRIPTS[id], S = { step: 0 };
  let T = 0, caption = "";
  const say = text => { if (text !== caption) { caption = text; speak(text); } };
  return {
    get caption() { return caption; },
    get stats() { return stats; },     // 점검용
    get time() { return T; },
    get inst() { return inst; }, get puppet() { return p; },
    get progress() { return Math.min(1, T / sc.dur); },
    get done() { return S.end || T >= sc.dur; },
    update(dt) {
      T += dt;
      zone.x1 = zone.w = view.W; zone.cx = view.W / 2;
      sc.run(T, inst, p, S, say);
      p.update(dt);
      inst.update(dt);
    },
    draw(ctx) {
      const { W, H } = view;
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#bfe3ff"); g.addColorStop(0.75, "#fff3d6"); g.addColorStop(1, "#ffe2a8");
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.fillStyle = "#c9e8a6"; ctx.fillRect(-20, H * 0.965, W + 40, H);
      inst.draw(ctx); p.draw(ctx);
    },
  };
}
