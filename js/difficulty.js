// 선수별 난이도: 모든 게임에 적용 (2인 대결 때 핸디캡으로도 사용)
export const DIFFS = {
  easy:   { id: "easy",   label: "쉬움",   points: 1,   speed: 0.75, punch: 0.75, hp: 0,  poseTime: 1.35, hold: 0.8, bomb: 0.5, reach: 1.15 },
  normal: { id: "normal", label: "보통",   points: 2,   speed: 1.0,  punch: 1.0,  hp: 0,  poseTime: 1.0,  hold: 1.0, bomb: 1.0, reach: 1.0 },
  hard:   { id: "hard",   label: "어려움", points: 3, speed: 1.3,  punch: 1.15, hp: 1,  poseTime: 0.8,  hold: 1.25, bomb: 1.5, reach: 0.9 },
};
// points: 성공 1번당 점수 배수. 쉬움은 더 많이 성공해도 보통·어려움을 이기기 어렵게 (보통을 이기려면 2배, 어려움은 3배 성공해야 함)
// 별 개수·얼음 개수(기회의 수)는 난이도와 무관하게 같음 → 한 번 성공하기가 얼마나 어려운지만 달라짐
// speed: 풍선·별 속도 배수 · punch: 얼음 타격 기준 속도 배수 · hp: 얼음 타격 수 가감
// poseTime: 따라쟁이 제한시간 배수 · hold: 자세 유지시간 배수 · bomb: 폭탄 확률 배수 · reach: 별 잡는 범위 배수
export const diffOf = id => DIFFS[id] || DIFFS.normal;
