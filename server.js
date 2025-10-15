
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
// صفحة الإدارة المتقدمة
app.get('/admin/advanced', (req, res) => {
  db.all('SELECT * FROM test_users ORDER BY created_at DESC', (err, rows) => {
    let html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>الإدارة المتقدمة - نظام الاختبار</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f0f2f5; }
            .container { max-width: 1400px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 15px; margin-bottom: 30px; text-align: center; }
            .controls { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: flex; gap: 10px; flex-wrap: wrap; }
            .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
            .btn-primary { background: #2196F3; color: white; }
            .btn-danger { background: #f44336; color: white; }
            .btn-success { background: #4CAF50; color: white; }
            .table-container { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px 15px; text-align: right; border-bottom: 1px solid #ddd; }
            th { background: #f8f9fa; font-weight: bold; color: #333; }
            tr:hover { background: #f5f5f5; }
            .badge { background: #2196F3; color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🛠️ لوحة التحكم - نظام الاختبار</h1>
                <p>إدارة وعرض جميع البيانات من تطبيق الجوال</p>
            </div>
            
            <div class="controls">
                <a href="/admin" class="btn btn-primary">📊 العرض البسيط</a>
                <a href="/api/all-data" class="btn btn-success">📋 JSON البيانات</a>
                <a href="/api/db-test" class="btn btn-primary">🧪 اختبار الاتصال</a>
                <button onclick="clearData()" class="btn btn-danger">🗑️ مسح جميع البيانات</button>
                <span style="margin-left: auto; color: #666;">عدد السجلات: <strong>${rows.length}</strong></span>
            </div>
            
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>الاسم</th>
                            <th>البريد الإلكتروني</th>
                            <th>الهاتف</th>
                            <th>الرسالة</th>
                            <th>تاريخ الإدخال</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (rows.length === 0) {
      html += `
                        <tr>
                            <td colspan="6" style="text-align: center; padding: 40px; color: #666;">
                                📭 لا توجد بيانات حتى الآن
                            </td>
                        </tr>
      `;
    } else {
      rows.forEach(user => {
        html += `
                        <tr>
                            <td><span class="badge">${user.id}</span></td>
                            <td><strong>${user.name || 'غير محدد'}</strong></td>
                            <td>${user.email || 'غير محدد'}</td>
                            <td>${user.phone || 'غير محدد'}</td>
                            <td>${user.message || 'لا توجد رسالة'}</td>
                            <td style="font-size: 12px; color: #666;">${user.created_at}</td>
                        </tr>
        `;
      });
    }

    html += `
                    </tbody>
                </table>
            </div>
        </div>

        <script>
            function clearData() {
                if (confirm('⚠️ هل أنت متأكد من مسح جميع البيانات؟ لا يمكن التراجع عن هذا الإجراء!')) {
                    fetch('/api/clear-data', { method: 'DELETE' })
                        .then(response => response.json())
                        .then(data => {
                            alert(data.message);
                            location.reload();
                        })
                        .catch(error => {
                            alert('❌ حدث خطأ: ' + error);
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
