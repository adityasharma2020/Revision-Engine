export type PwaInstallState = 'available' | 'installed' | 'unavailable';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let promptEvent: InstallPromptEvent | null = null;
let installed = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  promptEvent = event as InstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => { installed = true; promptEvent = null; notify(); });

export function getPwaInstallState(): PwaInstallState {
  if (installed) return 'installed';
  return promptEvent ? 'available' : 'unavailable';
}

export function subscribeToPwaInstall(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }

export async function requestPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!promptEvent) return 'unavailable';
  const current = promptEvent;
  await current.prompt();
  const choice = await current.userChoice;
  if (choice.outcome === 'accepted') { installed = true; promptEvent = null; notify(); }
  return choice.outcome;
}
