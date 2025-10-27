-- إنشاء جدول المستخدمين للاختبار
CREATE TABLE IF NOT EXISTS test_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- إنشاء جدول الطلبات
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE,
  cart_items TEXT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  coupon_code VARCHAR(50),
  coupon_type VARCHAR(20),
  gift_card_number VARCHAR(50),
  gift_card_amount DECIMAL(10, 2) DEFAULT 0,
  gift_card_type VARCHAR(20),
  order_date DATETIME NOT NULL,
  order_status VARCHAR(50) DEFAULT 'pending',
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_email VARCHAR(255),
  payment_method VARCHAR(50) DEFAULT 'online',
  payment_status VARCHAR(50) DEFAULT 'pending',
  shipping_address TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_orders_status (order_status),
  INDEX idx_orders_date (order_date),
  INDEX idx_orders_coupon (coupon_code)
);

-- إنشاء جدول الكوبونات
CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  discount_type ENUM('percentage', 'fixed') NOT NULL,
  discount_value DECIMAL(10, 2) NOT NULL,
  min_order_amount DECIMAL(10, 2) DEFAULT 0,
  max_discount_amount DECIMAL(10, 2),
  usage_limit INT,
  used_count INT DEFAULT 0,
  valid_from DATETIME,
  valid_until DATETIME,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT chk_dates CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  INDEX idx_coupons_code (code),
  INDEX idx_coupons_active (is_active, valid_until)
);

-- إنشاء جدول إعدادات النظام
CREATE TABLE IF NOT EXISTS admin_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- إنشاء جدول استخدامات الكوبونات
CREATE TABLE IF NOT EXISTS coupon_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  coupon_id INT NOT NULL,
  order_id INT NOT NULL,
  user_email VARCHAR(255),
  discount_amount DECIMAL(10, 2) NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,

  INDEX idx_coupon_usage_coupon_id (coupon_id),
  INDEX idx_coupon_usage_order_id (order_id)
);

-- إنشاء جدول القسائم (الكروت الهدية)
CREATE TABLE IF NOT EXISTS vouchers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  issued_date DATETIME NOT NULL,
  expiry_date DATETIME,
  is_used BOOLEAN DEFAULT 0,
  used_by VARCHAR(255),
  used_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT chk_voucher_dates CHECK (expiry_date IS NULL OR issued_date IS NULL OR expiry_date > issued_date),
  INDEX idx_vouchers_code (code),
  INDEX idx_vouchers_used (is_used, expiry_date)
);

-- إضافة كوبونات افتراضية
INSERT IGNORE INTO coupons (code, description, discount_type, discount_value, min_order_amount, usage_limit, valid_from, valid_until)
VALUES
('WELCOME10', 'خصم 10% لأول طلب', 'percentage', 10.0, 50.0, 100, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY)),
('FIXED20', 'خصم ثابت 20 ريال', 'fixed', 20.0, 100.0, 50, NOW(), DATE_ADD(NOW(), INTERVAL 15 DAY)),
('SPECIAL30', 'خصم 30% للطلبات فوق 200 ريال', 'percentage', 30.0, 200.0, 30, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY));

-- إضافة إعدادات افتراضية
INSERT IGNORE INTO admin_settings (setting_key, setting_value)
VALUES
('theme', 'light'),
('items_per_page', '10'),
('auto_refresh', 'true'),
('refresh_interval', '30');
