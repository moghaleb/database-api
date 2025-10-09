// إضافة جدول الكوبونات
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL, -- 'percentage' أو 'fixed'
    discount_value REAL NOT NULL,
    min_order_amount REAL DEFAULT 0,
    max_discount_amount REAL,
    usage_limit INTEGER,
    used_count INTEGER DEFAULT 0,
    valid_from DATETIME,
    valid_until DATETIME,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ خطأ في إنشاء جدول الكوبونات:', err);
    } else {
      console.log('✅ تم إنشاء جدول الكوبونات بنجاح');

      // إضافة كوبونات تجريبية
      db.run(`INSERT OR IGNORE INTO coupons 
        (code, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit, valid_until) 
        VALUES 
        ('WELCOME10', 'percentage', 10, 50, 20, 100, datetime('now', '+30 days')),
        ('SAVE20', 'fixed', 20, 100, NULL, 50, datetime('now', '+30 days')),
        ('SUMMER25', 'percentage', 25, 200, 50, 25, datetime('now', '+15 days'))
      `);
    }
  });
});

// API التحقق من الكوبون
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
        console.error('❌ خطأ في التحقق من الكوبون:', err);
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

      // التحقق من حد الاستخدام
      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
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

      // حساب الخصم
      let discount = 0;
      let finalAmount = orderAmount;

      if (coupon.discount_type === 'percentage') {
        discount = (orderAmount * coupon.discount_value) / 100;
        if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
          discount = coupon.max_discount_amount;
        }
      } else if (coupon.discount_type === 'fixed') {
        discount = coupon.discount_value;
      }

      finalAmount = orderAmount - discount;

      res.json({
        status: 'success',
        message: 'الكوبون صالح',
        coupon: {
          code: coupon.code,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          discount_amount: discount,
          final_amount: finalAmount,
          min_order_amount: coupon.min_order_amount,
          max_discount_amount: coupon.max_discount_amount
        }
      });
    }
  );
});

// API استخدام الكوبون
app.post('/api/use-coupon', (req, res) => {
  const { coupon_code } = req.body;

  db.run(
    'UPDATE coupons SET used_count = used_count + 1 WHERE code = ?',
    [coupon_code],
    function(err) {
      if (err) {
        console.error('❌ خطأ في تحديث استخدام الكوبون:', err);
        return res.status(500).json({
          status: 'error',
          message: 'خطأ في استخدام الكوبون'
        });
      }

      res.json({
        status: 'success',
        message: 'تم استخدام الكوبون بنجاح'
      });
    }
  );
});

// API جلب جميع الكوبونات (للوحة التحكم)
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
      count: rows.length
    });
  });
});

// API للحصول على كوبون محدد بالمعرف
app.get('/api/coupons/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM coupons WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ خطأ في جلب الكوبون:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    if (!row) {
      return res.status(404).json({
        status: 'error',
        message: 'الكوبون غير موجود'
      });
    }

    res.json({
      status: 'success',
      coupon: row
    });
  });
});

// API لإنشاء كوبون جديد
app.post('/api/coupons', (req, res) => {
  const {
    code,
    discount_type,
    discount_value,
    min_order_amount,
    max_discount_amount,
    usage_limit,
    valid_from,
    valid_until,
    is_active
  } = req.body;

  if (!code || !discount_type || discount_value === undefined) {
    return res.status(400).json({
      status: 'error',
      message: 'الرمز ونوع الخصم وقيمة الخصم مطلوبة'
    });
  }

  db.run(
    `INSERT INTO coupons (
      code, discount_type, discount_value, min_order_amount, max_discount_amount,
      usage_limit, valid_from, valid_until, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code.toUpperCase(),
      discount_type,
      discount_value,
      min_order_amount || 0,
      max_discount_amount || null,
      usage_limit || null,
      valid_from || null,
      valid_until || null,
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
        coupon_id: this.lastID
      });
    }
  );
});

// API لتحديث كوبون
app.put('/api/coupons/:id', (req, res) => {
  const { id } = req.params;
  const {
    code,
    discount_type,
    discount_value,
    min_order_amount,
    max_discount_amount,
    usage_limit,
    valid_from,
    valid_until,
    is_active,
    used_count
  } = req.body;

  db.run(
    `UPDATE coupons SET
      code = COALESCE(?, code),
      discount_type = COALESCE(?, discount_type),
      discount_value = COALESCE(?, discount_value),
      min_order_amount = COALESCE(?, min_order_amount),
      max_discount_amount = COALESCE(?, max_discount_amount),
      usage_limit = COALESCE(?, usage_limit),
      valid_from = COALESCE(?, valid_from),
      valid_until = COALESCE(?, valid_until),
      is_active = COALESCE(?, is_active),
      used_count = COALESCE(?, used_count)
    WHERE id = ?`,
    [
      code ? code.toUpperCase() : null,
      discount_type,
      discount_value,
      min_order_amount,
      max_discount_amount,
      usage_limit,
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

// API لحذف كوبون
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