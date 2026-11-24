import { useCallback, useEffect, useRef, useState } from 'react';
import { ParadiseHeatEngine } from './game/ParadiseHeatEngine';
import { loadSettings, saveSettings } from './game/settings';
import { HudSnapshot, ParadiseHeatSettings, TimeOfDay } from './game/types';
import { GameHud } from './components/GameHud';
import { PauseMenu } from './components/PauseMenu';
import { LoadingScreen } from './components/LoadingScreen';

const INITIAL_HUD: HudSnapshot = {
  mode: 'foot',
  vehicleKind: null,
  vehicleLabel: 'On Foot',
  speedKmh: 0,
  speedLimitKmh: 50,
  isSpeeding: false,
  gearLabel: 'FOOT',
  rpmRatio: 0,
  cameraView: 'chase',
  canEnterVehicle: false,
  nearbyVehicleLabel: '',
  canPunch: true,
  isEntering: false,
  pointerLocked: false,
  paused: true,
  knockdowns: 0,
  wantedLevel: 0,
  wantedReason: '',
  evasionRatio: 0,
  bustedNotice: false,
  timeOfDay: 'sunset',
  districtZone: 'Central Plaza',
  lastEventText: 'Visit Shops · Get Guns at Ammu-Nation · Press M for Map & GPS',
  health: 100,
  maxHealth: 100,
  isDead: false,
  damageFlash: 0,
  cash: 1200,
  equippedWeapon: 'unarmed',
  ownedWeapons: ['unarmed', 'pistol'],
  ammo: { unarmed: 0, pistol: 60, smg: 0, rifle: 0 },
  activeShop: null,
  activeShopName: '',
  shopMenuOpen: false,
  nearShopName: '',
  nearShopExit: false,
  canBreakInStore: false,
  breakInTargetName: '',
  mapOpen: false,
  playerX: 0,
  playerZ: -12,
  playerYaw: Math.PI,
  pois: [],
  radarEntities: [],
  gpsPin: null,
  gpsPath: [],
  gpsDistMeters: 0,
  cityBounds: { minX: -256, maxX: 256, minZ: -68, maxZ: 300 },
  ewRoads: [-28, 12, 54, 98, 146, 198, 250],
  nsRoads: [-216, -168, -120, -72, -24, 24, 72, 120, 168, 216],
};

export function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ParadiseHeatEngine | null>(null);

  const [settings, setSettings] = useState<ParadiseHeatSettings>(() => loadSettings());
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [musicStatus, setMusicStatus] = useState('Built-in soundtrack');

  const loadingVisibleRef = useRef(loadingVisible);
  loadingVisibleRef.current = loadingVisible;

  const togglePause = useCallback(() => {
    if (loadingVisibleRef.current) return;
    setPaused((prev) => {
      const next = !prev;
      engineRef.current?.setPaused(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new ParadiseHeatEngine(
      container,
      loadSettings(),
      (snapshot) => setHud(snapshot),
      () => togglePause(),
      true // Start paused while the GTA Loading Screen is displayed
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [togglePause]);

  const handleEnterCity = useCallback(() => {
    setLoadingVisible(false);
    setPaused(false);
    engineRef.current?.getAudio().unlock();
    engineRef.current?.setPaused(false);
  }, []);

  const handleShowLoading = useCallback(() => {
    setPaused(false);
    setLoadingVisible(true);
    engineRef.current?.setPaused(true);
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<ParadiseHeatSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      engineRef.current?.applySettings(next);
      return next;
    });
  }, []);

  const handleTimeOfDayChange = useCallback(
    (timeOfDay: TimeOfDay) => {
      handleUpdateSettings({ timeOfDay });
    },
    [handleUpdateSettings]
  );

  const handleLoadCustomSong = useCallback((file: File) => {
    if (!engineRef.current) return;
    const status = engineRef.current.getAudio().loadCustomSong(file);
    setMusicStatus(status);
  }, []);

  const handleRestoreDefaultMusic = useCallback(() => {
    if (!engineRef.current) return;
    const status = engineRef.current.getAudio().useDefaultMusic();
    setMusicStatus(status);
  }, []);

  const handleResume = useCallback(() => {
    setPaused(false);
    engineRef.current?.setPaused(false);
  }, []);

  const handleResetCity = useCallback(() => {
    engineRef.current?.resetCity();
    setPaused(false);
    engineRef.current?.setPaused(false);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      {/* Isolated WebGL viewport mount container (greyscale slow-motion freeze on death) */}
      <div
        ref={mountRef}
        className={`h-full w-full transition-[filter] duration-1000 ${
          hud.isDead ? 'grayscale contrast-125 brightness-75' : ''
        }`}
      />

      {/* Non-occluding HUD overlay */}
      <GameHud
        hud={{ ...hud, paused: paused || loadingVisible }}
        onPause={() => {
          setPaused(true);
          engineRef.current?.setPaused(true);
        }}
        onToggleCamera={() => engineRef.current?.toggleCameraView()}
        onInteractVehicle={() => engineRef.current?.interactVehicle()}
        onInteractKey={() => engineRef.current?.handleInteractKey()}
        onExitShop={() => engineRef.current?.exitShop()}
        onBreakIn={() => engineRef.current?.triggerStoreBreakIn()}
        onPunch={() => engineRef.current?.triggerPunch()}
        onFireWeapon={() => engineRef.current?.firePlayerWeapon()}
        onCycleWeapon={() => engineRef.current?.cycleWeapon()}
        onEquipWeapon={(kind) => engineRef.current?.equipWeapon(kind)}
        onTimeOfDayChange={handleTimeOfDayChange}
        onTouchMove={(x, y) => engineRef.current?.setTouchMove(x, y)}
        onRespawn={() => engineRef.current?.respawnPlayer()}
        onToggleMap={() => engineRef.current?.toggleMapModal()}
        onSetGps={(x, z, label) => engineRef.current?.setGpsWaypoint(x, z, label)}
        onClearGps={() => engineRef.current?.clearGpsWaypoint()}
        onCloseShopMenu={() => engineRef.current?.closeShopMenu()}
        onBuyOrCollectWeapon={(kind, cost) => engineRef.current?.buyOrCollectWeapon(kind, cost)}
        onBuyAmmo={(kind, amount, cost) => engineRef.current?.buyAmmo(kind, amount, cost)}
        onBuySnack={(heal, cost, label) => engineRef.current?.buySnack(heal, cost, label)}
        onApplyOutfit={(shirt, shorts, hair) => engineRef.current?.applyPlayerOutfit(shirt, shorts, hair)}
        onRepairVehicle={() => engineRef.current?.repairCurrentVehicle()}
        onRepaintVehicle={(hex) => engineRef.current?.repaintCurrentVehicle(hex)}
        onTuneVehicle={() => engineRef.current?.tuneCurrentVehicle()}
        onRobStore={() => engineRef.current?.robFromShopMenu()}
      />

      {/* Pause / Settings Menu (Esc) */}
      <PauseMenu
        open={paused && !loadingVisible}
        settings={settings}
        musicStatus={musicStatus}
        onUpdateSettings={handleUpdateSettings}
        onLoadCustomSong={handleLoadCustomSong}
        onRestoreDefaultMusic={handleRestoreDefaultMusic}
        onResume={handleResume}
        onResetCity={handleResetCity}
        onShowLoading={handleShowLoading}
      />

      {/* GTA-style JTA Presented by Balloon Games Loading Screen */}
      <LoadingScreen visible={loadingVisible} onEnterCity={handleEnterCity} />
    </div>
  );
}

export default App;
