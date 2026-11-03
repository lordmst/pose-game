// 줄넘기 (스포츠 리조트의 몸풀기, 3D): 바닷가 광장에서 양쪽 친구가 줄을 돌려 주고, 줄이 발밑을 지나는 순간 점프!
// 내 캐릭터는 정면에서 보이고, 내가 뛰면 같이 뜀. 2인은 긴 줄 하나를 둘이 나란히 넘으며 넘은 횟수로 대결(걸려도 줄은 계속 돎)
// 점프 판정: 두 발목이 서 있을 때보다 함께 올라가면 (발목이 안 보이면 어깨가 확 올라가면) 공중에 있는 것으로 봄
import { burst, popup, outlinedText, rr, FONT } from "../../fx.js?v=51";
import { sfx } from "../../audio.js?v=51";
import { stage, THREE, ground, sea, box, cyl, ball as sphere, mesh, palm, cloud, playerAvatar, randomAvatar } from "./kit3d.js?v=51";

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
// 줄: 손잡이 사이 반원 모양 관(tube)을 회전축(x) 둘레로 돌림. rotation.x = 2π·phase (0 = 발밑). hx: 손잡이 x (2인은 긴 줄)
function rope(scene, hx = HX) {
  const pts = []; for (let i = 0; i <= 32; i++) { const u = i / 32; pts.push(new THREE.Vector3(-hx + 2 * hx * u, -AMP * Math.sin(Math.PI * u), 0)); }
  const g = new THREE.Group(); g.position.set(0, AY, 0.3);
  const m = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035, 8, false), "#ff4d9d", { rough: 0.4 }); g.add(m);
  [-1, 1].forEach(s => { const h = cyl(0.06, 0.06, 0.3, "#ffd43b"); h.rotation.z = Math.PI / 2; h.position.x = s * (hx + 0.1); g.add(h); });
  scene.add(g); return g;
}
const AUTO = /simauto=1/.test(typeof location !== "undefined" ? location.search : "");   // 점검용: 가상 선수가 저절로 뜀
// 줄(rope) 상태: 1인은 이 화면만, 2인은 두 화면이 같은 줄을 씀(0번 화면이 돌림). 두 선수가 나란히 같은 줄을 넘음
let shared = null;
const newRope = D => ({ phase: 0.35, period: PERIOD0 / Math.max(0.8, D.speed), pause: 1.2, players: [null, null] });
const JX = 0.95;   // 2인: 두 선수 자리 (1P 왼쪽 -JX, 2P 오른쪽 +JX)

export default {
  id: "jumprope", title: "줄넘기", icon: "🪢", sec: 45, cursor: "", cat: "sport", bg: "#ffd1dc", desc: "줄이 발밑에 올 때 점프 · 2인 대결", scene3d: true,
  how: "양쪽에서 줄을 돌려 줘요. 줄이 발밑을 지나는 순간 깡충! 걸리지 않고 오래 넘을수록 점수가 커져요. 둘이 하면 같은 줄을 나란히 넘어 더 많이 넘은 사람이 이겨요",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const versus = env.mode === 2, slot = versus ? env.slot : 0, other = 1 - slot, owner = !versus || slot === 0;
    // 줄: 2인은 두 화면이 같은 줄(0번 화면이 돌림)
    let R;
    if (versus) { if (!shared) shared = newRope(D); R = shared; } else R = newRope(D);
    const P = R.players[slot] = { name: env.name || `${slot + 1}P`, color: env.color || "#ff6b6b", count: 0, streak: 0, best: 0, caught: 0, air: 0, tracker: env.tracker, flash: 0 };
    const hxR = versus ? HX + 1.1 : HX, myX = versus ? (slot ? JX : -JX) : 0;
    const st = stage(env, { fov: 46, sky: ["#4fb3f6", "#e3f6ff"], shadowSize: 8 });
    const { scene, camera } = st;
    const water = plaza(scene), rp = rope(scene, hxR);
    const me = playerAvatar(env); me.scale.setScalar(1.2); me.position.set(myX, 0, 0.3); scene.add(me);
    let rival = null;   // 2인: 옆에서 같이 뛰는 상대 (상대 색, 상대 팔 동작 따라 함)
    const turners = [randomAvatar(3), randomAvatar(0)];
    turners.forEach((a, i) => { const s = i ? 1 : -1; a.scale.setScalar(1.15); a.position.set(s * (hxR + 0.5), 0, 0.3); a.rotation.y = -s * Math.PI / 2; scene.add(a); });
    let air = 0, airV = 0, wasAir = false, cheer = 0, t = 0, lastAir = -9, judged = false, myFloor = Math.floor(R.phase), endShown = false;
    let autoPass = -1, autoOk = false;
    const base = { ank: [null, null], sh: null };
    // 공중에 떠 있는지
    function airborne(dt) {
      if (AUTO) {   // 점검용: 줄이 지날 때마다 80% 확률로 알맞게 뜀
        const f = Math.floor(R.phase + 0.5), ph = R.phase % 1;   // 다가오는(또는 막 지난) 발밑 통과 번호
        if (f !== autoPass) { autoPass = f; autoOk = Math.random() < 0.8; }
        return R.pause <= 0 && autoOk && ((1 - ph) * R.period < 0.2 || ph * R.period < 0.12);
      }
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
    // 점프하는 캐릭터 모양 (내 것·상대 것 같이 씀)
    function pose(a, h, pts) {
      a.leg(0, h > 0.02 ? 0.5 : 0); a.leg(1, h > 0.02 ? 0.5 : 0);
      if (h > 0.02) { a.arm(0, 0.5, 0.3, 0.8); a.arm(1, 0.5, 0.3, 0.8); } else a.mimic(pts, false);
      a.body.rotation.z *= 0.5;
    }
    const opp = () => (versus ? R.players[other] : null);
    return {
      update(dt) {
        t += dt; P.flash = Math.max(0, P.flash - dt * 2); cheer = Math.max(0, cheer - dt);
        const up = airborne(dt);
        if (up) lastAir = t;
        // 내 캐릭터: 내가 뛰면 같이 뜀 (뛰기 시작할 때 위로 튀어 오름)
        if (up && !wasAir && air < 0.05) airV = 3.2;
        wasAir = up;
        airV -= 14 * dt; air = Math.max(0, air + airV * dt); if (air === 0) airV = Math.max(0, airV);
        P.air = air; me.position.y = air; pose(me, air, env.tracker.pts);
        // 2인: 상대 캐릭터 (상대가 들어오면 만들고, 상대의 점프 높이·팔 동작을 그대로)
        const O = opp();
        if (O && !rival) { rival = playerAvatar({ color: O.color, name: O.name }); rival.scale.setScalar(1.2); rival.position.set(-myX, 0, 0.3); scene.add(rival); }
        if (O && rival) { rival.position.y = O.air; pose(rival, O.air, O.tracker && O.tracker.pts); }
        // 돌리는 친구들: 손이 줄과 같이 원을 그림
        const ang = (R.phase % 1) * Math.PI * 2;
        turners.forEach((a, i) => { a.arm(1 - i, 0.25, 1.15 + Math.cos(ang) * 0.4, 0.5 + Math.sin(ang) * 0.3); a.arm(i, 0.15, 0.2, 0.4); a.idle(t + i); a.body.position.y += cheer ? Math.abs(Math.sin(t * 12)) * 0.08 : 0; });
        water.update(t);
        // 줄 돌리기: 1인은 이 화면, 2인은 0번 화면이 돌림
        if (owner) { if (R.pause > 0) R.pause -= dt; else R.phase += dt / R.period; }
        if (R.pause > 0) { myFloor = Math.floor(R.phase); return; }
        // 발밑을 지나는 때(phase가 정수를 넘는 순간) 앞뒤로 판정 (선수마다 따로)
        const f = Math.floor(R.phase), sinceBottom = (R.phase % 1) * R.period;
        if (f > myFloor) { judged = false; myFloor = f; }
        if (!judged && sinceBottom >= WIN && sinceBottom < 0.5 * R.period) {
          judged = true;
          const ok = t - lastAir <= WIN * 2 + 0.03;          // 줄이 지나간 앞뒤로 한 번이라도 공중이었으면 성공
          const sx = st.toScreen(new THREE.Vector3(myX, 2.2, 0.3));
          if (ok) {
            P.count++; P.streak++; P.best = Math.max(P.best, P.streak); P.flash = 1; sfx.step(P.count % 2); if (P.streak % 10 === 0) cheer = 1.2;
            env.award(P.streak % 10 === 0 ? 3 : 1, sx.x, sx.y);
            if (P.streak % 10 === 0) popup(z.cx, v.H * 0.4, `${P.streak}번 연속!`, { size: v.U * 0.06, color: "#fff", stroke: "#e0306a" });
            if (owner) R.period = Math.max(PERIOD_MIN / Math.max(0.8, D.speed), R.period * 0.985);   // 점점 빨라짐
          } else {
            P.caught++; P.streak = 0; sfx.bad(); env.miss(z.cx, v.H * 0.8, "걸렸어요!");
            if (!versus) { R.pause = 1.2; R.phase = Math.floor(R.phase) + 0.35; myFloor = Math.floor(R.phase); }   // 1인: 줄을 멈췄다가 다시
            R.period = Math.min(PERIOD0, R.period * (versus ? 1.04 : 1.1));                                       // 2인: 줄은 계속 돎, 조금만 느려짐
          }
        }
        // 2인: 끝나기 직전 승자 발표
        if (versus && O && !endShown && env.progress() > 0.985) {
          endShown = true;
          const win = P.count > O.count, tie = P.count === O.count;
          popup(z.cx, v.H * 0.36, tie ? "무승부!" : win ? `${P.name} 승리!` : `${O.name} 승리!`, { size: v.U * 0.075, color: "#fff", stroke: tie ? "#555" : win ? P.color : O.color, life: 2 });
          if (win) { env.award(5, z.cx, v.H * 0.3); sfx.fanfare(); }
        }
      },
      draw(ctx) {
        rp.rotation.x = (R.phase % 1) * Math.PI * 2;
        const aspect = z.w / v.H, cd = versus ? Math.max(7.4, 9.6 / aspect) : Math.max(7.4, 8.4 / aspect);   // 좁은 화면이면 뒤로 물러남
        camera.position.set(myX * 0.8, 2.1, cd); camera.lookAt(myX * 0.8, 1.05, 0);
        st.draw(ctx);
        const U = v.U, ph = R.phase % 1;
        // '점프!' 신호
        const toBottom = (1 - ph) * R.period;
        if (R.pause <= 0 && toBottom < 0.45 && ph > 0.5) {
          const k = 1 - toBottom / 0.45;
          outlinedText(ctx, "점프!", z.cx, v.H * 0.8, U * (0.06 + 0.03 * k), "#fff", "#e0306a", 4);
        }
        const O = opp();
        if (versus && O) {
          // 2인: 두 화면에 같은 점수판 "1P 이름 n : n 2P 이름" + 앞선 사람 👑
          const A = R.players[0], B = R.players[1], bw = Math.min(z.w * 0.94, U * 0.8), bh = U * 0.15, bx = z.cx - bw / 2, by = v.H * 0.11;
          ctx.fillStyle = P.flash > 0 ? `rgba(47,182,90,${(0.6 + 0.3 * P.flash).toFixed(2)})` : "rgba(20,60,110,.8)"; rr(ctx, bx, by, bw, bh, U * 0.025); ctx.fill();
          const fs = Math.min(U * 0.06, bw / 9), lead = A.count === B.count ? -1 : A.count > B.count ? 0 : 1;
          outlinedText(ctx, `${lead === 0 ? "👑" : ""}${A.count}`, bx + bw * 0.27, by + bh * 0.4, fs * 1.3, "#fff", A.color, 4);
          outlinedText(ctx, ":", z.cx, by + bh * 0.4, fs, "#fff", "#333", 3);
          outlinedText(ctx, `${B.count}${lead === 1 ? "👑" : ""}`, bx + bw * 0.73, by + bh * 0.4, fs * 1.3, "#fff", B.color, 4);
          const ns = Math.min(U * 0.028, bw / 16);
          outlinedText(ctx, `1P ${A.name}`, bx + bw * 0.27, by + bh * 0.82, ns, "#fff", A.color, 3);
          outlinedText(ctx, `${B.name} 2P`, bx + bw * 0.73, by + bh * 0.82, ns, "#fff", B.color, 3);
          outlinedText(ctx, `연속 ${P.streak} · 최고 ${P.best}`, z.cx, by + bh + U * 0.03, Math.min(U * 0.03, z.w / 16), "#fff", "#333", 3);
        } else {
          // 넘은 횟수 (위쪽 판)
          const bw = Math.min(z.w * 0.6, U * 0.46), bh = U * 0.15, bx = z.cx - bw / 2, by = v.H * 0.11;
          ctx.fillStyle = P.flash > 0 ? `rgba(47,182,90,${(0.6 + 0.3 * P.flash).toFixed(2)})` : "rgba(20,60,110,.78)"; rr(ctx, bx, by, bw, bh, U * 0.025); ctx.fill();
          outlinedText(ctx, String(P.count), z.cx, by + bh * 0.42, U * 0.08, "#fff", env.color, 5);
          outlinedText(ctx, `연속 ${P.streak} · 최고 ${P.best}`, z.cx, by + bh * 0.83, U * 0.03, "#fff", "#333", 3);
        }
        if (R.pause > 0 && t > 1.3) outlinedText(ctx, "다시 시작해요", z.cx, v.H * 0.45, U * 0.045, "#fff", "#333", 3);
      },
      stop() { st.dispose(); shared = null; },
      result: () => {
        const O = opp(), vs = O ? ` · ${O.name} ${O.count} ${P.count > O.count ? "(승)" : P.count < O.count ? "(패)" : "(무)"}` : "";
        return `넘은 횟수 ${P.count} · 최고 연속 ${P.best} · 걸림 ${P.caught}${vs}`;
      },
      // 설명 시연용: 줄이 발밑에 닿기까지 남은 시간
      get toBottom() { return R.pause > 0 ? 9 : (1 - (R.phase % 1)) * R.period; },
      get count() { return P.count; },
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
