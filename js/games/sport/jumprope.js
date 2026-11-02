// 줄넘기 (스포츠 리조트의 몸풀기, 3D): 바닷가 광장에서 양쪽 친구가 줄을 돌려 주고, 줄이 발밑을 지나는 순간 점프!
// 내 캐릭터는 정면에서 보이고, 내가 뛰면 같이 뜀
// 점프 판정: 두 발목이 서 있을 때보다 함께 올라가면 (발목이 안 보이면 어깨가 확 올라가면) 공중에 있는 것으로 봄
import { burst, popup, outlinedText, rr, FONT } from "../../fx.js?v=37";
import { sfx } from "../../audio.js?v=37";
import { stage, THREE, ground, sea, box, cyl, ball as sphere, mesh, palm, cloud, playerAvatar, randomAvatar } from "./kit3d.js?v=37";

const PERIOD0 = 1.5, PERIOD_MIN = 0.85;   // 줄 한 바퀴 시간(초): 처음 → 가장 빠를 때
const WIN = 0.16;                          // 줄이 발밑을 지날 때 앞뒤로 이만큼(초) 안에 공중이면 성공
const HX = 2.3, AY = 1.45, AMP = 1.4;      // 3D: 손잡이 x 위치, 줄 회전축 높이, 줄 휘는 크기(m)

// 바닷가 광장: 타일 바닥, 바다, 야자수, 구름
function plaza(scene) {
  ground(scene, "#f3e2b8", 300, -0.02);
  const tile = box(12, 0.04, 9, "#e9d2a6", { receive: true, cast: false }); tile.position.set(0, 0, -1); scene.add(tile);
  for (let i = -5; i <= 5; i++) { const l = box(0.04, 0.045, 9, "#d4b98a", { cast: false }); l.position.set(i * 1.1, 0.002, -1); scene.add(l); }
  for (let j = -4; j <= 4; j++) { const l = box(12, 0.045, 0.04, "#d4b98a", { cast: false }); l.position.set(0, 0.002, -1 + j * 1.0); scene.add(l); }
  const w = sea(scene, 600, -0.3); w.position.z = -260;
  [[-6, -4], [6, -4], [-8, -1], [8, -1], [-5, -8], [5, -8]].forEach(([x, z], i) => scene.add(palm(x, z, 1.1 + (i % 3) * 0.15)));
  for (let i = 0; i < 6; i++) scene.add(cloud(-40 + i * 16, 14 + (i % 3) * 3, -80, 3 + (i % 2)));
  return w;
}
// 줄: 손잡이 사이 반원 모양 관(tube)을 회전축(x) 둘레로 돌림. rotation.x = 2π·phase (0 = 발밑)
function rope(scene) {
  const pts = []; for (let i = 0; i <= 32; i++) { const u = i / 32; pts.push(new THREE.Vector3(-HX + 2 * HX * u, -AMP * Math.sin(Math.PI * u), 0)); }
  const g = new THREE.Group(); g.position.set(0, AY, 0.3);
  const m = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035, 8, false), "#ff4d9d", { rough: 0.4 }); g.add(m);
  [-1, 1].forEach(s => { const h = cyl(0.06, 0.06, 0.3, "#ffd43b"); h.rotation.z = Math.PI / 2; h.position.x = s * (HX + 0.1); g.add(h); });
  scene.add(g); return g;
}

export default {
  id: "jumprope", title: "줄넘기", icon: "🪢", sec: 45, cursor: "", cat: "sport", bg: "#ffd1dc", desc: "줄이 발밑에 올 때 점프", scene3d: true,
  how: "양쪽에서 줄을 돌려 줘요. 줄이 발밑을 지나는 순간 깡충! 걸리지 않고 오래 넘을수록 점수가 커져요",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const st = stage(env, { fov: 46, sky: ["#4fb3f6", "#e3f6ff"], shadowSize: 8 });
    const { scene, camera } = st;
    const water = plaza(scene), rp = rope(scene);
    const me = playerAvatar(env); me.scale.setScalar(1.2); me.position.set(0, 0, 0.3); scene.add(me);
    const turners = [randomAvatar(3), randomAvatar(0)];
    turners.forEach((a, i) => { const s = i ? 1 : -1; a.scale.setScalar(1.15); a.position.set(s * (HX + 0.5), 0, 0.3); a.rotation.y = -s * Math.PI / 2; scene.add(a); });
    let air = 0, airV = 0, wasAir = false, cheer = 0;
    let phase = 0.35, period = PERIOD0 / Math.max(0.8, D.speed), t = 0, count = 0, best = 0, caught = 0, streak = 0, pause = 1.2;
    let lastAir = -9, judged = false, flash = 0;
    const base = { ank: [null, null], sh: null };
    // 공중에 떠 있는지
    function airborne(dt) {
      const p = env.tracker.pts;
      if (!p || !p[11].v || !p[12].v) return false;
      const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y) || 1, follow = (b, y) => (b == null ? y : Math.max(y, b - dt * sw * 0.1));
      const shY = (p[11].y + p[12].y) / 2;
      base.sh = follow(base.sh, shY);
      if (p[27].v && p[28].v) {
        base.ank = [27, 28].map((i, k) => follow(base.ank[k], p[i].y));
        return [27, 28].every((i, k) => base.ank[k] - p[i].y > sw * 0.22) && base.sh - shY > sw * 0.12;
      }
      return base.sh - shY > sw * 0.22;                     // 발이 안 보일 때: 어깨가 확 올라감
    }
    // 줄 모양: 양쪽 손잡이 사이의 곡선. phase 0 = 발밑(앞), 0.5 = 머리 위(뒤)
    const handle = () => ({ y: v.H * 0.55, xl: z.x0 + z.w * 0.06, xr: z.x1 - z.w * 0.06 });
    return {
      update(dt) {
        t += dt; flash = Math.max(0, flash - dt * 2); cheer = Math.max(0, cheer - dt);
        const up = airborne(dt);
        if (up) lastAir = t;
        // 내 캐릭터: 내가 뛰면 같이 뜀 (뛰기 시작할 때 위로 튀어 오름)
        if (up && !wasAir && air < 0.05) airV = 3.2;
        wasAir = up;
        airV -= 14 * dt; air = Math.max(0, air + airV * dt); if (air === 0) airV = Math.max(0, airV);
        me.position.y = air; me.leg(0, air > 0.02 ? 0.5 : 0); me.leg(1, air > 0.02 ? 0.5 : 0);
        if (air > 0.02) { me.arm(0, 0.5, 0.3, 0.8); me.arm(1, 0.5, 0.3, 0.8); } else me.mimic(env.tracker.pts, false);
        me.body.rotation.z *= 0.5;
        // 돌리는 친구들: 손이 줄과 같이 원을 그림
        const ang = (phase % 1) * Math.PI * 2;
        turners.forEach((a, i) => { a.arm(1 - i, 0.25, 1.15 + Math.cos(ang) * 0.4, 0.5 + Math.sin(ang) * 0.3); a.arm(i, 0.15, 0.2, 0.4); a.idle(t + i); a.body.position.y += cheer ? Math.abs(Math.sin(t * 12)) * 0.08 : 0; });
        water.update(t);
        if (pause > 0) { pause -= dt; return; }
        const before = phase;
        phase += dt / period;
        // 발밑을 지나는 때(phase가 정수를 넘는 순간) 앞뒤로 판정
        const sinceBottom = (phase % 1) * period;
        if (Math.floor(phase) > Math.floor(before)) judged = false;
        if (!judged && sinceBottom >= WIN && sinceBottom < 0.5 * period) {
          judged = true;
          const ok = t - lastAir <= WIN * 2 + 0.03;          // 줄이 지나간 앞뒤로 한 번이라도 공중이었으면 성공
          const hh = handle();
          if (ok) {
            count++; streak++; best = Math.max(best, streak); flash = 1; sfx.step(count % 2); if (streak % 10 === 0) cheer = 1.2;
            env.award(streak % 10 === 0 ? 3 : 1, z.cx, hh.y - v.U * 0.2);
            if (streak % 10 === 0) popup(z.cx, v.H * 0.36, `${streak}번 연속!`, { size: v.U * 0.06, color: "#fff", stroke: "#e0306a" });
            period = Math.max(PERIOD_MIN / Math.max(0.8, D.speed), period * 0.985);   // 점점 빨라짐
          } else {
            caught++; streak = 0; sfx.bad(); env.miss(z.cx, v.H * 0.8, "걸렸어요!"); pause = 1.2; phase = Math.floor(phase) + 0.35;
            period = Math.min(PERIOD0, period * 1.1);
          }
        }
      },
      draw(ctx) {
        rp.rotation.x = (phase % 1) * Math.PI * 2;
        const cd = Math.max(7.4, 8.4 / (z.w / v.H));   // 2인(좁은 화면)이면 뒤로 물러나 돌리는 친구까지 보이게
        camera.position.set(0, 2.1, cd); camera.lookAt(0, 1.05, 0);
        st.draw(ctx);
        const U = v.U, ph = phase % 1;
        // '점프!' 신호
        const toBottom = (1 - ph) * period;
        if (pause <= 0 && toBottom < 0.45 && ph > 0.5) {
          const k = 1 - toBottom / 0.45;
          outlinedText(ctx, "점프!", z.cx, v.H * 0.8, U * (0.06 + 0.03 * k), "#fff", "#e0306a", 4);
        }
        // 넘은 횟수 (위쪽 판)
        const bw = Math.min(z.w * 0.6, U * 0.46), bh = U * 0.15, bx = z.cx - bw / 2, by = v.H * 0.11;
        ctx.fillStyle = flash > 0 ? `rgba(47,182,90,${(0.6 + 0.3 * flash).toFixed(2)})` : "rgba(20,60,110,.78)"; rr(ctx, bx, by, bw, bh, U * 0.025); ctx.fill();
        outlinedText(ctx, String(count), z.cx, by + bh * 0.42, U * 0.08, "#fff", env.color, 5);
        outlinedText(ctx, `연속 ${streak} · 최고 ${best}`, z.cx, by + bh * 0.83, U * 0.03, "#fff", "#333", 3);
        if (pause > 0 && t > 1.3) outlinedText(ctx, "다시 시작해요", z.cx, v.H * 0.45, U * 0.045, "#fff", "#333", 3);
      },
      stop() { st.dispose(); },
      result: () => `넘은 횟수 ${count} · 최고 연속 ${best} · 걸림 ${caught}`,
      // 설명 시연용: 줄이 발밑에 닿기까지 남은 시간
      get toBottom() { return pause > 0 ? 9 : (1 - (phase % 1)) * period; },
      get count() { return count; },
    };
  },
  demo: {
    dur: 15,
    run(T, g, p, S, say) {
      p.tcx = p.v.W / 2; p.rest(0, "hips", 1); p.rest(1, "hips", 1);
      if (T < 4) say("줄넘기! 양쪽에서 줄을 돌려 줘요");
      else if (T < 9) say("줄이 발밑을 지나는 순간 깡충 뛰어요");
      else if (T < 12.5) say("연속으로 넘을수록 줄이 빨라져요. 10번마다 보너스!");
      else say("이제 직접 해 봐요!");
      // 줄이 발밑에 닿기 0.22초 전에 점프 (몸이 가장 높을 때 줄이 지나감)
      if (g.toBottom < 0.24 && g.toBottom > 0.1 && (!S.jt || T - S.jt > 0.5)) { p.jump(); S.jt = T; }
    },
  },
};
