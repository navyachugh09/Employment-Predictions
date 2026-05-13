let currentChart = null;
let filtersInitialized = false;

const metricLabels = {
  total_new_workers: "Total New Workers",
  employment_2025: "Employment in 2025",
  employment_growth: "Employment Growth",
  retirements: "Retirements"
};

function formatNumber(value) {
  return Number(value).toLocaleString();
}

function renderFilters(filters) {
  const metricSelect = document.getElementById("metricSelect");
  const industrySelect = document.getElementById("industrySelect");

  if (!filtersInitialized) {
    metricSelect.innerHTML = filters.metrics
      .map((metric) => `<option value="${metric.key}">${metric.label}</option>`)
      .join("");

    industrySelect.innerHTML = [
      `<option value="all">All industries</option>`,
      ...filters.industries.map((industry) => `<option value="${industry}">${industry}</option>`)
    ].join("");

    metricSelect.addEventListener("change", () => {
      loadOverviewChart(metricSelect.value, industrySelect.value);
    });

    industrySelect.addEventListener("change", () => {
      loadOverviewChart(metricSelect.value, industrySelect.value);
    });

    filtersInitialized = true;
  }

  metricSelect.value = filters.selectedMetric;
  industrySelect.value = filters.selectedIndustry || "all";
}

function renderSummary(summary, metricLabel, chartTitle) {
  document.getElementById("totalRegions").textContent =
    formatNumber(summary.totalRegions);
  document.getElementById("totalMetric").textContent =
    formatNumber(summary.totalValue);
  document.getElementById("topRegion").textContent =
    `${summary.topRegion} (${formatNumber(summary.topRegionValue)})`;
  document.getElementById("metricTitle").textContent = metricLabel;
}

function renderChart(chartData) {
  const ctx = document.getElementById("employmentChart").getContext("2d");

  if (currentChart) {
    currentChart.destroy();
  }

  currentChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: chartData.title,
          data: chartData.values,
          backgroundColor: "rgba(37, 99, 235, 0.7)",
          borderColor: "rgba(37, 99, 235, 1)",
          borderWidth: 1
        }
      ]
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
          display: false
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return value.toLocaleString();
            }
          }
        }
      }
    }
  });
}

async function loadOverviewChart(metric = "total_new_workers", industry = "all") {
  const params = new URLSearchParams();
  params.set("metric", metric);
  if (industry && industry !== "all") {
    params.set("industry", industry);
  }

  const response = await fetch(`/api/projections?${params.toString()}`);
  const data = await response.json();

  renderFilters(data.filters);
  const metricLabel = metricLabels[data.filters.selectedMetric] || "Total";
  renderSummary(data.summary, metricLabel, data.chart.title);
  renderChart(data.chart);
}

loadOverviewChart();