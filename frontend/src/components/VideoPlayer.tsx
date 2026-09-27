import YoutubePlayer from "react-native-youtube-iframe";

export function VideoPlayer({ videoId, width, start, end }: { videoId: string; width: number; start?: number; end?: number }) {
  return (
    <YoutubePlayer
      videoId={videoId}
      width={width}
      height={Math.round((width * 9) / 16)}
      play
      initialPlayerParams={{ start, end }}
      webViewProps={{ allowsFullscreenVideo: true }}
    />
  );
}
