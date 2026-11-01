// 별 따기: 떨어지는 별을 손으로 잡기. 위쪽 금별은 3점, 폭탄은 피하기(-1점)
import { burst, shake, outlinedText, starPath } from "../fx.js?v=12";
import { sfx } from "../audio.js?v=12";

export default {
  id: "star", title: "별 따기", icon: "⭐", sec: 45, cursor: "✋",
  how: "떨어지는 별을 손으로 잡아요. 높이 뜬 금별은 3점, 폭탄은 피하기!",
  create(env) {
    const z = env.zone, v = env.view, widthK = Math.max(0.6, z.w / v.U);
    let stars = [], spawnT = 0.4, t = 0, caught = 0, missed = 0, bombs = 0;
    function spawn() {
      const p = env.progress(), r = Math.random();
      const kind = p > 0.15 && r < 0.14 * env.diff.bomb ? "bomb" : r < 0.32 ? "gold" : "star";
      stars.push({
        kind, fx: 0.12 + Math.random() * 0.76, fy: kind === "gold" ? 0.22 : 0.13, hold: kind === "gold" ? 1.4 : 0,
        ph: Math.random() * 6, vy: (0.1 + 0.08 * p) * env.diff.speed * (kind === "gold" ? 0.75 : 1) * (env.fever() ? 1.2 : 1),
        trail: [], dead: false, born: 0, x: 0, y: 0,
      });
    }
    const R = () => v.U * 0.055;
    return {
      update(dt) {
        t += dt; spawnT -= dt;
        const p = env.progress(), interval = (1.0 - 0.45 * p) / widthK * (env.fever() ? 0.75 : 1);
        if (spawnT <= 0 && stars.length < Math.ceil(3.5 * widthK)) { spawn(); spawnT = interval; }
        const hands = env.tracker.hands.filter(h => h.vis), R0 = R();
        for (const s of stars) {
          s.born = Math.min(1, s.born + dt * 3);
          if (s.hold > 0) s.hold -= dt; else s.fy += s.vy * dt;
          s.x = z.x0 + s.fx * z.w + Math.sin(t * 1.3 + s.ph) * z.w * 0.03; s.y = s.fy * v.H;
          s.trail.push([s.x, s.y]); if (s.trail.length > 10) s.trail.shift();
          const r = s.kind === "gold" ? R0 * 1.35 : R0;
          if (hands.some(h => Math.hypot(h.x - s.x, h.y - s.y) < r * 1.4 * env.diff.reach)) {
            s.dead = true;
            if (s.kind === "bomb") {
              bombs++; env.penalty(1, s.x, s.y - r, "펑!"); sfx.bomb(); shake(v.U * 0.02, 0.35);
              burst(s.x, s.y, { n: 16, colors: ["#555", "#888", "#333"], shape: "smoke", speed: v.U * 0.4, gravity: -v.U * 0.3, size: r * 0.8, life: 0.8 });
              burst(s.x, s.y, { n: 14, colors: ["#ffb000", "#ff5a00", "#fff27a"], shape: "dot", speed: v.U * 0.9, gravity: v.U, size: v.U * 0.014, life: 0.5 });
            } else {
              caught++; env.award(s.kind === "gold" ? 3 : 1, s.x, s.y - r); sfx.catch(env.player.combo);
              burst(s.x, s.y, { n: s.kind === "gold" ? 26 : 14, colors: ["#fff6a0", "#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.6, size: v.U * 0.02, life: 0.7 });
            }
          } else if (s.fy > 0.97) {
            s.dead = true;
            if (s.kind !== "bomb") { missed++; env.miss(s.x, v.H * 0.9, "놓쳤어요"); }
          }
        }
        stars = stars.filter(s => !s.dead);
      },
      draw(ctx) {
        const R0 = R();
        for (const s of stars) {
          const r = (s.kind === "gold" ? R0 * 1.35 : R0) * (0.5 + 0.5 * s.born);
          if (s.kind !== "bomb") s.trail.forEach(([x, y], i) => {
            ctx.globalAlpha = (i / s.trail.length) * 0.35; ctx.fillStyle = s.kind === "gold" ? "#ffb400" : "#fff3a0";
            ctx.beginPath(); ctx.arc(x, y, r * 0.5 * (i / s.trail.length), 0, Math.PI * 2); ctx.fill();
          });
          ctx.globalAlpha = 1;
          if (s.kind === "bomb") {
            ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = r * 0.12; ctx.strokeStyle = "#e03030"; ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(s.x - r * 0.35, s.y - r * 0.35, r * 0.22, r * 0.14, -0.7, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo(s.x + r * 0.5, s.y - r * 0.8); ctx.quadraticCurveTo(s.x + r * 0.9, s.y - r * 1.3, s.x + r * 0.6, s.y - r * 1.5); ctx.stroke();
            ctx.fillStyle = Math.random() < 0.5 ? "#ffd400" : "#ff6a00"; ctx.beginPath(); ctx.arc(s.x + r * 0.6, s.y - r * 1.5, r * (0.15 + Math.random() * 0.12), 0, Math.PI * 2); ctx.fill();
            outlinedText(ctx, "!", s.x, s.y + r * 0.05, r * 1.1, "#ff4040", "#000", 2);
            continue;
          }
          const gold = s.kind === "gold";
          ctx.save();
          if (gold) { ctx.shadowColor = "#ffd400"; ctx.shadowBlur = r * (0.6 + 0.4 * Math.sin(t * 8)); }
          starPath(ctx, s.x, s.y, r, 0.48, Math.sin(t * 2 + s.ph) * 0.3);
          const g = ctx.createRadialGradient(s.x - r * 0.2, s.y - r * 0.25, r * 0.05, s.x, s.y, r);
          g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, gold ? "#ffcf3a" : "#ffe866"); g.addColorStop(1, gold ? "#f08c00" : "#ffc400");
          ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
          ctx.lineWidth = r * 0.09; ctx.lineJoin = "round"; ctx.strokeStyle = gold ? "#8a4b00" : "#a56d00"; ctx.stroke();
          ctx.restore();
          if (gold) {
            outlinedText(ctx, "3", s.x, s.y + r * 0.08, r * 0.7, "#fff", "#8a4b00");
            if (s.hold > 0) { ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (s.hold / 1.4)); ctx.stroke(); }
          }
        }
      },
      result: () => `잡은 별 ${caught} · 놓침 ${missed} · 폭탄 ${bombs}`,
    };
  },
};
