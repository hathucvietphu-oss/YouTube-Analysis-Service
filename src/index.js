const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const analyzeRoutes = require('./api/analyze');
const resultRoutes = require('./api/result');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware bảo mật và parse body
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Phục vụ file tĩnh
app.use('/static', express.static(path.join(__dirname, '../public')));
app.use('/public', express.static(path.join(__dirname, '../public')));

// Định tuyến API
app.use('/api', analyzeRoutes);
app.use('/api', resultRoutes);

// Endpoint kiểm tra tình trạng dịch vụ (health check)
app.get('/app/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'YouTube Analysis Service'
  });
});

// Redirect từ root đến analyzer
app.get('/', (req, res) => {
  res.redirect('/app/analyzer');
});

// Serve static HTML files
app.get('/app/analyzer', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/analyzer.html'));
});

// Thêm route cho trang kết quả chi tiết
app.get('/app/result/:jobId', (req, res) => {
  const { jobId } = req.params;
  res.sendFile(path.join(__dirname, '../public/result.html'));
});

// Middleware xử lý lỗi tập trung
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Handler cho 404 - Không tìm thấy endpoint
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 YouTube Analysis Service đang chạy trên port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/app/health`);
  console.log(`🌐 Web interface: http://localhost:${PORT}/app/analyzer`);
});

module.exports = app;
