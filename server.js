const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// ======== إعدادات الخادم ========
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// ======== Middleware ========
app.use(cors({
  origin: '*',  // في الإنتاج يمكنك تقييده بنطاقك
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// ======== مجلد التصدير ========
const exportsDir = path.join(__dirname, 'exports');
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
console.log('✅ مجلد التصدير جاهز:', exportsDir);

// ======== قاعدة البيانات (في الذاكرة - مناسبة للاختبار السريع) ========
const db = new sqlite3.Database(':memory:');
console.log('✅ قاعدة البيانات SQLite (ذاكرة) جاهزة');

// ======== تهيئة الجداول والبيانات الافتراضية ========
db.serialize(() => {
  // المستخدمون
  db.run(`CREATE TABLE IF NOT EXISTS test_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // الطلبات
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
    shipping_fee REAL DEFAULT 0,
    final_amount REAL DEFAULT 0,
    order_notes TEXT,
    expected_delivery TEXT,
    items_count INTEGER DEFAULT 0,
    shipping_type TEXT DEFAULT 'توصيل منزلي',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // تفاصيل الطلبات
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

  // الكوبونات (مع دعم المتجر)
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

  // القسائم الشرائية
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

  // إعدادات الـ admin
  db.run(`CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // الفئات
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

  // العطور
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

  // ======== إدخال البيانات الافتراضية ========
  // المستخدمون التجريبيون
  db.run(`INSERT OR IGNORE INTO test_users (name, email, phone, message) VALUES 
    ('أحمد محمد', 'ahmed@example.com', '0501234567', 'رسالة تجريبية'),
    ('سارة علي', 'sara@example.com', '0557654321', 'أريد معرفة المزيد عن العطور')`);

  // الكوبونات الافتراضية (مع أنواع المتاجر)
  db.run(`INSERT OR IGNORE INTO coupons 
    (code, store_type, description, discount_type, discount_value, min_order_amount, max_uses, valid_from, valid_until) 
    VALUES 
    ('WELCOME10', 'all', 'خصم 10% لأول طلب', 'percentage', 10, 50, 100, datetime('now'), datetime('now', '+30 days')),
    ('FIXED20', 'all', 'خصم 20 ريال', 'fixed', 20, 100, 50, datetime('now'), datetime('now', '+15 days')),
    ('NOON15', 'noon', 'خصم 15% لمتجر نون', 'percentage', 15, 100, 50, datetime('now'), datetime('now', '+30 days')),
    ('STORE10', 'store1', 'خصم 10 ريال للمتجر الأول', 'fixed', 10, 50, 100, datetime('now'), datetime('now', '+60 days'))`);

  // القسائم الافتراضية
  db.run(`INSERT OR IGNORE INTO gift_cards 
    (card_number, pin_code, initial_amount, current_balance, valid_until, customer_name, notes) 
    VALUES 
    ('GC-1001-2024', '1234', 100, 100, datetime('now', '+90 days'), 'عميل تجريبي', 'قسيمة هدية')`);

  // الفئات الافتراضية
  db.run(`INSERT OR IGNORE INTO categories (name_ar, name_en, description, image, sort_order) VALUES 
    ('عطور رجالية', 'Men Perfumes', 'أجمل العطور الرجالية', '/images/men.png', 1),
    ('عطور نسائية', 'Women Perfumes', 'عطور أنيقة', '/images/women.png', 2)`);

  // العطور الافتراضية
  db.run(`INSERT OR IGNORE INTO perfumes (name_ar, name_en, description, price, category_id, in_stock, stock_quantity) VALUES 
    ('عطر فاخر', 'Luxury Perfume', 'عطر فاخر برائحة خشبية', 199, 1, 1, 50),
    ('عطر زهور', 'Flower Perfume', 'عطر زهري ناعم', 149, 2, 1, 30)`);

  // إعدادات admin
  db.run(`INSERT OR IGNORE INTO admin_settings (setting_key, setting_value) VALUES 
    ('theme', 'light'),
    ('items_per_page', '10')`);

  console.log('✅ تم إنشاء الجداول والبيانات الافتراضية بنجاح');
});

// ================================
// ========== واجهات برمجة التطبيقات ==========
// ================================

// --- مسار الترحيب الأساسي ---
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: '🚀 نظام إدارة المتجر يعمل بنجاح',
    timestamp: new Date().toISOString(),
    endpoints: {
      users: '/api/all-data',
      test: '/api/test',
      orders: '/api/orders',
      coupons: '/api/coupons',
      giftCards: '/api/gift-cards',
      adminPanel: '/admin'
    }
  });
});

// --- اختبار الاتصال ---
app.get('/api/test', (req, res) => {
  res.json({ status: 'success', message: '✅ الاتصال بالخادم ناجح', timestamp: new Date().toISOString() });
});

app.get('/api/db-test', (req, res) => {
  db.get('SELECT 1 as test, datetime("now") as now', (err, row) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', db: 'connected', server_time: row.now });
  });
});

// --- إدارة المستخدمين ---
app.post('/api/save-data', (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email) return res.status(400).json({ status: 'error', message: 'الاسم والبريد الإلكتروني مطلوبان' });

  db.run('INSERT INTO test_users (name, email, phone, message) VALUES (?, ?, ?, ?)',
    [name, email, phone || '', message || ''],
    function(err) {
      if (err) return res.status(500).json({ status: 'error', message: err.message });
      res.json({ status: 'success', message: 'تم حفظ البيانات', insert_id: this.lastID });
    });
});

app.get('/api/all-data', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', users: rows, count: rows.length });
  });
});

// --- معالجة الطلبات ---
app.post('/api/process-payment', (req, res) => {
  const {
    cart_items, total_amount, discount_amount, coupon_code, gift_card_number, gift_card_amount,
    customer_name, customer_phone, customer_email, customer_secondary_phone,
    payment_method, transfer_name, transfer_number, customer_address, address_city, address_area,
    address_detail, shipping_fee, final_amount, order_notes, expected_delivery, items_count, shipping_type
  } = req.body;

  if (!cart_items || cart_items.length === 0) {
    return res.status(400).json({ status: 'error', message: 'السلة فارغة' });
  }

  const order_number = 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const order_date = new Date().toISOString();

  db.run(
    `INSERT INTO orders (
      order_number, cart_items, total_amount, discount_amount, coupon_code, gift_card_amount,
      order_date, order_status, customer_name, customer_phone, customer_email, customer_secondary_phone,
      payment_method, transfer_name, transfer_number, customer_address, address_city, address_area,
      address_detail, shipping_fee, final_amount, order_notes, expected_delivery, items_count, shipping_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order_number, JSON.stringify(cart_items), parseFloat(total_amount), parseFloat(discount_amount || 0),
      coupon_code || null, parseFloat(gift_card_amount || 0), order_date, 'pending',
      customer_name || 'عميل', customer_phone || '', customer_email || '', customer_secondary_phone || '',
      payment_method || 'online', transfer_name || '', transfer_number || '', customer_address || '',
      address_city || '', address_area || '', address_detail || '', parseFloat(shipping_fee || 0),
      parseFloat(final_amount || total_amount), order_notes || '', expected_delivery || '',
      items_count || cart_items.length, shipping_type || 'توصيل منزلي'
    ],
    function(err) {
      if (err) return res.status(500).json({ status: 'error', message: err.message });
      const orderId = this.lastID;
      const stmt = db.prepare(`INSERT INTO order_items (order_id, product_id, product_name, quantity, price, total_price, product_url) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      cart_items.forEach(item => {
        stmt.run(orderId, item.id || 0, item.name || 'منتج', item.quantity || 1, item.price || 0,
          (item.price || 0) * (item.quantity || 1), item.productUrl || '');
      });
      stmt.finalize();

      // تحديث استهلاك الكوبون إن وجد
      if (coupon_code) {
        db.run('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?', [coupon_code]);
      }
      // تحديث رصيد القسيمة إن وجد
      if (gift_card_number && gift_card_amount > 0) {
        db.run('UPDATE gift_cards SET current_balance = current_balance - ?, used_count = used_count + 1, used_amount = used_amount + ? WHERE card_number = ?',
          [gift_card_amount, gift_card_amount, gift_card_number]);
      }

      res.json({ status: 'success', message: 'تم استلام الطلب', order_id: order_number });
    }
  );
});

app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    const orders = rows.map(o => ({ ...o, cart_items: JSON.parse(o.cart_items) }));
    res.json({ status: 'success', orders });
  });
});

app.put('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.run('UPDATE orders SET order_status = ? WHERE id = ?', [status, id], function(err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    db.get('SELECT * FROM orders WHERE id = ?', [id], (err2, order) => {
      if (err2) return res.status(500).json({ status: 'error', message: err2.message });
      order.cart_items = JSON.parse(order.cart_items);
      res.json({ status: 'success', message: 'تم تحديث حالة الطلب', order });
    });
  });
});

// --- إدارة الكوبونات (مع store_type) ---
app.get('/api/coupons', (req, res) => {
  db.all('SELECT * FROM coupons ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', coupons: rows });
  });
});

app.get('/api/coupons/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM coupons WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ status: 'error', message: 'الكوبون غير موجود' });
    res.json({ status: 'success', coupon: row });
  });
});

app.post('/api/coupons', (req, res) => {
  const { code, store_type, description, discount_type, discount_value, min_order_amount, max_uses, valid_from, valid_until, is_active } = req.body;
  if (!code || !discount_type || discount_value === undefined) {
    return res.status(400).json({ status: 'error', message: 'الكود ونوع الخصم وقيمته مطلوبة' });
  }
  db.get('SELECT id FROM coupons WHERE code = ?', [code], (err, existing) => {
    if (existing) return res.status(400).json({ status: 'error', message: 'الكود موجود مسبقاً' });
    const now = new Date().toISOString();
    const vFrom = valid_from || now;
    const vUntil = valid_until || new Date(Date.now() + 30*24*60*60*1000).toISOString();
    db.run(
      `INSERT INTO coupons (code, store_type, description, discount_type, discount_value, min_order_amount, max_uses, valid_from, valid_until, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, store_type || 'all', description || '', discount_type, parseFloat(discount_value), parseFloat(min_order_amount) || 0,
        max_uses ? parseInt(max_uses) : -1, vFrom, vUntil, is_active !== undefined ? is_active : 1],
      function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'تم إنشاء الكوبون', coupon_id: this.lastID });
      });
  });
});

app.put('/api/coupons/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    if (key !== 'id' && val !== undefined) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (fields.length === 0) return res.json({ status: 'success', message: 'لا توجد تغييرات' });
  values.push(id);
  db.run(`UPDATE coupons SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', message: 'تم تحديث الكوبون' });
  });
});

app.delete('/api/coupons/:id', (req, res) => {
  db.run('DELETE FROM coupons WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', message: 'تم حذف الكوبون' });
  });
});

// --- التحقق من صحة الكوبون أثناء الشراء ---
app.get('/api/validate-coupon', (req, res) => {
  const { code, order_amount, store_type } = req.query;
  if (!code || !order_amount) return res.status(400).json({ status: 'error', message: 'بيانات ناقصة' });

  let query = 'SELECT * FROM coupons WHERE code = ? AND is_active = 1';
  let params = [code];
  if (store_type) {
    query += ' AND (store_type = ? OR store_type = "all")';
    params.push(store_type);
  }
  db.get(query, params, (err, coupon) => {
    if (err || !coupon) return res.status(404).json({ status: 'error', message: 'كوبون غير صالح' });
    const now = new Date();
    if (now > new Date(coupon.valid_until)) return res.status(400).json({ status: 'error', message: 'انتهت صلاحية الكوبون' });
    if (coupon.max_uses !== -1 && coupon.used_count >= coupon.max_uses) {
      return res.status(400).json({ status: 'error', message: 'تم استخدام الكوبون لأقصى عدد مرات' });
    }
    const orderAmount = parseFloat(order_amount);
    if (orderAmount < coupon.min_order_amount) {
      return res.status(400).json({ status: 'error', message: `الحد الأدنى للطلب هو ${coupon.min_order_amount} ريال` });
    }
    let discount = coupon.discount_type === 'percentage' ? (orderAmount * coupon.discount_value) / 100 : coupon.discount_value;
    if (discount > orderAmount) discount = orderAmount;
    const final = orderAmount - discount;
    res.json({
      status: 'success',
      valid: true,
      discount_amount: discount,
      final_amount: final,
      coupon: {
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        min_order_amount: coupon.min_order_amount,
        store_type: coupon.store_type
      }
    });
  });
});

// --- إدارة القسائم الشرائية ---
app.get('/api/gift-cards', (req, res) => {
  db.all('SELECT * FROM gift_cards ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', gift_cards: rows });
  });
});

app.post('/api/gift-cards', (req, res) => {
  const { card_number, pin_code, initial_amount, valid_until, customer_name, customer_phone, notes, max_uses, is_active } = req.body;
  if (!card_number || !pin_code || !initial_amount) return res.status(400).json({ status: 'error', message: 'بيانات ناقصة' });
  const vUntil = valid_until || new Date(Date.now() + 90*24*60*60*1000).toISOString();
  db.run(
    `INSERT INTO gift_cards (card_number, pin_code, initial_amount, current_balance, valid_until, customer_name, customer_phone, notes, max_uses, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [card_number, pin_code, parseFloat(initial_amount), parseFloat(initial_amount), vUntil,
      customer_name || '', customer_phone || '', notes || '', max_uses || 1, is_active !== undefined ? is_active : 1],
    function(err) {
      if (err) return res.status(500).json({ status: 'error', message: err.message });
      res.json({ status: 'success', message: 'تم إنشاء القسيمة', gift_card_id: this.lastID });
    });
});

app.delete('/api/gift-cards/:id', (req, res) => {
  db.run('DELETE FROM gift_cards WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', message: 'تم حذف القسيمة' });
  });
});

app.post('/api/validate-gift-card', (req, res) => {
  const { card_number, pin_code, order_amount } = req.body;
  db.get('SELECT * FROM gift_cards WHERE card_number = ? AND pin_code = ? AND is_active = 1', [card_number, pin_code], (err, card) => {
    if (err || !card) return res.status(404).json({ status: 'error', message: 'قسيمة غير صالحة' });
    const now = new Date();
    if (now > new Date(card.valid_until)) return res.status(400).json({ status: 'error', message: 'انتهت صلاحية القسيمة' });
    if (card.current_balance <= 0) return res.status(400).json({ status: 'error', message: 'لا يوجد رصيد متبقي' });
    const used = Math.min(card.current_balance, parseFloat(order_amount || 0));
    res.json({ status: 'success', valid: true, used_amount: used, remaining_balance: card.current_balance - used });
  });
});

// --- إدارة الفئات والعطور ---
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC', (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', categories: rows });
  });
});

app.get('/api/perfumes', (req, res) => {
  db.all('SELECT * FROM perfumes WHERE is_active = 1 ORDER BY sort_order ASC', (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', perfumes: rows });
  });
});

app.get('/api/perfumes-stats', (req, res) => {
  db.get('SELECT COUNT(*) as total FROM perfumes', (err, total) => {
    db.get('SELECT COUNT(*) as active FROM perfumes WHERE is_active = 1', (err2, active) => {
      res.json({ status: 'success', stats: { total: total.total, active: active.active, in_stock: 0, total_stock: 0 } });
    });
  });
});

app.post('/api/categories', (req, res) => {
  const { name_ar, name_en, description, image, is_active, sort_order } = req.body;
  if (!name_ar || !name_en) return res.status(400).json({ status: 'error', message: 'الاسم مطلوب' });
  db.run(`INSERT INTO categories (name_ar, name_en, description, image, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
    [name_ar, name_en, description || '', image || '', is_active !== undefined ? is_active : 1, sort_order || 0],
    function(err) {
      if (err) return res.status(500).json({ status: 'error', message: err.message });
      res.json({ status: 'success', message: 'تمت الإضافة', category_id: this.lastID });
    });
});

app.delete('/api/categories/:id', (req, res) => {
  db.run('DELETE FROM categories WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', message: 'تم الحذف' });
  });
});

// --- إعدادات النظام ---
app.get('/api/admin-settings', (req, res) => {
  db.all('SELECT setting_key, setting_value FROM admin_settings', (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    const settings = {};
    rows.forEach(r => settings[r.setting_key] = r.setting_value);
    res.json({ status: 'success', settings });
  });
});

app.put('/api/admin-settings/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  db.run(`INSERT OR REPLACE INTO admin_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [key, String(value)], function(err) {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    res.json({ status: 'success', message: 'تم الحفظ' });
  });
});

// --- تصدير المبيعات إلى Excel ---
app.get('/api/export-all-sales', async (req, res) => {
  try {
    const orders = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
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
    res.download(filepath, filename, () => {
      setTimeout(() => fs.unlink(filepath, () => {}), 30000);
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// --- مسح جميع البيانات ---
app.delete('/api/clear-all-data', (req, res) => {
  db.run('DELETE FROM test_users');
  db.run('DELETE FROM orders');
  db.run('DELETE FROM order_items');
  res.json({ status: 'success', message: 'تم مسح جميع البيانات' });
});

// ================================
// ========== واجهة المستخدم (لوحة التحكم الاحترافية) ==========
// ================================

const adminLayout = (title, content, activePage = '') => `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | لوحة التحكم - متجر العطور</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;background:#f5f7fb;overflow-x:hidden}
.sidebar{position:fixed;right:0;top:0;width:280px;height:100vh;background:linear-gradient(180deg,#1e293b 0%,#0f172a 100%);color:#fff;transition:0.3s;z-index:1000;overflow-y:auto;box-shadow:-4px 0 20px rgba(0,0,0,0.1)}
.sidebar-header{padding:30px 25px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1)}
.sidebar-logo{font-size:24px;font-weight:800;background:linear-gradient(135deg,#818cf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sidebar-logo small{font-size:12px;display:block;color:#94a3b8;margin-top:5px}
.nav-list{list-style:none;padding:20px 15px}
.nav-item{margin-bottom:8px}
.nav-link{display:flex;align-items:center;gap:12px;padding:14px 18px;color:#cbd5e1;text-decoration:none;border-radius:12px;transition:0.2s;font-weight:500}
.nav-link i{width:22px;font-size:18px}
.nav-link:hover{background:rgba(255,255,255,0.08);color:white;transform:translateX(-5px)}
.nav-link.active{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;box-shadow:0 4px 12px rgba(79,70,229,0.3)}
.main-content{margin-right:280px;padding:25px 35px;min-height:100vh}
.top-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;flex-wrap:wrap;gap:15px}
.page-title h1{font-size:28px;font-weight:800;color:#1e293b;margin-bottom:5px}
.page-title p{color:#64748b;font-size:14px}
.logout-btn{background:#ef4444;color:white;padding:10px 20px;border-radius:12px;text-decoration:none;display:inline-flex;align-items:center;gap:8px;font-weight:500;transition:0.2s}
.logout-btn:hover{background:#dc2626;transform:translateY(-2px)}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:25px;margin-bottom:35px}
.stat-card{background:white;border-radius:20px;padding:22px 20px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 12px rgba(0,0,0,0.05);border:1px solid #e2e8f0;transition:0.3s}
.stat-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.1)}
.stat-info h3{font-size:28px;font-weight:800;color:#1e293b}
.stat-info p{color:#64748b;font-size:14px}
.stat-icon{width:55px;height:55px;background:linear-gradient(135deg,#e0e7ff,#c7d2fe);border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:28px;color:#4f46e5}
.card{background:white;border-radius:20px;border:1px solid #e2e8f0;margin-bottom:30px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04)}
.card-header{padding:20px 25px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:15px;background:#fafbfc}
.card-header h2{font-size:20px;font-weight:700;color:#1e293b}
.card-body{padding:20px 25px}
.table-responsive{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th,td{padding:15px 12px;text-align:right;border-bottom:1px solid #e2e8f0}
th{background:#f8fafc;font-weight:600;color:#475569;font-size:13px}
tr:hover td{background:#f8fafc}
.btn{padding:10px 20px;border-radius:12px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:600;font-size:14px;display:inline-flex;align-items:center;gap:8px;transition:0.2s;text-decoration:none}
.btn-primary{background:#4f46e5;color:white}
.btn-primary:hover{background:#4338ca;transform:translateY(-2px)}
.btn-success{background:#10b981;color:white}
.btn-success:hover{background:#059669}
.btn-danger{background:#ef4444;color:white}
.btn-danger:hover{background:#dc2626}
.btn-warning{background:#f59e0b;color:white}
.btn-outline{background:transparent;border:1px solid #e2e8f0;color:#475569}
.btn-outline:hover{background:#f1f5f9}
.badge{padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;display:inline-block}
.badge-success{background:#dcfce7;color:#166534}
.badge-warning{background:#fef3c7;color:#92400e}
.badge-danger{background:#fee2e2;color:#991b1b}
.badge-info{background:#e0e7ff;color:#3730a3}
.toast-notification{position:fixed;bottom:30px;left:30px;background:#1e293b;color:white;padding:14px 24px;border-radius:12px;display:none;align-items:center;gap:12px;z-index:1100;box-shadow:0 8px 24px rgba(0,0,0,0.2);font-weight:500}
.toast-notification.show{display:flex;animation:slideInLeft 0.3s ease}
@keyframes slideInLeft{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}
@media (max-width:1024px){.sidebar{width:90px}.sidebar .sidebar-logo small,.sidebar .nav-link span{display:none}.nav-link{justify-content:center;padding:14px}.nav-link i{margin:0;font-size:22px}.main-content{margin-right:90px}}
@media (max-width:768px){.main-content{padding:20px 15px}.stats-grid{gap:15px}.card-header{flex-direction:column;align-items:flex-start}}
.form-group{margin-bottom:20px}
.form-label{display:block;margin-bottom:8px;font-weight:600;color:#334155}
.form-control{width:100%;padding:12px 15px;border:1px solid #e2e8f0;border-radius:12px;font-family:'Cairo',sans-serif;font-size:14px}
.form-control:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,0.1)}
.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1050;align-items:center;justify-content:center}
.modal-content{background:white;border-radius:24px;width:90%;max-width:550px;max-height:85vh;overflow-y:auto;padding:30px}
.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #e2e8f0;padding-bottom:15px}
.close-modal{cursor:pointer;font-size:28px;color:#94a3b8}
.empty-state{text-align:center;padding:60px 20px;color:#64748b}
.empty-state i{font-size:60px;margin-bottom:20px;opacity:0.5}
</style>
</head>
<body>
<aside class="sidebar"><div class="sidebar-header"><div class="sidebar-logo">عطور RED<small>لوحة التحكم</small></div></div>
<ul class="nav-list">
<li class="nav-item"><a href="/admin" class="nav-link ${activePage === 'users' ? 'active' : ''}"><i class="fas fa-users"></i><span> المستخدمين</span></a></li>
<li class="nav-item"><a href="/admin/orders" class="nav-link ${activePage === 'orders' ? 'active' : ''}"><i class="fas fa-shopping-cart"></i><span> الطلبات</span></a></li>
<li class="nav-item"><a href="/admin/confirmed-orders" class="nav-link ${activePage === 'confirmed' ? 'active' : ''}"><i class="fas fa-check-circle"></i><span> المؤكدة</span></a></li>
<li class="nav-item"><a href="/admin/coupons" class="nav-link ${activePage === 'coupons' ? 'active' : ''}"><i class="fas fa-ticket-alt"></i><span> الكوبونات</span></a></li>
<li class="nav-item"><a href="/admin/gift-cards" class="nav-link ${activePage === 'gift-cards' ? 'active' : ''}"><i class="fas fa-gift"></i><span> القسائم</span></a></li>
<li class="nav-item"><a href="/admin/products" class="nav-link ${activePage === 'products' ? 'active' : ''}"><i class="fas fa-perfume"></i><span> المنتجات</span></a></li>
<li class="nav-item"><a href="/admin/settings" class="nav-link ${activePage === 'settings' ? 'active' : ''}"><i class="fas fa-cog"></i><span> الإعدادات</span></a></li>
<li class="nav-item"><a href="/admin/advanced" class="nav-link ${activePage === 'advanced' ? 'active' : ''}"><i class="fas fa-chart-line"></i><span> متقدم</span></a></li>
</ul></aside>
<main class="main-content">
<div class="top-bar"><div class="page-title"><h1>${title}</h1><p><i class="fas fa-calendar-alt"></i> ${new Date().toLocaleDateString('ar-SA')} - مرحباً بعودتك</p></div><div class="user-actions"><a href="/logout" class="logout-btn"><i class="fas fa-sign-out-alt"></i> تسجيل الخروج</a></div></div>
${content}
</main>
<div id="toastMsg" class="toast-notification"></div>
<script>
function showToast(message, type='success'){ let t=document.getElementById('toastMsg'); t.innerHTML='<i class="fas '+(type==='success'?'fa-check-circle':'fa-exclamation-triangle')+'"></i> '+message; t.style.background=type==='success'?'#10b981':'#ef4444'; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
async function apiRequest(url,options={}){ let res=await fetch(url,options); let data=await res.json(); if(!data.status||data.status!=='success') throw new Error(data.message||'حدث خطأ'); return data; }
</script>
</body>
</html>
`;

// صفحة المستخدمين
app.get('/admin', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    const users = rows || [];
    const content = `
<div class="stats-grid">
  <div class="stat-card"><div class="stat-info"><h3>${users.length}</h3><p>إجمالي المستخدمين</p></div><div class="stat-icon"><i class="fas fa-user-friends"></i></div></div>
  <div class="stat-card"><div class="stat-info"><h3>${users.filter(u=>u.phone).length}</h3><p>معرفون بالهاتف</p></div><div class="stat-icon"><i class="fas fa-phone-alt"></i></div></div>
</div>
<div class="card"><div class="card-header"><h2><i class="fas fa-list"></i> قائمة المستخدمين</h2><button onclick="exportUsers()" class="btn btn-primary"><i class="fas fa-file-excel"></i> تصدير JSON</button></div><div class="card-body"><div class="table-responsive"></td>
<thead><tr><th>#</th><th>الاسم</th><th>البريد</th><th>الهاتف</th><th>الرسالة</th><th>التاريخ</th><th>الإجراءات</th></tr></thead>
<tbody>${users.length===0?'<tr><td colspan="7" class="empty-state"><i class="fas fa-inbox"></i><br>لا توجد بيانات</td></tr>':users.map(u=>`<tr><td>${u.id}</td><td><strong>${u.name||'-'}</strong></td><td>${u.email||'-'}</td><td>${u.phone||'-'}</td><td>${u.message||'-'}</td><td>${new Date(u.created_at).toLocaleString('ar-SA')}</td><td><a href="/admin/purchases/${u.phone}?name=${encodeURIComponent(u.name)}" class="btn btn-primary" style="padding:6px 12px;font-size:12px"><i class="fas fa-shopping-bag"></i> مشتريات</a></td></tr>`).join('')}
</tbody>
</div></div></div>
<script>function exportUsers(){ window.open('/api/all-data','_blank'); }</script>`;
    res.send(adminLayout('لوحة المستخدمين', content, 'users'));
  });
});

// صفحة مشتريات العميل
app.get('/admin/purchases/:phone', (req, res) => {
  const { phone } = req.params;
  const name = req.query.name || 'العميل';
  db.all('SELECT * FROM orders WHERE customer_phone = ? OR customer_secondary_phone = ? ORDER BY created_at DESC', [phone, phone], (err, orders) => {
    if (err) return res.status(500).send('خطأ');
    let ordersHtml = orders.length===0 ? '<div class="empty-state"><i class="fas fa-box-open"></i><br>لا توجد طلبات</div>' : orders.map(o=>`<div class="card"><div class="card-header"><h2>${o.order_number}</h2><span class="badge badge-${o.order_status==='confirmed'?'success':(o.order_status==='pending'?'warning':'danger')}">${o.order_status}</span></div><div class="card-body"><div>المبلغ: ${o.total_amount} ر.س - الدفع: ${o.payment_method}</div><div>التاريخ: ${new Date(o.order_date).toLocaleString('ar-SA')}</div></div></div>`).join('');
    const content = `<div class="stats-grid"><div class="stat-card"><div class="stat-info"><h3>${orders.length}</h3><p>عدد الطلبات</p></div><div class="stat-icon"><i class="fas fa-shopping-cart"></i></div></div></div>${ordersHtml}<div style="margin-top:20px"><a href="/admin" class="btn btn-outline"><i class="fas fa-arrow-right"></i> العودة</a></div>`;
    res.send(adminLayout(`مشتريات: ${name}`, content, 'users'));
  });
});

// صفحة الطلبات
app.get('/admin/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, orders) => {
    if (err) return res.status(500).send('خطأ');
    let ordersHtml = orders.length===0 ? '<div class="empty-state"><i class="fas fa-inbox"></i><br>لا توجد طلبات</div>' : orders.map(o=>{
      let items = []; try{ items=JSON.parse(o.cart_items); }catch(e){}
      return `<div class="card"><div class="card-header"><div><h2><i class="fas fa-receipt"></i> ${o.order_number}</h2><span class="badge badge-${o.order_status==='completed'?'success':(o.order_status==='pending'?'warning':'info')}">${o.order_status}</span></div><div>${new Date(o.order_date).toLocaleString('ar-SA')}</div></div><div class="card-body"><div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); margin-bottom:20px;"><div><i class="fas fa-user"></i> ${o.customer_name||'-'}</div><div><i class="fas fa-phone"></i> ${o.customer_phone||'-'}</div><div><i class="fas fa-money-bill"></i> ${o.total_amount} ر.س</div><div><i class="fas fa-credit-card"></i> ${o.payment_method}</div></div><div><strong>المنتجات:</strong></div>${items.map(it=>`<div style="background:#f8fafc; margin-top:8px; padding:10px; border-radius:10px;">${it.name} × ${it.quantity} = ${(it.price*it.quantity).toFixed(2)} ر.س</div>`).join('')}<div style="margin-top:20px"><select onchange="updateOrderStatus(${o.id}, this.value)" class="form-control" style="width:auto"><option value="pending" ${o.order_status==='pending'?'selected':''}>قيد الانتظار</option><option value="confirmed" ${o.order_status==='confirmed'?'selected':''}>تأكيد</option><option value="completed" ${o.order_status==='completed'?'selected':''}>مكتمل</option><option value="cancelled" ${o.order_status==='cancelled'?'selected':''}>ملغي</option></select></div></div></div>`;
    }).join('');
    const content = `<div class="stats-grid"><div class="stat-card"><div class="stat-info"><h3>${orders.length}</h3><p>إجمالي الطلبات</p></div><div class="stat-icon"><i class="fas fa-chart-bar"></i></div></div><div class="stat-card"><div class="stat-info"><h3>${orders.filter(o=>o.order_status==='pending').length}</h3><p>قيد الانتظار</p></div><div class="stat-icon"><i class="fas fa-clock"></i></div></div><div class="stat-card"><div class="stat-info"><h3>${orders.reduce((s,o)=>s+parseFloat(o.total_amount),0).toFixed(0)} ر.س</h3><p>إجمالي المبيعات</p></div><div class="stat-icon"><i class="fas fa-chart-line"></i></div></div></div><div class="card"><div class="card-header"><h2><i class="fas fa-shopping-cart"></i> جميع الطلبات</h2><button onclick="exportOrders()" class="btn btn-primary"><i class="fas fa-download"></i> تصدير Excel</button></div><div class="card-body">${ordersHtml}</div></div>
    <script>
    async function updateOrderStatus(id,status){ const res=await fetch('/api/orders/'+id+'/status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}); const data=await res.json(); if(data.status==='success'){ showToast('تم تحديث الحالة'); setTimeout(()=>location.reload(),800); } else showToast(data.message,'error'); }
    function exportOrders(){ window.open('/api/export-all-sales','_blank'); }
    </script>`;
    res.send(adminLayout('إدارة الطلبات', content, 'orders'));
  });
});

// صفحة الطلبات المؤكدة
app.get('/admin/confirmed-orders', (req, res) => {
  db.all("SELECT * FROM orders WHERE order_status = 'confirmed' ORDER BY created_at DESC", (err, orders) => {
    if (err) return res.status(500).send('خطأ');
    let ordersHtml = orders.length===0 ? '<div class="empty-state"><i class="fas fa-check-circle"></i><br>لا توجد طلبات مؤكدة</div>' : orders.map(o=>{
      let items = []; try{ items=JSON.parse(o.cart_items); }catch(e){}
      return `<div class="card"><div class="card-header"><h2><i class="fas fa-check-circle"></i> ${o.order_number}</h2><div>${new Date(o.order_date).toLocaleString('ar-SA')}</div></div><div class="card-body"><div>${o.customer_name} | ${o.customer_phone}</div><div><strong>المبلغ:</strong> ${o.total_amount} ر.س</div><div>المنتجات: ${items.map(it=>it.name).join(', ')}</div><div style="margin-top:15px"><select onchange="updateOrderStatus(${o.id}, this.value)" class="form-control" style="width:auto"><option value="confirmed" selected>مؤكد</option><option value="completed">مكتمل</option><option value="cancelled">ملغي</option></select></div></div></div>`;
    }).join('');
    const content = `<div class="stats-grid"><div class="stat-card"><div class="stat-info"><h3>${orders.length}</h3><p>طلبات مؤكدة</p></div><div class="stat-icon"><i class="fas fa-check-double"></i></div></div></div>${ordersHtml}<script>async function updateOrderStatus(id,status){ await fetch('/api/orders/'+id+'/status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}); showToast('تم التحديث'); setTimeout(()=>location.reload(),800); }</script>`;
    res.send(adminLayout('الطلبات المؤكدة', content, 'confirmed'));
  });
});

// صفحة الكوبونات (مع store_type)
app.get('/admin/coupons', (req, res) => {
  db.all('SELECT * FROM coupons ORDER BY created_at DESC', (err, coupons) => {
    if (err) return res.status(500).send('خطأ');
    const couponsHtml = coupons.length===0 ? '<div class="empty-state"><i class="fas fa-ticket-alt"></i><br>لا توجد كوبونات</div>' : coupons.map(c=>{
      const storeTypeText = c.store_type==='noon' ? '🛒 نون' : (c.store_type==='store1' ? '🏪 المتجر الأول' : '🌐 عام');
      return `<div class="card"><div class="card-header"><div><i class="fas fa-tag"></i> <strong>${c.code}</strong> <span class="badge badge-info">${storeTypeText}</span> <span class="badge ${c.is_active && new Date(c.valid_until)>new Date() ? 'badge-success' : 'badge-danger'}">${c.is_active && new Date(c.valid_until)>new Date() ? 'نشط' : 'غير نشط'}</span></div><div>الاستخدام: ${c.used_count}/${c.max_uses===-1?'∞':c.max_uses}</div></div><div class="card-body"><div>الخصم: ${c.discount_value} ${c.discount_type==='percentage'?'%':'ر.س'} | الحد الأدنى: ${c.min_order_amount} ر.س</div><div>صالح حتى: ${new Date(c.valid_until).toLocaleString('ar-SA')}</div><div style="margin-top:15px"><button onclick="deleteCoupon(${c.id})" class="btn btn-danger">حذف</button> <button onclick="editCoupon(${c.id})" class="btn btn-primary">تعديل</button></div></div></div>`;
    }).join('');
    const content = `<div class="stats-grid"><div class="stat-card"><div class="stat-info"><h3>${coupons.length}</h3><p>إجمالي الكوبونات</p></div><div class="stat-icon"><i class="fas fa-ticket-alt"></i></div></div></div><div class="card"><div class="card-header"><h2><i class="fas fa-plus"></i> إضافة كوبون جديد</h2><button onclick="showAddCouponModal()" class="btn btn-success"><i class="fas fa-plus"></i> إضافة</button></div></div>${couponsHtml}
    <div id="addCouponModal" class="modal"><div class="modal-content"><div class="modal-header"><h3>إضافة كوبون</h3><span class="close-modal" onclick="closeAddModal()">&times;</span></div><form id="couponForm"><div class="form-group"><label>الكود</label><input name="code" class="form-control" required></div><div class="form-group"><label>نوع المتجر</label><select name="store_type" class="form-control"><option value="all">جميع المتاجر</option><option value="store1">المتجر الأول</option><option value="noon">متجر نون</option></select></div><div class="form-group"><label>نوع الخصم</label><select name="discount_type" class="form-control"><option value="percentage">نسبة مئوية</option><option value="fixed">قيمة ثابتة</option></select></div><div class="form-group"><label>قيمة الخصم</label><input name="discount_value" type="number" step="0.01" class="form-control" required></div><div class="form-group"><label>الحد الأدنى للطلب</label><input name="min_order_amount" type="number" step="0.01" class="form-control" value="0"></div><div class="form-group"><label>تاريخ الانتهاء</label><input name="valid_until" type="datetime-local" class="form-control" required></div><button type="submit" class="btn btn-primary">حفظ</button></form></div></div>
    <div id="editCouponModal" class="modal"><div class="modal-content"><div class="modal-header"><h3>تعديل الكوبون</h3><span class="close-modal" onclick="closeEditModal()">&times;</span></div><form id="editCouponForm"><input type="hidden" name="id" id="edit_id"><div class="form-group"><label>الكود</label><input name="code" id="edit_code" class="form-control" required></div><div class="form-group"><label>نوع المتجر</label><select name="store_type" id="edit_store_type" class="form-control"><option value="all">جميع المتاجر</option><option value="store1">المتجر الأول</option><option value="noon">متجر نون</option></select></div><div class="form-group"><label>نوع الخصم</label><select name="discount_type" id="edit_discount_type" class="form-control"><option value="percentage">نسبة مئوية</option><option value="fixed">قيمة ثابتة</option></select></div><div class="form-group"><label>قيمة الخصم</label><input name="discount_value" id="edit_discount_value" type="number" step="0.01" class="form-control" required></div><div class="form-group"><label>الحد الأدنى للطلب</label><input name="min_order_amount" id="edit_min_order" type="number" step="0.01" class="form-control"></div><div class="form-group"><label>تاريخ الانتهاء</label><input name="valid_until" id="edit_valid_until" type="datetime-local" class="form-control" required></div><div class="form-group"><label class="form-label"><input type="checkbox" name="is_active" id="edit_is_active"> نشط</label></div><button type="submit" class="btn btn-primary">حفظ التعديلات</button></form></div></div>
    <script>
    function showAddCouponModal(){ document.getElementById('addCouponModal').style.display='flex'; }
    function closeAddModal(){ document.getElementById('addCouponModal').style.display='none'; }
    function closeEditModal(){ document.getElementById('editCouponModal').style.display='none'; }
    document.getElementById('couponForm').addEventListener('submit', async(e)=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); data.discount_value=parseFloat(data.discount_value); data.min_order_amount=parseFloat(data.min_order_amount); data.valid_from=new Date().toISOString().slice(0,16); data.is_active=1; const res=await fetch('/api/coupons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const result=await res.json(); if(result.status==='success'){ showToast('تمت الإضافة'); location.reload(); } else showToast(result.message,'error'); });
    window.editCoupon=async function(id){ const res=await fetch('/api/coupons/'+id); const data=await res.json(); if(data.status==='success'){ const c=data.coupon; document.getElementById('edit_id').value=c.id; document.getElementById('edit_code').value=c.code; document.getElementById('edit_store_type').value=c.store_type||'all'; document.getElementById('edit_discount_type').value=c.discount_type; document.getElementById('edit_discount_value').value=c.discount_value; document.getElementById('edit_min_order').value=c.min_order_amount; document.getElementById('edit_valid_until').value=c.valid_until.slice(0,16); document.getElementById('edit_is_active').checked=c.is_active==1; document.getElementById('editCouponModal').style.display='flex'; } };
    document.getElementById('editCouponForm').addEventListener('submit', async(e)=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); const id=data.id; data.discount_value=parseFloat(data.discount_value); data.min_order_amount=parseFloat(data.min_order_amount); data.is_active=data.is_active?1:0; const res=await fetch('/api/coupons/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const result=await res.json(); if(result.status==='success'){ showToast('تم التحديث'); location.reload(); } else showToast(result.message,'error'); });
    async function deleteCoupon(id){ if(confirm('حذف الكوبون؟')){ await fetch('/api/coupons/'+id,{method:'DELETE'}); location.reload(); } }
    </script>`;
    res.send(adminLayout('إدارة الكوبونات', content, 'coupons'));
  });
});

// صفحة القسائم
app.get('/admin/gift-cards', (req, res) => {
  db.all('SELECT * FROM gift_cards ORDER BY created_at DESC', (err, cards) => {
    if (err) return res.status(500).send('خطأ');
    const cardsHtml = cards.length===0 ? '<div class="empty-state"><i class="fas fa-gift"></i><br>لا توجد قسائم</div>' : cards.map(g=>`<div class="card"><div class="card-header"><div><i class="fas fa-gift"></i> <strong>${g.card_number}</strong> <span class="badge ${g.is_active && new Date(g.valid_until)>new Date() && g.current_balance>0 ? 'badge-success' : 'badge-danger'}">${g.is_active && new Date(g.valid_until)>new Date() && g.current_balance>0 ? 'نشط' : 'غير نشط'}</span></div><div>${g.current_balance}/${g.initial_amount} ر.س</div></div><div class="card-body"><div>الرمز: ${g.pin_code}</div><div>صالح حتى: ${new Date(g.valid_until).toLocaleDateString('ar-SA')}</div><div style="margin-top:15px"><button onclick="deleteGiftCard(${g.id})" class="btn btn-danger">حذف</button></div></div></div>`).join('');
    const content = `<div class="stats-grid"><div class="stat-card"><div class="stat-info"><h3>${cards.length}</h3><p>إجمالي القسائم</p></div><div class="stat-icon"><i class="fas fa-gift"></i></div></div><div class="stat-card"><div class="stat-info"><h3>${cards.reduce((s,g)=>s+g.current_balance,0).toFixed(2)} ر.س</h3><p>الرصيد المتبقي</p></div><div class="stat-icon"><i class="fas fa-wallet"></i></div></div></div><div class="card"><div class="card-header"><h2><i class="fas fa-plus"></i> إضافة قسيمة</h2><button onclick="showAddGiftCardModal()" class="btn btn-success"><i class="fas fa-plus"></i> إضافة</button></div></div>${cardsHtml}
    <div id="addGiftModal" class="modal"><div class="modal-content"><div class="modal-header"><h3>إضافة قسيمة</h3><span class="close-modal" onclick="closeGiftModal()">&times;</span></div><form id="giftForm"><div class="form-group"><label>رقم القسيمة</label><input name="card_number" class="form-control" required></div><div class="form-group"><label>الرمز السري</label><input name="pin_code" class="form-control" required></div><div class="form-group"><label>المبلغ</label><input name="initial_amount" type="number" step="0.01" class="form-control" required></div><div class="form-group"><label>تاريخ الانتهاء</label><input name="valid_until" type="datetime-local" class="form-control" required></div><button type="submit" class="btn btn-primary">حفظ</button></form></div></div>
    <script>
    function showAddGiftCardModal(){ document.getElementById('addGiftModal').style.display='flex'; }
    function closeGiftModal(){ document.getElementById('addGiftModal').style.display='none'; }
    document.getElementById('giftForm').addEventListener('submit', async(e)=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); data.initial_amount=parseFloat(data.initial_amount); data.is_active=1; const res=await fetch('/api/gift-cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const result=await res.json(); if(result.status==='success'){ showToast('تمت الإضافة'); location.reload(); } else showToast(result.message,'error'); });
    async function deleteGiftCard(id){ if(confirm('حذف القسيمة؟')){ await fetch('/api/gift-cards/'+id,{method:'DELETE'}); location.reload(); } }
    </script>`;
    res.send(adminLayout('إدارة القسائم', content, 'gift-cards'));
  });
});

// صفحة المنتجات
app.get('/admin/products', (req, res) => {
  db.get('SELECT COUNT(*) as total FROM perfumes', (err, total) => {
    db.get('SELECT COUNT(*) as active FROM perfumes WHERE is_active=1', (err2, active) => {
      const content = `<div class="stats-grid"><div class="stat-card"><div class="stat-info"><h3>${total?.total||0}</h3><p>إجمالي العطور</p></div><div class="stat-icon"><i class="fas fa-perfume"></i></div></div><div class="stat-card"><div class="stat-info"><h3>${active?.active||0}</h3><p>نشطة</p></div><div class="stat-icon"><i class="fas fa-check-circle"></i></div></div></div><div class="card"><div class="card-header"><h2><i class="fas fa-list"></i> الفئات</h2><button onclick="alert('تطوير قريب')" class="btn btn-success">إضافة فئة</button></div><div class="card-body" id="categoriesList">جاري التحميل...</div></div><script>fetch('/api/categories').then(r=>r.json()).then(d=>{if(d.status==='success'){ let html='<div class="table-responsive"><table><thead><tr><th>الاسم</th><th>الوصف</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>'+d.categories.map(c=>'<tr><td>'+c.name_ar+'</td><td>'+(c.description||'-')+'</td><td><span class="badge '+(c.is_active?'badge-success':'badge-danger')+'">'+(c.is_active?'نشط':'غير نشط')+'</span></td><td><button class="btn btn-danger btn-sm" onclick="deleteCategory('+c.id+')">حذف</button></td></tr>').join('')+'</tbody></table></div>'; document.getElementById('categoriesList').innerHTML=html; }}); async function deleteCategory(id){ if(confirm('حذف الفئة؟')){ await fetch('/api/categories/'+id,{method:'DELETE'}); location.reload(); } }</script>`;
      res.send(adminLayout('إدارة المنتجات', content, 'products'));
    });
  });
});

// صفحة الإعدادات
app.get('/admin/settings', (req, res) => {
  const content = `<div class="card"><div class="card-header"><h2><i class="fas fa-palette"></i> المظهر والإعدادات</h2></div><div class="card-body"><div class="form-group"><label class="form-label">الثيم</label><select id="theme" class="form-control"><option value="light">فاتح</option><option value="dark">داكن</option></select></div><div class="form-group"><label class="form-label">عدد العناصر في الصفحة</label><input id="itemsPerPage" class="form-control" value="10"></div><button onclick="saveSettings()" class="btn btn-primary"><i class="fas fa-save"></i> حفظ</button></div></div><script>async function saveSettings(){ const theme=document.getElementById('theme').value; const items=document.getElementById('itemsPerPage').value; await fetch('/api/admin-settings/theme',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:theme})}); await fetch('/api/admin-settings/items_per_page',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:items})}); showToast('تم حفظ الإعدادات'); } async function loadSettings(){ const res=await fetch('/api/admin-settings'); const data=await res.json(); if(data.status==='success'){ if(data.settings.theme) document.getElementById('theme').value=data.settings.theme; if(data.settings.items_per_page) document.getElementById('itemsPerPage').value=data.settings.items_per_page; } } loadSettings();</script>`;
  res.send(adminLayout('إعدادات النظام', content, 'settings'));
});

// صفحة متقدمة
app.get('/admin/advanced', (req, res) => {
  db.all('SELECT COUNT(*) as total FROM test_users', (err, row) => {
    const total = row?.[0]?.total || 0;
    const content = `<div class="stats-grid"><div class="stat-card"><div class="stat-info"><h3>${total}</h3><p>المستخدمين</p></div><div class="stat-icon"><i class="fas fa-users"></i></div></div></div><div class="card"><div class="card-header"><h2><i class="fas fa-database"></i> أدوات متقدمة</h2></div><div class="card-body"><div style="display:flex; gap:15px; flex-wrap:wrap"><button onclick="clearAllData()" class="btn btn-danger"><i class="fas fa-trash-alt"></i> مسح جميع البيانات</button><button onclick="window.open('/api/export-all-sales','_blank')" class="btn btn-primary"><i class="fas fa-file-excel"></i> تصدير Excel</button><button onclick="window.open('/api/check-db','_blank')" class="btn btn-outline"><i class="fas fa-stethoscope"></i> فحص DB</button></div></div></div><script>async function clearAllData(){ if(confirm('مسح كل البيانات؟ لا يمكن التراجع')){ await fetch('/api/clear-all-data',{method:'DELETE'}); showToast('تم المسح'); setTimeout(()=>location.reload(),1000); } }</script>`;
    res.send(adminLayout('لوحة متقدمة', content, 'advanced'));
  });
});

// تسجيل الخروج (محاكاة بسيطة)
app.get('/logout', (req, res) => {
  res.send('<script>alert("تم تسجيل الخروج"); window.location.href="/admin";</script>');
});

// ================================
// ========== تشغيل الخادم ==========
// ================================
const server = app.listen(PORT, HOST, () => {
  console.log(`✅ الخادم يعمل بنجاح على http://${HOST}:${PORT}`);
  console.log(`🔗 لوحة الإدارة: http://${HOST}:${PORT}/admin`);
  console.log(`📊 اختبار قاعدة البيانات: http://${HOST}:${PORT}/api/db-test`);
});

server.on('error', (err) => {
  console.error('❌ فشل بدء الخادم:', err);
  process.exit(1);
});