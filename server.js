const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: '🚀 Node.js API is running on Render!',
    endpoints: [
      'GET /api/test - Test connection',
      'GET /api/db-test - Test database',
      'POST /api/save-data - Save data'
    ],
    timestamp: new Date().toISOString(),
    server: 'Render.com + Node.js + MySQL'
  });
});

// Test API connection
app.get('/api/test', (req, res) => {
  res.json({
    status: 'success',
    message: '✅ Node.js API is working perfectly!',
    server: 'Render.com',
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    timestamp: new Date().toISOString()
  });
});

// Test database connection
app.get('/api/db-test', async (req, res) => {
  try {
    const connection = await mysql.createConnection({
      host: 'sql100.infinityfree.com',
      user: 'if0_40105600',
      password: '51cQxMoRBkFwA',
      database: 'if0_40105600_db',
      connectTimeout: 60000,
      timeout: 60000
    });

    const [rows] = await connection.execute('SELECT 1 as test_value, NOW() as server_time');
    
    res.json({
      status: 'success',
      message: '✅ Database connection successful!',
      database: 'if0_40105600_db',
      test_value: rows[0].test_value,
      server_time: rows[0].server_time,
      connection: 'Render Node.js → InfinityFree MySQL'
    });

    await connection.end();
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      code: error.code
    });
  }
});

// Save data to database
app.post('/api/save-data', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // Validation
    if (!name || !email) {
      return res.status(400).json({
        status: 'error',
        message: 'Name and email are required'
      });
    }

    const connection = await mysql.createConnection({
      host: 'sql100.infinityfree.com',
      user: 'if0_40105600',
      password: '51cQxMoRBkFwA',
      database: 'if0_40105600_db',
      connectTimeout: 60000,
      timeout: 60000
    });

    // Create table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS app_users (
        id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert data
    const [result] = await connection.execute(
      'INSERT INTO app_users (name, email, phone, message) VALUES (?, ?, ?, ?)',
      [name, email, phone, message]
    );

    res.json({
      status: 'success',
      message: '✅ Data saved successfully!',
      insert_id: result.insertId,
      data: { name, email, phone, message },
      server: 'Render Node.js + InfinityFree MySQL',
      timestamp: new Date().toISOString()
    });

    await connection.end();
  } catch (error) {
    console.error('Save data error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      code: error.code
    });
  }
});

// Get all users (for testing)
app.get('/api/users', async (req, res) => {
  try {
    const connection = await mysql.createConnection({
      host: 'sql100.infinityfree.com',
      user: 'if0_40105600',
      password: '51cQxMoRBkFwA',
      database: 'if0_40105600_db'
    });

    const [rows] = await connection.execute('SELECT * FROM app_users ORDER BY created_at DESC LIMIT 10');
    
    res.json({
      status: 'success',
      users: rows,
      count: rows.length
    });

    await connection.end();
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://0.0.0.0:${PORT}`);
});