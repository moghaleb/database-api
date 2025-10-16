const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ======== Middleware ========
app.use(cors());
app.use(express.json());
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_session_secret_please_change';
app.use(cookieParser(SESSION_SECRET));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ======== إعداد بيانات مسؤول افتراضي ========
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USER || 'admin',
  password: process.env.ADMIN_PASS || 'admin123'
};

// ======== إنشاء مجلدات البيانات ========
const dataDir = path.join(__dirname, 'data');
const exportsDir = path.join(__dirname, 'exports');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✅ تم إنشاء مجلد البيانات');
}

if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
    console.log('✅ تم إنشاء مجلد التصدير');
}

// ======== Database Configuration - قاعدة بيانات دائمة ========
const dbPath = path.join(dataDir, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
  } else {
    console.log('✅ تم الاتصال بقاعدة البيانات الدائمة:', dbPath);
  }
});

// تفعيل المفاتيح الخارجية وتهيئة الجداول
db.serialize(() => {
  // تفعيل دعم المفاتيح الخارجية
  db.run('PRAGMA foreign_keys = ON');
  
  // تفعيل الوضع الآمن
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  
  // ======== تهيئة الجداول ========
  
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
      console.log('✅ جدول المستخدمين جاهز');
    }
  });

  // جدول الكوبونات الموحد
  db.run(`CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value REAL NOT NULL,
    min_order_amount REAL DEFAULT 0,
    max_discount_amount REAL,
    max_uses INTEGER DEFAULT -1,
    used_count INTEGER DEFAULT 0,
    valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_until DATETIME,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول الكوبونات:', err);
    } else {
      console.log('✅ جدول الكوبونات جاهز');
      
      // إضافة كوبونات افتراضية محسنة (فقط إذا لم تكن موجودة)
      db.get('SELECT COUNT(*) as count FROM coupons', (err, row) => {
        if (err) {
          console.error('❌ خطأ في التحقق من الكوبونات:', err);
          return;
        }
        
        if (row.count === 0) {
          db.run(`INSERT INTO coupons 
            (code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, valid_until) 
            VALUES 
            ('WELCOME10', 'خصم ترحيبي 10%', 'percentage', 10, 50, 25, 100, datetime('now', '+30 days')),
            ('SAVE20', 'خصم ثابت 20 ريال', 'fixed', 20, 100, NULL, 50, datetime('now', '+30 days')),
            ('SUMMER25', 'خصم صيفي 25%', 'percentage', 25, 200, 50, 25, datetime('now', '+15 days'))
          `, function(err) {
            if (err) {
              console.error('❌ خطأ في إضافة الكوبونات الافتراضية:', err);
            } else {
              console.log('✅ تم إضافة الكوبونات الافتراضية');
            }
          });
        }
      });
    }
  });

  // جدول الطلبات
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    cart_items TEXT NOT NULL,
    total_amount REAL NOT NULL,
    discount_amount REAL DEFAULT 0,
    coupon_code TEXT,
    order_date DATETIME NOT NULL,
    order_status TEXT DEFAULT 'pending',
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_email TEXT,
    payment_method TEXT DEFAULT 'online',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول الطلبات:', err);
    } else {
      console.log('✅ جدول الطلبات جاهز');
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
      console.error('❌ خطأ في إنشاء جدول الإعدادات:', err);
    } else {
      console.log('✅ جدول الإعدادات جاهز');
      
      // إضافة إعدادات افتراضية (فقط إذا لم تكن موجودة)
      db.get('SELECT COUNT(*) as count FROM admin_settings', (err, row) => {
        if (err) return;
        
        if (row.count === 0) {
          db.run(`
            INSERT INTO admin_settings (setting_key, setting_value)
            VALUES
            ('theme', 'light'),
            ('items_per_page', '10'),
            ('auto_refresh', 'true'),
            ('refresh_interval', '30'),
            ('store_name', 'متجرنا الإلكتروني'),
            ('store_description', 'أفضل متجر للتسوق الإلكتروني')
          `, function(err) {
            if (err) {
              console.error('❌ خطأ في إضافة الإعدادات الافتراضية:', err);
            } else {
              console.log('✅ تم إضافة الإعدادات الافتراضية');
            }
          });
        }
      });
    }
  });

  // جدول نسخ احتياطي للبيانات
  db.run(`CREATE TABLE IF NOT EXISTS data_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_type TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    backup_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    file_path TEXT
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول النسخ الاحتياطي:', err);
    } else {
      console.log('✅ جدول النسخ الاحتياطي جاهز');
    }
  });
});

// ======== وظائف النسخ الاحتياطي ========

// وظيفة لإنشاء نسخة احتياطية
function createBackup(backupType) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(exportsDir, `backup-${backupType}-${timestamp}.json`);
    
    const backupData = {
      timestamp: new Date().toISOString(),
      type: backupType,
      data: {}
    };

    // جلب البيانات حسب النوع
    let query = '';
    switch(backupType) {
      case 'orders':
        query = 'SELECT * FROM orders';
        break;
      case 'coupons':
        query = 'SELECT * FROM coupons';
        break;
      case 'users':
        query = 'SELECT * FROM test_users';
        break;
      case 'full':
        // سنجمع البيانات من جميع الجداول
        const tables = ['test_users', 'coupons', 'orders', 'admin_settings'];
        let completed = 0;
        const allData = {};
        
        tables.forEach(table => {
          db.all(`SELECT * FROM ${table}`, (err, rows) => {
            if (err) {
              console.error(`❌ خطأ في جلب بيانات ${table}:`, err);
            } else {
              allData[table] = rows;
            }
            
            completed++;
            if (completed === tables.length) {
              backupData.data = allData;
              
              // حفظ الملف
              fs.writeFile(backupFile, JSON.stringify(backupData, null, 2), (err) => {
                if (err) {
                  reject(err);
                  return;
                }

                // تسجيل النسخة الاحتياطية في قاعدة البيانات
                const totalRecords = Object.values(allData).reduce((sum, rows) => sum + rows.length, 0);
                db.run(
                  'INSERT INTO data_backups (backup_type, record_count, file_path) VALUES (?, ?, ?)',
                  [backupType, totalRecords, backupFile],
                  function(err) {
                    if (err) {
                      console.error('❌ خطأ في تسجيل النسخة الاحتياطية:', err);
                    } else {
                      console.log(`✅ تم إنشاء نسخة احتياطية (${backupType}): ${totalRecords} سجل`);
                    }
                    resolve({ file: backupFile, count: totalRecords });
                  }
                );
              });
            }
          });
        });
        return;

      default:
        query = `SELECT * FROM ${backupType}`;
    }

    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      backupData.data = rows;
      
      // حفظ الملف
      fs.writeFile(backupFile, JSON.stringify(backupData, null, 2), (err) => {
        if (err) {
          reject(err);
          return;
        }

        // تسجيل النسخة الاحتياطية في قاعدة البيانات
        db.run(
          'INSERT INTO data_backups (backup_type, record_count, file_path) VALUES (?, ?, ?)',
          [backupType, rows.length, backupFile],
          function(err) {
            if (err) {
              console.error('❌ خطأ في تسجيل النسخة الاحتياطية:', err);
            } else {
              console.log(`✅ تم إنشاء نسخة احتياطية (${backupType}): ${rows.length} سجل`);
            }
            resolve({ file: backupFile, count: rows.length });
          }
        );
      });
    });
  });
}

// مساعدة للتحقق من المصادقة
function isAuthenticated(req) {
  try {
    const auth = req.signedCookies && req.signedCookies.admin_auth;
    if (!auth) return false;
    return auth === ADMIN_CREDENTIALS.username;
  } catch (e) {
    return false;
  }
}

// ======== Middleware لحماية المسارات ========
app.use((req, res, next) => {
  const publicPaths = [
    '/api/test',
    '/api/db-test', 
    '/api/save-data',
    '/api/all-data',
    '/api/process-payment',
    '/api/orders',
    '/api/validate-coupon',
    '/api/use-coupon',
    '/api/coupons',
    '/api/coupons/:id',
    '/login',
    '/admin/login',
    '/logout',
    '/api/backups',
    '/api/download-export'
  ];

  const isPublicPath = publicPaths.some(path => {
    if (path.includes(':')) {
      const pathRegex = new RegExp('^' + path.replace(/:\w+/g, '\\w+') + '$');
      return pathRegex.test(req.path);
    }
    return req.path === path;
  });

  if (isPublicPath) return next();

  if (req.path.startsWith('/admin')) {
    const publicAdminPaths = ['/admin/login', '/admin/logout'];
    if (publicAdminPaths.includes(req.path)) return next();

    if (!isAuthenticated(req)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ status: 'error', message: 'مطلوب تسجيل الدخول' });
      }
      return res.redirect('/admin/login');
    }
  }

  next();
});

// ======== Routes ========

// مساعدة لعرض نموذج تسجيل الدخول
function renderLoginPageHTML(req, res, message = '') {
  const msgHtml = message ? `<p style="color:#d32f2f;text-align:center;margin-top:8px">${message}</p>` : '';
  return res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>تسجيل الدخول</title>
      <style>body{font-family:Segoe UI,Arial;background:#f4f6fb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0} .card{background:#fff;padding:24px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.08);width:360px} label{display:block;margin:8px 0 6px} input{width:100%;padding:10px;border:1px solid #ddd;border-radius:6px} button{width:100%;padding:10px;background:#1976D2;color:#fff;border:0;border-radius:6px;margin-top:12px} .help{font-size:13px;color:#666;text-align:center;margin-top:8px}</style>
    </head>
    <body>
      <div class="card">
        <h3 style="text-align:center;margin:0 0 12px 0">تسجيل الدخول إلى لوحة الإدارة</h3>
        <form method="post" action="/login">
          <label for="username">اسم المستخدم</label>
          <input id="username" name="username" type="text" required>
          <label for="password">كلمة المرور</label>
          <input id="password" name="password" type="password" required>
          <button type="submit">دخول</button>
        </form>
        ${msgHtml}
        <div class="help">المستخدم الافتراضي: <strong>admin</strong> / كلمة المرور: <strong>admin123</strong></div>
      </div>
    </body>
    </html>
  `);
}

// معالج تسجيل الدخول
function handleLoginRequest(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    if (req.is('application/x-www-form-urlencoded')) {
      return renderLoginPageHTML(req, res, 'اسم المستخدم وكلمة المرور مطلوبان');
    }
    return res.status(400).json({ status: 'error', message: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    res.cookie('admin_auth', ADMIN_CREDENTIALS.username, { signed: true, httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
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

app.post('/login', handleLoginRequest);
app.get('/admin/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/admin');
  return renderLoginPageHTML(req, res);
});
app.post('/admin/login', handleLoginRequest);

// مسار تسجيل الخروج
app.get('/logout', (req, res) => {
  res.clearCookie('admin_auth');
  if (req.headers.accept?.includes('application/json')) {
    return res.json({ status: 'success', message: 'تم تسجيل الخروج' });
  }
  res.redirect('/');
});

// API إعدادات الـ admin
app.get('/api/admin-settings', (req, res) => {
  db.all('SELECT * FROM admin_settings ORDER BY setting_key', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب إعدادات الـ admin:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }

    const settings = {};
    rows.forEach(row => { settings[row.setting_key] = row.setting_value; });

    res.json({ status: 'success', settings, count: rows.length, message: `تم العثور على ${rows.length} إعداد` });
  });
});

app.put('/api/admin-settings/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({ status: 'error', message: 'مفتاح الإعداد وقيمته مطلوبان' });
  }

  db.run(`INSERT OR REPLACE INTO admin_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
    [key, String(value)],
    function(err) {
      if (err) {
        console.error('❌ خطأ في تحديث إعداد الـ admin:', err);
        return res.status(500).json({ status: 'error', message: err.message });
      }

      res.json({ status: 'success', message: `✅ تم تحديث الإعداد "${key}" بنجاح`, key, value });
    }
  );
});

// الرابط الأساسي
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: '🚀 نظام اختبار الاتصال يعمل بنجاح!',
    timestamp: new Date().toISOString(),
    database: 'SQLite - قاعدة بيانات دائمة',
    endpoints: [
      'GET /api/test - اختبار الاتصال',
      'GET /api/db-test - اختبار قاعدة البيانات', 
      'POST /api/save-data - حفظ بيانات الاختبار',
      'GET /api/all-data - عرض جميع البيانات',
      'POST /api/process-payment - معالجة الدفع',
      'GET /api/orders - جلب جميع الطلبات',
      'PUT /api/orders/:id/status - تحديث حالة الطلب',
      'POST /api/validate-coupon - التحقق من الكوبون',
      'POST /api/use-coupon - استخدام الكوبون',
      'GET /api/coupons - جلب جميع الكوبونات',
      'GET /api/coupons/:id - جلب كوبون محدد',
      'POST /api/coupons - إنشاء كوبون جديد',
      'PUT /api/coupons/:id - تعديل كوبون',
      'DELETE /api/coupons/:id - حذف كوبون',
      'GET /api/admin-settings - جلب إعدادات الـ admin',
      'PUT /api/admin-settings/:key - تحديث إعداد',
      'POST /api/backup - إنشاء نسخة احتياطية',
      'GET /api/backups - عرض النسخ الاحتياطية',
      'GET /api/export-data - تصدير البيانات إلى Excel',
      'GET /admin - صفحة عرض البيانات',
      'GET /admin/advanced - لوحة التحكم',
      'GET /admin/orders - إدارة الطلبات',
      'GET /admin/coupons - إدارة الكوبونات'
    ]
  });
});

// اختبار الاتصال الأساسي
app.get('/api/test', (req, res) => {
  res.json({
    status: 'success',
    message: '✅ تم الاتصال بالخادم بنجاح!',
    server: 'Render.com',
    environment: 'Production',
    timestamp: new Date().toISOString(),
    arabic_support: 'نظام يدعم اللغة العربية',
    database_type: 'دائمة (ملف)'
  });
});

// اختبار قاعدة البيانات
app.get('/api/db-test', (req, res) => {
  db.get('SELECT 1 as test_value, datetime("now") as server_time', (err, row) => {
    if (err) {
      console.error('❌ خطأ في اختبار قاعدة البيانات:', err);
      return res.status(500).json({ status: 'error', message: 'فشل اختبار قاعدة البيانات: ' + err.message });
    }
    
    res.json({
      status: 'success',
      message: '✅ تم الاتصال بقاعدة البيانات بنجاح!',
      test_value: row.test_value,
      server_time: row.server_time,
      database: 'SQLite - قاعدة بيانات دائمة',
      arabic_message: 'نظام يدعم اللغة العربية بشكل كامل'
    });
  });
});

// حفظ بيانات الاختبار
app.post('/api/save-data', (req, res) => {
  const { name, email, phone, message } = req.body;

  console.log('📨 بيانات مستلمة:', { name, email, phone, message });

  if (!name || !email) {
    return res.status(400).json({ status: 'error', message: 'الاسم والبريد الإلكتروني مطلوبان' });
  }

  db.run('INSERT INTO test_users (name, email, phone, message) VALUES (?, ?, ?, ?)',
    [name, email, phone || '', message || ''],
    function(err) {
      if (err) {
        console.error('❌ خطأ في حفظ البيانات:', err);
        return res.status(500).json({ status: 'error', message: 'فشل في حفظ البيانات: ' + err.message });
      }

      console.log('✅ بيانات محفوظة برقم:', this.lastID);
      
      res.json({
        status: 'success',
        message: '✅ تم حفظ البيانات بنجاح!',
        insert_id: this.lastID,
        data: { name, email, phone: phone || '', message: message || '' },
        timestamp: new Date().toISOString(),
        arabic_message: 'تم الحفظ بنجاح في قاعدة البيانات'
      });
    }
  );
});

// عرض جميع البيانات المحفوظة
app.get('/api/all-data', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب البيانات:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }

    res.json({
      status: 'success',
      users: rows,
      count: rows.length,
      message: `تم العثور على ${rows.length} سجل`,
      arabic_message: `تم العثور على ${rows.length} سجل في قاعدة البيانات`
    });
  });
});

// ======== نظام الكوبونات الموحد ========

// API التحقق من الكوبون - نظام موحد
app.post('/api/validate-coupon', (req, res) => {
  const { coupon_code, order_amount } = req.body;
  console.log('🎫 التحقق من الكوبون:', { coupon_code, order_amount });

  if (!coupon_code) {
    return res.status(400).json({
      status: 'error',
      message: 'كود الكوبون مطلوب'
    });
  }

  db.get(
    `SELECT * FROM coupons 
     WHERE code = ? AND is_active = 1 
     AND (valid_from IS NULL OR valid_from <= datetime('now'))
     AND (valid_until IS NULL OR valid_until >= datetime('now'))`,
    [coupon_code.toUpperCase()],
    (err, coupon) => {
      if (err) {
        console.error('❌ خطأ في البحث عن الكوبون:', err);
        return res.status(500).json({
          status: 'error',
          message: 'خطأ في التحقق من الكوبون'
        });
      }

      if (!coupon) {
        return res.status(404).json({
          status: 'error',
          message: 'كود الكوبون غير صالح أو منتهي الصلاحية'
        });
      }

      // التحقق من الحد الأقصى للاستخدام
      if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
        return res.status(400).json({
          status: 'error',
          message: 'تم استخدام هذا الكوبون لأقصى عدد مرات'
        });
      }

      // التحقق من الحد الأدنى للطلب
      const orderAmount = parseFloat(order_amount) || 0;
      if (orderAmount < coupon.min_order_amount) {
        return res.status(400).json({
          status: 'error',
          message: `الحد الأدنى للطلب لاستخدام هذا الكوبون هو ${coupon.min_order_amount} ر.س`
        });
      }

      // حساب قيمة الخصم مع جميع الشروط
      let discountAmount = 0;
      
      if (coupon.discount_type === 'percentage') {
        discountAmount = (orderAmount * coupon.discount_value) / 100;
        
        // تطبيق الحد الأقصى للخصم إذا كان محدداً
        if (coupon.max_discount_amount && discountAmount > coupon.max_discount_amount) {
          discountAmount = coupon.max_discount_amount;
        }
      } else {
        discountAmount = coupon.discount_value;
      }

      // التأكد من أن الخصم لا يتجاوز قيمة الطلب
      if (discountAmount > orderAmount) {
        discountAmount = orderAmount;
      }

      const finalAmount = orderAmount - discountAmount;

      res.json({
        status: 'success',
        message: 'الكوبون صالح',
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          description: coupon.description,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          discount_amount: parseFloat(discountAmount.toFixed(2)),
          final_amount: parseFloat(finalAmount.toFixed(2)),
          min_order_amount: coupon.min_order_amount,
          max_discount_amount: coupon.max_discount_amount,
          max_uses: coupon.max_uses,
          used_count: coupon.used_count
        }
      });
    }
  );
});

// API استخدام الكوبون مع التحقق الإضافي
app.post('/api/use-coupon', (req, res) => {
  const { coupon_code, order_amount } = req.body;

  if (!coupon_code) {
    return res.status(400).json({
      status: 'error',
      message: 'كود الكوبون مطلوب'
    });
  }

  // التحقق من صلاحية الكوبون مرة أخرى قبل الاستخدام
  db.get(
    `SELECT * FROM coupons WHERE code = ? AND is_active = 1 
     AND (max_uses = -1 OR used_count < max_uses)
     AND (valid_until IS NULL OR valid_until >= datetime('now'))`,
    [coupon_code.toUpperCase()],
    (err, coupon) => {
      if (err || !coupon) {
        return res.status(400).json({
          status: 'error',
          message: 'الكوبون غير صالح للاستخدام'
        });
      }

      // زيادة عداد الاستخدام
      db.run(
        'UPDATE coupons SET used_count = used_count + 1 WHERE code = ?',
        [coupon_code.toUpperCase()],
        function(err) {
          if (err) {
            console.error('❌ خطأ في تحديث استخدام الكوبون:', err);
            return res.status(500).json({
              status: 'error',
              message: 'خطأ في استخدام الكوبون'
            });
          }

          console.log('✅ تم استخدام الكوبون:', coupon_code);
          
          res.json({
            status: 'success',
            message: 'تم استخدام الكوبون بنجاح',
            new_used_count: coupon.used_count + 1
          });
        }
      );
    }
  );
});

// API جلب جميع الكوبونات
app.get('/api/coupons', (req, res) => {
  db.all('SELECT * FROM coupons ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب الكوبونات:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    res.json({
      status: 'success',
      coupons: rows,
      count: rows.length,
      message: `تم العثور على ${rows.length} كوبون`
    });
  });
});

// API جلب كوبون محدد
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

// API إنشاء كوبون جديد مع التحقق من التكرار
app.post('/api/coupons', (req, res) => {
  const {
    code,
    description,
    discount_type,
    discount_value,
    min_order_amount,
    max_discount_amount,
    max_uses,
    valid_from,
    valid_until,
    is_active
  } = req.body;

  // التحقق من الحقول المطلوبة
  if (!code || !discount_type || discount_value === undefined) {
    return res.status(400).json({
      status: 'error',
      message: 'الكود ونوع الخصم وقيمة الخصم مطلوبة'
    });
  }

  // التحقق من أن الكود غير مكرر
  db.get('SELECT id FROM coupons WHERE code = ?', [code.toUpperCase()], (err, existingCoupon) => {
    if (err) {
      console.error('❌ خطأ في التحقق من الكود:', err);
      return res.status(500).json({
        status: 'error',
        message: 'فشل في التحقق من الكود: ' + err.message
      });
    }

    if (existingCoupon) {
      return res.status(400).json({
        status: 'error',
        message: 'كود الكوبون مستخدم مسبقاً'
      });
    }

    // إدخال الكوبون الجديد
    db.run(
      `INSERT INTO coupons (
        code, description, discount_type, discount_value, min_order_amount,
        max_discount_amount, max_uses, valid_from, valid_until, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code.toUpperCase(),
        description || '',
        discount_type,
        discount_value,
        min_order_amount || 0,
        max_discount_amount || null,
        max_uses || -1,
        valid_from || new Date().toISOString(),
        valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        is_active !== undefined ? is_active : 1
      ],
      function(err) {
        if (err) {
          console.error('❌ خطأ في إنشاء الكوبون:', err);
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
});

// API تحديث كوبون
app.put('/api/coupons/:id', (req, res) => {
  const { id } = req.params;
  const {
    code,
    description,
    discount_type,
    discount_value,
    min_order_amount,
    max_discount_amount,
    max_uses,
    valid_from,
    valid_until,
    is_active,
    used_count
  } = req.body;

  // التحقق من أن الكود غير مكرر (باستثناء الكوبون الحالي)
  const checkCodeQuery = 'SELECT id FROM coupons WHERE code = ? AND id != ?';
  
  db.get(checkCodeQuery, [code ? code.toUpperCase() : null, id], (err, existingCoupon) => {
    if (err) {
      console.error('❌ خطأ في التحقق من الكود:', err);
      return res.status(500).json({
        status: 'error',
        message: 'فشل في التحقق من الكود: ' + err.message
      });
    }

    if (existingCoupon) {
      return res.status(400).json({
        status: 'error',
        message: 'كود الكوبون مستخدم مسبقاً'
      });
    }

    db.run(
      `UPDATE coupons SET
        code = COALESCE(?, code),
        description = COALESCE(?, description),
        discount_type = COALESCE(?, discount_type),
        discount_value = COALESCE(?, discount_value),
        min_order_amount = COALESCE(?, min_order_amount),
        max_discount_amount = COALESCE(?, max_discount_amount),
        max_uses = COALESCE(?, max_uses),
        valid_from = COALESCE(?, valid_from),
        valid_until = COALESCE(?, valid_until),
        is_active = COALESCE(?, is_active),
        used_count = COALESCE(?, used_count)
      WHERE id = ?`,
      [
        code ? code.toUpperCase() : null,
        description,
        discount_type,
        discount_value,
        min_order_amount,
        max_discount_amount,
        max_uses,
        valid_from,
        valid_until,
        is_active,
        used_count,
        id
      ],
      function(err) {
        if (err) {
          console.error('❌ خطأ في تحديث الكوبون:', err);
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

        console.log('✅ تم تحديث الكوبون:', { id, code });
        
        res.json({
          status: 'success',
          message: 'تم تحديث الكوبون بنجاح',
          updated_id: id,
          changes: this.changes
        });
      }
    );
  });
});

// API حذف كوبون
app.delete('/api/coupons/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM coupons WHERE id = ?', [id], function(err) {
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

// API معالجة الدفع - محدث ليدعم نظام الكوبونات الجديد
app.post('/api/process-payment', (req, res) => {
  const { 
    cart_items, 
    total_amount, 
    order_date, 
    order_status,
    customer_name,
    customer_phone, 
    customer_email,
    payment_method,
    coupon_code
  } = req.body;

  console.log('💰 طلب دفع جديد:', { 
    customer: customer_name,
    items_count: cart_items?.length || 0, 
    total_amount, 
    coupon_code: coupon_code || 'لا يوجد'
  });

  // التحقق من البيانات
  if (!cart_items || cart_items.length === 0) {
    return res.status(400).json({ status: 'error', message: 'السلة فارغة' });
  }

  if (!customer_name || !total_amount) {
    return res.status(400).json({ status: 'error', message: 'اسم العميل والمبلغ الإجمالي مطلوبان' });
  }

  // متغيرات الخصم
  let discountAmount = 0;
  let finalAmount = parseFloat(total_amount);
  let appliedCoupon = null;

  // التحقق من الكوبون إذا كان موجوداً
  const processCoupon = () => {
    return new Promise((resolve, reject) => {
      if (coupon_code) {
        db.get(
          `SELECT * FROM coupons 
           WHERE code = ? AND is_active = 1 
           AND (valid_from IS NULL OR valid_from <= datetime('now'))
           AND (valid_until IS NULL OR valid_until >= datetime('now'))`,
          [coupon_code.toUpperCase()],
          (err, coupon) => {
            if (err) {
              reject(err);
              return;
            }

            if (coupon) {
              // التحقق من الحد الأقصى للاستخدام
              if (coupon.max_uses === -1 || coupon.used_count < coupon.max_uses) {
                // التحقق من الحد الأدنى للطلب
                if (finalAmount >= coupon.min_order_amount) {
                  // حساب قيمة الخصم
                  if (coupon.discount_type === 'percentage') {
                    discountAmount = (finalAmount * coupon.discount_value) / 100;
                    
                    // تطبيق الحد الأقصى للخصم إذا كان محدداً
                    if (coupon.max_discount_amount && discountAmount > coupon.max_discount_amount) {
                      discountAmount = coupon.max_discount_amount;
                    }
                  } else {
                    discountAmount = coupon.discount_value;
                  }

                  // التأكد من أن الخصم لا يتجاوز قيمة الطلب
                  if (discountAmount > finalAmount) {
                    discountAmount = finalAmount;
                  }

                  finalAmount = finalAmount - discountAmount;
                  appliedCoupon = coupon;

                  // زيادة عداد استخدامات الكوبون
                  db.run('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [coupon.id]);

                  console.log('✅ تم تطبيق الكوبون:', { 
                    code: coupon.code, 
                    discount: discountAmount, 
                    final: finalAmount,
                    max_discount: coupon.max_discount_amount 
                  });
                } else {
                  console.log('❌ قيمة الطلب أقل من الحد الأدنى للكوبون');
                }
              } else {
                console.log('❌ تم الوصول للحد الأقصى لاستخدام الكوبون');
              }
            }
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  };

  // معالجة الطلب بعد التحقق من الكوبون
  processCoupon().then(() => {
    // إنشاء رقم طلب فريد
    const orderNumber = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();

    db.run(
      `INSERT INTO orders (
        order_number, cart_items, total_amount, discount_amount, coupon_code,
        order_date, order_status, customer_name, customer_phone, customer_email, payment_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        JSON.stringify(cart_items),
        total_amount,
        discountAmount,
        appliedCoupon ? appliedCoupon.code : null,
        order_date || new Date().toISOString(),
        order_status || 'pending',
        customer_name || 'عميل',
        customer_phone || '',
        customer_email || '',
        payment_method || 'online'
      ],
      function(err) {
        if (err) {
          console.error('❌ خطأ في حفظ الطلب:', err);
          return res.status(500).json({ status: 'error', message: 'فشل في معالجة الطلب: ' + err.message });
        }

        console.log('✅ طلب جديد محفوظ:', {
          order_id: orderNumber,
          customer: customer_name,
          original_total: total_amount,
          discount: discountAmount,
          final_total: finalAmount,
          coupon: appliedCoupon ? appliedCoupon.code : 'لا يوجد'
        });
        
        res.json({
          status: 'success',
          message: 'تم إرسال الطلب بنجاح إلى الإدارة',
          order_id: orderNumber,
          order_status: 'pending',
          original_amount: parseFloat(total_amount),
          discount_amount: discountAmount,
          final_amount: finalAmount,
          coupon_code: appliedCoupon ? appliedCoupon.code : null,
          coupon_details: appliedCoupon ? {
            code: appliedCoupon.code,
            description: appliedCoupon.description,
            discount_type: appliedCoupon.discount_type,
            discount_value: appliedCoupon.discount_value,
            max_discount_amount: appliedCoupon.max_discount_amount
          } : null,
          items_count: cart_items.length,
          customer_name: customer_name,
          timestamp: new Date().toISOString(),
          admin_url: `/admin/orders`
        });
      }
    );
  }).catch(error => {
    console.error('❌ خطأ في معالجة الكوبون:', error);
    return res.status(500).json({ status: 'error', message: 'فشل في معالجة الكوبون: ' + error.message });
  });
});

// API جلب جميع الطلبات
app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب الطلبات:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }

    const orders = rows.map(order => ({
      ...order,
      cart_items: JSON.parse(order.cart_items)
    }));

    res.json({ status: 'success', orders, count: orders.length, message: `تم العثور على ${orders.length} طلب` });
  });
});

// API تحديث حالة الطلب
app.put('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  db.run('UPDATE orders SET order_status = ? WHERE id = ?', [status, id], function(err) {
    if (err) {
      console.error('❌ خطأ في تحديث حالة الطلب:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }

    res.json({ status: 'success', message: 'تم تحديث حالة الطلب بنجاح', updated_id: id, new_status: status });
  });
});

// ======== APIs النسخ الاحتياطي ========

// API لإنشاء نسخة احتياطية
app.post('/api/backup', (req, res) => {
  const { type = 'full' } = req.body;
  
  createBackup(type)
    .then(result => {
      res.json({
        status: 'success',
        message: `تم إنشاء نسخة احتياطية بنجاح`,
        backup: result
      });
    })
    .catch(error => {
      console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
      res.status(500).json({
        status: 'error',
        message: 'فشل في إنشاء النسخة الاحتياطية'
      });
    });
});

// API لجلب قائمة النسخ الاحتياطية
app.get('/api/backups', (req, res) => {
  db.all('SELECT * FROM data_backups ORDER BY backup_date DESC', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب النسخ الاحتياطية:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    res.json({
      status: 'success',
      backups: rows,
      count: rows.length
    });
  });
});

// API لتصدير البيانات إلى Excel
app.get('/api/export-data', (req, res) => {
  const { type } = req.query;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `export-${type || 'all'}-${timestamp}.xlsx`;
  const filepath = path.join(exportsDir, filename);

  const workbook = new ExcelJS.Workbook();
  let operationsCompleted = 0;
  const totalOperations = (!type || type === 'orders' ? 1 : 0) + (!type || type === 'coupons' ? 1 : 0);

  const checkCompletion = () => {
    operationsCompleted++;
    if (operationsCompleted === totalOperations) {
      // حفظ الملف وإرسال الاستجابة
      workbook.xlsx.writeFile(filepath)
        .then(() => {
          res.json({
            status: 'success',
            message: 'تم تصدير البيانات بنجاح',
            download_url: `/api/download-export?file=${filename}`
          });
        })
        .catch(error => {
          console.error('❌ خطأ في تصدير البيانات:', error);
          res.status(500).json({
            status: 'error',
            message: 'فشل في تصدير البيانات'
          });
        });
    }
  };

  // تصدير الطلبات
  if (!type || type === 'orders') {
    const ordersSheet = workbook.addWorksheet('الطلبات');
    ordersSheet.columns = [
      { header: 'رقم الطلب', key: 'order_number', width: 20 },
      { header: 'اسم العميل', key: 'customer_name', width: 20 },
      { header: 'المبلغ الإجمالي', key: 'total_amount', width: 15 },
      { header: 'الخصم', key: 'discount_amount', width: 15 },
      { header: 'الحالة', key: 'order_status', width: 15 },
      { header: 'تاريخ الطلب', key: 'order_date', width: 20 }
    ];

    db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, orders) => {
      if (!err && orders) {
        orders.forEach(order => {
          ordersSheet.addRow({
            order_number: order.order_number,
            customer_name: order.customer_name,
            total_amount: order.total_amount,
            discount_amount: order.discount_amount,
            order_status: order.order_status,
            order_date: order.order_date
          });
        });
      }
      checkCompletion();
    });
  }

  // تصدير الكوبونات
  if (!type || type === 'coupons') {
    const couponsSheet = workbook.addWorksheet('الكوبونات');
    couponsSheet.columns = [
      { header: 'كود الكوبون', key: 'code', width: 15 },
      { header: 'الوصف', key: 'description', width: 25 },
      { header: 'نوع الخصم', key: 'discount_type', width: 15 },
      { header: 'قيمة الخصم', key: 'discount_value', width: 15 },
      { header: 'تم الاستخدام', key: 'used_count', width: 15 },
      { header: 'الحالة', key: 'is_active', width: 10 }
    ];

    db.all('SELECT * FROM coupons ORDER BY created_at DESC', (err, coupons) => {
      if (!err && coupons) {
        coupons.forEach(coupon => {
          couponsSheet.addRow({
            code: coupon.code,
            description: coupon.description,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value,
            used_count: coupon.used_count,
            is_active: coupon.is_active ? 'نشط' : 'غير نشط'
          });
        });
      }
      checkCompletion();
    });
  }
});

// API لتحميل الملفات المصدرة
app.get('/api/download-export', (req, res) => {
  const { file } = req.query;
  const filepath = path.join(exportsDir, file);
  
  if (fs.existsSync(filepath)) {
    res.download(filepath);
  } else {
    res.status(404).json({
      status: 'error',
      message: 'الملف غير موجود'
    });
  }
});

// API مسح جميع البيانات
app.delete('/api/clear-all-data', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM test_users', function(err) {
      if (err) {
        console.error('❌ خطأ في مسح بيانات المستخدمين:', err);
        return res.status(500).json({ status: 'error', message: err.message });
      }

      db.run('DELETE FROM orders', function(err) {
        if (err) {
          console.error('❌ خطأ في مسح الطلبات:', err);
          return res.status(500).json({ status: 'error', message: err.message });
        }

        res.json({ status: 'success', message: '✅ تم مسح جميع البيانات بنجاح', users_deleted: this.changes });
      });
    });
  });
});

// ======== صفحات الإدارة ========

// صفحة ويب لعرض البيانات
app.get('/admin', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.send(`
        <html>
          <head><title>خطأ</title><meta charset="UTF-8"></head>
          <body style="font-family: Arial, sans-serif; padding: 20px; direction: rtl;">
            <h1 style="color: red;">❌ خطأ في جلب البيانات</h1>
            <p>${err.message}</p>
            <a href="/" style="color: blue;">العودة للصفحة الرئيسية</a>
          </body>
        </html>
      `);
    }

    let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>عرض البيانات - نظام الاختبار</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { background: rgba(255, 255, 255, 0.95); color: #333; padding: 30px; border-radius: 15px; margin-bottom: 20px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
            .stats { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
            .user-card { background: rgba(255, 255, 255, 0.95); padding: 20px; margin-bottom: 15px; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-right: 4px solid #667eea; transition: transform 0.2s; }
            .user-card:hover { transform: translateY(-2px); }
            .user-id { background: #667eea; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .timestamp { color: #666; font-size: 12px; background: #f8f9fa; padding: 4px 8px; border-radius: 10px; }
            .no-data { text-align: center; padding: 60px; color: #666; background: rgba(255, 255, 255, 0.95); border-radius: 10px; }
            .nav { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            .nav-btn { background: #fff; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .nav-btn:hover { background: #667eea; color: white; transform: translateY(-2px); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0; color: #333;">📊 بيانات المستخدمين - نظام الاختبار</h1>
                <p style="margin: 10px 0 0 0; color: #666;">جميع البيانات المرسلة من تطبيق الجوال</p>
            </div>
            
            <div class="nav">
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
                <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
                <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
                <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
                <a href="/admin/settings" class="nav-btn">⚙️ إعدادات النظام</a>
                <a href="/api/all-data" class="nav-btn">📋 JSON البيانات</a>
                <a href="/api/test" class="nav-btn">🧪 اختبار الاتصال</a>
            </div>
            
            <div class="stats">
                <h3 style="margin: 0 0 15px 0; color: #333;">📈 الإحصائيات</h3>
                <p style="margin: 5px 0;">عدد السجلات: <strong style="color: #667eea;">${rows.length}</strong></p>
                <p style="margin: 5px 0;">آخر تحديث: <strong>${new Date().toLocaleString('ar-SA')}</strong></p>
            </div>
    `;

    if (rows.length === 0) {
      html += `<div class="no-data"><h3 style="color: #666; margin-bottom: 10px;">📭 لا توجد بيانات</h3><p style="color: #999;">لم يتم إرسال أي بيانات من التطبيق بعد</p></div>`;
    } else {
      rows.forEach(user => {
        html += `
            <div class="user-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <span class="user-id">#${user.id}</span>
                    <span class="timestamp">${user.created_at}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; font-weight: bold; width: 120px; color: #333;">الاسم:</td><td style="padding: 8px; color: #555;">${user.name || 'غير محدد'}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #333;">البريد الإلكتروني:</td><td style="padding: 8px; color: #555;">${user.email || 'غير محدد'}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #333;">الهاتف:</td><td style="padding: 8px; color: #555;">${user.phone || 'غير محدد'}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #333;">الرسالة:</td><td style="padding: 8px; color: #555;">${user.message || 'لا توجد رسالة'}</td></tr>
                </table>
            </div>`;
      });
    }

    html += `</div><script>setTimeout(() => location.reload(), 15000);</script></body></html>`;
    res.send(html);
  });
});

// صفحة الإدارة المتقدمة
app.get('/admin/advanced', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>الإدارة المتقدمة - نظام الاختبار</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f0f2f5; min-height: 100vh; }
            .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
            .controls { background: white; padding: 25px; border-radius: 15px; margin-bottom: 25px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
            .btn { padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: all 0.3s; font-weight: 500; }
            .btn-primary { background: #2196F3; color: white; }
            .btn-primary:hover { background: #1976D2; transform: translateY(-2px); }
            .btn-danger { background: #f44336; color: white; }
            .btn-danger:hover { background: #d32f2f; transform: translateY(-2px); }
            .btn-success { background: #4CAF50; color: white; }
            .btn-success:hover { background: #388E3C; transform: translateY(-2px); }
            .btn-secondary { background: #6c757d; color: white; }
            .btn-secondary:hover { background: #545b62; transform: translateY(-2px); }
            .table-container { background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.1); margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 16px 20px; text-align: right; border-bottom: 1px solid #e0e0e0; }
            th { background: #f8f9fa; font-weight: 600; color: #333; font-size: 14px; }
            tr:hover { background: #f8f9fa; }
            .badge { background: #2196F3; color: white; padding: 4px 12px; border-radius: 15px; font-size: 12px; font-weight: bold; }
            .empty-state { text-align: center; padding: 60px; color: #666; }
            .stats-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0; font-size: 2.5rem;">🛠️ لوحة التحكم - نظام الاختبار</h1>
                <p style="margin: 10px 0 0 0; font-size: 1.1rem; opacity: 0.9;">إدارة وعرض جميع البيانات من تطبيق الجوال</p>
            </div>
            
            <div class="controls">
                <a href="/admin" class="btn btn-secondary">📊 العرض البسيط</a>
                <a href="/admin/orders" class="btn btn-success">🛒 إدارة الطلبات</a>
                <a href="/admin/coupons" class="btn btn-primary">🎫 إدارة الكوبونات</a>
                <a href="/admin/settings" class="btn btn-info">⚙️ إعدادات النظام</a>
                <a href="/api/all-data" class="btn btn-success">📋 JSON البيانات</a>
                <a href="/api/orders" class="btn btn-primary">📦 JSON الطلبات</a>
                <a href="/" class="btn btn-secondary">🏠 الرئيسية</a>
                <button onclick="clearAllData()" class="btn btn-danger">🗑️ مسح جميع البيانات</button>
                <button onclick="createBackup()" class="btn btn-warning">💾 نسخة احتياطية</button>
                <div style="margin-left: auto; display: flex; align-items: center; gap: 15px;">
                    <div class="stats-card"><strong>عدد السجلات:</strong> <span style="color: #2196F3; font-weight: bold;">${rows.length}</span></div>
                    <div class="stats-card"><strong>الحالة:</strong> <span style="color: #4CAF50; font-weight: bold;">✅ نشط</span></div>
                </div>
            </div>
            
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>#</th><th>الاسم</th><th>البريد الإلكتروني</th><th>الهاتف</th><th>الرسالة</th><th>تاريخ الإدخال</th>
                        </tr>
                    </thead>
                    <tbody>`;

    if (rows.length === 0) {
      html += `<tr><td colspan="6" class="empty-state"><h3 style="color: #666; margin-bottom: 10px;">📭 لا توجد بيانات حتى الآن</h3><p style="color: #999;">استخدم تطبيق الجوال لإرسال البيانات الأولى</p></td></tr>`;
    } else {
      rows.forEach(user => {
        html += `<tr>
            <td><span class="badge">${user.id}</span></td>
            <td><strong>${user.name || 'غير محدد'}</strong></td>
            <td>${user.email || 'غير محدد'}</td>
            <td>${user.phone || 'غير محدد'}</td>
            <td>${user.message || 'لا توجد رسالة'}</td>
            <td style="font-size: 13px; color: #666;">${user.created_at}</td>
        </tr>`;
      });
    }

    html += `</tbody></table></div></div>
        <script>
            function clearAllData() {
                if (confirm('⚠️ هل أنت متأكد من مسح جميع البيانات؟ لا يمكن التراجع عن هذا الإجراء!')) {
                    fetch('/api/clear-all-data', { method: 'DELETE' })
                        .then(response => response.json())
                        .then(data => { alert('✅ ' + data.message); location.reload(); })
                        .catch(error => { alert('❌ حدث خطأ: ' + error); });
                }
            }
            
            function createBackup() {
                fetch('/api/backup', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({type: 'full'}) })
                    .then(response => response.json())
                    .then(data => { 
                        if (data.status === 'success') {
                            alert('✅ ' + data.message + ' - تم إنشاء: ' + data.backup.count + ' سجل');
                        } else {
                            alert('❌ ' + data.message);
                        }
                    })
                    .catch(error => { alert('❌ حدث خطأ: ' + error); });
            }
            
            setInterval(() => location.reload(), 10000);
        </script>
    </body></html>`;
    res.send(html);
  });
});

// صفحة إدارة الطلبات
app.get('/admin/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إدارة الطلبات - نظام المتجر</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f0f2f5; min-height: 100vh; }
            .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; }
            .order-card { background: white; padding: 25px; margin-bottom: 20px; border-radius: 15px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-right: 4px solid #ff6b6b; }
            .order-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
            .order-number { background: #ff6b6b; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; }
            .order-status { padding: 6px 12px; border-radius: 15px; font-size: 14px; font-weight: bold; }
            .status-pending { background: #fff3cd; color: #856404; }
            .status-completed { background: #d1ecf1; color: #0c5460; }
            .status-cancelled { background: #f8d7da; color: #721c24; }
            .order-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .detail-item { background: #f8f9fa; padding: 12px; border-radius: 8px; }
            .items-list { background: #f8f9fa; padding: 15px; border-radius: 8px; }
            .item-card { background: white; padding: 10px; margin-bottom: 8px; border-radius: 6px; border-left: 3px solid #ff6b6b; }
            .nav { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            .nav-btn { background: #fff; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .nav-btn:hover { background: #ff6b6b; color: white; transform: translateY(-2px); }
            .empty-state { text-align: center; padding: 60px; color: #666; background: white; border-radius: 15px; }
            .customer-info { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">🛒 إدارة الطلبات - نظام المتجر</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">جميع الطلبات المرسلة من تطبيق الجوال</p>
            </div>
            
            <div class="nav">
                <a href="/admin" class="nav-btn">📊 بيانات المستخدمين</a>
                <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
                <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
                <a href="/admin/settings" class="nav-btn">⚙️ إعدادات النظام</a>
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
            </div>`;

    if (rows.length === 0) {
      html += `<div class="empty-state"><h3 style="color: #666; margin-bottom: 10px;">📭 لا توجد طلبات حتى الآن</h3><p style="color: #999;">لم يتم إرسال أي طلبات من التطبيق بعد</p></div>`;
    } else {
      rows.forEach(order => {
        const items = JSON.parse(order.cart_items);
        const statusClass = `status-${order.order_status}`;
        const statusText = { 'pending': 'قيد الانتظار', 'completed': 'مكتمل', 'cancelled': 'ملغي' }[order.order_status] || order.order_status;
        
        html += `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <span class="order-number">${order.order_number}</span>
                        <span class="order-status ${statusClass}" style="margin-right: 10px;">${statusText}</span>
                    </div>
                    <div style="color: #666; font-size: 14px;">${new Date(order.order_date).toLocaleString('ar-SA')}</div>
                </div>
                
                <div class="customer-info">
                    <strong>معلومات العميل:</strong><br>
                    الاسم: ${order.customer_name || 'غير محدد'} | 
                    الهاتف: ${order.customer_phone || 'غير محدد'} | 
                    البريد: ${order.customer_email || 'غير محدد'}<br>
                    طريقة الدفع: ${order.payment_method === 'online' ? 'دفع إلكتروني' : 'الدفع عند الاستلام'}
                    ${order.coupon_code ? `<br>كود الخصم: <strong>${order.coupon_code}</strong> (خصم: ${order.discount_amount} ر.س)` : ''}
                </div>
                
                <div class="order-details">
                    <div class="detail-item"><strong>المجموع الأصلي:</strong> ${order.total_amount} ر.س</div>
                    <div class="detail-item"><strong>الخصم:</strong> ${order.discount_amount} ر.س</div>
                    <div class="detail-item"><strong>المجموع النهائي:</strong> ${(order.total_amount - order.discount_amount).toFixed(2)} ر.س</div>
                    <div class="detail-item"><strong>عدد العناصر:</strong> ${items.length}</div>
                    <div class="detail-item">
                        <strong>حالة الطلب:</strong> 
                        <select onchange="updateOrderStatus(${order.id}, this.value)" style="margin-right: 10px; padding: 4px 8px; border-radius: 5px; border: 1px solid #ddd;">
                            <option value="pending" ${order.order_status === 'pending' ? 'selected' : ''}>قيد الانتظار</option>
                            <option value="completed" ${order.order_status === 'completed' ? 'selected' : ''}>مكتمل</option>
                            <option value="cancelled" ${order.order_status === 'cancelled' ? 'selected' : ''}>ملغي</option>
                        </select>
                    </div>
                </div>
                
                <div class="items-list">
                    <h4 style="margin: 0 0 15px 0;">🛍️ العناصر المطلوبة:</h4>
                    ${items.map(item => `
                        <div class="item-card">
                            <strong>${item.name || 'منتج'}</strong><br>
                            السعر: ${item.price} ر.س × ${item.quantity || 1} = <strong>${(item.price * (item.quantity || 1)).toFixed(2)} ر.س</strong>
                            ${item.selectedSize && item.selectedSize !== 'غير محدد' ? `<br>المقاس: ${item.selectedSize}` : ''}
                            ${item.colors && item.colors[0] && item.colors[0] !== 'غير محدد' ? `<br>اللون: ${item.colors[0]}` : ''}
                            ${item.image ? `<br><img src="${item.image}" style="max-width: 60px; max-height: 60px; margin-top: 5px; border-radius: 5px;">` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>`;
      });
    }

    html += `</div>
        <script>
            function updateOrderStatus(orderId, newStatus) {
                fetch('/api/orders/' + orderId + '/status', {
                    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ status: newStatus })
                }).then(response => response.json()).then(data => {
                    if (data.status === 'success') { alert('✅ ' + data.message); location.reload(); }
                    else { alert('❌ ' + data.message); }
                }).catch(error => { alert('❌ حدث خطأ: ' + error); });
            }
            setInterval(() => location.reload(), 10000);
        </script>
    </body></html>`;
    res.send(html);
  });
});

// صفحة إدارة الكوبونات - محدثة
app.get('/admin/coupons', (req, res) => {
  db.all('SELECT * FROM coupons ORDER BY created_at DESC', (err, rows) => {
    let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إدارة الكوبونات - نظام المتجر</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f0f2f5; min-height: 100vh; }
            .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; }
            .coupon-card { background: white; padding: 25px; margin-bottom: 20px; border-radius: 15px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-right: 4px solid #4CAF50; transition: all 0.3s; }
            .coupon-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
            .coupon-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
            .coupon-code { background: #4CAF50; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 16px; }
            .coupon-status { padding: 6px 12px; border-radius: 15px; font-size: 14px; font-weight: bold; }
            .status-active { background: #d1ecf1; color: #0c5460; }
            .status-inactive { background: #f8d7da; color: #721c24; }
            .status-expired { background: #fff3cd; color: #856404; }
            .coupon-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .detail-item { background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 3px solid #4CAF50; }
            .nav { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            .nav-btn { background: #fff; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .nav-btn:hover { background: #4CAF50; color: white; transform: translateY(-2px); }
            .btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: all 0.3s; font-weight: 500; }
            .btn-primary { background: #2196F3; color: white; }
            .btn-primary:hover { background: #1976D2; transform: translateY(-2px); }
            .btn-danger { background: #f44336; color: white; }
            .btn-danger:hover { background: #d32f2f; transform: translateY(-2px); }
            .btn-success { background: #4CAF50; color: white; }
            .btn-success:hover { background: #388E3C; transform: translateY(-2px); }
            .btn-warning { background: #ff9800; color: white; }
            .btn-warning:hover { background: #f57c00; transform: translateY(-2px); }
            .empty-state { text-align: center; padding: 60px; color: #666; background: white; border-radius: 15px; }
            .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); z-index: 1000; }
            .modal-content { background-color: white; margin: 5% auto; padding: 30px; border-radius: 15px; width: 80%; max-width: 600px; max-height: 80vh; overflow-y: auto; }
            .form-group { margin-bottom: 15px; }
            .form-control { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; }
            .form-label { display: block; margin-bottom: 5px; font-weight: 600; color: #333; }
            .form-help { font-size: 12px; color: #666; margin-top: 4px; }
            .close { float: left; font-size: 28px; font-weight: bold; cursor: pointer; color: #666; }
            .close:hover { color: #000; }
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .stat-card { background: white; padding: 20px; border-radius: 10px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .stat-number { font-size: 24px; font-weight: bold; color: #4CAF50; }
            .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">🎫 إدارة الكوبونات - نظام المتجر</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">إنشاء وتعديل وحذف كوبونات الخصم مع تحديد الصلاحية</p>
            </div>

            <div class="nav">
                <a href="/admin" class="nav-btn">📊 بيانات المستخدمين</a>
                <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
                <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
                <a href="/admin/settings" class="nav-btn">⚙️ إعدادات النظام</a>
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
                <button onclick="showAddModal()" class="btn btn-success">+ إضافة كوبون جديد</button>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${rows.length}</div>
                    <div class="stat-label">إجمالي الكوبونات</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${rows.filter(c => c.is_active && new Date(c.valid_until) > new Date()).length}</div>
                    <div class="stat-label">كوبونات نشطة</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${rows.filter(c => !c.is_active).length}</div>
                    <div class="stat-label">كوبونات غير نشطة</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${rows.filter(c => new Date(c.valid_until) < new Date()).length}</div>
                    <div class="stat-label">كوبونات منتهية</div>
                </div>
            </div>
    `;

    if (rows.length === 0) {
      html += `
            <div class="empty-state">
                <h3 style="color: #666; margin-bottom: 10px;">📭 لا توجد كوبونات حتى الآن</h3>
                <p style="color: #999;">انقر على زر "إضافة كوبون جديد" لإنشاء أول كوبون</p>
            </div>
      `;
    } else {
      rows.forEach(coupon => {
        const now = new Date();
        const validUntil = new Date(coupon.valid_until);
        const validFrom = new Date(coupon.valid_from);
        
        let statusClass = 'status-inactive';
        let statusText = 'غير نشط';
        
        if (coupon.is_active) {
          if (now > validUntil) {
            statusClass = 'status-expired';
            statusText = 'منتهي';
          } else if (now < validFrom) {
            statusClass = 'status-inactive';
            statusText = 'لم يبدأ';
          } else {
            statusClass = 'status-active';
            statusText = 'نشط';
          }
        }

        const discountTypeText = coupon.discount_type === 'percentage' ? 'نسبة مئوية' : 'ثابت';
        const daysLeft = Math.ceil((validUntil - now) / (1000 * 60 * 60 * 24));
        const daysLeftText = daysLeft > 0 ? `${daysLeft} يوم` : 'منتهي';

        html += `
            <div class="coupon-card">
                <div class="coupon-header">
                    <div>
                        <span class="coupon-code">${coupon.code}</span>
                        <span class="coupon-status ${statusClass}" style="margin-right: 10px;">${statusText}</span>
                        ${now > validUntil ? '<span style="color: #dc3545; font-size: 12px;">⏰ منتهي</span>' : ''}
                        ${now < validFrom ? '<span style="color: #ffc107; font-size: 12px;">⏳ لم يبدأ</span>' : ''}
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="editCoupon(${coupon.id})" class="btn btn-primary">✏️ تعديل</button>
                        <button onclick="toggleCouponStatus(${coupon.id}, ${coupon.is_active ? 0 : 1})" class="btn ${coupon.is_active ? 'btn-warning' : 'btn-success'}">
                            ${coupon.is_active ? '❌ إيقاف' : '✅ تفعيل'}
                        </button>
                        <button onclick="deleteCoupon(${coupon.id})" class="btn btn-danger">🗑️ حذف</button>
                    </div>
                </div>

                <div class="coupon-details">
                    <div class="detail-item">
                        <strong>الوصف:</strong> ${coupon.description || 'لا يوجد وصف'}
                    </div>
                    <div class="detail-item">
                        <strong>نوع الخصم:</strong> ${discountTypeText}
                    </div>
                    <div class="detail-item">
                        <strong>قيمة الخصم:</strong> ${coupon.discount_value} ${coupon.discount_type === 'percentage' ? '%' : 'ريال'}
                    </div>
                    <div class="detail-item">
                        <strong>الحد الأدنى للطلب:</strong> ${coupon.min_order_amount} ريال
                    </div>
                    <div class="detail-item">
                        <strong>الحد الأقصى للخصم:</strong> ${coupon.max_discount_amount ? coupon.max_discount_amount + ' ريال' : 'غير محدد'}
                    </div>
                    <div class="detail-item">
                        <strong>الحد الأقصى للاستخدام:</strong> ${coupon.max_uses === -1 ? 'غير محدود' : coupon.max_uses}
                    </div>
                    <div class="detail-item">
                        <strong>تم استخدامه:</strong> ${coupon.used_count} مرة
                    </div>
                    <div class="detail-item">
                        <strong>صالح من:</strong> ${validFrom.toLocaleDateString('ar-SA')} ${validFrom.toLocaleTimeString('ar-SA')}
                    </div>
                    <div class="detail-item">
                        <strong>صالح حتى:</strong> ${validUntil.toLocaleDateString('ar-SA')} ${validUntil.toLocaleTimeString('ar-SA')}
                    </div>
                    <div class="detail-item">
                        <strong>متبقي:</strong> <span style="color: ${daysLeft > 7 ? '#28a745' : daysLeft > 3 ? '#ffc107' : '#dc3545'}">${daysLeftText}</span>
                    </div>
                    <div class="detail-item">
                        <strong>تاريخ الإنشاء:</strong> ${new Date(coupon.created_at).toLocaleDateString('ar-SA')}
                    </div>
                </div>
            </div>
        `;
      });
    }

    html += `
        </div>

        <!-- نموذج إضافة كوبون -->
        <div id="addCouponModal" class="modal">
            <div class="modal-content">
                <span class="close" onclick="closeModal('addCouponModal')">&times;</span>
                <h2>🎫 إضافة كوبون جديد</h2>
                <form id="addCouponForm">
                    <div class="form-group">
                        <label class="form-label">كود الكوبون *</label>
                        <input type="text" name="code" class="form-control" required placeholder="مثال: WELCOME20">
                        <div class="form-help">يجب أن يكون الكود فريداً وغير مكرر</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">وصف الكوبون</label>
                        <input type="text" name="description" class="form-control" placeholder="مثال: خصم ترحيبي 20%">
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">نوع الخصم *</label>
                            <select name="discount_type" class="form-control" required>
                                <option value="percentage">نسبة مئوية (%)</option>
                                <option value="fixed">قيمة ثابتة (ريال)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">قيمة الخصم *</label>
                            <input type="number" name="discount_value" class="form-control" required min="0" step="0.01" placeholder="0.00">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">الحد الأدنى للطلب (ريال)</label>
                            <input type="number" name="min_order_amount" class="form-control" value="0" min="0" step="0.01">
                            <div class="form-help">0 يعني لا يوجد حد أدنى</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">الحد الأقصى للخصم (للنسبة المئوية)</label>
                            <input type="number" name="max_discount_amount" class="form-control" min="0" step="0.01" placeholder="اتركه فارغاً لغير محدود">
                            <div class="form-help">لنسبة مئوية فقط - اتركه فارغاً لغير محدود</div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">الحد الأقصى للاستخدام</label>
                            <input type="number" name="max_uses" class="form-control" value="-1" min="-1">
                            <div class="form-help">-1 يعني غير محدود</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">تاريخ البدء *</label>
                            <input type="datetime-local" name="valid_from" class="form-control" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">تاريخ الانتهاء *</label>
                        <input type="datetime-local" name="valid_until" class="form-control" required>
                    </div>

                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" name="is_active" checked> 
                            <span>تفعيل الكوبون مباشرة</span>
                        </label>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" class="btn btn-success" style="flex: 1;">💾 حفظ الكوبون</button>
                        <button type="button" onclick="closeModal('addCouponModal')" class="btn btn-secondary">إلغاء</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- نموذج تعديل كوبون -->
        <div id="editCouponModal" class="modal">
            <div class="modal-content">
                <span class="close" onclick="closeModal('editCouponModal')">&times;</span>
                <h2>✏️ تعديل الكوبون</h2>
                <form id="editCouponForm">
                    <input type="hidden" name="id" id="edit_coupon_id">
                    
                    <div class="form-group">
                        <label class="form-label">كود الكوبون *</label>
                        <input type="text" name="code" id="edit_code" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">وصف الكوبون</label>
                        <input type="text" name="description" id="edit_description" class="form-control">
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">نوع الخصم *</label>
                            <select name="discount_type" id="edit_discount_type" class="form-control" required>
                                <option value="percentage">نسبة مئوية (%)</option>
                                <option value="fixed">قيمة ثابتة (ريال)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">قيمة الخصم *</label>
                            <input type="number" name="discount_value" id="edit_discount_value" class="form-control" required min="0" step="0.01">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">الحد الأدنى للطلب (ريال)</label>
                            <input type="number" name="min_order_amount" id="edit_min_order_amount" class="form-control" min="0" step="0.01">
                        </div>
                        <div class="form-group">
                            <label class="form-label">الحد الأقصى للخصم (للنسبة المئوية)</label>
                            <input type="number" name="max_discount_amount" id="edit_max_discount_amount" class="form-control" min="0" step="0.01">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">الحد الأقصى للاستخدام</label>
                            <input type="number" name="max_uses" id="edit_max_uses" class="form-control" min="-1">
                            <div class="form-help">-1 يعني غير محدود</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">عدد مرات الاستخدام</label>
                            <input type="number" name="used_count" id="edit_used_count" class="form-control" min="0">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">تاريخ البدء *</label>
                            <input type="datetime-local" name="valid_from" id="edit_valid_from" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">تاريخ الانتهاء *</label>
                            <input type="datetime-local" name="valid_until" id="edit_valid_until" class="form-control" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" name="is_active" id="edit_is_active"> 
                            <span>الكوبون نشط</span>
                        </label>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" class="btn btn-success" style="flex: 1;">💾 حفظ التعديلات</button>
                        <button type="button" onclick="closeModal('editCouponModal')" class="btn btn-secondary">إلغاء</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            // إعداد التواريخ الافتراضية
            document.addEventListener('DOMContentLoaded', function() {
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                
                // تعيين تاريخ البدء الافتراضي للكوبون الجديد
                document.querySelector('#addCouponForm input[name="valid_from"]').value = 
                    now.toISOString().slice(0, 16);
                
                // تعيين تاريخ الانتهاء الافتراضي (بعد 30 يوم)
                const nextMonth = new Date(now);
                nextMonth.setDate(nextMonth.getDate() + 30);
                document.querySelector('#addCouponForm input[name="valid_until"]').value = 
                    nextMonth.toISOString().slice(0, 16);
            });

            // إظهار وإخفاء النماذج
            function showAddModal() {
                document.getElementById('addCouponModal').style.display = 'block';
            }

            function closeModal(modalId) {
                document.getElementById(modalId).style.display = 'none';
            }

            // إضافة كوبون جديد
            document.getElementById('addCouponForm').addEventListener('submit', function(e) {
                e.preventDefault();
                const formData = new FormData(this);
                const data = Object.fromEntries(formData.entries());
                
                // تحويل القيم الرقبية
                data.discount_value = parseFloat(data.discount_value);
                data.min_order_amount = parseFloat(data.min_order_amount);
                data.max_discount_amount = data.max_discount_amount ? parseFloat(data.max_discount_amount) : null;
                data.max_uses = parseInt(data.max_uses);
                data.is_active = data.is_active ? 1 : 0;

                fetch('/api/coupons', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        alert('✅ ' + data.message);
                        closeModal('addCouponModal');
                        location.reload();
                    } else {
                        alert('❌ ' + data.message);
                    }
                })
                .catch(error => {
                    alert('❌ حدث خطأ: ' + error);
                });
            });

            // تعديل كوبون
            async function editCoupon(id) {
                try {
                    const response = await fetch('/api/coupons/' + id);
                    const data = await response.json();
                    
                    if (data.status === 'success') {
                        const coupon = data.coupon;
                        
                        // تعبئة النموذج ببيانات الكوبون
                        document.getElementById('edit_coupon_id').value = coupon.id;
                        document.getElementById('edit_code').value = coupon.code;
                        document.getElementById('edit_description').value = coupon.description || '';
                        document.getElementById('edit_discount_type').value = coupon.discount_type;
                        document.getElementById('edit_discount_value').value = coupon.discount_value;
                        document.getElementById('edit_min_order_amount').value = coupon.min_order_amount;
                        document.getElementById('edit_max_discount_amount').value = coupon.max_discount_amount || '';
                        document.getElementById('edit_max_uses').value = coupon.max_uses;
                        document.getElementById('edit_valid_from').value = coupon.valid_from.slice(0, 16);
                        document.getElementById('edit_valid_until').value = coupon.valid_until.slice(0, 16);
                        document.getElementById('edit_is_active').checked = coupon.is_active;
                        document.getElementById('edit_used_count').value = coupon.used_count;
                        
                        document.getElementById('editCouponModal').style.display = 'block';
                    } else {
                        alert('❌ ' + data.message);
                    }
                } catch (error) {
                    alert('❌ حدث خطأ في جلب بيانات الكوبون: ' + error);
                }
            }

            // حفظ التعديلات
            document.getElementById('editCouponForm').addEventListener('submit', function(e) {
                e.preventDefault();
                const formData = new FormData(this);
                const data = Object.fromEntries(formData.entries());
                const couponId = data.id;
                
                // تحويل القيم الرقمية
                data.discount_value = parseFloat(data.discount_value);
                data.min_order_amount = parseFloat(data.min_order_amount);
                data.max_discount_amount = data.max_discount_amount ? parseFloat(data.max_discount_amount) : null;
                data.max_uses = parseInt(data.max_uses);
                data.used_count = parseInt(data.used_count);
                data.is_active = data.is_active ? 1 : 0;

                fetch('/api/coupons/' + couponId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        alert('✅ ' + data.message);
                        closeModal('editCouponModal');
                        location.reload();
                    } else {
                        alert('❌ ' + data.message);
                    }
                })
                .catch(error => {
                    alert('❌ حدث خطأ: ' + error);
                });
            });

            // تفعيل/إيقاف الكوبون
            function toggleCouponStatus(id, newStatus) {
                fetch('/api/coupons/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_active: newStatus })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        alert('✅ ' + data.message);
                        location.reload();
                    } else {
                        alert('❌ ' + data.message);
                    }
                })
                .catch(error => {
                    alert('❌ حدث خطأ: ' + error);
                });
            }

            // حذف كوبون
            function deleteCoupon(id) {
                if (confirm('⚠️ هل أنت متأكد من حذف هذا الكوبون؟ لا يمكن التراجع عن هذا الإجراء!')) {
                    fetch('/api/coupons/' + id, { method: 'DELETE' })
                        .then(response => response.json())
                        .then(data => {
                            if (data.status === 'success') {
                                alert('✅ ' + data.message);
                                location.reload();
                            } else {
                                alert('❌ ' + data.message);
                            }
                        })
                        .catch(error => {
                            alert('❌ حدث خطأ: ' + error);
                        });
                }
            }

            // إغلاق النماذج عند النقر خارجها
            window.onclick = function(event) {
                const modals = document.querySelectorAll('.modal');
                modals.forEach(modal => {
                    if (event.target === modal) {
                        modal.style.display = 'none';
                    }
                });
            }
        </script>
    </body>
    </html>
    `;

    res.send(html);
  });
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error('❌ خطأ غير متوقع:', err);
  res.status(500).json({ status: 'error', message: 'حدث خطأ غير متوقع في الخادم' });
});

// التعامل مع المسارات غير الموجودة
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'الصفحة غير موجودة', requested_url: req.url });
});

// بدء الخادم مع تحسينات
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 الخادم يعمل على المنفذ', PORT);
  console.log('🔗 رابط التطبيق: https://database-api-kvxr.onrender.com');
  console.log('📊 قاعدة البيانات: SQLite (دائمة في الملف)');
  console.log('💾 مسار قاعدة البيانات:', dbPath);
  console.log('✅ جاهز لاستقبال طلبات Flutter');
  console.log('🎯 يدعم اللغة العربية بشكل كامل');
  console.log('🎫 نظام الكوبونات: مفعل ومتكامل مع التعديل');
  console.log('💾 نظام النسخ الاحتياطي: مفعل');
  
  // إنشاء نسخة احتياطية أولية عند التشغيل
  setTimeout(() => {
    createBackup('full').then(() => {
      console.log('✅ تم إنشاء نسخة احتياطية أولية');
    }).catch(err => {
      console.error('❌ فشل في إنشاء النسخة الاحتياطية الأولية:', err);
    });
  }, 5000);
});

// معالجة إغلاق التطبيق بشكل آمن
process.on('SIGINT', () => {
  console.log('🔄 إنشاء نسخة احتياطية قبل الإغلاق...');
  createBackup('full').then(() => {
    console.log('✅ تم إنشاء نسخة احتياطية نهائية');
    db.close((err) => {
      if (err) {
        console.error('❌ خطأ في إغلاق قاعدة البيانات:', err.message);
      } else {
        console.log('✅ تم إغلاق قاعدة البيانات');
      }
      process.exit(0);
    });
  }).catch(err => {
    console.error('❌ فشل في إنشاء النسخة الاحتياطية:', err);
    process.exit(1);
  });
});