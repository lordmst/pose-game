// 농구 (3점 슛 대회): 두 손을 머리 위로 올리면 슛 준비 → 힘 막대가 오르내림 → 초록 칸일 때 손을 위로 '휙' 튕기면 슛
// 랙 5개 × 공 5개, 랙의 마지막 공(무지개 공)은 2배. 깨끗하게 들어가면 보너스
import { burst, popup, outlinedText, rr, clamp } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const FLICK = 1.6;                  // 튕기기로 인정하는 손 속도(어깨너비/초)
const SWEET = 0.8;                  // 힘 막대의 가장 좋은 자리 (0~1)

export default {
  id: "basket", title: "농구", icon: "🏀", sec: 60, cursor: "", cat: "sport", bg: "#ffb347", desc: "3점 슛 대회",
  how: "두 손을 머리 위로 올리면 힘 막대가 움직여요. 초록 칸일 때 손을 위로 휙 튕기면 슛! 무지개 공은 2점",
  create(env) {
    const z = env.zone, v = env.view;
    let lastQ = 0, phase = "ready", setT = 0, stillT = 0, meter = 0, ball = null, rack = 1, idx = 0, waitT = 0.6, t = 0, made = 0, shots = 0, swish = 0, net = 0;
    const halfW = 0.07 * env.diff.reach, inW = 0.15 * env.diff.reach, period = 1.5 / env.diff.speed;
    const hoop = () => ({ x: z.cx, y: v.H * 0.3, r: Math.min(z.w * 0.09, v.U * 0.07) });
    function body() {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return null;
      return { sy: (p[11].y + p[12].y) / 2, sw: Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1 };
    }
    function shoot(q) {
      const H = hoop(), d = q - SWEET, res = Math.abs(d) <= halfW ? "swish" : Math.abs(d) <= inW ? "rim" : d < 0 ? "short" : "long";
      const money = idx === 4;
      lastQ = q; ball = { t: 0, T: 0.9, x0: z.cx + (Math.random() - 0.5) * z.w * 0.1, y0: v.H * 0.78, res, money, dx: res === "short" ? -0.4 : res === "long" ? 0.5 : (Math.random() - 0.5) * 0.3 };
      shots++; phase = "fly"; sfx.whoosh();
      void H;
    }
    function score() {
      const H = hoop(), b = ball, inn = b.res === "swish" || b.res === "rim";
      if (inn) {
        made++; net = 1;
        const base = b.money ? 2 : 1;
        env.award(base, H.x, H.y - H.r * 1.2);
        if (b.res === "swish") { swish++; env.award(1, H.x + H.r * 1.6, H.y - H.r * 0.6); popup(H.x, H.y + H.r * 2.2, "깨끗하게!", { size: v.U * 0.05, color: "#fff", stroke: "#e0306a" }); sfx.fever(); }
        else { popup(H.x, H.y + H.r * 2.2, "들어갔다!", { size: v.U * 0.045, color: "#fff", stroke: "#2fb65a" }); sfx.catch(env.player.combo); }
        burst(H.x, H.y + H.r * 0.6, { n: 24, colors: ["#ff9f1c", "#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.6, size: v.U * 0.016 });
      } else { sfx.bonk(); env.miss(H.x, H.y + H.r * 2, b.res === "short" ? "조금 짧아요" : "조금 길어요"); }
      ball.done = true; ball.after = 0;
    }
    return {
      update(dt) {
        t += dt; net = Math.max(0, net - dt * 2);
        const b = body(), hs = env.tracker.hands.filter(h => h.vis);
        if (phase === "ready") {
          waitT -= dt;
          if (waitT <= 0 && b && hs.length && hs.every(h => h.y < b.sy - b.sw * 0.5)) { phase = "set"; setT = 0; stillT = 0; meter = 0; }   // 두 손을 머리 위로
        } else if (phase === "set") {
          const sp = hs.length ? Math.max(...hs.map(h => h.bodySpeed)) : 0;
          if (sp < 1.0) stillT += dt;                                    // 손을 들어 올리는 동작은 슛이 아님: 잠깐 멈춘 뒤부터 힘 막대가 움직임
          if (stillT > 0.15) setT += dt;
          meter = 0.5 - 0.5 * Math.cos(Math.PI * 2 * setT / period);
          const up = hs.length && hs.reduce((s, h) => s + h.vy, 0) / hs.length < 0 && sp > FLICK * env.diff.punch;
          if (setT > 0 && up) shoot(meter);
          else if (setT > 3.2) shoot(meter);                                                            // 너무 오래 들고 있으면 그냥 던짐
          else if (b && hs.length && hs.every(h => h.y > b.sy + b.sw * 0.3)) phase = "ready";           // 손을 내리면 취소
        } else if (phase === "fly") {
          ball.t += dt;
          if (!ball.done && ball.t >= ball.T) score();
          if (ball.done) { ball.after += dt; if (ball.after > 0.8) { ball = null; phase = "ready"; waitT = 0.5; idx++; if (idx >= 5) { idx = 0; rack++; } } }
        }
      },
      draw(ctx) {
        const U = v.U, H = hoop();
        // 백보드와 골대
        const bw = H.r * 3.4, bh = H.r * 2.3;
        ctx.fillStyle = "rgba(255,255,255,.75)"; rr(ctx, H.x - bw / 2, H.y - bh * 1.05, bw, bh, 6); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = "#e04a1a"; ctx.strokeRect(H.x - bw * 0.2, H.y - bh * 0.6, bw * 0.4, bh * 0.45);
        ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2;
        for (let i = 0; i <= 6; i++) { const x = H.x - H.r + i * H.r / 3, sw = Math.sin(net * 20) * net * H.r * 0.15; ctx.beginPath(); ctx.moveTo(x, H.y); ctx.lineTo(H.x + (x - H.x) * 0.6 + sw, H.y + H.r * 1.3); ctx.stroke(); }
        ctx.strokeStyle = "#ff5a1a"; ctx.lineWidth = Math.max(4, U * 0.008); ctx.beginPath(); ctx.ellipse(H.x, H.y, H.r, H.r * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
        // 날아가는 공
        if (ball) {
          const k = Math.min(1, ball.t / ball.T), ex = H.x + ball.dx * H.r, ey = H.y - H.r * 0.15;
          let x = ball.x0 + (ex - ball.x0) * k, y = ball.y0 + (ey - ball.y0) * k - Math.sin(k * Math.PI) * v.H * 0.32;
          if (ball.done) {   // 들어가면 아래로, 안 들어가면 튕겨 나감
            const a = ball.after;
            if (ball.res === "swish" || ball.res === "rim") { x = H.x; y = H.y + a * v.H * 0.6; }
            else { x = ex + (ball.dx > 0 ? 1 : -1) * a * H.r * 4; y = ey - Math.sin(Math.min(1, a * 2) * Math.PI) * H.r * 1.5 + a * a * v.H * 0.5; }
          }
          const r = H.r * (1.15 - 0.35 * k);
          drawBall(ctx, x, y, r, ball.money, t);
        }
        // 힘 막대 (슛 준비 중)
        const mx = z.x1 - Math.max(U * 0.06, z.w * 0.08), my = v.H * 0.36, mh = v.H * 0.4, mw = Math.max(14, U * 0.03);
        ctx.fillStyle = "rgba(0,0,0,.45)"; rr(ctx, mx - mw / 2, my, mw, mh, mw / 2); ctx.fill();
        ctx.fillStyle = "rgba(255,212,0,.55)"; ctx.fillRect(mx - mw / 2, my + mh * (1 - SWEET - inW), mw, mh * inW * 2);
        ctx.fillStyle = "#37d67a"; ctx.fillRect(mx - mw / 2, my + mh * (1 - SWEET - halfW), mw, mh * halfW * 2);
        if (phase === "set" && setT > 0) { const yy = my + mh * (1 - meter); ctx.fillStyle = "#fff"; ctx.fillRect(mx - mw, yy - 3, mw * 2, 6); }
        // 랙: 남은 공
        const ry = v.H * 0.88;
        for (let i = 0; i < 5; i++) { const x = z.cx + (i - 2) * U * 0.06; ctx.globalAlpha = i < idx ? 0.25 : 1; drawBall(ctx, x, ry, U * 0.024, i === 4, 0); }
        ctx.globalAlpha = 1;
        outlinedText(ctx, `랙 ${rack}`, z.cx, ry - U * 0.05, U * 0.03, "#fff", "#8a4b00", 3);
        if (phase === "ready") outlinedText(ctx, "두 손을 머리 위로!", z.cx, v.H * 0.66, Math.min(U * 0.045, z.w / 12), "#fff", "#c05000");
        else if (phase === "set") outlinedText(ctx, "초록 칸에서 위로 휙!", z.cx, v.H * 0.66, Math.min(U * 0.045, z.w / 12), "#fff", "#1d8f47");
      },
      result: () => `${shots}개 중 ${made}개 성공 · 깨끗한 슛 ${swish}`,
      // 설명 시연용
      get phase() { return phase; },
      get meter() { return meter; },
      get lastQ() { return lastQ; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "open"; }); p.active = -1;
      if (T < 4) say("농구! 두 손을 머리 위로 올리면 슛 준비");
      else if (T < 9) say("힘 막대가 초록 칸일 때 위로 휙 튕겨요");
      else if (T < 14) say("마지막 무지개 공은 2점!");
      else say("이제 직접 해 봐요!");
      if (g.phase !== S.lastPh) { S.lastPh = g.phase; S.flick = false; S.lastM = 0; }   // 새 슛마다 처음부터
      if (g.phase === "set") {
        if (!S.flick && g.meter > 0.74 && g.meter < 0.84 && S.lastM < g.meter) S.flick = true;
        S.lastM = g.meter;
        const k = S.flick ? "up" : "head"; p.rest(0, k, S.flick ? 5 : 2); p.rest(1, k, S.flick ? 5 : 2);
        return;
      }
      if (g.phase === "ready") { p.rest(0, "head", 2); p.rest(1, "head", 2); return; }
      p.rest(0, "up", 2); p.rest(1, "up", 2);
    },
  },
};
function drawBall(ctx, x, y, r, money, t) {
  ctx.save(); ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  if (money) { g.addColorStop(0, "#fff"); g.addColorStop(0.4, `hsl(${(t * 200) % 360},90%,60%)`); g.addColorStop(1, `hsl(${(t * 200 + 120) % 360},90%,45%)`); }
  else { g.addColorStop(0, "#ffc27a"); g.addColorStop(1, "#e06a10"); }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(60,20,0,.8)"; ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
  ctx.beginPath(); ctx.arc(-r * 1.3, 0, r * 0.95, -0.7, 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 1.3, 0, r * 0.95, Math.PI - 0.7, Math.PI + 0.7); ctx.stroke();
  ctx.restore();
}
