const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let browserSession;
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1017',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  browserSession = session.defaultSession;
  browserSession.setUserAgent(BROWSER_UA);
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function normalizeWebUrl(input) {
  let value = String(input || '').trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只支持 http 或 https 网页');
  return parsed.href;
}

function extFromUrl(url) {
  try { return path.extname(new URL(url).pathname).slice(1).toLowerCase(); } catch { return ''; }
}

function typeFrom(url, tag, mime = '') {
  const ext = extFromUrl(url);
  const value = `${mime} ${ext} ${tag}`.toLowerCase();
  if (/gif/.test(value)) return 'gif';
  if (/video|mp4|webm|mov|m4v|m3u8/.test(value)) return 'video';
  if (/audio|mp3|wav|m4a|aac|ogg|flac/.test(value)) return 'audio';
  if (/image|img|jpe?g|png|webp|avif|svg|bmp|ico/.test(value)) return 'image';
  return null;
}

async function scanStaticPage(pageUrl) {
  const response = await globalThis.fetch(pageUrl, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`网页服务器返回 HTTP ${response.status}`);
  const html = await response.text();
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
  const items = [];
  const add = value => {
    if (!value) return;
    value = value.replace(/&amp;/g, '&').replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    try { value = new URL(value, response.url).href; } catch { return; }
    if (/^https?:/i.test(value)) items.push({ url: value, tag: 'static', mime: '', width: 0, height: 0, title: '' });
  };
  for (const match of html.matchAll(/(?:src|href|poster|data-src|data-original)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'<>\s]+/gi)) add(match[0]);
  return { title, url: response.url, items, fallback: true };
}

ipcMain.handle('scan-page', async (_event, rawUrl) => {
  const pageUrl = normalizeWebUrl(rawUrl);
  const directType = typeFrom(pageUrl, '', '');
  if (directType) {
    return {
      title: decodeURIComponent(path.basename(new URL(pageUrl).pathname)) || pageUrl,
      url: pageUrl,
      items: [{ url: pageUrl, tag: 'direct', mime: '', width: 0, height: 0, title: '', type: directType, ext: extFromUrl(pageUrl) }],
      warning: ''
    };
  }
  const scanner = new BrowserWindow({
    show: false,
    webPreferences: { javascript: true, images: true, sandbox: true, contextIsolation: true }
  });
  let result;
  try {
    try {
      await Promise.race([
        scanner.loadURL(pageUrl, { userAgent: BROWSER_UA }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('网页加载超时')), 30000))
      ]);
      await new Promise(resolve => setTimeout(resolve, 2200));
      result = await scanner.webContents.executeJavaScript(`(() => {
      const abs = v => { try { return new URL(v, location.href).href } catch { return '' } };
      const out = [];
      const add = (url, tag, mime, width, height, title) => {
        url = abs(url); if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;
        out.push({ url, tag, mime: mime || '', width: width || 0, height: height || 0, title: title || '' });
      };
      document.querySelectorAll('img').forEach(el => {
        add(el.currentSrc || el.src, 'img', '', el.naturalWidth, el.naturalHeight, el.alt);
        const srcset = el.getAttribute('srcset') || '';
        srcset.split(',').forEach(x => add(x.trim().split(/\\s+/)[0], 'img', '', 0, 0, el.alt));
        ['data-src','data-original','data-lazy-src'].forEach(k => add(el.getAttribute(k), 'img', '', 0, 0, el.alt));
      });
      document.querySelectorAll('video,audio,source').forEach(el => add(el.currentSrc || el.src, el.closest('audio') ? 'audio' : (el.closest('video') ? 'video' : el.tagName.toLowerCase()), el.type, el.videoWidth, el.videoHeight, el.title));
      document.querySelectorAll('a[href]').forEach(el => add(el.href, 'link', '', 0, 0, el.textContent.trim().slice(0,80)));
      document.querySelectorAll('*').forEach(el => {
        const bg = getComputedStyle(el).backgroundImage;
        for (const m of bg.matchAll(/url\\(["']?(.+?)["']?\\)/g)) add(m[1], 'background', '', 0, 0, '');
      });
      performance.getEntriesByType('resource').forEach(r => add(r.name, 'resource', r.initiatorType, 0, 0, ''));
      return { title: document.title, url: location.href, items: out };
      })()`);
    } catch (renderError) {
      result = await scanStaticPage(pageUrl);
      result.warning = `动态扫描失败，已改用网页源码扫描：${renderError.message}`;
    }
    const seen = new Set();
    const items = result.items.flatMap(item => {
      const type = typeFrom(item.url, item.tag, item.mime);
      if (!type || seen.has(item.url)) return [];
      seen.add(item.url);
      return [{ ...item, type, ext: extFromUrl(item.url) }];
    }).sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return { title: result.title, url: result.url, items, warning: result.warning || '' };
  } finally {
    if (!scanner.isDestroyed()) scanner.destroy();
  }
});

function cleanName(name) {
  return String(name || 'media').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 150) || 'media';
}

function uniquePath(dir, base) {
  const parsed = path.parse(base);
  let candidate = path.join(dir, base), n = 1;
  while (fs.existsSync(candidate)) candidate = path.join(dir, `${parsed.name} (${n++})${parsed.ext}`);
  return candidate;
}

async function fetchMedia(item) {
  const commonHeaders = {
    'User-Agent': BROWSER_UA,
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,audio/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
    'Cache-Control': 'no-cache'
  };
  const errors = [];
  try {
    const response = await browserSession.fetch(item.url, {
      method: 'GET', headers: commonHeaders, redirect: 'follow', credentials: 'include'
    });
    if (response.ok) return response;
    errors.push(`浏览器请求 HTTP ${response.status}`);
  } catch (error) { errors.push(error.message); }

  try {
    const cookies = await browserSession.cookies.get({ url: item.url });
    const headers = { ...commonHeaders };
    if (item.pageUrl) headers.Referer = item.pageUrl;
    if (cookies.length) headers.Cookie = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    const response = await globalThis.fetch(item.url, { method: 'GET', headers, redirect: 'follow' });
    if (response.ok) return response;
    errors.push(`兼容请求 HTTP ${response.status}`);
  } catch (error) { errors.push(error.message); }
  throw new Error([...new Set(errors)].join('；') || '网络请求失败');
}

async function writeResponse(response, target) {
  if (!response.body) throw new Error('服务器没有返回文件内容');
  const file = fs.createWriteStream(target);
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!file.write(Buffer.from(value))) await new Promise(resolve => file.once('drain', resolve));
    }
    await new Promise((resolve, reject) => file.end(error => error ? reject(error) : resolve()));
  } catch (error) {
    file.destroy();
    await fs.promises.rm(target, { force: true });
    throw error;
  }
}

async function downloadOne(item, dir, index, total) {
  const response = await fetchMedia(item);
  const contentType = response.headers.get('content-type') || '';
  if (/text\/html|application\/json/i.test(contentType)) throw new Error(`服务器返回了网页而不是素材（${contentType}）`);
  const mimeExt = contentType.includes('jpeg') ? 'jpg' : contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : contentType.includes('webp') ? 'webp' : contentType.includes('mp4') ? 'mp4' : contentType.includes('mpeg') ? 'mp3' : '';
  let base = '';
  try { base = decodeURIComponent(path.basename(new URL(item.url).pathname)); } catch {}
  if (!path.extname(base) && (item.ext || mimeExt)) base += `.${item.ext || mimeExt}`;
  base = cleanName(base || `${item.type}-${index + 1}.${item.ext || mimeExt || 'bin'}`);
  const target = uniquePath(dir, base);
  await writeResponse(response, target);
  mainWindow?.webContents.send('download-progress', { index: index + 1, total, name: base, ok: true });
  return target;
}

ipcMain.handle('download-items', async (_event, items) => {
  if (!Array.isArray(items) || !items.length) throw new Error('请先选择要下载的素材');
  const chosen = await dialog.showOpenDialog(mainWindow, { title: '选择保存文件夹', properties: ['openDirectory', 'createDirectory'] });
  if (chosen.canceled) return { canceled: true };
  const dir = chosen.filePaths[0];
  const results = [];
  for (let i = 0; i < items.length; i++) {
    try { results.push({ ok: true, path: await downloadOne(items[i], dir, i, items.length) }); }
    catch (error) {
      results.push({ ok: false, url: items[i].url, error: error.message });
      mainWindow?.webContents.send('download-progress', { index: i + 1, total: items.length, name: items[i].url, ok: false });
    }
  }
  return { canceled: false, dir, results };
});
