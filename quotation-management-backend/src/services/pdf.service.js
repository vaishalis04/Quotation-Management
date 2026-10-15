/**
 * PDF output.
 *  docx / xlsx layouts -> LibreOffice headless (install it on the server; set SOFFICE_PATH if not on PATH)
 *  html layouts        -> puppeteer (optional: npm i puppeteer). JavaScript is disabled and every network request
 *                         except data: URIs is blocked, so an uploaded layout can never reach other servers.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ApiError = require('../utils/ApiError');

const SOFFICE = process.env.SOFFICE_PATH || 'soffice';

const officeToPdf = async (buffer, ext) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'quote-pdf-'));
  const input = path.join(dir, `quotation.${ext}`);
  try {
    await fs.promises.writeFile(input, buffer);
    await new Promise((resolve, reject) => {
      execFile(
        SOFFICE,
        // own profile dir per run: two LibreOffice processes sharing a profile deadlock each other
        [`-env:UserInstallation=file://${dir}/profile`, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, input],
        { timeout: 90000 },
        (err) => (err ? reject(err) : resolve())
      );
    });
    return await fs.promises.readFile(path.join(dir, 'quotation.pdf'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ApiError(501, 'PDF output needs LibreOffice on the server (set SOFFICE_PATH). Download the Word/Excel file instead.');
    }
    throw new ApiError(500, `PDF conversion failed: ${err.message}`);
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};

const htmlToPdf = async (html) => {
  let puppeteer;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    puppeteer = require('puppeteer');
  } catch {
    throw new ApiError(501, 'PDF from HTML layouts needs puppeteer on the server (npm i puppeteer).');
  }
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('data:') || r.url() === 'about:blank' ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } }));
  } finally {
    await browser.close();
  }
};

module.exports = { officeToPdf, htmlToPdf };
