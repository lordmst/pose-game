// 두더지 잡기: 구멍에서 튀어나온 두더지를 주먹으로 콩! 헬멧 두더지는 두 번 쳐야 함(2점), 토끼는 치면 안 됨
import { burst, popup, shake, outlinedText, FONT, rnd, clamp, shade } from "../fx.js?v=75";
import { sfx } from "../audio.js?v=75";
import { bodyRef } from "./bodyref.js?v=75";
import { makeBoss } from "./boss.js?v=75";

const PUNCH = 3.0;          // 타격 인정 속도 (얼음 깨기와 같음)
const POP = 0.15;           // 올라오고 내려가는 시간

export default {
  id: "mole", title: "두더지 잡기", icon: "🐹", sec: 45, cursor: "👊", cat: "move", bg: "#d4a373", desc: "헬멧은 두 번 콩!",
  how: "구멍에서 튀어나온 두더지를 주먹으로 빠르게 콩! 헬멧 쓴 두더지는 두 번 쳐야 해요(2점). 황금 두더지는 3점! 토끼는 치면 안 돼요. 중간에 거대 두더지 보스가 나와요",
  rush: "두더지 대소동",
  create(env) {
    const z = env.zone, v = env.view;
    const cols = clamp(Math.floor(z.w / (v.U * 0.3)), 2, 4);
    const holes = [];
    // 구멍 높이는 선수 키에 맞춤: 윗줄은 가슴 높이, 아랫줄은 배·엉덩이 높이 (몸통 길이 기준)
    for (const fy of [0.25, 1.15]) for (let c = 0; c < cols; c++) holes.push({ fx: (c + 0.5) / cols, fy, state: "empty", t: 0, up: 0, kind: "mole", cool: [0, 0], hint: 0 });
    const ref = bodyRef(env), boss = makeBoss(env, { icon: "🐹", name: "거대 두더지", mode: "hit", ref, color: "#c49a6c" });
    let spawnT = 0.5, hits = 0, missed = 0, rabbits = 0, manual = false;   // manual: 설명 시연에서 직접 띄울 때 저절로 나오지 않게
    const HR = () => Math.min(z.w / cols * 0.32, v.U * 0.1);           // 구멍 반지름
    const pos = h => ({ x: z.x0 + h.fx * z.w, y: ref.y(h.fy, HR() * 2.9) });   // 두 줄이 겹치지 않게 간격은 구멍 크기 이상
    function popUp(h, kind) {
      const p = env.progress();
      const q = Math.random();
      const rush = env.rush && env.rush(), lucky = env.catchUp && env.catchUp() ? 0.75 : 0.9;   // 따라잡기 중이면 황금이 더 자주
      h.kind = kind || (rush ? (q > 0.85 ? "gold" : "mole") : p > 0.1 && q < 0.15 * env.diff.bomb ? "rabbit" : p > 0.15 && q > lucky ? "gold" : Math.random() < 0.18 ? "helmet" : "mole");
      // 황금 두더지: 3점, 아주 잠깐만 나옴
      h.state = "up"; h.t = 0; h.up = (1.7 - 0.6 * p) / env.diff.speed * (h.kind === "helmet" ? 1.5 : h.kind === "gold" ? 0.55 : 1); h.armor = h.kind === "helmet" ? 1 : 0;
      if (h.kind === "gold") sfx.select();
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
      if (h.kind === "gold") { if (env.stat) env.stat("gold"); popup(x, y - r * 2.6, "황금 두더지!", { size: v.U * 0.045, color: "#fff", stroke: "#c99700" }); burst(x, y - r, { n: 18, colors: ["#ffd400", "#fff3a0", "#ffffff"], shape: "star", speed: v.U * 0.7, gravity: v.U * 0.4, size: v.U * 0.02, life: 0.8 }); }
      env.award(h.kind === "helmet" ? 2 : h.kind === "gold" ? 3 : 1, x, y - r * 2);
    }
    return {
      update(dt) {
        ref.update(dt); boss.update(dt);
        const p = env.progress(), r = HR(), hands = env.tracker.hands, rush = env.rush && env.rush();
        spawnT -= dt;
        const upNow = holes.filter(h => h.state !== "empty").length;
        if (!manual && !boss.active && spawnT <= 0 && upNow < (rush ? holes.length : Math.ceil(holes.length / 2))) {
          const free = holes.filter(h => h.state === "empty");
          if (free.length) popUp(free[rnd(0, free.length - 1)]);
          spawnT = (1.0 - 0.45 * p) / env.diff.speed * (env.fever() ? 0.7 : 1) * (rush ? 0.3 : 1);
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
          { const g = ctx.createRadialGradient(x, y + r * 0.08, r * 0.1, x, y, r * 1.15); g.addColorStop(0, "#120904"); g.addColorStop(0.7, "#2e1a0c"); g.addColorStop(1, "#4a2d16");   // 깊어 보이는 구멍
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 1.15, r * 0.38, 0, 0, Math.PI * 2); ctx.fill(); }
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
              const gold = h.kind === "gold", body = gold ? "#f2b800" : "#8a5a2b", belly = gold ? "#ffe680" : "#c49a6c";
              if (gold) { ctx.save(); ctx.shadowColor = "#fff2a0"; ctx.shadowBlur = r * 0.8; ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, by, r * 0.75, r * 0.9 * squash, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
              // 귀 → 몸(위 왼쪽이 밝은 둥근 빛) → 배
              for (const s of [-1, 1]) { ctx.fillStyle = shade(body, -0.25); ctx.beginPath(); ctx.arc(x + s * r * 0.5, by - r * 0.72 * squash, r * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ffb3c1"; ctx.beginPath(); ctx.arc(x + s * r * 0.5, by - r * 0.72 * squash, r * 0.08, 0, Math.PI * 2); ctx.fill(); }
              { const g = ctx.createRadialGradient(x - r * 0.28, by - r * 0.45, r * 0.08, x, by, r * 1.05); g.addColorStop(0, shade(body, 0.42)); g.addColorStop(0.55, body); g.addColorStop(1, shade(body, -0.35));
                ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, by, r * 0.75, r * 0.9 * squash, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = shade(body, -0.45); ctx.lineWidth = Math.max(1.5, r * 0.04); ctx.stroke(); }
              { const g = ctx.createRadialGradient(x, by + r * 0.25, r * 0.05, x, by + r * 0.35, r * 0.5); g.addColorStop(0, shade(belly, 0.35)); g.addColorStop(1, belly);
                ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, by + r * 0.35, r * 0.45, r * 0.4, 0, 0, Math.PI * 2); ctx.fill(); }
              if (h.state === "hit") { outlinedText(ctx, "× ×", x, by - r * 0.25, r * 0.4, "#222", "#fff", 2); }
              else { for (const s of [-1, 1]) { ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(x + s * r * 0.25, by - r * 0.28, r * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + s * r * 0.25 + r * 0.03, by - r * 0.315, r * 0.032, 0, Math.PI * 2); ctx.fill(); } }   // 눈 반짝
              // 수염
              ctx.strokeStyle = "rgba(40,20,10,.55)"; ctx.lineWidth = Math.max(1, r * 0.025); ctx.beginPath();
              for (const s of [-1, 1]) for (const d of [-0.06, 0.05]) { ctx.moveTo(x + s * r * 0.2, by - r * 0.04 + d * r); ctx.lineTo(x + s * r * 0.55, by - r * 0.08 + d * r * 2.2); }
              ctx.stroke();
              ctx.fillStyle = "#ff8fa3"; ctx.beginPath(); ctx.ellipse(x, by - r * 0.08, r * 0.14, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = "#fff"; ctx.fillRect(x - r * 0.09, by + r * 0.02, r * 0.08, r * 0.13); ctx.fillRect(x + r * 0.01, by + r * 0.02, r * 0.08, r * 0.13);
              if (h.kind === "helmet" && h.armor > 0) {   // 빨간 헬멧
                const jy = h.knock > 0 ? -Math.sin(h.knock * 30) * r * 0.08 : 0;
                ctx.fillStyle = "#e23b3b"; ctx.beginPath(); ctx.ellipse(x, by - r * 0.55 + jy, r * 0.82, r * 0.62, 0, Math.PI, 0); ctx.fill();
                ctx.fillRect(x - r * 0.95, by - r * 0.6 + jy, r * 1.9, r * 0.14);
                ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(x - r * 0.3, by - r * 0.85 + jy, r * 0.18, r * 0.08, -0.4, 0, Math.PI * 2); ctx.fill();
                outlinedText(ctx, "2", x, by - r * 0.85 + jy, r * 0.4, "#fff", "#7a1010", 2);
              }
              if (gold && h.state !== "hit") {   // 황금 왕관 + 반짝임
                ctx.fillStyle = "#ffd400"; ctx.strokeStyle = "#a87b00"; ctx.lineWidth = r * 0.05; ctx.beginPath();
                const cy0 = by - r * 0.8; ctx.moveTo(x - r * 0.4, cy0); ctx.lineTo(x - r * 0.45, cy0 - r * 0.4); ctx.lineTo(x - r * 0.2, cy0 - r * 0.18); ctx.lineTo(x, cy0 - r * 0.48); ctx.lineTo(x + r * 0.2, cy0 - r * 0.18); ctx.lineTo(x + r * 0.45, cy0 - r * 0.4); ctx.lineTo(x + r * 0.4, cy0); ctx.closePath(); ctx.fill(); ctx.stroke();
                outlinedText(ctx, "3", x, by + r * 0.45, r * 0.38, "#fff", "#a87b00", 2);
              }
            }
            ctx.restore();
          }
          // 구멍 앞쪽 흙 둔덕
          { const g = ctx.createLinearGradient(0, y + r * 0.1, 0, y + r * 0.45); g.addColorStop(0, "#a8733f"); g.addColorStop(0.5, "#7a4e2a"); g.addColorStop(1, "#5a3519");   // 흙 둔덕(위가 밝게)
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y + r * 0.12, r * 1.25, r * 0.3, 0, 0, Math.PI); ctx.fill();
            ctx.fillStyle = "rgba(255,230,190,.35)"; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y + r * 0.17, r * 0.35, r * 0.05, 0, 0, Math.PI * 2); ctx.fill();
            // 풀 몇 가닥 (구멍마다 같은 자리)
            ctx.strokeStyle = "#5fbf4a"; ctx.lineWidth = Math.max(1.5, r * 0.05); ctx.lineCap = "round"; ctx.beginPath();
            for (const [dx, hgt, lean] of [[-1.1, 0.32, -0.12], [-1.0, 0.24, 0.1], [1.02, 0.3, 0.12], [1.12, 0.22, -0.08], [0.15, 0.2, 0.05]]) { const gx = x + dx * r, gy = y + r * (dx > -0.5 && dx < 0.5 ? 0.4 : 0.2); ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + lean * r * 0.5, gy - hgt * r * 0.6, gx + lean * r, gy - hgt * r); }
            ctx.stroke(); ctx.lineCap = "butt"; }
        }
        boss.draw(ctx);
      },
      get boss() { return boss; },
      result: () => `잡은 두더지 ${hits} · 놓침 ${missed} · 토끼 ${rabbits}`,
      // 설명 시연용
      get targets() { return holes.filter(h => h.state === "up").map(h => ({ h, kind: h.kind, x: pos(h).x, y: pos(h).y - HR() * 0.6, r: HR() })); },
      forcePop(i, kind) { manual = true; const h = holes[i]; if (h && h.state === "empty") popUp(h, kind); },
      get holeCount() { return holes.length; },
      holePos(i) { return { ...pos(holes[i]), r: HR() }; },
    };
  },
};
