import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim()))
);

const URL = env['VITE_SUPABASE_URL'];
const ANON = env['VITE_SUPABASE_ANON_KEY'];
const OUT_DIR = '/tmp/chronos-visual';
mkdirSync(OUT_DIR, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

async function setupTestUser() {
  const supabase = createClient(URL, ANON, { auth: { persistSession: false } });
  const tag = Math.random().toString(36).slice(2, 7);
  const email = `audit-${tag}@example.com`;
  const password = 'AuditPassword123!';
  const username = `audit_${tag}`;

  console.log(`Setting up test user: ${email} (${username})`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signUpError) throw signUpError;

  const session = signUpData.session;
  const authed = createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });

  const { error: obError } = await authed.rpc('complete_onboarding', {
    p_username: username,
    p_interests: ['cricket', 'photography', 'food'],
  });
  if (obError) throw obError;

  return { email, password, username, session };
}

async function run() {
  const user = await setupTestUser();

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      consoleErrors.push(text);
      console.log(`[CONSOLE ERROR]: ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
    console.error(`[PAGE EXCEPTION]: ${err.message}`);
  });

  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      failedRequests.push({ url: res.url(), status: res.status() });
      console.log(`[HTTP ${res.status()}]: ${res.url()}`);
    }
  });

  console.log('1. Welcome page (logged out)...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: `${OUT_DIR}/01-welcome.png` });

  console.log('2. Logging in...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const loginBtn = btns.find((b) => b.textContent?.trim() === 'Log in');
    if (loginBtn) loginBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.type('input[type="email"]', user.email);
  await page.type('input[type="password"]', user.password);

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const submitBtn = btns.find((b) => b.textContent?.trim() === 'Log in');
    if (submitBtn) submitBtn.click();
  });

  // Wait for feed posts to load
  console.log('3. Waiting for Feed posts...');
  await page.waitForSelector('article', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${OUT_DIR}/02-feed-loaded.png` });

  // 4. Test WhyModal
  console.log('4. Testing "Why am I seeing this?" modal...');
  const menuButtons = await page.$$('button[aria-label="More options"]');
  if (menuButtons.length > 0) {
    await menuButtons[0].click();
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: `${OUT_DIR}/03-post-menu.png` });

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const whyBtn = btns.find((b) => b.textContent?.includes('Why am I seeing this?'));
      if (whyBtn) whyBtn.click();
    });

    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT_DIR}/04-why-modal.png` });

    // Close modal
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const closeBtn = btns.find((b) => b.textContent?.trim() === 'Done' || b.getAttribute('aria-label') === 'Close');
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  }

  // 5. Test StoryViewer
  console.log('5. Testing Story Viewer...');
  const storyRings = await page.$$('button[aria-label*="story"]');
  console.log(`Found ${storyRings.length} story rings`);
  if (storyRings.length > 0) {
    await storyRings[0].click();
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: `${OUT_DIR}/05-story-viewer.png` });

    // Close StoryViewer
    await page.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close story"], button:has(svg.lucide-x)');
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  // 6. Test Explore & Search
  console.log('6. Testing Explore page...');
  await page.goto('http://127.0.0.1:5173/explore', { waitUntil: 'networkidle0' });
  await page.waitForSelector('a[href^="/p/"]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT_DIR}/06-explore.png` });

  const searchInput = await page.$('input[placeholder*="Search"]');
  if (searchInput) {
    await searchInput.type('cri');
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: `${OUT_DIR}/07-explore-search-results.png` });
  }

  // 7. Test TagPage (/t/cricket)
  console.log('7. Testing Tag page (/t/cricket)...');
  await page.goto('http://127.0.0.1:5173/t/cricket', { waitUntil: 'networkidle0' });
  await page.waitForSelector('a[href^="/p/"]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT_DIR}/08-tag-page.png` });

  // 8. Test Post Detail page (/p/<id>)
  console.log('8. Testing Post Detail page...');
  const firstPostHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/p/"]');
    return a ? a.getAttribute('href') : null;
  });

  if (firstPostHref) {
    console.log(`Opening post: ${firstPostHref}`);
    await page.goto(`http://127.0.0.1:5173${firstPostHref}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('article', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: `${OUT_DIR}/09-post-detail.png` });

    // 9. Test Likes List (/p/<id>/likes)
    const rawPostId = firstPostHref.replace('/p/', '').split('?')[0];
    console.log(`Opening likes list for post ${rawPostId}...`);
    await page.goto(`http://127.0.0.1:5173/p/${rawPostId}/likes`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: `${OUT_DIR}/10-post-likes.png` });
  }

  // 10. Test Reels (/reels)
  console.log('10. Testing Reels grid and player...');
  await page.goto('http://127.0.0.1:5173/reels', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT_DIR}/11-reels-grid.png` });

  const firstReelCard = await page.$('button[aria-label*="Watch reel"]');
  if (firstReelCard) {
    await firstReelCard.click();
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: `${OUT_DIR}/12-reels-player.png` });

    // Press Escape to close player
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 500));
  }

  // 11. Test Direct Messages & Chat
  console.log('11. Testing Direct Messages...');
  await page.goto('http://127.0.0.1:5173/messages', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));

  // Search a user to message
  const dmSearch = await page.$('input[placeholder*="Search"]');
  if (dmSearch) {
    await dmSearch.type('isha');
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: `${OUT_DIR}/13-dm-search.png` });

    const partnerLink = await page.$('a[href^="/messages/"]');
    if (partnerLink) {
      await partnerLink.click();
      await page.waitForSelector('form input', { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: `${OUT_DIR}/14-dm-thread-empty.png` });

      // Send a test message
      const msgInput = await page.$('form input');
      if (msgInput) {
        await msgInput.type('Hey Isha! Testing Chronos DMs.');
        await page.keyboard.press('Enter');
        await new Promise((r) => setTimeout(r, 1000));
        await page.screenshot({ path: `${OUT_DIR}/15-dm-thread-sent.png` });
      }
    }
  }

  // 12. Test Notifications
  console.log('12. Testing Notifications...');
  await page.goto('http://127.0.0.1:5173/notifications', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${OUT_DIR}/16-notifications.png` });

  // 13. Test Profile & Saved tab
  console.log('13. Testing User Profile & Saved tab...');
  await page.goto(`http://127.0.0.1:5173/u/${user.username}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${OUT_DIR}/17-profile-posts.png` });

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a'));
    const savedTab = btns.find((b) => b.textContent?.includes('SAVED'));
    if (savedTab) savedTab.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${OUT_DIR}/18-profile-saved.png` });

  // 14. Test Settings & Feed Preferences
  console.log('14. Testing Settings & Feed Preferences...');
  await page.goto('http://127.0.0.1:5173/settings', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${OUT_DIR}/19-settings.png` });

  // Click Feed preferences
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const prefsBtn = btns.find((b) => b.textContent?.includes('Feed preferences'));
    if (prefsBtn) prefsBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${OUT_DIR}/20-settings-prefs-expanded.png` });

  // 15. Test Edit Profile
  console.log('15. Testing Edit Profile...');
  await page.goto('http://127.0.0.1:5173/settings/profile', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${OUT_DIR}/21-edit-profile.png` });

  // 16. Test New Post page
  console.log('16. Testing New Post page...');
  await page.goto('http://127.0.0.1:5173/new', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${OUT_DIR}/22-new-post.png` });

  // 17. Desktop Viewport (1280x800)
  console.log('17. Testing Desktop Viewport (1280x800)...');
  await page.setViewport({ width: 1280, height: 800, isMobile: false });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('article', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT_DIR}/23-desktop-feed.png` });

  await browser.close();

  console.log('\n================ VISUAL AUDIT RESULTS ================');
  console.log(`✓ All 17 UI stages tested`);
  console.log(`Console Errors: ${consoleErrors.length}`);
  console.log(`Page Exceptions: ${pageErrors.length}`);
  console.log(`Failed HTTP Requests: ${failedRequests.length}`);
  if (consoleErrors.length > 0) console.log('Errors:', consoleErrors);
  if (pageErrors.length > 0) console.log('Exceptions:', pageErrors);
  if (failedRequests.length > 0) console.log('Failed requests:', failedRequests);
}

run().catch((err) => {
  console.error('Audit run failed:', err);
  process.exit(1);
});
