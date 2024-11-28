type Music = {
  id: string;
  status: "Playing" | "Paused" | "Stopped"; //PlaybackStatus
  startTimestamp: Date;
  endTimestamp: Date;
  album: string; //Metadata["xesam:album"]
  artist: string; //Metadata["xesam:artist"][0]
  title: string; //Metadata["xesam:title"]
  player: string; //  Identity
};

type Album = {
  title: string;
  artist: string;
};
