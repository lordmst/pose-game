// 얼음 깨기: 손을 빠르게 휘둘러 얼음을 치면 맞은 자리에서 금이 가고, 다 깨면 안에 든 물건이 튀어나옴
import { burst, popup, shake, rr, FONT, rnd, clamp } from "../fx.js?v=13";
import { sfx } from "../audio.js?v=13";

const PUNCH = 3.0;      // 타격으로 인정하는 손 속도 (어깨너비/초). 낮출수록 쉬움
const STRONG = 7.5;     // 이 이상이면 강펀치(2타)
const ITEMS = ["🐟", "💎", "🍓", "🐧", "🍬", "🦀", "🎁", "🍩", "🐳", "🍦", "🦖", "🚀"];
const easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export default {
  id: "ice", title: "얼음 깨기", icon: "🧊", sec: 45, cursor: "🥊",
  how: "얼음을 빠르게 쳐서 깨요. 세게 치면 강펀치로 2번! 금색 얼음은 3점",
  create(env) {
    const z = env.zone, v = env.view;
    const cols = Math.max(1, Math.min(3, Math.floor(z.w / (v.U * 0.36))));
    const S = () => Math.min(z.w / cols * 0.62, v.U * 0.25);
    let broken = 0;
    function fresh(slot) {
      const p = env.progress(), gold = p > 0.1 && Math.random() < 0.15, hp = Math.max(2, (gold ? 5 : p > 0.5 ? 4 : 3) + env.diff.hp);
      return { fx: slot.fx, fy: slot.fy, hp, max: hp, gold, item: ITEMS[rnd(0, ITEMS.length - 1)], cracks: [], cool: [0, 0], shake: 0, broken: false, respawn: 0, born: 0, hint: 0 };
    }
    const blocks = [];
    for (const fy of [0.42, 0.76]) for (let c = 0; c < cols; c++) blocks.push(fresh({ fx: (c + 0.5) / cols, fy }));

    function addCracks(b, ix, iy) {
      const n = 3 + rnd(0, 1);
      for (let i = 0; i < n; i++) {
        let a = Math.random() * Math.PI * 2, x = ix, y = iy; const pts = [[x, y]];
        for (let j = 0, segs = 3 + rnd(0, 2); j < segs; j++) {
          a += (Math.random() - 0.5) * 0.9; const len = 0.08 + Math.random() * 0.1;
          x = clamp(x + Math.cos(a) * len, -0.48, 0.48); y = clamp(y + Math.sin(a) * len, -0.48, 0.48); pts.push([x, y]);
        }
        b.cracks.push(pts);
      }
    }
    function breakIt(b, cx, cy, s) {
      b.broken = true; b.respawn = 1.0 + Math.random() * 0.8; broken++;
      sfx.shatter(); shake(v.U * 0.015, 0.25);
      burst(cx, cy, { n: 28, colors: b.gold ? ["#fff3c4", "#ffd04d", "#ffffff"] : ["#ffffff", "#d6f2ff", "#9fdcff"], shape: "shard", speed: v.U * 1.1, gravity: v.U * 2.4, size: v.U * 0.022, life: 0.9 });
      popup(cx, cy, b.item, { size: v.U * 0.12, emoji: true, vy: -v.U * 0.35, life: 1.0 });
      env.award(b.gold ? 3 : 1, cx, cy - s * 0.45);
    }
    return {
      update(dt) {
        const s = S(), hands = env.tracker.hands;
        for (const b of blocks) {
          b.born = Math.min(1, b.born + dt * 4); b.shake = Math.max(0, b.shake - dt); b.hint = Math.max(0, b.hint - dt);
          b.cool[0] = Math.max(0, b.cool[0] - dt); b.cool[1] = Math.max(0, b.cool[1] - dt);
          if (b.broken) { b.respawn -= dt; if (b.respawn <= 0) Object.assign(b, fresh(b)); continue; }
          const cx = z.x0 + b.fx * z.w, cy = b.fy * v.H;
          hands.forEach((h, k) => {
            if (b.broken || !h.vis || b.cool[k] > 0) return;
            if (Math.abs(h.x - cx) > s * 0.6 || Math.abs(h.y - cy) > s * 0.6) return;
            if (h.bodySpeed < PUNCH * env.diff.punch) {
              if (h.bodySpeed > 1.2 && b.hint === 0) { popup(cx, cy - s * 0.7, "더 빠르게!", { size: v.U * 0.04, color: "#fff", stroke: "#2a7bb5" }); b.hint = 2; }
              return;
            }
            const strong = h.bodySpeed >= STRONG * env.diff.punch;
            b.cool[k] = 0.3; b.shake = 0.18;
            const ix = clamp((h.x - cx) / s, -0.42, 0.42), iy = clamp((h.y - cy) / s, -0.42, 0.42);
            for (let n = 0; n < (strong ? 2 : 1) && b.hp > 0; n++) { b.hp--; addCracks(b, ix, iy); }
            sfx.hit(b.max - b.hp);
            burst(h.x, h.y, { n: strong ? 16 : 9, colors: ["#ffffff", "#bfe9ff", "#8fd3ff"], shape: "shard", speed: v.U * 0.7, gravity: v.U * 2, size: v.U * 0.013, angle: Math.atan2(h.vy, h.vx), spread: 2.2, life: 0.6 });
            shake(strong ? v.U * 0.012 : v.U * 0.005, 0.15);
            if (strong) popup(cx, cy - s * 0.7, "강펀치!", { size: v.U * 0.055, color: "#fff", stroke: "#d0451b" });
            if (b.hp <= 0) breakIt(b, cx, cy, s);
          });
        }
      },
      draw(ctx) {
        const s = S(), half = s / 2, r = s * 0.12;
        for (const b of blocks) {
          if (b.broken) continue;
          const cx = z.x0 + b.fx * z.w, cy = b.fy * v.H, k = 0.6 + 0.4 * easeOutBack(b.born);
          const jx = b.shake > 0 ? (Math.random() - 0.5) * s * 0.08 : 0, dmg = 1 - b.hp / b.max;
          ctx.save(); ctx.translate(cx + jx, cy); ctx.scale(k, k);
          ctx.fillStyle = "rgba(0,0,0,.22)"; rr(ctx, -half + 6, -half + 8, s, s, r); ctx.fill();
          // 얼음 속 물건: 금이 갈수록 또렷해짐
          ctx.globalAlpha = 0.3 + 0.7 * dmg; ctx.font = `${Math.round(s * 0.5)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(b.item, 0, 0); ctx.globalAlpha = 1;
          const a = (0.78 - 0.38 * dmg).toFixed(2);
          const g = ctx.createLinearGradient(-half, -half, half, half);
          if (b.gold) { g.addColorStop(0, `rgba(255,246,200,${a})`); g.addColorStop(0.5, `rgba(255,214,90,${a})`); g.addColorStop(1, `rgba(230,165,20,${a})`); }
          else { g.addColorStop(0, `rgba(236,250,255,${a})`); g.addColorStop(0.5, `rgba(170,225,255,${a})`); g.addColorStop(1, `rgba(110,190,240,${a})`); }
          rr(ctx, -half, -half, s, s, r); ctx.fillStyle = g; ctx.fill();
          ctx.lineWidth = s * 0.035; ctx.strokeStyle = b.gold ? "#c98a00" : "#3a8fc7"; ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = s * 0.045; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(-half * 0.68, -half * 0.3); ctx.lineTo(-half * 0.3, -half * 0.68); ctx.moveTo(-half * 0.68, 0.05 * half); ctx.lineTo(-half * 0.5, -half * 0.12); ctx.stroke();
          // 금
          ctx.save(); rr(ctx, -half, -half, s, s, r); ctx.clip(); ctx.lineJoin = "round";
          for (const c of b.cracks) {
            ctx.beginPath(); c.forEach(([px, py], j) => j ? ctx.lineTo(px * s, py * s) : ctx.moveTo(px * s, py * s));
            ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = s * 0.03; ctx.stroke();
            ctx.strokeStyle = b.gold ? "#7a4e00" : "#1d5f8f"; ctx.lineWidth = s * 0.014; ctx.stroke();
          }
          ctx.restore();
          // 남은 타격 수
          for (let i = 0; i < b.max; i++) {
            ctx.beginPath(); ctx.arc((i - (b.max - 1) / 2) * s * 0.15, half + s * 0.11, s * 0.045, 0, Math.PI * 2);
            ctx.fillStyle = i < b.hp ? (b.gold ? "#ffd04d" : "#ffffff") : "rgba(255,255,255,.25)"; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = "#1d3f5f"; ctx.stroke();
          }
          ctx.restore();
        }
      },
      result: () => `깬 얼음 ${broken}개`,
    };
  },
};
