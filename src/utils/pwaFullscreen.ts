interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function initPwaInstall(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/not-the-ocarina-playing-simulator/sw.js')
      .catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
}

export function onInstallAvailabilityChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isStandaloneMode(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function triggerPwaInstall(onFallbackMessage: (msg: string) => void): Promise<void> {
  if (deferredPrompt) {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      onFallbackMessage('Installing Not The Ocarina Playing Simulator!');
    }
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
    return;
  }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIos) {
    onFallbackMessage('On iOS: tap Share (⎋) → "Add to Home Screen" to install!');
  } else if (isStandaloneMode()) {
    onFallbackMessage('Already running as an installed app!');
  } else {
    onFallbackMessage('Use your browser menu (⋮) → "Install app" / "Add to Home screen"!');
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return true;
    } else {
      await document.exitFullscreen();
      return false;
    }
  } catch {
    return Boolean(document.fullscreenElement);
  }
}
