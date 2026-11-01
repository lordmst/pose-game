// 양궁: 한 팔은 옆으로 쭉 뻗고(활), 다른 손은 가슴·얼굴 쪽으로 당기면(시위) 조준점이 나타남
// 활 든 팔을 위아래로, 몸을 옆으로 움직여 조준점을 과녁 가운데로 → 당긴 손을 휙 놓으면(빠르게 떼면) 발사. 바람도 계산!
import { burst, popup, outlinedText, clamp } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const RINGS = ["#ffffff", "#ffffff", "#2b2b2b", "#2b2b2b", "#3d8bff", "#3d8bff", "#ff4d4d", "#ff4d4d", "#ffd400", "#ffd400"];
const RELEASE = 2.2;                 // 놓기로 인정하는 당긴 손 속도(어깨너비/초)

export default {
  id: "archery", title: "양궁", icon: "🏹", sec: 60, cursor: "", cat: "sport", bg: "#84fab0", desc: "활 당겨 과녁 맞히기",
  how: "한 팔은 옆으로 쭉, 다른 손은 가슴 쪽으로 당겨요. 조준점을 과녁 가운데로 옮긴 뒤 당긴 손을 휙 놓으면 발사!",
  create(env) {
    const z = env.zone, v = env.view;
    let phase = "idle", aimT = 0, lostT = 0, start = null, aim = { x: 0, y: 0 }, wind = 0, arrow = null, stuck = [], t = 0, shots = 0, total = 0, tens = 0;
    const tgt = () => ({ x: z.cx, y: v.H * 0.3, R: Math.min(z.w * 0.22, v.U * 0.17) });
    const newWind = () => { wind = Math.round((Math.random() - 0.5) * 6 * env.diff.speed); };
    newWind();
    // 지금 활을 당기고 있는지: 활 손(바깥으로 뻗은 손)과 시위 손(몸 가까이)
    function bowState() {
      const p = env.tracker.pts, hs = env.tracker.hands;
      if (!p || !p[11].v || !p[12].v || !hs[0].vis || !hs[1].vis) return null;
      const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1, mx = (p[11].x + p[12].x) / 2, my = (p[11].y + p[12].y) / 2;
      const k = Math.abs(hs[0].x - mx) > Math.abs(hs[1].x - mx) ? 0 : 1, bow = hs[k], pull = hs[1 - k];
      const drawn = Math.abs(bow.x - mx) > sw * 1.1 && Math.abs(bow.x - pull.x) > sw * 1.4 && Math.hypot(pull.x - mx, pull.y - my) < sw * 1.1;
      return { bow, pull, sw, mx, my, drawn };
    }
    function shoot(b) {
      const T = tgt(), land = { x: aim.x + wind * T.R * 0.05 + (Math.random() - 0.5) * T.R * 0.06, y: aim.y + (Math.random() - 0.5) * T.R * 0.06 };
      arrow = { t: 0, from: { x: b ? b.pull.x : z.cx, y: b ? b.pull.y : v.H * 0.6 }, to: land };
      phase = "fly"; shots++; sfx.whoosh();
    }
    function hitTarget() {
      const T = tgt(), d = Math.hypot(arrow.to.x - T.x, arrow.to.y - T.y), ring = d > T.R ? 0 : 10 - Math.floor(d / (T.R / 10));
      stuck.push({ dx: arrow.to.x - T.x, dy: arrow.to.y - T.y }); if (stuck.length > 6) stuck.shift();
      total += ring; arrow = null; phase = "idle"; aimT = 0; newWind();
      const P = { x: T.x, y: T.y + T.R * 1.35 };
      if (ring === 0) { sfx.thud(); env.miss(P.x, P.y, "빗나갔어요"); return; }
      sfx.bonk();
      env.award(ring >= 9 ? 3 : ring >= 7 ? 2 : 1, T.x + T.R * 1.2, T.y - T.R * 0.6);
      if (ring === 10) { tens++; sfx.fanfare(); burst(T.x, T.y, { n: 36, colors: ["#ffd400", "#ff7aa2", "#ffffff"], shape: "star", speed: v.U * 0.9, gravity: v.U * 0.4, size: v.U * 0.02 }); }
      popup(P.x, P.y, ring === 10 ? "10점! 정중앙!" : `${ring}점`, { size: v.U * (ring === 10 ? 0.07 : 0.05), color: "#fff", stroke: ring >= 9 ? "#e0a000" : "#2f8bff", life: 1.2 });
    }
    return {
      update(dt) {
        t += dt;
        const b = bowState(), T = tgt();
        if (phase === "idle") {
          if (b && b.drawn) { phase = "aim"; aimT = 0; lostT = 0; start = { bx: b.bow.x, by: b.bow.y, mx: b.mx }; const a = Math.random() * Math.PI * 2; aim = { x: T.x + Math.cos(a) * T.R * 0.7, y: T.y + Math.sin(a) * T.R * 0.7 }; start.ax = aim.x; start.ay = aim.y; }
        } else if (phase === "aim") {
          aimT += dt;
          if (b && aimT < 0.35) { start.bx = b.bow.x; start.by = b.bow.y; start.mx = b.mx; }   // 자세가 자리 잡을 때까지 기준을 따라감
          if (b) {
            // 활 팔을 올리면 조준점이 위로, 몸을 옆으로 옮기면 조준점도 옆으로. 오래 버틸수록 덜 흔들림
            const sway = T.R * 0.1 * (1 + 1.6 * Math.exp(-aimT * 1.5)) / env.diff.reach;
            aim.x = start.ax + (b.bow.x - start.bx) * 0.6 + (b.mx - start.mx) * 1.5 + Math.sin(t * 2.3) * sway;
            aim.y = start.ay + (b.bow.y - start.by) * 1.6 + Math.sin(t * 3.1 + 1) * sway * 0.8;
            aim.x = clamp(aim.x, z.x0, z.x1); aim.y = clamp(aim.y, v.H * 0.08, v.H * 0.6);
            if (aimT > 0.4 && b.pull.bodySpeed > RELEASE * env.diff.punch) { shoot(b); return; }   // 당긴 손을 휙 놓음
          }
          lostT = b && b.drawn ? 0 : lostT + dt;
          if (lostT > 0.25) { if (aimT > 0.6) shoot(b); else phase = "idle"; }                    // 자세가 풀리면: 충분히 조준했으면 발사, 아니면 취소
        } else if (phase === "fly") {
          arrow.t += dt; if (arrow.t >= 0.4) hitTarget();
        }
      },
      draw(ctx) {
        const U = v.U, T = tgt();
        // 과녁 (다리 + 고리)
        ctx.strokeStyle = "rgba(120,80,40,.8)"; ctx.lineWidth = U * 0.012;
        ctx.beginPath(); ctx.moveTo(T.x - T.R * 0.6, T.y + T.R * 1.5); ctx.lineTo(T.x, T.y); ctx.lineTo(T.x + T.R * 0.6, T.y + T.R * 1.5); ctx.stroke();
        for (let i = 0; i < 10; i++) { ctx.fillStyle = RINGS[i]; ctx.beginPath(); ctx.arc(T.x, T.y, T.R * (1 - i / 10), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = i === 2 || i === 3 ? "#888" : "#333"; ctx.lineWidth = 1; ctx.stroke(); }
        // 꽂힌 화살
        for (const s of stuck) { const x = T.x + s.dx, y = T.y + s.dy; ctx.fillStyle = "#5a3a10"; ctx.beginPath(); ctx.arc(x, y, U * 0.006, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#ff3b5c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + U * 0.012, y + U * 0.02); ctx.stroke(); }
        // 바람
        outlinedText(ctx, wind ? `바람 ${wind > 0 ? "→" : "←"} ${Math.abs(wind)}` : "바람 없음", Math.min(z.x1 - U * 0.08, T.x + T.R * 1.5), T.y - T.R * 0.85, Math.min(U * 0.032, z.w / 18), "#fff", "#1d5f8f", 3);
        // 활과 시위 (손 사이)
        const b = bowState();
        if (b && phase !== "fly") {
          const L = b.sw * 1.1, dir = Math.sign(b.bow.x - b.pull.x) || 1;
          ctx.strokeStyle = "#8b4a16"; ctx.lineWidth = U * 0.012; ctx.lineCap = "round";
          ctx.beginPath(); ctx.arc(b.bow.x - dir * L * 0.4, b.bow.y, L * 0.75, -0.95, 0.95, false);
          if (dir < 0) { ctx.beginPath(); ctx.arc(b.bow.x - dir * L * 0.4, b.bow.y, L * 0.75, Math.PI - 0.95, Math.PI + 0.95, false); }
          ctx.stroke();
          const tip = (s) => ({ x: b.bow.x - dir * L * 0.4 + Math.cos(dir > 0 ? s : Math.PI - s) * L * 0.75, y: b.bow.y + Math.sin(dir > 0 ? s : Math.PI - s) * L * 0.75 });
          const a1 = tip(-0.95), a2 = tip(0.95), sp = phase === "aim" ? b.pull : { x: (a1.x + a2.x) / 2, y: b.bow.y };
          ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(sp.x, sp.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
          if (phase === "aim") { ctx.strokeStyle = "#5a3a10"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.pull.x, b.pull.y); ctx.lineTo(b.bow.x + dir * L * 0.1, b.bow.y); ctx.stroke(); }
        }
        // 조준점
        if (phase === "aim") {
          ctx.strokeStyle = "#ff2d55"; ctx.lineWidth = Math.max(2, U * 0.005);
          ctx.beginPath(); ctx.arc(aim.x, aim.y, U * 0.025, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(aim.x - U * 0.04, aim.y); ctx.lineTo(aim.x + U * 0.04, aim.y); ctx.moveTo(aim.x, aim.y - U * 0.04); ctx.lineTo(aim.x, aim.y + U * 0.04); ctx.stroke();
        }
        // 날아가는 화살
        if (arrow) {
          const k = Math.min(1, arrow.t / 0.4), x = arrow.from.x + (arrow.to.x - arrow.from.x) * k, y = arrow.from.y + (arrow.to.y - arrow.from.y) * k - Math.sin(k * Math.PI) * v.H * 0.05;
          const s = U * 0.05 * (1 - 0.6 * k), ang = Math.atan2(arrow.to.y - arrow.from.y, arrow.to.x - arrow.from.x);
          ctx.strokeStyle = "#5a3a10"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * s, y - Math.sin(ang) * s); ctx.stroke();
        }
        const hint = phase === "idle" ? "한 팔은 옆으로 쭉, 다른 손은 가슴으로 당겨요" : phase === "aim" ? "조준점을 가운데로! 당긴 손을 휙 놓으면 발사" : "";
        if (hint) outlinedText(ctx, hint, z.cx, v.H * 0.9, Math.min(U * 0.04, z.w / 17), "#fff", "#2d6a1e");
      },
      result: () => `${shots}발 · 합계 ${total}점 · 10점 ${tens}번`,
      // 설명 시연용
      get phase() { return phase; },
      get aimErr() { const T = tgt(); return { dx: aim.x - T.x, dy: aim.y - T.y, R: T.R }; },
      get aimT() { return aimT; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      const u = p.u, sy = p.shoulderY;
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1;
      if (T < 4) say("양궁! 한 팔은 옆으로 쭉, 다른 손은 가슴으로 당겨요");
      else if (T < 9) say("팔을 올리고 내려서 조준점을 가운데로");
      else if (T < 14) say("당긴 손을 휙 놓으면 발사! 바람도 봐요");
      else say("이제 직접 해 봐요!");
      if (g.phase === "fly") { S.rel = false; return; }
      if (g.phase === "idle" && !S.rel) { S.by = sy; p.tcx = p.v.W / 2; }
      const bx = p.cx - 2.3 * u;
      if (S.rel) { p.reach(1, p.cx + 1.7 * u, sy + 0.3 * u, 5); if (g.phase === "idle") { S.rt = (S.rt || 0) + 1 / 60; if (S.rt > 0.6) { S.rel = false; S.rt = 0; } } return; }
      if (g.phase === "aim") {   // 조준점이 가운데로 가도록 활 팔 높이와 몸 위치를 조금씩 고침
        const e = g.aimErr;
        S.by = Math.max(sy - 1.2 * u, Math.min(sy + 1 * u, S.by - e.dy / 1.6 * 0.05));
        p.tcx = p.cx - e.dx / 1.5 * 0.08; p.walk = 0.4;
        if ((g.aimT > 1.2 && Math.hypot(e.dx, e.dy) < e.R * 0.15) || g.aimT > 3.5) S.rel = true;
      }
      p.reach(0, bx, S.by, 1.2);
      p.reach(1, p.cx - 0.15 * u, sy + 0.15 * u, 1.5);
    },
  },
};
