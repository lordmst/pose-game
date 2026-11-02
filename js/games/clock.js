// 시계 만들기: 두 팔을 시곗바늘처럼 뻗어 주어진 시각을 만들기. 몸(어깨 가운데)이 시계의 중심
import { burst, popup, rr, outlinedText, FONT, rnd } from "../fx.js?v=40";
import { sfx } from "../audio.js?v=40";

const HOLD = 0.8, TOL = 22;       // 자세 유지 시간(초) · 바늘 각도 허용 오차(도)
// 화면 기준 각도: 12시 방향 0도, 시계 방향으로 증가 (화면에 보이는 그대로 읽음)
export const clockAngle = (dx, dy) => (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
export const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
export const handAngles = (h, m) => ({ H: ((h % 12) * 30 + m * 0.5) % 360, M: (m * 6) % 360 });
// 두 팔 방향이 시침·분침과 맞는지 (어느 팔이 시침이어도 됨)
export function armsMatch(aL, aR, H, M, tol) {
  return (angDiff(aL, H) < tol && angDiff(aR, M) < tol) || (angDiff(aL, M) < tol && angDiff(aR, H) < tol);
}
const timeText = (h, m) => `${h}시` + (m ? ` ${m}분` : "");
const digital = (h, m) => `${h}:${String(m).padStart(2, "0")}`;

export default {
  id: "clock", title: "시계 만들기", icon: "🕒", sec: 60, cursor: "", cat: "learn", bg: "#ffd166", desc: "팔로 시곗바늘 만들기",
  how: "몸이 시계의 가운데예요. 두 팔을 시곗바늘처럼 뻗어 시각을 만들어요. 긴바늘(분)은 위, 짧은바늘(시)은 숫자 쪽!",
  create(env) {
    const z = env.zone, v = env.view, tol = TOL * env.diff.reach;
    let h = 3, m = 0, H = 0, M = 0, hold = 0, shown = 0, matched = false, solved = 0, flash = 0, arms = null, last = "";
    const maxStage = env.diff.id === "easy" ? 1 : 2;
    function next() {
      const stage = Math.min(maxStage, solved < 3 ? 0 : solved < 6 ? 1 : 2);   // 정각 → 30분 → 15분 단위
      do { h = rnd(1, 12); m = stage === 0 ? 0 : stage === 1 ? (Math.random() < 0.5 ? 0 : 30) : [0, 15, 30, 45][rnd(0, 3)]; } while (digital(h, m) === last);
      last = digital(h, m); ({ H, M } = handAngles(h, m)); hold = 0; shown = 0;
      env.speak(`${timeText(h, m)}${m ? "을" : "를"} 만들어요`);
    }
    next();
    // 문제 카드는 화면 아래쪽 (시계판이 몸 위쪽까지 넓게 보이도록)
    const card = () => { const w = Math.min(z.w * 0.8, v.U * 0.62), hh = v.U * 0.13; return { x: z.x0 + (z.w - w) / 2, y: v.H - hh - v.U * 0.05, w, hh }; };
    const center = () => {
      const p = env.tracker.pts;
      // 자기 구역 안, 화면 위쪽과 아래 문제 카드 사이에 들어가는 크기
      const fit = (x, y, want) => ({ x, y, r: Math.max(v.U * 0.08, Math.min(want, z.w * 0.42, y - v.H * 0.02, card().y - v.U * 0.02 - y)) });
      if (p && p[11].v && p[12].v) return fit((p[11].x + p[12].x) / 2, (p[11].y + p[12].y) / 2, Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) * 1.9);
      return fit(z.cx, v.H * 0.42, v.U * 0.22);
    };
    return {
      update(dt) {
        shown += dt; flash = Math.max(0, flash - dt);
        const p = env.tracker.pts;
        arms = null; matched = false;
        if (p && [11, 12, 15, 16].every(i => p[i].v)) {
          const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1;
          const L = { dx: p[15].x - p[11].x, dy: p[15].y - p[11].y }, Rr = { dx: p[16].x - p[12].x, dy: p[16].y - p[12].y };
          const ext = a => Math.hypot(a.dx, a.dy) > sw * 0.9;           // 팔을 충분히 뻗었을 때만
          arms = { aL: clockAngle(L.dx, L.dy), aR: clockAngle(Rr.dx, Rr.dy), ok: ext(L) && ext(Rr) };
          matched = arms.ok && armsMatch(arms.aL, arms.aR, H, M, tol);
        }
        hold = matched ? hold + dt : Math.max(0, hold - dt * 1.5);
        const c = center();
        if (hold >= HOLD * env.diff.hold) {
          solved++; flash = 0.4; sfx.catch(env.player.combo);
          env.award(1, c.x, c.y - c.r - v.U * 0.03);
          popup(c.x, c.y + c.r * 0.6, `${timeText(h, m)} 정답!`, { size: v.U * 0.05, color: "#fff", stroke: "#2fb65a" });
          burst(c.x, c.y, { n: 30, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 0.9, gravity: v.U * 1.2, size: v.U * 0.016 });
          next();
        } else if (shown > 14 * env.diff.poseTime) { env.miss(c.x, c.y - c.r, "다음 시각!"); next(); }
      },
      draw(ctx) {
        const c = center(), U = v.U;
        // 몸 위에 겹쳐 보이는 시계판
        ctx.save();
        ctx.globalAlpha = 0.55; ctx.fillStyle = flash > 0 ? "#d8ffe6" : "#ffffff"; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.lineWidth = U * 0.012; ctx.strokeStyle = matched ? "#2fd36b" : env.color; ctx.stroke();
        for (let n = 1; n <= 12; n++) {
          const a = n * 30 * Math.PI / 180, x = c.x + Math.sin(a) * c.r * 0.82, y = c.y - Math.cos(a) * c.r * 0.82;
          outlinedText(ctx, String(n), x, y, c.r * 0.17, "#333", "#fff", 3);
        }
        // 지금 팔 방향을 바늘로 표시 (맞으면 초록)
        if (arms) for (const a of [arms.aL, arms.aR]) {
          const t = a * Math.PI / 180;
          ctx.strokeStyle = matched ? "rgba(47,211,107,.9)" : "rgba(60,60,60,.55)"; ctx.lineWidth = U * 0.018; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.sin(t) * c.r * 0.7, c.y - Math.cos(t) * c.r * 0.7); ctx.stroke();
        }
        ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(c.x, c.y, U * 0.012, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // 문제 카드
        const { w, hh, x, y } = card();
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, x + 5, y + 7, w, hh, hh * 0.3); ctx.fill();
        ctx.fillStyle = "#fff"; rr(ctx, x, y, w, hh, hh * 0.3); ctx.fill(); ctx.lineWidth = U * 0.01; ctx.strokeStyle = env.color; ctx.stroke();
        outlinedText(ctx, digital(h, m), x + w * 0.3, y + hh * 0.52, hh * 0.62, "#222", "#fff", 2);
        outlinedText(ctx, timeText(h, m), x + w * 0.7, y + hh * 0.52, hh * 0.42, env.color, "#fff", 2);
        // 쉬움: 4초 지나면 정답 바늘을 흐리게 보여 줌
        if (env.diff.id === "easy" && shown > 4) {
          ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = "#ff8a00"; ctx.lineCap = "round";
          for (const [a, len, lw] of [[H, 0.5, 0.03], [M, 0.78, 0.02]]) { const t = a * Math.PI / 180; ctx.lineWidth = U * lw; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.sin(t) * c.r * len, c.y - Math.cos(t) * c.r * len); ctx.stroke(); }
          ctx.restore();
        }
        // 자세 유지 게이지
        if (hold > 0) { ctx.strokeStyle = "#2fd36b"; ctx.lineWidth = U * 0.016; ctx.beginPath(); ctx.arc(c.x, c.y, c.r + U * 0.02, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, hold / (HOLD * env.diff.hold))); ctx.stroke(); }
      },
      result: () => `맞힌 시각 ${solved}개`,
      get target() { return { H, M, h, m }; },   // 설명 시연용
    };
  },
};
