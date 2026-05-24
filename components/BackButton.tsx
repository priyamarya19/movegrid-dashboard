"use client";

import { useRouter } from "next/navigation";

type Props = { fallback: string; label: string };

export default function BackButton({ fallback, label }: Props) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="text-[#555] hover:text-white text-sm transition-colors"
    >
      ← {label}
    </button>
  );
}
