async function loadOverviewChart() {
  const response = await fetch("/api/overview");
  const data = await response.json();

  document.getElementById("totalRegions").textContent =
    data.summary.totalRegions.toLocaleString();

  document.getElementById("totalNewWorkers").textContent =
    data.summary.totalNewWorkers.toLocaleString();

  document.getElementById("topRegion").textContent =
    `${data.summary.topRegion} (${data.summary.topRegionValue.toLocaleString()})`;

  const ctx = document.getElementById("employmentChart").getContext("2d");

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: data.title,
          data: data.values,
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
          text: data.title
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

loadOverviewChart();