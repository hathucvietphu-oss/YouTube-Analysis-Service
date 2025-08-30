const express = require('express');
const router = express.Router();

const AnalyzerService = require('../services/analyzer');
const AudioExtractor = require('../services/audio');
const Transcriber = require('../services/transcriber');
const AIChecker = require('../services/aiChecker');
const StorageService = require('../services/storage');

// Giới hạn tốc độ (rate limiting)
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10, // limit each IP to 10 requests per windowMs
  message: {
    error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  }
});

router.use(limiter);

// POST /api/analyze — nhận URL và phân tích video
router.post('/analyze', async (req, res) => {
  try {
    const { youtube_url } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!youtube_url) {
      return res.status(400).json({
        error: 'Thiếu URL YouTube',
        message: 'Vui lòng cung cấp youtube_url trong request body'
      });
    }

    // Kiểm tra định dạng URL YouTube
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(youtube_url)) {
      return res.status(400).json({
        error: 'URL không hợp lệ',
        message: 'Vui lòng cung cấp URL YouTube hợp lệ'
      });
    }

    // Bắt đầu xử lý bất đồng bộ
    processVideoAsync(youtube_url, res);

  } catch (error) {
    console.error('Error in analyze endpoint:', error);
    res.status(500).json({
      error: 'Lỗi server',
      message: 'Không thể xử lý yêu cầu phân tích'
    });
  }
});

// Hàm xử lý pipeline bất đồng bộ
async function processVideoAsync(youtubeUrl, res) {
  try {
    // Tạo job ID ngẫu nhiên
    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Trả về phản hồi ngay cho client
    res.status(202).json({
      status: 'processing',
      job_id: jobId,
      message: 'Đã nhận yêu cầu phân tích. Vui lòng chờ kết quả.'
    });

    // Bước 1: Phân tích video với Puppeteer
    console.log('🔍 Bắt đầu phân tích video...');
    const analyzer = new AnalyzerService();
    const screenshotPath = await analyzer.analyzeVideo(youtubeUrl, jobId);
    
    // Bước 2: Trích xuất âm thanh
    console.log('🎵 Đang trích xuất âm thanh...');
    const audioExtractor = new AudioExtractor();
    const audioPath = await audioExtractor.extractAudio(youtubeUrl, jobId);
    
    // Bước 3: Chuyển âm thanh thành văn bản (transcribe)
    console.log('📝 Đang chuyển đổi âm thanh thành văn bản...');
    const transcriber = new Transcriber();
    const transcript = await transcriber.transcribe(audioPath, jobId);
    
    // Bước 4: Kiểm tra AI (GPTZero)
    console.log('🤖 Đang kiểm tra AI...');
    const aiChecker = new AIChecker();
    const enrichedTranscript = await aiChecker.checkAI(transcript, jobId);
    
    // Bước 5: Lưu kết quả
    console.log('💾 Đang lưu kết quả...');
    const storage = new StorageService();
    const result = await storage.saveResult(jobId, {
      transcript: enrichedTranscript,
      screenshot_path: screenshotPath,
      audio_path: audioPath,
      youtube_url: youtubeUrl
    });
    
    console.log('✅ Phân tích hoàn thành thành công');
    
  } catch (error) {
    console.error('❌ Error processing video:', error);
  }
}

module.exports = router;
