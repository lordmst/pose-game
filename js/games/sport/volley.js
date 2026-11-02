// 배구 (스포츠 리조트처럼 3D 비치발리볼 2:2): 내 캐릭터 뒤에서 코트를 봄
// 리시브(두 손 모아 아래로) → 같은 편 토스 → 스파이크(높이 들었다 세게 내려치기) → 상대가 받아 공격하면 블로킹(두 손 번쩍)
// 몸을 좌우로 움직이면 캐릭터도 좌우로 움직임(앞뒤는 저절로). 공이 오면 가야 할 자리를 점선으로 안내, 그 자리에서만 받기·때리기·막기 가능
// 블로킹을 못 하면 상대 스파이크가 내 쪽으로 와서 다시 리시브
import { burst, popup, shake, outlinedText, rr, clamp } from "../../fx.js?v=42";
import { sfx } from "../../audio.js?v=42";
import { stage, THREE, ground, sea, box, cyl, mesh, palm, cloud, playerAvatar, randomAvatar, bodyMover, moveGuide, moveText } from "./kit3d.js?v=42";

const SERVE = 1.6;     // 상대 서브가 나에게 오는 시간(초, 보통)
const SPIKE = 3.0;     // 스파이크로 인정하는 손 속도(어깨너비/초, 아래 방향)
const CPU_DIG = { easy: 0.2, normal: 0.32, hard: 0.45 };   // 상대가 스파이크를 받아낼 확률
const L = 8, HW = 4, NET = 2.24;                            // 코트 반 길이·반 너비, 네트 높이(m)
const RECV_Z = 5.6, NET_Z = 0.9;                            // 내 캐릭터 리시브 자리·네트 앞 자리
const COURT_X = HW - 0.6;   // 내 캐릭터가 움직일 수 있는 좌우 범위(m)
const REACH = 0.8;          // 표시한 자리에서 이만큼(m) 안에 있으면 받기·때리기·막기 가능

const arc = (a, b, h, u) => new THREE.Vector3(a.x + (b.x - a.x) * u, Math.max(0.15, a.y + (b.y - a.y) * u + 4 * h * u * (1 - u)), a.z + (b.z - a.z) * u);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 비치볼 무늬
function ballTex() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  ["#ffd43b", "#ffffff", "#1c7ed6", "#ffffff", "#ffd43b", "#ffffff", "#1c7ed6", "#ffffff"].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 32, 0, 32, 128); });
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function beach(scene) {
  const water = sea(scene, 600, -0.7);                                                   // 물결이 모래 위로 올라오지 않게 낮게
  const sand = cyl(38, 41, 1, "#f1d39a", { receive: true, cast: false }); sand.position.y = -0.5; scene.add(sand);   // 섬
  const line = (w, d, x, z) => { const m = box(w, 0.03, d, "#1c7ed6", { cast: false, receive: true }); m.position.set(x, 0.02, z); scene.add(m); };
  const T = 0.08;
  line(HW * 2, T, 0, L); line(HW * 2, T, 0, -L); line(T, L * 2, -HW, 0); line(T, L * 2, HW, 0);
  // 네트 (기둥 + 그물 + 위아래 띠)
  [-1, 1].forEach(s => { const p = cyl(0.07, 0.07, NET + 0.15, "#e9ecef"); p.position.set(s * (HW + 0.7), (NET + 0.15) / 2, 0); scene.add(p); });
  const net = mesh(new THREE.PlaneGeometry(HW * 2 + 1.4, 1.0), new THREE.MeshStandardMaterial({ color: "#111", transparent: true, opacity: 0.45, side: THREE.DoubleSide }), { cast: false });
  net.position.set(0, NET - 0.5, 0); scene.add(net);
  const top = box(HW * 2 + 1.4, 0.08, 0.04, "#ffffff"); top.position.set(0, NET, 0); scene.add(top);
  const bot = box(HW * 2 + 1.4, 0.05, 0.03, "#ffffff"); bot.position.set(0, NET - 1.0, 0); scene.add(bot);
  // 야자수·파라솔·구름 (리조트 섬 해변)
  for (let i = 0; i < 12; i++) { const s = i % 2 ? 1 : -1; scene.add(palm(s * (HW + 6 + (i % 3) * 3), -L - 4 + i * 2.6, 1.1 + (i % 3) * 0.25)); }
  ["#ff6b6b", "#ffd43b", "#4dabf7", "#69db7c"].forEach((col, i) => {
    const g = new THREE.Group(), pole = cyl(0.04, 0.04, 2.2, "#ddd"); pole.position.y = 1.1;
    const cone = mesh(new THREE.ConeGeometry(1.3, 0.55, 10), col); cone.position.y = 2.3; g.add(pole, cone);
    g.position.set((i % 2 ? 1 : -1) * (HW + 3.2), 0, -L + 2 + i * 4.5); scene.add(g);
  });
  for (let i = 0; i < 6; i++) scene.add(cloud(-50 + i * 20, 16 + (i % 3) * 3, -80 - (i % 2) * 20, 3 + (i % 2)));
  return water;
}

export default {
  id: "volley", title: "배구", icon: "🏐", sec: 60, cursor: "", cat: "sport", bg: "#a1c4fd", desc: "리시브·스파이크·블로킹", scene3d: true,
  how: "몸을 좌우로 움직여 점선 자리로 가요. 공이 오면 두 손 모아 아래에서 받고(리시브), 같은 편이 올려 주면 높이 들었다 내려쳐요(스파이크)! 상대 공격엔 두 손 번쩍(블로킹)",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const st = stage(env, { fov: 50, sky: ["#4fb0f2", "#dff4ff"], shadowSize: 16 });
    const { scene, camera } = st;
    const water = beach(scene);
    const me = playerAvatar(env); me.scale.setScalar(1.25); me.rotation.y = Math.PI; me.position.set(0, 0, RECV_Z); scene.add(me);
    const mate = randomAvatar(2); mate.scale.setScalar(1.25); mate.rotation.y = Math.PI; mate.position.set(-1.6, 0, 2.4); scene.add(mate);
    const opp = [randomAvatar(1), randomAvatar(4)];   // 0: 뒤(서브·수비), 1: 네트 앞(토스·공격)
    opp.forEach((o, i) => { o.scale.setScalar(1.25); o.position.set(i ? 1.2 : -0.5, 0, i ? -2.2 : -5.8); scene.add(o); });
    const vb = mesh(new THREE.SphereGeometry(0.17, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex(), roughness: 0.5 })); scene.add(vb);
    const shadow = mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }), { cast: false }); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    const ring = mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), { cast: false }); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; scene.add(ring);
    vb.visible = shadow.visible = ring.visible = false;
    const mover = bodyMover(env, COURT_X), guideM = moveGuide(scene);
    let myX = 0, whiff = false, camX = 0;
    const GUIDE = { recv: 1, spike: 1, oppSpike: 1, toMate: 1, oppSet: 1 };   // 이 단계에서는 가야 할 자리를 보여 줌
    const near = () => Math.abs(myX - goal.x) <= REACH * D.reach;
    // 공이 갈 좌우 자리: 지금 자리에서 lo~hi(m) 떨어진 곳
    const spotFrom = (lo, hi) => { let s = Math.random() < 0.5 ? -1 : 1; if (Math.abs(myX + s * (lo + hi) / 2) > COURT_X) s = -s; return clamp(myX + s * (lo + Math.random() * (hi - lo)), -COURT_X, COURT_X); };
    function tooFar() { if (whiff) return; whiff = true; popup(z.cx, v.H * 0.62, "닿지 않아요! 점선 자리로", { size: v.U * 0.04, color: "#fff", stroke: "#d07a00", life: 0.9 }); }

    let ph = "wait", wait = 1.3, B = null, sMe = 0, sCpu = 0, sets = [0, 0], recv = 0, spikes = 0, blocks = 0, pts = 0, t = 0;
    let goal = { x: 0, z: RECV_Z }, act = null, mateAct = 9, oppJump = [9, 9];
    const fly = (p0, p1, h, T) => { B = { p0, p1, h, t: 0, T }; vb.visible = shadow.visible = true; };
    const at = () => { const k = B.t / B.T; return { k, p: arc(B.p0, B.p1, B.h, k) }; };
    const scr = p => st.toScreen(p);
    function serve(from = opp[0], fast = false) {   // 상대가 공을 넘김 → 내 리시브 자리
      const rx = fast ? spotFrom(0.2, 0.9) : spotFrom(1.0, 3.0);     // 빠른 공은 가까이
      const p0 = from.position.clone().add(V(0.3, fast ? 3.0 : 2.6, 0.3));
      fly(p0, V(rx, 0.85, RECV_Z - 0.1), fast ? 0.4 : 3.0, (fast ? 0.95 : SERVE * (1 - 0.2 * env.progress())) / D.speed);
      B.rx = rx; goal = { x: rx, z: RECV_Z }; ph = "recv"; whiff = false; sfx.whoosh();
      oppJump[opp.indexOf(from)] = 0;
    }
    function point(mine) {
      if (mine) sMe++; else sCpu++;
      if ((sMe >= 15 || sCpu >= 15) && Math.abs(sMe - sCpu) >= 2) {
        const won = sMe > sCpu; sets[won ? 0 : 1]++; sMe = sCpu = 0;
        if (won) { sfx.fanfare(); env.award(3, z.cx, v.H * 0.4); popup(z.cx, v.H * 0.5, "세트 승리!", { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.3 }); }
        else popup(z.cx, v.H * 0.5, "상대 세트", { size: v.U * 0.05, color: "#eee", stroke: "#555" });
      }
      B = null; ph = "wait"; wait = 1.5; goal = { x: myX, z: RECV_Z }; vb.visible = shadow.visible = ring.visible = false;
    }
    function body() {
      const p = env.tracker.pts;
      if (p && p[11].v && p[12].v) { const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y); return { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2, sw: Math.max(sw, v.U * 0.08) }; }
      return { x: z.cx, y: v.H * 0.45, sw: v.U * 0.13 };
    }
    // 내 캐릭터 동작 (리시브 팔 모으기 · 스파이크 점프 · 블로킹 점프)
    function animMe(dt) {
      if (act) { act.t += dt; if (act.t > 0.75) act = null; }
      const jump = act && act.k !== "recv" ? Math.sin(Math.min(1, act.t / 0.75) * Math.PI) * 0.9 : 0;
      me.position.y = jump;
      if (act && act.k === "recv") { me.body.rotation.x = 0.25; me.arm(0, 0.15, 1.0, 0); me.arm(1, 0.15, 1.0, 0); return; }
      me.body.rotation.x *= 0.85;
      if (act && act.k === "spike") { const u = Math.min(1, act.t / 0.22); me.arm(1, 2.9 - 1.7 * u, 0.2 + 1.3 * u, 0.2); me.arm(0, 2.3, 0.4, 0.3); return; }
      if (act && act.k === "block") { me.arm(0, 2.95, 0.25, 0); me.arm(1, 2.95, 0.25, 0); return; }
      if (ph === "recv" && B && B.t / B.T > 0.45) { me.arm(0, 0.15, 0.8, 0); me.arm(1, 0.15, 0.8, 0); return; }   // 받을 준비
      if (ph === "spike" && B && B.t / B.T > 0.4) { me.arm(1, 2.9, 0.2, 0.2); me.arm(0, 2.3, 0.3, 0.3); return; }  // 손 높이
      me.mimic(env.tracker.pts, true);
    }
    return {
      update(dt) {
        t += dt; mateAct += dt; oppJump = oppJump.map(x => x + dt);
        water.update(t);
        myX = mover.follow(myX, dt); me.position.x = myX;                       // 좌우는 내 몸으로
        me.position.z += (goal.z - me.position.z) * Math.min(1, dt * 4.5);      // 앞뒤는 저절로
        const guide = !!GUIDE[ph];
        if (guide) guideM.show(myX, goal.x, me.position.z, near(), t); else guideM.hide();
        st.pipMark = guide ? { x: mover.toScreenX(goal.x), ok: near() } : null;
        animMe(dt); me.idle(t);
        // 같은 편: 토스할 때 두 손 위로
        if (mateAct < 0.5) { mate.arm(0, 2.8, 0.3, 0.5); mate.arm(1, 2.8, 0.3, 0.5); } else { mate.arm(0, 0.4, 0.6, 0.8); mate.arm(1, 0.4, 0.6, 0.8); }
        mate.idle(t + 1);
        opp.forEach((o, i) => {
          const j = oppJump[i]; o.position.y = j < 0.7 ? Math.sin(j / 0.7 * Math.PI) * 0.8 : 0;
          if (j < 0.6) { o.arm(1, 2.4 - j * 2, 0.6 + j, 0.2); o.arm(0, 2.6, 0.3, 0.3); } else { o.arm(0, 0.35, 0.7, 0.8); o.arm(1, 0.35, 0.7, 0.8); o.idle(t + i * 2); }
        });
        if (ph === "wait") { wait -= dt; if (wait <= 0) serve(); return; }
        B.t += dt;
        const { k, p } = at();
        vb.position.copy(p); vb.rotation.x += dt * 6; vb.rotation.z += dt * 3; shadow.position.set(p.x, 0.04, p.z);
        ring.visible = ph === "recv"; if (ring.visible) { ring.position.x = B.p1.x; ring.position.z = B.p1.z; ring.scale.setScalar(1 + Math.sin(t * 8) * 0.08); }
        const P = env.tracker.pts, b = body(), hands = env.tracker.hands;
        if (ph === "recv") {
          // 리시브: 두 손목이 붙어 있고 가슴보다 아래
          if (k > 0.72 && k < 1.18 && P && P[15].v && P[16].v) {
            const close = Math.hypot(P[15].x - P[16].x, P[15].y - P[16].y) < b.sw * 0.9 / Math.max(0.8, D.reach);
            const low = P[15].y > b.y + b.sw * 0.25 && P[16].y > b.y + b.sw * 0.25;
            if (close && low && !near()) tooFar();
            if (close && low && near()) {
              recv++; sfx.bonk(); act = { k: "recv", t: 0 };
              const s = scr(p); env.award(1, s.x, s.y - v.U * 0.08);
              popup(s.x, s.y + v.U * 0.06, "리시브!", { size: v.U * 0.045, color: "#fff", stroke: "#2f6fd1", life: 0.8 });
              burst(s.x, s.y, { n: 10, colors: ["#ffffff", "#ffd400"], shape: "star", speed: v.U * 0.4, gravity: v.U * 0.4, size: v.U * 0.014, life: 0.5 });
              fly(p.clone(), mate.position.clone().add(V(0, 2.5, -0.2)), 1.8, 0.85); ph = "toMate";
              const sx = spotFrom(0.8, 2.4); B.sx = sx; goal = { x: sx, z: NET_Z + 0.5 }; whiff = false;   // 공격하러 네트 쪽으로 (좌우 자리는 직접 옮김)
              return;
            }
          }
          if (k >= 1.18) { sfx.thud(); env.miss(z.cx, v.H * 0.75, "못 받았어요"); point(false); }
        } else if (ph === "toMate" && k >= 1) {   // 같은 편이 토스
          const sx = B.sx; mateAct = 0; sfx.pop();
          const s = scr(p); popup(s.x, s.y - v.U * 0.06, "토스!", { size: v.U * 0.035, color: "#fff", stroke: "#555", life: 0.6 });
          fly(p.clone(), V(sx, 3.0, NET_Z + 0.25), 1.5, 1.05 / Math.min(1.2, D.speed)); ph = "spike";
        } else if (ph === "spike") {
          // 스파이크: 손이 위에서 아래로 빠르게
          if (k > 0.68 && k < 1.3) {
            const h = hands.find(h => h.vis && h.vy > 0 && h.bodySpeed >= SPIKE * D.punch && h.y < b.y + b.sw * 0.8);
            if (h && !near()) tooFar();
            if (h && near()) {
              spikes++; sfx.hit(3); shake(v.U * 0.014, 0.2); act = { k: "spike", t: 0.1 };
              const s = scr(p); env.award(2, s.x, s.y - v.U * 0.06);
              popup(s.x, s.y + v.U * 0.07, "스파이크!", { size: v.U * 0.055, color: "#fff", stroke: "#e0306a", life: 0.9 });
              burst(s.x, s.y, { n: 22, colors: ["#ffffff", "#ffd400", "#ff7aa2"], shape: "star", speed: v.U * 0.8, gravity: v.U * 0.4, size: v.U * 0.018, life: 0.6 });
              const aim = clamp((h.vx / (h.speed || 1)) * 3 + (Math.random() - 0.5) * 3, -HW + 0.5, HW - 0.5);
              fly(p.clone(), V(aim, 0.15, -3.5 - Math.random() * 3.5), 0.05, 0.5); B.aim = aim; ph = "attack"; return;
            }
          }
          if (k >= 1.3) { sfx.thud(); env.miss(z.cx, v.H * 0.75, "놓쳤어요"); point(false); }
        } else if (ph === "attack") {
          opp[0].position.x += (B.aim - opp[0].position.x) * Math.min(1, dt * 2);   // 상대가 공 쪽으로 몸을 날림
          if (k >= 1) {
            if (Math.random() < (CPU_DIG[D.id] || 0.32)) {
              const s = scr(p); popup(s.x, s.y - v.U * 0.05, "상대가 받았어요", { size: v.U * 0.035, color: "#fff", stroke: "#555" });
              fly(p.clone().setY(0.6), opp[1].position.clone().add(V(0, 2.5, 0.2)), 1.8, 0.85); ph = "oppSet";
            } else {
              pts++; sfx.fever(); env.award(1, z.cx, v.H * 0.35);
              popup(z.cx, v.H * 0.42, "득점!", { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.0 }); point(true);
            }
          }
        } else if (ph === "oppSet" && k >= 1) {     // 상대 토스 → 상대 공격 준비. 나는 네트 앞에서 블로킹 준비
          const bx = spotFrom(0.8, 2.4); whiff = false;
          fly(p.clone(), V(bx, 3.0, -NET_Z), 1.4, 1.05 / Math.min(1.2, D.speed)); ph = "oppSpike"; B.bx = bx; goal = { x: bx, z: NET_Z };
          oppJump[1] = 9;
        } else if (ph === "oppSpike") {
          opp[1].position.x += (B.bx - opp[1].position.x) * Math.min(1, dt * 3);
          // 블로킹: 두 손목이 코보다 위
          const up = k > 0.6 && k < 1.05 && P && P[0].v && P[15].v && P[16].v && P[15].y < P[0].y && P[16].y < P[0].y;
          if (up && !near()) tooFar();
          if (up && near()) {
            blocks++; sfx.hit(3); shake(v.U * 0.012, 0.2); act = { k: "block", t: 0.1 };
            const s = scr(p); env.award(2, s.x, s.y - v.U * 0.06);
            popup(s.x, s.y + v.U * 0.07, "블로킹!", { size: v.U * 0.06, color: "#fff", stroke: "#f08c00", life: 1.0 });
            burst(s.x, s.y, { n: 18, colors: ["#ffffff", "#ffd400"], shape: "star", speed: v.U * 0.7, gravity: v.U * 0.4, size: v.U * 0.016, life: 0.6 });
            fly(p.clone(), V(p.x + (Math.random() - 0.5), 0.15, -1.6), 0.2, 0.4); ph = "blocked"; return;
          }
          if (k >= 1.05) { oppJump[1] = 0.15; sfx.hit(1); serve(opp[1], true); }   // 상대 스파이크 → 내가 리시브
        } else if (ph === "blocked" && k >= 1) {
          pts++; sfx.fever(); popup(z.cx, v.H * 0.42, "득점!", { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.0 }); point(true);
        }
      },
      draw(ctx) {
        // 카메라: 내 캐릭터 뒤 위쪽에서 상대 코트를 봄
        const mz = me.position.z, mx = GUIDE[ph] ? (me.position.x + goal.x) / 2 : me.position.x;   // 내 캐릭터와 가야 할 자리가 함께 보이게
        camX += (mx - camX) * 0.12;
        camera.position.set(camX * 0.8, 4.0, mz + 7.2); camera.lookAt(camX * 0.6, 1.5, mz - 7);
        st.draw(ctx);
        const U = v.U;
        const bw = Math.min(z.w * 0.86, U * 0.7), by = v.H * 0.11, bh = U * 0.075;
        ctx.fillStyle = "rgba(10,30,80,.82)"; rr(ctx, z.cx - bw / 2, by, bw, bh, U * 0.02); ctx.fill();
        outlinedText(ctx, `우리 ${sMe} - ${sCpu} 상대  ·  세트 ${sets[0]}:${sets[1]}`, z.cx, by + bh / 2, Math.min(U * 0.038, z.w / 15), "#fff", "#0a1e46", 3);
        // 해야 할 동작 안내
        const k = B ? B.t / B.T : 0, fs = Math.min(U * 0.045, z.w / 13), py = v.H * 0.27;
        if (GUIDE[ph] && !near()) outlinedText(ctx, moveText(goal.x - myX, false), z.cx, py, fs, "#fff", "#c07800", 4);   // 어디로 얼마나
        else if (ph === "recv" && k > 0.25) outlinedText(ctx, "리시브! 두 손 모아 아래로", z.cx, py, fs, "#fff", "#2f6fd1", 4);
        else if (ph === "spike") outlinedText(ctx, "스파이크! 높이 들었다 내려치기", z.cx, py, fs, "#fff", "#e0306a", 4);
        else if (ph === "oppSpike") outlinedText(ctx, "블로킹! 두 손 번쩍", z.cx, py, fs, "#fff", "#f08c00", 4);
      },
      stop() { st.dispose(); },
      result: () => `리시브 ${recv} · 스파이크 ${spikes} · 블로킹 ${blocks} · 득점 ${pts} · 세트 ${sets[0]}:${sets[1]}`,
      get phase() { return ph; },
      get ball() { return B ? { k: B.t / B.T } : null; },
      get moveTo() { return GUIDE[ph] ? mover.toScreenX(goal.x) : null; },
      get near() { return near(); },
    };
  },
  demo: {
    dur: 17,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.walk = 1.6;
      const ph = g.phase, b = g.ball, u = p.u, s = p.pts && p.pts[12];
      if (g.moveTo != null) p.tcx = g.moveTo;                                     // 점선 자리로 걸어감
      if (T > 15.5) say("이제 직접 해 봐요!");
      else if (ph === "recv") say("공이 오면 두 손 모아 아래에서 받아요. 리시브!");
      else if (ph === "toMate" || ph === "spike") say("같은 편이 올려 주면 높이 들었다 세게 내려쳐요. 스파이크!");
      else if (ph === "oppSet" || ph === "oppSpike") say("상대가 공격하려 하면 두 손 번쩍! 블로킹");
      else if (T < 3) say("배구! 몸을 좌우로 움직여 점선 자리로 가요");
      if (!g.near) { S.j = 0; p.rest(0, "guard", 1); p.rest(1, "guard", 1); return; }   // 자리 잡을 때까지
      if (ph === "recv" && b && b.k > 0.55) { p.rest(0, "clap", 2); p.rest(1, "clap", 2); return; }
      if (ph === "oppSpike" && b && b.k > 0.5) { p.rest(0, "up", 2); p.rest(1, "up", 2); return; }
      if (ph === "spike" && b && s) {
        p.rest(0, "guard", 1);
        if (b.k < 0.85) p.reach(1, s.x, s.y - 2.2 * u, 2.2);                     // 손을 높이
        else { p.reach(1, s.x - 0.3 * u, s.y + 0.5 * u, 3.5); if (!S.j) { p.jump(); S.j = 1; } }   // 아래로 내려치기
        return;
      }
      S.j = 0; p.rest(0, "guard", 1); p.rest(1, "guard", 1);
    },
  },
};
