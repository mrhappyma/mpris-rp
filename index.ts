console.log("-----------------------------------"); //35

import RPC from "discord-rpc";
import DBus from "dbus-next";

const rpc = new RPC.Client({ transport: "ipc" });

await rpc.login({ clientId: "1311133616058798121" });
rpc.setActivity({
  state: "starting",
  type: 5,
});

const session = DBus.sessionBus();
const obj = await session.getProxyObject(
  "org.freedesktop.DBus",
  "/org/freedesktop/DBus"
);
let iface = obj.getInterface("org.freedesktop.DBus");
let names: string[] = await iface.ListNames();
let playernames = names.filter((n: string) =>
  n.startsWith("org.mpris.MediaPlayer2")
);

const players = await Promise.all(
  playernames.map(async (name: string) =>
    session.getProxyObject(name, "/org/mpris/MediaPlayer2")
  )
);

const music: Music[] = [];

const albumCoverCache = new Map<string, string>();
const getAlbumCover = async (album: Album) => {
  const cacheKey = `${album.title}:${album.artist}`;
  if (albumCoverCache.has(cacheKey)) return albumCoverCache.get(cacheKey);
  const url = `https://api.deezer.com/search?q=album:"${album.title}" artist:"${album.artist}"`;
  const response = await fetch(url);
  const data = await response.json();
  if (!data?.data?.length) return;
  const cover = data.data[0].album.cover_big;
  albumCoverCache.set(cacheKey, cover);
  return cover;
};

const setActivity = async () => {
  music.sort((a, b) => (a.status === "Playing" ? -1 : 1));

  if (!music.length || !music[0].title) {
    rpc.clearActivity();
    return;
  }

  const playing = music[0].status === "Playing";
  rpc.setActivity({
    state: music[0].artist,
    startTimestamp: playing ? music[0].startTimestamp : undefined,
    endTimestamp: playing ? music[0].endTimestamp : undefined,
    details: music[0].title,
    largeImageKey: await getAlbumCover({
      title: music[0].album,
      artist: music[0].artist,
    }),
    largeImageText: music[0].album,
    smallImageKey: music[0].status.toLowerCase(),
    smallImageText: music[0].status,
    type: 2,
  });
};

for (const player of players) {
  await addPlayer(player);
}

async function addPlayer(player: DBus.ProxyObject) {
  const propertiesInterface = player.getInterface(
    "org.freedesktop.DBus.Properties"
  );

  async function getPlayerData() {
    const metadata = await propertiesInterface.GetAll(
      "org.mpris.MediaPlayer2.Player"
    );
    const mediaplayer = await propertiesInterface.GetAll(
      "org.mpris.MediaPlayer2"
    );

    const startTimestamp = new Date(
      new Date().getTime() - Number(metadata["Position"]?.value) / 1000
    );

    const music: Music = {
      id: player.name,
      status: metadata["PlaybackStatus"]?.value,
      startTimestamp: startTimestamp,
      endTimestamp: new Date(
        startTimestamp.getTime() +
          Number(metadata.Metadata?.value["mpris:length"]?.value) / 1000
      ),
      album: metadata.Metadata?.value["xesam:album"]?.value,
      artist: metadata.Metadata?.value["xesam:artist"]?.value[0],
      title: metadata.Metadata?.value["xesam:title"]?.value,
      player: mediaplayer["Identity"]?.value.split(" -")[0],
    };
    return music;
  }

  music.push(await getPlayerData());
  setActivity();

  propertiesInterface.addListener("PropertiesChanged", async (changed) => {
    const updatedData = await getPlayerData();
    const index = music.findIndex((m) => m.id === updatedData.id);
    music[index] = updatedData;
    setActivity();
  });
}

// add and remove players
iface.addListener(
  "NameOwnerChanged",
  async (name: string, oldOwner: string, newOwner: string) => {
    if (!name.startsWith("org.mpris.MediaPlayer2")) return;
    if (oldOwner === "") {
      const player = await session.getProxyObject(
        name,
        "/org/mpris/MediaPlayer2"
      );
      await addPlayer(player);
    } else {
      const index = music.findIndex((m) => m.id === name);
      music.splice(index, 1);
      setActivity();
    }
  }
);
