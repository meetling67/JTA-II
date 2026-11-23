import * as THREE from 'three';
import { buildHumanCharacter, buildWeaponMesh, HumanRig, setHumanSeatedPose, WeaponMeshRig } from './models';
import { CivilianBoneRefs, createCivilianInstance } from './civilianGltf';
import { WeaponKind } from './types';

export interface PlayerAnimState {
  horizSpeed: number;
  isGrounded: boolean;
  isSprinting: boolean;
  isPunching: boolean;
  punchProgress: number;
  isEntering: boolean;
  isSeated: boolean;
  isBike: boolean;
  vehicleForwardSpeed: number;
  isDead?: boolean;
  isAiming?: boolean;
  isShooting?: boolean;
}

const _charRightWorld = new THREE.Vector3();
const _charUpWorld = new THREE.Vector3(0, 1, 0);

export class PlayerCharacterController {
  public readonly group = new THREE.Group();

  private modelRoot: THREE.Group | null = null;
  private modelScene: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private activeAction: THREE.AnimationAction | null = null;

  private baseY = 0;
  private baseScale = 1;
  private seated = false;
  private onBike = false;
  private disposed = false;
  private anisotropy = 4;

  private bones: CivilianBoneRefs = {
    hips: null,
    spine: null,
    leftArm: null,
    rightArm: null,
    leftUpLeg: null,
    rightUpLeg: null,
    leftLeg: null,
    rightLeg: null,
  };

  private fallbackRig: HumanRig | null = null;
  private walkPhase = 0;

  private equippedWeapon: WeaponKind = 'unarmed';
  private weaponMount = new THREE.Group();
  private weaponRigs: Record<'pistol' | 'smg' | 'rifle', WeaponMeshRig>;
  private muzzleFlashTimer = 0;
  private currentOutfit = { shirtHex: 0xe66a2c, shortsHex: 0x1e293b, hairHex: 0x241913 };

  constructor(options: {
    isSoftwareGl: boolean;
    anisotropy: number;
    onLoaded?: () => void;
    onLoadError?: (error: unknown) => void;
  }) {
    const { isSoftwareGl, anisotropy, onLoaded, onLoadError } = options;
    this.anisotropy = anisotropy;

    this.weaponMount.position.set(-0.21, 1.24, 0.28);
    this.group.add(this.weaponMount);

    this.weaponRigs = {
      pistol: buildWeaponMesh('pistol'),
      smg: buildWeaponMesh('smg'),
      rifle: buildWeaponMesh('rifle'),
    };
    for (const k of ['pistol', 'smg', 'rifle'] as const) {
      this.weaponRigs[k].group.visible = false;
      this.weaponMount.add(this.weaponRigs[k].group);
    }

    createCivilianInstance({
      targetHeight: 1.74,
      anisotropy,
      isSoftwareGl,
    })
      .then((inst) => {
        if (this.disposed) {
          inst.mixer.stopAllAction();
          inst.mixer.uncacheRoot(inst.modelScene);
          this.disposeObject(inst.wrapper);
          return;
        }
        if (this.fallbackRig) {
          this.group.remove(this.fallbackRig.group);
          this.disposeObject(this.fallbackRig.group);
          this.fallbackRig = null;
        }

        this.modelRoot = inst.wrapper;
        this.modelScene = inst.modelScene;
        this.mixer = inst.mixer;
        this.idleAction = inst.actions.idle;
        this.walkAction = inst.actions.walk;
        this.runAction = inst.actions.run;
        this.bones = inst.bones;
        this.baseY = inst.baseY;
        this.baseScale = inst.baseScale;

        this.group.add(inst.wrapper);

        if (this.idleAction) {
          this.idleAction.play();
          this.activeAction = this.idleAction;
        } else if (this.walkAction) {
          this.walkAction.play();
          this.activeAction = this.walkAction;
        }

        this.applySeatedTransform();
        this.applyOutfitColorsToScene();
        onLoaded?.();
      })
      .catch((err) => {
        if (this.disposed) return;
        console.warn('[PlayerCharacter] Failed to load civilian GLB, activating fallback rig.', err);
        this.activateFallbackRig(isSoftwareGl);
        onLoadError?.(err);
      });
  }

  private activateFallbackRig(isSoftwareGl: boolean): void {
    if (this.fallbackRig || this.modelRoot) return;
    this.fallbackRig = buildHumanCharacter({
      shirtColor: 0xe66a2c,
      pantsColor: 0x1e293b,
      hairColor: 0x241913,
      eyeColor: '#2563eb',
      hairStyle: 'pompadour',
      facialHair: 'none',
      anisotropy: this.anisotropy,
      isPlayer: true,
    });
    if (isSoftwareGl) {
      this.fallbackRig.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).castShadow = false;
        }
      });
    }
    this.group.add(this.fallbackRig.group);
    this.applyFallbackSeatedPose();
  }

  private applyFallbackSeatedPose(): void {
    if (!this.fallbackRig) return;
    setHumanSeatedPose(this.fallbackRig, this.seated);
    if (this.seated && !this.onBike) {
      this.fallbackRig.group.scale.setScalar(0.64);
      this.fallbackRig.group.position.y = -0.34;
    } else {
      this.fallbackRig.group.scale.setScalar(1);
      this.fallbackRig.group.position.y = 0;
    }
  }

  public setSeated(seated: boolean, isBike = false): void {
    this.seated = seated;
    this.onBike = isBike;
    this.applySeatedTransform();
    this.applyFallbackSeatedPose();
    this.updateWeaponVisibility();
  }

  public setEquippedWeapon(kind: WeaponKind): void {
    this.equippedWeapon = kind;
    this.updateWeaponVisibility();
  }

  public triggerMuzzleFlash(): void {
    if (this.equippedWeapon === 'unarmed') return;
    this.muzzleFlashTimer = 0.075;
    const rig = this.weaponRigs[this.equippedWeapon];
    rig.muzzleFlashMesh.visible = true;
    rig.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
  }

  public getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    if (this.equippedWeapon !== 'unarmed') {
      const rig = this.weaponRigs[this.equippedWeapon];
      out.set(0, 0.016, rig.muzzleOffsetZ);
      rig.group.localToWorld(out);
    } else {
      out.set(0, 1.25, 0.45);
      this.group.localToWorld(out);
    }
    return out;
  }

  public setOutfitColors(shirtHex: number, shortsHex: number, hairHex?: number): void {
    this.currentOutfit = {
      shirtHex,
      shortsHex,
      hairHex: hairHex ?? this.currentOutfit.hairHex,
    };
    this.applyOutfitColorsToScene();
  }

  private applyOutfitColorsToScene(): void {
    const { shirtHex, shortsHex, hairHex } = this.currentOutfit;
    if (this.modelScene) {
      this.modelScene.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          const name = (mat.name || '').toLowerCase();
          if (name.includes('t-shirt') || name.includes('shirt') || name.includes('top')) {
            mat.color.setHex(shirtHex);
          } else if (name.includes('short') || name.includes('pants') || name.includes('bottom')) {
            mat.color.setHex(shortsHex);
          } else if (name.includes('hair')) {
            mat.color.setHex(hairHex);
          }
        }
      });
    }
  }

  private updateWeaponVisibility(): void {
    const show = !this.seated && this.equippedWeapon !== 'unarmed';
    this.weaponMount.visible = show;
    for (const k of ['pistol', 'smg', 'rifle'] as const) {
      this.weaponRigs[k].group.visible = show && this.equippedWeapon === k;
      if (!this.weaponRigs[k].group.visible) {
        this.weaponRigs[k].muzzleFlashMesh.visible = false;
      }
    }
  }

  private applySeatedTransform(): void {
    if (!this.modelRoot) return;
    if (this.seated) {
      if (this.onBike) {
        this.modelRoot.scale.setScalar(this.baseScale * 0.92);
        this.modelRoot.position.y = this.baseY - 0.28;
      } else {
        // Scale and tuck seated body cleanly inside the car cabin below the roof line
        const seatScale = 0.62;
        this.modelRoot.scale.setScalar(this.baseScale * seatScale);
        this.modelRoot.position.y = this.baseY * seatScale - 0.36;
      }
    } else {
      this.modelRoot.scale.setScalar(this.baseScale);
      this.modelRoot.position.y = this.baseY;
    }
  }

  private crossfadeTo(nextAction: THREE.AnimationAction, duration = 0.16): void {
    if (this.activeAction === nextAction) return;

    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.play();

    if (this.activeAction) {
      this.activeAction.crossFadeTo(nextAction, duration, true);
    }
    this.activeAction = nextAction;
  }

  public update(dt: number, state: PlayerAnimState): void {
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
      if (this.muzzleFlashTimer <= 0) {
        for (const k of ['pistol', 'smg', 'rifle'] as const) {
          this.weaponRigs[k].muzzleFlashMesh.visible = false;
        }
      }
    }

    // 1. Civilian GLB + AnimationMixer path
    if (this.mixer && this.modelRoot) {
      if (state.isDead) {
        this.weaponMount.visible = false;
        if (this.idleAction) {
          this.crossfadeTo(this.idleAction, 0.15);
          this.idleAction.paused = true;
        }
        this.mixer.update(dt);
        this.modelRoot.rotation.x = THREE.MathUtils.damp(this.modelRoot.rotation.x, -Math.PI * 0.47, 9, dt);
        this.modelRoot.rotation.z = THREE.MathUtils.damp(this.modelRoot.rotation.z, 0.22, 9, dt);
        this.modelRoot.position.y = THREE.MathUtils.damp(this.modelRoot.position.y, this.baseY + 0.14, 9, dt);
        return;
      }
      this.updateWeaponVisibility();

      if (!this.seated && (Math.abs(this.modelRoot.rotation.x) > 0.002 || Math.abs(this.modelRoot.rotation.z) > 0.002)) {
        this.modelRoot.rotation.x = THREE.MathUtils.damp(this.modelRoot.rotation.x, 0, 12, dt);
        this.modelRoot.rotation.z = THREE.MathUtils.damp(this.modelRoot.rotation.z, 0, 12, dt);
        this.modelRoot.position.y = THREE.MathUtils.damp(this.modelRoot.position.y, this.baseY, 12, dt);
      }

      const isMoving = state.horizSpeed > 0.25 || state.isEntering;

      if (state.isSeated) {
        if (this.idleAction) {
          this.idleAction.paused = false;
          this.idleAction.timeScale = 0.75;
          this.crossfadeTo(this.idleAction, 0.2);
        }
      } else if (isMoving) {
        const wantRun = state.isSprinting || state.horizSpeed > 4.4;
        if (wantRun && this.runAction) {
          this.runAction.paused = false;
          this.runAction.timeScale = THREE.MathUtils.clamp(state.horizSpeed / 5.4, 0.9, 1.35);
          this.crossfadeTo(this.runAction, 0.15);
        } else if (this.walkAction) {
          this.walkAction.paused = false;
          this.walkAction.timeScale = wantRun
            ? THREE.MathUtils.clamp(state.horizSpeed / 3.4, 1.35, 1.85)
            : THREE.MathUtils.clamp(state.horizSpeed / 2.6, 0.8, 1.3);
          this.crossfadeTo(this.walkAction, 0.15);
        }
      } else if (this.idleAction) {
        this.idleAction.paused = false;
        this.idleAction.timeScale = 1.0;
        this.crossfadeTo(this.idleAction, 0.2);
      }

      this.mixer.update(dt);

      // Post-mixer bone adjustments for seated driving pose, weapon aiming, or 3-phase punch strike
      const holdingGun = !state.isSeated && !state.isPunching && this.equippedWeapon !== 'unarmed';
      if (state.isSeated || state.isPunching || holdingGun) {
        this.modelRoot.updateMatrixWorld(true);
        _charRightWorld.set(1, 0, 0).transformDirection(this.modelRoot.matrixWorld).normalize();

        if (state.isSeated) {
          // Fold thighs forward & bend knees down cleanly inside the car footwell
          if (this.bones.leftUpLeg) this.bones.leftUpLeg.rotateOnWorldAxis(_charRightWorld, -1.42);
          if (this.bones.rightUpLeg) this.bones.rightUpLeg.rotateOnWorldAxis(_charRightWorld, -1.42);
          if (this.bones.leftLeg) this.bones.leftLeg.rotateOnWorldAxis(_charRightWorld, 1.42);
          if (this.bones.rightLeg) this.bones.rightLeg.rotateOnWorldAxis(_charRightWorld, 1.42);
          if (this.bones.leftArm) this.bones.leftArm.rotateOnWorldAxis(_charRightWorld, -0.82);
          if (this.bones.rightArm) this.bones.rightArm.rotateOnWorldAxis(_charRightWorld, -0.82);
        } else if (state.isPunching) {
          const p = THREE.MathUtils.clamp(state.punchProgress, 0, 1);
          let armPitch = 0;
          let guardPitch = 0;
          let twistYaw = 0;
          let leanPitch = 0;

          if (p < 0.28) {
            // Phase 1: Wind-up twist back
            const k = THREE.MathUtils.smoothstep(p, 0, 0.28);
            armPitch = 0.65 * k;
            guardPitch = -0.85 * k;
            twistYaw = 0.52 * k;
            leanPitch = -0.08 * k;
          } else if (p < 0.62) {
            // Phase 2: Snap torso & shoulder punch forward
            const k = THREE.MathUtils.smoothstep(p, 0.28, 0.52);
            armPitch = THREE.MathUtils.lerp(0.65, -1.78, k);
            guardPitch = THREE.MathUtils.lerp(-0.85, 0.38, k);
            twistYaw = THREE.MathUtils.lerp(0.52, -0.82, k);
            leanPitch = THREE.MathUtils.lerp(-0.08, 0.16, k);
          } else {
            // Phase 3: Follow-through recovery
            const k = THREE.MathUtils.smoothstep(p, 0.62, 1.0);
            armPitch = THREE.MathUtils.lerp(-1.78, 0, k);
            guardPitch = THREE.MathUtils.lerp(0.38, 0, k);
            twistYaw = THREE.MathUtils.lerp(-0.82, 0, k);
            leanPitch = THREE.MathUtils.lerp(0.16, 0, k);
          }

          if (this.bones.rightArm) {
            this.bones.rightArm.rotateOnWorldAxis(_charRightWorld, armPitch);
          }
          if (this.bones.leftArm) {
            this.bones.leftArm.rotateOnWorldAxis(_charRightWorld, guardPitch);
          }
          if (this.bones.spine) {
            this.bones.spine.rotateOnWorldAxis(_charUpWorld, twistYaw);
            this.bones.spine.rotateOnWorldAxis(_charRightWorld, leanPitch);
          }
        } else if (holdingGun) {
          const raise = state.isShooting || state.isAiming ? -1.42 : -0.95;
          if (this.bones.rightArm) {
            this.bones.rightArm.rotateOnWorldAxis(_charRightWorld, raise);
          }
          this.weaponMount.position.set(-0.21, state.isShooting || state.isAiming ? 1.3 : 1.2, 0.28);
        }
      }
      return;
    }

    // 2. Fallback rig path
    if (this.fallbackRig) {
      if (state.isDead) {
        this.fallbackRig.bodyRoot.rotation.x = THREE.MathUtils.damp(
          this.fallbackRig.bodyRoot.rotation.x,
          -Math.PI * 0.47,
          9,
          dt
        );
        this.fallbackRig.bodyRoot.rotation.z = THREE.MathUtils.damp(
          this.fallbackRig.bodyRoot.rotation.z,
          0.22,
          9,
          dt
        );
        this.fallbackRig.bodyRoot.position.y = THREE.MathUtils.damp(
          this.fallbackRig.bodyRoot.position.y,
          0.16,
          9,
          dt
        );
        return;
      }
      this.fallbackRig.bodyRoot.rotation.x = THREE.MathUtils.damp(this.fallbackRig.bodyRoot.rotation.x, 0, 12, dt);
      this.fallbackRig.bodyRoot.rotation.z = THREE.MathUtils.damp(this.fallbackRig.bodyRoot.rotation.z, 0, 12, dt);
      this.fallbackRig.bodyRoot.position.y = THREE.MathUtils.damp(this.fallbackRig.bodyRoot.position.y, 0, 12, dt);

      if (state.isSeated) {
        if (state.isBike) {
          const feetDown = Math.abs(state.vehicleForwardSpeed) < 1.2 ? 0.35 : 0;
          this.fallbackRig.leftLegPivot.rotation.z = THREE.MathUtils.damp(
            this.fallbackRig.leftLegPivot.rotation.z,
            feetDown,
            8,
            dt
          );
          this.fallbackRig.rightLegPivot.rotation.z = THREE.MathUtils.damp(
            this.fallbackRig.rightLegPivot.rotation.z,
            -feetDown,
            8,
            dt
          );
        }
        return;
      }

      if (state.isPunching) {
        const p = THREE.MathUtils.clamp(state.punchProgress, 0, 1);
        const swing = p < 0.28
          ? THREE.MathUtils.lerp(0, 0.65, p / 0.28)
          : p < 0.62
            ? THREE.MathUtils.lerp(0.65, -1.85, (p - 0.28) / 0.34)
            : THREE.MathUtils.lerp(-1.85, 0, (p - 0.62) / 0.38);
        const twist = p < 0.28
          ? THREE.MathUtils.lerp(0, 0.45, p / 0.28)
          : p < 0.62
            ? THREE.MathUtils.lerp(0.45, -0.72, (p - 0.28) / 0.34)
            : THREE.MathUtils.lerp(-0.72, 0, (p - 0.62) / 0.38);
        this.fallbackRig.rightArmPivot.rotation.set(swing, 0, 0.15);
        this.fallbackRig.leftArmPivot.rotation.set(-0.65, 0, -0.15);
        this.fallbackRig.bodyRoot.rotation.y = twist;
      } else {
        this.fallbackRig.bodyRoot.rotation.y = 0;
      }

      if (state.horizSpeed > 0.25 && state.isGrounded) {
        this.walkPhase += dt * state.horizSpeed * 2.7;
        const amp = Math.min(0.75, state.horizSpeed * 0.13);
        this.fallbackRig.leftLegPivot.rotation.x = Math.sin(this.walkPhase) * amp;
        this.fallbackRig.rightLegPivot.rotation.x = -Math.sin(this.walkPhase) * amp;
        this.fallbackRig.leftArmPivot.rotation.x = -Math.sin(this.walkPhase) * amp * 0.85;
        if (!state.isPunching) {
          this.fallbackRig.rightArmPivot.rotation.x = Math.sin(this.walkPhase) * amp * 0.85;
        }
      } else {
        this.fallbackRig.leftLegPivot.rotation.x = THREE.MathUtils.damp(
          this.fallbackRig.leftLegPivot.rotation.x,
          0,
          12,
          dt
        );
        this.fallbackRig.rightLegPivot.rotation.x = THREE.MathUtils.damp(
          this.fallbackRig.rightLegPivot.rotation.x,
          0,
          12,
          dt
        );
        this.fallbackRig.leftArmPivot.rotation.x = THREE.MathUtils.damp(
          this.fallbackRig.leftArmPivot.rotation.x,
          0,
          12,
          dt
        );
        if (!state.isPunching) {
          this.fallbackRig.rightArmPivot.rotation.x = THREE.MathUtils.damp(
            this.fallbackRig.rightArmPivot.rotation.x,
            0,
            12,
            dt
          );
        }
      }
    }
  }

  private disposeObject(root: THREE.Object3D): void {
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

  public dispose(): void {
    this.disposed = true;
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.modelScene) {
        this.mixer.uncacheRoot(this.modelScene);
      }
      this.mixer = null;
    }
    this.disposeObject(this.group);
  }
}
