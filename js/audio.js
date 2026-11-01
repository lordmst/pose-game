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
let rTimer = null, rStart = 0, rSpb = 0.6, rStep = 0, rNext = 0, rGain = null, rSeed = 1;
const R_BASS = [36, 0, 36, 0, 43, 0, 41, 0];
const R_LEAD = [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 76, 0, 79, 81, 79, 0];
function rSchedule() {
  if (!ac || !rGain) return;
  const half = rSpb / 2;
  while (rNext < ac.currentTime + 0.12) {
    const i = rStep, beat = i % 2 === 0, inBar = (i / 2) % 4;
    if (beat) tone(140, rNext, 0.12, { vol: 0.5, slide: 0.35, dest: rGain });                       // 쿵 (매 박)
    if (beat && (inBar === 1 || inBar === 3)) noise(rNext, 0.12, { vol: 0.35, freq: 1800, q: 0.7, dest: rGain });   // 짝 (2·4박)
    noise(rNext, 0.03, { vol: 0.08, type: "highpass", freq: 7000, dest: rGain });                   // 칙 (반 박)
    const b = R_BASS[i % 8]; if (b && i >= 8) tone(midi(b), rNext, half * 1.6, { type: "triangle", vol: 0.18, dest: rGain });
    const l = R_LEAD[i % 16]; if (l && i >= 16) tone(midi(l), rNext, half * 0.9, { type: "square", vol: 0.035, dest: rGain });
    rNext += half; rStep++;
  }
}
export const rhythm = {
  // 이미 시작했으면 같은 시작 시각을 돌려줌 (2인 공유)
  start(bpm) {
    if (rTimer || rStart > 0) return rStart;
    rSpb = 60 / bpm; rSeed = 1 + Math.floor(Math.random() * 1e6);
    rStart = clock() + 0.15;
    if (ac && (settings.bgm || settings.sfx)) {
      rGain = ac.createGain(); rGain.gain.value = 0.6; rGain.connect(settings.bgm ? musicBus : sfxBus);   // 배경음악을 꺼도 박자는 들리게
      rStep = 0; rNext = rStart; rTimer = setInterval(rSchedule, 25);
    }
    return rStart;
  },
  stop() {
    clearInterval(rTimer); rTimer = null; rStart = 0;
    if (rGain && ac) { const g = rGain; g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05); setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 400); }
    rGain = null;
  },
  get spb() { return rSpb; },
  get seed() { return rSeed; },
};
