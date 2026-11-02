// 두더지 잡기: 구멍에서 튀어나온 두더지를 주먹으로 콩! 헬멧 두더지는 두 번 쳐야 함(2점), 토끼는 치면 안 됨
import { burst, popup, shake, outlinedText, FONT, rnd, clamp } from "../fx.js?v=47";
import { sfx } from "../audio.js?v=47";

const PUNCH = 3.0;          // 타격 인정 속도 (얼음 깨기와 같음)
const POP = 0.15;           // 올라오고 내려가는 시간

export default {
  id: "mole", title: "두더지 잡기", icon: "🐹", sec: 45, cursor: "👊", cat: "move", bg: "#d4a373", desc: "헬멧은 두 번 콩!",
  how: "구멍에서 튀어나온 두더지를 주먹으로 빠르게 콩! 헬멧 쓴 두더지는 두 번 쳐야 해요(2점). 토끼는 치면 안 돼요",
  create(env) {
    const z = env.zone, v = env.view;
    const cols = clamp(Math.floor(z.w / (v.U * 0.3)), 2, 4);
    const holes = [];
    for (const fy of [0.46, 0.76]) for (let c = 0; c < cols; c++) holes.push({ fx: (c + 0.5) / cols, fy, state: "empty", t: 0, up: 0, kind: "mole", cool: [0, 0], hint: 0 });
    let spawnT = 0.5, hits = 0, missed = 0, rabbits = 0, manual = false;   // manual: 설명 시연에서 직접 띄울 때 저절로 나오지 않게
    const HR = () => Math.min(z.w / cols * 0.32, v.U * 0.1);           // 구멍 반지름
    const pos = h => ({ x: z.x0 + h.fx * z.w, y: h.fy * v.H });
    function popUp(h, kind) {
      const p = env.progress();
      h.kind = kind || (p > 0.1 && Math.random() < 0.15 * env.diff.bomb ? "rabbit" : Math.random() < 0.18 ? "helmet" : "mole");
      h.state = "up"; h.t = 0; h.up = (1.7 - 0.6 * p) / env.diff.speed * (h.kind === "helmet" ? 1.5 : 1); h.armor = h.kind === "helmet" ? 1 : 0;
    }
    function bonk(h, hand) {
      const { x, y } = pos(h), r = HR();
      if (h.armor > 0) {   // 헬멧이 먼저 벗겨짐
        h.armor--; h.knock = 0.35; sfx.hit(1); shake(v.U * 0.006, 0.12);
        burst(x, y - r * 1.2, { n: 10, colors: ["#e23b3b", "#ffffff", "#ffd400"], shape: "shard", speed: v.U * 0.5, gravity: v.U * 1.5, size: v.U * 0.015, life: 0.6 });
        popup(x, y - r * 2.2, "한 번 더!", { size: v.U * 0.04, color: "#fff", stroke: "#e23b3b" });
        return;
      }
      h.state = "hit"; h.t = 0;
      if (h.kind === "rabbit") {
        rabbits++; sfx.bad(); shake(v.U * 0.012, 0.25); env.penalty(1, x, y - r * 2, "토끼는 안 돼요!");
        return;
      }
      hits++; sfx.bonk(); shake(v.U * 0.008, 0.15);
      burst(x, y - r * 0.8, { n: 12, colors: ["#ffe14d", "#ffffff", "#ffb000"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.6, size: v.U * 0.018, life: 0.6 });
      env.award(h.kind === "helmet" ? 2 : 1, x, y - r * 2);
    }
    return {
      update(dt) {
        const p = env.progress(), r = HR(), hands = env.tracker.hands;
        spawnT -= dt;
        const upNow = holes.filter(h => h.state !== "empty").length;
        if (!manual && spawnT <= 0 && upNow < Math.ceil(holes.length / 2)) {
          const free = holes.filter(h => h.state === "empty");
          if (free.length) popUp(free[rnd(0, free.length - 1)]);
          spawnT = (1.0 - 0.45 * p) / env.diff.speed * (env.fever() ? 0.7 : 1);
        }
        for (const h of holes) {
          h.t += dt; h.knock = Math.max(0, (h.knock || 0) - dt); h.cool[0] = Math.max(0, h.cool[0] - dt); h.cool[1] = Math.max(0, h.cool[1] - dt); h.hint = Math.max(0, h.hint - dt);
          if (h.state === "up" && h.t > h.up) { h.state = "down"; h.t = 0; if (h.kind !== "rabbit") { missed++; env.miss(pos(h).x, pos(h).y, null); } }
          if ((h.state === "down" && h.t > POP) || (h.state === "hit" && h.t > 0.55)) { h.state = "empty"; h.t = 0; }
          if (h.state !== "up" || h.t < POP * 0.6) continue;
          const { x, y } = pos(h), cy = y - r * 0.6;
          hands.forEach((hd, k) => {
            if (h.state !== "up" || !hd.vis || h.cool[k] > 0) return;
            if (Math.hypot(hd.x - x, hd.y - cy) > r * 1.25 * env.diff.reach) return;
            if ((x - hd.x) * hd.vx + (cy - hd.y) * hd.vy <= 0) return;   // 두더지 쪽으로 다가가는 손만 (손 빼는 동작은 무시)
            if (hd.bodySpeed < PUNCH * env.diff.punch) {
              if (hd.bodySpeed > 1.2 && h.hint === 0 && h.kind !== "rabbit") { popup(x, y - r * 2.2, "더 빠르게!", { size: v.U * 0.035, color: "#fff", stroke: "#8a5a2b" }); h.hint = 2; }
              return;
            }
            h.cool[k] = 0.3; bonk(h, hd);
          });
        }
      },
      draw(ctx) {
        const r = HR();
        for (const h of holes) {
          const { x, y } = pos(h);
          // 구멍 뒤쪽
          ctx.fillStyle = "#3b2414"; ctx.beginPath(); ctx.ellipse(x, y, r * 1.15, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
          // 튀어나온 정도 (0~1)
          let k = 0;
          if (h.state === "up") k = Math.min(1, h.t / POP);
          else if (h.state === "down") k = 1 - Math.min(1, h.t / POP);
          else if (h.state === "hit") k = 1 - Math.max(0, (h.t - 0.3) / 0.25);
          if (k > 0) {
            ctx.save();
            ctx.beginPath(); ctx.rect(x - r * 1.6, y - r * 3, r * 3.2, r * 3); ctx.clip();   // 구멍 위만 보이게
            const by = y + r * 0.2 - k * r * 1.5, squash = h.state === "hit" ? 0.8 : 1;
            if (h.kind === "rabbit") {
              ctx.font = `${Math.round(r * 1.7)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🐰", x, by - r * 0.1);
            } else {
              const body = "#8a5a2b", belly = "#c49a6c";
              ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, by, r * 0.75, r * 0.9 * squash, 0, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(x, by + r * 0.35, r * 0.45, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
              if (h.state === "hit") { outlinedText(ctx, "× ×", x, by - r * 0.25, r * 0.4, "#222", "#fff", 2); }
              else { ctx.fillStyle = "#111"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * r * 0.25, by - r * 0.28, r * 0.09, 0, Math.PI * 2); ctx.fill(); } }
              ctx.fillStyle = "#ff8fa3"; ctx.beginPath(); ctx.ellipse(x, by - r * 0.08, r * 0.14, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = "#fff"; ctx.fillRect(x - r * 0.09, by + r * 0.02, r * 0.08, r * 0.13); ctx.fillRect(x + r * 0.01, by + r * 0.02, r * 0.08, r * 0.13);
              if (h.kind === "helmet" && h.armor > 0) {   // 빨간 헬멧
                const jy = h.knock > 0 ? -Math.sin(h.knock * 30) * r * 0.08 : 0;
                ctx.fillStyle = "#e23b3b"; ctx.beginPath(); ctx.ellipse(x, by - r * 0.55 + jy, r * 0.82, r * 0.62, 0, Math.PI, 0); ctx.fill();
                ctx.fillRect(x - r * 0.95, by - r * 0.6 + jy, r * 1.9, r * 0.14);
                ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(x - r * 0.3, by - r * 0.85 + jy, r * 0.18, r * 0.08, -0.4, 0, Math.PI * 2); ctx.fill();
                outlinedText(ctx, "2", x, by - r * 0.85 + jy, r * 0.4, "#fff", "#7a1010", 2);
              }
            }
            ctx.restore();
          }
          // 구멍 앞쪽 흙 둔덕
          ctx.fillStyle = "#7a4e2a"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.12, r * 1.25, r * 0.3, 0, 0, Math.PI); ctx.fill();
        }
      },
      result: () => `잡은 두더지 ${hits} · 놓침 ${missed} · 토끼 ${rabbits}`,
      // 설명 시연용
      get targets() { return holes.filter(h => h.state === "up").map(h => ({ h, kind: h.kind, x: pos(h).x, y: pos(h).y - HR() * 0.6, r: HR() })); },
      forcePop(i, kind) { manual = true; const h = holes[i]; if (h && h.state === "empty") popUp(h, kind); },
      get holeCount() { return holes.length; },
      holePos(i) { return { ...pos(holes[i]), r: HR() }; },
    };
  },
};
