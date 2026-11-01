// 별 따기: 떨어지는 별을 손으로 잡기. 큰 별은 두 손으로 함께 잡아야 함(3점)
import { burst, popup, outlinedText, starPath } from "../fx.js?v=29";
import { sfx } from "../audio.js?v=29";

export default {
  id: "star", title: "별 따기", icon: "⭐", sec: 45, cursor: "✋", cat: "move", bg: "#55efc4", desc: "큰 별은 두 손으로",
  how: "떨어지는 별을 손으로 잡아요. 반짝이는 큰 별은 두 손으로 함께 잡으면 3점!",
  create(env) {
    const z = env.zone, v = env.view, widthK = Math.max(0.6, z.w / v.U);
    let stars = [], spawnT = 0.4, t = 0, caught = 0, missed = 0, bigN = 0;
    const BOTH = 0.35;   // 큰 별: 두 손이 이 시간 안에 모두 닿으면 잡힘
    function spawn(force) {
      const p = env.progress(), r = Math.random();
      const kind = force ? force.kind : r < 0.22 ? "big" : "star";
      stars.push({
        kind, fx: force ? force.fx : 0.12 + Math.random() * 0.76, fy: kind === "big" ? 0.3 : 0.13, hold: kind === "big" ? 1.8 : 0, touch: [-9, -9],
        ph: Math.random() * 6, vy: (0.1 + 0.08 * p) * env.diff.speed * (kind === "big" ? 0.6 : 1) * (env.fever() ? 1.2 : 1),
        trail: [], dead: false, born: 0, x: 0, y: 0,
      });
    }
    const R = () => v.U * 0.055;
    return {
      update(dt) {
        t += dt; spawnT -= dt;
        const p = env.progress(), interval = (1.0 - 0.45 * p) / widthK * (env.fever() ? 0.75 : 1);
        if (spawnT <= 0 && stars.length < Math.ceil(3.5 * widthK)) { spawn(); spawnT = interval; }
        const R0 = R();
        for (const s of stars) {
          s.born = Math.min(1, s.born + dt * 3);
          if (s.hold > 0) s.hold -= dt; else s.fy += s.vy * dt;
          s.x = z.x0 + s.fx * z.w + Math.sin(t * 1.3 + s.ph) * z.w * 0.03; s.y = s.fy * v.H;
          s.trail.push([s.x, s.y]); if (s.trail.length > 10) s.trail.shift();
          const big = s.kind === "big", r = big ? R0 * 1.6 : R0;
          const near = env.tracker.hands.map(h => h.vis && Math.hypot(h.x - s.x, h.y - s.y) < r * 1.4 * env.diff.reach);
          let got = false;
          if (!big) got = near.some(Boolean);
          else {
            near.forEach((n, k) => { if (n) s.touch[k] = t; });
            got = t - s.touch[0] < BOTH && t - s.touch[1] < BOTH;
            if (near.some(Boolean) && !got && !s.hinted) { s.hinted = true; popup(s.x, s.y - r * 1.5, "두 손으로!", { size: v.U * 0.04, color: "#fff", stroke: "#b04ad6" }); }
          }
          if (got) {
            s.dead = true; caught++; if (big) bigN++;
            env.award(big ? 3 : 1, s.x, s.y - r); sfx.catch(env.player.combo); if (big) sfx.fever();
            burst(s.x, s.y, { n: big ? 34 : 14, colors: big ? ["#ffffff", "#ffd400", "#ff8ad8", "#8ad8ff"] : ["#fff6a0", "#ffd400", "#ffffff"], shape: "star", speed: v.U * (big ? 0.9 : 0.6), gravity: v.U * 0.6, size: v.U * 0.02, life: 0.8 });
          } else if (s.fy > 0.97) {
            s.dead = true; missed++; env.miss(s.x, v.H * 0.9, "놓쳤어요");
          }
        }
        stars = stars.filter(s => !s.dead);
      },
      draw(ctx) {
        const R0 = R();
        for (const s of stars) {
          const r = (s.kind === "big" ? R0 * 1.6 : R0) * (0.5 + 0.5 * s.born);
          s.trail.forEach(([x, y], i) => {
            ctx.globalAlpha = (i / s.trail.length) * 0.35; ctx.fillStyle = s.kind === "big" ? "#ff9ae0" : "#fff3a0";
            ctx.beginPath(); ctx.arc(x, y, r * 0.5 * (i / s.trail.length), 0, Math.PI * 2); ctx.fill();
          });
          ctx.globalAlpha = 1;
          const isBig = s.kind === "big";
          ctx.save();
          if (isBig) { ctx.shadowColor = "#ff8ad8"; ctx.shadowBlur = r * (0.6 + 0.4 * Math.sin(t * 8)); }
          starPath(ctx, s.x, s.y, r, 0.48, Math.sin(t * 2 + s.ph) * 0.3);
          const g = ctx.createRadialGradient(s.x - r * 0.2, s.y - r * 0.25, r * 0.05, s.x, s.y, r);
          g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, isBig ? "#ffb3ec" : "#ffe866"); g.addColorStop(1, isBig ? "#c86bff" : "#ffc400");
          ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
          ctx.lineWidth = r * 0.09; ctx.lineJoin = "round"; ctx.strokeStyle = isBig ? "#6a2a9a" : "#a56d00"; ctx.stroke();
          ctx.restore();
          if (isBig) {
            outlinedText(ctx, "🙌", s.x, s.y + r * 0.08, r * 0.62, "#fff", "#6a2a9a");
            // 한 손만 닿아 있으면 그쪽 반원이 빛남
            [0, 1].forEach(k => { if (t - s.touch[k] < BOTH) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.25, k ? -Math.PI / 2 : Math.PI / 2, k ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke(); } });
          }
        }
      },
      result: () => `잡은 별 ${caught} · 큰 별 ${bigN} · 놓침 ${missed}`,
      // 설명 시연용
      get stars() { return stars; },
      forceSpawn(kind, fx) { spawn({ kind, fx }); },
    };
  },
};
