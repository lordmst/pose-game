// 벽 통과: 사람 모양 구멍이 뚫린 벽이 다가옴. 벽이 닿을 때 구멍 자리로 가서 구멍 모양대로 자세를 잡고 있으면 통과
// 구멍은 왼쪽·오른쪽으로 옮겨 다니고, 앉기·무릎 들기·옆으로 기울이기 같은 전신 자세가 자주 나옴
import { burst, popup, shake, outlinedText } from "../fx.js?v=26";
import { sfx } from "../audio.js?v=26";
import { POSES, figData, poseMatches } from "./copy.js?v=26";

const TRAVEL = 4.2;    // 벽이 멀리서 닿기까지 걸리는 시간(초, 보통)
const GAP = 0.9;       // 벽 사이 쉬는 시간
const MOVE_RATE = 0.6;  // 구멍이 가운데가 아닌 곳에 뚫리는 비율 (처음 두 벽은 가운데)

// 벽 통과에만 있는 자세: 윗몸을 옆으로 기울이기 (그림은 엉덩이를 중심으로 윗몸을 돌려 그림)
const UP_L = [[72, 44], [64, 10]], UP_R = [[128, 44], [136, 10]];
const leanOk = dir => p => {
  if (![11, 12, 15, 16, 23, 24].every(i => p[i].v)) return false;
  const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1;
  const dx = (p[11].x + p[12].x) / 2 - (p[23].x + p[24].x) / 2;
  return dx * dir > sw * 0.3 && p[15].y < p[11].y && p[16].y < p[12].y;   // 손은 어깨보다 위
};
export const WALL_POSES = [
  ...POSES,
  { id: "leanL", name: "왼쪽으로 기울이기", tilt: -22, need: [11, 12, 15, 16, 23, 24], f: { la: UP_L, ra: UP_R }, match: leanOk(-1) },
  { id: "leanR", name: "오른쪽으로 기울이기", tilt: 22, need: [11, 12, 15, 16, 23, 24], f: { la: UP_L, ra: UP_R }, match: leanOk(1) },
];
const BODY = ["squat", "lknee", "rknee", "leanL", "leanR"];   // 전신 자세
const matches = (pose, pts) => !!pts && (pose.match ? pose.match(pts) : poseMatches(pose, pts));

export default {
  id: "wall", title: "벽 통과", icon: "🧱", sec: 50, cursor: "", cat: "move", bg: "#f6c76b", desc: "구멍 자리로 가서 통과",
  how: "다가오는 벽의 구멍 자리로 가서, 구멍 모양대로 자세를 잡아요. 앉기·무릎 들기·옆으로 기울이기도 나와요!",
  create(env) {
    const z = env.zone, v = env.view;
    const off = document.createElement("canvas"), oc = off.getContext("2d");
    // 구멍 자리에 서 있는지: 몸 가운데(엉덩이 가운데)가 구멍 가운데와 가까운지
    // 구멍 가운데의 화면 x: 그림이 벽 밖으로 나가지 않게 줄인 만큼 반영 (2인처럼 구역이 좁으면 거의 못 움직임)
    const shiftOf = off => { const W = z.w * 0.96, H = v.H * 0.86, k = Math.min(W / 200, H / 220) * 0.92; return Math.max(0, Math.min(W - 200 * k, W / 2 - 100 * k + off * W)) - (W / 2 - 100 * k); };
    const holeX = () => z.cx + (wall ? shiftOf(wall.off) : 0);
    function placeOk(p) {
      if (!wall || !wall.off) return true;
      if (!p || !p[23].v || !p[24].v) return false;
      const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || v.U * 0.1;
      return Math.abs((p[23].x + p[24].x) / 2 - holeX()) < Math.max(sw * 0.9, z.w * 0.08);
    }
    let place = true, pendingOff = null;
    let wall = null, gapT = 0.6, passed = 0, crashed = 0, count = 0, lastId = null, matched = false, paintedKey = "";
    function nextWall() {
      const pool = WALL_POSES.filter(p => (!p.lower || env.tracker.lowerSeen) && p.id !== lastId);
      const body = pool.filter(p => BODY.includes(p.id)), arms = pool.filter(p => !BODY.includes(p.id));
      const from = body.length && Math.random() < 0.5 ? body : arms;           // 절반은 전신 자세
      const pose = from[Math.floor(Math.random() * from.length)]; lastId = pose.id;
      // 구멍 위치(구역 가운데 기준, 구역 너비 비율): 처음 두 벽은 가운데
      let off = pendingOff != null ? pendingOff : count >= 2 && Math.random() < MOVE_RATE ? (Math.random() < 0.5 ? -1 : 1) * (0.14 + Math.random() * 0.16) : 0;
      pendingOff = null;
      if (Math.abs(shiftOf(off)) < z.w * 0.06) off = 0;   // 거의 안 움직이면 가운데로
      wall = { pose, off, t: 0, T: TRAVEL * env.diff.poseTime * (1 - 0.25 * env.progress()) * (off ? 1.12 : 1), matchT: 0, result: null, rt: 0 };
      count++; sfx.whoosh();
    }
    // 벽(구멍 뚫린)을 별도 캔버스에 그림: 벽돌 → 사람 모양을 지움
    function paintWall(w, h, pose, glow, hoff) {
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
      const f = figData(pose.f), k = Math.min(w / 200, h / 220) * 0.92;
      const ox = Math.max(0, Math.min(w - 200 * k, w / 2 - 100 * k + hoff * w)), oy = h - 220 * k - h * 0.02;
      // 기울이기: 윗몸(몸통·팔·머리)만 엉덩이를 중심으로 돌림
      const a = (pose.tilt || 0) * Math.PI / 180, [hx0, hy0] = f.hip;
      const rot = ([x, y]) => [hx0 + (x - hx0) * Math.cos(a) - (y - hy0) * Math.sin(a), hy0 + (x - hx0) * Math.sin(a) + (y - hy0) * Math.cos(a)];
      const P = ([x, y], upper) => { const [rx, ry] = upper ? rot([x, y]) : [x, y]; return [ox + rx * k, oy + ry * k]; };
      const shape = (ctx2) => {
        ctx2.lineCap = "round"; ctx2.lineJoin = "round"; ctx2.lineWidth = 34 * k;
        f.lines.forEach((line, li) => { ctx2.beginPath(); line.forEach((p, i) => { const [x, y] = P(p, li < 3); i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y); }); ctx2.stroke(); });
        const [hx, hy] = P(f.head, true); ctx2.beginPath(); ctx2.arc(hx, hy, 30 * k, 0, Math.PI * 2); ctx2.fill();
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
          const pts = env.tracker.pts;
          place = placeOk(pts);
          matched = place && matches(wall.pose, pts);
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
        const key = `${wall.pose.id}|${wall.off}|${matched}|${Math.round(W)}x${Math.round(H)}`;
        if (key !== paintedKey) { paintWall(W, H, wall.pose, matched ? "#2fd36b" : null, wall.off); paintedKey = key; }   // 실제 크기로 한 번 그려 두고 확대·축소만
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.drawImage(off, cx - w / 2, by - h, w, h);
        ctx.restore();
        if (!wall.result) {
          outlinedText(ctx, wall.pose.name, cx, Math.max(v.U * 0.2, by - h - v.U * 0.04), v.U * 0.05, "#fff", "#8a3f22");
          // 구멍이 옆에 있으면 바닥에 설 자리 표시
          if (wall.off && k > 0.2) {
            const hx = holeX(), fy = v.H * 0.95, pulse = 0.55 + 0.45 * Math.sin(wall.t * 8);
            ctx.save(); ctx.globalAlpha = place ? 0.9 : pulse; ctx.fillStyle = place ? "#2fd36b" : "#ffd400";
            ctx.beginPath(); ctx.ellipse(hx, fy, z.w * 0.09, v.U * 0.022, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            if (!place) outlinedText(ctx, wall.off < 0 ? "← 여기로!" : "여기로! →", hx, fy - v.U * 0.05, v.U * 0.04, "#fff", "#7a5a00");
          }
          // 남은 시간 막대
          const bw = z.w * 0.5, bx = cx - bw / 2, y = v.H * 0.16;
          ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(bx, y, bw, v.U * 0.014);
          ctx.fillStyle = k > 0.65 ? "#ff5a5a" : "#ffd400"; ctx.fillRect(bx, y, bw * (1 - k), v.U * 0.014);
        }
      },
      result: () => `통과 ${passed} · 부딪힘 ${crashed}`,
      // 설명 시연용
      get current() { return wall && !wall.result ? wall.pose.id : null; },
      forceOff(o) { pendingOff = o; },
      get holeX() { return wall && !wall.result ? holeX() : null; },
      get progressK() { return wall ? wall.t / wall.T : 0; },
      get index() { return count; },
    };
  },
};
