export type VehicleKind =
  | 'supercar'
  | 'convertible'
  | 'coupe'
  | 'sedan'
  | 'suv'
  | 'truck'
  | 'police'
  | 'motorcycle';

export type GraphicsQuality = 'balanced' | 'detailed';
export type TimeOfDay = 'day' | 'dusk' | 'sunset' | 'night';
export type CameraViewMode = 'chase' | 'cockpit';
export type FpsLimit = 0 | 30 | 60 | 120;
export type NpcArchetype = 'tall' | 'average' | 'short' | 'kid';

export type PoiKind = 'weapon' | 'clothing' | 'garage' | 'store' | 'bank';
export type WeaponKind = 'unarmed' | 'pistol' | 'smg' | 'rifle';

export interface PoiMarkerInfo {
  id: string;
  kind: PoiKind;
  name: string;
  shortLabel: string;
  color: string;
  district: string;
  x: number;
  z: number;
  doorX: number;
  doorZ: number;
}

export interface MinimapRadarEntity {
  x: number;
  z: number;
  kind: 'police' | 'officer';
}

export interface GpsWaypoint {
  x: number;
  z: number;
  label?: string;
}

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
  speedLimitKmh: number;
  isSpeeding: boolean;
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
  wantedLevel: number; // 0 - 3
  wantedReason: string;
  evasionRatio: number; // 0 - 1 (cooldown progress while out of sight)
  bustedNotice: boolean;
  timeOfDay: TimeOfDay;
  districtZone: string;
  lastEventText: string;
  health: number;
  maxHealth: number;
  isDead: boolean;
  damageFlash: number;
  cash: number;
  equippedWeapon: WeaponKind;
  ownedWeapons: WeaponKind[];
  ammo: Record<WeaponKind, number>;
  activeShop: PoiKind | null;
  activeShopName: string;
  shopMenuOpen: boolean;
  nearShopName: string;
  nearShopExit: boolean;
  canBreakInStore: boolean;
  breakInTargetName: string;
  mapOpen: boolean;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  pois: PoiMarkerInfo[];
  radarEntities: MinimapRadarEntity[];
  gpsPin: GpsWaypoint | null;
  gpsPath: { x: number; z: number }[];
  gpsDistMeters: number;
  cityBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  ewRoads: number[];
  nsRoads: number[];
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
