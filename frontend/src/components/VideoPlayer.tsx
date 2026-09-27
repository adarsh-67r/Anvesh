import YoutubePlayer from "react-native-youtube-iframe";

export function VideoPlayer({ videoId, width }: { videoId: string; width: number }) {
  return (
    <YoutubePlayer
      videoId={videoId}
      width={width}
      height={Math.round((width * 9) / 16)}
      play
      webViewProps={{ allowsFullscreenVideo: true }}
    />
  );
}
