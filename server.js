const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // دائمًا لاستضافة السحاب

// ======== قاعدة بيانات دائمة ========
const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/var/data/redme.db'  // مسار الإنتاج (يمكن تعديله حسب المنصة)
  : path.join(__dirname, 'data', 'redme.db');

// التأكد من وجود مجلد البيانات
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);
console.log(`✅ قاعدة البيانات: ${DB_PATH}`);

// ======== مجلد التصدير ========
const exportsDir = process.env.NODE_ENV === 'production'
  ? '/var/www/redshe/exports'
  : path.join(__dirname, 'exports');

if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
  console.log('✅ تم إنشاء مجلد التصدير:', exportsDir);
}

// ======== Middleware ========
app.use(cors({
  origin: [
    'https://redme.cfd',
    'http://redme.cfd',
    'https://www.redme.cfd',
    'http://www.redme.cfd',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'capacitor://localhost',
    'ionic://localhost',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ======== إدارة الجلسات ========
const SESSION_SECRET = process.env.SESSION_SECRET || 'redshe_shop_production_secret_2024_change_this';
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true في الإنتاج مع HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 ساعة
  }
}));

// ======== وظائف مساعدة لقاعدة البيانات ========
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// ======== التحقق من صحة المدخلات ========
const validateOrderData = (data) => {
  if (!data.customer_name || !data.customer_phone) {
    throw new Error('اسم العميل ورقم الهاتف مطلوبان');
  }
  if (data.total_amount && isNaN(parseFloat(data.total_amount))) {
    throw new Error('قيمة الطلب غير صالحة');
  }
  if (data.cart_items && !Array.isArray(data.cart_items)) {
    throw new Error('بيانات السلة غير صالحة');
  }
  return true;
};

// ======== حماية المسارات الإدارية ========
const requireAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

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
  )`);

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
    gift_card_type TEXT,
    gift_card_amount REAL DEFAULT 0,
    order_date DATETIME NOT NULL,
    order_status TEXT DEFAULT 'pending',
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    customer_secondary_phone TEXT,
    payment_method TEXT DEFAULT 'online',
    transfer_name TEXT,
    transfer_number TEXT,
    customer_address TEXT,
    address_city TEXT,
    address_area TEXT,
    address_detail TEXT,
    shipping_city TEXT,
    shipping_area TEXT,
    shipping_fee REAL DEFAULT 0,
    final_amount REAL DEFAULT 0,
    order_notes TEXT,
    expected_delivery TEXT,
    items_count INTEGER DEFAULT 0,
    shipping_type TEXT DEFAULT 'توصيل منزلي',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // جدول تفاصيل الطلبات
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
  )`);

  // جدول الكوبونات
  db.run(`CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    store_type TEXT DEFAULT 'all',
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
  )`);

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
  )`);

  // جدول إعدادات الـ admin
  db.run(`CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // جدول الإشعارات
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  )`);

  // جدول الفئات
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description TEXT,
    image TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // جدول العطور
  db.run(`CREATE TABLE IF NOT EXISTS perfumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    original_price REAL,
    category_id INTEGER,
    image TEXT,
    images TEXT,
    in_stock INTEGER DEFAULT 1,
    stock_quantity INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories (id)
  )`);

  // إضافة بيانات افتراضية إذا كانت الجداول فارغة
  db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
    if (!err && row.count === 0) {
      db.run(`INSERT INTO categories (name_ar, name_en, description, image, sort_order) VALUES 
        ('عطور رجالية', 'Men Perfumes', 'أجمل العطور الرجالية', 'assets/images/category/men.png', 1),
        ('عطور نسائية', 'Women Perfumes', 'أجمل العطور النسائية', 'assets/images/category/women.png', 2),
        ('عطور عائلية', 'Family Perfumes', 'عطور مناسبة للعائلة', 'assets/images/category/family.png', 3),
        ('عطور فاخرة', 'Luxury Perfumes', 'أرقى العطور الفاخرة', 'assets/images/category/luxury.png', 4)`);
    }
  });

  db.get("SELECT COUNT(*) as count FROM perfumes", (err, row) => {
    if (!err && row.count === 0) {
      db.run(`INSERT INTO perfumes (name_ar, name_en, description, price, original_price, category_id, image, is_featured, stock_quantity) VALUES 
        ('عطر رجالي فاخر', 'Luxury Men Perfume', 'عطر رجالي برائحة مميزة', 150.0, 200.0, 1, 'assets/images/L/L1.png', 1, 50),
        ('عطر نسائي أنيق', 'Elegant Women Perfume', 'عطر نسائي برائحة زهرية', 120.0, 150.0, 2, 'assets/images/L/L2.png', 1, 40),
        ('عطر عائلي مميز', 'Family Special Perfume', 'عطر مناسب لجميع أفراد العائلة', 100.0, 120.0, 3, 'assets/images/L/L3.png', 0, 30),
        ('عطر فاخر متميز', 'Premium Luxury Perfume', 'عطر فاخر برائحة استثنائية', 250.0, 300.0, 4, 'assets/images/L/L4.png', 1, 20)`);
    }
  });

  db.get("SELECT COUNT(*) as count FROM coupons", (err, row) => {
    if (!err && row.count === 0) {
      db.run(`INSERT INTO coupons (code, store_type, description, discount_type, discount_value, min_order_amount, max_uses, valid_from, valid_until) VALUES 
        ('WELCOME10', 'all', 'خصم 10% لأول طلب', 'percentage', 10.0, 50.0, 100, datetime('now'), datetime('now', '+30 days')),
        ('FIXED20', 'all', 'خصم ثابت 20 ريال', 'fixed', 20.0, 100.0, 50, datetime('now'), datetime('now', '+15 days'))`);
    }
  });

  db.get("SELECT COUNT(*) as count FROM gift_cards", (err, row) => {
    if (!err && row.count === 0) {
      db.run(`INSERT INTO gift_cards (card_number, pin_code, initial_amount, current_balance, valid_until, customer_name, notes) VALUES 
        ('GC-1001-2024', '1234', 100.0, 100.0, datetime('now', '+90 days'), 'عميل تجريبي', 'قسيمة ترحيبية')`);
    }
  });
});

console.log('✅ تم تهيئة جميع الجداول بنجاح');

// ======== Routes ========

// صفحة تسجيل الدخول
app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>تسجيل الدخول - لوحة التحكم</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .login-container { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); width: 350px; text-align: center; }
        h2 { margin-bottom: 30px; color: #333; }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; box-sizing: border-box; }
        button { background: #667eea; color: white; border: none; padding: 12px; width: 100%; border-radius: 8px; font-size: 16px; cursor: pointer; transition: 0.3s; }
        button:hover { background: #5a67d8; }
        .error { color: red; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h2>🔐 تسجيل الدخول</h2>
        <form method="POST" action="/admin/login">
          <input type="password" name="password" placeholder="كلمة المرور" required autofocus>
          <button type="submit">دخول</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/admin/login', (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (req.body.password === adminPassword) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.send(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head><meta charset="UTF-8"><title>خطأ</title></head>
      <body style="font-family: Arial; text-align: center; margin-top: 100px;">
        <h2 style="color: red;">❌ كلمة المرور خاطئة</h2>
        <a href="/admin/login">العودة للمحاولة مرة أخرى</a>
      </body>
      </html>
    `);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('خطأ في تسجيل الخروج:', err);
    res.redirect('/admin/login');
  });
});

// ======== APIs عامة (بدون حماية) ========

app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: '🚀 نظام الاختبار يعمل بنجاح!',
    timestamp: new Date().toISOString(),
    database: 'SQLite دائم',
    endpoints: ['/api/test', '/api/db-test', '/api/save-data', '/api/all-data', '/api/process-payment', '/api/orders', '/api/categories', '/api/perfumes', '/admin', '/admin/login']
  });
});

app.get('/api/test', (req, res) => {
  res.json({ status: 'success', message: '✅ تم الاتصال بالخادم بنجاح!', timestamp: new Date().toISOString() });
});

app.get('/api/db-test', (req, res) => {
  db.get('SELECT 1 as test_value, datetime("now") as server_time', (err, row) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', message: '✅ تم الاتصال بقاعدة البيانات!', test_value: row.test_value, server_time: row.server_time });
  });
});

app.post('/api/save-data', (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email) return res.status(400).json({ status: 'error', message: 'الاسم والبريد الإلكتروني مطلوبان' });

  db.run('INSERT INTO test_users (name, email, phone, message) VALUES (?, ?, ?, ?)', [name, email, phone || '', message || ''], function (err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', message: '✅ تم حفظ البيانات', insert_id: this.lastID });
  });
});

app.get('/api/all-data', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', users: rows, count: rows.length });
  });
});

// ======== APIs الكوبونات ========
app.get('/api/validate-coupon', (req, res) => {
  const { code, order_amount, store_type } = req.query;
  if (!code || !order_amount) return res.status(400).json({ status: 'error', message: 'الكود وقيمة الطلب مطلوبان' });

  let query = 'SELECT * FROM coupons WHERE code = ? AND is_active = 1';
  let params = [code];
  if (store_type) {
    query += ' AND (store_type = ? OR store_type = "all")';
    params.push(store_type);
  }

  db.get(query, params, (err, coupon) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    if (!coupon) return res.status(404).json({ status: 'error', message: 'كوبون غير صالح' });

    const now = new Date();
    const validFrom = new Date(coupon.valid_from);
    const validUntil = new Date(coupon.valid_until);

    if (now < validFrom) return res.status(400).json({ status: 'error', message: 'الكوبون لم يبدأ بعد' });
    if (now > validUntil) return res.status(400).json({ status: 'error', message: 'الكوبون منتهي الصلاحية' });
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) return res.status(400).json({ status: 'error', message: 'تم الوصول للحد الأقصى' });

    const orderAmount = parseFloat(order_amount);
    if (orderAmount < coupon.min_order_amount) return res.status(400).json({ status: 'error', message: `الحد الأدنى ${coupon.min_order_amount} ريال` });

    let discountAmount = coupon.discount_type === 'percentage' ? (orderAmount * coupon.discount_value) / 100 : coupon.discount_value;
    if (discountAmount > orderAmount) discountAmount = orderAmount;

    res.json({
      status: 'success',
      valid: true,
      coupon: { ...coupon, discount_amount: discountAmount, final_amount: orderAmount - discountAmount }
    });
  });
});

app.get('/api/coupons', async (req, res) => {
  try {
    const rows = await allQuery('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json({ status: 'success', coupons: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/coupons', async (req, res) => {
  const { code, store_type, description, discount_type, discount_value, min_order_amount, max_uses, valid_from, valid_until, is_active } = req.body;
  if (!code || !discount_type || discount_value === undefined) return res.status(400).json({ status: 'error', message: 'بيانات ناقصة' });

  try {
    const existing = await getQuery('SELECT id FROM coupons WHERE code = ?', [code]);
    if (existing) return res.status(400).json({ status: 'error', message: 'الكود مستخدم مسبقاً' });

    const result = await runQuery(
      `INSERT INTO coupons (code, store_type, description, discount_type, discount_value, min_order_amount, max_uses, valid_from, valid_until, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, store_type || 'all', description || '', discount_type, parseFloat(discount_value), parseFloat(min_order_amount) || 0, parseInt(max_uses) || -1, valid_from || new Date().toISOString(), valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), is_active !== undefined ? is_active : 1]
    );
    res.json({ status: 'success', message: 'تم إنشاء الكوبون', coupon_id: result.lastID });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.put('/api/coupons/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return res.status(400).json({ status: 'error', message: 'لا توجد بيانات للتحديث' });
    values.push(id);
    const result = await runQuery(`UPDATE coupons SET ${fields.join(', ')} WHERE id = ?`, values);
    if (result.changes === 0) return res.status(404).json({ status: 'error', message: 'الكوبون غير موجود' });
    res.json({ status: 'success', message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/coupons/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await runQuery('DELETE FROM coupons WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ status: 'error', message: 'الكوبون غير موجود' });
    res.json({ status: 'success', message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ======== APIs القسائم الشرائية ========
app.post('/api/validate-gift-card', (req, res) => {
  const { card_number, pin_code, order_amount } = req.body;
  if (!card_number || !pin_code) return res.status(400).json({ status: 'error', message: 'رقم القسيمة والرمز مطلوبان' });

  db.get('SELECT * FROM gift_cards WHERE card_number = ? AND pin_code = ? AND is_active = 1', [card_number, pin_code], (err, giftCard) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    if (!giftCard) return res.status(404).json({ status: 'error', message: 'قسيمة غير صالحة' });

    const now = new Date();
    const validUntil = new Date(giftCard.valid_until);
    if (now > validUntil) return res.status(400).json({ status: 'error', message: 'القسيمة منتهية' });
    if (giftCard.max_uses > 0 && giftCard.used_count >= giftCard.max_uses) return res.status(400).json({ status: 'error', message: 'تم استخدام العدد الأقصى' });
    if (giftCard.current_balance <= 0) return res.status(400).json({ status: 'error', message: 'لا يوجد رصيد' });

    let usedAmount = order_amount ? Math.min(giftCard.current_balance, parseFloat(order_amount)) : giftCard.current_balance;
    res.json({
      status: 'success',
      valid: true,
      gift_card: { ...giftCard, used_amount: usedAmount, remaining_balance: giftCard.current_balance - usedAmount }
    });
  });
});

app.get('/api/gift-cards', async (req, res) => {
  try {
    const rows = await allQuery('SELECT * FROM gift_cards ORDER BY created_at DESC');
    res.json({ status: 'success', gift_cards: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/gift-cards', async (req, res) => {
  const { card_number, pin_code, initial_amount, valid_until, customer_name, customer_phone, notes, max_uses, is_active } = req.body;
  if (!card_number || !pin_code || !initial_amount) return res.status(400).json({ status: 'error', message: 'بيانات ناقصة' });
  try {
    const existing = await getQuery('SELECT id FROM gift_cards WHERE card_number = ?', [card_number]);
    if (existing) return res.status(400).json({ status: 'error', message: 'رقم القسيمة مستخدم' });
    const defaultValidUntil = new Date();
    defaultValidUntil.setDate(defaultValidUntil.getDate() + 90);
    const result = await runQuery(
      `INSERT INTO gift_cards (card_number, pin_code, initial_amount, current_balance, valid_until, customer_name, customer_phone, notes, max_uses, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [card_number, pin_code, parseFloat(initial_amount), parseFloat(initial_amount), valid_until || defaultValidUntil.toISOString(), customer_name || '', customer_phone || '', notes || '', max_uses || 1, is_active !== undefined ? is_active : 1]
    );
    res.json({ status: 'success', message: 'تم إنشاء القسيمة', gift_card_id: result.lastID });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/gift-cards/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await runQuery('DELETE FROM gift_cards WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ status: 'error', message: 'القسيمة غير موجودة' });
    res.json({ status: 'success', message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ======== API معالجة الدفع (مع التحسينات) ========
app.post('/api/process-payment', async (req, res) => {
  try {
    const body = req.body;
    validateOrderData(body);

    const { cart_items, total_amount, coupon_code, gift_card_number, gift_card_pin, customer_name, customer_phone, customer_email, customer_secondary_phone, payment_method, transfer_name, transfer_number, customer_address, address_city, address_area, address_detail, shipping_city, shipping_area, shipping_fee, order_notes, expected_delivery, shipping_type, store_type } = body;

    if (!cart_items || cart_items.length === 0) return res.status(400).json({ status: 'error', message: 'السلة فارغة' });

    let finalAmount = parseFloat(total_amount);
    let discountAmount = 0;
    let giftCardAmount = 0;
    let appliedCoupon = null;
    let appliedGiftCard = null;

    // معالجة الكوبون
    if (coupon_code) {
      let query = 'SELECT * FROM coupons WHERE code = ? AND is_active = 1';
      let params = [coupon_code];
      if (store_type) {
        query += ' AND (store_type = ? OR store_type = "all")';
        params.push(store_type);
      }
      const coupon = await getQuery(query, params);
      if (coupon) {
        const now = new Date();
        const validFrom = new Date(coupon.valid_from);
        const validUntil = new Date(coupon.valid_until);
        if (now >= validFrom && now <= validUntil && (coupon.max_uses === -1 || coupon.used_count < coupon.max_uses) && finalAmount >= coupon.min_order_amount) {
          discountAmount = coupon.discount_type === 'percentage' ? (finalAmount * coupon.discount_value) / 100 : coupon.discount_value;
          if (discountAmount > finalAmount) discountAmount = finalAmount;
          finalAmount -= discountAmount;
          appliedCoupon = coupon;
          await runQuery('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [coupon.id]);
        }
      }
    }

    // معالجة القسيمة (باستخدام معاملة)
    if (gift_card_number && gift_card_pin) {
      const giftCard = await getQuery('SELECT * FROM gift_cards WHERE card_number = ? AND pin_code = ? AND is_active = 1', [gift_card_number, gift_card_pin]);
      if (giftCard && giftCard.current_balance > 0) {
        const usedAmount = Math.min(giftCard.current_balance, finalAmount);
        if (usedAmount > 0) {
          await runQuery('BEGIN TRANSACTION');
          try {
            const updateResult = await runQuery('UPDATE gift_cards SET current_balance = current_balance - ?, used_count = used_count + 1, used_amount = used_amount + ? WHERE id = ? AND current_balance >= ?', [usedAmount, usedAmount, giftCard.id, usedAmount]);
            if (updateResult.changes === 0) throw new Error('فشل تحديث رصيد القسيمة');
            await runQuery('COMMIT');
            giftCardAmount = usedAmount;
            finalAmount -= usedAmount;
            appliedGiftCard = giftCard;
          } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
          }
        }
      }
    }

    const orderNumber = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const orderDate = new Date().toISOString();

    const orderResult = await runQuery(
      `INSERT INTO orders (
        order_number, cart_items, total_amount, discount_amount, coupon_code, coupon_type,
        gift_card_number, gift_card_type, gift_card_amount, order_date, order_status,
        customer_name, customer_phone, customer_email, customer_secondary_phone,
        payment_method, transfer_name, transfer_number, customer_address, address_city,
        address_area, address_detail, shipping_city, shipping_area, shipping_fee,
        final_amount, order_notes, expected_delivery, items_count, shipping_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber, JSON.stringify(cart_items), parseFloat(total_amount), discountAmount,
        appliedCoupon ? appliedCoupon.code : null, appliedCoupon ? appliedCoupon.discount_type : null,
        appliedGiftCard ? appliedGiftCard.card_number : null, appliedGiftCard ? 'gift_card' : null, giftCardAmount,
        orderDate, 'pending', customer_name, customer_phone, customer_email || '', customer_secondary_phone || '',
        payment_method || 'online', transfer_name || '', transfer_number || '', customer_address || '',
        address_city || '', address_area || '', address_detail || '', shipping_city || address_city || '',
        shipping_area || address_area || '', parseFloat(shipping_fee) || 0, finalAmount, order_notes || '',
        expected_delivery || 'تقريباً مابين 11-15/2025', cart_items.length, shipping_type || 'توصيل منزلي'
      ]
    );

    const orderId = orderResult.lastID;
    // حفظ تفاصيل المنتجات
    const itemStmt = db.prepare(`INSERT INTO order_items (order_id, product_id, product_name, quantity, price, total_price, product_url) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const item of cart_items) {
      itemStmt.run(orderId, item.id || 0, item.name || 'منتج', item.quantity || 1, item.price || 0, (item.price || 0) * (item.quantity || 1), item.productUrl || '');
    }
    itemStmt.finalize();

    res.json({
      status: 'success',
      message: 'تم استلام الطلب بنجاح',
      order_id: orderNumber,
      original_amount: parseFloat(total_amount),
      discount_amount: discountAmount,
      gift_card_amount: giftCardAmount,
      final_amount: finalAmount,
      payment_method: payment_method
    });
  } catch (err) {
    console.error('❌ خطأ في معالجة الدفع:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ======== APIs الطلبات ========
app.get('/api/orders', async (req, res) => {
  try {
    const rows = await allQuery('SELECT * FROM orders ORDER BY created_at DESC');
    const orders = rows.map(order => ({
      ...order,
      cart_items: (() => { try { return JSON.parse(order.cart_items); } catch (e) { return []; } })()
    }));
    res.json({ status: 'success', orders, count: orders.length });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await runQuery('UPDATE orders SET order_status = ? WHERE id = ?', [status, id]);
    if (result.changes === 0) return res.status(404).json({ status: 'error', message: 'الطلب غير موجود' });
    res.json({ status: 'success', message: 'تم تحديث الحالة', new_status: status });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ======== APIs الفئات والعطور ========
app.get('/api/categories', async (req, res) => {
  try {
    const rows = await allQuery('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC');
    res.json({ status: 'success', categories: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/perfumes', async (req, res) => {
  const { category_id, featured_only, active_only, search } = req.query;
  let sql = `SELECT p.*, c.name_ar as category_name_ar FROM perfumes p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1`;
  const params = [];
  if (category_id) { sql += ' AND p.category_id = ?'; params.push(category_id); }
  if (featured_only === 'true') { sql += ' AND p.is_featured = 1'; }
  if (search) { sql += ' AND (p.name_ar LIKE ? OR p.name_en LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY p.sort_order ASC';
  try {
    const rows = await allQuery(sql, params);
    res.json({ status: 'success', perfumes: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ======== صفحات الإدارة (محمية) ========
const adminLayout = (title, content, activePage = '') => {
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} - لوحة التحكم</title><style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#f0f2f5;display:flex;min-height:100vh}.sidebar{width:260px;background:#1e293b;color:white;position:fixed;height:100vh;right:0;padding:20px}.sidebar-header{padding:20px;text-align:center;font-size:20px;font-weight:bold}.nav-list{list-style:none;margin-top:30px}.nav-item{margin-bottom:10px}.nav-link{display:block;padding:12px 20px;color:#cbd5e1;text-decoration:none;border-radius:8px;transition:0.3s}.nav-link:hover,.nav-link.active{background:#334155;color:white}.main-content{margin-right:260px;flex:1;padding:30px}.card{background:white;border-radius:16px;padding:25px;margin-bottom:25px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:25px}.stat-card{background:white;padding:20px;border-radius:16px;text-align:center}.stat-value{font-size:32px;font-weight:bold;color:#2563eb}.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:8px;border:none;cursor:pointer;text-decoration:none;font-weight:500}.btn-primary{background:#2563eb;color:white}.btn-danger{background:#dc2626;color:white}.btn-secondary{background:#e2e8f0;color:#1e293b}.table-wrapper{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{padding:12px;text-align:right;border-bottom:1px solid #e2e8f0}th{background:#f8fafc;font-weight:600}.badge{padding:4px 8px;border-radius:12px;font-size:12px;font-weight:500}.badge-success{background:#dcfce7;color:#166534}.badge-warning{background:#fef3c7;color:#92400e}
  </style></head><body><aside class="sidebar"><div class="sidebar-header">🛍️ لوحة التحكم</div><nav class="nav-list">
    <div class="nav-item"><a href="/admin" class="nav-link ${activePage === 'users' ? 'active' : ''}">📊 المستخدمين</a></div>
    <div class="nav-item"><a href="/admin/orders" class="nav-link ${activePage === 'orders' ? 'active' : ''}">🛒 الطلبات</a></div>
    <div class="nav-item"><a href="/admin/coupons" class="nav-link ${activePage === 'coupons' ? 'active' : ''}">🎫 الكوبونات</a></div>
    <div class="nav-item"><a href="/admin/gift-cards" class="nav-link ${activePage === 'gift-cards' ? 'active' : ''}">💳 القسائم</a></div>
    <div class="nav-item"><a href="/admin/products" class="nav-link ${activePage === 'products' ? 'active' : ''}">🏷️ المنتجات</a></div>
    <div class="nav-item"><a href="/logout" class="nav-link">🚪 تسجيل الخروج</a></div>
  </nav></aside><main class="main-content"><div class="card"><h1>${title}</h1>${content}</div></main></body></html>`;
};

app.get('/admin', requireAuth, async (req, res) => {
  const users = await allQuery('SELECT * FROM test_users ORDER BY created_at DESC');
  const content = `<div class="stats-grid"><div class="stat-card"><div class="stat-value">${users.length}</div><div>إجمالي المستخدمين</div></div></div>
    <div class="table-wrapper"><table><thead><tr><th>ID</th><th>الاسم</th><th>البريد</th><th>الهاتف</th><th>التاريخ</th></tr></thead><tbody>
    ${users.map(u => `<tr><td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.phone || '-'}</td><td>${u.created_at}</td></tr>`).join('')}
    </tbody></table></div>`;
  res.send(adminLayout('بيانات المستخدمين', content, 'users'));
});

app.get('/admin/orders', requireAuth, async (req, res) => {
  const orders = await allQuery('SELECT * FROM orders ORDER BY created_at DESC');
  const content = `<div class="stats-grid"><div class="stat-card"><div class="stat-value">${orders.length}</div><div>إجمالي الطلبات</div></div></div>
    <div class="table-wrapper"><table><thead><tr><th>رقم الطلب</th><th>العميل</th><th>الهاتف</th><th>المبلغ</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>
    ${orders.map(o => `<tr>
      <td>${o.order_number}</td><td>${o.customer_name}</td><td>${o.customer_phone}</td><td>${o.final_amount} ر.س</td>
      <td><select onchange="updateStatus(${o.id}, this.value)"><option ${o.order_status === 'pending' ? 'selected' : ''}>pending</option><option ${o.order_status === 'confirmed' ? 'selected' : ''}>confirmed</option><option ${o.order_status === 'completed' ? 'selected' : ''}>completed</option><option ${o.order_status === 'cancelled' ? 'selected' : ''}>cancelled</option></select></td>
      <td><button class="btn btn-secondary" onclick="viewOrder(${o.id})">تفاصيل</button></td>
    </tr>`).join('')}
    </tbody></table></div>
    <script>
      function updateStatus(id, status){ fetch('/api/orders/'+id+'/status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}).then(()=>location.reload()); }
      function viewOrder(id){ window.open('/api/orders/'+id,'_blank'); }
    </script>`;
  res.send(adminLayout('إدارة الطلبات', content, 'orders'));
});

app.get('/admin/coupons', requireAuth, async (req, res) => {
  const coupons = await allQuery('SELECT * FROM coupons ORDER BY created_at DESC');
  const content = `
    <button class="btn btn-primary" onclick="showAddModal()">+ إضافة كوبون</button><br><br>
    <div class="table-wrapper"><table><thead><tr><th>الكود</th><th>الخصم</th><th>الاستخدام</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>
    ${coupons.map(c => `<tr><td>${c.code}</td><td>${c.discount_value} ${c.discount_type === 'percentage' ? '%' : 'ر.س'}</td><td>${c.used_count}/${c.max_uses === -1 ? '∞' : c.max_uses}</td><td>${c.is_active ? 'نشط' : 'معطل'}</td><td><button onclick="deleteCoupon(${c.id})" class="btn btn-danger">حذف</button></td></tr>`).join('')}
    </tbody></table></div>
    <div id="addModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); align-items:center; justify-content:center;"><div style="background:white; padding:20px; border-radius:16px; width:400px;"><h3>إضافة كوبون</h3><form id="couponForm"><input name="code" placeholder="الكود" required><input name="discount_value" type="number" placeholder="القيمة" required><select name="discount_type"><option value="percentage">نسبة</option><option value="fixed">ثابت</option></select><input name="valid_from" type="datetime-local"><input name="valid_until" type="datetime-local"><button type="submit" class="btn btn-primary">حفظ</button><button type="button" onclick="closeModal()" class="btn btn-secondary">إلغاء</button></form></div></div>
    <script>
      function showAddModal(){ document.getElementById('addModal').style.display='flex'; }
      function closeModal(){ document.getElementById('addModal').style.display='none'; }
      document.getElementById('couponForm').addEventListener('submit', async function(e){ e.preventDefault(); const data = Object.fromEntries(new FormData(this)); const res = await fetch('/api/coupons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(res.ok) location.reload(); else alert('خطأ'); });
      async function deleteCoupon(id){ if(confirm('حذف؟')){ await fetch('/api/coupons/'+id,{method:'DELETE'}); location.reload(); } }
    </script>`;
  res.send(adminLayout('الكوبونات', content, 'coupons'));
});

app.get('/admin/gift-cards', requireAuth, async (req, res) => {
  const giftCards = await allQuery('SELECT * FROM gift_cards ORDER BY created_at DESC');
  const content = `
    <button class="btn btn-primary" onclick="showAddModal()">+ إضافة قسيمة</button><br><br>
    <div class="table-wrapper"><table><thead><tr><th>رقم القسيمة</th><th>الرصيد</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>
    ${giftCards.map(g => `<tr><td>${g.card_number}</td><td>${g.current_balance}/${g.initial_amount}</td><td>${g.is_active ? 'نشط' : 'معطل'}</td><td><button onclick="deleteGiftCard(${g.id})" class="btn btn-danger">حذف</button></td></tr>`).join('')}
    </tbody></table></div>
    <div id="addModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); align-items:center; justify-content:center;"><div style="background:white; padding:20px; border-radius:16px; width:400px;"><h3>إضافة قسيمة</h3><form id="giftForm"><input name="card_number" placeholder="رقم القسيمة" required><input name="pin_code" placeholder="الرمز السري" required><input name="initial_amount" type="number" placeholder="المبلغ" required><input name="valid_until" type="datetime-local"><button type="submit" class="btn btn-primary">حفظ</button><button type="button" onclick="closeModal()" class="btn btn-secondary">إلغاء</button></form></div></div>
    <script>
      function showAddModal(){ document.getElementById('addModal').style.display='flex'; }
      function closeModal(){ document.getElementById('addModal').style.display='none'; }
      document.getElementById('giftForm').addEventListener('submit', async function(e){ e.preventDefault(); const data = Object.fromEntries(new FormData(this)); const res = await fetch('/api/gift-cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(res.ok) location.reload(); else alert('خطأ'); });
      async function deleteGiftCard(id){ if(confirm('حذف؟')){ await fetch('/api/gift-cards/'+id,{method:'DELETE'}); location.reload(); } }
    </script>`;
  res.send(adminLayout('القسائم الشرائية', content, 'gift-cards'));
});

app.get('/admin/products', requireAuth, (req, res) => {
  res.send(adminLayout('إدارة المنتجات', '<p>صفحة إدارة المنتجات قيد التطوير</p><a href="/api/categories">عرض الفئات API</a> | <a href="/api/perfumes">عرض العطور API</a>', 'products'));
});

// ======== تصدير Excel ========
app.get('/api/export-all-sales', async (req, res) => {
  try {
    const orders = await allQuery('SELECT * FROM orders ORDER BY created_at DESC');
    if (orders.length === 0) return res.status(404).json({ status: 'error', message: 'لا توجد طلبات' });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('المبيعات');
    worksheet.columns = [
      { header: 'رقم الطلب', key: 'order_number', width: 20 },
      { header: 'العميل', key: 'customer_name', width: 20 },
      { header: 'الهاتف', key: 'customer_phone', width: 15 },
      { header: 'المبلغ', key: 'final_amount', width: 15 },
      { header: 'الحالة', key: 'order_status', width: 15 },
      { header: 'التاريخ', key: 'order_date', width: 20 }
    ];
    orders.forEach(o => worksheet.addRow(o));
    const filename = `sales-${Date.now()}.xlsx`;
    const filepath = path.join(exportsDir, filename);
    await workbook.xlsx.writeFile(filepath);
    res.download(filepath, filename, () => setTimeout(() => fs.unlinkSync(filepath), 30000));
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ======== معالجة الأخطاء ========
app.use((err, req, res, next) => {
  console.error('❌ خطأ غير متوقع:', err);
  res.status(500).json({ status: 'error', message: 'خطأ داخلي في الخادم' });
});

app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'الصفحة غير موجودة' });
});

// ======== بدء الخادم ========
app.listen(PORT, HOST, () => {
  console.log(`🚀 الخادم يعمل على http://${HOST}:${PORT}`);
  console.log(`🔐 لوحة الإدارة: http://${HOST}:${PORT}/admin/login (كلمة المرور الافتراضية: admin123)`);
});