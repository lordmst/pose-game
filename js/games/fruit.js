// 과일 자르기: 아래에서 던져 올린 과일을 손을 빠르게 휘둘러 자르기. 폭탄은 피하기
import { burst, popup, shake, FONT, rnd } from "../fx.js?v=28";
import { sfx } from "../audio.js?v=28";

const SLICE = 3.0;   // 자르기로 인정하는 손 속도 (어깨너비/초)
const FRUITS = [["🍉", "#ff4d6d"], ["🍎", "#e8323c"], ["🍊", "#ff9a1f"], ["🍌", "#ffd23d"], ["🍍", "#f5c400"], ["🍓", "#e8323c"], ["🥝", "#8bc34a"], ["🍑", "#ffa07a"], ["🍇", "#8e44ad"], ["🥥", "#f0f0f0"]];

// 점 p와 선분 ab 사이 거리 (빠른 손이 한 프레임 사이에 과일을 '지나간' 경우도 잡기 위함)
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export default {
  id: "fruit", title: "과일 자르기", icon: "🍉", sec: 45, cursor: "✋", cat: "move", bg: "#ffb3c1", desc: "휘둘러서 과일 자르기",
  how: "손을 빠르게 휘둘러 날아오르는 과일을 잘라요. 한 번에 여러 개면 보너스! 폭탄은 피하기",
  create(env) {
    const z = env.zone, v = env.view;
    let items = [], halves = [], spawnT = 0.6, t = 0, cut = 0, missed = 0, bombs = 0;
    const trails = [[], []], streak = [{ n: 0, t: -9 }, { n: 0, t: -9 }];
    const R = () => v.U * 0.07;
    function launch(kind, fxForce) {
      const sp = env.diff.speed, fx = fxForce != null ? fxForce : 0.18 + Math.random() * 0.64;
      const x = z.x0 + fx * z.w, y0 = v.H * 1.08, peak = v.H * (0.18 + Math.random() * 0.25);
      const g = v.H * 1.1 * sp * sp;                          // 난이도가 높을수록 빨리 날아감
      const vy = -Math.sqrt(2 * g * (y0 - peak)), flight = -2 * vy / g;
      const land = z.x0 + z.w * (0.2 + Math.random() * 0.6);
      const f = FRUITS[rnd(0, FRUITS.length - 1)];
      items.push({ kind, emoji: kind === "bomb" ? "💣" : f[0], color: f[1], x, y: y0, vx: (land - x) / flight, vy, g, rot: 0, vr: (Math.random() - 0.5) * 5, dead: false });
    }
    function slice(it, h, k) {
      it.dead = true;
      if (it.kind === "bomb") {
        bombs++; sfx.bomb(); shake(v.U * 0.022, 0.4); env.penalty(1, it.x, it.y - R(), "펑!");
        burst(it.x, it.y, { n: 18, colors: ["#555", "#888", "#333"], shape: "smoke", speed: v.U * 0.4, gravity: -v.U * 0.3, size: R() * 0.9, life: 0.8 });
        burst(it.x, it.y, { n: 16, colors: ["#ffb000", "#ff5a00", "#fff27a"], speed: v.U * 1.0, gravity: v.U, size: v.U * 0.015, life: 0.5 });
        return;
      }
      cut++; sfx.slice(); setTimeout(() => sfx.squish(), 40);
      const ang = Math.atan2(h.vy, h.vx) + Math.PI / 2;
      [-1, 1].forEach(side => halves.push({ emoji: it.emoji, x: it.x, y: it.y, vx: it.vx + Math.cos(ang) * side * v.U * 0.35, vy: Math.min(it.vy, 0) * 0.3 - v.U * 0.15, g: it.g, rot: ang - Math.PI / 2, vr: side * 3, side, life: 1.1 }));
      burst(it.x, it.y, { n: 18, colors: [it.color, it.color, "#ffffff"], speed: v.U * 0.7, gravity: v.U * 1.6, size: v.U * 0.016, life: 0.6 });
      const s = streak[k];
      s.n = t - s.t < 0.35 ? s.n + 1 : 1; s.t = t;
      env.award(1, it.x, it.y - R());
      if (s.n >= 2) { popup(it.x, it.y - R() * 2.2, `${s.n}개 연속!`, { size: v.U * 0.05, color: "#ffe14d", stroke: "#b34700" }); env.award(1, it.x, it.y - R() * 3.2); }
    }
    return {
      update(dt) {
        t += dt; spawnT -= dt;
        const p = env.progress();
        if (spawnT <= 0) {
          const n = 1 + (Math.random() < 0.3 + p * 0.4 ? 1 : 0) + (p > 0.5 && Math.random() < 0.3 ? 1 : 0);
          for (let i = 0; i < n; i++) launch(p > 0.1 && Math.random() < 0.12 * env.diff.bomb ? "bomb" : "fruit");
          spawnT = (1.5 - 0.6 * p) * (env.fever() ? 0.7 : 1);
        }
        const hands = env.tracker.hands, need = SLICE * env.diff.punch, r = R();
        hands.forEach((h, k) => {
          const tr = trails[k];
          if (h.vis) tr.push({ x: h.x, y: h.y, t, fast: h.bodySpeed > need }); else tr.length = 0;
          while (tr.length && t - tr[0].t > 0.2) tr.shift();
        });
        for (const it of items) {
          if (it.dead) continue;
          it.vy += it.g * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
          for (let k = 0; k < 2; k++) {
            const h = hands[k];
            if (!h.vis || h.bodySpeed < need) continue;
            const tr = trails[k], a = tr.length > 1 ? tr[tr.length - 2] : h;
            if (segDist(it, a, h) < r * env.diff.reach) { slice(it, h, k); break; }
          }
          if (!it.dead && it.vy > 0 && it.y > v.H * 1.12) { it.dead = true; if (it.kind === "fruit") { missed++; env.miss(it.x, v.H, null); } }
        }
        items = items.filter(i => !i.dead);
        for (const hf of halves) { hf.vy += hf.g * dt; hf.x += hf.vx * dt; hf.y += hf.vy * dt; hf.rot += hf.vr * dt; hf.life -= dt; }
        halves = halves.filter(hf => hf.life > 0);
      },
      draw(ctx) {
        const r = R();
        // 칼날 자국: 빠르게 움직인 손의 궤적
        ctx.lineCap = "round";
        trails.forEach(tr => {
          for (let i = 1; i < tr.length; i++) {
            const a = tr[i - 1], b = tr[i]; if (!b.fast) continue;
            const k = i / tr.length;
            ctx.strokeStyle = `rgba(255,255,255,${(0.2 + 0.75 * k).toFixed(2)})`; ctx.lineWidth = 2 + v.U * 0.022 * k;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        });
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `${Math.round(r * 1.9)}px ${FONT}`;
        for (const it of items) {
          ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
          if (it.kind === "bomb") { ctx.shadowColor = "#ff3030"; ctx.shadowBlur = r * (0.5 + 0.4 * Math.sin(t * 12)); }
          ctx.fillText(it.emoji, 0, 0); ctx.restore();
        }
        for (const hf of halves) {
          ctx.save(); ctx.globalAlpha = Math.min(1, hf.life * 2); ctx.translate(hf.x, hf.y); ctx.rotate(hf.rot);
          ctx.beginPath(); ctx.rect(hf.side < 0 ? -r * 1.3 : 0, -r * 1.3, r * 1.3, r * 2.6); ctx.clip();
          ctx.font = `${Math.round(r * 1.9)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(hf.emoji, 0, 0);
          ctx.restore();
        }
      },
      result: () => `자른 과일 ${cut} · 놓침 ${missed} · 폭탄 ${bombs}`,
      // 설명 시연용
      get items() { return items; },
      forceLaunch(kind, fx) { launch(kind, fx); },
    };
  },
};
