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

// مساعدة صغيرة للتحقق من المصادقة
function isAuthenticated(req) {
  try {
    const auth = req.signedCookies && req.signedCookies.admin_auth;
    if (!auth) return false;
    return auth === ADMIN_CREDENTIALS.username;
  } catch (e) {
    return false;
  }
}

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
    gift_card_number TEXT,
    gift_card_amount REAL DEFAULT 0,
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

  // جدول القسائم الشرائية (Gift Cards)
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

// API إعدادات الـ admin
app.get('/api/admin-settings', (req, res) => {
  db.all('SELECT * FROM admin_settings ORDER BY setting_key', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب إعدادات الـ admin:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

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
      'POST /api/validate-gift-card - التحقق من القسيمة الشرائية',
      'GET /api/gift-cards - جلب جميع القسائم',
      'POST /api/gift-cards - إنشاء قسيمة جديدة',
      'GET /api/admin-settings - جلب إعدادات الـ admin',
      'GET /admin - صفحة عرض البيانات',
      'GET /admin/orders - إدارة الطلبات',
      'GET /admin/coupons - إدارة الكوبونات',
      'GET /admin/gift-cards - إدارة القسائم الشرائية'
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
      database: 'SQLite - سريعة وموثوقة'
    });
  });
});

// حفظ بيانات الاختبار
app.post('/api/save-data', (req, res) => {
  const { name, email, phone, message } = req.body;

  console.log('📨 بيانات مستلمة:', { name, email, phone, message });

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
        timestamp: new Date().toISOString()
      });
    }
  );
});

// عرض جميع البيانات المحفوظة
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
      message: `تم العثور على ${rows.length} سجل`
    });
  });
});

// ======== واجهات القسائم الشرائية (Gift Cards) ========

// API التحقق من صحة القسيمة الشرائية
app.post('/api/validate-gift-card', (req, res) => {
  const { card_number, pin_code, order_amount } = req.body;

  console.log('🔍 طلب التحقق من القسيمة:', { card_number, pin_code, order_amount });

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
        console.log('❌ القسيمة غير موجودة أو غير صالحة');
        return res.status(404).json({
          status: 'error',
          message: 'قسيمة غير صالحة أو غير موجودة'
        });
      }

      // التحقق من صلاحية القسيمة
      const now = new Date();
      const validUntil = new Date(giftCard.valid_until);

      if (now > validUntil) {
        console.log('❌ القسيمة منتهية الصلاحية');
        return res.status(400).json({
          status: 'error',
          message: 'هذه القسيمة منتهية الصلاحية'
        });
      }

      // التحقق من الحد الأقصى للاستخدام
      if (giftCard.max_uses > 0 && giftCard.used_count >= giftCard.max_uses) {
        console.log('❌ تم الوصول إلى الحد الأقصى لاستخدام القسيمة');
        return res.status(400).json({
          status: 'error',
          message: 'تم الوصول إلى الحد الأقصى لاستخدام هذه القسيمة'
        });
      }

      // التحقق من الرصيد المتاح
      if (giftCard.current_balance <= 0) {
        console.log('❌ لا يوجد رصيد متاح في القسيمة');
        return res.status(400).json({
          status: 'error',
          message: 'لا يوجد رصيد متاح في هذه القسيمة'
        });
      }

      // حساب المبلغ المستخدم من القسيمة
      let usedAmount = 0;
      const orderAmountValue = order_amount ? parseFloat(order_amount) : 0;
      
      if (order_amount && orderAmountValue > 0) {
        usedAmount = Math.min(giftCard.current_balance, orderAmountValue);
      } else {
        usedAmount = giftCard.current_balance;
      }

      const finalAmount = order_amount ? (orderAmountValue - usedAmount) : 0;
      const remainingBalance = giftCard.current_balance - usedAmount;

      console.log('✅ القسيمة صالحة:', {
        card_number: giftCard.card_number,
        used_amount: usedAmount,
        remaining_balance: remainingBalance,
        final_amount: finalAmount
      });

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
          original_amount: order_amount ? orderAmountValue : 0,
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

// ======== واجهات الكوبونات ========

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

// ======== API معالجة الدفع - محدث ليدعم القسائم الشرائية ========

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
    items_count: cart_items?.length || 0, 
    total_amount, 
    coupon_code: coupon_code || 'لا يوجد',
    gift_card_number: gift_card_number || 'لا يوجد',
    gift_card_pin: gift_card_pin || 'لا يوجد'
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
                      [newBalance, newUsedCount, giftCardAmount, giftCard.id],
                      (err) => {
                        if (err) {
                          console.error('❌ خطأ في تحديث القسيمة:', err);
                        } else {
                          console.log('✅ تم تحديث القسيمة:', {
                            card_number: giftCard.card_number,
                            new_balance: newBalance,
                            used_amount: giftCardAmount
                          });
                        }
                      }
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
            } else {
              console.log('❌ القسيمة غير موجودة أو البيانات غير صحيحة');
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
          appliedGiftCard ? appliedGiftCard.card_number : null,
          giftCardAmount, // المبلغ المستخدم من القسيمة
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
            gift_card_number: appliedGiftCard ? appliedGiftCard.card_number : 'لا يوجد'
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

// ======== صفحات الإدارة ========

// حماية صفحات الإدارة
app.use('/admin', (req, res, next) => {
  const publicAdminPaths = ['/admin/login', '/admin/logout'];
  if (publicAdminPaths.includes(req.path) || publicAdminPaths.includes(req.originalUrl)) return next();

  if (!isAuthenticated(req)) {
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(401).json({ status: 'error', message: 'مطلوب تسجيل الدخول' });
    }
    return res.redirect('/admin/login');
  }

  next();
});

// صفحة تسجيل الدخول
app.get('/admin/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/admin');
  return renderLoginPageHTML(req, res);
});

app.post('/admin/login', (req, res) => {
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
});

// مسار تسجيل الخروج
app.get('/logout', (req, res) => {
  res.clearCookie('admin_auth');
  if (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1) {
    return res.json({ status: 'success', message: 'تم تسجيل الخروج' });
  }
  res.redirect('/');
});

// صفحة إدارة الطلبات
app.get('/admin/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.send(`
        <html dir="rtl">
        <head><title>خطأ</title><meta charset="UTF-8"></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1 style="color: red;">❌ خطأ في جلب البيانات</h1>
          <p>${err.message}</p>
          <a href="/admin">العودة للوحة التحكم</a>
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
                <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
                <a href="/admin/gift-cards" class="nav-btn">💳 إدارة القسائم</a>
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
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
        </script>
    </body>
    </html>
    `;

    res.send(html);
  });
});

// صفحة إدارة القسائم الشرائية
app.get('/admin/gift-cards', (req, res) => {
  db.all('SELECT * FROM gift_cards ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.send(`
        <html dir="rtl">
        <head><title>خطأ</title><meta charset="UTF-8"></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1 style="color: red;">❌ خطأ في جلب البيانات</h1>
          <p>${err.message}</p>
          <a href="/admin">العودة للوحة التحكم</a>
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
        <title>إدارة القسائم الشرائية - نظام المتجر</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f0f2f5; min-height: 100vh; }
            .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #9C27B0 0%, #6A1B9A 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; position: relative; }
            .gift-card { background: white; padding: 25px; margin-bottom: 20px; border-radius: 15px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-right: 4px solid #9C27B0; }
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
            .empty-state { text-align: center; padding: 60px; color: #666; background: white; border-radius: 15px; }
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
                <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
                <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
                <button onclick="showAddModal()" class="nav-btn" style="background: #4CAF50; color: white;">+ إضافة قسيمة جديدة</button>
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

        html += `
            <div class="gift-card">
                <div class="gift-card-header">
                    <div>
                        <span class="gift-card-number">${giftCard.card_number}</span>
                        <span class="gift-card-status ${statusClass}" style="margin-right: 10px;">${statusText}</span>
                        ${now > validUntil ? '<span style="color: #dc3545; font-size: 12px;">⏰ منتهي</span>' : ''}
                        ${giftCard.current_balance <= 0 ? '<span style="color: #6c757d; font-size: 12px;">💰 مستخدم</span>' : ''}
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

        <script>
            function showAddModal() {
                alert('يمكنك إضافة قسيمة جديدة عبر API: POST /api/gift-cards');
            }
        </script>
    </body>
    </html>
    `;

    res.send(html);
  });
});

// صفحة الإدارة الرئيسية
app.get('/admin', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة التحكم - نظام المتجر</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f0f2f5; min-height: 100vh; }
            .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; position: relative; }
            .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
            .nav-btn { background: #fff; padding: 15px 25px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; font-weight: 500; display: flex; align-items: center; gap: 8px; }
            .nav-btn:hover { background: #667eea; color: white; transform: translateY(-2px); }
            .logout-btn { position: absolute; left: 20px; top: 20px; background: #f44336; color: white; padding: 12px 24px; border: none; border-radius: 25px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .logout-btn:hover { background: #d32f2f; transform: translateY(-2px); }
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
            .stat-card { background: white; padding: 25px; border-radius: 15px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
            .stat-number { font-size: 32px; font-weight: bold; margin-bottom: 8px; }
            .stat-label { font-size: 16px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <a href="/logout" class="logout-btn">🚪 تسجيل الخروج</a>
                <h1 style="margin: 0; font-size: 2.5rem;">🛠️ لوحة التحكم - نظام المتجر</h1>
                <p style="margin: 10px 0 0 0; font-size: 1.1rem; opacity: 0.9;">إدارة وعرض جميع البيانات من تطبيق الجوال</p>
            </div>

            <div class="stats-grid">
                <div class="stat-card" style="border-right: 4px solid #2196F3;">
                    <div class="stat-number" style="color: #2196F3;">${rows.length}</div>
                    <div class="stat-label">المستخدمين المسجلين</div>
                </div>
                <div class="stat-card" style="border-right: 4px solid #4CAF50;">
                    <div class="stat-number" style="color: #4CAF50;">0</div>
                    <div class="stat-label">الطلبات النشطة</div>
                </div>
                <div class="stat-card" style="border-right: 4px solid #FF9800;">
                    <div class="stat-number" style="color: #FF9800;">0</div>
                    <div class="stat-label">الكوبونات النشطة</div>
                </div>
                <div class="stat-card" style="border-right: 4px solid #9C27B0;">
                    <div class="stat-number" style="color: #9C27B0;">0</div>
                    <div class="stat-label">القسائم النشطة</div>
                </div>
            </div>
            
            <div class="nav">
                <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
                <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
                <a href="/admin/gift-cards" class="nav-btn">💳 إدارة القسائم</a>
                <a href="/api/orders" class="nav-btn">📋 JSON الطلبات</a>
                <a href="/api/gift-cards" class="nav-btn">💳 JSON القسائم</a>
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
            </div>
    `;

    if (rows.length === 0) {
      html += `
            <div style="text-align: center; padding: 60px; color: #666; background: white; border-radius: 15px;">
                <h3 style="color: #666; margin-bottom: 10px;">📭 لا توجد بيانات حتى الآن</h3>
                <p style="color: #999;">استخدم تطبيق الجوال لإرسال البيانات الأولى</p>
            </div>
      `;
    } else {
      html += `
            <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
                <h3 style="margin-top: 0; color: #333;">آخر المستخدمين المسجلين</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
      `;
      
      rows.slice(0, 6).forEach(user => {
        html += `
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; border-right: 4px solid #667eea;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <strong style="color: #333;">${user.name}</strong>
                            <span style="background: #667eea; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">#${user.id}</span>
                        </div>
                        <div style="color: #666; font-size: 14px;">
                            <div>📧 ${user.email}</div>
                            ${user.phone ? `<div>📞 ${user.phone}</div>` : ''}
                            <div style="margin-top: 8px; color: #999; font-size: 12px;">${user.created_at}</div>
                        </div>
                    </div>
        `;
      });
      
      html += `
                </div>
            </div>
      `;
    }

    html += `
        </div>
    </body>
    </html>
    `;

    res.send(html);
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
  console.log('🎫 نظام الكوبونات: مفعل ومتكامل');
  console.log('💳 نظام القسائم الشرائية: مفعل ومتكامل');
  console.log('📋 صفحات العرض:');
  console.log('   📊 /admin - لوحة التحكم');
  console.log('   🛒 /admin/orders - إدارة الطلبات');
  console.log('   💳 /admin/gift-cards - إدارة القسائم');
});