
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
require('dotenv').config();

// الحصول على نوع قاعدة البيانات من متغيرات البيئة
const DB_TYPE = process.env.DB_TYPE || 'sqlite';

/**
 * إنشاء اتصال بقاعدة البيانات بناءً على النوع المحدد
 * @returns {Promise<Object>} وعد يحتوي على كائن قاعدة البيانات
 */
async function createConnection() {
  if (DB_TYPE === 'mysql') {
    // إنشاء اتصال بقاعدة بيانات MySQL
    try {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'coupon_db',
        charset: 'utf8mb4'
      });

      console.log('✅ تم الاتصال بنجاح بقاعدة بيانات MySQL');
      return connection;
    } catch (error) {
      console.error('❌ خطأ في الاتصال بقاعدة بيانات MySQL:', error);
      throw error;
    }
  } else {
    // إنشاء اتصال بقاعدة بيانات SQLite (الافتراضي)
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(':memory:', (err) => {
        if (err) {
          console.error('❌ خطأ في الاتصال بقاعدة بيانات SQLite:', err);
          reject(err);
        } else {
          console.log('✅ تم الاتصال بنجاح بقاعدة بيانات SQLite');
          resolve(db);
        }
      });
    });
  }
}

/**
 * تنفيذ استعلام على قاعدة البيانات
 * @param {Object} db - كائن قاعدة البيانات
 * @param {string} query - نص الاستعلام
 * @param {Array} params - معلمات الاستعلام
 * @returns {Promise} وعد يحتوي على نتيجة الاستعلام
 */
async function executeQuery(db, query, params = []) {
  if (DB_TYPE === 'mysql') {
    try {
      const [rows] = await db.execute(query, params);
      return rows;
    } catch (error) {
      console.error('❌ خطأ في تنفيذ استعلام MySQL:', error);
      throw error;
    }
  } else {
    return new Promise((resolve, reject) => {
      if (query.trim().toLowerCase().startsWith('select')) {
        db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      } else {
        db.run(query, params, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ 
              insertId: this.lastID, 
              affectedRows: this.changes 
            });
          }
        });
      }
    });
  }
}

/**
 * إغلاق اتصال قاعدة البيانات
 * @param {Object} db - كائن قاعدة البيانات
 * @returns {Promise} وعد يحتوي على نتيجة الإغلاق
 */
async function closeConnection(db) {
  if (DB_TYPE === 'mysql') {
    try {
      await db.end();
      console.log('✅ تم إغلاق اتصال MySQL بنجاح');
    } catch (error) {
      console.error('❌ خطأ في إغلاق اتصال MySQL:', error);
      throw error;
    }
  } else {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) {
          console.error('❌ خطأ في إغلاق اتصال SQLite:', err);
          reject(err);
        } else {
          console.log('✅ تم إغلاق اتصال SQLite بنجاح');
          resolve();
        }
      });
    });
  }
}

module.exports = {
  createConnection,
  executeQuery,
  closeConnection,
  DB_TYPE
};
