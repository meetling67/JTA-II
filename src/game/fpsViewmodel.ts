import * as THREE from 'three';
import { buildWeaponMesh, WeaponMeshRig } from './models';
import { WeaponKind } from './types';

export interface FpsViewModelState {
  speed: number;
  isAiming: boolean;
  isShooting: boolean;
  isPunching: boolean;
  punchProgress: number;
  bobPhase: number;
}

const SKIN = 0xd8a484;
const DEFAULT_SLEEVE = 0xe66a2c;

const _tempBase = new THREE.Vector3();

/**
 * First-person arms + weapon viewmodel rendered attached to the main camera (looking down -Z).
 * Bare hands idle/punch in lower-right/left corners when unarmed; both hands grip the gun when armed.
 */
export class FpsViewModel {
  public readonly group = new THREE.Group();

  private hipPos = new THREE.Vector3(0.21, -0.21, -0.44);
  private adsPos = new THREE.Vector3(0.0, -0.054, -0.34);
  private punchPos = new THREE.Vector3(0.05, -0.18, -0.66);

  private bareArms: THREE.Group;
  private bareRightArm!: THREE.Group;
  private bareLeftArm!: THREE.Group;
  private armedRig: THREE.Group;
  private weaponRigs: Record<'pistol' | 'smg' | 'rifle', WeaponMeshRig>;
  private muzzleFlashTimers: Record<'pistol' | 'smg' | 'rifle', number> = { pistol: 0, smg: 0, rifle: 0 };

  private sleeveMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;

  private equipped: WeaponKind = 'unarmed';
  private aimingBlend = 0;
  private recoil = 0;
  private visible = false;

  constructor() {
    this.sleeveMat = new THREE.MeshStandardMaterial({ color: DEFAULT_SLEEVE, roughness: 0.72 });
    this.skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.56 });

    this.bareArms = this.buildBareArms();
    this.armedRig = new THREE.Group();
    this.group.add(this.bareArms);
    this.group.add(this.armedRig);
    this.buildArmedHands();

    this.weaponRigs = {
      pistol: buildWeaponMesh('pistol'),
      smg: buildWeaponMesh('smg'),
      rifle: buildWeaponMesh('rifle'),
    };
    for (const k of ['pistol', 'smg', 'rifle'] as const) {
      const rig = this.weaponRigs[k];
      rig.group.visible = false;
      // Rotate +Z weapon barrel 180 deg around Y so it points straight down camera -Z forward axis
      rig.group.rotation.y = Math.PI;
      rig.group.scale.setScalar(1.15);
      this.armedRig.add(rig.group);
    }

    this.bareArms.visible = true;
    this.armedRig.visible = false;
    this.group.visible = false;
    this.group.traverse((o) => {
      o.frustumCulled = false;
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
    });
  }

  public setSleeveColor(hex: number): void {
    this.sleeveMat.color.setHex(hex);
  }

  private buildForearm(len: number, side: 'left' | 'right'): THREE.Group {
    const arm = new THREE.Group();
    const sgn = side === 'right' ? 1 : -1;

    // Forearm sleeve reaching forward toward -Z
    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.048, len * 0.72, 4, 12),
      this.sleeveMat
    );
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = len * 0.08;
    arm.add(sleeve);

    // Wrist / lower forearm extending toward -Z
    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.039, len * 0.55, 4, 12),
      this.skinMat
    );
    forearm.rotation.x = Math.PI / 2;
    forearm.position.z = -len * 0.34;
    arm.add(forearm);

    // Hand / curled fist centered around z = -len * 0.64
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.076, 0.056, 0.115),
      this.skinMat
    );
    hand.position.set(0, 0.005, -len * 0.64);
    arm.add(hand);

    for (let f = 0; f < 3; f++) {
      const finger = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.011, 0.048, 3, 6),
        this.skinMat
      );
      finger.rotation.x = Math.PI / 2;
      finger.position.set(-0.024 + f * 0.024, 0.026, -len * 0.64 - 0.045);
      arm.add(finger);
    }

    const thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.013, 0.042, 3, 6),
      this.skinMat
    );
    thumb.rotation.set(Math.PI / 2, 0, sgn * 0.65);
    thumb.position.set(-sgn * 0.044, 0.022, -len * 0.64 - 0.015);
    arm.add(thumb);

    return arm;
  }

  private buildBareArms(): THREE.Group {
    const g = new THREE.Group();
    this.bareRightArm = this.buildForearm(0.32, 'right');
    this.bareRightArm.position.set(0.04, -0.04, 0.12);
    this.bareRightArm.rotation.set(0.35, 0.2, -0.12);
    g.add(this.bareRightArm);

    this.bareLeftArm = this.buildForearm(0.3, 'left');
    this.bareLeftArm.position.set(-0.42, -0.07, 0.14);
    this.bareLeftArm.rotation.set(0.3, -0.26, 0.14);
    g.add(this.bareLeftArm);
    return g;
  }

  private buildArmedHands(): void {
    // Right trigger hand gripping pistol/SMG/rifle around (0, -0.05, 0.02)
    const right = this.buildForearm(0.28, 'right');
    right.position.set(0.082, -0.105, 0.21);
    right.rotation.set(0.24, 0.24, -0.1);
    this.armedRig.add(right);

    // Left support hand cupping under grip / handguard
    const left = this.buildForearm(0.27, 'left');
    left.position.set(-0.105, -0.135, 0.215);
    left.rotation.set(0.26, -0.34, 0.22);
    this.armedRig.add(left);
  }

  public setWeapon(kind: WeaponKind): void {
    this.equipped = kind;
    const armed = kind !== 'unarmed';
    this.bareArms.visible = !armed;
    this.armedRig.visible = armed;
    for (const k of ['pistol', 'smg', 'rifle'] as const) {
      this.weaponRigs[k].group.visible = armed && k === kind;
      if (!this.weaponRigs[k].group.visible) this.weaponRigs[k].muzzleFlashMesh.visible = false;
    }
  }

  public triggerRecoil(): void {
    this.recoil = Math.min(1.45, this.recoil + 1.0);
    if (this.equipped !== 'unarmed') {
      this.muzzleFlashTimers[this.equipped] = 0.075;
      const rig = this.weaponRigs[this.equipped];
      rig.muzzleFlashMesh.visible = true;
      rig.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
    }
  }

  public getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    if (this.equipped !== 'unarmed') {
      const rig = this.weaponRigs[this.equipped];
      out.set(0, 0.016, rig.muzzleOffsetZ);
      rig.group.localToWorld(out);
    } else {
      out.set(0, -0.05, -0.5);
      this.group.localToWorld(out);
    }
    return out;
  }

  public getEjectionWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    if (this.equipped !== 'unarmed') {
      const rig = this.weaponRigs[this.equipped];
      // Note rig.group is rotated 180° around Y, so local -X is world/camera +X (right side ejection port)
      out.set(-0.025, 0.028, 0.04);
      rig.group.localToWorld(out);
    } else {
      out.set(0.15, -0.1, -0.4);
      this.group.localToWorld(out);
    }
    return out;
  }

  public setVisible(v: boolean): void {
    this.visible = v;
    this.group.visible = v;
  }

  public update(dt: number, state: FpsViewModelState): void {
    this.group.visible = this.visible;
    if (!this.visible) return;

    for (const k of ['pistol', 'smg', 'rifle'] as const) {
      if (this.muzzleFlashTimers[k] > 0) {
        this.muzzleFlashTimers[k] = Math.max(0, this.muzzleFlashTimers[k] - dt);
        if (this.muzzleFlashTimers[k] <= 0) this.weaponRigs[k].muzzleFlashMesh.visible = false;
      }
    }

    this.recoil = Math.max(0, this.recoil - dt * 6.8);
    const armed = this.equipped !== 'unarmed';

    let targetBlend = state.isAiming && armed ? 1 : 0;
    if (state.isPunching && !armed) targetBlend = 2;
    this.aimingBlend = THREE.MathUtils.damp(this.aimingBlend, targetBlend, 15, dt);

    _tempBase.copy(this.hipPos);
    if (this.aimingBlend >= 1.25 && !armed) {
      const t = Math.min(1, this.aimingBlend - 1);
      _tempBase.lerp(this.punchPos, t);
      const thrust = Math.sin(THREE.MathUtils.clamp(state.punchProgress, 0, 1) * Math.PI);
      _tempBase.z -= thrust * 0.22;
      _tempBase.y += thrust * 0.04;
      this.bareRightArm.position.set(0.04 - thrust * 0.06, -0.04 + thrust * 0.05, 0.12 - thrust * 0.24);
      this.bareRightArm.rotation.set(0.35 - thrust * 0.28, 0.2 + thrust * 0.12, -0.12 + thrust * 0.25);
    } else {
      this.bareRightArm.position.set(0.04, -0.04, 0.12);
      this.bareRightArm.rotation.set(0.35, 0.2, -0.12);
      if (this.aimingBlend > 0) {
        _tempBase.lerp(this.adsPos, Math.min(1, this.aimingBlend));
      }
    }

    // Subtle walk bob + breathing sway
    const bobScale = state.isAiming ? 0.3 : 1.0;
    const bobAmp = Math.min(0.024, state.speed * 0.0044) * bobScale;
    _tempBase.x += Math.cos(state.bobPhase) * bobAmp;
    _tempBase.y += Math.abs(Math.sin(state.bobPhase)) * bobAmp * 1.45;
    _tempBase.y += Math.sin(state.bobPhase * 0.35) * 0.0024;

    // Recoil kickback toward camera + muzzle climb
    _tempBase.z += this.recoil * 0.058;
    _tempBase.y += this.recoil * 0.014;

    this.group.position.lerp(_tempBase, 1 - Math.exp(-24 * dt));

    const rx = this.recoil * 0.17 + (state.isPunching && !armed ? -0.18 : 0);
    this.group.rotation.x = THREE.MathUtils.damp(this.group.rotation.x, rx, 20, dt);
    this.group.rotation.y = THREE.MathUtils.damp(
      this.group.rotation.y,
      (1 - Math.min(1, this.aimingBlend)) * 0.04,
      14,
      dt
    );
  }
}
