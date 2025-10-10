const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// SQLite database (في الذاكرة)
const db = new sqlite3.Database(':memory:');

// تهيئة الجداول
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
      'GET /admin - صفحة عرض البيانات',
      'GET /admin/advanced - لوحة التحكم',
      'GET /admin/orders - إدارة الطلبات'
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

// API معالجة الدفع وإرسال الطلب للإدارة
// في API معالجة الدفع - تحديث ليدعم حساب الخصم
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
    coupon_code  // إضافة الكوبون من Flutter
  } = req.body;

  console.log('💰 طلب دفع جديد:', { 
    customer: customer_name,
    items_count: cart_items.length, 
    total_amount, 
    coupon_code: coupon_code || 'لا يوجد'
  });

  // التحقق من البيانات
  if (!cart_items || cart_items.length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'السلة فارغة'
    });
  }

  // متغيرات الخصم
  let discountAmount = 0;
  let finalAmount = parseFloat(total_amount);
  let appliedCoupon = null;

  // التحقق من الكوبون إذا كان موجوداً
  const processCoupon = async () => {
    if (coupon_code) {
      try {
        const couponResponse = await new Promise((resolve, reject) => {
          db.get(
            'SELECT * FROM coupons WHERE code = ? AND is_active = 1',
            [coupon_code],
            (err, coupon) => {
              if (err) reject(err);
              else resolve(coupon);
            }
          );
        });

        if (couponResponse) {
          // التحقق من صلاحية الكوبون
          const now = new Date();
          const validFrom = new Date(couponResponse.valid_from);
          const validUntil = new Date(couponResponse.valid_until);

          if (now >= validFrom && now <= validUntil) {
            // التحقق من الحد الأقصى للاستخدام
            if (couponResponse.max_uses === -1 || couponResponse.used_count < couponResponse.max_uses) {
              // التحقق من الحد الأدنى للطلب
              if (finalAmount >= couponResponse.min_order_amount) {
                // حساب قيمة الخصم
                if (couponResponse.discount_type === 'percentage') {
                  discountAmount = (finalAmount * couponResponse.discount_value) / 100;
                } else {
                  discountAmount = couponResponse.discount_value;
                }

                // التأكد من أن الخصم لا يتجاوز قيمة الطلب
                if (discountAmount > finalAmount) {
                  discountAmount = finalAmount;
                }

                finalAmount = finalAmount - discountAmount;
                appliedCoupon = couponResponse;

                // زيادة عداد استخدامات الكوبون
                db.run(
                  'UPDATE coupons SET used_count = used_count + 1 WHERE id = ?',
                  [couponResponse.id]
                );

                console.log('✅ تم تطبيق الكوبون:', {
                  code: couponResponse.code,
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
      } catch (error) {
        console.error('❌ خطأ في معالجة الكوبون:', error);
      }
    }
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
        total_amount, // المبلغ الأصلي
        discountAmount, // قيمة الخصم
        appliedCoupon ? appliedCoupon.code : null,
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
            discount_value: appliedCoupon.discount_value
          } : null,
          items_count: cart_items.length,
          customer_name: customer_name,
          timestamp: new Date().toISOString(),
          admin_url: `https://database-api-kvxr.onrender.com/admin/orders`
        });
      }
    );
  });
});

// إضافة API جديد لتحقق سريع من الكوبون مع الحساب
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
                <a href="/admin/coupons" class="btn btn-info">🎫 إدارة الكوبونات</a>
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
            .nav-btn { background: #fff; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
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
                </div>
                
                <div class="order-details">
                    <div class="detail-item">
                        <strong>المجموع:</strong> ${order.total_amount} ر.س
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

// API التحقق من صحة كوبون
app.get('/api/coupons/:code', (req, res) => {
  const { code } = req.params;
  const { order_amount } = req.query;

  db.get('SELECT * FROM coupons WHERE code = ? AND is_active = 1', [code], (err, coupon) => {
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

    if (now < validFrom || now > validUntil) {
      return res.status(400).json({
        status: 'error',
        message: 'الكوبون منتهي الصلاحية أو غير فعال بعد'
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
    if (order_amount && parseFloat(order_amount) < coupon.min_order_amount) {
      return res.status(400).json({
        status: 'error',
        message: `الحد الأدنى لقيمة الطلب هو ${coupon.min_order_amount} ريال`
      });
    }

    // حساب قيمة الخصم
    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
      discountAmount = (parseFloat(order_amount) * coupon.discount_value) / 100;
    } else {
      discountAmount = coupon.discount_value;
    }

    // التأكد من أن الخصم لا يتجاوز قيمة الطلب
    if (order_amount && discountAmount > parseFloat(order_amount)) {
      discountAmount = parseFloat(order_amount);
    }

    res.json({
      status: 'success',
      message: 'كوبون صالح',
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        discount_amount: discountAmount.toFixed(2)
      },
      valid: true
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

      res.json({
        status: 'success',
        message: 'تم إنشاء الكوبون بنجاح',
        coupon_id: this.lastID,
        code: code
      });
    }
  );
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
    max_uses,
    valid_from,
    valid_until,
    is_active,
    used_count
  } = req.body;

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

      res.json({
        status: 'success',
        message: 'تم تحديث الكوبون بنجاح',
        updated_id: id
      });
    }
  );
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

    res.json({
      status: 'success',
      message: 'تم حذف الكوبون بنجاح',
      deleted_id: id
    });
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
            .header { background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; }
            .coupon-card { background: white; padding: 25px; margin-bottom: 20px; border-radius: 15px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-right: 4px solid #4CAF50; }
            .coupon-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
            .coupon-code { background: #4CAF50; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; }
            .coupon-status { padding: 6px 12px; border-radius: 15px; font-size: 14px; font-weight: bold; }
            .status-active { background: #d1ecf1; color: #0c5460; }
            .status-inactive { background: #f8d7da; color: #721c24; }
            .coupon-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .detail-item { background: #f8f9fa; padding: 12px; border-radius: 8px; }
            .nav { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            .nav-btn { background: #fff; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: all 0.3s; }
            .btn-primary { background: #2196F3; color: white; }
            .btn-danger { background: #f44336; color: white; }
            .btn-success { background: #4CAF50; color: white; }
            .empty-state { text-align: center; padding: 60px; color: #666; background: white; border-radius: 15px; }
            .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); z-index: 1000; }
            .modal-content { background-color: white; margin: 5% auto; padding: 30px; border-radius: 15px; width: 80%; max-width: 600px; }
            .form-group { margin-bottom: 15px; }
            .form-control { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
            .close { float: left; font-size: 28px; font-weight: bold; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">🎫 إدارة الكوبونات - نظام المتجر</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">إنشاء وتعديل وحذف كوبونات الخصم</p>
            </div>

            <div class="nav">
                <a href="/admin" class="nav-btn">📊 بيانات المستخدمين</a>
                <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
                <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
                <button onclick="document.getElementById('addCouponModal').style.display='block'" class="btn btn-success">+ إضافة كوبون جديد</button>
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
        const statusClass = coupon.is_active ? 'status-active' : 'status-inactive';
        const statusText = coupon.is_active ? 'نشط' : 'غير نشط';
        const discountTypeText = coupon.discount_type === 'percentage' ? 'نسبة مئوية' : 'ثابت';

        html += `
            <div class="coupon-card">
                <div class="coupon-header">
                    <div>
                        <span class="coupon-code">${coupon.code}</span>
                        <span class="coupon-status ${statusClass}" style="margin-right: 10px;">${statusText}</span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="editCoupon(${coupon.id})" class="btn btn-primary">تعديل</button>
                        <button onclick="deleteCoupon(${coupon.id})" class="btn btn-danger">حذف</button>
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
                        <strong>صالح من:</strong> ${new Date(coupon.valid_from).toLocaleDateString('ar-SA')}
                    </div>
                    <div class="detail-item">
                        <strong>صالح حتى:</strong> ${new Date(coupon.valid_until).toLocaleDateString('ar-SA')}
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
                <span class="close" onclick="document.getElementById('addCouponModal').style.display='none'">&times;</span>
                <h2>إضافة كوبون جديد</h2>
                <form id="addCouponForm">
                    <div class="form-group">
                        <label>كود الكوبون</label>
                        <input type="text" name="code" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>الوصف</label>
                        <input type="text" name="description" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>نوع الخصم</label>
                        <select name="discount_type" class="form-control">
                            <option value="percentage">نسبة مئوية (%)</option>
                            <option value="fixed">ثابت (ريال)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>قيمة الخصم</label>
                        <input type="number" name="discount_value" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>الحد الأدنى لقيمة الطلب</label>
                        <input type="number" name="min_order_amount" class="form-control" value="0">
                    </div>
                    <div class="form-group">
                        <label>الحد الأقصى للاستخدامات (-1 للغير محدود)</label>
                        <input type="number" name="max_uses" class="form-control" value="-1">
                    </div>
                    <div class="form-group">
                        <label>تاريخ البدء</label>
                        <input type="datetime-local" name="valid_from" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>تاريخ الانتهاء</label>
                        <input type="datetime-local" name="valid_until" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="is_active" checked> نشط
                        </label>
                    </div>
                    <button type="submit" class="btn btn-success">حفظ الكوبون</button>
                </form>
            </div>
        </div>

        <script>
            // إضافة كوبون جديد
            document.getElementById('addCouponForm').addEventListener('submit', function(e) {
                e.preventDefault();

                const formData = new FormData(this);
                const data = {};

                for (let [key, value] of formData.entries()) {
                    if (key === 'is_active') {
                        data[key] = value ? 1 : 0;
                    } else if (key === 'discount_value' || key === 'min_order_amount' || key === 'max_uses') {
                        data[key] = parseFloat(value);
                    } else {
                        data[key] = value;
                    }
                }

                fetch('/api/coupons', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
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
            });

            // حذف كوبون
            function deleteCoupon(id) {
                if (confirm('⚠️ هل أنت متأكد من حذف هذا الكوبون؟')) {
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

            // تعديل كوبون (سيتم تنفيذها لاحقاً)
            function editCoupon(id) {
                alert('ميزة التعديل قيد التطوير');
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
  console.log('📋 صفحات العرض:');
  console.log('   📊 /admin - صفحة عرض البيانات');
  console.log('   🛠️ /admin/advanced - لوحة التحكم');
  console.log('   🛒 /admin/orders - إدارة الطلبات');
});