"use client";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
ChartJS.register(ArcElement, Tooltip, Legend);

export default function RevenuePie() {
  return (
    <Doughnut
      data={{
        labels: ["Rent","Onboarding","Security"],
        datasets: [{ data: [63,21,15], backgroundColor: ["#00D1B2","#6C5CE7","#a29bfe"], borderWidth: 0 }],
      }}
      options={{ responsive: true, cutout: "65%", plugins: { legend: { display: false } } }}
    />
  );
}
