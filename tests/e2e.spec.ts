import { test, expect } from '@playwright/test';

test.describe('Not The Ocarina Playing Simulator — Arcade Overhaul E2E', () => {
  test('Desktop: Splash, Mode Select, Composer, Arcade Roller/In-Game/Zoom/Results, Zero Scroll', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        // Ignore offline Google Fonts DNS failure in sandboxed test environment
        if (!txt.includes('ERR_NAME_NOT_RESOLVED')) {
          errors.push(txt);
        }
      }
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./', { waitUntil: 'networkidle' });

    // 1. Splash Screen ("CLICK OR PRESS ENTER") + Anti-copyright disclaimer
    await expect(page.locator('.splash-prompt')).toHaveText('CLICK OR PRESS ENTER');
    await expect(page.locator('.splash-disclaimer')).toContainText('unaffiliated with Nintendo');
    await page.keyboard.press('Enter');

    // 2. Mode Selector Screen (no old subtitle, 100dvh no scroll)
    await expect(page.locator('.game-main-title')).toHaveText('NOT THE OCARINA PLAYING SIMULATOR');
    await expect(page.locator('.game-main-subtitle')).toHaveCount(0);
    await expect(page.locator('#btn-fullscreen')).toBeVisible();
    await expect(page.locator('#btn-install-pwa')).toBeVisible();

    const overflowMenu = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > window.innerWidth,
      y: document.documentElement.scrollHeight > window.innerHeight,
    }));
    expect(overflowMenu).toEqual({ x: false, y: false });

    // 3. Enter Mode 1 (Composer Screen - Minimalist 50/50 + Floating Side Docks)
    await page.click('#launch-mode-composer');
    await expect(page.locator('.ocarina-3d-canvas')).toBeVisible();
    await expect(page.locator('#btn-skin-gallery')).toHaveCount(0);
    await expect(page.locator('#composer-dock-left')).toBeVisible();
    await expect(page.locator('#composer-dock-right')).toBeVisible();

    const overflowComposer = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > window.innerWidth,
      y: document.documentElement.scrollHeight > window.innerHeight,
    }));
    expect(overflowComposer).toEqual({ x: false, y: false });

    // Snap defaults to Free ("0") and Pitch-Bend buttons appear on Ocarina
    await expect(page.locator('#comp-snap')).toHaveValue('0');
    await expect(page.locator('[data-pitch="up"]')).toBeVisible();
    await expect(page.locator('[data-pitch="down"]')).toBeVisible();

    // Load Never Gonna Give You Up (Chorus) with pitch-bending
    await page.selectOption('#comp-sample-select', 'sample:never-gonna-give-you-up');
    await expect(page.locator('#comp-track-title')).toHaveValue('Never Gonna Give You Up (Chorus)');
    const sampleNotesCount = await page.locator('.partiture-note').count();
    expect(sampleNotesCount).toBeGreaterThan(20);
    await expect(page.locator('.partiture-note.is-bend-up').first()).toBeVisible();

    // Pitch-bend Up + Polyphonic Input
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('KeyJ');
    await page.waitForTimeout(200);
    await page.keyboard.up('KeyJ');
    await page.keyboard.up('ArrowUp');
    await expect(page.locator('.partiture-note')).toHaveCount(sampleNotesCount + 1);

    // Ctrl+Click multi-select & Delete (Supr) keybinding
    const notes = page.locator('.partiture-note');
    await notes.nth(0).click();
    await notes.nth(1).click({ modifiers: ['Control'] });
    await expect(page.locator('.partiture-note.is-selected')).toHaveCount(2);
    await page.keyboard.press('Delete');
    await expect(page.locator('.partiture-note')).toHaveCount(sampleNotesCount - 1);

    // Clear keybinding (KeyC) opens confirmation dialog when track is not empty
    await page.keyboard.press('KeyC');
    await expect(page.locator('#composer-clear-dialog')).toBeVisible();
    await page.click('#clear-dialog-cancel');

    // 4. Return to Mode Select & Enter Mode 2 (Arcade)
    await page.click('#btn-back-title');
    await page.click('#launch-mode-arcade');

    // Verify Music Roller, Category Bar, Difficulty SVG Icons, and Stats Panel
    await expect(page.locator('.music-roller-col')).toBeVisible();
    await expect(page.locator('.song-stats-panel')).toBeVisible();
    await expect(page.locator('.diff-svg-icon')).toHaveCount(2);

    // ArrowDown changes song in roller; ArrowRight switches difficulty
    const initialSong = await page.locator('.stats-song-name').textContent();
    await page.keyboard.press('ArrowDown');
    const nextSong = await page.locator('.stats-song-name').textContent();
    expect(nextSong).not.toBe(initialSong);

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#btn-assist-original')).toHaveClass(/is-selected/);

    // Import a quick 1-note partiture so we can test Countdown -> Zoom -> Results end-to-end
    await page.setInputFiles('#arcade-import-txt', {
      name: 'quick-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('TITLE: Quick Test Tune\nBPM: 220\n0.00 | A | 0.25 | D5\n'),
    });
    await expect(page.locator('.stats-song-name')).toHaveText('Quick Test Tune');

    // Start Arcade Stage -> Countdown -> 50/50 split -> Ocarina Zoom-in
    await page.click('#btn-arcade-start');
    await expect(page.locator('#arcade-countdown-overlay')).toHaveClass(/is-active/);
    await expect(page.locator('.ingame-life-wrap')).toBeVisible();
    await expect(page.locator('#arcade-highway-canvas')).toBeVisible();
    await expect(page.locator('.ocarina-3d-canvas')).toBeVisible();

    // Wait for 3s countdown to finish and verify Ocarina zooms in
    await page.waitForTimeout(3200);
    await expect(page.locator('.ocarina-svg-wrapper')).toHaveClass(/is-zoomed/);

    // Pause via ESC and resume via button
    await expect(page.locator('#btn-arcade-pause')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#arcade-pause-overlay')).toHaveClass(/is-active/);
    await page.click('#btn-pause-resume');
    await expect(page.locator('#arcade-pause-overlay')).not.toHaveClass(/is-active/);

    // Hit the note & wait for the short stage to reach Results Screen
    await page.keyboard.press('KeyJ');
    await expect(page.locator('.results-song-title-right')).toHaveText('Quick Test Tune', { timeout: 6000 });
    await expect(page.locator('.results-center-card')).toContainText('GOOD');
    await expect(page.locator('.results-center-card')).toContainText('OKAY');
    await expect(page.locator('.results-center-card')).toContainText('BAD');
    await expect(page.locator('.results-center-card')).toContainText('MAX COMBO');

    // Return to Song Select
    await page.click('#btn-arcade-back');
    await expect(page.locator('.music-roller-col')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Mobile Touch: 100dvh zero scroll, key badges hidden', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto('./', { waitUntil: 'networkidle' });

    await page.click('#splash-enter-btn');
    await expect(page.locator('.game-main-title')).toBeVisible();
    await page.click('#launch-mode-arcade');
    await expect(page.locator('.music-roller-col')).toBeVisible();

    const selectOverflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > window.innerWidth,
      y: document.documentElement.scrollHeight > window.innerHeight,
    }));
    expect(selectOverflow).toEqual({ x: false, y: false });

    await page.click('#btn-arcade-start');
    await expect(page.locator('.ocarina-3d-canvas')).toBeVisible();
    await expect(page.locator('.hole-key-badge')).toHaveCount(0);
    await expect(page.locator('.blow-kbd')).toHaveCount(0);

    const ingameOverflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > window.innerWidth,
      y: document.documentElement.scrollHeight > window.innerHeight,
    }));
    expect(ingameOverflow).toEqual({ x: false, y: false });

    await context.close();
  });
});
