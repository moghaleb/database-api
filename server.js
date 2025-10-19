const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs'); // إضافة مكتبة Excel
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ======== Middleware ========
app.use(cors());
app.use(express.json());
// استخدم cookie-parser مع سر توقيع بسيط (يمكن ضبطه عبر متغير بيئي SESSION_SECRET)
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_session_secret_please_change';
app.use(cookieParser(SESSION_SECRET));
app.use(express.static('public')); // لخدمة الملفات المحملة

// تقبل طلبات form POST من النماذج (application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));

// ======== إعداد بيانات مسؤول افتراضي (بسيط للاختبار) ========
// ملاحظة: هذا تخزين بسيط في الذاكرة للاختبار فقط — لا تستخدمه في الإنتاج.
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USER || 'admin',
  password: process.env.ADMIN_PASS || 'admin123'
};

// مساعدة صغيرة للتحقق من المصادقة عبر كوكي موقعة
function isAuthenticated(req) {
  try {
    const auth = req.signedCookies && req.signedCookies.admin_auth;
    if (!auth) return false;
    // قيمة الكوكي هي اسم المستخدم المشفّرة كـ string (بسيطة هنا)
    return auth === ADMIN_CREDENTIALS.username;
  } catch (e) {
    return false;
  }
}

// تحقق ما إذا كان الطلب قادمًا من بيئة محلية (localhost/127.0.0.1/::1)
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

// صفحة تسجيل الدخول (تعامل POST هنا) - عند الطلب الناجح نضع كوكي موقعة
// Extracted login handler so it can be reused for multiple routes
function handleLoginRequest(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    if (req.is('application/x-www-form-urlencoded')) {
      return renderLoginPageHTML(req, res, 'اسم المستخدم وكلمة المرور مطلوبان');
    }
    return res.status(400).json({ status: 'error', message: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    // ضع كوكي موقعة صالحة لمدة 12 ساعة
    res.cookie('admin_auth', ADMIN_CREDENTIALS.username, { signed: true, httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
    // إذا كان الطلب قادم من نموذج HTML نعيد التوجيه للوحة الإدارة
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

app.post('/login', (req, res) => handleLoginRequest(req, res));

// مسارات /admin/login التي طلبتها
app.get('/admin/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/admin');
  return renderLoginPageHTML(req, res);
});

app.post('/admin/login', (req, res) => handleLoginRequest(req, res));

// مسار لتسجيل الخروج (يحذف الكوكي)
app.get('/logout', (req, res) => {
  res.clearCookie('admin_auth');
  // لو طلب عبر AJAX نرسل JSON، وإلا نعيد التوجيه للصفحة الرئيسية
  if (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1) {
    return res.json({ status: 'success', message: 'تم تسجيل الخروج' });
  }
  res.redirect('/');
});

// ======== إنشاء مجلد التصدير ========
const exportsDir = path.join(__dirname, 'exports');
if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
    console.log('✅ تم إنشاء مجلد التصدير');
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

  // جدول الطلبات
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE,
    cart_items TEXT NOT NULL,
    total_amount REAL NOT NULL,
    discount_amount REAL DEFAULT 0,
    coupon_code TEXT,
    coupon_type TEXT,
    gift_card_number TEXT,
    gift_card_amount REAL DEFAULT 0,
    gift_card_type TEXT,
    order_date DATETIME NOT NULL,
    order_status TEXT DEFAULT 'pending',
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    payment_method TEXT DEFAULT 'online',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول الطلبات:', err);
    } else {
      console.log('✅ تم إنشاء جدول الطلبات بنجاح');
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

  // جدول القسائم الشرائية (Gift Cards) - الجديد
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
        ('auto_refresh', 'true'),
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
});

// ======== Routes ========

// مساعدة لعرض نموذج تسجيل الدخول البسيط عند الوصول لصفحات الإدارة بدون مصادقة
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

// API إعدادات الـ admin

// جلب جميع الإعدادات
app.get('/api/admin-settings', (req, res) => {
  db.all('SELECT * FROM admin_settings ORDER BY setting_key', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب إعدادات الـ admin:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    // تحويل الإعدادات إلى كائن
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    res.json({
      status: 'success',
      settings: settings,
      count: rows.length,
      message: `تم العثور على ${rows.length} إعداد`
    });
  });
});

// تحديث إعداد
app.put('/api/admin-settings/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({
      status: 'error',
      message: 'مفتاح الإعداد وقيمته مطلوبان'
    });
  }

  db.run(
    `INSERT OR REPLACE INTO admin_settings (setting_key, setting_value, updated_at) 
     VALUES (?, ?, CURRENT_TIMESTAMP)`,
    [key, String(value)],
    function(err) {
      if (err) {
        console.error('❌ خطأ في تحديث إعداد الـ admin:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      res.json({
        status: 'success',
        message: `✅ تم تحديث الإعداد "${key}" بنجاح`,
        key: key,
        value: value
      });
    }
  );
});

// الرابط الأساسي
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: '🚀 نظام اختبار الاتصال يعمل بنجاح!',
    timestamp: new Date().toISOString(),
    database: 'SQLite - سريعة وموثوقة',
    endpoints: [
      'GET /api/test - اختبار الاتصال',
      'GET /api/db-test - اختبار قاعدة البيانات', 
      'POST /api/save-data - حفظ بيانات الاختبار',
      'GET /api/all-data - عرض جميع البيانات',
      'POST /api/process-payment - معالجة الدفع',
      'GET /api/orders - جلب جميع الطلبات',
      'PUT /api/orders/:id/status - تحديث حالة الطلب',
      'GET /api/validate-coupon - التحقق من الكوبون',
      'GET /api/coupons - جلب جميع الكوبونات',
      'GET /api/coupons/:id - جلب كوبون محدد',
      'POST /api/coupons - إنشاء كوبون جديد',
      'PUT /api/coupons/:id - تعديل كوبون',
      'DELETE /api/coupons/:id - حذف كوبون',
      'POST /api/validate-gift-card - التحقق من القسيمة الشرائية',
      'GET /api/gift-cards - جلب جميع القسائم',
      'GET /api/gift-cards/:id - جلب قسيمة محددة',
      'POST /api/gift-cards - إنشاء قسيمة جديدة',
      'PUT /api/gift-cards/:id - تعديل قسيمة',
      'DELETE /api/gift-cards/:id - حذف قسيمة',
      'GET /api/admin-settings - جلب إعدادات الـ admin',
      'PUT /api/admin-settings/:key - تحديث إعداد',
      'GET /api/export-sales - تصدير المبيعات إلى Excel',
      'GET /api/export-all-sales - تصدير سريع للمبيعات',
      'GET /admin - صفحة عرض البيانات',
      'GET /admin/advanced - لوحة التحكم',
      'GET /admin/orders - إدارة الطلبات',
      'GET /admin/coupons - إدارة الكوبونات',
      'GET /admin/gift-cards - إدارة القسائم الشرائية',
      'GET /logout - تسجيل الخروج'
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
    arabic_support: 'نظام يدعم اللغة العربية'
  });
});

// اختبار قاعدة البيانات
app.get('/api/db-test', (req, res) => {
  db.get('SELECT 1 as test_value, datetime("now") as server_time', (err, row) => {
    if (err) {
      console.error('❌ خطأ في اختبار قاعدة البيانات:', err);
      return res.status(500).json({
        status: 'error',
        message: 'فشل اختبار قاعدة البيانات: ' + err.message
      });
    }
    
    res.json({
      status: 'success',
      message: '✅ تم الاتصال بقاعدة البيانات بنجاح!',
      test_value: row.test_value,
      server_time: row.server_time,
      database: 'SQLite - سريعة وموثوقة',
      arabic_message: 'نظام يدعم اللغة العربية بشكل كامل'
    });
  });
});

// حفظ بيانات الاختبار
app.post('/api/save-data', (req, res) => {
  const { name, email, phone, message } = req.body;

  console.log('📨 بيانات مستلمة:', { name, email, phone, message });

  // التحقق من البيانات المطلوبة
  if (!name || !email) {
    return res.status(400).json({
      status: 'error',
      message: 'الاسم والبريد الإلكتروني مطلوبان'
    });
  }

  db.run(
    'INSERT INTO test_users (name, email, phone, message) VALUES (?, ?, ?, ?)',
    [name, email, phone || '', message || ''],
    function(err) {
      if (err) {
        console.error('❌ خطأ في حفظ البيانات:', err);
        return res.status(500).json({
          status: 'error',
          message: 'فشل في حفظ البيانات: ' + err.message
        });
      }

      console.log('✅ بيانات محفوظة برقم:', this.lastID);
      
      res.json({
        status: 'success',
        message: '✅ تم حفظ البيانات بنجاح!',
        insert_id: this.lastID,
        data: { 
          name: name,
          email: email, 
          phone: phone || '', 
          message: message || '' 
        },
        timestamp: new Date().toISOString(),
        arabic_message: 'تم الحفظ بنجاح في قاعدة البيانات'
      });
    }
  );
});

// عرض جميع البيانات المحفوظة (JSON)
app.get('/api/all-data', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب البيانات:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
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

// API جديد لتحقق سريع من الكوبون مع الحساب
app.get('/api/validate-coupon', (req, res) => {
  const { code, order_amount } = req.query;

  if (!code || !order_amount) {
    return res.status(400).json({
      status: 'error',
      message: 'كود الكوبون وقيمة الطلب مطلوبان'
    });
  }

  db.get(
    'SELECT * FROM coupons WHERE code = ? AND is_active = 1',
    [code],
    (err, coupon) => {
      if (err) {
        console.error('❌ خطأ في البحث عن الكوبون:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      if (!coupon) {
        return res.status(404).json({
          status: 'error',
          message: 'كوبون غير صالح أو غير موجود'
        });
      }

      // التحقق من صلاحية الكوبون
      const now = new Date();
      const validFrom = new Date(coupon.valid_from);
      const validUntil = new Date(coupon.valid_until);

      if (now < validFrom) {
        return res.status(400).json({
          status: 'error',
          message: 'هذا الكوبون غير فعال حتى ' + validFrom.toLocaleDateString('ar-SA')
        });
      }

      if (now > validUntil) {
        return res.status(400).json({
          status: 'error',
          message: 'هذا الكوبون منتهي الصلاحية'
        });
      }

      // التحقق من الحد الأقصى للاستخدام
      if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
        return res.status(400).json({
          status: 'error',
          message: 'تم الوصول إلى الحد الأقصى لاستخدام هذا الكوبون'
        });
      }

      // التحقق من الحد الأدنى لقيمة الطلب
      const orderAmount = parseFloat(order_amount);
      if (orderAmount < coupon.min_order_amount) {
        return res.status(400).json({
          status: 'error',
          message: `الحد الأدنى لقيمة الطلب هو ${coupon.min_order_amount} ريال`
        });
      }

      // حساب قيمة الخصم
      let discountAmount = 0;
      if (coupon.discount_type === 'percentage') {
        discountAmount = (orderAmount * coupon.discount_value) / 100;
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
        message: 'كوبون صالح',
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          description: coupon.description,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          min_order_amount: coupon.min_order_amount,
          discount_amount: discountAmount,
          final_amount: finalAmount
        },
        calculation: {
          original_amount: orderAmount,
          discount_amount: discountAmount,
          final_amount: finalAmount
        }
      });
    }
  );
});

// ======== واجهات القسائم الشرائية (Gift Cards) ========

// API التحقق من صحة القسيمة الشرائية
app.post('/api/validate-gift-card', (req, res) => {
  const { card_number, pin_code, order_amount } = req.body;

  if (!card_number || !pin_code) {
    return res.status(400).json({
      status: 'error',
      message: 'رقم القسيمة والرمز السري مطلوبان'
    });
  }

  db.get(
    'SELECT * FROM gift_cards WHERE card_number = ? AND pin_code = ? AND is_active = 1',
    [card_number, pin_code],
    (err, giftCard) => {
      if (err) {
        console.error('❌ خطأ في البحث عن القسيمة:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      if (!giftCard) {
        return res.status(404).json({
          status: 'error',
          message: 'قسيمة غير صالحة أو غير موجودة'
        });
      }

      // التحقق من صلاحية القسيمة
      const now = new Date();
      const validUntil = new Date(giftCard.valid_until);

      if (now > validUntil) {
        return res.status(400).json({
          status: 'error',
          message: 'هذه القسيمة منتهية الصلاحية'
        });
      }

      // التحقق من الحد الأقصى للاستخدام
      if (giftCard.max_uses > 0 && giftCard.used_count >= giftCard.max_uses) {
        return res.status(400).json({
          status: 'error',
          message: 'تم الوصول إلى الحد الأقصى لاستخدام هذه القسيمة'
        });
      }

      // التحقق من الرصيد المتاح
      if (giftCard.current_balance <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'لا يوجد رصيد متاح في هذه القسيمة'
        });
      }

      // حساب المبلغ المستخدم من القسيمة
      let usedAmount = 0;
      if (order_amount) {
        const orderAmount = parseFloat(order_amount);
        usedAmount = Math.min(giftCard.current_balance, orderAmount);
      } else {
        usedAmount = giftCard.current_balance;
      }

      const finalAmount = order_amount ? (parseFloat(order_amount) - usedAmount) : 0;
      const remainingBalance = giftCard.current_balance - usedAmount;

      res.json({
        status: 'success',
        message: 'قسيمة صالحة',
        valid: true,
        gift_card: {
          id: giftCard.id,
          card_number: giftCard.card_number,
          initial_amount: giftCard.initial_amount,
          current_balance: giftCard.current_balance,
          used_amount: usedAmount,
          remaining_balance: remainingBalance,
          valid_until: giftCard.valid_until,
          customer_name: giftCard.customer_name
        },
        calculation: {
          original_amount: order_amount ? parseFloat(order_amount) : 0,
          gift_card_amount: usedAmount,
          final_amount: finalAmount
        }
      });
    }
  );
});

// API جلب جميع القسائم الشرائية
app.get('/api/gift-cards', (req, res) => {
  db.all('SELECT * FROM gift_cards ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب القسائم:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    res.json({
      status: 'success',
      gift_cards: rows,
      count: rows.length,
      message: `تم العثور على ${rows.length} قسيمة`
    });
  });
});

// API جلب قسيمة محددة
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

// API إنشاء قسيمة جديدة
app.post('/api/gift-cards', (req, res) => {
  const {
    card_number,
    pin_code,
    initial_amount,
    valid_until,
    customer_name,
    customer_phone,
    notes,
    max_uses,
    is_active
  } = req.body;

  // التحقق من الحقول المطلوبة
  if (!card_number || !pin_code || !initial_amount) {
    return res.status(400).json({
      status: 'error',
      message: 'رقم القسيمة والرمز السري والمبلغ الابتدائي مطلوبة'
    });
  }

  // التحقق من أن رقم القسيمة غير مكرر
  db.get('SELECT id FROM gift_cards WHERE card_number = ?', [card_number], (err, existingCard) => {
    if (err) {
      console.error('❌ خطأ في التحقق من رقم القسيمة:', err);
      return res.status(500).json({
        status: 'error',
        message: 'فشل في التحقق من رقم القسيمة: ' + err.message
      });
    }

    if (existingCard) {
      return res.status(400).json({
        status: 'error',
        message: 'رقم القسيمة مستخدم مسبقاً'
      });
    }

    // تعيين تاريخ الصلاحية الافتراضي (90 يوم)
    const defaultValidUntil = new Date();
    defaultValidUntil.setDate(defaultValidUntil.getDate() + 90);

    db.run(
      `INSERT INTO gift_cards (
        card_number, pin_code, initial_amount, current_balance, valid_until,
        customer_name, customer_phone, notes, max_uses, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card_number,
        pin_code,
        parseFloat(initial_amount),
        parseFloat(initial_amount), // الرصيد الحالي يساوي المبلغ الابتدائي
        valid_until || defaultValidUntil.toISOString(),
        customer_name || '',
        customer_phone || '',
        notes || '',
        max_uses || 1,
        is_active !== undefined ? is_active : 1
      ],
      function(err) {
        if (err) {
          console.error('❌ خطأ في إنشاء القسيمة:', err);
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
});

// API تحديث قسيمة
app.put('/api/gift-cards/:id', (req, res) => {
  const { id } = req.params;
  const {
    card_number,
    pin_code,
    initial_amount,
    current_balance,
    valid_until,
    customer_name,
    customer_phone,
    notes,
    max_uses,
    used_count,
    is_active
  } = req.body;

  // التحقق من أن رقم القسيمة غير مكرر (باستثناء القسيمة الحالية)
  const checkCardQuery = 'SELECT id FROM gift_cards WHERE card_number = ? AND id != ?';
  
  db.get(checkCardQuery, [card_number, id], (err, existingCard) => {
    if (err) {
      console.error('❌ خطأ في التحقق من رقم القسيمة:', err);
      return res.status(500).json({
        status: 'error',
        message: 'فشل في التحقق من رقم القسيمة: ' + err.message
      });
    }

    if (existingCard) {
      return res.status(400).json({
        status: 'error',
        message: 'رقم القسيمة مستخدم مسبقاً'
      });
    }

    // تحديث البيانات
    db.run(
      `UPDATE gift_cards SET
        card_number = COALESCE(?, card_number),
        pin_code = COALESCE(?, pin_code),
        initial_amount = COALESCE(?, initial_amount),
        current_balance = COALESCE(?, current_balance),
        valid_until = COALESCE(?, valid_until),
        customer_name = COALESCE(?, customer_name),
        customer_phone = COALESCE(?, customer_phone),
        notes = COALESCE(?, notes),
        max_uses = COALESCE(?, max_uses),
        used_count = COALESCE(?, used_count),
        is_active = COALESCE(?, is_active)
      WHERE id = ?`,
      [
        card_number,
        pin_code,
        initial_amount ? parseFloat(initial_amount) : null,
        current_balance ? parseFloat(current_balance) : null,
        valid_until,
        customer_name,
        customer_phone,
        notes,
        max_uses,
        used_count,
        is_active,
        id
      ],
      function(err) {
        if (err) {
          console.error('❌ خطأ في تحديث القسيمة:', err);
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
});

// API حذف قسيمة
app.delete('/api/gift-cards/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM gift_cards WHERE id = ?', [id], function(err) {
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

// API معالجة الدفع - محدث ليدعم القسائم الشرائية
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
    coupon_code,
    gift_card_number,
    gift_card_pin
  } = req.body;

  console.log('💰 طلب دفع جديد:', { 
    customer: customer_name,
    items_count: cart_items.length, 
    total_amount, 
    coupon_code: coupon_code || 'لا يوجد',
    gift_card: gift_card_number || 'لا يوجد'
  });

  // التحقق من البيانات
  if (!cart_items || cart_items.length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'السلة فارغة'
    });
  }

  // متغيرات الخصم والقسيمة
  let discountAmount = 0;
  let giftCardAmount = 0;
  let finalAmount = parseFloat(total_amount);
  let appliedCoupon = null;
  let appliedGiftCard = null;

  // التحقق من الكوبون إذا كان موجوداً
  const processCoupon = () => {
    return new Promise((resolve, reject) => {
      if (coupon_code) {
        db.get(
          'SELECT * FROM coupons WHERE code = ? AND is_active = 1',
          [coupon_code],
          (err, coupon) => {
            if (err) {
              reject(err);
              return;
            }

            if (coupon) {
              // التحقق من صلاحية الكوبون
              const now = new Date();
              const validFrom = new Date(coupon.valid_from);
              const validUntil = new Date(coupon.valid_until);

              if (now >= validFrom && now <= validUntil) {
                // التحقق من الحد الأقصى للاستخدام
                if (coupon.max_uses === -1 || coupon.used_count < coupon.max_uses) {
                  // التحقق من الحد الأدنى للطلب
                  if (finalAmount >= coupon.min_order_amount) {
                    // حساب قيمة الخصم
                    if (coupon.discount_type === 'percentage') {
                      discountAmount = (finalAmount * coupon.discount_value) / 100;
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
                    db.run(
                      'UPDATE coupons SET used_count = used_count + 1 WHERE id = ?',
                      [coupon.id]
                    );

                    console.log('✅ تم تطبيق الكوبون:', {
                      code: coupon.code,
                      discount: discountAmount,
                      final: finalAmount
                    });
                  } else {
                    console.log('❌ قيمة الطلب أقل من الحد الأدنى للكوبون');
                  }
                } else {
                  console.log('❌ تم الوصول للحد الأقصى لاستخدام الكوبون');
                }
              } else {
                console.log('❌ الكوبون خارج الفترة الزمنية');
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

  // التحقق من القسيمة الشرائية إذا كانت موجودة
  const processGiftCard = () => {
    return new Promise((resolve, reject) => {
      if (gift_card_number && gift_card_pin) {
        db.get(
          'SELECT * FROM gift_cards WHERE card_number = ? AND pin_code = ? AND is_active = 1',
          [gift_card_number, gift_card_pin],
          (err, giftCard) => {
            if (err) {
              reject(err);
              return;
            }

            if (giftCard) {
              // التحقق من صلاحية القسيمة
              const now = new Date();
              const validUntil = new Date(giftCard.valid_until);

              if (now <= validUntil) {
                // التحقق من الحد الأقصى للاستخدام
                if (giftCard.max_uses === -1 || giftCard.used_count < giftCard.max_uses) {
                  // التحقق من الرصيد المتاح
                  if (giftCard.current_balance > 0) {
                    // حساب المبلغ المستخدم من القسيمة
                    giftCardAmount = Math.min(giftCard.current_balance, finalAmount);
                    finalAmount = finalAmount - giftCardAmount;
                    appliedGiftCard = giftCard;

                    // تحديث رصيد القسيمة وعداد الاستخدام
                    const newBalance = giftCard.current_balance - giftCardAmount;
                    const newUsedCount = giftCard.used_count + 1;

                    db.run(
                      'UPDATE gift_cards SET current_balance = ?, used_count = ?, used_amount = used_amount + ? WHERE id = ?',
                      [newBalance, newUsedCount, giftCardAmount, giftCard.id]
                    );

                    console.log('✅ تم استخدام القسيمة:', {
                      card_number: giftCard.card_number,
                      used_amount: giftCardAmount,
                      remaining_balance: newBalance,
                      final: finalAmount
                    });
                  } else {
                    console.log('❌ لا يوجد رصيد متاح في القسيمة');
                  }
                } else {
                  console.log('❌ تم الوصول للحد الأقصى لاستخدام القسيمة');
                }
              } else {
                console.log('❌ القسيمة منتهية الصلاحية');
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

  // معالجة الطلب بعد التحقق من الكوبون والقسيمة
  Promise.all([processCoupon(), processGiftCard()])
    .then(() => {
      // إنشاء رقم طلب فريد
      const orderNumber = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();

      db.run(
        `INSERT INTO orders (
          order_number, cart_items, total_amount, discount_amount, coupon_code,
          gift_card_number, gift_card_amount, order_date, order_status, 
          customer_name, customer_phone, customer_email, payment_method
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNumber,
          JSON.stringify(cart_items),
          total_amount, // المبلغ الأصلي
          discountAmount, // قيمة الخصم
          appliedCoupon ? appliedCoupon.code : null,
          appliedCoupon ? appliedCoupon.discount_type : null,
          appliedGiftCard ? appliedGiftCard.card_number : null,
          appliedGiftCard ? 'gift_card' : null,
          giftCardAmount, // المبلغ المستخدم من القسيمة
          order_date,
          order_status || 'pending',
          customer_name || 'عميل',
          customer_phone || '',
          customer_email || '',
          payment_method || 'online'
        ],
        function(err) {
          if (err) {
            console.error('❌ خطأ في حفظ الطلب:', err);
            return res.status(500).json({
              status: 'error',
              message: 'فشل في معالجة الطلب: ' + err.message
            });
          }

          console.log('✅ طلب جديد محفوظ:', {
            order_id: orderNumber,
            customer: customer_name,
            original_total: total_amount,
            discount: discountAmount,
            gift_card: giftCardAmount,
            final_total: finalAmount,
            coupon: appliedCoupon ? appliedCoupon.code : 'لا يوجد',
            gift_card: appliedGiftCard ? appliedGiftCard.card_number : 'لا يوجد'
          });
          
          res.json({
            status: 'success',
            message: 'تم إرسال الطلب بنجاح إلى الإدارة',
            order_id: orderNumber,
            order_status: 'pending',
            original_amount: parseFloat(total_amount),
            discount_amount: discountAmount,
            gift_card_amount: giftCardAmount,
            final_amount: finalAmount,
            coupon_code: appliedCoupon ? appliedCoupon.code : null,
            gift_card_number: appliedGiftCard ? appliedGiftCard.card_number : null,
            coupon_details: appliedCoupon ? {
              code: appliedCoupon.code,
              description: appliedCoupon.description,
              discount_type: appliedCoupon.discount_type,
              discount_value: appliedCoupon.discount_value
            } : null,
            gift_card_details: appliedGiftCard ? {
              card_number: appliedGiftCard.card_number,
              initial_amount: appliedGiftCard.initial_amount,
              remaining_balance: appliedGiftCard.current_balance - giftCardAmount
            } : null,
            items_count: cart_items.length,
            customer_name: customer_name,
            timestamp: new Date().toISOString(),
            admin_url: `https://database-api-kvxr.onrender.com/admin/orders`
          });
        }
      );
    })
    .catch(error => {
      console.error('❌ خطأ في معالجة الكوبون أو القسيمة:', error);
      return res.status(500).json({
        status: 'error',
        message: 'فشل في معالجة الكوبون أو القسيمة: ' + error.message
      });
    });
});

// API جلب جميع الطلبات
app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب الطلبات:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    // تحويل JSON المخزن إلى كائن
    const orders = rows.map(order => ({
      ...order,
      cart_items: JSON.parse(order.cart_items)
    }));

    res.json({
      status: 'success',
      orders: orders,
      count: orders.length,
      message: `تم العثور على ${orders.length} طلب`
    });
  });
});

// API تحديث حالة الطلب
app.put('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  db.run(
    'UPDATE orders SET order_status = ? WHERE id = ?',
    [status, id],
    function(err) {
      if (err) {
        console.error('❌ خطأ في تحديث حالة الطلب:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
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

// ======== واجهات برمجية للكوبونات ========

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

// API جلب بيانات كوبون محدد
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

// API إنشاء كوبون جديد
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

  // التحقق من الحقول المطلوبة
  if (!code || !discount_type || discount_value === undefined) {
    return res.status(400).json({
      status: 'error',
      message: 'الكود ونوع الخصم وقيمة الخصم مطلوبة'
    });
  }

  // التحقق من أن الكود غير مكرر
  db.get('SELECT id FROM coupons WHERE code = ?', [code], (err, existingCoupon) => {
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
      `INSERT INTO coupons (
        code, description, discount_type, discount_value, min_order_amount,
        max_uses, valid_from, valid_until, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        description || '',
        discount_type,
        discount_value,
        min_order_amount || 0,
        max_uses || -1,
        valid_from || new Date().toISOString(),
        valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 يوم افتراضي
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

// API تحديث كوبون - محدث
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
    is_active,
    used_count
  } = req.body;

  // التحقق من أن الكود غير مكرر (باستثناء الكوبون الحالي)
  const checkCodeQuery = 'SELECT id FROM coupons WHERE code = ? AND id != ?';
  
  db.get(checkCodeQuery, [code, id], (err, existingCoupon) => {
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

    // تحديث البيانات
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
        used_count = COALESCE(?, used_count)
      WHERE id = ?`,
      [
        code,
        description,
        discount_type,
        discount_value,
        min_order_amount,
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

// ======== واجهات تصدير المبيعات ========

// دوال مساعدة للتصدير
function getOrderStatusText(status) {
    const statusMap = {
        'pending': 'قيد الانتظار',
        'completed': 'مكتمل',
        'cancelled': 'ملغي'
    };
    return statusMap[status] || status;
}

function getPaymentMethodText(method) {
    const methodMap = {
        'online': 'دفع إلكتروني',
        'cash': 'الدفع عند الاستلام'
    };
    return methodMap[method] || method;
}

// API تصدير المبيعات إلى Excel
app.get('/api/export-sales', async (req, res) => {
    try {
        const { 
            start_date, 
            end_date, 
            export_type = 'all',
            customer_name,
            order_status 
        } = req.query;

        console.log('📊 طلب تصدير المبيعات:', { 
            start_date, 
            end_date, 
            export_type,
            customer_name,
            order_status 
        });

        // بناء استعلام SQL بناءً على الفلاتر
        let sqlQuery = `
            SELECT o.*,
                   json_extract(o.cart_items, '$') as cart_items_json
            FROM orders o
        `;
        
        const conditions = [];
        const params = [];

        // إضافة الفلاتر إذا كانت موجودة
        if (start_date && end_date) {
            conditions.push('o.order_date BETWEEN ? AND ?');
            params.push(start_date, end_date);
        } else if (start_date) {
            conditions.push('o.order_date >= ?');
            params.push(start_date);
        } else if (end_date) {
            conditions.push('o.order_date <= ?');
            params.push(end_date);
        }

        if (customer_name) {
            conditions.push('o.customer_name LIKE ?');
            params.push(`%${customer_name}%`);
        }

        if (order_status && order_status !== 'all') {
            conditions.push('o.order_status = ?');
            params.push(order_status);
        }

        if (conditions.length > 0) {
            sqlQuery += ' WHERE ' + conditions.join(' AND ');
        }

        sqlQuery += ' ORDER BY o.created_at DESC';

        // جلب البيانات من قاعدة البيانات
        const orders = await new Promise((resolve, reject) => {
            db.all(sqlQuery, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // تحويل بيانات السلة من JSON
                const processedOrders = rows.map(order => ({
                    ...order,
                    cart_items: JSON.parse(order.cart_items_json)
                }));
                
                resolve(processedOrders);
            });
        });

        if (orders.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'لا توجد بيانات للتصدير في الفترة المحددة'
            });
        }

        // إنشاء ملف Excel جديد
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'نظام المبيعات';
        workbook.created = new Date();

        // ======== ورقة الملخص ========
        const summarySheet = workbook.addWorksheet('ملخص المبيعات');
        
        // تنسيق العنوان
        summarySheet.mergeCells('A1:H1');
        const titleCell = summarySheet.getCell('A1');
        titleCell.value = 'تقرير المبيعات - نظام المتجر';
        titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
        titleCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '2E7D32' }
        };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // معلومات الفترة
        summarySheet.mergeCells('A2:H2');
        const periodCell = summarySheet.getCell('A2');
        const periodText = start_date && end_date 
            ? `الفترة: من ${start_date} إلى ${end_date}`
            : 'جميع الفترات';
        periodCell.value = periodText;
        periodCell.font = { bold: true, size: 12 };
        periodCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // إحصائيات المبيعات
        const totalSales = orders.reduce((sum, order) => sum + parseFloat(order.total_amount), 0);
        const totalDiscounts = orders.reduce((sum, order) => sum + parseFloat(order.discount_amount), 0);
        const totalGiftCards = orders.reduce((sum, order) => sum + parseFloat(order.gift_card_amount), 0);
        const netSales = totalSales - totalDiscounts - totalGiftCards;
        const totalOrders = orders.length;
        const completedOrders = orders.filter(order => order.order_status === 'completed').length;
        const pendingOrders = orders.filter(order => order.order_status === 'pending').length;

        summarySheet.addRow([]);
        summarySheet.addRow(['إحصائيات المبيعات', '', '', '', '', '', '', '']);
        summarySheet.addRow(['إجمالي المبيعات', `${totalSales.toFixed(2)} ر.س`, '', '', '', '', '', '']);
        summarySheet.addRow(['إجمالي الخصومات', `${totalDiscounts.toFixed(2)} ر.س`, '', '', '', '', '', '']);
        summarySheet.addRow(['إجمالي القسائم', `${totalGiftCards.toFixed(2)} ر.س`, '', '', '', '', '', '']);
        summarySheet.addRow(['صافي المبيعات', `${netSales.toFixed(2)} ر.س`, '', '', '', '', '', '']);
        summarySheet.addRow(['إجمالي الطلبات', totalOrders, '', '', '', '', '', '']);
        summarySheet.addRow(['الطلبات المكتملة', completedOrders, '', '', '', '', '', '']);
        summarySheet.addRow(['الطلبات قيد الانتظار', pendingOrders, '', '', '', '', '', '']);

        // ======== ورقة التفاصيل ========
        const detailsSheet = workbook.addWorksheet('تفاصيل الطلبات');

        // عناوين الأعمدة
        detailsSheet.columns = [
            { header: 'رقم الطلب', key: 'order_number', width: 15 },
            { header: 'تاريخ الطلب', key: 'order_date', width: 20 },
            { header: 'اسم العميل', key: 'customer_name', width: 20 },
            { header: 'هاتف العميل', key: 'customer_phone', width: 15 },
            { header: 'بريد العميل', key: 'customer_email', width: 25 },
            { header: 'حالة الطلب', key: 'order_status', width: 15 },
            { header: 'طريقة الدفع', key: 'payment_method', width: 15 },
            { header: 'إجمالي الطلب', key: 'total_amount', width: 15 },
            { header: 'قيمة الخصم', key: 'discount_amount', width: 15 },
            { header: 'قسيمة شرائية', key: 'gift_card_amount', width: 15 },
            { header: 'الصافي', key: 'net_amount', width: 15 },
            { header: 'كود الخصم', key: 'coupon_code', width: 15 },
            { header: 'رقم القسيمة', key: 'gift_card_number', width: 15 },
            { header: 'عدد المنتجات', key: 'items_count', width: 15 },
            { header: 'المنتجات', key: 'products', width: 40 }
        ];

        // تنسيق رأس الجدول
        const headerRow = detailsSheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '2196F3' }
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        // إضافة البيانات
        orders.forEach(order => {
            const netAmount = parseFloat(order.total_amount) - parseFloat(order.discount_amount) - parseFloat(order.gift_card_amount);
            const productsText = order.cart_items.map(item => 
                `${item.name} (${item.quantity}x)`
            ).join('، ');

            detailsSheet.addRow({
                order_number: order.order_number,
                order_date: new Date(order.order_date).toLocaleString('ar-SA'),
                customer_name: order.customer_name,
                customer_phone: order.customer_phone,
                customer_email: order.customer_email,
                order_status: getOrderStatusText(order.order_status),
                payment_method: getPaymentMethodText(order.payment_method),
                total_amount: `${parseFloat(order.total_amount).toFixed(2)} ر.س`,
                discount_amount: `${parseFloat(order.discount_amount).toFixed(2)} ر.س`,
                gift_card_amount: `${parseFloat(order.gift_card_amount).toFixed(2)} ر.س`,
                net_amount: `${netAmount.toFixed(2)} ر.س`,
                coupon_code: order.coupon_code || 'لا يوجد',
                gift_card_number: order.gift_card_number || 'لا يوجد',
                items_count: order.cart_items.length,
                products: productsText
            });
        });

        // تنسيق الأرقام
        detailsSheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.alignment = { horizontal: 'right', vertical: 'middle' };
            }
        });

        // ======== ورقة تحليل المنتجات ========
        const productsSheet = workbook.addWorksheet('تحليل المنتجات');

        // تحليل مبيعات المنتجات
        const productAnalysis = {};
        orders.forEach(order => {
            order.cart_items.forEach(item => {
                const productName = item.name || 'منتج غير معروف';
                const quantity = item.quantity || 1;
                const price = parseFloat(item.price) || 0;
                const total = quantity * price;

                if (!productAnalysis[productName]) {
                    productAnalysis[productName] = {
                        quantity: 0,
                        totalSales: 0,
                        ordersCount: 0
                    };
                }

                productAnalysis[productName].quantity += quantity;
                productAnalysis[productName].totalSales += total;
                productAnalysis[productName].ordersCount += 1;
            });
        });

        // عناوين أعمدة تحليل المنتجات
        productsSheet.columns = [
            { header: 'اسم المنتج', key: 'product_name', width: 30 },
            { header: 'الكمية المباعة', key: 'quantity', width: 15 },
            { header: 'إجمالي المبيعات', key: 'total_sales', width: 20 },
            { header: 'عدد الطلبات', key: 'orders_count', width: 15 },
            { header: 'متوسط السعر', key: 'avg_price', width: 15 }
        ];

        // تنسيق رأس الجدول
        const productsHeader = productsSheet.getRow(1);
        productsHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
        productsHeader.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF9800' }
        };
        productsHeader.alignment = { horizontal: 'center', vertical: 'middle' };

        // إضافة بيانات تحليل المنتجات
        Object.entries(productAnalysis).forEach(([productName, data]) => {
            const avgPrice = data.totalSales / data.quantity;
            
            productsSheet.addRow({
                product_name: productName,
                quantity: data.quantity,
                total_sales: `${data.totalSales.toFixed(2)} ر.س`,
                orders_count: data.ordersCount,
                avg_price: `${avgPrice.toFixed(2)} ر.س`
            });
        });

        // تنسيق أوراق العمل
        [summarySheet, detailsSheet, productsSheet].forEach(sheet => {
            sheet.eachRow((row, rowNumber) => {
                row.alignment = { horizontal: 'right', vertical: 'middle' };
            });
        });

        // إنشاء اسم للملف
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `sales-report-${timestamp}.xlsx`;
        const filepath = path.join(exportsDir, filename);

        // حفظ الملف
        await workbook.xlsx.writeFile(filepath);

        console.log('✅ تم تصدير المبيعات إلى Excel:', {
            filename,
            orders_count: orders.length,
            file_size: `${(fs.statSync(filepath).size / 1024 / 1024).toFixed(2)} MB`
        });

        // إرسال الملف للعميل
        res.download(filepath, filename, (err) => {
            if (err) {
                console.error('❌ خطأ في إرسال الملف:', err);
                return res.status(500).json({
                    status: 'error',
                    message: 'فشل في تحميل الملف'
                });
            }

            // حذف الملف بعد التنزيل (اختياري)
            setTimeout(() => {
                fs.unlink(filepath, (unlinkErr) => {
                    if (unlinkErr) {
                        console.error('❌ خطأ في حذف الملف:', unlinkErr);
                    } else {
                        console.log('✅ تم حذف الملف المؤقت:', filename);
                    }
                });
            }, 30000); // حذف بعد 30 ثانية
        });

    } catch (error) {
        console.error('❌ خطأ في تصدير المبيعات:', error);
        res.status(500).json({
            status: 'error',
            message: 'فشل في تصدير البيانات: ' + error.message
        });
    }
});

// API تصدير سريع لجميع المبيعات
app.get('/api/export-all-sales', async (req, res) => {
    try {
        const orders = await new Promise((resolve, reject) => {
            db.all(`
                SELECT o.*, 
                       json_extract(o.cart_items, '$') as cart_items_json
                FROM orders o 
                ORDER BY o.created_at DESC
            `, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const processedOrders = rows.map(order => ({
                    ...order,
                    cart_items: JSON.parse(order.cart_items_json)
                }));
                
                resolve(processedOrders);
            });
        });

        if (orders.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'لا توجد طلبات للتصدير'
            });
        }

        // إنشاء ملف Excel مبسط
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('المبيعات');

        worksheet.columns = [
            { header: 'رقم الطلب', key: 'order_number', width: 15 },
            { header: 'التاريخ', key: 'order_date', width: 20 },
            { header: 'العميل', key: 'customer_name', width: 20 },
            { header: 'الهاتف', key: 'customer_phone', width: 15 },
            { header: 'الإجمالي', key: 'total_amount', width: 15 },
            { header: 'الخصم', key: 'discount_amount', width: 15 },
            { header: 'القسيمة', key: 'gift_card_amount', width: 15 },
            { header: 'الصافي', key: 'net_amount', width: 15 },
            { header: 'الحالة', key: 'order_status', width: 15 }
        ];

        // تنسيق الرأس
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4CAF50' }
        };

        // إضافة البيانات
        orders.forEach(order => {
            const netAmount = parseFloat(order.total_amount) - parseFloat(order.discount_amount) - parseFloat(order.gift_card_amount);
            
            worksheet.addRow({
                order_number: order.order_number,
                order_date: new Date(order.order_date).toLocaleString('ar-SA'),
                customer_name: order.customer_name,
                customer_phone: order.customer_phone,
                total_amount: `${parseFloat(order.total_amount).toFixed(2)} ر.س`,
                discount_amount: `${parseFloat(order.discount_amount).toFixed(2)} ر.س`,
                gift_card_amount: `${parseFloat(order.gift_card_amount).toFixed(2)} ر.س`,
                net_amount: `${netAmount.toFixed(2)} ر.س`,
                order_status: getOrderStatusText(order.order_status)
            });
        });

        // تنسيق جميع الصفوف
        worksheet.eachRow((row, rowNumber) => {
            row.alignment = { horizontal: 'right', vertical: 'middle' };
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `all-sales-${timestamp}.xlsx`;
        const filepath = path.join(exportsDir, filename);

        await workbook.xlsx.writeFile(filepath);

        res.download(filepath, filename);

    } catch (error) {
        console.error('❌ خطأ في التصدير السريع:', error);
        res.status(500).json({
            status: 'error',
            message: 'فشل في التصدير: ' + error.message
        });
    }
});

// ======== صفحات الإدارة ========

// حماية مركزية لصفحات الإدارة: أي مسار يبدأ بـ /admin يتطلب تسجيل دخول
app.use('/admin', (req, res, next) => {
  // اسماء المسارات المسموح الوصول لها بدون مصادقة
  const publicAdminPaths = ['/admin/login', '/admin/logout'];
  if (publicAdminPaths.includes(req.path) || publicAdminPaths.includes(req.originalUrl)) return next();

  if (!isAuthenticated(req)) {
    // إذا كان الطلب من AJAX نعيد JSON بخطأ، وإلا نوجه لنموذج تسجيل الدخول
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(401).json({ status: 'error', message: 'مطلوب تسجيل الدخول' });
    }
    return res.redirect('/admin/login');
  }

  next();
});

// صفحة ويب لعرض البيانات
app.get('/admin', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.send(`
        <html>
          <head>
            <title>خطأ</title>
            <meta charset="UTF-8">
          </head>
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
            .header { background: rgba(255, 255, 255, 0.95); color: #333; padding: 30px; border-radius: 15px; margin-bottom: 20px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.1); position: relative; }
            .stats { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
            .user-card { background: rgba(255, 255, 255, 0.95); padding: 20px; margin-bottom: 15px; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-right: 4px solid #667eea; transition: transform 0.2s; }
            .user-card:hover { transform: translateY(-2px); }
            .user-id { background: #667eea; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .timestamp { color: #666; font-size: 12px; background: #f8f9fa; padding: 4px 8px; border-radius: 10px; }
            .no-data { text-align: center; padding: 60px; color: #666; background: rgba(255, 255, 255, 0.95); border-radius: 10px; }
            .nav { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            .nav-btn { background: #fff; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .nav-btn:hover { background: #667eea; color: white; transform: translateY(-2px); }
            .logout-btn { position: absolute; left: 20px; top: 20px; background: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .logout-btn:hover { background: #d32f2f; transform: translateY(-2px); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <a href="/logout" class="logout-btn">🚪 تسجيل الخروج</a>
                <h1 style="margin: 0; color: #333;">📊 بيانات المستخدمين - نظام الاختبار</h1>
                <p style="margin: 10px 0 0 0; color: #666;">جميع البيانات المرسلة من تطبيق الجوال</p>
            </div>
            
            <div class="nav">
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
                <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
                <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
                <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
                <a href="/admin/gift-cards" class="nav-btn">💳 إدارة القسائم</a>
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
      html += `
            <div class="no-data">
                <h3 style="color: #666; margin-bottom: 10px;">📭 لا توجد بيانات</h3>
                <p style="color: #999;">لم يتم إرسال أي بيانات من التطبيق بعد</p>
                <p style="color: #999;">استخدم تطبيق الجوال لإرسال البيانات الأولى</p>
            </div>
      `;
    } else {
      rows.forEach(user => {
        html += `
            <div class="user-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <span class="user-id">#${user.id}</span>
                    <span class="timestamp">${user.created_at}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px; font-weight: bold; width: 120px; color: #333;">الاسم:</td>
                        <td style="padding: 8px; color: #555;">${user.name || 'غير محدد'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold; color: #333;">البريد الإلكتروني:</td>
                        <td style="padding: 8px; color: #555;">${user.email || 'غير محدد'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold; color: #333;">الهاتف:</td>
                        <td style="padding: 8px; color: #555;">${user.phone || 'غير محدد'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold; color: #333;">الرسالة:</td>
                        <td style="padding: 8px; color: #555;">${user.message || 'لا توجد رسالة'}</td>
                    </tr>
                </table>
            </div>
        `;
      });
    }

    html += `
        </div>
        
        <script>
            // تحديث تلقائي كل 15 ثانية
            setTimeout(() => {
                location.reload();
            }, 15000);
        </script>
    </body>
    </html>
    `;

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
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; position: relative; }
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
            .logout-btn { position: absolute; left: 20px; top: 20px; background: #f44336; color: white; padding: 12px 24px; border: none; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: all 0.3s; font-weight: 500; }
            .logout-btn:hover { background: #d32f2f; transform: translateY(-2px); }
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
                <a href="/logout" class="logout-btn">🚪 تسجيل الخروج</a>
                <h1 style="margin: 0; font-size: 2.5rem;">🛠️ لوحة التحكم - نظام الاختبار</h1>
                <p style="margin: 10px 0 0 0; font-size: 1.1rem; opacity: 0.9;">إدارة وعرض جميع البيانات من تطبيق الجوال</p>
            </div>
            
            <div class="controls">
                <a href="/admin" class="btn btn-secondary">📊 العرض البسيط</a>
                <a href="/admin/orders" class="btn btn-success">🛒 إدارة الطلبات</a>
                <a href="/admin/coupons" class="btn btn-info">🎫 إدارة الكوبونات</a>
                <a href="/admin/gift-cards" class="btn btn-info">💳 إدارة القسائم</a>
                <a href="/admin/settings" class="btn btn-info">⚙️ إعدادات النظام</a>
                <a href="/api/all-data" class="btn btn-success">📋 JSON البيانات</a>
                <a href="/api/orders" class="btn btn-primary">📦 JSON الطلبات</a>
                <a href="/" class="btn btn-secondary">🏠 الرئيسية</a>
                <button onclick="clearAllData()" class="btn btn-danger">🗑️ مسح جميع البيانات</button>
                <div style="margin-left: auto; display: flex; align-items: center; gap: 15px;">
                    <div class="stats-card">
                        <strong>عدد السجلات:</strong> <span style="color: #2196F3; font-weight: bold;">${rows.length}</span>
                    </div>
                    <div class="stats-card">
                        <strong>الحالة:</strong> <span style="color: #4CAF50; font-weight: bold;">✅ نشط</span>
                    </div>
                </div>
            </div>
            
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>الاسم</th>
                            <th>البريد الإلكتروني</th>
                            <th>الهاتف</th>
                            <th>الرسالة</th>
                            <th>تاريخ الإدخال</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (rows.length === 0) {
      html += `
                        <tr>
                            <td colspan="6" class="empty-state">
                                <h3 style="color: #666; margin-bottom: 10px;">📭 لا توجد بيانات حتى الآن</h3>
                                <p style="color: #999;">استخدم تطبيق الجوال لإرسال البيانات الأولى</p>
                            </td>
                        </tr>
      `;
    } else {
      rows.forEach(user => {
        html += `
                        <tr>
                            <td><span class="badge">${user.id}</span></td>
                            <td><strong>${user.name || 'غير محدد'}</strong></td>
                            <td>${user.email || 'غير محدد'}</td>
                            <td>${user.phone || 'غير محدد'}</td>
                            <td>${user.message || 'لا توجد رسالة'}</td>
                            <td style="font-size: 13px; color: #666;">${user.created_at}</td>
                        </tr>
        `;
      });
    }

    html += `
                    </tbody>
                </table>
            </div>
        </div>

        <script>
            function clearAllData() {
                if (confirm('⚠️ هل أنت متأكد من مسح جميع البيانات؟ لا يمكن التراجع عن هذا الإجراء!')) {
                    fetch('/api/clear-all-data', { method: 'DELETE' })
                        .then(response => response.json())
                        .then(data => {
                            alert('✅ ' + data.message);
                            location.reload();
                        })
                        .catch(error => {
                            alert('❌ حدث خطأ: ' + error);
                        });
                }
            }
            
            // تحديث تلقائي كل 10 ثواني
            setInterval(() => {
                location.reload();
            }, 10000);
        </script>
    </body>
    </html>
    `;

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
            .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; position: relative; }
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
            .logout-btn { position: absolute; left: 20px; top: 20px; background: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .logout-btn:hover { background: #d32f2f; transform: translateY(-2px); }
            .empty-state { text-align: center; padding: 60px; color: #666; background: white; border-radius: 15px; }
            .customer-info { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
            .export-section { background: white; padding: 25px; border-radius: 15px; margin-bottom: 30px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
            .export-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px; }
            .form-group { display: flex; flex-direction: column; }
            .form-label { margin-bottom: 5px; font-weight: 600; color: #333; }
            .form-control { padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; }
            .btn { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: all 0.3s; font-weight: 500; }
            .btn-success { background: #4CAF50; color: white; }
            .btn-success:hover { background: #388E3C; transform: translateY(-2px); }
            .btn-info { background: #2196F3; color: white; }
            .btn-info:hover { background: #1976D2; transform: translateY(-2px); }
            .quick-export { display: flex; gap: 10px; flex-wrap: wrap; }
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .stat-card { background: white; padding: 20px; border-radius: 10px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .stat-number { font-size: 24px; font-weight: bold; }
            .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <a href="/logout" class="logout-btn">🚪 تسجيل الخروج</a>
                <h1 style="margin: 0;">🛒 إدارة الطلبات - نظام المتجر</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">جميع الطلبات المرسلة من تطبيق الجوال</p>
            </div>
            
            <div class="nav">
                <a href="/admin" class="nav-btn">📊 بيانات المستخدمين</a>
                <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
                <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
                <a href="/admin/gift-cards" class="nav-btn">💳 إدارة القسائم</a>
                <a href="/admin/settings" class="nav-btn">⚙️ إعدادات النظام</a>
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
            </div>

            <!-- قسم تصدير المبيعات -->
            <div class="export-section">
                <h3 style="margin: 0 0 20px 0; color: #333;">📈 تصدير تقارير المبيعات</h3>
                
                <form id="exportForm" class="export-form">
                    <div class="form-group">
                        <label class="form-label">من تاريخ</label>
                        <input type="date" name="start_date" class="form-control">
                    </div>
                    <div class="form-group">
                        <label class="form-label">إلى تاريخ</label>
                        <input type="date" name="end_date" class="form-control">
                    </div>
                    <div class="form-group">
                        <label class="form-label">اسم العميل</label>
                        <input type="text" name="customer_name" class="form-control" placeholder="بحث بالاسم...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">حالة الطلب</label>
                        <select name="order_status" class="form-control">
                            <option value="all">جميع الحالات</option>
                            <option value="pending">قيد الانتظار</option>
                            <option value="completed">مكتمل</option>
                            <option value="cancelled">ملغي</option>
                        </select>
                    </div>
                </form>

                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="exportSales()" class="btn btn-success">📊 تصدير مفصل (Excel)</button>
                    <button onclick="exportAllSales()" class="btn btn-info">🚀 تصدير سريع (كل البيانات)</button>
                    <button onclick="resetExportForm()" class="btn" style="background: #6c757d; color: white;">🔄 مسح الفلاتر</button>
                </div>

                <div style="margin-top: 15px; padding: 15px; background: #e8f5e8; border-radius: 8px; border-right: 4px solid #4CAF50;">
                    <strong>💡 ملاحظة:</strong> 
                    <ul style="margin: 10px 0 0 20px; color: #555;">
                        <li>التصدير المفصل يحتوي على 3 أوراق: ملخص، تفاصيل الطلبات، تحليل المنتجات</li>
                        <li>التصدير السريع يحتوي على البيانات الأساسية فقط</li>
                        <li>يمكنك استخدام الفلاتر لتصدير بيانات محددة</li>
                    </ul>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card" style="border-right: 4px solid #2196F3;">
                    <div class="stat-number" style="color: #2196F3;">${rows.length}</div>
                    <div class="stat-label">إجمالي الطلبات</div>
                </div>
                <div class="stat-card" style="border-right: 4px solid #4CAF50;">
                    <div class="stat-number" style="color: #4CAF50;">${rows.filter(o => o.order_status === 'completed').length}</div>
                    <div class="stat-label">طلبات مكتملة</div>
                </div>
                <div class="stat-card" style="border-right: 4px solid #ff9800;">
                    <div class="stat-number" style="color: #ff9800;">${rows.filter(o => o.order_status === 'pending').length}</div>
                    <div class="stat-label">طلبات pending</div>
                </div>
                <div class="stat-card" style="border-right: 4px solid #6c757d;">
                    <div class="stat-number" style="color: #6c757d;">${rows.reduce((sum, order) => sum + parseFloat(order.total_amount), 0).toFixed(2)} ر.س</div>
                    <div class="stat-label">إجمالي المبيعات</div>
                </div>
            </div>
    `;

    if (rows.length === 0) {
      html += `
            <div class="empty-state">
                <h3 style="color: #666; margin-bottom: 10px;">📭 لا توجد طلبات حتى الآن</h3>
                <p style="color: #999;">لم يتم إرسال أي طلبات من التطبيق بعد</p>
            </div>
      `;
    } else {
      rows.forEach(order => {
        const items = JSON.parse(order.cart_items);
        const statusClass = `status-${order.order_status}`;
        const statusText = {
          'pending': 'قيد الانتظار',
          'completed': 'مكتمل',
          'cancelled': 'ملغي'
        }[order.order_status] || order.order_status;
        
        html += `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <span class="order-number">${order.order_number}</span>
                        <span class="order-status ${statusClass}" style="margin-right: 10px;">${statusText}</span>
                    </div>
                    <div style="color: #666; font-size: 14px;">
                        ${new Date(order.order_date).toLocaleString('ar-SA')}
                    </div>
                </div>
                
                <div class="customer-info">
                    <strong>معلومات العميل:</strong><br>
                    الاسم: ${order.customer_name || 'غير محدد'} | 
                    الهاتف: ${order.customer_phone || 'غير محدد'} | 
                    البريد: ${order.customer_email || 'غير محدد'}<br>
                    طريقة الدفع: ${order.payment_method === 'online' ? 'دفع إلكتروني' : 'الدفع عند الاستلام'}
                    ${order.coupon_code ? `<br>كود الخصم: <strong>${order.coupon_code}</strong> (خصم: ${order.discount_amount} ر.س)` : ''}
                    ${order.gift_card_number ? `<br>رقم القسيمة: <strong>${order.gift_card_number}</strong> (مستخدم: ${order.gift_card_amount} ر.س)` : ''}
                </div>
                
                <div class="order-details">
                    <div class="detail-item">
                        <strong>المجموع الأصلي:</strong> ${order.total_amount} ر.س
                    </div>
                    <div class="detail-item">
                        <strong>الخصم:</strong> ${order.discount_amount} ر.س
                    </div>
                    <div class="detail-item">
                        <strong>القسيمة:</strong> ${order.gift_card_amount} ر.س
                    </div>
                    <div class="detail-item">
                        <strong>المجموع النهائي:</strong> ${(order.total_amount - order.discount_amount - order.gift_card_amount).toFixed(2)} ر.س
                    </div>
                    <div class="detail-item">
                        <strong>عدد العناصر:</strong> ${items.length}
                    </div>
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
                            السعر: ${item.price} ر.س × ${item.quantity || 1} 
                            = <strong>${(item.price * (item.quantity || 1)).toFixed(2)} ر.س</strong>
                            ${item.selectedSize && item.selectedSize !== 'غير محدد' ? `<br>المقاس: ${item.selectedSize}` : ''}
                            ${item.colors && item.colors[0] && item.colors[0] !== 'غير محدد' ? `<br>اللون: ${item.colors[0]}` : ''}
                            ${item.image ? `<br><img src="${item.image}" style="max-width: 60px; max-height: 60px; margin-top: 5px; border-radius: 5px;">` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
      });
    }

    html += `
        </div>

        <script>
            // تصدير المبيعات مع الفلاتر
            function exportSales() {
                const formData = new FormData(document.getElementById('exportForm'));
                const params = new URLSearchParams();
                
                for (let [key, value] of formData.entries()) {
                    if (value) {
                        params.append(key, value);
                    }
                }
                
                window.open('/api/export-sales?' + params.toString(), '_blank');
            }

            // تصدير سريع لجميع المبيعات
            function exportAllSales() {
                window.open('/api/export-all-sales', '_blank');
            }

            // مسح الفلاتر
            function resetExportForm() {
                document.getElementById('exportForm').reset();
            }

            function updateOrderStatus(orderId, newStatus) {
                fetch('/api/orders/' + orderId + '/status', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ status: newStatus })
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
            
            // تحديث تلقائي كل 10 ثواني
            setInterval(() => {
                location.reload();
            }, 10000);
        </script>
    </body>
    </html>
    `;

    res.send(html);
  });
});

// صفحة إدارة الكوبونات
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
            .header { background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; position: relative; }
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
            .logout-btn { position: absolute; left: 20px; top: 20px; background: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .logout-btn:hover { background: #d32f2f; transform: translateY(-2px); }
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
                <a href="/logout" class="logout-btn">🚪 تسجيل الخروج</a>
                <h1 style="margin: 0;">🎫 إدارة الكوبونات - نظام المتجر</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">إنشاء وتعديل وحذف كوبونات الخصم مع تحديد الصلاحية</p>
            </div>

            <div class="nav">
                <a href="/admin" class="nav-btn">📊 بيانات المستخدمين</a>
                <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
                <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
                <a href="/admin/gift-cards" class="nav-btn">💳 إدارة القسائم</a>
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
                            <label class="form-label">الحد الأقصى للاستخدام</label>
                            <input type="number" name="max_uses" class="form-control" value="-1" min="-1">
                            <div class="form-help">-1 يعني غير محدود</div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">تاريخ البدء *</label>
                            <input type="datetime-local" name="valid_from" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">تاريخ الانتهاء *</label>
                            <input type="datetime-local" name="valid_until" class="form-control" required>
                        </div>
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
                            <label class="form-label">الحد الأقصى للاستخدام</label>
                            <input type="number" name="max_uses" id="edit_max_uses" class="form-control" min="-1">
                            <div class="form-help">-1 يعني غير محدود</div>
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

                    <div class="form-group">
                        <label class="form-label">عدد مرات الاستخدام</label>
                        <input type="number" name="used_count" id="edit_used_count" class="form-control" min="0">
                        <div class="form-help">يمكنك تعديل عدد مرات الاستخدام يدوياً</div>
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
                
                // تحويل القيم الرقمية
                data.discount_value = parseFloat(data.discount_value);
                data.min_order_amount = parseFloat(data.min_order_amount);
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

// صفحة إدارة القسائم الشرائية (الجديدة)
app.get('/admin/gift-cards', (req, res) => {
  db.all('SELECT * FROM gift_cards ORDER BY created_at DESC', (err, rows) => {
    let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إدارة القسائم الشرائية - نظام المتجر</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f0f2f5; min-height: 100vh; }
            .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #9C27B0 0%, #6A1B9A 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; position: relative; }
            .gift-card { background: white; padding: 25px; margin-bottom: 20px; border-radius: 15px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-right: 4px solid #9C27B0; transition: all 0.3s; }
            .gift-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
            .gift-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
            .gift-card-number { background: #9C27B0; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 16px; }
            .gift-card-status { padding: 6px 12px; border-radius: 15px; font-size: 14px; font-weight: bold; }
            .status-active { background: #d1ecf1; color: #0c5460; }
            .status-inactive { background: #f8d7da; color: #721c24; }
            .status-expired { background: #fff3cd; color: #856404; }
            .status-used { background: #e2e3e5; color: #383d41; }
            .gift-card-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .detail-item { background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 3px solid #9C27B0; }
            .nav { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            .nav-btn { background: #fff; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .nav-btn:hover { background: #9C27B0; color: white; transform: translateY(-2px); }
            .logout-btn { position: absolute; left: 20px; top: 20px; background: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .logout-btn:hover { background: #d32f2f; transform: translateY(-2px); }
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
            .stat-number { font-size: 24px; font-weight: bold; color: #9C27B0; }
            .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
            .balance-bar { background: #e9ecef; border-radius: 10px; height: 10px; margin-top: 5px; overflow: hidden; }
            .balance-fill { background: #4CAF50; height: 100%; border-radius: 10px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <a href="/logout" class="logout-btn">🚪 تسجيل الخروج</a>
                <h1 style="margin: 0;">💳 إدارة القسائم الشرائية - نظام المتجر</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">إنشاء وتعديل وحذف القسائم الشرائية مع إدارة الرصيد والصلاحية</p>
            </div>

            <div class="nav">
                <a href="/admin" class="nav-btn">📊 بيانات المستخدمين</a>
                <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
                <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
                <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
                <a href="/admin/settings" class="nav-btn">⚙️ إعدادات النظام</a>
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
                <button onclick="showAddModal()" class="btn btn-success">+ إضافة قسيمة جديدة</button>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${rows.length}</div>
                    <div class="stat-label">إجمالي القسائم</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${rows.filter(gc => gc.is_active && new Date(gc.valid_until) > new Date() && gc.current_balance > 0).length}</div>
                    <div class="stat-label">قسائم نشطة</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${rows.reduce((sum, gc) => sum + parseFloat(gc.current_balance), 0).toFixed(2)} ر.س</div>
                    <div class="stat-label">إجمالي الرصيد</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${rows.filter(gc => gc.current_balance <= 0).length}</div>
                    <div class="stat-label">قسائم مستخدمة</div>
                </div>
            </div>
    `;

    if (rows.length === 0) {
      html += `
            <div class="empty-state">
                <h3 style="color: #666; margin-bottom: 10px;">💳 لا توجد قسائم حتى الآن</h3>
                <p style="color: #999;">انقر على زر "إضافة قسيمة جديدة" لإنشاء أول قسيمة</p>
            </div>
      `;
    } else {
      rows.forEach(giftCard => {
        const now = new Date();
        const validUntil = new Date(giftCard.valid_until);
        
        let statusClass = 'status-inactive';
        let statusText = 'غير نشط';
        
        if (giftCard.is_active) {
          if (now > validUntil) {
            statusClass = 'status-expired';
            statusText = 'منتهي';
          } else if (giftCard.current_balance <= 0) {
            statusClass = 'status-used';
            statusText = 'مستخدم';
          } else if (giftCard.used_count >= giftCard.max_uses && giftCard.max_uses > 0) {
            statusClass = 'status-used';
            statusText = 'مستخدم';
          } else {
            statusClass = 'status-active';
            statusText = 'نشط';
          }
        }

        const daysLeft = Math.ceil((validUntil - now) / (1000 * 60 * 60 * 24));
        const daysLeftText = daysLeft > 0 ? `${daysLeft} يوم` : 'منتهي';
        const usagePercentage = (giftCard.used_amount / giftCard.initial_amount) * 100;

        html += `
            <div class="gift-card">
                <div class="gift-card-header">
                    <div>
                        <span class="gift-card-number">${giftCard.card_number}</span>
                        <span class="gift-card-status ${statusClass}" style="margin-right: 10px;">${statusText}</span>
                        ${now > validUntil ? '<span style="color: #dc3545; font-size: 12px;">⏰ منتهي</span>' : ''}
                        ${giftCard.current_balance <= 0 ? '<span style="color: #6c757d; font-size: 12px;">💰 مستخدم</span>' : ''}
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="editGiftCard(${giftCard.id})" class="btn btn-primary">✏️ تعديل</button>
                        <button onclick="toggleGiftCardStatus(${giftCard.id}, ${giftCard.is_active ? 0 : 1})" class="btn ${giftCard.is_active ? 'btn-warning' : 'btn-success'}">
                            ${giftCard.is_active ? '❌ إيقاف' : '✅ تفعيل'}
                        </button>
                        <button onclick="deleteGiftCard(${giftCard.id})" class="btn btn-danger">🗑️ حذف</button>
                    </div>
                </div>

                <div class="gift-card-details">
                    <div class="detail-item">
                        <strong>الرمز السري:</strong> ${giftCard.pin_code}
                    </div>
                    <div class="detail-item">
                        <strong>المبلغ الابتدائي:</strong> ${giftCard.initial_amount} ر.س
                    </div>
                    <div class="detail-item">
                        <strong>الرصيد الحالي:</strong> ${giftCard.current_balance} ر.س
                        <div class="balance-bar">
                            <div class="balance-fill" style="width: ${100 - usagePercentage}%"></div>
                        </div>
                    </div>
                    <div class="detail-item">
                        <strong>المبلغ المستخدم:</strong> ${giftCard.used_amount} ر.س
                    </div>
                    <div class="detail-item">
                        <strong>الحد الأقصى للاستخدام:</strong> ${giftCard.max_uses === -1 ? 'غير محدود' : giftCard.max_uses}
                    </div>
                    <div class="detail-item">
                        <strong>تم استخدامه:</strong> ${giftCard.used_count} مرة
                    </div>
                    <div class="detail-item">
                        <strong>صالح حتى:</strong> ${validUntil.toLocaleDateString('ar-SA')} ${validUntil.toLocaleTimeString('ar-SA')}
                    </div>
                    <div class="detail-item">
                        <strong>متبقي:</strong> <span style="color: ${daysLeft > 7 ? '#28a745' : daysLeft > 3 ? '#ffc107' : '#dc3545'}">${daysLeftText}</span>
                    </div>
                    <div class="detail-item">
                        <strong>العميل:</strong> ${giftCard.customer_name || 'غير محدد'}
                    </div>
                    <div class="detail-item">
                        <strong>هاتف العميل:</strong> ${giftCard.customer_phone || 'غير محدد'}
                    </div>
                    <div class="detail-item">
                        <strong>ملاحظات:</strong> ${giftCard.notes || 'لا توجد ملاحظات'}
                    </div>
                    <div class="detail-item">
                        <strong>تاريخ الإنشاء:</strong> ${new Date(giftCard.created_at).toLocaleDateString('ar-SA')}
                    </div>
                </div>
            </div>
        `;
      });
    }

    html += `
        </div>

        <!-- نموذج إضافة قسيمة -->
        <div id="addGiftCardModal" class="modal">
            <div class="modal-content">
                <span class="close" onclick="closeModal('addGiftCardModal')">&times;</span>
                <h2>💳 إضافة قسيمة جديدة</h2>
                <form id="addGiftCardForm">
                    <div class="form-group">
                        <label class="form-label">رقم القسيمة *</label>
                        <input type="text" name="card_number" class="form-control" required placeholder="مثال: GC-1001-2024">
                        <div class="form-help">يجب أن يكون الرقم فريداً وغير مكرر</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">الرمز السري *</label>
                        <input type="text" name="pin_code" class="form-control" required placeholder="مثال: 1234">
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">المبلغ الابتدائي *</label>
                            <input type="number" name="initial_amount" class="form-control" required min="0" step="0.01" placeholder="0.00">
                        </div>
                        <div class="form-group">
                            <label class="form-label">الحد الأقصى للاستخدام</label>
                            <input type="number" name="max_uses" class="form-control" value="1" min="1">
                            <div class="form-help">1 يعني للاستخدام لمرة واحدة</div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">تاريخ الانتهاء *</label>
                            <input type="datetime-local" name="valid_until" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">اسم العميل</label>
                            <input type="text" name="customer_name" class="form-control" placeholder="اسم العميل (اختياري)">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">هاتف العميل</label>
                            <input type="text" name="customer_phone" class="form-control" placeholder="هاتف العميل (اختياري)">
                        </div>
                        <div class="form-group">
                            <label class="form-label">ملاحظات</label>
                            <input type="text" name="notes" class="form-control" placeholder="ملاحظات إضافية (اختياري)">
                        </div>
                    </div>

                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" name="is_active" checked> 
                            <span>تفعيل القسيمة مباشرة</span>
                        </label>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" class="btn btn-success" style="flex: 1;">💾 حفظ القسيمة</button>
                        <button type="button" onclick="closeModal('addGiftCardModal')" class="btn btn-secondary">إلغاء</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- نموذج تعديل قسيمة -->
        <div id="editGiftCardModal" class="modal">
            <div class="modal-content">
                <span class="close" onclick="closeModal('editGiftCardModal')">&times;</span>
                <h2>✏️ تعديل القسيمة</h2>
                <form id="editGiftCardForm">
                    <input type="hidden" name="id" id="edit_gift_card_id">
                    
                    <div class="form-group">
                        <label class="form-label">رقم القسيمة *</label>
                        <input type="text" name="card_number" id="edit_card_number" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">الرمز السري *</label>
                        <input type="text" name="pin_code" id="edit_pin_code" class="form-control" required>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">المبلغ الابتدائي *</label>
                            <input type="number" name="initial_amount" id="edit_initial_amount" class="form-control" required min="0" step="0.01">
                        </div>
                        <div class="form-group">
                            <label class="form-label">الرصيد الحالي *</label>
                            <input type="number" name="current_balance" id="edit_current_balance" class="form-control" required min="0" step="0.01">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">الحد الأقصى للاستخدام</label>
                            <input type="number" name="max_uses" id="edit_max_uses" class="form-control" min="1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">تاريخ الانتهاء *</label>
                            <input type="datetime-local" name="valid_until" id="edit_valid_until" class="form-control" required>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">اسم العميل</label>
                            <input type="text" name="customer_name" id="edit_customer_name" class="form-control">
                        </div>
                        <div class="form-group">
                            <label class="form-label">هاتف العميل</label>
                            <input type="text" name="customer_phone" id="edit_customer_phone" class="form-control">
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">ملاحظات</label>
                        <input type="text" name="notes" id="edit_notes" class="form-control">
                    </div>

                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" name="is_active" id="edit_is_active"> 
                            <span>القسيمة نشطة</span>
                        </label>
                    </div>

                    <div class="form-group">
                        <label class="form-label">عدد مرات الاستخدام</label>
                        <input type="number" name="used_count" id="edit_used_count" class="form-control" min="0">
                        <div class="form-help">يمكنك تعديل عدد مرات الاستخدام يدوياً</div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" class="btn btn-success" style="flex: 1;">💾 حفظ التعديلات</button>
                        <button type="button" onclick="closeModal('editGiftCardModal')" class="btn btn-secondary">إلغاء</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            // إعداد التواريخ الافتراضية
            document.addEventListener('DOMContentLoaded', function() {
                const now = new Date();
                const nextMonth = new Date(now);
                nextMonth.setDate(nextMonth.getDate() + 90); // 90 يوم افتراضي
                
                // تعيين تاريخ الانتهاء الافتراضي للقسيمة الجديدة
                document.querySelector('#addGiftCardForm input[name="valid_until"]').value = 
                    nextMonth.toISOString().slice(0, 16);
            });

            // إظهار وإخفاء النماذج
            function showAddModal() {
                document.getElementById('addGiftCardModal').style.display = 'block';
            }

            function closeModal(modalId) {
                document.getElementById(modalId).style.display = 'none';
            }

            // إضافة قسيمة جديدة
            document.getElementById('addGiftCardForm').addEventListener('submit', function(e) {
                e.preventDefault();
                const formData = new FormData(this);
                const data = Object.fromEntries(formData.entries());
                
                // تحويل القيم الرقمية
                data.initial_amount = parseFloat(data.initial_amount);
                data.max_uses = parseInt(data.max_uses);
                data.is_active = data.is_active ? 1 : 0;

                fetch('/api/gift-cards', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        alert('✅ ' + data.message);
                        closeModal('addGiftCardModal');
                        location.reload();
                    } else {
                        alert('❌ ' + data.message);
                    }
                })
                .catch(error => {
                    alert('❌ حدث خطأ: ' + error);
                });
            });

            // تعديل قسيمة
            async function editGiftCard(id) {
                try {
                    const response = await fetch('/api/gift-cards/' + id);
                    const data = await response.json();
                    
                    if (data.status === 'success') {
                        const giftCard = data.gift_card;
                        
                        // تعبئة النموذج ببيانات القسيمة
                        document.getElementById('edit_gift_card_id').value = giftCard.id;
                        document.getElementById('edit_card_number').value = giftCard.card_number;
                        document.getElementById('edit_pin_code').value = giftCard.pin_code;
                        document.getElementById('edit_initial_amount').value = giftCard.initial_amount;
                        document.getElementById('edit_current_balance').value = giftCard.current_balance;
                        document.getElementById('edit_max_uses').value = giftCard.max_uses;
                        document.getElementById('edit_valid_until').value = giftCard.valid_until.slice(0, 16);
                        document.getElementById('edit_customer_name').value = giftCard.customer_name || '';
                        document.getElementById('edit_customer_phone').value = giftCard.customer_phone || '';
                        document.getElementById('edit_notes').value = giftCard.notes || '';
                        document.getElementById('edit_is_active').checked = giftCard.is_active;
                        document.getElementById('edit_used_count').value = giftCard.used_count;
                        
                        document.getElementById('editGiftCardModal').style.display = 'block';
                    } else {
                        alert('❌ ' + data.message);
                    }
                } catch (error) {
                    alert('❌ حدث خطأ في جلب بيانات القسيمة: ' + error);
                }
            }

            // حفظ التعديلات
            document.getElementById('editGiftCardForm').addEventListener('submit', function(e) {
                e.preventDefault();
                const formData = new FormData(this);
                const data = Object.fromEntries(formData.entries());
                const giftCardId = data.id;
                
                // تحويل القيم الرقمية
                data.initial_amount = parseFloat(data.initial_amount);
                data.current_balance = parseFloat(data.current_balance);
                data.max_uses = parseInt(data.max_uses);
                data.used_count = parseInt(data.used_count);
                data.is_active = data.is_active ? 1 : 0;

                fetch('/api/gift-cards/' + giftCardId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        alert('✅ ' + data.message);
                        closeModal('editGiftCardModal');
                        location.reload();
                    } else {
                        alert('❌ ' + data.message);
                    }
                })
                .catch(error => {
                    alert('❌ حدث خطأ: ' + error);
                });
            });

            // تفعيل/إيقاف القسيمة
            function toggleGiftCardStatus(id, newStatus) {
                fetch('/api/gift-cards/' + id, {
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

            // حذف قسيمة
            function deleteGiftCard(id) {
                if (confirm('⚠️ هل أنت متأكد من حذف هذه القسيمة؟ لا يمكن التراجع عن هذا الإجراء!')) {
                    fetch('/api/gift-cards/' + id, { method: 'DELETE' })
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

// صفحة إعدادات الـ admin
app.get('/admin/settings', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html dir="rtl">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>إعدادات النظام - لوحة التحكم</title>
      <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f0f2f5; min-height: 100vh; }
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; position: relative; }
          .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
          .nav-btn { background: #fff; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
          .nav-btn:hover { background: #4CAF50; color: white; transform: translateY(-2px); }
          .logout-btn { position: absolute; left: 20px; top: 20px; background: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
          .logout-btn:hover { background: #d32f2f; transform: translateY(-2px); }
          .settings-card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); margin-bottom: 30px; }
          .setting-item { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px solid #eee; }
          .setting-item:last-child { border-bottom: none; }
          .setting-label { font-weight: 600; color: #333; }
          .setting-description { font-size: 14px; color: #666; margin-top: 5px; }
          .setting-control { flex: 1; max-width: 300px; }
          .form-control { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; }
          .btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: all 0.3s; font-weight: 500; }
          .btn-primary { background: #2196F3; color: white; }
          .btn-primary:hover { background: #1976D2; }
          .btn-success { background: #4CAF50; color: white; }
          .btn-success:hover { background: #388E3C; }
          .switch { position: relative; display: inline-block; width: 50px; height: 24px; }
          .switch input { opacity: 0; width: 0; height: 0; }
          .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 24px; }
          .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
          input:checked + .slider { background-color: #4CAF50; }
          input:checked + .slider:before { transform: translateX(26px); }
          .toast { position: fixed; bottom: 20px; right: 20px; background: #4CAF50; color: white; padding: 15px 25px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: none; z-index: 1000; }
          .toast.show { display: block; animation: fadeIn 0.5s, fadeOut 0.5s 2.5s; }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
          .loading { display: inline-block; width: 20px; height: 20px; border: 3px solid rgba(255,255,255,.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s ease-in-out infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <a href="/logout" class="logout-btn">🚪 تسجيل الخروج</a>
              <h1 style="margin: 0;">⚙️ إعدادات النظام</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">تخصيص إعدادات لوحة التحكم والمتجر</p>
          </div>

          <div class="nav">
              <a href="/admin" class="nav-btn">📊 بيانات المستخدمين</a>
              <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
              <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
              <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
              <a href="/admin/gift-cards" class="nav-btn">💳 إدارة القسائم</a>
              <a href="/" class="nav-btn">🏠 الرئيسية</a>
          </div>

          <div class="settings-card">
              <h2 style="margin-top: 0; color: #333;">الإعدادات العامة</h2>
              
              <div class="setting-item">
                  <div>
                      <div class="setting-label">الثيم</div>
                      <div class="setting-description">اختر مظهر الواجهة</div>
                  </div>
                  <div class="setting-control">
                      <select id="theme-setting" class="form-control">
                          <option value="light">فاتح</option>
                          <option value="dark">داكن</option>
                          <option value="auto">تلقائي</option>
                      </select>
                  </div>
              </div>

              <div class="setting-item">
                  <div>
                      <div class="setting-label">عدد العناصر في الصفحة</div>
                      <div class="setting-description">حدد عدد العناصر المعروضة في كل صفحة</div>
                  </div>
                  <div class="setting-control">
                      <input type="number" id="items-per-page-setting" class="form-control" min="5" max="100" step="5">
                  </div>
              </div>

              <div class="setting-item">
                  <div>
                      <div class="setting-label">التحديث التلقائي</div>
                      <div class="setting-description">تفعيل التحديث التلقائي للبيانات</div>
                  </div>
                  <div class="setting-control">
                      <label class="switch">
                          <input type="checkbox" id="auto-refresh-setting">
                          <span class="slider"></span>
                      </label>
                  </div>
              </div>

              <div class="setting-item">
                  <div>
                      <div class="setting-label">فترة التحديث</div>
                      <div class="setting-description">الفترة الزمنية بين التحديثات التلقائية (بالثواني)</div>
                  </div>
                  <div class="setting-control">
                      <input type="number" id="refresh-interval-setting" class="form-control" min="10" max="300" step="10">
                  </div>
              </div>

              <div style="text-align: center; margin-top: 30px;">
                  <button id="save-settings-btn" class="btn btn-success">💾 حفظ الإعدادات</button>
              </div>
          </div>
      </div>

      <div id="toast" class="toast"></div>

      <script>
          // جلب الإعدادات الحالية
          document.addEventListener('DOMContentLoaded', function() {
              fetch('/api/admin-settings')
                  .then(response => response.json())
                  .then(data => {
                      if (data.status === 'success') {
                          const settings = data.settings;
                          
                          // تعيين قيم الإعدادات
                          document.getElementById('theme-setting').value = settings.theme || 'light';
                          document.getElementById('items-per-page-setting').value = settings.items_per_page || '10';
                          document.getElementById('auto-refresh-setting').checked = settings.auto_refresh === 'true';
                          document.getElementById('refresh-interval-setting').value = settings.refresh_interval || '30';
                      }
                  })
                  .catch(error => {
                      showToast('حدث خطأ في جلب الإعدادات: ' + error, 'error');
                  });
          });

          // حفظ الإعدادات
          document.getElementById('save-settings-btn').addEventListener('click', function() {
              const settings = {
                  theme: document.getElementById('theme-setting').value,
                  items_per_page: document.getElementById('items-per-page-setting').value,
                  auto_refresh: document.getElementById('auto-refresh-setting').checked,
                  refresh_interval: document.getElementById('refresh-interval-setting').value
              };

              // تعطيل الزر وإظهار التحميل
              const btn = this;
              const originalText = btn.innerHTML;
              btn.innerHTML = '<span class="loading"></span> جاري الحفظ...';
              btn.disabled = true;

              // حفظ كل إعداد على حدة
              const promises = Object.entries(settings).map(([key, value]) => {
                  return fetch('/api/admin-settings/' + key, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ value: value })
                  })
                  .then(response => response.json());
              });

              Promise.all(promises)
                  .then(results => {
                      const allSuccess = results.every(result => result.status === 'success');
                      
                      if (allSuccess) {
                          showToast('✅ تم حفظ الإعدادات بنجاح');
                          
                          // تطبيق الثيم فوراً
                          if (settings.theme === 'dark') {
                              document.body.style.backgroundColor = '#222';
                              document.body.style.color = '#fff';
                          } else if (settings.theme === 'light') {
                              document.body.style.backgroundColor = '#f0f2f5';
                              document.body.style.color = '#333';
                          }
                      } else {
                          showToast('❌ حدث خطأ في حفظ بعض الإعدادات', 'error');
                      }
                  })
                  .catch(error => {
                      showToast('❌ حدث خطأ: ' + error, 'error');
                  })
                  .finally(() => {
                      // استعادة الزر
                      btn.innerHTML = originalText;
                      btn.disabled = false;
                  });
          });

          // دالة عرض الإشعارات
          function showToast(message, type = 'success') {
              const toast = document.getElementById('toast');
              toast.textContent = message;
              toast.style.background = type === 'success' ? '#4CAF50' : '#f44336';
              toast.classList.add('show');
              
              setTimeout(() => {
                  toast.classList.remove('show');
              }, 3000);
          }
      </script>
  </body>
  </html>
  `);
});

// API مسح جميع البيانات
app.delete('/api/clear-all-data', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM test_users', function(err) {
      if (err) {
        console.error('❌ خطأ في مسح بيانات المستخدمين:', err);
        return res.status(500).json({
          status: 'error',
          message: err.message
        });
      }

      db.run('DELETE FROM orders', function(err) {
        if (err) {
          console.error('❌ خطأ في مسح الطلبات:', err);
          return res.status(500).json({
            status: 'error',
            message: err.message
          });
        }

        res.json({
          status: 'success',
          message: '✅ تم مسح جميع البيانات بنجاح',
          users_deleted: this.changes
        });
      });
    });
  });
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error('❌ خطأ غير متوقع:', err);
  res.status(500).json({
    status: 'error',
    message: 'حدث خطأ غير متوقع في الخادم'
  });
});

// التعامل مع المسارات غير الموجودة
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'الصفحة غير موجودة',
    requested_url: req.url
  });
});

// بدء الخادم
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 الخادم يعمل على المنفذ', PORT);
  console.log('🔗 رابط التطبيق: https://database-api-kvxr.onrender.com');
  console.log('📊 قاعدة البيانات: SQLite (في الذاكرة)');
  console.log('✅ جاهز لاستقبال طلبات Flutter');
  console.log('🎯 يدعم اللغة العربية بشكل كامل');
  console.log('🎫 نظام الكوبونات: مفعل ومتكامل مع التعديل');
  console.log('💳 نظام القسائم الشرائية: مفعل ومتكامل');
  console.log('📈 نظام التصدير: مفعل (Excel)');
  console.log('🚪 نظام تسجيل الدخول والخروج: مفعل');
  console.log('📋 صفحات العرض:');
  console.log('   📊 /admin - صفحة عرض البيانات');
  console.log('   🛠️ /admin/advanced - لوحة التحكم');
  console.log('   🛒 /admin/orders - إدارة الطلبات');
  console.log('   🎫 /admin/coupons - إدارة الكوبونات');
  console.log('   💳 /admin/gift-cards - إدارة القسائم');
  console.log('   ⚙️ /admin/settings - إعدادات النظام');
  console.log('   🚪 /logout - تسجيل الخروج');
});