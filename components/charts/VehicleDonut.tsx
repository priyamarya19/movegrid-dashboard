"use client";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { useTheme, cssVar } from "@/lib/theme";
ChartJS.register(ArcElement, Tooltip, Legend);

type Props = { assigned: number; available: number; notAvailable: number };

export default function VehicleDonut({ assigned, available, notAvailable }: Props) {
  const { theme } = useTheme();
  const colors = [
    cssVar("--accent-teal", "#00D1B2"),
    cssVar("--accent-warning", "#fdcb6e"),
    cssVar("--accent-danger", "#e17055"),
  ];
  return (
    <Doughnut
      key={theme}
      data={{
        labels: ["Assigned", "Available", "Not Available"],
        datasets: [{ data: [assigned, available, notAvailable], backgroundColor: colors, borderWidth: 0 }],
      }}
      options={{ responsive: true, cutout: "70%", plugins: { legend: { display: false } } }}
    />
  );
}
