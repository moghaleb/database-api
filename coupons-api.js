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

// API التحقق من صحة كوبون بالكود
app.get('/api/validate-coupon/:code', (req, res) => {
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

// صفحة إدارة الكوبونات - كاملة
app.get('/admin/coupons', (req, res) => {
  db.all('SELECT * FROM coupons ORDER BY created_at DESC', (err, rows) => {
    let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إدارة الكوبونات - نظام المتجر</title>
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
                    <a href="/admin"><i class="fas fa-chart-pie"></i> <span>لوحة البيانات</span></a>
                    <a href="/admin/advanced"><i class="fas fa-tachometer-alt"></i> <span>لوحة التحكم</span></a>
                    <div class="nav-section">الإدارة</div>
                    <a href="/admin/orders"><i class="fas fa-shopping-cart"></i> <span>الطلبات</span></a>
                    <a href="/admin/products"><i class="fas fa-box"></i> <span>المنتجات</span></a>
                    <a href="/admin/coupons" class="active"><i class="fas fa-tags"></i> <span>الكوبونات</span></a>
                    <a href="/admin/gift-cards"><i class="fas fa-gift"></i> <span>القسائم</span></a>
                    <a href="/admin/confirmed-orders"><i class="fas fa-check-circle"></i> <span>الطلبات المؤكدة</span></a>
                    <div class="nav-section">النظام</div>
                    <a href="/admin/settings"><i class="fas fa-cog"></i> <span>الإعدادات</span></a>
                    <a href="/admin/users"><i class="fas fa-users"></i> <span>العملاء</span></a>
                    <a href="/logout"><i class="fas fa-sign-out-alt"></i> <span>تسجيل الخروج</span></a>
                </nav>
            </aside>
            <main class="main-content">
                <div class="top-bar">
                    <div class="page-title"><i class="fas fa-tags"></i> إدارة الكوبونات</div>
                    <div class="user-info">
                        <span>مرحباً، المدير</span>
                        <button onclick="showAddModal()" class="btn btn-success btn-sm">+ إضافة كوبون جديد</button>
                    </div>
                </div>
                <div class="content">
                    <div class="page-hero" style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);">
                        <h1>🎫 إدارة الكوبونات</h1>
                        <p>إنشاء وتعديل وحذف كوبونات الخصم مع تحديد الصلاحية</p>
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
            </main>
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