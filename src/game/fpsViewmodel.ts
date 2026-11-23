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
const SLEEVE = 0xe66a2c;

/**
 * First-person arms + weapon viewmodel rendered attached to the main camera.
 * Bare hands idle/punch when unarmed; hands grip the gun when armed.
 */
export class FpsViewModel {
  public readonly group = new THREE.Group();

  private hipPos = new THREE.Vector3(0.24, -0.3, -0.52);
  private adsPos = new THREE.Vector3(0.0, -0.175, -0.38);
  private punchPos = new THREE.Vector3(0.06, -0.26, -0.78);

  private bareArms: THREE.Group;
  private armedRig: THREE.Group;
  private weaponRigs: Record<'pistol' | 'smg' | 'rifle', WeaponMeshRig>;
  private muzzleFlashTimers: Record<'pistol' | 'smg' | 'rifle', number> = { pistol: 0, smg: 0, rifle: 0 };

  private equipped: WeaponKind = 'unarmed';
  private aimingBlend = 0;
  private recoil = 0;
  private visible = false;

  constructor() {
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
      rig.group.scale.setScalar(1.15);
      this.armedRig.add(rig.group);
    }

    this.group.visible = false;
    this.group.traverse((o) => {
      o.frustumCulled = false;
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
    });
  }

  private buildForearm(len: number): THREE.Group {
    const arm = new THREE.Group();
    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.052, len, 4, 12),
      new THREE.MeshStandardMaterial({ color: SLEEVE, roughness: 0.72 })
    );
    sleeve.rotation.x = Math.PI / 2;
    arm.add(sleeve);
    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.044, len * 0.55, 4, 12),
      new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.58 })
    );
    forearm.rotation.x = Math.PI / 2;
    forearm.position.z = len * 0.42;
    arm.add(forearm);
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.05, 0.13),
      new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55 })
    );
    hand.position.z = len * 0.72;
    arm.add(hand);
    for (let f = 0; f < 3; f++) {
      const finger = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.012, 0.055, 3, 6),
        new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55 })
      );
      finger.rotation.x = Math.PI / 2;
      finger.position.set(-0.026 + f * 0.026, 0.032, len * 0.72 + 0.06);
      arm.add(finger);
    }
    const thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.014, 0.045, 3, 6),
      new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55 })
    );
    thumb.rotation.set(Math.PI / 2, 0, -0.7);
    thumb.position.set(0.05, 0.015, len * 0.72 + 0.02);
    arm.add(thumb);
    return arm;
  }

  private buildBareArms(): THREE.Group {
    const g = new THREE.Group();
    const right = this.buildForearm(0.34);
    right.position.set(0.3, -0.34, -0.28);
    right.rotation.set(-0.62, -0.22, 0.12);
    g.add(right);
    const left = this.buildForearm(0.32);
    left.position.set(-0.3, -0.37, -0.3);
    left.rotation.set(-0.52, 0.26, -0.14);
    g.add(left);
    return g;
  }

  private buildArmedHands(): void {
    const right = this.buildForearm(0.3);
    right.position.set(0.1, -0.1, 0.16);
    right.rotation.set(0.28, -0.1, 0);
    this.armedRig.add(right);
    const left = this.buildForearm(0.28);
    left.position.set(-0.11, -0.13, 0.1);
    left.rotation.set(0.36, 0.34, -0.25);
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
    this.recoil = Math.min(1.4, this.recoil + 1.0);
    if (this.equipped !== 'unarmed') {
      this.muzzleFlashTimers[this.equipped] = 0.075;
      const rig = this.weaponRigs[this.equipped];
      rig.muzzleFlashMesh.visible = true;
      rig.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
    }
  }

  public setVisible(v: boolean): void {
    this.visible = v;
    this.group.visible = v && this.group.children.length > 0;
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

    this.recoil = Math.max(0, this.recoil - dt * 6.5);
    const armed = this.equipped !== 'unarmed';

    let targetBlend = state.isAiming && armed ? 1 : 0;
    if (state.isPunching && !armed) targetBlend = 2;
    this.aimingBlend = THREE.MathUtils.damp(this.aimingBlend, targetBlend, 14, dt);

    const base = new THREE.Vector3().copy(this.hipPos);
    if (this.aimingBlend >= 2) {
      base.copy(this.punchPos);
      // Punch thrust: out-and-back over the punch progress
      const thrust = Math.sin(THREE.MathUtils.clamp(state.punchProgress, 0, 1) * Math.PI);
      base.z -= thrust * 0.22;
      base.y += thrust * 0.03;
    } else if (this.aimingBlend > 0) {
      base.lerp(this.adsPos, this.aimingBlend);
    }

    // Walk bob (slower when aiming) + breathing sway
    const bobScale = state.isAiming ? 0.35 : 1.0;
    const bobAmp = Math.min(0.022, state.speed * 0.004) * bobScale;
    base.x += Math.cos(state.bobPhase) * bobAmp;
    base.y += Math.abs(Math.sin(state.bobPhase)) * bobAmp * 1.4;
    base.y += Math.sin(state.bobPhase * 0.35) * 0.0022;

    // Recoil kickback: push toward camera + muzzle rise
    base.z += this.recoil * 0.055;
    base.y += this.recoil * 0.012;

    this.group.position.lerp(base, 1 - Math.exp(-22 * dt));

    const rx = -this.recoil * 0.16 + (this.aimingBlend >= 2 ? -0.3 : 0);
    this.group.rotation.x = THREE.MathUtils.damp(this.group.rotation.x, rx, 20, dt);
    this.group.rotation.y = THREE.MathUtils.damp(
      this.group.rotation.y,
      (1 - Math.min(1, this.aimingBlend)) * -0.06,
      14,
      dt
    );
  }
}
