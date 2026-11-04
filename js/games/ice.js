// 얼음 깨기: 손을 빠르게 휘둘러 얼음을 치면 맞은 자리에서 금이 가고, 다 깨면 안에 든 물건이 튀어나옴
import { burst, popup, shake, rr, FONT, rnd, clamp } from "../fx.js?v=60";
import { sfx } from "../audio.js?v=60";
import { bodyRef } from "./bodyref.js?v=60";
import { makeBoss } from "./boss.js?v=60";

const PUNCH = 3.0;      // 타격으로 인정하는 손 속도 (어깨너비/초). 낮출수록 쉬움
const STRONG = 7.5;     // 이 이상이면 강펀치(2타)
const ITEMS = ["🐟", "💎", "🍓", "🐧", "🍬", "🦀", "🎁", "🍩", "🐳", "🍦", "🦖", "🚀", "🦄", "🐙", "🧸", "🍭", "🐢", "🦭", "🍰", "⚽", "🦋", "🐻‍❄️"];
const easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export default {
  id: "ice", title: "얼음 깨기", icon: "🧊", sec: 45, cursor: "🥊", cat: "move", bg: "#74b9ff", desc: "빠르게 쳐서 깨기",
  how: "얼음을 빠르게 쳐서 깨요. 세게 치면 강펀치로 2번! 폭죽 얼음을 깨면 다른 얼음도 한꺼번에 금이 가요. 황금 얼음은 3점! 중간에 거대 얼음 보스가 나와요",
  rush: "얼음 와르르",
  create(env) {
    const z = env.zone, v = env.view;
    const cols = Math.max(1, Math.min(3, Math.floor(z.w / (v.U * 0.36))));
    const S = () => Math.min(z.w / cols * 0.62, v.U * 0.25);
    const ref = bodyRef(env), Y = b => ref.y(b.fy, S() * 1.2);   // fy: 높이를 몸통 길이 단위로 (0 어깨, 1 엉덩이) → 선수 키에 맞춤
    let broken = 0, chain = [], wasRush = false;
    const boss = makeBoss(env, { icon: "🧊", name: "거대 얼음", mode: "hit", ref, color: "#7fd3ff" });   // chain: 폭죽 얼음이 터진 뒤 차례로 맞을 얼음
    function fresh(slot) {
      const p = env.progress(), q = Math.random(), rush = env.rush && env.rush(), lucky = env.catchUp && env.catchUp() ? 0.75 : 0.9;
      const boom = !rush && p > 0.1 && q < 0.15, gold = !boom && p > 0.15 && q > lucky;   // 황금 얼음: 한 번 더 쳐야 하고 3점
      const hp = rush ? 1 : Math.max(2, (boom ? 4 : p > 0.5 ? 4 : 3) + env.diff.hp + (gold ? 1 : 0));   // 와르르: 한 방에 깨지는 얼음
      return { fx: slot.fx, fy: slot.fy, hp, max: hp, boom, gold, item: boom ? "🧨" : gold ? "👑" : ITEMS[rnd(0, ITEMS.length - 1)], cracks: [], cool: [0, 0], shake: 0, broken: false, respawn: 0, born: 0, hint: 0 };
    }
    const blocks = [];
    // 무작위 위치: 서로 겹치지 않고, 손이 닿는 높이(얼굴 높이 ~ 엉덩이 높이) 안에서
    function randomSpot(except) {
      const s = S(), others = blocks.filter(o => o !== except && !o.broken);
      let best = null, bestGap = -1;
      for (let i = 0; i < 40; i++) {
        const fx = 0.1 + Math.random() * 0.8, fy = -0.4 + Math.random() * 1.45, x = z.x0 + fx * z.w, y = ref.y(fy, S() * 1.2);
        if (x - s / 2 < z.x0 + 4 || x + s / 2 > z.x1 - 4) continue;
        const gap = others.length ? Math.min(...others.map(o => Math.hypot(z.x0 + o.fx * z.w - x, Y(o) - y))) : 1e9;
        if (gap > s * 1.25) return { fx, fy };
        if (gap > bestGap) { bestGap = gap; best = { fx, fy }; }
      }
      return best || { fx: 0.5, fy: 0.4 };
    }
    for (let i = 0; i < cols * 2; i++) { const b = fresh({ fx: 0, fy: 0 }); blocks.push(b); Object.assign(b, randomSpot(b)); }

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
      b.broken = true; b.respawn = env.rush && env.rush() ? 0.25 : 1.0 + Math.random() * 0.8; broken++;
      if (b.gold && env.stat) env.stat("gold");
      sfx.shatter(); shake(v.U * 0.015, 0.25);
      burst(cx, cy, { n: 28, colors: b.boom ? ["#ffd04d", "#ff7a2f", "#ffffff"] : ["#ffffff", "#d6f2ff", "#9fdcff"], shape: "shard", speed: v.U * 1.1, gravity: v.U * 2.4, size: v.U * 0.022, life: 0.9 });
      env.award(b.gold ? 3 : 1, cx, cy - s * 0.45);
      if (b.gold) popup(cx, cy - s * 0.75, "황금 얼음!", { size: v.U * 0.05, color: "#fff", stroke: "#c99700" });
      if (b.boom) {   // 펑! 남은 얼음 모두에 한 번씩 금이 감 (가까운 것부터 차례로)
        sfx.bomb(); shake(v.U * 0.02, 0.35);
        burst(cx, cy, { n: 30, colors: ["#ff4d4d", "#ffd400", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 1.3, gravity: v.U * 0.8, size: v.U * 0.02, life: 1.0 });
        popup(cx, cy - s * 0.7, "펑! 연쇄!", { size: v.U * 0.06, color: "#fff", stroke: "#e0501b" });
        blocks.filter(o => o !== b && !o.broken).map(o => ({ o, d: Math.hypot(z.x0 + o.fx * z.w - cx, Y(o) - cy) }))
          .sort((a, c) => a.d - c.d).forEach(({ o }, i) => chain.push({ b: o, t: 0.15 + i * 0.12, x: cx, y: cy }));
      } else popup(cx, cy, b.item, { size: v.U * 0.12, emoji: true, vy: -v.U * 0.35, life: 1.0 });
    }
    return {
      update(dt) {
        ref.update(dt); boss.update(dt);
        const s = S(), hands = env.tracker.hands, rush = env.rush && env.rush();
        if (rush && !wasRush) blocks.forEach(b => { if (!b.broken) { b.hp = 1; b.boom = false; } });   // 와르르 시작: 남은 얼음도 한 방에
        wasRush = !!rush;
        for (const c of chain) {
          c.t -= dt;
          if (c.t > 0 || c.b.broken) continue;
          const b = c.b, cx = z.x0 + b.fx * z.w, cy = Y(b);
          b.hp--; b.shake = 0.2; addCracks(b, clamp((c.x - cx) / s, -0.42, 0.42), clamp((c.y - cy) / s, -0.42, 0.42)); sfx.hit(2);
          burst(cx, cy, { n: 8, colors: ["#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.4, gravity: v.U, size: v.U * 0.013, life: 0.5 });
          if (b.hp <= 0) breakIt(b, cx, cy, s);
        }
        chain = chain.filter(c => c.t > 0 && !c.b.broken);
        for (const b of blocks) {
          b.born = Math.min(1, b.born + dt * 4); b.shake = Math.max(0, b.shake - dt); b.hint = Math.max(0, b.hint - dt);
          b.cool[0] = Math.max(0, b.cool[0] - dt); b.cool[1] = Math.max(0, b.cool[1] - dt);
          if (b.broken) { b.respawn -= dt; if (b.respawn <= 0 && !boss.active) Object.assign(b, fresh(randomSpot(b))); continue; }
          if (boss.active) continue;   // 보스와 싸우는 동안 얼음은 잠시 멈춤   // 다른 자리에서 새 얼음
          const cx = z.x0 + b.fx * z.w, cy = Y(b);
          hands.forEach((h, k) => {
            if (b.broken || !h.vis || b.cool[k] > 0) return;
            if (Math.abs(h.x - cx) > s * 0.6 || Math.abs(h.y - cy) > s * 0.6) return;
            // 얼음 쪽으로 다가가는 손만 타격으로 인정 (친 뒤 손을 빼는 동작은 무시)
            if ((cx - h.x) * h.vx + (cy - h.y) * h.vy <= 0) return;
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
        const A = boss.active ? 0.3 : 1; ctx.save(); ctx.globalAlpha = A;
        for (const b of blocks) {
          if (b.broken) continue;
          const cx = z.x0 + b.fx * z.w, cy = Y(b), k = 0.6 + 0.4 * easeOutBack(b.born);
          const jx = b.shake > 0 ? (Math.random() - 0.5) * s * 0.08 : 0, dmg = 1 - b.hp / b.max;
          ctx.save(); ctx.translate(cx + jx, cy); ctx.scale(k, k);
          ctx.fillStyle = "rgba(0,0,0,.22)"; rr(ctx, -half + 6, -half + 8, s, s, r); ctx.fill();
          // 얼음 속 물건: 금이 갈수록 또렷해짐 (폭죽은 처음부터 보임)
          ctx.globalAlpha = A * (b.boom ? 0.85 : 0.3 + 0.7 * dmg); ctx.font = `${Math.round(s * 0.5)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(b.item, 0, 0); ctx.globalAlpha = A;
          const a = (0.78 - 0.38 * dmg).toFixed(2);
          const g = ctx.createLinearGradient(-half, -half, half, half);
          if (b.boom) { g.addColorStop(0, `rgba(255,236,220,${a})`); g.addColorStop(0.5, `rgba(255,160,120,${a})`); g.addColorStop(1, `rgba(230,90,60,${a})`); }
          else if (b.gold) { g.addColorStop(0, `rgba(255,252,220,${a})`); g.addColorStop(0.5, `rgba(255,222,90,${a})`); g.addColorStop(1, `rgba(230,170,20,${a})`); }
          else { g.addColorStop(0, `rgba(236,250,255,${a})`); g.addColorStop(0.5, `rgba(170,225,255,${a})`); g.addColorStop(1, `rgba(110,190,240,${a})`); }
          rr(ctx, -half, -half, s, s, r); ctx.fillStyle = g; ctx.fill();
          ctx.lineWidth = s * 0.035; ctx.strokeStyle = b.boom ? "#c0401b" : b.gold ? "#b88a00" : "#3a8fc7"; ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = s * 0.045; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(-half * 0.68, -half * 0.3); ctx.lineTo(-half * 0.3, -half * 0.68); ctx.moveTo(-half * 0.68, 0.05 * half); ctx.lineTo(-half * 0.5, -half * 0.12); ctx.stroke();
          // 금
          ctx.save(); rr(ctx, -half, -half, s, s, r); ctx.clip(); ctx.lineJoin = "round";
          for (const c of b.cracks) {
            ctx.beginPath(); c.forEach(([px, py], j) => j ? ctx.lineTo(px * s, py * s) : ctx.moveTo(px * s, py * s));
            ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = s * 0.03; ctx.stroke();
            ctx.strokeStyle = b.boom ? "#7a2a00" : "#1d5f8f"; ctx.lineWidth = s * 0.014; ctx.stroke();
          }
          ctx.restore();
          // 남은 타격 수
          for (let i = 0; i < b.max; i++) {
            ctx.beginPath(); ctx.arc((i - (b.max - 1) / 2) * s * 0.15, half + s * 0.11, s * 0.045, 0, Math.PI * 2);
            ctx.fillStyle = i < b.hp ? (b.boom ? "#ff7a2f" : "#ffffff") : "rgba(255,255,255,.25)"; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = "#1d3f5f"; ctx.stroke();
          }
          ctx.restore();
        }
        ctx.restore();
        boss.draw(ctx);
      },
      get boss() { return boss; },
      result: () => `깬 얼음 ${broken}개`,
      // 설명 시연용: 아직 안 깨진 얼음과 화면 위치
      get targets() { return blocks.filter(b => !b.broken && b.born > 0.9).map(b => ({ b, x: z.x0 + b.fx * z.w, y: Y(b), s: S() })); },
    };
  },
};
