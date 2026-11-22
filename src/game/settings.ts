import { ParadiseHeatSettings } from './types';

const STORAGE_KEY = 'paradise_heat_user_settings_v1';

export const DEFAULT_SETTINGS: ParadiseHeatSettings = {
  invertPointerY: true, // Matches ParadiseHeatUserSettings.h bInvertPointerY = true
  pointerSensitivity: 1.0,
  quality: 'detailed',
  fpsLimit: 0,
  timeOfDay: 'day', // Matches CityDistrict10x_Day default startup map
  masterVolume: 0.85,
  musicVolume: 0.65,
  engineVolume: 0.85,
  reactionVolume: 0.9,
  customSongName: '',
};

export function loadSettings(): ParadiseHeatSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ParadiseHeatSettings>;
    return {
      invertPointerY:
        typeof parsed.invertPointerY === 'boolean'
          ? parsed.invertPointerY
          : DEFAULT_SETTINGS.invertPointerY,
      pointerSensitivity:
        typeof parsed.pointerSensitivity === 'number'
          ? Math.min(2, Math.max(0.25, parsed.pointerSensitivity))
          : DEFAULT_SETTINGS.pointerSensitivity,
      quality: parsed.quality === 'balanced' ? 'balanced' : 'detailed',
      fpsLimit:
        parsed.fpsLimit === 30 || parsed.fpsLimit === 60 || parsed.fpsLimit === 120
          ? parsed.fpsLimit
          : 0,
      timeOfDay:
        parsed.timeOfDay === 'sunset' || parsed.timeOfDay === 'night'
          ? parsed.timeOfDay
          : 'day',
      masterVolume: clamp01(parsed.masterVolume, DEFAULT_SETTINGS.masterVolume),
      musicVolume: clamp01(parsed.musicVolume, DEFAULT_SETTINGS.musicVolume),
      engineVolume: clamp01(parsed.engineVolume, DEFAULT_SETTINGS.engineVolume),
      reactionVolume: clamp01(parsed.reactionVolume, DEFAULT_SETTINGS.reactionVolume),
      customSongName: '', // Object URLs are session-scoped
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ParadiseHeatSettings): void {
  try {
    const toStore = { ...settings, customSongName: '' };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Ignore storage quota errors
  }
}

function clamp01(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return fallback;
  return Math.min(1, Math.max(0, val));
}
