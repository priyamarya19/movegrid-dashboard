"use client";

import { useRef, useState } from "react";

interface Props {
  label: string;
  folder: string;
  value: string;          // S3 key stored in DB
  onChange: (key: string) => void;
}

export default function ImageUpload({ label, folder, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { key } = await res.json();
      onChange(key);
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider">{label}</label>

      {value ? (
        <div className="flex items-center gap-2 p-3 bg-[#0d0d15] border border-[#00D1B230] rounded-xl">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00D1B2" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          <span className="text-[#00D1B2] text-xs flex-1 truncate">Uploaded</span>
          <a href={`/api/file?key=${encodeURIComponent(value)}`} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#6C5CE7] hover:underline shrink-0">View</a>
          <button type="button" onClick={() => { onChange(""); if (inputRef.current) inputRef.current.value = ""; }}
            className="text-[#555] hover:text-red-400 text-xs shrink-0">✕</button>
        </div>
      ) : (
        <div className="flex gap-2">
          {/* Gallery / file picker */}
          <button type="button" onClick={() => {
            if (inputRef.current) { inputRef.current.removeAttribute("capture"); inputRef.current.click(); }
          }}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2 p-3 bg-[#0d0d15] border border-dashed border-[#2a2a3a] rounded-xl text-[#555] hover:border-[#6C5CE7] hover:text-[#6C5CE7] transition-colors text-xs disabled:opacity-50">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            {uploading ? "Uploading…" : "Choose file"}
          </button>

          {/* Camera capture */}
          <button type="button" onClick={() => {
            if (inputRef.current) { inputRef.current.setAttribute("capture", "environment"); inputRef.current.click(); }
          }}
            disabled={uploading}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0d0d15] border border-dashed border-[#2a2a3a] rounded-xl text-[#555] hover:border-[#00D1B2] hover:text-[#00D1B2] transition-colors text-xs disabled:opacity-50">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Camera
          </button>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={handleFile}
        className="hidden" />
    </div>
  );
}
