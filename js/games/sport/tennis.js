// 테니스: 상대(위쪽)가 보낸 공이 내 쪽으로 오면, 공이 오는 쪽 팔을 크게 휘둘러 받아치기
// 오른쪽 공 = 오른손 포핸드, 왼쪽 공 = 왼손 백핸드. 상대가 못 받으면 내 점수(위너). 점수는 테니스식(15·30·40·게임)
import { burst, popup, shake, outlinedText, rr, FONT, clamp } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const FLIGHT = 1.45;   // 공이 상대에게서 나에게 오는 시간(초, 보통)
const BACK = 0.95;     // 받아친 공이 상대에게 가는 시간(초)
const SWING = 2.6;     // 스윙으로 인정하는 손 속도(어깨너비/초)
const CPU_RETURN = { easy: 0.5, normal: 0.68, hard: 0.8 };   // 상대가 받아칠 확률(기본)
const PTS = ["0", "15", "30", "40"];

export default {
  id: "tennis", title: "테니스", icon: "🎾", sec: 60, cursor: "🎾", cat: "sport", bg: "#9be15d", desc: "휘둘러서 받아치기",
  how: "공이 오는 쪽 팔을 크게 휘둘러 받아쳐요. 오른쪽 공은 오른손, 왼쪽 공은 왼손! 상대가 못 받으면 내 점수",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    let ball = null, wait = 1.2, me = 0, cpu = 0, gMe = 0, gCpu = 0, returns = 0, winners = 0, cpuX = 0.5, t = 0;
    const trails = [[], []];
    function body() {
      const p = env.tracker.pts;
      if (p && p[11].v && p[12].v) { const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y); return { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2, sw: Math.max(sw, v.U * 0.08) }; }
      return { x: z.cx, y: v.H * 0.45, sw: v.U * 0.13 };
    }
    const farY = () => v.H * 0.27;
    const R = () => Math.max(body().sw * 1.0, v.U * 0.09) * D.reach;     // 받아칠 수 있는 거리
    // 상대가 공을 보냄 (from: 상대가 서 있는 x 비율)
    function send(fromFrac) {
      const b = body(), side = Math.random() < 0.5 ? -1 : 1, off = (0.9 + Math.random() * 0.7) * b.sw;
      const dx = clamp(b.x + side * off, z.x0 + v.U * 0.05, z.x1 - v.U * 0.05), dy = b.y + b.sw * (0.2 + Math.random() * 0.6);
      ball = { dir: 1, sx: z.x0 + z.w * fromFrac, sy: farY(), dx, dy, t: 0, T: FLIGHT * (1 - 0.25 * env.progress()) / D.speed, side: dx < b.x ? 0 : 1, spin: 0 };
      sfx.whoosh();
    }
    function pos(B) {
      const k = Math.min(1.25, B.t / B.T);
      if (B.dir === 1) { const e = k * k; return { k, x: B.sx + (B.dx - B.sx) * e, y: B.sy + (B.dy - B.sy) * e - Math.sin(Math.min(1, k) * Math.PI) * v.H * 0.12, s: 0.3 + 0.7 * e }; }
      const e = 1 - (1 - k) * (1 - k);
      return { k, x: B.sx + (B.dx - B.sx) * e, y: B.sy + (B.dy - B.sy) * e - Math.sin(Math.min(1, k) * Math.PI) * v.H * 0.1, s: 1 - 0.7 * e };
    }
    // 점수: 4점 이상 + 2점 차이면 게임
    function point(mine, x, y) {
      if (mine) me++; else cpu++;
      if ((me >= 4 || cpu >= 4) && Math.abs(me - cpu) >= 2) {
        const won = me > cpu; if (won) gMe++; else gCpu++;
        me = cpu = 0;
        if (won) { sfx.fanfare(); env.award(3, z.cx, v.H * 0.4); popup(z.cx, v.H * 0.48, "게임 승리!", { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.3 }); }
        else popup(z.cx, v.H * 0.48, "상대 게임", { size: v.U * 0.05, color: "#eee", stroke: "#555" });
      }
      ball = null; wait = 1.3;
    }
    function scoreText() {
      if (me >= 3 && cpu >= 3) return me === cpu ? "듀스" : me > cpu ? "어드밴티지 나" : "어드밴티지 상대";
      return `나 ${PTS[Math.min(3, me)]} : ${PTS[Math.min(3, cpu)]} 상대`;
    }
    return {
      update(dt) {
        t += dt;
        const hands = env.tracker.hands;
        hands.forEach((h, k) => { const tr = trails[k]; if (h.vis) tr.push({ x: h.x, y: h.y, t, fast: h.bodySpeed > SWING * D.punch }); else tr.length = 0; while (tr.length && t - tr[0].t > 0.2) tr.shift(); });
        if (!ball) { wait -= dt; if (wait <= 0) send(cpuX); return; }
        ball.t += dt; ball.spin += dt * 12;
        const c = pos(ball);
        if (ball.dir === 1) {
          // 받아치기: 공이 가까이 왔을 때 그 근처에서 빠르게 휘두른 손
          if (c.k > 0.75 && c.k < 1.15) {
            const h = hands.find(h => h.vis && h.bodySpeed >= SWING * D.punch && Math.hypot(h.x - c.x, h.y - c.y) < R());
            if (h) {
              returns++; sfx.hit(2); shake(v.U * 0.006, 0.12);
              env.award(1, c.x, c.y - v.U * 0.08);
              popup(c.x, c.y + v.U * 0.06, ball.side === 1 ? "포핸드!" : "백핸드!", { size: v.U * 0.04, color: "#fff", stroke: "#2f8f2f", life: 0.7 });
              burst(c.x, c.y, { n: 14, colors: ["#e8ff6a", "#ffffff"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.4, size: v.U * 0.016, life: 0.5 });
              // 휘두른 방향으로 공이 감 (옆으로 휘두를수록 코트 끝으로)
              const aim = clamp(0.5 + (h.vx / (h.speed || 1)) * 0.35 + (Math.random() - 0.5) * 0.2, 0.1, 0.9);
              ball = { dir: -1, sx: c.x, sy: c.y, dx: z.x0 + z.w * aim, dy: farY(), t: 0, T: BACK / Math.min(1.4, 0.8 + h.bodySpeed / 20), power: h.bodySpeed, aim, spin: 0 };
              return;
            }
          }
          if (c.k >= 1.15) { sfx.thud(); env.miss(ball.dx, ball.dy, "놓쳤어요"); point(false); }
        } else {
          cpuX += (ball.aim - cpuX) * Math.min(1, dt * 2.2);          // 상대가 공 쪽으로 뜀
          if (c.k >= 1) {
            // 상대가 받을지: 멀리 보낼수록, 세게 칠수록 못 받음
            const far = Math.abs(ball.aim - 0.5) > 0.3 ? 0.15 : 0, hard = ball.power > 9 ? 0.15 : 0;
            if (Math.random() < (CPU_RETURN[D.id] || 0.68) - far - hard) send(ball.aim);
            else { winners++; env.award(2, ball.dx, ball.dy + v.U * 0.05); popup(ball.dx, ball.dy + v.U * 0.12, "위너!", { size: v.U * 0.06, color: "#fff", stroke: "#e0306a", life: 1.1 }); sfx.fever(); point(true); }
          }
        }
      },
      draw(ctx) {
        const U = v.U, fy = farY(), ny = v.H * 0.99, fw = z.w * 0.42, nw = z.w * 0.98;
        // 코트 (원근)
        ctx.fillStyle = "rgba(46,139,87,.32)"; ctx.beginPath(); ctx.moveTo(z.cx - fw / 2, fy); ctx.lineTo(z.cx + fw / 2, fy); ctx.lineTo(z.cx + nw / 2, ny); ctx.lineTo(z.cx - nw / 2, ny); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(z.cx, fy); ctx.lineTo(z.cx, ny); ctx.stroke();
        const netY = fy + (ny - fy) * 0.28, netW = fw + (nw - fw) * 0.28;
        ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(z.cx - netW / 2, netY - U * 0.03, netW, U * 0.03);
        ctx.strokeStyle = "rgba(40,40,40,.5)"; ctx.lineWidth = 1;
        for (let x = z.cx - netW / 2; x < z.cx + netW / 2; x += U * 0.015) { ctx.beginPath(); ctx.moveTo(x, netY - U * 0.03); ctx.lineTo(x, netY); ctx.stroke(); }
        // 상대
        const cx = z.x0 + z.w * cpuX;
        ctx.font = `${Math.round(U * 0.075)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🧑", cx, fy - U * 0.05); ctx.font = `${Math.round(U * 0.04)}px ${FONT}`; ctx.fillText("🎾", cx + U * 0.04, fy - U * 0.03);
        // 스윙 자국
        ctx.lineCap = "round";
        trails.forEach(tr => { for (let i = 1; i < tr.length; i++) { if (!tr[i].fast) continue; const k = i / tr.length; ctx.strokeStyle = `rgba(255,255,255,${(0.2 + 0.7 * k).toFixed(2)})`; ctx.lineWidth = 2 + U * 0.016 * k; ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke(); } });
        if (ball) {
          const c = pos(ball), r = U * 0.032 * c.s;
          if (ball.dir === 1 && c.k > 0.3) {   // 공이 올 자리 + 포핸드/백핸드 안내
            ctx.setLineDash([U * 0.012, U * 0.01]); ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = U * 0.006;
            ctx.beginPath(); ctx.arc(ball.dx, ball.dy, R() * 0.7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            outlinedText(ctx, ball.side === 1 ? "오른손 휘두르기!" : "왼손 휘두르기!", ball.dx, ball.dy + R() * 0.7 + U * 0.03, U * 0.032, "#fff", "#2f8f2f", 3);
          }
          ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(c.x, c.y + r * 2.5 + (1 - c.s) * U * 0.05, r * 1.1, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#d9ff3f"; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1.5, r * 0.15); ctx.beginPath(); ctx.arc(c.x - r * 0.5, c.y, r * 0.8, -1 + ball.spin, 1 + ball.spin); ctx.stroke();
        }
        // 점수판
        const bw = Math.min(z.w * 0.8, U * 0.6), bx = z.cx - bw / 2, by = v.H * 0.115;
        ctx.fillStyle = "rgba(0,40,0,.6)"; rr(ctx, bx, by, bw, U * 0.06, U * 0.02); ctx.fill();
        outlinedText(ctx, `${scoreText()} · 게임 ${gMe}:${gCpu}`, z.cx, by + U * 0.03, Math.min(U * 0.034, z.w / 16), "#fff", "#063", 3);
      },
      result: () => `받아친 공 ${returns} · 위너 ${winners} · 게임 ${gMe}:${gCpu}`,
      // 설명 시연용
      get ball() { if (!ball) return null; const c = pos(ball); return { incoming: ball.dir === 1, k: c.k, x: c.x, y: c.y, dx: ball.dx, dy: ball.dy, side: ball.side }; },
    };
  },
  demo: {
    dur: 15,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4) say("테니스! 공이 오는 쪽 팔을 크게 휘둘러요");
      else if (T < 8.5) say("오른쪽 공은 오른손 포핸드, 왼쪽 공은 왼손 백핸드");
      else if (T < 13) say("상대가 못 받으면 위너! 내 점수예요");
      else say("이제 직접 해 봐요!");
      const b = g.ball, u = p.u;
      if (!b || !b.incoming) { p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }
      const k = b.side, s = k ? 1 : -1;
      p.rest(1 - k, "guard", 1);
      if (b.k < 0.88) p.reach(k, b.dx + s * 0.9 * u, b.dy - 0.2 * u, 1.6);   // 뒤로 빼기
      else p.reach(k, b.dx - s * 1.3 * u, b.dy - 0.3 * u, 2.6);              // 앞으로 휘두르기
    },
  },
};
