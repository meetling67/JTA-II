import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { BoxCollider, PoiKind, PoiMarkerInfo, SidewalkPad } from './types';
import {
  createAsphaltPBR,
  createBrickApartmentTexture,
  createConcreteTrimPBR,
  createCrosswalkTexture,
  createGlassSkyscraperTexture,
  createGroundTerrainPBR,
  createIndustrialFacadeTexture,
  createSidewalkPBR,
  createSpeedLimitSignTexture,
  createStorefrontFacadeTexture,
  createStorefrontSignTexture,
  createSuburbanHouseTexture,
  createWaterTexture,
  createWoodPierPBR,
} from './textures';
import {
  buildBench,
  buildLuxuryYacht,
  buildSpeedLimitSign,
  buildTrafficSignal,
  buildWeaponMesh,
} from './models';

export const LANDMARK_GLB_URL =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/LittlestTokyo.glb';

export interface ShopPoiRuntime {
  info: PoiMarkerInfo;
  roomCenter: THREE.Vector3;
  roomBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  roomColliders: BoxCollider[];
  spawnInside: THREE.Vector3;
  exitDoor: THREE.Vector3;
  outsideReturn: THREE.Vector3;
  counterSpot: THREE.Vector3;
  driveBaySpot?: THREE.Vector3;
  guardSpawns: { x: number; z: number; yaw: number }[];
  weaponPickupSpots?: { kind: 'pistol' | 'smg' | 'rifle'; x: number; z: number; prop: THREE.Group }[];
  robbedUntil: number;
  portalRingMat: THREE.MeshStandardMaterial;
}

export interface CityMapData {
  cityGroup: THREE.Group;
  colliders: BoxCollider[];
  sidewalks: SidewalkPad[];
  trafficLoops: THREE.Vector3[][];
  pedestrianLoops: THREE.Vector3[][];
  intersections: { x: number; z: number }[];
  ewRoads: number[];
  nsRoads: number[];
  shopPois: ShopPoiRuntime[];
  ewSignalMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  nsSignalMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  buildingMaterials: THREE.MeshStandardMaterial[];
  lampEmitterMaterial: THREE.MeshStandardMaterial;
  neonSignMaterials: THREE.MeshStandardMaterial[];
  waterMesh: THREE.Mesh;
  yachtMesh: THREE.Group;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  updateLandmark?: (dt: number) => void;
  disposeLandmark?: () => void;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

function pushMatrix(
  list: THREE.Matrix4[],
  px: number,
  py: number,
  pz: number,
  sx: number,
  sy: number,
  sz: number,
  rx = 0,
  ry = 0,
  rz = 0
): void {
  const m = new THREE.Matrix4();
  _pos.set(px, py, pz);
  _euler.set(rx, ry, rz);
  _quat.setFromEuler(_euler);
  _scale.set(sx, sy, sz);
  m.compose(_pos, _quat, _scale);
  list.push(m);
}

function addInstancedBatch(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  castShadow: boolean,
  receiveShadow: boolean
): THREE.InstancedMesh | null {
  if (matrices.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i]);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

/**
 * Reconstructs Paradise Heat's 5x expanded multi-district open-world city:
 * - InstancedMesh batching for roads, sidewalks, skyscrapers, suburban houses, industrial warehouses, streetlights & trees
 * - 4 Distinct Districts: Waterfront/Marina, Downtown Skyscrapers, East/West Suburbs, and Northern Industrial Zone
 * - Central Plaza with LittlestTokyo detailed architectural landmark & Supercar Display Plinth
 */
export function buildCityDistrict(anisotropy: number, isSoftwareGl = false): CityMapData {
  const cityGroup = new THREE.Group();
  const colliders: BoxCollider[] = [];
  const sidewalks: SidewalkPad[] = [];
  const buildingMaterials: THREE.MeshStandardMaterial[] = [];
  const neonSignMaterials: THREE.MeshStandardMaterial[] = [];
  const shopPois: ShopPoiRuntime[] = [];

  let landmarkMixer: THREE.AnimationMixer | null = null;
  let landmarkRoot: THREE.Object3D | null = null;
  let landmarkDisposed = false;
  let dracoLoader: DRACOLoader | null = null;

  const asphaltPbr = createAsphaltPBR(anisotropy, true);
  const intersectionPbr = createAsphaltPBR(anisotropy, false);
  const crosswalkTex = createCrosswalkTexture(anisotropy);
  const sidewalkPbr = createSidewalkPBR(anisotropy);
  const groundPbr = createGroundTerrainPBR(anisotropy);
  const woodPierPbr = createWoodPierPBR(anisotropy);
  const darkTrimPbr = createConcreteTrimPBR(anisotropy, '#151d2e');
  const roofUnitPbr = createConcreteTrimPBR(anisotropy, '#64748b');
  const curbPbr = createConcreteTrimPBR(anisotropy, '#3f4652');
  const waterTex = createWaterTexture(anisotropy);

  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltPbr.map,
    roughnessMap: asphaltPbr.roughnessMap,
    bumpMap: asphaltPbr.bumpMap,
    bumpScale: 0.032,
    roughness: 1.0,
    metalness: 0.08,
    envMapIntensity: 0.9,
  });
  const intersectionMat = new THREE.MeshStandardMaterial({
    map: intersectionPbr.map,
    roughnessMap: intersectionPbr.roughnessMap,
    bumpMap: intersectionPbr.bumpMap,
    bumpScale: 0.032,
    roughness: 1.0,
    metalness: 0.08,
    envMapIntensity: 0.9,
  });
  const crosswalkMat = new THREE.MeshStandardMaterial({
    map: crosswalkTex,
    roughness: 0.74,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: sidewalkPbr.map,
    roughnessMap: sidewalkPbr.roughnessMap,
    bumpMap: sidewalkPbr.bumpMap,
    bumpScale: 0.024,
    roughness: 1.0,
    metalness: 0.04,
    envMapIntensity: 0.58,
  });
  const awningMat = new THREE.MeshStandardMaterial({
    map: darkTrimPbr.map,
    roughnessMap: darkTrimPbr.roughnessMap,
    bumpMap: darkTrimPbr.bumpMap,
    bumpScale: 0.015,
    roughness: 0.65,
    metalness: 0.55,
    envMapIntensity: 1.05,
  });
  const roofUnitMat = new THREE.MeshStandardMaterial({
    map: roofUnitPbr.map,
    roughnessMap: roofUnitPbr.roughnessMap,
    bumpMap: roofUnitPbr.bumpMap,
    bumpScale: 0.02,
    roughness: 0.85,
    metalness: 0.35,
  });
  const lampEmitterMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe4b5,
    emissive: 0xffb347,
    emissiveIntensity: 0,
    roughness: 0.25,
  });

  // 1. Expanded Base Ground & Instanced Road Network
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(780, 620),
    new THREE.MeshStandardMaterial({
      map: groundPbr.map,
      roughnessMap: groundPbr.roughnessMap,
      bumpMap: groundPbr.bumpMap,
      bumpScale: 0.02,
      roughness: 1.0,
      metalness: 0.04,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, 110);
  ground.receiveShadow = true;
  cityGroup.add(ground);

  const ewZ = [-28, 12, 54, 98, 146, 198, 250];
  const nsX = [-216, -168, -120, -72, -24, 24, 72, 120, 168, 216];

  const ewRoadMatrices: THREE.Matrix4[] = [];
  const nsRoadMatrices: THREE.Matrix4[] = [];
  const interMatrices: THREE.Matrix4[] = [];
  const cwMatrices: THREE.Matrix4[] = [];

  for (const z of ewZ) {
    for (let x = -240; x <= 240; x += 24) {
      pushMatrix(ewRoadMatrices, x, 0.0, z, 14, 24, 1, -Math.PI / 2, 0, Math.PI / 2);
    }
  }
  for (const x of nsX) {
    for (let z = -34; z <= 290; z += 24) {
      pushMatrix(nsRoadMatrices, x, 0.004, z, 14, 24, 1, -Math.PI / 2, 0, 0);
    }
  }

  const unitPlane = new THREE.PlaneGeometry(1, 1);
  addInstancedBatch(cityGroup, unitPlane, asphaltMat, ewRoadMatrices, false, true);
  addInstancedBatch(cityGroup, unitPlane, asphaltMat, nsRoadMatrices, false, true);

  const intersections: { x: number; z: number }[] = [];
  const makeSignalTriplet = (): [
    THREE.MeshStandardMaterial,
    THREE.MeshStandardMaterial,
    THREE.MeshStandardMaterial,
  ] => [
    new THREE.MeshStandardMaterial({ color: 0x7f1d1d, emissive: 0xef4444, emissiveIntensity: 0.1, roughness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: 0x78350f, emissive: 0xf59e0b, emissiveIntensity: 0.1, roughness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0x22c55e, emissiveIntensity: 0.1, roughness: 0.2 }),
  ];
  const ewSignalMats = makeSignalTriplet();
  const nsSignalMats = makeSignalTriplet();

  for (const x of nsX) {
    for (const z of ewZ) {
      intersections.push({ x, z });
      pushMatrix(interMatrices, x, 0.01, z, 14.2, 14.2, 1, -Math.PI / 2, 0, 0);

      pushMatrix(cwMatrices, x, 0.015, z + 8.2, 12.6, 2.4, 1, -Math.PI / 2, 0, 0);
      pushMatrix(cwMatrices, x, 0.015, z - 8.2, 12.6, 2.4, 1, -Math.PI / 2, 0, 0);
      pushMatrix(cwMatrices, x + 8.2, 0.015, z, 12.6, 2.4, 1, -Math.PI / 2, 0, Math.PI / 2);
      pushMatrix(cwMatrices, x - 8.2, 0.015, z, 12.6, 2.4, 1, -Math.PI / 2, 0, Math.PI / 2);

      // Traffic signal gantries along major downtown & arterial intersections
      if (Math.abs(x) <= 120 && z <= 150) {
        const nsSig = buildTrafficSignal(nsSignalMats);
        nsSig.position.set(x - 7.8, 0.18, z + 7.8);
        nsSig.rotation.y = 0;
        cityGroup.add(nsSig);

        const ewSig = buildTrafficSignal(ewSignalMats);
        ewSig.position.set(x + 7.8, 0.18, z + 7.8);
        ewSig.rotation.y = Math.PI / 2;
        cityGroup.add(ewSig);
      }
    }
  }

  addInstancedBatch(cityGroup, unitPlane, intersectionMat, interMatrices, false, true);
  addInstancedBatch(cityGroup, unitPlane, crosswalkMat, cwMatrices, false, true);

  // Regulatory Speed Limit 50 km/h signs along primary avenues & highways
  const speedSignTex = createSpeedLimitSignTexture(anisotropy, 50);
  const speedSignPlacements: [number, number, number, number][] = [
    [-15.5, 0.18, -21.6, Math.PI / 2],
    [15.5, 0.18, -21.6, -Math.PI / 2],
    [-38, 0.2, -35.6, Math.PI / 2],
    [38, 0.2, -35.6, -Math.PI / 2],
    [-17.6, 0.18, -4, 0],
    [17.6, 0.18, 28, Math.PI],
    [-112, 0.18, 20, Math.PI / 2],
    [112, 0.18, 20, -Math.PI / 2],
    [-17.6, 0.18, 138, 0],
    [17.6, 0.18, 154, Math.PI],
  ];
  for (const [sx, sy, sz, srot] of speedSignPlacements) {
    const sign = buildSpeedLimitSign(speedSignTex);
    sign.position.set(sx, sy, sz);
    sign.rotation.y = srot;
    cityGroup.add(sign);
  }

  // 2. Waterfront Promenade + Marina Pier + Luxury Yacht (Expanded Width)
  const promenade = new THREE.Mesh(new THREE.BoxGeometry(504, 0.2, 16), sidewalkMat);
  promenade.position.set(0, 0.1, -43);
  promenade.receiveShadow = true;
  cityGroup.add(promenade);
  sidewalks.push({ minX: -252, maxX: 252, minZ: -51, maxZ: -35, height: 0.2 });

  const palmTrunkMatrices: THREE.Matrix4[] = [];
  const palmFrondMatrices: THREE.Matrix4[] = [];
  const palmCurbMatrices: THREE.Matrix4[] = [];
  const streetTrunkMatrices: THREE.Matrix4[] = [];
  const streetCanopyMatrices: THREE.Matrix4[] = [];
  const streetCurbMatrices: THREE.Matrix4[] = [];

  const pushPalmInstance = (px: number, py: number, pz: number, s: number, rotSeed: number) => {
    pushMatrix(palmCurbMatrices, px, py + 0.08 * s, pz, s, s, s);
    pushMatrix(palmTrunkMatrices, px, py + 2.8 * s, pz, s, s, s, 0, rotSeed, 0.05);
    for (let f = 0; f < 8; f++) {
      const yaw = (f / 8) * Math.PI * 2 + rotSeed;
      pushMatrix(palmFrondMatrices, px + Math.sin(yaw) * 0.85 * s, py + 5.2 * s, pz + Math.cos(yaw) * 0.85 * s, s, s, s, 0.42, yaw, 0);
    }
  };

  const pushStreetTreeInstance = (px: number, py: number, pz: number, s: number) => {
    pushMatrix(streetCurbMatrices, px, py + 0.07 * s, pz, s, s, s);
    pushMatrix(streetTrunkMatrices, px, py + 1.15 * s, pz, s, s, s);
    pushMatrix(streetCanopyMatrices, px, py + 2.95 * s, pz, 1.25 * s, 1.15 * s, 1.25 * s);
    pushMatrix(streetCanopyMatrices, px - 0.55 * s, py + 2.55 * s, pz + 0.25 * s, 0.85 * s, 0.85 * s, 0.85 * s);
    pushMatrix(streetCanopyMatrices, px + 0.55 * s, py + 2.65 * s, pz - 0.22 * s, 0.88 * s, 0.88 * s, 0.88 * s);
  };

  // Waterfront Palm Colonnade & Benches
  for (let x = -238; x <= 238; x += 20) {
    if (Math.abs(x) < 6) continue;
    pushPalmInstance(x, 0.2, -37.5, 0.96 + (Math.abs(x) % 3) * 0.07, x * 0.21);
    if (Math.abs(x) <= 130) {
      const bench = buildBench();
      bench.position.set(x + 4.5, 0.2, -48.2);
      bench.rotation.y = Math.PI;
      cityGroup.add(bench);
    }
  }

  // Waterfront safety railing
  const railMat = new THREE.MeshStandardMaterial({ color: 0xaab4c2, roughness: 0.28, metalness: 0.85 });
  const railSegments: [number, number][] = [
    [-252, -5],
    [5, 252],
  ];
  for (const [xStart, xEnd] of railSegments) {
    const len = xEnd - xStart;
    const mid = (xStart + xEnd) * 0.5;
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), railMat);
    topRail.position.set(mid, 1.15, -50.6);
    cityGroup.add(topRail);
    const midRail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.06), railMat);
    midRail.position.set(mid, 0.65, -50.6);
    cityGroup.add(midRail);
    colliders.push({ minX: xStart, maxX: xEnd, minZ: -51.4, maxZ: -50.2, topY: 1.4, label: 'Waterfront Rail' });
  }

  // Marina Pier extending onto the ocean (x in [-4.5..4.5], z in [-69..-51])
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.24, 18),
    new THREE.MeshStandardMaterial({
      map: woodPierPbr.map,
      roughnessMap: woodPierPbr.roughnessMap,
      bumpMap: woodPierPbr.bumpMap,
      bumpScale: 0.025,
      roughness: 1.0,
      metalness: 0.03,
    })
  );
  pierDeck.position.set(0, 0.08, -60);
  pierDeck.receiveShadow = true;
  cityGroup.add(pierDeck);
  sidewalks.push({ minX: -4.5, maxX: 4.5, minZ: -69, maxZ: -51, height: 0.2 });

  for (const sx of [-4.1, 4.1]) {
    for (let pz = -53; pz >= -68; pz -= 5) {
      const bollard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.16, 0.65, 10),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 })
      );
      bollard.position.set(sx, 0.5, pz);
      cityGroup.add(bollard);
    }
  }

  const yachtMesh = buildLuxuryYacht();
  yachtMesh.position.set(14, -0.35, -67);
  yachtMesh.rotation.y = Math.PI * 0.44;
  cityGroup.add(yachtMesh);

  // Ocean water extending to horizon
  const waterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 620),
    new THREE.MeshPhysicalMaterial({
      map: waterTex,
      color: 0x1585a8,
      roughness: 0.14,
      metalness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.35,
    })
  );
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(0, -0.45, -360);
  cityGroup.add(waterMesh);

  // 3. Expanded 77-Block Multi-District Grid (InstancedMesh Batched)
  const blockXCenters = [-240, -192, -144, -96, -48, 0, 48, 96, 144, 192, 240];
  const blockZSpans: [number, number][] = [
    [-21, 5],
    [19, 47],
    [61, 91],
    [105, 139],
    [153, 191],
    [205, 243],
    [257, 293],
  ];

  // Prepare building archetype materials (batched into InstancedMesh)
  const glassStyles = [
    { tint: '#335f82', mullion: '#141b24', lit: 0.46, accent: '#fbbf24' },
    { tint: '#284d6b', mullion: '#111827', lit: 0.52, accent: '#38bdf8' },
    { tint: '#3e627d', mullion: '#1e293b', lit: 0.42, accent: '#f472b6' },
  ];
  const glassMaterials = glassStyles.map((gStyle) => {
    const gTex = createGlassSkyscraperTexture(anisotropy, gStyle.tint, gStyle.mullion, gStyle.lit, gStyle.accent);
    const mat = new THREE.MeshStandardMaterial({
      map: gTex.map,
      emissiveMap: gTex.emissiveMap,
      emissive: new THREE.Color(0xffe7ba),
      emissiveIntensity: 0,
      metalness: 0.72,
      roughness: 0.18,
      envMapIntensity: 1.75,
    });
    buildingMaterials.push(mat);
    return mat;
  });

  const brickPalettes: [number, number, number][] = [
    [152, 74, 56],
    [130, 88, 68],
    [164, 114, 84],
  ];
  const brickMaterials = brickPalettes.map((brickRgb) => {
    const brTex = createBrickApartmentTexture(anisotropy, brickRgb, 0.45);
    const mat = new THREE.MeshStandardMaterial({
      map: brTex.map,
      emissiveMap: brTex.emissiveMap,
      roughnessMap: brTex.roughnessMap,
      metalnessMap: brTex.metalnessMap,
      emissive: new THREE.Color(0xffe7ba),
      emissiveIntensity: 0,
      roughness: 1.0,
      metalness: 0.2,
      envMapIntensity: 1.05,
    });
    buildingMaterials.push(mat);
    return mat;
  });

  const suburbanMaterials = [
    { siding: '#e5dccb', trim: '#475569' },
    { siding: '#d6e2e9', trim: '#334155' },
  ].map((s) => {
    const tex = createSuburbanHouseTexture(anisotropy, s.siding, s.trim);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      emissiveMap: tex.emissiveMap,
      emissive: new THREE.Color(0xffdca8),
      emissiveIntensity: 0,
      roughness: 0.72,
      metalness: 0.08,
      envMapIntensity: 0.85,
    });
    buildingMaterials.push(mat);
    return mat;
  });

  const industrialMaterials = ['#4b5563', '#3b4252'].map((steelHex) => {
    const tex = createIndustrialFacadeTexture(anisotropy, steelHex);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      emissiveMap: tex.emissiveMap,
      emissive: new THREE.Color(0xfef08a),
      emissiveIntensity: 0,
      roughness: 0.48,
      metalness: 0.58,
      envMapIntensity: 1.1,
    });
    buildingMaterials.push(mat);
    return mat;
  });

  const sfTex = createStorefrontFacadeTexture(anisotropy, '#151c28', '#ffe0a3');
  const sfMat = new THREE.MeshStandardMaterial({
    map: sfTex.map,
    emissiveMap: sfTex.emissiveMap,
    emissive: new THREE.Color(0xffe4b5),
    emissiveIntensity: 0,
    metalness: 0.7,
    roughness: 0.2,
    envMapIntensity: 1.55,
  });
  buildingMaterials.push(sfMat);

  const suburbRoofMat = new THREE.MeshStandardMaterial({ color: 0x3f2e26, roughness: 0.82, metalness: 0.1 });
  const siloMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.36, metalness: 0.78 });

  const storefrontNames = [
    { title: 'BALLOON MOTORS', bg: '#111827', accent: '#e879f9' },
    { title: 'PARADISE HOTEL', bg: '#0f172a', accent: '#38bdf8' },
    { title: 'OCEAN LOUNGE', bg: '#1e1b4b', accent: '#f472b6' },
    { title: 'VELOCE CLUB', bg: '#171717', accent: '#a855f7' },
  ];

  // Instance transform accumulators
  const sidewalkMatrices: THREE.Matrix4[] = [];
  const glassMatrices: THREE.Matrix4[][] = glassMaterials.map(() => []);
  const brickMatrices: THREE.Matrix4[][] = brickMaterials.map(() => []);
  const suburbMatrices: THREE.Matrix4[][] = suburbanMaterials.map(() => []);
  const suburbRoofMatrices: THREE.Matrix4[] = [];
  const industrialMatrices: THREE.Matrix4[][] = industrialMaterials.map(() => []);
  const siloMatrices: THREE.Matrix4[] = [];
  const storefrontMatrices: THREE.Matrix4[] = [];
  const awningMatrices: THREE.Matrix4[] = [];
  const roofUnitMatrices: THREE.Matrix4[] = [];

  const lampBaseMatrices: THREE.Matrix4[] = [];
  const lampShaftMatrices: THREE.Matrix4[] = [];
  const lampArmMatrices: THREE.Matrix4[] = [];
  const lampHoodMatrices: THREE.Matrix4[] = [];
  const lampLensMatrices: THREE.Matrix4[] = [];

  const pushStreetLight = (lx: number, ly: number, lz: number, ry: number) => {
    const dirZ = Math.cos(ry);
    const dirX = Math.sin(ry);
    pushMatrix(lampBaseMatrices, lx, ly + 0.3, lz, 1, 1, 1);
    pushMatrix(lampShaftMatrices, lx, ly + 3.2, lz, 1, 1, 1);
    pushMatrix(lampArmMatrices, lx + dirX * 0.68, ly + 6.02, lz + dirZ * 0.68, 1, 1, 1, -0.12, ry, 0);
    pushMatrix(lampHoodMatrices, lx + dirX * 1.38, ly + 6.1, lz + dirZ * 1.38, 1, 1, 1, 0, ry, 0);
    pushMatrix(lampLensMatrices, lx + dirX * 1.38, ly + 6.05, lz + dirZ * 1.38, 1, 1, 1, 0, ry, 0);
  };

  let styleCursor = 0;

  for (let bzIdx = 0; bzIdx < blockZSpans.length; bzIdx++) {
    const [zMin, zMax] = blockZSpans[bzIdx];
    const padDepth = zMax - zMin;
    const padZ = (zMin + zMax) * 0.5;

    for (let bxIdx = 0; bxIdx < blockXCenters.length; bxIdx++) {
      const cx = blockXCenters[bxIdx];
      const padWidth = 34;

      pushMatrix(sidewalkMatrices, cx, 0.09, padZ, padWidth, 0.18, padDepth);
      sidewalks.push({
        minX: cx - padWidth * 0.5,
        maxX: cx + padWidth * 0.5,
        minZ: zMin,
        maxZ: zMax,
        height: 0.18,
      });

      const isCentralPlaza = cx === 0 && bzIdx === 0;
      const isIndustrial = bzIdx >= 5;
      const isSuburban = !isIndustrial && Math.abs(cx) > 110;

      // Check if this block hosts one of the 5 Key POI Enterable Shops
      const poiSpec: {
        kind: PoiKind;
        name: string;
        shortLabel: string;
        district: string;
        colorHex: number;
        colorCss: string;
        bodyColor: number;
      } | null =
        cx === 48 && bzIdx === 1
          ? {
              kind: 'weapon',
              name: 'AMMU-NATION',
              shortLabel: 'GUNS',
              district: 'Downtown East',
              colorHex: 0xef4444,
              colorCss: '#ef4444',
              bodyColor: 0x261d1f,
            }
          : cx === -48 && bzIdx === 0
            ? {
                kind: 'clothing',
                name: 'PARADISE THREADS',
                shortLabel: 'OUTFITS',
                district: 'Waterfront West',
                colorHex: 0xec4899,
                colorCss: '#ec4899',
                bodyColor: 0x23182e,
              }
            : cx === -48 && bzIdx === 3
              ? {
                  kind: 'garage',
                  name: 'TURBO CUSTOMS',
                  shortLabel: 'GARAGE',
                  district: 'Crosstown Expressway',
                  colorHex: 0xf59e0b,
                  colorCss: '#f59e0b',
                  bodyColor: 0x222731,
                }
              : cx === 144 && bzIdx === 1
                ? {
                    kind: 'store',
                    name: '24/7 MART',
                    shortLabel: '24/7',
                    district: 'East Suburbs',
                    colorHex: 0x10b981,
                    colorCss: '#10b981',
                    bodyColor: 0x162b26,
                  }
                : cx === 0 && bzIdx === 1
                  ? {
                      kind: 'bank',
                      name: 'PACIFIC BANK',
                      shortLabel: 'BANK',
                      district: 'Downtown Center',
                      colorHex: 0x38bdf8,
                      colorCss: '#38bdf8',
                      bodyColor: 0x1b2638,
                    }
                  : null;

      if (poiSpec) {
        const bw = 24;
        const bd = padDepth - 10;
        const bh = poiSpec.kind === 'bank' ? 14.5 : poiSpec.kind === 'garage' ? 8.2 : 9.6;
        const bFrontZ = zMin + 4.4;
        const bCenterZ = bFrontZ + bd * 0.5;
        const doorX = cx;
        const doorZ = bFrontZ - 0.65;

        const poiBodyMat = new THREE.MeshStandardMaterial({
          color: poiSpec.bodyColor,
          roughness: 0.42,
          metalness: 0.35,
          envMapIntensity: 1.1,
        });
        const poiTrimMat = new THREE.MeshStandardMaterial({
          color: poiSpec.colorHex,
          emissive: poiSpec.colorHex,
          emissiveIntensity: 1.5,
          roughness: 0.25,
        });
        neonSignMaterials.push(poiTrimMat);

        const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), poiBodyMat);
        building.position.set(cx, 0.18 + bh * 0.5, bCenterZ);
        building.castShadow = !isSoftwareGl;
        building.receiveShadow = true;
        cityGroup.add(building);

        // Glowing neon roofline trim & storefront awning
        const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.35, 0.26, bd + 0.35), poiTrimMat);
        roofTrim.position.set(cx, 0.18 + bh - 0.25, bCenterZ);
        cityGroup.add(roofTrim);

        const awning = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.34, 2.2), awningMat);
        awning.position.set(cx, 3.85, bFrontZ - 0.9);
        cityGroup.add(awning);

        // Storefront glowing neon sign marquee
        const signTex = createStorefrontSignTexture(anisotropy, poiSpec.name, '#0b1020', poiSpec.colorCss);
        const signMat = new THREE.MeshStandardMaterial({
          map: signTex,
          emissiveMap: signTex,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 1.15,
          roughness: 0.25,
        });
        neonSignMaterials.push(signMat);

        const signBoard = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.85, 0.24), signMat);
        signBoard.position.set(cx, 5.15, bFrontZ - 0.25);
        signBoard.rotation.y = Math.PI;
        cityGroup.add(signBoard);

        // Glass display windows flanking the glowing entrance doorway
        const winMat = new THREE.MeshPhysicalMaterial({
          color: 0x93c5fd,
          emissive: poiSpec.colorHex,
          emissiveIntensity: 0.22,
          roughness: 0.12,
          metalness: 0.25,
          transparent: true,
          opacity: 0.72,
        });
        for (const sx of [-1, 1]) {
          const shopWin = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.5, 0.14), winMat);
          shopWin.position.set(cx + sx * 6.4, 1.95, bFrontZ - 0.04);
          cityGroup.add(shopWin);
        }

        // Glowing 3D Doorway Portal Frame + Floor Entry Beacon
        const portalRingMat = new THREE.MeshStandardMaterial({
          color: poiSpec.colorHex,
          emissive: poiSpec.colorHex,
          emissiveIntensity: 1.9,
          roughness: 0.2,
        });
        neonSignMaterials.push(portalRingMat);

        const doorBacking = new THREE.Mesh(
          new THREE.PlaneGeometry(2.4, 2.95),
          new THREE.MeshBasicMaterial({ color: 0x040711, side: THREE.DoubleSide })
        );
        doorBacking.position.set(doorX, 1.65, bFrontZ - 0.05);
        cityGroup.add(doorBacking);

        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.18, 0.24), portalRingMat);
        frameTop.position.set(doorX, 3.16, bFrontZ - 0.1);
        cityGroup.add(frameTop);
        for (const sx of [-1, 1]) {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.05, 0.24), portalRingMat);
          pillar.position.set(doorX + sx * 1.32, 1.65, bFrontZ - 0.1);
          cityGroup.add(pillar);
        }

        const entryPad = new THREE.Mesh(
          new THREE.CylinderGeometry(1.45, 1.55, 0.06, 24),
          new THREE.MeshStandardMaterial({
            color: poiSpec.colorHex,
            emissive: poiSpec.colorHex,
            emissiveIntensity: 1.5,
            transparent: true,
            opacity: 0.78,
          })
        );
        entryPad.position.set(doorX, 0.21, doorZ);
        cityGroup.add(entryPad);

        // Tall subtle skyward POI marker spire on roof corner
        const roofBeacon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 12, 10),
          new THREE.MeshBasicMaterial({
            color: poiSpec.colorHex,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
          })
        );
        roofBeacon.position.set(doorX, 0.18 + bh + 6.0, bFrontZ + 1.2);
        cityGroup.add(roofBeacon);

        // Optional Drive-up Garage Service Pad on road edge in front of Turbo Customs
        let driveBaySpot: THREE.Vector3 | undefined;
        if (poiSpec.kind === 'garage') {
          driveBaySpot = new THREE.Vector3(doorX, 0.04, zMin - 2.6);
          const bayPad = new THREE.Mesh(
            new THREE.RingGeometry(2.1, 2.55, 28),
            new THREE.MeshBasicMaterial({
              color: 0xf59e0b,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.85,
            })
          );
          bayPad.rotation.x = -Math.PI / 2;
          bayPad.position.set(driveBaySpot.x, 0.03, driveBaySpot.z);
          cityGroup.add(bayPad);
        }

        colliders.push({
          minX: cx - bw * 0.5 - 0.2,
          maxX: cx + bw * 0.5 + 0.2,
          minZ: bCenterZ - bd * 0.5 - 0.2,
          maxZ: bCenterZ + bd * 0.5 + 0.2,
          topY: 0.18 + bh,
          label: poiSpec.name,
        });

        pushStreetLight(cx - padWidth * 0.5 + 1.1, 0.18, zMin + 1.2, Math.PI);
        pushStreetLight(cx + padWidth * 0.5 - 1.1, 0.18, zMax - 1.2, 0);

        // Build Isolated Furnished 3D Interior Room for this Shop
        const roomIdx = shopPois.length;
        const roomCenter = new THREE.Vector3(520, 0, roomIdx * 64);
        const roomW = 16;
        const roomD = 15;
        const roomH = 4.6;
        const rx = roomCenter.x;
        const rz = roomCenter.z;

        const roomGroup = new THREE.Group();
        cityGroup.add(roomGroup);

        const floorColor =
          poiSpec.kind === 'bank'
            ? 0xe2e8f0
            : poiSpec.kind === 'garage'
              ? 0x1e293b
              : poiSpec.kind === 'clothing'
                ? 0x2d223b
                : 0x334155;
        const wallColor =
          poiSpec.kind === 'bank'
            ? 0xcbd5e1
            : poiSpec.kind === 'store'
              ? 0xe2e8f0
              : 0x1e2533;

        const floorMat = new THREE.MeshStandardMaterial({
          color: floorColor,
          roughness: poiSpec.kind === 'bank' ? 0.22 : 0.65,
          metalness: poiSpec.kind === 'bank' ? 0.15 : 0.08,
        });
        const wallMat = new THREE.MeshStandardMaterial({
          color: wallColor,
          roughness: 0.72,
          metalness: 0.08,
        });
        const counterMat = new THREE.MeshStandardMaterial({
          color: poiSpec.kind === 'bank' ? 0x475569 : 0x7c4d2b,
          roughness: 0.42,
          metalness: 0.2,
        });

        const roomFloor = new THREE.Mesh(new THREE.BoxGeometry(roomW, 0.2, roomD), floorMat);
        roomFloor.position.set(rx, -0.1, rz);
        roomFloor.receiveShadow = true;
        roomGroup.add(roomFloor);

        const roomCeil = new THREE.Mesh(
          new THREE.BoxGeometry(roomW, 0.2, roomD),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 })
        );
        roomCeil.position.set(rx, roomH + 0.1, rz);
        roomGroup.add(roomCeil);

        // Overhead glowing ceiling light panels
        const ceilLightMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: poiSpec.colorHex,
          emissiveIntensity: 1.5,
        });
        for (const lx of [-4, 4]) {
          for (const lz of [-3, 3]) {
            const strip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.1), ceilLightMat);
            strip.position.set(rx + lx, roomH - 0.04, rz + lz);
            roomGroup.add(strip);
          }
        }

        // 4 Perimeter Interior Walls
        const northWall = new THREE.Mesh(new THREE.BoxGeometry(roomW, roomH, 0.3), wallMat);
        northWall.position.set(rx, roomH * 0.5, rz - roomD * 0.5);
        roomGroup.add(northWall);

        const southWall = new THREE.Mesh(new THREE.BoxGeometry(roomW, roomH, 0.3), wallMat);
        southWall.position.set(rx, roomH * 0.5, rz + roomD * 0.5);
        roomGroup.add(southWall);

        const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, roomH, roomD), wallMat);
        westWall.position.set(rx - roomW * 0.5, roomH * 0.5, rz);
        roomGroup.add(westWall);

        const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, roomH, roomD), wallMat);
        eastWall.position.set(rx + roomW * 0.5, roomH * 0.5, rz);
        roomGroup.add(eastWall);

        // Interior Wall Sign
        const inSign = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.35), signMat);
        inSign.position.set(rx, 3.25, rz - roomD * 0.5 + 0.22);
        roomGroup.add(inSign);

        // Interior Counter Desk & Cash Register / Security Terminal
        const roomColliders: BoxCollider[] = [];
        const counterZ = rz - 2.8;
        const counterMesh = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.08, 1.2), counterMat);
        counterMesh.position.set(rx, 0.54, counterZ);
        roomGroup.add(counterMesh);
        roomColliders.push({
          minX: rx - 3.2,
          maxX: rx + 3.2,
          minZ: counterZ - 0.65,
          maxZ: counterZ + 0.65,
          topY: 1.1,
        });

        const register = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.42, 0.48),
          new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            emissive: 0x22c55e,
            emissiveIntensity: 0.4,
            roughness: 0.3,
          })
        );
        register.position.set(rx + 1.4, 1.29, counterZ);
        roomGroup.add(register);

        // Glowing Green EXIT Door Portal on South Interior Wall
        const exitDoorPos = new THREE.Vector3(rx, 0, rz + roomD * 0.5 - 0.85);
        const exitMat = new THREE.MeshStandardMaterial({
          color: 0x22c55e,
          emissive: 0x10b981,
          emissiveIntensity: 1.8,
        });
        const exitTop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 0.22), exitMat);
        exitTop.position.set(rx, 2.85, rz + roomD * 0.5 - 0.22);
        roomGroup.add(exitTop);
        for (const sx of [-1, 1]) {
          const ep = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.8, 0.22), exitMat);
          ep.position.set(rx + sx * 1.18, 1.4, rz + roomD * 0.5 - 0.22);
          roomGroup.add(ep);
        }
        const exitMatFloor = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.2, 0.05, 20),
          new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x10b981,
            emissiveIntensity: 1.2,
            transparent: true,
            opacity: 0.75,
          })
        );
        exitMatFloor.position.set(exitDoorPos.x, 0.03, exitDoorPos.z);
        roomGroup.add(exitMatFloor);

        // Shop-specific 3D Props & Guard Positions
        const guardSpawns: { x: number; z: number; yaw: number }[] = [];
        let weaponPickupSpots:
          | { kind: 'pistol' | 'smg' | 'rifle'; x: number; z: number; prop: THREE.Group }[]
          | undefined;

        if (poiSpec.kind === 'weapon') {
          weaponPickupSpots = [];
          const rackKinds: ('pistol' | 'smg' | 'rifle')[] = ['pistol', 'smg', 'rifle'];
          rackKinds.forEach((wk, wi) => {
            const px = rx - 1.7 + wi * 1.3;
            const pz = counterZ - 0.1;
            const pad = new THREE.Mesh(
              new THREE.BoxGeometry(0.85, 0.06, 0.55),
              new THREE.MeshStandardMaterial({
                color: 0xef4444,
                emissive: 0xef4444,
                emissiveIntensity: 0.75,
              })
            );
            pad.position.set(px, 1.11, pz);
            roomGroup.add(pad);

            const gunProp = buildWeaponMesh(wk).group;
            gunProp.position.set(px, 1.26, pz);
            gunProp.rotation.y = Math.PI * 0.5;
            gunProp.scale.setScalar(1.35);
            roomGroup.add(gunProp);
            weaponPickupSpots!.push({ kind: wk, x: px, z: counterZ + 1.3, prop: gunProp });
          });

          // Side wall rifle display racks
          for (const sx of [-1, 1]) {
            const wallRack = new THREE.Mesh(
              new THREE.BoxGeometry(0.45, 2.2, 5.2),
              new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
            );
            wallRack.position.set(rx + sx * 7.45, 1.4, rz - 1.0);
            roomGroup.add(wallRack);
            for (let ri = 0; ri < 3; ri++) {
              const decorGun = buildWeaponMesh(ri === 0 ? 'rifle' : 'smg').group;
              decorGun.position.set(rx + sx * 7.1, 1.15 + ri * 0.55, rz - 1.0);
              decorGun.scale.setScalar(1.4);
              roomGroup.add(decorGun);
            }
          }
          guardSpawns.push({ x: rx - 4.4, z: rz - 0.8, yaw: 0.35 });
          guardSpawns.push({ x: rx + 4.4, z: rz - 2.6, yaw: -0.45 });
        } else if (poiSpec.kind === 'clothing') {
          const rackColors = [0xec4899, 0x38bdf8, 0xf59e0b, 0x10b981, 0xa855f7, 0xef4444];
          for (const sx of [-1, 1]) {
            const bar = new THREE.Mesh(
              new THREE.CylinderGeometry(0.04, 0.04, 5.8, 8),
              new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 })
            );
            bar.rotation.x = Math.PI / 2;
            bar.position.set(rx + sx * 5.6, 1.72, rz - 0.4);
            roomGroup.add(bar);
            for (let c = 0; c < 6; c++) {
              const shirt = new THREE.Mesh(
                new THREE.BoxGeometry(0.38, 0.72, 0.16),
                new THREE.MeshStandardMaterial({ color: rackColors[(c + (sx > 0 ? 3 : 0)) % rackColors.length] })
              );
              shirt.position.set(rx + sx * 5.6, 1.32, rz - 2.5 + c * 0.84);
              roomGroup.add(shirt);
            }
            roomColliders.push({
              minX: rx + sx * 5.6 - 0.45,
              maxX: rx + sx * 5.6 + 0.45,
              minZ: rz - 3.3,
              maxZ: rz + 2.5,
              topY: 1.8,
            });
          }
          const mirror = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 2.6, 0.1),
            new THREE.MeshStandardMaterial({ color: 0xbfe7ff, metalness: 0.95, roughness: 0.05 })
          );
          mirror.position.set(rx - 4.6, 1.35, rz - roomD * 0.5 + 0.32);
          roomGroup.add(mirror);
          guardSpawns.push({ x: rx + 3.8, z: rz - 1.2, yaw: -0.35 });
        } else if (poiSpec.kind === 'garage') {
          // Mechanic Tool Chests, Tire Stacks & Hydraulic Bay
          for (const sx of [-1, 1]) {
            const toolChest = new THREE.Mesh(
              new THREE.BoxGeometry(1.4, 1.35, 2.8),
              new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.45 })
            );
            toolChest.position.set(rx + sx * 6.5, 0.68, rz - 1.8);
            roomGroup.add(toolChest);
            roomColliders.push({
              minX: rx + sx * 6.5 - 0.8,
              maxX: rx + sx * 6.5 + 0.8,
              minZ: rz - 3.3,
              maxZ: rz - 0.3,
              topY: 1.4,
            });
          }
          for (let t = 0; t < 4; t++) {
            const tire = new THREE.Mesh(
              new THREE.TorusGeometry(0.32, 0.13, 10, 20),
              new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.88 })
            );
            tire.rotation.x = Math.PI / 2;
            tire.position.set(rx - 5.8, 0.14 + t * 0.25, rz + 2.5);
            roomGroup.add(tire);
          }
          guardSpawns.push({ x: rx + 4.2, z: rz - 0.5, yaw: -0.4 });
        } else if (poiSpec.kind === 'store') {
          // 24/7 Convenience Store Aisles & Drink Coolers
          const snackPalette = [0xf59e0b, 0xef4444, 0x38bdf8, 0x22c55e, 0xa855f7];
          for (const ax of [-4.4, 4.4]) {
            const shelf = new THREE.Mesh(
              new THREE.BoxGeometry(1.1, 1.85, 4.8),
              new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 })
            );
            shelf.position.set(rx + ax, 0.92, rz + 0.8);
            roomGroup.add(shelf);
            roomColliders.push({
              minX: rx + ax - 0.6,
              maxX: rx + ax + 0.6,
              minZ: rz - 1.7,
              maxZ: rz + 3.3,
              topY: 1.9,
            });
            for (let b = 0; b < 5; b++) {
              const box = new THREE.Mesh(
                new THREE.BoxGeometry(1.22, 0.28, 0.55),
                new THREE.MeshStandardMaterial({ color: snackPalette[b % snackPalette.length] })
              );
              box.position.set(rx + ax, 1.55, rz - 1.0 + b * 0.9);
              roomGroup.add(box);
            }
          }
          guardSpawns.push({ x: rx - 2.2, z: rz - 1.2, yaw: 0.25 });
        } else if (poiSpec.kind === 'bank') {
          // Armored Teller Counter Glass & Back Wall Bank Vault Door
          const bulletGlass = new THREE.Mesh(
            new THREE.BoxGeometry(6.2, 1.2, 0.08),
            new THREE.MeshPhysicalMaterial({
              color: 0xbae6fd,
              transparent: true,
              opacity: 0.45,
              roughness: 0.08,
            })
          );
          bulletGlass.position.set(rx, 1.68, counterZ);
          roomGroup.add(bulletGlass);

          const vaultDoor = new THREE.Mesh(
            new THREE.CylinderGeometry(1.65, 1.65, 0.35, 24),
            new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.92, roughness: 0.22 })
          );
          vaultDoor.rotation.x = Math.PI / 2;
          vaultDoor.position.set(rx, 1.85, rz - roomD * 0.5 + 0.24);
          roomGroup.add(vaultDoor);

          const vaultWheel = new THREE.Mesh(
            new THREE.TorusGeometry(0.46, 0.07, 8, 20),
            new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 })
          );
          vaultWheel.position.set(rx, 1.85, rz - roomD * 0.5 + 0.44);
          roomGroup.add(vaultWheel);

          for (const gx of [-5.8, 5.8]) {
            const pillar = new THREE.Mesh(
              new THREE.CylinderGeometry(0.45, 0.5, roomH, 16),
              new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 })
            );
            pillar.position.set(rx + gx, roomH * 0.5, rz + 1.2);
            roomGroup.add(pillar);
            roomColliders.push({
              minX: rx + gx - 0.55,
              maxX: rx + gx + 0.55,
              minZ: rz + 0.65,
              maxZ: rz + 1.75,
              topY: roomH,
            });
          }
          guardSpawns.push({ x: rx - 3.6, z: rz - 0.8, yaw: 0.35 });
          guardSpawns.push({ x: rx + 3.6, z: rz - 0.8, yaw: -0.35 });
        }

        shopPois.push({
          info: {
            id: `poi_${poiSpec.kind}`,
            kind: poiSpec.kind,
            name: poiSpec.name,
            shortLabel: poiSpec.shortLabel,
            color: poiSpec.colorCss,
            district: poiSpec.district,
            x: cx,
            z: bCenterZ,
            doorX,
            doorZ,
          },
          roomCenter,
          roomBounds: {
            minX: rx - roomW * 0.5 + 0.6,
            maxX: rx + roomW * 0.5 - 0.6,
            minZ: rz - roomD * 0.5 + 0.6,
            maxZ: rz + roomD * 0.5 - 0.6,
          },
          roomColliders,
          spawnInside: new THREE.Vector3(rx, 0, rz + 3.4),
          exitDoor: exitDoorPos,
          outsideReturn: new THREE.Vector3(doorX, 0.18, zMin + 1.3),
          counterSpot: new THREE.Vector3(rx, 0, counterZ + 1.35),
          driveBaySpot,
          guardSpawns,
          weaponPickupSpots,
          robbedUntil: -10,
          portalRingMat,
        });
        continue;
      }

      if (isCentralPlaza) {
        const landmarkGroup = new THREE.Group();
        landmarkGroup.position.set(0, 0.18, -4.5);
        cityGroup.add(landmarkGroup);

        colliders.push({
          minX: -8.5,
          maxX: 8.5,
          minZ: -10.5,
          maxZ: 2.2,
          topY: 16,
          label: 'Central Plaza Landmark',
        });

        dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/gltf/');
        dracoLoader.preload();

        const gltfLoader = new GLTFLoader();
        gltfLoader.setCrossOrigin('anonymous');
        gltfLoader.setDRACOLoader(dracoLoader);

        gltfLoader.load(
          LANDMARK_GLB_URL,
          (gltf) => {
            if (landmarkDisposed) {
              dracoLoader?.dispose();
              return;
            }
            const model = gltf.scene;
            model.updateMatrixWorld(true);

            const rawBox = new THREE.Box3().setFromObject(model);
            const rawSize = rawBox.getSize(new THREE.Vector3());
            const horizSpan = Math.max(rawSize.x, rawSize.z);
            const scaleFactor = horizSpan > 0.01 ? 17.5 / horizSpan : 0.025;
            model.scale.setScalar(scaleFactor);
            model.updateMatrixWorld(true);

            const normBox = new THREE.Box3().setFromObject(model);
            const normCenter = normBox.getCenter(new THREE.Vector3());
            model.position.set(-normCenter.x, -normBox.min.y, -normCenter.z);
            model.updateMatrixWorld(true);

            model.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = !isSoftwareGl;
                mesh.receiveShadow = true;

                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const mat of mats) {
                  if (mat instanceof THREE.MeshStandardMaterial) {
                    if (mat.map) {
                      mat.map.colorSpace = THREE.SRGBColorSpace;
                      mat.map.anisotropy = anisotropy;
                      mat.map.needsUpdate = true;
                    }
                    if (mat.emissiveMap) {
                      mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                      mat.emissiveMap.anisotropy = anisotropy;
                      mat.emissiveMap.needsUpdate = true;
                    }
                    mat.envMapIntensity = 1.1;
                  }
                }
              }
            });

            landmarkRoot = model;
            landmarkGroup.add(model);

            const animClips = gltf.animations ?? [];
            if (animClips.length > 0) {
              landmarkMixer = new THREE.AnimationMixer(model);
              const clip = THREE.AnimationClip.findByName(animClips, 'Take 001') ?? animClips[0];
              landmarkMixer.clipAction(clip).play();
            }
            dracoLoader?.dispose();
          },
          undefined,
          (err) => {
            console.warn('[CityBuilder] Failed to load LittlestTokyo landmark GLB:', err);
            dracoLoader?.dispose();
          }
        );

        const plinth = new THREE.Mesh(
          new THREE.CylinderGeometry(3.3, 3.6, 0.14, 28),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.65 })
        );
        plinth.position.set(0, 0.25, -16.5);
        plinth.receiveShadow = true;
        cityGroup.add(plinth);

        const plinthRing = new THREE.Mesh(
          new THREE.TorusGeometry(3.42, 0.05, 8, 36),
          new THREE.MeshStandardMaterial({
            color: 0xe879f9,
            emissive: 0xd946ef,
            emissiveIntensity: 1.6,
          })
        );
        plinthRing.rotation.x = Math.PI / 2;
        plinthRing.position.set(0, 0.32, -16.5);
        cityGroup.add(plinthRing);
        neonSignMaterials.push(plinthRing.material as THREE.MeshStandardMaterial);

        for (const [tx, tz] of [
          [-13, -17],
          [13, -17],
          [-13, 1],
          [13, 1],
        ]) {
          pushPalmInstance(tx, 0.18, tz, 1.12, tx * 0.4);
          colliders.push({ minX: tx - 0.5, maxX: tx + 0.5, minZ: tz - 0.5, maxZ: tz + 0.5, topY: 5.5 });
        }

        pushStreetLight(-15.5, 0.18, -19.5, Math.PI);
        pushStreetLight(15.5, 0.18, -19.5, Math.PI);
      } else if (isIndustrial) {
        // Industrial District: Large Steel Warehouses + Silos
        const bw = 24;
        const bd = padDepth - 8;
        const bh = 9.5 + (styleCursor % 3) * 2.5;
        const idx = styleCursor % industrialMatrices.length;
        styleCursor++;

        pushMatrix(industrialMatrices[idx], cx - 2.5, 0.18 + bh * 0.5, padZ, bw, bh, bd);
        pushMatrix(roofUnitMatrices, cx - 2.5, 0.18 + bh + 0.7, padZ, bw * 0.48, 1.4, bd * 0.42);
        // Tall Industrial Storage Silo beside warehouse
        pushMatrix(siloMatrices, cx + 12.2, 0.18 + 7.2, padZ - bd * 0.22, 3.0, 14.4, 3.0);

        colliders.push({
          minX: cx - 2.5 - bw * 0.5 - 0.25,
          maxX: cx - 2.5 + bw * 0.5 + 0.25,
          minZ: padZ - bd * 0.5 - 0.25,
          maxZ: padZ + bd * 0.5 + 0.25,
          topY: 0.18 + bh,
        });
        colliders.push({
          minX: cx + 9.0,
          maxX: cx + 15.4,
          minZ: padZ - bd * 0.22 - 3.2,
          maxZ: padZ - bd * 0.22 + 3.2,
          topY: 14.6,
        });

        pushStreetLight(cx - padWidth * 0.5 + 1.1, 0.18, zMin + 1.2, Math.PI);
        pushStreetLight(cx + padWidth * 0.5 - 1.1, 0.18, zMax - 1.2, 0);
      } else if (isSuburban) {
        // Suburban District: Detached 2-3 story houses with yards & leafy trees
        const housePositions: [number, number, number, number][] = [
          [cx - 8.2, padZ - 5.2, 11.0, 9.6],
          [cx + 8.2, padZ + 5.2, 11.0, 9.6],
        ];
        for (const [hx, hz, hw, hd] of housePositions) {
          const hh = 6.2 + (styleCursor % 3) * 1.4;
          const idx = styleCursor % suburbMatrices.length;
          styleCursor++;

          pushMatrix(suburbMatrices[idx], hx, 0.18 + hh * 0.5, hz, hw, hh, hd);
          pushMatrix(suburbRoofMatrices, hx, 0.18 + hh + 1.2, hz, hw * 0.76, 2.4, hd * 0.76, 0, Math.PI * 0.25, 0);

          colliders.push({
            minX: hx - hw * 0.5 - 0.25,
            maxX: hx + hw * 0.5 + 0.25,
            minZ: hz - hd * 0.5 - 0.25,
            maxZ: hz + hd * 0.5 + 0.25,
            topY: 0.18 + hh,
          });
        }
        pushStreetTreeInstance(cx + 8.2, 0.18, padZ - 6.0, 1.05);
        pushStreetTreeInstance(cx - 8.2, 0.18, padZ + 6.0, 0.96);
        pushStreetLight(cx - padWidth * 0.5 + 1.1, 0.18, zMin + 1.2, Math.PI);
      } else {
        // Downtown & Midtown Skyscrapers / Brick Apartments
        const bPositions: [number, number, number, number][] = [
          [cx - 7.5, padZ, 11.8, padDepth - 7.5],
          [cx + 7.5, padZ, 11.8, padDepth - 7.5],
        ];

        for (const [bx, bz, bw, bd] of bPositions) {
          const signInfo = storefrontNames[styleCursor % storefrontNames.length];
          const isGlassSkyscraper = (bzIdx <= 2 && styleCursor % 3 !== 2) || styleCursor % 2 === 0;
          styleCursor++;

          let floors: number;
          if (isGlassSkyscraper) {
            const gIdx = styleCursor % glassMatrices.length;
            floors = (bzIdx <= 2 ? 10 : 7) + ((styleCursor * 5 + bxIdx * 3 + bzIdx * 2) % 6);
            const bh = floors * 3.5;
            pushMatrix(glassMatrices[gIdx], bx, 0.18 + bh * 0.5, bz, bw, bh, bd);
            if (floors >= 9) {
              const crownH = 5.5;
              pushMatrix(glassMatrices[gIdx], bx, 0.18 + bh + crownH * 0.5, bz, bw * 0.72, crownH, bd * 0.72);
            }
            pushMatrix(roofUnitMatrices, bx, 0.18 + bh + (floors >= 9 ? 6.2 : 0.7), bz, bw * 0.42, 1.4, bd * 0.4);
            colliders.push({
              minX: bx - bw * 0.5 - 0.25,
              maxX: bx + bw * 0.5 + 0.25,
              minZ: bz - bd * 0.5 - 0.25,
              maxZ: bz + bd * 0.5 + 0.25,
              topY: 0.18 + bh,
            });
          } else {
            const brIdx = styleCursor % brickMatrices.length;
            floors = 5 + ((styleCursor * 3 + bxIdx * 2 + bzIdx) % 4);
            const bh = floors * 3.5;
            pushMatrix(brickMatrices[brIdx], bx, 0.18 + bh * 0.5, bz, bw, bh, bd);
            pushMatrix(roofUnitMatrices, bx, 0.18 + bh + 0.7, bz, bw * 0.42, 1.4, bd * 0.4);
            colliders.push({
              minX: bx - bw * 0.5 - 0.25,
              maxX: bx + bw * 0.5 + 0.25,
              minZ: bz - bd * 0.5 - 0.25,
              maxZ: bz + bd * 0.5 + 0.25,
              topY: 0.18 + bh,
            });
          }

          // Ground-floor glass storefront wrap & awning
          pushMatrix(storefrontMatrices, bx, 0.18 + 1.6, bz, bw + 0.18, 3.2, bd + 0.18);
          pushMatrix(awningMatrices, bx, 3.48, bz, bw + 0.95, 0.3, bd + 0.95);

          if (bzIdx === 0 && Math.abs(cx) <= 100) {
            const signTex = createStorefrontSignTexture(
              anisotropy,
              signInfo.title,
              signInfo.bg,
              signInfo.accent
            );
            const signMat = new THREE.MeshStandardMaterial({
              map: signTex,
              emissiveMap: signTex,
              emissive: new THREE.Color(0xffffff),
              emissiveIntensity: 0.75,
              roughness: 0.3,
            });
            neonSignMaterials.push(signMat);

            const signBoard = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.78, 1.05, 0.16), signMat);
            signBoard.position.set(bx, 4.18, bz - bd * 0.5 - 0.12);
            cityGroup.add(signBoard);
          }
        }

        pushStreetLight(cx - padWidth * 0.5 + 1.1, 0.18, zMin + 1.2, Math.PI);
        pushStreetLight(cx + padWidth * 0.5 - 1.1, 0.18, zMax - 1.2, 0);

        if ((bxIdx + bzIdx) % 2 === 0) {
          pushPalmInstance(cx + padWidth * 0.5 - 1.6, 0.18, zMin + 2.4, 0.96 + (styleCursor % 3) * 0.08, bxIdx * 0.5);
        } else {
          pushStreetTreeInstance(cx + padWidth * 0.5 - 1.6, 0.18, zMin + 2.4, 0.96 + (styleCursor % 3) * 0.08);
        }
      }
    }
  }

  // Commit InstancedMesh Batches (single draw call per geometry+material pair)
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCone = new THREE.ConeGeometry(0.72, 1, 4);
  const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);

  addInstancedBatch(cityGroup, unitBox, sidewalkMat, sidewalkMatrices, false, true);

  for (let i = 0; i < glassMaterials.length; i++) {
    addInstancedBatch(cityGroup, unitBox, glassMaterials[i], glassMatrices[i], !isSoftwareGl, true);
  }
  for (let i = 0; i < brickMaterials.length; i++) {
    addInstancedBatch(cityGroup, unitBox, brickMaterials[i], brickMatrices[i], !isSoftwareGl, true);
  }
  for (let i = 0; i < suburbanMaterials.length; i++) {
    addInstancedBatch(cityGroup, unitBox, suburbanMaterials[i], suburbMatrices[i], !isSoftwareGl, true);
  }
  addInstancedBatch(cityGroup, unitCone, suburbRoofMat, suburbRoofMatrices, false, true);

  for (let i = 0; i < industrialMaterials.length; i++) {
    addInstancedBatch(cityGroup, unitBox, industrialMaterials[i], industrialMatrices[i], !isSoftwareGl, true);
  }
  addInstancedBatch(cityGroup, unitCyl, siloMat, siloMatrices, false, true);
  addInstancedBatch(cityGroup, unitBox, sfMat, storefrontMatrices, false, true);
  addInstancedBatch(cityGroup, unitBox, awningMat, awningMatrices, false, false);
  addInstancedBatch(cityGroup, unitBox, roofUnitMat, roofUnitMatrices, false, false);

  // Instanced Streetlights (5 batches, shadows disabled for distant props)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.38, metalness: 0.82 });
  addInstancedBatch(cityGroup, new THREE.CylinderGeometry(0.16, 0.24, 0.6, 8), poleMat, lampBaseMatrices, false, false);
  addInstancedBatch(cityGroup, new THREE.CylinderGeometry(0.075, 0.12, 5.8, 8), poleMat, lampShaftMatrices, false, false);
  addInstancedBatch(cityGroup, new THREE.BoxGeometry(0.09, 0.09, 1.55), poleMat, lampArmMatrices, false, false);
  addInstancedBatch(cityGroup, new THREE.BoxGeometry(0.36, 0.08, 0.62), poleMat, lampHoodMatrices, false, false);
  addInstancedBatch(cityGroup, new THREE.BoxGeometry(0.28, 0.04, 0.46), lampEmitterMaterial, lampLensMatrices, false, false);

  // Instanced Palm Trees & Street Trees (shadows disabled for distant props)
  const treeCurbMat = new THREE.MeshStandardMaterial({ color: 0x7a8088, roughness: 0.88 });
  const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5344, roughness: 0.9, metalness: 0.02 });
  const palmFrondMat = new THREE.MeshStandardMaterial({
    color: 0x2f7d44,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const streetLeafMat = new THREE.MeshStandardMaterial({ color: 0x3f7541, roughness: 0.8, metalness: 0.02 });

  addInstancedBatch(cityGroup, new THREE.CylinderGeometry(0.85, 0.92, 0.16, 10), treeCurbMat, palmCurbMatrices, false, true);
  addInstancedBatch(cityGroup, new THREE.CylinderGeometry(0.11, 0.22, 5.4, 8), palmTrunkMat, palmTrunkMatrices, false, true);
  addInstancedBatch(cityGroup, new THREE.BoxGeometry(0.42, 0.03, 2.25), palmFrondMat, palmFrondMatrices, false, false);

  addInstancedBatch(cityGroup, new THREE.BoxGeometry(1.4, 0.14, 1.4), treeCurbMat, streetCurbMatrices, false, true);
  addInstancedBatch(cityGroup, new THREE.CylinderGeometry(0.11, 0.19, 2.3, 8), palmTrunkMat, streetTrunkMatrices, false, true);
  addInstancedBatch(cityGroup, new THREE.DodecahedronGeometry(1, 1), streetLeafMat, streetCanopyMatrices, false, true);

  // 4. Outer District Boundary Curbs
  const boundaryMat = new THREE.MeshStandardMaterial({
    map: curbPbr.map,
    roughnessMap: curbPbr.roughnessMap,
    bumpMap: curbPbr.bumpMap,
    bumpScale: 0.02,
    roughness: 1.0,
  });
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 370), boundaryMat);
  eastWall.position.set(258, 0.6, 118);
  cityGroup.add(eastWall);
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 370), boundaryMat);
  westWall.position.set(-258, 0.6, 118);
  cityGroup.add(westWall);
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(518, 1.2, 1.5), boundaryMat);
  northWall.position.set(0, 0.6, 302);
  cityGroup.add(northWall);

  // 5. Traffic Loops (Expanded across Downtown, Waterfront, Suburbs, Express Highway & Industrial Belt)
  const trafficLoops: THREE.Vector3[][] = [
    [
      new THREE.Vector3(-68.5, 0, -31.5),
      new THREE.Vector3(68.5, 0, -31.5),
      new THREE.Vector3(68.5, 0, 57.5),
      new THREE.Vector3(-68.5, 0, 57.5),
    ],
    [
      new THREE.Vector3(-27.5, 0, 8.5),
      new THREE.Vector3(27.5, 0, 8.5),
      new THREE.Vector3(27.5, 0, -24.5),
      new THREE.Vector3(-27.5, 0, -24.5),
    ],
    [
      new THREE.Vector3(20.5, 0, 15.5),
      new THREE.Vector3(75.5, 0, 15.5),
      new THREE.Vector3(75.5, 0, 50.5),
      new THREE.Vector3(20.5, 0, 50.5),
    ],
    [
      new THREE.Vector3(-212.5, 0, -31.5),
      new THREE.Vector3(212.5, 0, -31.5),
      new THREE.Vector3(212.5, 0, 149.5),
      new THREE.Vector3(-212.5, 0, 149.5),
    ],
    [
      new THREE.Vector3(-164.5, 0, 101.5),
      new THREE.Vector3(164.5, 0, 101.5),
      new THREE.Vector3(164.5, 0, 253.5),
      new THREE.Vector3(-164.5, 0, 253.5),
    ],
    [
      new THREE.Vector3(-123.5, 0, 15.5),
      new THREE.Vector3(-68.5, 0, 15.5),
      new THREE.Vector3(-68.5, 0, 94.5),
      new THREE.Vector3(-123.5, 0, 94.5),
    ],
    [
      new THREE.Vector3(-20.5, 0, 8.5),
      new THREE.Vector3(164.5, 0, 8.5),
      new THREE.Vector3(164.5, 0, 15.5),
      new THREE.Vector3(-20.5, 0, 15.5),
    ],
  ];

  // 6. Sidewalk Pedestrian Loops spanning Waterfront, Downtown, Suburbs & Industrial
  const pedestrianLoops: THREE.Vector3[][] = [
    [
      new THREE.Vector3(-85, 0.2, -39),
      new THREE.Vector3(85, 0.2, -39),
      new THREE.Vector3(85, 0.2, -47),
      new THREE.Vector3(-85, 0.2, -47),
    ],
    [
      new THREE.Vector3(-15, 0.18, -19.2),
      new THREE.Vector3(15, 0.18, -19.2),
      new THREE.Vector3(15, 0.18, 3.8),
      new THREE.Vector3(-15, 0.18, 3.8),
    ],
    [
      new THREE.Vector3(-63.5, 0.18, -19.5),
      new THREE.Vector3(-32.5, 0.18, -19.5),
      new THREE.Vector3(-32.5, 0.18, 3.5),
      new THREE.Vector3(-63.5, 0.18, 3.5),
    ],
    [
      new THREE.Vector3(32.5, 0.18, -19.5),
      new THREE.Vector3(63.5, 0.18, -19.5),
      new THREE.Vector3(63.5, 0.18, 3.5),
      new THREE.Vector3(32.5, 0.18, 3.5),
    ],
    [
      new THREE.Vector3(-15.5, 0.18, 20.5),
      new THREE.Vector3(15.5, 0.18, 20.5),
      new THREE.Vector3(15.5, 0.18, 45.5),
      new THREE.Vector3(-15.5, 0.18, 45.5),
    ],
    [
      new THREE.Vector3(-3.2, 0.2, -52),
      new THREE.Vector3(3.2, 0.2, -52),
      new THREE.Vector3(3.2, 0.2, -67),
      new THREE.Vector3(-3.2, 0.2, -67),
    ],
    [
      new THREE.Vector3(-159.5, 0.18, 20.5),
      new THREE.Vector3(-128.5, 0.18, 20.5),
      new THREE.Vector3(-128.5, 0.18, 45.5),
      new THREE.Vector3(-159.5, 0.18, 45.5),
    ],
    [
      new THREE.Vector3(128.5, 0.18, 20.5),
      new THREE.Vector3(159.5, 0.18, 20.5),
      new THREE.Vector3(159.5, 0.18, 45.5),
      new THREE.Vector3(128.5, 0.18, 45.5),
    ],
    [
      new THREE.Vector3(-63.5, 0.18, 62.5),
      new THREE.Vector3(-32.5, 0.18, 62.5),
      new THREE.Vector3(-32.5, 0.18, 89.5),
      new THREE.Vector3(-63.5, 0.18, 89.5),
    ],
    [
      new THREE.Vector3(32.5, 0.18, 62.5),
      new THREE.Vector3(63.5, 0.18, 62.5),
      new THREE.Vector3(63.5, 0.18, 89.5),
      new THREE.Vector3(32.5, 0.18, 89.5),
    ],
    [
      new THREE.Vector3(-15.5, 0.18, 106.5),
      new THREE.Vector3(15.5, 0.18, 106.5),
      new THREE.Vector3(15.5, 0.18, 137.5),
      new THREE.Vector3(-15.5, 0.18, 137.5),
    ],
    [
      new THREE.Vector3(-15.5, 0.18, 206.5),
      new THREE.Vector3(15.5, 0.18, 206.5),
      new THREE.Vector3(15.5, 0.18, 241.5),
      new THREE.Vector3(-15.5, 0.18, 241.5),
    ],
    [
      new THREE.Vector3(-220, 0.2, -39),
      new THREE.Vector3(-95, 0.2, -39),
      new THREE.Vector3(-95, 0.2, -47),
      new THREE.Vector3(-220, 0.2, -47),
    ],
    [
      new THREE.Vector3(95, 0.2, -39),
      new THREE.Vector3(220, 0.2, -39),
      new THREE.Vector3(220, 0.2, -47),
      new THREE.Vector3(95, 0.2, -47),
    ],
  ];

  return {
    cityGroup,
    colliders,
    sidewalks,
    trafficLoops,
    pedestrianLoops,
    intersections,
    ewRoads: ewZ,
    nsRoads: nsX,
    shopPois,
    ewSignalMats,
    nsSignalMats,
    buildingMaterials,
    lampEmitterMaterial,
    neonSignMaterials,
    waterMesh,
    yachtMesh,
    bounds: { minX: -256, maxX: 256, minZ: -68, maxZ: 300 },
    updateLandmark: (dt: number) => {
      if (landmarkMixer) {
        landmarkMixer.update(dt);
      }
    },
    disposeLandmark: () => {
      landmarkDisposed = true;
      if (landmarkMixer) {
        landmarkMixer.stopAllAction();
        if (landmarkRoot) {
          landmarkMixer.uncacheRoot(landmarkRoot);
        }
        landmarkMixer = null;
      }
      dracoLoader?.dispose();
    },
  };
}
