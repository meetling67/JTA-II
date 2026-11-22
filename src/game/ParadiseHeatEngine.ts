import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CameraViewMode,
  HudSnapshot,
  ParadiseHeatSettings,
  TimeOfDay,
  VehicleKind,
} from './types';
import { ParadiseHeatAudio } from './audio';
import {
  buildHumanCharacter,
  buildVehicleModel,
  HumanRig,
  setHumanSeatedPose,
  VehicleRig,
} from './models';
import { buildCityDistrict, CityMapData } from './cityBuilder';

// Pre-allocated scratch math helpers (zero per-frame GC)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

interface VehicleEntity {
  id: string;
  kind: VehicleKind;
  label: string;
  rig: VehicleRig;
  position: THREE.Vector3;
  yaw: number;
  velocity: THREE.Vector3;
  forwardSpeed: number;
  steerAngle: number;
  wheelSpin: number;
  leanAngle: number;
  suspY: number;
  suspVel: number;
  isTraffic: boolean;
  isWreck: boolean;
  wreckTimer: number;
  angularVel: number;
  loopIndex: number;
  loopT: number;
  trafficSpeed: number;
  hasOccupant: boolean;
}

interface PedestrianEntity {
  id: string;
  rig: HumanRig;
  position: THREE.Vector3;
  yaw: number;
  velocity: THREE.Vector3;
  loopIndex: number;
  loopT: number;
  walkSpeed: number;
  fallen: boolean;
  recoverAt: number;
  fleeUntil: number;
  fleeDir: THREE.Vector3;
  knockdownRotX: number;
  knockdownRotZ: number;
  walkPhase: number;
}

const VEHICLE_LABELS: Record<VehicleKind, string> = {
  sedan: 'City Sedan',
  suv: 'District SUV',
  coupe: 'Mz3 Coupe',
  truck: 'Box Truck',
  motorcycle: 'Bobber 1200',
};

export class ParadiseHeatEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mirrorCamera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private anisotropy: number;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private city: CityMapData;
  private audio: ParadiseHeatAudio;
  private settings: ParadiseHeatSettings;

  // Player state ("Nathan")
  private playerRig: HumanRig;
  private playerPos = new THREE.Vector3(0, 0.18, -14);
  private playerVel = new THREE.Vector3();
  private playerYaw = Math.PI; // Facing south toward waterfront boulevard & parked cars
  private playerGrounded = true;
  private walkPhase = 0;
  private punchTimer = 0;
  private punchHitDone = false;

  // Camera state
  private camYaw = Math.PI;
  private camPitch = -0.22; // ~ -12.6 deg
  private lastCarLookTime = -10;
  private cameraView: CameraViewMode = 'chase';
  private pointerLocked = false;
  private draggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Vehicle & entry state
  private vehicles: VehicleEntity[] = [];
  private drivenVehicle: VehicleEntity | null = null;
  private pendingVehicle: VehicleEntity | null = null;
  private entryTimer = 0;
  private entryStartPos = new THREE.Vector3();
  private autoMountBlockedUntil = 0;

  // Pedestrians
  private pedestrians: PedestrianEntity[] = [];
  private knockdowns = 0;
  private lastEventText = 'Explore the city · E to enter vehicles · F to punch';
  private lastEventTime = 0;

  // Input state
  private keys = new Set<string>();
  private touchMove = { x: 0, y: 0 };
  private paused = false;
  private disposed = false;

  // Loop & timing
  private frameId = 0;
  private lastTime = performance.now();
  private elapsed = 0;
  private hudEmitAccum = 0;
  private fpsAccum = 0;
  private mirrorFrameCount = 0;
  private onHudUpdate: (hud: HudSnapshot) => void;
  private onPauseToggle: () => void;

  // Bound event handlers for clean teardown
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleKeyUp: (e: KeyboardEvent) => void;
  private handleResize: () => void;
  private handlePointerLockChange: () => void;
  private handleMouseMove: (e: MouseEvent) => void;
  private handleMouseDown: (e: MouseEvent) => void;
  private handleMouseUp: () => void;
  private handleBlur: () => void;

  constructor(
    container: HTMLElement,
    initialSettings: ParadiseHeatSettings,
    onHudUpdate: (hud: HudSnapshot) => void,
    onPauseToggle: () => void
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.onHudUpdate = onHudUpdate;
    this.onPauseToggle = onPauseToggle;
    this.audio = new ParadiseHeatAudio(this.settings);

    // 1. Detect Software WebGL (SwiftShader/llvmpipe/WARP)
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    });
    container.appendChild(this.renderer.domElement);

    // 3. Scene, Environment & Cameras
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const aspect = (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.15, 420);
    this.mirrorCamera = new THREE.PerspectiveCamera(68, 3.6, 0.15, 160);

    // 4. Lighting Rig (Warm directional key + Cool Hemisphere fill)
    this.hemiLight = new THREE.HemisphereLight(0xbbe2ff, 0x5c5346, 0.65);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.1);
    this.sunLight.position.set(55, 88, -42);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const d = 75;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 220;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.applyQualityPixelRatio();

    // 5. Build CityDistrict10x Map
    this.city = buildCityDistrict(this.anisotropy);
    this.scene.add(this.city.cityGroup);

    // 6. Build Player ("Nathan")
    this.playerRig = buildHumanCharacter({
      shirtColor: 0xe66a2c, // Signature warm Paradise Heat coastal jacket
      pantsColor: 0x1e293b,
      hairColor: 0x241913,
      isPlayer: true,
    });
    this.playerRig.group.position.copy(this.playerPos);
    this.playerRig.group.rotation.y = this.playerYaw;
    this.scene.add(this.playerRig.group);

    // 7. Spawn Hero Parked Vehicles + Ambient Traffic + Sidewalk Pedestrians
    this.spawnWorldEntities();

    // Apply initial atmosphere (Day/Sunset/Night)
    this.applyTimeOfDay(this.settings.timeOfDay);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 8. Bind Events
    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.onPauseToggle();
        return;
      }
      if (this.paused) return;
      this.audio.unlock();
      this.keys.add(e.code);

      if (e.code === 'KeyE' && !e.repeat) {
        this.interactVehicle();
      } else if (e.code === 'KeyF' && !e.repeat) {
        this.triggerPunch();
      } else if (e.code === 'KeyV' && !e.repeat) {
        this.toggleCameraView();
      } else if (e.code === 'Space' && !e.repeat && !this.drivenVehicle && !this.pendingVehicle) {
        this.jumpOnFoot();
      }
    };

    this.handleKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    this.handleResize = () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    this.handlePointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      this.emitHud();
    };

    this.handleMouseDown = (e: MouseEvent) => {
      if (this.paused) return;
      this.audio.unlock();
      if (e.target === this.renderer.domElement) {
        this.draggingLook = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        if (!this.pointerLocked && this.renderer.domElement.requestPointerLock) {
          try {
            const p = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
            if (p && typeof p.catch === 'function') {
              p.catch(() => {});
            }
          } catch {
            // Pointer lock may be blocked in sandboxed iframes; drag-look remains active!
          }
        }
      }
    };

    this.handleMouseUp = () => {
      this.draggingLook = false;
    };

    this.handleMouseMove = (e: MouseEvent) => {
      if (this.paused) return;
      let dx = 0;
      let dy = 0;
      if (this.pointerLocked) {
        dx = e.movementX;
        dy = e.movementY;
      } else if (this.draggingLook) {
        dx = e.clientX - this.lastPointerX;
        dy = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      } else {
        return;
      }

      const sens = 0.0024 * this.settings.pointerSensitivity;
      const ySign = this.settings.invertPointerY ? 1 : -1;
      this.camYaw -= dx * sens;
      this.camPitch = THREE.MathUtils.clamp(
        this.camPitch + dy * sens * ySign,
        THREE.MathUtils.degToRad(-65),
        THREE.MathUtils.degToRad(8)
      );
      if (this.drivenVehicle) {
        this.lastCarLookTime = this.elapsed;
      }
    };

    this.handleBlur = () => {
      this.keys.clear();
      this.draggingLook = false;
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);

    // Initialize camera immediately behind player
    this.camera.position.set(0, 3.2, -9.2);
    this.camera.lookAt(0, 1.4, -18);

    this.emitHud();
    this.scheduleNextFrame();
  }

  private spawnWorldEntities(): void {
    // Clear existing vehicles & pedestrians if resetting
    for (const v of this.vehicles) {
      this.scene.remove(v.rig.group);
    }
    for (const p of this.pedestrians) {
      this.scene.remove(p.rig.group);
    }
    this.vehicles = [];
    this.pedestrians = [];
    this.drivenVehicle = null;
    this.pendingVehicle = null;
    this.playerRig.group.visible = true;

    // 1. Player-usable parked vehicles right near spawn on the Waterfront Blvd
    const parkedSpecs: {
      kind: VehicleKind;
      color: number;
      x: number;
      z: number;
      yaw: number;
    }[] = [
      { kind: 'coupe', color: 0xb91c1c, x: -7, z: -23.2, yaw: Math.PI / 2 },
      { kind: 'motorcycle', color: 0x0f172a, x: 5.5, z: -22.2, yaw: Math.PI * 0.65 },
      { kind: 'suv', color: 0x1d4ed8, x: -16.5, z: -23.2, yaw: Math.PI / 2 },
      { kind: 'sedan', color: 0xd1d5db, x: 16.5, z: -23.2, yaw: -Math.PI / 2 },
      { kind: 'truck', color: 0x334155, x: 32, z: -32.2, yaw: Math.PI / 2 },
    ];

    parkedSpecs.forEach((spec, idx) => {
      const rig = buildVehicleModel(spec.kind, spec.color, this.anisotropy, this.isSoftwareGl);
      rig.occupantGroup.visible = false;
      if (rig.kickstandGroup) rig.kickstandGroup.visible = true;
      rig.group.position.set(spec.x, 0, spec.z);
      rig.group.rotation.y = spec.yaw;
      this.scene.add(rig.group);
      this.vehicles.push({
        id: `parked_${idx}`,
        kind: spec.kind,
        label: VEHICLE_LABELS[spec.kind],
        rig,
        position: new THREE.Vector3(spec.x, 0, spec.z),
        yaw: spec.yaw,
        velocity: new THREE.Vector3(),
        forwardSpeed: 0,
        steerAngle: 0,
        wheelSpin: 0,
        leanAngle: 0,
        suspY: 0,
        suspVel: 0,
        isTraffic: false,
        isWreck: false,
        wreckTimer: 0,
        angularVel: 0,
        loopIndex: 0,
        loopT: 0,
        trafficSpeed: 0,
        hasOccupant: false,
      });
    });

    // 2. Ambient City Traffic vehicles along the 3 closed road loops
    const trafficPalette = [0x0a1f8c, 0x9e0a0a, 0x0a4714, 0xb8b8ad, 0x17171a, 0xd4d4ca];
    const trafficKinds: VehicleKind[] = ['sedan', 'suv', 'coupe', 'sedan', 'truck', 'motorcycle'];

    for (let i = 0; i < 10; i++) {
      const loopIndex = i % this.city.trafficLoops.length;
      const loopT = ((Math.floor(i / this.city.trafficLoops.length) + 0.15) / 4) % 1;
      const kind = trafficKinds[i % trafficKinds.length];
      const color = trafficPalette[i % trafficPalette.length];

      const rig = buildVehicleModel(kind, color, this.anisotropy, this.isSoftwareGl);
      rig.occupantGroup.visible = true;
      if (rig.kickstandGroup) rig.kickstandGroup.visible = false;

      const pt = this.sampleLoopPoint(this.city.trafficLoops[loopIndex], loopT, _v1, _v2);
      const yaw = Math.atan2(_v2.x, _v2.z);
      rig.group.position.copy(pt);
      rig.group.rotation.y = yaw;
      this.scene.add(rig.group);

      this.vehicles.push({
        id: `traffic_${i}`,
        kind,
        label: VEHICLE_LABELS[kind],
        rig,
        position: pt.clone(),
        yaw,
        velocity: new THREE.Vector3(),
        forwardSpeed: 8.5 + (i % 3) * 1.4,
        steerAngle: 0,
        wheelSpin: 0,
        leanAngle: 0,
        suspY: 0,
        suspVel: 0,
        isTraffic: true,
        isWreck: false,
        wreckTimer: 0,
        angularVel: 0,
        loopIndex,
        loopT,
        trafficSpeed: 8.5 + (i % 3) * 1.4,
        hasOccupant: true,
      });
    }

    // 3. Sidewalk Pedestrians ("Eric", "Manuel", "Sophia" equivalents)
    const pedOutfits = [
      { shirt: 0x3b82f6, pants: 0x1e293b, skin: 0xd9a787, hair: 0x1e1815 },
      { shirt: 0xf43f5e, pants: 0x334155, skin: 0xc98f6d, hair: 0x3d2618 },
      { shirt: 0x10b981, pants: 0x1f2937, skin: 0xe6bc9e, hair: 0x4a3423 },
      { shirt: 0xf59e0b, pants: 0x0f172a, skin: 0x9b6647, hair: 0x120e0d },
      { shirt: 0x8b5cf6, pants: 0x334155, skin: 0xdcb496, hair: 0x2a1d17 },
    ];

    for (let i = 0; i < 14; i++) {
      const loopIndex = i % this.city.pedestrianLoops.length;
      const loopT = ((i * 0.23) % 1);
      const outfit = pedOutfits[i % pedOutfits.length];
      const rig = buildHumanCharacter({
        shirtColor: outfit.shirt,
        pantsColor: outfit.pants,
        skinColor: outfit.skin,
        hairColor: outfit.hair,
      });

      const pt = this.sampleLoopPoint(this.city.pedestrianLoops[loopIndex], loopT, _v1, _v2);
      const yaw = Math.atan2(_v2.x, _v2.z);
      rig.group.position.copy(pt);
      rig.group.rotation.y = yaw;
      this.scene.add(rig.group);

      this.pedestrians.push({
        id: `ped_${i}`,
        rig,
        position: pt.clone(),
        yaw,
        velocity: new THREE.Vector3(),
        loopIndex,
        loopT,
        walkSpeed: 1.35 + (i % 3) * 0.25,
        fallen: false,
        recoverAt: 0,
        fleeUntil: 0,
        fleeDir: new THREE.Vector3(1, 0, 0),
        knockdownRotX: 0,
        knockdownRotZ: 0,
        walkPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  public resetCity(): void {
    this.playerPos.set(0, 0.18, -14);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = -0.22;
    this.cameraView = 'chase';
    this.knockdowns = 0;
    this.spawnWorldEntities();
    this.setEvent('City district reset · Back at Waterfront Plaza');
    this.emitHud();
  }

  public applySettings(next: ParadiseHeatSettings): void {
    const prevTod = this.settings.timeOfDay;
    const prevQual = this.settings.quality;
    this.settings = { ...next };
    this.audio.applySettings(this.settings);
    if (prevTod !== next.timeOfDay) {
      this.applyTimeOfDay(next.timeOfDay);
    }
    if (prevQual !== next.quality) {
      this.applyQualityPixelRatio();
    }
  }

  private applyQualityPixelRatio(): void {
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      if (this.sunLight) this.sunLight.castShadow = false;
      return;
    }
    const maxPr = this.settings.quality === 'detailed' ? 2 : 1.15;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPr));
    if (this.sunLight) {
      this.sunLight.castShadow = this.settings.quality === 'detailed';
    }
  }

  public applyTimeOfDay(tod: TimeOfDay): void {
    this.settings.timeOfDay = tod;
    if (tod === 'day') {
      const sky = new THREE.Color(0x9bd2f5);
      this.scene.background = sky;
      this.scene.fog = new THREE.FogExp2(0xa8d6f0, 0.0038);
      this.sunLight.color.setHex(0xfff2d9);
      this.sunLight.intensity = 2.15;
      this.sunLight.position.set(55, 88, -42);
      this.hemiLight.color.setHex(0xbbe2ff);
      this.hemiLight.groundColor.setHex(0x635849);
      this.hemiLight.intensity = 0.7;
      this.city.lampEmitterMaterial.emissiveIntensity = 0;
      for (const bm of this.city.buildingMaterials) bm.emissiveIntensity = 0;
      for (const v of this.vehicles) v.rig.headLightMat.emissiveIntensity = 0.45;
    } else if (tod === 'sunset') {
      const sky = new THREE.Color(0xe68b5a);
      this.scene.background = sky;
      this.scene.fog = new THREE.FogExp2(0xdc835c, 0.0046);
      this.sunLight.color.setHex(0xff9c5b);
      this.sunLight.intensity = 1.85;
      this.sunLight.position.set(-85, 28, -55);
      this.hemiLight.color.setHex(0xffb48a);
      this.hemiLight.groundColor.setHex(0x2f2538);
      this.hemiLight.intensity = 0.6;
      this.city.lampEmitterMaterial.emissiveIntensity = 1.6;
      for (const bm of this.city.buildingMaterials) bm.emissiveIntensity = 0.8;
      for (const v of this.vehicles) v.rig.headLightMat.emissiveIntensity = 1.6;
    } else {
      const sky = new THREE.Color(0x09111f);
      this.scene.background = sky;
      this.scene.fog = new THREE.FogExp2(0x0b1526, 0.0055);
      this.sunLight.color.setHex(0x88b4f0);
      this.sunLight.intensity = 0.58;
      this.sunLight.position.set(-40, 75, 45);
      this.hemiLight.color.setHex(0x3a5278);
      this.hemiLight.groundColor.setHex(0x111520);
      this.hemiLight.intensity = 0.48;
      this.city.lampEmitterMaterial.emissiveIntensity = 2.8;
      for (const bm of this.city.buildingMaterials) bm.emissiveIntensity = 1.5;
      for (const v of this.vehicles) v.rig.headLightMat.emissiveIntensity = 2.6;
    }
    this.emitHud();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.audio.setPaused(paused);
    if (paused) {
      this.keys.clear();
      this.draggingLook = false;
      if (document.pointerLockElement === this.renderer.domElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
    }
    this.emitHud();
  }

  public toggleCameraView(): void {
    this.cameraView = this.cameraView === 'chase' ? 'cockpit' : 'chase';
    this.setEvent(this.cameraView === 'cockpit' ? 'Cockpit View · Live Rearview Mirror' : 'Chase Camera');
    this.emitHud();
  }

  public setTouchMove(x: number, y: number): void {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  public triggerPunch(): void {
    if (this.paused || this.drivenVehicle || this.pendingVehicle) return;
    if (this.punchTimer > 0) return;
    this.audio.unlock();
    this.punchTimer = 0.42;
    this.punchHitDone = false;
    this.audio.playPunch();
  }

  public jumpOnFoot(): void {
    if (this.paused || this.drivenVehicle || this.pendingVehicle) return;
    if (this.playerGrounded) {
      this.playerVel.y = 6.2;
      this.playerGrounded = false;
    }
  }

  public interactVehicle(): void {
    if (this.paused || this.pendingVehicle) return;
    this.audio.unlock();

    if (this.drivenVehicle) {
      this.exitVehicle();
      return;
    }

    const best = this.findNearestVehicle(4.4);
    if (!best) return;

    this.beginVehicleEntry(best);
  }

  public getAudio(): ParadiseHeatAudio {
    return this.audio;
  }

  private findNearestVehicle(maxDist: number): VehicleEntity | null {
    let best: VehicleEntity | null = null;
    let bestDistSq = maxDist * maxDist;
    for (const v of this.vehicles) {
      const dx = v.position.x - this.playerPos.x;
      const dz = v.position.z - this.playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = v;
      }
    }
    return best;
  }

  private beginVehicleEntry(v: VehicleEntity): void {
    this.pendingVehicle = v;
    this.entryTimer = 0;
    this.entryStartPos.copy(this.playerPos);
    this.audio.playDoorLatch();

    // Eject ambient traffic driver if vehicle is occupied!
    if (v.hasOccupant) {
      v.hasOccupant = false;
      v.rig.occupantGroup.visible = false;
      this.spawnEjectedSurvivor(v);
    }

    // Immediate bike mount if motorcycle
    if (v.kind === 'motorcycle') {
      this.finishVehicleEntry();
    } else {
      this.setEvent(`Entering ${v.label}…`);
    }
  }

  private finishVehicleEntry(): void {
    const v = this.pendingVehicle;
    if (!v) return;
    this.pendingVehicle = null;
    v.isTraffic = false;
    v.isWreck = false;
    if (v.rig.doorPivot) {
      v.rig.doorPivot.rotation.y = 0;
    }
    if (v.rig.kickstandGroup) {
      v.rig.kickstandGroup.visible = false;
    }

    // Seat Nathan inside the vehicle
    this.drivenVehicle = v;
    this.playerRig.group.visible = true;
    setHumanSeatedPose(this.playerRig, true);
    v.rig.chassisGroup.add(this.playerRig.group);
    this.playerRig.group.position.copy(v.rig.seatLocal);
    this.playerRig.group.rotation.set(0, 0, 0);

    this.setEvent(`Driving ${v.label} · V for Cockpit View`);
    this.emitHud();
  }

  private exitVehicle(): void {
    const v = this.drivenVehicle;
    if (!v) return;

    // Detach player from vehicle back to world scene
    v.rig.chassisGroup.remove(this.playerRig.group);
    this.scene.add(this.playerRig.group);
    setHumanSeatedPose(this.playerRig, false);

    // Find safe exit beside left/right side of vehicle (FindVehicleExit)
    const sideDist = v.rig.width * 0.5 + 0.95;
    _right.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    const leftCandidate = v.position.clone().addScaledVector(_right, -sideDist);
    const rightCandidate = v.position.clone().addScaledVector(_right, sideDist);

    const exitPos = !this.isPointInsideCollider(leftCandidate.x, leftCandidate.z, 0.45)
      ? leftCandidate
      : rightCandidate;

    exitPos.x = THREE.MathUtils.clamp(exitPos.x, this.city.bounds.minX + 1, this.city.bounds.maxX - 1);
    exitPos.z = THREE.MathUtils.clamp(exitPos.z, this.city.bounds.minZ + 1, this.city.bounds.maxZ - 1);
    exitPos.y = this.groundHeightAt(exitPos.x, exitPos.z);

    this.playerPos.copy(exitPos);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = v.yaw;
    this.playerRig.group.position.copy(this.playerPos);
    this.playerRig.group.rotation.set(0, this.playerYaw, 0);

    if (v.kind === 'motorcycle') {
      if (v.rig.kickstandGroup) v.rig.kickstandGroup.visible = true;
      v.leanAngle = 0;
      v.rig.chassisGroup.rotation.z = 0;
      this.autoMountBlockedUntil = this.elapsed + 3.0;
    }

    this.drivenVehicle = null;
    this.cameraView = 'chase';
    this.audio.playDoorLatch();
    this.audio.updateEngine(false, false, 0, 0);
    this.setEvent('Exited vehicle');
    this.emitHud();
  }

  private spawnEjectedSurvivor(v: VehicleEntity): void {
    const outfit = { shirt: 0x475569, pants: 0x1e293b };
    const rig = buildHumanCharacter({ shirtColor: outfit.shirt, pantsColor: outfit.pants });
    _right.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    const pos = v.position.clone().addScaledVector(_right, -(v.rig.width * 0.5 + 1.0));
    pos.y = this.groundHeightAt(pos.x, pos.z);
    rig.group.position.copy(pos);
    this.scene.add(rig.group);

    this.audio.playPedestrianShout();

    const fleeDir = _right.clone().multiplyScalar(-1).normalize();
    this.pedestrians.push({
      id: `survivor_${Date.now()}_${Math.random()}`,
      rig,
      position: pos,
      yaw: Math.atan2(fleeDir.x, fleeDir.z),
      velocity: fleeDir.clone().multiplyScalar(3.2),
      loopIndex: 0,
      loopT: 0,
      walkSpeed: 1.5,
      fallen: true,
      recoverAt: this.elapsed + 2.2,
      fleeUntil: this.elapsed + 10.0,
      fleeDir,
      knockdownRotX: -Math.PI * 0.48,
      knockdownRotZ: 0.2,
      walkPhase: 0,
    });
    this.setEvent('Driver ejected!');
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick(): void {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    // Optional FPS limiter from Pause Menu
    if (this.settings.fpsLimit > 0 && !this.isSoftwareGl) {
      this.fpsAccum += rawDt;
      const minStep = 1 / this.settings.fpsLimit;
      if (this.fpsAccum < minStep * 0.92) {
        this.scheduleNextFrame();
        return;
      }
      this.fpsAccum = 0;
    }

    if (!this.paused) {
      this.elapsed += rawDt;
      this.stepSimulation(rawDt);
    }

    this.renderScene();

    this.hudEmitAccum += rawDt;
    if (this.hudEmitAccum >= 0.08) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }

    this.scheduleNextFrame();
  }

  private stepSimulation(dt: number): void {
    // 1. Pending vehicle entry door animation
    if (this.pendingVehicle) {
      this.entryTimer += dt;
      const v = this.pendingVehicle;
      const openAmt = THREE.MathUtils.smoothstep(this.entryTimer, 0.1, 0.55);
      if (v.rig.doorPivot) {
        v.rig.doorPivot.rotation.y = -openAmt * THREE.MathUtils.degToRad(68);
      }
      // Step Nathan toward the driver door
      _right.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
      const doorWorld = v.position.clone().addScaledVector(_right, -(v.rig.width * 0.5 + 0.65));
      this.playerPos.lerpVectors(this.entryStartPos, doorWorld, Math.min(1, this.entryTimer * 2.4));
      this.playerYaw = Math.atan2(v.position.x - this.playerPos.x, v.position.z - this.playerPos.z);
      this.playerRig.group.position.copy(this.playerPos);
      this.playerRig.group.rotation.y = this.playerYaw;

      if (this.entryTimer >= 0.72) {
        this.finishVehicleEntry();
      }
    } else if (this.drivenVehicle) {
      this.stepDrivenVehicle(dt, this.drivenVehicle);
    } else {
      this.stepPlayerOnFoot(dt);
    }

    // 2. Step ambient traffic & wrecked vehicles
    this.stepVehicles(dt);

    // 3. Step pedestrians & recovery
    this.stepPedestrians(dt);

    // 4. Update camera & directional shadow frustum tracking
    this.updateCamera(dt);
    this.sunLight.target.position.copy(this.drivenVehicle ? this.drivenVehicle.position : this.playerPos);
    this.sunLight.position.set(
      this.sunLight.target.position.x + 55,
      88,
      this.sunLight.target.position.z - 42
    );
  }

  private stepPlayerOnFoot(dt: number): void {
    const moveFwd =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) +
      this.touchMove.y;
    const moveRight =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) +
      this.touchMove.x;

    const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const maxSpeed = sprinting ? 6.4 : 3.2;

    // Camera-relative movement vectors
    _fwd.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)).negate();
    _right.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));

    _v1.set(0, 0, 0);
    _v1.addScaledVector(_fwd, moveFwd);
    _v1.addScaledVector(_right, moveRight);

    const hasMove = _v1.lengthSq() > 0.001;
    if (hasMove) {
      _v1.normalize();
      this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, _v1.x * maxSpeed, 12, dt);
      this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, _v1.z * maxSpeed, 12, dt);

      const targetYaw = Math.atan2(_v1.x, _v1.z);
      this.playerYaw = dampAngle(this.playerYaw, targetYaw, 11, dt);
    } else {
      this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, 0, 14, dt);
      this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, 0, 14, dt);
    }

    // Gravity
    this.playerVel.y -= 16.5 * dt;

    const nextX = this.playerPos.x + this.playerVel.x * dt;
    const nextZ = this.playerPos.z + this.playerVel.z * dt;

    const resolved = this.resolveCircleCollisions(nextX, nextZ, 0.42);
    this.playerPos.x = THREE.MathUtils.clamp(resolved.x, this.city.bounds.minX, this.city.bounds.maxX);
    this.playerPos.z = THREE.MathUtils.clamp(resolved.z, this.city.bounds.minZ, this.city.bounds.maxZ);
    this.playerPos.y += this.playerVel.y * dt;

    const floorY = this.groundHeightAt(this.playerPos.x, this.playerPos.z);
    if (this.playerPos.y <= floorY) {
      this.playerPos.y = floorY;
      this.playerVel.y = 0;
      this.playerGrounded = true;
    }

    // Check auto-mount motorcycle when walking onto parked bike after cooldown
    if (this.elapsed > this.autoMountBlockedUntil) {
      for (const v of this.vehicles) {
        if (v.kind === 'motorcycle' && !v.isTraffic && !v.isWreck) {
          const dx = v.position.x - this.playerPos.x;
          const dz = v.position.z - this.playerPos.z;
          if (dx * dx + dz * dz < 1.35 * 1.35 && Math.hypot(this.playerVel.x, this.playerVel.z) > 0.6) {
            this.beginVehicleEntry(v);
            break;
          }
        }
      }
    }

    // Punch animation & pedestrian hit check
    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - dt);
      const progress = 1 - this.punchTimer / 0.42;
      const swing = Math.sin(progress * Math.PI);
      this.playerRig.rightArmPivot.rotation.set(-swing * 1.65, 0, 0.15);
      this.playerRig.bodyRoot.rotation.y = -swing * 0.35;

      if (!this.punchHitDone && progress > 0.32) {
        this.punchHitDone = true;
        _fwd.set(Math.sin(this.playerYaw), 0, Math.cos(this.playerYaw));
        for (const p of this.pedestrians) {
          if (p.fallen) continue;
          const dx = p.position.x - this.playerPos.x;
          const dz = p.position.z - this.playerPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 2.2) {
            const dot = (dx * _fwd.x + dz * _fwd.z) / Math.max(0.01, dist);
            if (dot > 0.1) {
              this.knockdownPedestrian(p, _fwd.clone().multiplyScalar(6.5), true);
            }
          }
        }
      }
    } else {
      this.playerRig.bodyRoot.rotation.y = 0;
    }

    // Walk / Run / Idle limb animation
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (horizSpeed > 0.25 && this.playerGrounded) {
      this.walkPhase += dt * horizSpeed * 2.7;
      const amp = Math.min(0.75, horizSpeed * 0.13);
      this.playerRig.leftLegPivot.rotation.x = Math.sin(this.walkPhase) * amp;
      this.playerRig.rightLegPivot.rotation.x = -Math.sin(this.walkPhase) * amp;
      this.playerRig.leftArmPivot.rotation.x = -Math.sin(this.walkPhase) * amp * 0.85;
      if (this.punchTimer <= 0) {
        this.playerRig.rightArmPivot.rotation.x = Math.sin(this.walkPhase) * amp * 0.85;
      }
    } else {
      this.playerRig.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.playerRig.leftLegPivot.rotation.x, 0, 12, dt);
      this.playerRig.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.playerRig.rightLegPivot.rotation.x, 0, 12, dt);
      this.playerRig.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.playerRig.leftArmPivot.rotation.x, 0, 12, dt);
      if (this.punchTimer <= 0) {
        this.playerRig.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.playerRig.rightArmPivot.rotation.x, 0, 12, dt);
      }
    }

    this.playerRig.group.position.copy(this.playerPos);
    this.playerRig.group.rotation.y = this.playerYaw;
    this.audio.updateEngine(false, false, 0, 0);
  }

  private stepDrivenVehicle(dt: number, v: VehicleEntity): void {
    const isBike = v.kind === 'motorcycle';
    const fwdIn =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) + Math.max(0, this.touchMove.y);
    const revIn =
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) + Math.max(0, -this.touchMove.y);
    const handbrake = this.keys.has('Space');
    const steerIn =
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) -
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      this.touchMove.x;

    const maxSpeed = isBike ? 39 : v.kind === 'coupe' ? 37 : v.kind === 'truck' ? 25 : 32;
    const accelForce = isBike ? 19.5 : v.kind === 'coupe' ? 16.5 : v.kind === 'truck' ? 9.5 : 13.5;

    let throttle = 0;
    let braking = handbrake;

    if (fwdIn > 0.1) {
      if (v.forwardSpeed < -0.8) {
        braking = true;
      } else {
        throttle = 1;
      }
    } else if (revIn > 0.1) {
      if (v.forwardSpeed > 0.8) {
        braking = true;
      } else {
        // Motorcycle foot-paddle reverse <= 3 km/h (0.85 m/s), car reverse <= 11 m/s
        const maxRev = isBike ? -0.9 : -11.0;
        if (v.forwardSpeed > maxRev) {
          throttle = isBike ? -0.25 : -0.55;
        }
      }
    }

    // Longitudinal acceleration & drag
    if (braking) {
      const decel = (handbrake ? 30 : 24) * dt;
      if (Math.abs(v.forwardSpeed) <= decel) {
        v.forwardSpeed = 0;
      } else {
        v.forwardSpeed -= Math.sign(v.forwardSpeed) * decel;
      }
    } else if (throttle !== 0) {
      v.forwardSpeed += throttle * accelForce * dt;
      v.forwardSpeed = THREE.MathUtils.clamp(v.forwardSpeed, -11, maxSpeed);
    } else {
      // Rolling resistance & aero drag
      v.forwardSpeed = THREE.MathUtils.damp(v.forwardSpeed, 0, 1.35, dt);
    }

    // Brake taillights brightness
    v.rig.tailLightMat.emissiveIntensity = braking ? 2.4 : 0.45;

    // Steering response
    const maxSteer = isBike ? THREE.MathUtils.degToRad(26) : THREE.MathUtils.degToRad(30);
    const speedFactor = THREE.MathUtils.clamp(1.0 - Math.abs(v.forwardSpeed) / 48, 0.42, 1.0);
    v.steerAngle = THREE.MathUtils.damp(v.steerAngle, steerIn * maxSteer * speedFactor, 9, dt);

    // Bicycle / Ackerman turning kinematics + handbrake drift slip
    const wheelbase = isBike ? 1.46 : v.rig.length * 0.62;
    if (Math.abs(v.forwardSpeed) > 0.08) {
      const turnRate = (v.forwardSpeed / wheelbase) * Math.tan(v.steerAngle);
      const driftBoost = handbrake && Math.abs(v.forwardSpeed) > 6 ? 1.42 : 1.0;
      v.yaw += turnRate * driftBoost * dt;
    }

    // Forward vector & lateral velocity damping (allows controlled drift under handbrake)
    _fwd.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    const grip = handbrake ? 2.8 : isBike ? 10.5 : 8.2;
    v.velocity.x = THREE.MathUtils.damp(v.velocity.x, _fwd.x * v.forwardSpeed, grip, dt);
    v.velocity.z = THREE.MathUtils.damp(v.velocity.z, _fwd.z * v.forwardSpeed, grip, dt);

    const nextX = v.position.x + v.velocity.x * dt;
    const nextZ = v.position.z + v.velocity.z * dt;
    const radius = v.rig.width * 0.56;
    const resolved = this.resolveCircleCollisions(nextX, nextZ, radius);

    // Bounce/slow if scraping against building/waterfront rail
    if (Math.hypot(resolved.x - nextX, resolved.z - nextZ) > 0.005) {
      if (Math.abs(v.forwardSpeed) > 5.5) {
        this.audio.playImpact(Math.min(1, Math.abs(v.forwardSpeed) / 18));
      }
      v.forwardSpeed *= 0.45;
      v.velocity.multiplyScalar(0.45);
    }

    v.position.x = THREE.MathUtils.clamp(resolved.x, this.city.bounds.minX + 1, this.city.bounds.maxX - 1);
    v.position.z = THREE.MathUtils.clamp(resolved.z, this.city.bounds.minZ + 1, this.city.bounds.maxZ - 1);

    // Curb/Sidewalk suspension spring
    const targetGround = this.groundHeightAt(v.position.x, v.position.z);
    const springForce = (targetGround - v.suspY) * 140 - v.suspVel * 16;
    v.suspVel += springForce * dt;
    v.suspY += v.suspVel * dt;
    v.position.y = Math.max(targetGround - 0.04, v.suspY);

    // Motorcycle lean angle (matches ParadiseHeatMotorcycle.cpp 12-14 deg lean into turn)
    if (isBike) {
      const targetLean =
        -steerIn * THREE.MathUtils.degToRad(14) * THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) / 10, 0, 1);
      v.leanAngle = THREE.MathUtils.damp(v.leanAngle, targetLean, 8, dt);
      v.rig.chassisGroup.rotation.z = v.leanAngle;

      // Rider feet down when stopped / foot-paddling
      const feetDown = Math.abs(v.forwardSpeed) < 1.2 ? 0.35 : 0;
      this.playerRig.leftLegPivot.rotation.z = THREE.MathUtils.damp(
        this.playerRig.leftLegPivot.rotation.z,
        feetDown,
        8,
        dt
      );
      this.playerRig.rightLegPivot.rotation.z = THREE.MathUtils.damp(
        this.playerRig.rightLegPivot.rotation.z,
        -feetDown,
        8,
        dt
      );
    } else {
      // Subtle car body roll & pitch under braking/cornering
      const roll = -steerIn * THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) / 28, 0, 1) * 0.045;
      const pitch = braking ? 0.03 : throttle > 0 ? -0.02 : 0;
      v.rig.chassisGroup.rotation.z = THREE.MathUtils.damp(v.rig.chassisGroup.rotation.z, roll, 8, dt);
      v.rig.chassisGroup.rotation.x = THREE.MathUtils.damp(v.rig.chassisGroup.rotation.x, pitch, 8, dt);
    }

    // Steering wheel & wheel mesh animation
    if (v.rig.steeringWheelPivot) {
      v.rig.steeringWheelPivot.rotation.z = THREE.MathUtils.damp(
        v.rig.steeringWheelPivot.rotation.z,
        steerIn * THREE.MathUtils.degToRad(75),
        10,
        dt
      );
    }
    v.rig.wheelSteerPivots[0].rotation.y = v.steerAngle;
    v.rig.wheelSteerPivots[1].rotation.y = v.steerAngle;
    v.wheelSpin += (v.forwardSpeed / 0.36) * dt;
    for (const w of v.rig.wheelSpinMeshes) {
      w.rotation.x = v.wheelSpin;
    }

    v.rig.group.position.copy(v.position);
    v.rig.group.rotation.y = v.yaw;

    // Keep playerPos synced for distance checks & shadow tracking
    this.playerPos.copy(v.position);

    // Collide with other vehicles & pedestrians!
    this.checkVehicleImpacts(v);

    // Engine Web Audio synthesis
    this.audio.updateEngine(true, isBike, Math.abs(v.forwardSpeed) / maxSpeed, Math.abs(throttle));
  }

  private checkVehicleImpacts(playerVeh: VehicleEntity): void {
    const pSpeed = Math.hypot(playerVeh.velocity.x, playerVeh.velocity.z);
    if (pSpeed < 2.8) return;

    // 1. Vehicle-to-vehicle collisions
    for (const other of this.vehicles) {
      if (other === playerVeh) continue;
      const dx = other.position.x - playerVeh.position.x;
      const dz = other.position.z - playerVeh.position.z;
      const minDist = (playerVeh.rig.width + other.rig.width) * 0.56;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;

        // Separate
        other.position.x += nx * overlap * 0.65;
        other.position.z += nz * overlap * 0.65;
        playerVeh.position.x -= nx * overlap * 0.35;
        playerVeh.position.z -= nz * overlap * 0.35;

        const relVx = playerVeh.velocity.x - other.velocity.x;
        const relVz = playerVeh.velocity.z - other.velocity.z;
        const closing = relVx * nx + relVz * nz;

        if (closing > 2.8) {
          this.audio.playImpact(Math.min(1, closing / 18));
          if (other.isTraffic && !other.isWreck) {
            other.isWreck = true;
            other.wreckTimer = 18;
            other.angularVel = (Math.random() - 0.5) * 4.5;
            if (other.hasOccupant) {
              other.hasOccupant = false;
              other.rig.occupantGroup.visible = false;
              this.spawnEjectedSurvivor(other);
            }
          }
          other.velocity.x += nx * closing * 0.82;
          other.velocity.z += nz * closing * 0.82;
          playerVeh.forwardSpeed *= 0.62;
          playerVeh.velocity.multiplyScalar(0.62);
          this.setEvent(`Vehicle collision · ${Math.round(closing * 3.6)} km/h`);
        }
      }
    }

    // 2. Vehicle-to-pedestrian strikes (> 4.5 m/s per CityImpactComponent.cpp)
    if (pSpeed > 4.5) {
      for (const p of this.pedestrians) {
        if (p.fallen) continue;
        const dx = p.position.x - playerVeh.position.x;
        const dz = p.position.z - playerVeh.position.z;
        const hitDist = playerVeh.rig.width * 0.65 + 0.4;
        if (dx * dx + dz * dz < hitDist * hitDist) {
          this.knockdownPedestrian(p, playerVeh.velocity.clone().multiplyScalar(0.75), false);
        }
      }
    }
  }

  private stepVehicles(dt: number): void {
    for (const v of this.vehicles) {
      if (v === this.drivenVehicle || v === this.pendingVehicle) continue;

      if (v.isWreck) {
        v.wreckTimer -= dt;
        v.velocity.x = THREE.MathUtils.damp(v.velocity.x, 0, 2.2, dt);
        v.velocity.z = THREE.MathUtils.damp(v.velocity.z, 0, 2.2, dt);
        v.angularVel = THREE.MathUtils.damp(v.angularVel, 0, 3.0, dt);

        const nextX = v.position.x + v.velocity.x * dt;
        const nextZ = v.position.z + v.velocity.z * dt;
        const res = this.resolveCircleCollisions(nextX, nextZ, v.rig.width * 0.52);
        v.position.x = THREE.MathUtils.clamp(res.x, this.city.bounds.minX, this.city.bounds.maxX);
        v.position.z = THREE.MathUtils.clamp(res.z, this.city.bounds.minZ, this.city.bounds.maxZ);
        v.position.y = this.groundHeightAt(v.position.x, v.position.z);
        v.yaw += v.angularVel * dt;

        // Riderless wrecked motorcycle tips onto its side (CityImpactComponent.cpp)
        if (v.kind === 'motorcycle') {
          v.leanAngle = THREE.MathUtils.damp(v.leanAngle, Math.PI * 0.42, 5, dt);
          v.rig.chassisGroup.rotation.z = v.leanAngle;
        }

        v.rig.group.position.copy(v.position);
        v.rig.group.rotation.y = v.yaw;
      } else if (v.isTraffic) {
        const loop = this.city.trafficLoops[v.loopIndex];
        const loopLen = this.getLoopLength(loop);

        // Simple traffic spacing check so cars slow if another car is right ahead
        let speedScale = 1.0;
        _fwd.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
        for (const other of this.vehicles) {
          if (other === v) continue;
          const dx = other.position.x - v.position.x;
          const dz = other.position.z - v.position.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 81) {
            const dist = Math.sqrt(d2);
            const dot = (dx * _fwd.x + dz * _fwd.z) / Math.max(0.1, dist);
            if (dot > 0.72) {
              speedScale = dist < 5.5 ? 0 : 0.35;
              break;
            }
          }
        }

        const currentSpeed = v.trafficSpeed * speedScale;
        v.loopT = (v.loopT + (currentSpeed * dt) / loopLen) % 1;
        this.sampleLoopPoint(loop, v.loopT, _v1, _v2);

        v.velocity.copy(_v2).multiplyScalar(currentSpeed);
        v.position.copy(_v1);
        const targetYaw = Math.atan2(_v2.x, _v2.z);
        v.yaw = dampAngle(v.yaw, targetYaw, 6, dt);

        v.wheelSpin += (currentSpeed / 0.36) * dt;
        for (const w of v.rig.wheelSpinMeshes) {
          w.rotation.x = v.wheelSpin;
        }
        v.rig.tailLightMat.emissiveIntensity = speedScale < 0.5 ? 1.8 : 0.4;
        v.rig.group.position.copy(v.position);
        v.rig.group.rotation.y = v.yaw;
      }
    }
  }

  private knockdownPedestrian(p: PedestrianEntity, impulse: THREE.Vector3, playShout: boolean): void {
    if (p.fallen) return;
    p.fallen = true;
    p.recoverAt = this.elapsed + 4.0;
    p.velocity.copy(impulse).clampLength(0, 12);
    p.knockdownRotX = -Math.PI * 0.48;
    p.knockdownRotZ = (Math.random() - 0.5) * 0.5;
    this.knockdowns++;

    if (playShout) {
      this.audio.playPedestrianShout();
      this.setEvent('Pedestrian knocked down!');
    }
  }

  private stepPedestrians(dt: number): void {
    for (const p of this.pedestrians) {
      if (p.fallen) {
        p.velocity.x = THREE.MathUtils.damp(p.velocity.x, 0, 5.0, dt);
        p.velocity.z = THREE.MathUtils.damp(p.velocity.z, 0, 5.0, dt);
        const res = this.resolveCircleCollisions(
          p.position.x + p.velocity.x * dt,
          p.position.z + p.velocity.z * dt,
          0.38
        );
        p.position.x = THREE.MathUtils.clamp(res.x, this.city.bounds.minX, this.city.bounds.maxX);
        p.position.z = THREE.MathUtils.clamp(res.z, this.city.bounds.minZ, this.city.bounds.maxZ);
        p.position.y = this.groundHeightAt(p.position.x, p.position.z) + 0.16;

        p.rig.bodyRoot.rotation.x = THREE.MathUtils.damp(p.rig.bodyRoot.rotation.x, p.knockdownRotX, 10, dt);
        p.rig.bodyRoot.rotation.z = THREE.MathUtils.damp(p.rig.bodyRoot.rotation.z, p.knockdownRotZ, 10, dt);

        if (this.elapsed >= p.recoverAt) {
          p.fallen = false;
          p.rig.bodyRoot.rotation.set(0, 0, 0);
          p.fleeUntil = this.elapsed + 5.5;
          p.fleeDir.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).normalize();
        }
      } else if (this.elapsed < p.fleeUntil) {
        // Recover & sprint flee toward sidewalk (matches CityImpactComponent.cpp FleeDirection)
        const fleeSpeed = 3.6;
        const res = this.resolveCircleCollisions(
          p.position.x + p.fleeDir.x * fleeSpeed * dt,
          p.position.z + p.fleeDir.z * fleeSpeed * dt,
          0.38
        );
        p.position.x = THREE.MathUtils.clamp(res.x, this.city.bounds.minX, this.city.bounds.maxX);
        p.position.z = THREE.MathUtils.clamp(res.z, this.city.bounds.minZ, this.city.bounds.maxZ);
        p.position.y = this.groundHeightAt(p.position.x, p.position.z);
        p.yaw = Math.atan2(p.fleeDir.x, p.fleeDir.z);

        p.walkPhase += dt * fleeSpeed * 2.8;
        p.rig.leftLegPivot.rotation.x = Math.sin(p.walkPhase) * 0.7;
        p.rig.rightLegPivot.rotation.x = -Math.sin(p.walkPhase) * 0.7;
        p.rig.leftArmPivot.rotation.x = -Math.sin(p.walkPhase) * 0.65;
        p.rig.rightArmPivot.rotation.x = Math.sin(p.walkPhase) * 0.65;
      } else {
        // Normal sidewalk stroll
        const loop = this.city.pedestrianLoops[p.loopIndex];
        const loopLen = this.getLoopLength(loop);
        p.loopT = (p.loopT + (p.walkSpeed * dt) / loopLen) % 1;
        this.sampleLoopPoint(loop, p.loopT, _v1, _v2);
        p.position.copy(_v1);
        p.position.y = this.groundHeightAt(p.position.x, p.position.z);
        p.yaw = dampAngle(p.yaw, Math.atan2(_v2.x, _v2.z), 6, dt);

        p.walkPhase += dt * p.walkSpeed * 2.8;
        p.rig.leftLegPivot.rotation.x = Math.sin(p.walkPhase) * 0.42;
        p.rig.rightLegPivot.rotation.x = -Math.sin(p.walkPhase) * 0.42;
        p.rig.leftArmPivot.rotation.x = -Math.sin(p.walkPhase) * 0.36;
        p.rig.rightArmPivot.rotation.x = Math.sin(p.walkPhase) * 0.36;
      }

      p.rig.group.position.copy(p.position);
      p.rig.group.rotation.y = p.yaw;
    }
  }

  private updateCamera(dt: number): void {
    const v = this.drivenVehicle;
    if (v && this.cameraView === 'cockpit' && v.kind !== 'motorcycle') {
      // First-person Cockpit View inside the car cabin looking over steering wheel
      _v1.copy(v.rig.cockpitEyeLocal);
      _v1.applyAxisAngle(_v3.set(0, 1, 0), v.yaw);
      _v1.add(v.position);
      this.camera.position.copy(_v1);

      const lookYaw = v.yaw + (this.elapsed - this.lastCarLookTime < 2.2 ? this.camYaw - v.yaw : 0);
      _fwd.set(Math.sin(lookYaw), Math.sin(this.camPitch + 0.12) * 0.55, Math.cos(lookYaw)).normalize();
      _camTarget.copy(_v1).addScaledVector(_fwd, 12);
      this.camera.lookAt(_camTarget);

      // Widening FOV with speed
      const targetFov = 68 + THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) * 0.35, 0, 12);
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    // Auto-follow behind moving vehicle after 2s of no manual look (matches ParadiseHeatMotorcycle.cpp)
    if (v && Math.abs(v.forwardSpeed) > 1.8 && this.elapsed - this.lastCarLookTime > 2.0) {
      const targetFollowYaw = v.forwardSpeed >= 0 ? v.yaw + Math.PI : v.yaw;
      this.camYaw = dampAngle(this.camYaw, targetFollowYaw, 2.6, dt);
    }

    const focus = v ? v.position : this.playerPos;
    const armDist = v ? (v.kind === 'truck' ? 8.2 : v.kind === 'motorcycle' ? 4.4 : 6.0) : 4.2;
    const targetHeight = v ? (v.kind === 'truck' ? 2.1 : 1.25) : 1.55;

    _camTarget.set(focus.x, focus.y + targetHeight, focus.z);

    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);
    _camDesired.set(
      _camTarget.x + Math.sin(this.camYaw) * cosP * armDist,
      Math.max(focus.y + 0.55, _camTarget.y - sinP * armDist),
      _camTarget.z + Math.cos(this.camYaw) * cosP * armDist
    );

    this.camera.position.lerp(_camDesired, 1 - Math.exp(-14 * dt));
    this.camera.lookAt(_camTarget);

    const speed = v ? Math.abs(v.forwardSpeed) : 0;
    const targetFov = 60 + THREE.MathUtils.clamp(speed * 0.38, 0, 14);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private renderScene(): void {
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = Math.max(1, this.renderer.domElement.clientHeight || window.innerHeight);

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.render(this.scene, this.camera);

    // Live Rearview Mirror inset in Cockpit Car Mode (CarMirrors.inl)
    const v = this.drivenVehicle;
    if (v && this.cameraView === 'cockpit' && v.kind !== 'motorcycle') {
      this.mirrorFrameCount++;
      if (this.isSoftwareGl && this.mirrorFrameCount % 3 !== 0) return;

      const mw = Math.min(280, Math.floor(w * 0.24));
      const mh = Math.floor(mw * 0.28);
      const mx = Math.floor((w - mw) * 0.5);
      const my = h - mh - 20; // Top-center in GL viewport coords (y from bottom)

      // Mount mirror camera at top-windshield facing rearward (-v.yaw)
      _v1.set(0, v.rig.height - 0.18, -v.rig.length * 0.45);
      _v1.applyAxisAngle(_v3.set(0, 1, 0), v.yaw);
      _v1.add(v.position);
      this.mirrorCamera.position.copy(_v1);

      _fwd.set(-Math.sin(v.yaw), -0.04, -Math.cos(v.yaw));
      this.mirrorCamera.lookAt(_v2.copy(_v1).addScaledVector(_fwd, 25));
      this.mirrorCamera.aspect = mw / Math.max(1, mh);
      this.mirrorCamera.updateProjectionMatrix();

      this.renderer.setScissorTest(true);
      this.renderer.setViewport(mx, my, mw, mh);
      this.renderer.setScissor(mx, my, mw, mh);
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.mirrorCamera);
      this.renderer.setScissorTest(false);
    }
  }

  private groundHeightAt(x: number, z: number): number {
    for (const s of this.city.sidewalks) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
        return s.height;
      }
    }
    return 0;
  }

  private isPointInsideCollider(x: number, z: number, radius: number): boolean {
    for (const c of this.city.colliders) {
      if (
        x + radius > c.minX &&
        x - radius < c.maxX &&
        z + radius > c.minZ &&
        z - radius < c.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  private resolveCircleCollisions(x: number, z: number, radius: number): { x: number; z: number } {
    let rx = x;
    let rz = z;
    for (const c of this.city.colliders) {
      const closestX = THREE.MathUtils.clamp(rx, c.minX, c.maxX);
      const closestZ = THREE.MathUtils.clamp(rz, c.minZ, c.maxZ);
      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          // Center inside AABB — push out along shallowest axis
          const dl = Math.abs(rx - c.minX);
          const dr = Math.abs(c.maxX - rx);
          const dt = Math.abs(rz - c.minZ);
          const db = Math.abs(c.maxZ - rz);
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) rx = c.minX - radius;
          else if (m === dr) rx = c.maxX + radius;
          else if (m === dt) rz = c.minZ - radius;
          else rz = c.maxZ + radius;
        }
      }
    }
    return { x: rx, z: rz };
  }

  private getLoopLength(pts: THREE.Vector3[]): number {
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      total += a.distanceTo(b);
    }
    return total;
  }

  private sampleLoopPoint(
    pts: THREE.Vector3[],
    tNorm: number,
    outPos: THREE.Vector3,
    outDir: THREE.Vector3
  ): THREE.Vector3 {
    const total = this.getLoopLength(pts);
    let targetDist = ((tNorm % 1) + 1) % 1 * total;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const segLen = a.distanceTo(b);
      if (targetDist <= segLen || i === pts.length - 1) {
        const alpha = segLen > 0 ? targetDist / segLen : 0;
        outPos.lerpVectors(a, b, alpha);
        outDir.subVectors(b, a).normalize();
        return outPos;
      }
      targetDist -= segLen;
    }
    outPos.copy(pts[0]);
    outDir.set(1, 0, 0);
    return outPos;
  }

  private getZoneLabel(): string {
    const z = this.drivenVehicle ? this.drivenVehicle.position.z : this.playerPos.z;
    if (z < -34) return 'Waterfront Promenade';
    if (z < -20) return 'Oceanfront Boulevard';
    if (z < 6) return 'Central Plaza';
    if (z < 50) return 'Midtown District';
    return 'Uptown Avenue';
  }

  private setEvent(text: string): void {
    this.lastEventText = text;
    this.lastEventTime = this.elapsed;
  }

  private emitHud(): void {
    const v = this.drivenVehicle;
    const nearby = v ? null : this.findNearestVehicle(4.4);
    const speedKmh = v ? Math.round(Math.abs(v.forwardSpeed) * 3.6) : Math.round(Math.hypot(this.playerVel.x, this.playerVel.z) * 3.6);

    const gearLabel = !v
      ? 'FOOT'
      : v.forwardSpeed < -0.5
        ? 'R'
        : Math.abs(v.forwardSpeed) < 0.4
          ? 'N'
          : String(Math.min(5, Math.max(1, Math.ceil(speedKmh / 24))));

    const eventFresh = this.elapsed - this.lastEventTime < 4.5 ? this.lastEventText : '';

    this.onHudUpdate({
      mode: !v ? 'foot' : v.kind === 'motorcycle' ? 'motorcycle' : 'car',
      vehicleKind: v ? v.kind : null,
      vehicleLabel: v ? v.label : 'On Foot · Nathan',
      speedKmh,
      gearLabel,
      rpmRatio: v ? THREE.MathUtils.clamp((speedKmh % 28) / 28 * 0.75 + 0.2, 0.15, 0.96) : 0,
      cameraView: this.cameraView,
      canEnterVehicle: Boolean(!v && nearby),
      nearbyVehicleLabel: nearby ? nearby.label : '',
      canPunch: !v && !this.pendingVehicle,
      isEntering: Boolean(this.pendingVehicle),
      pointerLocked: this.pointerLocked,
      paused: this.paused,
      knockdowns: this.knockdowns,
      timeOfDay: this.settings.timeOfDay,
      districtZone: this.getZoneLabel(),
      lastEventText: eventFresh,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);

    this.audio.dispose();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}
