"use client";
import { Chart } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Legend, Tooltip } from "chart.js";
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Legend, Tooltip);

const labels = ["Apr 27","Apr 28","Apr 29","Apr 30","May 1","May 2","May 3"];

export default function RidersChart() {
  return (
    <Chart
      type="bar"
      data={{
        labels,
        datasets: [
          { type: "bar", label: "This Period", data: [4,7,3,8,6,9,8], backgroundColor: "#6C5CE780", borderColor: "#6C5CE7", borderWidth: 2, borderRadius: 4 },
          { type: "line", label: "Prev Period", data: [3,5,4,6,5,7,6], borderColor: "#00D1B2", borderWidth: 2, pointBackgroundColor: "#00D1B2", fill: false, tension: 0.4 },
        ],
      }}
      options={{
        responsive: true,
        plugins: { legend: { labels: { color: "#888", font: { size: 11 } } } },
        scales: {
          x: { grid: { color: "#1e1e2e" }, ticks: { color: "#666", font: { size: 11 } } },
          y: { grid: { color: "#1e1e2e" }, ticks: { color: "#666", font: { size: 11 } } },
        },
      }}
    />
  );
}
