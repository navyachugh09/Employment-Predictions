let occChart1 = null;
let occChart2 = null;

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

  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

function fmt(n) {
  return Math.ceil(Number(n || 0)).toLocaleString();
}

function fmtPercent(n) {
  let value = Number(n || 0);

  // If backend sends decimal format, e.g. 0.023 = 2.3%
  if (Math.abs(value) > 0 && Math.abs(value) < 1) {
    value = value * 100;
  }

  if (Math.abs(value) > 0 && Math.abs(value) < 1) {
    return `${value.toFixed(2)}%`;
  }

  return `${value.toFixed(1)}%`;
}

async function fetchOccupations() {
  const res = await fetch("/api/occupations");
  return res.json();
}

async function loadOccupationData(occupation, metric) {
  const params = new URLSearchParams();
  params.set("occupation", occupation);
  params.set("metric", metric || "total_new_workers");

  const res = await fetch(`/api/occupations?${params.toString()}`);
  const data = await res.json();

  return data.occupationDetails[occupation];
}

function destroyIfExists(canvasId) {
  if (canvasId === "occ1_chart" && occChart1) {
    occChart1.destroy();
    occChart1 = null;
  }

  if (canvasId === "occ2_chart" && occChart2) {
    occChart2.destroy();
    occChart2 = null;
  }
}

function renderBarChart(canvasId, labels, values, labelText) {
  destroyIfExists(canvasId);

  const ctx = document.getElementById(canvasId).getContext("2d");

  const cleanRows = labels
    .map((label, i) => ({
      label,
      value: Math.max(0, Math.ceil(Number(values[i] || 0)))
    }))
    .filter((row) => row.value > 0)
    .slice(0, 8);

  const palette = createColorPalette(cleanRows.length);

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: cleanRows.map((row) => row.label),
      datasets: [
        {
          label: labelText || "New workers",
          data: cleanRows.map((row) => row.value),
          backgroundColor: palette.map((c) => c + "CC"),
          borderColor: palette,
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      legend: {
        display: false
      },
      tooltips: {
        callbacks: {
          label: function (tooltipItem) {
            return `${labelText || "New workers"}: ${fmt(tooltipItem.yLabel)}`;
          }
        }
      },
      scales: {
        xAxes: [
          {
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              autoSkip: false
            }
          }
        ],
        yAxes: [
          {
            ticks: {
              beginAtZero: true,
              min: 0,
              callback: function (value) {
                return Number(value).toLocaleString();
              }
            }
          }
        ]
      }
    }
  });

  if (canvasId === "occ1_chart") {
    occChart1 = chart;
  } else {
    occChart2 = chart;
  }
}

async function init() {
  const root = await fetchOccupations();
  const occs = root.occupations || [];

  const sel1 = document.getElementById("occupationSelect1");
  const sel2 = document.getElementById("occupationSelect2");

  sel1.innerHTML = "";
  sel2.innerHTML = "";

  occs.forEach((occupation) => {
    const opt1 = document.createElement("option");
    opt1.value = occupation;
    opt1.textContent = occupation;
    sel1.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = occupation;
    opt2.textContent = occupation;
    sel2.appendChild(opt2);
  });

  sel1.selectedIndex = 0;
  sel2.selectedIndex = occs.length > 1 ? 1 : 0;

  async function updatePanel(sel, prefix) {
    const occ = sel.value;

    const newDetails = await loadOccupationData(occ, "total_new_workers");
    const existingDetails = await loadOccupationData(occ, "employment_2025");

    document.getElementById(prefix + "_existing").textContent = fmt(
      existingDetails.summary.existingWorkers ||
        existingDetails.summary.totalMetricValue ||
        0
    );

    document.getElementById(prefix + "_new").textContent = fmt(
      newDetails.summary.totalMetricValue || 0
    );

    const growthRate = Number(newDetails.summary.growthRate || 0);
    document.getElementById(prefix + "_growth").textContent = fmtPercent(growthRate);

    const panelCard = document.querySelector("#" + prefix + "_chart").closest(".card");
    const buttons = panelCard.querySelectorAll(".panel-tabs button");

    function showIndustry() {
      renderBarChart(
        prefix + "_chart",
        newDetails.charts.byIndustry.labels,
        newDetails.charts.byIndustry.values,
        "New workers"
      );
    }

    function showRegion() {
      renderBarChart(
        prefix + "_chart",
        newDetails.charts.byRegion.labels,
        newDetails.charts.byRegion.values,
        "New workers"
      );
    }

    buttons.forEach((btn) => {
      btn.onclick = () => {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const mode = btn.getAttribute("data-mode");

        if (mode === "industry") {
          showIndustry();
        } else {
          showRegion();
        }
      };
    });

    const activeButton = Array.from(buttons).find((btn) =>
      btn.classList.contains("active")
    );

    if (activeButton && activeButton.getAttribute("data-mode") === "region") {
      showRegion();
    } else {
      showIndustry();
    }
  }

  sel1.addEventListener("change", () => updatePanel(sel1, "occ1"));
  sel2.addEventListener("change", () => updatePanel(sel2, "occ2"));

  await updatePanel(sel1, "occ1");
  await updatePanel(sel2, "occ2");
}

document.addEventListener("DOMContentLoaded", init);