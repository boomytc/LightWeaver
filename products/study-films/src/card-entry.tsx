import { Composition, registerRoot } from "remotion";
import { Card } from "./Card";
import { CardRenderInput, PROFILES } from "@lightweaver/weaver/contracts";

const defaults = CardRenderInput.parse({
  cardSpec: {
    template: "title",
    version: "2",
    copy: {
      zh: { headline: "LightWeaver", points: ["由最终计划决定画幅和帧长"] },
    },
  },
  locale: "zh",
  output: PROFILES.landscape,
  durationFrames: 90,
});
registerRoot(() => (
  <Composition
    id="Card"
    component={Card}
    defaultProps={defaults}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={90}
    calculateMetadata={({ props }) => {
      const p = CardRenderInput.parse(props);
      return {
        width: p.output.width,
        height: p.output.height,
        fps: p.output.fps.num / p.output.fps.den,
        durationInFrames: p.durationFrames,
        props: p,
      };
    }}
  />
));
