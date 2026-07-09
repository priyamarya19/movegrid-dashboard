"use client";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Legend, Tooltip } from "chart.js";
import { useTheme, cssVar } from "@/lib/theme";
ChartJS.register(CategoryScale, LinearScale, BarElement, Legend, Tooltip);

export default function CollectionsChart() {
  const { theme } = useTheme();
  const gridColor = cssVar("--border-default", "#1e1e2e");
  const tickColor = cssVar("--text-muted", "#666");

  return (
    <Bar
      key={theme}
      data={{
        labels: ["Jan","Feb","Mar","Apr","May"],
        datasets: [
          { label: "Rent", data: [420000,510000,580000,610000,620000], backgroundColor: cssVar("--accent-teal", "#00D1B2"), borderRadius: 4 },
          { label: "Onboarding", data: [80000,120000,160000,190000,210000], backgroundColor: cssVar("--accent-purple", "#6C5CE7"), borderRadius: 4 },
          { label: "Security Deposit", data: [60000,90000,120000,140000,150000], backgroundColor: cssVar("--accent-purple-2", "#a29bfe"), borderRadius: 4 },
          { label: "Investor Payouts", data: [-180000,-210000,-230000,-250000,-260000], backgroundColor: cssVar("--accent-danger", "#e17055"), borderRadius: 4 },
        ],
      }}
      options={{
        responsive: true,
        plugins: { legend: { labels: { color: tickColor, font: { size: 11 } } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor } },
          y: { grid: { color: gridColor }, ticks: { color: tickColor, callback: (v: number | string) => "₹" + (Number(v)/100000).toFixed(1) + "L" } },
        },
      }}
    />
  );
}
