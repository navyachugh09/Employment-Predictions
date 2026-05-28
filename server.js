const express = require("express");
const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx");

const app = express();
const PORT = 3000;

const PROJECTIONS_FILE = path.join(__dirname, "data", "employment_projections_cleaned.xlsx");
const PROJECTION_METRICS = {
  total_new_workers: "Total New Workers",
  employment_2025: "Employment in 2025",
  employment_growth: "Employment Growth",
  retirements: "Retirement Projection"
};

let cachedProjectionRows = null;

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function buildGeographicLegend(metric) {
  const legends = {
    total_new_workers: {
      type: "sequential",
      lowLabel: "Lower projected demand",
      highLabel: "Higher projected demand",
      colors: ["#d1fae5", "#86efac", "#22c55e", "#15803d"]
    },
    employment_growth: {
      type: "diverging",
      lowLabel: "Lower growth",
      highLabel: "Higher growth",
      colors: ["#dc2626", "#f59e0b", "#22c55e"]
    },
    retirements: {
      type: "sequential",
      lowLabel: "Lower retirement projection",
      highLabel: "Higher retirement projection",
      colors: ["#fed7aa", "#fb923c", "#ef4444", "#991b1b"]
    },
    sentiment_risk: {
      type: "diverging",
      lowLabel: "Lower risk",
      highLabel: "Higher risk",
      colors: ["#22c55e", "#f59e0b", "#dc2626"]
    }
  };

  return legends[metric] || legends.total_new_workers;
}

function buildRegionDetails(rows, regionName) {
  const filtered = rows.filter((row) => safeLower(row.region) === safeLower(regionName));

  if (!filtered.length) {
    return null;
  }

  const totals = filtered.reduce(
    (acc, row) => {
      acc.total_new_workers += row.total_new_workers || 0;
      acc.employment_growth += row.employment_growth || 0;
      acc.retirements += row.retirements || 0;
      return acc;
    },
    {
      total_new_workers: 0,
      employment_growth: 0,
      retirements: 0
    }
  );

  const occupationMap = {};
  const industryMap = {};

  filtered.forEach((row) => {
    if (row.occupation) {
      occupationMap[row.occupation] = (occupationMap[row.occupation] || 0) + (row.total_new_workers || 0);
    }

    if (row.industry) {
      industryMap[row.industry] = (industryMap[row.industry] || 0) + (row.total_new_workers || 0);
    }
  });

  const occupations = Object.entries(occupationMap)
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const industries = Object.entries(industryMap)
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    region: filtered[0].region,
    kpis: {
      total_new_workers: Number(totals.total_new_workers.toFixed(2)),
      employment_growth: Number(totals.employment_growth.toFixed(2)),
      retirement_projection: Number(totals.retirements.toFixed(2)),
      top_occupation: occupations[0]?.name || "N/A"
    },
    occupations,
    industries,
    insight: `Projected demand in ${filtered[0].region} is strongest in ${industries[0]?.name || "key industries"} and ${occupations[0]?.name || "priority occupations"}.`
  };
}

function loadProjectionRows() {
  if (cachedProjectionRows) {
    return cachedProjectionRows;
  }

  const workbook = xlsx.readFile(PROJECTIONS_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

  cachedProjectionRows = rows.map((row) => ({
    region: row.region || "Unknown",
    industry: row.industry || "Unknown",
    anzsco4_code: row.anzsco4_code?.toString() || "",
    occupation: row.occupation || "",
    employment_2025: Number(row.employment_2025) || 0,
    annual_growth_rate_pct: Number(row.annual_growth_rate_pct) || 0,
    employment_growth: Number(row.employment_growth) || 0,
    retirements: Number(row.retirements) || 0,
    total_new_workers: Number(row.total_new_workers) || 0,
    is_negligible: Number(row.is_negligible || 0)
  }));

  return cachedProjectionRows;
}

function aggregateByRegion(rows, metric, industryFilter) {
  const groups = {};

  rows.forEach((row) => {
    if (industryFilter && industryFilter !== "all" && row.industry !== industryFilter) {
      return;
    }

    const region = row.region;
    groups[region] = (groups[region] || 0) + Number(row[metric] || 0);
  });

  return Object.entries(groups)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/overview", (req, res) => {
  const filePath = path.join(__dirname, "data", "processed", "overview.json");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading overview.json:", err);
      return res.status(500).json({ error: "Could not load overview data" });
    }

    try {
      const overviewData = JSON.parse(data);
      res.json(overviewData);
    } catch (parseError) {
      console.error("Error parsing overview.json:", parseError);
      res.status(500).json({ error: "Invalid JSON format in overview data" });
    }
  });
});

app.get("/api/projections", (req, res) => {
  try {
    const rows = loadProjectionRows();
    const metric = req.query.metric || "total_new_workers";
    const industryFilter = req.query.industry || "all";
    const selectedMetric = Object.keys(PROJECTION_METRICS).includes(metric)
      ? metric
      : "total_new_workers";

    const chartRows = aggregateByRegion(rows, selectedMetric, industryFilter);
    const regions = Array.from(new Set(rows.map((row) => row.region))).sort();
    const industries = Array.from(new Set(rows.map((row) => row.industry))).sort();
    const totalValue = chartRows.reduce((sum, row) => sum + row.value, 0);
    const topRegion = chartRows[0] || { label: "None", value: 0 };

    res.json({
      filters: {
        metrics: Object.entries(PROJECTION_METRICS).map(([key, label]) => ({ key, label })),
        regions,
        industries,
        selectedMetric,
        selectedIndustry: industryFilter
      },
      summary: {
        totalRegions: chartRows.length,
        totalValue,
        topRegion: topRegion.label,
        topRegionValue: topRegion.value
      },
      chart: {
        title: `${PROJECTION_METRICS[selectedMetric]} by Region${industryFilter && industryFilter !== "all" ? ` — ${industryFilter}` : ""}`,
        labels: chartRows.map((row) => row.label),
        values: chartRows.map((row) => row.value)
      }
    });
  } catch (error) {
    console.error("Error loading projections:", error);
    res.status(500).json({ error: "Could not load projections data" });
  }
});

app.get("/api/geographic", (req, res) => {
  try {
    const rows = loadProjectionRows();
    const metric = req.query.metric || "total_new_workers";
    const selectedMetric = ["total_new_workers", "employment_growth", "retirements", "sentiment_risk"].includes(metric)
      ? metric
      : "total_new_workers";

    const regionSummary = {};

    rows.forEach((row) => {
      if (!regionSummary[row.region]) {
        regionSummary[row.region] = {
          region: row.region,
          total_new_workers: 0,
          employment_growth: 0,
          retirements: 0
        };
      }

      regionSummary[row.region].total_new_workers += row.total_new_workers || 0;
      regionSummary[row.region].employment_growth += row.employment_growth || 0;
      regionSummary[row.region].retirements += row.retirements || 0;
    });

    const regions = Object.values(regionSummary).map((region) => ({
      region: region.region,
      value: Number((region[selectedMetric] || 0).toFixed(2)),
      summary: {
        total_new_workers: Number(region.total_new_workers.toFixed(2)),
        employment_growth: Number(region.employment_growth.toFixed(2)),
        retirement_projection: Number(region.retirements.toFixed(2))
      }
    }));

    res.json({
      metric: selectedMetric,
      metricLabel:
        selectedMetric === "retirements"
          ? "Retirement Projection"
          : selectedMetric.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      legend: buildGeographicLegend(selectedMetric),
      regions
    });
  } catch (error) {
    console.error("Error loading geographic data:", error);
    res.status(500).json({ error: "Could not load geographic data" });
  }
});

app.get("/api/geographic/region/:region", (req, res) => {
  try {
    const rows = loadProjectionRows();
    const regionDetails = buildRegionDetails(rows, req.params.region);

    if (!regionDetails) {
      return res.status(404).json({ error: "Region not found" });
    }

    res.json(regionDetails);
  } catch (error) {
    console.error("Error loading region details:", error);
    res.status(500).json({ error: "Could not load selected region data" });
  }
});


app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

