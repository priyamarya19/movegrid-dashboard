// Renders an array of S3 keys (as stored by ImageUpload) as clickable thumbnails.
// Used on detail pages for the free-form "Additional Photos" galleries.
function fileUrl(key: string) {
  return `/api/file?key=${encodeURIComponent(key)}`;
}

export default function PhotoGallery({
  title,
  photos,
  accent = "var(--accent-purple)",
}: {
  title: string;
  photos?: string[] | null;
  accent?: string;
}) {
  const keys = (photos ?? []).filter(Boolean);
  if (keys.length === 0) return null;

  return (
    <div className="bg-surface border border-default rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-primary font-semibold">{title}</h2>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: accent, backgroundColor: "color-mix(in srgb, currentColor 13%, transparent)" }}>
          {keys.length} {keys.length === 1 ? "photo" : "photos"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {keys.map((key, i) => (
          <a key={i} href={fileUrl(key)} target="_blank" rel="noopener noreferrer"
            className="group relative block aspect-square rounded-xl overflow-hidden border border-default hover:border-strong transition-colors">
            <img src={fileUrl(key)} alt={`Photo ${i + 1}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            <span className="absolute bottom-1.5 right-1.5 bg-base/80 text-muted text-[10px] px-1.5 py-0.5 rounded">
              {i + 1}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
