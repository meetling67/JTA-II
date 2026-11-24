import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VehicleKind } from './types';

export const CAR_CONCEPT_GLB_URL =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb';

const TARGET_CAR_LENGTH = 4.2;

let carTemplatePromise: Promise<THREE.Group> | null = null;

function getCarConceptTemplate(): Promise<THREE.Group> {
  if (!carTemplatePromise) {
    carTemplatePromise = new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(
        CAR_CONCEPT_GLB_URL,
        (gltf) => {
          resolve(gltf.scene);
        },
        undefined,
        (err) => {
          reject(err);
        }
      );
    });
  }
  return carTemplatePromise;
}

export interface CarConceptAttachOptions {
  kind: VehicleKind;
  paintColor: number;
  anisotropy: number;
  isSoftwareGl: boolean;
  chassisGroup: THREE.Group;
  fallbackBodyGroup: THREE.Group;
  wheelSteerPivots: [THREE.Group, THREE.Group];
  wheelSpinMeshes: THREE.Group[];
  windowMeshes: THREE.Mesh[];
  headLightMat: THREE.MeshStandardMaterial;
  tailLightMat: THREE.MeshStandardMaterial;
  seatLocal: THREE.Vector3;
  cockpitEyeLocal: THREE.Vector3;
  occupantGroup: THREE.Group;
  policeLightbarGroup?: THREE.Group;
}

function disposeGroupMeshes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m?.dispose();
      }
    }
  });
}

function clearGroupChildren(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeGroupMeshes(child);
  }
}

/**
 * Attaches a normalized (~4.2 units long) CarConcept.glb instance onto an existing VehicleRig,
 * preserving hitboxes, suspension chassisGroup, steering/spinning wheels, brake/headlights,
 * and police lightbars without changing any physics or gameplay mechanics.
 */
export function attachCarConceptToRig(opts: CarConceptAttachOptions): void {
  const {
    kind,
    paintColor,
    anisotropy,
    isSoftwareGl,
    chassisGroup,
    fallbackBodyGroup,
    wheelSteerPivots,
    wheelSpinMeshes,
    windowMeshes,
    headLightMat,
    tailLightMat,
    seatLocal,
    cockpitEyeLocal,
    occupantGroup,
    policeLightbarGroup,
  } = opts;

  getCarConceptTemplate()
    .then((template) => {
      // Guard in case the vehicle rig was already disposed/removed before load completed
      if (!chassisGroup.parent) return;
      windowMeshes.length = 0;

      const carClone = template.clone(true);
      carClone.updateMatrixWorld(true);

      // Auto-scale CarConcept.glb so its length along Z is ~4.2 units
      const rawBox = new THREE.Box3().setFromObject(carClone);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const scaleFactor = rawSize.z > 0.01 ? TARGET_CAR_LENGTH / rawSize.z : 1;

      const modelWrapper = new THREE.Group();
      carClone.scale.multiplyScalar(scaleFactor);
      modelWrapper.add(carClone);
      modelWrapper.updateMatrixWorld(true);

      // Center X/Z at 0 and ground bottom of tires at y = 0
      const normBox = new THREE.Box3().setFromObject(modelWrapper);
      const normCenter = normBox.getCenter(new THREE.Vector3());
      carClone.position.set(-normCenter.x, -normBox.min.y, -normCenter.z);
      modelWrapper.updateMatrixWorld(true);

      // Cache cloned materials per original material so each car has unique paint tint & reflections
      const clonedMatMap = new Map<THREE.Material, THREE.Material>();

      modelWrapper.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        mesh.castShadow = !isSoftwareGl;
        mesh.receiveShadow = true;

        const mapSingleMaterial = (origMat: THREE.Material): THREE.Material => {
          const matName = origMat.name || '';

          if (/^Headlight$/i.test(matName)) {
            return headLightMat;
          }
          if (/^Brakelight$/i.test(matName)) {
            return tailLightMat;
          }

          const existing = clonedMatMap.get(origMat);
          if (existing) return existing;

          const cloned = origMat.clone();

          if (cloned instanceof THREE.MeshStandardMaterial) {
            for (const tex of [cloned.map, cloned.emissiveMap]) {
              if (tex) {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = anisotropy;
                tex.needsUpdate = true;
              }
            }
            for (const linTex of [cloned.roughnessMap, cloned.metalnessMap, cloned.normalMap, cloned.bumpMap]) {
              if (linTex) {
                linTex.colorSpace = THREE.NoColorSpace;
                linTex.anisotropy = anisotropy;
                linTex.needsUpdate = true;
              }
            }

            if (/^Paint\s*1/i.test(matName)) {
              const targetColor = kind === 'police' ? 0x0f131a : paintColor;
              cloned.color.setHex(targetColor);
              cloned.roughness = kind === 'supercar' || kind === 'convertible' ? 0.14 : 0.18;
              cloned.metalness = 0.72;
              cloned.envMapIntensity = 1.5;
              if (cloned instanceof THREE.MeshPhysicalMaterial) {
                cloned.clearcoat = 1.0;
                cloned.clearcoatRoughness = 0.05;
              }
            } else if (/^Paint\s*2/i.test(matName)) {
              if (kind === 'police') {
                cloned.color.setHex(0xf8fafc);
              } else {
                cloned.color.setHex(paintColor).multiplyScalar(0.82);
              }
              cloned.roughness = 0.2;
              cloned.metalness = 0.55;
              cloned.envMapIntensity = 1.35;
              if (cloned instanceof THREE.MeshPhysicalMaterial) {
                cloned.clearcoat = 1.0;
                cloned.clearcoatRoughness = 0.06;
              }
            } else if (/^Glass$/i.test(matName)) {
              cloned.color.setHex(0x8dc9ec);
              cloned.roughness = 0.05;
              cloned.metalness = 0.15;
              cloned.transparent = true;
              cloned.opacity = isSoftwareGl ? 0.36 : 0.42;
              cloned.depthWrite = false;
              cloned.envMapIntensity = 1.6;
              mesh.userData.carPart = 'window';
              if (!windowMeshes.includes(mesh)) {
                windowMeshes.push(mesh);
              }
            } else if (/Rim/i.test(matName)) {
              cloned.envMapIntensity = 1.4;
              cloned.metalness = Math.max(cloned.metalness, 0.8);
            } else if (/Mirror/i.test(matName)) {
              cloned.envMapIntensity = 1.6;
            } else {
              cloned.envMapIntensity = Math.max(cloned.envMapIntensity || 1.0, 0.9);
            }
          }

          clonedMatMap.set(origMat, cloned);
          return cloned;
        };

        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(mapSingleMaterial);
        } else if (mesh.material) {
          mesh.material = mapSingleMaterial(mesh.material);
        }
      });

      // Extract CarConcept's 4 wheel groups into wheelSteerPivots / wheelSpinMeshes so steering & wheel spin work cleanly
      const wheelSpecs: {
        name: string;
        spinGroup: THREE.Group;
        steerPivot?: THREE.Group;
      }[] = [
        { name: 'WheelFrontL', spinGroup: wheelSpinMeshes[0], steerPivot: wheelSteerPivots[0] },
        { name: 'WheelFrontR', spinGroup: wheelSpinMeshes[1], steerPivot: wheelSteerPivots[1] },
        { name: 'WheelRearL', spinGroup: wheelSpinMeshes[2] },
        { name: 'WheelRearR', spinGroup: wheelSpinMeshes[3] },
      ];

      modelWrapper.updateMatrixWorld(true);
      for (let wi = 0; wi < wheelSpecs.length; wi++) {
        const spec = wheelSpecs[wi];
        const wheelObj = modelWrapper.getObjectByName(spec.name);
        if (!wheelObj) continue;

        const wBox = new THREE.Box3().setFromObject(wheelObj);
        const wCenter = wBox.getCenter(new THREE.Vector3());

        // Clear procedural wheel meshes inside spinGroup
        clearGroupChildren(spec.spinGroup);

        if (spec.steerPivot) {
          spec.steerPivot.position.copy(wCenter);
          spec.spinGroup.position.set(0, 0, 0);
        } else {
          spec.spinGroup.position.copy(wCenter);
        }
        spec.spinGroup.userData.restY = spec.spinGroup.position.y;
        spec.spinGroup.userData.carPart = 'wheel';
        spec.spinGroup.userData.wheelIndex = wi;

        // Reparent wheel children relative to exact wheel center so x-axis spin is true
        const children = [...wheelObj.children];
        for (const ch of children) {
          ch.updateMatrixWorld(true);
          const worldMat = ch.matrixWorld.clone();
          ch.parent?.remove(ch);
          ch.position.set(0, 0, 0);
          ch.rotation.set(0, 0, 0);
          ch.scale.set(1, 1, 1);
          ch.applyMatrix4(worldMat);
          ch.position.sub(wCenter);
          ch.traverse((node) => {
            node.userData.carPart = 'wheel';
            node.userData.wheelIndex = wi;
          });
          spec.spinGroup.add(ch);
        }
      }

      // Align police roof lightbar and driver seat cleanly inside CarConcept's cabin
      const finalBox = new THREE.Box3().setFromObject(modelWrapper);
      if (policeLightbarGroup) {
        policeLightbarGroup.position.set(0, finalBox.max.y - 0.02, -0.15);
      }

      // CarConcept has a centered steering column (x = 0) and roof top ~1.12m:
      // seat the driver cleanly behind the wheel looking out the windshield
      const cabinSeatY = Math.max(0.18, finalBox.max.y - 0.88);
      seatLocal.set(0, cabinSeatY, 0.04);
      cockpitEyeLocal.set(0, Math.min(0.86, finalBox.max.y - 0.22), 0.06);
      occupantGroup.position.copy(seatLocal);
      occupantGroup.scale.setScalar(0.62);

      // Swap out procedural placeholder body meshes
      chassisGroup.remove(fallbackBodyGroup);
      disposeGroupMeshes(fallbackBodyGroup);

      chassisGroup.add(modelWrapper);
    })
    .catch((err) => {
      console.warn(`[CarGltf] Failed to load ${CAR_CONCEPT_GLB_URL}, keeping fallback car body.`, err);
    });
}
