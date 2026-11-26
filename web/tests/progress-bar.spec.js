// @ts-check
// The native <progress> bar in Chromium, Firefox and WebKit (projects in
// playwright.config.js). Each engine styles it through its own pseudo-element
// (::-webkit-progress-value, ::-moz-progress-bar), so reading the value is not
// enough: the test screenshots the bar and reads the pixels. The fill must
// cover the left side and the track the right side. The site has one theme
// (the :root tokens in style.css), so there is one pass. The
// screenshots go to the report, for a side-by-side look between engines.
const { test, expect } = require('@playwright/test');

const SLUG = 'go-fintech';

/** Average RGB of a vertical strip of a PNG, decoded in a page without CSP. */
async function sample(context, png, fractions) {
  const page = await context.newPage();
  await page.goto('about:blank');
  const out = await page.evaluate(async ({ b64, fractions }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return fractions.map((f) => {
      const x = Math.floor(img.width * f);
      const d = ctx.getImageData(x, 0, 1, img.height).data;
      // Middle rows only: the rounded ends and anti-aliased edges stay out.
      const rows = [];
      for (let y = Math.floor(img.height / 3); y < Math.ceil((2 * img.height) / 3); y++) rows.push(y);
      const sum = [0, 0, 0];
      rows.forEach((y) => { for (let k = 0; k < 3; k++) sum[k] += d[y * 4 + k]; });
      return sum.map((v) => Math.round(v / rows.length));
    });
  }, { b64: png.toString('base64'), fractions });
  await page.close();
  return out;
}

const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

test('a barra mostra o preenchimento e o trilho', async ({ page, context, browserName }, info) => {
  await page.goto(`/#/learn/${SLUG}`);
  await page.evaluate(() => localStorage.clear());
  const bar = page.locator('.course-progress progress.progress');
  await expect(bar).toBeVisible();
  // The real stylesheet, a known value: half filled.
  const track = await bar.evaluate((el) => {
    /** @type {HTMLProgressElement} */ (el).value = 50;
    const css = getComputedStyle(document.documentElement).getPropertyValue('--surface2').trim();
    // Resolve the token to rgb through the same engine.
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = css;
    c.fillRect(0, 0, 1, 1);
    return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  });
  await page.waitForTimeout(400); // the fill's width transition (0.3 s)

  const png = await bar.screenshot();
  await info.attach(`progress-${browserName}.png`, { body: png, contentType: 'image/png' });
  const [left, right] = await sample(context, png, [0.25, 0.75]);

  expect(dist(right, track), `trilho em 75%: ${right} ≠ ${track}`).toBeLessThanOrEqual(12);
  expect(dist(left, track), `preenchimento em 25%: ${left} igual ao trilho ${track}`).toBeGreaterThan(40);
});
