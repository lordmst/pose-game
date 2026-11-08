// 지휘자 게임용 실제 연주 녹음: 위키미디어 공용(Wikimedia Commons)의 퍼블릭 도메인·CC 녹음을 브라우저가 직접 받아 옴
// 받아 온 녹음에서 박자(비트) 시각을 찾아(박자 추적) 지휘 화살표를 맞춤. 못 받으면 합성음으로 대신함
import { audioOut, clock, settings } from "./audio.js?v=75";

// 녹음 목록: 파일 이름, 저장 위치(md5 앞 두 자리), 연주자, 이용 허락, 박자표(한 마디 박 수: 2·3·4)
export const RECORDINGS = {
  ode: { file: "Anthem_of_Europe_(US_Navy_instrumental_long_version).ogg", dir: "9/9d", performer: "미 해군 군악대 (U.S. Navy Band)", license: "퍼블릭 도메인", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/", meter: 4 },
  nacht: { file: "Mozart_-_Eine_kleine_Nachtmusik_-_1._Allegro.ogg", dir: "2/24", performer: "Advent Chamber Orchestra", license: "CC BY-SA 2.0 (EFF Open Audio License)", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/", meter: 4 },
  mountain: { file: "Musopen_-_In_the_Hall_Of_The_Mountain_King.ogg", dir: "b/bb", performer: "체코 국립 교향악단 (Musopen)", license: "퍼블릭 도메인", licenseUrl: "https://musopen.org/", meter: 4 },
  turkish: { file: "Mozart-Marsz_turecki-(Romuald_Greiss).ogg", dir: "4/4e", performer: "로무알드 그라이스 (피아노)", license: "퍼블릭 도메인", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/", meter: 2 },
  spring: { file: "Vivaldi_-_Four_Seasons_1_Spring_mvt_1_Allegro_-_John_Harrison_violin.oga", dir: "f/ff", performer: "존 해리슨(바이올린) · 위치토 주립대 체임버 플레이어스", license: "CC BY-SA", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", meter: 4 },
  cancan: { file: "Offenbach_-_Orpheus_in_the_Underworld_-_Overture,_Can_Can_section.ogg", dir: "6/63", performer: "Musopen", license: "퍼블릭 도메인 (CC0)", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", meter: 2 },
  // ↓ 실제 녹음만 있는 곡 (합성음 대신 없음): title·by·icon으로 노래 고르기 화면에 나옴. from: 이 초부터 틂
  williamtell: { title: "윌리엄 텔 서곡 (피날레)", by: "로시니", icon: "🏇", file: "Gioachino_Rossini,_William_Tell_Overture_(military_band_version,_2000).ogg", dir: "4/43", from: 450, performer: "미 해병대 군악대 (U.S. Marine Corps Band)", license: "퍼블릭 도메인", licenseUrl: "https://commons.wikimedia.org/wiki/Template:PD-USGov-Military-Marines", meter: 2 },
  radetzky: { title: "라데츠키 행진곡", by: "요한 슈트라우스 1세", icon: "👏", file: "Radetzky_March.ogg", dir: "b/b4", performer: "미 해병대 군악대 (U.S. Marine Band)", license: "퍼블릭 도메인", licenseUrl: "https://commons.wikimedia.org/wiki/Template:PD-USGov-Military-Marines", meter: 2 },
  beethoven5: { title: "운명 교향곡 1악장", by: "베토벤", icon: "✊", file: "Ludwig_van_Beethoven_-_Symphonie_5_c-moll_-_1._Allegro_con_brio.ogg", dir: "5/5b", performer: "풀다 교향악단 (Fulda Symphonic Orchestra)", license: "EFF Open Audio License (CC BY-SA 호환)", licenseUrl: "https://www.eff.org/IP/Open_licenses/eff_oal.php", meter: 2 },
  stars: { title: "성조기여 영원하라 (끝부분)", by: "수자", icon: "🎺", file: "Grandioso_of_Stars_and_Stripes_Forever_-_U.S._Army_Band.ogg", dir: "f/f0", performer: "미 육군 군악대 (U.S. Army Band)", license: "퍼블릭 도메인", licenseUrl: "https://commons.wikimedia.org/wiki/Template:PD-USGov-Military-Army", meter: 2 },
  washpost: { title: "워싱턴 포스트 행진곡", by: "수자", icon: "🥁", file: "Washington_Post_March_-_U.S._Army_Band.ogg", dir: "f/fb", performer: "미 육군 군악대 (U.S. Army Band)", license: "퍼블릭 도메인", licenseUrl: "https://commons.wikimedia.org/wiki/Template:PD-USGov-Military-Army", meter: 2 },
  tortoise: { title: "동물의 사육제 중 거북이", by: "생상스", icon: "🐢", file: "Saint-Saens_-_The_Carnival_of_the_Animals_-_04_Tortues.ogg", dir: "2/21", performer: "시애틀 청소년 교향악단 (Seattle Youth Symphony)", license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/", meter: 4 },
  mozart40: { title: "교향곡 40번 1악장", by: "모차르트", icon: "🎼", file: "Wolfgang_Amadeus_Mozart_-_Symphony_40_g-moll_-_1._Molto_allegro.ogg", dir: "9/99", performer: "풀다 교향악단 (Fulda Symphonic Orchestra)", license: "EFF Open Audio License (CC BY-SA 호환)", licenseUrl: "https://www.eff.org/IP/Open_licenses/eff_oal.php", meter: 2 },
  hungarian6: { title: "헝가리 무곡 6번", by: "브람스", icon: "💃", file: "Johannes_Brahms_-_Ungarischer_Tanz_6_D-Dur.ogg", dir: "d/df", performer: "풀다 교향악단 (Fulda Symphonic Orchestra)", license: "EFF Open Audio License (CC BY-SA 호환)", licenseUrl: "https://www.eff.org/IP/Open_licenses/eff_oal.php", meter: 2 },
  waltz: { title: "슈트라우스 왈츠 메들리", by: "요한 슈트라우스 2세", icon: "🩰", file: "USAF_Band_Strauss_Waltz_Medley.ogg", dir: "4/48", performer: "미 공군 현악단 (U.S. Air Force Strings)", license: "퍼블릭 도메인", licenseUrl: "https://commons.wikimedia.org/wiki/Template:PD-USGov-Military-Air_Force", meter: 3 },
  airg: { title: "G선상의 아리아", by: "바흐", icon: "🎻", file: "Air_-_Air_Force_Strings_-_United_States_Air_Force_Band.mp3", dir: "e/ec", performer: "미 공군 현악단 (U.S. Air Force Strings)", license: "퍼블릭 도메인", licenseUrl: "https://commons.wikimedia.org/wiki/Template:PD-USGov-Military-Air_Force", meter: 4 },
  summer: { title: "사계 중 여름 1악장", by: "비발디", icon: "☀️", file: "Vivaldi_-_Four_Seasons_2_Summer_mvt_1_Allegro_non_molto_-_John_Harrison_violin.oga", dir: "a/a5", performer: "존 해리슨(바이올린) · 위치토 주립대 체임버 플레이어스", license: "CC BY-SA", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", meter: 3 },
  winter: { title: "사계 중 겨울 3악장", by: "비발디", icon: "❄️", file: "12_-_Vivaldi_Winter_mvt_3_Allegro_-_John_Harrison_violin.ogg", dir: "2/21", performer: "존 해리슨(바이올린) · 위치토 주립대 체임버 플레이어스", license: "CC BY-SA", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", meter: 3 },
  // ↓ 리듬 박자용 신나는 무료 음원 (CC BY · CC0). 화면에 곡명·작곡자·이용 허락 표시
  monkeys: { game: "rhythm", title: "빙글빙글 원숭이", by: "무료 음원", icon: "🐒", file: "Monkeys_Spinning_Monkeys_by_Kevin_MacLeod.ogg", dir: "f/fe", performer: "Kevin MacLeod (incompetech.com)", license: "CC BY", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", meter: 4 },
  pixelpolka: { game: "rhythm", title: "픽셀 폴카", by: "무료 음원", icon: "👾", file: "Kevin_MacLeod_-_Pixel_Peeker_Polka_-_faster.ogg", dir: "f/f6", performer: "Kevin MacLeod (incompetech.com)", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", meter: 4 },
  duck: { game: "rhythm", title: "꽥꽥 오리", by: "무료 음원", icon: "🦆", file: "Kevin_MacLeod_-_Fluffing_a_Duck.ogg", dir: "c/c3", performer: "Kevin MacLeod (incompetech.com)", license: "CC BY", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", meter: 4 },
  meowsic: { game: "rhythm", title: "고양이 댄스 대회", by: "무료 음원", icon: "🐱", file: "Komiku_-_18_-_Dance_contest_to_the_meowsic.ogg", dir: "4/48", performer: "Komiku", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", meter: 4 },
  osaka: { game: "rhythm", title: "오사카로 출발", by: "무료 음원", icon: "🚄", file: "Kevin_MacLeod_-_Off_to_Osaka.ogg", dir: "5/52", performer: "Kevin MacLeod (incompetech.com)", license: "CC BY", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", meter: 4 },
  funkorama: { game: "rhythm", title: "펑코라마", by: "무료 음원", icon: "🕺", file: "Funkorama_(MacLeod,_Kevin)_(ISRC_USUAN1100474).oga", dir: "7/7c", performer: "Kevin MacLeod (incompetech.com)", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", meter: 4 },
  disco: { game: "rhythm", title: "현악 디스코", by: "무료 음원", icon: "🪩", file: "Stringed_Disco_(MacLeod,_Kevin)_(ISRC_USUAN1100059).oga", dir: "0/0e", performer: "Kevin MacLeod (incompetech.com)", license: "CC BY", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", meter: 4 },
  aceshigh: { game: "rhythm", title: "에이스 하이", by: "무료 음원", icon: "✈️", file: "Kevin_MacLeod_-_01_-_Aces_High.ogg", dir: "6/68", performer: "Kevin MacLeod (incompetech.com)", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", meter: 4 },
  cipher: { game: "rhythm", title: "사이퍼", by: "무료 음원", icon: "🤖", file: "Cipher_(ISRC_USUAN1100844).oga", dir: "0/0c", performer: "Kevin MacLeod (incompetech.com)", license: "CC BY", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", meter: 4 },
  rollin5: { game: "rhythm", title: "다섯 시의 그루브", by: "무료 음원", icon: "🛼", file: "Kevin_MacLeod_-_Rollin_at_5_-_210_-_full.ogg", dir: "9/99", performer: "Kevin MacLeod (incompetech.com)", license: "CC BY", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", meter: 4 },
};
// 합성음 대신이 없는 곡(실제 녹음만): 노래 고르기 화면에 쓰는 정보. title·by·icon이 있는 녹음
// game: 그 녹음을 쓰는 게임 (없으면 지휘자). 리듬 박자용 신나는 곡은 game: "rhythm"
export const extraSongs = (synthIds, game = "conductor") => Object.entries(RECORDINGS).filter(([id, R]) => R.title && !synthIds.includes(id) && (R.game || "conductor") === game)
  .map(([id, R]) => ({ id, title: R.title, by: R.by, icon: R.icon || "🎼", real: game === "conductor", synth: false }));
export const pageUrl = id => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(RECORDINGS[id].file)}`;
// 받을 주소: MP3 변환본(아이패드 사파리도 재생) → 원본(ogg). ?realbase=주소 로 시험용 로컬 파일을 쓸 수 있음
function urls(id) {
  const R = RECORDINGS[id], f = encodeURIComponent(R.file), base = new URLSearchParams(location.search).get("realbase");
  if (base) return [`${base}/${id}.wav`];
  if (/\.mp3$/i.test(R.file)) return [`https://upload.wikimedia.org/wikipedia/commons/${R.dir}/${f}`];   // 원본이 MP3
  return [
    `https://upload.wikimedia.org/wikipedia/commons/transcoded/${R.dir}/${f}/${f}.mp3`,
    `https://upload.wikimedia.org/wikipedia/commons/${R.dir}/${f}`,
  ];
}

const cache = new Map();   // id → Promise<{ buffer, beats, spb, duration } | null>
const done = new Map();    // id → 결과 (준비 끝난 것만)
export const has = id => !!RECORDINGS[id];
// 준비된 녹음. 배경음악으로만 받아 둔 것은 박자를 아직 안 찾았으므로 처음 쓸 때 찾음
export const ready = id => { const r = done.get(id); if (r && !r.beats) Object.assign(r, trackBeats(r.buffer)); return r || null; };
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
        let buffer = await new Promise((ok, no) => out.ac.decodeAudioData(buf, ok, no));
        const from = RECORDINGS[id].from || 0;
        if (from > 0 && from < buffer.duration - 5) {   // 유명한 부분부터 (예: 윌리엄 텔 피날레)
          const s0 = Math.floor(from * buffer.sampleRate), cut = out.ac.createBuffer(buffer.numberOfChannels, buffer.length - s0, buffer.sampleRate);
          for (let c = 0; c < buffer.numberOfChannels; c++) cut.copyToChannel(buffer.getChannelData(c).subarray(s0), c);
          buffer = cut;
        }
        const r = { buffer, duration: buffer.duration, at: performance.now() };   // 박자는 쓸 때 찾음 (ready)
        done.set(id, r); trim(id); return r;
      } catch (e) { /* 다음 주소 시도 */ }
    }
    cache.delete(id); return null;   // 다음에 다시 시도할 수 있게
  })();
  cache.set(id, p);
  return p;
}

// 풀어 둔 녹음은 한 곡에 수십 MB라, 많이 쌓이면 아이패드가 멈추거나 새로 고침됨 → 최근 것만 남기고 버림
const KEEP = 3;
function trim(justAdded) {
  const inUse = new Set([justAdded, curId, bg && bg.id].filter(Boolean));
  const old = [...done.entries()].filter(([id]) => !inUse.has(id)).sort((a, b) => a[1].at - b[1].at);
  while (done.size > KEEP && old.length) { const [id] = old.shift(); done.delete(id); cache.delete(id); }
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

/* ---------- 배경음악: 신나는 무료 음원을 게임 내내 반복 ---------- */
export const BGM_IDS = Object.keys(RECORDINGS).filter(id => RECORDINGS[id].game === "rhythm");
let bg = null, lastBgm = null;
// 자리 잡는 화면에서는 새로 받지 않음: 받기·풀기(디코딩)가 무거워서 만세 인식 중에 아이패드가 멈출 수 있음
// → 이미 받아 둔 곡 중에서 고름(없으면 합성 배경음악). 다음 곡은 조용한 화면(선수 고르기·결과)에서 미리 받음(prefetchBgm)
export function pickBgm() {
  const have = BGM_IDS.filter(id => done.has(id));
  const fresh = have.filter(id => id !== lastBgm);
  const pool = fresh.length ? fresh : have;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
let prefetching = false;
export function prefetchBgm() {
  if (prefetching || !settings.bgm || !audioOut()) return;
  const notYet = BGM_IDS.filter(id => !done.has(id) && id !== lastBgm);
  if (!notYet.length) return;
  prefetching = true;
  load(notYet[Math.floor(Math.random() * notYet.length)]).finally(() => { prefetching = false; });
}
// 받아 둔 곡이면 틀고 true, 아니면 false (합성 배경음악으로 대신)
export function bgmPlay(id) {
  bgmStop(true);
  const r = done.get(id), out = audioOut();
  if (!r || !out || !settings.bgm) return false;
  const g = out.ac.createGain(), s = out.ac.createBufferSource(), t = out.ac.currentTime;
  s.buffer = r.buffer; s.loop = true; s.connect(g); g.connect(out.dest);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.6);   // 효과음·목소리가 묻히지 않게 조금 작게
  s.start(t); bg = { s, g, id }; lastBgm = id; r.at = performance.now();
  return true;
}
export function bgmStop(now = false) {
  if (!bg) return; const { s, g } = bg, out = audioOut(); bg = null;
  try { if (out && !now) { g.gain.setTargetAtTime(0.0001, out.ac.currentTime, 0.15); s.stop(out.ac.currentTime + 0.8); } else s.stop(); } catch (e) {}
}
// 피버(막판): 조금 빠르게
export function bgmRate(x) { if (bg) try { bg.s.playbackRate.setTargetAtTime(x, audioOut().ac.currentTime, 0.3); } catch (e) {} }
export const bgmPlaying = () => !!bg;
export const loadedCount = () => done.size;   // 점검용
