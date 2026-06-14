const state = {
  schools: [],
  filtered: [],
  selectedId: "",
  watchIds: new Set(),
  interest: "全部",
  area: "全部",
  minScore: 560,
  markers: new Map(),
  map: null
};

const els = {
  totalCount: document.querySelector("#totalCount"),
  searchInput: document.querySelector("#searchInput"),
  scoreRange: document.querySelector("#scoreRange"),
  scoreLabel: document.querySelector("#scoreLabel"),
  interestChips: document.querySelector("#interestChips"),
  areaChips: document.querySelector("#areaChips"),
  schoolGrid: document.querySelector("#schoolGrid"),
  schoolDetail: document.querySelector("#schoolDetail"),
  resultTitle: document.querySelector("#resultTitle"),
  mapBadge: document.querySelector("#mapBadge"),
  compareTitle: document.querySelector("#compareTitle"),
  compareCount: document.querySelector("#compareCount"),
  metricGrid: document.querySelector("#metricGrid"),
  compareBars: document.querySelector("#compareBars"),
  watchList: document.querySelector("#watchList"),
  compareTable: document.querySelector("#compareTable"),
  recommendButton: document.querySelector("#recommendButton"),
  clearButton: document.querySelector("#clearButton"),
  fitButton: document.querySelector("#fitButton")
};

const interestOptions = ["全部", "理工", "医学", "财经", "政法", "师范", "传媒艺术", "农林地矿", "语言"];
const areaOptions = ["全部", "海淀学院路", "海淀西部", "朝阳东部", "昌平北部", "西城东城", "房山良乡"];
const scoreBands = [
  { label: "680+", min: 680 },
  { label: "640-679", min: 640, max: 679 },
  { label: "600-639", min: 600, max: 639 },
  { label: "560-599", min: 560, max: 599 }
];

function toNumber(value) {
  return Number.parseFloat(value);
}

function scoreOf(school) {
  return Number.parseInt(school["学校最低投档分"], 10);
}

function maxScoreOf(school) {
  return Number.parseInt(school["学校最高投档分"], 10);
}

function latLng(school) {
  return [toNumber(school["纬度"]), toNumber(school["经度"])];
}

function areaOf(school) {
  const [lat, lng] = latLng(school);
  if (lat > 40.05 || lng < 116.27) return "昌平北部";
  if (lng > 116.43) return "朝阳东部";
  if (lat < 39.91 && lng < 116.32) return "房山良乡";
  if (lng < 116.32) return "海淀西部";
  if (lng > 116.39 && lat < 39.95) return "西城东城";
  return "海淀学院路";
}

function interestOf(school) {
  const text = school["优势专业"];
  if (/医学|临床|药学|公共卫生|口腔/.test(text)) return "医学";
  if (/经济|金融|财政|会计|贸易|工商|统计/.test(text)) return "财经";
  if (/法学|公安|政治|侦查|治安/.test(text)) return "政法";
  if (/教育|心理|师范|数学|语言文学|世界史/.test(text)) return "师范";
  if (/传媒|新闻|影视|戏剧|美术|设计|电影|动画|播音/.test(text)) return "传媒艺术";
  if (/农业|林学|风景园林|地质|矿业|石油|水土/.test(text)) return "农林地矿";
  if (/外语|翻译|国际组织/.test(text)) return "语言";
  return "理工";
}

function scoreBandOf(school) {
  const score = scoreOf(school);
  return scoreBands.find((band) => score >= band.min && (band.max === undefined || score <= band.max))?.label || "其他";
}

function textOf(school) {
  return `${school["学校名称"]} ${school["优势专业"]} ${school["专业组分数明细"]} ${areaOf(school)} ${interestOf(school)} ${scoreBandOf(school)}`;
}

function markerIcon(school) {
  const selected = school.id === state.selectedId ? "selected" : "";
  const watched = state.watchIds.has(school.id) ? "watched" : "";
  const label = scoreOf(school) >= 680 ? "A" : scoreOf(school) >= 640 ? "B" : scoreOf(school) >= 600 ? "C" : "D";
  return L.divIcon({
    className: "",
    html: `<span class="marker-pin ${selected} ${watched}"><span>${label}</span></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28]
  });
}

function buildChips(container, options, activeValue, onClick) {
  container.innerHTML = options.map((option) => (
    `<button class="chip ${option === activeValue ? "active" : ""}" type="button" data-value="${option}">${option}</button>`
  )).join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => onClick(button.dataset.value));
  });
}

function renderInterestChips() {
  buildChips(els.interestChips, interestOptions, state.interest, (value) => {
    state.interest = value;
    renderInterestChips();
    refresh();
    fitFiltered();
  });
}

function renderAreaChips() {
  buildChips(els.areaChips, areaOptions, state.area, (value) => {
    state.area = value;
    renderAreaChips();
    refresh();
    fitFiltered();
  });
}

function filterSchools() {
  const query = els.searchInput.value.trim();
  state.filtered = state.schools.filter((school) => {
    const scoreMatch = scoreOf(school) >= state.minScore;
    const interestMatch = state.interest === "全部" || interestOf(school) === state.interest;
    const areaMatch = state.area === "全部" || areaOf(school) === state.area;
    const queryMatch = !query || textOf(school).includes(query);
    return scoreMatch && interestMatch && areaMatch && queryMatch;
  });
}

function updateMarkers() {
  const visible = new Set(state.filtered.map((school) => school.id));
  state.markers.forEach((marker, id) => {
    const school = state.schools.find((item) => item.id === id);
    marker.setIcon(markerIcon(school));
    if (visible.has(id)) {
      if (!state.map.hasLayer(marker)) marker.addTo(state.map);
    } else {
      marker.remove();
    }
  });
}

function renderSchoolGrid() {
  els.resultTitle.textContent = `${state.filtered.length} 所符合条件`;
  if (!state.filtered.length) {
    els.schoolGrid.innerHTML = `<div class="empty">没有匹配学校。可以降低分数线，或切回“全部”兴趣方向。</div>`;
    return;
  }

  els.schoolGrid.innerHTML = state.filtered.map((school) => {
    const watched = state.watchIds.has(school.id) ? "selected" : "";
    const active = school.id === state.selectedId ? "active" : "";
    const tags = school["优势专业"].split("；").slice(0, 3).join(" / ");
    return `
      <article class="school-card ${watched} ${active}" data-id="${school.id}">
        <img src="data/${school["图片文件"]}" alt="${school["学校名称"]}" />
        <div class="school-card-body">
          <h3>${school["学校名称"]}</h3>
          <p>${scoreOf(school)}-${maxScoreOf(school)} 分 · ${interestOf(school)} · ${areaOf(school)}</p>
          <p>${tags}</p>
          <div class="card-actions">
            <button class="mini-button view" type="button" data-id="${school.id}">查看</button>
            <button class="mini-button pick ${watched}" type="button" data-id="${school.id}">${watched ? "已关注" : "加入对比"}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  els.schoolGrid.querySelectorAll(".school-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button.pick")) return;
      selectSchool(card.dataset.id, true);
    });
  });
  els.schoolGrid.querySelectorAll("button.pick").forEach((button) => {
    button.addEventListener("click", () => toggleWatch(button.dataset.id));
  });
}

function renderDetail() {
  const school = state.schools.find((item) => item.id === state.selectedId) || state.filtered[0] || state.schools[0];
  if (!school) return;
  const tags = school["优势专业"].split("；").map((tag) => `<span class="tag">${tag}</span>`).join("");
  els.schoolDetail.innerHTML = `
    <div class="detail-image">
      <img src="data/${school["图片文件"]}" alt="${school["学校名称"]}" />
    </div>
    <div class="detail-body">
      <div class="score-line">
        <span class="score-pill">最低 ${scoreOf(school)} 分</span>
        <span class="score-pill">最高 ${maxScoreOf(school)} 分</span>
        <span class="score-pill">${interestOf(school)}</span>
        <span class="score-pill">${areaOf(school)}</span>
      </div>
      <h2>${school["学校名称"]}</h2>
      <p>适合关注 ${interestOf(school)} 方向的孩子重点了解。可以把它加入对比，再和同分段、同区域或同专业方向的学校一起判断是否值得实地探访。</p>
      <div class="tag-row">${tags}</div>
      <a class="source-link" href="${school.wikidata_url}" target="_blank" rel="noreferrer">查看坐标来源</a>
    </div>
  `;
}

function selectSchool(id, pan = false) {
  state.selectedId = id;
  const school = state.schools.find((item) => item.id === id);
  renderDetail();
  renderSchoolGrid();
  updateMarkers();
  if (pan && school) {
    state.map.flyTo(latLng(school), Math.max(state.map.getZoom(), 13), { duration: 0.7 });
    state.markers.get(id)?.openPopup();
  }
}

function toggleWatch(id) {
  if (state.watchIds.has(id)) {
    state.watchIds.delete(id);
  } else {
    state.watchIds.add(id);
  }
  renderSchoolGrid();
  updateMarkers();
  renderCompare();
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function average(items, getter) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + getter(item), 0) / items.length;
}

function renderBarGroup(title, counts, order) {
  const max = Math.max(1, ...Object.values(counts));
  const rows = order.filter((item) => counts[item]).map((item) => {
    const count = counts[item];
    const width = Math.max(8, Math.round((count / max) * 100));
    return `
      <div class="bar-row">
        <span>${item}</span>
        <div class="bar-track"><i style="width:${width}%"></i></div>
        <strong>${count}</strong>
      </div>
    `;
  }).join("");
  return `
    <section class="bar-card">
      <h3>${title}</h3>
      ${rows || `<p class="muted">暂无数据</p>`}
    </section>
  `;
}

function comparisonPool() {
  const watched = state.schools.filter((school) => state.watchIds.has(school.id));
  return watched.length ? watched : state.filtered;
}

function renderCompare() {
  const items = comparisonPool();
  const usingWatch = state.watchIds.size > 0;
  els.compareTitle.textContent = usingWatch ? "关注清单对比" : "筛选结果概览";
  els.compareCount.textContent = `${items.length} 所`;

  if (!items.length) {
    els.metricGrid.innerHTML = "";
    els.compareBars.innerHTML = "";
    els.watchList.innerHTML = `<div class="empty">暂无学校可对比。调整筛选条件后会自动生成概览。</div>`;
    els.compareTable.innerHTML = "";
    return;
  }

  const minScore = Math.min(...items.map(scoreOf));
  const maxScore = Math.max(...items.map(maxScoreOf));
  const avgScore = Math.round(average(items, scoreOf));
  const topInterest = Object.entries(countBy(items, interestOf)).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  els.metricGrid.innerHTML = `
    <div class="metric-card"><span>对比学校</span><strong>${items.length}</strong></div>
    <div class="metric-card"><span>最低分范围</span><strong>${minScore}-${maxScore}</strong></div>
    <div class="metric-card"><span>平均最低分</span><strong>${avgScore}</strong></div>
    <div class="metric-card"><span>最多方向</span><strong>${topInterest}</strong></div>
  `;

  els.compareBars.innerHTML = [
    renderBarGroup("按分数段", countBy(items, scoreBandOf), scoreBands.map((band) => band.label)),
    renderBarGroup("按专业方向", countBy(items, interestOf), interestOptions.filter((x) => x !== "全部")),
    renderBarGroup("按探访区域", countBy(items, areaOf), areaOptions.filter((x) => x !== "全部"))
  ].join("");

  const watched = state.schools.filter((school) => state.watchIds.has(school.id));
  els.watchList.innerHTML = watched.length
    ? `<h3>已关注学校</h3><div class="watch-tags">${watched.map((school) => `<button type="button" data-id="${school.id}">${school["学校名称"]}</button>`).join("")}</div>`
    : `<div class="empty">还没有关注学校。点击卡片里的“加入对比”，这里会变成你的探访候选清单。</div>`;
  els.watchList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectSchool(button.dataset.id, true));
  });

  els.compareTable.innerHTML = [...items]
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 12)
    .map((school) => `
      <tr data-id="${school.id}">
        <td>${school["学校名称"]}</td>
        <td>${scoreOf(school)}</td>
        <td>${maxScoreOf(school)}</td>
        <td>${interestOf(school)}</td>
        <td>${areaOf(school)}</td>
      </tr>
    `).join("");
  els.compareTable.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => selectSchool(row.dataset.id, true));
  });
}

function recommendWatchList() {
  const groups = new Map();
  state.filtered.forEach((school) => {
    const key = interestOf(school);
    const current = groups.get(key);
    if (!current || scoreOf(school) > scoreOf(current)) groups.set(key, school);
  });
  const recommended = [...groups.values()]
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 8);
  state.watchIds = new Set(recommended.map((school) => school.id));
  if (recommended[0]) state.selectedId = recommended[0].id;
  renderSchoolGrid();
  renderDetail();
  updateMarkers();
  renderCompare();
}

function fitFiltered() {
  const schools = state.filtered.length ? state.filtered : state.schools;
  state.map.fitBounds(L.latLngBounds(schools.map(latLng)), { padding: [58, 58], maxZoom: 12 });
}

function refresh() {
  filterSchools();
  if (state.filtered.length && !state.filtered.some((school) => school.id === state.selectedId)) {
    state.selectedId = state.filtered[0].id;
  }
  renderSchoolGrid();
  renderDetail();
  updateMarkers();
  renderCompare();
  els.mapBadge.textContent = `显示 ${state.filtered.length} / ${state.schools.length} 所学校`;
}

function initMap() {
  state.map = L.map("map", { minZoom: 9, maxZoom: 18, preferCanvas: true }).setView([39.96, 116.36], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
}

async function init() {
  initMap();
  if (Array.isArray(window.UNIVERSITIES)) {
    state.schools = window.UNIVERSITIES;
  } else {
    const response = await fetch("data/universities.json");
    state.schools = await response.json();
  }

  state.schools.forEach((school) => {
    const marker = L.marker(latLng(school), {
      icon: markerIcon(school),
      title: school["学校名称"]
    }).bindPopup(`<strong>${school["学校名称"]}</strong><br />最低 ${scoreOf(school)} 分 · ${interestOf(school)}`);
    marker.on("click", () => selectSchool(school.id, false));
    state.markers.set(school.id, marker);
  });

  els.totalCount.textContent = String(state.schools.length);
  state.selectedId = state.schools[0]?.id || "";
  renderInterestChips();
  renderAreaChips();

  els.searchInput.addEventListener("input", refresh);
  els.scoreRange.addEventListener("input", () => {
    state.minScore = Number.parseInt(els.scoreRange.value, 10);
    els.scoreLabel.textContent = `${state.minScore}+`;
    refresh();
  });
  els.recommendButton.addEventListener("click", recommendWatchList);
  els.clearButton.addEventListener("click", () => {
    state.watchIds.clear();
    renderSchoolGrid();
    updateMarkers();
    renderCompare();
  });
  els.fitButton.addEventListener("click", fitFiltered);

  refresh();
  fitFiltered();
}

init().catch((error) => {
  els.mapBadge.textContent = "数据加载失败";
  els.schoolGrid.innerHTML = `<div class="empty">${error.message}</div>`;
});
