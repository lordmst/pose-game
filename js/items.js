// 아이템 모으기 (스포츠 리조트의 '아이템 획득'처럼): 게임을 마치면 선수마다 아이템 하나를 받음
export const ITEMS = [
  ["cap", "🧢", "야구 모자"], ["tophat", "🎩", "마술사 모자"], ["crown", "👑", "왕관"], ["shades", "🕶️", "선글라스"], ["ribbon", "🎀", "리본"],
  ["scarf", "🧣", "목도리"], ["shoes", "👟", "운동화"], ["bag", "🎒", "책가방"], ["medal", "🏅", "금메달"], ["trophy", "🏆", "트로피"],
  ["kite", "🪁", "연"], ["skates", "🛼", "롤러스케이트"], ["guitar", "🎸", "기타"], ["unicorn", "🦄", "유니콘 인형"], ["bear", "🧸", "곰 인형"],
  ["rainbow", "🌈", "무지개"], ["star", "⭐", "반짝 별"], ["icecream", "🍦", "아이스크림"], ["donut", "🍩", "도넛"], ["cupcake", "🧁", "컵케이크"],
  ["balloon", "🎈", "풍선"], ["yoyo", "🪀", "요요"], ["dino", "🦖", "공룡"], ["rocket", "🚀", "로켓"], ["bike", "🚲", "자전거"],
  ["surf", "🏄", "서핑보드"], ["paint", "🎨", "물감"], ["trumpet", "🎺", "트럼펫"], ["camera", "📷", "카메라"], ["telescope", "🔭", "망원경"],
  ["puzzle", "🧩", "퍼즐"], ["wand", "🪄", "요술봉"], ["gift", "🎁", "선물 상자"], ["candy", "🍭", "막대사탕"], ["shell", "🐚", "조개껍데기"],
  ["sunflower", "🌻", "해바라기"], ["butterfly", "🦋", "나비"], ["dolphin", "🐬", "돌고래"], ["parrot", "🦜", "앵무새"], ["ufo", "🛸", "비행접시"],
].map(([id, icon, name]) => ({ id, icon, name }));
// 오늘의 미션 도장 5개마다 받는 특별 아이템 (무작위 아이템에는 안 나옴)
export const SPECIAL = [
  ["grad", "🎓", "학사모"], ["owl", "🦉", "부엉이"], ["goggles", "🥽", "수영 고글"], ["dragon", "🐉", "아기 용"], ["helmet", "⛑️", "구조대 헬멧"],
  ["fox", "🦊", "여우"], ["penguin", "🐧", "펭귄"], ["frog", "🐸", "개구리"],
].map(([id, icon, name]) => ({ id, icon, name, special: true }));
export const itemOf = id => ITEMS.find(x => x.id === id) || SPECIAL.find(x => x.id === id);
export function pickSpecial(owned) {
  const left = SPECIAL.filter(x => !owned.includes(x.id));
  return left.length ? left[Math.floor(Math.random() * left.length)] : pickItem(owned);
}
// 아직 없는 것 중에서 무작위 (다 모았으면 아무거나)
export function pickItem(owned) {
  const left = ITEMS.filter(x => !owned.includes(x.id));
  const pool = left.length ? left : ITEMS;
  return pool[Math.floor(Math.random() * pool.length)];
}
