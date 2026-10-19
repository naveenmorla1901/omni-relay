export type CameraPosition = 'front' | 'back' | 'external';

export type CameraDevice = {
  id: string;
  name: string;
  position: CameraPosition;
};

export type CameraFormat = {
  width: number;
  height: number;
  fps: number;
};
