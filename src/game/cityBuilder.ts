import * as THREE from 'three';
import { BoxCollider, SidewalkPad } from './types';
import {
  createAsphaltTexture,
  createBuildingFacadeTexture,
  createCrosswalkTexture,
  createSidewalkTexture,
  createWaterTexture,
} from './textures';
import { buildStreetLight, buildStreetTree } from './models';

export interface CityMapData {
  cityGroup: THREE.Group;
  colliders: BoxCollider[];
  sidewalks: SidewalkPad[];
  trafficLoops: THREE.Vector3[][];
  pedestrianLoops: THREE.Vector3[][];
  buildingMaterials: THREE.MeshStandardMaterial[];
  lampEmitterMaterial: THREE.MeshStandardMaterial;
  waterMesh: THREE.Mesh;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * Reconstructs Paradise Heat's CityDistrict10x_Day / CityDistrict10x_Night layout:
 * - Multi-lane asphalt avenues & cross-streets (x in [-115..115], z in [-65..75])
 * - 16cm-20cm raised concrete sidewalks & curbs around city blocks
 * - City Sample-inspired towers, storefronts, awnings, rooftop HVAC units
 * - South Waterfront Promenade & protective rail overlooking ocean water
 * - Sat Productions streetlamps & Poly Haven boulevard street trees
 * - Closed traffic lane loops & sidewalk pedestrian loops
 */
export function buildCityDistrict(anisotropy: number): CityMapData {
  const cityGroup = new THREE.Group();
  const colliders: BoxCollider[] = [];
  const sidewalks: SidewalkPad[] = [];
  const buildingMaterials: THREE.MeshStandardMaterial[] = [];

  const asphaltTex = createAsphaltTexture(anisotropy, true);
  const intersectionTex = createAsphaltTexture(anisotropy, false);
  const crosswalkTex = createCrosswalkTexture(anisotropy);
  const sidewalkTex = createSidewalkTexture(anisotropy);
  const waterTex = createWaterTexture(anisotropy);

  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.84,
    metalness: 0.05,
  });
  const intersectionMat = new THREE.MeshStandardMaterial({
    map: intersectionTex,
    roughness: 0.84,
    metalness: 0.05,
  });
  const crosswalkMat = new THREE.MeshStandardMaterial({
    map: crosswalkTex,
    roughness: 0.8,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: sidewalkTex,
    roughness: 0.9,
    metalness: 0.03,
  });
  const lampEmitterMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe4b5,
    emissive: 0xffb347,
    emissiveIntensity: 0,
    roughness: 0.25,
  });

  // 1. Base City Ground Plane & Road Network
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(360, 260),
    new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.92 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, 10);
  ground.receiveShadow = true;
  cityGroup.add(ground);

  // Road grid centers:
  // East-West avenues at Z = -28, Z = +12, Z = +54 (boulevard width 14m)
  // North-South streets at X = -72, X = -24, X = +24, X = +72 (width 14m)
  const ewZ = [-28, 12, 54];
  const nsX = [-72, -24, 24, 72];

  // East-West asphalt strips
  for (const z of ewZ) {
    for (let x = -108; x <= 108; x += 24) {
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), asphaltMat);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = Math.PI / 2;
      seg.position.set(x, 0.0, z);
      seg.receiveShadow = true;
      cityGroup.add(seg);
    }
  }

  // North-South asphalt strips
  for (const x of nsX) {
    for (let z = -52; z <= 76; z += 24) {
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(14, 24), asphaltMat);
      seg.rotation.x = -Math.PI / 2;
      seg.position.set(x, 0.004, z);
      seg.receiveShadow = true;
      cityGroup.add(seg);
    }
  }

  // Intersections (clean asphalt + crosswalks)
  for (const x of nsX) {
    for (const z of ewZ) {
      const inter = new THREE.Mesh(new THREE.PlaneGeometry(14.2, 14.2), intersectionMat);
      inter.rotation.x = -Math.PI / 2;
      inter.position.set(x, 0.01, z);
      inter.receiveShadow = true;
      cityGroup.add(inter);

      // 4 crosswalks per intersection
      const cwOffsets: [number, number, number][] = [
        [0, 8.2, 0],
        [0, -8.2, 0],
        [8.2, 0, Math.PI / 2],
        [-8.2, 0, Math.PI / 2],
      ];
      for (const [ox, oz, rot] of cwOffsets) {
        const cw = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 2.4), crosswalkMat);
        cw.rotation.x = -Math.PI / 2;
        cw.rotation.z = rot;
        cw.position.set(x + ox, 0.015, z + oz);
        cw.receiveShadow = true;
        cityGroup.add(cw);
      }
    }
  }

  // 2. Waterfront Promenade (South edge at Z = -35 to -52) + Ocean Water
  const promenade = new THREE.Mesh(new THREE.BoxGeometry(248, 0.2, 16), sidewalkMat);
  promenade.position.set(0, 0.1, -43);
  promenade.receiveShadow = true;
  cityGroup.add(promenade);
  sidewalks.push({ minX: -124, maxX: 124, minZ: -51, maxZ: -35, height: 0.2 });

  // Waterfront safety railing (matches DistrictGeometry.cpp "waterfront rail")
  const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.35, metalness: 0.8 });
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(246, 0.08, 0.08), railMat);
  topRail.position.set(0, 1.15, -50.6);
  cityGroup.add(topRail);
  const midRail = new THREE.Mesh(new THREE.BoxGeometry(246, 0.05, 0.06), railMat);
  midRail.position.set(0, 0.65, -50.6);
  cityGroup.add(midRail);
  for (let x = -120; x <= 120; x += 6) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), railMat);
    post.position.set(x, 0.68, -50.6);
    cityGroup.add(post);
  }
  colliders.push({ minX: -124, maxX: 124, minZ: -51.4, maxZ: -50.2, topY: 1.4, label: 'Waterfront Rail' });

  // Ocean water extending to horizon
  const waterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 500),
    new THREE.MeshPhysicalMaterial({
      map: waterTex,
      color: 0x168aad,
      roughness: 0.16,
      metalness: 0.1,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    })
  );
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(0, -0.45, -300);
  cityGroup.add(waterMesh);

  // 3. City Blocks (Raised Sidewalks + Multi-part Architectural Towers + Streetlights + Trees)
  const blockXCenters = [-96, -48, 0, 48, 96];
  const blockZSpans: [number, number][] = [
    [-21, 5],   // Waterfront row blocks (depth 26m)
    [19, 47],   // Midtown row blocks (depth 28m)
    [61, 88],   // Uptown perimeter row
  ];

  const facadeStyles = [
    { wall: '#c7b8a3', win: '#3b6078', lit: 0.36 }, // Warm limestone & teal glass
    { wall: '#8f9aa6', win: '#2a4a66', lit: 0.44 }, // Modern steel tower
    { wall: '#b8765c', win: '#3a4b5c', lit: 0.28 }, // Terracotta brick
    { wall: '#d9d4cb', win: '#44708a', lit: 0.48 }, // Coastal art deco stucco
    { wall: '#555e6b', win: '#6395b8', lit: 0.52 }, // Dark curtainwall
  ];

  let styleCursor = 0;

  for (let bzIdx = 0; bzIdx < blockZSpans.length; bzIdx++) {
    const [zMin, zMax] = blockZSpans[bzIdx];
    const padDepth = zMax - zMin;
    const padZ = (zMin + zMax) * 0.5;

    for (let bxIdx = 0; bxIdx < blockXCenters.length; bxIdx++) {
      const cx = blockXCenters[bxIdx];
      const padWidth = 34;

      // Raised 18cm sidewalk pad (matches "real 16cm sidewalk and 20cm curb")
      const pad = new THREE.Mesh(new THREE.BoxGeometry(padWidth, 0.18, padDepth), sidewalkMat);
      pad.position.set(cx, 0.09, padZ);
      pad.receiveShadow = true;
      cityGroup.add(pad);
      sidewalks.push({
        minX: cx - padWidth * 0.5,
        maxX: cx + padWidth * 0.5,
        minZ: zMin,
        maxZ: zMax,
        height: 0.18,
      });

      // Leave the central plaza block at (0, -8) slightly more open as a park/plaza with trees!
      const isCentralPlaza = cx === 0 && bzIdx === 0;

      if (isCentralPlaza) {
        // Central Coastal Plaza (Player Spawn area with palm/street trees & kiosk)
        const plazaPlanter = new THREE.Mesh(
          new THREE.BoxGeometry(10, 0.45, 8),
          new THREE.MeshStandardMaterial({ color: 0x7c8087, roughness: 0.85 })
        );
        plazaPlanter.position.set(0, 0.32, -8);
        plazaPlanter.castShadow = true;
        plazaPlanter.receiveShadow = true;
        cityGroup.add(plazaPlanter);
        colliders.push({ minX: -5.1, maxX: 5.1, minZ: -12.1, maxZ: -3.9, topY: 0.65 });

        for (const [tx, tz] of [
          [-11, -15],
          [11, -15],
          [-11, -1],
          [11, -1],
        ]) {
          const tree = buildStreetTree(1.08);
          tree.position.set(tx, 0.18, tz);
          cityGroup.add(tree);
          colliders.push({ minX: tx - 0.55, maxX: tx + 0.55, minZ: tz - 0.55, maxZ: tz + 0.55, topY: 4.5 });
        }
      } else {
        // Two architectural buildings per city block
        const bPositions: [number, number, number, number][] = [
          [cx - 7.5, padZ, 11.5, padDepth - 8],
          [cx + 7.5, padZ, 11.5, padDepth - 8],
        ];

        for (const [bx, bz, bw, bd] of bPositions) {
          const style = facadeStyles[styleCursor % facadeStyles.length];
          styleCursor++;
          const floors = 4 + ((styleCursor * 7 + bxIdx * 3 + bzIdx * 5) % 8);
          const bh = floors * 3.4;

          const texSet = createBuildingFacadeTexture(anisotropy, style.wall, style.win, style.lit);
          const bMat = new THREE.MeshStandardMaterial({
            map: texSet.map,
            emissiveMap: texSet.emissiveMap,
            emissive: new THREE.Color(0xffe1a8),
            emissiveIntensity: 0,
            roughness: 0.72,
            metalness: 0.1,
          });
          buildingMaterials.push(bMat);

          // Main tower body
          const tower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bMat);
          tower.position.set(bx, 0.18 + bh * 0.5, bz);
          tower.castShadow = true;
          tower.receiveShadow = true;
          cityGroup.add(tower);

          // Ground-floor storefront canopy/awning
          const awning = new THREE.Mesh(
            new THREE.BoxGeometry(bw + 0.8, 0.28, bd + 0.8),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.35 })
          );
          awning.position.set(bx, 3.3, bz);
          awning.castShadow = true;
          cityGroup.add(awning);

          // Rooftop parapet & HVAC unit
          const roofUnit = new THREE.Mesh(
            new THREE.BoxGeometry(bw * 0.45, 1.3, bd * 0.42),
            new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.65, metalness: 0.4 })
          );
          roofUnit.position.set(bx, 0.18 + bh + 0.65, bz);
          cityGroup.add(roofUnit);

          colliders.push({
            minX: bx - bw * 0.5 - 0.2,
            maxX: bx + bw * 0.5 + 0.2,
            minZ: bz - bd * 0.5 - 0.2,
            maxZ: bz + bd * 0.5 + 0.2,
            topY: 0.18 + bh,
          });
        }

        // Corner streetlamp & tree on block corners
        const lamp = buildStreetLight(lampEmitterMaterial);
        lamp.position.set(cx - padWidth * 0.5 + 1.1, 0.18, zMin + 1.2);
        lamp.rotation.y = Math.PI;
        cityGroup.add(lamp);

        const lamp2 = buildStreetLight(lampEmitterMaterial);
        lamp2.position.set(cx + padWidth * 0.5 - 1.1, 0.18, zMax - 1.2);
        cityGroup.add(lamp2);

        const tree = buildStreetTree(0.95 + (styleCursor % 3) * 0.08);
        tree.position.set(cx + padWidth * 0.5 - 1.6, 0.18, zMin + 2.4);
        cityGroup.add(tree);
      }
    }
  }

  // 4. Outer District Perimeter Skyline (non-playable background silhouette + boundary curbs)
  const boundaryMat = new THREE.MeshStandardMaterial({ color: 0x3f4652, roughness: 0.8 });
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 150), boundaryMat);
  eastWall.position.set(118, 0.55, 18);
  cityGroup.add(eastWall);
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 150), boundaryMat);
  westWall.position.set(-118, 0.55, 18);
  cityGroup.add(westWall);

  // 5. Traffic Loops along city lanes (right-hand driving)
  const trafficLoops: THREE.Vector3[][] = [
    // Outer loop: South Waterfront Blvd (X: -75.5..+68.5) & Midtown Blvd
    [
      new THREE.Vector3(-68.5, 0, -31.5),
      new THREE.Vector3(68.5, 0, -31.5),
      new THREE.Vector3(68.5, 0, 57.5),
      new THREE.Vector3(-68.5, 0, 57.5),
    ],
    // Inner clockwise loop around central blocks
    [
      new THREE.Vector3(-27.5, 0, 8.5),
      new THREE.Vector3(27.5, 0, 8.5),
      new THREE.Vector3(27.5, 0, -24.5),
      new THREE.Vector3(-27.5, 0, -24.5),
    ],
    // Mid-east loop
    [
      new THREE.Vector3(20.5, 0, 15.5),
      new THREE.Vector3(75.5, 0, 15.5),
      new THREE.Vector3(75.5, 0, 50.5),
      new THREE.Vector3(20.5, 0, 50.5),
    ],
  ];

  // 6. Sidewalk Pedestrian Loops
  const pedestrianLoops: THREE.Vector3[][] = [
    // Waterfront promenade stroll
    [
      new THREE.Vector3(-85, 0.2, -39),
      new THREE.Vector3(85, 0.2, -39),
      new THREE.Vector3(85, 0.2, -47),
      new THREE.Vector3(-85, 0.2, -47),
    ],
    // Central Plaza loop
    [
      new THREE.Vector3(-15, 0.18, -19),
      new THREE.Vector3(15, 0.18, -19),
      new THREE.Vector3(15, 0.18, 3),
      new THREE.Vector3(-15, 0.18, 3),
    ],
    // West block sidewalk loop
    [
      new THREE.Vector3(-63, 0.18, -19),
      new THREE.Vector3(-33, 0.18, -19),
      new THREE.Vector3(-33, 0.18, 3),
      new THREE.Vector3(-63, 0.18, 3),
    ],
    // East block sidewalk loop
    [
      new THREE.Vector3(33, 0.18, -19),
      new THREE.Vector3(63, 0.18, -19),
      new THREE.Vector3(63, 0.18, 3),
      new THREE.Vector3(33, 0.18, 3),
    ],
  ];

  return {
    cityGroup,
    colliders,
    sidewalks,
    trafficLoops,
    pedestrianLoops,
    buildingMaterials,
    lampEmitterMaterial,
    waterMesh,
    bounds: { minX: -116, maxX: 116, minZ: -49.5, maxZ: 88 },
  };
}
