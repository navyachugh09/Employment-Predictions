let currentChart = null;
let currentPieChart = null;
let filtersInitialized = false;

if (window.Chart) {
  if (Chart.defaults.global) {
    Chart.defaults.global.defaultFontColor = "#ffffff";
    Chart.defaults.global.defaultFontStyle = "bold";
  }

  if (Chart.defaults) {
    Chart.defaults.color = "#ffffff";
    Chart.defaults.font = {
      ...Chart.defaults.font,
      weight: "bold"
    };
  }
}

const metricLabels = {
  total_new_workers: "Total New Workers",
  employment_2025: "Employment in 2025",
  employment_growth: "Employment Growth",
  retirements: "Retirements"
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function styleFilters() {
  const metricSelect = document.getElementById("metricSelect");
  const industrySelect = document.getElementById("industrySelect");

  [metricSelect, industrySelect].forEach((select) => {
    if (!select) return;

    select.style.color = "#ffffff";
    select.style.backgroundColor = "#374151";
    select.style.borderColor = "#4b5563";

    Array.from(select.options).forEach((option) => {
      option.style.color = "#ffffff";
      option.style.backgroundColor = "#1f2937";
    });
  });
}

function getSelectedIndustriesFromSelect() {
  const industrySelect = document.getElementById("industrySelect");

  if (!industrySelect) return ["all"];

  if (industrySelect.multiple) {
    const selected = Array.from(industrySelect.selectedOptions).map(
      (option) => option.value
    );

    return selected.length > 0 ? selected : ["all"];
  }

  return [industrySelect.value || "all"];
}

function renderFilters(filters) {
  const metricSelect = document.getElementById("metricSelect");
  const industrySelect = document.getElementById("industrySelect");

  if (!metricSelect || !industrySelect) return;

  if (!filtersInitialized) {
    metricSelect.innerHTML = filters.metrics
      .map((metric) => `<option value="${metric.key}">${metric.label}</option>`)
      .join("");

    industrySelect.innerHTML = [
      `<option value="all">All industries</option>`,
      ...filters.industries.map(
        (industry) => `<option value="${industry}">${industry}</option>`
      )
    ].join("");

    metricSelect.addEventListener("change", () => {
      styleFilters();
      loadOverviewChart(metricSelect.value, getSelectedIndustriesFromSelect());
    });

    industrySelect.addEventListener("change", () => {
      const selected = getSelectedIndustriesFromSelect();

      if (selected.includes("all")) {
        Array.from(industrySelect.options).forEach((option) => {
          option.selected = option.value === "all";
        });
      }

      styleFilters();
      loadOverviewChart(metricSelect.value, getSelectedIndustriesFromSelect());
    });

    filtersInitialized = true;
  }

  metricSelect.value = filters.selectedMetric;

  const selectedIndustries = Array.isArray(filters.selectedIndustry)
    ? filters.selectedIndustry
    : [filters.selectedIndustry || "all"];

  Array.from(industrySelect.options).forEach((option) => {
    option.selected = selectedIndustries.includes(option.value);
  });

  styleFilters();
}

function renderSummary(summary, metricLabel) {
  document.getElementById("totalRegions").textContent = formatNumber(
    summary.totalRegions
  );

  document.getElementById("totalMetric").textContent = formatNumber(
    Math.round(summary.totalValue)
  );

  document.getElementById("topRegion").textContent = `${summary.topRegion} (${formatNumber(
    Math.round(summary.topRegionValue)
  )})`;

  document.getElementById("metricTitle").textContent = metricLabel;
}

function getWhiteBarDatasets(chartData) {
  const sourceDatasets = chartData.datasets || [
    {
      label: chartData.title,
      data: chartData.values
    }
  ];

  return sourceDatasets.map((dataset) => ({
    ...dataset,
    backgroundColor: dataset.data.map
      ? dataset.data.map(() => "rgba(255,255,255,0.8)")
      : "rgba(255,255,255,0.8)",
    borderColor: dataset.data.map
      ? dataset.data.map(() => "rgba(255,255,255,0.95)")
      : "rgba(255,255,255,0.95)",
    hoverBackgroundColor: dataset.data.map
      ? dataset.data.map(() => "rgba(255,255,255,1)")
      : "rgba(255,255,255,1)",
    hoverBorderColor: dataset.data.map
      ? dataset.data.map(() => "rgba(255,255,255,1)")
      : "rgba(255,255,255,1)",
    borderWidth: 2
  }));
}

function renderBarChart(chartData) {
  const ctx = document.getElementById("employmentChart").getContext("2d");

  if (currentChart) {
    currentChart.destroy();
  }

  const datasets = getWhiteBarDatasets(chartData);

  const isChartV2 = Chart.defaults.global !== undefined;

  const chartOptionsV2 = {
    responsive: true,
    maintainAspectRatio: false,
    title: {
      display: true,
      text: chartData.title,
      fontColor: "#ffffff",
      fontSize: 16,
      fontStyle: "bold"
    },
    legend: {
      display: datasets.length > 1,
      labels: {
        fontColor: "#ffffff",
        fontStyle: "bold"
      }
    },
    tooltips: {
      callbacks: {
        label: function (tooltipItem, data) {
          const dataset = data.datasets[tooltipItem.datasetIndex];
          return `${dataset.label}: ${formatNumber(tooltipItem.yLabel)}`;
        }
      }
    },
    scales: {
      xAxes: [
        {
          gridLines: {
            color: "rgba(255,255,255,0.08)"
          },
          ticks: {
            fontColor: "#ffffff",
            fontStyle: "bold",
            fontSize: 13,
            maxRotation: 45,
            minRotation: 45,
            autoSkip: false
          }
        }
      ],
      yAxes: [
        {
          gridLines: {
            color: "rgba(255,255,255,0.08)"
          },
          ticks: {
            beginAtZero: true,
            min: 0,
            fontColor: "#ffffff",
            fontStyle: "bold",
            fontSize: 13,
            callback: function (value) {
              return Number(value).toLocaleString();
            }
          }
        }
      ]
    }
  };

  const chartOptionsV3 = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: chartData.title,
        color: "#ffffff",
        font: {
          size: 16,
          weight: "bold"
        }
      },
      legend: {
        display: datasets.length > 1,
        labels: {
          color: "#ffffff",
          font: {
            weight: "bold"
          }
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `${context.dataset.label}: ${formatNumber(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: "rgba(255,255,255,0.08)"
        },
        ticks: {
          color: "#ffffff",
          font: {
            weight: "bold",
            size: 13
          },
          maxRotation: 45,
          minRotation: 45,
          autoSkip: false
        }
      },
      y: {
        beginAtZero: true,
        min: 0,
        grid: {
          color: "rgba(255,255,255,0.08)"
        },
        ticks: {
          color: "#ffffff",
          font: {
            weight: "bold",
            size: 13
          },
          callback: function (value) {
            return Number(value).toLocaleString();
          }
        }
      }
    }
  };

  currentChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chartData.labels,
      datasets
    },
    options: isChartV2 ? chartOptionsV2 : chartOptionsV3
  });
}

function renderPieChart(breakdownData) {
  const pieCanvas = document.getElementById("breakdownChart");

  if (!pieCanvas || !breakdownData) return;

  const ctx = pieCanvas.getContext("2d");

  if (currentPieChart) {
    currentPieChart.destroy();
  }

  const isChartV2 = Chart.defaults.global !== undefined;

  const chartOptionsV2 = {
    responsive: true,
    maintainAspectRatio: false,
    title: {
      display: true,
      text: breakdownData.title,
      fontColor: "#ffffff",
      fontSize: 16,
      fontStyle: "bold"
    },
    legend: {
      display: true,
      labels: {
        fontColor: "#ffffff",
        fontStyle: "bold"
      }
    },
    tooltips: {
      callbacks: {
        label: function (tooltipItem, data) {
          const dataset = data.datasets[0];
          const value = Number(dataset.data[tooltipItem.index]);
          const total = dataset.data.reduce((sum, v) => sum + Number(v), 0);
          const percent = total ? ((value / total) * 100).toFixed(1) : 0;

          return `${data.labels[tooltipItem.index]}: ${formatNumber(value)} (${percent}%)`;
        }
      }
    }
  };

  const chartOptionsV3 = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: breakdownData.title,
        color: "#ffffff",
        font: {
          size: 16,
          weight: "bold"
        }
      },
      legend: {
        display: true,
        labels: {
          color: "#ffffff",
          font: {
            weight: "bold"
          }
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const total = context.chart.data.datasets[0].data.reduce(
              (sum, value) => sum + Number(value),
              0
            );

            const value = Number(context.parsed);
            const percent = total ? ((value / total) * 100).toFixed(1) : 0;

            return `${context.label}: ${formatNumber(value)} (${percent}%)`;
          }
        }
      }
    }
  };

  currentPieChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: breakdownData.labels,
      datasets: [
        {
          label: breakdownData.title,
          data: breakdownData.values,
          backgroundColor: breakdownData.backgroundColor,
          borderColor: "#ffffff",
          hoverBorderColor: "#ffffff",
          borderWidth: 2
        }
      ]
    },
    options: isChartV2 ? chartOptionsV2 : chartOptionsV3
  });
}

async function loadOverviewChart(metric = "total_new_workers", industries = ["all"]) {
  if (!Array.isArray(industries)) {
    industries = String(industries)
      .split(",")
      .map((industry) => industry.trim())
      .filter(Boolean);
  }

  if (industries.length === 0) {
    industries = ["all"];
  }

  const params = new URLSearchParams();
  params.set("metric", metric);
  params.set("industry", industries.join(","));

  const response = await fetch(`/api/projections?${params.toString()}`);
  const data = await response.json();

  renderFilters(data.filters);

  const metricLabel = metricLabels[data.filters.selectedMetric] || "Total";

  renderSummary(data.summary, metricLabel);
  renderBarChart(data.chart);
  renderPieChart(data.breakdown);

  styleFilters();
}

loadOverviewChart();