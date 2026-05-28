let geographicMap = null;
let geographicLayer = null;
let geographicDataCache = null;
let geoJsonBoundaryCache = null;
let selectedRegionLayer = null;
let geographicInitialized = false;

const REGION_NAME_KEYS = [
  "region",
  "Region",
  "REGION",
  "name",
  "Name",
  "NAME",
  "vic_region",
  "VIC_REGION"
];

function formatNumber(value) {
  const num = Number(value || 0);
  return num.toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function getRegionNameFromFeature(feature) {
  for (const key of REGION_NAME_KEYS) {
    const value = feature?.properties?.[key];
    if (value) return String(value).trim();
  }
  return null;
}

function normaliseRegionName(name) {
  return String(name || "").trim().toLowerCase();
}

function getMetricColor(value, values, metric) {
  if (!values.length) return "#6c757d";

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (metric === "employment_growth") {
    if (value < 0) return "#dc2626";
    if (value < max * 0.33) return "#f59e0b";
    return "#22c55e";
  }

  if (metric === "retirements") {
    if (value < min + (max - min) * 0.25) return "#fed7aa";
    if (value < min + (max - min) * 0.5) return "#fb923c";
    if (value < min + (max - min) * 0.75) return "#ef4444";
    return "#991b1b";
  }

  if (value < min + (max - min) * 0.25) return "#d1fae5";
  if (value < min + (max - min) * 0.5) return "#86efac";
  if (value < min + (max - min) * 0.75) return "#22c55e";
  return "#15803d";
}

function renderLegend(legend) {
  const legendContainer = document.getElementById("geoLegend");
  if (!legendContainer || !legend) return;

  const colors = legend.colors || [];

  legendContainer.innerHTML = `
    <div class="geo-legend-item">
      <span>${legend.lowLabel || "Low"}</span>
    </div>
    ${colors.map(color => `
      <div class="geo-legend-item">
        <span class="geo-legend-swatch" style="background:${color};"></span>
      </div>
    `).join("")}
    <div class="geo-legend-item">
      <span>${legend.highLabel || "High"}</span>
    </div>
  `;
}

function updateRegionPanel(data) {
  document.getElementById("geoRegionName").textContent = data?.region || "None selected";
  document.getElementById("geoTotalWorkers").textContent = data?.kpis ? formatNumber(data.kpis.total_new_workers) : "--";
  document.getElementById("geoEmploymentGrowth").textContent = data?.kpis ? formatNumber(data.kpis.employment_growth) : "--";
  document.getElementById("geoRetirements").textContent = data?.kpis ? formatNumber(data.kpis.retirement_projection) : "--";
  document.getElementById("geoTopOccupation").textContent = data?.kpis?.top_occupation || "--";
  document.getElementById("geoInsight").textContent = data?.insight || "Select a region on the map to view region-specific insights.";

  const occupationsList = document.getElementById("geoOccupations");
  const industriesList = document.getElementById("geoIndustries");

  occupationsList.innerHTML = (data?.occupations?.length
    ? data.occupations.map(item => `
        <li>
          <span>${item.name}</span>
          <span class="geo-stat-value">${formatNumber(item.value)}</span>
        </li>
      `).join("")
    : `<li><span>No region selected</span><span class="geo-stat-value">--</span></li>`);

  industriesList.innerHTML = (data?.industries?.length
    ? data.industries.map(item => `
        <li>
          <span>${item.name}</span>
          <span class="geo-stat-value">${formatNumber(item.value)}</span>
        </li>
      `).join("")
    : `<li><span>No region selected</span><span class="geo-stat-value">--</span></li>`);
}

async function fetchRegionDetails(regionName) {
  try {
    const response = await fetch(`/api/geographic/region/${encodeURIComponent(regionName)}`);
    if (!response.ok) {
      throw new Error("Failed to fetch region details");
    }

    const data = await response.json();
    updateRegionPanel(data);
  } catch (error) {
    console.error("Error fetching region details:", error);
  }
}

function resetSelectedLayer() {
  if (selectedRegionLayer && geographicLayer) {
    geographicLayer.resetStyle(selectedRegionLayer);
  }
  selectedRegionLayer = null;
}

function highlightSelectedLayer(layer) {
  resetSelectedLayer();
  selectedRegionLayer = layer;
  selectedRegionLayer.setStyle({
    weight: 3,
    color: "#ffffff",
    dashArray: "",
    fillOpacity: 0.95
  });

  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
    selectedRegionLayer.bringToFront();
  }
}

function createGeoJsonLayer(boundaryData, apiData) {
  const regionMap = new Map(
    (apiData.regions || []).map(item => [normaliseRegionName(item.region), item])
  );

  const values = (apiData.regions || []).map(item => Number(item.value || 0));
  const metric = apiData.metric;

  function styleFeature(feature) {
    const regionName = getRegionNameFromFeature(feature);
    const matched = regionMap.get(normaliseRegionName(regionName));
    const value = matched ? matched.value : 0;

    return {
      fillColor: getMetricColor(value, values, metric),
      weight: 1,
      opacity: 1,
      color: "#2c2f36",
      dashArray: "2",
      fillOpacity: 0.85
    };
  }

  function onEachFeature(feature, layer) {
    const regionName = getRegionNameFromFeature(feature);
    const matched = regionMap.get(normaliseRegionName(regionName));

    layer.on({
      mouseover: (e) => {
        const targetLayer = e.target;
        if (targetLayer !== selectedRegionLayer) {
          targetLayer.setStyle({
            weight: 2,
            color: "#ffffff",
            dashArray: "",
            fillOpacity: 0.95
          });
        }
      },
      mouseout: (e) => {
        const targetLayer = e.target;
        if (targetLayer !== selectedRegionLayer) {
          geographicLayer.resetStyle(targetLayer);
        }
      },
      click: async (e) => {
        const targetLayer = e.target;
        highlightSelectedLayer(targetLayer);
        if (regionName) {
          await fetchRegionDetails(regionName);
        }
      }
    });

    const tooltipText = matched
      ? `<strong>${regionName}</strong><br>${apiData.metricLabel}: ${formatNumber(matched.value)}`
      : `<strong>${regionName || "Unknown Region"}</strong><br>No data`;

    layer.bindTooltip(tooltipText, {
      sticky: true
    });
  }

  return L.geoJSON(boundaryData, {
    style: styleFeature,
    onEachFeature
  });
}

async function loadGeographicData() {
  const metricSelect = document.getElementById("geoMetricSelect");
  const selectedMetric = metricSelect?.value || "total_new_workers";

  const response = await fetch(`/api/geographic?metric=${encodeURIComponent(selectedMetric)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch geographic data");
  }

  const data = await response.json();
  geographicDataCache = data;
  renderLegend(data.legend);
  return data;
}

async function loadBoundaryData() {
  if (geoJsonBoundaryCache) {
    return geoJsonBoundaryCache;
  }

  const response = await fetch("/assets/geo/victoria-regions.geojson");
  if (!response.ok) {
    throw new Error("Failed to fetch Victoria GeoJSON");
  }

  geoJsonBoundaryCache = await response.json();
  return geoJsonBoundaryCache;
}

async function renderGeographicMap() {
  const mapContainer = document.getElementById("victoriaMap");
  if (!mapContainer) return;

  if (!geographicMap) {
    geographicMap = L.map("victoriaMap");

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
    }).addTo(geographicMap);
  }

  const [apiData, boundaryData] = await Promise.all([
    loadGeographicData(),
    loadBoundaryData()
  ]);

  if (geographicLayer) {
    geographicMap.removeLayer(geographicLayer);
  }

  resetSelectedLayer();
  updateRegionPanel(null);

  geographicLayer = createGeoJsonLayer(boundaryData, apiData);
  geographicLayer.addTo(geographicMap);

  geographicMap.fitBounds(geographicLayer.getBounds(), {
    padding: [20, 20]
  });

  setTimeout(() => {
    geographicMap.invalidateSize();
  }, 150);
}

function attachGeographicEvents() {
  const metricSelect = document.getElementById("geoMetricSelect");
  if (metricSelect && !metricSelect.dataset.bound) {
    metricSelect.addEventListener("change", async () => {
      try {
        await renderGeographicMap();
      } catch (error) {
        console.error("Error updating geographic map:", error);
      }
    });
    metricSelect.dataset.bound = "true";
  }
}

window.initGeographicOverview = async function initGeographicOverview() {
  attachGeographicEvents();

  if (!geographicInitialized) {
    geographicInitialized = true;
  }

  try {
    await renderGeographicMap();
  } catch (error) {
    console.error("Error initialising geographic overview:", error);
  }
};