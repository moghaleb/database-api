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
                <h1 style="margin: 0;">إدارة الكوبونات - نظام المتجر</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">إنشاء وتعديل وحذف كوبونات الخصم</p>
            </div>

            <div class="nav">
                <a href="/admin" class="nav-btn">بيانات المستخدمين</a>
                <a href="/admin/advanced" class="nav-btn">لوحة التحكم</a>
                <a href="/admin/orders" class="nav-btn">إدارة الطلبات</a>
                <a href="/" class="nav-btn">الرئيسية</a>
                <button onclick="document.getElementById('addCouponModal').style.display='block'" class="btn btn-success">+ إضافة كوبون جديد</button>
            </div>
    `;

    if (rows.length === 0) {
      html += `
            <div class="empty-state">
                <h3 style="color: #666; margin-bottom: 10px;">لا توجد كوبونات حتى الآن</h3>
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
                        <strong>عدد الاستخدامات الحالي:</strong> ${coupon.used_count}
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

        <script>
            function editCoupon(id) {
                // سيتم تنفيذ هذه الوظيفة لاحقًا
                alert('تعديل الكوبون: ' + id);
            }

            function deleteCoupon(id) {
                if (confirm('هل أنت متأكد من حذف هذا الكوبون؟')) {
                    fetch('/api/coupons/' + id, {
                        method: 'DELETE'
                    })
                    .then(response => response.json())
                    .then(data => {
                        alert(data.message);
                        location.reload();
                    })
                    .catch(error => {
                        alert('حدث خطأ: ' + error);
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
