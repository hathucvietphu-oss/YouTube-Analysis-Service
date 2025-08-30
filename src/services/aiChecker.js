const axios = require('axios');

class AIChecker {
  constructor() {
    this.apiKey = process.env.GPTZERO_API_KEY;
    this.baseUrl = 'https://api.gptzero.me/v2';
    
    if (!this.apiKey) {
      throw new Error('GPTZERO_API_KEY không được cấu hình');
    }
  }

  getAuthHeaders() {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json'
    };
  }

  async checkAI(transcript, jobId) {
    try {
      console.log(`🤖 Bắt đầu kiểm tra AI cho transcript...`);

      if (!transcript || !transcript.sentences || transcript.sentences.length === 0) {
        console.log('⚠️ Transcript rỗng, bỏ qua kiểm tra AI');
        return transcript;
      }

      // Kiểm tra nhanh API key, nếu không hợp lệ thì bỏ qua toàn bộ bước kiểm tra AI
      const isValidKey = await this.validateAPIKey();
      if (!isValidKey) {
        const enriched = { ...transcript };
        enriched.sentences = enriched.sentences.map(s => ({
          ...s,
          ai_check_skipped: true,
          skip_reason: 'invalid_api_key'
        }));
        enriched.overall_ai_probability = 0.5;
        enriched.ai_analysis = this.generateAIAnalysis(enriched.sentences);
        console.warn('⚠️ Bỏ qua kiểm tra AI do API key không hợp lệ.');
        return enriched;
      }

      const enrichedTranscript = { ...transcript };
      const sentences = enrichedTranscript.sentences;

      console.log(`📝 Kiểm tra ${sentences.length} câu...`);

      // Xử lý theo lô (batch) để tránh vượt giới hạn tốc độ API
      const batchSize = 5;
      const batches = this.chunkArray(sentences, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`🔄 Xử lý batch ${i + 1}/${batches.length} (${batch.length} câu)`);

        // Xử lý đồng thời các câu trong batch
        const promises = batch.map(sentence => this.checkSentenceAI(sentence));
        const results = await Promise.allSettled(promises);

        // Cập nhật xác suất AI cho từng câu
        results.forEach((result, index) => {
          const sentenceIndex = i * batchSize + index;
          if (result.status === 'fulfilled') {
            sentences[sentenceIndex] = result.value;
          } else {
            console.error(`❌ Lỗi kiểm tra câu ${sentenceIndex + 1}:`, result.reason);
            // Thêm giá trị mặc định nếu kiểm tra thất bại
            sentences[sentenceIndex].ai_probability = 0.5;
            sentences[sentenceIndex].ai_check_error = result.reason.message;
          }
        });

        // Nghỉ giữa các batch để tôn trọng giới hạn tốc độ
        if (i < batches.length - 1) {
          await this.sleep(1000); // 1 second delay
        }
      }

      // Tính xác suất AI tổng thể của transcript
      enrichedTranscript.overall_ai_probability = this.calculateOverallAIProbability(sentences);
      enrichedTranscript.ai_analysis = this.generateAIAnalysis(sentences);

      console.log(`✅ Kiểm tra AI hoàn thành. Overall AI probability: ${enrichedTranscript.overall_ai_probability}`);

      return enrichedTranscript;

    } catch (error) {
      console.error('❌ Lỗi trong quá trình kiểm tra AI:', error);
      
      // Trả về transcript gốc kèm thông tin lỗi
      return {
        ...transcript,
        ai_check_error: error.message,
        overall_ai_probability: 0.5
      };
    }
  }

  async checkSentenceAI(sentence) {
    try {
      if (!sentence.text || sentence.text.trim().length === 0) {
        return {
          ...sentence,
          ai_probability: 0.5,
          ai_check_skipped: true
        };
      }

      // Bỏ qua các câu quá ngắn
      if (sentence.text.trim().length < 10) {
        return {
          ...sentence,
          ai_probability: 0.5,
          ai_check_skipped: true,
          skip_reason: 'Câu quá ngắn'
        };
      }

      const response = await axios.post(`${this.baseUrl}/predict/text`, {
        document: sentence.text
      }, {
        headers: this.getAuthHeaders(),
        timeout: 30000,
        validateStatus: () => true
      });

      if (response.status === 401) {
        throw new Error('Unauthorized (401) - GPTZero API key có thể không hợp lệ hoặc hết hạn');
      }

      if (response.status === 404) {
        throw new Error('Endpoint không tồn tại (404) - Kiểm tra lại URL API');
      }

      const aiProbability = this.extractAIProbability(response.data);
      
      return {
        ...sentence,
        ai_probability: aiProbability,
        ai_check_timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Lỗi kiểm tra câu "${sentence.text?.substring(0, 50)}...":`, error.message);
      
      return {
        ...sentence,
        ai_probability: 0.5,
        ai_check_error: error.message,
        ai_check_timestamp: new Date().toISOString()
      };
    }
  }

  extractAIProbability(response) {
    try {
      // Cấu trúc phản hồi GPTZero có thể thay đổi; xử lý linh hoạt các trường hợp
      if (response.documents && response.documents.length > 0) {
        const doc = response.documents[0];
        
        // Kiểm tra các trường xác suất có thể có
        if (doc.completely_generated_prob !== undefined) {
          return doc.completely_generated_prob;
        }
        
        if (doc.overall_burstiness !== undefined) {
          // Quy đổi burstiness sang xác suất (burstiness thấp => xác suất AI cao)
          return Math.max(0, 1 - doc.overall_burstiness);
        }
        
        if (doc.ai_generated_prob !== undefined) {
          return doc.ai_generated_prob;
        }
      }

      // Dự phòng: kiểm tra các trường xác suất trực tiếp
      if (response.completely_generated_prob !== undefined) {
        return response.completely_generated_prob;
      }

      if (response.ai_generated_prob !== undefined) {
        return response.ai_generated_prob;
      }

      // Dự phòng mặc định
      console.warn('⚠️ Không thể trích xuất AI probability từ response:', response);
      return 0.5;

    } catch (error) {
      console.error('❌ Lỗi khi trích xuất AI probability:', error);
      return 0.5;
    }
  }

  calculateOverallAIProbability(sentences) {
    try {
      const validSentences = sentences.filter(s => 
        s.ai_probability !== undefined && 
        !s.ai_check_skipped && 
        !s.ai_check_error
      );

      if (validSentences.length === 0) {
        return 0.5;
      }

      const totalProbability = validSentences.reduce((sum, sentence) => {
        return sum + sentence.ai_probability;
      }, 0);

      return Math.round((totalProbability / validSentences.length) * 1000) / 1000;

    } catch (error) {
      console.error('❌ Lỗi khi tính overall AI probability:', error);
      return 0.5;
    }
  }

  generateAIAnalysis(sentences) {
    try {
      const analysis = {
        total_sentences: sentences.length,
        checked_sentences: 0,
        skipped_sentences: 0,
        error_sentences: 0,
        high_ai_sentences: 0,
        low_ai_sentences: 0,
        medium_ai_sentences: 0,
        confidence_level: 'unknown'
      };

      sentences.forEach(sentence => {
        if (sentence.ai_check_skipped) {
          analysis.skipped_sentences++;
        } else if (sentence.ai_check_error) {
          analysis.error_sentences++;
        } else if (sentence.ai_probability !== undefined) {
          analysis.checked_sentences++;
          
          if (sentence.ai_probability >= 0.7) {
            analysis.high_ai_sentences++;
          } else if (sentence.ai_probability <= 0.3) {
            analysis.low_ai_sentences++;
          } else {
            analysis.medium_ai_sentences++;
          }
        }
      });

      // Xác định mức độ tin cậy (confidence level)
      const checkRate = analysis.checked_sentences / analysis.total_sentences;
      if (checkRate >= 0.8) {
        analysis.confidence_level = 'high';
      } else if (checkRate >= 0.5) {
        analysis.confidence_level = 'medium';
      } else {
        analysis.confidence_level = 'low';
      }

      return analysis;

    } catch (error) {
      console.error('❌ Lỗi khi tạo AI analysis:', error);
      return {
        total_sentences: sentences.length,
        checked_sentences: 0,
        error: error.message
      };
    }
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async validateAPIKey() {
    try {
      // Thử endpoint khác để validate API key
      const response = await axios.post(`${this.baseUrl}/predict/text`, {
        document: "Test document for API validation"
      }, {
        headers: this.getAuthHeaders(),
        timeout: 10000,
        validateStatus: () => true
      });

      if (response.status === 200) {
        console.log('✅ GPTZero API key hợp lệ');
        return true;
      } else {
        console.error(`❌ GPTZero API key không hợp lệ: Request failed with status code ${response.status}`);
        return false;
      }

    } catch (error) {
      console.error('❌ GPTZero API key không hợp lệ:', error.message);
      return false;
    }
  }

  async getUsageInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/user`, {
        headers: this.getAuthHeaders(),
        timeout: 10000
      });

      return {
        remaining_requests: response.data.remaining_requests || 'unknown',
        total_requests: response.data.total_requests || 'unknown',
        reset_date: response.data.reset_date || 'unknown'
      };

    } catch (error) {
      console.error('❌ Không thể lấy thông tin usage:', error.message);
      return {
        remaining_requests: 'unknown',
        total_requests: 'unknown',
        reset_date: 'unknown'
      };
    }
  }
}

module.exports = AIChecker;
