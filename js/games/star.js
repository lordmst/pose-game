// 별 따기: 떨어지는 별을 손으로 잡기. 큰 별은 두 손으로 함께 잡아야 함(3점)
import { burst, popup, outlinedText, starPath } from "../fx.js?v=65";
import { sfx } from "../audio.js?v=65";
import { bodyRef } from "./bodyref.js?v=65";
import { makeBoss } from "./boss.js?v=65";

export default {
  id: "star", title: "별 따기", icon: "⭐", sec: 45, cursor: "✋", cat: "move", bg: "#55efc4", desc: "큰 별은 두 손으로",
  how: "떨어지는 별을 손으로 잡아요. 반짝이는 큰 별은 두 손으로 함께 잡으면 3점! 비스듬히 날아가는 파란 별똥별은 2점. 중간에 별 대왕 보스가 나와요",
  rush: "별 비",
  create(env) {
    const z = env.zone, v = env.view, widthK = Math.max(0.6, z.w / v.U);
    let stars = [], spawnT = 0.4, t = 0, caught = 0, missed = 0, bigN = 0;
    const BOTH = 0.35;
    const ref = bodyRef(env), boss = makeBoss(env, { icon: "🌟", name: "별 대왕", mode: "touch", ref, color: "#ffd400" });   // 큰 별: 두 손이 이 시간 안에 모두 닿으면 잡힘
    function spawn(force) {
      const p = env.progress(), r = Math.random();
      // 별똥별(comet): 비스듬히 빠르게 지나감, 2점
      const rush = env.rush && env.rush(), lucky = env.catchUp && env.catchUp() ? 0.72 : 0.88;   // 별 비: 작은 별이 쏟아짐 · 따라잡기 중이면 별똥별이 더 자주
      const kind = force ? force.kind : rush ? (r > 0.9 ? "comet" : "star") : r < 0.22 ? "big" : p > 0.12 && r > lucky ? "comet" : "star";
      const fx0 = force ? force.fx : kind === "comet" ? (Math.random() < 0.5 ? 0.1 : 0.9) : 0.12 + Math.random() * 0.76;
      stars.push({
        kind, fx: fx0, fy: kind === "big" ? 0.3 : 0.13, hold: kind === "big" ? 1.8 : 0, touch: [-9, -9],
        ph: Math.random() * 6, vy: (0.1 + 0.08 * p) * env.diff.speed * (kind === "big" ? 0.6 : kind === "comet" ? 1.5 : 1) * (env.fever() ? 1.2 : 1),
        vx: kind === "comet" ? (fx0 < 0.5 ? 1 : -1) * (0.16 + Math.random() * 0.08) * env.diff.speed : 0,
        trail: [], dead: false, born: 0, x: 0, y: 0,
      });
    }
    const R = () => v.U * 0.055;
    return {
      update(dt) {
        t += dt; spawnT -= dt; ref.update(dt); boss.update(dt);
        const rush = env.rush && env.rush(), p = env.progress(), interval = (1.0 - 0.45 * p) / widthK * (env.fever() ? 0.75 : 1) * (rush ? 0.3 : 1);
        if (spawnT <= 0 && !boss.active && stars.length < Math.ceil(3.5 * widthK * (rush ? 2.5 : 1))) { spawn(); spawnT = interval; }
        const R0 = R();
        for (const s of stars) {
          s.born = Math.min(1, s.born + dt * 3);
          if (s.hold > 0) s.hold -= dt; else { s.fy += s.vy * dt; s.fx = Math.max(0.05, Math.min(0.95, s.fx + s.vx * dt)); }
          s.x = z.x0 + s.fx * z.w + (s.kind === "comet" ? 0 : Math.sin(t * 1.3 + s.ph) * z.w * 0.03); s.y = s.fy * v.H;
          s.trail.push([s.x, s.y]); if (s.trail.length > (s.kind === "comet" ? 18 : 10)) s.trail.shift();
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
            env.award(big ? 3 : s.kind === "comet" ? 2 : 1, s.x, s.y - r); sfx.catch(env.player.combo); if (big) sfx.fever();
            if (s.kind === "comet" && env.stat) env.stat("gold");
            if (s.kind === "comet") popup(s.x, s.y - r * 1.8, "별똥별!", { size: v.U * 0.045, color: "#fff", stroke: "#1f7ad6" });
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
            const cm = s.kind === "comet";
            ctx.globalAlpha = (i / s.trail.length) * (cm ? 0.7 : 0.35); ctx.fillStyle = s.kind === "big" ? "#ff9ae0" : cm ? "#9ee7ff" : "#fff3a0";
            ctx.beginPath(); ctx.arc(x, y, r * (cm ? 0.8 : 0.5) * (i / s.trail.length), 0, Math.PI * 2); ctx.fill();
          });
          ctx.globalAlpha = 1;
          const isBig = s.kind === "big";
          ctx.save();
          if (isBig) { ctx.shadowColor = "#ff8ad8"; ctx.shadowBlur = r * (0.6 + 0.4 * Math.sin(t * 8)); }
          starPath(ctx, s.x, s.y, r, 0.48, Math.sin(t * 2 + s.ph) * 0.3);
          const g = ctx.createRadialGradient(s.x - r * 0.2, s.y - r * 0.25, r * 0.05, s.x, s.y, r);
          const isComet = s.kind === "comet";
          g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, isBig ? "#ffb3ec" : isComet ? "#9ee7ff" : "#ffe866"); g.addColorStop(1, isBig ? "#c86bff" : isComet ? "#1f9ad6" : "#ffc400");
          ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
          ctx.lineWidth = r * 0.09; ctx.lineJoin = "round"; ctx.strokeStyle = isBig ? "#6a2a9a" : isComet ? "#0b4f8a" : "#a56d00"; ctx.stroke();
          if (isComet) outlinedText(ctx, "2", s.x, s.y + r * 0.05, r * 0.6, "#fff", "#0b4f8a");
          ctx.restore();
          if (isBig) {
            outlinedText(ctx, "🙌", s.x, s.y + r * 0.08, r * 0.62, "#fff", "#6a2a9a");
            // 한 손만 닿아 있으면 그쪽 반원이 빛남
            [0, 1].forEach(k => { if (t - s.touch[k] < BOTH) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.25, k ? -Math.PI / 2 : Math.PI / 2, k ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke(); } });
          }
        }
        boss.draw(ctx);
      },
      get boss() { return boss; },
      result: () => `잡은 별 ${caught} · 큰 별 ${bigN} · 놓침 ${missed}`,
      // 설명 시연용
      get stars() { return stars; },
      forceSpawn(kind, fx) { spawn({ kind, fx }); },
    };
  },
};
