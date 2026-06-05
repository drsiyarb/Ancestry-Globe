// Ancestry Globe — genes & Y/mt lineages over real AADR samples.
const TMAX = 15000, EPOCH = 500, BIN = 500, NB = 30;
const DOSE = ['#8fa6c4', '#ffb02e', '#ff3d2e'];            // dosage 0,1,2
const HEXLABEL = ['huge', 'large', 'medium', 'small', 'tiny'];
const GRIDDEG = [40, 22, 13, 8, 5];
const CATPAL = ['#e6194B','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#42d4f4',
  '#f032e6','#bfef45','#fabed4','#469990','#dcbeff','#9A6324','#fffac8','#1d8a8a',
  '#aaffc3','#808000','#ffd8b1','#5a7bff','#ff6699','#66ccff','#99cc00','#cc6600','#c0c0c0'];

let layer = 'genes', categorical = false, PLOIDY = 2;
let GENES = [], SAMPLES = null, curPoints = [], curTraj = [], cladeColors = {};
let t = 0, playing = false, timer = null, viewMode = 'freq';
let WIN = 750, HEXRES = 2, HEIGHT3D = false, AUTOSCALE = true;
let colorMax = 1, densMax = 1;
const $ = id => document.getElementById(id);

function majY(h) { if (!h) return null; const m = String(h).match(/^[A-Z]+[0-9]*[a-z]?/); return m ? m[0] : null; }
function majM(h) { if (!h) return null; const m = String(h).match(/^[A-Z][0-9]?/); return m ? m[0] : null; }

function jet(v, a) {
  v = Math.max(0, Math.min(1, v));
  const c = x => Math.max(0, Math.min(1, x));
  return `rgba(${Math.round(255*c(1.5-Math.abs(4*v-3)))},${Math.round(255*c(1.5-Math.abs(4*v-2)))},${Math.round(255*c(1.5-Math.abs(4*v-1)))},${a})`;
}
function cladeColor(c) { return cladeColors[c] || '#7a8699'; }
function hexSum(d) { let s = 0; for (const p of d.points) s += p.d; return s; }
function hexFreq(d) { return hexSum(d) / (PLOIDY * d.points.length); }
function alphaConf(d) { return Math.min(1, 0.4 + d.points.length / 16); }
function hexColorFreq(d)    { return jet(Math.min(1, hexFreq(d) / colorMax), alphaConf(d)); }
function hexColorDensity(d) { return jet(Math.min(1, hexSum(d) / densMax), Math.min(1, 0.5 + d.points.length / 20)); }
function hexDominant(d) {
  const c = {}; let best = null, bn = 0;
  for (const p of d.points) { const k = p.clade; c[k] = (c[k] || 0) + 1; if (c[k] > bn) { bn = c[k]; best = k; } }
  return cladeColor(best);
}
function hexAlt(d) { return HEIGHT3D ? Math.min(0.25, Math.log10(d.points.length + 1) * 0.07) : 0.003; }

function windowMax(vis, kind) {
  const deg = GRIDDEG[HEXRES], cells = {};
  for (const p of vis) {
    const k = Math.round(p.lat / deg) + ',' + Math.round(p.lon / deg);
    const c = cells[k] || (cells[k] = [0, 0]); c[0] += p.d; c[1] += 1;
  }
  let m = 0;
  for (const k in cells) { const [s, n] = cells[k]; if (n >= 3) { const v = kind === 'freq' ? s / (PLOIDY * n) : s; if (v > m) m = v; } }
  return m;
}

const globe = Globe({ rendererConfig: { preserveDrawingBuffer: true } })(document.getElementById('globe'))
  .globeImageUrl('https://unpkg.com/three-globe@2.32.0/example/img/earth-dark.jpg')
  .bumpImageUrl('https://unpkg.com/three-globe@2.32.0/example/img/earth-topology.png')
  .backgroundImageUrl('https://unpkg.com/three-globe@2.32.0/example/img/night-sky.png')
  .pointLat('jlat').pointLng('jlon')
  .pointColor(d => categorical ? cladeColor(d.clade) : DOSE[d.d])
  .pointAltitude(0.006).pointRadius(0.26)
  .pointsMerge(true).pointResolution(4)
  .heatmapPoints(d => d.points)
  .heatmapPointLat('lat').heatmapPointLng('lon').heatmapPointWeight('d')
  .heatmapBandwidth(1.6).heatmapBaseAltitude(0.01).heatmapTopAltitude(0.01)
  .heatmapColorSaturation(1.6).heatmapsTransitionDuration(120)
  .hexBinPointLat('lat').hexBinPointLng('lon').hexBinPointWeight('d')
  .hexBinResolution(HEXRES).hexBinMerge(false)
  .hexTopColor(hexColorFreq).hexSideColor(hexColorFreq).hexAltitude(hexAlt)
  .hexBinPointsData([])
  .atmosphereColor('#3a6fb0').atmosphereAltitude(0.18);

globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.4;
globe.controls().addEventListener('start', () => { if ($('rotBtn').dataset.on === 'true') toggleRotate(); });
window.addEventListener('resize', () => globe.width(innerWidth).height(innerHeight));

function timeText(ybp) {
  if (ybp <= 30) return 'today';
  const y = 1950 - ybp;
  return y < 0 ? `${Math.round(-y/10)*10} BCE` : `${Math.round(y/10)*10} CE`;
}

function render() {
  $('timeLabel').textContent = timeText(t);
  const lo = t - WIN, hi = t + WIN;
  const vis = curPoints.filter(d => d.ybp >= lo && d.ybp <= hi);

  if (categorical) {
    $('scaleMsg').textContent = 'colour: haplogroup (dominant clade per cell)';
    if (viewMode === 'dots') globe.heatmapsData([]).hexBinPointsData([]).pointsData(vis);
    else globe.pointsData([]).heatmapsData([]).hexTopColor(hexDominant).hexSideColor(hexDominant).hexAltitude(hexAlt).hexBinPointsData(vis);
    $('nVal').textContent = vis.length;
    $('freqVal').textContent = '—';
    drawTraj();
    return;
  }

  if (viewMode === 'freq') {
    colorMax = AUTOSCALE ? Math.max(0.06, windowMax(vis, 'freq')) : 1;
    $('scaleMsg').textContent = AUTOSCALE ? `colour: 0–${Math.round(colorMax*100)}% (scaled to this window)` : 'colour: 0–100% (absolute)';
  } else if (viewMode === 'density') {
    densMax = AUTOSCALE ? Math.max(2, windowMax(vis, 'dens')) : 40;
    $('scaleMsg').textContent = AUTOSCALE ? 'colour: density (scaled to this window)' : 'colour: density (fixed scale)';
  } else if (viewMode === 'smooth') {
    $('scaleMsg').textContent = 'colour: smooth density (auto-normalised)';
  } else { $('scaleMsg').textContent = ''; }

  if (viewMode === 'dots') {
    globe.heatmapsData([]).hexBinPointsData([]).pointsData(vis);
  } else if (viewMode === 'smooth') {
    globe.pointsData([]).hexBinPointsData([]).heatmapTopAltitude(HEIGHT3D ? 0.22 : 0.01).heatmapsData([{ points: vis.filter(d => d.d > 0) }]);
  } else if (viewMode === 'freq') {
    globe.pointsData([]).heatmapsData([]).hexTopColor(hexColorFreq).hexSideColor(hexColorFreq).hexAltitude(hexAlt).hexBinPointsData(vis);
  } else {
    globe.pointsData([]).heatmapsData([]).hexTopColor(hexColorDensity).hexSideColor(hexColorDensity).hexAltitude(hexAlt).hexBinPointsData(vis);
  }

  let n = vis.length, s = 0;
  for (const d of vis) s += d.d;
  $('nVal').textContent = n;
  $('freqVal').textContent = n ? (100 * s / (PLOIDY * n)).toFixed(0) + '%' : '—';
  drawTraj();
}

function setT(ybp) { t = Math.max(0, Math.min(TMAX, ybp)); $('timeSlider').value = 100 * (1 - t / TMAX); render(); }
function play() { playing = true; $('playBtn').textContent = '❚❚'; timer = setInterval(() => { let nt = t - (+$('paceSlider').value) * 55; if (nt < 0) nt = TMAX; setT(nt); }, 95); }
function pause() { playing = false; $('playBtn').textContent = '▶'; clearInterval(timer); }
function restartIfPlaying() { if (playing) { pause(); play(); } }
function toggleRotate() {
  const on = $('rotBtn').dataset.on === 'true';
  $('rotBtn').dataset.on = (!on).toString();
  $('rotBtn').classList.toggle('active', !on);
  $('rotBtn').textContent = 'Auto-rotate: ' + (!on ? 'on' : 'off');
  globe.controls().autoRotate = !on;
}

function drawTraj() {
  const c = $('trajChart'), ctx = c.getContext('2d'), W = c.width, H = c.height, pad = 4;
  ctx.clearRect(0, 0, W, H);
  if (categorical || !curTraj.length) { $('trajHint').textContent = categorical ? '(per-lineage view)' : ''; return; }
  const xs = y => pad + (W - 2*pad) * (1 - y / TMAX), ys = f => H - pad - (H - 2*pad) * f;
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, ys(0)); ctx.lineTo(W-pad, ys(0)); ctx.stroke();
  ctx.strokeStyle = '#ff7a4d'; ctx.lineWidth = 2; ctx.beginPath();
  let started = false;
  for (const [y, f] of curTraj) {
    if (y > TMAX || f === null) { started = false; continue; }
    const x = xs(y), yy = ys(f);
    if (!started) { ctx.moveTo(x, yy); started = true; } else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  const mx = xs(t);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(mx, pad); ctx.lineTo(mx, H-pad); ctx.stroke();
  $('trajHint').textContent = '0–100%, past → today';
}

function computeTraj(points) {
  const bs = new Array(NB + 1).fill(0), bn = new Array(NB + 1).fill(0);
  for (const p of points) { const b = Math.max(0, Math.min(NB, Math.floor(p.ybp / BIN))); bs[b] += p.d; bn[b]++; }
  return bs.map((s, b) => bn[b] >= 3 ? [b * BIN, +(s / (PLOIDY * bn[b])).toFixed(3), bn[b]] : [b * BIN, null, bn[b]]);
}

// ---------- GENES ----------
function setGeneData(d) {
  categorical = false; PLOIDY = 2;
  curPoints = d.points.map(p => ({ lat: p[0], lon: p[1], jlat: p[0]+(Math.random()-.5)*1.2, jlon: p[1]+(Math.random()-.5)*1.2, ybp: p[2], modern: p[3], d: p[4] }));
  curTraj = d.trajectory || [];
}
async function loadGene(id) {
  const g = GENES.find(x => x.id === id);
  $('snpMsg').textContent = '';
  $('blurb').textContent = `${g.label} — ${g.gene}. Trait allele: ${g.trait_allele}.`;
  setGeneData(await fetch(`out/genes/${id}.json`).then(r => r.json()));
  updateLegend(); render();
}
async function searchSNP() {
  const rs = $('snpInput').value.trim(); if (!rs) return;
  $('snpMsg').textContent = 'looking up ' + rs + '…';
  try {
    const d = await fetch('api/snp?rsid=' + encodeURIComponent(rs)).then(r => r.json());
    if (d.error) { $('snpMsg').textContent = d.error; return; }
    $('blurb').textContent = `${rs} (chr${d.chrom}:${d.pos}) — allele ${d.trait_allele}, ${d.n} typed.`;
    $('snpMsg').textContent = 'showing ' + rs;
    setGeneData(d); updateLegend(); render();
  } catch (e) { $('snpMsg').textContent = 'search needs the local server (python server.py).'; }
}

// ---------- HAPLOGROUPS ----------
async function loadSamples() {
  if (SAMPLES) return SAMPLES;
  const arr = await fetch('out/samples.json').then(r => r.json());
  SAMPLES = arr.map(s => ({
    lat: s.lat, lon: s.lon, jlat: s.lat+(Math.random()-.5)*1.2, jlon: s.lon+(Math.random()-.5)*1.2,
    ybp: s.ybp, modern: s.modern,
    yf: s.ydna || null, mf: s.mtdna || null, mY: majY(s.ydna), mM: majM(s.mtdna)
  }));
  return SAMPLES;
}
function hapField() { return layer === 'ydna' ? ['yf', 'mY'] : ['mf', 'mM']; }
function populateClades() {
  const [, maj] = hapField();
  const counts = {};
  for (const s of SAMPLES) if (s[maj]) counts[s[maj]] = (counts[s[maj]] || 0) + 1;
  const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  cladeColors = {};
  ranked.forEach((c, i) => { cladeColors[c] = CATPAL[i] || '#7a8699'; });
  const opts = ['<option value="__ALL__">All clades (coloured)</option>']
    .concat(ranked.slice(0, 26).map(c => `<option value="${c}">${c} (${counts[c]})</option>`));
  $('cladeSelect').innerHTML = opts.join('');
}
function selectClade(token) {
  const [full, maj] = hapField();
  PLOIDY = 1;
  if (token === '__ALL__') {
    categorical = true;
    curPoints = SAMPLES.filter(s => s[maj]).map(s => ({ ...s, clade: s[maj], d: 1 }));
    curTraj = [];
    $('blurb').textContent = `${layer === 'ydna' ? 'Y-DNA' : 'mtDNA'} — every lineage coloured by major clade. ${curPoints.length} individuals.`;
  } else {
    categorical = false;
    const tok = token.toUpperCase();
    curPoints = SAMPLES.filter(s => s[full]).map(s => ({ ...s, d: s[full].toUpperCase().startsWith(tok) ? 1 : 0 }));
    curTraj = computeTraj(curPoints);
    const car = curPoints.reduce((a, p) => a + p.d, 0);
    $('blurb').textContent = `${layer === 'ydna' ? 'Y-DNA' : 'mtDNA'} ${token} — ${car} of ${curPoints.length} typed individuals carry this lineage.`;
  }
  updateLegend(); render();
}
function traceHap() {
  const v = $('hapInput').value.trim(); if (!v) return;
  $('cladeSelect').value = '__ALL__';
  $('hapMsg').textContent = 'tracing ' + v;
  selectClade(v);
}

// ---------- legend ----------
function updateLegend() {
  const el = $('legend');
  if (categorical) {
    const [, maj] = hapField();
    const counts = {};
    for (const s of SAMPLES) if (s[maj]) counts[s[maj]] = (counts[s[maj]] || 0) + 1;
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 12);
    el.innerHTML = top.map(c => `<span><i class="dot" style="background:${cladeColor(c)}"></i>${c}</span>`).join('');
    $('freqLbl').innerHTML = 'lineages<br>shown';
  } else if (layer === 'genes') {
    el.innerHTML = `<span><i class="dot" style="background:${DOSE[0]}"></i>non-carrier</span> <span><i class="dot" style="background:${DOSE[1]}"></i>1 copy</span> <span><i class="dot" style="background:${DOSE[2]}"></i>2 copies</span>`;
    $('freqLbl').innerHTML = 'carrier freq<br>in window';
  } else {
    el.innerHTML = `<span><i class="dot" style="background:${DOSE[0]}"></i>not this lineage</span> <span><i class="dot" style="background:${DOSE[2]}"></i>carries lineage</span>`;
    $('freqLbl').innerHTML = 'lineage freq<br>in window';
  }
}

// ---------- layer switching ----------
async function setLayer(l) {
  layer = l;
  $('geneControls').style.display = l === 'genes' ? '' : 'none';
  $('hapControls').style.display = l === 'genes' ? 'none' : '';
  if (l === 'genes') { await loadGene($('geneSelect').value || GENES[0].id); }
  else { await loadSamples(); populateClades(); $('cladeSelect').value = '__ALL__'; $('hapMsg').textContent = ''; selectClade('__ALL__'); }
}

// ---------- share / export ----------
const GIFWORKER = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js';
function globeCanvas() { return document.querySelector('#globe canvas'); }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function snapshot() {
  const cv = globeCanvas(); if (!cv) return;
  cv.toBlob(b => { if (b) { downloadBlob(b, 'ancestry-globe.png'); $('shareMsg').textContent = 'PNG downloaded'; } });
}
async function exportGIF() {
  const cv = globeCanvas();
  if (!cv || typeof GIF === 'undefined') { $('shareMsg').textContent = 'GIF library not loaded'; return; }
  const wasPlaying = playing; pause();
  $('gifBtn').disabled = true;
  const scale = Math.min(1, 640 / cv.width);
  const tw = Math.round(cv.width * scale), th = Math.round(cv.height * scale);
  const tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
  const tctx = tmp.getContext('2d');
  const gif = new GIF({ workers: 2, quality: 12, width: tw, height: th, workerScript: GIFWORKER });
  const FRAMES = 48;
  for (let i = 0; i < FRAMES; i++) {
    setT(TMAX * (1 - i / (FRAMES - 1)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    tctx.drawImage(cv, 0, 0, tw, th);
    gif.addFrame(tmp, { copy: true, delay: 90 });
    $('shareMsg').textContent = `capturing… ${Math.round(100 * (i + 1) / FRAMES)}%`;
  }
  gif.on('progress', p => { $('shareMsg').textContent = `encoding… ${Math.round(p * 100)}%`; });
  gif.on('finished', blob => { downloadBlob(blob, 'ancestry-globe.gif'); $('shareMsg').textContent = 'GIF downloaded'; $('gifBtn').disabled = false; if (wasPlaying) play(); });
  gif.render();
}

async function init() {
  GENES = (await fetch('scripts/genes.json').then(r => r.json())).genes;
  $('geneSelect').innerHTML = GENES.map(g => `<option value="${g.id}">${g.plain} — ${g.gene}</option>`).join('');
  $('geneSelect').addEventListener('change', e => loadGene(e.target.value));
  $('layerSel').addEventListener('change', e => setLayer(e.target.value));
  $('cladeSelect').addEventListener('change', e => { $('hapMsg').textContent = ''; selectClade(e.target.value); });
  $('hapBtn').addEventListener('click', traceHap);
  $('hapInput').addEventListener('keydown', e => { if (e.key === 'Enter') traceHap(); });
  $('snpBtn').addEventListener('click', searchSNP);
  $('snpInput').addEventListener('keydown', e => { if (e.key === 'Enter') searchSNP(); });
  $('timeSlider').addEventListener('input', () => { if (playing) pause(); setT(TMAX * (1 - $('timeSlider').value/100)); });
  $('playBtn').addEventListener('click', () => playing ? pause() : play());
  $('fwdBtn').addEventListener('click', () => { pause(); setT(t - EPOCH); });
  $('backBtn').addEventListener('click', () => { pause(); setT(t + EPOCH); });
  $('paceSlider').addEventListener('input', restartIfPlaying);
  $('rotBtn').addEventListener('click', toggleRotate);
  $('heightBtn').addEventListener('click', () => { HEIGHT3D = !HEIGHT3D; $('heightBtn').classList.toggle('active', HEIGHT3D); $('heightBtn').textContent = '3D height: ' + (HEIGHT3D ? 'on' : 'off'); render(); });
  $('scaleBtn').addEventListener('click', () => { AUTOSCALE = !AUTOSCALE; $('scaleBtn').classList.toggle('active', AUTOSCALE); $('scaleBtn').textContent = 'Auto-scale colour: ' + (AUTOSCALE ? 'on' : 'off'); render(); });
  $('viewSel').addEventListener('change', e => { viewMode = e.target.value; $('hexRow').style.display = (viewMode === 'freq' || viewMode === 'density') ? '' : 'none'; render(); });
  $('hexSlider').addEventListener('input', e => { HEXRES = +e.target.value; $('hexVal').textContent = HEXLABEL[HEXRES]; globe.hexBinResolution(HEXRES); render(); });
  $('winSlider').addEventListener('input', e => { WIN = +e.target.value; $('winVal').textContent = '±' + WIN + 'y'; render(); });
  $('pngBtn').addEventListener('click', snapshot);
  $('gifBtn').addEventListener('click', exportGIF);

  await loadGene(GENES[0].id);
  setT(0);
  $('loading').classList.add('hidden');
  globe.width(innerWidth).height(innerHeight);
  setTimeout(play, 800);
}
init();
