// 웃긴 순간 사진: 게임 중 큰 일이 생긴 순간(보스 격파, 폭탄, 황금, 큰 콤보…)의 화면을 작게 찍어 두고 결과 화면에 보여 줌
// 사진은 이 화면에만 잠깐 있고 어디에도 저장·전송하지 않음 (저장 버튼을 누를 때만 기기에 저장)
export function makeShots(src) {
  let list = [], pend = [], lastAt = -9, T = 0, on = false;
  const W = 560;
  function capture(label, pri) {
    if (!src.width || !src.height) return;
    const c = document.createElement("canvas"); c.width = W; c.height = Math.round(W * src.height / src.width);
    try { c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); } catch (e) { return; }
    list.push({ c, label, pri, t: T }); lastAt = T;
    if (list.length > 12) {   // 오래되고 덜 중요한 것부터 버림
      let k = 0; list.forEach((s, i) => { if (s.pri < list[k].pri || (s.pri === list[k].pri && s.t < list[k].t)) k = i; });
      list.splice(k, 1);
    }
  }
  return {
    reset() { list = []; pend = []; lastAt = -9; T = 0; on = true; },
    stop() { on = false; pend = []; },
    get count() { return list.length; },
    // 조금 뒤에 찍음 (점수 글자·파편이 보이게)
    want(label, pri = 1, delay = 0.22) { if (on && pend.length < 6) pend.push({ at: T + delay, label, pri }); },
    tick(dt) { if (on) T += dt; },
    // 화면을 다 그린 뒤 부름
    afterDraw() {
      if (!on || !pend.length) return;
      const due = pend.filter(p => p.at <= T); if (!due.length) return;
      pend = pend.filter(p => p.at > T);
      const best = due.reduce((a, b) => (b.pri > a.pri ? b : a));
      if (T - lastAt < 1.1 && best.pri < 4) return;   // 너무 붙어 있으면 중요한 순간만
      capture(best.label, best.pri);
    },
    // 결과용: 중요한 순간 n장 (2초 넘게 떨어진 것), 시간 순서로
    pick(n = 3) {
      const out = [];
      for (const s of list.slice().sort((a, b) => b.pri - a.pri || b.t - a.t)) {
        if (out.length >= n) break;
        if (out.every(o => Math.abs(o.t - s.t) > 2)) out.push(s);
      }
      return out.sort((a, b) => a.t - b.t).map(s => ({ label: s.label, canvas: s.c, url: s.c.toDataURL("image/jpeg", 0.82) }));
    },
  };
}
// 사진 저장: 아이패드는 공유 시트('이미지 저장'), 그 밖에는 내려받기
export async function saveShot(canvas, name) {
  const blob = await new Promise(ok => canvas.toBlob(ok, "image/jpeg", 0.9));
  if (!blob) return false;
  const file = new File([blob], name + ".jpg", { type: "image/jpeg" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  } catch (e) { if (e && e.name === "AbortError") return false; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name + ".jpg";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return true;
}
