import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const CIVILIAN_GLB_URL =
  'https://raw.githubusercontent.com/BabylonJS/Assets/master/meshes/HVGirl.glb';

export interface CivilianOutfitTint {
  shirtHex: number;
  shortsHex: number;
  hairHex?: number;
}

export interface CivilianBoneRefs {
  hips: THREE.Bone | null;
  spine: THREE.Bone | null;
  leftArm: THREE.Bone | null;
  rightArm: THREE.Bone | null;
  leftHand: THREE.Bone | null;
  rightHand: THREE.Bone | null;
  leftUpLeg: THREE.Bone | null;
  rightUpLeg: THREE.Bone | null;
  leftLeg: THREE.Bone | null;
  rightLeg: THREE.Bone | null;
  head: THREE.Bone | null;
  neck: THREE.Bone | null;
}

export interface CivilianInstance {
  wrapper: THREE.Group;
  modelScene: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: {
    idle: THREE.AnimationAction | null;
    walk: THREE.AnimationAction | null;
    run: THREE.AnimationAction | null;
  };
  bones: CivilianBoneRefs;
  baseY: number;
  baseScale: number;
}

let civilianTemplatePromise: Promise<GLTF> | null = null;

export function getCivilianTemplate(): Promise<GLTF> {
  if (!civilianTemplatePromise) {
    civilianTemplatePromise = new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(
        CIVILIAN_GLB_URL,
        (gltf) => resolve(gltf),
        undefined,
        (err) => reject(err)
      );
    });
  }
  return civilianTemplatePromise;
}

export async function createCivilianInstance(options: {
  targetHeight: number;
  anisotropy: number;
  isSoftwareGl: boolean;
  outfitTint?: CivilianOutfitTint;
}): Promise<CivilianInstance> {
  const { targetHeight, anisotropy, isSoftwareGl, outfitTint } = options;
  const gltf = await getCivilianTemplate();

  const modelScene = SkeletonUtils.clone(gltf.scene);
  const wrapper = new THREE.Group();
  wrapper.add(modelScene);
  wrapper.updateMatrixWorld(true);

  const rawBox = new THREE.Box3().setFromObject(wrapper);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const scaleFactor = rawSize.y > 0.001 ? targetHeight / rawSize.y : 1;
  wrapper.scale.multiplyScalar(scaleFactor);
  wrapper.updateMatrixWorld(true);

  const normBox = new THREE.Box3().setFromObject(wrapper);
  const normCenter = normBox.getCenter(new THREE.Vector3());
  wrapper.position.set(-normCenter.x, -normBox.min.y, -normCenter.z);
  wrapper.updateMatrixWorld(true);

  const bones: CivilianBoneRefs = {
    hips: null,
    spine: null,
    leftArm: null,
    rightArm: null,
    leftHand: null,
    rightHand: null,
    leftUpLeg: null,
    rightUpLeg: null,
    leftLeg: null,
    rightLeg: null,
    head: null,
    neck: null,
  };

  const clonedMats = new Map<THREE.Material, THREE.Material>();

  modelScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = !isSoftwareGl;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      const mapMat = (orig: THREE.Material): THREE.Material => {
        const existing = clonedMats.get(orig);
        if (existing) return existing;

        const mat = orig.clone();
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
          mat.envMapIntensity = 0.95;

          const name = (mat.name || '').toLowerCase();
          if (outfitTint) {
            if (name.includes('t-shirt') || name.includes('shirt') || name.includes('top')) {
              mat.color.setHex(outfitTint.shirtHex);
            } else if (name.includes('short') || name.includes('pants') || name.includes('bottom')) {
              mat.color.setHex(outfitTint.shortsHex);
            } else if (outfitTint.hairHex !== undefined && name.includes('hair')) {
              mat.color.setHex(outfitTint.hairHex);
            }
          }
        }
        clonedMats.set(orig, mat);
        return mat;
      };

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(mapMat);
      } else if (mesh.material) {
        mesh.material = mapMat(mesh.material);
      }
    }

    if ((child as THREE.Bone).isBone) {
      const bone = child as THREE.Bone;
      const n = bone.name.toLowerCase().replace(/^mixamorig[:_]?/, '');
      if (!bones.hips && n === 'hips') bones.hips = bone;
      else if (!bones.spine && (n === 'spine' || n === 'spine1' || n === 'spine2')) bones.spine = bone;
      else if (!bones.leftArm && (n === 'leftarm' || n === 'upperarm_l')) bones.leftArm = bone;
      else if (!bones.rightArm && (n === 'rightarm' || n === 'upperarm_r')) bones.rightArm = bone;
      else if (!bones.leftHand && (n === 'lefthand' || n === 'hand_l')) bones.leftHand = bone;
      else if (!bones.rightHand && (n === 'righthand' || n === 'hand_r')) bones.rightHand = bone;
      else if (!bones.leftUpLeg && (n === 'leftupleg' || n === 'thigh_l')) bones.leftUpLeg = bone;
      else if (!bones.rightUpLeg && (n === 'rightupleg' || n === 'thigh_r')) bones.rightUpLeg = bone;
      else if (!bones.leftLeg && (n === 'leftleg' || n === 'calf_l')) bones.leftLeg = bone;
      else if (!bones.rightLeg && (n === 'rightleg' || n === 'calf_r')) bones.rightLeg = bone;
      else if (!bones.head && n === 'head') bones.head = bone;
      else if (!bones.neck && n === 'neck') bones.neck = bone;
    }
  });

  const mixer = new THREE.AnimationMixer(modelScene);
  const clips = gltf.animations ?? [];
  const idleClip =
    THREE.AnimationClip.findByName(clips, 'Idle') ?? clips.find((c) => /idle/i.test(c.name)) ?? null;
  const walkClip =
    THREE.AnimationClip.findByName(clips, 'Walking') ??
    THREE.AnimationClip.findByName(clips, 'Walk') ??
    clips.find((c) => /walk/i.test(c.name)) ??
    null;
  const runClip =
    THREE.AnimationClip.findByName(clips, 'Run') ?? clips.find((c) => /run|sprint|jog/i.test(c.name)) ?? null;

  const idle = idleClip ? mixer.clipAction(idleClip) : null;
  const walk = walkClip ? mixer.clipAction(walkClip) : null;
  const run = runClip ? mixer.clipAction(runClip) : null;

  return {
    wrapper,
    modelScene,
    mixer,
    actions: { idle, walk, run },
    bones,
    baseY: wrapper.position.y,
    baseScale: wrapper.scale.x,
  };
}
