import { Composition, staticFile } from "remotion";
import { fetchPhotos } from "./data/fetch-photos";
import type { PhotoRecord } from "./data/load-photos";
import { Hero } from "./Hero";
import { CameraScene } from "./scenes/CameraScene";
import { GalleryScene } from "./scenes/GalleryScene";
import { MapScene } from "./scenes/MapScene";
import { MomentScene } from "./scenes/MomentScene";
import { RevealScene } from "./scenes/RevealScene";
import { ProfileScene } from "./scenes/ProfileScene";
import { PhotosProvider } from "./data/photos-context";
import { Playground } from "./ui/Playground";
import { REEL_FRAMES, Reel } from "./reel/Reel";
import { HOW_SLIDES, HowCarousel, SLIDE_H, SLIDE_W, WHY_SLIDES, WhyCarousel } from "./carousel/Carousels";

const dev = (Scene: () => React.JSX.Element) => ({ photos }: { photos: PhotoRecord[] }) => (
  <PhotosProvider photos={photos}><Scene /></PhotosProvider>
);
const Camera = dev(CameraScene);
const Gallery = dev(GalleryScene);
const Profile = dev(ProfileScene);
const MapDev = dev(MapScene);
const Reveal = dev(RevealScene);
const Moment = dev(MomentScene);

const loadProps = async () => ({
  props: { photos: await fetchPhotos(staticFile("photos/index.json")) },
});

export const Root = () => (
  <>
  <Composition
    id="Hero"
    component={Hero}
    fps={30}
    width={540}
    height={1170}
    durationInFrames={660}
    defaultProps={{ photos: [] as PhotoRecord[] }}
    calculateMetadata={loadProps}
  />
  <Composition
    id="Reel"
    component={Reel}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={REEL_FRAMES}
    defaultProps={{ photos: [] as PhotoRecord[] }}
    calculateMetadata={loadProps}
  />
  <Composition id="CarouselHow" component={HowCarousel} fps={30} width={SLIDE_W} height={SLIDE_H} durationInFrames={HOW_SLIDES}
    defaultProps={{ photos: [] as PhotoRecord[] }} calculateMetadata={loadProps} />
  <Composition id="CarouselWhy" component={WhyCarousel} fps={30} width={SLIDE_W} height={SLIDE_H} durationInFrames={WHY_SLIDES}
    defaultProps={{ photos: [] as PhotoRecord[] }} calculateMetadata={loadProps} />
  <Composition
    id="Playground"
    component={Playground}
    fps={30}
    width={540}
    height={1170}
    durationInFrames={30}
    defaultProps={{ photos: [] as PhotoRecord[] }}
    calculateMetadata={loadProps}
  />
  <Composition id="Camera" component={Camera} fps={30} width={540} height={1170} durationInFrames={120}
    defaultProps={{ photos: [] as PhotoRecord[] }} calculateMetadata={loadProps} />
  <Composition id="Gallery" component={Gallery} fps={30} width={540} height={1170} durationInFrames={90}
    defaultProps={{ photos: [] as PhotoRecord[] }} calculateMetadata={loadProps} />
  <Composition id="Profile" component={Profile} fps={30} width={540} height={1170} durationInFrames={90}
    defaultProps={{ photos: [] as PhotoRecord[] }} calculateMetadata={loadProps} />
  <Composition id="Map" component={MapDev} fps={30} width={540} height={1170} durationInFrames={135}
    defaultProps={{ photos: [] as PhotoRecord[] }} calculateMetadata={loadProps} />
  <Composition id="Reveal" component={Reveal} fps={30} width={540} height={1170} durationInFrames={135}
    defaultProps={{ photos: [] as PhotoRecord[] }} calculateMetadata={loadProps} />
  <Composition id="Moment" component={Moment} fps={30} width={540} height={1170} durationInFrames={150}
    defaultProps={{ photos: [] as PhotoRecord[] }} calculateMetadata={loadProps} />
  </>
);
