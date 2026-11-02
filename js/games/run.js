// 제자리 달리기 경주: 무릎을 번갈아 들 때마다 앞으로. 토끼보다 먼저 결승선에!
// 무릎이 안 보이면 팔을 앞뒤로 흔드는 동작(양손이 번갈아 오르내림)으로 대신 셈
import { burst, popup, outlinedText, rr, FONT } from "../fx.js?v=39";
import { sfx } from "../audio.js?v=39";

const LAP = 100;          // 한 바퀴 거리(m)
const STEP_M = 2;         // 한 걸음에 가는 거리(m)
const KNEE_UP = 0.3, KNEE_DOWN = 0.12;   // 무릎 들림 판정(어깨너비 대비): 이만큼 오르면 '한 걸음', 이만큼 내려오면 다음 걸음 준비
const ARM_GAP = 0.45;     // 팔 흔들기 판정: 두 손 높이 차이(어깨너비 대비)
const RABBIT = 4.2;       // 토끼 속도(m/초, 보통)

// 걸음 세기: 무릎 높이를 '서 있을 때 높이'와 비교. 따로 떼어 시험할 수 있게 함수로 둠
export function makeStepCounter() {
  const base = [null, null], up = [false, false];
  let last = -1, lastT = -9, armSide = 0, kneeSeenT = -9;
  return {
    // pts: 화면 관절 좌표, t: 초, 반환: 이번에 센 걸음 수(0 또는 1)
    update(pts, t, dt) {
      if (!pts) return 0;
      const sw = Math.hypot(pts[11].x - pts[12].x, pts[11].y - pts[12].y) || 1;
      let steps = 0;
      const knees = [25, 26].every(i => pts[i].v) && [23, 24].every(i => pts[i].v);
      if (knees) {
        kneeSeenT = t;
        [25, 26].forEach((ki, k) => {
          const y = pts[ki].y;
          base[k] = base[k] == null ? y : Math.max(y, base[k] - dt * sw * 0.08);   // 가장 낮은 위치(서 있을 때)를 천천히 따라감
          const lift = (base[k] - y) / sw;
          if (!up[k] && lift > KNEE_UP) {
            up[k] = true;
            if (last !== k || t - lastT > 0.6) { steps++; last = k; lastT = t; }   // 번갈아 들어야 한 걸음 (같은 쪽은 0.6초 뒤에)
          } else if (up[k] && lift < KNEE_DOWN) up[k] = false;
        });
      } else if (t - kneeSeenT > 1 && [15, 16].every(i => pts[i].v)) {
        // 무릎이 안 보일 때: 두 손이 번갈아 위아래로 엇갈리면 한 걸음
        const d = (pts[16].y - pts[15].y) / sw, side = d > ARM_GAP ? 1 : d < -ARM_GAP ? -1 : 0;
        if (side && side !== armSide) { if (armSide !== 0) steps++; armSide = side; }
      }
      return steps;
    },
  };
}

export default {
  id: "run", title: "달리기 경주", icon: "🏃", sec: 45, cursor: "", cat: "move", bg: "#ff9f68", desc: "무릎 높이 들고 달리기",
  how: "제자리에서 무릎을 번갈아 높이 들며 달려요. 토끼보다 먼저 결승선에 들어가면 보너스!",
  create(env) {
    const z = env.zone, v = env.view, counter = makeStepCounter();
    let t = 0, dist = 0, rabbit = 0, lap = 1, steps = 0, speed = 0, recent = [], lastPoint = 0, idle = 0, laps = 0, beat = 0, wins = 0;
    const rabbitSpeed = RABBIT * env.diff.speed;
    return {
      update(dt) {
        t += dt; idle += dt;
        const n = counter.update(env.tracker.pts, t, dt);
        if (n) {
          steps += n; idle = 0; dist += STEP_M * n; recent.push(t); sfx.step(beat++ % 2);
          burst(z.x0 + z.w * (0.08 + 0.84 * Math.min(1, dist / LAP)), v.H * 0.79, { n: 4, color: "#d9b38c", speed: v.U * 0.15, gravity: v.U * 0.3, size: v.U * 0.012, life: 0.4 });
        }
        while (recent.length && t - recent[0] > 2) recent.shift();
        speed = recent.length / 2 * STEP_M;          // 최근 2초 평균 속도(m/초)
        rabbit = Math.min(LAP, rabbit + rabbitSpeed * dt);
        // 10m마다 점수
        while (dist - lastPoint >= 10 && dist < LAP) { lastPoint += 10; env.award(1, z.x0 + z.w * (0.08 + 0.84 * lastPoint / LAP), v.H * 0.64); }
        if (dist >= LAP) {                               // 결승선!
          laps++; const won = rabbit < LAP; if (won) wins++;
          sfx.fanfare(); env.award(won ? 4 : 2, z.cx, v.H * 0.45);
          popup(z.cx, v.H * 0.36, won ? "골인! 토끼를 이겼다!" : "골인!", { size: v.U * 0.07, color: "#fff", stroke: won ? "#e0306a" : "#2fb65a", life: 1.4 });
          burst(z.cx, v.H * 0.5, { n: 40, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 1.1, gravity: v.U, size: v.U * 0.018 });
          dist = 0; rabbit = 0; lastPoint = 0; lap++;
        }
        if (idle > 2.5) { popup(z.cx, v.H * 0.55, "무릎을 높이 들어요!", { size: v.U * 0.045, color: "#fff", stroke: "#ff8a00" }); idle = 0; }
      },
      draw(ctx) {
        const U = v.U, x0 = z.x0 + z.w * 0.08, x1 = z.x1 - z.w * 0.08, len = x1 - x0;
        const ty = v.H * 0.74, th = v.U * 0.15;
        // 트랙
        ctx.fillStyle = "rgba(196,92,52,.88)"; rr(ctx, x0 - U * 0.03, ty - th / 2, len + U * 0.06, th, th * 0.3); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 2; ctx.setLineDash([U * 0.02, U * 0.015]);
        ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x1, ty); ctx.stroke(); ctx.setLineDash([]);
        for (let m = 20; m < LAP; m += 20) { const x = x0 + len * m / LAP; outlinedText(ctx, `${m}`, x, ty + th * 0.62, U * 0.022, "#fff", "#7a3a1a", 2); }
        // 결승선 체크무늬
        const fq = th / 6;
        for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? "#222" : "#fff"; ctx.fillRect(x1 + j * fq, ty - th / 2 + i * fq, fq, fq); }
        ctx.font = `${Math.round(U * 0.06)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🏁", x1 + fq, ty - th / 2 - U * 0.03);
        // 토끼(위 줄)와 나(아래 줄): 이모지는 왼쪽을 보므로 좌우를 뒤집어 오른쪽으로 달리게
        const runner = (emoji, frac, y, size, bob) => {
          const x = x0 + len * Math.min(1, frac);
          ctx.save(); ctx.translate(x, y - Math.abs(Math.sin(bob)) * size * 0.15); ctx.scale(-1, 1);
          ctx.font = `${Math.round(size)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(emoji, 0, 0); ctx.restore();
        };
        runner("🐇", rabbit / LAP, ty - th * 0.22, U * 0.06, t * 9);
        runner("🏃", dist / LAP, ty + th * 0.15, U * 0.085, speed > 0 ? t * 12 : 0);
        if (speed > 3) {   // 빨리 달릴 때 속도선
          const x = x0 + len * Math.min(1, dist / LAP); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3;
          for (let i = 0; i < 3; i++) { const y = ty + th * 0.05 + i * U * 0.015; ctx.beginPath(); ctx.moveTo(x - U * (0.06 + i * 0.01), y); ctx.lineTo(x - U * (0.12 + i * 0.02), y); ctx.stroke(); }
        }
        // 거리·속도 표시
        const bx = z.cx, by = v.H * 0.2;
        outlinedText(ctx, `${Math.floor(dist)}m / ${LAP}m`, bx, by, U * 0.07, "#fff", env.color);
        outlinedText(ctx, `${lap}바퀴째 · 속도 ${speed.toFixed(1)}m/초`, bx, by + U * 0.07, U * 0.035, "#fff", "#333");
        // 속도 막대
        const mw = Math.min(z.w * 0.6, U * 0.5), mx = bx - mw / 2, my = by + U * 0.11, k = Math.min(1, speed / 8);
        ctx.fillStyle = "rgba(255,255,255,.6)"; rr(ctx, mx, my, mw, U * 0.022, U * 0.011); ctx.fill();
        ctx.fillStyle = k > 0.7 ? "#ff4d4d" : k > 0.4 ? "#ffb800" : "#37d67a"; rr(ctx, mx, my, mw * k, U * 0.022, U * 0.011); ctx.fill();
      },
      result: () => `걸음 ${steps} · 완주 ${laps}바퀴 · 토끼 이김 ${wins}번`,
      get distance() { return dist + (lap - 1) * LAP; },   // 설명 시연용
    };
  },
};
