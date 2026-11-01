// 효과음 · 배경음악 · 음성 (외부 파일 없이 브라우저에서 합성)
// 켜기/끄기와 크기(0~1)를 따로 둠. 음성은 기기 음성 엔진으로 나가므로 크기는 말할 때마다 전달
export const settings = { sfx: true, bgm: true, tts: true, vol: { sfx: 0.8, bgm: 0.5, voice: 0.8 } };
let sfxBus = null, musicBus = null;
export function applyVolumes() {
  if (!ac) return;
  const t = ac.currentTime;
  sfxBus.gain.setTargetAtTime(settings.sfx ? settings.vol.sfx : 0, t, 0.03);
  musicBus.gain.setTargetAtTime(settings.bgm ? settings.vol.bgm * 1.6 : 0, t, 0.03);
}
let ac = null, master = null, noiseBuf = null, bgmGain = null;

export function unlock() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.connect(master);        // 효과음 크기
      musicBus = ac.createGain(); musicBus.connect(master);    // 배경음악·리듬 반주 크기
      applyVolumes();
      const len = ac.sampleRate; noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
  } catch (e) {}
  // iOS는 첫 터치 때 한 번 말해 둬야 이후 음성이 나옴
  try { if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
}

function tone(freq, t0, dur, { type = "sine", vol = 0.3, slide = 0, attack = 0.005, dest } = {}) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest || sfxBus); o.start(t0); o.stop(t0 + dur + 0.03);
}
function noise(t0, dur, { vol = 0.3, type = "bandpass", freq = 1000, q = 1, dest } = {}) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(dest || sfxBus); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.03);
}
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];
const comboNote = i => { i = Math.min(i, 14); return 523.25 * Math.pow(2, (12 * Math.floor(i / 5) + PENTA[i % 5]) / 12); };
const play = fn => { if (!settings.sfx || !ac) return; try { if (ac.state === "suspended") ac.resume(); fn(ac.currentTime); } catch (e) {} };

export const sfx = {
  pop: () => play(t => { noise(t, 0.12, { vol: 0.7, type: "highpass", freq: 1400 }); tone(190, t, 0.12, { vol: 0.5, slide: 0.4 }); }),
  hit: (n = 1) => play(t => { noise(t, 0.08, { vol: 0.5, freq: 2600, q: 2 }); tone(1600 + n * 450, t, 0.09, { type: "triangle", vol: 0.15 }); tone(130, t, 0.1, { vol: 0.45, slide: 0.5 }); }),
  shatter: () => play(t => {
    noise(t, 0.5, { vol: 0.7, type: "highpass", freq: 1800 }); tone(95, t, 0.22, { vol: 0.55, slide: 0.5 });
    for (let i = 0; i < 10; i++) tone(2200 + Math.random() * 3800, t + Math.random() * 0.35, 0.08, { vol: 0.1 });
  }),
  catch: (combo = 0) => play(t => { const f = comboNote(combo); tone(f, t, 0.12, { type: "triangle", vol: 0.26 }); tone(f * 2, t + 0.06, 0.18, { vol: 0.14 }); }),
  bad: () => play(t => { tone(240, t, 0.28, { type: "square", vol: 0.1, slide: 0.5 }); }),
  bomb: () => play(t => { noise(t, 0.7, { vol: 0.9, type: "lowpass", freq: 700 }); tone(75, t, 0.55, { vol: 0.6, slide: 0.4 }); }),
  tick: () => play(t => tone(880, t, 0.12, { type: "square", vol: 0.12 })),
  go: () => play(t => { tone(1320, t, 0.4, { type: "square", vol: 0.13 }); tone(660, t, 0.4, { type: "triangle", vol: 0.22 }); }),
  select: () => play(t => { tone(660, t, 0.08, { type: "triangle", vol: 0.22 }); tone(990, t + 0.07, 0.12, { type: "triangle", vol: 0.22 }); }),
  fever: () => play(t => [0, 4, 7, 12, 16, 19].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), t + i * 0.06, 0.2, { type: "square", vol: 0.09 }))),
  step: (alt = 0) => play(t => { tone(alt ? 150 : 175, t, 0.07, { vol: 0.3, slide: 0.6 }); noise(t, 0.05, { vol: 0.15, freq: 500 }); }),
  slice: () => play(t => { noise(t, 0.14, { vol: 0.5, type: "highpass", freq: 3000 }); tone(900, t, 0.1, { type: "triangle", vol: 0.12, slide: 0.5 }); }),
  squish: () => play(t => { noise(t, 0.18, { vol: 0.45, freq: 700, q: 1.5 }); tone(260, t, 0.12, { vol: 0.25, slide: 0.6 }); }),
  bonk: () => play(t => { tone(420, t, 0.12, { type: "square", vol: 0.16, slide: 0.45 }); noise(t, 0.06, { vol: 0.4, freq: 1800, q: 3 }); }),
  thud: () => play(t => { tone(70, t, 0.35, { vol: 0.7, slide: 0.5 }); noise(t, 0.3, { vol: 0.5, type: "lowpass", freq: 400 }); }),
  whoosh: () => play(t => { noise(t, 0.35, { vol: 0.35, freq: 900, q: 0.8 }); }),
  fanfare: () => play(t => {
    [[0, 0], [4, 0.13], [7, 0.26], [12, 0.39]].forEach(([s, d]) => tone(523.25 * Math.pow(2, s / 12), t + d, 0.3, { type: "triangle", vol: 0.25 }));
    tone(1046.5, t + 0.52, 0.7, { type: "triangle", vol: 0.22 }); tone(1318.5, t + 0.52, 0.7, { vol: 0.12 });
  }),
};

/* ---------- 배경음악: 32스텝 반복 ---------- */
const BASS = [48, 0, 48, 0, 55, 0, 55, 0, 53, 0, 53, 0, 55, 0, 52, 0];
const LEAD = [72, 0, 74, 76, 0, 79, 76, 0, 74, 0, 72, 74, 0, 76, 0, 0, 79, 0, 81, 79, 0, 76, 74, 0, 72, 0, 74, 0, 72, 0, 0, 0];
let timer = null, step = 0, nextT = 0, tempo = 1;
function schedule() {
  if (!ac || !bgmGain) return;
  const spb = 60 / (132 * tempo) / 2;
  while (nextT < ac.currentTime + 0.12) {
    const i = step % 32, b = BASS[i % 16], l = LEAD[i];
    if (b) tone(midi(b), nextT, spb * 1.6, { type: "triangle", vol: 0.16, dest: bgmGain });
    if (l) tone(midi(l), nextT, spb * 0.9, { type: "square", vol: 0.04, dest: bgmGain });
    if (i % 2 === 0) noise(nextT, 0.03, { vol: 0.05, type: "highpass", freq: 7000, dest: bgmGain });
    nextT += spb; step++;
  }
}
export const bgm = {
  start() {
    if (!settings.bgm || !ac || timer) return;
    bgmGain = ac.createGain(); bgmGain.gain.value = 0.55; bgmGain.connect(musicBus);
    step = 0; nextT = ac.currentTime + 0.05; timer = setInterval(schedule, 25);
  },
  stop() {
    clearInterval(timer); timer = null;
    if (bgmGain && ac) { const g = bgmGain; g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08); setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 600); }
    bgmGain = null; tempo = 1;
  },
  setTempo(m) { tempo = m; },
};

export function speak(text, queue = false, lang = "ko-KR") {
  if (!settings.tts || !("speechSynthesis" in window)) return;
  try {
    if (!queue) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = lang === "ko-KR" ? 1.0 : 0.8; u.volume = settings.vol.voice;   // 아이폰·아이패드는 크기 지정이 무시됨
    speechSynthesis.speak(u);
  } catch (e) {}
}
export function stopSpeak() { try { speechSynthesis.cancel(); } catch (e) {} }

/* ---------- 공용 시계 · 리듬 게임 반주 ----------
   리듬 게임은 소리와 음표가 정확히 맞아야 하므로 오디오 시계를 기준으로 함.
   두 선수가 같은 반주·같은 음표 패턴을 쓰도록 시작 시각과 씨앗값을 공유 */
export const clock = () => (ac ? ac.currentTime : performance.now() / 1000);
let rTimer = null, rStart = 0, rSpb = 0.6, rStep = 0, rNext = 0, rGain = null, rSeed = 1, rSong = null, pGain = null;
let rOrch = false, rAccentUntil = -1;          // 지휘자 게임: 관현악 소리, 금관 강조(파트 지시 성공 시)
const rLevels = {};                            // 선수별 음악 크기(지휘가 맞을수록 큼). 2인은 평균

/* ---------- 리듬 게임 곡 ----------
   멜로디 표기: "음이름옥타브:길이" (길이는 반 박 단위, 2 = 한 박), "-:2"는 쉼표
   bass: 반 마디(두 박)마다 바뀌는 근음, 공백으로 구분
   곡은 저작권이 끝난 옛 노래(작은별·런던 다리·환희의 송가·징글벨)와 직접 만든 곡만 씀 */
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const noteNum = n => { const m = n.match(/^([A-G])(#|b)?(\d)$/); return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0); };
const mel = str => str.replace(/\|/g, " ").trim().split(/\s+/).map(t => { const [n, l] = t.split(":"); return [n === "-" ? 0 : noteNum(n), +l || 2]; });
const INTRO = 16;    // 반 박 16개(2마디): 1마디는 북만, 2마디는 베이스까지, 그다음 멜로디
export const SONGS = [
  { id: "basic", title: "신나는 박자", icon: "🥁", bpm: 100, drums: "pop", bassStyle: "beat", lead: ["square", 0.035],
    bass: "C C G F C F G G",
    melody: mel("C5:2 E5:2 G5:2 E5:1 D5:1 C5:2 E5:2 G5:1 A5:1 G5:2 | A5:2 G5:2 E5:2 G5:1 A5:1 G5:2 E5:2 D5:2 -:2") },
  { id: "twinkle", title: "반짝반짝 작은별", icon: "⭐", bpm: 92, drums: "soft", bassStyle: "half", lead: ["triangle", 0.13],
    bass: "C C F C F C G C C F C G C F C G C C F C F C G C",
    melody: mel(`C5:2 C5:2 G5:2 G5:2 A5:2 A5:2 G5:4 F5:2 F5:2 E5:2 E5:2 D5:2 D5:2 C5:4
                 G5:2 G5:2 F5:2 F5:2 E5:2 E5:2 D5:4 G5:2 G5:2 F5:2 F5:2 E5:2 E5:2 D5:4
                 C5:2 C5:2 G5:2 G5:2 A5:2 A5:2 G5:4 F5:2 F5:2 E5:2 E5:2 D5:2 D5:2 C5:4`) },
  { id: "london", title: "런던 다리", icon: "🌉", bpm: 104, drums: "pop", bassStyle: "beat", lead: ["square", 0.045],
    bass: "C C C C G G C C C C C C G G C C",
    melody: mel(`G5:2 A5:2 G5:2 F5:2 E5:2 F5:2 G5:4 D5:2 E5:2 F5:4 E5:2 F5:2 G5:4
                 G5:2 A5:2 G5:2 F5:2 E5:2 F5:2 G5:4 D5:4 G5:4 E5:2 C5:6`) },
  { id: "ode", title: "환희의 송가", icon: "🎻", bpm: 112, drums: "pop", bassStyle: "beat", lead: ["triangle", 0.12],
    bass: "C C G G C C G G C C G G C C G C G G G C G C C G C C G G C C G C",
    melody: mel(`E5:2 E5:2 F5:2 G5:2 G5:2 F5:2 E5:2 D5:2 C5:2 C5:2 D5:2 E5:2 E5:3 D5:1 D5:4
                 E5:2 E5:2 F5:2 G5:2 G5:2 F5:2 E5:2 D5:2 C5:2 C5:2 D5:2 E5:2 D5:3 C5:1 C5:4
                 D5:2 D5:2 E5:2 C5:2 D5:2 E5:1 F5:1 E5:2 C5:2 D5:2 E5:1 F5:1 E5:2 D5:2 C5:2 D5:2 G4:4
                 E5:2 E5:2 F5:2 G5:2 G5:2 F5:2 E5:2 D5:2 C5:2 C5:2 D5:2 E5:2 D5:3 C5:1 C5:4`) },
  { id: "jingle", title: "징글벨", icon: "🔔", bpm: 120, drums: "jingle", bassStyle: "beat", lead: ["square", 0.045],
    bass: "C C C C C C C C F F C C D D G G C C C C C C C C F F C C G G C C",
    melody: mel(`E5:2 E5:2 E5:4 E5:2 E5:2 E5:4 E5:2 G5:2 C5:3 D5:1 E5:8
                 F5:2 F5:2 F5:3 F5:1 F5:2 E5:2 E5:2 E5:1 E5:1 E5:2 D5:2 D5:2 E5:2 D5:4 G5:4
                 E5:2 E5:2 E5:4 E5:2 E5:2 E5:4 E5:2 G5:2 C5:3 D5:1 E5:8
                 F5:2 F5:2 F5:2 F5:2 F5:2 E5:2 E5:2 E5:1 E5:1 G5:2 G5:2 F5:2 D5:2 C5:8`) },
  { id: "dance", title: "댄스 파티", icon: "🪩", bpm: 128, drums: "dance", bassStyle: "pump", lead: ["square", 0.04],
    bass: "A A C C A A G G F F C C F F E E",
    melody: mel(`A4:1 C5:1 E5:2 D5:1 C5:1 D5:2 E5:2 G5:1 E5:1 D5:2 C5:2 A4:1 C5:1 E5:2 D5:1 C5:1 A4:2 G4:2 A4:2 C5:2 -:2
                 A5:2 G5:1 E5:1 G5:2 A5:2 G5:1 E5:1 D5:2 E5:2 -:2 C5:1 D5:1 E5:2 G5:1 E5:1 D5:2 C5:2 B4:2 A4:4`) },
];
// 지휘자 게임용 클래식 (모두 저작권이 끝난 작품). 오케스트라 소리로 연주
export const CLASSICS = [
  { id: "ode", title: "환희의 송가", by: "베토벤", icon: "🎻", bpm: 112, drums: "pop", bassStyle: "beat", lead: ["triangle", 0.12],
    bass: SONGS.find(x => x.id === "ode").bass, melody: SONGS.find(x => x.id === "ode").melody },
  { id: "nacht", title: "아이네 클라이네 나흐트무지크", by: "모차르트", icon: "🎶", bpm: 120, drums: "pop", bassStyle: "beat", lead: ["triangle", 0.12],
    bass: "G G G G D D D D G G G G D D D G",
    melody: mel(`G4:2 -:1 D4:1 G4:2 -:1 D4:1 G4:1 D4:1 G4:1 B4:1 D5:4 C5:2 -:1 A4:1 C5:2 -:1 A4:1 C5:1 A4:1 F#4:1 A4:1 D4:4
                 G4:2 -:1 D4:1 G4:2 -:1 D4:1 G4:1 D4:1 G4:1 B4:1 D5:4 C5:2 -:1 A4:1 C5:2 -:1 A4:1 C5:1 A4:1 F#4:1 A4:1 G4:4`) },
  { id: "mountain", title: "산왕의 궁전에서", by: "그리그", icon: "⛰️", bpm: 116, drums: "pop", bassStyle: "beat", lead: ["triangle", 0.12],
    bass: "B B F# F# B B F# F# F# F# C# C# F# F# C# F#",
    melody: mel(`B4:1 C#5:1 D5:1 E5:1 F#5:1 D5:1 F#5:2 F5:1 C#5:1 F5:2 E5:1 C5:1 E5:2 B4:1 C#5:1 D5:1 E5:1 F#5:1 D5:1 F#5:1 B5:1 A5:1 F#5:1 D5:1 F#5:1 A5:4
                 F#4:1 G#4:1 A#4:1 B4:1 C#5:1 A#4:1 C#5:2 D5:1 A#4:1 D5:2 C#5:1 A#4:1 C#5:2 F#4:1 G#4:1 A#4:1 B4:1 C#5:1 A#4:1 C#5:1 F#5:1 E5:1 C#5:1 A#4:1 C#5:1 E5:4`) },
  { id: "turkish", title: "터키 행진곡", by: "모차르트", icon: "🥁", bpm: 116, drums: "pop", bassStyle: "beat", lead: ["triangle", 0.12],
    bass: "A A A A E E A A A A A A E E E A",
    melody: mel(`B4:1 A4:1 G#4:1 A4:1 C5:4 D5:1 C5:1 B4:1 C5:1 E5:4 F5:1 E5:1 D#5:1 E5:1 B5:1 A5:1 G#5:1 A5:1 B5:1 A5:1 G#5:1 A5:1 C6:4
                 B4:1 A4:1 G#4:1 A4:1 C5:4 D5:1 C5:1 B4:1 C5:1 E5:4 F5:1 E5:1 D#5:1 E5:1 B5:1 A5:1 G#5:1 A5:1 B4:1 A4:1 G#4:1 B4:1 A4:4`) },
  { id: "canon", title: "캐논", by: "파헬벨", icon: "🎻", bpm: 80, drums: "soft", bassStyle: "half", lead: ["triangle", 0.12],
    bass: "D A B F# G D G A D A B F# G D G A",
    melody: mel(`F#5:4 E5:4 D5:4 C#5:4 B4:4 A4:4 B4:4 C#5:4 D5:4 C#5:4 B4:4 A4:4 G4:4 F#4:4 G4:4 E4:4`) },
  { id: "cancan", title: "캉캉 (천국과 지옥)", by: "오펜바흐", icon: "💃", bpm: 132, drums: "pop", bassStyle: "beat", lead: ["triangle", 0.12],
    bass: "C C C C G G C G C C C C G G G C",
    melody: mel(`C5:2 -:2 D5:1 F5:1 E5:1 D5:1 G5:2 G5:2 G5:1 A5:1 E5:1 F5:1 D5:2 D5:2 D5:1 F5:1 E5:1 D5:1 C5:1 C6:1 B5:1 A5:1 G5:1 F5:1 E5:1 D5:1
                 C5:2 -:2 D5:1 F5:1 E5:1 D5:1 G5:2 G5:2 G5:1 A5:1 E5:1 F5:1 D5:2 D5:2 D5:1 F5:1 E5:1 D5:1 C5:1 G5:1 D5:1 E5:1 C5:4`) },
];
// 곡을 반 박 단위 칸으로 펼침: 칸마다 [음, 길이] 또는 null. 베이스 근음은 F# 같은 올림·내림표도 읽음
for (const S of [...SONGS, ...CLASSICS]) {
  S.steps = []; for (const [n, l] of S.melody) { S.steps.push(n ? [n, l] : null); for (let i = 1; i < l; i++) S.steps.push(null); }
  S.roots = S.bass.split(/\s+/).map(c => 36 + NOTE[c[0]] + (c[1] === "#" ? 1 : c[1] === "b" ? -1 : 0));
}
export const songOf = id => SONGS.find(s => s.id === id) || CLASSICS.find(s => s.id === id) || SONGS[0];
// 반 박 번호 j에 시작하는 멜로디 음 (게임의 음표 위치로 씀)
export function onsetAt(song, j) { const k = j - INTRO; return k < 0 ? null : song.steps[k % song.steps.length]; }

function drum(style, i, t, half, dest) {
  const beat = i % 2 === 0, inBar = (i / 2) % 4, back = beat && (inBar === 1 || inBar === 3);
  const kick = v => tone(140, t, 0.12, { vol: v, slide: 0.35, dest });
  const hat = (v, d = 0.03) => noise(t, d, { vol: v, type: "highpass", freq: 7000, dest });
  if (style === "soft") {
    if (beat && (inBar === 0 || inBar === 2)) kick(0.35);
    if (back) tone(900, t, 0.04, { type: "triangle", vol: 0.08, dest });
    if (beat) hat(0.05);
  } else if (style === "dance") {
    if (beat) kick(0.6);
    if (back) { noise(t, 0.14, { vol: 0.32, freq: 1500, q: 0.8, dest }); noise(t + 0.012, 0.12, { vol: 0.25, freq: 1300, q: 0.8, dest }); }
    if (!beat) hat(0.13, 0.09);
  } else {
    if (beat) kick(0.5);
    if (back) noise(t, 0.12, { vol: 0.35, freq: 1800, q: 0.7, dest });
    hat(0.08);
    if (style === "jingle") noise(t, 0.09, { vol: 0.12, type: "highpass", freq: 5500, dest });   // 방울 소리
  }
}
function rSchedule() {
  if (!ac || !rGain || !rSong) return;
  const half = rSpb / 2, S = rSong;
  while (rNext < ac.currentTime + 0.12) {
    const i = rStep, k = i - INTRO;
    if (rOrch) {     // 관현악: 팀파니(1·3박), 현악 지속음, 멜로디는 부드럽게 두 겹, 강조 구간엔 금관
      const beat = i % 2 === 0, inBar = (i / 2) % 4;
      if (beat && (inBar === 0 || inBar === 2)) tone(inBar ? 82 : 65, rNext, 0.45, { type: "triangle", vol: 0.32, slide: 0.85, dest: rGain });
      if (k >= -8 && i % 8 === 0) {
        const root = S.roots[Math.floor((((k % S.steps.length) + S.steps.length) % S.steps.length) / 4) % S.roots.length];
        [0, 7, 16].forEach(iv => tone(midi(root + 12 + iv), rNext, half * 7.6, { type: "sine", vol: 0.05, attack: 0.25, dest: rGain }));
        tone(midi(root), rNext, half * 7.6, { type: "triangle", vol: 0.15, attack: 0.06, dest: rGain });
      }
      const o = onsetAt(S, i);
      if (o) {
        const d = half * o[1] * 0.95;
        tone(midi(o[0]), rNext, d, { type: "triangle", vol: 0.15, attack: 0.03, dest: rGain });
        tone(midi(o[0] - 12), rNext, d, { type: "sine", vol: 0.07, attack: 0.05, dest: rGain });
        if (i < rAccentUntil) tone(midi(o[0] - 12), rNext, d, { type: "square", vol: 0.045, attack: 0.02, dest: rGain });
      }
      rNext += half; rStep++; continue;
    }
    drum(S.drums, i, rNext, half, rGain);
    if (k >= -8) {   // 베이스는 멜로디 한 마디 전부터
      const root = S.roots[Math.floor((((k % S.steps.length) + S.steps.length) % S.steps.length) / 4) % S.roots.length];
      if (S.bassStyle === "pump") tone(midi(root + (i % 2 ? 12 : 0)), rNext, half * 0.8, { type: "triangle", vol: 0.17, dest: rGain });
      else if (S.bassStyle === "half") { if (i % 4 === 0) tone(midi(root), rNext, half * 3.2, { type: "triangle", vol: 0.17, dest: rGain }); }
      else if (i % 2 === 0) tone(midi(root), rNext, half * 1.6, { type: "triangle", vol: 0.18, dest: rGain });
    }
    const o = onsetAt(S, i);
    if (o) tone(midi(o[0]), rNext, half * o[1] * 0.92, { type: S.lead[0], vol: S.lead[1], dest: rGain });
    rNext += half; rStep++;
  }
}
export const rhythm = {
  // 이미 시작했으면 같은 시작 시각을 돌려줌 (2인 공유)
  start(songId, { orch = false } = {}) {
    if (rTimer || rStart > 0) return rStart;
    rhythm.stopPreview(); rOrch = orch; rAccentUntil = -1; for (const k in rLevels) delete rLevels[k];
    rSong = songOf(songId); rSpb = 60 / rSong.bpm; rSeed = 1 + Math.floor(Math.random() * 1e6);
    rStart = clock() + 0.15;
    if (ac && (settings.bgm || settings.sfx)) {
      rGain = ac.createGain(); rGain.gain.value = 0.6; rGain.connect(settings.bgm ? musicBus : sfxBus);   // 배경음악을 꺼도 박자는 들리게
      rStep = 0; rNext = rStart; rTimer = setInterval(rSchedule, 25);
    }
    return rStart;
  },
  // 지휘자 게임: 선수별 음악 크기(0~1). 지휘를 멈추면 오케스트라 소리가 작아짐
  level(slot, x) {
    rLevels[slot] = x;
    if (!rGain || !ac) return;
    const vals = Object.values(rLevels), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    rGain.gain.setTargetAtTime(0.6 * (0.3 + 0.7 * avg), ac.currentTime, 0.15);
  },
  accent(steps) { rAccentUntil = Math.max(rAccentUntil, rStep + steps); },   // 금관 강조 (반 박 단위)
  stop() {
    clearInterval(rTimer); rTimer = null; rStart = 0;
    if (rGain && ac) { const g = rGain; g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05); setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 400); }
    rGain = null;
  },
  // 곡 고를 때 앞부분 미리 듣기 (약 3초)
  preview(songId) {
    rhythm.stopPreview();
    if (!ac || !(settings.bgm || settings.sfx)) return;
    const S = songOf(songId), half = 30 / S.bpm;
    pGain = ac.createGain(); pGain.gain.value = 0.6; pGain.connect(settings.bgm ? musicBus : sfxBus);
    let t = ac.currentTime + 0.05, k = 0;
    while (k * half < 3.2 && k < S.steps.length) {
      const o = S.steps[k];
      if (o) tone(midi(o[0]), t + k * half, half * o[1] * 0.92, { type: S.lead[0], vol: S.lead[1], dest: pGain });
      if (k % 4 === 0) tone(midi(S.roots[Math.floor(k / 4) % S.roots.length]), t + k * half, half * 1.6, { type: "triangle", vol: 0.16, dest: pGain });
      k++;
    }
  },
  stopPreview() {
    if (pGain && ac) { const g = pGain; g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.03); setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 300); }
    pGain = null;
  },
  get spb() { return rSpb; },
  get seed() { return rSeed; },
  get song() { return rSong; },
  INTRO,
};
