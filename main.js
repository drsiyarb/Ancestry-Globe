const DATA_URL = "samples.min.json";
const GROUPS_URL = "groups.json";
const TIME_WINDOW_BP = 700;
const PLAY_SPEED_BP_PER_SEC = 360;

const colorByY = {
  R1b: "#5ee7ff",
  R1a: "#ffd166",
  J2: "#c77dff",
  G2: "#7dffb2",
  I2: "#ff8fab",
  E1b: "#ff9f1c",
  default: "#d7f9ff"
};

const state = {
  samples: [],
  groups: null,
  selected: {},
  currentBP: 5000,
  minBP: 0,
  maxBP: 10000,
  playing: false,
  lastFrame: null,
  renderQueued: false
};

const els = {
  globe: document.getElementById("globe"),
  filters: document.getElementById("filters"),
  playBtn: document.getElementById("playBtn"),
  clearBtn: document.getElementById("clearBtn"),
  demoBtn: document.getElementById("demoBtn"),
  slider: document.getElementById("timeSlider"),
  timeLabel: document.getElementById("timeLabel"),
  stats: document.getElementById("stats")
};

let globe;

boot();

async function boot() {
  try {
    console.log("Loading Ancestry Globe data...");
    const [samples, groups] = await Promise.all([
      fetch(DATA_URL).then(assertOk).then(r => r.json()),
      fetch(GROUPS_URL).then(assertOk).then(r => r.json())
    ]);

    state.samples = samples.map(cleanSample).filter(hasMapFields);
    state.groups = groups;
    state.minBP = Math.floor(Math.min(...state.samples.map(s => s.ybp)) / 50) * 50;
    state.maxBP = Math.ceil(Math.max(...state.samples.map(s => s.ybp)) / 50) * 50;
    state.currentBP = state.maxBP;

    setupSlider();
    buildFilters();
    initGlobe();
    render();
    tick();
    console.log(`Ready: ${state.samples.length} samples loaded.`);
  } catch (error) {
    console.error(error);
    els.stats.textContent = "Could not load data.";
  }
}

function assertOk(response) {
  if (!response.ok) throw new Error(`Fetch failed: ${response.url}`);
  return response;
}

function cleanSample(sample) {
  return {
    ...sample,
    lat: Number(sample.lat),
    lon: Number(sample.lon),
    ybp: Number(sample.ybp),
    ydna_major: sample.ydna_major || majorY(sample.ydna),
    mtdna_major: sample.mtdna_major || majorMt(sample.mtdna)
  };
}

function hasMapFields(s) {
  return Number.isFinite(s.lat) && Number.isFinite(s.lon) && Number.isFinite(s.ybp);
}

function setupSlider() {
  els.slider.min = state.minBP;
  els.slider.max = state.maxBP;
  els.slider.step = 50;
  els.slider.value = state.currentBP;
  els.slider.addEventListener("input", () => {
    state.currentBP = Number(els.slider.value);
    queueRender();
  });

  els.playBtn.addEventListener("click", () => {
    state.playing = !state.playing;
    els.playBtn.textContent = state.playing ? "Pause" : "Play";
  });

  els.clearBtn.addEventListener("click", () => {
    Object.values(state.selected).forEach(set => set.clear());
    document.querySelectorAll("input[data-filter]").forEach(input => (input.checked = false));
    queueRender();
  });

  els.demoBtn.addEventListener("click", () => {
    Object.values(state.selected).forEach(set => set.clear());
    selectFilter("population", "Yamnaya", true);
    selectFilter("ydna_major", "R1b", true);
    queueRender();
  });
}

function buildFilters() {
  els.filters.innerHTML = "";

  for (const category of state.groups.categories) {
    state.selected[category.type] = new Set();

    const details = document.createElement("details");
    details.open = Boolean(category.open);

    const summary = document.createElement("summary");
    summary.textContent = category.label;
    details.appendChild(summary);

    const items = document.createElement("div");
    items.className = "filter-items";

    for (const item of category.items) {
      const count = countFor(category.type, item.id);
      const label = document.createElement("label");
      label.className = "check";
      label.innerHTML = `<span>${item.label}</span><span class="badge">${count}</span>`;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.filter = category.type;
      input.dataset.value = item.id;
      input.addEventListener("change", () => {
        selectFilter(category.type, item.id, input.checked);
        queueRender();
      });
      label.prepend(input);
      items.appendChild(label);
    }

    details.appendChild(items);
    els.filters.appendChild(details);
  }
}

function selectFilter(type, value, checked) {
  if (!state.selected[type]) state.selected[type] = new Set();
  if (checked) state.selected[type].add(value);
  else state.selected[type].delete(value);

  const input = document.querySelector(`input[data-filter="${type}"][data-value="${value}"]`);
  if (input) input.checked = checked;
}

function countFor(type, value) {
  return state.samples.filter(sample => filterValue(sample, type) === value).length;
}

function initGlobe() {
  globe = Globe()(els.globe)
    .backgroundColor("rgba(0,0,0,0)")
    .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
    .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
    .showAtmosphere(true)
    .atmosphereColor("#7ce7ff")
    .atmosphereAltitude(0.22)
    .pointLat("lat")
    .pointLng("lon")
    .pointAltitude(d => 0.012 + Math.min(0.045, 0.006 * pointWeight(d)))
    .pointRadius(d => 0.26 + 0.04 * pointWeight(d))
    .pointColor(d => colorByY[d.ydna_major] || colorByY.default)
    .pointLabel(sampleLabel)
    .pointsTransitionDuration(650)
    .ringLat("lat")
    .ringLng("lon")
    .ringColor(d => colorWithAlpha(colorByY[d.ydna_major] || colorByY.default, 0.55))
    .ringMaxRadius(2.1)
    .ringPropagationSpeed(0.55)
    .ringRepeatPeriod(1800);

  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.35;
  globe.pointOfView({ lat: 36, lng: 28, altitude: 2.35 }, 0);

  window.addEventListener("resize", () => globe.width(els.globe.clientWidth).height(els.globe.clientHeight));
}

function tick(timestamp) {
  if (state.lastFrame == null) state.lastFrame = timestamp;
  const dt = Math.min(0.08, (timestamp - state.lastFrame) / 1000 || 0);
  state.lastFrame = timestamp;

  if (state.playing) {
    state.currentBP -= PLAY_SPEED_BP_PER_SEC * dt;
    if (state.currentBP < state.minBP) state.currentBP = state.maxBP;
    els.slider.value = Math.round(state.currentBP / 50) * 50;
    queueRender();
  }

  requestAnimationFrame(tick);
}

function queueRender() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  requestAnimationFrame(() => {
    state.renderQueued = false;
    render();
  });
}

function render() {
  const visible = state.samples.filter(sample => inTime(sample) && matchesFilters(sample));
  const pulses = visible.filter((_, index) => index % 2 === 0).slice(0, 80);

  globe.pointsData(visible);
  globe.ringsData(pulses);

  els.timeLabel.value = `${Math.round(state.currentBP)} BP  ·  ${yearText(state.currentBP)}`;
  els.stats.textContent = `${visible.length} visible / ${state.samples.length} samples · ±${TIME_WINDOW_BP / 2} years`;
}

function inTime(sample) {
  return Math.abs(sample.ybp - state.currentBP) <= TIME_WINDOW_BP / 2;
}

function matchesFilters(sample) {
  for (const [type, selected] of Object.entries(state.selected)) {
    if (selected.size === 0) continue;
    if (!selected.has(filterValue(sample, type))) return false;
  }
  return true;
}

function filterValue(sample, type) {
  if (type === "population") return sample.population;
  if (type === "ydna_major") return sample.ydna_major;
  if (type === "mtdna_major") return sample.mtdna_major;
  return sample[type];
}

function pointWeight(sample) {
  const ageBoost = Math.max(0, Math.min(1, sample.ybp / 12000));
  return 1 + ageBoost;
}

function sampleLabel(d) {
  return `
    <div class="tip">
      <strong>${d.id}</strong><br/>
      ${d.population || "Unknown group"} · ${Math.round(d.ybp)} BP<br/>
      Y-DNA: ${d.ydna || "—"} · mtDNA: ${d.mtdna || "—"}<br/>
      ${d.site || "Unknown site"}, ${d.country || ""}
    </div>
  `;
}

function yearText(ybp) {
  const year = 1950 - Math.round(ybp);
  return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
}

function majorY(value = "") {
  const x = String(value).trim();
  if (/^R1b/i.test(x)) return "R1b";
  if (/^R1a/i.test(x)) return "R1a";
  if (/^J2/i.test(x)) return "J2";
  if (/^G2/i.test(x)) return "G2";
  if (/^I2/i.test(x)) return "I2";
  if (/^E1b/i.test(x) || /^E-M/i.test(x)) return "E1b";
  return x.split(/[\s\-*_/]/)[0] || "Unknown";
}

function majorMt(value = "") {
  const x = String(value).trim();
  const match = x.match(/^[A-Z]+/i);
  return match ? match[0].toUpperCase().slice(0, 1) : "Unknown";
}

function colorWithAlpha(hex, alpha) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
