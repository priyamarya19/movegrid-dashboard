"use client";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { useTheme, cssVar } from "@/lib/theme";
ChartJS.register(ArcElement, Tooltip, Legend);

export default function RevenuePie() {
  const { theme } = useTheme();
  const colors = [
    cssVar("--accent-teal", "#00D1B2"),
    cssVar("--accent-purple", "#6C5CE7"),
    cssVar("--accent-purple-2", "#a29bfe"),
  ];
  return (
    <Doughnut
      key={theme}
      data={{
        labels: ["Rent","Onboarding","Security"],
        datasets: [{ data: [63,21,15], backgroundColor: colors, borderWidth: 0 }],
      }}
      options={{ responsive: true, cutout: "65%", plugins: { legend: { display: false } } }}
    />
  );
}
