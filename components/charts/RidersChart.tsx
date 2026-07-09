"use client";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Legend, Tooltip } from "chart.js";
import { useTheme, cssVar } from "@/lib/theme";
ChartJS.register(CategoryScale, LinearScale, BarElement, Legend, Tooltip);

type Props = { data: { label: string; count: number }[] };

export default function RidersChart({ data }: Props) {
  const { theme } = useTheme();
  if (!data || data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-muted text-sm">No onboarding data yet</div>;
  }

  const gridColor = cssVar("--border-default", "#1e1e2e");
  const tickColor = cssVar("--text-muted", "#666");
  const purple = cssVar("--accent-purple", "#6C5CE7");

  return (
    <Bar
      key={theme}
      data={{
        labels: data.map(d => d.label),
        datasets: [
          {
            label: "Riders Onboarded",
            data: data.map(d => d.count),
            backgroundColor: `color-mix(in srgb, ${purple} 50%, transparent)`,
            borderColor: purple,
            borderWidth: 2,
            borderRadius: 4,
          },
        ],
      }}
      options={{
        responsive: true,
        plugins: { legend: { labels: { color: tickColor, font: { size: 11 } } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
          y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 }, stepSize: 1 } },
        },
      }}
    />
  );
}
