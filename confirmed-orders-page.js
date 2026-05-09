// صفحة الطلبات المؤكدة
app.get('/admin/confirmed-orders', (req, res) => {
    const storeFilter = req.query.store || 'all';
    let query = 'SELECT * FROM orders WHERE order_status = "confirmed"';
    if (storeFilter === 'noon') {
        query += " AND (cart_items LIKE '%noon%' OR customer_name LIKE '%noon%')";
    } else if (storeFilter === 'store1') {
        query += " AND (cart_items NOT LIKE '%noon%' AND (customer_name NOT LIKE '%noon%' OR customer_name IS NULL))";
    }
    query += ' ORDER BY created_at DESC';

    db.all(query, (err, rows) => {
        let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>الطلبات المؤكدة - نظام المتجر</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link rel="stylesheet" href="/admin-style.css">
        <style>
            .tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 2px solid var(--border); padding-bottom: 0; }
            .tab { padding: 10px 20px; border: none; background: transparent; cursor: pointer; font-weight: 500; font-family: var(--font); color: var(--text-muted); transition: all 0.2s ease; border-bottom: 2px solid transparent; margin-bottom: -2px; }
            .tab:hover { color: var(--text); }
            .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
            .tab.active-noon { color: #F4C430; border-bottom-color: #F4C430; }
        </style>
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
                    <a href="/admin/coupons"><i class="fas fa-tags"></i> <span>الكوبونات</span></a>
                    <a href="/admin/gift-cards"><i class="fas fa-gift"></i> <span>القسائم</span></a>
                    <a href="/admin/confirmed-orders" class="active"><i class="fas fa-check-circle"></i> <span>الطلبات المؤكدة</span></a>
                    <div class="nav-section">النظام</div>
                    <a href="/admin/settings"><i class="fas fa-cog"></i> <span>الإعدادات</span></a>
                    <a href="/admin/users"><i class="fas fa-users"></i> <span>العملاء</span></a>
                    <a href="/logout"><i class="fas fa-sign-out-alt"></i> <span>تسجيل الخروج</span></a>
                </nav>
            </aside>
            <main class="main-content">
                <div class="top-bar">
                    <div class="page-title"><i class="fas fa-check-circle"></i> الطلبات المؤكدة</div>
                    <div class="user-info">
                        <span>مرحباً، المدير</span>
                    </div>
                </div>
                <div class="content">
                    <div class="page-hero" style="background: linear-gradient(135deg, #8e24aa 0%, #6a1b9a 100%);">
                        <h1>✅ الطلبات المؤكدة</h1>
                        <p>جميع الطلبات التي تم تأكيدها</p>
                    </div>

            <!-- تبويبات تصفية الطلبات -->
            <div class="tabs">
                <button class="tab" id="tabAll" onclick="location.href='/admin/confirmed-orders'">📋 جميع الطلبات</button>
                <button class="tab" id="tabStore1" onclick="location.href='/admin/confirmed-orders?store=store1'">🏪 المتجر الأول (lib/pages)</button>
                <button class="tab" id="tabNoon" onclick="location.href='/admin/confirmed-orders?store=noon'">🛒 طلبات noon</button>
            </div>
            <script>
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('store') === 'noon') {
                    document.getElementById('tabNoon').classList.add('active-noon');
                } else if (urlParams.get('store') === 'store1') {
                    document.getElementById('tabStore1').classList.add('active');
                } else {
                    document.getElementById('tabAll').classList.add('active');
                }
            </script>

            <div class="stats-grid">
                <div class="stat-card" style="border-right: 4px solid #8e24aa;">
                    <div class="stat-number" style="color: #8e24aa;">${rows.length}</div>
                    <div class="stat-label">إجمالي الطلبات المؤكدة</div>
                </div>
                <div class="stat-card" style="border-right: 4px solid var(--text-muted);">
                    <div class="stat-number" style="color: var(--text-muted);">${rows.reduce((sum, order) => sum + parseFloat(order.total_amount), 0).toFixed(2)} ر.س</div>
                    <div class="stat-label">إجمالي المبيعات المؤكدة</div>
                </div>
            </div>
    `;

        if (rows.length === 0) {
            html += `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>لا توجد طلبات مؤكدة حتى الآن</h3>
                <p>لم يتم تأكيد أي طلبات بعد</p>
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
                        <span class="status ${statusClass}" style="margin-right: 10px;">${statusText}</span>
                    </div>
                    <div style="color: var(--text-muted); font-size: 14px;">
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

                    ${order.transfer_name ? `<div class="payment-info">
                        <strong>معلومات الحوالة:</strong><br>
                        اسم المرسل: ${order.transfer_name} |
                        رقم الحوالة: ${order.transfer_number}
                    </div>` : ''}

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
                    <h4 style="margin: 0 0 15px 0;"><i class="fas fa-shopping-bag"></i> العناصر المطلوبة:</h4>
                    ${items.map(item => `
                        <div class="item-card">
                            <strong>${item.name || 'منتج'}</strong><br>
                            <span style="color: var(--accent); font-weight: bold;">رقم المنتج: ${item.id || item.product_id || 'غير معروف'}</span><br>
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
            </main>
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
