import * as THREE from 'three';
import { VehicleKind } from './types';
import { createDashboardTexture } from './textures';

export interface HumanRig {
  group: THREE.Group;
  bodyRoot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  headGroup: THREE.Group;
}

export interface VehicleRig {
  group: THREE.Group;
  chassisGroup: THREE.Group;
  doorPivot: THREE.Group | null;
  steeringWheelPivot: THREE.Group | null;
  wheelSteerPivots: [THREE.Group, THREE.Group]; // Front-left, front-right
  wheelSpinMeshes: THREE.Group[]; // [FL, FR, RL, RR] or [Front, Rear] for bike
  tailLightMat: THREE.MeshStandardMaterial;
  headLightMat: THREE.MeshStandardMaterial;
  occupantGroup: THREE.Group;
  kickstandGroup: THREE.Group | null;
  cockpitEyeLocal: THREE.Vector3;
  seatLocal: THREE.Vector3;
  length: number;
  width: number;
  height: number;
}

let sharedDashTex: THREE.CanvasTexture | null = null;

function getDashTexture(anisotropy: number): THREE.CanvasTexture {
  if (!sharedDashTex) {
    sharedDashTex = createDashboardTexture(anisotropy);
  }
  return sharedDashTex;
}

/**
 * Builds an articulated 3D human character grounded at y = 0.
 * Used for Player ("Nathan"), traffic drivers, and sidewalk pedestrians.
 */
export function buildHumanCharacter(options: {
  shirtColor: number;
  pantsColor: number;
  skinColor?: number;
  hairColor?: number;
  isPlayer?: boolean;
}): HumanRig {
  const {
    shirtColor,
    pantsColor,
    skinColor = 0xd8a484,
    hairColor = 0x221b17,
    isPlayer = false,
  } = options;

  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.68,
    metalness: 0.02,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: shirtColor,
    roughness: 0.78,
    metalness: 0.04,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: pantsColor,
    roughness: 0.85,
    metalness: 0.02,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0xf1f5f9 : 0x1e293b,
    roughness: 0.55,
    metalness: 0.08,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColor,
    roughness: 0.82,
    metalness: 0.05,
  });

  // Pelvis / hips (y = 0.86)
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), pantsMat);
  pelvis.position.set(0, 0.88, 0);
  pelvis.castShadow = true;
  bodyRoot.add(pelvis);

  // Torso / Jacket (y = 1.2)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.24), shirtMat);
  torso.position.set(0, 1.21, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyRoot.add(torso);

  // Collar / chest accent on player
  if (isPlayer) {
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.08, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 })
    );
    collar.position.set(0, 1.44, 0);
    bodyRoot.add(collar);
  }

  // Head + Hair + Shades/Eyes
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.54, 0);
  bodyRoot.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skinMat);
  neck.position.set(0, -0.02, 0);
  headGroup.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.23), skinMat);
  head.position.set(0, 0.12, 0);
  head.castShadow = true;
  headGroup.add(head);

  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.25), hairMat);
  hairTop.position.set(0, 0.24, -0.01);
  headGroup.add(hairTop);

  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.14, 0.08), hairMat);
  hairBack.position.set(0, 0.16, -0.1);
  headGroup.add(hairBack);

  // Subtle sunglasses on player
  if (isPlayer) {
    const shades = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.05, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.15, metalness: 0.8 })
    );
    shades.position.set(0, 0.14, 0.11);
    headGroup.add(shades);
  }

  // Arms
  const makeArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.27, 1.41, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.28, 0.11), shirtMat);
    upper.position.set(0, -0.12, 0);
    upper.castShadow = true;
    pivot.add(upper);

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.26, 0.095), skinMat);
    forearm.position.set(0, -0.37, 0);
    forearm.castShadow = true;
    pivot.add(forearm);

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), skinMat);
    fist.position.set(0, -0.52, 0);
    pivot.add(fist);

    bodyRoot.add(pivot);
    return pivot;
  };

  const leftArmPivot = makeArm(-1);
  const rightArmPivot = makeArm(1);

  // Legs (grounded at y = 0)
  const makeLeg = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.1, 0.82, 0);

    const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.15), pantsMat);
    legMesh.position.set(0, -0.37, 0);
    legMesh.castShadow = true;
    pivot.add(legMesh);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.22), shoeMat);
    shoe.position.set(0, -0.77, 0.03);
    shoe.castShadow = true;
    pivot.add(shoe);

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

/**
 * Helper to pose a HumanRig into seated driving stance or standing stance.
 */
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
 * Builds a composite 4-wheel car (Sedan, SUV, Sports Coupe, or Box Truck)
 * or Motorcycle with clearcoat PBR paint, interior dashboard, steering wheel,
 * articulated driver door, spinning/steering wheels, and seated driver.
 * Grounded at y = 0, facing +Z forward.
 */
export function buildVehicleModel(
  kind: VehicleKind,
  paintColor: number,
  anisotropy: number,
  isSoftwareGl: boolean
): VehicleRig {
  if (kind === 'motorcycle') {
    return buildMotorcycleModel(paintColor, isSoftwareGl);
  }

  const group = new THREE.Group();
  const chassisGroup = new THREE.Group();
  group.add(chassisGroup);

  const dims =
    kind === 'suv'
      ? { len: 4.55, wid: 1.96, hgt: 1.72, wheelR: 0.39, cabLen: 2.35, cabZ: -0.22, cabY: 1.02 }
      : kind === 'coupe'
        ? { len: 4.35, wid: 1.88, hgt: 1.32, wheelR: 0.34, cabLen: 1.85, cabZ: -0.2, cabY: 0.85 }
        : kind === 'truck'
          ? { len: 5.7, wid: 2.18, hgt: 2.55, wheelR: 0.44, cabLen: 1.65, cabZ: 1.55, cabY: 1.32 }
          : { len: 4.45, wid: 1.86, hgt: 1.44, wheelR: 0.35, cabLen: 2.05, cabZ: -0.15, cabY: 0.92 };

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    roughness: 0.24,
    metalness: 0.65,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x181c22,
    roughness: 0.72,
    metalness: 0.15,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd8dee9,
    roughness: 0.18,
    metalness: 0.92,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x8cc6e8,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: isSoftwareGl ? 0.38 : 0.44,
    ior: 1.5,
    depthWrite: false,
  });

  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x1b2029,
    roughness: 0.85,
    metalness: 0.05,
  });

  const headLightMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6,
    emissive: 0xfff0cc,
    emissiveIntensity: 0.65,
    roughness: 0.15,
  });

  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xc81e1e,
    emissive: 0xaa1111,
    emissiveIntensity: 0.45,
    roughness: 0.2,
  });

  const wheelTrackX = dims.wid * 0.46;
  const frontAxleZ = dims.len * 0.31;
  const rearAxleZ = -dims.len * 0.31;

  // 1. Primary lower body chassis
  const lowerBodyH = kind === 'truck' ? 0.62 : 0.56;
  const lowerBodyY = dims.wheelR + lowerBodyH * 0.42;

  if (kind === 'truck') {
    // Truck cab + cargo box
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid * 0.94, 1.48, 1.72),
      paintMat
    );
    cab.position.set(0, dims.wheelR + 0.88, dims.len * 0.27);
    cab.castShadow = true;
    cab.receiveShadow = true;
    chassisGroup.add(cab);

    const cargoBox = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid, 1.92, 3.45),
      new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.58, metalness: 0.12 })
    );
    cargoBox.position.set(0, dims.wheelR + 1.18, -dims.len * 0.17);
    cargoBox.castShadow = true;
    cargoBox.receiveShadow = true;
    chassisGroup.add(cargoBox);
  } else {
    // Hood + trunk + central floor pan (hollowed cabin top for cockpit visibility!)
    const floorPan = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid * 0.9, 0.14, dims.len * 0.92),
      trimMat
    );
    floorPan.position.set(0, dims.wheelR + 0.04, 0);
    chassisGroup.add(floorPan);

    // Front hood / engine bay
    const hoodLen = dims.len * 0.34;
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid * 0.94, lowerBodyH, hoodLen),
      paintMat
    );
    hood.position.set(0, lowerBodyY, dims.len * 0.5 - hoodLen * 0.5);
    hood.castShadow = true;
    hood.receiveShadow = true;
    chassisGroup.add(hood);

    // Rear trunk
    const trunkLen = dims.len * 0.24;
    const trunk = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid * 0.94, lowerBodyH * 1.04, trunkLen),
      paintMat
    );
    trunk.position.set(0, lowerBodyY + 0.02, -dims.len * 0.5 + trunkLen * 0.5);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    chassisGroup.add(trunk);

    // Right side sill/door panel (left side has articulated door!)
    const midLen = dims.len - hoodLen - trunkLen + 0.06;
    const midZ = -dims.len * 0.5 + trunkLen + midLen * 0.5 - 0.03;

    const rightPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, lowerBodyH, midLen),
      paintMat
    );
    rightPanel.position.set(dims.wid * 0.44, lowerBodyY, midZ);
    rightPanel.castShadow = true;
    chassisGroup.add(rightPanel);

    // Roof + A/B/C pillars
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid * 0.84, 0.09, dims.cabLen * 0.78),
      paintMat
    );
    roof.position.set(0, dims.hgt - 0.06, dims.cabZ - 0.08);
    roof.castShadow = true;
    chassisGroup.add(roof);

    // Pillars
    const pillarH = dims.hgt - (lowerBodyY + lowerBodyH * 0.5) - 0.04;
    const pillarGeo = new THREE.BoxGeometry(0.08, pillarH, 0.09);
    const pillarY = lowerBodyY + lowerBodyH * 0.5 + pillarH * 0.5;
    for (const sx of [-1, 1]) {
      const aPillar = new THREE.Mesh(pillarGeo, trimMat);
      aPillar.position.set(sx * dims.wid * 0.4, pillarY, dims.cabZ + dims.cabLen * 0.36);
      aPillar.rotation.x = -0.45;
      chassisGroup.add(aPillar);

      const cPillar = new THREE.Mesh(pillarGeo, paintMat);
      cPillar.position.set(sx * dims.wid * 0.4, pillarY, dims.cabZ - dims.cabLen * 0.42);
      cPillar.rotation.x = 0.42;
      chassisGroup.add(cPillar);
    }

    // Windshield & rear glass
    const windshield = new THREE.Mesh(
      new THREE.PlaneGeometry(dims.wid * 0.78, pillarH * 1.18),
      glassMat
    );
    windshield.position.set(0, pillarY + 0.02, dims.cabZ + dims.cabLen * 0.34);
    windshield.rotation.x = -0.82;
    windshield.renderOrder = 2;
    chassisGroup.add(windshield);

    const rearGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(dims.wid * 0.78, pillarH * 1.12),
      glassMat
    );
    rearGlass.position.set(0, pillarY + 0.02, dims.cabZ - dims.cabLen * 0.4);
    rearGlass.rotation.x = Math.PI + 0.78;
    rearGlass.renderOrder = 2;
    chassisGroup.add(rearGlass);
  }

  // 2. Articulated Left Driver Door (pivots from front hinge on A-pillar!)
  let doorPivot: THREE.Group | null = null;
  if (kind !== 'truck') {
    doorPivot = new THREE.Group();
    const doorLen = dims.len * 0.38;
    const doorFrontZ = dims.cabZ + dims.cabLen * 0.38;
    doorPivot.position.set(-dims.wid * 0.44, lowerBodyY, doorFrontZ);

    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, lowerBodyH, doorLen),
      paintMat
    );
    doorPanel.position.set(0, 0, -doorLen * 0.5);
    doorPanel.castShadow = true;
    doorPivot.add(doorPanel);

    const doorHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.04, 0.16),
      chromeMat
    );
    doorHandle.position.set(-0.07, 0.14, -doorLen * 0.78);
    doorPivot.add(doorHandle);

    // Side wing mirror mounted on driver door
    const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.08), trimMat);
    mirrorArm.position.set(-0.1, lowerBodyH * 0.5 + 0.06, -0.2);
    doorPivot.add(mirrorArm);

    const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.07), paintMat);
    mirrorHousing.position.set(-0.18, lowerBodyH * 0.5 + 0.08, -0.22);
    doorPivot.add(mirrorHousing);

    chassisGroup.add(doorPivot);
  }

  // Right side wing mirror
  if (kind !== 'truck') {
    const rMirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.07), paintMat);
    rMirror.position.set(dims.wid * 0.52, lowerBodyY + lowerBodyH * 0.5 + 0.08, dims.cabZ + 0.45);
    chassisGroup.add(rMirror);
  }

  // 3. Interior Dashboard, Steering Wheel, & Seats
  const dashZ = kind === 'truck' ? dims.len * 0.36 : dims.cabZ + dims.cabLen * 0.28;
  const dashY = lowerBodyY + lowerBodyH * 0.42;

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(dims.wid * 0.78, 0.24, 0.36),
    interiorMat
  );
  dash.position.set(0, dashY, dashZ);
  chassisGroup.add(dash);

  const gaugeCluster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.16),
    new THREE.MeshBasicMaterial({ map: getDashTexture(anisotropy) })
  );
  gaugeCluster.position.set(-dims.wid * 0.2, dashY + 0.04, dashZ - 0.185);
  gaugeCluster.rotation.y = Math.PI;
  chassisGroup.add(gaugeCluster);

  const steeringWheelPivot = new THREE.Group();
  steeringWheelPivot.position.set(-dims.wid * 0.2, dashY + 0.05, dashZ - 0.28);
  steeringWheelPivot.rotation.x = -0.35;
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 8, 22), trimMat);
  steeringWheelPivot.add(wheelRim);
  const wheelSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.02), chromeMat);
  steeringWheelPivot.add(wheelSpoke);
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), trimMat);
  wheelHub.rotation.x = Math.PI / 2;
  steeringWheelPivot.add(wheelHub);
  chassisGroup.add(steeringWheelPivot);

  // Driver & Passenger seats
  const seatLocal = new THREE.Vector3(-dims.wid * 0.2, dims.wheelR + 0.16, dashZ - 0.62);
  for (const sx of [-1, 1]) {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.46), interiorMat);
    seatBase.position.set(sx * dims.wid * 0.2, seatLocal.y, seatLocal.z);
    chassisGroup.add(seatBase);

    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.12), interiorMat);
    seatBack.position.set(sx * dims.wid * 0.2, seatLocal.y + 0.3, seatLocal.z - 0.2);
    seatBack.rotation.x = -0.15;
    chassisGroup.add(seatBack);
  }

  // 4. Bumpers, Grille, Headlights & Taillights
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(dims.wid * 0.95, 0.18, 0.16),
    trimMat
  );
  frontBumper.position.set(0, dims.wheelR + 0.04, dims.len * 0.5 + 0.02);
  chassisGroup.add(frontBumper);

  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(dims.wid * 0.95, 0.18, 0.16),
    trimMat
  );
  rearBumper.position.set(0, dims.wheelR + 0.04, -dims.len * 0.5 - 0.02);
  chassisGroup.add(rearBumper);

  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(dims.wid * 0.44, 0.18, 0.06),
    chromeMat
  );
  grille.position.set(0, lowerBodyY - 0.02, dims.len * 0.5 + 0.01);
  chassisGroup.add(grille);

  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.06), headLightMat);
    hl.position.set(sx * dims.wid * 0.34, lowerBodyY + 0.04, dims.len * 0.5 + 0.01);
    chassisGroup.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), tailLightMat);
    tl.position.set(sx * dims.wid * 0.34, lowerBodyY + 0.06, -dims.len * 0.5 - 0.01);
    chassisGroup.add(tl);
  }

  // 5. Four Wheels (Steering + Spinning)
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.88, metalness: 0.05 });
  const wheelCoords: [number, number][] = [
    [-wheelTrackX, frontAxleZ],
    [wheelTrackX, frontAxleZ],
    [-wheelTrackX, rearAxleZ],
    [wheelTrackX, rearAxleZ],
  ];

  const makeWheel = () => {
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(dims.wheelR, dims.wheelR, 0.24, 18),
      tireMat
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(dims.wheelR * 0.58, dims.wheelR * 0.58, 0.25, 12),
      chromeMat
    );
    rim.rotation.z = Math.PI / 2;
    spinGroup.add(rim);

    const spokeBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, dims.wheelR * 1.05, 0.06),
      trimMat
    );
    spinGroup.add(spokeBar);
    return spinGroup;
  };

  const flSteer = new THREE.Group();
  flSteer.position.set(wheelCoords[0][0], dims.wheelR, wheelCoords[0][1]);
  const flSpin = makeWheel();
  flSteer.add(flSpin);
  group.add(flSteer);

  const frSteer = new THREE.Group();
  frSteer.position.set(wheelCoords[1][0], dims.wheelR, wheelCoords[1][1]);
  const frSpin = makeWheel();
  frSteer.add(frSpin);
  group.add(frSteer);

  const rlSpin = makeWheel();
  rlSpin.position.set(wheelCoords[2][0], dims.wheelR, wheelCoords[2][1]);
  group.add(rlSpin);

  const rrSpin = makeWheel();
  rrSpin.position.set(wheelCoords[3][0], dims.wheelR, wheelCoords[3][1]);
  group.add(rrSpin);

  // 6. Seated Occupant slot
  const occupantGroup = new THREE.Group();
  occupantGroup.position.copy(seatLocal);
  const occupantRig = buildHumanCharacter({
    shirtColor: 0x334155,
    pantsColor: 0x1e293b,
  });
  setHumanSeatedPose(occupantRig, true);
  occupantGroup.add(occupantRig.group);
  chassisGroup.add(occupantGroup);

  const cockpitEyeLocal = new THREE.Vector3(
    -dims.wid * 0.2,
    dims.hgt - 0.26,
    dashZ - 0.55
  );

  return {
    group,
    chassisGroup,
    doorPivot,
    steeringWheelPivot,
    wheelSteerPivots: [flSteer, frSteer],
    wheelSpinMeshes: [flSpin, frSpin, rlSpin, rrSpin],
    tailLightMat,
    headLightMat,
    occupantGroup,
    kickstandGroup: null,
    cockpitEyeLocal,
    seatLocal,
    length: dims.len,
    width: dims.wid,
    height: dims.hgt,
  };
}

/**
 * Builds the Paradise Heat Triumph-inspired motorcycle (240kg, two-wheel suspension,
 * front fork steering, kickstand, twin chrome exhausts, and rider saddle).
 */
function buildMotorcycleModel(paintColor: number, isSoftwareGl: boolean): VehicleRig {
  const group = new THREE.Group();
  const chassisGroup = new THREE.Group();
  group.add(chassisGroup);

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    roughness: 0.22,
    metalness: 0.72,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.55, metalness: 0.65 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.16, metalness: 0.94 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.78, metalness: 0.05 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9, metalness: 0.04 });

  const headLightMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6,
    emissive: 0xfff0cc,
    emissiveIntensity: 0.8,
    roughness: 0.15,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xc81e1e,
    emissive: 0xaa1111,
    emissiveIntensity: 0.5,
    roughness: 0.2,
  });

  const wheelR = 0.34;
  const frontZ = 0.74;
  const rearZ = -0.72;

  // Frame & Engine block
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.44), chromeMat);
  engineBlock.position.set(0, 0.44, 0.02);
  engineBlock.castShadow = true;
  chassisGroup.add(engineBlock);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.15), frameMat);
  spine.position.set(0, 0.68, -0.04);
  chassisGroup.add(spine);

  // Teardrop Fuel Tank
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.56), paintMat);
  tank.position.set(0, 0.85, 0.22);
  tank.rotation.x = -0.14;
  tank.castShadow = true;
  chassisGroup.add(tank);

  // Bobber Saddle
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.44), leatherMat);
  seat.position.set(0, 0.74, -0.28);
  seat.castShadow = true;
  chassisGroup.add(seat);

  // Twin Chrome Exhausts
  for (const sx of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.045, 1.1, 10), chromeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx * 0.2, 0.32, -0.34);
    chassisGroup.add(pipe);
  }

  // Taillight + Rear Fender
  const rearFender = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.52), paintMat);
  rearFender.position.set(0, 0.64, -0.68);
  rearFender.rotation.x = 0.25;
  chassisGroup.add(rearFender);

  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.06), tailLightMat);
  tl.position.set(0, 0.62, -0.94);
  chassisGroup.add(tl);

  // Front Fork & Handlebars (steers up to 26 deg!)
  const forkSteer = new THREE.Group();
  forkSteer.position.set(0, wheelR, frontZ);

  const makeWheel = () => {
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(wheelR - 0.07, 0.075, 10, 22), tireMat);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), chromeMat);
    rim.rotation.z = Math.PI / 2;
    spinGroup.add(rim);
    return spinGroup;
  };

  const frontSpin = makeWheel();
  forkSteer.add(frontSpin);

  for (const sx of [-1, 1]) {
    const forkTube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.74, 8), chromeMat);
    forkTube.position.set(sx * 0.12, 0.34, -0.1);
    forkTube.rotation.x = -0.34;
    forkSteer.add(forkTube);
  }

  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.68, 8), chromeMat);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 0.68, -0.22);
  forkSteer.add(handlebar);

  const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.1, 14), headLightMat);
  hl.rotation.x = Math.PI / 2;
  hl.position.set(0, 0.56, -0.08);
  forkSteer.add(hl);

  group.add(forkSteer);

  // Rear wheel
  const rearSpin = makeWheel();
  rearSpin.position.set(0, wheelR, rearZ);
  group.add(rearSpin);

  // Kickstand
  const kickstandGroup = new THREE.Group();
  kickstandGroup.position.set(-0.14, 0.28, -0.06);
  const standBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.34, 8), chromeMat);
  standBar.position.set(-0.08, -0.14, 0);
  standBar.rotation.z = -0.45;
  kickstandGroup.add(standBar);
  chassisGroup.add(kickstandGroup);

  // Dummy right steer pivot to keep tuple shape uniform
  const dummyRightSteer = new THREE.Group();

  // Occupant (rider)
  const seatLocal = new THREE.Vector3(0, 0.55, -0.28);
  const occupantGroup = new THREE.Group();
  occupantGroup.position.copy(seatLocal);
  const riderRig = buildHumanCharacter({ shirtColor: 0x1e293b, pantsColor: 0x0f172a });
  setHumanSeatedPose(riderRig, true);
  occupantGroup.add(riderRig.group);
  chassisGroup.add(occupantGroup);

  void isSoftwareGl;

  return {
    group,
    chassisGroup,
    doorPivot: null,
    steeringWheelPivot: null,
    wheelSteerPivots: [forkSteer, dummyRightSteer],
    wheelSpinMeshes: [frontSpin, rearSpin],
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

/**
 * Builds a Sat Productions-inspired urban street light (pole, curved arm, luminaire, emitter).
 */
export function buildStreetLight(lampEmitterMat: THREE.MeshStandardMaterial): THREE.Group {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x262b33, roughness: 0.45, metalness: 0.75 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.55, 10), poleMat);
  base.position.y = 0.275;
  base.castShadow = true;
  group.add(base);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 5.6, 10), poleMat);
  shaft.position.y = 3.05;
  shaft.castShadow = true;
  group.add(shaft);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.45), poleMat);
  arm.position.set(0, 5.82, 0.65);
  arm.rotation.x = -0.12;
  group.add(arm);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.56), poleMat);
  hood.position.set(0, 5.9, 1.3);
  group.add(hood);

  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.42), lampEmitterMat);
  lens.position.set(0, 5.85, 1.3);
  group.add(lens);

  return group;
}

/**
 * Builds a Poly Haven tree_small_02-inspired urban boulevard street tree.
 */
export function buildStreetTree(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4636, roughness: 0.92, metalness: 0.02 });
  const leafMatA = new THREE.MeshStandardMaterial({ color: 0x3b6e3c, roughness: 0.82, metalness: 0.02 });
  const leafMatB = new THREE.MeshStandardMaterial({ color: 0x4b8045, roughness: 0.78, metalness: 0.02 });

  // Concrete tree grate curb
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.12, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x6b7075, roughness: 0.9 })
  );
  curb.position.y = 0.06;
  group.add(curb);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.19, 2.3, 8), trunkMat);
  trunk.position.y = 1.15;
  trunk.castShadow = true;
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
    puff.castShadow = true;
    puff.receiveShadow = true;
    group.add(puff);
  }

  group.scale.setScalar(scale);
  return group;
}
