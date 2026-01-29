// صفحة الطلبات المؤكدة
app.get('/admin/confirmed-orders', (req, res) => {
  db.all('SELECT * FROM orders WHERE order_status = "confirmed" ORDER BY created_at DESC', (err, rows) => {
    let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>الطلبات المؤكدة - نظام المتجر</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f0f2f5; min-height: 100vh; }
            .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #8e24aa 0%, #6a1b9a 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center; position: relative; }
            .order-card { background: white; padding: 25px; margin-bottom: 20px; border-radius: 15px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-right: 4px solid #8e24aa; }
            .order-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
            .order-number { background: #8e24aa; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; }
            .order-status { padding: 6px 12px; border-radius: 15px; font-size: 14px; font-weight: bold; }
            .status-confirmed { background: #e1bee7; color: #6a1b9a; }
            .order-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .detail-item { background: #f8f9fa; padding: 12px; border-radius: 8px; }
            .items-list { background: #f8f9fa; padding: 15px; border-radius: 8px; }
            .item-card { background: white; padding: 10px; margin-bottom: 8px; border-radius: 6px; border-left: 3px solid #8e24aa; }
            .nav { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            .nav-btn { background: #fff; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .nav-btn:hover { background: #8e24aa; color: white; transform: translateY(-2px); }
            .logout-btn { position: absolute; left: 20px; top: 20px; background: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 25px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
            .logout-btn:hover { background: #d32f2f; transform: translateY(-2px); }
            .empty-state { text-align: center; padding: 60px; color: #666; background: white; border-radius: 15px; }
            .customer-info { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
            .btn { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: all 0.3s; font-weight: 500; }
            .btn-success { background: #4CAF50; color: white; }
            .btn-success:hover { background: #388E3C; transform: translateY(-2px); }
            .btn-primary { background: #2196F3; color: white; }
            .btn-primary:hover { background: #1976D2; transform: translateY(-2px); }
            .product-url { color: #1976D2; text-decoration: none; font-size: 12px; }
            .product-url:hover { text-decoration: underline; }
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
                <h1 style="margin: 0;">✅ الطلبات المؤكدة - نظام المتجر</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">جميع الطلبات التي تم تأكيدها</p>
            </div>

            <div class="nav">
                <a href="/admin" class="nav-btn">📊 بيانات المستخدمين</a>
                <a href="/admin/advanced" class="nav-btn">🛠️ لوحة التحكم</a>
                <a href="/admin/orders" class="nav-btn">🛒 إدارة الطلبات</a>
                <a href="/admin/confirmed-orders" class="nav-btn">✅ الطلبات المؤكدة</a>
                <a href="/admin/coupons" class="nav-btn">🎫 إدارة الكوبونات</a>
                <a href="/admin/gift-cards" class="nav-btn">💳 إدارة القسائم</a>
                <a href="/admin/products" class="nav-btn">🛍️ إدارة المنتجات</a>
                <a href="/admin/settings" class="nav-btn">⚙️ إعدادات النظام</a>
                <a href="/" class="nav-btn">🏠 الرئيسية</a>
            </div>

            <div class="stats-grid">
                <div class="stat-card" style="border-right: 4px solid #8e24aa;">
                    <div class="stat-number" style="color: #8e24aa;">${rows.length}</div>
                    <div class="stat-label">إجمالي الطلبات المؤكدة</div>
                </div>
                <div class="stat-card" style="border-right: 4px solid #6c757d;">
                    <div class="stat-number" style="color: #6c757d;">${rows.reduce((sum, order) => sum + parseFloat(order.total_amount), 0).toFixed(2)} ر.س</div>
                    <div class="stat-label">إجمالي المبيعات المؤكدة</div>
                </div>
            </div>
    `;

    if (rows.length === 0) {
      html += `
            <div class="empty-state">
                <h3 style="color: #666; margin-bottom: 10px;">📭 لا توجد طلبات مؤكدة حتى الآن</h3>
                <p style="color: #999;">لم يتم تأكيد أي طلبات بعد</p>
            </div>
      `;
    } else {
      rows.forEach(order => {
        const items = JSON.parse(order.cart_items);
        const statusClass = `status-${order.order_status}`;
        const statusText = {
          'pending': 'قيد الانتظار',
          'confirmed': 'مؤكد',
          'completed': 'مكتمل',
          'cancelled': 'ملغي'
        }[order.order_status] || order.order_status;

        const paymentMethodText = {
          'mobicash': 'موبي كاش',
          'yemenwallet': 'محفظة جيب',
          'bank_babalmandab': 'حوالة بنكية - باب المندب',
          'khameri': 'الكريمي',
          'online': 'دفع إلكتروني'
        }[order.payment_method] || order.payment_method;

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
                    ${order.customer_secondary_phone ? `هاتف إضافي: ${order.customer_secondary_phone} | ` : ''}
                    البريد: ${order.customer_email || 'غير محدد'}<br>
                    طريقة الدفع: <strong>${paymentMethodText}</strong>

                    <!-- عرض معلومات الحوالة إذا كانت موجودة -->
                    ${order.transfer_name ? `<div style="background: #e8f5e8; padding: 12px; border-radius: 8px; margin-top: 10px; border-right: 3px solid #4CAF50;">
                        <strong>معلومات الحوالة:</strong><br>
                        اسم المرسل: ${order.transfer_name} |
                        رقم الحوالة: ${order.transfer_number}
                    </div>` : ''}

                    <!-- عرض العنوان الجديد -->
                    ${order.customer_address ? `<br><strong>العنوان:</strong> ${order.customer_address}` : ''}
                    ${order.address_city ? ` | <strong>المدينة:</strong> ${order.address_city}` : ''}
                    ${order.address_area ? ` | <strong>المنطقة:</strong> ${order.address_area}` : ''}
                    ${order.address_detail ? `<br><strong>تفاصيل العنوان:</strong> ${order.address_detail}` : ''}

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
                        <strong>رسوم التوصيل:</strong> ${order.shipping_fee || 0} ر.س
                    </div>
                    <div class="detail-item">
                        <strong>المجموع النهائي:</strong> ${(order.final_amount || (order.total_amount - order.discount_amount - order.gift_card_amount + parseFloat(order.shipping_fee || 0))).toFixed(2)} ر.س
                    </div>
                    <div class="detail-item">
                        <strong>عدد العناصر:</strong> ${items.length}
                    </div>
                    <div class="detail-item">
                        <strong>حالة الطلب:</strong>
                        <select onchange="updateOrderStatus(${order.id}, this.value)" style="margin-right: 10px; padding: 4px 8px; border-radius: 5px; border: 1px solid #ddd;">
                            <option value="pending" ${order.order_status === 'pending' ? 'selected' : ''}>قيد الانتظار</option>
                            <option value="confirmed" ${order.order_status === 'confirmed' ? 'selected' : ''}>مؤكد</option>
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
                            <span style="color: #2196F3; font-weight: bold;">رقم المنتج: ${item.id || item.product_id || 'غير معروف'}</span><br>
                            السعر: ${item.price} ر.س × ${item.quantity || 1}
                            = <strong>${(item.price * (item.quantity || 1)).toFixed(2)} ر.س</strong>
                            ${item.selectedSize && item.selectedSize !== 'غير محدد' ? `<br>المقاس: ${item.selectedSize}` : ''}
                            ${item.colors && item.colors[0] && item.colors[0] !== 'غير محدد' ? `<br>اللون: ${item.colors[0]}` : ''}
                            ${item.productUrl ? `<br><a href="${item.productUrl}" target="_blank" class="product-url">🔗 رابط المنتج</a>` : ''}
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

