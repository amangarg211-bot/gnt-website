// Minimal static file server for deploying this site (e.g. on Railway), plus a
// small /api/contact endpoint that emails enquiries straight to CONTACT_TO via
// the site's own SMTP account — no third-party form service in the loop.
// Listens on process.env.PORT (falls back to 8080 to match the existing Railway domain config).
const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6 && !tooBig) { // 1MB cap
        tooBig = true;
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => { if (!tooBig) resolve(data); });
    req.on('error', reject);
  });
}

async function handleContact(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');

    // Honeypot: real visitors never fill this hidden field. If it's filled,
    // pretend success so bots don't learn to route around it, but drop it.
    if (body.company) {
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: true }));
    }

    const name = (body.name || '').toString().trim().slice(0, 200);
    const email = (body.email || '').toString().trim().slice(0, 200);
    const phone = (body.phone || '').toString().trim().slice(0, 60);
    const message = (body.message || '').toString().trim().slice(0, 5000);

    if (!name || !email || !message) {
      res.writeHead(400);
      return res.end(JSON.stringify({ ok: false, error: 'Missing required fields' }));
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ ok: false, error: 'Invalid email address' }));
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.error('Contact form: SMTP_HOST/SMTP_USER/SMTP_PASS env vars are not set.');
      res.writeHead(500);
      return res.end(JSON.stringify({ ok: false, error: 'Mail is not configured on the server' }));
    }

    const port = Number(SMTP_PORT) || 465;
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"G&T Solutions Website" <${SMTP_USER}>`,
      to: CONTACT_TO || SMTP_USER,
      replyTo: `"${name}" <${email}>`,
      subject: `New enquiry from ${name} — G&T Solutions website`,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || '—'}\n\nMessage:\n${message}`,
      html: `<p><strong>Name:</strong> ${escapeHtml(name)}</p>` +
        `<p><strong>Email:</strong> ${escapeHtml(email)}</p>` +
        `<p><strong>Phone:</strong> ${escapeHtml(phone) || '—'}</p>` +
        `<p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
    });

    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('Contact form error:', err);
    res.writeHead(500);
    res.end(JSON.stringify({ ok: false, error: 'Server error sending message' }));
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function serveFile(filePath, req, res, triedHtmlFallback) {
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      // Clean-URL support: an extensionless path like /office-interior-
      // designer-noida resolves to office-interior-designer-noida.html when
      // there's no exact file. This lets new SEO/AEO landing pages ship as
      // plain static HTML files at clean URLs, with no framework needed.
      if (!triedHtmlFallback && !path.extname(filePath)) {
        return serveFile(filePath + '.html', req, res, true);
      }
      fs.readFile(path.join(ROOT, '404.html'), (err2, data404) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data404 || '404 Not Found');
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;

    // Range support: required for <video>/<audio> to be treated as seekable
    // media by browsers, and for Content-Length to be known up front.
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        let start = match[1] ? parseInt(match[1], 10) : 0;
        let end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
        if (start >= stat.size || end >= stat.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
          return res.end();
        }
        res.writeHead(206, {
          'Content-Type': contentType,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/contact') {
    return handleContact(req, res);
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, reqPath));

  // prevent path traversal outside the site root
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  serveFile(filePath, req, res, false);
}).listen(PORT, () => {
  console.log(`G&T Solutions site running on port ${PORT}`);
});
