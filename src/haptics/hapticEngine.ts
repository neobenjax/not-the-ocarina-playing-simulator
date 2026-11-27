import { WebHaptics } from 'web-haptics';

class HapticEngine {
  private instance: WebHaptics | null = null;
  private enabled = true;

  private getClient(): WebHaptics | null {
    if (typeof window === 'undefined') return null;
    if (!this.instance) {
      try {
        this.instance = new WebHaptics();
      } catch {
        return null;
      }
    }
    return this.instance;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private fire(input: Parameters<WebHaptics['trigger']>[0], intensity = 0.6): void {
    if (!this.enabled) return;
    const client = this.getClient();
    if (!client) return;
    try {
      void client.trigger(input, { intensity });
    } catch {
      // No-op on unsupported environments
    }
  }

  tapButton(): void {
    this.fire('light', 0.45);
  }

  pressHole(): void {
    this.fire('medium', 0.65);
  }

  blowAir(): void {
    this.fire([{ duration: 35 }], 0.5);
  }

  hitPerfect(): void {
    this.fire('success', 0.85);
  }

  hitGreat(): void {
    this.fire('medium', 0.65);
  }

  hitGood(): void {
    this.fire('light', 0.45);
  }

  miss(): void {
    this.fire('error', 0.9);
  }

  melodyDiscovered(): void {
    this.fire([
      { duration: 40 },
      { delay: 60, duration: 40 },
      { delay: 60, duration: 90 },
    ], 0.9);
  }

  scoreTally(): void {
    this.fire('selection', 0.4);
  }

  victory(): void {
    this.fire('success', 1.0);
  }

  gameOver(): void {
    this.fire('buzz', 1.0);
  }
}

export const haptics = new HapticEngine();
