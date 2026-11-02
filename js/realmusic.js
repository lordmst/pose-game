// 지휘자 게임용 실제 연주 녹음: 위키미디어 공용(Wikimedia Commons)의 퍼블릭 도메인·CC 녹음을 브라우저가 직접 받아 옴
// 받아 온 녹음에서 박자(비트) 시각을 찾아(박자 추적) 지휘 화살표를 맞춤. 못 받으면 합성음으로 대신함
import { audioOut, clock, settings } from "./audio.js?v=37";

// 녹음 목록: 파일 이름, 저장 위치(md5 앞 두 자리), 연주자, 이용 허락, 박자표(한 마디 박 수)
export const RECORDINGS = {
  ode: { file: "Anthem_of_Europe_(US_Navy_instrumental_long_version).ogg", dir: "9/9d", performer: "미 해군 군악대 (U.S. Navy Band)", license: "퍼블릭 도메인", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/", meter: 4 },
  nacht: { file: "Mozart_-_Eine_kleine_Nachtmusik_-_1._Allegro.ogg", dir: "2/24", performer: "Advent Chamber Orchestra", license: "CC BY-SA 2.0 (EFF Open Audio License)", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/", meter: 4 },
  mountain: { file: "Musopen_-_In_the_Hall_Of_The_Mountain_King.ogg", dir: "b/bb", performer: "체코 국립 교향악단 (Musopen)", license: "퍼블릭 도메인", licenseUrl: "https://musopen.org/", meter: 4 },
  turkish: { file: "Mozart-Marsz_turecki-(Romuald_Greiss).ogg", dir: "4/4e", performer: "로무알드 그라이스 (피아노)", license: "퍼블릭 도메인", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/", meter: 2 },
  spring: { file: "Vivaldi_-_Four_Seasons_1_Spring_mvt_1_Allegro_-_John_Harrison_violin.oga", dir: "f/ff", performer: "존 해리슨(바이올린) · 위치토 주립대 체임버 플레이어스", license: "CC BY-SA", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", meter: 4 },
  cancan: { file: "Offenbach_-_Orpheus_in_the_Underworld_-_Overture,_Can_Can_section.ogg", dir: "6/63", performer: "Musopen", license: "퍼블릭 도메인 (CC0)", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", meter: 2 },
};
// 합성음 대신이 없는 곡(실제 녹음만): 노래 고르기 화면에 쓰는 정보. title·by·icon이 있는 녹음
export const extraSongs = synthIds => Object.entries(RECORDINGS).filter(([id, R]) => R.title && !synthIds.includes(id))
  .map(([id, R]) => ({ id, title: R.title, by: R.by, icon: R.icon || "🎼", real: true, synth: false }));
export const pageUrl = id => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(RECORDINGS[id].file)}`;
// 받을 주소: MP3 변환본(아이패드 사파리도 재생) → 원본(ogg). ?realbase=주소 로 시험용 로컬 파일을 쓸 수 있음
function urls(id) {
  const R = RECORDINGS[id], f = encodeURIComponent(R.file), base = new URLSearchParams(location.search).get("realbase");
  if (base) return [`${base}/${id}.wav`];
  return [
    `https://upload.wikimedia.org/wikipedia/commons/transcoded/${R.dir}/${f}/${f}.mp3`,
    `https://upload.wikimedia.org/wikipedia/commons/${R.dir}/${f}`,
  ];
}

const cache = new Map();   // id → Promise<{ buffer, beats, spb, duration } | null>
const done = new Map();    // id → 결과 (준비 끝난 것만)
export const has = id => !!RECORDINGS[id];
export const ready = id => done.get(id) || null;
// 받아서 소리로 풀고 박자 찾기. 실패하면 null (합성음으로 대신)
export function load(id) {
  if (!RECORDINGS[id]) return Promise.resolve(null);
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    const out = audioOut(); if (!out) return null;
    for (const u of urls(id)) {
      try {
        const res = await fetch(u, { mode: "cors" });
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const buffer = await new Promise((ok, no) => out.ac.decodeAudioData(buf, ok, no));
        const { beats, spb } = trackBeats(buffer);
        const r = { buffer, beats, spb, duration: buffer.duration };
        done.set(id, r); return r;
      } catch (e) { /* 다음 주소 시도 */ }
    }
    cache.delete(id); return null;   // 다음에 다시 시도할 수 있게
  })();
  cache.set(id, p);
  return p;
}

/* ---------- 재생 ---------- */
let src = null, gain = null, startAt = 0, curId = null;
// 이미 시작했으면 같은 시작 시각을 돌려줌 (2인이 같은 음악을 씀)
export function start(id) {
  if (src && curId === id) return startAt;
  stop(true);
  const r = ready(id), out = audioOut(); if (!r || !out) return null;
  gain = out.ac.createGain(); gain.gain.value = 0.9; gain.connect(out.dest);
  src = out.ac.createBufferSource(); src.buffer = r.buffer; src.connect(gain);
  startAt = clock() + 0.15; src.start(startAt); curId = id;
  return startAt;
}
export function stop(now = false) {
  if (!src) return;
  const s = src, g = gain, out = audioOut(); src = null; gain = null; curId = null;
  try {
    if (out && !now) { g.gain.setTargetAtTime(0.0001, out.ac.currentTime, 0.15); s.stop(out.ac.currentTime + 0.8); }
    else s.stop();
  } catch (e) {}
}
// 왼손 동작 성공: 잠깐 소리가 커짐 (크레셴도)
export function swell(sec = 3) {
  const out = audioOut(); if (!gain || !out) return;
  const t = out.ac.currentTime; gain.gain.cancelScheduledValues(t);
  gain.gain.setTargetAtTime(1.25, t, 0.25); gain.gain.setTargetAtTime(0.9, t + sec, 0.6);
}
// 노래 고르기 화면 미리 듣기: 받아 둔 것만 앞부분 4초 (아직이면 받기 시작만)
let pv = null;
export function preview(id) {
  stopPreview();
  const r = ready(id), out = audioOut();
  if (!r) { if (settings.bgm || settings.sfx) load(id); return false; }
  const g = out.ac.createGain(), s = out.ac.createBufferSource(), t = out.ac.currentTime;
  s.buffer = r.buffer; s.connect(g); g.connect(out.dest);
  const at = Math.max(0, (r.beats[0] || 0) - 0.3);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t + 0.15); g.gain.setTargetAtTime(0.0001, t + 3.6, 0.2);
  s.start(t, at, 4.5); pv = { s, g };
  return true;
}
export function stopPreview() {
  if (!pv) return; const out = audioOut(); const { s, g } = pv; pv = null;
  try { g.gain.setTargetAtTime(0.0001, out.ac.currentTime, 0.05); s.stop(out.ac.currentTime + 0.3); } catch (e) {}
}

/* ---------- 박자 찾기 (Ellis 2007 동적 계획법 + 구간별 빠르기) ---------- */
function fft(re, im) {   // 제자리 기수-2 FFT
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], xr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, xi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + xr; im[i + k] = ui + xi; re[i + k + len / 2] = ur - xr; im[i + k + len / 2] = ui - xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// 반환: beats = 박 시각(초, 녹음 처음 기준), spb = 박 사이 평균(초)
export function trackBeats(buffer) {
  // 1) 한 채널로 합치고 약 11 kHz로 줄임
  const sr0 = buffer.sampleRate, k = Math.max(1, Math.round(sr0 / 11025)), sr = sr0 / k;
  const chs = []; for (let c = 0; c < buffer.numberOfChannels; c++) chs.push(buffer.getChannelData(c));
  const n = Math.floor(chs[0].length / k), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < k; j++) for (const ch of chs) s += ch[i * k + j]; x[i] = s / (k * chs.length); }
  // 2) 소리 시작 세기(스펙트럼 증가량): 창 512, 간격 128 → 초당 약 86칸
  const N = 512, H = 128, frames = Math.max(1, Math.floor((n - N) / H)), fr = sr / H;
  const bins = Math.min(N / 2, Math.round(5000 / (sr / N)));
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const re = new Float32Array(N), im = new Float32Array(N), prev = new Float32Array(bins), env = new Float32Array(frames), rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0; for (let i = 0; i < N; i++) { const v = x[f * H + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    let flux = 0;
    for (let b = 1; b < bins; b++) { const m = Math.log(1 + 1000 * Math.hypot(re[b], im[b])); const d = m - prev[b]; if (d > 0) flux += d; prev[b] = m; }
    env[f] = flux;
  }
  // 지역 평균 빼고(0.5초), 음수는 0, 표준편차로 나눔
  const half = Math.round(fr * 0.25), o = new Float32Array(frames); let sum = 0;
  { const cs = new Float64Array(frames + 1); for (let i = 0; i < frames; i++) cs[i + 1] = cs[i] + env[i];
    for (let i = 0; i < frames; i++) { const a = Math.max(0, i - half), b = Math.min(frames, i + half + 1); o[i] = Math.max(0, env[i] - (cs[b] - cs[a]) / (b - a)); sum += o[i] * o[i]; } }
  const sd = Math.sqrt(sum / frames) || 1; for (let i = 0; i < frames; i++) o[i] /= sd;
  // 3) 구간별 빠르기: 8초 창을 2초씩 옮기며 자기상관. 처음은 넓게(100 BPM 근처 선호), 그다음은 앞 구간 근처
  const minL = Math.round(fr * 60 / 190), maxL = Math.round(fr * 60 / 45), W = Math.round(fr * 8), step = Math.round(fr * 2);
  const periods = []; let prevL = fr * 0.6;
  for (let s = 0; s < frames; s += step) {
    const a = Math.max(0, Math.min(s, frames - W)), b = Math.min(frames, a + W);
    let best = prevL, bv = -Infinity;
    for (let L = minL; L <= maxL; L++) {
      let ac = 0; for (let i = a; i + L < b; i++) ac += o[i] * o[i + L];
      const oct = Math.log2(L / prevL), w = Math.exp(-0.5 * (oct / (periods.length ? 0.35 : 1.0)) ** 2) * Math.exp(-0.5 * (Math.log2(L / (fr * 0.6)) / 1.2) ** 2);
      if (ac * w > bv) { bv = ac * w; best = L; }
    }
    periods.push(best); prevL = best;
  }
  // 튀는 값은 앞뒤 3개 중앙값으로
  const P = periods.map((_, i) => { const w = periods.slice(Math.max(0, i - 1), i + 2).sort((p, q) => p - q); return w[Math.floor(w.length / 2)]; });
  const periodAt = f => P[Math.min(P.length - 1, Math.floor(f / step))];
  // 4) 동적 계획법: 박 사이가 그 구간 빠르기에 가까울수록, 소리 시작이 셀수록 좋은 점수
  const score = new Float32Array(frames), back = new Int32Array(frames).fill(-1), TIGHT = 100;
  for (let t = 0; t < frames; t++) {
    const L = periodAt(t), lo = Math.max(0, Math.round(t - 2 * L)), hi = Math.round(t - L / 2);
    let bv = 0, bi = -1;
    for (let p = lo; p <= hi; p++) { const v = score[p] - TIGHT * Math.log((t - p) / L) ** 2; if (v > bv || bi < 0) { bv = v; bi = p; } }
    score[t] = o[t] + (bi >= 0 ? bv : 0); back[t] = bi;
  }
  // 끝 부분에서 가장 좋은 곳부터 거꾸로 따라감
  const Lend = periodAt(frames - 1); let t = frames - 1, bt = -Infinity;
  for (let i = Math.max(0, Math.round(frames - Lend)); i < frames; i++) if (score[i] > bt) { bt = score[i]; t = i; }
  const fb = []; while (t >= 0) { fb.push(t); t = back[t]; }
  fb.reverse();
  // 소리가 거의 없는 앞뒤(무음)의 박은 버림
  let peak = 0; for (let i = 0; i < frames; i++) peak = Math.max(peak, rms[i]);
  const loud = f => { let m = 0; for (let i = Math.max(0, f - 4); i < Math.min(frames, f + 5); i++) m = Math.max(m, rms[i]); return m > peak * 0.06; };
  let s0 = 0, s1 = fb.length; while (s0 < s1 && !loud(fb[s0])) s0++; while (s1 > s0 && !loud(fb[s1 - 1])) s1--;
  const beats = fb.slice(s0, s1).map(f => (f * H + N / 2) / sr);
  const gaps = beats.slice(1).map((b, i) => b - beats[i]).sort((p, q) => p - q);
  return { beats, spb: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0.6 };
}
