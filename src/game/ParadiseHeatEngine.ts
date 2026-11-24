import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  CameraViewMode,
  GpsWaypoint,
  HudSnapshot,
  MinimapRadarEntity,
  NpcArchetype,
  ParadiseHeatSettings,
  PoiKind,
  TimeOfDay,
  VehicleKind,
  WeaponKind,
} from './types';
import { ParadiseHeatAudio } from './audio';
import { createBloodDecalTexture } from './textures';
import {
  applyVehicleDent,
  buildSecurityGuard,
  buildUniformedPoliceOfficer,
  buildVehicleModel,
  HumanRig,
  PoliceOfficerRig,
  repaintVehicleRig,
  resetVehicleDent,
  VehicleRig,
} from './models';
import { CivilianInstance, CivilianOutfitTint, createCivilianInstance } from './civilianGltf';
import { FpsViewModel } from './fpsViewmodel';
import { PlayerCharacterController } from './playerCharacter';
import { buildCityDistrict, CityMapData, ShopPoiRuntime } from './cityBuilder';

export const SUNSET_HDR_URL =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/venice_sunset_1k.hdr';

// Pre-allocated scratch math helpers (zero per-frame GC)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere();
const _raycaster = new THREE.Raycaster();
const _centerNdc = new THREE.Vector2(0, 0);
const _muzzleVec = new THREE.Vector3();
const _ejectVec = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

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
  isPolice: boolean;
  isPursuing: boolean;
  isWreck: boolean;
  wreckTimer: number;
  angularVel: number;
  loopIndex: number;
  loopT: number;
  trafficSpeed: number;
  hasOccupant: boolean;
  ramCooldown: number;
  officersDeployed: boolean;
  deployPauseTimer: number;
}

interface PedestrianEntity {
  id: string;
  archetype: NpcArchetype;
  hp: number;
  maxHp: number;
  dead: boolean;
  combatState: 'ambient' | 'hostile' | 'flee';
  attackCooldown: number;
  group: THREE.Group;
  rig: HumanRig | null;
  civilian: CivilianInstance | null;
  position: THREE.Vector3;
  yaw: number;
  velocity: THREE.Vector3;
  loopIndex: number;
  loopT: number;
  isFreeRoamer: boolean;
  roamTarget: THREE.Vector3;
  walkSpeed: number;
  fallen: boolean;
  recoverAt: number;
  fleeUntil: number;
  fleeDir: THREE.Vector3;
  knockdownRotX: number;
  knockdownRotZ: number;
  walkPhase: number;
}

interface OfficerEntity {
  id: string;
  vehicle: VehicleEntity;
  rig: PoliceOfficerRig;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  hp: number;
  dead: boolean;
  fallen: boolean;
  recoverAt: number;
  fireCooldown: number;
  muzzleTimer: number;
  walkPhase: number;
}

interface BloodParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
}

interface BulletTracer {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
}

interface ShellCasing {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  bounced: boolean;
  active: boolean;
}

interface GlassShard {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  active: boolean;
}

interface SecurityGuardEntity {
  id: string;
  shop: ShopPoiRuntime;
  rig: PoliceOfficerRig;
  position: THREE.Vector3;
  spawnPos: THREE.Vector3;
  spawnYaw: number;
  velocity: THREE.Vector3;
  yaw: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  hostile: boolean;
  staggerTimer: number;
  fireCooldown: number;
  meleeCooldown: number;
  muzzleTimer: number;
  walkPhase: number;
}

type LightColor = 'green' | 'yellow' | 'red';

const CITY_SPEED_LIMIT_KMH = 50;
const SPEEDING_THRESHOLD_KMH = 62;
const FREEZE_DIST_SQ = 100 * 100;
const VEHICLE_CULL_DIST_SQ = 190 * 190;
const LOD_MAX_CULL_DIST_SQ = 260 * 260;

const WEAPON_SPECS: Record<
  Exclude<WeaponKind, 'unarmed'>,
  { label: string; cooldown: number; damage: number; range: number; spread: number }
> = {
  pistol: { label: '9mm Pistol', cooldown: 0.3, damage: 35, range: 68, spread: 0.012 },
  smg: { label: 'Micro SMG', cooldown: 0.11, damage: 35, range: 58, spread: 0.03 },
  rifle: { label: 'Carbine Rifle', cooldown: 0.18, damage: 45, range: 95, spread: 0.008 },
};

const VEHICLE_LABELS: Record<VehicleKind, string> = {
  supercar: 'Veloce GT-R',
  convertible: 'Solstice Roadster',
  sedan: 'City Sedan',
  suv: 'District SUV',
  coupe: 'Mz3 Coupe',
  truck: 'Box Truck',
  police: 'Police Interceptor',
  motorcycle: 'Bobber 1200',
};

export class ParadiseHeatEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mirrorCamera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private anisotropy: number;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private roomEnvTexture: THREE.Texture | null = null;
  private sunsetEnvTexture: THREE.Texture | null = null;
  private city: CityMapData;
  private audio: ParadiseHeatAudio;
  private settings: ParadiseHeatSettings;

  // Player state (Civilian GLB + AnimationMixer + First-Person ViewModel)
  private playerCharacter: PlayerCharacterController;
  private fpsViewModel: FpsViewModel;
  private fpsBobPhase = 0;
  private playerPos = new THREE.Vector3(0, 0.18, -12.0);
  private playerVel = new THREE.Vector3();
  private playerYaw = Math.PI;
  private playerGrounded = true;
  private punchTimer = 0;
  private punchHitDone = false;
  private hitStopTimer = 0;

  // Player Health & Death state
  private playerHealth = 100;
  private readonly maxPlayerHealth = 100;
  private isDead = false;
  private deathElapsed = 0;
  private damageFlashTimer = 0;

  // Camera state
  private camYaw = Math.PI;
  private camPitch = -0.22;
  private lastCarLookTime = -10;
  private cameraView: CameraViewMode = 'chase';
  private pointerLocked = false;
  private draggingLook = false;
  private isAimingRightClick = false;
  private adsBlend = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Vehicle & entry state
  private vehicles: VehicleEntity[] = [];
  private drivenVehicle: VehicleEntity | null = null;
  private pendingVehicle: VehicleEntity | null = null;
  private entryTimer = 0;
  private entryStartPos = new THREE.Vector3();
  private autoMountBlockedUntil = 0;

  // Pedestrians, Dismounted Cops, Store Security, Traffic Lights & VFX Pools
  private pedestrians: PedestrianEntity[] = [];
  private officers: OfficerEntity[] = [];
  private securityGuards: SecurityGuardEntity[] = [];
  private bloodParticles: BloodParticle[] = [];
  private bloodDecals: THREE.Mesh[] = [];
  private bloodDecalCursor = 0;
  private bloodDecalTex: THREE.CanvasTexture | null = null;
  private bulletTracers: BulletTracer[] = [];
  private shellCasings: ShellCasing[] = [];
  private glassShards: GlassShard[] = [];

  // Economy, Collectible Weapons, Interiors, Witness Police & Purple GPS Routing
  private playerCash = 1200;
  private equippedWeapon: WeaponKind = 'unarmed';
  private ownedWeapons = new Set<WeaponKind>(['unarmed', 'pistol']);
  private ammo: Record<WeaponKind, number> = { unarmed: 0, pistol: 60, smg: 0, rifle: 0 };
  private playerFireCooldown = 0;
  private playerShootAnimTimer = 0;

  private insideShop: ShopPoiRuntime | null = null;
  private shopMenuOpen = false;
  private activeMenuShopKind: PoiKind | null = null;
  private mapOpen = false;
  private shopDoorCooldown = 0;
  private lastDrivenVehicle: VehicleEntity | null = null;
  private tunedVehicleIds = new Set<string>();
  private interiorLight: THREE.PointLight;

  private lastBreakInShop: ShopPoiRuntime | null = null;
  private breakInWitnessUntil = -10;

  private gpsPin: GpsWaypoint | null = null;
  private gpsPath: { x: number; z: number }[] = [];
  private gpsPathGroup = new THREE.Group();
  private gpsBeaconGroup = new THREE.Group();
  private gpsRecomputeAccum = 0;

  private pedSpawnGen = 0;
  private knockdowns = 0;
  private ewSignal: LightColor = 'green';
  private nsSignal: LightColor = 'red';
  private wantedLevel = 0;
  private wantedReason = '';
  private evadeTimer = 0;
  private bustedHoldTimer = 0;
  private bustedBannerTimer = 0;
  private lastEventText = 'Visit Shops · Get Guns at Ammu-Nation · Press M for Map & GPS';
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
  private handleMouseUp: (e: MouseEvent) => void;
  private handleContextMenu: (e: MouseEvent) => void;
  private handleWheel: (e: WheelEvent) => void;
  private handleBlur: () => void;

  constructor(
    container: HTMLElement,
    initialSettings: ParadiseHeatSettings,
    onHudUpdate: (hud: HudSnapshot) => void,
    onPauseToggle: () => void,
    initialPaused = false
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.onHudUpdate = onHudUpdate;
    this.onPauseToggle = onPauseToggle;
    this.paused = initialPaused;
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

    const w = container.clientWidth || window.innerWidth;
    const h = Math.max(1, container.clientHeight || window.innerHeight);

    // 2. Renderer setup (ACESFilmicToneMapping + capped DPR 1.5)
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(1);
    this.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    });
    container.appendChild(this.renderer.domElement);

    // 3. Scene, Environment (RoomEnvironment fallback + Sunset HDR sky & reflections) & Cameras
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.roomEnvTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.roomEnvTexture;
    this.scene.environmentIntensity = 1.2;
    pmrem.dispose();

    const hdrPmrem = new THREE.PMREMGenerator(this.renderer);
    hdrPmrem.compileEquirectangularShader();
    const rgbeLoader = new RGBELoader();
    rgbeLoader.setCrossOrigin('anonymous');
    rgbeLoader.load(
      SUNSET_HDR_URL,
      (hdrTex) => {
        if (this.disposed) {
          hdrTex.dispose();
          hdrPmrem.dispose();
          return;
        }
        const envTex = hdrPmrem.fromEquirectangular(hdrTex).texture;
        this.sunsetEnvTexture = envTex;
        hdrTex.dispose();
        hdrPmrem.dispose();

        this.scene.environment = envTex;
        if (this.settings.timeOfDay === 'sunset') {
          this.scene.background = envTex;
        }
      },
      undefined,
      (err) => {
        hdrPmrem.dispose();
        console.warn('[ParadiseHeat] Sunset HDR failed to load, retaining RoomEnvironment.', err);
      }
    );

    const aspect = w / h;
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.12, 480);
    this.scene.add(this.camera);
    this.mirrorCamera = new THREE.PerspectiveCamera(68, 3.6, 0.15, 160);

    this.fpsViewModel = new FpsViewModel();
    this.camera.add(this.fpsViewModel.group);
    this.fpsViewModel.setWeapon(this.equippedWeapon);

    // 3b. Hyper-Realistic EffectComposer + RenderPass + Subtle UnrealBloomPass + OutputPass
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(1);
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.42, 0.86);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    // 4. Lighting Rig (1024x1024 shadow map for locked 60 FPS on Mac)
    this.hemiLight = new THREE.HemisphereLight(0xbbe2ff, 0x5c5346, 0.65);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.1);
    this.sunLight.position.set(55, 88, -42);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const d = 64;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 210;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.interiorLight = new THREE.PointLight(0xfff4e0, 0, 24, 1.4);
    this.scene.add(this.interiorLight);

    this.applyQualityPixelRatio();

    // 5. Build 5x Expanded LOD City Map + 5 POI Shops
    this.city = buildCityDistrict(this.anisotropy, this.isSoftwareGl);
    this.scene.add(this.city.cityGroup);

    // 6. Initialize Pre-Allocated VFX Pools & 3D Purple GPS Route Group
    this.initVfxPools();
    this.initGpsVisuals();

    // 7. Build Player (Civilian GLB + AnimationMixer)
    this.playerCharacter = new PlayerCharacterController({
      isSoftwareGl: this.isSoftwareGl,
      anisotropy: this.anisotropy,
    });
    this.playerCharacter.group.position.copy(this.playerPos);
    this.playerCharacter.group.rotation.y = this.playerYaw;
    this.scene.add(this.playerCharacter.group);

    // 8. Spawn Hero Vehicles, Traffic, Police Cruisers & 26 Varied District NPCs
    this.spawnWorldEntities();

    this.applyTimeOfDay(this.settings.timeOfDay);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 9. Bind Events
    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.mapOpen) {
          this.setMapOpen(false);
        } else if (this.shopMenuOpen) {
          this.closeShopMenu();
        } else {
          this.onPauseToggle();
        }
        return;
      }
      if (this.paused || this.isDead) return;
      this.audio.unlock();

      if (e.code === 'KeyM' && !e.repeat) {
        e.preventDefault();
        this.toggleMapModal();
        return;
      }

      if (this.mapOpen || this.shopMenuOpen) {
        if (e.code === 'KeyE' && !e.repeat && this.shopMenuOpen) {
          this.closeShopMenu();
        }
        return;
      }

      this.keys.add(e.code);

      if (e.code === 'KeyE' && !e.repeat) {
        this.handleInteractKey();
      } else if (e.code === 'KeyR' && !e.repeat) {
        this.triggerStoreBreakIn();
      } else if (e.code === 'KeyF' && !e.repeat) {
        if (this.equippedWeapon !== 'unarmed' && !this.drivenVehicle && !this.pendingVehicle) {
          this.firePlayerWeapon();
        } else {
          this.triggerPunch();
        }
      } else if (e.code === 'KeyG' && !e.repeat) {
        this.firePlayerWeapon();
      } else if (e.code === 'KeyQ' && !e.repeat) {
        this.cycleWeapon();
      } else if (e.code === 'Digit1' && !e.repeat) {
        this.equipWeapon(this.equippedWeapon === 'pistol' ? 'unarmed' : 'pistol');
      } else if (e.code === 'Digit2' && !e.repeat) {
        this.equipWeapon('smg');
      } else if (e.code === 'Digit3' && !e.repeat) {
        this.equipWeapon('rifle');
      } else if (e.code === 'Digit4' && !e.repeat) {
        this.equipWeapon('unarmed');
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
      const rw = this.container.clientWidth || window.innerWidth;
      const rh = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.camera.aspect = rw / rh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rw, rh);
      if (this.composer) {
        this.composer.setSize(rw, rh);
      }
    };

    this.handlePointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      this.emitHud();
    };

    this.handleContextMenu = (e: MouseEvent) => {
      if (e.target === this.renderer.domElement) {
        e.preventDefault();
      }
    };

    this.handleWheel = (e: WheelEvent) => {
      if (this.paused || this.isDead || this.mapOpen || this.shopMenuOpen) return;
      if (this.drivenVehicle || this.pendingVehicle) return;
      if (Math.abs(e.deltaY) < 2) return;
      this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    };

    this.handleMouseDown = (e: MouseEvent) => {
      if (this.paused || this.isDead || this.mapOpen || this.shopMenuOpen) return;
      this.audio.unlock();
      if (e.target === this.renderer.domElement) {
        if (e.button === 2) {
          this.isAimingRightClick = true;
          return;
        }
        if (
          e.button === 0 &&
          !this.drivenVehicle &&
          !this.pendingVehicle
        ) {
          if (this.equippedWeapon !== 'unarmed') {
            this.firePlayerWeapon();
          } else if (this.cameraView === 'firstperson') {
            this.triggerPunch();
          }
        }
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

    this.handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        this.isAimingRightClick = false;
      } else {
        this.draggingLook = false;
      }
      if (e.buttons === 0) {
        this.draggingLook = false;
        this.isAimingRightClick = false;
      }
    };

    this.handleMouseMove = (e: MouseEvent) => {
      if (this.paused || this.isDead) return;
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
      const minPitch = this.cameraView === 'firstperson' ? -78 : -65;
      const maxPitch = this.cameraView === 'firstperson' ? 75 : 8;
      this.camPitch = THREE.MathUtils.clamp(
        this.camPitch + dy * sens * ySign,
        THREE.MathUtils.degToRad(minPitch),
        THREE.MathUtils.degToRad(maxPitch)
      );
      if (this.drivenVehicle) {
        this.lastCarLookTime = this.elapsed;
      }
    };

    this.handleBlur = () => {
      this.keys.clear();
      this.draggingLook = false;
      this.isAimingRightClick = false;
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('wheel', this.handleWheel, { passive: true });
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);

    this.camera.position.set(0, 3.2, -9.2);
    this.camera.lookAt(0, 1.4, -18);

    this.emitHud();
    this.scheduleNextFrame();
  }

  private initVfxPools(): void {
    // 1. Blood droplet particles (36 pooled spheres)
    const dropGeo = new THREE.SphereGeometry(0.055, 6, 6);
    const dropMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0x450a0a,
      roughness: 0.25,
      metalness: 0.1,
    });
    for (let i = 0; i < 36; i++) {
      const mesh = new THREE.Mesh(dropGeo, dropMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.bloodParticles.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        active: false,
      });
    }

    // 2. Ground blood decals (32 pooled textured splats)
    this.bloodDecalTex = createBloodDecalTexture(this.anisotropy);
    const decalGeo = new THREE.PlaneGeometry(1.45, 1.45);
    const decalMat = new THREE.MeshStandardMaterial({
      map: this.bloodDecalTex,
      transparent: true,
      depthWrite: false,
      roughness: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(decalGeo, decalMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.bloodDecals.push(mesh);
    }

    // 3. Bullet tracer streaks (16 pooled glowing bolts)
    const tracerGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.35, 6);
    tracerGeo.rotateX(Math.PI / 2);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(tracerGeo, tracerMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.bulletTracers.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        active: false,
      });
    }

    // 4. Ejected 3D brass shell casings (24 pooled)
    const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.028, 6);
    shellGeo.rotateX(Math.PI / 2);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.9,
      roughness: 0.25,
    });
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(shellGeo, shellMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shellCasings.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        bounced: false,
        active: false,
      });
    }

    // 5. Shattered car glass shards (28 pooled)
    const shardGeo = new THREE.TetrahedronGeometry(0.055, 0);
    const shardMat = new THREE.MeshPhysicalMaterial({
      color: 0xbae6fd,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 0.78,
    });
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(shardGeo, shardMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.glassShards.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        active: false,
      });
    }
  }

  private spawnShellCasing(origin: THREE.Vector3, ejectRight: THREE.Vector3): void {
    for (const sc of this.shellCasings) {
      if (sc.active) continue;
      sc.active = true;
      sc.bounced = false;
      sc.life = 1.6;
      sc.mesh.visible = true;
      sc.mesh.position.copy(origin);
      sc.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      sc.vel
        .copy(ejectRight)
        .multiplyScalar(1.9 + Math.random() * 0.9)
        .addScaledVector(_v3.set(0, 1, 0), 1.7 + Math.random() * 0.8);
      sc.spin.set(14 + Math.random() * 14, 18 + Math.random() * 14, 12 + Math.random() * 12);
      break;
    }
  }

  private spawnGlassBurst(pos: THREE.Vector3): void {
    let count = 0;
    for (const gs of this.glassShards) {
      if (gs.active) continue;
      gs.active = true;
      gs.life = 0.85 + Math.random() * 0.35;
      gs.mesh.visible = true;
      gs.mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.3,
        pos.y + (Math.random() - 0.5) * 0.25,
        pos.z + (Math.random() - 0.5) * 0.3
      );
      gs.vel.set(
        (Math.random() - 0.5) * 4.8,
        1.1 + Math.random() * 2.4,
        (Math.random() - 0.5) * 4.8
      );
      gs.spin.set(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      );
      count++;
      if (count >= 10) break;
    }
  }

  private spawnBloodBurst(pos: THREE.Vector3): void {
    let spawned = 0;
    for (const bp of this.bloodParticles) {
      if (bp.active) continue;
      bp.active = true;
      bp.life = 0.45 + Math.random() * 0.25;
      bp.mesh.visible = true;
      bp.mesh.position.set(pos.x, pos.y + 1.08 + (Math.random() - 0.5) * 0.25, pos.z);
      bp.vel.set(
        (Math.random() - 0.5) * 4.2,
        1.6 + Math.random() * 2.6,
        (Math.random() - 0.5) * 4.2
      );
      spawned++;
      if (spawned >= 10) break;
    }
  }

  private spawnBloodDecal(pos: THREE.Vector3): void {
    if (this.bloodDecals.length === 0) return;
    const decal = this.bloodDecals[this.bloodDecalCursor % this.bloodDecals.length];
    this.bloodDecalCursor++;
    const groundY = this.groundHeightAt(pos.x, pos.z);
    decal.position.set(
      pos.x + (Math.random() - 0.5) * 0.35,
      groundY + 0.025,
      pos.z + (Math.random() - 0.5) * 0.35
    );
    decal.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.72 + Math.random() * 0.58;
    decal.scale.set(s, s, 1);
    decal.visible = true;
  }

  private spawnBulletTracer(origin: THREE.Vector3, target: THREE.Vector3): void {
    for (const bt of this.bulletTracers) {
      if (bt.active) continue;
      bt.active = true;
      bt.life = 0.36;
      bt.mesh.visible = true;
      bt.mesh.position.copy(origin);
      _v1.subVectors(target, origin).normalize();
      bt.vel.copy(_v1).multiplyScalar(58);
      bt.mesh.lookAt(target);
      break;
    }
  }

  private clearVfxPools(): void {
    for (const bp of this.bloodParticles) {
      bp.active = false;
      bp.mesh.visible = false;
    }
    for (const d of this.bloodDecals) {
      d.visible = false;
    }
    for (const bt of this.bulletTracers) {
      bt.active = false;
      bt.mesh.visible = false;
    }
    for (const sc of this.shellCasings) {
      sc.active = false;
      sc.mesh.visible = false;
    }
    for (const gs of this.glassShards) {
      gs.active = false;
      gs.mesh.visible = false;
    }
  }

  private clearOfficers(): void {
    for (const off of this.officers) {
      this.scene.remove(off.rig.group);
      this.disposeObjectMeshes(off.rig.group);
    }
    this.officers = [];
  }

  private clearSecurityGuards(): void {
    for (const g of this.securityGuards) {
      this.scene.remove(g.rig.group);
      this.disposeObjectMeshes(g.rig.group);
    }
    this.securityGuards = [];
  }

  private initGpsVisuals(): void {
    this.scene.add(this.gpsPathGroup);
    this.scene.add(this.gpsBeaconGroup);
    this.gpsBeaconGroup.visible = false;

    const ringGeo = new THREE.RingGeometry(0.95, 1.45, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    this.gpsBeaconGroup.add(ring);

    const beamGeo = new THREE.CylinderGeometry(0.22, 0.55, 34, 14, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 17;
    this.gpsBeaconGroup.add(beam);
  }

  public setGpsWaypoint(x: number, z: number, label = 'Custom GPS Pin'): void {
    const cx = THREE.MathUtils.clamp(x, this.city.bounds.minX + 6, this.city.bounds.maxX - 6);
    const cz = THREE.MathUtils.clamp(z, this.city.bounds.minZ + 6, this.city.bounds.maxZ - 6);
    this.gpsPin = { x: cx, z: cz, label };
    const startPos = this.insideShop
      ? this.insideShop.outsideReturn
      : this.drivenVehicle
        ? this.drivenVehicle.position
        : this.playerPos;
    this.gpsPath = this.computeRoadGpsPath(startPos.x, startPos.z, cx, cz);
    this.updateGpsMeshes();
    this.setEvent(`GPS Route set → ${label}`);
    this.emitHud();
  }

  public clearGpsWaypoint(): void {
    this.gpsPin = null;
    this.gpsPath = [];
    this.updateGpsMeshes();
    this.emitHud();
  }

  private computeRoadGpsPath(
    sx: number,
    sz: number,
    gx: number,
    gz: number
  ): { x: number; z: number }[] {
    const xs = this.city.nsRoads;
    const zs = this.city.ewRoads;
    if (xs.length === 0 || zs.length === 0) {
      return [
        { x: sx, z: sz },
        { x: gx, z: gz },
      ];
    }

    const cols = xs.length;
    const rows = zs.length;
    const total = cols * rows;

    const nearestNode = (px: number, pz: number) => {
      let bestIdx = 0;
      let bestD2 = Infinity;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dx = xs[c] - px;
          const dz = zs[r] - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestIdx = r * cols + c;
          }
        }
      }
      return bestIdx;
    };

    const startIdx = nearestNode(sx, sz);
    const goalIdx = nearestNode(gx, gz);

    const dist = new Float64Array(total).fill(Infinity);
    const prev = new Int32Array(total).fill(-1);
    const visited = new Uint8Array(total);
    dist[startIdx] = 0;

    for (let step = 0; step < total; step++) {
      let u = -1;
      let minD = Infinity;
      for (let i = 0; i < total; i++) {
        if (!visited[i] && dist[i] < minD) {
          minD = dist[i];
          u = i;
        }
      }
      if (u === -1 || u === goalIdx) break;
      visited[u] = 1;

      const r = Math.floor(u / cols);
      const c = u % cols;
      const neighbors: number[] = [];
      if (c > 0) neighbors.push(r * cols + (c - 1));
      if (c < cols - 1) neighbors.push(r * cols + (c + 1));
      if (r > 0) neighbors.push((r - 1) * cols + c);
      if (r < rows - 1) neighbors.push((r + 1) * cols + c);

      for (const v of neighbors) {
        if (visited[v]) continue;
        const vr = Math.floor(v / cols);
        const vc = v % cols;
        const w = Math.hypot(xs[vc] - xs[c], zs[vr] - zs[r]);
        if (dist[u] + w < dist[v]) {
          dist[v] = dist[u] + w;
          prev[v] = u;
        }
      }
    }

    const roadNodes: { x: number; z: number }[] = [];
    let cur = goalIdx;
    while (cur !== -1) {
      const r = Math.floor(cur / cols);
      const c = cur % cols;
      roadNodes.push({ x: xs[c], z: zs[r] });
      cur = prev[cur];
    }
    roadNodes.reverse();

    const pts: { x: number; z: number }[] = [{ x: sx, z: sz }];
    for (const n of roadNodes) {
      const last = pts[pts.length - 1];
      if (Math.hypot(n.x - last.x, n.z - last.z) > 1.2) {
        pts.push(n);
      }
    }
    const tail = pts[pts.length - 1];
    if (Math.hypot(gx - tail.x, gz - tail.z) > 1.0) {
      pts.push({ x: gx, z: gz });
    }
    return pts;
  }

  private updateGpsMeshes(): void {
    while (this.gpsPathGroup.children.length > 0) {
      const child = this.gpsPathGroup.children[0] as THREE.Mesh;
      this.gpsPathGroup.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material?.dispose();
      }
    }

    if (!this.gpsPin || this.gpsPath.length < 2) {
      this.gpsBeaconGroup.visible = false;
      return;
    }

    const gy = this.groundHeightAt(this.gpsPin.x, this.gpsPin.z);
    this.gpsBeaconGroup.position.set(this.gpsPin.x, gy, this.gpsPin.z);
    this.gpsBeaconGroup.visible = true;

    const pathMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x9333ea,
      emissiveIntensity: 1.9,
      roughness: 0.35,
      transparent: true,
      opacity: 0.88,
    });
    const nodeMat = new THREE.MeshBasicMaterial({
      color: 0xd8b4fe,
      transparent: true,
      opacity: 0.9,
    });

    for (let i = 0; i < this.gpsPath.length - 1; i++) {
      const a = this.gpsPath[i];
      const b = this.gpsPath[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue;

      const stripGeo = new THREE.BoxGeometry(0.95, 0.06, len);
      const strip = new THREE.Mesh(stripGeo, pathMat);
      strip.position.set((a.x + b.x) * 0.5, 0.06, (a.z + b.z) * 0.5);
      strip.rotation.y = Math.atan2(dx, dz);
      this.gpsPathGroup.add(strip);

      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.07, 14), nodeMat);
      dot.position.set(b.x, 0.065, b.z);
      this.gpsPathGroup.add(dot);
    }
  }

  private spawnWorldEntities(): void {
    this.pedSpawnGen++;
    const currentGen = this.pedSpawnGen;

    for (const v of this.vehicles) {
      this.scene.remove(v.rig.group);
    }
    for (const p of this.pedestrians) {
      if (p.civilian) {
        p.civilian.mixer.stopAllAction();
        p.civilian.mixer.uncacheRoot(p.civilian.modelScene);
      }
      this.scene.remove(p.group);
    }
    this.clearOfficers();
    this.clearSecurityGuards();
    this.clearVfxPools();

    this.vehicles = [];
    this.pedestrians = [];
    this.drivenVehicle = null;
    this.pendingVehicle = null;
    this.lastDrivenVehicle = null;
    this.tunedVehicleIds.clear();
    this.insideShop = null;
    this.shopMenuOpen = false;
    this.activeMenuShopKind = null;
    this.interiorLight.intensity = 0;
    if (this.playerCharacter.group.parent !== this.scene) {
      this.scene.add(this.playerCharacter.group);
    }
    this.playerCharacter.setSeated(false, false);
    this.playerCharacter.group.visible = true;
    this.playerCharacter.group.position.copy(this.playerPos);
    this.playerCharacter.group.rotation.set(0, this.playerYaw, 0);

    // 1. Player-usable parked & showcase vehicles around Central Plaza & Waterfront Blvd
    const parkedSpecs: {
      kind: VehicleKind;
      color: number;
      x: number;
      y: number;
      z: number;
      yaw: number;
    }[] = [
      { kind: 'supercar', color: 0x7c3aed, x: 0, y: 0.32, z: -16.5, yaw: Math.PI * 0.82 },
      { kind: 'convertible', color: 0xdb2777, x: -11.5, y: 0, z: -23.2, yaw: Math.PI / 2 },
      { kind: 'coupe', color: 0xb91c1c, x: -4.2, y: 0, z: -23.2, yaw: Math.PI / 2 },
      { kind: 'motorcycle', color: 0x0f172a, x: 5.5, y: 0, z: -22.2, yaw: Math.PI * 0.65 },
      { kind: 'suv', color: 0x1d4ed8, x: -19.5, y: 0, z: -23.2, yaw: Math.PI / 2 },
      { kind: 'sedan', color: 0xd1d5db, x: 16.5, y: 0, z: -23.2, yaw: -Math.PI / 2 },
      { kind: 'truck', color: 0x334155, x: 32, y: 0, z: -32.2, yaw: Math.PI / 2 },
      { kind: 'supercar', color: 0x06b6d4, x: 132, y: 0, z: 14.5, yaw: Math.PI },
      { kind: 'suv', color: 0x059669, x: -132, y: 0, z: 14.5, yaw: 0 },
    ];

    parkedSpecs.forEach((spec, idx) => {
      const rig = buildVehicleModel(spec.kind, spec.color, this.anisotropy, this.isSoftwareGl);
      rig.occupantGroup.visible = false;
      if (rig.kickstandGroup) rig.kickstandGroup.visible = true;
      rig.group.position.set(spec.x, spec.y, spec.z);
      rig.group.rotation.y = spec.yaw;
      this.scene.add(rig.group);
      this.vehicles.push({
        id: `parked_${idx}`,
        kind: spec.kind,
        label: VEHICLE_LABELS[spec.kind],
        rig,
        position: new THREE.Vector3(spec.x, spec.y, spec.z),
        yaw: spec.yaw,
        velocity: new THREE.Vector3(),
        forwardSpeed: 0,
        steerAngle: 0,
        wheelSpin: 0,
        leanAngle: 0,
        suspY: spec.y,
        suspVel: 0,
        isTraffic: false,
        isPolice: false,
        isPursuing: false,
        isWreck: false,
        wreckTimer: 0,
        angularVel: 0,
        loopIndex: 0,
        loopT: 0,
        trafficSpeed: 0,
        hasOccupant: false,
        ramCooldown: 0,
        officersDeployed: false,
        deployPauseTimer: 0,
      });
    });

    // 2. Ambient City Traffic across all 6 expanded road loops
    const trafficPalette = [0x0a1f8c, 0x9e0a0a, 0x6d28d9, 0x0a4714, 0xb8b8ad, 0x17171a, 0xd4d4ca];
    const trafficKinds: VehicleKind[] = ['sedan', 'suv', 'coupe', 'convertible', 'sedan', 'truck', 'motorcycle'];

    for (let i = 0; i < 16; i++) {
      const loopIndex = i % this.city.trafficLoops.length;
      const loopT = ((Math.floor(i / this.city.trafficLoops.length) + 0.14) / 4) % 1;
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
        isPolice: false,
        isPursuing: false,
        isWreck: false,
        wreckTimer: 0,
        angularVel: 0,
        loopIndex,
        loopT,
        trafficSpeed: 8.5 + (i % 3) * 1.4,
        hasOccupant: true,
        ramCooldown: 0,
        officersDeployed: false,
        deployPauseTimer: 0,
      });
    }

    // 2b. Police Patrol Cruisers (5 cruisers covering avenues & storefront corridors)
    for (let pIdx = 0; pIdx < 5; pIdx++) {
      const loopIndex =
        pIdx === 4 ? this.city.trafficLoops.length - 1 : pIdx % this.city.trafficLoops.length;
      const loopT = (0.28 + pIdx * 0.21) % 1;
      const rig = buildVehicleModel('police', 0x0f131a, this.anisotropy, this.isSoftwareGl);
      rig.occupantGroup.visible = true;

      const pt = this.sampleLoopPoint(this.city.trafficLoops[loopIndex], loopT, _v1, _v2);
      const yaw = Math.atan2(_v2.x, _v2.z);
      rig.group.position.copy(pt);
      rig.group.rotation.y = yaw;
      this.scene.add(rig.group);

      this.vehicles.push({
        id: `police_${pIdx}`,
        kind: 'police',
        label: VEHICLE_LABELS.police,
        rig,
        position: pt.clone(),
        yaw,
        velocity: new THREE.Vector3(),
        forwardSpeed: 9.8,
        steerAngle: 0,
        wheelSpin: 0,
        leanAngle: 0,
        suspY: 0,
        suspVel: 0,
        isTraffic: true,
        isPolice: true,
        isPursuing: false,
        isWreck: false,
        wreckTimer: 0,
        angularVel: 0,
        loopIndex,
        loopT,
        trafficSpeed: 9.8,
        hasOccupant: true,
        ramCooldown: 0,
        officersDeployed: false,
        deployPauseTimer: 0,
      });
    }

    // 2c. Store Security Guards inside each POI shop/bank (30 HP: 1 gunshot or 3 punches to kill)
    for (const shop of this.city.shopPois) {
      shop.robbedUntil = -10;
      shop.guardSpawns.forEach((sp, gi) => {
        const rig = buildSecurityGuard(this.anisotropy, this.isSoftwareGl);
        rig.pistolGroup.visible = false;
        rig.group.position.set(sp.x, 0, sp.z);
        rig.group.rotation.y = sp.yaw;
        rig.group.visible = false;
        this.scene.add(rig.group);

        this.securityGuards.push({
          id: `guard_${shop.info.kind}_${gi}`,
          shop,
          rig,
          position: new THREE.Vector3(sp.x, 0, sp.z),
          spawnPos: new THREE.Vector3(sp.x, 0, sp.z),
          spawnYaw: sp.yaw,
          velocity: new THREE.Vector3(),
          yaw: sp.yaw,
          hp: 30,
          maxHp: 30,
          dead: false,
          hostile: false,
          staggerTimer: 0,
          fireCooldown: 0.9,
          meleeCooldown: 0.7,
          muzzleTimer: 0,
          walkPhase: gi * 1.1,
        });
      });
    }

    // 3. Spawn 26 Varied Roaming Civilian NPCs across Districts (Tall/Muscular, Average, Short, Kids)
    const archetypes: NpcArchetype[] = ['tall', 'average', 'short', 'kid'];
    const tints: CivilianOutfitTint[] = [
      { shirtHex: 0xf43f5e, shortsHex: 0x1e293b, hairHex: 0x241913 },
      { shirtHex: 0x38bdf8, shortsHex: 0x334155, hairHex: 0x5c3a21 },
      { shirtHex: 0xa855f7, shortsHex: 0x0f172a, hairHex: 0x151110 },
      { shirtHex: 0x10b981, shortsHex: 0x1f2937, hairHex: 0x8a5228 },
      { shirtHex: 0xf59e0b, shortsHex: 0x1e293b, hairHex: 0x2e211b },
      { shirtHex: 0xec4899, shortsHex: 0x312e81, hairHex: 0x3d2314 },
      { shirtHex: 0xef4444, shortsHex: 0x111827, hairHex: 0x1f140e },
      { shirtHex: 0x14b8a6, shortsHex: 0x374151, hairHex: 0x734222 },
    ];

    for (let i = 0; i < 26; i++) {
      const archetype = archetypes[i % archetypes.length];
      const tint = tints[i % tints.length];
      const loopIndex = i % this.city.pedestrianLoops.length;
      const loop = this.city.pedestrianLoops[loopIndex];
      const loopT = ((i * 0.23 + 0.08) % 1);
      const isFreeRoamer = i % 3 === 2;

      const pt = isFreeRoamer
        ? this.pickFreeRoamPoint(i + 7)
        : this.sampleLoopPoint(loop, loopT, _v1, _v2).clone();
      const yaw = isFreeRoamer ? (i * 1.3) % (Math.PI * 2) : Math.atan2(_v2.x, _v2.z);

      const height =
        archetype === 'tall'
          ? 1.92
          : archetype === 'average'
            ? 1.73
            : archetype === 'short'
              ? 1.53
              : 1.25;
      const widthScale =
        archetype === 'tall'
          ? 1.24
          : archetype === 'average'
            ? 1.0
            : archetype === 'short'
              ? 0.94
              : 0.86;
      const maxHp =
        archetype === 'tall'
          ? 105
          : archetype === 'average'
            ? 75
            : archetype === 'short'
              ? 55
              : 40;
      const walkSpeed =
        archetype === 'kid'
          ? 1.72
          : archetype === 'tall'
            ? 1.28
            : 1.42 + (i % 3) * 0.1;

      const group = new THREE.Group();
      group.position.copy(pt);
      group.rotation.y = yaw;
      this.scene.add(group);

      const ped: PedestrianEntity = {
        id: `ped_${i}`,
        archetype,
        hp: maxHp,
        maxHp,
        dead: false,
        combatState: 'ambient',
        attackCooldown: 0,
        group,
        rig: null,
        civilian: null,
        position: pt.clone(),
        yaw,
        velocity: new THREE.Vector3(),
        loopIndex,
        loopT,
        isFreeRoamer,
        roamTarget: this.pickFreeRoamPoint(i + 19),
        walkSpeed,
        fallen: false,
        recoverAt: 0,
        fleeUntil: 0,
        fleeDir: new THREE.Vector3(1, 0, 0),
        knockdownRotX: 0,
        knockdownRotZ: 0,
        walkPhase: i * 1.1,
      };
      this.pedestrians.push(ped);

      createCivilianInstance({
        targetHeight: height,
        anisotropy: this.anisotropy,
        isSoftwareGl: this.isSoftwareGl,
        outfitTint: tint,
      })
        .then((inst) => {
          if (this.disposed || this.pedSpawnGen !== currentGen) {
            inst.mixer.stopAllAction();
            inst.mixer.uncacheRoot(inst.modelScene);
            this.disposeObjectMeshes(inst.wrapper);
            return;
          }
          // Non-uniform width/depth scaling creates distinct muscular vs petite vs kid silhouettes
          inst.wrapper.scale.set(inst.baseScale * widthScale, inst.baseScale, inst.baseScale * widthScale);
          group.add(inst.wrapper);
          ped.civilian = inst;
          const walkAction = inst.actions.walk ?? inst.actions.idle;
          if (walkAction) {
            walkAction.enabled = true;
            walkAction.setEffectiveWeight(1);
            walkAction.timeScale = THREE.MathUtils.clamp(ped.walkSpeed / 1.35, 0.78, 1.35);
            walkAction.play();
          }
        })
        .catch((err) => {
          console.warn(`[ParadiseHeat] Failed to clone civilian NPC ${i}:`, err);
        });
    }
  }

  public resetCity(): void {
    this.playerPos.set(0, 0.18, -12.0);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = -0.22;
    this.cameraView = 'chase';
    this.playerHealth = this.maxPlayerHealth;
    this.isDead = false;
    this.deathElapsed = 0;
    this.damageFlashTimer = 0;
    this.hitStopTimer = 0;
    this.knockdowns = 0;
    this.wantedLevel = 0;
    this.wantedReason = '';
    this.evadeTimer = 0;
    this.bustedHoldTimer = 0;
    this.bustedBannerTimer = 0;
    this.playerCash = 1200;
    this.equippedWeapon = 'unarmed';
    this.ownedWeapons = new Set<WeaponKind>(['unarmed', 'pistol']);
    this.ammo = { unarmed: 0, pistol: 60, smg: 0, rifle: 0 };
    this.playerCharacter.setEquippedWeapon('unarmed');
    this.fpsViewModel.setWeapon('unarmed');
    this.syncFirstPersonState();
    this.insideShop = null;
    this.shopMenuOpen = false;
    this.activeMenuShopKind = null;
    this.mapOpen = false;
    this.lastBreakInShop = null;
    this.breakInWitnessUntil = -10;
    this.interiorLight.intensity = 0;
    this.clearGpsWaypoint();
    this.audio.updateSiren(false, 0);
    this.spawnWorldEntities();
    this.setEvent('City district reset · Back at Central Plaza');
    this.emitHud();
  }

  public respawnPlayer(): void {
    this.audio.unlock();
    if (this.drivenVehicle) {
      this.drivenVehicle.rig.chassisGroup.remove(this.playerCharacter.group);
      this.scene.add(this.playerCharacter.group);
      this.drivenVehicle = null;
    }
    this.pendingVehicle = null;
    this.insideShop = null;
    this.shopMenuOpen = false;
    this.activeMenuShopKind = null;
    this.mapOpen = false;
    this.interiorLight.intensity = 0;
    this.lastBreakInShop = null;
    this.breakInWitnessUntil = -10;

    for (const v of this.vehicles) {
      resetVehicleDent(v.rig);
      if (v.isPolice) {
        v.officersDeployed = false;
        v.deployPauseTimer = 0;
        v.isPursuing = false;
        v.isTraffic = true;
        v.hasOccupant = true;
        v.rig.occupantGroup.visible = true;
        if (v.rig.doorPivot) v.rig.doorPivot.rotation.y = 0;
      }
    }
    this.clearOfficers();
    this.clearVfxPools();

    this.playerPos.set(0, 0.18, -12.0);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = -0.22;
    this.cameraView = 'chase';
    this.playerHealth = this.maxPlayerHealth;
    this.isDead = false;
    this.deathElapsed = 0;
    this.damageFlashTimer = 0;
    this.hitStopTimer = 0;
    this.wantedLevel = 0;
    this.wantedReason = '';
    this.evadeTimer = 0;
    this.bustedHoldTimer = 0;
    this.bustedBannerTimer = 0;
    this.audio.updateSiren(false, 0);
    this.audio.updateEngine(false, false, 0, 0);

    this.playerCharacter.setSeated(false, false);
    this.syncFirstPersonState();
    this.playerCharacter.group.visible = true;
    this.playerCharacter.group.position.copy(this.playerPos);
    this.playerCharacter.group.rotation.set(0, this.playerYaw, 0);
    this.setEvent('Respawned at Central Plaza · Full Health');
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
    // Cap pixelRatio to 1 so Mac Retina browsers run smoothly at 60 FPS with zero lag
    this.renderer.setPixelRatio(1);
    if (this.composer) {
      this.composer.setPixelRatio(1);
    }
    if (this.sunLight) {
      this.sunLight.castShadow = !this.isSoftwareGl && this.settings.quality === 'detailed';
    }
  }

  public applyTimeOfDay(tod: TimeOfDay): void {
    this.settings.timeOfDay = tod;
    const activeEnv = this.sunsetEnvTexture ?? this.roomEnvTexture;
    if (activeEnv) {
      this.scene.environment = activeEnv;
    }

    if (tod === 'day') {
      const sky = new THREE.Color(0x9bd2f5);
      this.scene.background = sky;
      this.scene.fog = new THREE.FogExp2(0xa8d6f0, 0.0024);
      this.scene.environmentIntensity = 1.15;
      this.renderer.toneMappingExposure = 1.12;
      if (this.bloomPass) this.bloomPass.strength = 0.16;
      this.sunLight.color.setHex(0xfff2d9);
      this.sunLight.intensity = 2.15;
      this.sunLight.position.set(55, 88, -42);
      this.hemiLight.color.setHex(0xbbe2ff);
      this.hemiLight.groundColor.setHex(0x635849);
      this.hemiLight.intensity = 0.72;
      this.city.lampEmitterMaterial.emissiveIntensity = 0;
      for (const bm of this.city.buildingMaterials) bm.emissiveIntensity = 0;
      for (const nm of this.city.neonSignMaterials) nm.emissiveIntensity = 0.45;
      for (const v of this.vehicles) v.rig.headLightMat.emissiveIntensity = 0.45;
    } else if (tod === 'dusk') {
      const sky = new THREE.Color(0x281244);
      this.scene.background = sky;
      this.scene.fog = new THREE.FogExp2(0x461c63, 0.0028);
      this.scene.environmentIntensity = 1.05;
      this.renderer.toneMappingExposure = 1.15;
      if (this.bloomPass) this.bloomPass.strength = 0.36;
      this.sunLight.color.setHex(0xff8ed4);
      this.sunLight.intensity = 1.65;
      this.sunLight.position.set(-72, 34, -64);
      this.hemiLight.color.setHex(0x38bdf8);
      this.hemiLight.groundColor.setHex(0x25113a);
      this.hemiLight.intensity = 0.85;
      this.city.lampEmitterMaterial.emissiveIntensity = 2.35;
      for (const bm of this.city.buildingMaterials) bm.emissiveIntensity = 1.35;
      for (const nm of this.city.neonSignMaterials) nm.emissiveIntensity = 2.0;
      for (const v of this.vehicles) v.rig.headLightMat.emissiveIntensity = 2.2;
    } else if (tod === 'sunset') {
      this.scene.background = this.sunsetEnvTexture ?? new THREE.Color(0xe68b5a);
      this.scene.fog = new THREE.FogExp2(0xdc835c, 0.0012);
      this.scene.environmentIntensity = 1.25;
      this.renderer.toneMappingExposure = 1.15;
      if (this.bloomPass) this.bloomPass.strength = 0.34;
      this.sunLight.color.setHex(0xffaa6b);
      this.sunLight.intensity = 1.95;
      this.sunLight.position.set(-85, 28, -55);
      this.hemiLight.color.setHex(0xffc098);
      this.hemiLight.groundColor.setHex(0x36283a);
      this.hemiLight.intensity = 0.68;
      this.city.lampEmitterMaterial.emissiveIntensity = 1.5;
      for (const bm of this.city.buildingMaterials) bm.emissiveIntensity = 0.95;
      for (const nm of this.city.neonSignMaterials) nm.emissiveIntensity = 1.35;
      for (const v of this.vehicles) v.rig.headLightMat.emissiveIntensity = 1.5;
    } else {
      const sky = new THREE.Color(0x09111f);
      this.scene.background = sky;
      this.scene.fog = new THREE.FogExp2(0x0b1526, 0.0034);
      this.scene.environmentIntensity = 0.78;
      this.renderer.toneMappingExposure = 1.15;
      if (this.bloomPass) this.bloomPass.strength = 0.38;
      this.sunLight.color.setHex(0x88b4f0);
      this.sunLight.intensity = 0.62;
      this.sunLight.position.set(-40, 75, 45);
      this.hemiLight.color.setHex(0x3a5278);
      this.hemiLight.groundColor.setHex(0x111520);
      this.hemiLight.intensity = 0.5;
      this.city.lampEmitterMaterial.emissiveIntensity = 2.8;
      for (const bm of this.city.buildingMaterials) bm.emissiveIntensity = 1.65;
      for (const nm of this.city.neonSignMaterials) nm.emissiveIntensity = 2.4;
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

  private syncFirstPersonState(): void {
    const isFpsFoot =
      !this.drivenVehicle &&
      !this.pendingVehicle &&
      !this.isDead &&
      this.cameraView === 'firstperson';
    const isFpsCar = Boolean(
      this.drivenVehicle &&
        !this.isDead &&
        this.drivenVehicle.kind !== 'motorcycle' &&
        (this.cameraView === 'cockpit' || this.cameraView === 'firstperson')
    );
    this.playerCharacter.setFirstPersonMode(isFpsFoot || isFpsCar);
    this.fpsViewModel.setVisible(isFpsFoot);
  }

  public toggleCameraView(): void {
    if (this.drivenVehicle) {
      this.cameraView = this.cameraView === 'chase' ? 'cockpit' : 'chase';
      this.setEvent(
        this.cameraView === 'cockpit'
          ? 'First-Person Cockpit · Windshield & Rearview Mirror'
          : 'Third-Person Chase Camera'
      );
    } else {
      this.cameraView = this.cameraView === 'firstperson' ? 'chase' : 'firstperson';
      if (this.cameraView === 'firstperson') {
        this.camPitch = THREE.MathUtils.clamp(this.camPitch, -0.35, 0.35);
        this.setEvent('First-Person View · 1/Scroll Gun · Right-Click Aim · Left-Click Shoot');
      } else {
        this.camPitch = THREE.MathUtils.clamp(this.camPitch, THREE.MathUtils.degToRad(-65), THREE.MathUtils.degToRad(8));
        this.setEvent('Third-Person Chase Camera');
      }
    }
    this.syncFirstPersonState();
    this.emitHud();
  }

  public setTouchMove(x: number, y: number): void {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  public triggerPunch(): void {
    if (this.paused || this.isDead || this.drivenVehicle || this.pendingVehicle) return;
    if (this.punchTimer > 0) return;
    this.audio.unlock();
    this.punchTimer = 0.44;
    this.punchHitDone = false;
    this.audio.playPunch();
    // Subtle forward strike lunge
    this.playerVel.x += Math.sin(this.playerYaw) * 2.8;
    this.playerVel.z += Math.cos(this.playerYaw) * 2.8;
  }

  public jumpOnFoot(): void {
    if (this.paused || this.isDead || this.drivenVehicle || this.pendingVehicle) return;
    if (this.playerGrounded) {
      this.playerVel.y = 6.2;
      this.playerGrounded = false;
    }
  }

  public interactVehicle(): void {
    if (this.paused || this.isDead || this.pendingVehicle) return;
    this.audio.unlock();

    if (this.drivenVehicle) {
      this.exitVehicle();
      return;
    }

    const best = this.findNearestVehicle(4.4);
    if (!best) return;

    this.beginVehicleEntry(best);
  }

  public handleInteractKey(): void {
    if (this.paused || this.isDead || this.pendingVehicle) return;
    this.audio.unlock();

    if (this.insideShop) {
      if (this.shopMenuOpen) {
        this.closeShopMenu();
      } else {
        this.openShopMenu(this.insideShop.info.kind);
      }
      return;
    }

    // Drive-up service bay at Turbo Customs Garage
    const garage = this.city.shopPois.find((s) => s.info.kind === 'garage');
    if (garage?.driveBaySpot) {
      const refPos = this.drivenVehicle ? this.drivenVehicle.position : this.playerPos;
      const d = Math.hypot(refPos.x - garage.driveBaySpot.x, refPos.z - garage.driveBaySpot.z);
      if (d < 5.6) {
        this.openShopMenu('garage');
        return;
      }
    }

    this.interactVehicle();
  }

  private findNearbyExteriorShop(): ShopPoiRuntime | null {
    const p = this.drivenVehicle ? this.drivenVehicle.position : this.playerPos;
    for (const shop of this.city.shopPois) {
      if (Math.hypot(p.x - shop.info.doorX, p.z - shop.info.doorZ) < 3.6) {
        return shop;
      }
      if (shop.driveBaySpot && Math.hypot(p.x - shop.driveBaySpot.x, p.z - shop.driveBaySpot.z) < 5.6) {
        return shop;
      }
    }
    return null;
  }

  private enterShop(shop: ShopPoiRuntime): void {
    if (this.drivenVehicle || this.pendingVehicle || this.insideShop) return;
    this.insideShop = shop;
    this.shopDoorCooldown = 1.1;
    this.shopMenuOpen = false;
    this.activeMenuShopKind = null;
    this.keys.clear();

    this.playerPos.copy(shop.spawnInside);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = -0.14;
    this.playerCharacter.group.position.copy(this.playerPos);
    this.playerCharacter.group.rotation.y = this.playerYaw;

    this.interiorLight.position.set(shop.roomCenter.x, 4.1, shop.roomCenter.z);
    this.interiorLight.intensity = 2.6;

    for (const g of this.securityGuards) {
      g.rig.group.visible = g.shop === shop;
    }

    this.audio.playDoorLatch();
    this.setEvent(
      shop.info.kind === 'weapon'
        ? `Entered ${shop.info.name} · Walk onto Gun Pad or press E to Buy`
        : `Entered ${shop.info.name} · Press E for Shop Menu · R to Break In`
    );
    this.emitHud();
  }

  public exitShop(): void {
    if (!this.insideShop) return;
    const shop = this.insideShop;
    this.insideShop = null;
    this.shopMenuOpen = false;
    this.activeMenuShopKind = null;
    this.shopDoorCooldown = 1.1;
    this.keys.clear();
    this.interiorLight.intensity = 0;

    for (const g of this.securityGuards) {
      g.rig.group.visible = false;
    }

    this.playerPos.copy(shop.outsideReturn);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = Math.PI;
    this.camYaw = Math.PI;
    this.playerCharacter.group.position.copy(this.playerPos);
    this.playerCharacter.group.rotation.y = this.playerYaw;
    this.audio.playDoorLatch();
    this.setEvent(`Exited ${shop.info.name}`);
    this.emitHud();
  }

  public openShopMenu(kind: PoiKind): void {
    this.shopMenuOpen = true;
    this.activeMenuShopKind = kind;
    this.keys.clear();
    this.draggingLook = false;
    if (document.pointerLockElement === this.renderer.domElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
    this.emitHud();
  }

  public closeShopMenu(): void {
    this.shopMenuOpen = false;
    this.activeMenuShopKind = null;
    this.emitHud();
  }

  public toggleMapModal(): void {
    this.setMapOpen(!this.mapOpen);
  }

  public setMapOpen(open: boolean): void {
    this.mapOpen = open;
    if (open) {
      this.keys.clear();
      this.draggingLook = false;
      if (document.pointerLockElement === this.renderer.domElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
    }
    this.emitHud();
  }

  public equipWeapon(kind: WeaponKind): void {
    if (kind !== 'unarmed' && !this.ownedWeapons.has(kind)) {
      this.setEvent('Visit Ammu-Nation to collect or purchase this weapon!');
      this.emitHud();
      return;
    }
    this.equippedWeapon = kind;
    this.playerCharacter.setEquippedWeapon(kind);
    this.fpsViewModel.setWeapon(kind);
    const label = kind === 'unarmed' ? 'Unarmed (Fists)' : WEAPON_SPECS[kind].label;
    this.setEvent(`Equipped: ${label}`);
    this.emitHud();
  }

  public cycleWeapon(step = 1): void {
    const order: WeaponKind[] = ['unarmed', 'pistol', 'smg', 'rifle'];
    const owned = order.filter((w) => w === 'unarmed' || this.ownedWeapons.has(w));
    if (owned.length <= 1) return;
    const idx = owned.indexOf(this.equippedWeapon);
    const next = owned[(idx + step + owned.length) % owned.length];
    this.equipWeapon(next);
  }

  public firePlayerWeapon(): void {
    if (this.paused || this.isDead || this.drivenVehicle || this.pendingVehicle) return;
    if (this.equippedWeapon === 'unarmed') {
      this.triggerPunch();
      return;
    }
    if (this.playerFireCooldown > 0) return;
    const kind = this.equippedWeapon;
    if ((this.ammo[kind] ?? 0) <= 0) {
      this.setEvent('Out of ammo! Visit Ammu-Nation (E) to restock.');
      this.emitHud();
      return;
    }

    const spec = WEAPON_SPECS[kind];
    this.ammo[kind]--;
    this.playerFireCooldown = spec.cooldown;
    this.playerShootAnimTimer = 0.16;
    this.audio.unlock();
    this.audio.playGunshot();

    // Snap facing toward camera crosshair whenever aiming, locked, dragging, or in First-Person
    if (
      this.cameraView === 'firstperson' ||
      this.pointerLocked ||
      this.draggingLook ||
      this.isAimingRightClick
    ) {
      this.playerYaw = this.camYaw + Math.PI;
    }

    // Center-screen THREE.Raycaster aim with slight weapon spread (tighter when ADS)
    const spreadScale = this.isAimingRightClick ? 0.25 : 1.0;
    const sx = (Math.random() - 0.5) * spec.spread * spreadScale;
    const sy = (Math.random() - 0.5) * spec.spread * spreadScale;
    _centerNdc.set(sx, sy);
    this.camera.updateMatrixWorld(true);
    _raycaster.setFromCamera(_centerNdc, this.camera);
    _raycaster.near = 0.35;
    _raycaster.far = spec.range;
    _rayDir.copy(_raycaster.ray.direction);

    const isFps = this.cameraView === 'firstperson';
    if (isFps) {
      this.fpsViewModel.triggerRecoil();
      this.fpsViewModel.getMuzzleWorldPosition(_muzzleVec);
      this.fpsViewModel.getEjectionWorldPosition(_ejectVec);
      _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
    } else {
      this.playerCharacter.triggerMuzzleFlash();
      this.playerCharacter.getMuzzleWorldPosition(_muzzleVec);
      _ejectVec.copy(_muzzleVec).addScaledVector(_rayDir, -0.18);
      _right.set(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw));
    }

    this.spawnShellCasing(_ejectVec, _right);

    const hitDist = this.tracePlayerShot(_raycaster.ray.origin, _rayDir, spec.range, spec.damage, _hitPoint);
    if (hitDist >= spec.range) {
      _hitPoint.copy(_raycaster.ray.origin).addScaledVector(_rayDir, spec.range);
    }
    this.spawnBulletTracer(_muzzleVec, _hitPoint);
    this.emitHud();
  }

  private popVehicleTire(v: VehicleEntity, wheelIndex: number, hitPoint: THREE.Vector3): void {
    const idx = THREE.MathUtils.clamp(wheelIndex, 0, v.rig.wheelSpinMeshes.length - 1);
    if (v.rig.tirePopped[idx]) {
      this.audio.playImpact(0.2);
      return;
    }
    v.rig.tirePopped[idx] = true;
    const spin = v.rig.wheelSpinMeshes[idx];
    if (spin) {
      spin.scale.set(1.06, 0.72, 0.72);
      spin.position.y -= 0.085;
      spin.rotation.z = idx % 2 === 0 ? 0.14 : -0.14;
    }
    this.audio.playTirePop();
    this.spawnGlassBurst(hitPoint);
    this.setEvent(`Popped tire on ${v.label}!`);
  }

  private tracePlayerShot(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxRange: number,
    damage: number,
    outHitPoint: THREE.Vector3
  ): number {
    let bestT = maxRange;
    let hitType: 'none' | 'guard' | 'officer' | 'ped' | 'vehicle_window' | 'vehicle_wheel' | 'vehicle_body' | 'world' =
      'none';
    let hitGuard: SecurityGuardEntity | null = null;
    let hitOfficer: OfficerEntity | null = null;
    let hitPed: PedestrianEntity | null = null;
    let hitVehicle: VehicleEntity | null = null;
    let hitMesh: THREE.Object3D | null = null;
    let hitWheelIndex = 0;

    // 1. Raycast against solid world geometry (ground, visible city LODs, active shop room)
    const worldTargets: THREE.Object3D[] = [this.city.groundMesh];
    if (this.insideShop) {
      for (const r of this.city.shopRooms) {
        if (r.kind === this.insideShop.info.kind) {
          worldTargets.push(r.group);
        }
      }
    } else {
      for (const entry of this.city.lodObjects) {
        if (entry.lod.visible) {
          worldTargets.push(entry.lod);
        }
      }
    }

    const worldHits = _raycaster.intersectObjects(worldTargets, true);
    if (worldHits.length > 0 && worldHits[0].distance < bestT) {
      bestT = worldHits[0].distance;
      hitType = 'world';
      outHitPoint.copy(worldHits[0].point);
    }

    // 2. Raycast against visible vehicles to detect exact window glass & tire hits
    if (!this.insideShop) {
      const vehMap = new Map<THREE.Object3D, VehicleEntity>();
      const vehRoots: THREE.Object3D[] = [];
      for (const v of this.vehicles) {
        if (!v.rig.group.visible) continue;
        vehRoots.push(v.rig.group);
        vehMap.set(v.rig.group, v);
      }
      if (vehRoots.length > 0) {
        const vehHits = _raycaster.intersectObjects(vehRoots, true);
        for (const vh of vehHits) {
          if (!vh.object.visible) continue;
          if (vh.distance >= bestT) break;
          // Resolve owning VehicleEntity
          let ownerVeh: VehicleEntity | undefined;
          let cur: THREE.Object3D | null = vh.object;
          let carPart: string | undefined;
          let wheelIdx = 0;
          while (cur) {
            if (!carPart && typeof cur.userData.carPart === 'string') {
              carPart = cur.userData.carPart;
              if (typeof cur.userData.wheelIndex === 'number') {
                wheelIdx = cur.userData.wheelIndex;
              }
            }
            const found = vehMap.get(cur);
            if (found) {
              ownerVeh = found;
              break;
            }
            cur = cur.parent;
          }
          if (!ownerVeh) continue;
          bestT = vh.distance;
          hitVehicle = ownerVeh;
          hitMesh = vh.object;
          hitWheelIndex = wheelIdx;
          outHitPoint.copy(vh.point);
          hitType =
            carPart === 'window'
              ? 'vehicle_window'
              : carPart === 'wheel'
                ? 'vehicle_wheel'
                : 'vehicle_body';
          break;
        }
      }
    }

    // 3. Ray-capsule checks against human targets (accurate for animated SkinnedMeshes too)
    const rayTestHuman = (cx: number, cy: number, cz: number, r: number, h: number): number | null => {
      const ocX = cx - origin.x;
      const ocY = cy + h * 0.5 - origin.y;
      const ocZ = cz - origin.z;
      const proj = ocX * dir.x + ocY * dir.y + ocZ * dir.z;
      if (proj < 0.35 || proj > bestT) return null;
      const px = origin.x + dir.x * proj;
      const py = origin.y + dir.y * proj;
      const pz = origin.z + dir.z * proj;
      const dHorizSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
      if (dHorizSq > r * r) return null;
      if (py < cy - 0.12 || py > cy + h + 0.18) return null;
      return proj;
    };

    for (const g of this.securityGuards) {
      if (g.dead || !g.rig.group.visible) continue;
      const t = rayTestHuman(g.position.x, g.position.y, g.position.z, 0.5, 1.85);
      if (t !== null && t < bestT) {
        bestT = t;
        hitType = 'guard';
        hitGuard = g;
        outHitPoint.copy(origin).addScaledVector(dir, t);
      }
    }

    for (const off of this.officers) {
      if (off.dead) continue;
      const t = rayTestHuman(off.position.x, off.position.y, off.position.z, 0.5, 1.85);
      if (t !== null && t < bestT) {
        bestT = t;
        hitType = 'officer';
        hitOfficer = off;
        outHitPoint.copy(origin).addScaledVector(dir, t);
      }
    }

    for (const p of this.pedestrians) {
      if (p.dead || !p.group.visible) continue;
      const t = rayTestHuman(p.position.x, p.position.y, p.position.z, 0.48, 1.8);
      if (t !== null && t < bestT) {
        bestT = t;
        hitType = 'ped';
        hitPed = p;
        outHitPoint.copy(origin).addScaledVector(dir, t);
      }
    }

    const impulse = dir.clone().setY(0).normalize().multiplyScalar(5.5);
    if (hitType === 'guard' && hitGuard) {
      this.applyHitToSecurityGuard(hitGuard, damage, impulse);
    } else if (hitType === 'officer' && hitOfficer) {
      this.applyHitToOfficer(hitOfficer, damage, impulse);
      this.raiseWanted(2, 'Shot Police Officer');
    } else if (hitType === 'ped' && hitPed) {
      this.knockdownPedestrian(hitPed, impulse, true);
      this.raiseWanted(1, 'Assaulted Civilian');
    } else if (hitType === 'vehicle_window' && hitVehicle && hitMesh) {
      hitMesh.visible = false;
      this.spawnGlassBurst(outHitPoint);
      this.audio.playGlassShatter();
      this.setEvent(`Shattered ${hitVehicle.label} window!`);
      if (hitVehicle.isPolice) {
        this.raiseWanted(2, 'Fired on Police Cruiser');
      } else if (hitVehicle.isTraffic && hitVehicle.hasOccupant) {
        this.raiseWanted(1, 'Vandalized Civilian Vehicle');
      }
    } else if (hitType === 'vehicle_wheel' && hitVehicle) {
      this.popVehicleTire(hitVehicle, hitWheelIndex, outHitPoint);
      if (hitVehicle.isPolice) {
        this.raiseWanted(2, 'Shot Police Cruiser Tires');
      } else if (hitVehicle.isTraffic && hitVehicle.hasOccupant) {
        this.raiseWanted(1, 'Vandalized Civilian Vehicle');
      }
    } else if (hitType === 'vehicle_body' && hitVehicle) {
      applyVehicleDent(hitVehicle.rig, 0.8, 0.2, 0.08);
      this.audio.playImpact(0.32);
      if (hitVehicle.isPolice) {
        this.raiseWanted(2, 'Fired on Police Cruiser');
      } else if (hitVehicle.isTraffic && hitVehicle.hasOccupant) {
        this.raiseWanted(1, 'Shot Civilian Vehicle');
      }
    }

    return bestT;
  }

  private applyHitToSecurityGuard(
    guard: SecurityGuardEntity,
    damage: number,
    impulse: THREE.Vector3
  ): void {
    if (guard.dead) return;
    guard.hp = Math.max(0, guard.hp - damage);
    this.spawnBloodBurst(guard.position);
    this.spawnBloodDecal(guard.position);
    guard.velocity.copy(impulse).clampLength(0, 10);

    if (guard.hp <= 0) {
      guard.dead = true;
      guard.hostile = false;
      guard.rig.pistolGroup.visible = false;
      guard.rig.muzzleFlashMesh.visible = false;
      guard.rig.bodyRoot.rotation.x = -Math.PI * 0.48;
      this.knockdowns++;
      this.playerCash += 250;
      this.setEvent('Store Security Eliminated! (+$250)');
    } else {
      guard.hostile = true;
      guard.rig.pistolGroup.visible = true;
      guard.staggerTimer = 0.36;
      const punchesLeft = Math.ceil(guard.hp / 10);
      this.setEvent(`Security Guard hit! (${punchesLeft} punch${punchesLeft > 1 ? 'es' : ''} left)`);
    }
    this.emitHud();
  }

  public triggerStoreBreakIn(): void {
    if (this.paused || this.isDead || this.drivenVehicle || this.pendingVehicle) return;
    let targetShop: ShopPoiRuntime | null = this.insideShop;
    if (!targetShop) {
      targetShop = this.findNearbyExteriorShop();
    }
    if (!targetShop) return;
    this.breakIntoStore(targetShop);
  }

  private breakIntoStore(shop: ShopPoiRuntime): void {
    if (this.elapsed < shop.robbedUntil) {
      this.setEvent(`${shop.info.name} vault already looted — wait for restock.`);
      this.emitHud();
      return;
    }

    shop.robbedUntil = this.elapsed + 45;
    const payout = shop.info.kind === 'bank' ? 2500 : shop.info.kind === 'weapon' ? 950 : 650;
    this.playerCash += payout;
    this.audio.playDoorLatch();

    // Alert store security inside immediately
    for (const g of this.securityGuards) {
      if (g.shop === shop && !g.dead) {
        g.hostile = true;
        g.rig.pistolGroup.visible = true;
      }
    }

    this.lastBreakInShop = shop;
    this.breakInWitnessUntil = this.elapsed + 12.0;

    if (this.canPoliceSeeBreakIn(shop)) {
      this.raiseWanted(
        shop.info.kind === 'bank' ? 3 : 2,
        `Police Witnessed Break-In at ${shop.info.name}`
      );
    } else {
      this.setEvent(`Broke into ${shop.info.name} (+$${payout})! No police saw you!`);
    }
    this.emitHud();
  }

  private hasLineOfSight(x1: number, z1: number, x2: number, z2: number): boolean {
    const steps = 16;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = x1 + (x2 - x1) * t;
      const pz = z1 + (z2 - z1) * t;
      for (const c of this.city.colliders) {
        if (c.topY < 2.2) continue;
        if (px > c.minX + 0.4 && px < c.maxX - 0.4 && pz > c.minZ + 0.4 && pz < c.maxZ - 0.4) {
          return false;
        }
      }
    }
    return true;
  }

  private canPoliceSeeBreakIn(shop: ShopPoiRuntime): boolean {
    const checkPosX = shop.info.doorX;
    const checkPosZ = shop.info.doorZ + (shop.info.kind === 'clothing' ? -2.2 : 2.2);

    for (const v of this.vehicles) {
      if (!v.isPolice || v.isWreck) continue;
      const dDoor = Math.hypot(v.position.x - checkPosX, v.position.z - checkPosZ);
      const dPlayer = !this.insideShop
        ? Math.hypot(v.position.x - this.playerPos.x, v.position.z - this.playerPos.z)
        : Infinity;

      if (dDoor <= 72 && this.hasLineOfSight(v.position.x, v.position.z, checkPosX, checkPosZ)) {
        return true;
      }
      if (dPlayer <= 72 && this.hasLineOfSight(v.position.x, v.position.z, this.playerPos.x, this.playerPos.z)) {
        return true;
      }
    }

    for (const off of this.officers) {
      if (off.dead) continue;
      const dDoor = Math.hypot(off.position.x - checkPosX, off.position.z - checkPosZ);
      if (dDoor <= 55 && this.hasLineOfSight(off.position.x, off.position.z, checkPosX, checkPosZ)) {
        return true;
      }
    }
    return false;
  }

  public buyOrCollectWeapon(kind: Exclude<WeaponKind, 'unarmed'>, cost: number): void {
    if (this.ownedWeapons.has(kind)) {
      this.equipWeapon(kind);
      return;
    }
    if (this.playerCash < cost) {
      this.setEvent(`Need $${cost} to unlock ${WEAPON_SPECS[kind].label}`);
      this.emitHud();
      return;
    }
    this.playerCash -= cost;
    this.ownedWeapons.add(kind);
    const starterAmmo = kind === 'pistol' ? 36 : kind === 'smg' ? 90 : 75;
    this.ammo[kind] += starterAmmo;
    this.equipWeapon(kind);
    this.setEvent(`Collected ${WEAPON_SPECS[kind].label} (+${starterAmmo} rounds)!`);
    this.emitHud();
  }

  public buyAmmo(kind: Exclude<WeaponKind, 'unarmed'>, amount: number, cost: number): void {
    if (!this.ownedWeapons.has(kind)) {
      this.setEvent(`Unlock ${WEAPON_SPECS[kind].label} first!`);
      this.emitHud();
      return;
    }
    if (this.playerCash < cost) {
      this.setEvent(`Need $${cost} for ammo`);
      this.emitHud();
      return;
    }
    this.playerCash -= cost;
    this.ammo[kind] += amount;
    this.setEvent(`+${amount} ${WEAPON_SPECS[kind].label} ammo`);
    this.emitHud();
  }

  public buySnack(healAmount: number, cost: number, label: string): void {
    if (this.playerCash < cost) {
      this.setEvent(`Need $${cost} for ${label}`);
      this.emitHud();
      return;
    }
    if (this.playerHealth >= this.maxPlayerHealth) {
      this.setEvent('Health is already full!');
      this.emitHud();
      return;
    }
    this.playerCash -= cost;
    this.playerHealth = Math.min(this.maxPlayerHealth, this.playerHealth + healAmount);
    this.setEvent(`Used ${label} (+${healAmount} HP)`);
    this.emitHud();
  }

  public applyPlayerOutfit(shirtHex: number, shortsHex: number, hairHex: number): void {
    this.playerCharacter.setOutfitColors(shirtHex, shortsHex, hairHex);
    this.fpsViewModel.setSleeveColor(shirtHex);
    this.setEvent('Updated outfit style at Paradise Threads!');
    this.emitHud();
  }

  private getGarageTargetVehicle(): VehicleEntity | null {
    return this.drivenVehicle ?? this.lastDrivenVehicle ?? this.vehicles[0] ?? null;
  }

  public repairCurrentVehicle(): void {
    const v = this.getGarageTargetVehicle();
    if (!v) return;
    if (this.playerCash < 150) {
      this.setEvent('Need $150 to repair vehicle');
      this.emitHud();
      return;
    }
    this.playerCash -= 150;
    resetVehicleDent(v.rig);
    v.isWreck = false;
    this.audio.playDoorLatch();
    this.setEvent(`Repaired ${v.label} to factory condition!`);
    this.emitHud();
  }

  public repaintCurrentVehicle(colorHex: number): void {
    const v = this.getGarageTargetVehicle();
    if (!v) return;
    if (this.playerCash < 120) {
      this.setEvent('Need $120 for custom paint job');
      this.emitHud();
      return;
    }
    this.playerCash -= 120;
    repaintVehicleRig(v.rig, colorHex);
    this.setEvent(`Repainted ${v.label}!`);
    this.emitHud();
  }

  public tuneCurrentVehicle(): void {
    const v = this.getGarageTargetVehicle();
    if (!v) return;
    if (this.tunedVehicleIds.has(v.id)) {
      this.setEvent(`${v.label} already has Turbo Tune installed!`);
      this.emitHud();
      return;
    }
    if (this.playerCash < 350) {
      this.setEvent('Need $350 for Turbo Engine Tune');
      this.emitHud();
      return;
    }
    this.playerCash -= 350;
    this.tunedVehicleIds.add(v.id);
    this.setEvent(`Turbo Tune installed on ${v.label} (+28% Top Speed)!`);
    this.emitHud();
  }

  public robFromShopMenu(): void {
    const shop =
      this.insideShop ??
      this.city.shopPois.find((s) => s.info.kind === this.activeMenuShopKind) ??
      null;
    this.closeShopMenu();
    if (shop) {
      this.breakIntoStore(shop);
    }
  }

  public getAudio(): ParadiseHeatAudio {
    return this.audio;
  }

  private damagePlayer(amount: number, reason: string): void {
    if (this.isDead || amount <= 0) return;
    this.playerHealth = Math.max(0, this.playerHealth - amount);
    this.damageFlashTimer = 0.32;
    this.audio.playPlayerHurt();

    if (this.playerHealth <= 0) {
      this.isDead = true;
      this.deathElapsed = 0;
      this.keys.clear();
      this.audio.updateEngine(false, false, 0, 0);
      this.audio.updateSiren(false, 0);
      this.setEvent(`MISSION FAILED · ${reason}`);
      this.emitHud();
    }
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

    if (v.hasOccupant) {
      v.hasOccupant = false;
      v.rig.occupantGroup.visible = false;
      this.spawnEjectedSurvivor(v);
    }

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
    v.isPursuing = false;
    v.isWreck = false;
    if (v.rig.doorPivot) {
      v.rig.doorPivot.rotation.y = 0;
    }
    if (v.rig.kickstandGroup) {
      v.rig.kickstandGroup.visible = false;
    }

    this.drivenVehicle = v;
    this.lastDrivenVehicle = v;
    this.playerCharacter.group.visible = true;
    this.playerCharacter.setSeated(true, v.kind === 'motorcycle');
    v.rig.chassisGroup.add(this.playerCharacter.group);
    this.playerCharacter.group.position.copy(v.rig.seatLocal);
    this.playerCharacter.group.rotation.set(0, 0, 0);
    if (this.cameraView === 'firstperson') {
      this.cameraView = v.kind === 'motorcycle' ? 'chase' : 'cockpit';
    }
    this.syncFirstPersonState();

    this.setEvent(`Driving ${v.label} · V for Cockpit View`);
    this.emitHud();
  }

  private exitVehicle(): void {
    const v = this.drivenVehicle;
    if (!v) return;

    v.rig.chassisGroup.remove(this.playerCharacter.group);
    this.scene.add(this.playerCharacter.group);
    this.playerCharacter.setSeated(false, false);

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
    this.playerCharacter.group.position.copy(this.playerPos);
    this.playerCharacter.group.rotation.set(0, this.playerYaw, 0);

    if (v.kind === 'motorcycle') {
      if (v.rig.kickstandGroup) v.rig.kickstandGroup.visible = true;
      v.leanAngle = 0;
      v.rig.chassisGroup.rotation.z = 0;
      this.autoMountBlockedUntil = this.elapsed + 3.0;
    }

    this.drivenVehicle = null;
    if (this.cameraView === 'cockpit') {
      this.cameraView = 'firstperson';
    }
    this.syncFirstPersonState();
    this.audio.playDoorLatch();
    this.audio.updateEngine(false, false, 0, 0);
    this.setEvent('Exited vehicle');
    this.emitHud();
  }

  private spawnEjectedSurvivor(v: VehicleEntity): void {
    const currentGen = this.pedSpawnGen;
    _right.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    const pos = v.position.clone().addScaledVector(_right, -(v.rig.width * 0.5 + 1.0));
    pos.y = this.groundHeightAt(pos.x, pos.z);

    const group = new THREE.Group();
    group.position.copy(pos);
    this.scene.add(group);

    this.audio.playPedestrianShout();

    const fleeDir = _right.clone().multiplyScalar(-1).normalize();
    const survivor: PedestrianEntity = {
      id: `survivor_${Date.now()}_${Math.random()}`,
      archetype: 'average',
      hp: 70,
      maxHp: 70,
      dead: false,
      combatState: 'flee',
      attackCooldown: 0,
      group,
      rig: null,
      civilian: null,
      position: pos,
      yaw: Math.atan2(fleeDir.x, fleeDir.z),
      velocity: fleeDir.clone().multiplyScalar(3.2),
      loopIndex: 0,
      loopT: 0,
      isFreeRoamer: false,
      roamTarget: pos.clone(),
      walkSpeed: 1.5,
      fallen: true,
      recoverAt: this.elapsed + 1.8,
      fleeUntil: this.elapsed + 10.0,
      fleeDir,
      knockdownRotX: -Math.PI * 0.48,
      knockdownRotZ: 0.2,
      walkPhase: 0,
    };
    this.pedestrians.push(survivor);

    createCivilianInstance({
      targetHeight: 1.72,
      anisotropy: this.anisotropy,
      isSoftwareGl: this.isSoftwareGl,
      outfitTint: { shirtHex: 0x475569, shortsHex: 0x1e293b, hairHex: 0x261a14 },
    })
      .then((inst) => {
        if (this.disposed || this.pedSpawnGen !== currentGen) {
          inst.mixer.stopAllAction();
          inst.mixer.uncacheRoot(inst.modelScene);
          this.disposeObjectMeshes(inst.wrapper);
          return;
        }
        group.add(inst.wrapper);
        survivor.civilian = inst;
        const action = inst.actions.idle ?? inst.actions.walk;
        action?.play();
      })
      .catch(() => {});

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
      if (this.damageFlashTimer > 0) {
        this.damageFlashTimer = Math.max(0, this.damageFlashTimer - rawDt);
      }

      if (this.hitStopTimer > 0) {
        // Brief impact hit-stop frame pause
        this.hitStopTimer = Math.max(0, this.hitStopTimer - rawDt);
      } else if (this.isDead) {
        // Dramatic slow-motion freeze collapse after death
        this.deathElapsed += rawDt;
        const slowFactor = this.deathElapsed < 1.8 ? 0.18 : 0.0;
        if (slowFactor > 0) {
          const slowDt = rawDt * slowFactor;
          this.elapsed += slowDt;
          this.stepSimulation(slowDt);
        } else {
          this.camYaw += rawDt * 0.12;
          this.updateCamera(rawDt);
        }
      } else {
        this.elapsed += rawDt;
        this.stepSimulation(rawDt);
      }
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
    if (this.playerFireCooldown > 0) {
      this.playerFireCooldown = Math.max(0, this.playerFireCooldown - dt);
    }
    if (this.playerShootAnimTimer > 0) {
      this.playerShootAnimTimer = Math.max(0, this.playerShootAnimTimer - dt);
    }
    if (this.shopDoorCooldown > 0) {
      this.shopDoorCooldown = Math.max(0, this.shopDoorCooldown - dt);
    }

    this.updateTrafficSignals();
    this.stepVfxPools(dt);

    // Witness-only police dispatch check during active break-in window
    if (
      !this.isDead &&
      this.wantedLevel === 0 &&
      this.lastBreakInShop &&
      this.elapsed <= this.breakInWitnessUntil
    ) {
      if (this.canPoliceSeeBreakIn(this.lastBreakInShop)) {
        this.raiseWanted(
          this.lastBreakInShop.info.kind === 'bank' ? 3 : 2,
          `Police Witnessed Break-In at ${this.lastBreakInShop.info.name}`
        );
      }
    }

    // Periodic GPS path update + arrival detection
    if (this.gpsPin) {
      const refPos = this.insideShop
        ? this.insideShop.outsideReturn
        : this.drivenVehicle
          ? this.drivenVehicle.position
          : this.playerPos;
      if (Math.hypot(this.gpsPin.x - refPos.x, this.gpsPin.z - refPos.z) < 8.5) {
        this.setEvent(`Arrived at ${this.gpsPin.label ?? 'GPS Destination'}!`);
        this.clearGpsWaypoint();
      } else {
        this.gpsRecomputeAccum += dt;
        if (this.gpsRecomputeAccum >= 0.45) {
          this.gpsRecomputeAccum = 0;
          this.gpsPath = this.computeRoadGpsPath(refPos.x, refPos.z, this.gpsPin.x, this.gpsPin.z);
          this.updateGpsMeshes();
        }
      }
    }

    if (this.isDead) {
      this.playerCharacter.update(dt, {
        horizSpeed: 0,
        isGrounded: true,
        isSprinting: false,
        isPunching: false,
        punchProgress: 0,
        isEntering: false,
        isSeated: Boolean(this.drivenVehicle),
        isBike: Boolean(this.drivenVehicle?.kind === 'motorcycle'),
        vehicleForwardSpeed: 0,
        isDead: true,
      });
    } else if (this.pendingVehicle) {
      this.entryTimer += dt;
      const v = this.pendingVehicle;
      const openAmt = THREE.MathUtils.smoothstep(this.entryTimer, 0.1, 0.55);
      if (v.rig.doorPivot) {
        v.rig.doorPivot.rotation.y = -openAmt * THREE.MathUtils.degToRad(68);
      }
      _right.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
      const doorWorld = v.position.clone().addScaledVector(_right, -(v.rig.width * 0.5 + 0.65));
      this.playerPos.lerpVectors(this.entryStartPos, doorWorld, Math.min(1, this.entryTimer * 2.4));
      this.playerYaw = Math.atan2(v.position.x - this.playerPos.x, v.position.z - this.playerPos.z);
      this.playerCharacter.group.position.copy(this.playerPos);
      this.playerCharacter.group.rotation.y = this.playerYaw;
      this.playerCharacter.update(dt, {
        horizSpeed: 2.6,
        isGrounded: true,
        isSprinting: false,
        isPunching: false,
        punchProgress: 0,
        isEntering: true,
        isSeated: false,
        isBike: false,
        vehicleForwardSpeed: 0,
      });

      if (this.entryTimer >= 0.72) {
        this.finishVehicleEntry();
      }
    } else if (this.drivenVehicle) {
      this.stepDrivenVehicle(dt, this.drivenVehicle);
    } else {
      this.stepPlayerOnFoot(dt);
    }

    this.stepVehicles(dt);
    this.stepVehicleToVehicleCollisions();
    if (!this.isDead) {
      this.stepLawEnforcement(dt);
    }
    this.stepPoliceOfficers(dt);
    this.stepSecurityGuards(dt);
    this.stepPedestrians(dt);

    this.city.updateLandmark?.(dt);
    if (this.city.yachtMesh) {
      this.city.yachtMesh.position.y = -0.35 + Math.sin(this.elapsed * 1.15) * 0.07;
      this.city.yachtMesh.rotation.z = Math.sin(this.elapsed * 0.9) * 0.022;
      this.city.yachtMesh.rotation.x = Math.cos(this.elapsed * 0.72) * 0.014;
    }

    this.updateCamera(dt);
    const focus = this.drivenVehicle ? this.drivenVehicle.position : this.playerPos;
    this.sunLight.target.position.copy(focus);
    this.sunLight.position.set(focus.x + 55, 88, focus.z - 42);
  }

  private stepVfxPools(dt: number): void {
    for (const bp of this.bloodParticles) {
      if (!bp.active) continue;
      bp.life -= dt;
      if (bp.life <= 0) {
        bp.active = false;
        bp.mesh.visible = false;
        continue;
      }
      bp.vel.y -= 13.5 * dt;
      bp.mesh.position.addScaledVector(bp.vel, dt);
      const gy = this.groundHeightAt(bp.mesh.position.x, bp.mesh.position.z);
      if (bp.mesh.position.y < gy + 0.04) {
        bp.mesh.position.y = gy + 0.04;
        bp.vel.set(0, 0, 0);
      }
    }

    for (const bt of this.bulletTracers) {
      if (!bt.active) continue;
      bt.life -= dt;
      if (bt.life <= 0) {
        bt.active = false;
        bt.mesh.visible = false;
        continue;
      }
      bt.mesh.position.addScaledVector(bt.vel, dt);
    }

    for (const sc of this.shellCasings) {
      if (!sc.active) continue;
      sc.life -= dt;
      if (sc.life <= 0) {
        sc.active = false;
        sc.mesh.visible = false;
        continue;
      }
      sc.vel.y -= 14.5 * dt;
      sc.mesh.position.addScaledVector(sc.vel, dt);
      sc.mesh.rotation.x += sc.spin.x * dt;
      sc.mesh.rotation.y += sc.spin.y * dt;
      sc.mesh.rotation.z += sc.spin.z * dt;
      const gy = this.groundHeightAt(sc.mesh.position.x, sc.mesh.position.z);
      if (sc.mesh.position.y < gy + 0.015) {
        sc.mesh.position.y = gy + 0.015;
        if (!sc.bounced) {
          sc.bounced = true;
          this.audio.playShellClink();
          sc.vel.y = Math.abs(sc.vel.y) * 0.35;
          sc.vel.x *= 0.45;
          sc.vel.z *= 0.45;
          sc.spin.multiplyScalar(0.3);
        } else {
          sc.vel.set(0, 0, 0);
          sc.spin.set(0, 0, 0);
        }
      }
    }

    for (const gs of this.glassShards) {
      if (!gs.active) continue;
      gs.life -= dt;
      if (gs.life <= 0) {
        gs.active = false;
        gs.mesh.visible = false;
        continue;
      }
      gs.vel.y -= 15.0 * dt;
      gs.mesh.position.addScaledVector(gs.vel, dt);
      gs.mesh.rotation.x += gs.spin.x * dt;
      gs.mesh.rotation.y += gs.spin.y * dt;
      const gy = this.groundHeightAt(gs.mesh.position.x, gs.mesh.position.z);
      if (gs.mesh.position.y < gy + 0.02) {
        gs.mesh.position.y = gy + 0.02;
        gs.vel.set(0, 0, 0);
        gs.spin.set(0, 0, 0);
      }
    }
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
    const maxSpeed = sprinting && !this.isAimingRightClick ? 6.4 : 3.2;

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

      if (this.cameraView !== 'firstperson' && !this.isAimingRightClick) {
        const targetYaw = Math.atan2(_v1.x, _v1.z);
        this.playerYaw = dampAngle(this.playerYaw, targetYaw, 11, dt);
      }
    } else {
      this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, 0, 14, dt);
      this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, 0, 14, dt);
    }

    if (this.cameraView === 'firstperson' || (this.isAimingRightClick && this.equippedWeapon !== 'unarmed')) {
      this.playerYaw = this.camYaw + Math.PI;
    }

    this.playerVel.y -= 16.5 * dt;

    const nextX = this.playerPos.x + this.playerVel.x * dt;
    const nextZ = this.playerPos.z + this.playerVel.z * dt;

    const resolved = this.resolveCircleCollisions(nextX, nextZ, 0.42);
    if (this.insideShop) {
      const rb = this.insideShop.roomBounds;
      this.playerPos.x = THREE.MathUtils.clamp(resolved.x, rb.minX + 0.45, rb.maxX - 0.45);
      this.playerPos.z = THREE.MathUtils.clamp(resolved.z, rb.minZ + 0.45, rb.maxZ - 0.45);
    } else {
      this.playerPos.x = THREE.MathUtils.clamp(resolved.x, this.city.bounds.minX, this.city.bounds.maxX);
      this.playerPos.z = THREE.MathUtils.clamp(resolved.z, this.city.bounds.minZ, this.city.bounds.maxZ);
    }
    this.playerPos.y += this.playerVel.y * dt;

    const floorY = this.groundHeightAt(this.playerPos.x, this.playerPos.z);
    if (this.playerPos.y <= floorY) {
      this.playerPos.y = floorY;
      this.playerVel.y = 0;
      this.playerGrounded = true;
    }

    // Shop interior doorway & free weapon pad pickup OR street doorway entry
    if (this.insideShop) {
      const shop = this.insideShop;
      if (shop.weaponPickupSpots) {
        for (const spot of shop.weaponPickupSpots) {
          spot.prop.rotation.y += dt * 1.4;
          const dSpot = Math.hypot(this.playerPos.x - spot.x, this.playerPos.z - spot.z);
          if (dSpot < 1.35 && !this.ownedWeapons.has(spot.kind)) {
            if (spot.kind === 'pistol') {
              this.buyOrCollectWeapon('pistol', 0);
            }
          }
        }
      }
      if (this.shopDoorCooldown <= 0) {
        const dExit = Math.hypot(
          this.playerPos.x - shop.exitDoor.x,
          this.playerPos.z - shop.exitDoor.z
        );
        if (dExit < 1.75) {
          this.exitShop();
          return;
        }
      }
    } else if (this.shopDoorCooldown <= 0) {
      for (const shop of this.city.shopPois) {
        const dDoor = Math.hypot(
          this.playerPos.x - shop.info.doorX,
          this.playerPos.z - shop.info.doorZ
        );
        if (dDoor < 1.85) {
          this.enterShop(shop);
          return;
        }
      }
    }

    if (!this.insideShop && this.elapsed > this.autoMountBlockedUntil) {
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

    // Punch hit check (torso twist + lunge + hit-stop + blood particles + decals)
    // Security guards take 10 dmg per punch (3 punches to kill!)
    let punchProgress = 0;
    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - dt);
      punchProgress = 1 - this.punchTimer / 0.44;

      if (!this.punchHitDone && punchProgress > 0.34) {
        this.punchHitDone = true;
        _fwd.set(Math.sin(this.playerYaw), 0, Math.cos(this.playerYaw));

        let landedAny = false;
        for (const p of this.pedestrians) {
          if (p.dead || p.fallen) continue;
          const dx = p.position.x - this.playerPos.x;
          const dz = p.position.z - this.playerPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 2.35) {
            const dot = (dx * _fwd.x + dz * _fwd.z) / Math.max(0.01, dist);
            if (dot > 0.05) {
              landedAny = true;
              this.applyPunchToPedestrian(p, _fwd.clone().multiplyScalar(6.5));
            }
          }
        }

        for (const off of this.officers) {
          if (off.dead || off.fallen) continue;
          const dx = off.position.x - this.playerPos.x;
          const dz = off.position.z - this.playerPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 2.35) {
            const dot = (dx * _fwd.x + dz * _fwd.z) / Math.max(0.01, dist);
            if (dot > 0.05) {
              landedAny = true;
              this.applyHitToOfficer(off, 38, _fwd.clone().multiplyScalar(6.2));
            }
          }
        }

        for (const g of this.securityGuards) {
          if (g.dead || !g.rig.group.visible) continue;
          const dx = g.position.x - this.playerPos.x;
          const dz = g.position.z - this.playerPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 2.35) {
            const dot = (dx * _fwd.x + dz * _fwd.z) / Math.max(0.01, dist);
            if (dot > 0.05) {
              landedAny = true;
              this.applyHitToSecurityGuard(g, 10, _fwd.clone().multiplyScalar(5.0));
            }
          }
        }

        if (landedAny) {
          this.hitStopTimer = 0.055;
          this.audio.playPunchHit();
        }
      }
    }

    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (horizSpeed > 0.25) {
      this.fpsBobPhase += dt * (horizSpeed * 2.5 + 1.4);
    } else {
      this.fpsBobPhase += dt * 1.4;
    }

    this.playerCharacter.update(dt, {
      horizSpeed,
      isGrounded: this.playerGrounded,
      isSprinting: sprinting && horizSpeed > 4.2,
      isPunching: this.punchTimer > 0,
      punchProgress,
      isEntering: false,
      isSeated: false,
      isBike: false,
      vehicleForwardSpeed: 0,
      isAiming: this.equippedWeapon !== 'unarmed' && (this.isAimingRightClick || this.cameraView === 'firstperson'),
      isShooting: this.playerShootAnimTimer > 0,
      aimPitch: this.camPitch,
    });

    this.fpsViewModel.update(dt, {
      speed: horizSpeed,
      isAiming: this.isAimingRightClick && this.equippedWeapon !== 'unarmed',
      isShooting: this.playerShootAnimTimer > 0,
      isPunching: this.punchTimer > 0,
      punchProgress,
      bobPhase: this.fpsBobPhase,
    });

    this.playerCharacter.group.position.copy(this.playerPos);
    this.playerCharacter.group.rotation.y = this.playerYaw;
    this.audio.updateEngine(false, false, 0, 0);
  }

  private applyPunchToPedestrian(p: PedestrianEntity, impulse: THREE.Vector3): void {
    p.hp = Math.max(0, p.hp - 35);
    this.spawnBloodBurst(p.position);
    this.spawnBloodDecal(p.position);
    this.audio.playPedestrianShout();

    p.fallen = true;
    p.velocity.copy(impulse).clampLength(0, 12);
    p.knockdownRotX = -Math.PI * 0.48;
    p.knockdownRotZ = (Math.random() - 0.5) * 0.45;

    if (p.hp <= 0) {
      p.dead = true;
      p.combatState = 'ambient';
      this.knockdowns++;
      this.setEvent('Knockout!');
    } else if (p.archetype === 'tall' || p.archetype === 'average') {
      p.recoverAt = this.elapsed + 1.85;
      p.combatState = 'hostile';
      this.setEvent('Hit landed! Watch out — they are fighting back!');
    } else {
      p.recoverAt = this.elapsed + 0.85;
      p.combatState = 'flee';
      this.setEvent('Civilian panicked & fleeing!');
    }
  }

  private applyHitToOfficer(off: OfficerEntity, damage: number, impulse: THREE.Vector3): void {
    if (off.dead) return;
    off.hp = Math.max(0, off.hp - damage);
    this.spawnBloodBurst(off.position);
    this.spawnBloodDecal(off.position);
    off.velocity.copy(impulse).clampLength(0, 12);
    if (off.hp <= 0) {
      off.dead = true;
      off.fallen = true;
      off.rig.muzzleFlashMesh.visible = false;
      this.knockdowns++;
      this.setEvent('Police Officer incapacitated!');
    } else {
      off.fallen = true;
      off.recoverAt = this.elapsed + 1.6;
      off.rig.muzzleFlashMesh.visible = false;
    }
  }

  private stepDrivenVehicle(dt: number, v: VehicleEntity): void {
    const isBike = v.kind === 'motorcycle';
    const fwdIn =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) + Math.max(0, this.touchMove.y);
    const revIn =
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) + Math.max(0, -this.touchMove.y);
    const handbrake = this.keys.has('Space');
    const poppedCount =
      (v.rig.tirePopped[0] ? 1 : 0) +
      (v.rig.tirePopped[1] ? 1 : 0) +
      (v.rig.tirePopped[2] ? 1 : 0) +
      (v.rig.tirePopped[3] ? 1 : 0);
    const tireSpeedPenalty = Math.max(0.55, 1.0 - poppedCount * 0.14);
    const flatSteerBias =
      ((v.rig.tirePopped[0] || v.rig.tirePopped[2] ? 1 : 0) -
        (v.rig.tirePopped[1] || v.rig.tirePopped[3] ? 1 : 0)) *
      0.16;

    const steerIn =
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) -
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      this.touchMove.x +
      (Math.abs(v.forwardSpeed) > 3 ? flatSteerBias : 0);

    const tuneMult = (this.tunedVehicleIds.has(v.id) ? 1.28 : 1.0) * tireSpeedPenalty;
    const maxSpeed =
      (v.kind === 'supercar'
        ? 46
        : v.kind === 'convertible'
          ? 40
          : v.kind === 'police'
            ? 41
            : isBike
              ? 39
              : v.kind === 'coupe'
                ? 37
                : v.kind === 'truck'
                  ? 25
                  : 32) * tuneMult;
    const accelForce =
      (v.kind === 'supercar'
        ? 22.5
        : v.kind === 'convertible'
          ? 18.0
          : v.kind === 'police'
            ? 19.0
            : isBike
              ? 19.5
              : v.kind === 'coupe'
                ? 16.5
                : v.kind === 'truck'
                  ? 9.5
                  : 13.5) * tuneMult;

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
        const maxRev = isBike ? -0.9 : -11.0;
        if (v.forwardSpeed > maxRev) {
          throttle = isBike ? -0.25 : -0.55;
        }
      }
    }

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
      v.forwardSpeed = THREE.MathUtils.damp(v.forwardSpeed, 0, 1.35, dt);
    }

    v.rig.tailLightMat.emissiveIntensity = braking ? 2.4 : 0.45;

    const maxSteer = isBike ? THREE.MathUtils.degToRad(26) : THREE.MathUtils.degToRad(30);
    const speedFactor = THREE.MathUtils.clamp(1.0 - Math.abs(v.forwardSpeed) / 48, 0.42, 1.0);
    v.steerAngle = THREE.MathUtils.damp(v.steerAngle, steerIn * maxSteer * speedFactor, 9, dt);

    const wheelbase = isBike ? 1.46 : v.rig.length * 0.62;
    if (Math.abs(v.forwardSpeed) > 0.08) {
      const turnRate = (v.forwardSpeed / wheelbase) * Math.tan(v.steerAngle);
      const driftBoost = handbrake && Math.abs(v.forwardSpeed) > 6 ? 1.42 : 1.0;
      v.yaw += turnRate * driftBoost * dt;
    }

    _fwd.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    const grip = handbrake ? 2.8 : isBike ? 10.5 : 8.2;
    v.velocity.x = THREE.MathUtils.damp(v.velocity.x, _fwd.x * v.forwardSpeed, grip, dt);
    v.velocity.z = THREE.MathUtils.damp(v.velocity.z, _fwd.z * v.forwardSpeed, grip, dt);

    const nextX = v.position.x + v.velocity.x * dt;
    const nextZ = v.position.z + v.velocity.z * dt;
    const radius = v.rig.width * 0.56;
    const resolved = this.resolveCircleCollisions(nextX, nextZ, radius);

    if (Math.hypot(resolved.x - nextX, resolved.z - nextZ) > 0.005) {
      const wallSpeed = Math.abs(v.forwardSpeed);
      if (wallSpeed > 5.5) {
        this.audio.playImpact(Math.min(1, wallSpeed / 18));
        applyVehicleDent(v.rig, 1, 0, wallSpeed / 65);
        if (wallSpeed > 18) {
          this.damagePlayer(Math.round(THREE.MathUtils.clamp((wallSpeed - 18) * 0.9, 5, 22)), 'Heavy Crash');
        }
      }
      v.forwardSpeed *= 0.45;
      v.velocity.multiplyScalar(0.45);
    }

    v.position.x = THREE.MathUtils.clamp(resolved.x, this.city.bounds.minX + 1, this.city.bounds.maxX - 1);
    v.position.z = THREE.MathUtils.clamp(resolved.z, this.city.bounds.minZ + 1, this.city.bounds.maxZ - 1);

    const targetGround = this.groundHeightAt(v.position.x, v.position.z);
    const springForce = (targetGround - v.suspY) * 140 - v.suspVel * 16;
    v.suspVel += springForce * dt;
    v.suspY += v.suspVel * dt;
    v.position.y = Math.max(targetGround - 0.04, v.suspY);

    if (isBike) {
      const targetLean =
        -steerIn * THREE.MathUtils.degToRad(14) * THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) / 10, 0, 1);
      v.leanAngle = THREE.MathUtils.damp(v.leanAngle, targetLean, 8, dt);
      v.rig.chassisGroup.rotation.z = v.leanAngle;
    } else {
      const roll = -steerIn * THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) / 28, 0, 1) * 0.045;
      const pitch = braking ? 0.03 : throttle > 0 ? -0.02 : 0;
      v.rig.chassisGroup.rotation.z = THREE.MathUtils.damp(v.rig.chassisGroup.rotation.z, roll, 8, dt);
      v.rig.chassisGroup.rotation.x = THREE.MathUtils.damp(v.rig.chassisGroup.rotation.x, pitch, 8, dt);
    }

    if (!isBike) {
      this.playerCharacter.group.position.copy(v.rig.seatLocal);
    }

    this.playerCharacter.update(dt, {
      horizSpeed: 0,
      isGrounded: true,
      isSprinting: false,
      isPunching: false,
      punchProgress: 0,
      isEntering: false,
      isSeated: true,
      isBike,
      vehicleForwardSpeed: v.forwardSpeed,
    });

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
    this.playerPos.copy(v.position);

    // Pedestrian & officer vehicle hit checks
    this.checkVehicleEntityStrikes(v);
    this.audio.updateEngine(true, isBike, Math.abs(v.forwardSpeed) / maxSpeed, Math.abs(throttle));
  }

  private checkVehicleEntityStrikes(playerVeh: VehicleEntity): void {
    const pSpeed = Math.hypot(playerVeh.velocity.x, playerVeh.velocity.z);
    if (pSpeed < 4.5) return;

    for (const p of this.pedestrians) {
      if (p.dead || p.fallen) continue;
      const dx = p.position.x - playerVeh.position.x;
      const dz = p.position.z - playerVeh.position.z;
      const hitDist = playerVeh.rig.width * 0.65 + 0.4;
      if (dx * dx + dz * dz < hitDist * hitDist) {
        this.knockdownPedestrian(p, playerVeh.velocity.clone().multiplyScalar(0.82), true);
      }
    }

    for (const off of this.officers) {
      if (off.dead || off.fallen) continue;
      const dx = off.position.x - playerVeh.position.x;
      const dz = off.position.z - playerVeh.position.z;
      const hitDist = playerVeh.rig.width * 0.65 + 0.4;
      if (dx * dx + dz * dz < hitDist * hitDist) {
        this.applyHitToOfficer(off, 100, playerVeh.velocity.clone().multiplyScalar(0.85));
      }
    }
  }

  /**
   * Solid multi-vehicle collision physics between player car, police cruisers, and traffic cars
   * so cars ram, visibly dent, and bounce apart realistically instead of phasing through each other.
   */
  private stepVehicleToVehicleCollisions(): void {
    const count = this.vehicles.length;
    for (let i = 0; i < count; i++) {
      const a = this.vehicles[i];
      if (!a.rig.group.visible) continue;

      for (let j = i + 1; j < count; j++) {
        const b = this.vehicles[j];
        if (!b.rig.group.visible) continue;

        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const minDist = (a.rig.width + b.rig.width) * 0.62;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;

          const aShare = a === this.drivenVehicle ? 0.35 : 0.5;
          const bShare = 1.0 - aShare;
          a.position.x -= nx * overlap * aShare;
          a.position.z -= nz * overlap * aShare;
          b.position.x += nx * overlap * bShare;
          b.position.z += nz * overlap * bShare;

          const relVx = a.velocity.x - b.velocity.x;
          const relVz = a.velocity.z - b.velocity.z;
          const closing = relVx * nx + relVz * nz;

          if (closing > 1.8) {
            const impactStrength = THREE.MathUtils.clamp(closing / 18, 0.15, 1.0);
            const bounce = closing * 0.62;

            a.velocity.x -= nx * bounce * aShare * 1.4;
            a.velocity.z -= nz * bounce * aShare * 1.4;
            b.velocity.x += nx * bounce * bShare * 1.4;
            b.velocity.z += nz * bounce * bShare * 1.4;

            a.forwardSpeed *= 0.66;
            b.forwardSpeed *= 0.66;

            // Visibly dent both vehicles along their local impact axes
            const aFwdDot = Math.sin(a.yaw) * nx + Math.cos(a.yaw) * nz;
            const aRightDot = Math.cos(a.yaw) * nx - Math.sin(a.yaw) * nz;
            applyVehicleDent(a.rig, aFwdDot, aRightDot, impactStrength * 0.09);

            const bFwdDot = -(Math.sin(b.yaw) * nx + Math.cos(b.yaw) * nz);
            const bRightDot = -(Math.cos(b.yaw) * nx - Math.sin(b.yaw) * nz);
            applyVehicleDent(b.rig, bFwdDot, bRightDot, impactStrength * 0.09);

            const involvesPlayer = a === this.drivenVehicle || b === this.drivenVehicle;
            if (involvesPlayer || a.position.distanceToSquared(this.playerPos) < 55 * 55) {
              this.audio.playImpact(impactStrength);
            }

            if (involvesPlayer) {
              const other = a === this.drivenVehicle ? b : a;

              if (other.isTraffic && !other.isWreck && !other.isPursuing) {
                other.isWreck = true;
                other.wreckTimer = 18;
                other.angularVel = (Math.random() - 0.5) * 4.5;
                if (other.hasOccupant) {
                  other.hasOccupant = false;
                  other.rig.occupantGroup.visible = false;
                  this.spawnEjectedSurvivor(other);
                }
              }

              this.setEvent(`Vehicle collision · ${Math.round(closing * 3.6)} km/h`);

              if (closing > 14.5) {
                this.damagePlayer(
                  Math.round(THREE.MathUtils.clamp((closing - 14.5) * 1.4, 6, 26)),
                  'High-Speed Crash'
                );
              }
            }
          }

          a.rig.group.position.copy(a.position);
          b.rig.group.position.copy(b.position);
        }
      }
    }
  }

  private stepVehicles(dt: number): void {
    const maxPursuers = this.wantedLevel > 0 ? Math.min(4, this.wantedLevel + 1) : 0;
    let activePursuers = 0;

    for (const v of this.vehicles) {
      if (v === this.drivenVehicle || v === this.pendingVehicle) continue;
      if (v.ramCooldown > 0) v.ramCooldown = Math.max(0, v.ramCooldown - dt);
      if (v.deployPauseTimer > 0) v.deployPauseTimer = Math.max(0, v.deployPauseTimer - dt);

      // Distance culling & 100-unit physics/animation freeze for non-pursuing traffic cars
      const distSq = v.position.distanceToSquared(this.playerPos);
      const isVisible = v.isPursuing || distSq < VEHICLE_CULL_DIST_SQ;
      v.rig.group.visible = isVisible;
      const isFrozenTraffic = !v.isPursuing && !v.isWreck && distSq > FREEZE_DIST_SQ;

      if (v.isPolice && !v.isWreck) {
        if (this.wantedLevel > 0 && activePursuers < maxPursuers) {
          v.isPursuing = true;
          v.isTraffic = false;
          activePursuers++;
        } else {
          v.isPursuing = false;
          v.isTraffic = true;
          if (v.officersDeployed) {
            v.officersDeployed = false;
            v.hasOccupant = true;
            v.rig.occupantGroup.visible = true;
            if (v.rig.doorPivot) v.rig.doorPivot.rotation.y = 0;
          }
        }
      }

      if (v.kind === 'police' && v.rig.policeLightRedMat && v.rig.policeLightBlueMat) {
        if (v.isPursuing) {
          const flash = Math.sin(this.elapsed * 18) > 0;
          v.rig.policeLightRedMat.emissiveIntensity = flash ? 3.2 : 0.15;
          v.rig.policeLightBlueMat.emissiveIntensity = flash ? 0.15 : 3.2;
        } else {
          v.rig.policeLightRedMat.emissiveIntensity = 0.2;
          v.rig.policeLightBlueMat.emissiveIntensity = 0.2;
        }
      }

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

        if (v.kind === 'motorcycle') {
          v.leanAngle = THREE.MathUtils.damp(v.leanAngle, Math.PI * 0.42, 5, dt);
          v.rig.chassisGroup.rotation.z = v.leanAngle;
        }

        if (v.isPolice && v.wreckTimer <= 0) {
          v.isWreck = false;
          v.isTraffic = true;
          v.hasOccupant = true;
          v.officersDeployed = false;
          v.rig.occupantGroup.visible = true;
          resetVehicleDent(v.rig);
          const pt = this.sampleLoopPoint(this.city.trafficLoops[v.loopIndex], v.loopT, _v1, _v2);
          v.position.copy(pt);
          v.yaw = Math.atan2(_v2.x, _v2.z);
        }

        v.rig.group.position.copy(v.position);
        v.rig.group.rotation.y = v.yaw;
      } else if (v.isPursuing) {
        this.stepPolicePursuit(dt, v);
      } else if (v.isTraffic) {
        if (isFrozenTraffic) continue;
        const loop = this.city.trafficLoops[v.loopIndex];
        const loopLen = this.getLoopLength(loop);

        let speedScale = 1.0;
        if (isVisible) {
          _fwd.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
          const isEW = Math.abs(_fwd.x) >= Math.abs(_fwd.z);
          const axisSignal = isEW ? this.ewSignal : this.nsSignal;

          if (axisSignal === 'red' || axisSignal === 'yellow') {
            for (const inter of this.city.intersections) {
              const dx = inter.x - v.position.x;
              const dz = inter.z - v.position.z;
              const ahead = dx * _fwd.x + dz * _fwd.z;
              const lateral = Math.abs(-dx * _fwd.z + dz * _fwd.x);
              if (lateral < 6.8 && ahead > 7.8 && ahead < 15.8) {
                speedScale = 0;
                break;
              }
            }
          }

          if (speedScale > 0) {
            for (const other of this.vehicles) {
              if (other === v || !other.rig.group.visible) continue;
              const dx = other.position.x - v.position.x;
              const dz = other.position.z - v.position.z;
              const d2 = dx * dx + dz * dz;
              if (d2 < 88) {
                const dist = Math.sqrt(d2);
                const dot = (dx * _fwd.x + dz * _fwd.z) / Math.max(0.1, dist);
                if (dot > 0.72) {
                  speedScale = dist < 5.8 ? 0 : 0.35;
                  break;
                }
              }
            }
          }
        }

        const targetSpeed = v.trafficSpeed * speedScale;
        v.forwardSpeed = THREE.MathUtils.damp(v.forwardSpeed, targetSpeed, speedScale === 0 ? 7.5 : 4.5, dt);
        this.sampleLoopPoint(loop, v.loopT, _v1, _v2);
        const distSqToLoop = v.position.distanceToSquared(_v1);

        if (distSqToLoop > 4.0) {
          _v3.subVectors(_v1, v.position);
          _v3.y = 0;
          const dist = Math.max(0.01, _v3.length());
          _v3.divideScalar(dist);
          const rejoinStep = Math.min(dist, Math.max(3.5, v.forwardSpeed) * dt);
          const nextRes = this.resolveCircleCollisions(
            v.position.x + _v3.x * rejoinStep,
            v.position.z + _v3.z * rejoinStep,
            v.rig.width * 0.52
          );
          v.position.set(nextRes.x, this.groundHeightAt(nextRes.x, nextRes.z), nextRes.z);
          v.velocity.copy(_v3).multiplyScalar(v.forwardSpeed);
          v.yaw = dampAngle(v.yaw, Math.atan2(_v3.x, _v3.z), 5, dt);
        } else {
          v.loopT = (v.loopT + (v.forwardSpeed * dt) / loopLen) % 1;
          this.sampleLoopPoint(loop, v.loopT, _v1, _v2);
          v.velocity.copy(_v2).multiplyScalar(v.forwardSpeed);
          v.position.copy(_v1);
          const targetYaw = Math.atan2(_v2.x, _v2.z);
          v.yaw = dampAngle(v.yaw, targetYaw, 6, dt);
        }

        if (isVisible) {
          v.wheelSpin += (v.forwardSpeed / 0.36) * dt;
          for (const w of v.rig.wheelSpinMeshes) {
            w.rotation.x = v.wheelSpin;
          }
          v.rig.tailLightMat.emissiveIntensity = speedScale < 0.5 ? 2.1 : 0.4;
          v.rig.group.position.copy(v.position);
          v.rig.group.rotation.y = v.yaw;
        }
      }
    }
  }

  private stepPolicePursuit(dt: number, cop: VehicleEntity): void {
    const targetPos = this.drivenVehicle ? this.drivenVehicle.position : this.playerPos;
    const targetVel = this.drivenVehicle ? this.drivenVehicle.velocity : this.playerVel;
    const targetSpeed = Math.hypot(targetVel.x, targetVel.z);
    const distToPlayer = Math.hypot(targetPos.x - cop.position.x, targetPos.z - cop.position.z);

    // If officers already dismounted nearby, keep cruiser parked with door open until player escapes
    if (cop.officersDeployed) {
      cop.forwardSpeed = THREE.MathUtils.damp(cop.forwardSpeed, 0, 8, dt);
      cop.velocity.multiplyScalar(0.82);
      if (cop.rig.doorPivot) {
        cop.rig.doorPivot.rotation.y = THREE.MathUtils.damp(
          cop.rig.doorPivot.rotation.y,
          -THREE.MathUtils.degToRad(62),
          8,
          dt
        );
      }
      if (distToPlayer > 48) {
        // Player sped away — close door & resume pursuit!
        cop.officersDeployed = false;
        cop.hasOccupant = true;
        cop.rig.occupantGroup.visible = true;
      }
      cop.rig.group.position.copy(cop.position);
      cop.rig.group.rotation.y = cop.yaw;
      return;
    }

    if (cop.rig.doorPivot) {
      cop.rig.doorPivot.rotation.y = THREE.MathUtils.damp(cop.rig.doorPivot.rotation.y, 0, 10, dt);
    }

    // Deploy armed uniformed police officers when cruiser closes in on slow/on-foot suspect!
    const playerSlowOrOnFoot = !this.drivenVehicle || targetSpeed < 7.0;
    if (distToPlayer < 15.5 && playerSlowOrOnFoot && !this.isDead && this.officers.length < 6) {
      this.deployPoliceOfficers(cop);
      return;
    }

    const aimX = targetPos.x + targetVel.x * 0.45;
    const aimZ = targetPos.z + targetVel.z * 0.45;
    const dx = aimX - cop.position.x;
    const dz = aimZ - cop.position.z;
    let desiredYaw = Math.atan2(dx, dz);

    const probeDist = 5.6;
    const fwdBlocked = this.isPointInsideCollider(
      cop.position.x + Math.sin(cop.yaw) * probeDist,
      cop.position.z + Math.cos(cop.yaw) * probeDist,
      1.1
    );
    if (fwdBlocked) {
      const leftClear = !this.isPointInsideCollider(
        cop.position.x + Math.sin(cop.yaw + 0.72) * probeDist,
        cop.position.z + Math.cos(cop.yaw + 0.72) * probeDist,
        1.0
      );
      const rightClear = !this.isPointInsideCollider(
        cop.position.x + Math.sin(cop.yaw - 0.72) * probeDist,
        cop.position.z + Math.cos(cop.yaw - 0.72) * probeDist,
        1.0
      );
      desiredYaw = leftClear ? cop.yaw + 1.05 : rightClear ? cop.yaw - 1.05 : cop.yaw + 1.45;
    }

    let angleDiff = ((desiredYaw - cop.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const maxPursuitSpeed = 28 + this.wantedLevel * 5.5;
    const desiredSpeed =
      distToPlayer < 6.0
        ? 4.0
        : Math.abs(angleDiff) > 1.45
          ? 12.0
          : maxPursuitSpeed;

    cop.forwardSpeed = THREE.MathUtils.damp(cop.forwardSpeed, desiredSpeed, 3.2, dt);

    const maxSteer = THREE.MathUtils.degToRad(34);
    const steerAngle = THREE.MathUtils.clamp(angleDiff * 1.15, -maxSteer, maxSteer);
    cop.steerAngle = THREE.MathUtils.damp(cop.steerAngle, steerAngle, 10, dt);

    const wheelbase = cop.rig.length * 0.6;
    const turnRate = (cop.forwardSpeed / wheelbase) * Math.tan(cop.steerAngle);
    cop.yaw += turnRate * dt;

    _fwd.set(Math.sin(cop.yaw), 0, Math.cos(cop.yaw));
    cop.velocity.x = THREE.MathUtils.damp(cop.velocity.x, _fwd.x * cop.forwardSpeed, 6.8, dt);
    cop.velocity.z = THREE.MathUtils.damp(cop.velocity.z, _fwd.z * cop.forwardSpeed, 6.8, dt);

    const nextX = cop.position.x + cop.velocity.x * dt;
    const nextZ = cop.position.z + cop.velocity.z * dt;
    const res = this.resolveCircleCollisions(nextX, nextZ, cop.rig.width * 0.54);
    if (Math.hypot(res.x - nextX, res.z - nextZ) > 0.01) {
      cop.forwardSpeed *= 0.55;
      cop.yaw += angleDiff >= 0 ? 0.35 * dt * 6 : -0.35 * dt * 6;
    }

    cop.position.x = THREE.MathUtils.clamp(res.x, this.city.bounds.minX + 1, this.city.bounds.maxX - 1);
    cop.position.z = THREE.MathUtils.clamp(res.z, this.city.bounds.minZ + 1, this.city.bounds.maxZ - 1);
    cop.position.y = this.groundHeightAt(cop.position.x, cop.position.z);

    cop.rig.chassisGroup.rotation.z = THREE.MathUtils.damp(
      cop.rig.chassisGroup.rotation.z,
      -cop.steerAngle * 0.14,
      8,
      dt
    );
    cop.rig.wheelSteerPivots[0].rotation.y = cop.steerAngle;
    cop.rig.wheelSteerPivots[1].rotation.y = cop.steerAngle;
    cop.wheelSpin += (cop.forwardSpeed / 0.36) * dt;
    for (const w of cop.rig.wheelSpinMeshes) {
      w.rotation.x = cop.wheelSpin;
    }
    cop.rig.tailLightMat.emissiveIntensity = distToPlayer < 8 ? 2.2 : 0.45;
    cop.rig.group.position.copy(cop.position);
    cop.rig.group.rotation.y = cop.yaw;
  }

  private deployPoliceOfficers(cop: VehicleEntity): void {
    cop.officersDeployed = true;
    cop.hasOccupant = false;
    cop.rig.occupantGroup.visible = false;
    cop.forwardSpeed = 0;
    cop.velocity.set(0, 0, 0);
    this.audio.playDoorLatch();

    _right.set(Math.cos(cop.yaw), 0, -Math.sin(cop.yaw));
    const sideOffsets = [-1.55, 1.55];

    sideOffsets.forEach((sideOffset, idx) => {
      const rig = buildUniformedPoliceOfficer(this.anisotropy, this.isSoftwareGl, true);
      const pos = cop.position.clone().addScaledVector(_right, sideOffset);
      pos.y = this.groundHeightAt(pos.x, pos.z);
      const aimYaw = Math.atan2(this.playerPos.x - pos.x, this.playerPos.z - pos.z);
      rig.group.position.copy(pos);
      rig.group.rotation.y = aimYaw;
      this.scene.add(rig.group);

      this.officers.push({
        id: `officer_${cop.id}_${idx}_${Date.now()}`,
        vehicle: cop,
        rig,
        position: pos,
        velocity: new THREE.Vector3(),
        yaw: aimYaw,
        hp: 90,
        dead: false,
        fallen: false,
        recoverAt: 0,
        fireCooldown: 0.55 + idx * 0.38,
        muzzleTimer: 0,
        walkPhase: idx * 1.4,
      });
    });

    this.setEvent('Armed Police Officers exited cruiser!');
  }

  private stepPoliceOfficers(dt: number): void {
    const targetPos = this.drivenVehicle ? this.drivenVehicle.position : this.playerPos;

    for (let i = this.officers.length - 1; i >= 0; i--) {
      const off = this.officers[i];
      const distToPlayer = Math.hypot(targetPos.x - off.position.x, targetPos.z - off.position.z);

      // Clean up distant officers when wanted cleared or player escaped far away
      if ((this.wantedLevel === 0 && !off.dead) || distToPlayer > 72) {
        this.scene.remove(off.rig.group);
        this.disposeObjectMeshes(off.rig.group);
        this.officers.splice(i, 1);
        continue;
      }

      if (off.muzzleTimer > 0) {
        off.muzzleTimer = Math.max(0, off.muzzleTimer - dt);
        if (off.muzzleTimer <= 0) {
          off.rig.muzzleFlashMesh.visible = false;
        }
      }

      if (off.fallen || off.dead) {
        off.velocity.x = THREE.MathUtils.damp(off.velocity.x, 0, 5.0, dt);
        off.velocity.z = THREE.MathUtils.damp(off.velocity.z, 0, 5.0, dt);
        const res = this.resolveCircleCollisions(
          off.position.x + off.velocity.x * dt,
          off.position.z + off.velocity.z * dt,
          0.38
        );
        off.position.x = res.x;
        off.position.z = res.z;
        off.position.y = this.groundHeightAt(off.position.x, off.position.z) + 0.16;
        off.rig.bodyRoot.rotation.x = THREE.MathUtils.damp(off.rig.bodyRoot.rotation.x, -Math.PI * 0.48, 10, dt);
        off.rig.group.position.copy(off.position);

        if (!off.dead && this.elapsed >= off.recoverAt) {
          off.fallen = false;
          off.rig.bodyRoot.rotation.set(0, 0, 0);
        }
        continue;
      }

      if (this.isDead) {
        off.rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(off.rig.rightArmPivot.rotation.x, 0, 8, dt);
        continue;
      }

      // Aim directly toward player
      const dx = targetPos.x - off.position.x;
      const dz = targetPos.z - off.position.z;
      const desiredYaw = Math.atan2(dx, dz);
      off.yaw = dampAngle(off.yaw, desiredYaw, 9, dt);

      // Advance if too far, otherwise strafe/hold firing stance
      if (distToPlayer > 12.5) {
        const moveSpeed = 3.9;
        const dirX = dx / Math.max(0.1, distToPlayer);
        const dirZ = dz / Math.max(0.1, distToPlayer);
        const res = this.resolveCircleCollisions(
          off.position.x + dirX * moveSpeed * dt,
          off.position.z + dirZ * moveSpeed * dt,
          0.42
        );
        off.position.x = res.x;
        off.position.z = res.z;
        off.position.y = this.groundHeightAt(off.position.x, off.position.z);

        off.walkPhase += dt * moveSpeed * 2.8;
        off.rig.leftLegPivot.rotation.x = Math.sin(off.walkPhase) * 0.55;
        off.rig.rightLegPivot.rotation.x = -Math.sin(off.walkPhase) * 0.55;
        off.rig.leftArmPivot.rotation.x = -Math.sin(off.walkPhase) * 0.45;
      } else {
        off.position.y = this.groundHeightAt(off.position.x, off.position.z);
        off.rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(off.rig.leftLegPivot.rotation.x, 0, 10, dt);
        off.rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(off.rig.rightLegPivot.rotation.x, 0, 10, dt);
        off.rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(off.rig.leftArmPivot.rotation.x, -0.55, 8, dt);
      }

      // Raise handgun forward toward player
      off.rig.rightArmPivot.rotation.set(-Math.PI * 0.48, 0, -0.06);
      off.rig.group.position.copy(off.position);
      off.rig.group.rotation.y = off.yaw;

      // Fire weapon when player is in front of officer and within range
      off.fireCooldown -= dt;
      const aimDot = (Math.sin(off.yaw) * dx + Math.cos(off.yaw) * dz) / Math.max(0.1, distToPlayer);
      if (off.fireCooldown <= 0 && aimDot > 0.35 && distToPlayer < 28) {
        off.fireCooldown = 1.05 + Math.random() * 0.45;
        off.muzzleTimer = 0.075;
        off.rig.muzzleFlashMesh.visible = true;
        this.audio.playGunshot();

        _v1.set(
          off.position.x + Math.sin(off.yaw) * 0.65,
          off.position.y + 1.38,
          off.position.z + Math.cos(off.yaw) * 0.65
        );
        _v2.set(
          targetPos.x + (Math.random() - 0.5) * 0.55,
          targetPos.y + 1.15,
          targetPos.z + (Math.random() - 0.5) * 0.55
        );
        this.spawnBulletTracer(_v1, _v2);

        const targetSpd = this.drivenVehicle
          ? Math.abs(this.drivenVehicle.forwardSpeed)
          : Math.hypot(this.playerVel.x, this.playerVel.z);
        const hitChance = this.drivenVehicle
          ? THREE.MathUtils.clamp(0.7 - targetSpd / 40, 0.15, 0.65)
          : THREE.MathUtils.clamp(0.85 - targetSpd / 20, 0.45, 0.85);
        if (Math.random() < hitChance) {
          const dmg = this.drivenVehicle ? 6 : 10;
          this.spawnBloodBurst(this.playerPos);
          this.damagePlayer(dmg, 'Shot by Police');
        }
      }
    }
  }

  private stepSecurityGuards(dt: number): void {
    for (const g of this.securityGuards) {
      if (!this.insideShop || g.shop !== this.insideShop) {
        g.rig.group.visible = false;
        continue;
      }
      g.rig.group.visible = true;

      if (g.muzzleTimer > 0) {
        g.muzzleTimer = Math.max(0, g.muzzleTimer - dt);
        if (g.muzzleTimer <= 0) g.rig.muzzleFlashMesh.visible = false;
      }

      if (g.dead) {
        g.velocity.x = THREE.MathUtils.damp(g.velocity.x, 0, 5, dt);
        g.velocity.z = THREE.MathUtils.damp(g.velocity.z, 0, 5, dt);
        const res = this.resolveCircleCollisions(
          g.position.x + g.velocity.x * dt,
          g.position.z + g.velocity.z * dt,
          0.38
        );
        const rb = g.shop.roomBounds;
        g.position.x = THREE.MathUtils.clamp(res.x, rb.minX + 0.45, rb.maxX - 0.45);
        g.position.z = THREE.MathUtils.clamp(res.z, rb.minZ + 0.45, rb.maxZ - 0.45);
        g.position.y = 0.14;
        g.rig.bodyRoot.rotation.x = THREE.MathUtils.damp(g.rig.bodyRoot.rotation.x, -Math.PI * 0.48, 10, dt);
        g.rig.group.position.copy(g.position);
        continue;
      }

      if (g.staggerTimer > 0) {
        g.staggerTimer = Math.max(0, g.staggerTimer - dt);
      }

      if (!g.hostile || this.isDead) {
        g.rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(g.rig.leftLegPivot.rotation.x, 0, 8, dt);
        g.rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(g.rig.rightLegPivot.rotation.x, 0, 8, dt);
        g.rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(g.rig.leftArmPivot.rotation.x, 0, 8, dt);
        g.rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(g.rig.rightArmPivot.rotation.x, 0, 8, dt);
        g.rig.group.position.copy(g.position);
        g.rig.group.rotation.y = g.yaw;
        continue;
      }

      const dx = this.playerPos.x - g.position.x;
      const dz = this.playerPos.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      g.yaw = dampAngle(g.yaw, Math.atan2(dx, dz), 9, dt);

      if (dist > 3.2 && g.staggerTimer <= 0) {
        const moveSpeed = 3.1;
        const dirX = dx / Math.max(0.1, dist);
        const dirZ = dz / Math.max(0.1, dist);
        const res = this.resolveCircleCollisions(
          g.position.x + dirX * moveSpeed * dt,
          g.position.z + dirZ * moveSpeed * dt,
          0.4
        );
        const rb = g.shop.roomBounds;
        g.position.x = THREE.MathUtils.clamp(res.x, rb.minX + 0.45, rb.maxX - 0.45);
        g.position.z = THREE.MathUtils.clamp(res.z, rb.minZ + 0.45, rb.maxZ - 0.45);
        g.walkPhase += dt * moveSpeed * 2.8;
        g.rig.leftLegPivot.rotation.x = Math.sin(g.walkPhase) * 0.52;
        g.rig.rightLegPivot.rotation.x = -Math.sin(g.walkPhase) * 0.52;
        g.rig.leftArmPivot.rotation.x = -Math.sin(g.walkPhase) * 0.4;
      } else {
        g.rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(g.rig.leftLegPivot.rotation.x, 0, 10, dt);
        g.rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(g.rig.rightLegPivot.rotation.x, 0, 10, dt);
      }

      g.rig.rightArmPivot.rotation.set(-Math.PI * 0.46, 0, -0.05);
      g.rig.group.position.copy(g.position);
      g.rig.group.rotation.y = g.yaw;

      if (g.staggerTimer <= 0) {
        if (dist < 1.6) {
          g.meleeCooldown -= dt;
          if (g.meleeCooldown <= 0) {
            g.meleeCooldown = 1.05;
            this.audio.playPunchHit();
            this.spawnBloodBurst(this.playerPos);
            this.damagePlayer(8, 'Store Security Melee');
          }
        } else {
          g.fireCooldown -= dt;
          if (g.fireCooldown <= 0 && dist < 18) {
            g.fireCooldown = 1.25 + Math.random() * 0.4;
            g.muzzleTimer = 0.08;
            g.rig.muzzleFlashMesh.visible = true;
            this.audio.playGunshot();

            _v1.set(
              g.position.x + Math.sin(g.yaw) * 0.55,
              g.position.y + 1.38,
              g.position.z + Math.cos(g.yaw) * 0.55
            );
            _v2.set(this.playerPos.x, this.playerPos.y + 1.15, this.playerPos.z);
            this.spawnBulletTracer(_v1, _v2);

            if (Math.random() < 0.65) {
              this.spawnBloodBurst(this.playerPos);
              this.damagePlayer(7, 'Shot by Store Security');
            }
          }
        }
      }
    }
  }

  private updateTrafficSignals(): void {
    const t = this.elapsed % 16;
    if (t < 6.0) {
      this.ewSignal = 'green';
      this.nsSignal = 'red';
    } else if (t < 8.0) {
      this.ewSignal = 'yellow';
      this.nsSignal = 'red';
    } else if (t < 14.0) {
      this.ewSignal = 'red';
      this.nsSignal = 'green';
    } else {
      this.ewSignal = 'red';
      this.nsSignal = 'yellow';
    }

    const applyTriplet = (
      mats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial],
      state: LightColor
    ) => {
      mats[0].emissiveIntensity = state === 'red' ? 2.8 : 0.08;
      mats[1].emissiveIntensity = state === 'yellow' ? 2.8 : 0.08;
      mats[2].emissiveIntensity = state === 'green' ? 2.8 : 0.08;
    };

    applyTriplet(this.city.ewSignalMats, this.ewSignal);
    applyTriplet(this.city.nsSignalMats, this.nsSignal);
  }

  private raiseWanted(minLevel: number, reason: string): void {
    const prev = this.wantedLevel;
    this.wantedLevel = Math.min(3, Math.max(this.wantedLevel, minLevel));
    this.wantedReason = reason;
    this.evadeTimer = 0;

    if (this.wantedLevel > prev) {
      this.audio.playPoliceDispatch();
      this.setEvent(`Police Dispatched (${this.wantedLevel}★) · ${reason}`);
    }
  }

  private stepLawEnforcement(dt: number): void {
    if (this.bustedBannerTimer > 0) {
      this.bustedBannerTimer = Math.max(0, this.bustedBannerTimer - dt);
    }

    const v = this.drivenVehicle;

    if (this.wantedLevel > 0) {
      const pPos = v ? v.position : this.insideShop ? this.insideShop.outsideReturn : this.playerPos;
      let nearestCopDist = Infinity;
      for (const c of this.vehicles) {
        if (c.isPursuing) {
          const d = Math.hypot(c.position.x - pPos.x, c.position.z - pPos.z);
          if (d < nearestCopDist) nearestCopDist = d;
        }
      }

      const proximity = nearestCopDist < Infinity ? THREE.MathUtils.clamp(1 - nearestCopDist / 75, 0.1, 1) : 0;
      this.audio.updateSiren(true, proximity);

      if (nearestCopDist > 64) {
        this.evadeTimer += dt;
        if (this.evadeTimer >= 10.0) {
          this.wantedLevel = 0;
          this.wantedReason = '';
          this.evadeTimer = 0;
          this.bustedHoldTimer = 0;
          this.audio.updateSiren(false, 0);
          this.setEvent('Evaded the Police!');
        }
      } else {
        this.evadeTimer = Math.max(0, this.evadeTimer - dt * 2);
      }

      const playerSpeedKmh = v
        ? Math.abs(v.forwardSpeed) * 3.6
        : Math.hypot(this.playerVel.x, this.playerVel.z) * 3.6;

      if (nearestCopDist < 4.8 && playerSpeedKmh < 7) {
        this.bustedHoldTimer += dt;
        if (this.bustedHoldTimer >= 3.2) {
          this.wantedLevel = 0;
          this.wantedReason = '';
          this.evadeTimer = 0;
          this.bustedHoldTimer = 0;
          this.bustedBannerTimer = 3.0;
          this.audio.updateSiren(false, 0);
          if (v) {
            v.forwardSpeed = 0;
            v.velocity.set(0, 0, 0);
          }
          this.setEvent('BUSTED! Citation issued · Stay under 50 km/h');
        }
      } else {
        this.bustedHoldTimer = Math.max(0, this.bustedHoldTimer - dt * 1.5);
      }
    } else {
      this.audio.updateSiren(false, 0);
    }
  }

  private pickFreeRoamPoint(seed: number): THREE.Vector3 {
    const zones: [number, number, number, number, number][] = [
      [-180, 180, -48, -36, 0.2],
      [-15, 15, -19, 3, 0.18],
      [-63, -33, -19, 3, 0.18],
      [33, 63, -19, 3, 0.18],
      [-15, 15, 21, 45, 0.18],
      [-160, -128, 21, 45, 0.18],
      [128, 160, 21, 45, 0.18],
      [-15, 15, 107, 137, 0.18],
      [-15, 15, 207, 241, 0.18],
    ];
    const z = zones[Math.abs(seed) % zones.length];
    const r1 = ((seed * 9301 + 49297) % 233280) / 233280;
    const r2 = ((seed * 4517 + 19381) % 233280) / 233280;
    const px = THREE.MathUtils.lerp(z[0], z[1], (r1 + Math.random()) * 0.5);
    const pz = THREE.MathUtils.lerp(z[2], z[3], (r2 + Math.random()) * 0.5);
    return new THREE.Vector3(px, z[4], pz);
  }

  private knockdownPedestrian(p: PedestrianEntity, impulse: THREE.Vector3, playShout: boolean): void {
    if (p.dead || p.fallen) return;
    p.hp = Math.max(0, p.hp - 65);
    p.fallen = true;
    p.velocity.copy(impulse).clampLength(0, 12);
    p.knockdownRotX = -Math.PI * 0.48;
    p.knockdownRotZ = (Math.random() - 0.5) * 0.5;
    this.spawnBloodBurst(p.position);
    this.spawnBloodDecal(p.position);

    if (p.hp <= 0) {
      p.dead = true;
      p.combatState = 'ambient';
      this.knockdowns++;
    } else {
      p.recoverAt = this.elapsed + (p.archetype === 'tall' || p.archetype === 'average' ? 2.2 : 0.9);
      p.combatState = p.archetype === 'tall' || p.archetype === 'average' ? 'hostile' : 'flee';
      this.knockdowns++;
    }

    if (playShout) {
      this.audio.playPedestrianShout();
      this.setEvent(p.dead ? 'Pedestrian knocked out!' : 'Pedestrian struck!');
    }
  }

  private stepPedestrians(dt: number): void {
    for (const p of this.pedestrians) {
      if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);

      // Freeze animation & physics updates for NPCs further than 100 units from player
      const distSq = p.position.distanceToSquared(this.playerPos);
      const isFrozen = distSq > FREEZE_DIST_SQ && p.combatState !== 'hostile';
      p.group.visible = distSq < 120 * 120 || p.combatState === 'hostile';
      if (isFrozen) continue;

      let animMode: 'fallen' | 'flee' | 'hostile' | 'walk' = 'walk';

      if (p.dead || p.fallen) {
        animMode = 'fallen';
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

        if (p.civilian) {
          p.civilian.wrapper.rotation.x = THREE.MathUtils.damp(p.civilian.wrapper.rotation.x, p.knockdownRotX, 10, dt);
          p.civilian.wrapper.rotation.z = THREE.MathUtils.damp(p.civilian.wrapper.rotation.z, p.knockdownRotZ, 10, dt);
        } else if (p.rig) {
          p.rig.bodyRoot.rotation.x = THREE.MathUtils.damp(p.rig.bodyRoot.rotation.x, p.knockdownRotX, 10, dt);
          p.rig.bodyRoot.rotation.z = THREE.MathUtils.damp(p.rig.bodyRoot.rotation.z, p.knockdownRotZ, 10, dt);
        }

        if (!p.dead && this.elapsed >= p.recoverAt) {
          p.fallen = false;
          if (p.civilian) {
            p.civilian.wrapper.rotation.set(0, 0, 0);
          } else if (p.rig) {
            p.rig.bodyRoot.rotation.set(0, 0, 0);
          }
          if (p.combatState === 'flee') {
            p.fleeUntil = this.elapsed + 8.5;
          }
        }
      } else if (p.combatState === 'hostile' && !this.isDead) {
        // Tall & Average adults stand up, lock onto player, chase & punch back!
        animMode = 'hostile';
        const dx = this.playerPos.x - p.position.x;
        const dz = this.playerPos.z - p.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 36) {
          p.combatState = 'ambient';
        } else {
          p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 10, dt);
          if (dist > 1.45) {
            const chaseSpeed = p.archetype === 'tall' ? 4.35 : 4.05;
            const res = this.resolveCircleCollisions(
              p.position.x + (dx / Math.max(0.1, dist)) * chaseSpeed * dt,
              p.position.z + (dz / Math.max(0.1, dist)) * chaseSpeed * dt,
              0.4
            );
            p.position.x = THREE.MathUtils.clamp(res.x, this.city.bounds.minX, this.city.bounds.maxX);
            p.position.z = THREE.MathUtils.clamp(res.z, this.city.bounds.minZ, this.city.bounds.maxZ);
            p.position.y = this.groundHeightAt(p.position.x, p.position.z);
          } else if (!this.drivenVehicle && p.attackCooldown <= 0) {
            // Swing street punch at player!
            p.attackCooldown = 1.15;
            const dmg = p.archetype === 'tall' ? 12 : 9;
            this.audio.playPunchHit();
            this.spawnBloodBurst(this.playerPos);
            this.damagePlayer(dmg, 'Street Fight');
          }
        }
      } else if (p.combatState === 'flee' || this.elapsed < p.fleeUntil) {
        // Short adults & kids panic and sprint directly away from the player
        animMode = 'flee';
        _v1.set(p.position.x - this.playerPos.x, 0, p.position.z - this.playerPos.z);
        if (_v1.lengthSq() > 0.01) {
          _v1.normalize();
          p.fleeDir.copy(_v1);
        }
        const fleeSpeed = p.archetype === 'kid' ? 5.1 : 4.6;
        const res = this.resolveCircleCollisions(
          p.position.x + p.fleeDir.x * fleeSpeed * dt,
          p.position.z + p.fleeDir.z * fleeSpeed * dt,
          0.38
        );
        p.position.x = THREE.MathUtils.clamp(res.x, this.city.bounds.minX, this.city.bounds.maxX);
        p.position.z = THREE.MathUtils.clamp(res.z, this.city.bounds.minZ, this.city.bounds.maxZ);
        p.position.y = this.groundHeightAt(p.position.x, p.position.z);
        p.yaw = Math.atan2(p.fleeDir.x, p.fleeDir.z);

        if (this.elapsed >= p.fleeUntil && p.position.distanceToSquared(this.playerPos) > 28 * 28) {
          p.combatState = 'ambient';
        }
      } else if (p.isFreeRoamer) {
        const dx = p.roamTarget.x - p.position.x;
        const dz = p.roamTarget.z - p.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.2) {
          p.roamTarget.copy(this.pickFreeRoamPoint(Math.floor(this.elapsed * 13 + p.walkPhase * 10)));
        } else {
          const dirX = dx / dist;
          const dirZ = dz / dist;
          const res = this.resolveCircleCollisions(
            p.position.x + dirX * p.walkSpeed * dt,
            p.position.z + dirZ * p.walkSpeed * dt,
            0.4
          );
          if (Math.hypot(res.x - p.position.x, res.z - p.position.z) < 0.002) {
            p.roamTarget.copy(this.pickFreeRoamPoint(Math.floor(this.elapsed * 19 + 3)));
          } else {
            p.position.x = THREE.MathUtils.clamp(res.x, this.city.bounds.minX, this.city.bounds.maxX);
            p.position.z = THREE.MathUtils.clamp(res.z, this.city.bounds.minZ, this.city.bounds.maxZ);
          }
          p.position.y = this.groundHeightAt(p.position.x, p.position.z);
          p.yaw = dampAngle(p.yaw, Math.atan2(dirX, dirZ), 5, dt);
        }
      } else {
        const loop = this.city.pedestrianLoops[p.loopIndex];
        const loopLen = this.getLoopLength(loop);
        p.loopT = (p.loopT + (p.walkSpeed * dt) / loopLen) % 1;
        this.sampleLoopPoint(loop, p.loopT, _v1, _v2);
        p.position.copy(_v1);
        p.position.y = this.groundHeightAt(p.position.x, p.position.z);
        p.yaw = dampAngle(p.yaw, Math.atan2(_v2.x, _v2.z), 6, dt);
      }

      if (p.civilian) {
        const { mixer, actions, bones } = p.civilian;
        const runOrWalk =
          (animMode === 'flee' || animMode === 'hostile') && actions.run
            ? actions.run
            : actions.walk ?? actions.idle;
        const idleAction = actions.idle;

        if (animMode === 'fallen') {
          if (actions.walk) actions.walk.paused = true;
          if (actions.run) actions.run.paused = true;
          if (idleAction && !idleAction.isRunning()) {
            idleAction.paused = false;
            idleAction.play();
          }
        } else if (runOrWalk) {
          runOrWalk.paused = false;
          if (!runOrWalk.isRunning()) {
            idleAction?.stop();
            if (actions.walk && actions.walk !== runOrWalk) actions.walk.stop();
            if (actions.run && actions.run !== runOrWalk) actions.run.stop();
            runOrWalk.enabled = true;
            runOrWalk.setEffectiveWeight(1);
            runOrWalk.play();
          }
          runOrWalk.timeScale =
            animMode === 'flee'
              ? 1.55
              : animMode === 'hostile'
                ? 1.35
                : THREE.MathUtils.clamp(p.walkSpeed / 1.35, 0.78, 1.35);
        }
        mixer.update(dt);

        // Animate NPC punch swing when hostile fighter attacks
        if (animMode === 'hostile' && p.attackCooldown > 0.75 && bones.rightArm) {
          const swingP = (1.15 - p.attackCooldown) / 0.4;
          p.civilian.wrapper.updateMatrixWorld(true);
          _v1.set(1, 0, 0).transformDirection(p.civilian.wrapper.matrixWorld).normalize();
          bones.rightArm.rotateOnWorldAxis(_v1, -Math.sin(swingP * Math.PI) * 1.65);
        }
      }

      p.group.position.copy(p.position);
      p.group.rotation.y = p.yaw;
    }
  }

  private updateCamera(dt: number): void {
    const v = this.drivenVehicle;
    if (v && (this.cameraView === 'cockpit' || this.cameraView === 'firstperson') && v.kind !== 'motorcycle' && !this.isDead) {
      _v1.copy(v.rig.cockpitEyeLocal);
      _v1.applyAxisAngle(_v3.set(0, 1, 0), v.yaw);
      _v1.add(v.position);
      this.camera.position.copy(_v1);

      const lookYaw = v.yaw + (this.elapsed - this.lastCarLookTime < 2.2 ? this.camYaw - v.yaw : 0);
      _fwd.set(Math.sin(lookYaw), Math.sin(this.camPitch + 0.04) * 0.55, Math.cos(lookYaw)).normalize();
      _camTarget.copy(_v1).addScaledVector(_fwd, 12);
      this.camera.lookAt(_camTarget);

      const targetFov = 68 + THREE.MathUtils.clamp(Math.abs(v.forwardSpeed) * 0.35, 0, 12);
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    if (!v && !this.pendingVehicle && this.cameraView === 'firstperson' && !this.isDead) {
      const cosP = Math.cos(this.camPitch);
      const sinP = Math.sin(this.camPitch);
      _fwd.set(-Math.sin(this.camYaw) * cosP, sinP, -Math.cos(this.camYaw) * cosP).normalize();

      _v1.set(
        this.playerPos.x + _fwd.x * 0.12,
        this.playerPos.y + 1.63,
        this.playerPos.z + _fwd.z * 0.12
      );
      if (this.insideShop) {
        const rb = this.insideShop.roomBounds;
        _v1.x = THREE.MathUtils.clamp(_v1.x, rb.minX + 0.32, rb.maxX - 0.32);
        _v1.z = THREE.MathUtils.clamp(_v1.z, rb.minZ + 0.32, rb.maxZ - 0.32);
      }
      this.camera.position.copy(_v1);
      _camTarget.copy(_v1).addScaledVector(_fwd, 20);
      this.camera.lookAt(_camTarget);

      const wantAds = this.isAimingRightClick && this.equippedWeapon !== 'unarmed' ? 1 : 0;
      this.adsBlend = THREE.MathUtils.damp(this.adsBlend, wantAds, 14, dt);
      const targetFov = THREE.MathUtils.lerp(66, 50, this.adsBlend);
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    if (v && Math.abs(v.forwardSpeed) > 1.8 && this.elapsed - this.lastCarLookTime > 2.0 && !this.isDead) {
      const targetFollowYaw = v.forwardSpeed >= 0 ? v.yaw + Math.PI : v.yaw;
      this.camYaw = dampAngle(this.camYaw, targetFollowYaw, 2.6, dt);
    }

    const focus = v ? v.position : this.playerPos;
    const armDist = this.isDead
      ? 5.2
      : v
        ? v.kind === 'truck'
          ? 8.2
          : v.kind === 'motorcycle'
            ? 4.4
            : 6.0
        : this.insideShop
          ? 3.1
          : 4.2;
    const targetHeight = this.isDead ? 0.65 : v ? (v.kind === 'truck' ? 2.1 : 1.25) : 1.55;

    _camTarget.set(focus.x, focus.y + targetHeight, focus.z);

    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);
    _camDesired.set(
      _camTarget.x + Math.sin(this.camYaw) * cosP * armDist,
      Math.max(focus.y + 0.55, _camTarget.y - sinP * armDist),
      _camTarget.z + Math.cos(this.camYaw) * cosP * armDist
    );

    if (this.insideShop) {
      const rb = this.insideShop.roomBounds;
      _camDesired.x = THREE.MathUtils.clamp(_camDesired.x, rb.minX + 0.55, rb.maxX - 0.55);
      _camDesired.z = THREE.MathUtils.clamp(_camDesired.z, rb.minZ + 0.55, rb.maxZ - 0.55);
      _camDesired.y = THREE.MathUtils.clamp(_camDesired.y, 1.15, 3.65);
    }

    this.camera.position.lerp(_camDesired, 1 - Math.exp(-14 * dt));
    this.camera.lookAt(_camTarget);

    const speed = v ? Math.abs(v.forwardSpeed) : 0;
    const adsZoom = !v && this.isAimingRightClick && this.equippedWeapon !== 'unarmed' ? -10 : 0;
    const targetFov = 60 + THREE.MathUtils.clamp(speed * 0.38, 0, 14) + adsZoom;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 8, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private renderScene(): void {
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = Math.max(1, this.renderer.domElement.clientHeight || window.innerHeight);

    // Toggle active shop room interior visibility
    for (const r of this.city.shopRooms) {
      r.group.visible = this.insideShop?.info.kind === r.kind;
    }

    // GTA-style Frustum Culling + 3-tier THREE.LOD (0..60 full, 60..160 med no shadow, 160..260 flat box, >260 or out of frustum hidden)
    this.camera.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);
    const camPos = this.camera.position;

    for (let i = 0; i < this.city.lodObjects.length; i++) {
      const entry = this.city.lodObjects[i];
      if (this.insideShop) {
        entry.lod.visible = false;
        continue;
      }
      const dx = entry.center.x - camPos.x;
      const dy = entry.center.y - camPos.y;
      const dz = entry.center.z - camPos.z;
      if (dx * dx + dy * dy + dz * dz > LOD_MAX_CULL_DIST_SQ) {
        entry.lod.visible = false;
        continue;
      }
      _cullSphere.set(entry.center, entry.radius);
      if (!_frustum.intersectsSphere(_cullSphere)) {
        entry.lod.visible = false;
        continue;
      }
      entry.lod.visible = true;
      entry.lod.update(this.camera);
    }

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);

    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    const v = this.drivenVehicle;
    if (v && this.cameraView === 'cockpit' && v.kind !== 'motorcycle' && !this.isDead) {
      this.mirrorFrameCount++;
      if (this.isSoftwareGl && this.mirrorFrameCount % 3 !== 0) return;

      const mw = Math.min(280, Math.floor(w * 0.24));
      const mh = Math.floor(mw * 0.28);
      const mx = Math.floor((w - mw) * 0.5);
      const my = h - mh - 20;

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
    if (this.insideShop) return 0;
    const dz = z + 16.5;
    if (x * x + dz * dz <= 3.55 * 3.55) {
      return 0.32;
    }
    for (const s of this.city.sidewalks) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
        return s.height;
      }
    }
    return 0;
  }

  private isPointInsideCollider(x: number, z: number, radius: number): boolean {
    const colliders = this.insideShop ? this.insideShop.roomColliders : this.city.colliders;
    for (const c of colliders) {
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
    const colliders = this.insideShop ? this.insideShop.roomColliders : this.city.colliders;
    for (const c of colliders) {
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
    const p = this.drivenVehicle ? this.drivenVehicle.position : this.playerPos;
    if (p.z < -51) return 'Marina Pier';
    if (p.z < -34) return 'Waterfront Promenade';
    if (p.z < -20) return 'Oceanfront Boulevard';
    if (p.z >= 198) return 'Industrial District';
    if (p.x < -110) return 'West Suburbs';
    if (p.x > 110) return 'East Suburbs';
    if (p.z < 6) return 'Central Plaza';
    if (p.z < 98) return 'Downtown Skyscrapers';
    return 'Crosstown Expressway';
  }

  private setEvent(text: string): void {
    this.lastEventText = text;
    this.lastEventTime = this.elapsed;
  }

  private emitHud(): void {
    const v = this.drivenVehicle;
    const nearby = v || this.insideShop ? null : this.findNearestVehicle(4.4);
    const speedKmh = v
      ? Math.round(Math.abs(v.forwardSpeed) * 3.6)
      : Math.round(Math.hypot(this.playerVel.x, this.playerVel.z) * 3.6);

    const gearLabel = !v
      ? 'FOOT'
      : v.forwardSpeed < -0.5
        ? 'R'
        : Math.abs(v.forwardSpeed) < 0.4
          ? 'N'
          : String(Math.min(5, Math.max(1, Math.ceil(speedKmh / 24))));

    const eventFresh = this.elapsed - this.lastEventTime < 4.5 ? this.lastEventText : '';
    const nearbyExteriorShop = this.insideShop ? null : this.findNearbyExteriorShop();
    const breakShop = this.insideShop ?? nearbyExteriorShop;

    const mapPos = this.insideShop
      ? this.insideShop.outsideReturn
      : v
        ? v.position
        : this.playerPos;

    const radarEntities: MinimapRadarEntity[] = [];
    for (const veh of this.vehicles) {
      if (veh.isPolice && !veh.isWreck) {
        radarEntities.push({ x: veh.position.x, z: veh.position.z, kind: 'police' });
      }
    }
    for (const off of this.officers) {
      if (!off.dead) {
        radarEntities.push({ x: off.position.x, z: off.position.z, kind: 'officer' });
      }
    }

    const gpsDistMeters = this.gpsPin
      ? Math.round(Math.hypot(this.gpsPin.x - mapPos.x, this.gpsPin.z - mapPos.z))
      : 0;

    const nearShopExit = Boolean(
      this.insideShop &&
        Math.hypot(
          this.playerPos.x - this.insideShop.exitDoor.x,
          this.playerPos.z - this.insideShop.exitDoor.z
        ) < 3.2
    );

    this.onHudUpdate({
      mode: !v ? 'foot' : v.kind === 'motorcycle' ? 'motorcycle' : 'car',
      vehicleKind: v ? v.kind : null,
      vehicleLabel: v ? v.label : 'On Foot',
      speedKmh,
      speedLimitKmh: CITY_SPEED_LIMIT_KMH,
      isSpeeding: Boolean(v && speedKmh > SPEEDING_THRESHOLD_KMH),
      gearLabel,
      rpmRatio: v ? THREE.MathUtils.clamp(((speedKmh % 28) / 28) * 0.75 + 0.2, 0.15, 0.96) : 0,
      cameraView: this.cameraView,
      canEnterVehicle: Boolean(!v && !this.insideShop && nearby && !this.isDead),
      nearbyVehicleLabel: nearby ? nearby.label : '',
      canPunch: !v && !this.pendingVehicle && !this.isDead,
      isEntering: Boolean(this.pendingVehicle),
      pointerLocked: this.pointerLocked,
      paused: this.paused,
      knockdowns: this.knockdowns,
      wantedLevel: this.wantedLevel,
      wantedReason: this.wantedReason,
      evasionRatio: this.wantedLevel > 0 ? THREE.MathUtils.clamp(this.evadeTimer / 10.0, 0, 1) : 0,
      bustedNotice: this.bustedBannerTimer > 0,
      timeOfDay: this.settings.timeOfDay,
      districtZone: this.insideShop ? this.insideShop.info.name : this.getZoneLabel(),
      lastEventText: eventFresh,
      health: Math.round(this.playerHealth),
      maxHealth: this.maxPlayerHealth,
      isDead: this.isDead,
      damageFlash: THREE.MathUtils.clamp(this.damageFlashTimer / 0.32, 0, 1),
      cash: this.playerCash,
      equippedWeapon: this.equippedWeapon,
      ownedWeapons: Array.from(this.ownedWeapons),
      ammo: { ...this.ammo },
      activeShop: this.insideShop ? this.insideShop.info.kind : this.activeMenuShopKind,
      activeShopName: this.insideShop
        ? this.insideShop.info.name
        : this.city.shopPois.find((s) => s.info.kind === this.activeMenuShopKind)?.info.name ?? '',
      shopMenuOpen: this.shopMenuOpen,
      nearShopName: nearbyExteriorShop ? nearbyExteriorShop.info.name : '',
      nearShopExit,
      canBreakInStore: Boolean(breakShop && !v && !this.isDead),
      breakInTargetName: breakShop ? breakShop.info.name : '',
      mapOpen: this.mapOpen,
      playerX: mapPos.x,
      playerZ: mapPos.z,
      playerYaw: v ? v.yaw : this.playerYaw,
      pois: this.city.shopPois.map((s) => s.info),
      radarEntities,
      gpsPin: this.gpsPin,
      gpsPath: this.gpsPath,
      gpsDistMeters,
      cityBounds: this.city.bounds,
      ewRoads: this.city.ewRoads,
      nsRoads: this.city.nsRoads,
    });
  }

  private disposeObjectMeshes(root: THREE.Object3D): void {
    root.traverse((obj) => {
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
    window.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);

    for (const p of this.pedestrians) {
      if (p.civilian) {
        p.civilian.mixer.stopAllAction();
        p.civilian.mixer.uncacheRoot(p.civilian.modelScene);
      }
    }
    this.clearOfficers();
    this.clearSecurityGuards();
    this.city.disposeLandmark?.();
    this.playerCharacter.dispose();
    this.audio.dispose();
    this.bloodDecalTex?.dispose();
    this.composer?.dispose();
    this.disposeObjectMeshes(this.scene);
    this.sunsetEnvTexture?.dispose();
    this.roomEnvTexture?.dispose();
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
