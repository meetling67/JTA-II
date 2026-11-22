import { useCallback, useEffect, useRef, useState } from 'react';
import { ParadiseHeatEngine } from './game/ParadiseHeatEngine';
import { loadSettings, saveSettings } from './game/settings';
import { HudSnapshot, ParadiseHeatSettings, TimeOfDay } from './game/types';
import { GameHud } from './components/GameHud';
import { PauseMenu } from './components/PauseMenu';

const INITIAL_HUD: HudSnapshot = {
  mode: 'foot',
  vehicleKind: null,
  vehicleLabel: 'On Foot · Nathan',
  speedKmh: 0,
  gearLabel: 'FOOT',
  rpmRatio: 0,
  cameraView: 'chase',
  canEnterVehicle: false,
  nearbyVehicleLabel: '',
  canPunch: true,
  isEntering: false,
  pointerLocked: false,
  paused: false,
  knockdowns: 0,
  timeOfDay: 'day',
  districtZone: 'Central Plaza',
  lastEventText: 'Explore the city · E to enter vehicles · F to punch',
};

export function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ParadiseHeatEngine | null>(null);

  const [settings, setSettings] = useState<ParadiseHeatSettings>(() => loadSettings());
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [paused, setPaused] = useState(false);
  const [musicStatus, setMusicStatus] = useState('Built-in soundtrack');

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const togglePause = useCallback(() => {
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
      () => togglePause()
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [togglePause]);

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
      {/* Isolated WebGL viewport mount container */}
      <div ref={mountRef} className="h-full w-full" />

      {/* Non-occluding HUD overlay */}
      <GameHud
        hud={{ ...hud, paused }}
        onPause={() => {
          setPaused(true);
          engineRef.current?.setPaused(true);
        }}
        onToggleCamera={() => engineRef.current?.toggleCameraView()}
        onInteractVehicle={() => engineRef.current?.interactVehicle()}
        onPunch={() => engineRef.current?.triggerPunch()}
        onTimeOfDayChange={handleTimeOfDayChange}
        onTouchMove={(x, y) => engineRef.current?.setTouchMove(x, y)}
      />

      {/* Pause / Settings Menu (Esc) */}
      <PauseMenu
        open={paused}
        settings={settings}
        musicStatus={musicStatus}
        onUpdateSettings={handleUpdateSettings}
        onLoadCustomSong={handleLoadCustomSong}
        onRestoreDefaultMusic={handleRestoreDefaultMusic}
        onResume={handleResume}
        onResetCity={handleResetCity}
      />
    </div>
  );
}

export default App;
