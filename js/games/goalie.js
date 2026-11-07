// 골키퍼: 멀리서 날아오는 공을 손으로 막기. 공이 도착할 자리에 그림자가 미리 보임. 먼 공은 옆으로 움직여야 닿음
import { burst, popup, shake, outlinedText, FONT, rnd } from "../fx.js?v=68";
import { sfx } from "../audio.js?v=68";
import { bodyRef } from "./bodyref.js?v=68";
import { makeBoss } from "./boss.js?v=68";

const FLIGHT = 1.5;    // 공이 날아오는 시간(초, 보통)

export default {
  id: "goalie", title: "골키퍼", icon: "🧤", sec: 45, cursor: "🧤", cat: "move", bg: "#8fd694", desc: "날아오는 공 막기",
  how: "날아오는 공을 손으로 막아요. 동그라미가 공이 올 자리! 화살표가 나오면 그쪽으로 옆걸음해서 막아요(2점). 금색 공은 3점. 중간에 거대 공 보스가 나와요",
  rush: "슈팅 러시",
  create(env) {
    const z = env.zone, v = env.view;
    let shots = [], spawnT = 1.0, saves = 0, goals = 0, netShake = 0;
    const R = () => v.U * 0.075;
    // 선수 키에 맞춘 골대: 가로대는 만세한 손끝보다 조금 위, 공은 머리 위 ~ 무릎 위 사이로
    const ref = bodyRef(env), boss = makeBoss(env, { icon: "⚽", name: "거대 공", mode: "touch", ref, color: "#ffffff", crown: true }), barY = () => Math.max(v.H * 0.12, Math.min(v.H * 0.34, ref.sh - ref.T * 1.45)), lowY = () => Math.min(v.H * 0.9, ref.y(1.5));
    function body() {
      const p = env.tracker.pts;
      if (p && p[11].v && p[12].v) { const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y); return { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2, sw: Math.max(sw, v.U * 0.08) }; }
      return { x: z.cx, y: ref.sh, sw: Math.max(v.U * 0.08, ref.T / 1.3) };
    }
    function shoot(dest, farForce) {
      const b = body(), p = env.progress();
      let side = Math.random() < 0.5 ? -1 : 1;
      // 먼 공: 팔을 뻗어도 안 닿는 곳(어깨너비 3배 이상)으로. 공간이 있는 쪽으로 보냄
      const room = s => s < 0 ? b.x - z.x0 : z.x1 - b.x;
      const rush = env.rush && env.rush();
      let far = farForce != null ? farForce : !rush && p > 0.12 && Math.random() < 0.3;
      if (far && room(side) < b.sw * 3.2) side = -side;
      if (far && room(side) < b.sw * 3.2) far = false;
      const d = dest || (far ? { x: b.x + side * b.sw * (3.0 + Math.random() * 0.9), y: b.y + b.sw * (-0.6 + Math.random() * 1.2) }
                             : { x: b.x + side * b.sw * (0.6 + Math.random() * 1.4), y: b.y + b.sw * (-1.4 + Math.random() * 2.4) });
      d.x = Math.max(z.x0 + R(), Math.min(z.x1 - R(), d.x)); d.y = Math.max(barY() + R() * 1.3, Math.min(lowY(), d.y));
      const T = FLIGHT * (1 - 0.3 * p) / env.diff.speed * (far ? 1.35 : 1);   // 먼 공은 움직일 시간을 더 줌
      shots.push({ sx: z.cx + (Math.random() - 0.5) * z.w * 0.2, sy: barY() + v.H * 0.06, dx: d.x, dy: d.y, t: 0, T, far, gold: !far && Math.random() < (env.catchUp && env.catchUp() ? 0.3 : 0.12), curve: !far && p > 0.15 && Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) * z.w * 0.2 : 0, done: null, rt: 0, spin: Math.random() * 6, vx: 0, vy: 0 });
      sfx.whoosh();
    }
    // 휘어 차기(바나나킥): 날아오는 길이 옆으로 휘었다가 동그라미 자리로 들어옴
    const at = s => { const k = Math.min(1, s.t / s.T), e = k * k; return { x: s.sx + (s.dx - s.sx) * e + Math.sin(k * Math.PI) * (s.curve || 0), y: s.sy + (s.dy - s.sy) * e - Math.sin(k * Math.PI) * v.H * 0.08, k, size: 0.25 + 0.75 * e }; };
    return {
      update(dt) {
        ref.update(dt); boss.update(dt); spawnT -= dt; netShake = Math.max(0, netShake - dt);
        const p = env.progress(), rush = env.rush && env.rush();
        if (spawnT <= 0 && !boss.active && shots.filter(s => !s.done).length < (rush ? 3 : p > 0.5 ? 2 : 1)) { shoot(); spawnT = (1.6 - 0.6 * p) / env.diff.speed * (env.fever() ? 0.75 : 1) * (rush ? 0.35 : 1); }
        const hands = env.tracker.hands.filter(h => h.vis), r = R();
        for (const s of shots) {
          if (s.done) { s.rt += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += v.H * 2 * dt; continue; }
          s.t += dt; s.spin += dt * 10;
          const c = at(s);
          if (c.k > 0.8 && hands.some(h => Math.hypot(h.x - c.x, h.y - c.y) < r * 1.25 * env.diff.reach)) {
            s.done = "save"; saves++; if (s.gold && env.stat) env.stat("gold"); s.x = c.x; s.y = c.y; s.vx = (c.x - z.cx) * 1.5; s.vy = -v.H * 0.9;
            sfx.bonk(); shake(v.U * 0.008, 0.15); env.award(s.gold ? 3 : s.far || s.curve ? 2 : 1, c.x, c.y - r * 1.4);
            popup(c.x, c.y + r * 1.6, s.far ? "슈퍼 세이브!" : s.curve ? "휘는 공 막았다!" : "막았다!", { size: v.U * 0.045, color: "#fff", stroke: "#2fb65a" });
            burst(c.x, c.y, { n: 16, colors: ["#ffffff", "#ffd400", "#9dff7a"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.5, size: v.U * 0.018, life: 0.6 });
          } else if (c.k >= 1) {
            s.done = "goal"; goals++; s.x = c.x; s.y = c.y; s.vx = 0; s.vy = 0; netShake = 0.4;
            sfx.thud(); env.miss(c.x, c.y - r * 1.4, "골!");
          }
        }
        shots = shots.filter(s => !s.done || s.rt < 0.7);
      },
      draw(ctx) {
        const r = R(), U = v.U;
        // 골대와 그물
        const gx0 = z.x0 + z.w * 0.05, gx1 = z.x1 - z.w * 0.05, gy0 = barY(), jx = netShake > 0 ? Math.sin(netShake * 70) * U * 0.006 : 0;
        ctx.save(); ctx.translate(jx, 0);
        ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1;
        for (let x = gx0; x <= gx1; x += U * 0.05) { ctx.beginPath(); ctx.moveTo(x, gy0); ctx.lineTo(x, v.H); ctx.stroke(); }
        for (let y = gy0; y <= v.H; y += U * 0.05) { ctx.beginPath(); ctx.moveTo(gx0, y); ctx.lineTo(gx1, y); ctx.stroke(); }
        ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = U * 0.014; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(gx0, v.H); ctx.lineTo(gx0, gy0); ctx.lineTo(gx1, gy0); ctx.lineTo(gx1, v.H); ctx.stroke();
        ctx.restore();
        for (const s of shots) {
          if (!s.done) {
            const c = at(s), show = env.diff.id === "hard" ? Math.max(0, (c.k - 0.35) / 0.65) : Math.min(1, c.k * 1.6 + 0.2);
            // 공이 올 자리 표시
            ctx.globalAlpha = 0.25 + 0.55 * show; ctx.strokeStyle = s.gold ? "#ffd400" : "#ffffff"; ctx.lineWidth = U * 0.008; ctx.setLineDash([U * 0.015, U * 0.012]);
            ctx.beginPath(); ctx.arc(s.dx, s.dy, r * (1.5 - 0.5 * c.k), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
            drawBall(ctx, c.x, c.y, r * c.size, s.spin, s.gold);
            if (s.curve && c.k < 0.75) outlinedText(ctx, "휘어요!", c.x, c.y - r * c.size * 1.6, v.U * 0.032, "#fff", "#7a3bd6");
            if (s.far) {   // 옆으로 가라는 화살표: 몸에서 공이 올 자리 쪽으로
              const b = body(), dir = Math.sign(s.dx - b.x) || 1, x0 = b.x + dir * b.sw * 0.9, x1 = s.dx - dir * r * 1.6, y = s.dy;
              if ((x1 - x0) * dir > U * 0.03) {
                const pulse = 0.6 + 0.4 * Math.sin(c.k * 25);
                ctx.save(); ctx.globalAlpha = pulse; ctx.strokeStyle = ctx.fillStyle = "#ffd400"; ctx.lineWidth = U * 0.016; ctx.lineCap = "round";
                ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x1 + dir * U * 0.035, y); ctx.lineTo(x1 - dir * U * 0.005, y - U * 0.03); ctx.lineTo(x1 - dir * U * 0.005, y + U * 0.03); ctx.closePath(); ctx.fill();
                ctx.restore();
                outlinedText(ctx, dir > 0 ? "옆으로 →" : "← 옆으로", (x0 + x1) / 2, y - U * 0.045, U * 0.035, "#fff", "#7a5a00");
              }
            }
          } else {
            ctx.globalAlpha = Math.max(0, 1 - s.rt / 0.7); drawBall(ctx, s.x, s.y, r * (s.done === "goal" ? 0.9 : 1), s.spin, s.gold); ctx.globalAlpha = 1;
          }
        }
        boss.draw(ctx);
      },
      get boss() { return boss; },
      result: () => `막은 공 ${saves} · 골 먹음 ${goals}`,
      // 설명 시연용
      get shots() { return shots.filter(s => !s.done).map(s => ({ ...at(s), dx: s.dx, dy: s.dy, gold: s.gold, far: s.far })); },
      forceShot(dx, dy, far = false) { shoot({ x: dx, y: dy }, far); },
    };
  },
};
function drawBall(ctx, x, y, r, spin, gold) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
  if (gold) { ctx.shadowColor = "#ffd400"; ctx.shadowBlur = r * 0.8; }
  ctx.font = `${Math.round(r * 2)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("⚽", 0, 0);
  ctx.restore();
  if (gold) outlinedText(ctx, "3", x, y, r * 0.8, "#ffd400", "#7a4a00");
}
