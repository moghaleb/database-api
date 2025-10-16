// صفحة إدارة الكوبونات - إضافة هذا الكود بعد صفحة إدارة الطلبات
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