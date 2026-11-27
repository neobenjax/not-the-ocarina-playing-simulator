import { test, expect } from '@playwright/test';

test.describe('Not The Ocarina Playing Simulator — Stage 2 E2E', () => {
  test('Desktop: Title Screen, Mode 1 Sample Dropdown & Ocarina-First Input, Mode 2 Taiko Stage, PWA', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./', { waitUntil: 'networkidle' });

    // 1. Title Screen & PWA Manifest check
    await expect(page.locator('.game-main-title')).toHaveText('NOT THE OCARINA PLAYING SIMULATOR');
    await expect(page.locator('#btn-fullscreen')).toBeVisible();
    await expect(page.locator('#btn-install-pwa')).toBeVisible();
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toContain('manifest.webmanifest');

    // 2. Enter Mode 1 (Composer Screen)
    await page.click('#launch-mode-composer');
    await expect(page.locator('.ocarina-svg')).toBeVisible();
    await expect(page.locator('.hole-key-badge').first()).toBeVisible();

    // Load a Zelda sample from dropdown
    await page.selectOption('#comp-sample-select', 'zelda:song-of-storms');
    await expect(page.locator('#comp-track-title')).toHaveValue('Song of Storms');
    const sampleNotesCount = await page.locator('.partiture-note').count();
    expect(sampleNotesCount).toBeGreaterThan(5);

    // Ocarina-first input: pressing Ocarina keys adds notes directly to the partiture!
    await page.keyboard.down('KeyJ');
    await expect(page.locator('#ocarina-live-note')).toContainText('D5');
    await page.keyboard.up('KeyJ');
    await expect(page.locator('.partiture-note')).toHaveCount(sampleNotesCount + 1);

    // Play & Stop
    await page.click('#btn-comp-play');
    await page.waitForTimeout(250);
    await page.click('#btn-comp-stop');

    // Skin Gallery & Custom SVG
    await page.click('#btn-skin-gallery');
    await expect(page.locator('#skin-gallery-dialog')).toBeVisible();
    await page.click('[data-select-skin="majoras-mask"]');
    await expect(page.locator('#ocarina-skin-pill')).toHaveText("Majora's Mask");
    await page.click('#skin-done-btn');

    // Export .txt & .mp3
    const txtDownloadPromise = page.waitForEvent('download');
    await page.click('#btn-export-txt');
    const txtDownload = await txtDownloadPromise;
    expect(txtDownload.suggestedFilename()).toContain('.ocarina.txt');

    const mp3DownloadPromise = page.waitForEvent('download');
    await page.click('#btn-export-mp3');
    const mp3Download = await mp3DownloadPromise;
    expect(mp3Download.suggestedFilename()).toContain('.mp3');

    // 3. Return to Title & Enter Mode 2 (Arcade)
    await page.click('#btn-back-title');
    await expect(page.locator('.game-main-title')).toBeVisible();
    await page.click('#launch-mode-arcade');

    // Verify all 9 Zelda songs in dropdown & grid
    await expect(page.locator('#arcade-song-dropdown option')).toHaveCount(10); // 9 Zelda + 1 default playlist track
    await page.selectOption('#arcade-song-dropdown', 'sarias-song');
    await page.click('#btn-assist-original');
    await page.click('#btn-offset-plus');
    await expect(page.locator('#arcade-offset-val')).toHaveText('+10ms');

    // Start Taiko-style Arcade Stage
    await page.click('#btn-arcade-start');
    await expect(page.locator('.taiko-soul-gauge')).toBeVisible();
    await expect(page.locator('#arcade-highway-canvas')).toBeVisible();
    await expect(page.locator('.taiko-festival-stage')).toBeVisible();
    await expect(page.locator('.ocarina-svg')).toBeVisible();

    await page.click('#btn-arcade-quit');
    await expect(page.locator('.arcade-song-grid')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Mobile Touch: Dedicated screens, zero horizontal overflow, key badges hidden', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto('./', { waitUntil: 'networkidle' });

    await expect(page.locator('.game-main-title')).toBeVisible();
    await page.click('#launch-mode-arcade');
    await expect(page.locator('.ocarina-svg')).toBeVisible();
    await expect(page.locator('.hole-key-badge')).toHaveCount(0);
    await expect(page.locator('.blow-kbd')).toHaveCount(0);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflow).toBe(false);

    await context.close();
  });
});
