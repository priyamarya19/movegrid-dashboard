"use client";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
ChartJS.register(ArcElement, Tooltip, Legend);

type Props = { assigned: number; available: number; maintenance: number };

export default function VehicleDonut({ assigned, available, maintenance }: Props) {
  return (
    <Doughnut
      data={{
        labels: ["Assigned", "Available", "Maintenance"],
        datasets: [{ data: [assigned, available, maintenance], backgroundColor: ["#00D1B2", "#fdcb6e", "#e17055"], borderWidth: 0 }],
      }}
      options={{ responsive: true, cutout: "70%", plugins: { legend: { display: false } } }}
    />
  );
}
