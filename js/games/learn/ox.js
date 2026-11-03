// OX 퀴즈 (한 게임 10문제): 문제를 듣고 맞으면 왼쪽(O), 틀리면 오른쪽(X)으로 몸을 옮기기. 시간이 끝났을 때 몸(어깨 가운데)이 있는 쪽으로 판정
// 상식·안전·수 비교·덧셈·영어 단어·한글 문제를 섞어서, 한 게임에서는 같은 문제가 다시 나오지 않음. 2인은 같은 문제를 동시에 풂
import { burst, popup, rr, outlinedText, FONT } from "../../fx.js?v=52";
import { sfx } from "../../audio.js?v=52";

const ANSWER = 5.0;    // 답을 고르는 시간(초, 보통)
const SHOW = 2.4;      // 정답·설명 보여 주는 시간(초)
const COUNT = 10;      // 한 게임 문제 수
const DEAD = 0.05;     // 가운데 선에서 구역 너비의 이 비율 안이면 '아직 안 고름'

// [문제, 정답(true=O), 설명]
const BANK = [
  // 상식: 동물·자연
  ["펭귄은 하늘을 날 수 있어요", false, "펭귄은 날지 못하고 헤엄을 잘 쳐요"],
  ["고래는 바다에 살아요", true, "고래는 바다에 사는 아주 큰 동물이에요"],
  ["거미의 다리는 6개예요", false, "거미의 다리는 8개예요"],
  ["개구리는 올챙이였어요", true, "올챙이가 자라서 개구리가 돼요"],
  ["해는 서쪽에서 떠요", false, "해는 동쪽에서 떠서 서쪽으로 져요"],
  ["물이 얼면 얼음이 돼요", true, "아주 차가워지면 물이 얼음이 돼요"],
  ["기린은 목이 짧아요", false, "기린은 목이 아주 길어요"],
  ["나비는 애벌레에서 자라요", true, "애벌레 → 번데기 → 나비가 돼요"],
  ["겨울에는 눈이 올 수 있어요", true, "추운 겨울에 하얀 눈이 내려요"],
  ["물고기는 물속에서 숨을 쉬어요", true, "물고기는 아가미로 물속에서 숨을 쉬어요"],
  ["달은 낮에만 보여요", false, "달은 주로 밤에 잘 보여요"],
  ["코끼리는 코가 길어요", true, "코끼리는 긴 코로 물도 마셔요"],
  ["닭은 알을 낳아요", true, "닭은 달걀을 낳아요"],
  ["무지개는 일곱 가지 색이에요", true, "빨주노초파남보, 일곱 색이에요"],
  ["식물은 물이 없어도 잘 자라요", false, "식물도 물을 마셔야 자라요"],
  ["강아지는 '야옹' 하고 울어요", false, "강아지는 '멍멍', 고양이가 '야옹'이에요"],
  ["일주일은 7일이에요", true, "월화수목금토일, 7일이에요"],
  ["여름은 겨울보다 더워요", true, "여름은 덥고 겨울은 추워요"],
  // 안전
  ["빨간불일 때 횡단보도를 건너요", false, "초록불에 좌우를 살피고 건너요"],
  ["불이 나면 엘리베이터를 타요", false, "불이 나면 계단으로 대피해요"],
  ["물놀이 전에는 준비 운동을 해요", true, "몸을 풀고 들어가야 안전해요"],
  ["뜨거운 냄비는 손으로 바로 잡아요", false, "데일 수 있어요. 어른에게 부탁해요"],
  ["모르는 사람이 부르면 따라가요", false, "모르는 사람은 따라가지 않아요"],
  ["자전거를 탈 때 헬멧을 써요", true, "헬멧은 머리를 지켜 줘요"],
  ["콘센트에 젓가락을 넣으면 위험해요", true, "전기가 통해서 아주 위험해요"],
  ["길을 잃으면 그 자리에서 기다려요", true, "움직이지 말고 기다리거나 도움을 청해요"],
  ["차 안에서는 안전띠를 매요", true, "안전띠는 꼭 매요"],
  ["계단에서 뛰어 내려가요", false, "계단에서는 천천히 걸어요"],
  ["불이 나면 119에 전화해요", true, "불이 나면 119예요"],
  ["깊은 물에 혼자 들어가도 돼요", false, "어른과 함께, 얕은 곳에서 놀아요"],
  // 수 비교
  ["7은 5보다 커요", true, "7이 5보다 2 더 커요"],
  ["3은 8보다 커요", false, "3은 8보다 작아요"],
  ["10은 9보다 커요", true, "10이 9보다 1 더 커요"],
  ["6과 6은 같아요", true, "같은 수예요"],
  ["2는 홀수예요", false, "2는 짝수예요"],
  ["5는 홀수예요", true, "1, 3, 5, 7, 9는 홀수예요"],
  ["12는 21보다 커요", false, "21이 12보다 커요"],
  ["0은 1보다 작아요", true, "0은 아무것도 없는 수예요"],
  // 덧셈·뺄셈
  ["2 더하기 3은 5예요", true, "2 + 3 = 5"],
  ["4 더하기 4는 9예요", false, "4 + 4 = 8"],
  ["5 더하기 5는 10이에요", true, "5 + 5 = 10"],
  ["6 빼기 2는 3이에요", false, "6 - 2 = 4"],
  ["1 더하기 7은 8이에요", true, "1 + 7 = 8"],
  ["9 빼기 4는 5예요", true, "9 - 4 = 5"],
  ["3 더하기 6은 8이에요", false, "3 + 6 = 9"],
  ["10 빼기 3은 7이에요", true, "10 - 3 = 7"],
  ["2 곱하기 3은 6이에요", true, "2를 세 번 더하면 6"],
  // 영어 단어
  ["apple은 사과예요", true, "apple = 사과"],
  ["dog는 고양이예요", false, "dog = 강아지, cat = 고양이"],
  ["red는 빨간색이에요", true, "red = 빨간색"],
  ["water는 불이에요", false, "water = 물, fire = 불"],
  ["sun은 해예요", true, "sun = 해"],
  ["three는 숫자 3이에요", true, "one, two, three!"],
  ["big은 작다는 뜻이에요", false, "big = 크다, small = 작다"],
  ["banana는 바나나예요", true, "banana = 바나나"],
  ["blue는 노란색이에요", false, "blue = 파란색, yellow = 노란색"],
  ["mom은 엄마예요", true, "mom = 엄마, dad = 아빠"],
  ["hand는 발이에요", false, "hand = 손, foot = 발"],
  // 한글
  ["'가'의 첫 자음은 ㄱ이에요", true, "가 = ㄱ + ㅏ"],
  ["'나'의 첫 자음은 ㅁ이에요", false, "나 = ㄴ + ㅏ"],
  ["'엄마'는 두 글자예요", true, "엄 · 마, 두 글자"],
  ["'호랑이'는 두 글자예요", false, "호 · 랑 · 이, 세 글자"],
  ["ㅏ는 모음이에요", true, "ㅏ ㅑ ㅓ ㅕ ㅗ ... 는 모음이에요"],
  ["ㅂ은 모음이에요", false, "ㅂ은 자음이에요"],
  ["'바다'와 '바지'는 같은 글자로 시작해요", true, "둘 다 '바'로 시작해요"],
  ["'사자'를 거꾸로 읽으면 '자사'예요", true, "사·자 → 자·사"],
];

// 2인이 같은 문제를 같은 때에 풀도록 시작 시각·문제 순서를 함께 씀
let shared = null;
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
function sharedStart(answer) {
  if (!shared) {
    const seed = 1 + Math.floor(Math.random() * 1e6), order = BANK.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(hash(seed, i) * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    shared = { t0: performance.now() / 1000 + 0.8, order, answer };   // 한 게임 안에서는 같은 문제가 다시 안 나옴
  }
  return shared;
}

// 글자를 칸 너비에 맞게 여러 줄로
function wrapLines(ctx, text, maxW) {
  const words = text.split(" "), lines = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

export default {
  id: "ox", title: "OX 퀴즈", icon: "⭕", sec: 60, cursor: "", cat: "learn", bg: "#caffbf", desc: "왼쪽 O, 오른쪽 X로 이동",
  // 게임 시간 = 10문제를 다 푸는 시간 (1P 난이도의 답 고르는 시간 기준)
  secFor: (song, diffs) => 0.8 + COUNT * (ANSWER * Math.max(0.8, Math.min(1.3, (diffs && diffs[0] ? diffs[0].poseTime : 1))) + SHOW) + 0.3,
  how: "10문제! 문제를 잘 듣고, 맞으면 왼쪽 O로, 틀리면 오른쪽 X로 몸을 옮겨요. 시간이 끝났을 때 서 있는 쪽이 내 답이에요",
  create(env) {
    const z = env.zone, v = env.view;
    const answer = ANSWER * Math.max(0.8, Math.min(1.3, env.diff.poseTime));
    let done = false, cur = -1, Q = null, picked = null, judged = false, okN = 0, failN = 0, now = 0, bodyX = null, shownAt = 0;
    const S0 = sharedStart(answer);
    const round = () => S0.answer + SHOW;
    // 몸 위치 → 고른 쪽 (true = O 왼쪽, false = X 오른쪽, null = 가운데)
    function side() {
      const P = env.tracker.pts;
      if (!P || !P[11].v || !P[12].v) return null;
      bodyX = (P[11].x + P[12].x) / 2;
      const d = (bodyX - z.cx) / z.w;
      return Math.abs(d) < DEAD ? null : d < 0;
    }
    return {
      update() {
        const S = sharedStart(answer);
        now = performance.now() / 1000;
        picked = side();
        const el = now - S.t0;
        if (el < 0) return;
        const i = Math.floor(el / round()), tIn = el - i * round();
        if (i >= COUNT) { done = true; return; }                    // 10문제 끝
        if (i !== cur) {   // 새 문제
          cur = i; judged = false; Q = BANK[S.order[i % S.order.length]];
          if (env.slot === 0) env.speak(Q[0], "ko-KR");
        }
        if (!judged && tIn >= S.answer) {   // 시간 끝: 판정
          judged = true; shownAt = now;
          const y = v.H * 0.6;
          if (picked === Q[1]) {
            okN++; sfx.catch(env.player.combo); env.award(1, z.cx, y - v.U * 0.08);
            popup(z.cx, y, "정답!", { size: v.U * 0.07, color: "#fff", stroke: "#2fb65a", life: 1.2 });
            const px = z.x0 + z.w * (Q[1] ? 0.25 : 0.75);
            burst(px, v.H * 0.5, { n: 24, colors: ["#ffd400", "#9dff7a", "#7ae0ff"], shape: "confetti", speed: v.U * 0.8, gravity: v.U, size: v.U * 0.015 });
          } else {
            failN++; sfx.bad(); env.miss(z.cx, y, picked == null ? "가운데에 있었어요" : "아쉬워요!");
          }
          if (env.slot === 0) env.speak(`정답은 ${Q[1] ? "오" : "엑스"}! ${Q[2]}`, "ko-KR");
        }
      },
      draw(ctx) {
        const U = v.U, S = shared, el = S ? now - S.t0 : -1, tIn = cur >= 0 ? el - cur * round() : 0;
        const top = v.H * 0.3, bot = v.H * 0.9, half = z.w / 2;
        // O·X 판 (몸이 있는 쪽은 진하게, 판정 뒤에는 정답 쪽만 빛남)
        [[true, z.x0, "#2fb65a", "O"], [false, z.x0 + half, "#e03131", "X"]].forEach(([isO, x0, col, mark]) => {
          let a = picked === isO ? 0.42 : 0.16;
          if (judged) a = Q && Q[1] === isO ? 0.5 + 0.15 * Math.sin(now * 10) : 0.08;
          ctx.fillStyle = col; ctx.globalAlpha = a; ctx.fillRect(x0, top, half, bot - top); ctx.globalAlpha = 1;
          outlinedText(ctx, mark, x0 + half / 2, (top + bot) / 2, Math.min(U * 0.34, half * 0.7), "#fff", col, U * 0.012);
        });
        // 가운데 점선
        ctx.save(); ctx.setLineDash([U * 0.03, U * 0.025]); ctx.lineWidth = U * 0.01; ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.beginPath(); ctx.moveTo(z.cx, top); ctx.lineTo(z.cx, bot); ctx.stroke(); ctx.restore();
        // 지금 내 몸 위치 표시
        if (bodyX != null && !judged) {
          const bx = Math.max(z.x0 + U * 0.04, Math.min(z.x1 - U * 0.04, bodyX)), by = bot - U * 0.06;
          ctx.fillStyle = env.color; ctx.beginPath(); ctx.moveTo(bx, by - U * 0.05); ctx.lineTo(bx - U * 0.035, by); ctx.lineTo(bx + U * 0.035, by); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = U * 0.006; ctx.stroke();
          outlinedText(ctx, picked == null ? "O 또는 X 쪽으로!" : picked ? "O 선택" : "X 선택", bx, by + U * 0.035, Math.min(U * 0.032, z.w / 18), "#fff", env.color, 3);
        }
        // 문제 카드
        const w = Math.min(z.w * 0.94, U * 1.1), x = z.x0 + (z.w - w) / 2, y = v.H * 0.12;
        ctx.font = `${Math.round(Math.min(U * 0.05, z.w / 13))}px ${FONT}`;
        const fs = Math.min(U * 0.05, z.w / 13);
        const lines = Q ? wrapLines(ctx, Q[0], w * 0.9) : ["잘 듣고 O·X로 움직여요!"];
        const h = fs * (lines.length * 1.25 + 0.9);
        ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, x + 5, y + 7, w, h, U * 0.03); ctx.fill();
        ctx.fillStyle = judged ? (picked === Q[1] ? "#d8ffe6" : "#ffe0e0") : "#fff"; rr(ctx, x, y, w, h, U * 0.03); ctx.fill();
        ctx.lineWidth = U * 0.01; ctx.strokeStyle = env.color; ctx.stroke();
        lines.forEach((ln, k) => outlinedText(ctx, ln, z.cx, y + fs * (0.95 + k * 1.25), fs, "#222", "#fff", 2));
        if (Q) {   // 몇 번째 문제인지 (카드 왼쪽 위)
          const t = `${Math.min(COUNT, cur + 1)} / ${COUNT}`, bs = Math.min(U * 0.03, z.w / 22);
          ctx.font = `bold ${Math.round(bs)}px ${FONT}`; const tw = ctx.measureText(t).width + bs;
          ctx.fillStyle = env.color; rr(ctx, x + U * 0.015, y - bs * 0.7, tw, bs * 1.4, bs * 0.5); ctx.fill();
          outlinedText(ctx, t, x + U * 0.015 + tw / 2, y, bs, "#fff", env.color, 2);
        }
        // 남은 시간 막대
        if (Q && !judged) { const k = Math.max(0, 1 - tIn / S.answer); ctx.fillStyle = env.color; ctx.fillRect(x + U * 0.03, y + h - U * 0.014, (w - U * 0.06) * k, U * 0.009); }
        // 정답 설명
        if (judged && Q) {
          const ey = Math.min(bot - U * 0.12, y + h + U * 0.06);
          outlinedText(ctx, `정답 ${Q[1] ? "O" : "X"}`, z.cx, ey, Math.min(U * 0.06, z.w / 9), "#fff", Q[1] ? "#2fb65a" : "#e03131", 4);
          ctx.font = `${Math.round(Math.min(U * 0.036, z.w / 18))}px ${FONT}`;
          wrapLines(ctx, Q[2], w * 0.9).forEach((ln, k) => outlinedText(ctx, ln, z.cx, ey + U * (0.06 + k * 0.045), Math.min(U * 0.036, z.w / 18), "#fff", "#333", 3));
        }
      },
      stop() { shared = null; },
      get done() { return done; },
      result: () => `${COUNT}문제 중 맞힘 ${okN} · 틀림 ${failN}`,
      // 설명 시연용: 지금 문제의 정답 쪽 (화면 x)
      get answerX() { return Q && !judged ? z.x0 + z.w * (Q[1] ? 0.25 : 0.75) : null; },
      get q() { return Q ? { text: Q[0], o: Q[1], judged } : null; },
    };
  },
  demo: {
    dur: 17,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "unknown"; }); p.active = -1; p.walk = 1.2; p.setPose("rest");
      const q = g.q;
      if (T > 15) { say("이제 직접 해 봐요!"); p.tcx = p.v.W / 2; return; }
      if (!q) { say("OX 퀴즈! 맞으면 왼쪽 O, 틀리면 오른쪽 X로 가요"); return; }
      if (q.judged) { say(q.o ? "맞는 말이라서 O 쪽이 정답!" : "틀린 말이라서 X 쪽이 정답!"); return; }
      say(`"${q.text}" 맞을까요, 틀릴까요?`);
      if (g.answerX != null && T - (S.qT || 0) > 0) { if (S.qText !== q.text) { S.qText = q.text; S.qT = T + 1.2; } if (T > S.qT) p.tcx = g.answerX; }
    },
  },
};
