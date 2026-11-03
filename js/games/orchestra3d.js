// 지휘자 게임 아래쪽 무대의 3D 오케스트라 악단
// 화면 아래 띠(band)에만 투명 배경으로 그려서, 위쪽의 카메라 화면(지휘하는 내 모습)은 그대로 보임
// 6개 파트: 0 바이올린 · 1 트럼펫 · 2 클라리넷 · 3 팀파니 · 4 첼로 · 5 호른 (지휘자 게임의 SECTIONS 순서와 같음)
// 박에 맞춰 연주 동작, 지휘를 잘할수록(energy) 크게, 왼손 터치로 부른 파트는 조명을 받고 신나게 연주
import { stage, THREE, box, cyl, ball, mesh, randomAvatar } from "./sport/kit3d.js?v=51";

const WOOD = "#8a4b22", GOLD = "#e8b923", BLACK = "#222222", COPPER = "#c06a2b";
// 파트 자리: 줄(0 앞 ~ 2 뒤), 부채꼴 각도(도, 왼쪽 -), 사람 수
const LAYOUT = [
  { kind: "violin", row: 0, a0: -75, a1: -28, n: 4 },
  { kind: "trumpet", row: 2, a0: -55, a1: -30, n: 2 },
  { kind: "clarinet", row: 1, a0: -45, a1: -10, n: 3 },
  { kind: "timpani", row: 2, a0: 8, a1: 22, n: 1 },
  { kind: "cello", row: 0, a0: 28, a1: 75, n: 3 },
  { kind: "horn", row: 1, a0: 10, a1: 45, n: 3 },
];
const ROW_R = [3.2, 4.5, 5.7];

function instrument(kind, av) {
  const g = new THREE.Group();
  if (kind === "violin") {
    const v = box(0.13, 0.05, 0.36, WOOD); v.position.set(0.16, 1.37, 0.16); v.rotation.set(0.3, 0.5, 0.2); g.add(v);
    const bow = cyl(0.008, 0.008, 0.62, "#d9c7a3"); bow.rotation.z = Math.PI / 2; av.hold(1, bow); bow.position.y = -0.02;
  } else if (kind === "cello") {
    const c = box(0.36, 0.8, 0.16, WOOD); c.position.set(0, 0.62, 0.38); g.add(c);
    const neck = cyl(0.025, 0.025, 0.5, BLACK); neck.position.set(0, 1.2, 0.38); g.add(neck);
    const bow = cyl(0.008, 0.008, 0.7, "#d9c7a3"); bow.rotation.z = Math.PI / 2; av.hold(1, bow);
  } else if (kind === "trumpet") {
    const t = cyl(0.03, 0.03, 0.42, GOLD, { metal: 0.6, rough: 0.3 }); t.rotation.x = Math.PI / 2; t.position.set(0, 1.5, 0.42); g.add(t);
    const bell = mesh(new THREE.ConeGeometry(0.09, 0.14, 20, 1, true), GOLD, { metal: 0.6, rough: 0.3 }); bell.rotation.x = -Math.PI / 2; bell.position.set(0, 1.5, 0.68); g.add(bell);
  } else if (kind === "clarinet") {
    const c = cyl(0.025, 0.035, 0.6, BLACK); c.position.set(0, 1.27, 0.3); c.rotation.x = 0.5; g.add(c);
  } else if (kind === "horn") {
    const h = mesh(new THREE.TorusGeometry(0.15, 0.035, 10, 28), GOLD, { metal: 0.6, rough: 0.3 }); h.position.set(0.12, 1.2, 0.25); h.rotation.y = 0.9; g.add(h);
  } else if (kind === "timpani") {
    [-0.42, 0.42].forEach(x => {
      const d = mesh(new THREE.SphereGeometry(0.34, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), COPPER, { metal: 0.5, rough: 0.35 });
      d.position.set(x, 0.85, 0.55); g.add(d);
      const head = cyl(0.34, 0.34, 0.02, "#f3ead6"); head.position.set(x, 0.86, 0.55); g.add(head);
    });
    [0, 1].forEach(k => { const m = cyl(0.012, 0.012, 0.4, "#5a3a1a"); const tip = ball(0.04, "#f3ead6"); tip.position.y = -0.2; m.add(tip); av.hold(k, m); m.position.y = -0.15; });
  }
  return g;
}

export function orchestra(env) {
  // 가볍게: 그림자 없음, 두 장면에 한 번만 새로 그림(지휘 판정이 느려지지 않게)
  const st = stage(env, { fov: 30, band: [0.6, 1], pip: false, shadows: false, every: 2, smooth: false });
  const { scene, camera } = st;
  // 무대: 반원 나무 바닥과 뒤쪽 계단(단)
  // 무대: 단원들 아래만 덮는 부채꼴 나무 바닥 (뒤로 갈수록 한 단씩 높게), 앞 가장자리에 금빛 띠
  const fan = (r0, r1, y, color) => { const g = new THREE.RingGeometry(r0, r1, 48, 1, Math.PI * 0.5 - 1.5, 3.0); const m = mesh(g, color, { receive: true, cast: false, rough: 0.55 }); m.rotation.x = -Math.PI / 2; m.position.set(0, y, 1.2); scene.add(m); };
  fan(2.4, 3.9, 0.01, "#a86c38"); fan(3.9, 5.1, 0.25, "#9a6232"); fan(5.1, 6.4, 0.5, "#8c582c");
  const edge = mesh(new THREE.TorusGeometry(2.4, 0.03, 6, 48, 3.0), "#ffd27a", { glow: 0x553300, cast: false }); edge.rotation.x = Math.PI / 2; edge.rotation.z = -Math.PI * 0.5 - 1.5; edge.position.set(0, 0.02, 1.2); scene.add(edge);
  const players = [];
  LAYOUT.forEach((L, si) => {
    for (let i = 0; i < L.n; i++) {
      const a = (L.n === 1 ? (L.a0 + L.a1) / 2 : L.a0 + (L.a1 - L.a0) * i / (L.n - 1)) * Math.PI / 180, r = ROW_R[L.row];
      const av = randomAvatar(si * 5 + i); av.scale.setScalar(0.85);
      av.position.set(Math.sin(a) * r, 0.25 * L.row, -Math.cos(a) * r + 1.2); av.rotation.y = -a * 0.7;
      av.add(instrument(L.kind, av)); scene.add(av);
      players.push({ av, si, kind: L.kind, ph: (si * 7 + i * 3) % 5 * 0.13 });
    }
  });
  // 파트 조명(왼손 터치로 부른 파트)
  const spot = new THREE.SpotLight(0xfff0b0, 0, 14, 0.32, 0.5); spot.position.set(0, 7, 3); scene.add(spot, spot.target);
  const center = si => { const P = players.filter(p => p.si === si); const c = new THREE.Vector3(); P.forEach(p => c.add(p.av.position)); return c.multiplyScalar(1 / P.length); };
  let hl = -1, hlT = 0;
  return {
    // t: 시각(초), ph: 박 안의 위치(0~1), energy: 관객 호응(0~1), dt
    update(t, ph, energy, dt) {
      const amp = 0.25 + 0.75 * energy, beat = Math.max(0, 1 - ph * 2.5);
      hlT = Math.max(0, hlT - dt);
      for (const p of players) {
        const { av, kind } = p, hot = p.si === hl && hlT > 0, k = (hot ? 1.6 : 1) * amp, s = Math.sin((t + p.ph) * Math.PI * 2 / 1.1);
        av.position.y = 0.25 * LAYOUT[p.si].row + beat * 0.05 * k + (hot ? Math.abs(s) * 0.08 : 0);
        av.body.rotation.z = s * 0.05 * k;
        if (kind === "violin") { av.arm(0, 1.0, 1.1, 1.8); av.arm(1, 0.5 + 0.35 * s * k, 0.9, 1.0); }
        else if (kind === "cello") { av.arm(0, 0.3, 0.9, 1.2); av.arm(1, 0.7 + 0.4 * s * k, 0.8, 0.6); }
        else if (kind === "trumpet" || kind === "clarinet") { av.arm(0, 0.25, 1.2, 1.9); av.arm(1, 0.25, 1.2, 1.9); av.headG.rotation.x = -0.1 - beat * 0.08 * k; }
        else if (kind === "horn") { av.arm(0, 0.4, 0.9, 1.7); av.arm(1, 0.2, 0.9, 1.5); }
        else if (kind === "timpani") { const hit = Math.max(0, Math.sin(t * Math.PI * 2 / 0.55)); av.arm(0, 0.5, 0.6 + hit * 0.7 * k, 0.6); av.arm(1, 0.5, 0.6 + (1 - hit) * 0.7 * k, 0.6); }
      }
      spot.intensity += ((hlT > 0 ? 60 : 0) - spot.intensity) * Math.min(1, dt * 6);
    },
    // 왼손 터치로 그 파트를 부름: 조명 + 신나게
    call(si, sec = 3) { hl = si % LAYOUT.length; hlT = sec; spot.target.position.copy(center(hl)); spot.position.set(spot.target.position.x * 0.6, 7, 3); },
    // 파트 가운데의 화면 좌표 (조명 빛줄기·글자용)
    sectionAt(si) { return st.toScreen(center(si % LAYOUT.length).add(new THREE.Vector3(0, 1.4, 0))); },
    draw(ctx) {
      // 구역이 좁으면(2인) 뒤로 물러나 악단 전체가 들어오게
      const z = env.zone, aspect = z.w / (env.view.H * 0.4), half = Math.tan(15 * Math.PI / 180);
      const dist = Math.max(5.2, 6.2 / (aspect * half));
      camera.position.set(0, 1.9 + dist * 0.16, 1.2 + dist); camera.lookAt(0, 1.0, -1.6);
      st.draw(ctx);
    },
    dispose() { st.dispose(); },
    get stage() { return st; },   // 점검용
  };
}
