// 복싱: 앞에 선 상대 선수를 주먹으로 치기. 상대가 막고 있는 곳(얼굴/몸)이 아닌 빈 곳을 노림
// 상대가 주먹을 뒤로 빼면(빨간 경고) → 두 손으로 얼굴 막기, 또는 머리를 옆으로 피하기
// 상대 체력을 다 깎으면 KO 보너스, 다음 상대 등장. 내가 맞으면 감점, 체력이 다 떨어지면 다운
import { burst, popup, shake, rr, outlinedText } from "../../fx.js?v=28";
import { sfx } from "../../audio.js?v=28";

const PUNCH = 3.0;       // 펀치로 인정하는 손 속도 (어깨너비/초)
const STRONG = 7.0;      // 이 이상이면 강펀치(체력 2칸)
const WIND = 0.85;       // 상대 공격 예고 시간(초, 보통)
const MY_HP = 5;
const SKIN = ["#f2c49b", "#c98b5e", "#8d5a3b"], TRUNKS = ["#3d8bff", "#2fb65a", "#a24bd6", "#ff8a00"];

export default {
  id: "boxing", title: "복싱", icon: "🥊", sec: 60, cursor: "🥊", cat: "sport", bg: "#ff9a9e", desc: "빈 곳 치고 막고 피하기",
  how: "빠르게 주먹을 뻗어 상대가 막지 않은 곳(얼굴/몸)을 쳐요. 빨간 경고가 뜨면 두 손으로 얼굴을 막거나 머리를 옆으로 피해요!",
  create(env) {
    const z = env.zone, v = env.view, D = env.diff;
    const R = () => Math.min(z.w * 0.2, v.U * 0.11);
    const opp = { x: z.cx, maxHp: 12 + D.hp * 3, hp: 0, guard: "head", guardT: 0, hitT: 0, n: 0, ko: 0, sway: 0 };
    let t = 0, myHp = MY_HP, atk = null, atkT = 2.2, cool = [0, 0], hits = 0, blocked = 0, kos = 0, taken = 0, defended = 0, downs = 0, noseBase = null;
    function newOpp() { opp.n++; opp.maxHp = 12 + D.hp * 3 + (opp.n - 1) * 3; opp.hp = opp.maxHp; opp.guard = "head"; opp.guardT = 1.5; opp.ko = 0; opp.skin = SKIN[(opp.n - 1) % 3]; opp.trunk = TRUNKS[(opp.n - 1) % 4]; }
    newOpp();
    // 상대 몸 위치: 머리는 화면 위쪽, 몸통은 그 아래 (플레이어 얼굴·가슴 높이쯤)
    const head = () => ({ x: opp.x + opp.sway, y: v.H * 0.28, r: R() * 0.75 });
    const body = () => ({ x: opp.x + opp.sway * 0.5, y: v.H * 0.5, r: R() * 0.9 });
    function strike(k, h, part) {
      const P = part === "head" ? head() : body();
      cool[k] = 0.35;
      if (opp.guard === part) {               // 막힌 곳
        blocked++; sfx.bonk(); popup(P.x, P.y - P.r * 1.3, "막혔다!", { size: v.U * 0.04, color: "#fff", stroke: "#666" });
        burst(h.x, h.y, { n: 6, colors: ["#ffffff", "#cccccc"], speed: v.U * 0.4, gravity: v.U, size: v.U * 0.01, life: 0.3 });
        return;
      }
      const strong = h.bodySpeed >= STRONG * D.punch, dmg = strong ? 2 : 1;
      hits++; opp.hp = Math.max(0, opp.hp - dmg); opp.hitT = 0.25;
      sfx.hit(dmg); shake(v.U * (strong ? 0.014 : 0.007), 0.18);
      env.award(strong ? 2 : 1, P.x, P.y - P.r * 1.4);
      if (strong) popup(P.x, P.y + P.r * 1.5, "강펀치!", { size: v.U * 0.05, color: "#fff", stroke: "#d0451b" });
      burst(h.x, h.y, { n: strong ? 18 : 10, colors: ["#ffffff", "#ffe14d", "#ff7a7a"], shape: "star", speed: v.U * 0.6, gravity: v.U * 0.5, size: v.U * 0.016, life: 0.5 });
      if (opp.hp <= 0) {                      // KO!
        kos++; opp.ko = 1.6; atk = null; sfx.fanfare(); env.award(5, z.cx, v.H * 0.36);
        popup(z.cx, v.H * 0.2, "K.O.!", { size: v.U * 0.1, color: "#ffe14d", stroke: "#b30000", life: 1.4 });
      } else if (Math.random() < 0.45) { opp.guard = part === "head" ? "body" : "head"; opp.guardT = 1 + Math.random(); }   // 맞은 곳을 막으러 감
    }
    // 내 방어: 두 손목이 코 가까이(얼굴 막기) 또는 머리를 공격 반대쪽으로 피함
    function defended_(a) {
      const p = env.tracker.pts;
      if (!p || !p[0].v) return null;
      const sw = Math.max(env.tracker.scale || 0, v.U * 0.06);
      const guard = [15, 16].every(i => p[i].v && Math.hypot(p[i].x - p[0].x, p[i].y - p[0].y) < sw * 1.1);
      if (guard) return "guard";
      const dx = (p[0].x - noseBase.x) / sw, dy = (p[0].y - noseBase.y) / sw;
      if (a.side === "left" && dx > 0.5) return "dodge";
      if (a.side === "right" && dx < -0.5) return "dodge";
      if (a.side === "mid" && (Math.abs(dx) > 0.5 || dy > 0.45)) return "dodge";
      return null;
    }
    return {
      update(dt) {
        t += dt; cool[0] = Math.max(0, cool[0] - dt); cool[1] = Math.max(0, cool[1] - dt);
        opp.hitT = Math.max(0, opp.hitT - dt); opp.sway = Math.sin(t * 1.7) * R() * 0.25;
        const p = env.tracker.pts;
        // 코 위치 기준값: 공격이 없을 때 천천히 따라감 (피했는지 판단용)
        if (p && p[0].v) { if (!noseBase) noseBase = { x: p[0].x, y: p[0].y }; else if (!atk) { const a = Math.min(1, dt * 1.5); noseBase.x += (p[0].x - noseBase.x) * a; noseBase.y += (p[0].y - noseBase.y) * a; } }
        if (opp.ko > 0) { opp.ko -= dt; if (opp.ko <= 0) { newOpp(); popup(z.cx, v.H * 0.2, `${opp.n}번째 상대!`, { size: v.U * 0.05, color: "#fff", stroke: opp.trunk }); atkT = 1.8; } return; }
        // 상대 가드 바꾸기
        opp.guardT -= dt;
        if (opp.guardT <= 0 && !atk) { opp.guard = Math.random() < 0.5 ? "head" : "body"; opp.guardT = (1.4 + Math.random() * 1.6) / D.speed; }
        // 내 펀치: 빠르게, 그리고 상대 쪽으로 다가가는 손만
        env.tracker.hands.forEach((h, k) => {
          if (!h.vis || cool[k] > 0 || h.bodySpeed < PUNCH * D.punch) return;
          for (const part of ["head", "body"]) {
            const P = part === "head" ? head() : body();
            if (Math.hypot(h.x - P.x, h.y - P.y) > P.r * 1.25 * D.reach) continue;
            if ((P.x - h.x) * h.vx + (P.y - h.y) * h.vy <= 0 && Math.hypot(h.x - P.x, h.y - P.y) > P.r * 0.4) continue;
            strike(k, h, part); break;
          }
        });
        // 상대 공격: 예고 → 때림
        if (!atk) {
          atkT -= dt;
          if (atkT <= 0 && p && p[0].v) {   // 선수가 보일 때만 공격
            const side = ["left", "right", "mid"][Math.floor(Math.random() * (env.progress() > 0.3 ? 3 : 2))];
            atk = { side, t: 0, T: WIND / D.speed * (1 - 0.2 * env.progress()), done: false, rt: 0 };
            sfx.whoosh();
          }
        } else if (!atk.done) {
          atk.t += dt;
          if (atk.t >= atk.T) {
            atk.done = true; atk.rt = 0;
            const d = defended_(atk), x = atk.side === "left" ? z.x0 + z.w * 0.3 : atk.side === "right" ? z.x0 + z.w * 0.7 : z.cx;
            if (d) {
              defended++; atk.res = d; sfx.catch(env.player.combo); env.award(1, x, v.H * 0.4);
              popup(x, v.H * 0.48, d === "guard" ? "막았다!" : "피했다!", { size: v.U * 0.05, color: "#fff", stroke: "#2fb65a" });
            } else {
              taken++; atk.res = "hit"; myHp--; sfx.thud(); shake(v.U * 0.03, 0.4);
              env.penalty(1, x, v.H * 0.45, "맞았다!");
              if (myHp <= 0) { downs++; myHp = MY_HP; env.penalty(1, z.cx, v.H * 0.55, "다운!"); popup(z.cx, v.H * 0.62, "일어나요! 다시!", { size: v.U * 0.045, color: "#fff", stroke: "#b30000" }); }
            }
          }
        } else {
          atk.rt += dt;
          if (atk.rt > 0.45) { atk = null; atkT = (2.0 + Math.random() * 1.8) / D.speed * (1 - 0.3 * env.progress()); }
        }
      },
      draw(ctx) {
        const U = v.U, r = R(), H = head(), B = body();
        // 체력 막대: 상대(위 왼쪽), 나(위 오른쪽)
        const bw = z.w * 0.38, by = v.H * 0.115, bh = Math.max(10, U * 0.018);
        const bar = (x, label, k, col) => {
          ctx.fillStyle = "rgba(0,0,0,.5)"; rr(ctx, x, by, bw, bh, bh / 2); ctx.fill();
          ctx.fillStyle = col; rr(ctx, x, by, Math.max(bh, bw * k), bh, bh / 2); ctx.fill();
          outlinedText(ctx, label, x + bw / 2, by + bh + U * 0.022, U * 0.025, "#fff", "#333", 3);
        };
        bar(z.x0 + z.w * 0.06, `상대 ${opp.n}`, opp.hp / opp.maxHp, "#ff5a5a");
        bar(z.x1 - z.w * 0.06 - bw, "나", myHp / MY_HP, env.color);
        // 상대 선수 (반투명: 내 몸이 보이게)
        const fall = opp.ko > 0 ? Math.min(1, (1.6 - opp.ko) * 2) : 0, jx = opp.hitT > 0 ? Math.sin(t * 80) * r * 0.06 : 0;
        ctx.save(); ctx.globalAlpha = 0.78 * (1 - fall * 0.5); ctx.translate(jx, fall * r * 0.8);
        ctx.fillStyle = opp.skin; rr(ctx, B.x - r * 0.75, H.y + H.r * 0.7, r * 1.5, B.y - H.y + r * 0.4, r * 0.35); ctx.fill();   // 몸통
        ctx.fillStyle = opp.trunk; rr(ctx, B.x - r * 0.8, B.y + r * 0.3, r * 1.6, r * 0.55, r * 0.15); ctx.fill();               // 반바지
        ctx.fillStyle = opp.skin; ctx.beginPath(); ctx.arc(H.x, H.y, H.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(H.x, H.y, H.r * 1.03, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();    // 헤드기어
        ctx.fillStyle = "#222";
        if (opp.ko > 0) outlinedText(ctx, "x  x", H.x, H.y + H.r * 0.05, H.r * 0.5, "#222", "#fff", 2);
        else { for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(H.x + s * H.r * 0.33, H.y + H.r * 0.05, H.r * 0.1, 0, Math.PI * 2); ctx.fill(); }
          ctx.strokeStyle = "#222"; ctx.lineWidth = H.r * 0.09; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(H.x + s * H.r * 0.15, H.y - H.r * 0.18); ctx.lineTo(H.x + s * H.r * 0.5, H.y - H.r * 0.28); ctx.stroke(); } }
        // 장갑: 막는 곳 앞에. 공격 중이면 그쪽 장갑이 뒤로 갔다가 크게 날아옴
        const glove = (x, y, s) => { ctx.fillStyle = "#e23b3b"; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.3, s * 0.3, 0, Math.PI * 2); ctx.fill(); };
        const gy = opp.guard === "head" ? H.y + H.r * 0.15 : B.y - r * 0.05, gr = r * 0.42;
        [-1, 1].forEach(s => {
          let x = H.x + s * r * 0.42, y = gy, sz = gr;
          if (atk && opp.ko <= 0) {
            const mine = (atk.side === "left" && s < 0) || (atk.side === "right" && s > 0) || (atk.side === "mid" && s > 0);
            if (mine) {
              if (!atk.done) { const k = atk.t / atk.T; x = H.x + s * r * (0.7 + 0.3 * k); y = H.y - H.r * 0.4 * k; sz = gr * (1 - 0.2 * k); }
              else { const k = Math.min(1, atk.rt / 0.15); const tx = atk.side === "mid" ? z.cx : atk.side === "left" ? z.x0 + z.w * 0.3 : z.x0 + z.w * 0.7; x = H.x + (tx - H.x) * k; y = H.y + (v.H * 0.42 - H.y) * k; sz = gr * (1 + 1.8 * k); }
            }
          }
          glove(x, y, sz);
        });
        ctx.restore();
        // 막고 있는 곳 표시
        if (opp.ko <= 0) {
          const P = opp.guard === "head" ? H : B, O = opp.guard === "head" ? B : H;
          ctx.save(); ctx.globalAlpha = 0.85; ctx.setLineDash([U * 0.012, U * 0.01]); ctx.lineWidth = U * 0.006;
          ctx.strokeStyle = "#ffe14d"; ctx.beginPath(); ctx.arc(O.x, O.y, O.r * 1.05, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
          outlinedText(ctx, "여기!", O.x + O.r * 1.35, O.y, U * 0.03, "#ffe14d", "#333", 3);
          outlinedText(ctx, "🛡️", P.x + P.r * 1.3, P.y, U * 0.035, "#fff", "#333", 2);
        }
        // 공격 예고: 빨간 경고와 피할 방향
        if (atk && !atk.done) {
          const k = atk.t / atk.T, lx = atk.side === "left" ? z.x0 : atk.side === "right" ? z.cx : z.x0 + z.w * 0.25, lw = atk.side === "mid" ? z.w * 0.5 : z.w * 0.5;
          ctx.fillStyle = `rgba(255,40,40,${(0.12 + 0.2 * k * (0.6 + 0.4 * Math.sin(t * 30))).toFixed(3)})`; ctx.fillRect(lx, v.H * 0.15, lw, v.H * 0.7);
          const hint = atk.side === "left" ? "막거나 → 피하기!" : atk.side === "right" ? "막거나 ← 피하기!" : "막거나 숙이기!";
          outlinedText(ctx, "! " + hint, z.cx, v.H * 0.66, Math.min(U * 0.05, z.w / 10), "#fff", "#c00000", 4);
        }
        if (atk && atk.done && atk.res === "hit") { ctx.fillStyle = `rgba(255,0,0,${(0.3 * (1 - atk.rt / 0.45)).toFixed(3)})`; ctx.fillRect(z.x0, 0, z.w, v.H); }
      },
      result: () => `맞힘 ${hits} · 막힘 ${blocked} · KO ${kos} · 방어 ${defended} · 맞음 ${taken}${downs ? ` · 다운 ${downs}` : ""}`,
      // 설명 시연용
      get head() { return head(); }, get body() { return body(); },
      get guard() { return opp.guard; }, get ko() { return opp.ko > 0; },
      get attack() { return atk && !atk.done ? { side: atk.side, k: atk.t / atk.T } : null; },
    };
  },
  demo: {
    dur: 16,
    run(T, g, p, S, say) {
      p.hands.forEach(h => { h.shape = "closed"; }); p.active = -1; p.tcx = p.v.W / 2;
      const u = p.u, a = g.attack;
      if (T < 4) say("복싱! 상대가 막지 않은 곳을 빠르게 쳐요");
      else if (T < 9) say("노란 점선이 빈 곳! 얼굴이나 몸을 노려요");
      else if (T < 14.5) say("빨간 경고가 뜨면 두 손으로 얼굴을 막거나 옆으로 피해요");
      else say("이제 직접 해 봐요!");
      if (a) {                      // 방어: 첫 번째는 막기, 그다음은 피하기
        if (S.atkSeen !== a.side + S.atkN) { S.atkN = (S.atkN || 0) + 1; S.atkSeen = a.side + S.atkN; }
        if (S.atkN % 2 === 1 || a.side === "mid") { p.rest(0, "head", 2); p.rest(1, "head", 2); p.leanT = 0; }
        else { p.leanT = a.side === "left" ? 1 : -1; p.rest(0, "guard", 1.5); p.rest(1, "guard", 1.5); }
        S.ph = "back"; S.t0 = T; return;
      }
      p.leanT = 0;
      if (g.ko) { p.rest(0, "cheer", 1); p.rest(1, "cheer", 1); return; }
      const tg = g.guard === "head" ? g.body : g.head, k = S.k || 0, sh = p.pts[11 + k];
      p.rest(1 - k, "guard", 1.2);
      if (S.ph !== "hit") {          // 주먹 당기기
        p.reach(k, sh.x + (k ? 0.4 : -0.4) * u, sh.y + 0.6 * u, 1.2);
        if (T - (S.t0 || 0) > 0.45) { S.ph = "hit"; S.t0 = T; }
      } else {                       // 빠르게 뻗기
        p.reach(k, tg.x, tg.y, 1.6);
        if (Math.hypot(p.hands[k].x - tg.x, p.hands[k].y - tg.y) < u * 0.15 || T - S.t0 > 0.4) { S.ph = "back"; S.t0 = T; S.k = 1 - k; }
      }
    },
  },
};
