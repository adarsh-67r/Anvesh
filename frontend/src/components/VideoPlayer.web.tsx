export function VideoPlayer({ videoId, width, start, end }: { videoId: string; width: number; start?: number; end?: number }) {
  return (
    <iframe
      width={width}
      height={Math.round((width * 9) / 16)}
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1${start ? `&start=${start}` : ""}${end ? `&end=${end}` : ""}`}
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      style={{ border: 0, display: "block" }}
    />
  );
}
