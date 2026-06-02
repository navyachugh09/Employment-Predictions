let industryChart = null;
let regionChart = null;
let selectedOccupation = null;
let industryDataCache = null;

const metricLabels = {
  total_new_workers: "Total New Workers",
  employment_2025: "Employment in 2025",
  employment_growth: "Employment Growth",
  retirements: "Retirements"
};

function formatNumber(value) {
  const rounded = Math.ceil(Number(value || 0));
  return rounded.toLocaleString();
}

function getSelectedMetric() {
  const metricSelect = document.getElementById("industryMetricSelect");
  return metricSelect ? metricSelect.value : "total_new_workers";
}

function getSelectedIndustries() {
  const industryMenu = document.getElementById("industrySelectMenu");
  if (!industryMenu) {
    return ["all"];
  }

  const selected = Array.from(industryMenu.querySelectorAll('input[type=checkbox]:checked')).map((input) => input.value);
  if (selected.includes("all") || selected.length === 0) {
    return ["all"];
  }

  return selected;
}

function updateIndustryDropdownLabel() {
  const selected = getSelectedIndustries();
  const labelElement = document.getElementById("industryDropdownLabel");
  if (!labelElement) {
    return;
  }

  if (selected.includes("all")) {
    labelElement.textContent = "All industries";
    return;
  }

  if (selected.length === 1) {
    labelElement.textContent = selected[0];
    return;
  }

  if (selected.length <= 3) {
    labelElement.textContent = selected.join(", ");
    return;
  }

  labelElement.textContent = `${selected.length} industries selected`;
}

function renderFilters(filters) {
  const metricSelect = document.getElementById("industryMetricSelect");
  const industryMenu = document.getElementById("industrySelectMenu");

  metricSelect.innerHTML = filters.metrics
    .map(
      (metric) => `<option value="${metric.key}" ${metric.key === filters.selectedMetric ? "selected" : ""}>${metric.label}</option>`
    )
    .join("");

  const industryOptions = [
    `<div class="form-check"><input class="form-check-input" type="checkbox" id="industry-all" value="all" ${filters.selectedIndustries.length === 0 ? "checked" : ""}><label class="form-check-label" for="industry-all">All industries</label></div>`,
    ...filters.industries.map(
      (industry) => `<div class="form-check"><input class="form-check-input" type="checkbox" id="industry-${industry.replace(/[^a-z0-9]/gi, "_")}" value="${industry}" ${filters.selectedIndustries.includes(industry) ? "checked" : ""}><label class="form-check-label" for="industry-${industry.replace(/[^a-z0-9]/gi, "_")}">${industry}</label></div>`
    )
  ];

  industryMenu.innerHTML = industryOptions.join("");
  updateIndustryDropdownLabel();

  metricSelect.addEventListener("change", () => {
    loadIndustryData(getSelectedMetric(), getSelectedIndustries());
  });

  industryMenu.querySelectorAll("input[type=checkbox]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const clicked = event.target;
      const allCheckbox = document.getElementById("industry-all");
      const industryCheckboxes = Array.from(
        industryMenu.querySelectorAll('input[type=checkbox]')
      ).filter((box) => box.value !== "all");

      if (clicked.value === "all" && clicked.checked) {
        industryCheckboxes.forEach((box) => {
          box.checked = false;
        });
      } else {
        if (allCheckbox) {
          allCheckbox.checked = false;
        }

        const anyIndustryChecked = industryCheckboxes.some((box) => box.checked);
        if (!anyIndustryChecked && allCheckbox) {
          allCheckbox.checked = true;
        }
      }

      updateIndustryDropdownLabel();
      loadIndustryData(getSelectedMetric(), getSelectedIndustries());
    });
  });
}

function renderSummary(summary) {
  document.getElementById("industryMetricLabel").textContent = summary.selectedMetricLabel || "--";
  document.getElementById("industryMetricValue").textContent = formatNumber(summary.totalMetricValue || 0);
  document.getElementById("industryTopOccupationName").textContent = summary.topOccupation?.label || "--";
  document.getElementById("industryTopOccupationValue").textContent = formatNumber(summary.topOccupation?.value || 0);
  document.getElementById("industryBottomOccupationName").textContent = summary.bottomOccupation?.label || "--";
  document.getElementById("industryBottomOccupationValue").textContent = formatNumber(summary.bottomOccupation?.value || 0);
}

function createColorPalette(count) {
  const palette = [
    "#2563eb",
    "#14b8a6",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#22c55e",
    "#fb7185",
    "#0ea5e9",
    "#a855f7",
    "#f97316"
  ];
  return Array.from({ length: count }, (_, index) => palette[index % palette.length]);
}

function renderChart(canvasId, chartData, type = "bar") {
  const ctx = document.getElementById(canvasId).getContext("2d");

  if (canvasId === "occupationChart" && industryChart) {
    industryChart.destroy();
  }
  if (canvasId === "regionChart" && regionChart) {
    regionChart.destroy();
  }

  const isOccupationChart = canvasId === "occupationChart";

  const datasets = chartData.datasets || [
    {
      label: chartData.metricLabel || chartData.title,
      data: chartData.values.map(v => Math.ceil(Number(v || 0))),
      backgroundColor: isOccupationChart
        ? chartData.labels.map((label) => (label === selectedOccupation ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.8)"))
        : (chartData.backgroundColor || createColorPalette(chartData.labels.length).map((color) => `${color}80`)),
      borderColor: isOccupationChart
        ? chartData.labels.map((label) => (label === selectedOccupation ? "rgba(37,99,235,1)" : "rgba(255,255,255,0.95)"))
        : (chartData.borderColor || createColorPalette(chartData.labels.length)),
      borderWidth: 2,
      hoverBackgroundColor: isOccupationChart
        ? chartData.labels.map(() => "rgba(255,255,255,1)")
        : (chartData.backgroundColor || createColorPalette(chartData.labels.length).map((color) => `${color}CC`)),
      hoverBorderColor: isOccupationChart
        ? chartData.labels.map(() => "rgba(37,99,235,1)")
        : (chartData.borderColor || createColorPalette(chartData.labels.length))
    }
  ];

  const chartConfig = {
    type,
    data: {
      labels: chartData.labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: chartData.title
        },
        legend: {
          display: type === "doughnut"
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed.y ?? context.parsed;
              const roundedValue = Math.ceil(Number(value || 0));
              if (type === "doughnut") {
                const total = context.chart.data.datasets[0].data.reduce((sum, v) => sum + Number(v), 0);
                const percent = total ? ((Number(value) / total) * 100).toFixed(1) : 0;
                return `${context.label}: ${roundedValue.toLocaleString()} (${percent}%)`;
              }
              return `${context.dataset.label}: ${roundedValue.toLocaleString()}`;
            }
          }
        }
      },
      scales: type === "bar" ? {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        },
        y: {
          beginAtZero: true,
          suggestedMin: 0,
          ticks: {
            callback: function (value) {
              return value.toLocaleString();
            }
          }
        }
      } : {}
    }
  };

  if (type === "doughnut") {
    delete chartConfig.options.scales;
    chartConfig.options.plugins.legend.display = false;
  }

  if (isOccupationChart) {
    chartConfig.options.onClick = (event, elements) => {
      if (!elements.length) {
        return;
      }
      const clickedIndex = elements[0].index;
      const selectedLabel = chartData.labels[clickedIndex];
      setSelectedOccupation(selectedLabel);
    };
  }

  const chartInstance = new Chart(ctx, chartConfig);
  if (canvasId === "occupationChart") {
    industryChart = chartInstance;
  } else if (canvasId === "regionChart") {
    regionChart = chartInstance;
  }
}

function renderRegionLegend(labels, colors) {
  const legendContainer = document.getElementById("regionLegend");
  if (!legendContainer) {
    return;
  }

  legendContainer.innerHTML = labels
    .map((label, index) => `
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="legend-swatch" style="background:${colors[index]};"></span>
        <span>${label}</span>
      </div>
    `)
    .join("");
}

function setSelectedOccupation(label) {
  if (!industryDataCache) {
    return;
  }

  selectedOccupation = selectedOccupation === label ? null : label;
  renderChart("occupationChart", industryDataCache.charts.industry, "bar");
  renderRegionChart(industryDataCache.charts.breakdown);
}

function renderRegionChart(chartData) {
  const highlightRegions = selectedOccupation
    ? (industryDataCache?.occupationRegions?.[selectedOccupation] || []).map((item) => item.region)
    : [];

  const palette = createColorPalette(chartData.labels.length);

  chartData.backgroundColor = chartData.labels.map((label, index) => {
    if (selectedOccupation) {
      return highlightRegions.includes(label) ? "#2563eb" : "rgba(148,163,184,0.35)";
    }
    return `${palette[index]}80`;
  });

  chartData.borderColor = chartData.labels.map((label, index) => {
    if (selectedOccupation) {
      return highlightRegions.includes(label) ? "#2563eb" : "rgba(148,163,184,0.55)";
    }
    return palette[index];
  });

  renderChart("regionChart", chartData, "doughnut");
  renderRegionLegend(chartData.labels, chartData.backgroundColor);
}

async function loadIndustryData(metric = "total_new_workers", industries = ["all"]) {
  if (typeof industries === "string") {
    industries = industries.split(",").map((value) => value.trim()).filter(Boolean);
  }
  if (!industries || industries.length === 0) {
    industries = ["all"];
  }

  const params = new URLSearchParams();
  params.set("metric", metric);
  params.set("industry", industries.join(","));

  const response = await fetch(`/api/industry?${params.toString()}`);
  const data = await response.json();

  console.log("Fetching URL:", `/api/industry?${params.toString()}`);
  console.log("Industry API Response:", data);
  console.log("Summary keys:", Object.keys(data.summary || {}));
  console.log("topOccupation:", data.summary?.topOccupation);
  console.log("bottomOccupation:", data.summary?.bottomOccupation);

  if (!data.summary?.topOccupation) {
    console.error("ERROR: topOccupation is missing from API response!");
  }

  industryDataCache = data;
  selectedOccupation = null;

  renderFilters(data.filters);
  renderSummary(data.summary);
  renderChart("occupationChart", data.charts.industry, "bar");
  renderRegionChart(data.charts.breakdown);
}

document.addEventListener("DOMContentLoaded", () => {
  const dropdownButton = document.getElementById("industryDropdownButton");
  const industrySelectMenu = document.getElementById("industrySelectMenu");

  if (dropdownButton && industrySelectMenu) {
    dropdownButton.addEventListener("click", () => {
      industrySelectMenu.classList.toggle("show");
    });

    document.addEventListener("click", (event) => {
      if (!dropdownButton.contains(event.target) && !industrySelectMenu.contains(event.target)) {
        industrySelectMenu.classList.remove("show");
      }
    });
  }

  loadIndustryData();
});

window.loadIndustryData = loadIndustryData;
