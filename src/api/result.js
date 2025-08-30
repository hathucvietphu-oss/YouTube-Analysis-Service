const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const router = express.Router();

const StorageService = require('../services/storage');

// GET /api/result/:jobId — trả kết quả tổng hợp cho job cụ thể
router.get('/result/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const storage = new StorageService();
    const result = await storage.getResult(jobId);
    
    if (!result) {
      return res.status(404).json({
        error: 'Kết quả không tồn tại',
        message: 'Chưa có kết quả phân tích nào cho job này. Vui lòng gửi yêu cầu phân tích trước.'
      });
    }

    // Trả về kết quả đầy đủ cho client
    res.json({
      status: 'completed',
      job_id: jobId,
      youtube_url: result.youtube_url,
      created_at: result.created_at || new Date().toISOString(),
      completed_at: result.completed_at || new Date().toISOString(),
      result: {
        transcript: result.transcript,
        screenshot_url: `/api/result/${jobId}/screenshot`,
        audio_url: `/api/result/${jobId}/audio`,
        metadata: {
          total_sentences: result.transcript?.sentences?.length || 0,
          total_speakers: result.transcript?.speakers?.length || 0,
          average_ai_probability: calculateAverageAIProbability(result.transcript),
          processing_time: result.processing_time || 0
        }
      }
    });

  } catch (error) {
    console.error('Error retrieving result:', error);
    res.status(500).json({
      error: 'Lỗi khi lấy kết quả',
      message: 'Không thể truy xuất kết quả từ storage'
    });
  }
});



// GET /api/result/:jobId/screenshot — trả ảnh screenshot cho job cụ thể
router.get('/result/:jobId/screenshot', async (req, res) => {
  try {
    const { jobId } = req.params;
    const storage = new StorageService();
    const result = await storage.getResult(jobId);
    
    if (!result || !result.screenshot_path) {
      return res.status(404).json({
        error: 'Screenshot không tồn tại',
        message: 'Không tìm thấy screenshot cho job này. Vui lòng gửi yêu cầu phân tích trước.'
      });
    }

    // Kiểm tra file có tồn tại không
    if (!await fs.pathExists(result.screenshot_path)) {
      return res.status(404).json({
        error: 'File screenshot không tồn tại',
        message: 'File screenshot đã bị xóa hoặc không tồn tại'
      });
    }

    // Gửi file ảnh về client
    res.sendFile(path.resolve(result.screenshot_path));

  } catch (error) {
    console.error('Error serving screenshot:', error);
    res.status(500).json({
      error: 'Lỗi server',
      message: 'Không thể phục vụ screenshot'
    });
  }
});

// GET /api/result/:jobId/audio — tải/stream file âm thanh cho job cụ thể
router.get('/result/:jobId/audio', async (req, res) => {
  try {
    const { jobId } = req.params;
    const storage = new StorageService();
    const result = await storage.getResult(jobId);
    
    if (!result || !result.audio_path) {
      return res.status(404).json({
        error: 'Audio không tồn tại',
        message: 'Không tìm thấy audio cho job này. Vui lòng gửi yêu cầu phân tích trước.'
      });
    }

    // Kiểm tra file có tồn tại không
    if (!await fs.pathExists(result.audio_path)) {
      return res.status(404).json({
        error: 'File audio không tồn tại',
        message: 'File audio đã bị xóa hoặc không tồn tại'
      });
    }

    // Thiết lập header phù hợp để tải/stream audio
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="audio_${jobId}.wav"`);
    
    // Stream file audio về client
    const audioStream = fs.createReadStream(result.audio_path);
    audioStream.pipe(res);

  } catch (error) {
    console.error('Error serving audio:', error);
    res.status(500).json({
      error: 'Lỗi server',
      message: 'Không thể phục vụ audio'
    });
  }
});

// GET /api/result/transcript — trả riêng transcript JSON
router.get('/result/transcript', async (req, res) => {
  try {
    const storage = new StorageService();
    const result = await storage.getResult('current');
    
    if (!result || !result.transcript) {
      return res.status(404).json({
        error: 'Transcript không tồn tại',
        message: 'Không tìm thấy transcript. Vui lòng gửi yêu cầu phân tích trước.'
      });
    }

    // Chỉ trả phần dữ liệu transcript
    res.json({
      transcript: result.transcript
    });

  } catch (error) {
    console.error('Error serving transcript:', error);
    res.status(500).json({
      error: 'Lỗi server',
      message: 'Không thể phục vụ transcript'
    });
  }
});

// Hàm tiện ích: tính AI probability trung bình trên các câu
function calculateAverageAIProbability(transcript) {
  if (!transcript || !transcript.sentences) {
    return 0;
  }

  const sentences = transcript.sentences.filter(s => s.ai_probability !== undefined);
  if (sentences.length === 0) {
    return 0;
  }

  const total = sentences.reduce((sum, sentence) => sum + sentence.ai_probability, 0);
  return Math.round((total / sentences.length) * 100) / 100;
}

module.exports = router;
