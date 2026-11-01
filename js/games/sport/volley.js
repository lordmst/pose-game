// 배구: 상대가 넘긴 공을 두 손 모아 받고(리시브) → 같은 편이 올려 주면(토스) → 손을 높이 들었다 세게 내려쳐서(스파이크) 득점
// 리시브: 공이 올 때 두 손목을 붙여 가슴 아래로 / 스파이크: 높이 뜬 공 근처에서 손을 위에서 아래로 빠르게
import { burst, popup, shake, outlinedText, rr, FONT, clamp } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const SERVE = 1.6;     // 상대 공이 나에게 오는 시간(초, 보통)
const SPIKE = 3.0;     // 스파이크로 인정하는 손 속도(어깨너비/초, 아래 방향)
const CPU_DIG = { easy: 0.2, normal: 0.32, hard: 0.45 };   // 상대가 스파이크를 받아낼 확률

export default {
  id: "volley", title: "배구", icon: "🏐", sec: 60, cursor: "", cat: "sport", bg: "#a1c4fd", desc: "리시브하고 스파이크!",
  how: "공이 오면 두 손을 모아 아래에서 받아요(리시브). 같은 편이 공을 높이 올려 주면 손을 높이 들었다가 세게 내려쳐요(스파이크)!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    let ph = "wait", wait = 1.2, ball = null, me = 0, cpu = 0, sets = [0, 0], recv = 0, spikes = 0, pts = 0, oppX = 0.5;
    function body() {
      const p = env.tracker.pts;
      if (p && p[11].v && p[12].v) { const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y); return { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2, sw: Math.max(sw, v.U * 0.08) }; }
      return { x: z.cx, y: v.H * 0.45, sw: v.U * 0.13 };
    }
    const netY = () => v.H * 0.34, farY = () => v.H * 0.24;
    const mate = () => ({ x: z.x0 + z.w * 0.2, y: v.H * 0.44 });
    // 공 이동: 시작점 → 끝점, 포물선 높이 arc(화면 높이 비율), persp: 멀리서 다가오면 1, 멀어지면 -1, 같은 거리면 0
    function fly(sx, sy, dx, dy, T, arc, persp) { ball = { sx, sy, dx, dy, t: 0, T, arc, persp, spin: 0 }; }
    function pos() {
      const B = ball, k = Math.min(1.3, B.t / B.T);
      const e = B.persp > 0 ? k * k : B.persp < 0 ? 1 - (1 - Math.min(1, k)) ** 2 : k;
      const s = B.persp > 0 ? 0.35 + 0.65 * e : B.persp < 0 ? 1 - 0.6 * e : 0.85;
      return { k, x: B.sx + (B.dx - B.sx) * e, y: B.sy + (B.dy - B.sy) * e - Math.sin(Math.min(1, k) * Math.PI) * v.H * B.arc, s };
    }
    function serve() {   // 상대가 공을 넘김 → 리시브 자리
      const b = body(), rx = clamp(b.x + (Math.random() - 0.5) * b.sw * 0.9, z.x0 + v.U * 0.06, z.x1 - v.U * 0.06), ry = Math.min(v.H * 0.85, b.y + b.sw * 1.0);
      fly(z.x0 + z.w * oppX, farY(), rx, ry, SERVE * (1 - 0.2 * env.progress()) / D.speed, 0.2, 1); ph = "recv"; sfx.whoosh();
    }
    const spot = () => { const b = body(); return { x: clamp(b.x + b.sw * 0.5, z.x0 + v.U * 0.06, z.x1 - v.U * 0.06), y: Math.max(v.H * 0.16, b.y - b.sw * 1.4) }; };
    function point(mine) {
      if (mine) me++; else cpu++;
      if ((me >= 15 || cpu >= 15) && Math.abs(me - cpu) >= 2) {
        const won = me > cpu; sets[won ? 0 : 1]++; me = cpu = 0;
        if (won) { sfx.fanfare(); env.award(3, z.cx, v.H * 0.4); popup(z.cx, v.H * 0.5, "세트 승리!", { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.3 }); }
      }
      ball = null; ph = "wait"; wait = 1.4;
    }
    return {
      update(dt) {
        if (ph === "wait") { wait -= dt; if (wait <= 0) serve(); return; }
        ball.t += dt; ball.spin += dt * 8;
        const c = pos(), p = env.tracker.pts, b = body(), hands = env.tracker.hands;
        if (ph === "recv") {
          // 리시브: 두 손목이 붙어 있고 가슴보다 아래, 공 가까이
          if (c.k > 0.72 && c.k < 1.18 && p && p[15].v && p[16].v) {
            const close = Math.hypot(p[15].x - p[16].x, p[15].y - p[16].y) < b.sw * 0.9;
            const low = p[15].y > b.y + b.sw * 0.25 && p[16].y > b.y + b.sw * 0.25;
            const mx = (p[15].x + p[16].x) / 2, my = (p[15].y + p[16].y) / 2;
            if (close && low && Math.hypot(mx - c.x, my - c.y) < b.sw * 1.4 * D.reach) {
              recv++; sfx.bonk(); env.award(1, c.x, c.y - v.U * 0.08);
              popup(c.x, c.y + v.U * 0.06, "리시브!", { size: v.U * 0.045, color: "#fff", stroke: "#2f6fd1", life: 0.8 });
              burst(c.x, c.y, { n: 10, colors: ["#ffffff", "#ffd400"], shape: "star", speed: v.U * 0.4, gravity: v.U * 0.4, size: v.U * 0.014, life: 0.5 });
              const m = mate(); fly(c.x, c.y, m.x, m.y, 0.75, 0.16, 0); ph = "toMate"; return;
            }
          }
          if (c.k >= 1.18) { sfx.thud(); env.miss(ball.dx, ball.dy, "못 받았어요"); point(false); }
        } else if (ph === "toMate" && c.k >= 1) {   // 같은 편이 토스
          const s = spot(), m = mate(); fly(m.x, m.y, s.x, s.y, 1.0 / Math.min(1.2, D.speed), 0.2, 0); ph = "spike"; sfx.pop();
          popup(m.x, m.y - v.U * 0.08, "토스!", { size: v.U * 0.035, color: "#fff", stroke: "#555", life: 0.6 });
        } else if (ph === "spike") {
          // 스파이크: 공 가까이에서 손이 아래로 빠르게
          if (c.k > 0.7 && c.k < 1.3) {
            const h = hands.find(h => h.vis && h.vy > 0 && h.bodySpeed >= SPIKE * D.punch && Math.hypot(h.x - c.x, h.y - c.y) < b.sw * 1.2 * D.reach);
            if (h) {
              spikes++; sfx.hit(3); shake(v.U * 0.014, 0.2); env.award(2, c.x, c.y - v.U * 0.06);
              popup(c.x, c.y + v.U * 0.07, "스파이크!", { size: v.U * 0.055, color: "#fff", stroke: "#e0306a", life: 0.9 });
              burst(c.x, c.y, { n: 22, colors: ["#ffffff", "#ffd400", "#ff7aa2"], shape: "star", speed: v.U * 0.8, gravity: v.U * 0.4, size: v.U * 0.018, life: 0.6 });
              const aim = clamp(0.5 + (h.vx / (h.speed || 1)) * 0.4 + (Math.random() - 0.5) * 0.3, 0.12, 0.88);
              fly(c.x, c.y, z.x0 + z.w * aim, netY() + v.U * 0.02, 0.5, 0.02, -1); ball.aim = aim; ph = "attack"; return;
            }
          }
          if (c.k >= 1.3) { sfx.thud(); env.miss(c.x, Math.min(v.H * 0.9, c.y + v.U * 0.1), "놓쳤어요"); point(false); }
        } else if (ph === "attack") {
          oppX += (ball.aim - oppX) * Math.min(1, dt * 2);
          if (c.k >= 1) {
            if (Math.random() < (CPU_DIG[D.id] || 0.32)) { popup(ball.dx, ball.dy, "상대가 받았어요", { size: v.U * 0.035, color: "#fff", stroke: "#555" }); oppX = ball.aim; serve(); }
            else { pts++; sfx.fever(); env.award(1, ball.dx, ball.dy + v.U * 0.04); popup(ball.dx, ball.dy + v.U * 0.1, "득점!", { size: v.U * 0.06, color: "#fff", stroke: "#2fb65a", life: 1.0 }); point(true); }
          }
        }
      },
      draw(ctx) {
        const U = v.U, ny = netY(), fy = farY();
        // 코트 (모래색 바닥) + 네트
        ctx.fillStyle = "rgba(240,190,110,.3)"; ctx.beginPath(); ctx.moveTo(z.cx - z.w * 0.25, fy); ctx.lineTo(z.cx + z.w * 0.25, fy); ctx.lineTo(z.x1 - z.w * 0.01, v.H * 0.99); ctx.lineTo(z.x0 + z.w * 0.01, v.H * 0.99); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 3; ctx.stroke();
        const nw = z.w * 0.62;
        ctx.fillStyle = "rgba(30,30,30,.45)"; ctx.fillRect(z.cx - nw / 2, ny - U * 0.07, nw, U * 0.07);
        ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1;
        for (let x = z.cx - nw / 2; x <= z.cx + nw / 2; x += U * 0.018) { ctx.beginPath(); ctx.moveTo(x, ny - U * 0.07); ctx.lineTo(x, ny); ctx.stroke(); }
        ctx.fillStyle = "#fff"; ctx.fillRect(z.cx - nw / 2, ny - U * 0.075, nw, U * 0.01);
        // 상대 둘, 같은 편 하나
        ctx.font = `${Math.round(U * 0.06)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🧑", z.x0 + z.w * (0.2 + oppX * 0.6), fy - U * 0.04); ctx.fillText("🧑", z.x0 + z.w * (0.8 - oppX * 0.35), fy - U * 0.03);
        const m = mate(); ctx.font = `${Math.round(U * 0.075)}px ${FONT}`; ctx.fillText("🙋", m.x, m.y);
        outlinedText(ctx, "같은 편", m.x, m.y + U * 0.055, U * 0.024, "#fff", "#2f6fd1", 3);
        if (ball) {
          const c = pos(), r = U * 0.04 * c.s;
          // 해야 할 동작 안내
          if (ph === "recv" && c.k > 0.25) {
            ctx.setLineDash([U * 0.012, U * 0.01]); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = U * 0.007;
            ctx.beginPath(); ctx.arc(ball.dx, ball.dy, body().sw * 0.9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            outlinedText(ctx, "리시브! 두 손 모아 아래로", ball.dx, Math.min(v.H * 0.93, ball.dy + body().sw * 0.9 + U * 0.04), Math.min(U * 0.04, z.w / 14), "#fff", "#2f6fd1", 3);
          }
          if (ph === "spike") {
            ctx.setLineDash([U * 0.012, U * 0.01]); ctx.strokeStyle = "#ffd400"; ctx.lineWidth = U * 0.008;
            ctx.beginPath(); ctx.arc(ball.dx, ball.dy, body().sw * 0.8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            outlinedText(ctx, "스파이크! 높이 들었다 내려치기", ball.dx, ball.dy + body().sw * 0.8 + U * 0.04, Math.min(U * 0.04, z.w / 14), "#fff", "#e0306a", 3);
          }
          ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ball.spin);
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = Math.max(2, r * 0.28); ctx.strokeStyle = "#ffcf3a"; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, -0.6, 1.4); ctx.stroke();
          ctx.strokeStyle = "#3d7bff"; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 2.0, 3.9); ctx.stroke();
          ctx.lineWidth = Math.max(1.5, r * 0.08); ctx.strokeStyle = "#555"; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
        const bw = Math.min(z.w * 0.8, U * 0.55), by = v.H * 0.115;
        ctx.fillStyle = "rgba(10,30,80,.6)"; rr(ctx, z.cx - bw / 2, by, bw, U * 0.06, U * 0.02); ctx.fill();
        outlinedText(ctx, `나 ${me} : ${cpu} 상대 · 세트 ${sets[0]}:${sets[1]}`, z.cx, by + U * 0.03, Math.min(U * 0.034, z.w / 16), "#fff", "#024", 3);
      },
      result: () => `리시브 ${recv} · 스파이크 ${spikes} · 득점 ${pts} · 세트 ${sets[0]}:${sets[1]}`,
      get phase() { return ph; },
      get ball() { if (!ball) return null; const c = pos(); return { k: c.k, x: c.x, y: c.y, dx: ball.dx, dy: ball.dy }; },
    };
  },
  demo: {
    dur: 17,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      const ph = g.phase, b = g.ball, u = p.u;
      if (T > 15.5) say("이제 직접 해 봐요!");
      else if (ph === "recv") say("공이 오면 두 손 모아 아래에서 받아요. 리시브!");
      else if (ph === "toMate" || ph === "spike") say("같은 편이 올려 주면 높이 들었다 세게 내려쳐요. 스파이크!");
      else if (T < 3) say("배구! 받고, 올리고, 내려쳐요");
      if (ph === "recv" && b && b.k > 0.55) { p.rest(0, "clap", 2); p.rest(1, "clap", 2); return; }
      if (ph === "spike" && b) {
        p.rest(0, "guard", 1);
        if (b.k < 0.85) p.reach(1, b.dx, b.dy - 0.9 * u, 2.2);                 // 손을 공 위로
        else { p.reach(1, b.dx, b.dy + 1.6 * u, 3.5); if (!S.j) { p.jump(); S.j = 1; } }   // 아래로 내려치기
        return;
      }
      S.j = 0; p.rest(0, "guard", 1); p.rest(1, "guard", 1);
    },
  },
};
