export function VideoPlayer({ videoId, width }: { videoId: string; width: number }) {
  return (
    <iframe
      width={width}
      height={Math.round((width * 9) / 16)}
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      style={{ border: 0, display: "block" }}
    />
  );
}
