// 탁구: 탁구대 너머 상대가 보낸 공이 내 쪽 탁구대에 한 번 튀고 오면, 그 근처에서 손을 휘둘러 받아치기
// 아주 세게 휘두르면 스매시(보너스, 상대가 잘 못 받음). 11점 먼저 내면 게임(2점 차)
import { burst, popup, shake, outlinedText, rr, FONT, clamp } from "../../fx.js?v=28";
import { sfx } from "../../audio.js?v=28";

const FLIGHT = 1.1;    // 공이 상대에게서 나에게 오는 시간(초, 보통)
const BACK = 0.75;     // 받아친 공이 상대에게 가는 시간(초)
const SWING = 2.4;     // 받아치기로 인정하는 손 속도(어깨너비/초)
const SMASH = 7;       // 스매시 손 속도
const CPU_RETURN = { easy: 0.55, normal: 0.7, hard: 0.82 };

export default {
  id: "pingpong", title: "탁구", icon: "🏓", sec: 60, cursor: "🏓", cat: "sport", bg: "#ffc3a0", desc: "통통 튀는 공 받아치기",
  how: "공이 탁구대에 튀고 내 쪽으로 오면 그 근처에서 손을 휘둘러 받아쳐요. 아주 세게 휘두르면 스매시!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    let ball = null, wait = 1.0, me = 0, cpu = 0, gMe = 0, gCpu = 0, returns = 0, smashes = 0, winners = 0, cpuX = 0.5, t = 0;
    const trails = [[], []];
    function body() {
      const p = env.tracker.pts;
      if (p && p[11].v && p[12].v) { const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y); return { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2, sw: Math.max(sw, v.U * 0.08) }; }
      return { x: z.cx, y: v.H * 0.45, sw: v.U * 0.13 };
    }
    // 탁구대: 먼 쪽 farY ~ 가까운 쪽 nearY
    const T_ = () => ({ fy: v.H * 0.3, ny: v.H * 0.66, fw: z.w * 0.36, nw: z.w * 0.82 });
    const R = () => Math.max(body().sw * 0.95, v.U * 0.085) * D.reach;
    function send(fromFrac) {
      const b = body(), side = Math.random() < 0.5 ? -1 : 1, off = (0.6 + Math.random() * 0.7) * b.sw;
      const dx = clamp(b.x + side * off, z.x0 + v.U * 0.05, z.x1 - v.U * 0.05), dy = b.y + b.sw * (0.1 + Math.random() * 0.5);
      ball = { dir: 1, sx: z.x0 + z.w * fromFrac, sy: T_().fy - v.U * 0.02, dx, dy, t: 0, T: FLIGHT * (1 - 0.2 * env.progress()) / D.speed, side: dx < b.x ? 0 : 1, spin: 0 };
      sfx.pop();
    }
    // 오는 공은 내 쪽 탁구대에 한 번 튐(k=0.6), 가는 공은 상대 쪽에 튐
    function pos(B) {
      const k = Math.min(1.25, B.t / B.T), Hh = v.H;
      if (B.dir === 1) {
        const e = k < 1 ? k * (0.6 + 0.4 * k) : k;
        const hop = k < 0.6 ? Math.sin(k / 0.6 * Math.PI) * Hh * 0.07 : Math.sin(Math.min(1, (k - 0.6) / 0.4) * Math.PI) * Hh * 0.05;
        return { k, x: B.sx + (B.dx - B.sx) * e, y: B.sy + (B.dy - B.sy) * e - hop, s: 0.35 + 0.65 * Math.min(1, e), bounce: k > 0.58 && k < 0.62 };
      }
      const e = 1 - (1 - Math.min(1, k)) ** 2, hop = Math.sin(Math.min(1, k) * Math.PI) * Hh * 0.06;
      return { k, x: B.sx + (B.dx - B.sx) * e, y: B.sy + (B.dy - B.sy) * e - hop, s: 1 - 0.65 * e };
    }
    function point(mine) {
      if (mine) me++; else cpu++;
      if ((me >= 11 || cpu >= 11) && Math.abs(me - cpu) >= 2) {
        const won = me > cpu; if (won) gMe++; else gCpu++; me = cpu = 0;
        if (won) { sfx.fanfare(); env.award(3, z.cx, v.H * 0.4); popup(z.cx, v.H * 0.48, "게임 승리!", { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.3 }); }
      }
      ball = null; wait = 1.0;
    }
    return {
      update(dt) {
        t += dt;
        const hands = env.tracker.hands;
        hands.forEach((h, k) => { const tr = trails[k]; if (h.vis) tr.push({ x: h.x, y: h.y, t, fast: h.bodySpeed > SWING * D.punch }); else tr.length = 0; while (tr.length && t - tr[0].t > 0.2) tr.shift(); });
        if (!ball) { wait -= dt; if (wait <= 0) send(cpuX); return; }
        ball.t += dt; ball.spin += dt * 15;
        const c = pos(ball);
        if (ball.dir === 1) {
          if (c.bounce && !ball.bounced) { ball.bounced = true; sfx.tick(); }
          if (c.k > 0.72 && c.k < 1.15) {
            const h = hands.find(h => h.vis && h.bodySpeed >= SWING * D.punch && Math.hypot(h.x - c.x, h.y - c.y) < R());
            if (h) {
              const smash = h.bodySpeed >= SMASH * D.punch;
              returns++; if (smash) smashes++;
              sfx.hit(smash ? 3 : 1); if (smash) shake(v.U * 0.01, 0.15);
              env.award(smash ? 2 : 1, c.x, c.y - v.U * 0.08);
              popup(c.x, c.y + v.U * 0.06, smash ? "스매시!" : "좋아요", { size: v.U * (smash ? 0.05 : 0.036), color: "#fff", stroke: smash ? "#e0306a" : "#d06a00", life: 0.7 });
              burst(c.x, c.y, { n: smash ? 20 : 10, colors: ["#ffffff", "#ffb36b"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.4, size: v.U * 0.014, life: 0.5 });
              const aim = clamp(0.5 + (h.vx / (h.speed || 1)) * 0.3 + (Math.random() - 0.5) * 0.25, 0.15, 0.85);
              const tb = T_();
              ball = { dir: -1, sx: c.x, sy: c.y, dx: z.cx + (aim - 0.5) * tb.fw, dy: tb.fy - v.U * 0.02, t: 0, T: BACK / (smash ? 1.5 : 1), aim, smash, spin: 0 };
              return;
            }
          }
          if (c.k >= 1.15) { sfx.thud(); env.miss(ball.dx, ball.dy, "놓쳤어요"); point(false); }
        } else {
          cpuX += (ball.aim - cpuX) * Math.min(1, dt * 3);
          if (c.k >= 1) {
            if (Math.random() < (CPU_RETURN[D.id] || 0.7) - (ball.smash ? 0.3 : 0) - (Math.abs(ball.aim - 0.5) > 0.25 ? 0.1 : 0)) send(ball.aim);
            else { winners++; env.award(1, ball.dx, ball.dy); popup(ball.dx, ball.dy + v.U * 0.1, "득점!", { size: v.U * 0.05, color: "#fff", stroke: "#e0306a" }); sfx.fever(); point(true); }
          }
        }
      },
      draw(ctx) {
        const U = v.U, tb = T_();
        // 탁구대
        ctx.fillStyle = "rgba(20,80,140,.55)"; ctx.beginPath(); ctx.moveTo(z.cx - tb.fw / 2, tb.fy); ctx.lineTo(z.cx + tb.fw / 2, tb.fy); ctx.lineTo(z.cx + tb.nw / 2, tb.ny); ctx.lineTo(z.cx - tb.nw / 2, tb.ny); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(z.cx, tb.fy); ctx.lineTo(z.cx, tb.ny); ctx.lineWidth = 2; ctx.stroke();
        const my = tb.fy + (tb.ny - tb.fy) * 0.38, mw = tb.fw + (tb.nw - tb.fw) * 0.38;
        ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillRect(z.cx - mw / 2 - U * 0.01, my - U * 0.035, mw + U * 0.02, U * 0.035);
        // 상대
        const cx = z.x0 + z.w * (0.5 + (cpuX - 0.5) * 0.45);
        ctx.font = `${Math.round(U * 0.07)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🧑", cx, tb.fy - U * 0.06); ctx.font = `${Math.round(U * 0.035)}px ${FONT}`; ctx.fillText("🏓", cx + U * 0.035, tb.fy - U * 0.04);
        ctx.lineCap = "round";
        trails.forEach(tr => { for (let i = 1; i < tr.length; i++) { if (!tr[i].fast) continue; const k = i / tr.length; ctx.strokeStyle = `rgba(255,220,180,${(0.2 + 0.7 * k).toFixed(2)})`; ctx.lineWidth = 2 + U * 0.014 * k; ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke(); } });
        if (ball) {
          const c = pos(ball), r = U * 0.022 * c.s;
          if (ball.dir === 1 && c.k > 0.3) {
            ctx.setLineDash([U * 0.01, U * 0.008]); ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = U * 0.005;
            ctx.beginPath(); ctx.arc(ball.dx, ball.dy, R() * 0.6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          }
          ctx.fillStyle = "#fff"; ctx.strokeStyle = "#f08c2a"; ctx.lineWidth = Math.max(1.5, r * 0.2);
          ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          if (c.bounce) burst(c.x, c.y + r, { n: 3, colors: ["#ffffff"], speed: U * 0.15, gravity: 0, size: U * 0.006, life: 0.2 });
        }
        const bw = Math.min(z.w * 0.8, U * 0.55), by = v.H * 0.115;
        ctx.fillStyle = "rgba(10,40,80,.6)"; rr(ctx, z.cx - bw / 2, by, bw, U * 0.06, U * 0.02); ctx.fill();
        outlinedText(ctx, `나 ${me} : ${cpu} 상대 · 게임 ${gMe}:${gCpu}`, z.cx, by + U * 0.03, Math.min(U * 0.034, z.w / 16), "#fff", "#024", 3);
      },
      result: () => `받아친 공 ${returns} · 스매시 ${smashes} · 득점 ${winners} · 게임 ${gMe}:${gCpu}`,
      get ball() { if (!ball) return null; const c = pos(ball); return { incoming: ball.dir === 1, k: c.k, x: c.x, y: c.y, dx: ball.dx, dy: ball.dy, side: ball.side }; },
    };
  },
  demo: {
    dur: 14,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4.5) say("탁구! 공이 탁구대에 튀고 오면 손을 휘둘러요");
      else if (T < 9) say("아주 세게 휘두르면 스매시! 상대가 잘 못 받아요");
      else if (T < 12.5) say("상대가 못 받으면 내 점수");
      else say("이제 직접 해 봐요!");
      const b = g.ball, u = p.u;
      if (!b || !b.incoming) { p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }
      const k = b.side, s = k ? 1 : -1, fast = T > 4.5 && T < 9;
      p.rest(1 - k, "guard", 1);
      if (b.k < (fast ? 0.88 : 0.8)) p.reach(k, b.dx + s * 0.8 * u, b.dy + 0.2 * u, 1.6);
      else p.reach(k, b.dx - s * 1.2 * u, b.dy - 0.4 * u, fast ? 4.5 : 0.9);   // 보통은 살살, 스매시 구간은 아주 세게
    },
  },
};
