const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

