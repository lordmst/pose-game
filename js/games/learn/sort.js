// 분류 바구니: 위에서 천천히 떨어지는 그림(글자) 카드를 맞는 바구니에 넣기
// 카드는 내 몸(어깨 가운데)을 따라 좌우로 움직임 → 왼쪽·오른쪽 바구니 중 맞는 쪽으로 몸을 옮기면 그 바구니에 쏙
// 6장마다 분류 주제가 바뀜 (과일·채소, 바다·땅 동물, 짝수·홀수, 자음·모음, 하늘·땅 탈것, 먹는 것·못 먹는 것)
import { burst, popup, outlinedText, rr, shuffle, clamp, FONT } from "../../fx.js?v=72";
import { sfx } from "../../audio.js?v=72";

const PER_PAIR = 6;     // 주제 하나에 카드 몇 장
const FALL = 4.6;       // 카드가 떨어지는 시간(초, 보통·처음)
const GAIN = 1.6;       // 몸이 옮긴 거리의 몇 배로 카드가 움직이나 (조금만 움직여도 되게)
const TOP = 0.27, LINE = 0.72;   // 카드가 나오는 높이·바구니 입구 높이 (화면 높이 비율)

const it = (t, name, text) => ({ t, name, text: !!text });
const PAIRS = [
  { a: { icon: "🍎", name: "과일" }, b: { icon: "🥕", name: "채소" },
    A: [it("🍎", "사과"), it("🍌", "바나나"), it("🍇", "포도"), it("🍓", "딸기"), it("🍉", "수박"), it("🍊", "귤"), it("🍑", "복숭아")],
    B: [it("🥕", "당근"), it("🥦", "브로콜리"), it("🥒", "오이"), it("🌽", "옥수수"), it("🧅", "양파"), it("🍆", "가지"), it("🥬", "배추")] },
  { a: { icon: "🐟", name: "바다 동물" }, b: { icon: "🐶", name: "땅 동물" },
    A: [it("🐟", "물고기"), it("🐙", "문어"), it("🦀", "게"), it("🐬", "돌고래"), it("🐳", "고래"), it("🦈", "상어"), it("🦑", "오징어")],
    B: [it("🐶", "강아지"), it("🐱", "고양이"), it("🐰", "토끼"), it("🐘", "코끼리"), it("🦁", "사자"), it("🐄", "소"), it("🐷", "돼지")] },
  { a: { icon: "2", name: "짝수" }, b: { icon: "1", name: "홀수" }, num: true,
    A: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map(n => it(String(n), String(n), true)),
    B: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19].map(n => it(String(n), String(n), true)) },
  { a: { icon: "ㄱ", name: "자음" }, b: { icon: "ㅏ", name: "모음" },
    A: [["ㄱ", "기역"], ["ㄴ", "니은"], ["ㄷ", "디귿"], ["ㄹ", "리을"], ["ㅁ", "미음"], ["ㅂ", "비읍"], ["ㅅ", "시옷"], ["ㅇ", "이응"], ["ㅈ", "지읒"], ["ㅎ", "히읗"]].map(([t, n]) => it(t, n, true)),
    B: [["ㅏ", "아"], ["ㅑ", "야"], ["ㅓ", "어"], ["ㅕ", "여"], ["ㅗ", "오"], ["ㅛ", "요"], ["ㅜ", "우"], ["ㅠ", "유"], ["ㅡ", "으"], ["ㅣ", "이"]].map(([t, n]) => it(t, n, true)) },
  { a: { icon: "✈️", name: "하늘 탈것" }, b: { icon: "🚗", name: "땅 탈것" },
    A: [it("✈️", "비행기"), it("🚁", "헬리콥터"), it("🚀", "로켓"), it("🛩️", "경비행기"), it("🪂", "낙하산")],
    B: [it("🚗", "자동차"), it("🚌", "버스"), it("🚲", "자전거"), it("🚒", "소방차"), it("🚂", "기차"), it("🚜", "트랙터")] },
  { a: { icon: "🍽️", name: "먹는 것" }, b: { icon: "🚫", name: "못 먹는 것" },
    A: [it("🍞", "빵"), it("🍚", "밥"), it("🥛", "우유"), it("🍪", "쿠키"), it("🧀", "치즈"), it("🍙", "주먹밥"), it("🥚", "달걀")],
    B: [it("🧸", "곰 인형"), it("✏️", "연필"), it("🧦", "양말"), it("🪨", "돌"), it("🔑", "열쇠"), it("🧽", "스펀지"), it("🖍️", "크레용")] },
];
// 받침 있으면 '은', 없으면 '는' (숫자는 읽는 소리 기준)
const NUM_LAST = { 0: 1, 1: 1, 2: 0, 3: 1, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1, 9: 0 };
function topic(word) {
  const last = word.trim().slice(-1);
  if (/\d/.test(last)) return word + (NUM_LAST[last] ? "은" : "는");
  const c = last.charCodeAt(0) - 0xac00;
  return word + (c >= 0 && c < 11172 && c % 28 ? "은" : "는");
}

// '채소예요' / '자음이에요'
function copula(word) { const c = word.slice(-1).charCodeAt(0) - 0xac00; return word + (c >= 0 && c < 11172 && c % 28 ? "이에요" : "예요"); }

export default {
  id: "sort", title: "분류 바구니", icon: "🧺", sec: 60, cursor: "", cat: "learn", bg: "#fdffb6", desc: "맞는 바구니 쪽으로 옮기기",
  how: "떨어지는 카드가 내 몸을 따라 움직여요. 맞는 바구니 쪽으로 몸을 옮겨서 쏙! 넣어요. 주제는 6장마다 바뀌어요",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const order = shuffle(PAIRS.map((_, i) => i));
    let pi = -1, pair = null, flip = false, n = 0, item = null, wait = 0.6, t = 0, ok = 0, bad = 0, x = z.cx, bodyX = z.cx;
    let land = [0, 0], glow = [0, 0], banner = 0;
    const basketX = k => z.x0 + z.w * (k ? 0.78 : 0.22), bw = () => Math.min(z.w * 0.4, v.U * 0.62);
    const sideOf = xx => (xx < z.cx ? 0 : 1);
    const label = k => (k === 0) !== flip ? pair.a : pair.b;   // 왼쪽(0)·오른쪽(1) 바구니의 분류
    function nextPair() {
      pi = (pi + 1) % order.length; pair = PAIRS[order[pi]]; flip = Math.random() < 0.5; n = 0; land = [0, 0]; banner = 2.2;
      const L = label(0), R = label(1);
      env.speak(`이번엔 ${L.name}, ${R.name}!`);
    }
    function spawn() {
      if (!pair || n >= PER_PAIR) nextPair();
      n++;
      const isA = Math.random() < 0.5, list = isA ? pair.A : pair.B, c = list[Math.floor(Math.random() * list.length)];
      const side = isA !== flip ? 0 : 1;      // 정답 바구니 쪽
      const T = FALL * (1 - 0.3 * env.progress()) / Math.max(0.7, D.speed);
      item = { ...c, side, y: v.H * TOP, vy: v.H * (LINE - TOP) / T, born: 0 };
      if (env.slot === 0 || env.mode === 1) env.speak(c.name);
    }
    function judge() {
      const k = sideOf(x), L = label(item.side), X = basketX(k), Y = v.H * LINE;
      land[k]++; glow[k] = 1;
      if (k === item.side) {
        ok++; sfx.catch(env.player.combo); env.award(1, X, Y - v.U * 0.08);
        burst(X, Y, { n: 22, colors: ["#ffd400", "#9dff7a", "#7ae0ff", "#ff7aa2"], shape: "confetti", speed: v.U * 0.8, gravity: v.U, size: v.U * 0.015 });
      } else {
        bad++; sfx.bad();
        env.miss(X, Y - v.U * 0.05, "아쉬워요");
        const who = pair.num ? item.t : item.name;                     // 자모는 이름(기역)으로 읽음
        popup(z.cx, v.H * 0.5, `${topic(who)} ${copula(L.name)}`, { size: Math.min(v.U * 0.05, z.w / 12), color: "#fff", stroke: "#d07a00", life: 1.6 });
      }
      item = null; wait = 0.7;
    }
    return {
      update(dt) {
        t += dt; banner = Math.max(0, banner - dt); glow = glow.map(g => Math.max(0, g - dt * 2));
        // 몸 위치 → 카드 위치 (가운데에서 옮긴 거리의 GAIN배)
        const P = env.tracker.pts;
        if (P && P[11].v && P[12].v) bodyX = (P[11].x + P[12].x) / 2;
        const want = clamp(z.cx + (bodyX - z.cx) * GAIN, z.x0 + z.w * 0.1, z.x1 - z.w * 0.1);
        x += (want - x) * Math.min(1, dt * 10);
        if (!item) { wait -= dt; if (wait <= 0) spawn(); return; }
        item.born = Math.min(1, item.born + dt * 3);
        item.y += item.vy * dt * (env.fever() ? 1.15 : 1);
        if (item.y >= v.H * LINE) judge();
      },
      draw(ctx) {
        const U = v.U, Y = v.H * LINE, W = bw(), H = Math.min(U * 0.17, v.H * 0.17);
        if (!pair) return;
        // 가운데 나눔선
        ctx.save(); ctx.setLineDash([U * 0.02, U * 0.02]); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = U * 0.005;
        ctx.beginPath(); ctx.moveTo(z.cx, v.H * 0.3); ctx.lineTo(z.cx, Y); ctx.stroke(); ctx.restore();
        // 바구니 두 개
        const fs = Math.min(U * 0.042, W / 6.5);
        [0, 1].forEach(k => {
          const cx = basketX(k), L = label(k), on = item && sideOf(x) === k;
          ctx.save();
          if (on || glow[k] > 0) { ctx.shadowColor = "#fff36b"; ctx.shadowBlur = U * 0.05; }
          ctx.fillStyle = "#b5753c"; ctx.beginPath();
          ctx.moveTo(cx - W / 2, Y); ctx.lineTo(cx + W / 2, Y); ctx.lineTo(cx + W * 0.4, Y + H); ctx.lineTo(cx - W * 0.4, Y + H); ctx.closePath(); ctx.fill();
          ctx.restore();
          ctx.strokeStyle = "rgba(90,50,20,.55)"; ctx.lineWidth = U * 0.004;      // 엮은 무늬
          for (let i = 1; i < 4; i++) { const yy = Y + H * i / 4, ww = W / 2 - (W * 0.1) * i / 4; ctx.beginPath(); ctx.moveTo(cx - ww, yy); ctx.lineTo(cx + ww, yy); ctx.stroke(); }
          ctx.fillStyle = on ? "#ffe066" : "#8a5326"; rr(ctx, cx - W / 2 - U * 0.01, Y - U * 0.02, W + U * 0.02, U * 0.035, U * 0.015); ctx.fill();
          outlinedText(ctx, `${L.icon} ${L.name}`, cx, Y + H * 0.55, fs, "#fff", "#5a3210", 4);
          if (land[k]) outlinedText(ctx, `${land[k]}`, cx + W * 0.36, Y - U * 0.05, U * 0.03, "#fff", "#5a3210", 3);
        });
        // 떨어지는 카드 + 떨어질 바구니까지 점선
        if (item) {
          const s = Math.min(U * 0.12, z.w / 6) * (0.6 + 0.4 * item.born), k = sideOf(x), L = label(k);
          ctx.save(); ctx.setLineDash([U * 0.02, U * 0.016]); ctx.lineWidth = U * 0.008; ctx.strokeStyle = k ? "#7ae0ff" : "#ffd166";
          ctx.beginPath(); ctx.moveTo(x, item.y + s * 0.6); ctx.lineTo(x, Y - U * 0.02); ctx.stroke(); ctx.restore();
          ctx.fillStyle = "rgba(255,255,255,.92)"; rr(ctx, x - s * 0.65, item.y - s * 0.65, s * 1.3, s * 1.3, s * 0.25); ctx.fill();
          ctx.strokeStyle = env.color; ctx.lineWidth = U * 0.006; ctx.stroke();
          if (item.text) outlinedText(ctx, item.t, x, item.y + s * 0.04, s * 0.85, "#222", "#fff", 2);
          else { ctx.font = `${Math.round(s * 0.9)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000"; ctx.fillText(item.t, x, item.y + s * 0.05); }
          if (!item.text) outlinedText(ctx, item.name, x, item.y + s * 0.85, Math.min(U * 0.034, z.w / 14), "#fff", "#333", 3);
          outlinedText(ctx, `→ ${L.name}`, x, item.y - s * 0.85, Math.min(U * 0.03, z.w / 15), "#fff", "#555", 3);
        }
        // 새 주제 알림
        if (banner > 0) outlinedText(ctx, `${label(0).icon} ${label(0).name}  ·  ${label(1).icon} ${label(1).name}`, z.cx, v.H * 0.13, Math.min(U * 0.045, z.w / 12), "#fff", env.color, 4);
        else outlinedText(ctx, "몸을 옮겨 맞는 바구니로!", z.cx, v.H * 0.13, Math.min(U * 0.032, z.w / 16), "#fff", "#555", 3);
      },
      result: () => `맞힘 ${ok} · 틀림 ${bad}`,
      // 설명 시연용: 정답 바구니로 카드가 가려면 몸이 서야 할 x
      get target() { if (!item) return null; const bx = basketX(item.side); return z.cx + (bx - z.cx) / GAIN; },
      get item() { return item; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.walk = 1.4; p.rest(0, "hips", 1); p.rest(1, "hips", 1);
      if (T < 4) say("분류 바구니! 떨어지는 카드가 내 몸을 따라 움직여요");
      else if (T < 9) say("맞는 바구니 쪽으로 몸을 옮기면 쏙 들어가요");
      else if (T < 13) say("주제는 6장마다 바뀌어요. 바구니 이름을 잘 봐요");
      else say("이제 직접 해 봐요!");
      const x = g.target;
      if (x != null) p.tcx = x;
    },
  },
};
