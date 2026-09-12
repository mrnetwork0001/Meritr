import React from 'react';
import { Composition } from 'remotion';
import { Meritr, MERITR_DURATION } from './Meritr';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Meritr"
    component={Meritr}
    durationInFrames={MERITR_DURATION}
    fps={30}
    width={1920}
    height={1080}
  />
);
