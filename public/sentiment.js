/* sentiment.js — powers sentiment.html */

/* 
  Occupation groups used only for display.
  These are sentiment-based groups, not official employment-demand categories.
*/
const TOP3 = ["aged_and_disabled_carers", "registered_nurses", "sales_assistants"];
const BOTTOM3 = ["commercial_cleaners", "education_aides", "motor_mechanics"];

const EVENTS = {
  registered_nurses: [
    { date: "2021-11", label: "COVID burnout and workforce shortage concerns",
      url: "https://www.anmf.org.au/media/news/australia-facing-nursing-shortage-as-more-than-two-years-of-covid-takes-its-toll/",
      source: "ANMF" },
    { date: "2022-07", label: "National nursing shortage worsens",
      url: "https://www.apna.asn.au/about/media/archive-media-releases/one-in-four-nurses-consider-leaving-primary-health-care",
      source: "APNA" },
    { date: "2024-07", label: "Victorian nurses secure 28.4% wage rise",
      url: "https://www.premier.vic.gov.au/nurses-and-midwives-receive-284-cent-pay-rise",
      source: "Victorian Premier" },
    { date: "2025-03", label: "Aged care nurse award pay increase begins",
      url: "https://www.health.gov.au/news/award-wage-increase-for-aged-care-workers-and-nurses",
      source: "Dept of Health" }
  ],
  aged_and_disabled_carers: [
    { date: "2022-10", label: "Aged care workforce shortage warning",
      url: "https://www.ceda.com.au/news-and-resources/media-releases/health-ageing/australia%E2%80%99s-dire-shortage-of-aged-care-workers-req",
      source: "CEDA" },
    { date: "2023-07", label: "Aged care reforms: 15% wage rise & 24/7 RN rule",
      url: "https://www.health.gov.au/our-work/aged-care-act",
      source: "Dept of Health" },
    { date: "2025-03", label: "Government funds aged care wage increases",
      url: "https://www.health.gov.au/news/award-wage-increase-for-aged-care-workers-and-nurses",
      source: "Dept of Health" }
  ],
  sales_assistants: [
    { date: "2022-06", label: "Inflation hits 6.1% — consumer spending squeezed",
      url: "https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/jun-2022",
      source: "ABS" },
    { date: "2023-09", label: "Retail job vacancies decline 16.5% year-on-year",
      url: "https://www.hiringlab.org/au/blog/2023/10/20/australias-retail-sector-cooling/",
      source: "Indeed Hiring Lab" },
    { date: "2025-06", label: "Retail sales surge — strongest growth since 2022",
      url: "https://www.abs.gov.au/media-centre/media-releases/retail-sales-surge-june",
      source: "ABS" }
  ],
  commercial_cleaners: [
    { date: "2021-12", label: "Post-COVID cleaning demand surges",
      url: "https://www.clean-group.com.au/commercial-cleaning-industry-trends-australia/",
      source: "Industry trends report" },
    { date: "2023-04", label: "Labour shortages persist in cleaning sector",
      url: "https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles/occupations/8112-commercial-cleaners",
      source: "Jobs and Skills Australia" },
    { date: "2025-02", label: "School cleaner workload report — 600+ daily tasks",
      url: "https://unitedworkers.org.au/wp-content/uploads/2024/02/240201_SchoolCleaningReport.pdf",
      source: "United Workers Union" }
  ],
  education_aides: [
    { date: "2022-02", label: "Schools reopen amid COVID staffing crisis",
      url: "https://www.aeuvic.asn.au/public-school-teachers-principals-and-education-support-staff-stop-work",
      source: "AEU Victoria" },
    { date: "2023-08", label: "AEU campaigns to fix workload & salaries",
      url: "https://www.aeufederal.org.au/news-media/news/2023/fix-workload-and-salaries-keep-teachers-teaching",
      source: "AEU Federal" },
    { date: "2025-03", label: "Australia ranks worst in OECD for teacher shortages",
      url: "https://www.aeufederal.org.au/news-media/media-releases/2025/teacher-shortages-australian-schools-among-worst-oecd",
      source: "AEU Federal" }
  ],
  motor_mechanics: [
    { date: "2021-10", label: "Skilled trades on Jobs and Skills Priority List",
      url: "https://www.jobsandskills.gov.au/data/skills-shortages-analysis/skills-priority-list",
      source: "Jobs and Skills Australia" },
    { date: "2023-03", label: "Mechanic shortage drives up service costs",
      url: "https://www.autoguru.com.au/car-advice/articles/mechanic-shortage-in-australia-what-it-means-for-your-wallet-and-your-car",
      source: "AutoGuru" },
    { date: "2024-07", label: "EV transition drives skills training discussion",
      url: "https://www.dcceew.gov.au/sites/default/files/documents/national-electric-vehicle-strategy-annual-update-2024-25.pdf",
      source: "DCCEEW (Federal)" }
  ]
};

let DATA = null;
let trendChart = null;
let forecastChart = null;
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
  groupPositive.label = "High-demand occupations";

  TOP3.forEach(occ => {
    const s = DATA.occupation_summary.find(x => x.occupation === occ);
    if (!s) return;

    const option = document.createElement("option");
    option.value = occ;
    option.textContent = s.label;
    groupPositive.appendChild(option);
  });

  const groupNegative = document.createElement("optgroup");
  groupNegative.label = "Declining occupations";

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
      ${isPositiveGroup ? "↑ High-demand occupation" : "↓ Declining occupation"}
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
  renderForecast(occ);
  renderEvents(occ);

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
          borderColor: "#ffffff",
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
// ── ARIMA Forecast chart ────────────────────────────────────────────────────
function renderForecast(occ) {
  const ctx = document.getElementById("forecastChart").getContext("2d");
  if (forecastChart) forecastChart.destroy();

  const fc = DATA.forecasts && DATA.forecasts[occ];
  const hist = DATA.monthly_trend[occ];
  const titleEl = document.getElementById("forecastTitle");
  const modelEl = document.getElementById("modelInfo");
  const pillEl  = document.getElementById("forecastPill");

  if (!fc || !hist || hist.months.length === 0) {
    if (titleEl) titleEl.textContent = "12-Month Sentiment Forecast";
    if (modelEl) modelEl.textContent = "";
    if (pillEl)  pillEl.innerHTML = "";
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  const s = DATA.occupation_summary.find(x => x.occupation === occ);
  if (titleEl) titleEl.textContent = "12-Month Sentiment Forecast — " + (s ? s.label : occ);
  if (modelEl) modelEl.textContent = "ARIMA(" + fc.order.join(",") + ")  ·  AIC " + fc.aic;

  if (pillEl) {
    if (fc.direction === "improving") {
      pillEl.innerHTML = '<span class="direction-pill dir-improving"><i class="mdi mdi-arrow-up-bold"></i> Projected to improve</span>';
    } else if (fc.direction === "worsening") {
      pillEl.innerHTML = '<span class="direction-pill dir-worsening"><i class="mdi mdi-arrow-down-bold"></i> Projected to worsen</span>';
    } else {
      pillEl.innerHTML = '<span class="direction-pill dir-flat"><i class="mdi mdi-minus"></i> Projected to stay stable</span>';
    }
  }

  const histTail = Math.min(12, hist.months.length);
  const histMonths   = hist.months.slice(-histTail);
  const histSmoothed = hist.smoothed.slice(-histTail);

  const allLabels = [...histMonths, ...fc.forecast.months];
  const histLine  = [...histSmoothed, ...new Array(fc.forecast.months.length).fill(null)];

  const lastHistVal  = histSmoothed[histSmoothed.length - 1];
  const forecastLine = [...new Array(histMonths.length - 1).fill(null), lastHistVal, ...fc.forecast.mean];
  const lowerLine    = [...new Array(histMonths.length - 1).fill(null), lastHistVal, ...fc.forecast.lower];
  const upperLine    = [...new Array(histMonths.length - 1).fill(null), lastHistVal, ...fc.forecast.upper];

  const isHigh = TOP3.includes(occ);
  const fcColour = isHigh ? "#16a34a" : "#dc2626";

  forecastChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: allLabels,
      datasets: [
        { label: "95% CI upper", data: upperLine,
          borderColor: "transparent", backgroundColor: fcColour + "1a",
          borderWidth: 0, pointRadius: 0, fill: "+1", lineTension: 0.3 },
        { label: "95% CI lower", data: lowerLine,
          borderColor: "transparent", backgroundColor: "transparent",
          borderWidth: 0, pointRadius: 0, fill: false, lineTension: 0.3 },
        { label: "Historical sentiment", data: histLine,
          borderColor: "#475569", backgroundColor: "transparent",
          borderWidth: 2, pointRadius: 0, fill: false, lineTension: 0.3 },
        { label: "ARIMA forecast", data: forecastLine,
          borderColor: fcColour, backgroundColor: "transparent",
          borderWidth: 2.5, borderDash: [6, 4], pointRadius: 0,
          fill: false, lineTension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      legend: {
        display: true, position: "bottom",
        labels: { fontSize: 11, boxWidth: 12,
          filter: (item) => !item.text.startsWith("95% CI") }
      },
      scales: {
        xAxes: [{
          ticks: { maxTicksLimit: 10, maxRotation: 45, fontSize: 10 },
          gridLines: { color: "rgba(148, 163, 184, 0.18)", drawBorder: true }
        }],
        yAxes: [{
          ticks: {
            fontSize: 10, min: -1, max: 1, stepSize: 0.5,
            callback: (v) => {
              if (Math.abs(v - 1)   < 0.01) return "Very Positive";
              if (Math.abs(v - 0.5) < 0.01) return "Positive";
              if (Math.abs(v)       < 0.01) return "Neutral";
              if (Math.abs(v + 0.5) < 0.01) return "Negative";
              if (Math.abs(v + 1)   < 0.01) return "Very Negative";
              return "";
            }
          },
          gridLines: { color: "rgba(148, 163, 184, 0.18)", zeroLineColor: "rgba(148, 163, 184, 0.45)", drawBorder: true }
        }]
      },
      tooltips: {
        callbacks: {
          label: (item) => {
            const v = parseFloat(item.value);
            const lbl = (typeof sentimentLabel === "function") ? sentimentLabel(v).text : "";
            return " " + item.dataset.label + ": " + lbl + " (" + v.toFixed(2) + ")";
          }
        }
      }
    }
  });
}

// ── Key Industry Events with article links ──────────────────────────────────
function renderEvents(occ) {
  const container = document.getElementById("timelineEvents");
  if (!container) return;

  const events = EVENTS[occ] || [];
  if (events.length === 0) { container.innerHTML = ""; return; }

  container.innerHTML =
    `<h5 class="mb-3">Key Industry Events</h5>
     <p class="text-muted mb-3" style="font-size:12.5px;">
       These events provide context for possible changes in public sentiment over time.
     </p>
     <div class="row">
       ${events.map(e => `
        <div class="col-md-6 mb-2">
          <div class="card" style="border-left:4px solid #3b82f6;">
            <div class="card-body py-2 px-3">
              <div style="font-size:12px; color:#64748b; font-weight:600;">${e.date}</div>
              <div style="font-size:13px;">${e.label}</div>
              ${e.url ? `
                <a href="${e.url}" target="_blank" rel="noopener noreferrer"
                   style="font-size:11.5px; color:#3b82f6; text-decoration:none; display:inline-flex; align-items:center; margin-top:4px;">
                  <i class="mdi mdi-open-in-new me-1" style="font-size:13px;"></i>${e.source || "Read article"}
                </a>` : ""}
            </div>
          </div>
        </div>
       `).join("")}
     </div>`;
}
