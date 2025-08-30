const fs = require('fs-extra');
const path = require('path');

class StorageService {
  constructor() {
    this.storagePath = process.env.STORAGE_PATH || './storage';
    this.resultsPath = path.join(this.storagePath, 'results');
    this.metadataPath = path.join(this.storagePath, 'metadata');
  }

  async saveResult(jobId, data) {
    try {
      await this.ensureDirectories();

      console.log(`💾 Lưu kết quả cho job: ${jobId}`);

      const resultData = {
        job_id: jobId,
        created_at: new Date().toISOString(),
        youtube_url: data.youtube_url,
        transcript: data.transcript,
        screenshot_path: data.screenshot_path,
        audio_path: data.audio_path,
        metadata: {
          total_sentences: data.transcript?.sentences?.length || 0,
          total_speakers: data.transcript?.speakers?.length || 0,
          overall_ai_probability: data.transcript?.overall_ai_probability || 0,
          language: data.transcript?.language || 'unknown',
          duration: data.transcript?.duration || 0
        }
      };

      // Lưu transcript (JSON)
      const transcriptPath = path.join(this.resultsPath, `${jobId}_transcript.json`);
      await fs.writeJson(transcriptPath, resultData, { spaces: 2 });

      // Lưu metadata (thông tin phụ)
      const metadataPath = path.join(this.metadataPath, `${jobId}_metadata.json`);
      await fs.writeJson(metadataPath, {
        job_id: jobId,
        created_at: resultData.created_at,
        youtube_url: data.youtube_url,
        file_paths: {
          transcript: transcriptPath,
          screenshot: data.screenshot_path,
          audio: data.audio_path
        },
        metadata: resultData.metadata
      }, { spaces: 2 });

      console.log(`✅ Đã lưu kết quả: ${transcriptPath}`);
      
      return {
        job_id: jobId,
        transcript_path: transcriptPath,
        metadata_path: metadataPath,
        screenshot_path: data.screenshot_path,
        audio_path: data.audio_path
      };

    } catch (error) {
      console.error('❌ Lỗi khi lưu kết quả:', error);
      throw error;
    }
  }

  async getResult(jobId) {
    try {
      const transcriptPath = path.join(this.resultsPath, `${jobId}_transcript.json`);
      const metadataPath = path.join(this.metadataPath, `${jobId}_metadata.json`);

      // Kiểm tra file có tồn tại
      const transcriptExists = await fs.pathExists(transcriptPath);
      const metadataExists = await fs.pathExists(metadataPath);

      if (!transcriptExists) {
        console.log(`⚠️ Không tìm thấy transcript cho job: ${jobId}`);
        return null;
      }

      // Đọc dữ liệu transcript từ file
      const resultData = await fs.readJson(transcriptPath);

      // Xác thực các đường dẫn file vẫn hợp lệ
      if (resultData.screenshot_path && !(await fs.pathExists(resultData.screenshot_path))) {
        console.warn(`⚠️ Screenshot không tồn tại: ${resultData.screenshot_path}`);
        resultData.screenshot_path = null;
      }

      if (resultData.audio_path && !(await fs.pathExists(resultData.audio_path))) {
        console.warn(`⚠️ Audio không tồn tại: ${resultData.audio_path}`);
        resultData.audio_path = null;
      }

      return resultData;

    } catch (error) {
      console.error('❌ Lỗi khi đọc kết quả:', error);
      return null;
    }
  }

  async listResults(limit = 50, offset = 0) {
    try {
      await this.ensureDirectories();

      const files = await fs.readdir(this.resultsPath);
      const transcriptFiles = files.filter(file => file.endsWith('_transcript.json'));

      const results = [];
      const endIndex = Math.min(offset + limit, transcriptFiles.length);

      for (let i = offset; i < endIndex; i++) {
        const file = transcriptFiles[i];
        const jobId = file.replace('_transcript.json', '');
        
        try {
          const result = await this.getResult(jobId);
          if (result) {
            results.push({
              job_id: jobId,
              created_at: result.created_at,
              youtube_url: result.youtube_url,
              metadata: result.metadata
            });
          }
        } catch (error) {
          console.error(`❌ Lỗi khi đọc job ${jobId}:`, error);
        }
      }

      return {
        results,
        total: transcriptFiles.length,
        limit,
        offset
      };

    } catch (error) {
      console.error('❌ Lỗi khi liệt kê kết quả:', error);
      return { results: [], total: 0, limit, offset };
    }
  }

  async deleteResult(jobId) {
    try {
      console.log(`🗑️ Xóa kết quả cho job: ${jobId}`);

      const result = await this.getResult(jobId);
      if (!result) {
        throw new Error('Không tìm thấy kết quả để xóa');
      }

      const filesToDelete = [];

      // Thêm đường dẫn file transcript để xoá
      const transcriptPath = path.join(this.resultsPath, `${jobId}_transcript.json`);
      filesToDelete.push(transcriptPath);

      // Thêm đường dẫn file metadata để xoá
      const metadataPath = path.join(this.metadataPath, `${jobId}_metadata.json`);
      filesToDelete.push(metadataPath);

      // Thêm file screenshot nếu có
      if (result.screenshot_path && await fs.pathExists(result.screenshot_path)) {
        filesToDelete.push(result.screenshot_path);
      }

      // Thêm file audio nếu có
      if (result.audio_path && await fs.pathExists(result.audio_path)) {
        filesToDelete.push(result.audio_path);
      }

      // Xoá toàn bộ các file liên quan
      for (const file of filesToDelete) {
        await fs.remove(file);
        console.log(`🗑️ Đã xóa: ${file}`);
      }

      console.log(`✅ Đã xóa thành công job: ${jobId}`);
      return { deleted_files: filesToDelete.length };

    } catch (error) {
      console.error('❌ Lỗi khi xóa kết quả:', error);
      throw error;
    }
  }

  async cleanupOldResults(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 ngày
    try {
      console.log('🧹 Bắt đầu dọn dẹp kết quả cũ...');

      const files = await fs.readdir(this.resultsPath);
      const transcriptFiles = files.filter(file => file.endsWith('_transcript.json'));
      
      const now = Date.now();
      let deletedCount = 0;

      for (const file of transcriptFiles) {
        try {
          const filePath = path.join(this.resultsPath, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            const jobId = file.replace('_transcript.json', '');
            await this.deleteResult(jobId);
            deletedCount++;
          }
        } catch (error) {
          console.error(`❌ Lỗi khi xóa file cũ ${file}:`, error);
        }
      }

      console.log(`✅ Dọn dẹp hoàn thành. Đã xóa ${deletedCount} kết quả cũ.`);
      return { deleted_count: deletedCount };

    } catch (error) {
      console.error('❌ Lỗi khi dọn dẹp kết quả cũ:', error);
      throw error;
    }
  }

  async getStorageStats() {
    try {
      await this.ensureDirectories();

      const transcriptFiles = await fs.readdir(this.resultsPath);
      const metadataFiles = await fs.readdir(this.metadataPath);

      let totalSize = 0;
      let totalTranscripts = 0;

      // Tính tổng dung lượng đã lưu
      for (const file of transcriptFiles) {
        if (file.endsWith('_transcript.json')) {
          const filePath = path.join(this.resultsPath, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          totalTranscripts++;
        }
      }

      // Lấy thông tin sử dụng đĩa
      const diskUsage = await this.getDiskUsage();

      return {
        total_jobs: totalTranscripts,
        total_size_bytes: totalSize,
        total_size_mb: Math.round(totalSize / (1024 * 1024) * 100) / 100,
        metadata_files: metadataFiles.length,
        disk_usage: diskUsage,
        storage_path: this.storagePath
      };

    } catch (error) {
      console.error('❌ Lỗi khi lấy thống kê storage:', error);
      return {
        total_jobs: 0,
        total_size_bytes: 0,
        total_size_mb: 0,
        error: error.message
      };
    }
  }

  async getDiskUsage() {
    try {
      const stats = await fs.stat(this.storagePath);
      return {
        available: stats.size,
        path: this.storagePath
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async ensureDirectories() {
    try {
      await fs.ensureDir(this.storagePath);
      await fs.ensureDir(this.resultsPath);
      await fs.ensureDir(this.metadataPath);
      
      console.log(`📁 Đã tạo thư mục storage: ${this.storagePath}`);
    } catch (error) {
      console.error('❌ Lỗi khi tạo thư mục storage:', error);
      throw error;
    }
  }

  async backupResult(jobId, backupPath) {
    try {
      const result = await this.getResult(jobId);
      if (!result) {
        throw new Error('Không tìm thấy kết quả để backup');
      }

      await fs.ensureDir(backupPath);
      
      const backupData = {
        ...result,
        backup_created_at: new Date().toISOString(),
        original_job_id: jobId
      };

      const backupFilePath = path.join(backupPath, `${jobId}_backup_${Date.now()}.json`);
      await fs.writeJson(backupFilePath, backupData, { spaces: 2 });

      console.log(`💾 Đã backup kết quả: ${backupFilePath}`);
      return backupFilePath;

    } catch (error) {
      console.error('❌ Lỗi khi backup kết quả:', error);
      throw error;
    }
  }
}

module.exports = StorageService;
