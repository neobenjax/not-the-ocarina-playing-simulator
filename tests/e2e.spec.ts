import { test, expect } from '@playwright/test';

test.describe('Not The Ocarina Playing Simulator E2E', () => {
  test('Desktop: Core Ocarina, Key Mapping, Skin Gallery & Custom SVG, Mode 1 Composer & MP3, Mode 2 Arcade', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./', { waitUntil: 'networkidle' });

    // 1. Verify Ocarina SVG and desktop key-bind badges
    await expect(page.locator('.ocarina-svg')).toBeVisible();
    await expect(page.locator('[data-hole="hole-a"]')).toBeVisible();
    await expect(page.locator('.hole-key-badge').first()).toBeVisible();
    await expect(page.locator('.blow-kbd')).toBeVisible();

    // Play a note via keyboard
    await page.keyboard.down('KeyJ');
    await expect(page.locator('#ocarina-live-note')).toContainText('D5');
    await page.keyboard.up('KeyJ');

    // 2. Key Mapping Modal
    await page.click('#btn-key-map');
    await expect(page.locator('#keymap-dialog')).toBeVisible();
    await page.click('#keymap-done-btn');
    await expect(page.locator('#keymap-dialog')).not.toBeVisible();

    // 3. Skin Gallery & Custom SVG Upload
    await page.click('#btn-skin-gallery');
    await expect(page.locator('#skin-gallery-dialog')).toBeVisible();
    await page.click('[data-select-skin="majoras-mask"]');
    await expect(page.locator('#ocarina-skin-pill')).toHaveText("Majora's Mask");

    // Customize & Upload SVG tab
    await page.click('#skin-tab-custom');
    await expect(page.locator('#btn-download-svg-template')).toBeVisible();
    const customSvgPayload = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 340">
        <rect width="640" height="340" fill="#111827" />
        <g data-hole="hole-a"><circle cx="295" cy="200" r="24" fill="#2f80ed" /></g>
        <g data-hole="hole-down"><circle cx="368" cy="222" r="22" fill="#f2c94c" /></g>
        <g data-hole="hole-right"><circle cx="438" cy="186" r="22" fill="#27ae60" /></g>
        <g data-hole="hole-left"><circle cx="356" cy="146" r="22" fill="#ff6b35" /></g>
        <g data-hole="hole-up"><circle cx="422" cy="118" r="21" fill="#e74c3c" /></g>
      </svg>
    `;
    await page.setInputFiles('#custom-svg-file', {
      name: 'my-custom.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(customSvgPayload),
    });
    await expect(page.locator('#btn-save-custom-svg')).toBeVisible();
    await page.click('#btn-save-custom-svg');
    await page.click('#skin-done-btn');
    await expect(page.locator('#ocarina-skin-pill')).toHaveText('My Custom Ocarina');

    // 4. Mode 1: Partiture Timeline Editor, Save Track, Export .txt & MP3
    await expect(page.locator('.partiture-timeline')).toBeVisible();
    const initialNotes = await page.locator('.partiture-note').count();
    await page.locator('[data-grid-hole="hole-up"]').click({ position: { x: 520, y: 20 } });
    await expect(page.locator('.partiture-note')).toHaveCount(initialNotes + 1);

    await page.click('#btn-comp-save');

    // Export Partiture .txt download
    const txtDownloadPromise = page.waitForEvent('download');
    await page.click('#btn-export-txt');
    const txtDownload = await txtDownloadPromise;
    expect(txtDownload.suggestedFilename()).toContain('.ocarina.txt');

    // Export MP3 download
    const mp3DownloadPromise = page.waitForEvent('download');
    await page.click('#btn-export-mp3');
    const mp3Download = await mp3DownloadPromise;
    expect(mp3Download.suggestedFilename()).toContain('.mp3');

    // 5. Mode 2: Arcade Mode
    await page.click('#tab-mode-arcade');
    await expect(page.locator('.arcade-song-grid')).toBeVisible();
    await expect(page.locator('[data-select-song="zelda-lullaby"]')).toBeVisible();
    await expect(page.locator('[data-select-song="song-of-storms"]')).toBeVisible();

    await page.click('#btn-assist-original');
    await page.click('#btn-offset-plus');
    await expect(page.locator('#arcade-offset-val')).toHaveText('+10ms');

    await page.click('#btn-arcade-start');
    await expect(page.locator('#arcade-highway-canvas')).toBeVisible();
    await expect(page.locator('#arcade-live-miss-streak')).toContainText('Miss Streak:');

    await page.click('#btn-arcade-quit');
    await expect(page.locator('.arcade-song-grid')).toBeVisible();

    // 6. Settings Modal
    await page.click('#btn-settings');
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await page.click('#settings-done-btn');

    expect(errors).toEqual([]);
  });

  test('Mobile Touch: Responsive layout without horizontal overflow and key badges hidden', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto('./', { waitUntil: 'networkidle' });

    await expect(page.locator('.ocarina-svg')).toBeVisible();
    // Key badges must be hidden on touch devices
    await expect(page.locator('.hole-key-badge')).toHaveCount(0);
    await expect(page.locator('.blow-kbd')).toHaveCount(0);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflow).toBe(false);

    await context.close();
  });
});
