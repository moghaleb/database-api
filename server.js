const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// SQLite database (في الذاكرة - أسرع وأبسط)
const db = new sqlite3.Database(':memory:');

// تهيئة الجداول عند بدء التشغيل
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS test_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating table:', err);
    } else {
      console.log('✅ Database table created successfully');
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
      'GET /api/all-data - عرض جميع البيانات'
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
    timestamp: new Date().toISOString()
  });
});

// اختبار قاعدة البيانات
app.get('/api/db-test', (req, res) => {
  db.get('SELECT 1 as test_value, datetime("now") as server_time', (err, row) => {
    if (err) {
      console.error('Database test error:', err);
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
      database: 'SQLite - سريعة وموثوقة'
    });
  });
});

// حفظ بيانات الاختبار
app.post('/api/save-data', (req, res) => {
  const { name, email, phone, message } = req.body;

  console.log('Received data:', { name, email, phone, message });

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
        console.error('Save data error:', err);
        return res.status(500).json({
          status: 'error',
          message: 'فشل في حفظ البيانات: ' + err.message
        });
      }

      console.log('Data saved with ID:', this.lastID);
      
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
        timestamp: new Date().toISOString()
      });
    }
  );
});

// عرض جميع البيانات المحفوظة
app.get('/api/all-data', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Get all data error:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    res.json({
      status: 'success',
      users: rows,
      count: rows.length,
      message: `تم العثور على ${rows.length} سجل`
    });
  });
});

// مسح جميع البيانات (للتجربة)
app.delete('/api/clear-data', (req, res) => {
  db.run('DELETE FROM test_users', function(err) {
    if (err) {
      console.error('Clear data error:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message
      });
    }

    res.json({
      status: 'success',
      message: `✅ تم مسح ${this.changes} سجل`,
      deleted_count: this.changes
    });
  });
});

// معالجة الأخطاء غير المتوقعة
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    status: 'error',
    message: 'حدث خطأ غير متوقع في الخادم'
  });
});

// بدء الخادم
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
  console.log(`🔗 رابط التطبيق: https://database-api-kvxr.onrender.com`);
  console.log(`📊 قاعدة البيانات: SQLite (في الذاكرة)`);
  console.log(`✅ جاهز لاستقبال طلبات Flutter`);
});