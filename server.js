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

app.get("/api/industry", (req, res) => {
  try {
    const rows = loadProjectionRows();
    const metric = req.query.metric || "total_new_workers";
    const industryQuery = req.query.industry || "all";
    const selectedMetric = Object.keys(PROJECTION_METRICS).includes(metric)
      ? metric
      : "total_new_workers";

    const selectedIndustries = industryQuery === "all"
      ? []
      : industryQuery
          .split(",")
          .map((industry) => industry.trim())
          .filter(Boolean);

    const filteredRows = selectedIndustries.length
      ? rows.filter((row) => selectedIndustries.includes(row.industry))
      : rows;

    const selectedIndustryLabel = selectedIndustries.length
      ? selectedIndustries.join(", ")
      : "All industries";

    const occupationMap = {};
    const regionMap = {};
    const occupationRegionMap = {};

    filteredRows.forEach((row) => {
      const occupation = row.occupation || "Unknown";
      const region = row.region || "Unknown";
      const value = Number(row[selectedMetric] || 0);

      occupationMap[occupation] = (occupationMap[occupation] || 0) + value;
      regionMap[region] = (regionMap[region] || 0) + value;
      occupationRegionMap[occupation] = occupationRegionMap[occupation] || {};
      occupationRegionMap[occupation][region] = (occupationRegionMap[occupation][region] || 0) + value;
    });

    const occupationEntries = Object.entries(occupationMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const positiveOccupations = occupationEntries.filter((item) => item.value > 0);
    const topOccupation = positiveOccupations[0] || occupationEntries[0] || { label: "N/A", value: 0 };
    const bottomOccupation = positiveOccupations.length
      ? positiveOccupations[positiveOccupations.length - 1]
      : occupationEntries[occupationEntries.length - 1] || { label: "N/A", value: 0 };

    const topOccupations = occupationEntries.slice(0, 10);

    const regionEntries = Object.entries(regionMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const displayedRegions = regionEntries.slice(0, 6);
    const otherValue = regionEntries.slice(6).reduce((sum, item) => sum + item.value, 0);
    if (otherValue > 0) {
      displayedRegions.push({ label: "Other regions", value: otherValue });
    }

    const occupationRegions = {};
    topOccupations.forEach((occupation) => {
      const regionEntriesForOccupation = Object.entries(occupationRegionMap[occupation.label] || {})
        .map(([region, value]) => ({ region, value }))
        .sort((a, b) => b.value - a.value);
      occupationRegions[occupation.label] = regionEntriesForOccupation;
    });

    const totalMetricValue = occupationEntries.reduce((sum, item) => sum + item.value, 0);

    res.json({
      filters: {
        metrics: Object.entries(PROJECTION_METRICS).map(([key, label]) => ({ key, label })),
        industries: Array.from(new Set(rows.map((row) => row.industry))).sort(),
        selectedMetric,
        selectedIndustries,
        selectedIndustryLabel
      },
      summary: {
        selectedIndustryLabel,
        selectedMetricLabel: PROJECTION_METRICS[selectedMetric],
        totalMetricValue,
        topOccupation,
        bottomOccupation
      },
      charts: {
        industry: {
          title: `Top occupations in ${selectedIndustryLabel}`,
          labels: topOccupations.map((item) => item.label),
          values: topOccupations.map((item) => item.value),
          metricLabel: PROJECTION_METRICS[selectedMetric]
        },
        breakdown: {
          title: `${PROJECTION_METRICS[selectedMetric]} by region`,
          labels: displayedRegions.map((item) => item.label),
          values: displayedRegions.map((item) => item.value)
        }
      },
      occupationRegions
    });
  } catch (error) {
    console.error("Error loading industry overview:", error);
    res.status(500).json({ error: "Could not load industry overview data" });
  }
});

// Occupations endpoint - returns list of occupations and breakdowns for selected occupations
app.get("/api/occupations", (req, res) => {
  try {
    const rows = loadProjectionRows();
    const metric = req.query.metric || "total_new_workers";
    const selectedMetric = Object.keys(PROJECTION_METRICS).includes(metric)
      ? metric
      : "total_new_workers";

    // Get all unique occupations
    const occupations = Array.from(new Set(rows.map((r) => r.occupation).filter(Boolean))).sort();

    // Parse selected occupations from query (comma-separated)
    const occQuery = req.query.occupation || "";
    const selectedOccupations = occQuery
      ? occQuery.split(",").map((s) => s.trim()).filter(Boolean)
      : occupations.slice(0, 2); // default to first two

    const occupationDetails = {};

    selectedOccupations.forEach((occ) => {
      const occRows = rows.filter((r) => r.occupation === occ);

      // Sum metric (for total_new_workers or employment_2025) when appropriate
      const totalMetric = occRows.reduce((sum, r) => sum + Number(r[selectedMetric] || 0), 0);

      // Compute existing workers (employment_2025) and weighted growth rate
      const existingTotal = occRows.reduce((sum, r) => sum + Number(r.employment_2025 || 0), 0);
      // Use annual_growth_rate_pct (percentage) for sensible growth rate numbers
      const weightedGrowthSum = occRows.reduce((sum, r) => sum + (Number(r.annual_growth_rate_pct || 0) * Number(r.employment_2025 || 0)), 0);
      const growthRate = existingTotal ? (weightedGrowthSum / existingTotal) : 0;

      // Aggregate by region and industry and also keep per-industry region breakdown
      const regionMap = {};
      const industryMap = {};
      const industryRegionMap = {};
      occRows.forEach((r) => {
        const region = r.region || "Unknown";
        const industry = r.industry || "Unknown";
        const value = Number(r.total_new_workers || 0);
        regionMap[region] = (regionMap[region] || 0) + value;
        industryMap[industry] = (industryMap[industry] || 0) + value;
        industryRegionMap[industry] = industryRegionMap[industry] || {};
        industryRegionMap[industry][region] = (industryRegionMap[industry][region] || 0) + value;
      });

      const regionEntries = Object.entries(regionMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
      const industryEntries = Object.entries(industryMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

      // Prepare valuesByRegion aligned to industryLabels so frontend can build stacked datasets
      const industryLabels = industryEntries.map((i) => i.label);
      const regionLabelsForOcc = regionEntries.map((r) => r.label);
      const valuesByRegion = {};
      regionLabelsForOcc.forEach((regionLabel) => {
        valuesByRegion[regionLabel] = industryLabels.map((ind) => {
          return Number((industryRegionMap[ind] && industryRegionMap[ind][regionLabel]) || 0);
        });
      });

      occupationDetails[occ] = {
        summary: {
          occupation: occ,
          totalMetricValue: totalMetric,
          existingWorkers: existingTotal,
          growthRate
        },
        charts: {
          byRegion: { labels: regionEntries.map((i) => i.label), values: regionEntries.map((i) => i.value) },
          byIndustry: { labels: industryEntries.map((i) => i.label), values: industryEntries.map((i) => i.value) },
          byIndustryBreakdown: {
            industryLabels: industryLabels,
            regionLabels: regionLabelsForOcc,
            valuesByRegion: valuesByRegion
          }
        }
      };
    });

    res.json({ occupations, selectedOccupations, selectedMetric, occupationDetails });
  } catch (error) {
    console.error("Error loading occupations data:", error);
    res.status(500).json({ error: "Could not load occupations data" });
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

