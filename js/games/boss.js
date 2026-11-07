// 보스전: 게임 중간(진행 56%쯤, 피버 전)에 한 번, 여러 번 쳐야 물리치는 커다란 보스가 나옴
// mode "hit": 빠르게 쳐야 함(두더지·얼음·과일) · "touch": 손을 댔다 떼며 여러 번 톡톡(별·골키퍼)
// 보스가 나와 있는 동안 게임은 새 목표물을 덜 내보냄(게임이 boss.active를 보고 정함)
import { burst, popup, shake, outlinedText, FONT } from "../fx.js?v=67";
import { sfx } from "../audio.js?v=67";

const TIME = 9;          // 보스가 머무는 시간(초)
const easeOutBack = k => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

export function makeBoss(env, o) {
  const z = env.zone, v = env.view, AT = o.at ?? 0.56;
  const hp0 = Math.max(5, Math.round(8 * (env.diff.speed || 1)));   // 쉬움 6 · 보통 8 · 어려움 10
  let ph = "wait", t = 0, hp = hp0, x = z.cx, y = v.H * 0.45, hitT = 0;
  const cool = [0, 0], inside = [false, false];
  const R = () => Math.min(z.w * 0.2, v.U * 0.16);
  function place() {
    const amp = Math.max(0, z.w * 0.5 - R() * 1.3) * 0.75;
    x = z.cx + Math.sin(t * 0.8) * amp;
    y = (o.ref ? o.ref.y(0.35, 0) : v.H * 0.45) + Math.sin(t * 2.1) * R() * 0.12;
    y = Math.max(v.H * 0.25, Math.min(v.H * 0.8, y));
  }
  function hit(h, k) {
    cool[k] = o.mode === "touch" ? 0.3 : 0.26; hp--; hitT = 0.22;
    sfx.hit(Math.min(6, hp0 - hp)); shake(v.U * 0.008, 0.12);
    burst(h.x, h.y, { n: 10, colors: [o.color || "#ffd400", "#ffffff", "#ffd400"], shape: "star", speed: v.U * 0.55, gravity: v.U * 0.7, size: v.U * 0.016, life: 0.5 });
    env.award(1, x, y - R() * 1.25);
    if (hp <= 0) win();
  }
  function win() {
    ph = "win"; t = 0; sfx.bomb(); sfx.fever(); shake(v.U * 0.02, 0.4);
    burst(x, y, { n: 40, colors: ["#ff4d4d", "#ffd400", "#7ae0ff", "#9dff7a", "#ffffff"], shape: "confetti", speed: v.U * 1.3, gravity: v.U * 0.8, size: v.U * 0.022, life: 1.1 });
    burst(x, y, { n: 20, colors: [o.color || "#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.9, gravity: v.U * 0.3, size: v.U * 0.024, life: 1.0 });
    popup(x, y - R() * 1.6, "보스 격파!", { size: v.U * 0.08, color: "#fff", stroke: "#e0306a", life: 1.4, vy: -40 });
    env.award(o.pts ?? 10, x, y - R() * 0.4);
    if (env.stat) env.stat("boss");
    if (env.moment) env.moment("보스 격파!", 5, 0.3);
  }
  return {
    get active() { return ph === "intro" || ph === "fight"; },
    get state() { return ph; },
    get pos() { return { x, y, r: R(), hp, max: hp0 }; },   // 점검·시연용
    start() { if (ph === "wait") { ph = "intro"; t = 0; } },
    update(dt) {
      if (ph === "wait") {
        if (!env.progress || env.demo || env.noBoss) return;
        if (env.progress() >= AT && !(env.fever && env.fever())) {
          ph = "intro"; t = 0; sfx.fever(); shake(v.U * 0.01, 0.3);
          popup(z.cx, v.H * 0.3, `보스 등장! ${o.name}`, { size: v.U * 0.06, color: "#fff", stroke: "#7a1fd6", life: 1.6, vy: -30 });
        }
        return;
      }
      if (ph === "done") return;
      t += dt; hitT = Math.max(0, hitT - dt); cool[0] = Math.max(0, cool[0] - dt); cool[1] = Math.max(0, cool[1] - dt);
      if (ph === "intro") { place(); if (t >= 0.9) { ph = "fight"; t = 0; } return; }
      if (ph === "fight") {
        place();
        const r = R(), hands = env.tracker.hands || [];
        hands.forEach((h, k) => {
          const near = h.vis && Math.hypot(h.x - x, h.y - y) < r * 1.05 * (env.diff.reach || 1);
          if (o.mode === "touch") { if (near && !inside[k] && cool[k] <= 0) hit(h, k); inside[k] = near; return; }
          if (!near || cool[k] > 0 || ph !== "fight") return;
          if ((x - h.x) * h.vx + (y - h.y) * h.vy <= 0) return;               // 보스 쪽으로 다가가는 손만
          if (h.bodySpeed < 2.6 * (env.diff.punch || 1)) return;
          hit(h, k);
        });
        if (ph === "fight" && t >= TIME) {
          ph = "lose"; t = 0; sfx.whoosh();
          popup(x, y - R() * 1.4, "보스가 도망갔어요", { size: v.U * 0.05, color: "#fff", stroke: "#555", life: 1.2 });
        }
        return;
      }
      if (t > 1.2) ph = "done";
    },
    draw(ctx) {
      if (ph === "wait" || ph === "done") return;
      const r = R(), U = v.U;
      let dy = y, sc = 1, al = 1;
      if (ph === "intro") { const k = Math.min(1, t / 0.8); dy = -r + (y + r) * easeOutBack(k); }
      if (ph === "win") { sc = 1 + t * 0.8; al = Math.max(0, 1 - t / 0.6); }
      if (ph === "lose") { dy = y - t * v.H * 0.8; al = Math.max(0, 1 - t / 1.0); }
      const jx = hitT > 0 ? (Math.random() - 0.5) * r * 0.25 : 0;
      ctx.save(); ctx.globalAlpha = al;
      // 뒤쪽 빛
      const g = ctx.createRadialGradient(x, dy, r * 0.2, x, dy, r * 1.45);
      g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, dy, r * 1.45, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = o.color || "#ffd400"; ctx.shadowBlur = r * (0.5 + 0.3 * Math.sin(t * 8));
      ctx.font = `${Math.round(r * 2 * sc)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(o.icon, x + jx, dy + r * 0.08);
      ctx.shadowBlur = 0;
      if (o.crown !== false) { ctx.font = `${Math.round(r * 0.8 * sc)}px ${FONT}`; ctx.fillText("👑", x + jx, dy - r * 1.05 * sc); }
      if (ph === "fight" || ph === "intro") {
        // 남은 체력 막대
        const bw = r * 2.2, bh = Math.max(8, U * 0.018), bx = x - bw / 2, by = dy - r * 1.62;
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
        ctx.fillStyle = "#ff4d6d"; ctx.fillRect(bx, by, bw * Math.max(0, hp) / hp0, bh);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
        // 남은 시간 고리
        if (ph === "fight") {
          ctx.lineWidth = U * 0.012; ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.beginPath(); ctx.arc(x, dy, r * 1.22, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = t > TIME - 3 ? "#ff4d4d" : "#ffe14d"; ctx.beginPath(); ctx.arc(x, dy, r * 1.22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, 1 - t / TIME)); ctx.stroke();
        }
        outlinedText(ctx, `보스 ${o.name} ${Math.max(0, hp)}/${hp0}`, x, dy + r * 1.42, U * 0.036, "#fff", "#7a1fd6");
        outlinedText(ctx, o.mode === "touch" ? "손으로 톡톡 여러 번!" : "빠르게 콩콩 여러 번!", x, dy + r * 1.42 + U * 0.045, U * 0.03, "#fff", "#333");
      }
      ctx.restore();
    },
  };
}
