export function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export const youTubeThumb = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
