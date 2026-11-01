// 줄넘기 (스포츠 리조트의 몸풀기): 양쪽에서 줄을 돌려 주고, 줄이 발밑을 지나는 순간 점프!
// 점프 판정: 두 발목이 서 있을 때보다 함께 올라가면 (발목이 안 보이면 어깨가 확 올라가면) 공중에 있는 것으로 봄
import { burst, popup, outlinedText, FONT } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const PERIOD0 = 1.5, PERIOD_MIN = 0.85;   // 줄 한 바퀴 시간(초): 처음 → 가장 빠를 때
const WIN = 0.16;                          // 줄이 발밑을 지날 때 앞뒤로 이만큼(초) 안에 공중이면 성공

export default {
  id: "jumprope", title: "줄넘기", icon: "🪢", sec: 45, cursor: "", cat: "sport", bg: "#ffd1dc", desc: "줄이 발밑에 올 때 점프",
  how: "양쪽에서 줄을 돌려 줘요. 줄이 발밑을 지나는 순간 깡충! 걸리지 않고 오래 넘을수록 점수가 커져요",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    let phase = 0.35, period = PERIOD0 / Math.max(0.8, D.speed), t = 0, count = 0, best = 0, caught = 0, streak = 0, pause = 1.2;
    let lastAir = -9, judged = false, flash = 0;
    const base = { ank: [null, null], sh: null };
    // 공중에 떠 있는지
    function airborne(dt) {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return false;
      const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1, follow = (b, y) => (b == null ? y : Math.max(y, b - dt * sw * 0.1));
      const shY = (p[11].y + p[12].y) / 2;
      base.sh = follow(base.sh, shY);
      if (p[27].v && p[28].v) {
        base.ank = [27, 28].map((i, k) => follow(base.ank[k], p[i].y));
        return [27, 28].every((i, k) => base.ank[k] - p[i].y > sw * 0.22) && base.sh - shY > sw * 0.12;
      }
      return base.sh - shY > sw * 0.22;                     // 발이 안 보일 때: 어깨가 확 올라감
    }
    // 줄 모양: 양쪽 손잡이 사이의 곡선. phase 0 = 발밑(앞), 0.5 = 머리 위(뒤)
    const handle = () => ({ y: v.H * 0.55, xl: z.x0 + z.w * 0.06, xr: z.x1 - z.w * 0.06 });
    const ropeY = ph => { const h = handle(); return h.y + Math.cos(ph * Math.PI * 2) * v.H * 0.4; };
    return {
      update(dt) {
        t += dt; flash = Math.max(0, flash - dt * 2);
        if (airborne(dt)) lastAir = t;
        if (pause > 0) { pause -= dt; return; }
        const before = phase;
        phase += dt / period;
        // 발밑을 지나는 때(phase가 정수를 넘는 순간) 앞뒤로 판정
        const sinceBottom = (phase % 1) * period;
        if (Math.floor(phase) > Math.floor(before)) judged = false;
        if (!judged && sinceBottom >= WIN && sinceBottom < 0.5 * period) {
          judged = true;
          const ok = t - lastAir <= WIN * 2 + 0.03;          // 줄이 지나간 앞뒤로 한 번이라도 공중이었으면 성공
          const hh = handle();
          if (ok) {
            count++; streak++; best = Math.max(best, streak); flash = 1; sfx.step(count % 2);
            env.award(streak % 10 === 0 ? 3 : 1, z.cx, hh.y - v.U * 0.2);
            if (streak % 10 === 0) popup(z.cx, v.H * 0.3, `${streak}번 연속!`, { size: v.U * 0.06, color: "#fff", stroke: "#e0306a" });
            period = Math.max(PERIOD_MIN / Math.max(0.8, D.speed), period * 0.985);   // 점점 빨라짐
          } else {
            caught++; streak = 0; sfx.bad(); env.miss(z.cx, v.H * 0.8, "걸렸어요!"); pause = 1.2; phase = Math.floor(phase) + 0.35;
            period = Math.min(PERIOD0, period * 1.1);
          }
        }
      },
      draw(ctx) {
        const U = v.U, h = handle(), ph = phase % 1, front = ph < 0.25 || ph > 0.75, y = ropeY(phase);
        // 돌리는 친구들
        ctx.font = `${Math.round(U * 0.09)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🧒", h.xl, h.y + U * 0.02); ctx.save(); ctx.translate(h.xr, h.y + U * 0.02); ctx.scale(-1, 1); ctx.fillText("🧒", 0, 0); ctx.restore();
        // 줄 (앞에 있을 땐 굵고 밝게, 뒤로 넘어갈 땐 가늘게)
        ctx.strokeStyle = front ? "#ff4d9d" : "rgba(255,120,180,.55)"; ctx.lineWidth = front ? U * 0.012 : U * 0.006; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(h.xl + U * 0.03, h.y); ctx.quadraticCurveTo(z.cx, y * 2 - h.y, h.xr - U * 0.03, h.y); ctx.stroke();
        // 발밑 표시와 '점프!' 신호
        const toBottom = (1 - ph) * period;
        const fy = v.H * 0.93;
        ctx.fillStyle = flash > 0 ? `rgba(55,214,122,${0.4 + 0.5 * flash})` : "rgba(255,255,255,.25)";
        ctx.beginPath(); ctx.ellipse(z.cx, fy, Math.min(z.w * 0.18, U * 0.18), U * 0.025, 0, 0, Math.PI * 2); ctx.fill();
        if (pause <= 0 && toBottom < 0.45 && ph > 0.5) {
          const k = 1 - toBottom / 0.45;
          outlinedText(ctx, "점프!", z.cx, v.H * 0.78, U * (0.06 + 0.03 * k), "#fff", "#e0306a", 4);
        }
        // 넘은 횟수
        outlinedText(ctx, String(count), z.cx, v.H * 0.2, U * 0.11, "#fff", env.color, 5);
        outlinedText(ctx, `연속 ${streak} · 최고 ${best}`, z.cx, v.H * 0.2 + U * 0.08, U * 0.032, "#fff", "#333", 3);
        if (pause > 0 && t > 1.3) outlinedText(ctx, "다시 시작해요", z.cx, v.H * 0.4, U * 0.045, "#fff", "#333", 3);
      },
      result: () => `넘은 횟수 ${count} · 최고 연속 ${best} · 걸림 ${caught}`,
      // 설명 시연용: 줄이 발밑에 닿기까지 남은 시간
      get toBottom() { return pause > 0 ? 9 : (1 - (phase % 1)) * period; },
      get count() { return count; },
    };
  },
  demo: {
    dur: 15,
    run(T, g, p, S, say) {
      p.tcx = p.v.W / 2; p.rest(0, "hips", 1); p.rest(1, "hips", 1);
      if (T < 4) say("줄넘기! 양쪽에서 줄을 돌려 줘요");
      else if (T < 9) say("줄이 발밑을 지나는 순간 깡충 뛰어요");
      else if (T < 12.5) say("연속으로 넘을수록 줄이 빨라져요. 10번마다 보너스!");
      else say("이제 직접 해 봐요!");
      // 줄이 발밑에 닿기 0.22초 전에 점프 (몸이 가장 높을 때 줄이 지나감)
      if (g.toBottom < 0.24 && g.toBottom > 0.1 && (!S.jt || T - S.jt > 0.5)) { p.jump(); S.jt = T; }
    },
  },
};
