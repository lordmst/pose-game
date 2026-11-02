// 테니스 (스포츠 리조트처럼 3D 복식): 내 캐릭터 뒤에서 코트를 봄. 상대가 친 공이 바운드되어 오면 타이밍 맞춰 팔을 휘둘러 받아치기
// 캐릭터는 공 쪽으로 저절로 움직임. 휘두른 순간이 좋을수록 세고 코너로 감. 상대가 못 받으면 내 점수. 점수는 테니스식(15·30·40·게임)
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=39";
import { sfx } from "../../audio.js?v=39";
import { stage, THREE, ground, box, ball as sphere, mesh, mat, tree, cloud, playerAvatar, randomAvatar, racket, bodyMover, moveGuide, moveText } from "./kit3d.js?v=39";

const FLIGHT = 1.7;    // 상대 → 나 공 시간(초, 보통)
const BACK = 1.2;      // 나 → 상대
const SWING = 2.4;     // 스윙으로 인정하는 손 속도(어깨너비/초)
const WIN0 = 0.8, WIN1 = 1.14, SWEET = 0.97;   // 받아칠 수 있는 구간(비행 비율)과 가장 좋은 순간
const CPU_RETURN = { easy: 0.5, normal: 0.66, hard: 0.78 };
const PTS = ["0", "15", "30", "40"];
const L = 11.9, HW = 5.5;   // 코트 반 길이·반 너비(복식, m)
const COURT_X = HW - 0.8;   // 내 캐릭터가 움직일 수 있는 좌우 범위(m)
const SPAN = 0.33;          // 몸을 화면(내 구역) 가운데에서 너비의 이 비율만큼 옮기면 코트 끝까지 감
const REACH = 0.75;         // 표시한 자리에서 이만큼(m) 안에 있으면 칠 수 있음

// 포물선: a→b, 높이 h, u 0~1(넘어가면 그대로 이어짐)
const arc = (a, b, h, u) => new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + 4 * h * u * (1 - u), a.z + (b.z - a.z) * u);

function court(scene) {
  ground(scene, "#5aa646", 300);
  const outer = box(HW * 2 + 7, 0.02, L * 2 + 9, "#3f7fd0", { receive: true, cast: false }); outer.position.y = 0.01; scene.add(outer);
  const inner = box(HW * 2, 0.02, L * 2, "#2f6bc2", { receive: true, cast: false }); inner.position.y = 0.02; scene.add(inner);
  const line = (w, d, x, z) => { const m = box(w, 0.025, d, "#ffffff", { cast: false, receive: true }); m.position.set(x, 0.03, z); scene.add(m); };
  const T = 0.07;
  line(HW * 2, T, 0, L); line(HW * 2, T, 0, -L);                                   // 베이스라인
  [-HW, HW, -HW + 1.37, HW - 1.37].forEach(x => line(T, L * 2, x, 0));             // 사이드라인(복식·단식)
  line((HW - 1.37) * 2, T, 0, 6.4); line((HW - 1.37) * 2, T, 0, -6.4);              // 서비스 라인
  line(T, 12.8, 0, 0);                                                               // 센터 라인
  // 네트
  const net = mesh(new THREE.PlaneGeometry(HW * 2 + 1, 0.9), new THREE.MeshStandardMaterial({ color: "#222", transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  net.position.set(0, 0.45, 0); scene.add(net);
  const tape = box(HW * 2 + 1, 0.07, 0.04, "#ffffff"); tape.position.set(0, 0.92, 0); scene.add(tape);
  [-1, 1].forEach(s => { const p = box(0.1, 1.07, 0.1, "#ddd"); p.position.set(s * (HW + 0.5), 0.53, 0); scene.add(p); });
  // 관중석·벽·나무·구름 (리조트 섬 느낌)
  const wall = box(HW * 2 + 9, 1.2, 0.3, "#1f4f9a"); wall.position.set(0, 0.6, -L - 4.6); scene.add(wall);
  [-1, 1].forEach(s => { const w = box(0.3, 1.2, L * 2 + 9, "#1f4f9a"); w.position.set(s * (HW + 3.6), 0.6, 0); scene.add(w); });
  const colors = ["#ff6b6b", "#ffd43b", "#69db7c", "#74c0fc", "#f783ac", "#ffa94d"];
  for (let r = 0; r < 4; r++) {
    const step = box(HW * 2 + 9, 0.5, 1.2, "#cfd8e3"); step.position.set(0, 1.4 + r * 0.6, -L - 5.6 - r * 1.1); scene.add(step);
    for (let i = 0; i < 16; i++) { const fan = sphere(0.28, colors[(i + r * 3) % colors.length]); fan.position.set(-HW - 3.5 + i * ((HW * 2 + 7) / 15), 1.95 + r * 0.6, -L - 5.6 - r * 1.1); fan.userData.bob = Math.random() * 6; scene.add(fan); scene.userData.fans = (scene.userData.fans || []).concat(fan); }
  }
  for (let i = 0; i < 14; i++) { const s = i % 2 ? 1 : -1; scene.add(tree(s * (HW + 7 + (i % 3) * 2.5), -L - 2 + i * 2.4, 1.3 + (i % 3) * 0.3, i % 3 ? "#3f9b3f" : "#2f8a4f")); }
  for (let i = 0; i < 6; i++) scene.add(cloud(-40 + i * 16, 18 + (i % 3) * 3, -70 - (i % 2) * 20, 3 + (i % 2)));
}

export default {
  id: "tennis", title: "테니스", icon: "🎾", sec: 60, cursor: "", cat: "sport", bg: "#9be15d", desc: "좌우로 움직여 받아치기", scene3d: true,
  how: "몸을 좌우로 움직이면 캐릭터도 움직여요. 공이 오면 점선 자리로 가서, 공이 왔을 때 팔을 크게 휘둘러요. 딱 맞는 순간이면 강한 샷!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const st = stage(env, { fov: 52, sky: ["#58b7f5", "#d9f1ff"], shadowSize: 18 });
    const { scene, camera } = st;
    court(scene);
    // 우리 편: 나(뒤) + 짝꿍(네트 앞). 상대: 둘
    const me = playerAvatar(env); me.scale.setScalar(1.25); me.rotation.y = Math.PI; me.position.set(0, 0, L + 0.5); scene.add(me);
    const myR = me.hold(1, racket(env.color || "#ff6b6b"));
    const mate = randomAvatar(2); mate.scale.setScalar(1.25); mate.rotation.y = Math.PI; mate.position.set(-2.2, 0, 3.2); mate.hold(1, racket("#ffd43b")); scene.add(mate);
    const opp = [randomAvatar(1), randomAvatar(4)];
    opp.forEach((o, i) => { o.scale.setScalar(1.25); o.position.set(i ? 2 : -1, 0, i ? -3.4 : -L - 0.5); o.hold(1, racket(i ? "#845ef7" : "#20c997")); scene.add(o); });
    const tball = sphere(0.11, "#e4ff3a", { rough: 0.4 }); scene.add(tball);
    const shadow = mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }), { cast: false }); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    const ring = mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), { cast: false }); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; scene.add(ring);
    tball.visible = shadow.visible = ring.visible = false;
    const mover = bodyMover(env, COURT_X, SPAN), guideM = moveGuide(scene), toScreenX = x => mover.toScreenX(x);
    const near = () => B && B.dir === 1 && Math.abs(myX - B.spot) <= REACH * D.reach;

    let B = null, wait = 1.4, sMe = 0, sCpu = 0, gMe = 0, gCpu = 0, returns = 0, winners = 0, t = 0, swingT = 9, swingDir = 1, oppSwing = [9, 9], myX = 0, cheer = 0, camX = 0;
    // 상대가 공을 보냄
    function send(from) {
      // 공은 지금 자리에서 조금~많이 떨어진 곳으로: 몸을 옮겨야 칠 수 있음
      let side = Math.random() < 0.5 ? -1 : 1;
      if (Math.abs(myX + side * 2) > COURT_X) side = -side;
      const hx = clamp(myX + side * (1.0 + Math.random() * 2.6), -COURT_X, COURT_X);
      const p0 = from.position.clone().add(new THREE.Vector3(0.5, 1.2, 0.4));
      const bnc = new THREE.Vector3(hx * 0.9, 0.06, 6.5 + Math.random() * 2.5), hit = new THREE.Vector3(hx, 1.0, L + 0.2);
      let sp = hx - 0.75; if (sp < -COURT_X) sp = hx + 0.75;          // 공이 몸 오른쪽(포핸드)에 오는 자리
      B = { dir: 1, p0, bnc, hit, t: 0, T: FLIGHT * (1 - 0.22 * env.progress()) / D.speed, side, hx, spot: sp };
      oppSwing[opp.indexOf(from)] = 0; sfx.whoosh();
    }
    function at(Bl) {   // 지금 공 위치
      const k = Bl.t / Bl.T, kb = 0.62;
      return { k, p: k < kb ? arc(Bl.p0, Bl.bnc, Bl.dir === 1 ? 2.4 : 2.0, k / kb) : arc(Bl.bnc, Bl.hit, 0.9, (k - kb) / (1 - kb)) };
    }
    function point(mine) {
      if (mine) sMe++; else sCpu++;
      if ((sMe >= 4 || sCpu >= 4) && Math.abs(sMe - sCpu) >= 2) {
        const won = sMe > sCpu; if (won) gMe++; else gCpu++;
        sMe = sCpu = 0;
        if (won) { sfx.fanfare(); env.award(3, z.cx, v.H * 0.4); popup(z.cx, v.H * 0.48, "게임 승리!", { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.3 }); }
        else popup(z.cx, v.H * 0.48, "상대 게임", { size: v.U * 0.05, color: "#eee", stroke: "#555" });
      }
      B = null; wait = 1.4; tball.visible = shadow.visible = ring.visible = false;
    }
    const score = () => (sMe >= 3 && sCpu >= 3) ? (sMe === sCpu ? "듀스" : sMe > sCpu ? "어드밴티지 우리 편" : "어드밴티지 상대") : `우리 ${PTS[Math.min(3, sMe)]} - ${PTS[Math.min(3, sCpu)]} 상대`;
    function swingPose(a, T, dir) {     // 라켓 휘두르기 모양 (T: 휘두른 뒤 지난 시간)
      if (T > 0.45) return false;
      const u = Math.min(1, T / 0.25);
      a.body.rotation.y = dir * (0.9 - 1.8 * u);
      a.arm(1, 1.35, 0.4 + 0.8 * u, 0.3);
      return true;
    }
    return {
      update(dt) {
        t += dt; swingT += dt; oppSwing = oppSwing.map(x => x + dt); cheer = Math.max(0, cheer - dt);
        const hands = env.tracker.hands, fast = hands.find(h => h.vis && h.bodySpeed >= SWING * D.punch);
        if (fast && swingT > 0.5) { swingT = 0; swingDir = fast.vx > 0 ? 1 : -1; }
        // 내 캐릭터: 내 몸이 좌우로 움직인 만큼 따라 움직임
        myX = mover.follow(myX, dt); me.position.x = myX;
        // 이동 안내 표시
        const guide = B && B.dir === 1 && !B.swung;
        if (guide) guideM.show(myX, B.spot, L + 0.5, near(), t); else guideM.hide();
        st.pipMark = guide ? { x: toScreenX(B.spot), ok: near(), label: "여기로" } : null;
        if (!swingPose(me, swingT, swingDir)) { me.body.rotation.y *= 0.8; me.mimic(env.tracker.pts, true); }
        opp.forEach((o, i) => { if (!swingPose(o, oppSwing[i], 1)) { o.body.rotation.y *= 0.8; o.arm(1, 0.5, 0.6, 0.6); o.arm(0, 0.3, 0.3, 0.5); } o.idle(t + i); });
        mate.arm(1, 0.5, 0.6, 0.6); mate.idle(t + 2);
        (scene.userData.fans || []).forEach(f => { f.position.y += Math.sin(t * (cheer ? 14 : 3) + f.userData.bob) * dt * (cheer ? 1.4 : 0.15); });
        if (!B) { wait -= dt; if (wait <= 0) send(opp[Math.random() < 0.6 ? 0 : 1]); return; }
        B.t += dt;
        const { k, p } = at(B);
        tball.visible = shadow.visible = true; tball.position.copy(p); shadow.position.set(p.x, 0.04, p.z);
        ring.visible = B.dir === 1; if (ring.visible) { ring.position.x = B.bnc.x; ring.position.z = B.bnc.z; ring.scale.setScalar(1 + Math.sin(t * 8) * 0.08); }
        if (B.dir === 1) {
          if (k > WIN0 && k < WIN1 && swingT < 0.12 && !B.swung && !near() && !B.whiff) {   // 너무 멀리서 휘두름
            B.whiff = true; popup(z.cx, v.H * 0.62, "닿지 않아요! 점선 자리로", { size: v.U * 0.04, color: "#fff", stroke: "#d07a00", life: 0.9 });
          }
          if (k > WIN0 && k < WIN1 && swingT < 0.12 && !B.swung && near()) {
            B.swung = true;
            const q = 1 - Math.min(1, Math.abs(k - SWEET) / 0.17);                 // 타이밍 점수 0~1
            returns++; sfx.hit(2); shake(v.U * 0.006, 0.12);
            const sp = st.toScreen(p);
            env.award(q > 0.7 ? 2 : 1, sp.x, sp.y - v.U * 0.08);
            popup(sp.x, sp.y + v.U * 0.05, q > 0.7 ? "나이스 샷!" : swingDir > 0 ? "포핸드!" : "백핸드!", { size: v.U * 0.045, color: "#fff", stroke: "#2f8f2f", life: 0.8 });
            burst(sp.x, sp.y, { n: 14, colors: ["#e8ff6a", "#ffffff"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.4, size: v.U * 0.016, life: 0.5 });
            // 타이밍이 좋을수록 코너로 세게. 휘두른 방향으로 감
            const aim = clamp(swingDir * (1.5 + 2.5 * q) + (Math.random() - 0.5) * 2, -HW + 0.5, HW - 0.5);
            const tgt = opp[Math.abs(opp[0].position.x - aim) < Math.abs(opp[1].position.x - aim) ? 0 : 1];
            B = { dir: -1, p0: p.clone(), bnc: new THREE.Vector3(aim * 0.9, 0.06, -6 - Math.random() * 3), hit: new THREE.Vector3(aim, 1.0, tgt === opp[0] ? -L - 0.3 : -3.4), t: 0, T: BACK * (1.15 - 0.3 * q), q, aim, tgt };
            ring.visible = false;
            return;
          }
          if (k >= WIN1 + 0.1) { sfx.thud(); env.miss(z.cx, v.H * 0.75, "놓쳤어요"); point(false); }
        } else {
          B.tgt.position.x += (B.aim - 0.6 - B.tgt.position.x) * Math.min(1, dt * (2.4 - B.q));   // 상대가 공 쪽으로 뜀
          if (k >= 1) {
            const far = Math.abs(B.aim) > 3.5 ? 0.12 : 0, hard = B.q > 0.75 ? 0.18 : 0;
            if (Math.random() < (CPU_RETURN[D.id] || 0.66) - far - hard) send(B.tgt);
            else {
              winners++; cheer = 1.6;
              env.award(2, z.cx, v.H * 0.35); popup(z.cx, v.H * 0.42, "위너!", { size: v.U * 0.075, color: "#fff", stroke: "#e0306a", life: 1.1 }); sfx.fever(); point(true);
            }
          }
        }
      },
      draw(ctx) {
        // 카메라: 내 캐릭터 뒤 위쪽에서 상대 코트를 봄
        const cx = B && B.dir === 1 && !B.swung ? (myX + B.spot) / 2 : myX;   // 내 캐릭터와 가야 할 자리가 함께 보이게
        camX += (cx - camX) * 0.12;
        camera.position.set(camX * 0.75, 4.3, L + 7.2); camera.lookAt(camX * 0.55, 0, 4);   // 발밑 점선 자리까지 보이게
        st.draw(ctx);
        const U = v.U;
        // 점수판 (위쪽 가운데)
        const bw = Math.min(z.w * 0.86, U * 0.7), bx = z.cx - bw / 2, by = v.H * 0.11, bh = U * 0.075;
        ctx.fillStyle = "rgba(10,30,70,.82)"; rr(ctx, bx, by, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, `게임 ${gMe}:${gCpu}  ·  ${score()}`, z.cx, by + bh / 2, Math.min(U * 0.038, z.w / 15), "#fff", "#0a1e46", 3);
        if (B && B.dir === 1 && !B.swung) {
          // 어디로 얼마나: 가야 할 자리 위에 방향·거리 표시
          const d = B.spot - myX, ok = near();
          const txt = moveText(d, ok);
          outlinedText(ctx, txt, z.cx, v.H * 0.25, Math.min(U * 0.05, z.w / 12), "#fff", ok ? "#2f8f2f" : "#c07800", 4);   // 점수판 바로 아래
          if (ok && B.t / B.T > 0.45) outlinedText(ctx, "휘둘러요!", z.cx, v.H * 0.86, U * 0.05, "#fff", "#2f8f2f", 4);
        }
      },
      stop() { st.dispose(); },
      result: () => `받아친 공 ${returns} · 위너 ${winners} · 게임 ${gMe}:${gCpu}`,
      // 설명 시연용
      get ball() { return B ? { incoming: B.dir === 1, k: B.t / B.T, moveTo: B.dir === 1 ? toScreenX(B.spot) : null, near: near() } : null; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.walk = 1.6;
      if (T < 4.5) say("테니스! 몸을 좌우로 움직이면 캐릭터도 따라 움직여요");
      else if (T < 9) say("공이 오면 점선 자리로 가서, 공이 왔을 때 팔을 크게 휘둘러요");
      else if (T < 13.5) say("상대가 못 받으면 위너! 우리 편 점수예요");
      else say("이제 직접 해 봐요!");
      const b = g.ball, u = p.u, s = p.pts && p.pts[12];
      if (b && b.incoming) p.tcx = b.moveTo;                             // 점선 자리로 걸어감
      if (!b || !b.incoming || !s || !b.near) { p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }
      p.rest(0, "guard", 1);
      if (b.k < 0.9) p.reach(1, s.x + 1.6 * u, s.y + 0.2 * u, 1.6);    // 라켓 뒤로 빼기
      else p.reach(1, s.x - 1.8 * u, s.y - 0.2 * u, 3);                // 앞으로 휘두르기
    },
  },
};
