import * as THREE from 'three';
import { VehicleKind } from './types';
import { createDashboardTexture, createHumanFaceTexture, createPoliceDoorTexture } from './textures';
import { attachCarConceptToRig } from './carGltf';

export interface HumanRig {
  group: THREE.Group;
  bodyRoot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  headGroup: THREE.Group;
}

export interface PoliceOfficerRig extends HumanRig {
  pistolGroup: THREE.Group;
  muzzleFlashMesh: THREE.Mesh;
  muzzleFlashMat: THREE.MeshBasicMaterial;
}

export interface VehicleRig {
  group: THREE.Group;
  chassisGroup: THREE.Group;
  doorPivot: THREE.Group | null;
  steeringWheelPivot: THREE.Group | null;
  wheelSteerPivots: [THREE.Group, THREE.Group];
  wheelSpinMeshes: THREE.Group[];
  windowMeshes: THREE.Mesh[];
  tirePopped: [boolean, boolean, boolean, boolean];
  tailLightMat: THREE.MeshStandardMaterial;
  headLightMat: THREE.MeshStandardMaterial;
  policeLightRedMat?: THREE.MeshStandardMaterial;
  policeLightBlueMat?: THREE.MeshStandardMaterial;
  occupantGroup: THREE.Group;
  kickstandGroup: THREE.Group | null;
  cockpitEyeLocal: THREE.Vector3;
  seatLocal: THREE.Vector3;
  length: number;
  width: number;
  height: number;
}

let sharedDashTex: THREE.CanvasTexture | null = null;
let sharedPoliceDoorTex: THREE.CanvasTexture | null = null;

function getDashTexture(anisotropy: number): THREE.CanvasTexture {
  if (!sharedDashTex) {
    sharedDashTex = createDashboardTexture(anisotropy);
  }
  return sharedDashTex;
}

function getPoliceDoorTexture(anisotropy: number): THREE.CanvasTexture {
  if (!sharedPoliceDoorTex) {
    sharedPoliceDoorTex = createPoliceDoorTexture(anisotropy);
  }
  return sharedPoliceDoorTex;
}

let sharedHeadGeo: THREE.BufferGeometry | null = null;
let sharedTorsoGeo: THREE.BufferGeometry | null = null;

function getSculptedHeadGeometry(): THREE.BufferGeometry {
  if (sharedHeadGeo) return sharedHeadGeo;
  const geo = new THREE.SphereGeometry(0.112, 28, 22, -Math.PI * 2 * 0.25, Math.PI * 2);
  // Sculpt sphere vertices into anatomical human cranium, cheekbones & tapered jaw/chin
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Tall human head proportion
    y *= 1.22;
    // Cranium depth
    z *= 1.06;
    // Slight temple narrowing
    x *= 0.92;

    if (y < 0) {
      // Taper jaw/chin cleanly downward
      const jawT = Math.min(1, -y / 0.136);
      x *= 1.0 - jawT * 0.34;
      if (z > 0) {
        // Gentle chin projection forward
        z *= 1.0 - jawT * 0.16;
        if (jawT > 0.35 && jawT < 0.88) {
          z += 0.008 * Math.sin(((jawT - 0.35) / 0.53) * Math.PI);
        }
      } else {
        // Tuck back of jaw under skull
        z *= 1.0 - jawT * 0.28;
      }
    } else if (z > 0.02) {
      // Flatten forehead subtly for natural face plane
      const faceT = Math.min(1, z / 0.11);
      z -= faceT * 0.007;
    }

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  sharedHeadGeo = geo;
  return geo;
}

function getSculptedTorsoGeometry(): THREE.BufferGeometry {
  if (sharedTorsoGeo) return sharedTorsoGeo;
  // Lathe profile from waist (y = 0) up to chest/shoulders (y = 0.54)
  const pts = [
    new THREE.Vector2(0.01, 0.0),
    new THREE.Vector2(0.142, 0.02),
    new THREE.Vector2(0.136, 0.14),
    new THREE.Vector2(0.154, 0.30),
    new THREE.Vector2(0.178, 0.44),
    new THREE.Vector2(0.162, 0.51),
    new THREE.Vector2(0.068, 0.55),
    new THREE.Vector2(0.01, 0.56),
  ];
  const geo = new THREE.LatheGeometry(pts, 20);
  // Broaden shoulder-to-shoulder width (X) & flatten chest-to-back depth (Z)
  geo.scale(1.16, 1.0, 0.68);
  geo.computeVertexNormals();
  sharedTorsoGeo = geo;
  return geo;
}

/**
 * Builds an articulated 3D human character grounded at y = 0 with sculpted anatomy
 * and a realistic procedural human face texture.
 */
export function buildHumanCharacter(options: {
  shirtColor: number;
  pantsColor: number;
  skinColor?: number;
  hairColor?: number;
  eyeColor?: string;
  lipColor?: string;
  facialHair?: 'none' | 'stubble' | 'beard';
  hairStyle?: 'short' | 'pompadour' | 'bob' | 'buzz';
  freckles?: boolean;
  anisotropy?: number;
  isPlayer?: boolean;
}): HumanRig {
  const {
    shirtColor,
    pantsColor,
    skinColor = 0xd8a484,
    hairColor = 0x221b17,
    eyeColor = '#3b281c',
    lipColor,
    facialHair = 'none',
    hairStyle = 'short',
    freckles = false,
    anisotropy = 4,
    isPlayer = false,
  } = options;

  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.62, metalness: 0.02 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.68, metalness: 0.06 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.82, metalness: 0.02 });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0xf8fafc : 0x1e293b,
    roughness: 0.48,
    metalness: 0.1,
  });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.65 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.78, metalness: 0.06 });

  const faceTex = createHumanFaceTexture({
    skinColor,
    hairColor,
    eyeColor,
    lipColor,
    facialHair,
    freckles,
    anisotropy,
  });
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    roughness: 0.56,
    metalness: 0.02,
  });

  // Sculpted Pelvis / Hips
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), pantsMat);
  pelvis.scale.set(1.08, 0.66, 0.72);
  pelvis.position.set(0, 0.88, 0);
  pelvis.castShadow = true;
  bodyRoot.add(pelvis);

  // Sculpted Torso (Lathe chest + waist + shoulders)
  const torso = new THREE.Mesh(getSculptedTorsoGeometry(), shirtMat);
  torso.position.set(0, 0.92, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyRoot.add(torso);

  // Rounded Shoulder Deltoids
  for (const side of [-1, 1]) {
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), shirtMat);
    deltoid.position.set(side * 0.215, 1.38, 0);
    deltoid.scale.set(1.0, 1.08, 0.92);
    deltoid.castShadow = true;
    bodyRoot.add(deltoid);
  }

  if (isPlayer) {
    const innerTee = new THREE.Mesh(
      new THREE.CylinderGeometry(0.078, 0.072, 0.42, 14),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.78 })
    );
    innerTee.scale.set(1.0, 1.0, 0.85);
    innerTee.position.set(0, 1.24, 0.056);
    bodyRoot.add(innerTee);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.088, 0.024, 10, 20),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 })
    );
    collar.rotation.x = Math.PI * 0.46;
    collar.position.set(0, 1.45, 0.01);
    bodyRoot.add(collar);
  }

  // Sculpted Human Head + Realistic Face Texture + 3D Nose, Ears & Hair
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.54, 0);
  bodyRoot.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.062, 0.12, 14), skinMat);
  neck.position.set(0, -0.02, -0.005);
  neck.castShadow = true;
  headGroup.add(neck);

  const cranium = new THREE.Mesh(getSculptedHeadGeometry(), faceMat);
  cranium.position.set(0, 0.13, 0);
  cranium.castShadow = true;
  cranium.receiveShadow = true;
  headGroup.add(cranium);

  // 3D Nose bridge & tip
  const noseBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.024, 4, 8), skinMat);
  noseBridge.position.set(0, 0.124, 0.109);
  noseBridge.rotation.x = -0.22;
  headGroup.add(noseBridge);

  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), skinMat);
  noseTip.scale.set(1.15, 0.85, 1.0);
  noseTip.position.set(0, 0.11, 0.115);
  headGroup.add(noseTip);

  // 3D Sculpted Ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), skinMat);
    ear.scale.set(0.55, 1.28, 0.85);
    ear.position.set(side * 0.102, 0.126, -0.006);
    ear.rotation.z = side * 0.12;
    headGroup.add(ear);
  }

  // 3D Sculpted Hairstyles
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.116, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat
  );
  hairCap.scale.set(0.95, 1.2, 1.08);
  hairCap.position.set(0, 0.136, -0.006);
  hairCap.rotation.x = -0.26;
  hairCap.castShadow = true;
  headGroup.add(hairCap);

  if (hairStyle === 'pompadour') {
    const wave = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.085, 6, 12), hairMat);
    wave.rotation.z = Math.PI * 0.5;
    wave.rotation.y = 0.14;
    wave.position.set(0, 0.252, 0.036);
    wave.castShadow = true;
    headGroup.add(wave);
  } else if (hairStyle === 'bob') {
    const backLocks = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.095, 8, 14), hairMat);
    backLocks.scale.set(1.12, 1.0, 0.78);
    backLocks.position.set(0, 0.105, -0.048);
    backLocks.castShadow = true;
    headGroup.add(backLocks);
  } else if (hairStyle === 'short') {
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 10), hairMat);
    fringe.scale.set(1.22, 0.45, 0.72);
    fringe.position.set(0, 0.236, 0.038);
    headGroup.add(fringe);
  }

  if (isPlayer) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.14, metalness: 0.85 });
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 10), frameMat);
      lens.scale.set(1.18, 0.78, 0.45);
      lens.position.set(side * 0.034, 0.138, 0.106);
      lens.rotation.y = side * 0.16;
      headGroup.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.032, 8), frameMat);
    bridge.rotation.z = Math.PI * 0.5;
    bridge.position.set(0, 0.142, 0.11);
    headGroup.add(bridge);
  }

  const makeArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.245, 1.38, 0);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.18, 6, 12), shirtMat);
    upper.position.set(0, -0.13, 0);
    upper.castShadow = true;
    pivot.add(upper);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.18, 6, 12), skinMat);
    forearm.position.set(0, -0.36, 0);
    forearm.castShadow = true;
    pivot.add(forearm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), skinMat);
    hand.scale.set(0.88, 1.12, 0.82);
    hand.position.set(0, -0.5, 0);
    pivot.add(hand);

    bodyRoot.add(pivot);
    return pivot;
  };

  const leftArmPivot = makeArm(-1);
  const rightArmPivot = makeArm(1);

  const makeLeg = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.095, 0.83, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.064, 0.27, 6, 12), pantsMat);
    thigh.position.set(0, -0.19, 0);
    thigh.castShadow = true;
    pivot.add(thigh);

    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.29, 6, 12), pantsMat);
    calf.position.set(0, -0.54, 0);
    calf.castShadow = true;
    pivot.add(calf);

    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.1, 6, 12), shoeMat);
    shoe.rotation.x = Math.PI * 0.5;
    shoe.scale.set(1.08, 1.0, 0.82);
    shoe.position.set(0, -0.76, 0.036);
    shoe.castShadow = true;
    pivot.add(shoe);

    const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.104, 4, 10), soleMat);
    sole.rotation.x = Math.PI * 0.5;
    sole.scale.set(1.08, 1.0, 0.35);
    sole.position.set(0, -0.79, 0.036);
    pivot.add(sole);

    bodyRoot.add(pivot);
    return pivot;
  };

  const leftLegPivot = makeLeg(-1);
  const rightLegPivot = makeLeg(1);

  return {
    group,
    bodyRoot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    headGroup,
  };
}

export function setHumanSeatedPose(rig: HumanRig, seated: boolean): void {
  if (seated) {
    rig.bodyRoot.position.set(0, -0.45, 0);
    rig.leftLegPivot.rotation.set(-1.35, 0, 0.08);
    rig.rightLegPivot.rotation.set(-1.35, 0, -0.08);
    rig.leftArmPivot.rotation.set(-1.05, 0, -0.15);
    rig.rightArmPivot.rotation.set(-1.05, 0, 0.15);
    rig.headGroup.rotation.set(0, 0, 0);
  } else {
    rig.bodyRoot.position.set(0, 0, 0);
    rig.leftLegPivot.rotation.set(0, 0, 0);
    rig.rightLegPivot.rotation.set(0, 0, 0);
    rig.leftArmPivot.rotation.set(0, 0, 0);
    rig.rightArmPivot.rotation.set(0, 0, 0);
    rig.headGroup.rotation.set(0, 0, 0);
  }
}

/**
 * Builds a uniformed Police Officer with peaked cap, badge, duty belt, handgun, and muzzle flash.
 */
export function buildUniformedPoliceOfficer(
  anisotropy: number,
  isSoftwareGl = false,
  hasHandgun = true
): PoliceOfficerRig {
  const rig = buildHumanCharacter({
    shirtColor: 0x132247,
    pantsColor: 0x0b132b,
    skinColor: 0xd49b7a,
    hairColor: 0x1e1612,
    eyeColor: '#25395c',
    facialHair: 'stubble',
    hairStyle: 'buzz',
    anisotropy,
  });

  if (isSoftwareGl) {
    rig.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).castShadow = false;
      }
    });
  }

  const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.25, metalness: 0.85 });
  const darkCapMat = new THREE.MeshStandardMaterial({ color: 0x0f1b38, roughness: 0.55, metalness: 0.15 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.18, metalness: 0.65 });
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.45, metalness: 0.35 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.32, metalness: 0.82 });

  // Peaked Police Cap + Glossy Visor + Gold Emblem
  const capCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.112, 0.075, 16), darkCapMat);
  capCrown.position.set(0, 0.242, 0.002);
  capCrown.rotation.x = -0.08;
  rig.headGroup.add(capCrown);

  const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.114, 0.025, 16), visorMat);
  capBand.position.set(0, 0.205, 0.002);
  capBand.rotation.x = -0.08;
  rig.headGroup.add(capBand);

  const capVisor = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.118, 0.014, 14, 1, false, -Math.PI * 0.45, Math.PI * 0.9), visorMat);
  capVisor.position.set(0, 0.194, 0.055);
  capVisor.rotation.x = 0.18;
  rig.headGroup.add(capVisor);

  const capShield = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), goldMat);
  capShield.scale.set(0.9, 1.2, 0.45);
  capShield.position.set(0, 0.236, 0.122);
  rig.headGroup.add(capShield);

  // Chest Police Badge & Duty Belt
  const chestBadge = new THREE.Mesh(new THREE.OctahedronGeometry(0.026, 0), goldMat);
  chestBadge.scale.set(0.95, 1.25, 0.35);
  chestBadge.position.set(0.11, 1.31, 0.115);
  rig.bodyRoot.add(chestBadge);

  const dutyBelt = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.06, 0.24), beltMat);
  dutyBelt.position.set(0, 0.95, 0);
  rig.bodyRoot.add(dutyBelt);

  const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.025), goldMat);
  beltBuckle.position.set(0, 0.95, 0.12);
  rig.bodyRoot.add(beltBuckle);

  // Pistol attached to right hand (points along -Y in arm local space so rotating rightArmPivot.x = -PI/2 aims forward!)
  const pistolGroup = new THREE.Group();
  pistolGroup.position.set(0, -0.52, 0.05);
  pistolGroup.visible = hasHandgun;

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.04, 0.095), gunMat);
  grip.position.set(0, -0.015, -0.02);
  grip.rotation.x = -0.25;
  pistolGroup.add(grip);

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.175, 0.042), gunMat);
  slide.position.set(0, -0.085, 0.015);
  pistolGroup.add(slide);

  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.95,
  });
  const muzzleFlashMesh = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 6), muzzleFlashMat);
  muzzleFlashMesh.rotation.x = Math.PI;
  muzzleFlashMesh.position.set(0, -0.24, 0.015);
  muzzleFlashMesh.visible = false;
  pistolGroup.add(muzzleFlashMesh);

  rig.rightArmPivot.add(pistolGroup);

  return {
    ...rig,
    pistolGroup,
    muzzleFlashMesh,
    muzzleFlashMat,
  };
}

/**
 * Helper to extrude a 2D side-profile (Z forward, Y up) centered along X width.
 */
function createExtrudedProfile(
  pts: [number, number][],
  width: number,
  bevelSize = 0.04
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevelSize * 2,
    bevelEnabled: true,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: 2,
    curveSegments: 8,
  });
  // Rotate so shape X -> world Z (forward), shape Y -> world Y (up), depth -> world X (centered)
  geo.rotateY(-Math.PI / 2);
  geo.translate((width - bevelSize * 2) * 0.5, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds crisp multi-spoke alloy wheel with tire tread, rim barrel, brake rotor, and caliper.
 */
function makePerformanceWheel(
  radius: number,
  tireWidth: number,
  caliperColor: number,
  chromeMat: THREE.Material,
  tireMat: THREE.Material
): THREE.Group {
  const spinGroup = new THREE.Group();

  // Tire
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, tireWidth, 24),
    tireMat
  );
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spinGroup.add(tire);

  // Outer alloy barrel lip
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.68, radius * 0.68, tireWidth + 0.015, 20),
    new THREE.MeshStandardMaterial({ color: 0x1b2029, roughness: 0.3, metalness: 0.85 })
  );
  barrel.rotation.z = Math.PI / 2;
  spinGroup.add(barrel);

  // Drilled brake rotor
  const rotor = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, tireWidth + 0.022, 16),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.9 })
  );
  rotor.rotation.z = Math.PI / 2;
  spinGroup.add(rotor);

  // Brake caliper accent
  const caliper = new THREE.Mesh(
    new THREE.BoxGeometry(tireWidth + 0.03, radius * 0.34, radius * 0.22),
    new THREE.MeshStandardMaterial({ color: caliperColor, roughness: 0.32, metalness: 0.45 })
  );
  caliper.position.set(0, radius * 0.22, -radius * 0.24);
  spinGroup.add(caliper);

  // 5 twin alloy spokes
  for (let s = 0; s < 5; s++) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(tireWidth + 0.03, radius * 1.24, 0.034),
      chromeMat
    );
    spoke.rotation.x = (s * Math.PI) / 5;
    spinGroup.add(spoke);
  }

  // Center cap
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, tireWidth + 0.04, 12),
    chromeMat
  );
  cap.rotation.z = Math.PI / 2;
  spinGroup.add(cap);

  return spinGroup;
}

/**
 * Builds exclusive sculpted 3D vehicles:
 * - supercar: Veloce GT-R widebody hypercar (carbon aero splitter, GT wing, louvered mid-engine glass, quad exhaust)
 * - convertible: Solstice Roadster open-top GT (tan leather interior, dual chrome roll-hoops)
 * - coupe / sedan / suv: Sculpted extruded profiles with clearcoat paint, alloy rims, LED lightbars
 * - truck: Detailed commercial box truck
 * - motorcycle: Triumph-inspired Bobber 1200
 */
export function buildVehicleModel(
  kind: VehicleKind,
  paintColor: number,
  anisotropy: number,
  isSoftwareGl: boolean
): VehicleRig {
  if (kind === 'motorcycle') {
    return buildMotorcycleModel(paintColor);
  }

  const group = new THREE.Group();
  const chassisGroup = new THREE.Group();
  group.add(chassisGroup);

  const dims =
    kind === 'supercar'
      ? { len: 4.58, wid: 2.02, hgt: 1.16, wheelR: 0.35, cabLen: 1.95, cabZ: -0.05, dashZ: 0.65, lowerY: 0.56 }
      : kind === 'convertible'
        ? { len: 4.44, wid: 1.92, hgt: 1.24, wheelR: 0.34, cabLen: 1.75, cabZ: -0.18, dashZ: 0.55, lowerY: 0.58 }
        : kind === 'suv'
          ? { len: 4.62, wid: 1.98, hgt: 1.74, wheelR: 0.4, cabLen: 2.4, cabZ: -0.22, dashZ: 0.62, lowerY: 0.68 }
          : kind === 'coupe'
            ? { len: 4.42, wid: 1.9, hgt: 1.32, wheelR: 0.34, cabLen: 1.9, cabZ: -0.18, dashZ: 0.56, lowerY: 0.6 }
            : kind === 'truck'
              ? { len: 5.75, wid: 2.18, hgt: 2.6, wheelR: 0.44, cabLen: 1.65, cabZ: 1.55, dashZ: 2.05, lowerY: 0.86 }
              : kind === 'police'
                ? { len: 4.6, wid: 1.9, hgt: 1.46, wheelR: 0.35, cabLen: 2.15, cabZ: -0.15, dashZ: 0.58, lowerY: 0.62 }
                : { len: 4.5, wid: 1.88, hgt: 1.44, wheelR: 0.35, cabLen: 2.1, cabZ: -0.15, dashZ: 0.58, lowerY: 0.62 };

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: kind === 'police' ? 0x0f131a : paintColor,
    roughness: kind === 'supercar' || kind === 'convertible' ? 0.16 : 0.22,
    metalness: kind === 'supercar' ? 0.78 : 0.65,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.25,
  });

  const policeWhiteMat =
    kind === 'police'
      ? new THREE.MeshPhysicalMaterial({
          color: 0xf8fafc,
          roughness: 0.2,
          metalness: 0.2,
          clearcoat: 1.0,
        })
      : paintMat;

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x161920,
    roughness: 0.35,
    metalness: 0.42,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x171b22,
    roughness: 0.68,
    metalness: 0.18,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.14,
    metalness: 0.94,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x8cc6e8,
    roughness: 0.06,
    metalness: 0.08,
    transparent: true,
    opacity: isSoftwareGl ? 0.38 : 0.42,
    ior: 1.52,
    clearcoat: 1.0,
    depthWrite: false,
  });

  const interiorMat = new THREE.MeshStandardMaterial({
    color: kind === 'convertible' ? 0x8c583a : 0x181c24,
    roughness: 0.78,
    metalness: 0.05,
  });

  const headLightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 0.85,
    roughness: 0.1,
  });

  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    emissive: 0xbe123c,
    emissiveIntensity: 0.55,
    roughness: 0.18,
  });

  const wheelTrackX = dims.wid * 0.47;
  const frontAxleZ = dims.len * 0.31;
  const rearAxleZ = -dims.len * 0.31;

  // Container for procedural car body parts; cleanly swapped out once CarConcept.glb loads
  const bodyTarget = new THREE.Group();
  chassisGroup.add(bodyTarget);
  const windowMeshes: THREE.Mesh[] = [];

  if (kind === 'truck') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.94, 1.52, 1.72), paintMat);
    cab.position.set(0, dims.wheelR + 0.9, dims.len * 0.27);
    cab.castShadow = true;
    cab.receiveShadow = true;
    bodyTarget.add(cab);

    const roofDeflector = new THREE.Mesh(
      createExtrudedProfile(
        [
          [1.0, 2.05],
          [2.1, 2.05],
          [1.45, 2.48],
          [0.95, 2.48],
        ],
        dims.wid * 0.86,
        0.04
      ),
      paintMat
    );
    bodyTarget.add(roofDeflector);

    const cargoBox = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid, 1.98, 3.5),
      new THREE.MeshStandardMaterial({ color: 0xebedf2, roughness: 0.52, metalness: 0.16 })
    );
    cargoBox.position.set(0, dims.wheelR + 1.2, -dims.len * 0.17);
    cargoBox.castShadow = true;
    cargoBox.receiveShadow = true;
    bodyTarget.add(cargoBox);
  } else {
    // 1. Sculpted extruded lower body profile (hood + fenders + rear deck)
    const halfL = dims.len * 0.5;
    const baseZ = dims.wheelR * 0.55;
    const beltY = dims.lowerY + 0.24;
    const noseY = kind === 'supercar' ? 0.44 : kind === 'suv' ? 0.72 : 0.54;

    const lowerProfile: [number, number][] =
      kind === 'supercar'
        ? [
            [-halfL, baseZ + 0.08],
            [halfL, baseZ],
            [halfL - 0.12, noseY],
            [halfL * 0.38, beltY - 0.04],
            [-halfL * 0.45, beltY + 0.06],
            [-halfL + 0.08, beltY + 0.04],
          ]
        : [
            [-halfL, baseZ + 0.05],
            [halfL, baseZ + 0.04],
            [halfL - 0.08, noseY],
            [halfL * 0.38, beltY],
            [-halfL * 0.48, beltY + 0.04],
            [-halfL + 0.06, beltY - 0.04],
          ];

    // Split left/right/hood/trunk so the cabin interior remains hollow & visible!
    const hoodProfile: [number, number][] = [
      [dims.dashZ - 0.05, baseZ + 0.04],
      [halfL, baseZ],
      [halfL - 0.1, noseY],
      [dims.dashZ - 0.05, beltY],
    ];
    const hoodMesh = new THREE.Mesh(createExtrudedProfile(hoodProfile, dims.wid * 0.94, 0.04), paintMat);
    hoodMesh.castShadow = true;
    hoodMesh.receiveShadow = true;
    bodyTarget.add(hoodMesh);

    const rearProfile: [number, number][] = [
      [-halfL, baseZ + 0.06],
      [dims.cabZ - dims.cabLen * 0.38, baseZ + 0.04],
      [dims.cabZ - dims.cabLen * 0.38, beltY + 0.04],
      [-halfL + 0.06, beltY + 0.02],
    ];
    const rearMesh = new THREE.Mesh(createExtrudedProfile(rearProfile, dims.wid * 0.96, 0.04), paintMat);
    rearMesh.castShadow = true;
    rearMesh.receiveShadow = true;
    bodyTarget.add(rearMesh);

    // Floor pan
    const floorPan = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid * 0.9, 0.12, dims.len * 0.92),
      carbonMat
    );
    floorPan.position.set(0, baseZ + 0.04, 0);
    bodyTarget.add(floorPan);

    // Right side flank panel (left side uses articulated doorPivot!)
    const midSpan = dims.dashZ - (dims.cabZ - dims.cabLen * 0.38) + 0.14;
    const midCenterZ = (dims.dashZ + (dims.cabZ - dims.cabLen * 0.38)) * 0.5;
    const rightFlank = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, beltY - baseZ, midSpan),
      policeWhiteMat
    );
    rightFlank.position.set(dims.wid * 0.44, (beltY + baseZ) * 0.5, midCenterZ);
    rightFlank.castShadow = true;
    bodyTarget.add(rightFlank);

    // Carbon side skirts & front splitter
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.98, 0.05, 0.38), carbonMat);
    splitter.position.set(0, baseZ - 0.01, halfL - 0.1);
    bodyTarget.add(splitter);

    for (const sx of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, dims.len * 0.56), carbonMat);
      skirt.position.set(sx * dims.wid * 0.48, baseZ, 0);
      bodyTarget.add(skirt);
    }

    // Rear diffuser + twin/quad chrome exhausts
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.86, 0.14, 0.24), carbonMat);
    diffuser.position.set(0, baseZ + 0.04, -halfL - 0.02);
    bodyTarget.add(diffuser);

    const exhaustOffsets = kind === 'supercar' ? [-0.28, -0.16, 0.16, 0.28] : [-0.46, 0.46];
    for (const ex of exhaustOffsets) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 12), chromeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(ex, baseZ + 0.06, -halfL - 0.05);
      bodyTarget.add(pipe);
    }

    // 2. Greenhouse / Roof / Convertible Open Top
    const pillarH = dims.hgt - beltY - 0.04;
    const pillarY = beltY + pillarH * 0.5;

    // Raked windshield
    const windshield = new THREE.Mesh(
      new THREE.PlaneGeometry(dims.wid * 0.8, pillarH * 1.28),
      glassMat
    );
    windshield.position.set(0, pillarY + 0.02, dims.dashZ - 0.14);
    windshield.rotation.x = -0.88;
    windshield.renderOrder = 2;
    windshield.userData.carPart = 'window';
    windowMeshes.push(windshield);
    bodyTarget.add(windshield);

    for (const sx of [-1, 1]) {
      const aPillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, pillarH * 1.24, 0.085),
        kind === 'convertible' ? chromeMat : trimMat
      );
      aPillar.position.set(sx * dims.wid * 0.41, pillarY, dims.dashZ - 0.14);
      aPillar.rotation.x = -0.78;
      bodyTarget.add(aPillar);
    }

    if (kind === 'convertible') {
      // Open-top convertible: top windshield header bar + dual chrome roll hoops!
      const headerBar = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.86, 0.06, 0.08), chromeMat);
      headerBar.position.set(0, dims.hgt - 0.04, dims.dashZ - 0.44);
      bodyTarget.add(headerBar);

      for (const sx of [-1, 1]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.026, 8, 16, Math.PI), chromeMat);
        hoop.position.set(sx * dims.wid * 0.21, beltY + 0.14, dims.dashZ - 0.88);
        bodyTarget.add(hoop);
      }
    } else {
      // Closed roof + rear glass + C-pillars
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(dims.wid * 0.82, 0.08, dims.cabLen * 0.72),
        kind === 'supercar' ? carbonMat : policeWhiteMat
      );
      roof.position.set(0, dims.hgt - 0.04, dims.cabZ - 0.12);
      roof.castShadow = true;
      bodyTarget.add(roof);

      for (const sx of [-1, 1]) {
        const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, pillarH * 1.2, 0.1), paintMat);
        cPillar.position.set(sx * dims.wid * 0.4, pillarY, dims.cabZ - dims.cabLen * 0.44);
        cPillar.rotation.x = 0.72;
        bodyTarget.add(cPillar);
      }

      const rearGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(dims.wid * 0.78, pillarH * 1.24),
        glassMat
      );
      rearGlass.position.set(0, pillarY + 0.02, dims.cabZ - dims.cabLen * 0.42);
      rearGlass.rotation.x = Math.PI + 0.82;
      rearGlass.renderOrder = 2;
      rearGlass.userData.carPart = 'window';
      windowMeshes.push(rearGlass);
      bodyTarget.add(rearGlass);
    }

    // 3. Exclusive Veloce GT-R Aero Wing & Mid-Engine Louvers
    if (kind === 'supercar') {
      const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.96, 0.045, 0.28), carbonMat);
      wingBlade.position.set(0, beltY + 0.34, -halfL + 0.22);
      wingBlade.rotation.x = 0.08;
      wingBlade.castShadow = true;
      bodyTarget.add(wingBlade);

      for (const sx of [-1, 1]) {
        const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.34), paintMat);
        endplate.position.set(sx * dims.wid * 0.48, beltY + 0.33, -halfL + 0.22);
        bodyTarget.add(endplate);

        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.14), carbonMat);
        strut.position.set(sx * 0.38, beltY + 0.18, -halfL + 0.24);
        strut.rotation.x = -0.2;
        bodyTarget.add(strut);
      }

      // Mid-engine glowing engine bay accent
      const engineAccent = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.05, 0.76),
        new THREE.MeshStandardMaterial({
          color: 0xd946ef,
          emissive: 0xa21caf,
          emissiveIntensity: 0.45,
          roughness: 0.3,
        })
      );
      engineAccent.position.set(0, beltY + 0.02, -halfL * 0.56);
      bodyTarget.add(engineAccent);
    }

    // Ignore unused lowerProfile warning by adding subtle flared wheel-arch trim
    void lowerProfile;
  }

  // 4. Articulated Left Driver Door
  let doorPivot: THREE.Group | null = null;
  if (kind !== 'truck') {
    doorPivot = new THREE.Group();
    const doorLen = dims.len * 0.38;
    const doorFrontZ = dims.dashZ - 0.02;
    const doorH = 0.52;
    const doorY = dims.wheelR * 0.55 + doorH * 0.5 + 0.04;
    doorPivot.position.set(-dims.wid * 0.44, doorY, doorFrontZ);

    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH, doorLen), policeWhiteMat);
    doorPanel.position.set(0, 0, -doorLen * 0.5);
    doorPanel.castShadow = true;
    doorPivot.add(doorPanel);

    if (kind === 'police') {
      const badgeMat = new THREE.MeshStandardMaterial({
        map: getPoliceDoorTexture(anisotropy),
        roughness: 0.32,
      });
      const leftBadge = new THREE.Mesh(new THREE.PlaneGeometry(doorLen * 0.76, doorH * 0.72), badgeMat);
      leftBadge.position.set(-0.064, 0, -doorLen * 0.5);
      leftBadge.rotation.y = -Math.PI / 2;
      doorPivot.add(leftBadge);

      const rightBadge = new THREE.Mesh(new THREE.PlaneGeometry(doorLen * 0.76, doorH * 0.72), badgeMat);
      rightBadge.position.set(dims.wid * 0.44 + 0.074, doorY, doorFrontZ - doorLen * 0.5);
      rightBadge.rotation.y = Math.PI / 2;
      bodyTarget.add(rightBadge);
    }

    const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.16), chromeMat);
    doorHandle.position.set(-0.07, 0.14, -doorLen * 0.78);
    doorPivot.add(doorHandle);

    const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.07), paintMat);
    mirrorHousing.position.set(-0.16, doorH * 0.5 + 0.07, -0.18);
    doorPivot.add(mirrorHousing);

    bodyTarget.add(doorPivot);
  }

  if (kind !== 'truck') {
    const rMirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.07), paintMat);
    rMirror.position.set(dims.wid * 0.52, dims.lowerY + 0.25, dims.dashZ - 0.2);
    bodyTarget.add(rMirror);
  }

  // 5. Persistent Interior Dashboard & Animated Steering Wheel (survives CarConcept.glb swap for Cockpit FPS view)
  const cockpitDashGroup = new THREE.Group();
  chassisGroup.add(cockpitDashGroup);

  const steerX = kind === 'truck' ? -dims.wid * 0.2 : 0;
  const dashY = kind === 'truck' ? dims.lowerY + 0.12 : 0.56;
  const dashZ = kind === 'truck' ? dims.dashZ : 0.56;

  const dash = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.68, 0.2, 0.3), trimMat);
  dash.position.set(0, dashY, dashZ);
  cockpitDashGroup.add(dash);

  const gaugeCluster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.15),
    new THREE.MeshBasicMaterial({ map: getDashTexture(anisotropy) })
  );
  gaugeCluster.position.set(steerX, dashY + 0.04, dashZ - 0.155);
  gaugeCluster.rotation.y = Math.PI;
  cockpitDashGroup.add(gaugeCluster);

  const steeringWheelPivot = new THREE.Group();
  steeringWheelPivot.position.set(steerX, dashY + 0.11, dashZ - 0.24);
  steeringWheelPivot.rotation.x = -0.35;
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 8, 24), trimMat);
  steeringWheelPivot.add(wheelRim);
  const wheelSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.028, 0.02), chromeMat);
  steeringWheelPivot.add(wheelSpoke);
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), trimMat);
  wheelHub.rotation.x = Math.PI / 2;
  steeringWheelPivot.add(wheelHub);
  cockpitDashGroup.add(steeringWheelPivot);

  const seatLocal = new THREE.Vector3(
    kind === 'truck' ? -dims.wid * 0.2 : 0,
    kind === 'truck' ? dims.wheelR + 0.56 : 0.24,
    kind === 'truck' ? dims.dashZ - 0.55 : 0.06
  );
  for (const sx of [-1, 1]) {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.11, 0.46), interiorMat);
    seatBase.position.set(sx * dims.wid * 0.2, dims.wheelR + 0.14, dims.dashZ - 0.62);
    bodyTarget.add(seatBase);

    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.11), interiorMat);
    seatBack.position.set(sx * dims.wid * 0.2, dims.wheelR + 0.42, dims.dashZ - 0.82);
    seatBack.rotation.x = -0.18;
    bodyTarget.add(seatBack);
  }

  // 6. LED Projector Headlights, Grille & Full-Width LED Taillights
  const grille = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.48, 0.15, 0.06), carbonMat);
  grille.position.set(0, dims.wheelR + 0.06, dims.len * 0.5 + 0.01);
  bodyTarget.add(grille);

  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.06), headLightMat);
    hl.position.set(sx * dims.wid * 0.34, dims.wheelR + 0.18, dims.len * 0.5 + 0.01);
    bodyTarget.add(hl);
  }

  if (kind === 'supercar' || kind === 'convertible') {
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.86, 0.065, 0.06), tailLightMat);
    tailBar.position.set(0, dims.wheelR + 0.26, -dims.len * 0.5 - 0.01);
    bodyTarget.add(tailBar);
  } else {
    for (const sx of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.06), tailLightMat);
      tl.position.set(sx * dims.wid * 0.34, dims.wheelR + 0.26, -dims.len * 0.5 - 0.01);
      bodyTarget.add(tl);
    }
  }

  // 7. High-Detail Performance Alloy Wheels
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x131519, roughness: 0.88, metalness: 0.05 });
  const caliperColor = kind === 'supercar' ? 0xf43f5e : kind === 'convertible' ? 0xf59e0b : 0x38bdf8;
  const tireW = kind === 'supercar' ? 0.29 : 0.24;

  const flSteer = new THREE.Group();
  flSteer.position.set(-wheelTrackX, dims.wheelR, frontAxleZ);
  const flSpin = makePerformanceWheel(dims.wheelR, tireW, caliperColor, chromeMat, tireMat);
  flSteer.add(flSpin);
  group.add(flSteer);

  const frSteer = new THREE.Group();
  frSteer.position.set(wheelTrackX, dims.wheelR, frontAxleZ);
  const frSpin = makePerformanceWheel(dims.wheelR, tireW, caliperColor, chromeMat, tireMat);
  frSteer.add(frSpin);
  group.add(frSteer);

  const rlSpin = makePerformanceWheel(dims.wheelR, tireW, caliperColor, chromeMat, tireMat);
  rlSpin.position.set(-wheelTrackX, dims.wheelR, rearAxleZ);
  group.add(rlSpin);

  const rrSpin = makePerformanceWheel(dims.wheelR, tireW, caliperColor, chromeMat, tireMat);
  rrSpin.position.set(wheelTrackX, dims.wheelR, rearAxleZ);
  group.add(rrSpin);

  [flSpin, frSpin, rlSpin, rrSpin].forEach((spin, wi) => {
    spin.userData.restY = spin.position.y;
    spin.traverse((obj) => {
      obj.userData.carPart = 'wheel';
      obj.userData.wheelIndex = wi;
    });
  });

  // 7b. Police Interceptor Pushbar & Red/Blue Roof Lightbar
  let policeLightRedMat: THREE.MeshStandardMaterial | undefined;
  let policeLightBlueMat: THREE.MeshStandardMaterial | undefined;
  let policeLightbarGroup: THREE.Group | undefined;
  if (kind === 'police') {
    const pushBar = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.56, 0.34, 0.14), trimMat);
    pushBar.position.set(0, dims.wheelR + 0.16, dims.len * 0.5 + 0.09);
    bodyTarget.add(pushBar);
    for (const sx of [-0.42, 0.42]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.18), trimMat);
      upright.position.set(sx, dims.wheelR + 0.18, dims.len * 0.5 + 0.08);
      bodyTarget.add(upright);
    }

    policeLightRedMat = new THREE.MeshStandardMaterial({
      color: 0xff2233,
      emissive: 0xef4444,
      emissiveIntensity: 0.2,
      roughness: 0.15,
    });
    policeLightBlueMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x2563eb,
      emissiveIntensity: 0.2,
      roughness: 0.15,
    });

    policeLightbarGroup = new THREE.Group();
    policeLightbarGroup.position.set(0, dims.hgt, dims.cabZ - 0.05);

    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.05, 0.24), trimMat);
    barBase.position.set(0, 0.025, 0);
    policeLightbarGroup.add(barBase);

    const redPod = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.22), policeLightRedMat);
    redPod.position.set(-0.32, 0.08, 0);
    policeLightbarGroup.add(redPod);

    const centerPod = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.22), headLightMat);
    centerPod.position.set(0, 0.08, 0);
    policeLightbarGroup.add(centerPod);

    const bluePod = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.22), policeLightBlueMat);
    bluePod.position.set(0.32, 0.08, 0);
    policeLightbarGroup.add(bluePod);

    chassisGroup.add(policeLightbarGroup);
  }

  // 8. Seated Occupant Slot & Cockpit Eye
  const occupantGroup = new THREE.Group();
  occupantGroup.position.copy(seatLocal);
  if (kind === 'police') {
    occupantGroup.scale.setScalar(0.56);
    for (const sx of [-0.34, 0.34]) {
      const officer = buildUniformedPoliceOfficer(anisotropy, isSoftwareGl, false);
      setHumanSeatedPose(officer, true);
      officer.group.position.set(sx, 0, 0);
      occupantGroup.add(officer.group);
    }
  } else {
    occupantGroup.scale.setScalar(0.62);
    const occupantRig = buildHumanCharacter({
      shirtColor: 0x334155,
      pantsColor: 0x1e293b,
    });
    setHumanSeatedPose(occupantRig, true);
    occupantGroup.add(occupantRig.group);
  }
  chassisGroup.add(occupantGroup);

  const cockpitEyeLocal = new THREE.Vector3(
    kind === 'truck' ? -dims.wid * 0.2 : 0,
    kind === 'truck' ? dims.hgt - 0.45 : 0.86,
    kind === 'truck' ? dims.dashZ - 0.52 : 0.06
  );

  // Replace boxy procedural car visuals with CarConcept.glb (~4.2 units long)
  if (kind !== 'truck') {
    attachCarConceptToRig({
      kind,
      paintColor,
      anisotropy,
      isSoftwareGl,
      chassisGroup,
      fallbackBodyGroup: bodyTarget,
      wheelSteerPivots: [flSteer, frSteer],
      wheelSpinMeshes: [flSpin, frSpin, rlSpin, rrSpin],
      windowMeshes,
      headLightMat,
      tailLightMat,
      seatLocal,
      cockpitEyeLocal,
      occupantGroup,
      policeLightbarGroup,
    });
  }

  return {
    group,
    chassisGroup,
    doorPivot,
    steeringWheelPivot,
    wheelSteerPivots: [flSteer, frSteer],
    wheelSpinMeshes: [flSpin, frSpin, rlSpin, rrSpin],
    windowMeshes,
    tirePopped: [false, false, false, false],
    tailLightMat,
    headLightMat,
    policeLightRedMat,
    policeLightBlueMat,
    occupantGroup,
    kickstandGroup: null,
    cockpitEyeLocal,
    seatLocal,
    length: dims.len,
    width: dims.wid,
    height: dims.hgt,
  };
}

function buildMotorcycleModel(paintColor: number): VehicleRig {
  const group = new THREE.Group();
  const chassisGroup = new THREE.Group();
  group.add(chassisGroup);

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    roughness: 0.18,
    metalness: 0.78,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.5, metalness: 0.7 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.14, metalness: 0.95 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x4b2e1e, roughness: 0.76, metalness: 0.05 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9, metalness: 0.04 });

  const headLightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 0.95,
    roughness: 0.12,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    emissive: 0xbe123c,
    emissiveIntensity: 0.55,
    roughness: 0.18,
  });

  const wheelR = 0.34;
  const frontZ = 0.76;
  const rearZ = -0.72;

  // V-Twin Engine block + cooling fins
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.46), chromeMat);
  engineBlock.position.set(0, 0.44, 0.02);
  engineBlock.castShadow = true;
  chassisGroup.add(engineBlock);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.18), frameMat);
  spine.position.set(0, 0.68, -0.04);
  chassisGroup.add(spine);

  const tank = new THREE.Mesh(
    createExtrudedProfile(
      [
        [-0.1, 0.76],
        [0.44, 0.74],
        [0.36, 0.98],
        [0.06, 0.96],
      ],
      0.32,
      0.04
    ),
    paintMat
  );
  tank.castShadow = true;
  chassisGroup.add(tank);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.44), leatherMat);
  seat.position.set(0, 0.74, -0.28);
  seat.castShadow = true;
  chassisGroup.add(seat);

  for (const sx of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.045, 1.12, 10), chromeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx * 0.2, 0.32, -0.34);
    chassisGroup.add(pipe);
  }

  const rearFender = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.52), paintMat);
  rearFender.position.set(0, 0.64, -0.68);
  rearFender.rotation.x = 0.25;
  chassisGroup.add(rearFender);

  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.06), tailLightMat);
  tl.position.set(0, 0.62, -0.94);
  chassisGroup.add(tl);

  const forkSteer = new THREE.Group();
  forkSteer.position.set(0, wheelR, frontZ);

  const makeBikeWheel = () => {
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(wheelR - 0.07, 0.075, 12, 24), tireMat);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 14), chromeMat);
    rim.rotation.z = Math.PI / 2;
    spinGroup.add(rim);

    for (let s = 0; s < 4; s++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.02), chromeMat);
      sp.rotation.x = (s * Math.PI) / 4;
      spinGroup.add(sp);
    }
    return spinGroup;
  };

  const frontSpin = makeBikeWheel();
  forkSteer.add(frontSpin);

  for (const sx of [-1, 1]) {
    const forkTube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.76, 8), chromeMat);
    forkTube.position.set(sx * 0.12, 0.35, -0.1);
    forkTube.rotation.x = -0.34;
    forkSteer.add(forkTube);
  }

  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.72, 8), chromeMat);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 0.69, -0.22);
  forkSteer.add(handlebar);

  const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.1, 16), headLightMat);
  hl.rotation.x = Math.PI / 2;
  hl.position.set(0, 0.56, -0.07);
  forkSteer.add(hl);

  group.add(forkSteer);

  const rearSpin = makeBikeWheel();
  rearSpin.position.set(0, wheelR, rearZ);
  group.add(rearSpin);

  const kickstandGroup = new THREE.Group();
  kickstandGroup.position.set(-0.14, 0.28, -0.06);
  const standBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.34, 8), chromeMat);
  standBar.position.set(-0.08, -0.14, 0);
  standBar.rotation.z = -0.45;
  kickstandGroup.add(standBar);
  chassisGroup.add(kickstandGroup);

  const dummyRightSteer = new THREE.Group();
  const seatLocal = new THREE.Vector3(0, 0.55, -0.28);
  const occupantGroup = new THREE.Group();
  occupantGroup.position.copy(seatLocal);
  const riderRig = buildHumanCharacter({ shirtColor: 0x1e293b, pantsColor: 0x0f172a });
  setHumanSeatedPose(riderRig, true);
  occupantGroup.add(riderRig.group);
  chassisGroup.add(occupantGroup);

  frontSpin.userData.restY = frontSpin.position.y;
  frontSpin.traverse((obj) => {
    obj.userData.carPart = 'wheel';
    obj.userData.wheelIndex = 0;
  });
  rearSpin.userData.restY = rearSpin.position.y;
  rearSpin.traverse((obj) => {
    obj.userData.carPart = 'wheel';
    obj.userData.wheelIndex = 2;
  });

  return {
    group,
    chassisGroup,
    doorPivot: null,
    steeringWheelPivot: null,
    wheelSteerPivots: [forkSteer, dummyRightSteer],
    wheelSpinMeshes: [frontSpin, rearSpin],
    windowMeshes: [],
    tirePopped: [false, false, false, false],
    tailLightMat,
    headLightMat,
    occupantGroup,
    kickstandGroup,
    cockpitEyeLocal: new THREE.Vector3(0, 1.38, -0.18),
    seatLocal,
    length: 2.15,
    width: 0.84,
    height: 1.25,
  };
}

export function applyVehicleDent(
  rig: VehicleRig,
  impactForwardDot: number,
  impactRightDot: number,
  strength: number
): void {
  const s = THREE.MathUtils.clamp(strength, 0.02, 0.14);
  rig.chassisGroup.scale.z = Math.max(0.86, rig.chassisGroup.scale.z - s * 0.48 * Math.abs(impactForwardDot));
  rig.chassisGroup.scale.x = Math.max(0.88, rig.chassisGroup.scale.x - s * 0.42 * Math.abs(impactRightDot));
  rig.chassisGroup.position.z -= Math.sign(impactForwardDot || 1) * s * 0.28;
  rig.chassisGroup.position.x -= Math.sign(impactRightDot || 1) * s * 0.22;
  rig.chassisGroup.rotation.z += impactRightDot * s * 0.26;
  rig.chassisGroup.rotation.x -= impactForwardDot * s * 0.18;
}

export function resetVehicleDent(rig: VehicleRig): void {
  rig.chassisGroup.scale.set(1, 1, 1);
  rig.chassisGroup.position.set(0, 0, 0);
  rig.chassisGroup.rotation.set(0, 0, 0);
  for (const w of rig.windowMeshes) {
    w.visible = true;
  }
  rig.tirePopped = [false, false, false, false];
  for (const spin of rig.wheelSpinMeshes) {
    spin.scale.set(1, 1, 1);
    spin.rotation.z = 0;
    if (typeof spin.userData.restY === 'number') {
      spin.position.y = spin.userData.restY;
    }
  }
}

/**
 * Modern dual-arm boulevard street light (shadows disabled for distant/prop optimization).
 */
export function buildStreetLight(lampEmitterMat: THREE.MeshStandardMaterial): THREE.Group {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.38, metalness: 0.82 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.6, 10), poleMat);
  base.position.y = 0.3;
  base.castShadow = false;
  group.add(base);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 5.8, 10), poleMat);
  shaft.position.y = 3.2;
  shaft.castShadow = false;
  group.add(shaft);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.55), poleMat);
  arm.position.set(0, 6.02, 0.68);
  arm.rotation.x = -0.12;
  group.add(arm);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.62), poleMat);
  hood.position.set(0, 6.1, 1.38);
  group.add(hood);

  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.46), lampEmitterMat);
  lens.position.set(0, 6.05, 1.38);
  group.add(lens);

  return group;
}

/**
 * Coastal Miami-style Palm Tree with segmented curved trunk & arched palm fronds.
 */
export function buildPalmTree(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5344, roughness: 0.9, metalness: 0.02 });
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x2f7d44,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  const curb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.92, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: 0x7a8088, roughness: 0.86 })
  );
  curb.position.y = 0.08;
  group.add(curb);

  let curX = 0;
  let curY = 0.16;
  const leanDir = (Math.random() - 0.5) * 0.08;
  for (let i = 0; i < 6; i++) {
    const segH = 0.95;
    const rBot = 0.22 - i * 0.018;
    const rTop = 0.2 - i * 0.018;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, segH, 8), trunkMat);
    curX += leanDir * (i + 0.5);
    seg.position.set(curX, curY + segH * 0.5, 0);
    seg.rotation.z = -leanDir * (i + 1) * 0.45;
    seg.castShadow = false;
    group.add(seg);
    curY += segH - 0.05;
  }

  const crown = new THREE.Group();
  crown.position.set(curX, curY, 0);
  const frondGeo = new THREE.BoxGeometry(0.44, 0.03, 2.35);
  frondGeo.translate(0, 0, 1.15);

  for (let f = 0; f < 9; f++) {
    const frond = new THREE.Mesh(frondGeo, frondMat);
    frond.rotation.y = (f / 9) * Math.PI * 2;
    frond.rotation.x = 0.38 + (f % 2) * 0.18;
    frond.castShadow = false;
    crown.add(frond);
  }
  group.add(crown);

  group.scale.setScalar(scale);
  return group;
}

/**
 * Leafy broadleaf boulevard street tree.
 */
export function buildStreetTree(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4636, roughness: 0.92, metalness: 0.02 });
  const leafMatA = new THREE.MeshStandardMaterial({ color: 0x3b6e3c, roughness: 0.82, metalness: 0.02 });
  const leafMatB = new THREE.MeshStandardMaterial({ color: 0x4b8045, roughness: 0.78, metalness: 0.02 });

  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.14, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x6b7075, roughness: 0.9 })
  );
  curb.position.y = 0.07;
  group.add(curb);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.19, 2.3, 8), trunkMat);
  trunk.position.y = 1.15;
  trunk.castShadow = false;
  group.add(trunk);

  const crowns: [number, number, number, number, THREE.Material][] = [
    [0, 2.95, 0, 1.25, leafMatA],
    [-0.7, 2.55, 0.35, 0.85, leafMatB],
    [0.72, 2.65, -0.25, 0.9, leafMatA],
    [0.15, 3.6, 0.2, 0.88, leafMatB],
  ];
  for (const [cx, cy, cz, r, mat] of crowns) {
    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), mat);
    puff.position.set(cx, cy, cz);
    puff.castShadow = false;
    puff.receiveShadow = true;
    group.add(puff);
  }

  group.scale.setScalar(scale);
  return group;
}

/**
 * Coastal boardwalk bench.
 */
export function buildBench(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7c4d2b, roughness: 0.78 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.75 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.48), wood);
  seat.position.y = 0.44;
  seat.castShadow = false;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.38, 0.07), wood);
  back.position.set(0, 0.72, -0.21);
  back.rotation.x = -0.15;
  g.add(back);
  for (const sx of [-0.65, 0.65]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.44), iron);
    leg.position.set(sx, 0.22, 0);
    g.add(leg);
  }
  return g;
}

/**
 * Moored luxury coastal yacht silhouette for the Waterfront Marina Pier.
 */
export function buildLuxuryYacht(): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.2,
    metalness: 0.15,
    clearcoat: 1.0,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.7 });

  const hull = new THREE.Mesh(
    createExtrudedProfile(
      [
        [-8, 0.2],
        [6.5, 0.2],
        [9.5, 1.85],
        [-8, 1.75],
      ],
      3.8,
      0.12
    ),
    hullMat
  );
  hull.castShadow = true;
  g.add(hull);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.92, 0.22, 14.2), trimMat);
  stripe.position.set(0, 1.35, -0.4);
  g.add(stripe);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.15, 7.2), hullMat);
  deck.position.set(0, 2.35, -1.2);
  g.add(deck);

  const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.55, 2.8), glassMat);
  bridgeGlass.position.set(0, 2.55, 1.2);
  g.add(bridgeGlass);

  const flybridge = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 4.2), hullMat);
  flybridge.position.set(0, 3.15, -1.6);
  g.add(flybridge);

  return g;
}

/**
 * Cantilevered urban traffic signal gantry with Red / Yellow / Green beacons.
 * Faces traffic along -Z (local forward faces oncoming lane); rotate around Y as needed.
 */
export function buildTrafficSignal(
  lightMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]
): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.42, metalness: 0.78 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.4 });

  // Grounded collar & vertical mast
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.45, 10), poleMat);
  base.position.y = 0.225;
  base.castShadow = false;
  g.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 5.4, 10), poleMat);
  pole.position.y = 2.9;
  pole.castShadow = false;
  g.add(pole);

  // Horizontal mast arm reaching over the travel lane (+X local)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.11, 0.11), poleMat);
  arm.position.set(2.05, 5.45, 0);
  arm.castShadow = false;
  g.add(arm);

  // Overhead signal head (hanging at x = 3.2, visible both front & back)
  const makeHead = (x: number, y: number, z: number, scale = 1) => {
    const head = new THREE.Group();
    head.position.set(x, y, z);
    head.scale.setScalar(scale);

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.98, 0.28), housingMat);
    box.castShadow = false;
    head.add(box);

    const ys = [0.3, 0, -0.3];
    for (let i = 0; i < 3; i++) {
      // Front & rear lenses so approaching vehicles and player see the signal clearly
      const lensF = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), lightMats[i]);
      lensF.rotation.x = Math.PI / 2;
      lensF.position.set(0, ys[i], 0.145);
      head.add(lensF);

      const lensB = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), lightMats[i]);
      lensB.rotation.x = Math.PI / 2;
      lensB.position.set(0, ys[i], -0.145);
      head.add(lensB);
    }
    return head;
  };

  g.add(makeHead(3.35, 5.15, 0, 1.0));
  g.add(makeHead(0, 3.35, 0.16, 0.8)); // Pedestrian / lower pole head

  return g;
}

/**
 * Grounded regulatory Speed Limit road sign ("SPEED LIMIT 50").
 */
export function buildSpeedLimitSign(signTexture: THREE.CanvasTexture): THREE.Group {
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.85 });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.75, 8), postMat);
  post.position.y = 1.375;
  post.castShadow = false;
  g.add(post);

  const backing = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.06, 0.04), postMat);
  backing.position.set(0, 2.55, 0);
  backing.castShadow = false;
  g.add(backing);

  const faceMat = new THREE.MeshStandardMaterial({
    map: signTexture,
    roughness: 0.28,
    metalness: 0.1,
  });

  const frontFace = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.02), faceMat);
  frontFace.position.set(0, 2.55, 0.025);
  g.add(frontFace);

  const backFace = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.02), faceMat);
  backFace.position.set(0, 2.55, -0.025);
  backFace.rotation.y = Math.PI;
  g.add(backFace);

  return g;
}

export interface WeaponMeshRig {
  group: THREE.Group;
  muzzleFlashMesh: THREE.Mesh;
  muzzleFlashMat: THREE.MeshBasicMaterial;
  muzzleOffsetZ: number;
}

/**
 * Builds crisp 3D firearm meshes pointing along +Z (forward barrel) for player hands or shop racks.
 */
export function buildWeaponMesh(kind: 'pistol' | 'smg' | 'rifle'): WeaponMeshRig {
  const group = new THREE.Group();
  const gunSteel = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.28, metalness: 0.85 });
  const darkGrip = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72, metalness: 0.15 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: kind === 'rifle' ? 0xf59e0b : kind === 'smg' ? 0x38bdf8 : 0x94a3b8,
    roughness: 0.3,
    metalness: 0.75,
  });

  let muzzleOffsetZ = 0.24;

  if (kind === 'pistol') {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.095, 0.042), darkGrip);
    grip.position.set(0, -0.045, -0.02);
    grip.rotation.x = 0.22;
    group.add(grip);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.042, 0.19), gunSteel);
    slide.position.set(0, 0.012, 0.045);
    group.add(slide);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.016), accentMat);
    frontSight.position.set(0, 0.037, 0.122);
    group.add(frontSight);

    for (const sx of [-0.011, 0.011]) {
      const rearPost = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.012, 0.014), accentMat);
      rearPost.position.set(sx, 0.037, -0.04);
      group.add(rearPost);
    }

    muzzleOffsetZ = 0.16;
  } else if (kind === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.068, 0.28), gunSteel);
    receiver.position.set(0, 0.01, 0.05);
    group.add(receiver);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.1, 0.04), darkGrip);
    grip.position.set(0, -0.055, -0.01);
    grip.rotation.x = 0.2;
    group.add(grip);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.13, 0.036), darkGrip);
    mag.position.set(0, -0.065, 0.09);
    mag.rotation.x = -0.14;
    group.add(mag);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 8), accentMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.014, 0.24);
    group.add(barrel);

    muzzleOffsetZ = 0.33;
  } else {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.085, 0.2), darkGrip);
    stock.position.set(0, -0.005, -0.15);
    group.add(stock);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.072, 0.32), gunSteel);
    receiver.position.set(0, 0.014, 0.07);
    group.add(receiver);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.095, 0.04), darkGrip);
    grip.position.set(0, -0.052, -0.02);
    grip.rotation.x = 0.24;
    group.add(grip);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.052), accentMat);
    mag.position.set(0, -0.065, 0.085);
    mag.rotation.x = -0.18;
    group.add(mag);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.26, 8), gunSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.34);
    group.add(barrel);

    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.034, 0.11), darkGrip);
    optic.position.set(0, 0.062, 0.06);
    group.add(optic);

    muzzleOffsetZ = 0.48;
  }

  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.95,
  });
  const muzzleFlashMesh = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), muzzleFlashMat);
  muzzleFlashMesh.rotation.x = Math.PI / 2;
  muzzleFlashMesh.position.set(0, 0.016, muzzleOffsetZ + 0.08);
  muzzleFlashMesh.visible = false;
  group.add(muzzleFlashMesh);

  return { group, muzzleFlashMesh, muzzleFlashMat, muzzleOffsetZ };
}

/**
 * Builds a uniformed Store Security Guard with tactical vest, gold security badge, peaked cap, and handgun.
 */
export function buildSecurityGuard(
  anisotropy: number,
  isSoftwareGl = false
): PoliceOfficerRig {
  const rig = buildHumanCharacter({
    shirtColor: 0x334155,
    pantsColor: 0x0f172a,
    skinColor: 0xcf9473,
    hairColor: 0x1b1512,
    eyeColor: '#2c3e50',
    facialHair: 'stubble',
    hairStyle: 'buzz',
    anisotropy,
  });

  if (isSoftwareGl) {
    rig.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).castShadow = false;
      }
    });
  }

  const vestMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.2 });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.22, metalness: 0.9 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.18, metalness: 0.65 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.32, metalness: 0.82 });

  // Tactical Security Vest
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.26), vestMat);
  vest.position.set(0, 1.22, 0);
  vest.castShadow = !isSoftwareGl;
  rig.bodyRoot.add(vest);

  const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), silverMat);
  badge.scale.set(0.95, 1.25, 0.35);
  badge.position.set(0.11, 1.32, 0.136);
  rig.bodyRoot.add(badge);

  // Security Cap
  const capCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.068, 16), vestMat);
  capCrown.position.set(0, 0.238, 0.002);
  capCrown.rotation.x = -0.06;
  rig.headGroup.add(capCrown);

  const capVisor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.108, 0.116, 0.014, 14, 1, false, -Math.PI * 0.45, Math.PI * 0.9),
    visorMat
  );
  capVisor.position.set(0, 0.194, 0.055);
  capVisor.rotation.x = 0.18;
  rig.headGroup.add(capVisor);

  const capShield = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), silverMat);
  capShield.scale.set(0.9, 1.2, 0.45);
  capShield.position.set(0, 0.234, 0.12);
  rig.headGroup.add(capShield);

  // Pistol in right hand
  const pistolGroup = new THREE.Group();
  pistolGroup.position.set(0, -0.52, 0.05);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.04, 0.095), gunMat);
  grip.position.set(0, -0.015, -0.02);
  grip.rotation.x = -0.25;
  pistolGroup.add(grip);

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.175, 0.042), gunMat);
  slide.position.set(0, -0.085, 0.015);
  pistolGroup.add(slide);

  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.95,
  });
  const muzzleFlashMesh = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 6), muzzleFlashMat);
  muzzleFlashMesh.rotation.x = Math.PI;
  muzzleFlashMesh.position.set(0, -0.24, 0.015);
  muzzleFlashMesh.visible = false;
  pistolGroup.add(muzzleFlashMesh);

  rig.rightArmPivot.add(pistolGroup);

  return {
    ...rig,
    pistolGroup,
    muzzleFlashMesh,
    muzzleFlashMat,
  };
}

/**
 * Repaints all exterior paint materials on a vehicle rig (supports both CarConcept.glb and fallback body).
 */
export function repaintVehicleRig(rig: VehicleRig, paintHex: number): void {
  rig.chassisGroup.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const n = (mat.name || '').toLowerCase();
      if (/^paint\s*1/.test(n)) {
        mat.color.setHex(paintHex);
      } else if (/^paint\s*2/.test(n)) {
        mat.color.setHex(paintHex).multiplyScalar(0.84);
      } else if (mat instanceof THREE.MeshPhysicalMaterial && mat.clearcoat > 0.5 && !mat.transparent) {
        // Fallback procedural car paint material
        mat.color.setHex(paintHex);
      }
    }
  });
}


