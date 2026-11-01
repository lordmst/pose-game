// 벽 통과: 사람 모양 구멍이 뚫린 벽이 다가옴. 벽이 닿을 때 구멍 모양대로 자세를 잡고 있으면 통과
import { burst, popup, shake, outlinedText } from "../fx.js?v=17";
import { sfx } from "../audio.js?v=17";
import { POSES, figData, poseMatches } from "./copy.js?v=17";

const TRAVEL = 4.2;    // 벽이 멀리서 닿기까지 걸리는 시간(초, 보통)
const GAP = 0.9;       // 벽 사이 쉬는 시간

export default {
  id: "wall", title: "벽 통과", icon: "🧱", sec: 50, cursor: "", cat: "move", bg: "#f6c76b", desc: "구멍 모양으로 통과",
  how: "다가오는 벽의 구멍 모양대로 자세를 잡아요. 벽이 닿을 때 모양이 맞으면 통과!",
  create(env) {
    const z = env.zone, v = env.view;
    const off = document.createElement("canvas"), oc = off.getContext("2d");
    let wall = null, gapT = 0.6, passed = 0, crashed = 0, count = 0, lastId = null, matched = false, paintedKey = "";
    function nextWall() {
      const pool = POSES.filter(p => (!p.lower || env.tracker.lowerSeen) && p.id !== lastId);
      const pose = pool[Math.floor(Math.random() * pool.length)]; lastId = pose.id;
      wall = { pose, t: 0, T: TRAVEL * env.diff.poseTime * (1 - 0.25 * env.progress()), matchT: 0, result: null, rt: 0 };
      count++; sfx.whoosh();
    }
    // 벽(구멍 뚫린)을 별도 캔버스에 그림: 벽돌 → 사람 모양을 지움
    function paintWall(w, h, pose, glow) {
      if (off.width !== Math.round(w) || off.height !== Math.round(h)) { off.width = Math.round(w); off.height = Math.round(h); }
      oc.clearRect(0, 0, w, h);
      oc.fillStyle = "#c0603a"; oc.fillRect(0, 0, w, h);
      const bh = h / 12, bw = bh * 2.2;
      oc.strokeStyle = "rgba(255,230,210,.55)"; oc.lineWidth = Math.max(1, bh * 0.08);
      for (let r = 0; r <= 12; r++) {
        oc.beginPath(); oc.moveTo(0, r * bh); oc.lineTo(w, r * bh); oc.stroke();
        for (let x = (r % 2) * bw / 2; x < w; x += bw) { oc.beginPath(); oc.moveTo(x, r * bh); oc.lineTo(x, (r + 1) * bh); oc.stroke(); }
      }
      // 사람 모양 구멍 (그림 좌표 200×220 → 벽 크기에 맞춤)
      const f = figData(pose.f), k = Math.min(w / 200, h / 220) * 0.92, ox = w / 2 - 100 * k, oy = h - 220 * k - h * 0.02;
      const P = ([x, y]) => [ox + x * k, oy + y * k];
      const shape = (ctx2) => {
        ctx2.lineCap = "round"; ctx2.lineJoin = "round"; ctx2.lineWidth = 34 * k;
        for (const line of f.lines) { ctx2.beginPath(); line.forEach((p, i) => { const [x, y] = P(p); i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y); }); ctx2.stroke(); }
        const [hx, hy] = P(f.head); ctx2.beginPath(); ctx2.arc(hx, hy, 30 * k, 0, Math.PI * 2); ctx2.fill();
      };
      if (glow) { oc.save(); oc.strokeStyle = oc.fillStyle = glow; oc.globalAlpha = 0.9; oc.lineWidth = 46 * k; shape(oc); oc.restore(); }
      oc.save(); oc.globalCompositeOperation = "destination-out"; oc.strokeStyle = oc.fillStyle = "#000"; shape(oc); oc.restore();
    }
    return {
      update(dt) {
        matched = false;
        if (!wall) { gapT -= dt; if (gapT <= 0) nextWall(); return; }
        wall.t += dt;
        const k = wall.t / wall.T;
        if (!wall.result) {
          matched = poseMatches(wall.pose, env.tracker.pts);
          if (k > 0.65 && matched) wall.matchT += dt;            // 벽이 가까워진 뒤 맞춘 시간
          if (k >= 1) {
            const need = 0.3 * env.diff.hold;
            if (wall.matchT >= need || matched) {
              wall.result = "pass"; passed++; sfx.catch(env.player.combo); env.award(1, z.cx, v.H * 0.3);
              popup(z.cx, v.H * 0.4, "통과!", { size: v.U * 0.08, color: "#fff", stroke: "#2fb65a" });
              burst(z.cx, v.H * 0.55, { n: 24, colors: ["#ffd400", "#9dff7a", "#7ae0ff"], shape: "confetti", speed: v.U * 0.9, gravity: v.U, size: v.U * 0.016 });
            } else {
              wall.result = "crash"; crashed++; sfx.thud(); shake(v.U * 0.03, 0.4); env.miss(z.cx, v.H * 0.35, "쿵!");
              burst(z.cx, v.H * 0.6, { n: 26, colors: ["#c0603a", "#8a3f22", "#e8a07a"], shape: "shard", speed: v.U * 0.8, gravity: v.U * 1.8, size: v.U * 0.025, life: 0.8 });
            }
          }
        } else {
          wall.rt += dt;
          if (wall.rt > 0.7) { wall = null; gapT = GAP; }
        }
      },
      draw(ctx) {
        if (!wall) return;
        const k = Math.min(1, wall.t / wall.T), e = k * k;               // 가까워질수록 빨리 커짐
        let s = 0.18 + 0.82 * e, alpha = 0.35 + 0.6 * k;
        if (wall.result === "pass") { s = 1 + wall.rt * 0.9; alpha = Math.max(0, 0.95 - wall.rt * 1.4); }
        if (wall.result === "crash") { alpha = Math.max(0, 0.95 - wall.rt * 1.2); }
        const W = z.w * 0.96, H = v.H * 0.86, w = W * s, h = H * s;
        const cx = z.cx, by = v.H * 0.98 - (1 - e) * v.H * 0.33;          // 멀리 있을 땐 화면 가운데쯤, 가까워지면 바닥
        const key = `${wall.pose.id}|${matched}|${Math.round(W)}x${Math.round(H)}`;
        if (key !== paintedKey) { paintWall(W, H, wall.pose, matched ? "#2fd36b" : null); paintedKey = key; }   // 실제 크기로 한 번 그려 두고 확대·축소만
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.drawImage(off, cx - w / 2, by - h, w, h);
        ctx.restore();
        if (!wall.result) {
          outlinedText(ctx, wall.pose.name, cx, Math.max(v.U * 0.2, by - h - v.U * 0.04), v.U * 0.05, "#fff", "#8a3f22");
          // 남은 시간 막대
          const bw = z.w * 0.5, bx = cx - bw / 2, y = v.H * 0.16;
          ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(bx, y, bw, v.U * 0.014);
          ctx.fillStyle = k > 0.65 ? "#ff5a5a" : "#ffd400"; ctx.fillRect(bx, y, bw * (1 - k), v.U * 0.014);
        }
      },
      result: () => `통과 ${passed} · 부딪힘 ${crashed}`,
      // 설명 시연용
      get current() { return wall && !wall.result ? wall.pose.id : null; },
      get progressK() { return wall ? wall.t / wall.T : 0; },
      get index() { return count; },
    };
  },
};
