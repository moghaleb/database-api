db.run(`CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  description TEXT, -- وصف الكوبون
  discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed')),
  discount_value REAL NOT NULL CHECK(discount_value >= 0),
  min_order_amount REAL DEFAULT 0 CHECK(min_order_amount >= 0),
  max_discount_amount REAL CHECK(max_discount_amount >= 0),
  usage_limit INTEGER CHECK(usage_limit > 0),
  used_count INTEGER DEFAULT 0 CHECK(used_count >= 0),
  valid_from DATETIME,
  valid_until DATETIME,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- فهارس لتحسين الأداء
  CONSTRAINT chk_dates CHECK(valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
)`);

db.run('CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)');
db.run('CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, valid_until)');