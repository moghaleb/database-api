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

function isAuthenticated(req) {
  try {
    const auth = req.signedCookies && req.signedCookies.admin_auth;
    if (!auth) return false;
    return auth === ADMIN_CREDENTIALS.username;
  } catch (e) {
    return false;
  }
}

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

app.post('/login', (req, res) => handleLoginRequest(req, res));
app.get('/admin/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/admin');
  return renderLoginPageHTML(req, res);
});
app.post('/admin/login', (req, res) => handleLoginRequest(req, res));

app.get('/logout', (req, res) => {
  res.clearCookie('admin_auth');
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

  // جدول القسائم الشرائية
  db.run(`CREATE TABLE IF NOT EXISTS gift_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_number TEXT UNIQUE NOT NULL,
    pin_code TEXT NOT NULL,
    initial_amount REAL NOT NULL,
    balance REAL NOT NULL,
    is_active INTEGER DEFAULT 1,
    expires_at DATETIME,
    used_count INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول القسائم الشرائية:', err);
    } else {
      console.log('✅ تم إنشاء جدول القسائم الشرائية بنجاح');

      // إضافة بعض القسائم الافتراضية للاختبار
      db.run(`
        INSERT OR IGNORE INTO gift_cards (card_number, pin_code, initial_amount, balance, expires_at, max_uses) 
        VALUES 
        ('1234567890123456', '1234', 100.0, 100.0, datetime('now', '+365 days'), 1),
        ('9876543210987654', '5678', 50.0, 50.0, datetime('now', '+180 days'), 1),
        ('1111222233334444', '9999', 200.0, 200.0, datetime('now', '+90 days'), 1)
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
      'POST /api/validate-gift-card - التحقق من القسيمة الشرائية',
      'GET /api/gift-cards - إدارة القسائم الشرائية',
      // ... باقي الendpoints
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

// API التحقق من القسيمة الشرائية
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
      const expiresAt = new Date(giftCard.expires_at);

      if (now > expiresAt) {
        return res.status(400).json({
          status: 'error',
          message: 'هذه القسيمة منتهية الصلاحية'
        });
      }

      // التحقق من الحد الأقصى للاستخدام
      if (giftCard.max_uses > 0 && giftCard.used_count >= giftCard.max_uses) {
        return res.status(400).json({
          status: 'error',
          message: 'تم استخدام هذه القسيمة بالفعل'
        });
      }

      // التحقق من الرصيد
      if (giftCard.balance <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'لا يوجد رصيد كافي في القسيمة'
        });
      }

      // حساب المبلغ المستخدم من القسيمة
      const orderAmount = parseFloat(order_amount);
      let usedAmount = Math.min(giftCard.balance, orderAmount);
      const finalAmount = orderAmount - usedAmount;

      res.json({
        status: 'success',
        message: 'قسيمة صالحة',
        valid: true,
        gift_card: {
          id: giftCard.id,
          card_number: giftCard.card_number,
          initial_amount: giftCard.initial_amount,
          balance: giftCard.balance,
          used_amount: usedAmount,
          expires_at: giftCard.expires_at
        },
        calculation: {
          original_amount: orderAmount,
          gift_card_amount: usedAmount,
          final_amount: finalAmount
        }
      });
    }
  );
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
    gift_card_amount
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
              const now = new Date();
              const validFrom = new Date(coupon.valid_from);
              const validUntil = new Date(coupon.valid_until);

              if (now >= validFrom && now <= validUntil) {
                if (coupon.max_uses === -1 || coupon.used_count < coupon.max_uses) {
                  if (finalAmount >= coupon.min_order_amount) {
                    // حساب قيمة الخصم
                    if (coupon.discount_type === 'percentage') {
                      discountAmount = (finalAmount * coupon.discount_value) / 100;
                    } else {
                      discountAmount = coupon.discount_value;
                    }

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
                  }
                }
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
      if (gift_card_number && gift_card_amount) {
        db.get(
          'SELECT * FROM gift_cards WHERE card_number = ? AND is_active = 1',
          [gift_card_number],
          (err, giftCard) => {
            if (err) {
              reject(err);
              return;
            }

            if (giftCard) {
              // استخدام القسيمة
              giftCardAmount = parseFloat(gift_card_amount);
              appliedGiftCard = giftCard;
              finalAmount = finalAmount - giftCardAmount;

              // تحديث رصيد القسيمة
              const newBalance = giftCard.balance - giftCardAmount;
              db.run(
                'UPDATE gift_cards SET balance = ?, used_count = used_count + 1 WHERE id = ?',
                [newBalance, giftCard.id]
              );

              console.log('✅ تم استخدام القسيمة:', {
                card: giftCard.card_number,
                used: giftCardAmount,
                new_balance: newBalance
              });
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
  processCoupon()
    .then(() => processGiftCard())
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
          total_amount,
          discountAmount,
          appliedCoupon ? appliedCoupon.code : null,
          appliedGiftCard ? appliedGiftCard.card_number : null,
          giftCardAmount,
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

// API جلب جميع القسائم الشرائية
app.get('/api/gift-cards', (req, res) => {
  db.all('SELECT * FROM gift_cards ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('❌ خطأ في جلب القسائم الشرائية:', err);
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

// API إنشاء قسيمة شرائية جديدة
app.post('/api/gift-cards', (req, res) => {
  const {
    card_number,
    pin_code,
    initial_amount,
    expires_at,
    max_uses
  } = req.body;

  if (!card_number || !pin_code || initial_amount === undefined) {
    return res.status(400).json({
      status: 'error',
      message: 'رقم القسيمة والرمز السري والمبلغ الابتدائي مطلوبة'
    });
  }

  // التحقق من أن الرقم غير مكرر
  db.get('SELECT id FROM gift_cards WHERE card_number = ?', [card_number], (err, existingCard) => {
    if (err) {
      console.error('❌ خطأ في التحقق من الرقم:', err);
      return res.status(500).json({
        status: 'error',
        message: 'فشل في التحقق من الرقم: ' + err.message
      });
    }

    if (existingCard) {
      return res.status(400).json({
        status: 'error',
        message: 'رقم القسيمة مستخدم مسبقاً'
      });
    }

    db.run(
      `INSERT INTO gift_cards (
        card_number, pin_code, initial_amount, balance, expires_at, max_uses
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        card_number,
        pin_code,
        initial_amount,
        initial_amount, // الرصيد الابتدائي يساوي المبلغ الابتدائي
        expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // سنة افتراضياً
        max_uses || 1
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

// ... باقي ال APIs (الكوبونات، التصدير، صفحات الإدارة) تبقى كما هي

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
  console.log('🎫 نظام الكوبونات: مفعل ومتكامل');
  console.log('💳 نظام القسائم الشرائية: مفعل ومتكامل');
  console.log('📈 نظام التصدير: مفعل (Excel)');
});