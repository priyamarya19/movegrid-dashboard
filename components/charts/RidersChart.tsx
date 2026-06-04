"use client";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Legend, Tooltip } from "chart.js";
ChartJS.register(CategoryScale, LinearScale, BarElement, Legend, Tooltip);

type Props = { data: { label: string; count: number }[] };

export default function RidersChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-[#555] text-sm">No onboarding data yet</div>;
  }

  return (
    <Bar
      data={{
        labels: data.map(d => d.label),
        datasets: [
          {
            label: "Riders Onboarded",
            data: data.map(d => d.count),
            backgroundColor: "#6C5CE780",
            borderColor: "#6C5CE7",
            borderWidth: 2,
            borderRadius: 4,
          },
        ],
      }}
      options={{
        responsive: true,
        plugins: { legend: { labels: { color: "#888", font: { size: 11 } } } },
        scales: {
          x: { grid: { color: "#1e1e2e" }, ticks: { color: "#666", font: { size: 11 } } },
          y: { grid: { color: "#1e1e2e" }, ticks: { color: "#666", font: { size: 11 }, stepSize: 1 } },
        },
      }}
    />
  );
}
