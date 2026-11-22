export type VehicleKind = 'sedan' | 'suv' | 'coupe' | 'truck' | 'motorcycle';

export type GraphicsQuality = 'balanced' | 'detailed';
export type TimeOfDay = 'day' | 'sunset' | 'night';
export type CameraViewMode = 'chase' | 'cockpit';
export type FpsLimit = 0 | 30 | 60 | 120;

export interface ParadiseHeatSettings {
  invertPointerY: boolean;
  pointerSensitivity: number; // 0.25 - 2.0
  quality: GraphicsQuality;
  fpsLimit: FpsLimit;
  timeOfDay: TimeOfDay;
  masterVolume: number; // 0 - 1
  musicVolume: number; // 0 - 1
  engineVolume: number; // 0 - 1
  reactionVolume: number; // 0 - 1
  customSongName: string;
}

export interface HudSnapshot {
  mode: 'foot' | 'car' | 'motorcycle';
  vehicleKind: VehicleKind | null;
  vehicleLabel: string;
  speedKmh: number;
  gearLabel: string;
  rpmRatio: number; // 0 - 1
  cameraView: CameraViewMode;
  canEnterVehicle: boolean;
  nearbyVehicleLabel: string;
  canPunch: boolean;
  isEntering: boolean;
  pointerLocked: boolean;
  paused: boolean;
  knockdowns: number;
  timeOfDay: TimeOfDay;
  districtZone: string;
  lastEventText: string;
}

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
  label?: string;
}

export interface SidewalkPad {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}
