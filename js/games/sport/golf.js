// 골프 (니어핀): 두 손을 모아 머리 위로 들어 올렸다가(백스윙) 빠르게 아래로 휘두르면 샷
// 손을 높이 들수록 멀리 날아감 → 깃발까지 거리에 맞게 높이를 조절. 휘두를 때 손이 옆으로 쏠리면 공이 휨, 바람도 있음
import { burst, popup, outlinedText, rr, clamp } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const SWING = 2.2;                         // 다운스윙으로 인정하는 손 속도(어깨너비/초)
const MAX_DIST = 170;                      // 끝까지 들었을 때 날아가는 거리(m)
const carry = lv => 20 + (MAX_DIST - 20) * lv;
const needOf = d => clamp((d - 20) / (MAX_DIST - 20), 0, 1);

export default {
  id: "golf", title: "골프", icon: "⛳", sec: 60, cursor: "", cat: "sport", bg: "#96e6a1", desc: "깃발 가까이 샷",
  how: "두 손을 모아 머리 위로 들었다가 빠르게 아래로 휘둘러요. 높이 들수록 멀리! 깃발에 가까울수록 점수",
  create(env) {
    const z = env.zone, v = env.view;
    let hole = null, phase = "address", level = 0, maxLv = 0, backT = -9, t = 0, shot = null, holes = 0, best = Infinity, sumScore = 0, cups = 0;
    function newHole() {
      holes++;
      const dist = 60 + Math.round(Math.random() * 80);
      hole = { dist, px: (Math.random() - 0.5) * 16, wind: Math.round((Math.random() - 0.5) * 8 * env.diff.speed) };
      phase = "address"; maxLv = 0; shot = null;
    }
    newHole();
    // 위에서 내려다본 홀: 아래쪽이 티, 위쪽이 깃발
    const map = () => {
      const top = v.H * 0.15, bot = v.H * 0.66, ppm = (bot - top - v.U * 0.04) / MAX_DIST;
      return { top, bot, ppm, tx: z.cx, ty: bot - v.U * 0.02 };
    };
    const toScr = (mx, my) => { const M = map(); return { x: M.tx + mx * M.ppm * 1.4, y: M.ty - my * M.ppm }; };
    function body() {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return null;
      return { sy: (p[11].y + p[12].y) / 2, sw: Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1 };
    }
    function hit(vxSw) {
      const lv = clamp(maxLv, 0.05, 1), d = carry(lv) * (0.97 + Math.random() * 0.06);
      const ang = clamp(vxSw * 0.03, -0.28, 0.28) + (Math.random() - 0.5) * 0.04 / env.diff.reach;   // 휘는 정도
      const T = 1.3 + lv * 0.6, side = Math.sin(ang) * d + hole.wind * T * 1.6;
      shot = { t: 0, T, x: side, y: Math.cos(ang) * d, roll: d * 0.04, lv };
      phase = "fly"; sfx.whoosh(); sfx.bonk();
    }
    function land() {
      const dx = shot.x - hole.px, dy = shot.y - hole.dist, dm = Math.hypot(dx, dy), P = toScr(shot.x, shot.y);
      best = Math.min(best, dm); phase = "result"; shot.res = 0;
      let pts = 0, label = "";
      if (dm < 1.2) { pts = 10; label = "홀인원!"; cups++; sfx.fanfare(); burst(P.x, P.y, { n: 50, colors: ["#ffd400", "#ff7aa2", "#7ae0ff", "#9dff7a"], shape: "confetti", speed: v.U * 1.1, gravity: v.U, size: v.U * 0.018 }); }
      else if (dm < 4) { pts = 6; label = "나이스 샷!"; sfx.fever(); }
      else if (dm < 9) { pts = 4; label = "그린 위!"; sfx.catch(3); }
      else if (dm < 16) { pts = 2; label = "가까워요"; sfx.catch(1); }
      else if (dm < 30) { pts = 1; label = "괜찮아요"; }
      sumScore += pts;
      if (pts) env.award(pts, P.x, P.y - v.U * 0.05); else env.miss(P.x, P.y, "너무 멀어요");
      popup(z.cx, v.H * 0.4, `${label ? label + " " : ""}깃발까지 ${dm.toFixed(1)}m`, { size: Math.min(v.U * 0.05, z.w / 14), color: "#fff", stroke: "#2d6a1e", life: 1.6 });
    }
    return {
      update(dt) {
        t += dt;
        const b = body(), hs = env.tracker.hands.filter(h => h.vis);
        if (b && hs.length) {
          const midY = hs.reduce((s, h) => s + h.y, 0) / hs.length;
          level = clamp((b.sy - midY) / (1.7 * b.sw), 0, 1);
          if (phase === "address" || phase === "back") {
            if (level > 0.2) { phase = "back"; backT = t; maxLv = Math.max(maxLv, level); }
            const down = hs.reduce((s, h) => s + h.vy, 0) / hs.length > 0, fast = Math.max(...hs.map(h => h.bodySpeed)) > SWING * env.diff.punch;
            if (phase === "back" && t - backT < 1.5 && down && fast && midY > b.sy + b.sw * 0.2) hit(hs.reduce((s, h) => s + h.vx, 0) / hs.length / b.sw);
            if (phase === "back" && t - backT > 1.5 && level < 0.1) { phase = "address"; maxLv = 0; }
          }
        }
        if (phase === "fly") { shot.t += dt; if (shot.t >= shot.T + 0.4) land(); }
        else if (phase === "result") { shot.res += dt; if (shot.res > 2.2) newHole(); }
      },
      draw(ctx) {
        const U = v.U, M = map(), w = Math.min(z.w * 0.8, U * 0.75);
        // 잔디와 페어웨이 (반투명)
        ctx.fillStyle = "rgba(40,110,40,.35)"; rr(ctx, z.cx - w / 2, M.top, w, M.bot - M.top, U * 0.03); ctx.fill();
        const G = toScr(hole.px, hole.dist), T0 = toScr(0, 0), gr = 9 * M.ppm * 1.4;
        ctx.fillStyle = "rgba(120,200,90,.45)"; ctx.beginPath(); ctx.moveTo(T0.x - U * 0.04, T0.y); ctx.lineTo(G.x - gr * 1.2, G.y); ctx.lineTo(G.x + gr * 1.2, G.y); ctx.lineTo(T0.x + U * 0.04, T0.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(150,230,110,.85)"; ctx.beginPath(); ctx.ellipse(G.x, G.y, gr, gr * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        // 거리 눈금
        ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.font = `${Math.round(U * 0.02)}px sans-serif`; ctx.textAlign = "left";
        for (let m = 50; m < MAX_DIST; m += 50) { const P = toScr(0, m); ctx.fillRect(z.cx - w / 2 + 4, P.y, U * 0.03, 2); ctx.fillText(`${m}m`, z.cx - w / 2 + U * 0.035, P.y + U * 0.008); }
        // 깃발
        ctx.fillStyle = "#222"; ctx.beginPath(); ctx.ellipse(G.x, G.y, U * 0.008, U * 0.005, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(G.x, G.y); ctx.lineTo(G.x, G.y - U * 0.08); ctx.stroke();
        ctx.fillStyle = "#ff3b3b"; ctx.beginPath(); ctx.moveTo(G.x, G.y - U * 0.08); ctx.lineTo(G.x + U * 0.045, G.y - U * 0.065); ctx.lineTo(G.x, G.y - U * 0.05); ctx.closePath(); ctx.fill();
        outlinedText(ctx, `${hole.dist}m`, G.x, G.y - U * 0.1, U * 0.035, "#fff", "#2d6a1e");
        // 바람
        const wx = z.cx + w / 2 - U * 0.09, wy = M.top + U * 0.04;
        outlinedText(ctx, hole.wind ? `바람 ${hole.wind > 0 ? "→" : "←"} ${Math.abs(hole.wind)}` : "바람 없음", wx, wy, U * 0.028, "#fff", "#1d5f8f", 3);
        // 공
        let bx = 0, by = 0, hgt = 0;
        if (shot) {
          const k = Math.min(1, shot.t / shot.T), rk = Math.min(1, Math.max(0, (shot.t - shot.T) / 0.4));
          const yy = shot.y * k + shot.roll * rk, xx = shot.x * k;
          bx = xx; by = yy; hgt = Math.sin(k * Math.PI) * (0.5 + shot.lv);
          // 날아간 길
          ctx.setLineDash([U * 0.008, U * 0.01]); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(T0.x, T0.y);
          for (let i = 1; i <= 12; i++) { const kk = k * i / 12, P = toScr(shot.x * kk, shot.y * kk); ctx.lineTo(P.x, P.y); } ctx.stroke(); ctx.setLineDash([]);
        }
        const B = toScr(bx, by), br = U * 0.012 * (1 + hgt * 1.4);
        ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(B.x, B.y, U * 0.012, U * 0.007, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(B.x, B.y - hgt * U * 0.08, br, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // 힘 막대 (왼쪽): 지금 손 높이, 깃발까지 필요한 높이 표시
        const gx = z.x0 + Math.max(U * 0.05, z.w * 0.06), gh = v.H * 0.4, gy = v.H * 0.2, gw = Math.max(12, U * 0.025);
        ctx.fillStyle = "rgba(0,0,0,.45)"; rr(ctx, gx - gw / 2, gy, gw, gh, gw / 2); ctx.fill();
        const shown = phase === "fly" || phase === "result" ? shot.lv : phase === "back" ? Math.max(level, maxLv) : level;
        const pg = ctx.createLinearGradient(0, gy + gh, 0, gy); pg.addColorStop(0, "#37d67a"); pg.addColorStop(0.6, "#ffd400"); pg.addColorStop(1, "#ff5a5a");
        ctx.fillStyle = pg; rr(ctx, gx - gw / 2, gy + gh * (1 - shown), gw, gh * shown, gw / 2); ctx.fill();
        const ny = gy + gh * (1 - needOf(hole.dist - (hole.dist * 0.04)));
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(gx + gw / 2 + 2, ny); ctx.lineTo(gx + gw / 2 + U * 0.025, ny - U * 0.013); ctx.lineTo(gx + gw / 2 + U * 0.025, ny + U * 0.013); ctx.closePath(); ctx.fill();
        outlinedText(ctx, "힘", gx, gy - U * 0.025, U * 0.03, "#fff", "#333", 3);
        if (phase === "address") outlinedText(ctx, "두 손 모아 위로 들었다가 휙!", z.cx, v.H * 0.9, Math.min(U * 0.04, z.w / 14), "#fff", "#2d6a1e");
        else if (phase === "back") outlinedText(ctx, "이제 아래로 빠르게 휘둘러요!", z.cx, v.H * 0.9, Math.min(U * 0.04, z.w / 14), "#fff", "#c05000");
        outlinedText(ctx, `${holes}번 홀`, z.cx, M.top - U * 0.025, U * 0.035, "#fff", "#2d6a1e");
      },
      result: () => `${holes - (phase === "result" ? 0 : 1)}번 샷 · 가장 가까이 ${best === Infinity ? "-" : best.toFixed(1) + "m"} · 홀인원 ${cups}`,
      // 설명 시연용
      get phase() { return phase; },
      get need() { return needOf(hole.dist * 0.96 - 0); },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      const u = p.u, cx = p.cx, sy = p.shoulderY;
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1;
      if (T < 4) say("골프! 두 손을 모아 머리 위로 들어요");
      else if (T < 8.5) say("그리고 아래로 빠르게 휘두르면 샷!");
      else if (T < 13.5) say("깃발이 멀면 높이, 가까우면 조금만 들어요");
      else say("이제 직접 해 봐요!");
      if (g.phase === "fly" || g.phase === "result") { p.rest(0, "down", 1); p.rest(1, "down", 1); S.ph = 0; return; }
      if (!S.ph) { S.ph = 1; S.t0 = T; }
      const sc = 1.7 * p.scale;   // 손 높이 1 = 어깨 위 1.7 어깨너비
      if (S.ph === 1) {             // 백스윙: 필요한 높이까지 천천히
        const y = sy - g.need * sc - 0.08 * u;
        p.reach(0, cx + 0.05 * u, y, 1.2); p.reach(1, cx + 0.2 * u, y, 1.2);
        if (T - S.t0 > 1.6) { S.ph = 2; S.t0 = T; }
      } else {                      // 다운스윙
        p.reach(0, cx - 0.1 * u, sy + 1.6 * u, 3.5); p.reach(1, cx + 0.05 * u, sy + 1.6 * u, 3.5);
      }
    },
  },
};
