/* sentiment.js — powers sentiment.html */

/* 
  Occupation groups used only for display.
  These are sentiment-based groups, not official employment-demand categories.
*/
const TOP3 = ["aged_and_disabled_carers", "registered_nurses", "sales_assistants"];
const BOTTOM3 = ["commercial_cleaners", "education_aides", "motor_mechanics"];

let DATA = null;
let trendChart = null;
let activeOcc = "registered_nurses";

// ── Fetch data ───────────────────────────────────────────────────────────────
fetch("data/sentiment.json")
  .then(r => r.json())
  .then(data => {
    DATA = data;
    populateDropdown();
    renderComparisonCards();
    selectOccupation(activeOcc);
  })
  .catch(err => console.error("Failed to load sentiment.json", err));

// ── Dropdown ────────────────────────────────────────────────────────────────
function populateDropdown() {
  const sel = document.getElementById("occupationSelect");

  const groupPositive = document.createElement("optgroup");
  groupPositive.label = "More positive discussion";

  TOP3.forEach(occ => {
    const s = DATA.occupation_summary.find(x => x.occupation === occ);
    if (!s) return;

    const option = document.createElement("option");
    option.value = occ;
    option.textContent = s.label;
    groupPositive.appendChild(option);
  });

  const groupNegative = document.createElement("optgroup");
  groupNegative.label = "More negative discussion";

  BOTTOM3.forEach(occ => {
    const s = DATA.occupation_summary.find(x => x.occupation === occ);
    if (!s) return;

    const option = document.createElement("option");
    option.value = occ;
    option.textContent = s.label;
    groupNegative.appendChild(option);
  });

  sel.innerHTML = "";
  sel.appendChild(groupPositive);
  sel.appendChild(groupNegative);

  sel.value = activeOcc;
  sel.addEventListener("change", e => selectOccupation(e.target.value));
}

// ── Plain-language sentiment label ──────────────────────────────────────────
function sentimentLabel(score) {
  if (score >= 0.05) return { text: "Positive", cls: "label-positive" };
  if (score <= -0.05) return { text: "Negative", cls: "label-negative" };
  return { text: "Mixed", cls: "label-mixed" };
}

// ── Insight text ────────────────────────────────────────────────────────────
function generateInsight(summary, trend) {
  if (!summary || !trend) return "";

  if (trend.direction === "worsening") {
    return `${summary.label} discussion is trending more negatively over time. This may reflect rising concerns around workload, job conditions, pay, burnout, or public dissatisfaction.`;
  }

  if (trend.direction === "improving") {
    return `${summary.label} discussion is becoming more positive over time. This may suggest improving public perception, stronger job interest, or more favourable discussion around this occupation.`;
  }

  return `${summary.label} sentiment appears relatively stable over time, with no major upward or downward shift in public discussion.`;
}

// ── Main update for selected occupation ─────────────────────────────────────
function selectOccupation(occ) {
  activeOcc = occ;

  const sel = document.getElementById("occupationSelect");
  if (sel && sel.value !== occ) sel.value = occ;

  const summary = DATA.occupation_summary.find(x => x.occupation === occ);
  const trend = DATA.monthly_trend[occ];

  if (!summary) return;

  document.getElementById("trendTitle").textContent =
    "Sentiment Over Time — " + summary.label;

  const lbl = sentimentLabel(summary.compound_mean);
  const lblEl = document.getElementById("overallLabel");
  lblEl.textContent = lbl.text;
  lblEl.className = "sentiment-label " + lbl.cls;

  const isPositiveGroup = TOP3.includes(occ);
  document.getElementById("tierBadgeWrap").innerHTML =
    `<span class="tier-badge ${isPositiveGroup ? "tier-high" : "tier-low"}">
      ${isPositiveGroup ? "↑ More positive discussion" : "↓ More negative discussion"}
    </span>`;

  document.getElementById("kpiPos").textContent = summary.pct_positive + "%";
  document.getElementById("kpiNeg").textContent = summary.pct_negative + "%";
  document.getElementById("kpiPosBar").style.width = summary.pct_positive + "%";
  document.getElementById("kpiNegBar").style.width = summary.pct_negative + "%";

  const bar = document.getElementById("breakdownBar");
  bar.innerHTML =
    `<div class="stacked-pos" style="width:${summary.pct_positive}%" title="Positive ${summary.pct_positive}%"></div>
     <div class="stacked-neu" style="width:${summary.pct_neutral}%" title="Mixed ${summary.pct_neutral}%"></div>
     <div class="stacked-neg" style="width:${summary.pct_negative}%" title="Negative ${summary.pct_negative}%"></div>`;

  document.getElementById("legendPos").textContent =
    "Positive " + summary.pct_positive + "%";
  document.getElementById("legendNeu").textContent =
    "Mixed " + summary.pct_neutral + "%";
  document.getElementById("legendNeg").textContent =
    "Negative " + summary.pct_negative + "%";

  const insightBox = document.getElementById("insightText");
  if (insightBox) {
    insightBox.textContent = generateInsight(summary, trend);
  }

  renderTrend(occ);

  document.querySelectorAll(".comparison-card").forEach(card => {
    card.classList.remove("border-primary");
  });

  const activeCard = document.getElementById("compcard-" + occ);
  if (activeCard) activeCard.classList.add("border-primary");
}

// ── Direction pill ──────────────────────────────────────────────────────────
function renderDirectionPill(direction) {
  const wrap = document.getElementById("directionPill");

  if (direction === "improving") {
    wrap.innerHTML =
      '<span class="direction-pill dir-improving"><i class="mdi mdi-arrow-up-bold"></i> Improving</span>';
  } else if (direction === "worsening") {
    wrap.innerHTML =
      '<span class="direction-pill dir-worsening"><i class="mdi mdi-arrow-down-bold"></i> Worsening</span>';
  } else {
    wrap.innerHTML =
      '<span class="direction-pill dir-flat"><i class="mdi mdi-minus"></i> Stable</span>';
  }
}

// ── Trend chart ─────────────────────────────────────────────────────────────
function renderTrend(occ) {
  const trend = DATA.monthly_trend[occ];
  const ctx = document.getElementById("trendChart").getContext("2d");

  if (trendChart) trendChart.destroy();

  if (!trend || !trend.months || trend.months.length === 0) {
    renderDirectionPill("flat");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  renderDirectionPill(trend.direction);

  const useSmoothed =
    trend.smoothed && trend.smoothed.length === trend.months.length;

  const monthlyPointColours = trend.compound.map(v =>
    v < 0 ? "#dc2626" : "#16a34a"
  );

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trend.months,
      datasets: [
        {
          label: "Monthly Sentiment",
          data: trend.compound,
          borderColor: "#94a3b8",
          backgroundColor: "transparent",
          borderWidth: 1.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: monthlyPointColours,
          pointBorderColor: monthlyPointColours,
          fill: false,
          lineTension: 0.2
        },
        {
          label: "Trend (3-month rolling)",
          data: useSmoothed ? trend.smoothed : trend.compound,
          borderColor:
            trend.direction === "worsening"
              ? "#dc2626"
              : trend.direction === "improving"
              ? "#16a34a"
              : "#64748b",
          backgroundColor:
            trend.direction === "worsening"
              ? "rgba(220, 38, 38, 0.10)"
              : trend.direction === "improving"
              ? "rgba(22, 163, 74, 0.10)"
              : "rgba(100, 116, 139, 0.10)",
          borderWidth: 3,
          pointRadius: 0,
          fill: true,
          lineTension: 0.35
        },
        {
          label: "Neutral baseline",
          data: trend.months.map(() => 0),
          borderColor: "#64748b",
          backgroundColor: "transparent",
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
          lineTension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,

      legend: {
        display: true,
        position: "bottom",
        labels: {
          fontSize: 11,
          boxWidth: 12
        }
      },

      scales: {
        xAxes: [
          {
            ticks: {
              maxTicksLimit: 10,
              maxRotation: 45,
              fontSize: 10
            },
            gridLines: {
              color: "#f1f5f9"
            }
          }
        ],
        yAxes: [
          {
            ticks: {
              min: -1,
              max: 1,
              stepSize: 0.5,
              fontSize: 10,
              callback: function(value) {
                const labels = {
                  "-1": "Very Negative",
                  "-0.5": "Negative",
                  "0": "Mixed",
                  "0.5": "Positive",
                  "1": "Very Positive"
                };

                return labels[String(value)] || "";
              }
            },
            gridLines: {
              color: function(context) {
                const value = context.tick.value;

                if (value > 0) return "rgba(22, 163, 74, 0.18)";
                if (value < 0) return "rgba(220, 38, 38, 0.18)";
                return "rgba(100, 116, 139, 0.35)";
              }
            }
          }
        ]
      },

      tooltips: {
        callbacks: {
          label: function(item, data) {
            const datasetLabel =
              data.datasets[item.datasetIndex].label || "Sentiment";

            const value = parseFloat(item.value);
            const lbl = sentimentLabel(value).text;

            if (datasetLabel === "Neutral baseline") {
              return " Neutral baseline";
            }

            return ` ${datasetLabel}: ${lbl} (${value.toFixed(2)})`;
          }
        }
      }
    }
  });
}

// ── Comparison cards ────────────────────────────────────────────────────────
function renderComparisonCards() {
  renderGroupCards("top3Cards", TOP3, "#16a34a");
  renderGroupCards("bottom3Cards", BOTTOM3, "#dc2626");
}

function renderGroupCards(containerId, occs, accent) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  occs.forEach(occ => {
    const summary = DATA.occupation_summary.find(x => x.occupation === occ);
    if (!summary) return;

    const lbl = sentimentLabel(summary.compound_mean);
    const trend = DATA.monthly_trend[occ];

    const dirIcon =
      trend && trend.direction === "improving"
        ? '<i class="mdi mdi-arrow-up-bold text-success ms-1"></i>'
        : trend && trend.direction === "worsening"
        ? '<i class="mdi mdi-arrow-down-bold text-danger ms-1"></i>'
        : '<i class="mdi mdi-minus text-muted ms-1"></i>';

    const card = document.createElement("div");
    card.className = "card comparison-card mb-2";
    card.id = "compcard-" + occ;
    card.style.borderLeft = "4px solid " + accent;
    card.addEventListener("click", () => selectOccupation(occ));

    card.innerHTML =
      `<div class="card-body py-2 px-3">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <div style="font-size:13.5px; font-weight:600;">
              ${summary.label}
            </div>
            <div style="font-size:11.5px; color:#6b7280;">
              <span class="${lbl.cls}" style="font-weight:600;">${lbl.text}</span>
              ${dirIcon}
            </div>
          </div>

          <div style="text-align:right;">
            <div style="font-size:13px; color:#16a34a; font-weight:600;">
              ${summary.pct_positive}%
            </div>
            <div style="font-size:11px; color:#dc2626;">
              ${summary.pct_negative}% neg
            </div>
          </div>
        </div>

        <div class="stacked-bar-wrap mt-2" style="height:5px; border-radius:3px;">
          <div class="stacked-pos" style="width:${summary.pct_positive}%"></div>
          <div class="stacked-neu" style="width:${summary.pct_neutral}%"></div>
          <div class="stacked-neg" style="width:${summary.pct_negative}%"></div>
        </div>
      </div>`;

    container.appendChild(card);
  });
}