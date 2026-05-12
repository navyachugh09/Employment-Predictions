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
  retirements: "Retirements"
};

let cachedProjectionRows = null;

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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

