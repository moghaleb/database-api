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

// المسارات المحتملة لملفات SSL
const possibleSSLCertPaths = [
  '/etc/letsencrypt/live/redme.cfd/fullchain.pem',
  '/etc/letsencrypt/live/redme.cfd/cert.pem',
  '/etc/ssl/certs/redme.cfd.crt',
  '/path/to/your/ssl/certificate.crt' // مسار مخصص
];

const possibleSSLKeyPaths = [
  '/etc/letsencrypt/live/redme.cfd/privkey.pem',
  '/etc/ssl/private/redme.cfd.key',
  '/path/to/your/ssl/private.key' // مسار مخصص
];

// البحث عن ملفات SSL
function findSSLCertificates() {
  let certPath = null;
  let keyPath = null;

  // البحث عن الشهادة
  for (const path of possibleSSLCertPaths) {
    if (fs.existsSync(path)) {
      certPath = path;
      console.log(`✅ تم العثور على الشهادة في: ${path}`);
      break;
    }
  }

  // البحث عن المفتاح
  for (const path of possibleSSLKeyPaths) {
    if (fs.existsSync(path)) {
      keyPath = path;
      console.log(`✅ تم العثور على المفتاح في: ${path}`);
      break;
    }
  }

  if (certPath && keyPath) {
    try {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
        secureProtocol: 'TLSv1_2_method',
        ciphers: [
          'ECDHE-RSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES256-GCM-SHA384'
        ].join(':'),
        honorCipherOrder: true
      };
    } catch (error) {
      console.error('❌ خطأ في قراءة ملفات SSL:', error.message);
      return null;
    }
  }

  return null;
}

// محاولة تحميل SSL
sslOptions = findSSLCertificates();
useSSL = sslOptions !== null;

if (!useSSL) {
  console.log('⚠️  لم يتم العثور على شهادات SSL. سيتم استخدام HTTP.');
  console.log('💡 للحصول على شهادة SSL مجانية، قم بتشغيل:');
  console.log('   sudo certbot --nginx -d redme.cfd -d www.redme.cfd');
} else {
  console.log('🔐 تم تحميل شهادات SSL بنجاح!');
}

// ======== Middleware ========
app.use(cors({
  origin: [
    'https://redme.cfd',
    'http://redme.cfd',
    'https://www.redme.cfd',
    'http://www.redme.cfd',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true
}))
app.use(express.json());
const SESSION_SECRET = process.env.SESSION_SECRET || 'redshe_shop_production_secret_2024_change_this';
app.use(cookieParser(SESSION_SECRET));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ======== إعداد بيانات مسؤول افتراضي ========
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USER || 'redshe_admin',
  password: process.env.ADMIN_PASS || 'Redshe@2024!Secure'
};

// ======== دوال المصادقة ========
function isAuthenticated(req) {
  try {
    const auth = req.signedCookies && req.signedCookies.admin_auth;
    if (!auth) return false;
    return auth === ADMIN_CREDENTIALS.username;
  } catch (e) {
    return false;
  }
}

function isLocalRequest(req) {
  try {
    const hostHeader = (req.headers && req.headers.host) ? req.headers.host : '';
    const forwarded = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-forwarded-host']);
    const ip = (req.ip || '').toString();

    if (hostHeader.includes('localhost') || hostHeader.startsWith('127.')) return true;
    if (forwarded && forwarded.toString().includes('127.0.0.1')) return true;
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.0.0.1')) return true;
    return false;
  } catch (e) {
    return false;
  }
}

// ======== إنشاء مجلد التصدير ========
const exportsDir = process.env.NODE_ENV === 'production'
  ? '/var/www/redshe/exports'
  : path.join(__dirname, 'exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
  console.log('✅ تم إنشاء مجلد التصدير:', exportsDir);
}

// ======== Database Configuration ========
const db = new sqlite3.Database(':memory:');

// ======== تهيئة الجداول ========
db.serialize(() => {
  // جدول المستخدمين للاختبار
  db.run(`CREATE TABLE IF NOT EXISTS test_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول المستخدمين:', err);
    } else {
      console.log('✅ تم إنشاء جدول المستخدمين بنجاح');
    }
  });

  // جدول الطلبات - محدث بإضافة حقول طريقة الدفع
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE,
    cart_items TEXT NOT NULL,
    total_amount REAL NOT NULL,
    discount_amount REAL DEFAULT 0,
    coupon_code TEXT,
    coupon_type TEXT,
    gift_card_number TEXT,
    gift_card_type TEXT,
    gift_card_amount REAL DEFAULT 0,
    order_date DATETIME NOT NULL,
    order_status TEXT DEFAULT 'pending',
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    customer_secondary_phone TEXT,

    -- حقول طريقة الدفع الجديدة
    payment_method TEXT DEFAULT 'online',
    transfer_name TEXT,
    transfer_number TEXT,

    -- حقول العنوان الجديدة
    customer_address TEXT,
    address_city TEXT,
    address_area TEXT,
    address_detail TEXT,
    shipping_city TEXT,
    shipping_area TEXT,

    -- معلومات إضافية
    shipping_fee REAL DEFAULT 0,
    final_amount REAL DEFAULT 0,
    order_notes TEXT,
    expected_delivery TEXT,
    items_count INTEGER DEFAULT 0,
    shipping_type TEXT DEFAULT 'توصيل منزلي',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول الطلبات:', err);
    } else {
      console.log('✅ تم إنشاء جدول الطلبات بنجاح مع حقول طريقة الدفع والعنوان');
    }
  });

  // جدول تفاصيل الطلبات - محدث بإضافة product_url
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    total_price REAL NOT NULL,
    product_url TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders (id)
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول تفاصيل الطلبات:', err);
    } else {
      console.log('✅ تم إنشاء جدول تفاصيل الطلبات بنجاح مع حقل product_url');
    }
  });

  // جدول الكوبونات
  db.run(`CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value REAL NOT NULL,
    min_order_amount REAL DEFAULT 0,
    max_uses INTEGER DEFAULT -1,
    used_count INTEGER DEFAULT 0,
    valid_from DATETIME,
    valid_until DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول الكوبونات:', err);
    } else {
      console.log('✅ تم إنشاء جدول الكوبونات بنجاح');

      // إضافة بعض الكوبونات الافتراضية
      db.run(`
        INSERT OR IGNORE INTO coupons (code, description, discount_type, discount_value, min_order_amount, max_uses, valid_from, valid_until)
        VALUES
        ('WELCOME10', 'خصم 10% لأول طلب', 'percentage', 10.0, 50.0, 100, datetime('now'), datetime('now', '+30 days')),
        ('FIXED20', 'خصم ثابت 20 ريال', 'fixed', 20.0, 100.0, 50, datetime('now'), datetime('now', '+15 days')),
        ('SPECIAL30', 'خصم 30% للطلبات فوق 200 ريال', 'percentage', 30.0, 200.0, 30, datetime('now'), datetime('now', '+7 days'))
      `, (err) => {
        if (err) {
          console.error('❌ خطأ في إضافة الكوبونات الافتراضية:', err);
        } else {
          console.log('✅ تمت إضافة الكوبونات الافتراضية بنجاح');
        }
      });
    }
  });

  // جدول القسائم الشرائية
  db.run(`CREATE TABLE IF NOT EXISTS gift_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_number TEXT UNIQUE NOT NULL,
    pin_code TEXT NOT NULL,
    initial_amount REAL NOT NULL,
    current_balance REAL NOT NULL,
    used_amount REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_until DATETIME,
    max_uses INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    customer_name TEXT,
    customer_phone TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول القسائم الشرائية:', err);
    } else {
      console.log('✅ تم إنشاء جدول القسائم الشرائية بنجاح');

      // إضافة بعض القسائم الافتراضية للاختبار
      db.run(`
        INSERT OR IGNORE INTO gift_cards (card_number, pin_code, initial_amount, current_balance, valid_until, customer_name, notes)
        VALUES
        ('GC-1001-2024', '1234', 100.0, 100.0, datetime('now', '+90 days'), 'عميل تجريبي', 'قسيمة ترحيبية'),
        ('GC-1002-2024', '5678', 50.0, 50.0, datetime('now', '+60 days'), 'عميل متميز', 'قسيمة عيد الميلاد'),
        ('GC-1003-2024', '9999', 200.0, 200.0, datetime('now', '+180 days'), 'شركة XYZ', 'قسيمة شركات')
      `, (err) => {
        if (err) {
          console.error('❌ خطأ في إضافة القسائم الافتراضية:', err);
        } else {
          console.log('✅ تمت إضافة القسائم الافتراضية بنجاح');
        }
      });
    }
  });

  // جدول إعدادات الـ admin
  db.run(`CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول إعدادات الـ admin:', err);
    } else {
      console.log('✅ تم إنشاء جدول إعدادات الـ admin بنجاح');

      // إضافة بعض الإعدادات الافتراضية
      db.run(`
        INSERT OR IGNORE INTO admin_settings (setting_key, setting_value)
        VALUES
        ('theme', 'light'),
        ('items_per_page', '10'),
        ('auto_refresh', 'false'),
        ('refresh_interval', '30')
      `, (err) => {
        if (err) {
          console.error('❌ خطأ في إضافة الإعدادات الافتراضية:', err);
        } else {
          console.log('✅ تمت إضافة الإعدادات الافتراضية بنجاح');
        }
      });
    }
  });

  // جدول الإشعارات
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول الإشعارات:', err);
    } else {
      console.log('✅ تم إنشاء جدول الإشعارات بنجاح');

      // إضافة بعض الإشعارات الافتراضية
      db.run(`
        INSERT OR IGNORE INTO notifications (title, message, type)
        VALUES
        ('مرحباً', 'مرحباً بك في نظام الإشعارات الجديد', 'info'),
        ('معلومات', 'يمكنك إدارة الإشعارات من هنا', 'success')
      `, (err) => {
        if (err) {
          console.error('❌ خطأ في إضافة الإشعارات الافتراضية:', err);
        } else {
          console.log('✅ تمت إضافة الإشعارات الافتراضية بنجاح');
        }
      });
    }
  });
});

// ======== دوال تسجيل الدخول ========
function handleLoginRequest(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    if (req.is('application/x-www-form-urlencoded')) {
      return renderLoginPageHTML(req, res, 'اسم المستخدم وكلمة المرور مطلوبان');
    }
    return res.status(400).json({ status: 'error', message: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    res.cookie('admin_auth', ADMIN_CREDENTIALS.username, {
      signed: true,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      domain: process.env.NODE_ENV === 'production' ? '.redme.cfd' : undefined,
      maxAge: 12 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    if (req.is('application/x-www-form-urlencoded')) {
      return res.redirect('/admin');
    }
    return res.json({ status: 'success', message: 'تم تسجيل الدخول بنجاح', redirect: '/admin' });
  }
  if (req.is('application/x-www-form-urlencoded')) {
    return renderLoginPageHTML(req, res, 'بيانات اعتماد غير صحيحة');
  }
  return res.status(401).json({ status: 'error', message: 'بيانات اعتماد غير صحيحة' });
}

function renderLoginPageHTML(req, res, message = '') {
  const msgHtml = message ? `<p style="color:#ef4444;text-align:center;margin-top:12px;font-size:14px">${message}</p>` : '';
  return res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>تسجيل الدخول - لوحة الإدارة</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Tajawal', sans-serif;
          background: linear-gradient(135deg, #0f1729 0%, #1a2338 50%, #0f1729 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        body::before {
          content: '';
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: radial-gradient(ellipse 60% 50% at 50% 30%, rgba(59, 130, 246, 0.06) 0%, transparent 50%);
          pointer-events: none;
        }
        .login-card {
          background: rgba(26, 35, 50, 0.9);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(148, 163, 184, 0.1);
          padding: 40px;
          border-radius: 20px;
          width: 400px;
          max-width: 100%;
          box-shadow: 0 24px 80px rgba(0,0,0,0.4);
          position: relative;
        }
        .login-logo {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #3b82f6, #10b981);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-size: 24px;
          color: white;
          box-shadow: 0 0 30px rgba(59, 130, 246, 0.3);
        }
        h3 {
          text-align: center;
          color: #f1f5f9;
          margin: 0 0 8px;
          font-size: 20px;
        }
        .login-sub {
          text-align: center;
          color: #94a3b8;
          font-size: 14px;
          margin-bottom: 28px;
        }
        label {
          display: block;
          margin: 12px 0 6px;
          color: #cbd5e1;
          font-size: 14px;
          font-weight: 500;
        }
        .input-group {
          position: relative;
        }
        .input-group i {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }
        input {
          width: 100%;
          padding: 12px 14px 12px 40px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          background: rgba(15, 23, 41, 0.6);
          color: #f1f5f9;
          font-size: 15px;
          font-family: 'Tajawal', sans-serif;
          transition: all 0.2s;
        }
        input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        input::placeholder { color: #475569; }
        button {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          border: none;
          border-radius: 10px;
          margin-top: 20px;
          font-size: 16px;
          font-weight: 600;
          font-family: 'Tajawal', sans-serif;
          cursor: pointer;
          transition: all 0.3s;
        }
        button:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
        }
        .help {
          font-size: 13px;
          color: #64748b;
          text-align: center;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid rgba(148, 163, 184, 0.1);
        }
        .help strong {
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <div class="login-card">
        <div class="login-logo"><i class="fas fa-store-alt"></i></div>
        <h3>تسجيل الدخول</h3>
        <p class="login-sub">لوحة إدارة متجر ريدشي</p>
        <form method="post" action="/login">
          <label for="username">اسم المستخدم</label>
          <div class="input-group">
            <i class="fas fa-user"></i>
            <input id="username" name="username" type="text" placeholder="أدخل اسم المستخدم" required>
          </div>
          <label for="password">كلمة المرور</label>
          <div class="input-group">
            <i class="fas fa-lock"></i>
            <input id="password" name="password" type="password" placeholder="أدخل كلمة المرور" required>
          </div>
          <button type="submit"><i class="fas fa-sign-in-alt"></i> دخول</button>
        </form>
        ${msgHtml}
        <div class="help">المستخدم الافتراضي: <strong>admin</strong> / كلمة المرور: <strong>admin1234</strong></div>
      </div>
    </body>
    </html>
  `);
}

// ======== Routes ========

// مسارات تسجيل الدخول
app.post('/login', (req, res) => handleLoginRequest(req, res));
app.get('/admin/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/admin');
  return renderLoginPageHTML(req, res);
});
app.post('/admin/login', (req, res) => handleLoginRequest(req, res));

// مسار تسجيل الخروج
app.get('/logout', (req, res) => {
  res.clearCookie('admin_auth');
  if (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1) {
    return res.json({ status: 'success', message: 'تم تسجيل الخروج' });
  }
  res.redirect('/');
});

// ======== APIs جديدة للتشخيص ========

// API لفحص حالة قاعدة البيانات
app.get('/api/check-db', (req, res) => {
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      return res.status(500).json({
        status: 'error',
        message: 'خطأ في جلب قائمة الجداول',
        error: err.message
      });
    }

    res.json({
      status: 'success',
      message: 'قاعدة البيانات تعمل بشكل صحيح',
      tables: tables.map(t => t.name),
      count: tables.length
    });
  });
});

// API لفحص الاتصال بالخادم
app.get('/api/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'الخادم يعمل بشكل صحيح',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development'
  });
});

// API لاختبار الإعدادات
app.get('/api/settings-test', (req, res) => {
  res.json({
    status: 'success',
    message: 'إعدادات النظام',
    settings: {
      PORT: PORT,
      HOST: HOST,
      NODE_ENV: process.env.NODE_ENV,
      USE_SSL: useSSL,
      ADMIN_USER: ADMIN_CREDENTIALS.username,
      DB_TYPE: 'sqlite'
    }
  });
});

// ======== صفحة الإدارة الرئيسية ========
app.get('/admin', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/admin/login');
  }

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>لوحة التحكم - متجر ريدشي</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <link rel="stylesheet" href="/admin-style.css">
    </head>
    <body>
      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-brand">
            <h2><i class="fas fa-store-alt"></i> ريدشي</h2>
            <div class="brand-sub">لوحة الإدارة</div>
          </div>
          <nav class="sidebar-nav">
            <div class="nav-section">الرئيسية</div>
            <a href="/admin" class="active"><i class="fas fa-chart-pie"></i> <span>لوحة البيانات</span></a>
            <div class="nav-section">الإدارة</div>
            <a href="/admin/orders"><i class="fas fa-shopping-cart"></i> <span>الطلبات</span></a>
            <a href="/admin/coupons"><i class="fas fa-tags"></i> <span>الكوبونات</span></a>
            <a href="/admin/gift-cards"><i class="fas fa-gift"></i> <span>القسائم</span></a>
            <a href="/admin/notifications"><i class="fas fa-bell"></i> <span>الإشعارات</span></a>
            <div class="nav-section">النظام</div>
            <a href="/logout"><i class="fas fa-sign-out-alt"></i> <span>تسجيل الخروج</span></a>
          </nav>
        </aside>
        <main class="main-content">
          <div class="top-bar">
            <div class="page-title"><i class="fas fa-chart-pie"></i> لوحة التحكم</div>
            <div class="user-info">
              <span>مرحباً، ${ADMIN_CREDENTIALS.username}</span>
              <button class="btn btn-danger btn-sm" onclick="logout()">
                <i class="fas fa-sign-out-alt"></i> تسجيل الخروج
              </button>
            </div>
          </div>
          <div class="content">
            <div class="page-hero">
              <h1>مرحباً بك في لوحة التحكم</h1>
              <p>متجر ريدشي - نظرة عامة على بيانات المتجر</p>
            </div>

            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-icon" style="background: rgba(59,130,246,0.1); color: var(--accent); margin: 0 auto 12px;"><i class="fas fa-shopping-cart"></i></div>
                <div class="stat-number" id="orders-count" style="color: var(--accent);">0</div>
                <div class="stat-label">إجمالي الطلبات</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon" style="background: rgba(16,185,129,0.1); color: var(--success-light); margin: 0 auto 12px;"><i class="fas fa-tags"></i></div>
                <div class="stat-number" id="coupons-count" style="color: var(--success-light);">0</div>
                <div class="stat-label">كوبونات الخصم</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon" style="background: rgba(245,158,11,0.1); color: var(--warning-light); margin: 0 auto 12px;"><i class="fas fa-credit-card"></i></div>
                <div class="stat-number" id="gift-cards-count" style="color: var(--warning-light);">0</div>
                <div class="stat-label">قسائم الشراء</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon" style="background: rgba(239,68,68,0.1); color: var(--danger-light); margin: 0 auto 12px;"><i class="fas fa-bell"></i></div>
                <div class="stat-number" id="notifications-count" style="color: var(--danger-light);">0</div>
                <div class="stat-label">إشعارات غير مقروءة</div>
              </div>
            </div>

            <div class="card" style="margin-bottom: 24px;">
              <div class="card-header">
                <div class="card-title"><i class="fas fa-link"></i> روابط سريعة</div>
              </div>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <a href="/admin/orders" class="btn btn-primary"><i class="fas fa-list"></i> إدارة الطلبات</a>
                <a href="/admin/coupons" class="btn btn-success"><i class="fas fa-tags"></i> إدارة الكوبونات</a>
                <a href="/admin/gift-cards" class="btn btn-warning"><i class="fas fa-credit-card"></i> إدارة القسائم</a>
                <a href="/admin/notifications" class="btn btn-danger"><i class="fas fa-bell"></i> إدارة الإشعارات</a>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <div class="card-title"><i class="fas fa-clock"></i> الطلبات الأخيرة</div>
              </div>
              <div class="table-container">
                <table id="recent-orders-table">
                  <thead>
                    <tr>
                      <th>رقم الطلب</th>
                      <th>العميل</th>
                      <th>المبلغ الإجمالي</th>
                      <th>الحالة</th>
                      <th>التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      <div id="notification" class="notification"></div>

      <script>
        // دالة لتسجيل الخروج
        function logout() {
          fetch('/logout', { method: 'GET' })
            .then(response => response.json())
            .then(data => {
              showNotification(data.message, 'success');
              setTimeout(() => {
                window.location.href = '/admin/login';
              }, 1500);
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء تسجيل الخروج', 'error');
            });
        }

        // دالة لعرض الإشعارات
        function showNotification(message, type) {
          const notification = document.getElementById('notification');
          notification.textContent = message;
          notification.className = 'notification notification-' + type;
          notification.classList.add('show');

          setTimeout(() => {
            notification.classList.remove('show');
          }, 3000);
        }

        // جلب البيانات الإحصائية
        function fetchDashboardStats() {
          // جلب عدد الطلبات
          fetch('/api/orders-stats')
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                document.getElementById('orders-count').textContent = data.stats.total;
              }
            })
            .catch(error => {
              console.error('Error fetching orders stats:', error);
            });

          // جلب عدد الكوبونات
          fetch('/api/coupons-stats')
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                document.getElementById('coupons-count').textContent = data.stats.total;
              }
            })
            .catch(error => {
              console.error('Error fetching coupons stats:', error);
            });

          // جلب عدد القسائم
          fetch('/api/gift-cards-stats')
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                document.getElementById('gift-cards-count').textContent = data.stats.total;
              }
            })
            .catch(error => {
              console.error('Error fetching gift cards stats:', error);
            });

          // جلب عدد الإشعارات
          fetch('/api/notifications-stats')
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                document.getElementById('notifications-count').textContent = data.stats.unread;
              }
            })
            .catch(error => {
              console.error('Error fetching notifications stats:', error);
            });
        }

        // جلب الطلبات الأخيرة
        function fetchRecentOrders() {
          fetch('/api/recent-orders')
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                const tbody = document.querySelector('#recent-orders-table tbody');
                tbody.innerHTML = '';

                data.orders.forEach(order => {
                  const row = document.createElement('tr');

                  // تحديد حالة الطلب
                  let statusClass = '';
                  switch(order.order_status) {
                    case 'pending':
                      statusClass = 'status-pending';
                      break;
                    case 'processing':
                      statusClass = 'status-processing';
                      break;
                    case 'completed':
                      statusClass = 'status-completed';
                      break;
                    case 'cancelled':
                      statusClass = 'status-cancelled';
                      break;
                    default:
                      statusClass = 'status-pending';
                  }

                  row.innerHTML = `
                    <td>${order.order_number}</td>
                    <td>${order.customer_name || 'غير محدد'}</td>
                    <td>${order.total_amount} ريال</td>
                    <td><span class="status ${statusClass}">${order.order_status}</span></td>
                    <td>${new Date(order.order_date).toLocaleDateString('ar-SA')}</td>
                  `;

                  tbody.appendChild(row);
                });

                if (data.orders.length === 0) {
                  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">لا توجد طلبات حالياً</td></tr>';
                }
              }
            })
            .catch(error => {
              console.error('Error fetching recent orders:', error);
            });
        }

        // تحميل البيانات عند فتح الصفحة
        document.addEventListener('DOMContentLoaded', function() {
          fetchDashboardStats();
          fetchRecentOrders();
        });
      </script>
    </body>
    </html>
  `);
});

// ======== APIs إحصائيات ========
// API لجلب إحصائيات الطلبات
app.get('/api/orders-stats', (req, res) => {
  const queries = [
    'SELECT COUNT(*) as total FROM orders',
    'SELECT COUNT(*) as pending FROM orders WHERE order_status = "pending"',
    'SELECT COUNT(*) as processing FROM orders WHERE order_status = "processing"',
    'SELECT COUNT(*) as completed FROM orders WHERE order_status = "completed"',
    'SELECT COUNT(*) as cancelled FROM orders WHERE order_status = "cancelled"',
    'SELECT SUM(total_amount) as total_revenue FROM orders WHERE order_status != "cancelled"'
  ];

  Promise.all(queries.map(query =>
    new Promise((resolve, reject) => {
      db.get(query, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })
  ))
    .then(results => {
      res.json({
        status: 'success',
        stats: {
          total: results[0].total,
          pending: results[1].pending,
          processing: results[2].processing,
          completed: results[3].completed,
          cancelled: results[4].cancelled,
          total_revenue: results[5].total_revenue || 0
        }
      });
    })
    .catch(err => {
      console.error('❌ خطأ في جلب إحصائيات الطلبات:', err);
      res.status(500).json({
        status: 'error',
        message: err.message
      });
    });
});

// API لجلب إحصائيات الكوبونات
app.get('/api/coupons-stats', (req, res) => {
  const queries = [
    'SELECT COUNT(*) as total FROM coupons',
    'SELECT COUNT(*) as active FROM coupons WHERE is_active = 1',
    'SELECT SUM(used_count) as total_used FROM coupons'
  ];

  Promise.all(queries.map(query =>
    new Promise((resolve, reject) => {
      db.get(query, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })
  ))
    .then(results => {
      res.json({
        status: 'success',
        stats: {
          total: results[0].total,
          active: results[1].active,
          total_used: results[2].total_used || 0
        }
      });
    })
    .catch(err => {
      console.error('❌ خطأ في جلب إحصائيات الكوبونات:', err);
      res.status(500).json({
        status: 'error',
        message: err.message
      });
    });
});

// API لجلب إحصائيات القسائم
app.get('/api/gift-cards-stats', (req, res) => {
  const queries = [
    'SELECT COUNT(*) as total FROM gift_cards',
    'SELECT COUNT(*) as active FROM gift_cards WHERE is_active = 1',
    'SELECT COUNT(*) as used FROM gift_cards WHERE used_amount > 0',
    'SELECT SUM(current_balance) as total_balance FROM gift_cards WHERE is_active = 1'
  ];

  Promise.all(queries.map(query =>
    new Promise((resolve, reject) => {
      db.get(query, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })
  ))
    .then(results => {
      res.json({
        status: 'success',
        stats: {
          total: results[0].total,
          active: results[1].active,
          used: results[2].used,
          total_balance: results[3].total_balance || 0
        }
      });
    })
    .catch(err => {
      console.error('❌ خطأ في جلب إحصائيات القسائم:', err);
      res.status(500).json({
        status: 'error',
        message: err.message
      });
    });
});

// API لجلب إحصائيات الإشعارات
app.get('/api/notifications-stats', (req, res) => {
  const queries = [
    'SELECT COUNT(*) as total FROM notifications',
    'SELECT COUNT(*) as unread FROM notifications WHERE is_read = 0'
  ];

  Promise.all(queries.map(query =>
    new Promise((resolve, reject) => {
      db.get(query, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })
  ))
    .then(results => {
      res.json({
        status: 'success',
        stats: {
          total: results[0].total,
          unread: results[1].unread
        }
      });
    })
    .catch(err => {
      console.error('❌ خطأ في جلب إحصائيات الإشعارات:', err);
      res.status(500).json({
        status: 'error',
        message: err.message
      });
    });
});

// API لجلب الطلبات الأخيرة
app.get('/api/recent-orders', (req, res) => {
  db.all(`
    SELECT * FROM orders
    ORDER BY created_at DESC
    LIMIT 10
  `, (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب الطلبات الأخيرة:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    res.json({
      status: 'success',
      orders: rows,
      count: rows.length
    });
  });
});

// ======== APIs إدارة الطلبات ========
// API لجلب جميع الطلبات
app.get('/api/orders', (req, res) => {
  const { status, start_date, end_date, customer_name, page = 1, limit = 10 } = req.query;

  let query = 'SELECT * FROM orders';
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('order_status = ?');
    params.push(status);
  }

  if (start_date) {
    conditions.push('order_date >= ?');
    params.push(start_date);
  }

  if (end_date) {
    conditions.push('order_date <= ?');
    params.push(end_date);
  }

  if (customer_name) {
    conditions.push('customer_name LIKE ?');
    params.push(`%${customer_name}%`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  // إضافة ترقيم الصفحات
  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, orders) => {
    if (err) {
      console.error('❌ خطأ في جلب الطلبات:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    // جلب العدد الإجمالي للطلبات للترقيم الصفحي
    let countQuery = 'SELECT COUNT(*) as total FROM orders';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    db.get(countQuery, params.slice(0, -2), (err, countResult) => {
      if (err) {
        console.error('❌ خطأ في جلب عدد الطلبات:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      const totalPages = Math.ceil(countResult.total / parseInt(limit));

      res.json({
        status: 'success',
        orders: orders,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_orders: countResult.total,
          limit: parseInt(limit)
        }
      });
    });
  });
});

// API لجلب طلب محدد
app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      console.error('❌ خطأ في جلب بيانات الطلب:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'الطلب غير موجود'
      });
    }

    // جلب تفاصيل الطلب
    db.all('SELECT * FROM order_items WHERE order_id = ?', [id], (err, items) => {
      if (err) {
        console.error('❌ خطأ في جلب تفاصيل الطلب:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      res.json({
        status: 'success',
        order: order,
        items: items,
        message: 'تم جلب بيانات الطلب بنجاح'
      });
    });
  });
});

// API لتحديث حالة الطلب
app.put('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      status: 'error',
      message: 'حالة الطلب مطلوبة'
    });
  }

  db.run(
    'UPDATE orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id],
    function (err) {
      if (err) {
        console.error('❌ خطأ في تحديث حالة الطلب:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'الطلب غير موجود'
        });
      }

      res.json({
        status: 'success',
        message: 'تم تحديث حالة الطلب بنجاح',
        updated_id: id,
        new_status: status
      });
    }
  );
});

// API لتحديث بيانات الطلب
app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const {
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    address_city,
    address_area,
    address_detail,
    shipping_city,
    shipping_area,
    shipping_fee,
    order_notes,
    expected_delivery,
    shipping_type
  } = req.body;

  db.run(
    `UPDATE orders SET
      customer_name = COALESCE(?, customer_name),
      customer_phone = COALESCE(?, customer_phone),
      customer_email = COALESCE(?, customer_email),
      customer_address = COALESCE(?, customer_address),
      address_city = COALESCE(?, address_city),
      address_area = COALESCE(?, address_area),
      address_detail = COALESCE(?, address_detail),
      shipping_city = COALESCE(?, shipping_city),
      shipping_area = COALESCE(?, shipping_area),
      shipping_fee = COALESCE(?, shipping_fee),
      order_notes = COALESCE(?, order_notes),
      expected_delivery = COALESCE(?, expected_delivery),
      shipping_type = COALESCE(?, shipping_type),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      address_city,
      address_area,
      address_detail,
      shipping_city,
      shipping_area,
      shipping_fee,
      order_notes,
      expected_delivery,
      shipping_type,
      id
    ],
    function (err) {
      if (err) {
        console.error('❌ خطأ في تحديث بيانات الطلب:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'الطلب غير موجود'
        });
      }

      res.json({
        status: 'success',
        message: 'تم تحديث بيانات الطلب بنجاح',
        updated_id: id,
        changes: this.changes
      });
    }
  );
});

// API لحذف طلب
app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;

  // أولاً حذف تفاصيل الطلب
  db.run('DELETE FROM order_items WHERE order_id = ?', [id], (err) => {
    if (err) {
      console.error('❌ خطأ في حذف تفاصيل الطلب:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    // ثم حذف الطلب نفسه
    db.run('DELETE FROM orders WHERE id = ?', [id], function (err) {
      if (err) {
        console.error('❌ خطأ في حذف الطلب:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'الطلب غير موجود'
        });
      }

      console.log('✅ تم حذف الطلب:', { id });

      res.json({
        status: 'success',
        message: 'تم حذف الطلب بنجاح',
        deleted_id: id
      });
    });
  });
});

// API لإنشاء طلب جديد
app.post('/api/orders', (req, res) => {
  const {
    order_number,
    cart_items,
    total_amount,
    discount_amount,
    coupon_code,
    coupon_type,
    gift_card_number,
    gift_card_type,
    gift_card_amount,
    order_date,
    order_status,
    customer_name,
    customer_phone,
    customer_email,
    customer_secondary_phone,
    payment_method,
    transfer_name,
    transfer_number,
    customer_address,
    address_city,
    address_area,
    address_detail,
    shipping_city,
    shipping_area,
    shipping_fee,
    final_amount,
    order_notes,
    expected_delivery,
    items_count,
    shipping_type
  } = req.body;

  if (!order_number || !cart_items || !total_amount) {
    return res.status(400).json({
      status: 'error',
      message: 'رقم الطلب وعناصر السلة والمبلغ الإجمالي مطلوبة'
    });
  }

  db.run(
    `INSERT INTO orders (
      order_number, cart_items, total_amount, discount_amount, coupon_code, coupon_type,
      gift_card_number, gift_card_type, gift_card_amount, order_date, order_status,
      customer_name, customer_phone, customer_email, customer_secondary_phone,
      payment_method, transfer_name, transfer_number,
      customer_address, address_city, address_area, address_detail,
      shipping_city, shipping_area, shipping_fee, final_amount, order_notes,
      expected_delivery, items_count, shipping_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order_number,
      cart_items,
      parseFloat(total_amount),
      discount_amount ? parseFloat(discount_amount) : 0,
      coupon_code || '',
      coupon_type || '',
      gift_card_number || '',
      gift_card_type || '',
      gift_card_amount ? parseFloat(gift_card_amount) : 0,
      order_date || new Date().toISOString(),
      order_status || 'pending',
      customer_name || '',
      customer_phone || '',
      customer_email || '',
      customer_secondary_phone || '',
      payment_method || 'online',
      transfer_name || '',
      transfer_number || '',
      customer_address || '',
      address_city || '',
      address_area || '',
      address_detail || '',
      shipping_city || '',
      shipping_area || '',
      shipping_fee ? parseFloat(shipping_fee) : 0,
      final_amount ? parseFloat(final_amount) : parseFloat(total_amount),
      order_notes || '',
      expected_delivery || '',
      items_count || 0,
      shipping_type || 'توصيل منزلي'
    ],
    function (err) {
      if (err) {
        console.error('❌ خطأ في إنشاء الطلب:', err);
        return res.status(500).json({
          status: 'error',
          message: 'فشل في إنشاء الطلب: ' + err.message
        });
      }

      console.log('✅ تم إنشاء طلب جديد:', { id: this.lastID, order_number });

      res.json({
        status: 'success',
        message: 'تم إنشاء الطلب بنجاح',
        order_id: this.lastID,
        order_number: order_number
      });
    }
  );
});

// API لإضافة عنصر إلى الطلب
app.post('/api/orders/:id/items', (req, res) => {
  const { id } = req.params;
  const {
    product_id,
    product_name,
    quantity,
    price,
    total_price,
    product_url
  } = req.body;

  if (!product_id || !product_name || !quantity || !price) {
    return res.status(400).json({
      status: 'error',
      message: 'بيانات العنصر غير مكتملة'
    });
  }

  db.run(
    `INSERT INTO order_items (
      order_id, product_id, product_name, quantity, price, total_price, product_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      product_id,
      product_name,
      parseInt(quantity),
      parseFloat(price),
      parseFloat(total_price) || (parseFloat(price) * parseInt(quantity)),
      product_url || ''
    ],
    function (err) {
      if (err) {
        console.error('❌ خطأ في إضافة عنصر للطلب:', err);
        return res.status(500).json({
          status: 'error',
          message: 'فشل في إضافة العنصر: ' + err.message
        });
      }

      console.log('✅ تم إضافة عنصر جديد للطلب:', { id: this.lastID, order_id: id, product_name });

      res.json({
        status: 'success',
        message: 'تم إضافة العنصر بنجاح',
        item_id: this.lastID,
        order_id: id
      });
    }
  );
});

// API لتصدير الطلبات إلى Excel
app.get('/api/orders/export', (req, res) => {
  const { status, start_date, end_date } = req.query;

  let query = 'SELECT * FROM orders';
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('order_status = ?');
    params.push(status);
  }

  if (start_date) {
    conditions.push('order_date >= ?');
    params.push(start_date);
  }

  if (end_date) {
    conditions.push('order_date <= ?');
    params.push(end_date);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, async (err, orders) => {
    if (err) {
      console.error('❌ خطأ في جلب الطلبات للتصدير:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('الطلبات');

      // إضافة العناوين
      worksheet.columns = [
        { header: 'رقم الطلب', key: 'order_number', width: 15 },
        { header: 'العميل', key: 'customer_name', width: 20 },
        { header: 'الهاتف', key: 'customer_phone', width: 15 },
        { header: 'البريد الإلكتروني', key: 'customer_email', width: 25 },
        { header: 'المبلغ الإجمالي', key: 'total_amount', width: 15 },
        { header: 'مبلغ الخصم', key: 'discount_amount', width: 15 },
        { header: 'كود الخصم', key: 'coupon_code', width: 15 },
        { header: 'طريقة الدفع', key: 'payment_method', width: 15 },
        { header: 'حالة الطلب', key: 'order_status', width: 15 },
        { header: 'تاريخ الطلب', key: 'order_date', width: 20 },
        { header: 'ملاحظات', key: 'order_notes', width: 30 }
      ];

      // إضافة البيانات
      orders.forEach(order => {
        worksheet.addRow({
          order_number: order.order_number,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          customer_email: order.customer_email,
          total_amount: order.total_amount,
          discount_amount: order.discount_amount,
          coupon_code: order.coupon_code,
          payment_method: order.payment_method,
          order_status: order.order_status,
          order_date: new Date(order.order_date).toLocaleDateString('ar-SA'),
          order_notes: order.order_notes
        });
      });

      // تنسيق العناوين
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // إنشاء اسم ملف فريد
      const fileName = `orders_export_${new Date().toISOString().replace(/:/g, '-')}.xlsx`;
      const filePath = path.join(exportsDir, fileName);

      // حفظ الملف
      await workbook.xlsx.writeFile(filePath);

      console.log('✅ تم تصدير الطلبات إلى:', filePath);

      // إرسال الملف للمستخدم
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('❌ خطأ في إرسال الملف:', err);
        }

        // حذف الملف بعد الإرسال
        setTimeout(() => {
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
              console.error('❌ خطأ في حذف الملف المؤقت:', unlinkErr);
            }
          });
        }, 5000);
      });
    } catch (error) {
      console.error('❌ خطأ في إنشاء ملف Excel:', error);
      res.status(500).json({
        status: 'error',
        message: 'فشل في إنشاء ملف Excel: ' + error.message
      });
    }
  });
});

// ======== APIs إدارة الكوبونات ========
// API لجلب جميع الكوبونات
app.get('/api/coupons', (req, res) => {
  const { active_only, include_expired, page = 1, limit = 10 } = req.query;

  let query = 'SELECT * FROM coupons';
  const conditions = [];
  const params = [];

  if (active_only === 'true') {
    conditions.push('is_active = 1');
  }

  if (include_expired !== 'true') {
    conditions.push('(valid_until IS NULL OR valid_until > datetime("now"))');
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  // إضافة ترقيم الصفحات
  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, coupons) => {
    if (err) {
      console.error('❌ خطأ في جلب الكوبونات:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    // جلب العدد الإجمالي للكوبونات للترقيم الصفحي
    let countQuery = 'SELECT COUNT(*) as total FROM coupons';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    db.get(countQuery, params.slice(0, -2), (err, countResult) => {
      if (err) {
        console.error('❌ خطأ في جلب عدد الكوبونات:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      const totalPages = Math.ceil(countResult.total / parseInt(limit));

      res.json({
        status: 'success',
        coupons: coupons,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_coupons: countResult.total,
          limit: parseInt(limit)
        }
      });
    });
  });
});

// API لجلب كوبون محدد
app.get('/api/coupons/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM coupons WHERE id = ?', [id], (err, coupon) => {
    if (err) {
      console.error('❌ خطأ في جلب بيانات الكوبون:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'الكوبون غير موجود'
      });
    }

    res.json({
      status: 'success',
      coupon: coupon,
      message: 'تم جلب بيانات الكوبون بنجاح'
    });
  });
});

// API لإنشاء كوبون جديد
app.post('/api/coupons', (req, res) => {
  const {
    code,
    description,
    discount_type,
    discount_value,
    min_order_amount,
    max_uses,
    valid_from,
    valid_until,
    is_active
  } = req.body;

  if (!code || !discount_type || !discount_value) {
    return res.status(400).json({
      status: 'error',
      message: 'كود الكوبون ونوع الخصم وقيمة الخصم مطلوبة'
    });
  }

  if (discount_type !== 'percentage' && discount_type !== 'fixed') {
    return res.status(400).json({
      status: 'error',
      message: 'نوع الخصم يجب أن يكون إما percentage أو fixed'
    });
  }

  db.run(
    `INSERT INTO coupons (
      code, description, discount_type, discount_value, min_order_amount, 
      max_uses, valid_from, valid_until, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      description || '',
      discount_type,
      parseFloat(discount_value),
      min_order_amount ? parseFloat(min_order_amount) : 0,
      max_uses ? parseInt(max_uses) : -1,
      valid_from || new Date().toISOString(),
      valid_until || null,
      is_active !== undefined ? (is_active ? 1 : 0) : 1
    ],
    function (err) {
      if (err) {
        console.error('❌ خطأ في إنشاء الكوبون:', err);

        // التحقق من خطأ تكرار الكود
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({
            status: 'error',
            message: 'كود الكوبون موجود بالفعل'
          });
        }

        return res.status(500).json({
          status: 'error',
          message: 'فشل في إنشاء الكوبون: ' + err.message
        });
      }

      console.log('✅ تم إنشاء كوبون جديد:', { id: this.lastID, code });

      res.json({
        status: 'success',
        message: 'تم إنشاء الكوبون بنجاح',
        coupon_id: this.lastID,
        code: code
      });
    }
  );
});

// API لتحديث كوبون
app.put('/api/coupons/:id', (req, res) => {
  const { id } = req.params;
  const {
    code,
    description,
    discount_type,
    discount_value,
    min_order_amount,
    max_uses,
    valid_from,
    valid_until,
    is_active
  } = req.body;

  if (discount_type && discount_type !== 'percentage' && discount_type !== 'fixed') {
    return res.status(400).json({
      status: 'error',
      message: 'نوع الخصم يجب أن يكون إما percentage أو fixed'
    });
  }

  db.run(
    `UPDATE coupons SET
      code = COALESCE(?, code),
      description = COALESCE(?, description),
      discount_type = COALESCE(?, discount_type),
      discount_value = COALESCE(?, discount_value),
      min_order_amount = COALESCE(?, min_order_amount),
      max_uses = COALESCE(?, max_uses),
      valid_from = COALESCE(?, valid_from),
      valid_until = COALESCE(?, valid_until),
      is_active = COALESCE(?, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      code,
      description,
      discount_type,
      discount_value ? parseFloat(discount_value) : null,
      min_order_amount ? parseFloat(min_order_amount) : null,
      max_uses ? parseInt(max_uses) : null,
      valid_from,
      valid_until,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      id
    ],
    function (err) {
      if (err) {
        console.error('❌ خطأ في تحديث الكوبون:', err);

        // التحقق من خطأ تكرار الكود
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({
            status: 'error',
            message: 'كود الكوبون موجود بالفعل'
          });
        }

        return res.status(500).json({
          status: 'error',
          message: 'فشل في تحديث الكوبون: ' + err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'الكوبون غير موجود'
        });
      }

      console.log('✅ تم تحديث الكوبون:', { id, code, is_active });

      res.json({
        status: 'success',
        message: 'تم تحديث الكوبون بنجاح',
        updated_id: id,
        changes: this.changes
      });
    }
  );
});

// API لحذف كوبون
app.delete('/api/coupons/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM coupons WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ خطأ في حذف الكوبون:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'الكوبون غير موجود'
      });
    }

    console.log('✅ تم حذف الكوبون:', { id });

    res.json({
      status: 'success',
      message: 'تم حذف الكوبون بنجاح',
      deleted_id: id
    });
  });
});

// API للتحقق من صلاحية كوبون
app.post('/api/coupons/validate', (req, res) => {
  const { code, order_amount } = req.body;

  if (!code) {
    return res.status(400).json({
      status: 'error',
      message: 'كود الكوبون مطلوب'
    });
  }

  db.get(
    `SELECT * FROM coupons 
     WHERE code = ? AND is_active = 1 
     AND (valid_until IS NULL OR valid_until > datetime('now'))`,
    [code],
    (err, coupon) => {
      if (err) {
        console.error('❌ خطأ في التحقق من الكوبون:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      if (!coupon) {
        return res.status(404).json({
          status: 'error',
          message: 'الكوبون غير موجود أو منتهي الصلاحية'
        });
      }

      // التحقق من الحد الأدنى للطلب
      if (coupon.min_order_amount > 0 && order_amount && parseFloat(order_amount) < coupon.min_order_amount) {
        return res.status(400).json({
          status: 'error',
          message: `الحد الأدنى للطلب هو ${coupon.min_order_amount} ريال`
        });
      }

      // التحقق من الحد الأقصى للاستخدام
      if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
        return res.status(400).json({
          status: 'error',
          message: 'تم الوصول إلى الحد الأقصى لاستخدام هذا الكوبون'
        });
      }

      // حساب قيمة الخصم
      let discount_amount = 0;
      if (coupon.discount_type === 'percentage') {
        discount_amount = (parseFloat(order_amount || 0) * parseFloat(coupon.discount_value)) / 100;
      } else {
        discount_amount = parseFloat(coupon.discount_value);
      }

      res.json({
        status: 'success',
        message: 'الكوبون صالح للاستخدام',
        coupon: {
          id: coupon.id,
          code: coupon.code,
          description: coupon.description,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          discount_amount: discount_amount,
          min_order_amount: coupon.min_order_amount
        }
      });
    }
  );
});

// API لاستخدام كوبون
app.post('/api/coupons/:id/use', (req, res) => {
  const { id } = req.params;
  const { order_id, user_email, discount_amount } = req.body;

  if (!order_id || !discount_amount) {
    return res.status(400).json({
      status: 'error',
      message: 'رقم الطلب ومبلغ الخصم مطلوبان'
    });
  }

  // بدء معاملة
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // زيادة عدد استخدامات الكوبون
    db.run(
      'UPDATE coupons SET used_count = used_count + 1 WHERE id = ?',
      [id],
      function (err) {
        if (err) {
          console.error('❌ خطأ في تحديث عدد استخدامات الكوبون:', err);
          db.run('ROLLBACK');
          return res.status(500).json({
            status: 'error',
            message: 'فشل في استخدام الكوبون: ' + err.message
          });
        }

        if (this.changes === 0) {
          db.run('ROLLBACK');
          return res.status(404).json({
            status: 'error',
            message: 'الكوبون غير موجود'
          });
        }

        // إضافة سجل استخدام الكوبون
        db.run(
          'INSERT INTO coupon_usage (coupon_id, order_id, user_email, discount_amount) VALUES (?, ?, ?, ?)',
          [id, order_id, user_email || '', discount_amount],
          function (err) {
            if (err) {
              console.error('❌ خطأ في تسجيل استخدام الكوبون:', err);
              db.run('ROLLBACK');
              return res.status(500).json({
                status: 'error',
                message: 'فشل في تسجيل استخدام الكوبون: ' + err.message
              });
            }

            // إنهاء المعاملة بنجاح
            db.run('COMMIT', (err) => {
              if (err) {
                console.error('❌ خطأ في إنهاء المعاملة:', err);
                return res.status(500).json({
                  status: 'error',
                  message: 'فشل في إنهاء العملية: ' + err.message
                });
              }

              console.log('✅ تم استخدام الكوبون بنجاح:', { id, order_id, discount_amount });

              res.json({
                status: 'success',
                message: 'تم استخدام الكوبون بنجاح',
                coupon_id: id,
                order_id: order_id,
                discount_amount: discount_amount
              });
            });
          }
        );
      }
    );
  });
});

// API لتصدير الكوبونات إلى Excel
app.get('/api/coupons/export', (req, res) => {
  const { active_only, include_expired } = req.query;

  let query = 'SELECT * FROM coupons';
  const conditions = [];
  const params = [];

  if (active_only === 'true') {
    conditions.push('is_active = 1');
  }

  if (include_expired !== 'true') {
    conditions.push('(valid_until IS NULL OR valid_until > datetime("now"))');
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, async (err, coupons) => {
    if (err) {
      console.error('❌ خطأ في جلب الكوبونات للتصدير:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('الكوبونات');

      // إضافة العناوين
      worksheet.columns = [
        { header: 'الكود', key: 'code', width: 15 },
        { header: 'الوصف', key: 'description', width: 25 },
        { header: 'نوع الخصم', key: 'discount_type', width: 15 },
        { header: 'قيمة الخصم', key: 'discount_value', width: 15 },
        { header: 'الحد الأدنى للطلب', key: 'min_order_amount', width: 15 },
        { header: 'الحد الأقصى للاستخدام', key: 'max_uses', width: 15 },
        { header: 'عدد الاستخدامات', key: 'used_count', width: 15 },
        { header: 'تاريخ البدء', key: 'valid_from', width: 20 },
        { header: 'تاريخ الانتهاء', key: 'valid_until', width: 20 },
        { header: 'الحالة', key: 'is_active', width: 10 }
      ];

      // إضافة البيانات
      coupons.forEach(coupon => {
        worksheet.addRow({
          code: coupon.code,
          description: coupon.description,
          discount_type: coupon.discount_type === 'percentage' ? 'نسبة مئوية' : 'مبلغ ثابت',
          discount_value: coupon.discount_value,
          min_order_amount: coupon.min_order_amount,
          max_uses: coupon.max_uses === -1 ? 'غير محدود' : coupon.max_uses,
          used_count: coupon.used_count,
          valid_from: new Date(coupon.valid_from).toLocaleDateString('ar-SA'),
          valid_until: coupon.valid_until ? new Date(coupon.valid_until).toLocaleDateString('ar-SA') : 'غير محدد',
          is_active: coupon.is_active ? 'نشط' : 'غير نشط'
        });
      });

      // تنسيق العناوين
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // إنشاء اسم ملف فريد
      const fileName = `coupons_export_${new Date().toISOString().replace(/:/g, '-')}.xlsx`;
      const filePath = path.join(exportsDir, fileName);

      // حفظ الملف
      await workbook.xlsx.writeFile(filePath);

      console.log('✅ تم تصدير الكوبونات إلى:', filePath);

      // إرسال الملف للمستخدم
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('❌ خطأ في إرسال الملف:', err);
        }

        // حذف الملف بعد الإرسال
        setTimeout(() => {
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
              console.error('❌ خطأ في حذف الملف المؤقت:', unlinkErr);
            }
          });
        }, 5000);
      });
    } catch (error) {
      console.error('❌ خطأ في إنشاء ملف Excel:', error);
      res.status(500).json({
        status: 'error',
        message: 'فشل في إنشاء ملف Excel: ' + error.message
      });
    }
  });
});

// ======== APIs إدارة القسائم الشرائية ========
// API لجلب جميع القسائم
app.get('/api/gift-cards', (req, res) => {
  const { active_only, include_expired, page = 1, limit = 10 } = req.query;

  let query = 'SELECT * FROM gift_cards';
  const conditions = [];
  const params = [];

  if (active_only === 'true') {
    conditions.push('is_active = 1');
  }

  if (include_expired !== 'true') {
    conditions.push('(valid_until IS NULL OR valid_until > datetime("now"))');
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  // إضافة ترقيم الصفحات
  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, giftCards) => {
    if (err) {
      console.error('❌ خطأ في جلب القسائم:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    // جلب العدد الإجمالي للقسائم للترقيم الصفحي
    let countQuery = 'SELECT COUNT(*) as total FROM gift_cards';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    db.get(countQuery, params.slice(0, -2), (err, countResult) => {
      if (err) {
        console.error('❌ خطأ في جلب عدد القسائم:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      const totalPages = Math.ceil(countResult.total / parseInt(limit));

      res.json({
        status: 'success',
        gift_cards: giftCards,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_gift_cards: countResult.total,
          limit: parseInt(limit)
        }
      });
    });
  });
});

// API لجلب قسيمة محددة
app.get('/api/gift-cards/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM gift_cards WHERE id = ?', [id], (err, giftCard) => {
    if (err) {
      console.error('❌ خطأ في جلب بيانات القسيمة:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (!giftCard) {
      return res.status(404).json({
        status: 'error',
        message: 'القسيمة غير موجودة'
      });
    }

    res.json({
      status: 'success',
      gift_card: giftCard,
      message: 'تم جلب بيانات القسيمة بنجاح'
    });
  });
});

// API لإنشاء قسيمة جديدة
app.post('/api/gift-cards', (req, res) => {
  const {
    card_number,
    pin_code,
    initial_amount,
    valid_until,
    max_uses,
    customer_name,
    customer_phone,
    notes
  } = req.body;

  if (!card_number || !pin_code || !initial_amount) {
    return res.status(400).json({
      status: 'error',
      message: 'رقم القسيمة والرمز السري والمبلغ الأولي مطلوبة'
    });
  }

  db.run(
    `INSERT INTO gift_cards (
      card_number, pin_code, initial_amount, current_balance, used_amount,
      valid_until, max_uses, customer_name, customer_phone, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      card_number,
      pin_code,
      parseFloat(initial_amount),
      parseFloat(initial_amount), // الرصيد الحالي يساوي المبلغ الأولي في البداية
      0, // المبلغ المستخدم في البداية هو 0
      valid_until || null,
      max_uses ? parseInt(max_uses) : 1,
      customer_name || '',
      customer_phone || '',
      notes || ''
    ],
    function (err) {
      if (err) {
        console.error('❌ خطأ في إنشاء القسيمة:', err);

        // التحقق من خطأ تكرار رقم القسيمة
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({
            status: 'error',
            message: 'رقم القسيمة موجود بالفعل'
          });
        }

        return res.status(500).json({
          status: 'error',
          message: 'فشل في إنشاء القسيمة: ' + err.message
        });
      }

      console.log('✅ تم إنشاء قسيمة جديدة:', { id: this.lastID, card_number });

      res.json({
        status: 'success',
        message: 'تم إنشاء القسيمة بنجاح',
        gift_card_id: this.lastID,
        card_number: card_number
      });
    }
  );
});

// API لتحديث قسيمة
app.put('/api/gift-cards/:id', (req, res) => {
  const { id } = req.params;
  const {
    card_number,
    pin_code,
    initial_amount,
    current_balance,
    used_amount,
    valid_until,
    max_uses,
    customer_name,
    customer_phone,
    notes,
    is_active
  } = req.body;

  db.run(
    `UPDATE gift_cards SET
      card_number = COALESCE(?, card_number),
      pin_code = COALESCE(?, pin_code),
      initial_amount = COALESCE(?, initial_amount),
      current_balance = COALESCE(?, current_balance),
      used_amount = COALESCE(?, used_amount),
      valid_until = COALESCE(?, valid_until),
      max_uses = COALESCE(?, max_uses),
      customer_name = COALESCE(?, customer_name),
      customer_phone = COALESCE(?, customer_phone),
      notes = COALESCE(?, notes),
      is_active = COALESCE(?, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      card_number,
      pin_code,
      initial_amount ? parseFloat(initial_amount) : null,
      current_balance ? parseFloat(current_balance) : null,
      used_amount ? parseFloat(used_amount) : null,
      valid_until,
      max_uses ? parseInt(max_uses) : null,
      customer_name,
      customer_phone,
      notes,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      id
    ],
    function (err) {
      if (err) {
        console.error('❌ خطأ في تحديث القسيمة:', err);

        // التحقق من خطأ تكرار رقم القسيمة
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({
            status: 'error',
            message: 'رقم القسيمة موجود بالفعل'
          });
        }

        return res.status(500).json({
          status: 'error',
          message: 'فشل في تحديث القسيمة: ' + err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'القسيمة غير موجودة'
        });
      }

      console.log('✅ تم تحديث القسيمة:', { id, card_number, is_active });

      res.json({
        status: 'success',
        message: 'تم تحديث القسيمة بنجاح',
        updated_id: id,
        changes: this.changes
      });
    }
  );
});

// API لحذف قسيمة
app.delete('/api/gift-cards/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM gift_cards WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ خطأ في حذف القسيمة:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'القسيمة غير موجودة'
      });
    }

    console.log('✅ تم حذف القسيمة:', { id });

    res.json({
      status: 'success',
      message: 'تم حذف القسيمة بنجاح',
      deleted_id: id
    });
  });
});

// API للتحقق من صلاحية قسيمة
app.post('/api/gift-cards/validate', (req, res) => {
  const { card_number, pin_code } = req.body;

  if (!card_number || !pin_code) {
    return res.status(400).json({
      status: 'error',
      message: 'رقم القسيمة والرمز السري مطلوبان'
    });
  }

  db.get(
    `SELECT * FROM gift_cards 
     WHERE card_number = ? AND pin_code = ? AND is_active = 1 
     AND (valid_until IS NULL OR valid_until > datetime('now'))`,
    [card_number, pin_code],
    (err, giftCard) => {
      if (err) {
        console.error('❌ خطأ في التحقق من القسيمة:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      if (!giftCard) {
        return res.status(404).json({
          status: 'error',
          message: 'القسيمة غير موجودة أو منتهية الصلاحية أو البيانات غير صحيحة'
        });
      }

      // التحقق من الرصيد المتاح
      if (giftCard.current_balance <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'لا يوجد رصيد متاح في هذه القسيمة'
        });
      }

      // التحقق من الحد الأقصى للاستخدام
      if (giftCard.max_uses > 0 && giftCard.used_count >= giftCard.max_uses) {
        return res.status(400).json({
          status: 'error',
          message: 'تم الوصول إلى الحد الأقصى لاستخدام هذه القسيمة'
        });
      }

      res.json({
        status: 'success',
        message: 'القسيمة صالحة للاستخدام',
        gift_card: {
          id: giftCard.id,
          card_number: giftCard.card_number,
          current_balance: giftCard.current_balance,
          initial_amount: giftCard.initial_amount,
          valid_until: giftCard.valid_until
        }
      });
    }
  );
});

// API لاستخدام قسيمة
app.post('/api/gift-cards/:id/use', (req, res) => {
  const { id } = req.params;
  const { order_id, user_email, amount } = req.body;

  if (!order_id || !amount) {
    return res.status(400).json({
      status: 'error',
      message: 'رقم الطلب والمبلغ مطلوبان'
    });
  }

  // بدء معاملة
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // جلب بيانات القسيمة
    db.get('SELECT * FROM gift_cards WHERE id = ? AND is_active = 1', [id], (err, giftCard) => {
      if (err) {
        console.error('❌ خطأ في جلب بيانات القسيمة:', err);
        db.run('ROLLBACK');
        return res.status(500).json({
          status: 'error',
          message: 'فشل في استخدام القسيمة: ' + err.message
        });
      }

      if (!giftCard) {
        db.run('ROLLBACK');
        return res.status(404).json({
          status: 'error',
          message: 'القسيمة غير موجودة أو غير نشطة'
        });
      }

      // التحقق من الرصيد المتاح
      if (giftCard.current_balance < parseFloat(amount)) {
        db.run('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: 'الرصيد المتاح في القسيمة غير كافي'
        });
      }

      // تحديث رصيد القسيمة
      const newBalance = giftCard.current_balance - parseFloat(amount);
      const newUsedAmount = giftCard.used_amount + parseFloat(amount);

      db.run(
        `UPDATE gift_cards SET 
         current_balance = ?, 
         used_amount = ?, 
         used_count = used_count + 1,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newBalance, newUsedAmount, id],
        function (err) {
          if (err) {
            console.error('❌ خطأ في تحديث رصيد القسيمة:', err);
            db.run('ROLLBACK');
            return res.status(500).json({
              status: 'error',
              message: 'فشل في استخدام القسيمة: ' + err.message
            });
          }

          // تحديث بيانات العميل إذا كانت موجودة
          if (user_email && !giftCard.customer_name) {
            db.run(
              `UPDATE gift_cards SET 
               customer_name = COALESCE((SELECT customer_name FROM orders WHERE customer_email = ? LIMIT 1), customer_name),
               customer_phone = COALESCE((SELECT customer_phone FROM orders WHERE customer_email = ? LIMIT 1), customer_phone)
               WHERE id = ?`,
              [user_email, user_email, id],
              (err) => {
                if (err) {
                  console.error('❌ خطأ في تحديث بيانات العميل:', err);
                }
              }
            );
          }

          // إنهاء المعاملة بنجاح
          db.run('COMMIT', (err) => {
            if (err) {
              console.error('❌ خطأ في إنهاء المعاملة:', err);
              return res.status(500).json({
                status: 'error',
                message: 'فشل في إنهاء العملية: ' + err.message
              });
            }

            console.log('✅ تم استخدام القسيمة بنجاح:', { id, order_id, amount });

            res.json({
              status: 'success',
              message: 'تم استخدام القسيمة بنجاح',
              gift_card_id: id,
              order_id: order_id,
              amount: amount,
              remaining_balance: newBalance
            });
          });
        }
      );
    });
  });
});

// API لتصدير القسائم إلى Excel
app.get('/api/gift-cards/export', (req, res) => {
  const { active_only, include_expired } = req.query;

  let query = 'SELECT * FROM gift_cards';
  const conditions = [];
  const params = [];

  if (active_only === 'true') {
    conditions.push('is_active = 1');
  }

  if (include_expired !== 'true') {
    conditions.push('(valid_until IS NULL OR valid_until > datetime("now"))');
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, async (err, giftCards) => {
    if (err) {
      console.error('❌ خطأ في جلب القسائم للتصدير:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('القسائم');

      // إضافة العناوين
      worksheet.columns = [
        { header: 'رقم القسيمة', key: 'card_number', width: 15 },
        { header: 'الرمز السري', key: 'pin_code', width: 15 },
        { header: 'المبلغ الأولي', key: 'initial_amount', width: 15 },
        { header: 'الرصيد الحالي', key: 'current_balance', width: 15 },
        { header: 'المبلغ المستخدم', key: 'used_amount', width: 15 },
        { header: 'العميل', key: 'customer_name', width: 20 },
        { header: 'هاتف العميل', key: 'customer_phone', width: 15 },
        { header: 'تاريخ الإصدار', key: 'created_at', width: 20 },
        { header: 'تاريخ الانتهاء', key: 'valid_until', width: 20 },
        { header: 'الحالة', key: 'is_active', width: 10 },
        { header: 'ملاحظات', key: 'notes', width: 30 }
      ];

      // إضافة البيانات
      giftCards.forEach(card => {
        worksheet.addRow({
          card_number: card.card_number,
          pin_code: card.pin_code,
          initial_amount: card.initial_amount,
          current_balance: card.current_balance,
          used_amount: card.used_amount,
          customer_name: card.customer_name || 'غير محدد',
          customer_phone: card.customer_phone || 'غير محدد',
          created_at: new Date(card.created_at).toLocaleDateString('ar-SA'),
          valid_until: card.valid_until ? new Date(card.valid_until).toLocaleDateString('ar-SA') : 'غير محدد',
          is_active: card.is_active ? 'نشطة' : 'غير نشطة',
          notes: card.notes
        });
      });

      // تنسيق العناوين
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // إنشاء اسم ملف فريد
      const fileName = `gift_cards_export_${new Date().toISOString().replace(/:/g, '-')}.xlsx`;
      const filePath = path.join(exportsDir, fileName);

      // حفظ الملف
      await workbook.xlsx.writeFile(filePath);

      console.log('✅ تم تصدير القسائم إلى:', filePath);

      // إرسال الملف للمستخدم
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('❌ خطأ في إرسال الملف:', err);
        }

        // حذف الملف بعد الإرسال
        setTimeout(() => {
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
              console.error('❌ خطأ في حذف الملف المؤقت:', unlinkErr);
            }
          });
        }, 5000);
      });
    } catch (error) {
      console.error('❌ خطأ في إنشاء ملف Excel:', error);
      res.status(500).json({
        status: 'error',
        message: 'فشل في إنشاء ملف Excel: ' + error.message
      });
    }
  });
});

// ======== APIs إدارة الإشعارات ========
// API لجلب جميع الإشعارات
app.get('/api/notifications', (req, res) => {
  const { unread_only, page = 1, limit = 10 } = req.query;

  let query = 'SELECT * FROM notifications';
  const conditions = [];
  const params = [];

  if (unread_only === 'true') {
    conditions.push('is_read = 0');
  }

  // استبعاد الإشعارات المنتهية الصلاحية
  conditions.push('(expires_at IS NULL OR expires_at > datetime("now"))');

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  // إضافة ترقيم الصفحات
  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, notifications) => {
    if (err) {
      console.error('❌ خطأ في جلب الإشعارات:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    // جلب العدد الإجمالي للإشعارات للترقيم الصفحي
    let countQuery = 'SELECT COUNT(*) as total FROM notifications';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    db.get(countQuery, params.slice(0, -2), (err, countResult) => {
      if (err) {
        console.error('❌ خطأ في جلب عدد الإشعارات:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      const totalPages = Math.ceil(countResult.total / parseInt(limit));

      res.json({
        status: 'success',
        notifications: notifications,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_notifications: countResult.total,
          limit: parseInt(limit)
        }
      });
    });
  });
});

// API لجلب إشعار محدد
app.get('/api/notifications/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM notifications WHERE id = ?', [id], (err, notification) => {
    if (err) {
      console.error('❌ خطأ في جلب بيانات الإشعار:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (!notification) {
      return res.status(404).json({
        status: 'error',
        message: 'الإشعار غير موجود'
      });
    }

    res.json({
      status: 'success',
      notification: notification,
      message: 'تم جلب بيانات الإشعار بنجاح'
    });
  });
});

// API لإنشاء إشعار جديد
app.post('/api/notifications', (req, res) => {
  const {
    title,
    message,
    type,
    expires_at
  } = req.body;

  if (!title || !message) {
    return res.status(400).json({
      status: 'error',
      message: 'عنوان الإشعار ومحتوى الإشعار مطلوبان'
    });
  }

  if (type && !['info', 'success', 'warning', 'error'].includes(type)) {
    return res.status(400).json({
      status: 'error',
      message: 'نوع الإشعار يجب أن يكون إما info أو success أو warning أو error'
    });
  }

  db.run(
    `INSERT INTO notifications (
      title, message, type, expires_at
    ) VALUES (?, ?, ?, ?)`,
    [
      title,
      message,
      type || 'info',
      expires_at || null
    ],
    function (err) {
      if (err) {
        console.error('❌ خطأ في إنشاء الإشعار:', err);
        return res.status(500).json({
          status: 'error',
          message: 'فشل في إنشاء الإشعار: ' + err.message
        });
      }

      console.log('✅ تم إنشاء إشعار جديد:', { id: this.lastID, title });

      res.json({
        status: 'success',
        message: 'تم إنشاء الإشعار بنجاح',
        notification_id: this.lastID,
        title: title
      });
    }
  );
});

// API لتحديث إشعار
app.put('/api/notifications/:id', (req, res) => {
  const { id } = req.params;
  const {
    title,
    message,
    type,
    is_read,
    expires_at
  } = req.body;

  if (type && !['info', 'success', 'warning', 'error'].includes(type)) {
    return res.status(400).json({
      status: 'error',
      message: 'نوع الإشعار يجب أن يكون إما info أو success أو warning أو error'
    });
  }

  db.run(
    `UPDATE notifications SET
      title = COALESCE(?, title),
      message = COALESCE(?, message),
      type = COALESCE(?, type),
      is_read = COALESCE(?, is_read),
      expires_at = COALESCE(?, expires_at),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      title,
      message,
      type,
      is_read !== undefined ? (is_read ? 1 : 0) : null,
      expires_at,
      id
    ],
    function (err) {
      if (err) {
        console.error('❌ خطأ في تحديث الإشعار:', err);
        return res.status(500).json({
          status: 'error',
          message: 'فشل في تحديث الإشعار: ' + err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'الإشعار غير موجود'
        });
      }

      console.log('✅ تم تحديث الإشعار:', { id, title, is_read });

      res.json({
        status: 'success',
        message: 'تم تحديث الإشعار بنجاح',
        updated_id: id,
        changes: this.changes
      });
    }
  );
});

// API لحذف إشعار
app.delete('/api/notifications/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM notifications WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ خطأ في حذف الإشعار:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'الإشعار غير موجود'
      });
    }

    console.log('✅ تم حذف الإشعار:', { id });

    res.json({
      status: 'success',
      message: 'تم حذف الإشعار بنجاح',
      deleted_id: id
    });
  });
});

// API لتحديد جميع الإشعارات كمقروءة
app.put('/api/notifications/read-all', (req, res) => {
  db.run(
    'UPDATE notifications SET is_read = 1 WHERE is_read = 0',
    function (err) {
      if (err) {
        console.error('❌ خطأ في تحديث حالة الإشعارات:', err);
        return res.status(500).json({
          status: 'error',
          message: 'فشل في تحديث حالة الإشعارات: ' + err.message
        });
      }

      console.log('✅ تم تحديث جميع الإشعارات كمقروءة');

      res.json({
        status: 'success',
        message: 'تم تحديث جميع الإشعارات كمقروءة',
        updated_count: this.changes
      });
    }
  );
});

// API لحذف جميع الإشعارات المقروءة
app.delete('/api/notifications/read', (req, res) => {
  db.run(
    'DELETE FROM notifications WHERE is_read = 1',
    function (err) {
      if (err) {
        console.error('❌ خطأ في حذف الإشعارات المقروءة:', err);
        return res.status(500).json({
          status: 'error',
          message: 'فشل في حذف الإشعارات المقروءة: ' + err.message
        });
      }

      console.log('✅ تم حذف جميع الإشعارات المقروءة');

      res.json({
        status: 'success',
        message: 'تم حذف جميع الإشعارات المقروءة',
        deleted_count: this.changes
      });
    }
  );
});

// API لتصدير الإشعارات إلى Excel
app.get('/api/notifications/export', (req, res) => {
  const { unread_only } = req.query;

  let query = 'SELECT * FROM notifications';
  const conditions = [];
  const params = [];

  if (unread_only === 'true') {
    conditions.push('is_read = 0');
  }

  // استبعاد الإشعارات المنتهية الصلاحية
  conditions.push('(expires_at IS NULL OR expires_at > datetime("now"))');

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, async (err, notifications) => {
    if (err) {
      console.error('❌ خطأ في جلب الإشعارات للتصدير:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('الإشعارات');

      // إضافة العناوين
      worksheet.columns = [
        { header: 'العنوان', key: 'title', width: 25 },
        { header: 'الرسالة', key: 'message', width: 40 },
        { header: 'النوع', key: 'type', width: 15 },
        { header: 'الحالة', key: 'is_read', width: 10 },
        { header: 'تاريخ الإنشاء', key: 'created_at', width: 20 },
        { header: 'تاريخ الانتهاء', key: 'expires_at', width: 20 }
      ];

      // إضافة البيانات
      notifications.forEach(notification => {
        let typeText = '';
        switch(notification.type) {
          case 'info':
            typeText = 'معلومات';
            break;
          case 'success':
            typeText = 'نجاح';
            break;
          case 'warning':
            typeText = 'تحذير';
            break;
          case 'error':
            typeText = 'خطأ';
            break;
          default:
            typeText = notification.type;
        }

        worksheet.addRow({
          title: notification.title,
          message: notification.message,
          type: typeText,
          is_read: notification.is_read ? 'مقروء' : 'غير مقروء',
          created_at: new Date(notification.created_at).toLocaleDateString('ar-SA'),
          expires_at: notification.expires_at ? new Date(notification.expires_at).toLocaleDateString('ar-SA') : 'غير محدد'
        });
      });

      // تنسيق العناوين
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // إنشاء اسم ملف فريد
      const fileName = `notifications_export_${new Date().toISOString().replace(/:/g, '-')}.xlsx`;
      const filePath = path.join(exportsDir, fileName);

      // حفظ الملف
      await workbook.xlsx.writeFile(filePath);

      console.log('✅ تم تصدير الإشعارات إلى:', filePath);

      // إرسال الملف للمستخدم
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('❌ خطأ في إرسال الملف:', err);
        }

        // حذف الملف بعد الإرسال
        setTimeout(() => {
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
              console.error('❌ خطأ في حذف الملف المؤقت:', unlinkErr);
            }
          });
        }, 5000);
      });
    } catch (error) {
      console.error('❌ خطأ في إنشاء ملف Excel:', error);
      res.status(500).json({
        status: 'error',
        message: 'فشل في إنشاء ملف Excel: ' + error.message
      });
    }
  });
});

// ======== APIs إدارة الإعدادات ========
// API لجلب جميع الإعدادات
app.get('/api/settings', (req, res) => {
  db.all('SELECT * FROM admin_settings ORDER BY setting_key', (err, settings) => {
    if (err) {
      console.error('❌ خطأ في جلب الإعدادات:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    res.json({
      status: 'success',
      settings: settings,
      count: settings.length
    });
  });
});

// API لجلب إعداد محدد
app.get('/api/settings/:key', (req, res) => {
  const { key } = req.params;

  db.get('SELECT * FROM admin_settings WHERE setting_key = ?', [key], (err, setting) => {
    if (err) {
      console.error('❌ خطأ في جلب بيانات الإعداد:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (!setting) {
      return res.status(404).json({
        status: 'error',
        message: 'الإعداد غير موجود'
      });
    }

    res.json({
      status: 'success',
      setting: setting,
      message: 'تم جلب بيانات الإعداد بنجاح'
    });
  });
});

// API لإنشاء إعداد جديد
app.post('/api/settings', (req, res) => {
  const { setting_key, setting_value } = req.body;

  if (!setting_key) {
    return res.status(400).json({
      status: 'error',
      message: 'مفتاح الإعداد مطلوب'
    });
  }

  db.run(
    'INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?)',
    [setting_key, setting_value || ''],
    function (err) {
      if (err) {
        console.error('❌ خطأ في إنشاء الإعداد:', err);

        // التحقق من خطأ تكرار المفتاح
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({
            status: 'error',
            message: 'مفتاح الإعداد موجود بالفعل'
          });
        }

        return res.status(500).json({
          status: 'error',
          message: 'فشل في إنشاء الإعداد: ' + err.message
        });
      }

      console.log('✅ تم إنشاء إعداد جديد:', { id: this.lastID, setting_key });

      res.json({
        status: 'success',
        message: 'تم إنشاء الإعداد بنجاح',
        setting_id: this.lastID,
        setting_key: setting_key
      });
    }
  );
});

// API لتحديث إعداد
app.put('/api/settings/:key', (req, res) => {
  const { key } = req.params;
  const { setting_value } = req.body;

  db.run(
    'UPDATE admin_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
    [setting_value || '', key],
    function (err) {
      if (err) {
        console.error('❌ خطأ في تحديث الإعداد:', err);
        return res.status(500).json({
          status: 'error',
          message: 'فشل في تحديث الإعداد: ' + err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'الإعداد غير موجود'
        });
      }

      console.log('✅ تم تحديث الإعداد:', { key, setting_value });

      res.json({
        status: 'success',
        message: 'تم تحديث الإعداد بنجاح',
        setting_key: key,
        changes: this.changes
      });
    }
  );
});

// API لحذف إعداد
app.delete('/api/settings/:key', (req, res) => {
  const { key } = req.params;

  db.run('DELETE FROM admin_settings WHERE setting_key = ?', [key], function (err) {
    if (err) {
      console.error('❌ خطأ في حذف الإعداد:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'الإعداد غير موجود'
      });
    }

    console.log('✅ تم حذف الإعداد:', { key });

    res.json({
      status: 'success',
      message: 'تم حذف الإعداد بنجاح',
      deleted_key: key
    });
  });
});

// ======== صفحات الإدارة ========
// صفحة إدارة الطلبات
app.get('/admin/orders', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/admin/login');
  }

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>إدارة الطلبات - متجر ريدشي</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <link rel="stylesheet" href="/admin-style.css">
      <style>
        .filters { background: var(--card-bg); padding: 20px; border-radius: 12px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 15px; align-items: flex-end; }
        .actions { display: flex; gap: 5px; }
        .order-item { display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid var(--border); }
        .item-info { flex: 1; }
        .item-price { font-weight: 600; color: var(--text); }
        .order-summary { margin-top: 15px; padding: 15px; background: var(--bg); border-radius: 8px; }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .summary-row.total { font-weight: 700; font-size: 1.1rem; border-top: 1px solid var(--border); padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-brand">
            <h2><i class="fas fa-store-alt"></i> ريدشي</h2>
            <div class="brand-sub">لوحة الإدارة</div>
          </div>
          <nav class="sidebar-nav">
            <div class="nav-section">الرئيسية</div>
            <a href="/admin"><i class="fas fa-chart-pie"></i> <span>لوحة البيانات</span></a>
            <div class="nav-section">الإدارة</div>
            <a href="/admin/orders" class="active"><i class="fas fa-shopping-cart"></i> <span>الطلبات</span></a>
            <a href="/admin/coupons"><i class="fas fa-tags"></i> <span>الكوبونات</span></a>
            <a href="/admin/gift-cards"><i class="fas fa-gift"></i> <span>القسائم</span></a>
            <a href="/admin/notifications"><i class="fas fa-bell"></i> <span>الإشعارات</span></a>
            <div class="nav-section">النظام</div>
            <a href="/logout"><i class="fas fa-sign-out-alt"></i> <span>تسجيل الخروج</span></a>
          </nav>
        </aside>
        <main class="main-content">
          <div class="top-bar">
            <div class="page-title"><i class="fas fa-shopping-cart"></i> إدارة الطلبات</div>
            <div class="user-info">
              <span>مرحباً، ${ADMIN_CREDENTIALS.username}</span>
              <button class="btn btn-danger btn-sm" onclick="logout()">
                <i class="fas fa-sign-out-alt"></i> تسجيل الخروج
              </button>
            </div>
          </div>
          <div class="content">
            <div class="page-hero" style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);">
              <h1><i class="fas fa-shopping-cart"></i> إدارة الطلبات</h1>
              <p>جميع الطلبات المرسلة من تطبيق الجوال</p>
            </div>

        <div class="filters">
          <div class="form-group">
            <label for="status-filter">حالة الطلب</label>
            <select id="status-filter" class="form-control">
              <option value="">جميع الحالات</option>
              <option value="pending">قيد الانتظار</option>
              <option value="processing">قيد المعالجة</option>
              <option value="completed">مكتمل</option>
              <option value="cancelled">ملغي</option>
            </select>
          </div>
          <div class="form-group">
            <label for="start-date">من تاريخ</label>
            <input type="date" id="start-date" class="form-control">
          </div>
          <div class="form-group">
            <label for="end-date">إلى تاريخ</label>
            <input type="date" id="end-date" class="form-control">
          </div>
          <div class="form-group">
            <label for="customer-name">اسم العميل</label>
            <input type="text" id="customer-name" class="form-control" placeholder="ابحث عن العميل">
          </div>
          <button class="btn btn-primary" onclick="filterOrders()">
            <i class="fas fa-filter"></i> تطبيق الفلتر
          </button>
          <button class="btn btn-success" onclick="exportOrders()">
            <i class="fas fa-file-export"></i> تصدير Excel
          </button>
        </div>

        <div class="table-container">
          <table id="orders-table">
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>العميل</th>
                <th>الهاتف</th>
                <th>المبلغ الإجمالي</th>
                <th>الحالة</th>
                <th>التاريخ</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              <!-- سيتم ملء هذه البيانات بواسطة JavaScript -->
            </tbody>
          </table>
          <div class="pagination" id="pagination">
            <!-- سيتم ملء هذه البيانات بواسطة JavaScript -->
          </div>
        </div>
      </div>

      <!-- نافذة منبثقة لعرض تفاصيل الطلب -->
      <div id="order-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">تفاصيل الطلب</h2>
            <button class="close-btn" onclick="closeModal()">&times;</button>
          </div>
          <div class="modal-body" id="order-details">
            <!-- سيتم ملء هذه البيانات بواسطة JavaScript -->
          </div>
        </div>
      </div>

      <!-- نافذة منبثقة لتحديث حالة الطلب -->
      <div id="status-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">تحديث حالة الطلب</h2>
            <button class="close-btn" onclick="closeStatusModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="order-status">حالة الطلب</label>
              <select id="order-status" class="form-control">
                <option value="pending">قيد الانتظار</option>
                <option value="processing">قيد المعالجة</option>
                <option value="completed">مكتمل</option>
                <option value="cancelled">ملغي</option>
              </select>
            </div>
            <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
              <button class="btn btn-secondary" onclick="closeStatusModal()">إلغاء</button>
              <button class="btn btn-primary" onclick="updateOrderStatus()">حفظ</button>
            </div>
          </div>
        </div>
      </div>

      </div>
        </main>
      </div>

      <div id="notification" class="notification"></div>

      <script>
        let currentPage = 1;
        let currentOrderId = null;

        // دالة لتسجيل الخروج
        function logout() {
          fetch('/logout', { method: 'GET' })
            .then(response => response.json())
            .then(data => {
              showNotification(data.message, 'success');
              setTimeout(() => {
                window.location.href = '/admin/login';
              }, 1500);
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء تسجيل الخروج', 'error');
            });
        }

        // دالة لعرض الإشعارات
        function showNotification(message, type) {
          const notification = document.getElementById('notification');
          notification.textContent = message;
          notification.className = 'notification notification-' + type;
          notification.classList.add('show');

          setTimeout(() => {
            notification.classList.remove('show');
          }, 3000);
        }

        // دالة لجلب الطلبات
        function fetchOrders(page = 1) {
          const status = document.getElementById('status-filter').value;
          const startDate = document.getElementById('start-date').value;
          const endDate = document.getElementById('end-date').value;
          const customerName = document.getElementById('customer-name').value;

          const params = new URLSearchParams({
            page: page,
            limit: 10
          });

          if (status) params.append('status', status);
          if (startDate) params.append('start_date', startDate);
          if (endDate) params.append('end_date', endDate);
          if (customerName) params.append('customer_name', customerName);

          fetch('/api/orders?' + params.toString())
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                renderOrdersTable(data.orders);
                renderPagination(data.pagination);
                currentPage = page;
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء جلب الطلبات', 'error');
            });
        }

        // دالة لعرض جدول الطلبات
        function renderOrdersTable(orders) {
          const tbody = document.querySelector('#orders-table tbody');
          tbody.innerHTML = '';

          if (orders.length === 0) {
            tbody.innerHTML = `
              <tr>
                <td colspan="7" class="empty-state">
                  <i class="fas fa-shopping-cart"></i>
                  <p>لا توجد طلبات حالياً</p>
                </td>
              </tr>
            `;
            return;
          }

          orders.forEach(order => {
            // تحديد حالة الطلب
            let statusClass = '';
            switch(order.order_status) {
              case 'pending':
                statusClass = 'status-pending';
                break;
              case 'processing':
                statusClass = 'status-processing';
                break;
              case 'completed':
                statusClass = 'status-completed';
                break;
              case 'cancelled':
                statusClass = 'status-cancelled';
                break;
              default:
                statusClass = 'status-pending';
            }

            const row = document.createElement('tr');
            row.innerHTML = `
              <td>${order.order_number}</td>
              <td>${order.customer_name || 'غير محدد'}</td>
              <td>${order.customer_phone || 'غير محدد'}</td>
              <td>${order.total_amount} ريال</td>
              <td><span class="status ${statusClass}">${order.order_status}</span></td>
              <td>${new Date(order.order_date).toLocaleDateString('ar-SA')}</td>
              <td>
                <div class="actions">
                  <button class="btn btn-primary" onclick="viewOrder(${order.id})">
                    <i class="fas fa-eye"></i>
                  </button>
                  <button class="btn btn-warning" onclick="openStatusModal(${order.id}, '${order.order_status}')">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="btn btn-danger" onclick="deleteOrder(${order.id})">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </td>
            `;

            tbody.appendChild(row);
          });
        }

        // دالة لعرض أزرار الترقيم الصفحي
        function renderPagination(pagination) {
          const paginationContainer = document.getElementById('pagination');
          paginationContainer.innerHTML = '';

          // زر السابق
          const prevBtn = document.createElement('button');
          prevBtn.className = 'page-btn';
          prevBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
          prevBtn.disabled = pagination.current_page === 1;
          prevBtn.onclick = () => fetchOrders(pagination.current_page - 1);
          paginationContainer.appendChild(prevBtn);

          // أرقام الصفحات
          for (let i = 1; i <= pagination.total_pages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = 'page-btn';
            if (i === pagination.current_page) {
              pageBtn.classList.add('active');
            }
            pageBtn.textContent = i;
            pageBtn.onclick = () => fetchOrders(i);
            paginationContainer.appendChild(pageBtn);
          }

          // زر التالي
          const nextBtn = document.createElement('button');
          nextBtn.className = 'page-btn';
          nextBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
          nextBtn.disabled = pagination.current_page === pagination.total_pages;
          nextBtn.onclick = () => fetchOrders(pagination.current_page + 1);
          paginationContainer.appendChild(nextBtn);
        }

        // دالة لتطبيق الفلتر
        function filterOrders() {
          fetchOrders(1);
        }

        // دالة لعرض تفاصيل الطلب
        function viewOrder(id) {
          fetch('/api/orders/' + id)
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                renderOrderDetails(data.order, data.items);
                document.getElementById('order-modal').style.display = 'flex';
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء جلب تفاصيل الطلب', 'error');
            });
        }

        // دالة لعرض تفاصيل الطلب في النافذة المنبثقة
        function renderOrderDetails(order, items) {
          const detailsContainer = document.getElementById('order-details');

          // تحويل عناصر السلة من JSON إذا كانت سلسلة نصية
          let cartItems = [];
          try {
            cartItems = typeof order.cart_items === 'string' ? JSON.parse(order.cart_items) : order.cart_items;
          } catch (e) {
            console.error('Error parsing cart items:', e);
          }

          // تحديد طريقة الدفع
          let paymentMethodText = '';
          switch(order.payment_method) {
            case 'online':
              paymentMethodText = 'دفع إلكتروني';
              break;
            case 'transfer':
              paymentMethodText = 'تحويل بنكي';
              break;
            case 'cash':
              paymentMethodText = 'دفع عند الاستلام';
              break;
            default:
              paymentMethodText = order.payment_method || 'غير محدد';
          }

          // تحديد حالة الطلب
          let statusText = '';
          switch(order.order_status) {
            case 'pending':
              statusText = 'قيد الانتظار';
              break;
            case 'processing':
              statusText = 'قيد المعالجة';
              break;
            case 'completed':
              statusText = 'مكتمل';
              break;
            case 'cancelled':
              statusText = 'ملغي';
              break;
            default:
              statusText = order.order_status || 'غير محدد';
          }

          detailsContainer.innerHTML = `
            <div class="order-details">
              <div class="form-row">
                <div class="form-group">
                  <label>رقم الطلب</label>
                  <p>${order.order_number}</p>
                </div>
                <div class="form-group">
                  <label>تاريخ الطلب</label>
                  <p>${new Date(order.order_date).toLocaleDateString('ar-SA')}</p>
                </div>
                <div class="form-group">
                  <label>الحالة</label>
                  <p><span class="status status-${order.order_status}">${statusText}</span></p>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>اسم العميل</label>
                  <p>${order.customer_name || 'غير محدد'}</p>
                </div>
                <div class="form-group">
                  <label>هاتف العميل</label>
                  <p>${order.customer_phone || 'غير محدد'}</p>
                </div>
                <div class="form-group">
                  <label>البريد الإلكتروني</label>
                  <p>${order.customer_email || 'غير محدد'}</p>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>طريقة الدفع</label>
                  <p>${paymentMethodText}</p>
                </div>
                <div class="form-group">
                  <label>نوع التوصيل</label>
                  <p>${order.shipping_type || 'غير محدد'}</p>
                </div>
                <div class="form-group">
                  <label>رسوم التوصيل</label>
                  <p>${order.shipping_fee || 0} ريال</p>
                </div>
              </div>

              ${order.customer_address ? `
                <div class="form-row">
                  <div class="form-group">
                    <label>العنوان</label>
                    <p>${order.customer_address}</p>
                  </div>
                  <div class="form-group">
                    <label>المدينة</label>
                    <p>${order.address_city || 'غير محدد'}</p>
                  </div>
                  <div class="form-group">
                    <label>المنطقة</label>
                    <p>${order.address_area || 'غير محدد'}</p>
                  </div>
                </div>
              ` : ''}

              ${order.order_notes ? `
                <div class="form-group">
                  <label>ملاحظات الطلب</label>
                  <p>${order.order_notes}</p>
                </div>
              ` : ''}

              <h3>عناصر الطلب</h3>
              <div class="order-items">
                ${items.length > 0 ? items.map(item => `
                  <div class="order-item">
                    <div class="item-info">
                      <h4>${item.product_name}</h4>
                      <p>الكمية: ${item.quantity} × ${item.price} ريال</p>
                    </div>
                    <div class="item-price">${item.total_price} ريال</div>
                  </div>
                `).join('') : `
                  <div class="empty-state">
                    <p>لا توجد عناصر في هذا الطلب</p>
                  </div>
                `}
              </div>

              <div class="order-summary">
                <div class="summary-row">
                  <span>المجموع الفرعي:</span>
                  <span>${order.total_amount} ريال</span>
                </div>
                ${order.discount_amount > 0 ? `
                  <div class="summary-row">
                    <span>الخصم:</span>
                    <span>-${order.discount_amount} ريال</span>
                  </div>
                ` : ''}
                ${order.shipping_fee > 0 ? `
                  <div class="summary-row">
                    <span>رسوم التوصيل:</span>
                    <span>${order.shipping_fee} ريال</span>
                  </div>
                ` : ''}
                <div class="summary-row total">
                  <span>المبلغ الإجمالي:</span>
                  <span>${order.final_amount || order.total_amount} ريال</span>
                </div>
              </div>
            </div>
          `;
        }

        // دالة لفتح نافذة تحديث حالة الطلب
        function openStatusModal(id, currentStatus) {
          currentOrderId = id;
          document.getElementById('order-status').value = currentStatus;
          document.getElementById('status-modal').style.display = 'flex';
        }

        // دالة لإغلاق نافذة تحديث حالة الطلب
        function closeStatusModal() {
          document.getElementById('status-modal').style.display = 'none';
          currentOrderId = null;
        }

        // دالة لتحديث حالة الطلب
        function updateOrderStatus() {
          if (!currentOrderId) return;

          const status = document.getElementById('order-status').value;

          fetch('/api/orders/' + currentOrderId + '/status', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                closeStatusModal();
                fetchOrders(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء تحديث حالة الطلب', 'error');
            });
        }

        // دالة لحذف طلب
        function deleteOrder(id) {
          if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
            return;
          }

          fetch('/api/orders/' + id, {
            method: 'DELETE'
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                fetchOrders(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء حذف الطلب', 'error');
            });
        }

        // دالة لتصدير الطلبات
        function exportOrders() {
          const status = document.getElementById('status-filter').value;
          const startDate = document.getElementById('start-date').value;
          const endDate = document.getElementById('end-date').value;

          const params = new URLSearchParams();
          if (status) params.append('status', status);
          if (startDate) params.append('start_date', startDate);
          if (endDate) params.append('end_date', endDate);

          window.open('/api/orders/export?' + params.toString(), '_blank');
        }

        // دالة لإغلاق النافذة المنبثقة
        function closeModal() {
          document.getElementById('order-modal').style.display = 'none';
        }

        // تحميل البيانات عند فتح الصفحة
        document.addEventListener('DOMContentLoaded', function() {
          fetchOrders();
        });
      </script>
    </body>
    </html>
  `);
});

// صفحة إدارة الكوبونات
app.get('/admin/coupons', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/admin/login');
  }

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>إدارة الكوبونات - متجر ريدشي</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <link rel="stylesheet" href="/admin-style.css">
      <style>
        .filters { background: var(--card-bg); padding: 20px; border-radius: 12px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 15px; align-items: flex-end; }
        .actions { display: flex; gap: 5px; }
        .discount-type { display: flex; gap: 15px; margin-bottom: 15px; }
        .radio-group { display: flex; align-items: center; gap: 5px; }
        .radio-group input { margin-left: 5px; }
      </style>
    </head>
    <body>
      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-brand">
            <h2><i class="fas fa-store-alt"></i> ريدشي</h2>
            <div class="brand-sub">لوحة الإدارة</div>
          </div>
          <nav class="sidebar-nav">
            <div class="nav-section">الرئيسية</div>
            <a href="/admin"><i class="fas fa-chart-pie"></i> <span>لوحة البيانات</span></a>
            <div class="nav-section">الإدارة</div>
            <a href="/admin/orders"><i class="fas fa-shopping-cart"></i> <span>الطلبات</span></a>
            <a href="/admin/coupons" class="active"><i class="fas fa-tags"></i> <span>الكوبونات</span></a>
            <a href="/admin/gift-cards"><i class="fas fa-gift"></i> <span>القسائم</span></a>
            <a href="/admin/notifications"><i class="fas fa-bell"></i> <span>الإشعارات</span></a>
            <div class="nav-section">النظام</div>
            <a href="/logout"><i class="fas fa-sign-out-alt"></i> <span>تسجيل الخروج</span></a>
          </nav>
        </aside>
        <main class="main-content">
          <div class="top-bar">
            <div class="page-title"><i class="fas fa-tags"></i> إدارة الكوبونات</div>
            <div class="user-info">
              <span>مرحباً، ${ADMIN_CREDENTIALS.username}</span>
          <button class="logout-btn" onclick="logout()">
            <i class="fas fa-sign-out-alt"></i> تسجيل الخروج
          </button>
        </div>
          </div>
          <div class="content">
            <div class="page-hero" style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);">
              <h1><i class="fas fa-tags"></i> إدارة الكوبونات</h1>
              <p>إنشاء وتعديل وحذف كوبونات الخصم مع تحديد الصلاحية</p>
            </div>

            <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
              <button class="btn btn-success" onclick="openAddModal()">
                <i class="fas fa-plus"></i> إضافة كوبون جديد
              </button>
            </div>

        <div class="filters">
          <div class="form-group">
            <label for="status-filter">الحالة</label>
            <select id="status-filter" class="form-control">
              <option value="">جميع الكوبونات</option>
              <option value="true">نشط</option>
              <option value="false">غير نشط</option>
            </select>
          </div>
          <div class="form-group">
            <label for="expired-filter">الكوبونات المنتهية</label>
            <select id="expired-filter" class="form-control">
              <option value="false">استبعاد المنتهية</option>
              <option value="true">تضمين المنتهية</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="filterCoupons()">
            <i class="fas fa-filter"></i> تطبيق الفلتر
          </button>
          <button class="btn btn-warning" onclick="exportCoupons()">
            <i class="fas fa-file-export"></i> تصدير Excel
          </button>
        </div>

        <div class="table-container">
          <table id="coupons-table">
            <thead>
              <tr>
                <th>الكود</th>
                <th>الوصف</th>
                <th>نوع الخصم</th>
                <th>قيمة الخصم</th>
                <th>الحد الأدنى للطلب</th>
                <th>الاستخدامات</th>
                <th>صلاحية</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              <!-- سيتم ملء هذه البيانات بواسطة JavaScript -->
            </tbody>
          </table>
          <div class="pagination" id="pagination">
            <!-- سيتم ملء هذه البيانات بواسطة JavaScript -->
          </div>
        </div>
      </div>

      <!-- نافذة منبثقة لإضافة/تحرير كوبون -->
      <div id="coupon-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title" id="modal-title">إضافة كوبون جديد</h2>
            <button class="close-btn" onclick="closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form id="coupon-form">
              <input type="hidden" id="coupon-id">

              <div class="form-group">
                <label for="coupon-code">كود الكوبون</label>
                <input type="text" id="coupon-code" class="form-control" required>
              </div>

              <div class="form-group">
                <label for="coupon-description">الوصف</label>
                <textarea id="coupon-description" class="form-control" rows="3"></textarea>
              </div>

              <div class="form-group">
                <label>نوع الخصم</label>
                <div class="discount-type">
                  <div class="radio-group">
                    <input type="radio" id="discount-percentage" name="discount-type" value="percentage" checked>
                    <label for="discount-percentage">نسبة مئوية (%)</label>
                  </div>
                  <div class="radio-group">
                    <input type="radio" id="discount-fixed" name="discount-type" value="fixed">
                    <label for="discount-fixed">مبلغ ثابت (ريال)</label>
                  </div>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="discount-value">قيمة الخصم</label>
                  <input type="number" id="discount-value" class="form-control" min="0" step="0.01" required>
                </div>

                <div class="form-group">
                  <label for="min-order-amount">الحد الأدنى للطلب</label>
                  <input type="number" id="min-order-amount" class="form-control" min="0" step="0.01" value="0">
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="max-uses">الحد الأقصى للاستخدام</label>
                  <input type="number" id="max-uses" class="form-control" min="-1" value="-1">
                  <small>اترك -1 للاستخدام غير المحدود</small>
                </div>

                <div class="form-group">
                  <label for="valid-from">تاريخ البدء</label>
                  <input type="datetime-local" id="valid-from" class="form-control">
                </div>

                <div class="form-group">
                  <label for="valid-until">تاريخ الانتهاء</label>
                  <input type="datetime-local" id="valid-until" class="form-control">
                  <small>اترك فارغاً لعدم تحديد تاريخ انتهاء</small>
                </div>
              </div>

              <div class="form-group">
                <div class="radio-group">
                  <input type="checkbox" id="is-active" checked>
                  <label for="is-active">كوبون نشط</label>
                </div>
              </div>

              <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div id="notification" class="notification"></div>

      <script>
        let currentPage = 1;
        let editingCouponId = null;

        // دالة لتسجيل الخروج
        function logout() {
          fetch('/logout', { method: 'GET' })
            .then(response => response.json())
            .then(data => {
              showNotification(data.message, 'success');
              setTimeout(() => {
                window.location.href = '/admin/login';
              }, 1500);
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء تسجيل الخروج', 'error');
            });
        }

        // دالة لعرض الإشعارات
        function showNotification(message, type) {
          const notification = document.getElementById('notification');
          notification.textContent = message;
          notification.className = 'notification notification-' + type;
          notification.classList.add('show');

          setTimeout(() => {
            notification.classList.remove('show');
          }, 3000);
        }

        // دالة لجلب الكوبونات
        function fetchCoupons(page = 1) {
          const activeOnly = document.getElementById('status-filter').value;
          const includeExpired = document.getElementById('expired-filter').value;

          const params = new URLSearchParams({
            page: page,
            limit: 10
          });

          if (activeOnly) params.append('active_only', activeOnly);
          if (includeExpired) params.append('include_expired', includeExpired);

          fetch('/api/coupons?' + params.toString())
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                renderCouponsTable(data.coupons);
                renderPagination(data.pagination);
                currentPage = page;
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء جلب الكوبونات', 'error');
            });
        }

        // دالة لعرض جدول الكوبونات
        function renderCouponsTable(coupons) {
          const tbody = document.querySelector('#coupons-table tbody');
          tbody.innerHTML = '';

          if (coupons.length === 0) {
            tbody.innerHTML = `
              <tr>
                <td colspan="9" class="empty-state">
                  <i class="fas fa-tags"></i>
                  <p>لا توجد كوبونات حالياً</p>
                </td>
              </tr>
            `;
            return;
          }

          coupons.forEach(coupon => {
            const row = document.createElement('tr');

            // تحديد حالة الكوبون
            let statusClass = '';
            let statusText = '';

            if (coupon.is_active) {
              // التحقق من انتهاء الصلاحية
              const now = new Date();
              const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null;

              if (validUntil && validUntil < now) {
                statusClass = 'status-inactive';
                statusText = 'منتهي الصلاحية';
              } else {
                statusClass = 'status-active';
                statusText = 'نشط';
              }
            } else {
              statusClass = 'status-inactive';
              statusText = 'غير نشط';
            }

            // تحديد نص نوع الخصم
            let discountTypeText = '';
            if (coupon.discount_type === 'percentage') {
              discountTypeText = `${coupon.discount_value}%`;
            } else {
              discountTypeText = `${coupon.discount_value} ريال`;
            }

            // تحديد نص الاستخدامات
            let usageText = '';
            if (coupon.max_uses === -1) {
              usageText = `${coupon.used_count} / غير محدود`;
            } else {
              usageText = `${coupon.used_count} / ${coupon.max_uses}`;
            }

            // تحديد نص الصلاحية
            let validityText = '';
            if (coupon.valid_until) {
              const validUntil = new Date(coupon.valid_until);
              validityText = validUntil.toLocaleDateString('ar-SA');
            } else {
              validityText = 'غير محدد';
            }

            row.innerHTML = `
              <td>${coupon.code}</td>
              <td>${coupon.description || '-'}</td>
              <td>${discountTypeText}</td>
              <td>${coupon.discount_value}</td>
              <td>${coupon.min_order_amount} ريال</td>
              <td>${usageText}</td>
              <td>${validityText}</td>
              <td><span class="status ${statusClass}">${statusText}</span></td>
              <td>
                <div class="actions">
                  <button class="btn btn-primary" onclick="editCoupon(${coupon.id})">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="btn btn-danger" onclick="deleteCoupon(${coupon.id})">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </td>
            `;

            tbody.appendChild(row);
          });
        }

        // دالة لعرض أزرار الترقيم الصفحي
        function renderPagination(pagination) {
          const paginationContainer = document.getElementById('pagination');
          paginationContainer.innerHTML = '';

          // زر السابق
          const prevBtn = document.createElement('button');
          prevBtn.className = 'page-btn';
          prevBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
          prevBtn.disabled = pagination.current_page === 1;
          prevBtn.onclick = () => fetchCoupons(pagination.current_page - 1);
          paginationContainer.appendChild(prevBtn);

          // أرقام الصفحات
          for (let i = 1; i <= pagination.total_pages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = 'page-btn';
            if (i === pagination.current_page) {
              pageBtn.classList.add('active');
            }
            pageBtn.textContent = i;
            pageBtn.onclick = () => fetchCoupons(i);
            paginationContainer.appendChild(pageBtn);
          }

          // زر التالي
          const nextBtn = document.createElement('button');
          nextBtn.className = 'page-btn';
          nextBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
          nextBtn.disabled = pagination.current_page === pagination.total_pages;
          nextBtn.onclick = () => fetchCoupons(pagination.current_page + 1);
          paginationContainer.appendChild(nextBtn);
        }

        // دالة لتطبيق الفلتر
        function filterCoupons() {
          fetchCoupons(1);
        }

        // دالة لفتح نافذة إضافة كوبون جديد
        function openAddModal() {
          editingCouponId = null;
          document.getElementById('modal-title').textContent = 'إضافة كوبون جديد';
          document.getElementById('coupon-form').reset();
          document.getElementById('coupon-modal').style.display = 'flex';
        }

        // دالة لفتح نافذة تعديل كوبون
        function editCoupon(id) {
          editingCouponId = id;
          document.getElementById('modal-title').textContent = 'تعديل كوبون';

          fetch('/api/coupons/' + id)
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                const coupon = data.coupon;

                document.getElementById('coupon-id').value = coupon.id;
                document.getElementById('coupon-code').value = coupon.code;
                document.getElementById('coupon-description').value = coupon.description || '';

                // تحديد نوع الخصم
                if (coupon.discount_type === 'percentage') {
                  document.getElementById('discount-percentage').checked = true;
                } else {
                  document.getElementById('discount-fixed').checked = true;
                }

                document.getElementById('discount-value').value = coupon.discount_value;
                document.getElementById('min-order-amount').value = coupon.min_order_amount;
                document.getElementById('max-uses').value = coupon.max_uses;

                // تحويل التواريخ إلى التنسيق المناسب
                if (coupon.valid_from) {
                  const validFrom = new Date(coupon.valid_from);
                  document.getElementById('valid-from').value = validFrom.toISOString().slice(0, 16);
                }

                if (coupon.valid_until) {
                  const validUntil = new Date(coupon.valid_until);
                  document.getElementById('valid-until').value = validUntil.toISOString().slice(0, 16);
                }

                document.getElementById('is-active').checked = coupon.is_active ? true : false;

                document.getElementById('coupon-modal').style.display = 'flex';
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء جلب بيانات الكوبون', 'error');
            });
        }

        // دالة لإغلاق النافذة المنبثقة
        function closeModal() {
          document.getElementById('coupon-modal').style.display = 'none';
          editingCouponId = null;
        }

        // دالة لحذف كوبون
        function deleteCoupon(id) {
          if (!confirm('هل أنت متأكد من حذف هذا الكوبون؟')) {
            return;
          }

          fetch('/api/coupons/' + id, {
            method: 'DELETE'
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                fetchCoupons(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء حذف الكوبون', 'error');
            });
        }

        // دالة لتصدير الكوبونات
        function exportCoupons() {
          const activeOnly = document.getElementById('status-filter').value;
          const includeExpired = document.getElementById('expired-filter').value;

          const params = new URLSearchParams();
          if (activeOnly) params.append('active_only', activeOnly);
          if (includeExpired) params.append('include_expired', includeExpired);

          window.open('/api/coupons/export?' + params.toString(), '_blank');
        }

        // معالج حدث إرسال النموذج
        document.getElementById('coupon-form').addEventListener('submit', function(e) {
          e.preventDefault();

          const formData = {
            code: document.getElementById('coupon-code').value,
            description: document.getElementById('coupon-description').value,
            discount_type: document.querySelector('input[name="discount-type"]:checked').value,
            discount_value: parseFloat(document.getElementById('discount-value').value),
            min_order_amount: parseFloat(document.getElementById('min-order-amount').value) || 0,
            max_uses: parseInt(document.getElementById('max-uses').value) || -1,
            valid_from: document.getElementById('valid-from').value,
            valid_until: document.getElementById('valid-until').value,
            is_active: document.getElementById('is-active').checked
          };

          let url, method;
          if (editingCouponId) {
            url = '/api/coupons/' + editingCouponId;
            method = 'PUT';
          } else {
            url = '/api/coupons';
            method = 'POST';
          }

          fetch(url, {
            method: method,
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                closeModal();
                fetchCoupons(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء حفظ الكوبون', 'error');
            });
        });

        // تحميل البيانات عند فتح الصفحة
        document.addEventListener('DOMContentLoaded', function() {
          fetchCoupons();
        });
      </script>
      </div>
        </main>
      </div>
    </body>
    </html>
  `);
});

// صفحة إدارة القسائم الشرائية
app.get('/admin/gift-cards', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/admin/login');
  }

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>إدارة القسائم الشرائية - متجر ريدشي</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <link rel="stylesheet" href="/admin-style.css">
      <style>
        .filters { background: var(--card-bg); padding: 20px; border-radius: 12px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 15px; align-items: flex-end; }
        .actions { display: flex; gap: 5px; }
        .balance-bar { height: 10px; background-color: var(--border); border-radius: 5px; margin-top: 5px; overflow: hidden; }
        .balance-used { height: 100%; background-color: var(--danger); }
        .balance-remaining { height: 100%; background-color: var(--success); }
      </style>
    </head>
    <body>
      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-brand">
            <h2><i class="fas fa-store-alt"></i> ريدشي</h2>
            <div class="brand-sub">لوحة الإدارة</div>
          </div>
          <nav class="sidebar-nav">
            <div class="nav-section">الرئيسية</div>
            <a href="/admin"><i class="fas fa-chart-pie"></i> <span>لوحة البيانات</span></a>
            <div class="nav-section">الإدارة</div>
            <a href="/admin/orders"><i class="fas fa-shopping-cart"></i> <span>الطلبات</span></a>
            <a href="/admin/coupons"><i class="fas fa-tags"></i> <span>الكوبونات</span></a>
            <a href="/admin/gift-cards" class="active"><i class="fas fa-gift"></i> <span>القسائم</span></a>
            <a href="/admin/notifications"><i class="fas fa-bell"></i> <span>الإشعارات</span></a>
            <div class="nav-section">النظام</div>
            <a href="/logout"><i class="fas fa-sign-out-alt"></i> <span>تسجيل الخروج</span></a>
          </nav>
        </aside>
        <main class="main-content">
          <div class="top-bar">
            <div class="page-title"><i class="fas fa-gift"></i> إدارة القسائم الشرائية</div>
            <div class="user-info">
              <span>مرحباً، ${ADMIN_CREDENTIALS.username}</span>
              <button class="btn btn-danger btn-sm" onclick="logout()">
                <i class="fas fa-sign-out-alt"></i> تسجيل الخروج
              </button>
            </div>
          </div>
          <div class="content">
            <div class="page-hero" style="background: linear-gradient(135deg, #9C27B0 0%, #6A1B9A 100%);">
              <h1><i class="fas fa-gift"></i> إدارة القسائم الشرائية</h1>
              <p>إنشاء وتعديل وحذف القسائم الشرائية مع إدارة الرصيد والصلاحية</p>
            </div>

            <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
              <button class="btn btn-success" onclick="openAddModal()">
                <i class="fas fa-plus"></i> إضافة قسيمة جديدة
              </button>
            </div>

        <div class="filters">
          <div class="form-group">
            <label for="status-filter">الحالة</label>
            <select id="status-filter" class="form-control">
              <option value="">جميع القسائم</option>
              <option value="true">نشطة</option>
              <option value="false">غير نشطة</option>
            </select>
          </div>
          <div class="form-group">
            <label for="expired-filter">القسائم المنتهية</label>
            <select id="expired-filter" class="form-control">
              <option value="false">استبعاد المنتهية</option>
              <option value="true">تضمين المنتهية</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="filterGiftCards()">
            <i class="fas fa-filter"></i> تطبيق الفلتر
          </button>
          <button class="btn btn-warning" onclick="exportGiftCards()">
            <i class="fas fa-file-export"></i> تصدير Excel
          </button>
        </div>

        <div class="table-container">
          <table id="gift-cards-table">
            <thead>
              <tr>
                <th>رقم القسيمة</th>
                <th>الرمز السري</th>
                <th>المبلغ</th>
                <th>الرصيد المتبقي</th>
                <th>العميل</th>
                <th>تاريخ الإصدار</th>
                <th>تاريخ الانتهاء</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              <!-- سيتم ملء هذه البيانات بواسطة JavaScript -->
            </tbody>
          </table>
          <div class="pagination" id="pagination">
            <!-- سيتم ملء هذه البيانات بواسطة JavaScript -->
          </div>
        </div>
      </div>

      <!-- نافذة منبثقة لإضافة/تحرير قسيمة -->
      <div id="gift-card-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title" id="modal-title">إضافة قسيمة جديدة</h2>
            <button class="close-btn" onclick="closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form id="gift-card-form">
              <input type="hidden" id="gift-card-id">

              <div class="form-row">
                <div class="form-group">
                  <label for="card-number">رقم القسيمة</label>
                  <input type="text" id="card-number" class="form-control" required>
                </div>

                <div class="form-group">
                  <label for="pin-code">الرمز السري</label>
                  <input type="text" id="pin-code" class="form-control" required>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="initial-amount">المبلغ الأولي</label>
                  <input type="number" id="initial-amount" class="form-control" min="0" step="0.01" required>
                </div>

                <div class="form-group">
                  <label for="max-uses">الحد الأقصى للاستخدام</label>
                  <input type="number" id="max-uses" class="form-control" min="1" value="1">
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="customer-name">اسم العميل</label>
                  <input type="text" id="customer-name" class="form-control">
                </div>

                <div class="form-group">
                  <label for="customer-phone">هاتف العميل</label>
                  <input type="text" id="customer-phone" class="form-control">
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="valid-until">تاريخ الانتهاء</label>
                  <input type="datetime-local" id="valid-until" class="form-control">
                  <small>اترك فارغاً لعدم تحديد تاريخ انتهاء</small>
                </div>

                <div class="form-group">
                  <label for="notes">ملاحظات</label>
                  <textarea id="notes" class="form-control" rows="3"></textarea>
                </div>
              </div>

              <div class="form-group">
                <div class="radio-group">
                  <input type="checkbox" id="is-active" checked>
                  <label for="is-active">قسيمة نشطة</label>
                </div>
              </div>

              <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div id="notification" class="notification"></div>

      <script>
        let currentPage = 1;
        let editingGiftCardId = null;

        // دالة لتسجيل الخروج
        function logout() {
          fetch('/logout', { method: 'GET' })
            .then(response => response.json())
            .then(data => {
              showNotification(data.message, 'success');
              setTimeout(() => {
                window.location.href = '/admin/login';
              }, 1500);
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء تسجيل الخروج', 'error');
            });
        }

        // دالة لعرض الإشعارات
        function showNotification(message, type) {
          const notification = document.getElementById('notification');
          notification.textContent = message;
          notification.className = 'notification notification-' + type;
          notification.classList.add('show');

          setTimeout(() => {
            notification.classList.remove('show');
          }, 3000);
        }

        // دالة لجلب القسائم
        function fetchGiftCards(page = 1) {
          const activeOnly = document.getElementById('status-filter').value;
          const includeExpired = document.getElementById('expired-filter').value;

          const params = new URLSearchParams({
            page: page,
            limit: 10
          });

          if (activeOnly) params.append('active_only', activeOnly);
          if (includeExpired) params.append('include_expired', includeExpired);

          fetch('/api/gift-cards?' + params.toString())
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                renderGiftCardsTable(data.gift_cards);
                renderPagination(data.pagination);
                currentPage = page;
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء جلب القسائم', 'error');
            });
        }

        // دالة لعرض جدول القسائم
        function renderGiftCardsTable(giftCards) {
          const tbody = document.querySelector('#gift-cards-table tbody');
          tbody.innerHTML = '';

          if (giftCards.length === 0) {
            tbody.innerHTML = `
              <tr>
                <td colspan="9" class="empty-state">
                  <i class="fas fa-credit-card"></i>
                  <p>لا توجد قسائم حالياً</p>
                </td>
              </tr>
            `;
            return;
          }

          giftCards.forEach(card => {
            const row = document.createElement('tr');

            // تحديد حالة القسيمة
            let statusClass = '';
            let statusText = '';

            if (card.is_active) {
              // التحقق من انتهاء الصلاحية
              const now = new Date();
              const validUntil = card.valid_until ? new Date(card.valid_until) : null;

              if (validUntil && validUntil < now) {
                statusClass = 'status-inactive';
                statusText = 'منتهية الصلاحية';
              } else if (card.current_balance <= 0) {
                statusClass = 'status-inactive';
                statusText = 'مستخدمة بالكامل';
              } else {
                statusClass = 'status-active';
                statusText = 'نشطة';
              }
            } else {
              statusClass = 'status-inactive';
              statusText = 'غير نشطة';
            }

            // حساب نسبة الرصيد المتبقي
            const remainingPercentage = card.initial_amount > 0 
              ? (card.current_balance / card.initial_amount) * 100 
              : 0;

            row.innerHTML = `
              <td>${card.card_number}</td>
              <td>${card.pin_code}</td>
              <td>${card.initial_amount} ريال</td>
              <td>
                <div>${card.current_balance} ريال</div>
                <div class="balance-bar">
                  <div class="balance-used" style="width: ${100 - remainingPercentage}%"></div>
                  <div class="balance-remaining" style="width: ${remainingPercentage}%"></div>
                </div>
              </td>
              <td>${card.customer_name || 'غير محدد'}</td>
              <td>${new Date(card.created_at).toLocaleDateString('ar-SA')}</td>
              <td>${card.valid_until ? new Date(card.valid_until).toLocaleDateString('ar-SA') : 'غير محدد'}</td>
              <td><span class="status ${statusClass}">${statusText}</span></td>
              <td>
                <div class="actions">
                  <button class="btn btn-primary" onclick="editGiftCard(${card.id})">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="btn btn-danger" onclick="deleteGiftCard(${card.id})">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </td>
            `;

            tbody.appendChild(row);
          });
        }

        // دالة لعرض أزرار الترقيم الصفحي
        function renderPagination(pagination) {
          const paginationContainer = document.getElementById('pagination');
          paginationContainer.innerHTML = '';

          // زر السابق
          const prevBtn = document.createElement('button');
          prevBtn.className = 'page-btn';
          prevBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
          prevBtn.disabled = pagination.current_page === 1;
          prevBtn.onclick = () => fetchGiftCards(pagination.current_page - 1);
          paginationContainer.appendChild(prevBtn);

          // أرقام الصفحات
          for (let i = 1; i <= pagination.total_pages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = 'page-btn';
            if (i === pagination.current_page) {
              pageBtn.classList.add('active');
            }
            pageBtn.textContent = i;
            pageBtn.onclick = () => fetchGiftCards(i);
            paginationContainer.appendChild(pageBtn);
          }

          // زر التالي
          const nextBtn = document.createElement('button');
          nextBtn.className = 'page-btn';
          nextBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
          nextBtn.disabled = pagination.current_page === pagination.total_pages;
          nextBtn.onclick = () => fetchGiftCards(pagination.current_page + 1);
          paginationContainer.appendChild(nextBtn);
        }

        // دالة لتطبيق الفلتر
        function filterGiftCards() {
          fetchGiftCards(1);
        }

        // دالة لفتح نافذة إضافة قسيمة جديدة
        function openAddModal() {
          editingGiftCardId = null;
          document.getElementById('modal-title').textContent = 'إضافة قسيمة جديدة';
          document.getElementById('gift-card-form').reset();
          document.getElementById('gift-card-modal').style.display = 'flex';
        }

        // دالة لفتح نافذة تعديل قسيمة
        function editGiftCard(id) {
          editingGiftCardId = id;
          document.getElementById('modal-title').textContent = 'تعديل قسيمة';

          fetch('/api/gift-cards/' + id)
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                const card = data.gift_card;

                document.getElementById('gift-card-id').value = card.id;
                document.getElementById('card-number').value = card.card_number;
                document.getElementById('pin-code').value = card.pin_code;
                document.getElementById('initial-amount').value = card.initial_amount;
                document.getElementById('max-uses').value = card.max_uses;
                document.getElementById('customer-name').value = card.customer_name || '';
                document.getElementById('customer-phone').value = card.customer_phone || '';

                // تحويل التاريخ إلى التنسيق المناسب
                if (card.valid_until) {
                  const validUntil = new Date(card.valid_until);
                  document.getElementById('valid-until').value = validUntil.toISOString().slice(0, 16);
                }

                document.getElementById('notes').value = card.notes || '';
                document.getElementById('is-active').checked = card.is_active ? true : false;

                document.getElementById('gift-card-modal').style.display = 'flex';
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء جلب بيانات القسيمة', 'error');
            });
        }

        // دالة لإغلاق النافذة المنبثقة
        function closeModal() {
          document.getElementById('gift-card-modal').style.display = 'none';
          editingGiftCardId = null;
        }

        // دالة لحذف قسيمة
        function deleteGiftCard(id) {
          if (!confirm('هل أنت متأكد من حذف هذه القسيمة؟')) {
            return;
          }

          fetch('/api/gift-cards/' + id, {
            method: 'DELETE'
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                fetchGiftCards(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء حذف القسيمة', 'error');
            });
        }

        // دالة لتصدير القسائم
        function exportGiftCards() {
          const activeOnly = document.getElementById('status-filter').value;
          const includeExpired = document.getElementById('expired-filter').value;

          const params = new URLSearchParams();
          if (activeOnly) params.append('active_only', activeOnly);
          if (includeExpired) params.append('include_expired', includeExpired);

          window.open('/api/gift-cards/export?' + params.toString(), '_blank');
        }

        // معالج حدث إرسال النموذج
        document.getElementById('gift-card-form').addEventListener('submit', function(e) {
          e.preventDefault();

          const formData = {
            card_number: document.getElementById('card-number').value,
            pin_code: document.getElementById('pin-code').value,
            initial_amount: parseFloat(document.getElementById('initial-amount').value),
            max_uses: parseInt(document.getElementById('max-uses').value) || 1,
            customer_name: document.getElementById('customer-name').value,
            customer_phone: document.getElementById('customer-phone').value,
            valid_until: document.getElementById('valid-until').value,
            notes: document.getElementById('notes').value,
            is_active: document.getElementById('is-active').checked
          };

          let url, method;
          if (editingGiftCardId) {
            url = '/api/gift-cards/' + editingGiftCardId;
            method = 'PUT';
          } else {
            url = '/api/gift-cards';
            method = 'POST';
          }

          fetch(url, {
            method: method,
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                closeModal();
                fetchGiftCards(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء حفظ القسيمة', 'error');
            });
        });

        // تحميل البيانات عند فتح الصفحة
        document.addEventListener('DOMContentLoaded', function() {
          fetchGiftCards();
        });
      </script>
      </div>
        </main>
      </div>
    </body>
    </html>
  `);
});

// صفحة إدارة الإشعارات
app.get('/admin/notifications', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/admin/login');
  }

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>إدارة الإشعارات - متجر ريدشي</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <link rel="stylesheet" href="/admin-style.css">
      <style>
        .filters { background: var(--card-bg); padding: 20px; border-radius: 12px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 15px; align-items: flex-end; }
        .actions { display: flex; gap: 5px; }
        .notification-type { display: flex; gap: 15px; margin-bottom: 15px; }
        .radio-group { display: flex; align-items: center; gap: 5px; }
        .radio-group input { margin-left: 5px; }
      </style>
    </head>
    <body>
      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-brand">
            <h2><i class="fas fa-store-alt"></i> ريدشي</h2>
            <div class="brand-sub">لوحة الإدارة</div>
          </div>
          <nav class="sidebar-nav">
            <div class="nav-section">الرئيسية</div>
            <a href="/admin"><i class="fas fa-chart-pie"></i> <span>لوحة البيانات</span></a>
            <div class="nav-section">الإدارة</div>
            <a href="/admin/orders"><i class="fas fa-shopping-cart"></i> <span>الطلبات</span></a>
            <a href="/admin/coupons"><i class="fas fa-tags"></i> <span>الكوبونات</span></a>
            <a href="/admin/gift-cards"><i class="fas fa-gift"></i> <span>القسائم</span></a>
            <a href="/admin/notifications" class="active"><i class="fas fa-bell"></i> <span>الإشعارات</span></a>
            <div class="nav-section">النظام</div>
            <a href="/logout"><i class="fas fa-sign-out-alt"></i> <span>تسجيل الخروج</span></a>
          </nav>
        </aside>
        <main class="main-content">
          <div class="top-bar">
            <div class="page-title"><i class="fas fa-bell"></i> إدارة الإشعارات</div>
            <div class="user-info">
              <span>مرحباً، ${ADMIN_CREDENTIALS.username}</span>
              <button class="btn btn-danger btn-sm" onclick="logout()">
                <i class="fas fa-sign-out-alt"></i> تسجيل الخروج
              </button>
            </div>
          </div>
          <div class="content">
            <div class="page-hero" style="background: linear-gradient(135deg, #2196F3 0%, #1565C0 100%);">
              <h1><i class="fas fa-bell"></i> إدارة الإشعارات</h1>
              <p>إنشاء وتعديل وحذف الإشعارات مع إدارة الحالة والصلاحية</p>
            </div>

            <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
              <button class="btn btn-success" onclick="openAddModal()">
                <i class="fas fa-plus"></i> إضافة إشعار جديد
              </button>
            </div>

        <div class="filters">
          <div class="form-group">
            <label for="status-filter">الحالة</label>
            <select id="status-filter" class="form-control">
              <option value="">جميع الإشعارات</option>
              <option value="true">غير مقروءة</option>
              <option value="false">مقروءة</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="filterNotifications()">
            <i class="fas fa-filter"></i> تطبيق الفلتر
          </button>
          <button class="btn btn-warning" onclick="markAllAsRead()">
            <i class="fas fa-check-double"></i> تحديد الكل كمقروء
          </button>
          <button class="btn btn-danger" onclick="deleteReadNotifications()">
            <i class="fas fa-trash"></i> حذف المقروءة
          </button>
          <button class="btn btn-warning" onclick="exportNotifications()">
            <i class="fas fa-file-export"></i> تصدير Excel
          </button>
        </div>

        <div class="table-container">
          <table id="notifications-table">
            <thead>
              <tr>
                <th>العنوان</th>
                <th>الرسالة</th>
                <th>النوع</th>
                <th>الحالة</th>
                <th>التاريخ</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              <!-- سيتم ملء هذه البيانات بواسطة JavaScript -->
            </tbody>
          </table>
          <div class="pagination" id="pagination">
            <!-- سيتم ملء هذه البيانات بواسطة JavaScript -->
          </div>
        </div>
      </div>

      <!-- نافذة منبثقة لإضافة/تحرير إشعار -->
      <div id="notification-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title" id="modal-title">إضافة إشعار جديد</h2>
            <button class="close-btn" onclick="closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form id="notification-form">
              <input type="hidden" id="notification-id">

              <div class="form-group">
                <label for="notification-title">العنوان</label>
                <input type="text" id="notification-title" class="form-control" required>
              </div>

              <div class="form-group">
                <label for="notification-message">الرسالة</label>
                <textarea id="notification-message" class="form-control" rows="4" required></textarea>
              </div>

              <div class="form-group">
                <label>نوع الإشعار</label>
                <div class="notification-type">
                  <div class="radio-group">
                    <input type="radio" id="type-info" name="notification-type" value="info" checked>
                    <label for="type-info">معلومات</label>
                  </div>
                  <div class="radio-group">
                    <input type="radio" id="type-success" name="notification-type" value="success">
                    <label for="type-success">نجاح</label>
                  </div>
                  <div class="radio-group">
                    <input type="radio" id="type-warning" name="notification-type" value="warning">
                    <label for="type-warning">تحذير</label>
                  </div>
                  <div class="radio-group">
                    <input type="radio" id="type-error" name="notification-type" value="error">
                    <label for="type-error">خطأ</label>
                  </div>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="expires-at">تاريخ الانتهاء</label>
                  <input type="datetime-local" id="expires-at" class="form-control">
                  <small>اترك فارغاً لعدم تحديد تاريخ انتهاء</small>
                </div>
              </div>

              <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div id="notification" class="notification"></div>

      <script>
        let currentPage = 1;
        let editingNotificationId = null;

        // دالة لتسجيل الخروج
        function logout() {
          fetch('/logout', { method: 'GET' })
            .then(response => response.json())
            .then(data => {
              showNotification(data.message, 'success');
              setTimeout(() => {
                window.location.href = '/admin/login';
              }, 1500);
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء تسجيل الخروج', 'error');
            });
        }

        // دالة لعرض الإشعارات
        function showNotification(message, type) {
          const notification = document.getElementById('notification');
          notification.textContent = message;
          notification.className = 'notification notification-' + type;
          notification.classList.add('show');

          setTimeout(() => {
            notification.classList.remove('show');
          }, 3000);
        }

        // دالة لجلب الإشعارات
        function fetchNotifications(page = 1) {
          const unreadOnly = document.getElementById('status-filter').value;

          const params = new URLSearchParams({
            page: page,
            limit: 10
          });

          if (unreadOnly) params.append('unread_only', unreadOnly);

          fetch('/api/notifications?' + params.toString())
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                renderNotificationsTable(data.notifications);
                renderPagination(data.pagination);
                currentPage = page;
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء جلب الإشعارات', 'error');
            });
        }

        // دالة لعرض جدول الإشعارات
        function renderNotificationsTable(notifications) {
          const tbody = document.querySelector('#notifications-table tbody');
          tbody.innerHTML = '';

          if (notifications.length === 0) {
            tbody.innerHTML = `
              <tr>
                <td colspan="6" class="empty-state">
                  <i class="fas fa-bell"></i>
                  <p>لا توجد إشعارات حالياً</p>
                </td>
              </tr>
            `;
            return;
          }

          notifications.forEach(notification => {
            const row = document.createElement('tr');

            // تحديد حالة الإشعار
            let statusClass = '';
            let statusText = '';

            if (notification.is_read) {
              statusClass = 'status-read';
              statusText = 'مقروء';
            } else {
              statusClass = 'status-unread';
              statusText = 'غير مقروء';
            }

            // تحديد أيقونة ونوع الإشعار
            let typeIcon = '';
            let typeText = '';

            switch(notification.type) {
              case 'info':
                typeIcon = 'fas fa-info-circle';
                typeText = 'معلومات';
                break;
              case 'success':
                typeIcon = 'fas fa-check-circle';
                typeText = 'نجاح';
                break;
              case 'warning':
                typeIcon = 'fas fa-exclamation-triangle';
                typeText = 'تحذير';
                break;
              case 'error':
                typeIcon = 'fas fa-times-circle';
                typeText = 'خطأ';
                break;
              default:
                typeIcon = 'fas fa-bell';
                typeText = notification.type;
            }

            row.innerHTML = `
              <td>${notification.title}</td>
              <td>${notification.message.length > 50 ? notification.message.substring(0, 50) + '...' : notification.message}</td>
              <td><i class="${typeIcon}"></i> ${typeText}</td>
              <td><span class="status ${statusClass}">${statusText}</span></td>
              <td>${new Date(notification.created_at).toLocaleDateString('ar-SA')}</td>
              <td>
                <div class="actions">
                  <button class="btn btn-primary" onclick="editNotification(${notification.id})">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="btn btn-danger" onclick="deleteNotification(${notification.id})">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </td>
            `;

            tbody.appendChild(row);
          });
        }

        // دالة لعرض أزرار الترقيم الصفحي
        function renderPagination(pagination) {
          const paginationContainer = document.getElementById('pagination');
          paginationContainer.innerHTML = '';

          // زر السابق
          const prevBtn = document.createElement('button');
          prevBtn.className = 'page-btn';
          prevBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
          prevBtn.disabled = pagination.current_page === 1;
          prevBtn.onclick = () => fetchNotifications(pagination.current_page - 1);
          paginationContainer.appendChild(prevBtn);

          // أرقام الصفحات
          for (let i = 1; i <= pagination.total_pages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = 'page-btn';
            if (i === pagination.current_page) {
              pageBtn.classList.add('active');
            }
            pageBtn.textContent = i;
            pageBtn.onclick = () => fetchNotifications(i);
            paginationContainer.appendChild(pageBtn);
          }

          // زر التالي
          const nextBtn = document.createElement('button');
          nextBtn.className = 'page-btn';
          nextBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
          nextBtn.disabled = pagination.current_page === pagination.total_pages;
          nextBtn.onclick = () => fetchNotifications(pagination.current_page + 1);
          paginationContainer.appendChild(nextBtn);
        }

        // دالة لتطبيق الفلتر
        function filterNotifications() {
          fetchNotifications(1);
        }

        // دالة لتحديد جميع الإشعارات كمقروءة
        function markAllAsRead() {
          fetch('/api/notifications/read-all', {
            method: 'PUT'
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                fetchNotifications(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء تحديث حالة الإشعارات', 'error');
            });
        }

        // دالة لحذف جميع الإشعارات المقروءة
        function deleteReadNotifications() {
          if (!confirm('هل أنت متأكد من حذف جميع الإشعارات المقروءة؟')) {
            return;
          }

          fetch('/api/notifications/read', {
            method: 'DELETE'
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                fetchNotifications(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء حذف الإشعارات المقروءة', 'error');
            });
        }

        // دالة لفتح نافذة إضافة إشعار جديد
        function openAddModal() {
          editingNotificationId = null;
          document.getElementById('modal-title').textContent = 'إضافة إشعار جديد';
          document.getElementById('notification-form').reset();
          document.getElementById('notification-modal').style.display = 'flex';
        }

        // دالة لفتح نافذة تعديل إشعار
        function editNotification(id) {
          editingNotificationId = id;
          document.getElementById('modal-title').textContent = 'تعديل إشعار';

          fetch('/api/notifications/' + id)
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                const notification = data.notification;

                document.getElementById('notification-id').value = notification.id;
                document.getElementById('notification-title').value = notification.title;
                document.getElementById('notification-message').value = notification.message;

                // تحديد نوع الإشعار
                if (notification.type) {
                  document.querySelector('input[name="notification-type"][value="' + notification.type + '"]').checked = true;
                }

                // تحويل التاريخ إلى التنسيق المناسب
                if (notification.expires_at) {
                  const expiresAt = new Date(notification.expires_at);
                  document.getElementById('expires-at').value = expiresAt.toISOString().slice(0, 16);
                }

                document.getElementById('notification-modal').style.display = 'flex';
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء جلب بيانات الإشعار', 'error');
            });
        }

        // دالة لإغلاق النافذة المنبثقة
        function closeModal() {
          document.getElementById('notification-modal').style.display = 'none';
          editingNotificationId = null;
        }

        // دالة لحذف إشعار
        function deleteNotification(id) {
          if (!confirm('هل أنت متأكد من حذف هذا الإشعار؟')) {
            return;
          }

          fetch('/api/notifications/' + id, {
            method: 'DELETE'
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                fetchNotifications(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء حذف الإشعار', 'error');
            });
        }

        // دالة لتصدير الإشعارات
        function exportNotifications() {
          const unreadOnly = document.getElementById('status-filter').value;

          const params = new URLSearchParams();
          if (unreadOnly) params.append('unread_only', unreadOnly);

          window.open('/api/notifications/export?' + params.toString(), '_blank');
        }

        // معالج حدث إرسال النموذج
        document.getElementById('notification-form').addEventListener('submit', function(e) {
          e.preventDefault();

          const formData = {
            title: document.getElementById('notification-title').value,
            message: document.getElementById('notification-message').value,
            type: document.querySelector('input[name="notification-type"]:checked').value,
            expires_at: document.getElementById('expires-at').value
          };

          let url, method;
          if (editingNotificationId) {
            url = '/api/notifications/' + editingNotificationId;
            method = 'PUT';
          } else {
            url = '/api/notifications';
            method = 'POST';
          }

          fetch(url, {
            method: method,
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                showNotification(data.message, 'success');
                closeModal();
                fetchNotifications(currentPage);
              } else {
                showNotification(data.message, 'error');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              showNotification('حدث خطأ أثناء حفظ الإشعار', 'error');
            });
        });

        // تحميل البيانات عند فتح الصفحة
        document.addEventListener('DOMContentLoaded', function() {
          fetchNotifications();
        });
      </script>
      </div>
        </main>
      </div>
    </body>
    </html>
  `);
});

// ======== بدء تشغيل الخادم ========
if (useSSL) {
  const https = require('https');
  https.createServer(sslOptions, app).listen(PORT, HOST, () => {
    console.log(`🔐 خادم HTTPS يعمل على https://${HOST}:${PORT}`);
  });
} else {
  app.listen(PORT, HOST, () => {
    console.log(`🌐 خادم HTTP يعمل على http://${HOST}:${PORT}`);
  });
}
