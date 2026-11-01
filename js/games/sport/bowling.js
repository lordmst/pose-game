// 볼링: 공 든 손을 허리 아래로 내렸다가 앞(위)으로 빠르게 휘두르면 공이 굴러감
// 조준 = 내 몸의 좌우 위치(옆으로 걸어서 맞춤), 휘두를 때 손이 옆으로 쏠리면 공이 휘어짐(커브)
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=28";
import { sfx } from "../../audio.js?v=28";

const LANE_LEN = 18;            // 레인 길이(레인 좌표, 레인 폭 = 2)
const PIN_R = 0.12, BALL_R = 0.21;
const SWING = 2.0;              // 휘두르기로 인정하는 손 속도(어깨너비/초)
// 핀 10개: 1번 핀이 앞, 4줄 삼각형
const PINS = []; for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) PINS.push({ x: (i - r / 2) * 0.58, y: 15.6 + r * 0.52 });

export default {
  id: "bowling", title: "볼링", icon: "🎳", sec: 60, cursor: "", cat: "sport", bg: "#f6d365", desc: "공 굴려 핀 쓰러뜨리기",
  how: "공 든 손을 허리 아래로 내렸다가 앞으로 쭉 휘둘러 굴려요. 옆으로 걸어서 조준! 스트라이크는 보너스",
  create(env) {
    const z = env.zone, v = env.view;
    let phase = "aim", ball = null, pins = [], frame = 1, roll = 1, settleT = 0, aimX = 0, lowT = -9, t = 0, msg = "";
    let total = 0, strikes = 0, spares = 0, frameDown = 0, lastRelease = -9;
    const resetPins = () => { pins = PINS.map(p => ({ ...p, vx: 0, vy: 0, down: false, gone: false, rot: 0 })); };
    resetPins();
    // 레인 좌표 → 화면 (원근: 멀수록 좁고 위쪽)
    const topY = v.H * 0.22, botY = v.H * 0.97, halfW = Math.min(z.w * 0.3, v.U * 0.42);
    function proj(x, y) {
      const tt = clamp(y / LANE_LEN, 0, 1.08), k = 2.0, f = (1 - 1 / (1 + k * tt)) / (1 - 1 / (1 + k));
      const s = 1 - 0.62 * f;
      return { x: z.cx + x * halfW * s, y: botY - (botY - topY) * f, s };
    }
    function body() {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return null;
      const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1;
      const hipY = p[23].v && p[24].v ? (p[23].y + p[24].y) / 2 : (p[11].y + p[12].y) / 2 + sw * 1.7;
      return { x: (p[11].x + p[12].x) / 2, sy: (p[11].y + p[12].y) / 2, hipY, sw };
    }
    function release(h, b) {
      const sp = Math.min(h.bodySpeed, 14);
      ball = { x: aimX, y: 0.6, vy: 8 + sp * 0.75, spin: clamp(h.vx / (b.sw || 1) * 0.035, -0.9, 0.9), gutter: false, rot: 0 };
      phase = "roll"; settleT = 0; lastRelease = t; sfx.whoosh();
    }
    function knock(pin, dx, dy, power) {
      if (pin.down) return;
      const d = Math.hypot(dx, dy) || 1;
      pin.down = true; pin.vx = dx / d * power + (Math.random() - 0.5) * 0.8; pin.vy = dy / d * power + 1.2;
      sfx.hit(1);
    }
    function endRoll() {
      const downNow = pins.filter(p => p.down && !p.gone).length, standing = pins.filter(p => !p.down).length;
      const P = proj(0, 16.2);
      frameDown += downNow; total += downNow;
      if (downNow) env.award(downNow, P.x, P.y - v.U * 0.05);
      if (standing === 0 && roll === 1) {
        strikes++; msg = "STRIKE!"; env.award(5, P.x, P.y - v.U * 0.12); sfx.fanfare(); shake(v.U * 0.02, 0.4);
        popup(z.cx, v.H * 0.42, "스트라이크!", { size: v.U * 0.1, color: "#fff", stroke: "#e0306a", life: 1.6 });
        burst(P.x, P.y, { n: 40, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 1.1, gravity: v.U, size: v.U * 0.018 });
      } else if (standing === 0) {
        spares++; msg = "SPARE!"; env.award(3, P.x, P.y - v.U * 0.12); sfx.fever();
        popup(z.cx, v.H * 0.42, "스페어!", { size: v.U * 0.09, color: "#fff", stroke: "#2f8bff", life: 1.4 });
      } else if (downNow === 0) { env.miss(P.x, P.y, ball && ball.gutter ? "도랑에 빠졌어요" : "아깝다!"); }
      else popup(z.cx, v.H * 0.42, `${downNow}개!`, { size: v.U * 0.07, color: "#fff", stroke: "#8a5a00", life: 1.0 });
      pins.forEach(p => { if (p.down) p.gone = true; });
      if (roll === 1 && standing > 0) roll = 2;
      else { frame++; roll = 1; frameDown = 0; resetPins(); }
      ball = null; phase = "aim";
    }
    return {
      update(dt) {
        t += dt;
        const b = body(), hands = env.tracker.hands;
        if (phase === "aim") {
          if (b) aimX = clamp((b.x - z.cx) / (z.w * 0.28), -0.85, 0.85);    // 옆으로 걸어서 조준
          if (b && t - lastRelease > 1) hands.forEach(h => {
            if (!h.vis || phase !== "aim") return;
            if (h.y > b.hipY - b.sw * 0.35) lowT = t;                       // 손을 허리 아래로 내림
            const rising = h.vy < 0 && h.y < b.hipY - b.sw * 0.9;           // 앞(위)으로 올라오는 중
            if (t - lowT < 1.5 && rising && h.bodySpeed > SWING * env.diff.punch) release(h, b);
          });
        } else if (phase === "roll") {
          settleT += dt;
          if (ball) {
            ball.y += ball.vy * dt; ball.rot += ball.vy * dt * 2;
            if (!ball.gutter) {
              ball.x += ball.spin * dt * (ball.y / LANE_LEN) * 2.2;         // 레인 끝으로 갈수록 휘어짐
              if (Math.abs(ball.x) > 1.02) { ball.gutter = true; ball.x = Math.sign(ball.x) * 1.12; sfx.thud(); }
              for (const p of pins) {
                if (p.down) continue;
                const dx = p.x - ball.x, dy = p.y - ball.y;
                if (Math.hypot(dx, dy) < PIN_R + BALL_R) { knock(p, dx, dy, ball.vy * 0.45); ball.vy *= 0.93; ball.x -= dx * 0.05; }
              }
            }
            if (ball.y > LANE_LEN + 1) ball = null;
          }
          // 쓰러진 핀이 굴러가며 다른 핀을 넘어뜨림
          for (const p of pins) {
            if (!p.down || p.gone) continue;
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5; p.rot += dt * 6;
            for (const q of pins) if (!q.down && Math.hypot(q.x - p.x, q.y - p.y) < PIN_R * 2.2 && Math.hypot(p.vx, p.vy) > 0.6) knock(q, q.x - p.x, q.y - p.y, Math.hypot(p.vx, p.vy) * 0.8);
          }
          if (!ball && settleT > 0.8) endRoll();
          if (settleT > 6) endRoll();
        }
      },
      draw(ctx) {
        const U = v.U;
        // 레인 (반투명)
        const a = proj(-1.25, 0), b2 = proj(1.25, 0), c = proj(1.25, LANE_LEN + 0.8), d = proj(-1.25, LANE_LEN + 0.8);
        ctx.fillStyle = "rgba(60,40,30,.4)"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
        const e = proj(-1, 0), f = proj(1, 0), g = proj(1, LANE_LEN + 0.8), h = proj(-1, LANE_LEN + 0.8);
        const lg = ctx.createLinearGradient(0, e.y, 0, h.y); lg.addColorStop(0, "rgba(232,180,110,.55)"); lg.addColorStop(1, "rgba(214,160,95,.6)");
        ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(f.x, f.y); ctx.lineTo(g.x, g.y); ctx.lineTo(h.x, h.y); ctx.closePath(); ctx.fill();
        // 조준 화살표 표시 (레인 가운데 쯤)
        ctx.fillStyle = "rgba(120,60,20,.6)";
        for (let i = -3; i <= 3; i++) { const P = proj(i * 0.26, 5 + Math.abs(i) * 0.3), s = U * 0.012 * P.s; ctx.beginPath(); ctx.moveTo(P.x, P.y - s * 2); ctx.lineTo(P.x - s, P.y + s); ctx.lineTo(P.x + s, P.y + s); ctx.closePath(); ctx.fill(); }
        // 핀 (먼 것부터)
        [...pins].filter(p => !p.gone).sort((p, q) => q.y - p.y).forEach(p => {
          const P = proj(p.x, p.y), s = halfW * 0.4 * P.s;
          ctx.save(); ctx.translate(P.x, P.y); if (p.down) ctx.rotate(p.rot);
          ctx.fillStyle = "#fff"; ctx.strokeStyle = "#555"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(0, -s * 0.55, s * 0.32, s * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, -s * 1.25, s * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#e03030"; ctx.fillRect(-s * 0.2, -s * 1.02, s * 0.4, s * 0.09);
          ctx.restore();
        });
        // 공
        const bx = ball ? ball.x : aimX, by = ball ? ball.y : 0.6;
        if (phase === "aim" || ball) {
          const P = proj(bx, by), r = BALL_R * halfW * P.s * 1.15;
          if (phase === "aim") {   // 조준선
            ctx.setLineDash([U * 0.012, U * 0.012]); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3;
            const T = proj(aimX, 15.6); ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(T.x, T.y); ctx.stroke(); ctx.setLineDash([]);
          }
          const gr = ctx.createRadialGradient(P.x - r * 0.3, P.y - r * 0.3, r * 0.1, P.x, P.y, r);
          gr.addColorStop(0, "#9ad0ff"); gr.addColorStop(1, env.color);
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(P.x, P.y - r, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#222"; const ra = ball ? ball.rot : 0;
          for (let i = 0; i < 3; i++) { const an = ra + i * 0.5; ctx.beginPath(); ctx.arc(P.x + Math.cos(an) * r * 0.35, P.y - r + Math.sin(an) * r * 0.35 - r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill(); }
        }
        // 점수판
        outlinedText(ctx, `${frame}프레임 · ${roll}구`, z.cx, v.H * 0.155, U * 0.04, "#fff", "#5a3a10");
        if (phase === "aim") outlinedText(ctx, roll === 1 ? "손을 내렸다가 앞으로 쭉 휘둘러요!" : "남은 핀을 노려요!", z.cx, v.H * 0.9, Math.min(U * 0.04, z.w / 15), "#fff", "#8a5a00");
      },
      result: () => `쓰러뜨린 핀 ${total} · 스트라이크 ${strikes} · 스페어 ${spares}`,
      // 설명 시연용
      get phase() { return phase; },
      get aimX() { return aimX; },
      get standing() { return pins.filter(p => !p.down).map(p => p.x); },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      const u = p.u, cx = p.cx, sy = p.shoulderY;
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1;
      if (T < 4) say("볼링! 공 든 손을 허리 아래로 내렸다가");
      else if (T < 9) say("앞으로 쭉 휘두르면 공이 굴러가요");
      else if (T < 14) say("옆으로 걸어서 남은 핀을 노려요");
      else say("이제 직접 해 봐요!");
      // 남은 핀 쪽으로 몸을 옮김 (2구째)
      const st = g.standing, tx = st.length && st.length < 10 ? st.reduce((a, b) => a + b, 0) / st.length : 0;
      p.tcx = p.v.W / 2 + tx * p.v.W * 0.28 * 0.9; p.walk = 0.5;
      p.rest(0, "down", 1);
      if (g.phase !== "aim" || Math.abs(p.cx - p.tcx) > 0.2 * u) { p.rest(1, "down", 1.2); S.ph = 0; S.t0 = T; return; }
      if (!S.ph) { S.ph = 1; S.t0 = T; }
      if (S.ph === 1) { p.reach(1, cx + 0.5 * u, sy + 1.95 * u, 1.2); if (T - S.t0 > 1.0) { S.ph = 2; S.t0 = T; } }   // 아래로 내리기
      else { p.reach(1, cx + 0.4 * u, sy - 0.4 * u, 3.2); }                                                             // 앞으로 휘두르기
    },
  },
};
