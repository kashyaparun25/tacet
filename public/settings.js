const SETTINGS_KEY = "tacet.settings.v1";

export function defaultSettings() {
  return {
    deepgramApiKey: "",
    defaultMode: "online",
    onboardingCompletedAt: null
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return defaultSettings();
    }
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(patch) {
  const current = loadSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function clearSettings() {
  localStorage.removeItem(SETTINGS_KEY);
}

export function hasOnboarded() {
  return Boolean(loadSettings().onboardingCompletedAt);
}

export function markOnboarded() {
  saveSettings({ onboardingCompletedAt: Date.now() });
}
