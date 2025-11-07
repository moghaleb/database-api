// ======== Database Configuration ========
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/var/www/redshe/database/redshe.db' 
  : './redshe.db';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
  } else {
    console.log('✅ تم الاتصال بقاعدة البيانات SQLite بنجاح');
  }
});