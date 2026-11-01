// 수상오토바이: 두 손을 앞으로 내밀어 손잡이를 잡은 것처럼
// 방향 = 손잡이 돌리기(오른쪽으로 가려면 오른손을 내리고 왼손을 올림), 속도 = 두 손을 가슴 높이로 들고 있으면 출발, 내리면 멈춤
// 빨강·노랑 부표 사이로 통과하면 점수, 별도 모으고 바위는 피하기
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=29";
import { sfx } from "../../audio.js?v=29";

const S0 = 1 / 0.25, s = z => 1 / (0.25 + z * 3.5);   // 원근 배율 (z: 0 가까움 ~ 1 멂)
const TOP = 60;                                        // 최고 속도(km/h, 보통)

export default {
  id: "jetski", title: "수상오토바이", icon: "🚤", sec: 50, cursor: "", cat: "sport", bg: "#66a6ff", desc: "손잡이 돌려 부표 통과",
  how: "두 손을 가슴 앞으로 들어 손잡이를 잡아요(들고 있으면 출발). 오른쪽으로 가려면 오른손을 내리고 왼손을 올려요. 부표 사이로 통과하고, 바위는 피해요!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    let X = 0, speed = 0, steer = 0, t = 0, dist = 0, objs = [], spawnT = 0.5, gateX = 0, safe = 0, holding = false, sprayT = 0;
    let gates = 0, missedG = 0, stars = 0, bumps = 0;
    const R = () => ({ top: v.H * 0.1, bot: v.H * 0.64 });
    const hz = () => { const r = R(); return r.top + (r.bot - r.top) * 0.28; };
    function proj(o, x = o.x) {
      const r = R(), k = s(o.z) / S0, h = hz();
      return { x: z.cx + (x - X) * z.w * 0.42 * k, y: h + (r.bot - h) * k, k };
    }
    function spawn() {
      const p = env.progress(), r = Math.random();
      gateX = clamp(gateX + (Math.random() - 0.5) * 1.1, -1, 1);
      const w = (0.34 - 0.08 * p) * D.reach;
      objs.push({ kind: "gate", x: gateX, w, z: 1 });
      if (r < 0.45) objs.push({ kind: "star", x: clamp(gateX + (Math.random() - 0.5) * 0.4, -1.1, 1.1), z: 1.18 });
      else if (r < 0.75) objs.push({ kind: "rock", x: clamp(gateX + (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.3), -1.3, 1.3), z: 1.12 });
      spawnT = (1.6 - 0.4 * p) / D.speed;
    }
    return {
      update(dt) {
        t += dt; safe -= dt; sprayT -= dt;
        const p = env.tracker.pts, hs = env.tracker.hands, sc = env.tracker.scale || v.U * 0.13;
        // 손잡이: 두 손이 보이고 엉덩이보다 위(가슴 앞)에 있으면 잡은 것
        const hipY = p && p[23].v && p[24].v ? (p[23].y + p[24].y) / 2 : (p && p[11].v ? p[11].y + sc * 1.7 : v.H);
        holding = hs[0].vis && hs[1].vis && hs[0].y < hipY - sc * 0.15 && hs[1].y < hipY - sc * 0.15;
        if (holding) steer += (clamp((hs[1].y - hs[0].y) / sc / 0.7, -1, 1) - steer) * Math.min(1, dt * 7);
        else steer *= 0.9;
        const top = TOP * D.speed;
        speed = holding ? Math.min(top, speed + dt * 30) : Math.max(0, speed - dt * 25);
        X = clamp(X + steer * 1.3 * dt * (0.3 + speed / top), -1.4, 1.4);
        const zr = speed / 60 * 0.42;
        dist += zr * dt;
        if (speed > 5) { spawnT -= dt; if (spawnT <= 0) spawn(); }
        for (const o of objs) {
          o.z -= zr * dt;
          if (o.done || o.z > 0.04) continue;
          o.done = true;
          const q = proj(o), dx = Math.abs(o.x - X);
          if (o.kind === "gate") {
            if (dx < o.w) { gates++; sfx.catch(env.player.combo); env.award(1, q.x, q.y - v.U * 0.07); popup(q.x, q.y - v.U * 0.13, "통과!", { size: v.U * 0.04, color: "#fff", stroke: "#1d8f47" }); }
            else { missedG++; env.miss(z.cx, q.y - v.U * 0.07, "놓쳤어요"); }
          } else if (o.kind === "star" && dx < 0.22 * D.reach) {
            stars++; sfx.pop(); env.award(2, q.x, q.y - v.U * 0.07);
            burst(q.x, q.y - v.U * 0.04, { n: 16, colors: ["#ffd400", "#ffffff"], shape: "star", speed: v.U * 0.5, gravity: v.U * 0.4, size: v.U * 0.016 });
          } else if (o.kind === "rock" && dx < 0.22 && safe <= 0) {
            bumps++; safe = 1; speed *= 0.3; sfx.thud(); shake(v.U * 0.02, 0.3); env.miss(q.x, q.y - v.U * 0.07, "바위에 쿵!");
          }
        }
        objs = objs.filter(o => o.z > -0.05);
        if (speed > 20 && sprayT <= 0) { sprayT = 0.12; const r = R(); burst(z.cx + (Math.random() - 0.5) * v.U * 0.08, r.bot - (r.bot - r.top) * 0.05, { n: 3, colors: ["#e0f7ff", "#ffffff"], speed: v.U * 0.25, gravity: v.U * 0.6, size: v.U * 0.01, life: 0.5 }); }
      },
      draw(ctx) {
        const r = R(), U = v.U, h = hz();
        ctx.save(); rr(ctx, z.x0 + 4, r.top, z.w - 8, r.bot - r.top, U * 0.03); ctx.clip();
        ctx.globalAlpha = 0.86;   // 카메라 속 내 모습이 살짝 비치게
        let g = ctx.createLinearGradient(0, r.top, 0, h); g.addColorStop(0, "#6fc3ff"); g.addColorStop(1, "#e3f6ff");
        ctx.fillStyle = g; ctx.fillRect(z.x0, r.top, z.w, h - r.top);
        g = ctx.createLinearGradient(0, h, 0, r.bot); g.addColorStop(0, "#3aa4d8"); g.addColorStop(1, "#0b5f9e");
        ctx.fillStyle = g; ctx.fillRect(z.x0, h, z.w, r.bot - h); ctx.globalAlpha = 1;
        // 먼 해안
        ctx.fillStyle = "#6cbf6a"; ctx.beginPath(); ctx.ellipse(z.cx - X * z.w * 0.08 - z.w * 0.25, h, z.w * 0.3, (r.bot - r.top) * 0.03, 0, Math.PI, 0); ctx.fill();
        // 물결 (흘러옴)
        ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          const zz = ((i / 14 - dist * 1.1) % 1 + 1) % 1, k = s(zz) / S0, y = h + (r.bot - h) * k, wx = z.cx + (((i * 0.37) % 2) - 1 - X) * z.w * 0.42 * k;
          ctx.beginPath(); ctx.arc(wx, y, U * 0.02 * k * 4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        }
        // 물체 (먼 것부터)
        for (const o of [...objs].sort((a, b) => b.z - a.z)) {
          if (o.done || o.z > 1.05 || o.z < 0) continue;
          const sz = U * 0.055 * (s(o.z) / S0) * 4;
          if (o.kind === "gate") {
            const a = proj(o, o.x - o.w), b = proj(o, o.x + o.w);
            ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.setLineDash([sz * 0.3, sz * 0.25]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y - sz * 0.3); ctx.lineTo(b.x, b.y - sz * 0.3); ctx.stroke(); ctx.setLineDash([]);
            [[a, "#e23b3b"], [b, "#ffd400"]].forEach(([q, c]) => {
              ctx.fillStyle = "#333"; ctx.fillRect(q.x - sz * 0.04, q.y - sz * 1.3, sz * 0.08, sz * 0.9);
              ctx.fillStyle = c; ctx.beginPath(); ctx.arc(q.x, q.y - sz * 0.35, sz * 0.38, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.arc(q.x - sz * 0.12, q.y - sz * 0.48, sz * 0.1, 0, Math.PI * 2); ctx.fill();
            });
          } else if (o.kind === "star") {
            const q = proj(o); outlinedText(ctx, "⭐", q.x, q.y - sz * 0.6 - Math.sin(t * 4) * sz * 0.1, sz * 1.0, "#fff", "#b37b00", 2);
          } else {
            const q = proj(o); ctx.fillStyle = "#6b6b74"; ctx.beginPath(); ctx.moveTo(q.x - sz * 0.8, q.y); ctx.lineTo(q.x - sz * 0.3, q.y - sz * 0.9); ctx.lineTo(q.x + sz * 0.4, q.y - sz * 0.7); ctx.lineTo(q.x + sz * 0.8, q.y); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.moveTo(q.x - sz, q.y); ctx.lineTo(q.x + sz, q.y); ctx.stroke();
          }
        }
        // 내 수상오토바이
        const W = Math.min(z.w * 0.24, U * 0.22), by = r.bot - (r.bot - r.top) * 0.1 + Math.sin(t * 7) * W * 0.02;
        ctx.save(); ctx.translate(z.cx, by); ctx.rotate(steer * 0.3);
        ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.ellipse(0, W * 0.2, W * 0.4 * (0.4 + speed / (TOP * D.speed)), W * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = env.color; ctx.beginPath(); ctx.moveTo(-W * 0.22, W * 0.15); ctx.lineTo(W * 0.22, W * 0.15); ctx.lineTo(W * 0.16, -W * 0.22); ctx.lineTo(0, -W * 0.34); ctx.lineTo(-W * 0.16, -W * 0.22); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#222"; rr(ctx, -W * 0.1, -W * 0.08, W * 0.2, W * 0.18, W * 0.04); ctx.fill();
        ctx.strokeStyle = "#333"; ctx.lineWidth = W * 0.04; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-W * 0.18, -W * 0.2 + steer * W * 0.05); ctx.lineTo(W * 0.18, -W * 0.2 - steer * W * 0.05); ctx.stroke();
        ctx.fillStyle = "#ffcf9e"; ctx.beginPath(); ctx.arc(0, -W * 0.3, W * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (safe > 0 && Math.floor(t * 10) % 2) { ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(z.x0, r.top, z.w, r.bot - r.top); }
        ctx.restore();
        ctx.lineWidth = 3; ctx.strokeStyle = env.color; rr(ctx, z.x0 + 4, r.top, z.w - 8, r.bot - r.top, U * 0.03); ctx.stroke();
        outlinedText(ctx, `${Math.round(speed)} km/h · 통과 ${gates}`, z.cx, r.bot + U * 0.04, Math.min(U * 0.036, z.w / 14), "#fff", "#0b5f9e", 3);
        if (!holding) outlinedText(ctx, "두 손을 가슴 앞으로 들어 손잡이를 잡아요!", z.cx, r.bot + U * 0.085, Math.min(U * 0.03, z.w / 18), "#fff", "#b04a00", 3);
      },
      result: () => `부표 통과 ${gates} · 놓침 ${missedG} · 별 ${stars} · 바위 ${bumps}`,
      // 설명 시연용
      get X() { return X; }, get speed() { return speed; },
      get objs() { return objs.filter(o => !o.done && o.z > 0); },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1; p.tcx = p.v.W / 2;
      if (T < 4) say("수상오토바이! 두 손을 가슴 앞으로 들면 출발해요");
      else if (T < 10) say("오른쪽은 오른손을 내리고, 왼쪽은 왼손을 내려요");
      else if (T < 14) say("빨강·노랑 부표 사이로 통과하면 점수! 바위는 피해요");
      else say("이제 직접 해 봐요!");
      const u = p.u, cx = p.cx, y = p.shoulderY + 1.0 * u;
      const os = g.objs.sort((a, b) => a.z - b.z), gate = os.find(o => o.kind === "gate");
      let target = gate ? gate.x : 0;
      const star = os.find(o => o.kind === "star" && (!gate || o.z < gate.z + 0.25));
      if (star && star.z < 0.5) target = star.x;
      const wheel = T < 1 ? 0 : clamp((target - g.X) * 3, -1, 1);
      p.reach(0, cx - 0.85 * u, y - wheel * 0.45 * u, 1.5);   // 오른쪽으로 갈 땐 왼손을 올리고
      p.reach(1, cx + 0.85 * u, y + wheel * 0.45 * u, 1.5);   // 오른손을 내림
    },
  },
};
