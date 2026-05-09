function setupOrdersPage(app, db) {
app.get('/admin/orders', (req, res) => {
    const storeFilter = req.query.store || 'all';
    const statusFilter = req.query.status || 'all';

    let query = 'SELECT * FROM orders ORDER BY created_at DESC';
    if (storeFilter === 'noon') {
        query = "SELECT * FROM orders WHERE (cart_items LIKE '%noon%' OR customer_name LIKE '%noon%') ORDER BY created_at DESC";
    } else if (storeFilter === 'store1') {
        query = "SELECT * FROM orders WHERE (cart_items NOT LIKE '%noon%' AND (customer_name NOT LIKE '%noon%' OR customer_name IS NULL)) ORDER BY created_at DESC";
    }

    db.all(query, (err, rows) => {
        if (err) {
            return res.status(500).send('Database error');
        }

        const statusGroups = {
            pending: rows.filter(o => o.order_status === 'pending'),
            confirmed: rows.filter(o => o.order_status === 'confirmed'),
            completed: rows.filter(o => o.order_status === 'completed'),
            cancelled: rows.filter(o => o.order_status === 'cancelled'),
        };

        const totalRevenue = rows.reduce((sum, o) => sum + (o.final_amount || o.total_amount), 0);

        const statusColors = {
            pending: { bg: '#FFF3E0', border: '#FF9800', text: '#E65100', badge: '#FF9800', icon: '#FF9800' },
            confirmed: { bg: '#E8EAF6', border: '#3F51B5', text: '#283593', badge: '#3F51B5', icon: '#3F51B5' },
            completed: { bg: '#E8F5E9', border: '#4CAF50', text: '#1B5E20', badge: '#4CAF50', icon: '#4CAF50' },
            cancelled: { bg: '#FFEBEE', border: '#F44336', text: '#B71C1C', badge: '#F44336', icon: '#F44336' },
        };

        const statusLabels = {
            pending: 'قيد الانتظار',
            confirmed: 'مؤكد',
            completed: 'مكتمل',
            cancelled: 'ملغي',
        };

        const paymentMethodLabels = {
            'mobicash': 'موبي كاش',
            'yemenwallet': 'محفظة جيب',
            'bank_babalmandab': 'حوالة بنكية - باب المندب',
            'khameri': 'الكريمي',
            'online': 'دفع إلكتروني',
        };

        function renderOrderCard(order) {
            const items = JSON.parse(order.cart_items || '[]');
            const color = statusColors[order.order_status] || statusColors.pending;
            const label = statusLabels[order.order_status] || order.order_status;
            const paymentMethod = paymentMethodLabels[order.payment_method] || order.payment_method;
            const finalAmount = order.final_amount || (order.total_amount - order.discount_amount - (order.gift_card_amount || 0) + parseFloat(order.shipping_fee || 0));

            return `
            <div class="order-card" data-status="${order.order_status}" data-search="${(order.order_number || '').toLowerCase()} ${(order.customer_name || '').toLowerCase()} ${(order.customer_phone || '')}">
                <div class="order-card-header" style="background: ${color.bg}; border-bottom: 2px solid ${color.border};">
                    <div class="order-card-header-top">
                        <span class="order-number">${order.order_number}</span>
                        <span class="order-status-badge" style="background: ${color.badge}; color: white;">${label}</span>
                        <span class="order-date" style="color: ${color.text};">
                            <i class="far fa-calendar-alt"></i> ${new Date(order.order_date).toLocaleString('ar-SA')}
                        </span>
                    </div>
                </div>

                <div class="order-card-body">
                    <div class="order-card-sections">

                        <div class="order-section customer-section">
                            <div class="section-title" style="color: ${color.badge};">
                                <i class="fas fa-user"></i> معلومات العميل
                            </div>
                            <div class="section-content">
                                <div class="info-row">
                                    <span class="info-label">الاسم:</span>
                                    <span class="info-value">${order.customer_name || 'غير محدد'}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">الهاتف:</span>
                                    <span class="info-value">${order.customer_phone || 'غير محدد'}</span>
                                </div>
                                ${order.customer_secondary_phone ? `
                                <div class="info-row">
                                    <span class="info-label">هاتف إضافي:</span>
                                    <span class="info-value">${order.customer_secondary_phone}</span>
                                </div>` : ''}
                                <div class="info-row">
                                    <span class="info-label">البريد:</span>
                                    <span class="info-value">${order.customer_email || 'غير محدد'}</span>
                                </div>
                            </div>
                        </div>

                        <div class="order-section payment-section">
                            <div class="section-title" style="color: ${color.badge};">
                                <i class="fas fa-credit-card"></i> الدفع والشحن
                            </div>
                            <div class="section-content">
                                <div class="info-row">
                                    <span class="info-label">طريقة الدفع:</span>
                                    <span class="info-value payment-method">${paymentMethod}</span>
                                </div>
                                ${order.transfer_name ? `
                                <div class="info-row">
                                    <span class="info-label">اسم المرسل:</span>
                                    <span class="info-value">${order.transfer_name}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">رقم الحوالة:</span>
                                    <span class="info-value">${order.transfer_number}</span>
                                </div>` : ''}
                                ${order.address_city || order.address_area ? `
                                <div class="info-row">
                                    <span class="info-label">الشحن إلى:</span>
                                    <span class="info-value">${[order.address_city, order.address_area, order.address_detail].filter(Boolean).join(' - ')}</span>
                                </div>` : ''}
                            </div>
                        </div>

                        <div class="order-section pricing-section">
                            <div class="section-title" style="color: ${color.badge};">
                                <i class="fas fa-calculator"></i> المبالغ
                            </div>
                            <div class="section-content">
                                <div class="info-row">
                                    <span class="info-label">المجموع الأصلي:</span>
                                    <span class="info-value">${order.total_amount} ر.س</span>
                                </div>
                                ${order.discount_amount > 0 ? `
                                <div class="info-row">
                                    <span class="info-label">الخصم (${order.coupon_code || ''}):</span>
                                    <span class="info-value" style="color: #E65100;">- ${order.discount_amount} ر.س</span>
                                </div>` : ''}
                                ${order.gift_card_amount > 0 ? `
                                <div class="info-row">
                                    <span class="info-label">القسيمة:</span>
                                    <span class="info-value" style="color: #6A1B9A;">- ${order.gift_card_amount} ر.س</span>
                                </div>` : ''}
                                <div class="info-row">
                                    <span class="info-label">رسوم التوصيل:</span>
                                    <span class="info-value">${order.shipping_fee || 0} ر.س</span>
                                </div>
                                <div class="info-row total-row" style="border-top: 2px solid ${color.border}; padding-top: 8px; margin-top: 4px;">
                                    <span class="info-label" style="font-weight: 800;">المجموع النهائي:</span>
                                    <span class="info-value" style="font-weight: 800; font-size: 1.1rem; color: ${color.badge};">${finalAmount.toFixed(2)} ر.س</span>
                                </div>
                            </div>
                        </div>

                        <div class="order-section status-section">
                            <div class="section-title" style="color: ${color.badge};">
                                <i class="fas fa-exchange-alt"></i> تغيير الحالة
                            </div>
                            <div class="section-content">
                                <select onchange="updateOrderStatus(${order.id}, this.value)" class="status-select" style="border-color: ${color.border};">
                                    <option value="pending" ${order.order_status === 'pending' ? 'selected' : ''}>قيد الانتظار</option>
                                    <option value="confirmed" ${order.order_status === 'confirmed' ? 'selected' : ''}>مؤكد</option>
                                    <option value="completed" ${order.order_status === 'completed' ? 'selected' : ''}>مكتمل</option>
                                    <option value="cancelled" ${order.order_status === 'cancelled' ? 'selected' : ''}>ملغي</option>
                                </select>
                                <span class="item-count"><i class="fas fa-box"></i> ${items.length} عنصر</span>
                            </div>
                        </div>

                    </div>

                    <div class="order-items-section">
                        <button class="toggle-items-btn" onclick="toggleItems(${order.id})" style="color: ${color.badge}; border-color: ${color.border};">
                            <i class="fas fa-chevron-down" id="toggle-icon-${order.id}"></i>
                            <span>عرض العناصر (${items.length})</span>
                        </button>
                        <div class="order-items-grid" id="items-${order.id}" style="display: none;">
                            ${items.map(item => `
                            <div class="item-mini-card" style="border-right-color: ${color.border};">
                                <div class="item-mini-info">
                                    <strong class="item-name">${item.name || 'منتج'}</strong>
                                    <span class="item-id">#${item.id || item.product_id || '?'}</span>
                                    ${item.selectedSize && item.selectedSize !== 'غير محدد' ? `<span class="item-attr"><i class="fas fa-ruler"></i> ${item.selectedSize}</span>` : ''}
                                    ${item.colors && item.colors[0] && item.colors[0] !== 'غير محدد' ? `<span class="item-attr"><i class="fas fa-palette"></i> ${item.colors[0]}</span>` : ''}
                                </div>
                                <div class="item-mini-pricing">
                                    <span class="item-qty">${item.quantity || 1} × ${item.price} ر.س</span>
                                    <span class="item-total">= ${(item.price * (item.quantity || 1)).toFixed(2)} ر.س</span>
                                </div>
                                <div class="item-mini-links">
                                    ${item.productUrl ? `<a href="${item.productUrl}" target="_blank" class="item-link"><i class="fas fa-external-link-alt"></i> رابط المنتج</a>` : ''}
                                    ${item.image ? `<img src="${item.image}" class="item-thumb" alt="">` : ''}
                                </div>
                            </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>`;
        }

        function renderStatusTab(status, label, count, icon, color) {
            const active = statusFilter === status ? 'active' : '';
            const href = status === 'all' ? `/admin/orders${storeFilter !== 'all' ? '?store=' + storeFilter : ''}` : `/admin/orders?status=${status}${storeFilter !== 'all' ? '&store=' + storeFilter : ''}`;
            return `<a href="${href}" class="status-tab ${active}" data-status="${status}" style="${active ? '--tab-color: ' + color + ';' : ''}">
                <i class="${icon}"></i>
                <span>${label}</span>
                <span class="tab-count">${count}</span>
            </a>`;
        }

        function renderStoreTab(store, label, icon, color) {
            const active = storeFilter === store ? 'active' : '';
            const href = store === 'all' ? `/admin/orders${statusFilter !== 'all' ? '?status=' + statusFilter : ''}` : `/admin/orders?store=${store}${statusFilter !== 'all' ? '&status=' + statusFilter : ''}`;
            const isNoon = store === 'noon';
            return `<a href="${href}" class="store-tab ${active} ${isNoon ? 'tab-noon' : ''}" style="${active ? '--tab-color: ' + color + '; background: ' + color + '; color: white; border-color: ' + color + ';' : ''}">
                <i class="${icon}"></i>
                <span>${label}</span>
            </a>`;
        }

        const colorMap = {
            all: '#06b6d4',
            pending: '#FF9800',
            confirmed: '#3F51B5',
            completed: '#4CAF50',
            cancelled: '#F44336',
        };

        let html = `
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>إدارة الطلبات - نظام المتجر</title>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="/admin-style.css">
    <style>
        :root {
            --orders-accent: ${colorMap[statusFilter] || '#06b6d4'};
        }

        .page-hero-orders {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: white;
            padding: 36px 40px;
            border-radius: var(--radius-lg);
            margin-bottom: 28px;
            position: relative;
            overflow: hidden;
        }
        .page-hero-orders::after {
            content: '';
            position: absolute;
            top: -50%; right: -20%;
            width: 400px; height: 400px;
            background: radial-gradient(circle, var(--orders-accent) 0%, transparent 60%);
            opacity: 0.15;
            border-radius: 50%;
            pointer-events: none;
        }
        .page-hero-orders h1 {
            margin: 0;
            font-size: 1.6rem;
            font-weight: 700;
            position: relative;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .page-hero-orders h1 i { color: var(--orders-accent); }
        .page-hero-orders p { margin: 6px 0 0; opacity: 0.6; font-size: 0.9rem; position: relative; }

        .status-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 24px;
            flex-wrap: wrap;
        }
        .status-tab {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.85rem;
            font-family: var(--font);
            background: var(--card);
            color: var(--text-secondary);
            border: 1.5px solid var(--border);
            transition: all 0.2s ease;
            cursor: pointer;
        }
        .status-tab:hover {
            border-color: var(--orders-accent);
            color: var(--orders-accent);
            transform: translateY(-1px);
            box-shadow: var(--shadow-sm);
        }
        .status-tab.active {
            background: var(--orders-accent);
            color: white;
            border-color: var(--orders-accent);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .status-tab .tab-count {
            background: rgba(0,0,0,0.08);
            padding: 2px 10px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 700;
        }
        .status-tab.active .tab-count {
            background: rgba(255,255,255,0.2);
        }
        .status-tab i { font-size: 0.9rem; }

        .store-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .store-tab {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 18px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.82rem;
            font-family: var(--font);
            background: var(--card);
            color: var(--text-secondary);
            border: 1.5px solid var(--border);
            transition: all 0.2s ease;
            cursor: pointer;
        }
        .store-tab:hover {
            transform: translateY(-1px);
            box-shadow: var(--shadow-sm);
        }
        .store-tab.tab-noon { color: #B8860B; border-color: #F4C430; }
        .store-tab.tab-noon.active { background: #F4C430; color: #5D4037; border-color: #F4C430; }

        .stats-grid-orders {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 14px;
            margin-bottom: 24px;
        }
        .stat-mini-card {
            background: var(--card);
            border-radius: 10px;
            padding: 16px;
            text-align: center;
            box-shadow: var(--shadow-sm);
            border: 1px solid var(--card-border);
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        }
        .stat-mini-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg);
        }
        .stat-mini-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 3px;
        }
        .stat-mini-card .stat-num {
            font-size: 1.5rem;
            font-weight: 800;
            line-height: 1.2;
        }
        .stat-mini-card .stat-lbl {
            font-size: 0.75rem;
            color: var(--text-muted);
            font-weight: 500;
            margin-top: 2px;
        }

        .orders-grid {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .order-card {
            background: var(--card);
            border-radius: 14px;
            box-shadow: var(--shadow-sm);
            border: 1px solid var(--card-border);
            overflow: hidden;
            transition: all 0.25s ease;
        }
        .order-card:hover {
            box-shadow: var(--shadow-lg);
            transform: translateY(-2px);
        }

        .order-card-header {
            padding: 16px 20px 14px;
        }
        .order-card-header-top {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }
        .order-card-header-top .order-number {
            background: transparent;
            color: inherit;
            padding: 0;
            font-weight: 700;
            font-size: 0.85rem;
        }
        .order-status-badge {
            padding: 4px 14px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 700;
        }
        .order-date {
            font-size: 0.78rem;
            font-weight: 500;
            margin-right: auto;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .order-card-body {
            padding: 16px 20px 20px;
        }

        .order-card-sections {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 14px;
        }
        @media (max-width: 900px) {
            .order-card-sections { grid-template-columns: 1fr; }
        }

        .order-section {
            background: #f8fafc;
            border-radius: 10px;
            padding: 14px;
        }
        .section-title {
            font-weight: 700;
            font-size: 0.78rem;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .section-title i { font-size: 0.8rem; }

        .section-content {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.82rem;
            padding: 2px 0;
        }
        .info-label {
            color: var(--text-muted);
            font-weight: 500;
        }
        .info-value {
            font-weight: 600;
            color: var(--text);
            text-align: left;
        }
        .payment-method {
            background: var(--accent-glow);
            color: var(--accent-dark);
            padding: 2px 10px;
            border-radius: 4px;
            font-size: 0.78rem;
        }
        .item-count {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 8px;
        }

        .status-select {
            width: 100%;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1.5px solid var(--border);
            font-family: var(--font);
            font-size: 0.82rem;
            font-weight: 600;
            background: white;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .status-select:focus {
            outline: none;
            box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
        }

        .order-items-section {
            margin-top: 4px;
        }
        .toggle-items-btn {
            width: 100%;
            padding: 10px;
            background: #f8fafc;
            border: 1.5px dashed var(--border);
            border-radius: 10px;
            font-family: var(--font);
            font-size: 0.82rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
        }
        .toggle-items-btn:hover {
            background: #f1f5f9;
            border-style: solid;
        }
        .toggle-items-btn i {
            transition: transform 0.3s ease;
        }
        .toggle-items-btn.active i {
            transform: rotate(180deg);
        }

        .order-items-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 10px;
            margin-top: 12px;
        }
        .item-mini-card {
            display: flex;
            align-items: center;
            gap: 12px;
            background: #f8fafc;
            padding: 10px 14px;
            border-radius: 10px;
            border-right: 3px solid var(--accent);
        }
        .item-mini-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .item-name { font-size: 0.82rem; }
        .item-id { font-size: 0.7rem; color: var(--text-muted); }
        .item-attr { font-size: 0.72rem; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 3px; }
        .item-mini-pricing {
            text-align: left;
            white-space: nowrap;
        }
        .item-qty { font-size: 0.75rem; color: var(--text-muted); display: block; }
        .item-total { font-size: 0.85rem; font-weight: 700; color: var(--text); }
        .item-mini-links {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }
        .item-link {
            color: var(--accent);
            font-size: 0.85rem;
        }
        .item-thumb {
            width: 36px; height: 36px;
            border-radius: 6px;
            object-fit: cover;
        }

        .filters-bar {
            background: var(--card);
            padding: 18px 20px;
            border-radius: var(--radius);
            box-shadow: var(--shadow-sm);
            margin-bottom: 20px;
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            align-items: center;
            border: 1px solid var(--card-border);
        }
        .filters-bar .form-group { margin: 0; flex: 1; min-width: 160px; }
        .filters-bar .form-control { padding: 9px 14px; font-size: 0.82rem; }

        .export-bar {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 24px;
            padding: 20px;
            background: linear-gradient(135deg, #f0fdf4, #f8fafc);
            border-radius: var(--radius);
            border: 1px solid #bbf7d0;
            border-right: 4px solid #4CAF50;
        }
        .export-bar .btn { font-size: 0.8rem; }

        .orders-empty {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-muted);
        }
        .orders-empty .empty-icon {
            font-size: 3rem;
            margin-bottom: 12px;
            opacity: 0.3;
        }
        .orders-empty h3 { color: var(--text); font-weight: 600; margin-bottom: 6px; }
        .orders-empty p { font-size: 0.85rem; color: var(--text-muted); }

        @media (max-width: 768px) {
            .order-card-header-top { flex-direction: column; align-items: flex-start; }
            .order-date { margin-right: 0; }
            .stats-grid-orders { grid-template-columns: repeat(2, 1fr); }
            .page-hero-orders { padding: 24px 20px; }
            .page-hero-orders h1 { font-size: 1.3rem; }
        }
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
                <a href="/admin/orders" class="active"><i class="fas fa-shopping-cart"></i> <span>الطلبات</span></a>
                <a href="/admin/products"><i class="fas fa-box"></i> <span>المنتجات</span></a>
                <a href="/admin/coupons"><i class="fas fa-tags"></i> <span>الكوبونات</span></a>
                <a href="/admin/gift-cards"><i class="fas fa-gift"></i> <span>القسائم</span></a>
                <a href="/admin/notifications"><i class="fas fa-bell"></i> <span>الإشعارات</span></a>
                <a href="/admin/confirmed-orders"><i class="fas fa-check-circle"></i> <span>الطلبات المؤكدة</span></a>
                <div class="nav-section">النظام</div>
                <a href="/admin/settings"><i class="fas fa-cog"></i> <span>الإعدادات</span></a>
                <a href="/admin/users"><i class="fas fa-users"></i> <span>العملاء</span></a>
                <a href="/logout"><i class="fas fa-sign-out-alt"></i> <span>تسجيل الخروج</span></a>
            </nav>
        </aside>
        <main class="main-content">
            <div class="top-bar">
                <div class="page-title"><i class="fas fa-shopping-cart"></i> إدارة الطلبات</div>
                <div class="user-info">
                    <span>مرحباً، المدير</span>
                </div>
            </div>
            <div class="content">

                <div class="page-hero-orders">
                    <h1><i class="fas fa-shopping-cart"></i> إدارة الطلبات</h1>
                    <p>عرض وإدارة جميع الطلبات المرسلة من التطبيق</p>
                </div>

                <div class="stats-grid-orders">
                    <div class="stat-mini-card" style="border-right: 3px solid #06b6d4;">
                        <div class="stat-num" style="color: #06b6d4;">${rows.length}</div>
                        <div class="stat-lbl">إجمالي الطلبات</div>
                    </div>
                    <div class="stat-mini-card" style="border-right: 3px solid #FF9800;">
                        <div class="stat-num" style="color: #FF9800;">${statusGroups.pending.length}</div>
                        <div class="stat-lbl">قيد الانتظار</div>
                    </div>
                    <div class="stat-mini-card" style="border-right: 3px solid #3F51B5;">
                        <div class="stat-num" style="color: #3F51B5;">${statusGroups.confirmed.length}</div>
                        <div class="stat-lbl">مؤكد</div>
                    </div>
                    <div class="stat-mini-card" style="border-right: 3px solid #4CAF50;">
                        <div class="stat-num" style="color: #4CAF50;">${statusGroups.completed.length}</div>
                        <div class="stat-lbl">مكتمل</div>
                    </div>
                    <div class="stat-mini-card" style="border-right: 3px solid #F44336;">
                        <div class="stat-num" style="color: #F44336;">${statusGroups.cancelled.length}</div>
                        <div class="stat-lbl">ملغي</div>
                    </div>
                    <div class="stat-mini-card" style="border-right: 3px solid #8B5CF6;">
                        <div class="stat-num" style="color: #8B5CF6;">${totalRevenue.toFixed(2)}</div>
                        <div class="stat-lbl">إجمالي المبيعات (ر.س)</div>
                    </div>
                </div>

                <div class="store-tabs">
                    ${renderStoreTab('all', 'جميع المتاجر', 'fas fa-store-alt', '#06b6d4')}
                    ${renderStoreTab('store1', 'المتجر الأول', 'fas fa-store', '#1976D2')}
                    ${renderStoreTab('noon', 'طلبات noon', 'fas fa-shopping-bag', '#F4C430')}
                </div>

                <div class="export-section" style="background: #e8f5e8; border-right: 4px solid #4CAF50;">
                    <h3 style="margin: 0 0 20px 0; color: #2e7d32;"><i class="fas fa-check-circle"></i> الطلبات المكتملة</h3>
                    <div id="completed-orders" class="orders-container">
                        ${rows.filter(o => o.order_status === 'completed').map(order => {
                const items = JSON.parse(order.cart_items);
                return `
                            <div class="order-card" style="border-right-color: #4CAF50;">
                                <div class="order-header">
                                    <div>
                                        <span class="order-number">${order.order_number}</span>
                                        <span class="order-status status-completed" style="margin-right: 10px;">مكتمل</span>
                                    </div>
                                    <div style="color: #666; font-size: 14px;">
                                        ${new Date(order.order_date).toLocaleString('ar-SA')}
                                    </div>
                                </div>
                                <div class="customer-info">
                                    <strong>معلومات العميل:</strong><br>
                                    الاسم: ${order.customer_name || 'غير محدد'} |
                                    الهاتف: ${order.customer_phone || 'غير محدد'}
                                </div>
                                <div class="order-details">
                                    <div class="detail-item">
                                        <strong>المجموع النهائي:</strong> ${(order.final_amount || (order.total_amount - order.discount_amount - order.gift_card_amount + parseFloat(order.shipping_fee || 0))).toFixed(2)} ر.س
                                    </div>
                                    <div class="detail-item">
                                        <strong>عدد العناصر:</strong> ${items.length}
                                    </div>
                                </div>
                            </div>
                            `;
            }).join('')}
                    </div>
                    ${rows.filter(o => o.order_status === 'completed').length === 0 ?
                    '<div style="text-align: center; padding: 20px; color: #666;">لا توجد طلبات مكتملة حالياً</div>' : ''}
                </div>

                <div class="export-section">
                    <h3 style="margin: 0 0 20px 0; color: #333;"><i class="fas fa-chart-line"></i> تصدير تقارير المبيعات</h3>

                    <form id="exportForm" class="export-form">
                        <div class="form-group">
                            <label class="form-label">من تاريخ</label>
                            <input type="date" name="start_date" class="form-control">
                        </div>
                        <div class="form-group">
                            <label class="form-label">إلى تاريخ</label>
                            <input type="date" name="end_date" class="form-control">
                        </div>
                        <div class="form-group">
                            <label class="form-label">اسم العميل</label>
                            <input type="text" name="customer_name" class="form-control" placeholder="بحث بالاسم...">
                        </div>
                        <div class="form-group">
                            <label class="form-label">حالة الطلب</label>
                            <select name="order_status" class="form-control">
                                <option value="all">جميع الحالات</option>
                                <option value="pending">قيد الانتظار</option>
                                <option value="confirmed">مؤكد</option>
                                <option value="completed">مكتمل</option>
                                <option value="cancelled">ملغي</option>
                            </select>
                        </div>
                    </form>

                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="exportSales()" class="btn btn-success"><i class="fas fa-file-excel"></i> تصدير مفصل (Excel)</button>
                        <button onclick="exportAllSales()" class="btn btn-info"><i class="fas fa-rocket"></i> تصدير سريع (كل البيانات)</button>
                        <button onclick="resetExportForm()" class="btn" style="background: #6c757d; color: white;"><i class="fas fa-undo"></i> مسح الفلاتر</button>
                    </div>

                    <div style="margin-top: 15px; padding: 15px; background: #e8f5e8; border-radius: 8px; border-right: 4px solid #4CAF50;">
                        <strong><i class="fas fa-lightbulb"></i> ملاحظة:</strong>
                        <ul style="margin: 10px 0 0 20px; color: #555;">
                            <li>التصدير المفصل يحتوي على 3 أوراق: ملخص، تفاصيل الطلبات، تحليل المنتجات</li>
                            <li>التصدير السريع يحتوي على البيانات الأساسية فقط</li>
                            <li>يمكنك استخدام الفلاتر لتصدير بيانات محددة</li>
                            <li>التصدير الآن يشمل روابط المنتجات</li>
                        </ul>
                    </div>
                </div>

                <div class="status-tabs">
                    ${renderStatusTab('all', 'الكل', rows.length, 'fas fa-list', '#06b6d4')}
                    ${renderStatusTab('pending', 'قيد الانتظار', statusGroups.pending.length, 'fas fa-hourglass-half', '#FF9800')}
                    ${renderStatusTab('confirmed', 'مؤكد', statusGroups.confirmed.length, 'fas fa-check-circle', '#3F51B5')}
                    ${renderStatusTab('completed', 'مكتمل', statusGroups.completed.length, 'fas fa-check-double', '#4CAF50')}
                    ${renderStatusTab('cancelled', 'ملغي', statusGroups.cancelled.length, 'fas fa-times-circle', '#F44336')}
                </div>

                <div class="filters-bar">
                    <div class="form-group">
                        <input type="text" id="orderSearchInput" class="form-control" placeholder="بحث عن طلب (رقم، اسم، هاتف)..." oninput="filterOrders()">
                    </div>
                    <div class="form-group" style="flex: 0 0 160px;">
                        <select id="orderPerPage" class="form-control" onchange="filterOrders()">
                            <option value="10">10 لكل صفحة</option>
                            <option value="20">20 لكل صفحة</option>
                            <option value="50">50 لكل صفحة</option>
                            <option value="100">100 لكل صفحة</option>
                        </select>
                    </div>
                    <span style="font-size: 0.78rem; color: var(--text-muted);" id="orderCountDisplay"></span>
                </div>

                <div class="orders-grid" id="ordersContainer">
                    ${(() => {
                        let ordersToRender = rows;
                        return ordersToRender.map(order => renderOrderCard(order)).join('');
                    })()}
                </div>

                <div class="pagination" id="orderPagination"></div>

            </div>
        </main>
    </div>

    <script>
        let orderCurrentPage = 1;

        function filterOrders() {
            const searchVal = document.getElementById('orderSearchInput').value.toLowerCase().trim();
            const cards = document.querySelectorAll('.order-card');
            let visibleCount = 0;
            cards.forEach(card => {
                const search = card.getAttribute('data-search') || '';
                const match = !searchVal || search.includes(searchVal);
                card.style.display = match ? '' : 'none';
                if (match) visibleCount++;
            });
            document.getElementById('orderCountDisplay').textContent = visibleCount + ' طلب';
            applyOrderPagination(Array.from(cards).filter(c => c.style.display !== 'none'));
        }

        function applyOrderPagination(visibleCards) {
            const perPage = parseInt(document.getElementById('orderPerPage').value);
            const totalPages = Math.ceil(visibleCards.length / perPage) || 1;
            if (orderCurrentPage > totalPages) orderCurrentPage = totalPages;
            const start = (orderCurrentPage - 1) * perPage;
            const end = start + perPage;
            visibleCards.forEach((card, i) => {
                card.style.display = (i >= start && i < end) ? '' : 'none';
            });
            renderOrderPagination(totalPages, visibleCards.length);
        }

        function renderOrderPagination(totalPages, totalItems) {
            const container = document.getElementById('orderPagination');
            if (totalPages <= 1) { container.innerHTML = ''; return; }
            let html = '<span style="font-size:0.78rem;color:var(--text-muted);margin-left:12px;">' + totalItems + ' طلب</span>';
            html += '<button class="page-btn" onclick="goOrderPage(' + (orderCurrentPage - 1) + ')" ' + (orderCurrentPage <= 1 ? 'disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
            for (let i = 1; i <= totalPages; i++) {
                html += '<button class="page-btn' + (i === orderCurrentPage ? ' active' : '') + '" onclick="goOrderPage(' + i + ')">' + i + '</button>';
            }
            html += '<button class="page-btn" onclick="goOrderPage(' + (orderCurrentPage + 1) + ')" ' + (orderCurrentPage >= totalPages ? 'disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
            container.innerHTML = html;
        }

        function goOrderPage(page) {
            orderCurrentPage = page;
            filterOrders();
        }

        function toggleItems(orderId) {
            const grid = document.getElementById('items-' + orderId);
            const icon = document.getElementById('toggle-icon-' + orderId);
            const btn = icon.closest('.toggle-items-btn');
            if (grid.style.display === 'none') {
                grid.style.display = 'grid';
                icon.style.transform = 'rotate(180deg)';
                if (btn) btn.classList.add('active');
            } else {
                grid.style.display = 'none';
                icon.style.transform = '';
                if (btn) btn.classList.remove('active');
            }
        }

        function updateOrderStatus(orderId, newStatus) {
            fetch('/api/orders/' + orderId + '/status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
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

        function exportSales() {
            const formData = new FormData(document.getElementById('exportForm'));
            const params = new URLSearchParams();
            for (let [key, value] of formData.entries()) {
                if (value) {
                    params.append(key, value);
                }
            }
            window.open('/api/export-sales?' + params.toString(), '_blank');
        }

        function exportAllSales() {
            window.open('/api/export-all-sales', '_blank');
        }

        function resetExportForm() {
            document.getElementById('exportForm').reset();
        }

        filterOrders();
    </script>
</body>
</html>`;

        res.send(html);
    });
});
}

module.exports = { setupOrdersPage };
