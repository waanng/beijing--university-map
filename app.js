const state = {
  schools: [],
  filtered: [],
  selectedId: "",
  chosenIds: new Set(),
  interest: "全部",
  area: "全部",
  minScore: 560,
  maxStops: 5,
  markers: new Map(),
  routeLine: null,
  map: null
};

const els = {
  totalCount: document.querySelector("#totalCount"),
  searchInput: document.querySelector("#searchInput"),
  scoreRange: document.querySelector("#scoreRange"),
  scoreLabel: document.querySelector("#scoreLabel"),
  stopRange: document.querySelector("#stopRange"),
  stopLabel: document.querySelector("#stopLabel"),
  startSelect: document.querySelector("#startSelect"),
  interestChips: document.querySelector("#interestChips"),
  areaChips: document.querySelector("#areaChips"),
  schoolGrid: document.querySelector("#schoolGrid"),
  schoolDetail: document.querySelector("#schoolDetail"),
  resultTitle: document.querySelector("#resultTitle"),
  mapBadge: document.querySelector("#mapBadge"),
  routeTitle: document.querySelector("#routeTitle"),
  routeDistance: document.querySelector("#routeDistance"),
  routeList: document.querySelector("#routeList"),
  planButton: document.querySelector("#planButton"),
  clearButton: document.querySelector("#clearButton"),
  fitButton: document.querySelector("#fitButton")
};

const interestOptions = ["全部", "理工", "医学", "财经", "政法", "师范", "传媒艺术", "农林地矿", "语言"];
const areaOptions = ["全部", "海淀学院路", "海淀西部", "朝阳东部", "昌平北部", "西城东城", "房山良乡"];

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

function textOf(school) {
  return `${school["学校名称"]} ${school["优势专业"]} ${school["专业组分数明细"]} ${areaOf(school)} ${interestOf(school)}`;
}

function distanceKm(a, b) {
  const [lat1, lon1] = latLng(a).map((x) => x * Math.PI / 180);
  const [lat2, lon2] = latLng(b).map((x) => x * Math.PI / 180);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function markerIcon(school) {
  const selected = school.id === state.selectedId ? "selected" : "";
  const route = state.chosenIds.has(school.id) ? "route" : "";
  const label = scoreOf(school) >= 680 ? "A" : scoreOf(school) >= 640 ? "B" : scoreOf(school) >= 600 ? "C" : "D";
  return L.divIcon({
    className: "",
    html: `<span class="marker-pin ${selected} ${route}"><span>${label}</span></span>`,
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
    const selected = state.chosenIds.has(school.id) ? "selected" : "";
    const active = school.id === state.selectedId ? "active" : "";
    const tags = school["优势专业"].split("；").slice(0, 3).join(" / ");
    return `
      <article class="school-card ${selected} ${active}" data-id="${school.id}">
        <img src="data/${school["图片文件"]}" alt="${school["学校名称"]}" />
        <div class="school-card-body">
          <h3>${school["学校名称"]}</h3>
          <p>${scoreOf(school)}-${maxScoreOf(school)} 分 · ${areaOf(school)}</p>
          <p>${tags}</p>
          <div class="card-actions">
            <button class="mini-button view" type="button" data-id="${school.id}">查看</button>
            <button class="mini-button pick ${selected}" type="button" data-id="${school.id}">${selected ? "已加入" : "加入路线"}</button>
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
    button.addEventListener("click", () => toggleChosen(button.dataset.id));
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
        <span class="score-pill">${areaOf(school)}</span>
      </div>
      <h2>${school["学校名称"]}</h2>
      <p>适合关注 ${interestOf(school)} 方向的孩子重点了解。探访时可以观察校园区位、学科氛围、交通便利度，以及相关学院或实验空间的开放信息。</p>
      <div class="tag-row">${tags}</div>
      <a class="source-link" href="${school.wikidata_url}" target="_blank" rel="noreferrer">查看坐标来源</a>
    </div>
  `;
}

function renderStartOptions() {
  const current = els.startSelect.value;
  const options = state.filtered.length ? state.filtered : state.schools;
  els.startSelect.innerHTML = options.map((school) => (
    `<option value="${school.id}">${school["学校名称"]}</option>`
  )).join("");
  if (current && options.some((school) => school.id === current)) els.startSelect.value = current;
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

function toggleChosen(id) {
  if (state.chosenIds.has(id)) {
    state.chosenIds.delete(id);
  } else {
    state.chosenIds.add(id);
  }
  renderSchoolGrid();
  updateMarkers();
  renderRoute();
}

function nearestRoute(schools, startId) {
  if (!schools.length) return [];
  const remaining = [...schools];
  const route = [];
  let currentIndex = Math.max(0, remaining.findIndex((school) => school.id === startId));
  route.push(remaining.splice(currentIndex, 1)[0]);
  while (remaining.length) {
    const current = route[route.length - 1];
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((candidate, index) => {
      const d = distanceKm(current, candidate);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = index;
      }
    });
    route.push(remaining.splice(bestIndex, 1)[0]);
  }
  return route;
}

function planRoute() {
  let pool = state.chosenIds.size
    ? state.schools.filter((school) => state.chosenIds.has(school.id))
    : state.filtered.slice(0, state.maxStops);
  if (!pool.length) pool = state.schools.slice(0, state.maxStops);
  pool = pool.slice(0, state.maxStops);
  const route = nearestRoute(pool, els.startSelect.value || pool[0]?.id);
  state.chosenIds = new Set(route.map((school) => school.id));
  renderRoute(route);
  renderSchoolGrid();
  updateMarkers();
  if (route.length) {
    const bounds = L.latLngBounds(route.map(latLng));
    state.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
  }
}

function renderRoute(route = null) {
  const schools = route || nearestRoute(state.schools.filter((school) => state.chosenIds.has(school.id)), els.startSelect.value);
  if (state.routeLine) state.routeLine.remove();
  if (!schools.length) {
    els.routeTitle.textContent = "先选择学校";
    els.routeDistance.textContent = "0 km";
    els.routeList.innerHTML = `<li class="empty">点选学校或点击“生成探访路线”，这里会出现建议顺序。</li>`;
    return;
  }

  let total = 0;
  for (let i = 1; i < schools.length; i += 1) total += distanceKm(schools[i - 1], schools[i]);

  els.routeTitle.textContent = `${schools.length} 站探访`;
  els.routeDistance.textContent = `${total.toFixed(1)} km`;
  els.routeList.innerHTML = schools.map((school, index) => {
    const next = index === 0 ? "起点" : `距上一站约 ${distanceKm(schools[index - 1], school).toFixed(1)} km`;
    const focus = school["优势专业"].split("；").slice(0, 2).join("、");
    return `
      <li class="route-item">
        <span class="route-num">${index + 1}</span>
        <div>
          <strong>${school["学校名称"]}</strong>
          <span>${next} · ${scoreOf(school)} 分起 · 重点看 ${focus}</span>
        </div>
      </li>
    `;
  }).join("");

  state.routeLine = L.polyline(schools.map(latLng), {
    color: "#315f83",
    weight: 4,
    opacity: 0.82,
    dashArray: "8 8"
  }).addTo(state.map);
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
  renderStartOptions();
  renderSchoolGrid();
  renderDetail();
  updateMarkers();
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
  els.stopRange.addEventListener("input", () => {
    state.maxStops = Number.parseInt(els.stopRange.value, 10);
    els.stopLabel.textContent = `${state.maxStops} 所`;
  });
  els.planButton.addEventListener("click", planRoute);
  els.clearButton.addEventListener("click", () => {
    state.chosenIds.clear();
    renderRoute([]);
    renderSchoolGrid();
    updateMarkers();
  });
  els.fitButton.addEventListener("click", fitFiltered);

  refresh();
  renderRoute([]);
  fitFiltered();
}

init().catch((error) => {
  els.mapBadge.textContent = "数据加载失败";
  els.schoolGrid.innerHTML = `<div class="empty">${error.message}</div>`;
});
