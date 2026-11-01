// 비행기 (섬 투어): 두 팔을 날개처럼 벌리고 날기
// 기울이기 = 두 손 높이 차이(오른손이 낮으면 오른쪽으로), 날갯짓(두 손을 함께 아래로 휘두르기) = 위로 올라감
// 팔을 벌리고 있으면 천천히 내려가고(활공), 팔을 내리면 빨리 내려감. 풍선·링을 모으고 섬 산에 부딪히지 않기
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const ZRATE = 0.33;          // 물체가 멀리서 다가오는 속도(1/초, 보통)
const FLAP = 2.0;            // 날갯짓으로 인정하는 손 아래 방향 속도(어깨너비/초)
const S0 = 1 / 0.25, s = z => 1 / (0.25 + z * 3.5);   // 원근 배율 (z: 0 가까움 ~ 1 멂)

export default {
  id: "plane", title: "비행기", icon: "✈️", sec: 50, cursor: "", cat: "sport", bg: "#89f7fe", desc: "팔 날개로 섬 하늘 날기",
  how: "두 팔을 날개처럼 벌려요. 오른쪽으로 가려면 오른손을 내리고, 두 팔을 아래로 힘껏 휘저으면 위로 올라가요. 풍선과 링을 모아요!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    let X = 0, A = 0.55, vA = 0, steer = 0, objs = [], spawnT = 0.6, t = 0, dist = 0, flapCool = 0, wet = 0, flapN = 0;
    let got = 0, rings = 0, streak = 0, lastRing = -9, wide = false, flapFx = 0;
    const R = () => ({ top: v.H * 0.1, bot: v.H * 0.64 });
    const planeY = () => { const r = R(); return r.top + (r.bot - r.top) * 0.74; };
    function spawn(kind, ox, alt, z0 = 1) { objs.push({ kind, ox, a: alt, z: z0, done: false }); }
    function spawnSet() {
      const r = Math.random(), ox = clamp(X + (Math.random() - 0.5) * 1.4, -1.4, 1.4), alt = 0.25 + Math.random() * 0.6;
      if (r < 0.55) spawn("balloon", ox, alt);
      else if (r < 0.8) for (let i = 0; i < 3; i++) spawn("ring", ox + i * 0.08 * (Math.random() < 0.5 ? -1 : 1), alt, 1 + i * 0.13);
      else { spawn("island", ox, 0); spawn("balloon", ox, 0.75, 1.02); }
    }
    // 화면 좌표: 가까울수록 크게, 비행기 높이와의 차이만큼 위아래로
    function proj(o) {
      const r = R(), k = s(o.z) / S0, hz = r.top + (r.bot - r.top) * 0.3;
      return { x: z.cx + (o.ox - X) * z.w * 0.55 * k, y: hz + (planeY() - hz) * k - (o.a - A) * (r.bot - r.top) * 0.95 * k, k };
    }
    return {
      update(dt) {
        t += dt; flapCool -= dt; flapFx = Math.max(0, flapFx - dt * 3); wet -= dt;
        const p = env.tracker.pts, hs = env.tracker.hands, sc = env.tracker.scale || v.U * 0.13;
        // 기울이기: 오른손(화면 오른쪽)이 낮으면 오른쪽으로
        if (hs[0].vis && hs[1].vis) {
          const tilt = (hs[1].y - hs[0].y) / sc;
          steer += (clamp(tilt / 0.9, -1, 1) - steer) * Math.min(1, dt * 6);
          // 날갯짓: 두 손이 함께 빠르게 아래로
          const down = Math.min(hs[0].vy, hs[1].vy) / sc;
          if (down > FLAP * D.punch && flapCool <= 0) { vA = Math.min(0.4, vA + 0.2); flapCool = 0.28; flapN++; flapFx = 1; sfx.whoosh(); }
          wide = p && p[11].v && p[12].v && (p[11].x - hs[0].x) / sc > 0.9 && (hs[1].x - p[12].x) / sc > 0.9;
        } else steer *= 0.9;
        X = clamp(X + steer * 0.95 * dt, -1.6, 1.6);
        vA -= (wide ? 0.12 : 0.24) * dt; vA *= Math.pow(0.6, dt); vA = clamp(vA, -0.3, 0.4);
        A = clamp(A + vA * dt, 0.03, 1);
        if (A <= 0.03) { vA = Math.max(vA, 0.05); if (wet <= 0) { wet = 2; env.miss(z.cx, planeY(), "물에 닿았어요! 날갯짓!"); burst(z.cx, planeY() + v.U * 0.05, { n: 16, colors: ["#bfefff", "#ffffff"], speed: v.U * 0.5, gravity: v.U, size: v.U * 0.012 }); } }
        const zr = ZRATE * D.speed;
        dist += zr * dt;
        spawnT -= dt; if (spawnT <= 0) { spawnSet(); spawnT = (1.25 - 0.35 * env.progress()) / D.speed; }
        for (const o of objs) {
          o.z -= zr * dt;
          if (o.done || o.z > 0.04) continue;
          o.done = true;
          const dx = Math.abs(o.ox - X), dh = Math.abs(o.a - A), q = proj(o);
          if (o.kind === "island") {
            if (dx < 0.3 && A < 0.5) { vA = 0.45; shake(v.U * 0.02, 0.3); sfx.thud(); env.miss(z.cx, planeY(), "산에 쿵!"); streak = 0; }
          } else if (dx < 0.2 * D.reach && dh < 0.17 * D.reach) {
            if (o.kind === "balloon") { got++; sfx.pop(); env.award(1, q.x, q.y - v.U * 0.05); burst(q.x, q.y, { n: 18, colors: ["#ff5a7a", "#ffd400", "#ffffff"], speed: v.U * 0.6, gravity: v.U * 0.5, size: v.U * 0.015 }); }
            else {
              rings++; streak = t - lastRing < 1.2 ? streak + 1 : 1; lastRing = t; sfx.catch(env.player.combo);
              env.award(streak >= 3 ? 2 : 1, q.x, q.y - v.U * 0.05);
              if (streak >= 3) popup(q.x, q.y + v.U * 0.05, `링 ${streak}개 연속!`, { size: v.U * 0.04, color: "#fff", stroke: "#1d8f47" });
            }
          } else if (o.kind === "ring") streak = 0;
        }
        objs = objs.filter(o => o.z > -0.05);
      },
      draw(ctx) {
        const r = R(), U = v.U, hz = r.top + (r.bot - r.top) * 0.3, pY = planeY();
        ctx.save(); rr(ctx, z.x0 + 4, r.top, z.w - 8, r.bot - r.top, U * 0.03); ctx.clip();
        // 하늘과 바다 (높이 날수록 수평선 아래 바다가 넓게)
        ctx.globalAlpha = 0.86;   // 카메라 속 내 모습이 살짝 비치게
        let g = ctx.createLinearGradient(0, r.top, 0, hz); g.addColorStop(0, "#5ec8ff"); g.addColorStop(1, "#d6f3ff");
        ctx.fillStyle = g; ctx.fillRect(z.x0, r.top, z.w, hz - r.top);
        g = ctx.createLinearGradient(0, hz, 0, r.bot); g.addColorStop(0, "#5fb8e8"); g.addColorStop(1, "#1f6fb5");
        ctx.fillStyle = g; ctx.fillRect(z.x0, hz, z.w, r.bot - hz); ctx.globalAlpha = 1;
        // 먼 섬 (옆으로 움직이면 따라 흐름)
        ctx.fillStyle = "#4caf63";
        for (let i = -2; i <= 2; i++) { const ix = z.cx + ((i * 0.9 - X * 0.25) % 2.25) * z.w * 0.5; ctx.beginPath(); ctx.ellipse(ix, hz, z.w * 0.09, (r.bot - r.top) * 0.035, 0, Math.PI, 0); ctx.fill(); }
        // 파도 줄 (앞으로 흘러옴)
        ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const zz = ((i / 8 - dist * 0.6) % 1 + 1) % 1, k = s(zz) / S0, y = hz + (pY + A * (r.bot - r.top) * 0.95 - hz) * k;
          if (y > r.bot || y < hz) continue; ctx.beginPath(); ctx.moveTo(z.x0, y); ctx.lineTo(z.x1, y); ctx.stroke();
        }
        // 물체 (먼 것부터)
        for (const o of [...objs].sort((a, b) => b.z - a.z)) {
          if (o.done || o.z > 1.05) continue;
          const q = proj(o), sz = U * 0.09 * q.k * 4;
          ctx.globalAlpha = Math.min(1, (1.05 - o.z) * 5);
          if (o.kind === "island") {
            const base = hz + (pY + A * (r.bot - r.top) * 0.95 - hz) * q.k, top = base - (r.bot - r.top) * 0.5 * q.k * 4 * 0.25;
            ctx.fillStyle = "#3e8e4f"; ctx.beginPath(); ctx.moveTo(q.x - sz * 2.2, base); ctx.lineTo(q.x - sz * 0.2, top); ctx.lineTo(q.x + sz * 0.4, top + sz * 0.3); ctx.lineTo(q.x + sz * 2.2, base); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#f3e2a9"; ctx.beginPath(); ctx.ellipse(q.x, base, sz * 2.4, sz * 0.25, 0, 0, Math.PI * 2); ctx.fill();
          } else if (o.kind === "balloon") {
            ctx.strokeStyle = "#555"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(q.x, q.y + sz * 0.5); ctx.lineTo(q.x, q.y + sz * 1.1); ctx.stroke();
            ctx.fillStyle = "#ff5a7a"; ctx.beginPath(); ctx.ellipse(q.x, q.y, sz * 0.42, sz * 0.52, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.ellipse(q.x - sz * 0.14, q.y - sz * 0.2, sz * 0.1, sz * 0.15, -0.5, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.strokeStyle = "#ffd400"; ctx.lineWidth = Math.max(2, sz * 0.14); ctx.beginPath(); ctx.ellipse(q.x, q.y, sz * 0.6, sz * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = "#fff6b0"; ctx.lineWidth = Math.max(1, sz * 0.05); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        // 내 비행기 (기울기만큼 돌아감, 프로펠러 회전)
        const W = Math.min(z.w * 0.32, U * 0.3);
        ctx.save(); ctx.translate(z.cx, pY); ctx.rotate(steer * 0.45);
        ctx.fillStyle = "#ff8a3d"; rr(ctx, -W * 0.5, -W * 0.06, W, W * 0.12, W * 0.05); ctx.fill();           // 날개
        ctx.fillStyle = "#ffcf3a"; ctx.beginPath(); ctx.ellipse(0, 0, W * 0.09, W * 0.16, 0, 0, Math.PI * 2); ctx.fill();   // 몸통
        ctx.fillStyle = "#ff8a3d"; rr(ctx, -W * 0.16, W * 0.12, W * 0.32, W * 0.06, W * 0.03); ctx.fill();   // 꼬리
        ctx.strokeStyle = "rgba(60,60,60,.7)"; ctx.lineWidth = 3; const pa = t * 40;
        ctx.beginPath(); ctx.moveTo(Math.cos(pa) * W * 0.12, -W * 0.17 + Math.sin(pa) * W * 0.02); ctx.lineTo(-Math.cos(pa) * W * 0.12, -W * 0.17 - Math.sin(pa) * W * 0.02); ctx.stroke();
        if (flapFx > 0) { ctx.strokeStyle = `rgba(255,255,255,${flapFx})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, W * 0.05, W * 0.55, 0.2, Math.PI - 0.2); ctx.stroke(); }
        ctx.restore();
        // 높이 막대
        const bx = z.x1 - U * 0.05, by0 = r.top + U * 0.03, by1 = r.bot - U * 0.03;
        ctx.fillStyle = "rgba(0,0,0,.35)"; rr(ctx, bx - U * 0.012, by0, U * 0.024, by1 - by0, U * 0.012); ctx.fill();
        outlinedText(ctx, "✈️", bx, by1 - (by1 - by0) * A, U * 0.035, "#fff", "#333", 2);
        ctx.restore();
        ctx.lineWidth = 3; ctx.strokeStyle = env.color; rr(ctx, z.x0 + 4, r.top, z.w - 8, r.bot - r.top, U * 0.03); ctx.stroke();
        if (A < 0.15) outlinedText(ctx, "너무 낮아요! 두 팔로 날갯짓!", z.cx, r.bot + U * 0.04, Math.min(U * 0.035, z.w / 16), "#fff", "#c0392b", 3);
        else outlinedText(ctx, `풍선 ${got} · 링 ${rings}`, z.cx, r.bot + U * 0.04, Math.min(U * 0.035, z.w / 14), "#fff", "#1f6fb5", 3);
      },
      result: () => `풍선 ${got} · 링 ${rings} · 날갯짓 ${flapN}번`,
      // 설명 시연용
      get X() { return X; }, get A() { return A; },
      get objs() { return objs.filter(o => !o.done && o.kind !== "island"); },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4) say("비행기! 두 팔을 날개처럼 벌려요");
      else if (T < 9) say("오른쪽으로 가려면 오른손을 내려요. 왼쪽은 왼손을 내리고");
      else if (T < 14) say("두 팔을 아래로 힘껏 휘저으면 위로 올라가요!");
      else say("이제 직접 해 봐요!");
      const u = p.u, sh = p.shoulderY, cx = p.cx;
      // 가장 가까운 풍선·링을 목표로
      const tg = g.objs.filter(o => o.z > 0.05).sort((a, b) => a.z - b.z)[0];
      const want = tg ? clamp((tg.ox - g.X) * 4, -1, 1) : 0, gap = (tg ? tg.a : 0.5) - g.A;
      if (gap > 0.07) S.climb = true; else if (gap < 0.0) S.climb = false;   // 목표보다 낮을 때만 날갯짓
      const climb = S.climb;
      const dive = gap < -0.1;                 // 목표보다 높으면 팔을 내려 빨리 내려감
      const flapUp = climb && Math.floor(T / 0.2) % 2 === 0;
      const yBase = climb ? (flapUp ? sh - 0.9 * u : sh + 0.7 * u) : dive ? sh + 1.2 * u : sh;
      const sp = climb ? 3.2 : 1.2, ax = dive ? 1.0 : 1.9;
      p.reach(0, cx - ax * u, yBase - want * 0.8 * u, sp);   // 왼손: 오른쪽으로 갈 땐 위로
      p.reach(1, cx + ax * u, yBase + want * 0.8 * u, sp);   // 오른손: 오른쪽으로 갈 땐 아래로
    },
  },
};
