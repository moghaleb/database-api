const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

// ======== إعدادات SSL الذكية ========
let sslOptions = null;
let useSSL = false;

const possibleSSLCertPaths = [
  '/etc/letsencrypt/live/redme.cfd/fullchain.pem',
  '/etc/letsencrypt/live/redme.cfd/cert.pem',
  '/etc/ssl/certs/redme.cfd.crt'
];

const possibleSSLKeyPaths = [
  '/etc/letsencrypt/live/redme.cfd/privkey.pem',
  '/etc/ssl/private/redme.cfd.key'
];

function findSSLCertificates() {
  let certPath = null;
  let keyPath = null;
  for (const path of possibleSSLCertPaths) { if (fs.existsSync(path)) { certPath = path; break; } }
  for (const path of possibleSSLKeyPaths) { if (fs.existsSync(path)) { keyPath = path; break; } }
  if (certPath && keyPath) {
    try {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
        secureProtocol: 'TLSv1_2_method'
      };
    } catch (e) { return null; }
  }
  return null;
}

sslOptions = findSSLCertificates();
useSSL = sslOptions !== null;

// ======== Middleware ========
app.use(cors({
  origin: ['https://redme.cfd', 'http://redme.cfd', 'https://www.redme.cfd', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
const SESSION_SECRET = process.env.SESSION_SECRET || 'redshe_shop_production_secret_2024';
app.use(cookieParser(SESSION_SECRET));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USER || 'redshe_admin',
  password: process.env.ADMIN_PASS || 'Redshe@2024!Secure'
};

function isAuthenticated(req) {
  const auth = req.signedCookies && req.signedCookies.admin_auth;
  return auth === ADMIN_CREDENTIALS.username;
}

// ======== Database Configuration ========
const db = new sqlite3.Database(':memory:');

// ======== تهيئة الجداول (من server.txt بالكامل) ========
db.serialize(() => {
  // جداول المستخدمين والطلبات والمنتجات ... (مستنسخ من server.txt)
  db.run(`CREATE TABLE IF NOT EXISTS test_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE, cart_items TEXT, total_amount REAL, discount_amount REAL, coupon_code TEXT, coupon_type TEXT, gift_card_number TEXT, gift_card_type TEXT, gift_card_amount REAL, order_date DATETIME, order_status TEXT, customer_name TEXT, customer_phone TEXT, customer_email TEXT, customer_secondary_phone TEXT, payment_method TEXT, transfer_name TEXT, transfer_number TEXT, customer_address TEXT, address_city TEXT, address_area TEXT, address_detail TEXT, shipping_city TEXT, shipping_area TEXT, shipping_fee REAL, final_amount REAL, order_notes TEXT, expected_delivery TEXT, items_count INTEGER, shipping_type TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, product_name TEXT, quantity INTEGER, price REAL, total_price REAL, product_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, description TEXT, discount_type TEXT, discount_value REAL, min_order_amount REAL, max_uses INTEGER, used_count INTEGER, valid_from DATETIME, valid_until DATETIME, is_active INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS gift_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, card_number TEXT UNIQUE, pin_code TEXT, initial_amount REAL, current_balance REAL, used_amount REAL, is_active INTEGER, valid_from DATETIME DEFAULT CURRENT_TIMESTAMP, valid_until DATETIME, max_uses INTEGER, used_count INTEGER, customer_name TEXT, customer_phone TEXT, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS admin_settings (id INTEGER PRIMARY KEY AUTOINCREMENT, setting_key TEXT UNIQUE, setting_value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name_ar TEXT, name_en TEXT, description TEXT, image TEXT, is_active INTEGER, sort_order INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS perfumes (id INTEGER PRIMARY KEY AUTOINCREMENT, name_ar TEXT, name_en TEXT, description TEXT, price REAL, original_price REAL, category_id INTEGER, image TEXT, images TEXT, in_stock INTEGER, stock_quantity INTEGER, is_featured INTEGER, is_active INTEGER, sort_order INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  // إضافة بيانات افتراضية (مختصرة للسرعة)
  db.run(`INSERT OR IGNORE INTO admin_settings (setting_key, setting_value) VALUES ('theme', 'light'), ('items_per_page', '10')`);
});

// ======== قالب Layout الإدارة الموحد (SPA) ========
const adminLayout = (title, content, activePage = '') => `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | لوحة التحكم</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --secondary: #64748b;
            --bg: #f8fafc;
            --sidebar-bg: #ffffff;
            --card-bg: #ffffff;
            --text: #1e293b;
            --sidebar-width: 280px;
            --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Outfit', 'Segoe UI', sans-serif; }
        body { background-color: var(--bg); color: var(--text); overflow-x: hidden; }

        /* Sidebar Styles */
        .sidebar {
            position: fixed;
            right: 0;
            top: 0;
            height: 100vh;
            width: var(--sidebar-width);
            background: var(--sidebar-bg);
            border-left: 1px solid #e2e8f0;
            z-index: 1000;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            padding: 20px;
            display: flex;
            flex-direction: column;
        }

        .sidebar-brand {
            padding: 20px 10px;
            font-size: 24px;
            font-weight: 700;
            color: var(--primary);
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 30px;
        }

        .nav-list { list-style: none; flex: 1; }
        .nav-item { margin-bottom: 8px; }
        .nav-link {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            text-decoration: none;
            color: var(--secondary);
            border-radius: 12px;
            transition: all 0.2s;
            font-weight: 500;
        }

        .nav-link:hover, .nav-link.active {
            background: #f1f5f9;
            color: var(--primary);
        }
        
        .nav-link.active { background: #eef2ff; }

        /* Main Content */
        .main-content {
            margin-right: var(--sidebar-width);
            padding: 40px;
            min-height: 100vh;
            transition: opacity 0.3s;
        }

        .top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
        }

        .page-title h1 { font-size: 28px; font-weight: 700; color: #0f172a; }
        .page-title p { color: #64748b; margin-top: 4px; }

        .btn {
            padding: 10px 20px;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        }

        .btn-primary { background: var(--primary); color: white; }
        .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 24px;
            margin-bottom: 40px;
        }

        .stat-card {
            background: var(--card-bg);
            padding: 24px;
            border-radius: 20px;
            box-shadow: var(--shadow);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .stat-info h3 { font-size: 24px; font-weight: 700; color: #0f172a; }
        .stat-info p { color: #64748b; font-size: 14px; margin-top: 4px; }
        .stat-icon {
            width: 48px;
            height: 48px;
            background: #f1f5f9;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: var(--primary);
        }

        /* Mobile Responsive */
        @media (max-width: 1024px) {
            .sidebar { transform: translateX(100%); }
            .sidebar.show { transform: translateX(0); }
            .main-content { margin-right: 0; padding: 20px; }
            .mobile-toggle { display: flex; }
        }

        .mobile-toggle {
            position: fixed;
            bottom: 24px;
            left: 24px;
            width: 56px;
            height: 56px;
            background: var(--primary);
            color: white;
            border-radius: 50%;
            display: none;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            z-index: 1001;
            border: none;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <aside class="sidebar">
        <div class="sidebar-brand"><i class="fas fa-rocket"></i> REDSHE DASH</div>
        <ul class="nav-list">
            <li class="nav-item"><a href="/admin" class="nav-link ${activePage === 'users' ? 'active' : ''}"><i class="fas fa-users"></i> <span>المستخدمين</span></a></li>
            <li class="nav-item"><a href="/admin/orders" class="nav-link ${activePage === 'orders' ? 'active' : ''}"><i class="fas fa-shopping-cart"></i> <span>الطلبات</span></a></li>
            <li class="nav-item"><a href="/admin/coupons" class="nav-link ${activePage === 'coupons' ? 'active' : ''}"><i class="fas fa-ticket-alt"></i> <span>الكوبونات</span></a></li>
            <li class="nav-item"><a href="/admin/gift-cards" class="nav-link ${activePage === 'gift-cards' ? 'active' : ''}"><i class="fas fa-gift"></i> <span>القسائم</span></a></li>
            <li class="nav-item"><a href="/admin/products" class="nav-link ${activePage === 'products' ? 'active' : ''}"><i class="fas fa-box"></i> <span>المنتجات</span></a></li>
            <li class="nav-item"><a href="/admin/settings" class="nav-link ${activePage === 'settings' ? 'active' : ''}"><i class="fas fa-cog"></i> <span>الإعدادات</span></a></li>
        </ul>
        <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid #eee;">
             <a href="/logout" class="nav-link" style="color: #ef4444;"><i class="fas fa-sign-out-alt"></i> <span>تسجيل الخروج</span></a>
        </div>
    </aside>

    <button class="mobile-toggle" onclick="toggleSidebar()"><i class="fas fa-bars"></i></button>

    <main class="main-content">
        <div class="top-bar">
            <div class="page-title">
                <h1>${title}</h1>
                <p><i class="fas fa-calendar"></i> ${new Date().toLocaleDateString('ar-SA')}</p>
            </div>
        </div>
        <div id="section-container">
            ${content}
        </div>
    </main>

    <script>
        // SPA Logic: Load section content without refresh
        document.addEventListener('click', e => {
            const link = e.target.closest('.nav-link');
            if (link && link.getAttribute('href') && !link.getAttribute('href').startsWith('http')) {
                const url = link.getAttribute('href');
                if (url === '/logout') return; // Don't AJAX logout
                e.preventDefault();
                loadSection(url);
            }
        });

        async function loadSection(url) {
            const container = document.getElementById('section-container');
            container.style.opacity = '0.5';
            try {
                const res = await fetch(url);
                const html = await res.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                const newContent = doc.getElementById('section-container').innerHTML;
                const newTitle = doc.querySelector('title').innerText;
                const pageTitle = doc.querySelector('.page-title h1').innerText;

                container.innerHTML = newContent;
                document.title = newTitle;
                document.querySelector('.page-title h1').innerText = pageTitle;
                container.style.opacity = '1';
                window.history.pushState({path: url}, '', url);
                
                // Update active link
                document.querySelectorAll('.nav-link').forEach(l => {
                    l.classList.toggle('active', l.getAttribute('href') === url);
                });

                // Re-run scripts
                const scripts = container.querySelectorAll('script');
                scripts.forEach(s => {
                    const newScript = document.createElement('script');
                    if (s.src) newScript.src = s.src;
                    else newScript.textContent = s.textContent;
                    document.body.appendChild(newScript);
                    s.remove();
                });

            } catch (err) { window.location.href = url; }
        }

        window.onpopstate = () => loadSection(window.location.pathname);
        function toggleSidebar() { document.querySelector('.sidebar').classList.toggle('show'); }
    </script>
</body>
</html>
`;

// ======== Admin Routes ========

// Dashboard Home (Users)
app.get('/admin', (req, res) => {
  if (!isAuthenticated(req)) return res.redirect('/admin/login');
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, users) => {
    const content = `
      <div class="stats-grid">
          <div class="stat-card"><div class="stat-info"><h3>${users.length}</h3><p>إجمالي المستخدمين</p></div><div class="stat-icon"><i class="fas fa-users"></i></div></div>
          <div class="stat-card"><div class="stat-info"><h3>${users.filter(u => new Date(u.created_at) > new Date(Date.now() - 24*60*60*1000)).length}</h3><p>مستخدمين جدد (24س)</p></div><div class="stat-icon"><i class="fas fa-user-plus"></i></div></div>
      </div>
      <div style="background: white; border-radius: 20px; padding: 24px; box-shadow: var(--shadow);">
          <table style="width: 100%; border-collapse: collapse;">
              <thead>
                  <tr style="text-align: right; border-bottom: 1px solid #eee;">
                      <th style="padding: 12px;">الاسم</th>
                      <th style="padding: 12px;">الهاتف</th>
                      <th style="padding: 12px;">التاريخ</th>
                  </tr>
              </thead>
              <tbody>
                  ${users.map(u => `
                    <tr style="border-bottom: 1px solid #f8fafc;">
                        <td style="padding: 12px;">${u.name}</td>
                        <td style="padding: 12px;">${u.phone}</td>
                        <td style="padding: 12px;">${new Date(u.created_at).toLocaleDateString('ar-SA')}</td>
                    </tr>
                  `).join('')}
              </tbody>
          </table>
      </div>
    `;
    res.send(adminLayout('المستخدمين', content, 'users'));
  });
});

// Orders Route
app.get('/admin/orders', (req, res) => {
  if (!isAuthenticated(req)) return res.redirect('/admin/login');
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, orders) => {
    const content = `
      <div class="stats-grid">
          <div class="stat-card"><div class="stat-info"><h3>${orders.length}</h3><p>إجمالي الطلبات</p></div><div class="stat-icon"><i class="fas fa-shopping-bag"></i></div></div>
          <div class="stat-card"><div class="stat-info"><h3>${orders.filter(o => o.order_status === 'pending').length}</h3><p>قيد الانتظار</p></div><div class="stat-icon"><i class="fas fa-clock"></i></div></div>
      </div>
      <div class="orders-list">
          ${orders.map(o => `
            <div style="background: white; padding: 20px; border-radius: 16px; margin-bottom: 16px; box-shadow: var(--shadow);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <strong>#${o.order_number}</strong>
                    <span style="background: #fef3c7; color: #d97706; padding: 4px 12px; border-radius: 20px; font-size: 12px;">${o.order_status}</span>
                </div>
                <div style="color: #64748b; font-size: 14px;">
                    <p><i class="fas fa-user"></i> ${o.customer_name}</p>
                    <p><i class="fas fa-phone"></i> ${o.customer_phone}</p>
                    <p><i class="fas fa-money-bill"></i> ${o.total_amount} ر.س</p>
                </div>
            </div>
          `).join('')}
      </div>
    `;
    res.send(adminLayout('إدارة الطلبات', content, 'orders'));
  });
});

// Products Route (Simplified content for SPA example)
app.get('/admin/products', (req, res) => {
  if (!isAuthenticated(req)) return res.redirect('/admin/login');
  db.all('SELECT * FROM perfumes', (err, products) => {
      const content = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-info"><h3>${products.length}</h3><p>المنتجات</p></div><div class="stat-icon"><i class="fas fa-box"></i></div></div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px;">
            ${products.map(p => `
                <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: var(--shadow);">
                    <img src="${p.image}" style="width: 100%; height: 150px; object-fit: cover;">
                    <div style="padding: 15px;">
                        <h4 style="margin: 0;">${p.name_ar}</h4>
                        <p style="color: var(--primary); font-weight: bold; margin-top: 5px;">${p.price} ر.س</p>
                    </div>
                </div>
            `).join('')}
        </div>
      `;
      res.send(adminLayout('المنتجات', content, 'products'));
  });
});

// Login/Logout and APIs from server.txt should be here too...
app.get('/admin/login', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html dir="rtl">
      <body style="background: #f8fafc; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">
        <form method="POST" action="/login" style="background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); width: 350px;">
            <h2 style="margin-bottom: 24px; text-align: center;">تسجيل الدخول</h2>
            <input name="username" placeholder="اسم المستخدم" style="width: 100%; padding: 12px; margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <input name="password" type="password" placeholder="كلمة المرور" style="width: 100%; padding: 12px; margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <button style="width: 100%; padding: 12px; background: #6366f1; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600;">دخول</button>
        </form>
      </body>
      </html>
    `);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        res.cookie('admin_auth', username, { signed: true, httpOnly: true });
        res.redirect('/admin');
    } else res.redirect('/admin/login');
});

app.get('/logout', (req, res) => {
    res.clearCookie('admin_auth');
    res.redirect('/admin/login');
});

// REST APIs (Copying from server.txt for functionality)
app.get('/api/orders', (req, res) => {
    db.all('SELECT * FROM orders', (err, rows) => res.json({ status: 'success', orders: rows }));
});

// Start Server
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});