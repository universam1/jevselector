import "./index.css";
import { Composition } from "remotion";
import { JevSelectorDemo, TOTAL_FRAMES } from "./JevSelectorDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="JevSelectorDemo"
        component={JevSelectorDemo}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
