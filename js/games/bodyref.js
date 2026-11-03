// 선수 키에 맞춘 화면 높이: 어깨 높이(sh)와 몸통 길이(T, 어깨~엉덩이)를 천천히 따라감
// y(k): 어깨에서 몸통 길이의 k배 아래 (k=0 어깨, k=1 엉덩이, k<0 머리 쪽). 작은 아이는 낮게, 어른은 높게 나옴
// 처음 한 번은 바로 맞추고, 그 뒤는 1초 남짓에 걸쳐 따라가서 목표물이 흔들리지 않음
export function bodyRef(env) {
  const v = env.view, F = { sh: v.H * 0.4, T: v.H * 0.3, n: 0 };
  const read = () => {
    const P = env.tracker && env.tracker.pts;
    if (!P || !P[11] || !P[12] || !P[11].v || !P[12].v) return null;
    const sw = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y), sh = (P[11].y + P[12].y) / 2;
    const T = P[23] && P[24] && P[23].v && P[24].v ? (P[23].y + P[24].y) / 2 - sh : sw * 1.3;   // 엉덩이가 안 보이면 어깨너비로 짐작
    return { sh, T: Math.max(sw * 0.9, Math.min(sw * 2.0, T)) };
  };
  const R = {
    update(dt) {
      const r = read(); if (!r) return;
      const k = F.n < 3 ? 1 : Math.min(1, dt / 1.2);
      F.sh += (r.sh - F.sh) * k; F.T += (r.T - F.T) * k; F.n++;
    },
    // minT: 목표물이 겹치지 않게 몸통 길이를 이보다 작게 보지 않음 (멀리 선 아이)
    y(k, minT = 0) { const T = Math.max(F.T, minT); return Math.max(v.H * 0.2, Math.min(v.H * 0.89, F.sh + k * T)); },
    get sh() { return F.sh; }, get T() { return F.T; }, get ok() { return F.n > 0; },
  };
  R.update(1);
  return R;
}
