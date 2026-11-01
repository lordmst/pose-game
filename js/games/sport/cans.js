// 깡통 맞추기: 탁구대 끝에 쌓인 깡통 피라미드를 탁구공으로 무너뜨리기
// 날아오는 공을 휘둘러 받아치면 손을 휘두른 쪽(옆)과 높이(위·아래)로 공이 날아감. 깡통 하나에 1점, 다 쓰러뜨리면 보너스
import { burst, popup, shake, outlinedText, rr, FONT, clamp } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const FLIGHT = 1.2;    // 공이 나에게 오는 시간(초, 보통)
const SHOT = 0.55;     // 받아친 공이 깡통까지 가는 시간(초)
const SWING = 2.3;     // 받아치기로 인정하는 손 속도(어깨너비/초)
const ROWS = [4, 3, 2, 1];
const COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6"];

export default {
  id: "cans", title: "깡통 맞추기", icon: "🥫", sec: 60, cursor: "🏓", cat: "sport", bg: "#fbc2eb", desc: "탁구공으로 깡통 쓰러뜨리기",
  how: "날아오는 공을 휘둘러 받아쳐서 깡통을 맞혀요. 휘두르는 방향으로 옆이, 손 높이로 위아래가 정해져요. 다 쓰러뜨리면 보너스!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    let ball = null, wait = 1.0, cans = [], refill = 0, knocked = 0, clears = 0, shots = 0, t = 0;
    const trails = [[], []];
    function body() {
      const p = env.tracker.pts;
      if (p && p[11].v && p[12].v) { const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y); return { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2, sw: Math.max(sw, v.U * 0.08) }; }
      return { x: z.cx, y: v.H * 0.45, sw: v.U * 0.13 };
    }
    const tableY = () => v.H * 0.36;
    const CW = () => Math.min(z.w * 0.065, v.U * 0.055), CH = () => CW() * 1.35;
    function stack() {
      cans = []; const cw = CW(), ch = CH(), gap = cw * 0.12;
      ROWS.forEach((n, r) => { for (let i = 0; i < n; i++) cans.push({ x: z.cx + (i - (n - 1) / 2) * (cw + gap), y: tableY() - r * ch, r, i, st: "stand", vx: 0, vy: 0, rot: 0, vr: 0, col: COLORS[(r + i) % COLORS.length], scored: false }); });
    }
    stack();
    const R = () => Math.max(body().sw * 0.95, v.U * 0.085) * D.reach;
    function send() {
      const b = body(), side = Math.random() < 0.5 ? -1 : 1, off = (0.6 + Math.random() * 0.6) * b.sw;
      const dx = clamp(b.x + side * off, z.x0 + v.U * 0.05, z.x1 - v.U * 0.05), dy = b.y + b.sw * (0.1 + Math.random() * 0.4);
      ball = { dir: 1, sx: z.cx + (Math.random() - 0.5) * z.w * 0.2, sy: tableY() + v.U * 0.03, dx, dy, t: 0, T: FLIGHT / D.speed, side: dx < b.x ? 0 : 1 };
      sfx.pop();
    }
    function pos(B) {
      const k = Math.min(1.25, B.t / B.T);
      if (B.dir === 1) {
        const e = k < 1 ? k * (0.6 + 0.4 * k) : k, hop = k < 0.55 ? Math.sin(k / 0.55 * Math.PI) * v.H * 0.06 : Math.sin(Math.min(1, (k - 0.55) / 0.45) * Math.PI) * v.H * 0.05;
        return { k, x: B.sx + (B.dx - B.sx) * e, y: B.sy + (B.dy - B.sy) * e - hop, s: 0.4 + 0.6 * Math.min(1, e) };
      }
      const e = 1 - (1 - Math.min(1, k)) ** 2;
      return { k, x: B.sx + (B.dx - B.sx) * e, y: B.sy + (B.dy - B.sy) * e - Math.sin(Math.min(1, k) * Math.PI) * v.H * 0.08, s: 1 - 0.55 * e };
    }
    function knock(c, fromX, power) {
      c.st = "fall"; c.vx = (c.x - fromX) * 4 + (Math.random() - 0.5) * v.U * 0.5; c.vy = -v.U * (0.3 + 0.4 * power); c.vr = (Math.random() - 0.5) * 12;
    }
    return {
      update(dt) {
        t += dt;
        const hands = env.tracker.hands;
        hands.forEach((h, k) => { const tr = trails[k]; if (h.vis) tr.push({ x: h.x, y: h.y, t, fast: h.bodySpeed > SWING * D.punch }); else tr.length = 0; while (tr.length && t - tr[0].t > 0.2) tr.shift(); });
        // 깡통: 받침이 없어지면 떨어짐, 떨어지는 깡통은 중력
        const cw = CW(), ch = CH();
        for (const c of cans) {
          if (c.st === "stand" && c.r > 0) {
            const below = cans.filter(o => o.r === c.r - 1 && o.st === "stand" && Math.abs(o.x - c.x) < cw * 0.9);
            if (below.length < 2) knock(c, c.x + (below.length ? (below[0].x - c.x) : (Math.random() - 0.5) * cw), 0.2);
          }
          if (c.st === "fall") {
            c.vy += v.U * 2.4 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
            if (!c.scored) { c.scored = true; knocked++; env.award(1, c.x, c.y - ch); sfx.bonk(); }
            if (c.y > v.H * 1.1) c.st = "gone";
          }
        }
        if (refill > 0) { refill -= dt; if (refill <= 0) stack(); }
        else if (cans.length && cans.every(c => c.st !== "stand")) {
          clears++; refill = 1.3; sfx.fanfare(); env.award(5, z.cx, tableY() - ch * 2);
          popup(z.cx, tableY() - ch * 3, "올 클리어!", { size: v.U * 0.07, color: "#fff", stroke: "#e0306a", life: 1.3 });
        }
        if (!ball) { wait -= dt; if (wait <= 0) send(); return; }
        ball.t += dt;
        const c = pos(ball);
        if (ball.dir === 1) {
          if (c.k > 0.72 && c.k < 1.15) {
            const h = hands.find(h => h.vis && h.bodySpeed >= SWING * D.punch && Math.hypot(h.x - c.x, h.y - c.y) < R());
            if (h) {
              shots++; sfx.hit(1);
              burst(c.x, c.y, { n: 8, colors: ["#ffffff", "#ffb36b"], shape: "star", speed: v.U * 0.4, gravity: v.U * 0.4, size: v.U * 0.012, life: 0.4 });
              // 옆: 손 위치와 휘두른 방향 / 높이: 손 높이 (허리 = 아랫줄, 머리 위 = 꼭대기)
              const b = body(), spread = cw * 5.2;
              const tx = clamp(z.cx + ((h.x - b.x) / (b.sw * 1.6)) * spread * 0.5 + (h.vx / (h.speed || 1)) * spread * 0.35 + (Math.random() - 0.5) * cw * 0.8, z.x0 + cw, z.x1 - cw);
              const lvl = clamp((b.y + b.sw - h.y) / b.sw, 0, 3.2), ty = tableY() - ch * (0.5 + lvl);
              ball = { dir: -1, sx: c.x, sy: c.y, dx: tx, dy: ty, t: 0, T: SHOT, power: Math.min(1, h.bodySpeed / 12) };
              return;
            }
          }
          if (c.k >= 1.15) { env.miss(ball.dx, ball.dy, "놓쳤어요"); ball = null; wait = 0.9; }
        } else if (c.k >= 1) {
          // 공이 닿은 자리의 깡통 쓰러뜨리기
          const hit = cans.filter(o => o.st === "stand" && Math.abs(o.x - ball.dx) < cw * 0.85 && ball.dy > o.y - ch * 1.05 && ball.dy < o.y + ch * 0.1);
          if (hit.length) { hit.forEach(o => knock(o, ball.dx, ball.power)); shake(v.U * 0.008, 0.15); sfx.hit(3); }
          else popup(ball.dx, ball.dy, "아깝다!", { size: v.U * 0.03, color: "#fff", stroke: "#888", life: 0.6 });
          ball = null; wait = 0.8;
        }
      },
      draw(ctx) {
        const U = v.U, ty = tableY(), cw = CW(), ch = CH();
        // 탁구대 (깡통이 놓인 먼 끝 ~ 내 앞)
        const fw = cw * 9, nw = z.w * 0.8, ny = v.H * 0.7;
        ctx.fillStyle = "rgba(20,80,140,.5)"; ctx.beginPath(); ctx.moveTo(z.cx - fw / 2, ty); ctx.lineTo(z.cx + fw / 2, ty); ctx.lineTo(z.cx + nw / 2, ny); ctx.lineTo(z.cx - nw / 2, ny); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 3; ctx.stroke();
        // 깡통
        for (const c of cans) {
          if (c.st === "gone") continue;
          ctx.save(); ctx.translate(c.x, c.y - ch / 2); ctx.rotate(c.rot);
          ctx.fillStyle = c.col; rr(ctx, -cw / 2, -ch / 2, cw, ch, cw * 0.12); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(-cw / 2, -ch * 0.12, cw, ch * 0.24);
          ctx.fillStyle = "#ccc"; ctx.fillRect(-cw / 2, -ch / 2, cw, ch * 0.08); ctx.fillRect(-cw / 2, ch / 2 - ch * 0.08, cw, ch * 0.08);
          ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(-cw * 0.32, -ch * 0.42, cw * 0.12, ch * 0.84);
          ctx.restore();
        }
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
        }
        const left = cans.filter(c => c.st === "stand").length;
        outlinedText(ctx, `남은 깡통 ${left} · 쓰러뜨린 깡통 ${knocked}`, z.cx, v.H * 0.14, Math.min(U * 0.034, z.w / 16), "#fff", "#a0306a", 3);
        outlinedText(ctx, "옆으로 휘두르면 옆으로, 손을 높이 치면 위쪽 깡통!", z.cx, v.H * 0.93, Math.min(U * 0.028, z.w / 20), "#fff", "#555", 3);
      },
      result: () => `쓰러뜨린 깡통 ${knocked} · 올 클리어 ${clears}번 · 받아친 공 ${shots}`,
      get ball() { if (!ball) return null; const c = pos(ball); return { incoming: ball.dir === 1, k: c.k, x: c.x, y: c.y, dx: ball.dx, dy: ball.dy, side: ball.side }; },
      get target() { const s = cans.filter(c => c.st === "stand").sort((a, b) => a.r - b.r)[0]; return s ? { x: s.x, y: s.y, r: s.r } : null; },
    };
  },
  demo: {
    dur: 15,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4.5) say("깡통 맞추기! 날아오는 공을 휘둘러 깡통에 맞혀요");
      else if (T < 9.5) say("옆으로 휘두르는 방향, 손 높이로 맞힐 곳을 골라요");
      else if (T < 13.5) say("깡통을 다 쓰러뜨리면 보너스!");
      else say("이제 직접 해 봐요!");
      const b = g.ball, u = p.u;
      if (!b || !b.incoming) { p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }
      const k = b.side, s = k ? 1 : -1;
      p.rest(1 - k, "guard", 1);
      // 몸 쪽(가운데)으로 휘둘러 피라미드 가운데를 노림, 허리 높이에서 → 아랫줄
      if (b.k < 0.85) p.reach(k, b.dx + s * 0.7 * u, b.dy + 0.3 * u, 1.6);
      else p.reach(k, b.dx - s * 1.0 * u, b.dy + 0.3 * u, 1.2);
    },
  },
};
