import './style.css';

// --- DOM helpers
const $ = (q) => document.querySelector(q);

// --- Данные дорожек: [название, цвет]
const T = [
  ['KICK', '#ff3d9a'],
  ['SNARE', '#ffb84d'],
  ['CLAP', '#ffe14d'],
  ['HAT', '#5affb4'],
  ['OPEN', '#4dd2ff'],
  ['TOM', '#8f7bff'],
  ['BASS', '#ff6b6b'],
];

// --- Пресеты паттернов
const PR = {
  house: [
    '1000100010001000',
    '0000000000000000',
    '0000100000001000',
    '1010101010101010',
    '0010001000100010',
    '0000000000000000',
    '0010001000100010',
  ],
  hiphop: [
    '1000001000100000',
    '0000100000001000',
    '0000000000000000',
    '1010101010101010',
    '0000000000000010',
    '0000000000000000',
    '1000001000100000',
  ],
  break: [
    '1000000010100000',
    '0000100000001001',
    '0000000000000000',
    '1111111111111111',
    '0000000000100000',
    '0000000000000100',
    '1000000010100000',
  ],
  trap: [
    '1000000000100100',
    '0000000010000000',
    '0000000010000000',
    '1011101111101111',
    '0000000000000010',
    '0000000000000000',
    '1000000000100100',
  ],
};

// --- Состояние
let P = T.map(() => Array(16).fill(0));   // паттерн 7×16
let mute = T.map(() => 0);
let bpm = 110;
let swing = 0;
let playing = 0;
let ctx;      // AudioContext
let M;        // master gain
let NB;       // шумовой буфер
let step = 0;
let nxt = 0;
let q = [];   // очередь [time, step] для подсветки
let timer;
let cur = -1;

// --- UI: построение сетки
const g = $('#g');

function buildGrid() {
  g.innerHTML = T.map(
    ([n, c], i) =>
      `<div class="row" style="--c:${c}">` +
      `<button class="lb" id="l${i}">${n}</button>` +
      P[i]
        .map(
          (_, s) =>
            `<button class="c${s % 4 == 0 && s ? ' q' : ''}" id="c${i}_${s}" aria-label="${n} ${s + 1}"></button>`
        )
        .join('') +
      `</div>`
  ).join('');

  // навешиваем обработчики: mute по названию дорожки, тоггл по клетке
  T.forEach((_, i) => {
    $(`#l${i}`).addEventListener('click', () => mt(i));
    P[i].forEach((_, s) => {
      $(`#c${i}_${s}`).addEventListener('click', () => tg(i, s));
    });
  });
}

function paint() {
  P.forEach((r, i) => {
    r.forEach((v, s) => $('#c' + i + '_' + s).classList.toggle('on', !!v));
    $('#l' + i).classList.toggle('m', !!mute[i]);
  });
}

function tg(i, s) {
  P[i][s] ^= 1;
  paint();
  save();
  if (!playing && P[i][s]) {
    init();
    V[i](ctx.currentTime + 0.01);
  }
}

function mt(i) {
  mute[i] ^= 1;
  paint();
}

function setB() {
  bpm = +$('#bp').value;
  $('#bv').textContent = bpm;
  save();
}

function preset(k) {
  if (!PR[k]) return;
  P = PR[k].map((r) => [...r].map(Number));
  paint();
  save();
  $('#ps').value = '';
}

function rnd() {
  P = P.map((r, i) => r.map(() => (Math.random() < [0.22, 0.15, 0.1, 0.5, 0.12, 0.1, 0.2][i] ? 1 : 0)));
  P[0][0] = 1;
  paint();
  save();
}

function clr() {
  P = P.map((r) => r.map(() => 0));
  paint();
  save();
}

// --- Аудио
function init() {
  if (ctx) {
    ctx.resume();
    return;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const c = ctx.createDynamicsCompressor();
  const mg = ctx.createGain();
  mg.gain.value = 0.8;
  mg.connect(c);
  c.connect(ctx.destination);
  M = mg;

  NB = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = NB.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function env(gn, t, a, d, v) {
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(v, t + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function osc(type, f1, f2, t, d, v) {
  const o = ctx.createOscillator();
  const gn = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + d);
  env(gn, t, 0.003, d, v);
  o.connect(gn).connect(M);
  o.start(t);
  o.stop(t + d + 0.05);
}

function nz(type, f, t, d, v, Q = 1) {
  const s = ctx.createBufferSource();
  const fl = ctx.createBiquadFilter();
  const gn = ctx.createGain();
  s.buffer = NB;
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = Q;
  env(gn, t, 0.002, d, v);
  s.connect(fl).connect(gn).connect(M);
  s.start(t);
  s.stop(t + d + 0.05);
}

const V = [
  (t) => osc('sine', 160, 45, t, 0.4, 1),
  (t) => {
    nz('highpass', 1500, t, 0.18, 0.7);
    osc('triangle', 220, 120, t, 0.1, 0.5);
  },
  (t) => {
    [0, 0.012, 0.024].forEach((o) => nz('bandpass', 1400, t + o, 0.04, 0.6, 2));
    nz('bandpass', 1400, t + 0.036, 0.15, 0.6, 2);
  },
  (t) => nz('highpass', 7500, t, 0.05, 0.35),
  (t) => nz('highpass', 7000, t, 0.3, 0.35),
  (t) => osc('sine', 200, 90, t, 0.25, 0.8),
  (t) => osc('square', 55, 54, t, 0.3, 0.35),
];

function sched() {
  while (nxt < ctx.currentTime + 0.12) {
    const dur = 60 / bpm / 4;
    const t = nxt + (step % 2 ? (swing / 100) * dur * 0.6 : 0);
    P.forEach((r, i) => {
      if (r[step] && !mute[i]) V[i](t);
    });
    q.push([t, step]);
    nxt += dur;
    step = (step + 1) % 16;
  }
}

function draw() {
  if (!playing) return;
  while (q.length && q[0][0] <= ctx.currentTime) mark(q.shift()[1]);
  requestAnimationFrame(draw);
}

function mark(s) {
  if (cur >= 0) T.forEach((_, i) => $('#c' + i + '_' + cur).classList.remove('ph'));
  cur = s;
  if (s >= 0) T.forEach((_, i) => $('#c' + i + '_' + s).classList.add('ph'));
}

function toggle() {
  init();
  playing ^= 1;
  if (playing) {
    step = 0;
    nxt = ctx.currentTime + 0.06;
    q = [];
    timer = setInterval(sched, 25);
    requestAnimationFrame(draw);
    $('#pl').textContent = '■ Стоп';
  } else {
    clearInterval(timer);
    mark(-1);
    $('#pl').textContent = '▶ Играть';
  }
}

// --- Сохранение / шаринг
const enc = () =>
  bpm + '.' + P.map((r) => r.reduce((a, v, i) => a | (v << i), 0).toString(16).padStart(4, '0')).join('');

function dec(s) {
  try {
    const [b, h] = s.split('.');
    if (!h || h.length != 28) return 0;
    bpm = Math.min(180, Math.max(60, +b || 110));
    P = T.map((_, i) => {
      const n = parseInt(h.substr(i * 4, 4), 16);
      return Array.from({ length: 16 }, (_, k) => (n >> k) & 1);
    });
    $('#bp').value = bpm;
    $('#bv').textContent = bpm;
    return 1;
  } catch (e) {
    return 0;
  }
}

function save() {
  try {
    localStorage.setItem('bg1', enc());
  } catch (e) {}
}

async function share() {
  const u = location.href.split('#')[0] + '#b=' + enc();
  try {
    await navigator.clipboard.writeText(u);
    alert('Ссылка скопирована');
  } catch (e) {
    prompt('Скопируйте ссылку:', u);
  }
}

// --- Обработчики
function bindControls() {
  $('#pl').addEventListener('click', toggle);
  $('#bp').addEventListener('input', setB);
  $('#sw').addEventListener('input', (e) => {
    swing = +e.target.value;
  });
  $('#ps').addEventListener('change', (e) => preset(e.target.value));
  $('#rnd').addEventListener('click', rnd);
  $('#clr').addEventListener('click', clr);
  $('#shr').addEventListener('click', share);

  document.addEventListener('keydown', (e) => {
    if (e.code == 'Space') {
      e.preventDefault();
      toggle();
    }
  });
}

// --- Старт
function boot() {
  buildGrid();
  bindControls();

  let ok = 0;
  try {
    if (location.hash.startsWith('#b=')) ok = dec(location.hash.slice(3));
  } catch (e) {}
  if (!ok) {
    try {
      ok = dec(localStorage.getItem('bg1') || '');
    } catch (e) {}
  }
  if (!ok) preset('house');
  paint();
}

boot();
