// 스케이트보드: 내리막길을 달리며 동전 모으기
// 방향 = 몸을 왼쪽·오른쪽으로 기울이기(또는 몸을 옆으로 옮기기), 속도 = 제자리에서 무릎 들기(발 구르기)
// 점프 = 두 손을 머리 위로 번쩍(또는 제자리 점프). 고깔·울타리는 피하거나 점프, 점프대에서 점프하면 트릭 보너스
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=28";
import { sfx } from "../../audio.js?v=28";
import { makeStepCounter } from "../run.js?v=28";

const S0 = 1 / 0.25, s = z => 1 / (0.25 + z * 3.5);   // 원근 배율 (z: 0 가까움 ~ 1 멂)
const AIR = 0.8;                                       // 점프 시간(초)

export default {
  id: "skate", title: "스케이트보드", icon: "🛹", sec: 50, cursor: "", cat: "sport", bg: "#cfd9df", desc: "몸 기울여 내리막 달리기",
  how: "몸을 왼쪽·오른쪽으로 기울여 방향을 바꾸고, 제자리에서 무릎을 들면 빨라져요. 두 손을 머리 위로 번쩍 들면 점프! 동전을 모으고 장애물은 피하거나 넘어요",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff, steps = makeStepCounter();
    let L = 0, speed = 18, t = 0, dist = 0, objs = [], spawnT = 0.8, air = 0, safe = 0, steer = 0, armsUp = false, hipBase = null;
    let coins = 0, tricks = 0, crashes = 0, onRamp = false;
    const R = () => ({ top: v.H * 0.1, bot: v.H * 0.64 });
    const hz = () => { const r = R(); return r.top + (r.bot - r.top) * 0.28; };
    function proj(o) {
      const r = R(), k = s(o.z) / S0, h = hz();
      return { x: z.cx + (o.x - L) * z.w * 0.42 * k, y: h + (r.bot - h) * k, k };
    }
    function spawn() {
      const p = env.progress(), r = Math.random(), x = (Math.random() - 0.5) * 1.6;
      if (r < 0.45) for (let i = 0; i < 3; i++) objs.push({ kind: "coin", x, z: 1 + i * 0.08 });
      else if (r < 0.7) objs.push({ kind: "cone", x, z: 1 });
      else if (r < 0.85) objs.push({ kind: "ramp", x, z: 1 }), objs.push({ kind: "coin", x, z: 1.12, high: true });
      else objs.push({ kind: "bar", x: 0, z: 1 });                                     // 길 전체 울타리: 점프로만
      spawnT = (1.0 - 0.3 * p) / D.speed;
    }
    function jump() { if (air <= 0) { air = AIR; onRamp = false; sfx.whoosh(); } }
    return {
      update(dt) {
        t += dt; safe -= dt;
        const p = env.tracker.pts, sc = env.tracker.scale || v.U * 0.13;
        // 기울이기: 어깨 가운데가 엉덩이 가운데보다 옆으로 + 몸 위치
        if (p && p[11].v && p[12].v) {
          const sx = (p[11].x + p[12].x) / 2, lean = p[23].v && p[24].v ? (sx - (p[23].x + p[24].x) / 2) / sc : 0, shift = (sx - z.cx) / (z.w * 0.3);
          let want = clamp(lean * 1.8 + shift * 0.6, -1, 1); if (Math.abs(want) < 0.12) want = 0;
          steer += (want - steer) * Math.min(1, dt * 8);
          // 점프: 두 손을 머리 위로 번쩍 (들어가는 순간), 또는 엉덩이가 확 올라감
          const up = p[15].v && p[16].v && p[0].v && p[15].y < p[0].y - sc * 0.2 && p[16].y < p[0].y - sc * 0.2;
          if (up && !armsUp) jump(); armsUp = up;
          if (p[23].v && p[24].v) { const hy = (p[23].y + p[24].y) / 2; hipBase = hipBase == null ? hy : Math.max(hy, hipBase - dt * sc * 0.1); if (hipBase - hy > sc * 0.35) jump(); }
        }
        L = clamp(L + steer * 1.5 * dt, -1, 1);
        // 발 구르기(무릎 들기)마다 빨라짐, 가만히 있으면 천천히 느려짐
        const n = steps.update(p, t, dt);
        if (n) { speed = Math.min(48, speed + 3.5 * n); sfx.step(n % 2); }
        speed = Math.max(10, speed - dt * 1.6);
        air = Math.max(0, air - dt);
        const zr = speed / 30 * 0.32 * D.speed;
        dist += zr * dt;
        spawnT -= dt; if (spawnT <= 0) spawn();
        for (const o of objs) {
          o.z -= zr * dt;
          if (o.done || o.z > 0.05) continue;
          o.done = true;
          const near = o.kind === "bar" || Math.abs(o.x - L) < 0.26 * D.reach, q = proj(o);
          if (!near) continue;
          if (o.kind === "coin") {
            if (o.high && air <= 0) { o.done = false; o.z = -1; continue; }   // 점프대 위 동전은 점프해야
            coins++; sfx.catch(env.player.combo); env.award(1, q.x, q.y - v.U * 0.06);
          } else if (o.kind === "ramp") {
            if (air <= 0) air = AIR * 1.1;                                    // 점프대를 타면 저절로 붕~ (한 바퀴 돌기)
            onRamp = true;
            tricks++; env.award(2, q.x, q.y - v.U * 0.08); sfx.fanfare();
            popup(q.x, q.y - v.U * 0.14, "트릭!", { size: v.U * 0.05, color: "#fff", stroke: "#e0306a" });
          } else if (air > 0) { env.award(1, q.x, q.y - v.U * 0.06); popup(q.x, q.y - v.U * 0.12, "점프!", { size: v.U * 0.04, color: "#fff", stroke: "#1d8f47" }); }
          else if (safe <= 0) {
            crashes++; safe = 1; speed = 10; sfx.thud(); shake(v.U * 0.02, 0.3); env.miss(q.x, q.y - v.U * 0.06, "쿵!");
            burst(q.x, q.y, { n: 14, colors: ["#ff8a3d", "#ffffff"], speed: v.U * 0.5, gravity: v.U, size: v.U * 0.014 });
          }
        }
        objs = objs.filter(o => o.z > -0.05);
      },
      draw(ctx) {
        const r = R(), U = v.U, h = hz();
        ctx.save(); rr(ctx, z.x0 + 4, r.top, z.w - 8, r.bot - r.top, U * 0.03); ctx.clip();
        ctx.globalAlpha = 0.86;   // 카메라 속 내 모습이 살짝 비치게
        let g = ctx.createLinearGradient(0, r.top, 0, h); g.addColorStop(0, "#7ec8ff"); g.addColorStop(1, "#e3f6ff");
        ctx.fillStyle = g; ctx.fillRect(z.x0, r.top, z.w, h - r.top);
        ctx.fillStyle = "#7fcf6a"; ctx.fillRect(z.x0, h, z.w, r.bot - h); ctx.globalAlpha = 1;
        // 길 (가까울수록 넓게)
        const edge = (side, k) => z.cx + (side - L) * z.w * 0.42 * k;
        ctx.fillStyle = "#8d8d96"; ctx.beginPath(); ctx.moveTo(edge(-1.25, s(1) / S0), h); ctx.lineTo(edge(1.25, s(1) / S0), h); ctx.lineTo(edge(1.25, 1), r.bot); ctx.lineTo(edge(-1.25, 1), r.bot); ctx.closePath(); ctx.fill();
        // 가운데 줄과 길가 나무 (흘러옴)
        for (let i = 0; i < 10; i++) {
          const zz = ((i / 10 - dist * 1.2) % 1 + 1) % 1, k = s(zz) / S0, y = h + (r.bot - h) * k;
          ctx.fillStyle = "#f5f5f5"; ctx.fillRect(edge(0, k) - 3 * k * 4, y, 6 * k * 4, (r.bot - h) * 0.03 * k * 4);
          if (i % 2 === 0) for (const side of [-1.8, 1.8]) { const tx = edge(side, k), ts = U * 0.05 * k * 4; ctx.fillStyle = "#2f8f4e"; ctx.beginPath(); ctx.moveTo(tx, y - ts * 1.6); ctx.lineTo(tx - ts * 0.6, y); ctx.lineTo(tx + ts * 0.6, y); ctx.closePath(); ctx.fill(); }
        }
        // 물체
        for (const o of [...objs].sort((a, b) => b.z - a.z)) {
          if (o.done || o.z > 1.05 || o.z < 0) continue;
          const q = proj(o), sz = U * 0.06 * q.k * 4;
          if (o.kind === "coin") {
            const y = q.y - sz * (o.high ? 2.2 : 0.8), w = Math.abs(Math.cos(t * 6 + o.x * 9));
            ctx.fillStyle = "#ffd400"; ctx.beginPath(); ctx.ellipse(q.x, y, sz * 0.45 * Math.max(0.2, w), sz * 0.45, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#b37b00"; ctx.lineWidth = 2; ctx.stroke();
          } else if (o.kind === "cone") {
            ctx.fillStyle = "#ff7a1a"; ctx.beginPath(); ctx.moveTo(q.x, q.y - sz * 1.3); ctx.lineTo(q.x - sz * 0.45, q.y); ctx.lineTo(q.x + sz * 0.45, q.y); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#fff"; ctx.fillRect(q.x - sz * 0.25, q.y - sz * 0.75, sz * 0.5, sz * 0.15);
          } else if (o.kind === "ramp") {
            ctx.fillStyle = "#c8873a"; ctx.beginPath(); ctx.moveTo(q.x - sz * 0.9, q.y); ctx.lineTo(q.x + sz * 0.9, q.y); ctx.lineTo(q.x + sz * 0.9, q.y - sz * 0.6); ctx.lineTo(q.x - sz * 0.9, q.y - sz * 0.6); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#e9b26b"; ctx.fillRect(q.x - sz * 0.9, q.y - sz * 0.6, sz * 1.8, sz * 0.12);
          } else {
            const x0 = edge(-1.1, q.k), x1 = edge(1.1, q.k);
            ctx.fillStyle = "#e23b3b"; ctx.fillRect(x0, q.y - sz * 0.9, x1 - x0, sz * 0.25);
            ctx.fillStyle = "#fff"; for (let i = 0; i < 6; i++) ctx.fillRect(x0 + (x1 - x0) * (i / 6 + 0.04), q.y - sz * 0.9, (x1 - x0) * 0.06, sz * 0.25);
            ctx.fillStyle = "#555"; ctx.fillRect(x0, q.y - sz * 0.9, sz * 0.12, sz * 0.9); ctx.fillRect(x1 - sz * 0.12, q.y - sz * 0.9, sz * 0.12, sz * 0.9);
          }
        }
        // 나 (보드 + 사람). 점프하면 붕 뜸
        const W = Math.min(z.w * 0.2, U * 0.18), jy = air > 0 ? Math.sin((1 - air / AIR) * Math.PI) * (r.bot - r.top) * 0.18 : 0, by = r.bot - (r.bot - r.top) * 0.08 - jy;
        ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(z.cx, r.bot - (r.bot - r.top) * 0.06, W * 0.5 * (1 - jy / ((r.bot - r.top) * 0.4)), W * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(z.cx, by); ctx.rotate(steer * 0.25 + (air > 0 ? (1 - air / AIR) * Math.PI * 2 * (onRamp ? 1 : 0) : 0));
        ctx.fillStyle = "#3b5bdb"; rr(ctx, -W * 0.5, -W * 0.06, W, W * 0.1, W * 0.05); ctx.fill();
        ctx.fillStyle = "#222"; for (const wx of [-0.32, 0.32]) { ctx.beginPath(); ctx.arc(wx * W, W * 0.06, W * 0.05, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = env.color; ctx.lineWidth = W * 0.09; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-W * 0.18, -W * 0.08); ctx.lineTo(steer * W * 0.12, -W * 0.5); ctx.lineTo(W * 0.18, -W * 0.08); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(steer * W * 0.12, -W * 0.5); ctx.lineTo(steer * W * 0.2, -W * 0.85); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(steer * W * 0.18, -W * 0.75); ctx.lineTo(-W * 0.35, -W * (air > 0 ? 1.0 : 0.6)); ctx.moveTo(steer * W * 0.18, -W * 0.75); ctx.lineTo(W * 0.35, -W * (air > 0 ? 1.0 : 0.6)); ctx.stroke();
        ctx.fillStyle = "#ffcf9e"; ctx.beginPath(); ctx.arc(steer * W * 0.22, -W * 0.98, W * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (safe > 0 && Math.floor(t * 10) % 2) { ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(z.x0, r.top, z.w, r.bot - r.top); }
        ctx.restore();
        ctx.lineWidth = 3; ctx.strokeStyle = env.color; rr(ctx, z.x0 + 4, r.top, z.w - 8, r.bot - r.top, U * 0.03); ctx.stroke();
        outlinedText(ctx, `${Math.round(speed)} km/h · 동전 ${coins}`, z.cx, r.bot + U * 0.04, Math.min(U * 0.036, z.w / 14), "#fff", "#555", 3);
        if (speed < 13 && t > 2) outlinedText(ctx, "무릎을 들어 발을 굴러요!", z.cx, r.bot + U * 0.085, Math.min(U * 0.03, z.w / 16), "#fff", "#b04a00", 3);
      },
      result: () => `동전 ${coins} · 트릭 ${tricks} · 쿵 ${crashes}`,
      // 설명 시연용
      get L() { return L; }, get speed() { return speed; }, get air() { return air; },
      get objs() { return objs.filter(o => !o.done && o.z > 0); },
    };
  },
  demo: {
    dur: 17,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4) say("스케이트보드! 몸을 기울이면 그쪽으로 가요");
      else if (T < 9) say("제자리에서 무릎을 들면 빨라져요");
      else if (T < 15) say("두 손을 머리 위로 번쩍! 점프해서 장애물을 넘어요");
      else say("이제 직접 해 봐요!");
      const os = g.objs.sort((a, b) => a.z - b.z);
      // 가까운 장애물이 길 안에 있으면 점프, 아니면 동전 쪽으로 기울이기
      const danger = os.find(o => (o.kind === "bar" || (o.kind === "cone" && Math.abs(o.x - g.L) < 0.35)) && o.z < 0.2);
      const coin = os.find(o => o.kind === "coin" && !o.high) || os.find(o => o.kind === "ramp");
      const want = coin ? clamp((coin.x - g.L) * 3, -1, 1) : -g.L;
      p.leanT = Math.abs(want) < 0.15 ? 0 : want * 0.9;
      if (danger && g.air <= 0 && (!S.jt || T - S.jt > 0.9)) { S.jt = T; S.up = T; }
      const arms = S.up && T - S.up < 0.35;
      p.rest(0, arms ? "up" : "down", arms ? 6 : 2); p.rest(1, arms ? "up" : "down", arms ? 6 : 2);
      // 발 구르기: 속도가 느리면 무릎을 번갈아
      if (g.speed < 30 && !arms) { const ph = Math.floor(T / 0.33); if (ph !== S.ph) { S.ph = ph; p.legs = ph % 2 ? ["stand", "raise"] : ["raise", "stand"]; } }
      else p.legs = ["stand", "stand"];
    },
  },
};
