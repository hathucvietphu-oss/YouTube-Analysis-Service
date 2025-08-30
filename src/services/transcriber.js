const axios = require('axios');
const fs = require('fs-extra');
const FormData = require('form-data');
const path = require('path');

class Transcriber {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY không được cấu hình');
    }

    // Log che khóa để xác nhận server đã đọc được API key
    const masked = this.apiKey.length > 6 ? `${this.apiKey.slice(0, 3)}***${this.apiKey.slice(-3)}` : '***';
    console.log(`🔐 ElevenLabs API key loaded: ${masked}`);
  }

  getAuthHeaders() {
    return {
      'xi-api-key': this.apiKey
    };
  }

  async transcribe(audioPath, jobId) {
    try {
      console.log(`🎤 Bắt đầu chuyển đổi âm thanh thành văn bản: ${audioPath}`);

      // Kiểm tra file âm thanh hợp lệ
      if (!await fs.pathExists(audioPath)) {
        throw new Error('File âm thanh không tồn tại');
      }

      const stats = await fs.stat(audioPath);
      if (stats.size === 0) {
        throw new Error('File âm thanh rỗng');
      }

      console.log(`📁 Kích thước file: ${Math.round(stats.size / 1024)}KB`);

      // Gọi trực tiếp Scribe API (phiên bản mới) - một lần gọi
      const transcript = await this.transcribeWithScribe(audioPath);
      
      console.log(`✅ Transcription hoàn thành. Số câu: ${transcript.sentences?.length || 0}`);
      
      return transcript;

    } catch (error) {
      console.error('❌ Lỗi trong quá trình transcription:', error);
      throw error;
    }
  }

  async transcribeWithScribe(audioPath) {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioPath));
      // Cho phép override qua ENV, mặc định dùng model hợp lệ của Scribe
      const modelId = process.env.ELEVENLABS_TRANSCRIBE_MODEL_ID || 'scribe_v1';
      formData.append('model_id', modelId);
      formData.append('word_timestamps', 'true');
      formData.append('speaker_diarization', 'true');
      formData.append('language_detection', 'true');

      const response = await axios.post(`${this.baseUrl}/speech-to-text`, formData, {
        headers: {
          ...this.getAuthHeaders(),
          'accept': 'application/json',
          ...formData.getHeaders()
        },
        timeout: 180000
      });

      const normalized = this.normalizeScribeResponse(response.data);
      return this.formatTranscript(normalized);

    } catch (error) {
      if (error.response) {
        console.error('❌ ElevenLabs Scribe Error:', error.response.data);
        const detail = error.response.data?.detail;
        const message = typeof detail === 'object' ? (detail.message || JSON.stringify(detail)) : (detail || error.response.statusText);
        throw new Error(`Lỗi speech-to-text: ${message}`);
      }
      throw new Error(`Lỗi speech-to-text: ${error.message}`);
    }
  }

  normalizeScribeResponse(raw) {
    try {
      // Một số biến thể thường gặp
      const text = raw.text || raw.transcript || raw.result || '';
      const words = raw.words || raw.word_timestamps || raw.items || [];
      const language = raw.language || raw.detected_language || 'unknown';
      const duration = raw.duration || raw.audio_duration || 0;
      const speakers = raw.speakers || raw.speaker_labels || [];

      // Chuẩn hoá mảng từ
      const normalizedWords = (Array.isArray(words) ? words : []).map((w, idx) => ({
        id: idx + 1,
        text: w.text || w.word || w.token || '',
        start: w.start || w.start_time || w.begin || 0,
        end: w.end || w.end_time || w.finish || (w.start || 0),
        confidence: w.confidence || w.score || 0,
        speaker: w.speaker || w.spk || w.spk_id || undefined
      })).filter(w => w.text);

      // Nếu có segments/câu theo API khác, cố gắng dựng sentences
      const segments = raw.segments || raw.sentences || [];
      const normalizedSentences = (Array.isArray(segments) ? segments : []).map((s, i) => ({
        id: i + 1,
        text: s.text || s.transcript || '',
        start: s.start || s.start_time || 0,
        end: s.end || s.end_time || 0,
        speaker: s.speaker || s.spk || 'unknown',
        confidence: s.confidence || 0,
        words: s.words || []
      })).filter(s => s.text);

      return {
        text,
        language,
        duration,
        words: normalizedWords,
        sentences: normalizedSentences,
        speakers: Array.isArray(speakers) ? speakers : []
      };
    } catch (e) {
      return { text: raw?.text || '', language: 'unknown', duration: 0, words: [], sentences: [], speakers: [] };
    }
  }

  async uploadAudio(audioPath) {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioPath));
      formData.append('name', path.basename(audioPath, '.wav'));

      const response = await axios.post(`${this.baseUrl}/audio/upload`, formData, {
        headers: {
          ...this.getAuthHeaders(),
          ...formData.getHeaders()
        },
        timeout: 60000 // timeout 60 giây
      });

      return response.data;

    } catch (error) {
      if (error.response) {
        console.error('❌ ElevenLabs API Error:', error.response.data);
        throw new Error(`Lỗi upload audio: ${error.response.data.detail || error.response.statusText}`);
      }
      throw new Error(`Lỗi upload audio: ${error.message}`);
    }
  }

  async startTranscription(audioId) {
    try {
      const response = await axios.post(`${this.baseUrl}/audio/${audioId}/transcribe`, {
        model_id: 'eleven_multilingual_v2',
        language_detection: true,
        word_timestamps: true,
        speaker_diarization: true
      }, {
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return response.data;

    } catch (error) {
      if (error.response) {
        console.error('❌ ElevenLabs Transcription Error:', error.response.data);
        throw new Error(`Lỗi bắt đầu transcription: ${error.response.data.detail || error.response.statusText}`);
      }
      throw new Error(`Lỗi bắt đầu transcription: ${error.message}`);
    }
  }

  async waitForTranscription(transcriptionId, maxWaitTime = 300000) { // tối đa 5 phút
    const startTime = Date.now();
    const checkInterval = 5000; // mỗi 5 giây kiểm tra 1 lần

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const status = await this.getTranscriptionStatus(transcriptionId);
        
        if (status.status === 'completed') {
          return await this.getTranscriptionResult(transcriptionId);
        } else if (status.status === 'failed') {
          throw new Error(`Transcription thất bại: ${status.error || 'Unknown error'}`);
        }

        console.log(`⏳ Đang chờ transcription... Status: ${status.status}`);
        await this.sleep(checkInterval);

      } catch (error) {
        console.error('❌ Lỗi khi kiểm tra trạng thái transcription:', error);
        throw error;
      }
    }

    throw new Error('Transcription timeout - quá thời gian chờ');
  }

  async getTranscriptionStatus(transcriptionId) {
    try {
      const response = await axios.get(`${this.baseUrl}/audio/transcribe/${transcriptionId}`, {
        headers: this.getAuthHeaders(),
        timeout: 10000
      });

      return response.data;

    } catch (error) {
      if (error.response) {
        throw new Error(`Lỗi kiểm tra trạng thái: ${error.response.data.detail || error.response.statusText}`);
      }
      throw new Error(`Lỗi kiểm tra trạng thái: ${error.message}`);
    }
  }

  async getTranscriptionResult(transcriptionId) {
    try {
      const response = await axios.get(`${this.baseUrl}/audio/transcribe/${transcriptionId}/result`, {
        headers: this.getAuthHeaders(),
        timeout: 30000
      });

      return this.formatTranscript(response.data);

    } catch (error) {
      if (error.response) {
        throw new Error(`Lỗi lấy kết quả transcription: ${error.response.data.detail || error.response.statusText}`);
      }
      throw new Error(`Lỗi lấy kết quả transcription: ${error.message}`);
    }
  }

  formatTranscript(rawTranscript) {
    try {
      const formatted = {
        text: rawTranscript.text || '',
        language: rawTranscript.language || 'unknown',
        duration: rawTranscript.duration || 0,
        sentences: [],
        speakers: [],
        words: [],
        metadata: {
          confidence: rawTranscript.confidence || 0,
          word_count: 0,
          sentence_count: 0,
          speaker_count: 0
        }
      };

      // Xử lý danh sách câu kèm timestamps (nếu có)
      if (rawTranscript.sentences && rawTranscript.sentences.length > 0) {
        formatted.sentences = rawTranscript.sentences.map((sentence, index) => ({
          id: index + 1,
          text: sentence.text,
          start: sentence.start,
          end: sentence.end,
          speaker: sentence.speaker || 'unknown',
          confidence: sentence.confidence || 0,
          words: sentence.words || []
        }));
        formatted.metadata.sentence_count = formatted.sentences.length;
      }

      // Xử lý danh sách từ kèm timestamps
      if (rawTranscript.words && rawTranscript.words.length > 0) {
        formatted.words = rawTranscript.words.map((word, index) => ({
          id: index + 1,
          text: word.text,
          start: word.start,
          end: word.end,
          confidence: word.confidence || 0,
          speaker: word.speaker || 'unknown'
        }));
        formatted.metadata.word_count = formatted.words.length;
      }

      // Nếu không có câu, tự dựng câu từ text/words
      if (formatted.sentences.length === 0) {
        const text = formatted.text || (formatted.words.length > 0 ? formatted.words.map(w => w.text).join(' ') : '');
        const roughSentences = text.split(/(?<=[\.\!\?])\s+/).filter(Boolean);
        if (roughSentences.length > 0) {
          let cursor = 0;
          const totalDuration = formatted.duration || (formatted.words.at(-1)?.end || 0);
          const avgPerChar = totalDuration && text.length ? totalDuration / text.length : 0.2;
          formatted.sentences = roughSentences.map((s, i) => {
            const start = cursor * avgPerChar;
            cursor += s.length + 1;
            const end = Math.min(cursor * avgPerChar, totalDuration || (start + s.length * avgPerChar));
            return { id: i + 1, text: s, start, end, speaker: 'unknown', confidence: 0, words: [] };
          });
          formatted.metadata.sentence_count = formatted.sentences.length;
        }
      }

      // Trích xuất danh sách người nói duy nhất
      const speakerSet = new Set();
      if (formatted.sentences) {
        formatted.sentences.forEach(sentence => {
          if (sentence.speaker) {
            speakerSet.add(sentence.speaker);
          }
        });
      }
      formatted.speakers = Array.from(speakerSet);
      formatted.metadata.speaker_count = formatted.speakers.length;

      // Tính confidence trung bình
      if (formatted.sentences.length > 0) {
        const totalConfidence = formatted.sentences.reduce((sum, sentence) => sum + sentence.confidence, 0);
        formatted.metadata.confidence = totalConfidence / formatted.sentences.length;
      }

      return formatted;

    } catch (error) {
      console.error('❌ Lỗi khi format transcript:', error);
      return {
        text: rawTranscript.text || '',
        language: 'unknown',
        duration: 0,
        sentences: [],
        speakers: [],
        words: [],
        metadata: {
          confidence: 0,
          word_count: 0,
          sentence_count: 0,
          speaker_count: 0
        },
        error: 'Lỗi format transcript'
      };
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async validateAudioFormat(audioPath) {
    try {
      const stats = await fs.stat(audioPath);
      const fileSize = stats.size;

      // Kiểm tra kích thước file (hợp lý cho audio)
      if (fileSize < 1024) { // Nhỏ hơn 1KB
        throw new Error('File âm thanh quá nhỏ');
      }

      if (fileSize > 100 * 1024 * 1024) { // Lớn hơn 100MB
        throw new Error('File âm thanh quá lớn');
      }

      // Kiểm tra phần mở rộng (định dạng) file
      const ext = path.extname(audioPath).toLowerCase();
      const supportedFormats = ['.wav', '.mp3', '.m4a', '.flac', '.ogg'];
      
      if (!supportedFormats.includes(ext)) {
        throw new Error(`Định dạng file không được hỗ trợ: ${ext}`);
      }

      return true;

    } catch (error) {
      console.error('❌ File âm thanh không hợp lệ:', error);
      return false;
    }
  }
}

module.exports = Transcriber;
