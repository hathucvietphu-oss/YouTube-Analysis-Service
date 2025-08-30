const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');
const { pipeline } = require('stream/promises');

class AudioExtractor {
  constructor() {
    this.audioPath = process.env.AUDIO_PATH || './storage/audio';
    this.ffmpegPath = process.env.FFMPEG_PATH;
    
    // Thiết lập đường dẫn FFmpeg nếu được cấu hình
    if (this.ffmpegPath) {
      ffmpeg.setFfmpegPath(this.ffmpegPath);
    }
  }

  async extractAudio(youtubeUrl, jobId) {
    try {
      await this.ensureDirectories();
      
      console.log(`🎵 Bắt đầu trích xuất âm thanh từ: ${youtubeUrl}`);

      // Kiểm tra tính hợp lệ URL YouTube
      if (!ytdl.validateURL(youtubeUrl)) {
        throw new Error('URL YouTube không hợp lệ');
      }

      // Lấy thông tin video
      const videoInfo = await ytdl.getInfo(youtubeUrl);
      console.log(`📹 Video: ${videoInfo.videoDetails.title}`);

      // Chọn định dạng chỉ âm thanh
      const audioFormat = ytdl.chooseFormat(videoInfo.formats, { 
        quality: 'highestaudio',
        filter: 'audioonly' 
      });

      if (!audioFormat) {
        throw new Error('Không tìm thấy định dạng âm thanh phù hợp');
      }

      console.log(`🎧 Định dạng âm thanh: ${audioFormat.qualityLabel} (${audioFormat.container})`);

      // Tạo đường dẫn file đầu ra
      const outputPath = path.join(this.audioPath, `audio_${jobId}.wav`);

      // Tải và chuyển đổi âm thanh
      await this.downloadAndConvert(youtubeUrl, outputPath, audioFormat);

      console.log(`✅ Trích xuất âm thanh hoàn thành: ${outputPath}`);
      return outputPath;

    } catch (error) {
      console.error('❌ Lỗi trong quá trình trích xuất âm thanh:', error);
      throw error;
    }
  }

  async downloadAndConvert(youtubeUrl, outputPath, audioFormat) {
    return new Promise((resolve, reject) => {
      try {
        // Tạo stream âm thanh
        const audioStream = ytdl(youtubeUrl, {
          format: audioFormat,
          quality: 'highestaudio',
          filter: 'audioonly'
        });

        // Chuyển đổi sang WAV với thiết lập chuẩn
        ffmpeg(audioStream)
          .audioCodec('pcm_s16le')  // 16-bit PCM
          .audioChannels(1)         // Mono
          .audioFrequency(16000)    // 16 kHz
          .format('wav')
          .on('start', (commandLine) => {
            console.log('🔄 Bắt đầu chuyển đổi âm thanh...');
            console.log(`📝 FFmpeg command: ${commandLine}`);
          })
          .on('progress', (progress) => {
            if (progress.percent) {
              console.log(`📊 Tiến độ: ${Math.round(progress.percent)}%`);
            }
          })
          .on('error', (err) => {
            console.error('❌ Lỗi FFmpeg:', err);
            reject(new Error(`Lỗi chuyển đổi âm thanh: ${err.message}`));
          })
          .on('end', () => {
            console.log('✅ Chuyển đổi âm thanh hoàn thành');
            resolve(outputPath);
          })
          .save(outputPath);

      } catch (error) {
        reject(error);
      }
    });
  }

  async downloadAudioOnly(youtubeUrl, outputPath) {
    // Phương án dự phòng nếu không có FFmpeg
    return new Promise((resolve, reject) => {
      try {
        const audioStream = ytdl(youtubeUrl, {
          quality: 'highestaudio',
          filter: 'audioonly'
        });

        const writeStream = fs.createWriteStream(outputPath);

        audioStream.pipe(writeStream);

        writeStream.on('finish', () => {
          console.log('✅ Tải âm thanh hoàn thành (không chuyển đổi)');
          resolve(outputPath);
        });

        writeStream.on('error', (error) => {
          reject(new Error(`Lỗi ghi file: ${error.message}`));
        });

        audioStream.on('error', (error) => {
          reject(new Error(`Lỗi stream âm thanh: ${error.message}`));
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async getVideoInfo(youtubeUrl) {
    try {
      const info = await ytdl.getInfo(youtubeUrl);
      
      return {
        title: info.videoDetails.title,
        duration: info.videoDetails.lengthSeconds,
        author: info.videoDetails.author.name,
        viewCount: info.videoDetails.viewCount,
        description: info.videoDetails.description,
        thumbnail: info.videoDetails.thumbnails[0]?.url,
        formats: info.formats.map(format => ({
          itag: format.itag,
          quality: format.qualityLabel,
          container: format.container,
          audioCodec: format.audioCodec,
          videoCodec: format.videoCodec,
          hasAudio: format.hasAudio,
          hasVideo: format.hasVideo
        }))
      };

    } catch (error) {
      console.error('❌ Lỗi khi lấy thông tin video:', error);
      throw error;
    }
  }

  async ensureDirectories() {
    try {
      await fs.ensureDir(this.audioPath);
      console.log(`📁 Đã tạo thư mục audio: ${this.audioPath}`);
    } catch (error) {
      console.error('❌ Lỗi khi tạo thư mục audio:', error);
      throw error;
    }
  }

  async cleanupOldFiles(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    try {
      const files = await fs.readdir(this.audioPath);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.audioPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.remove(filePath);
          console.log(`🗑️ Đã xóa file cũ: ${file}`);
        }
      }
    } catch (error) {
      console.error('❌ Lỗi khi dọn dẹp file cũ:', error);
    }
  }

  async getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration);
        }
      });
    });
  }

  async validateAudioFile(audioPath) {
    try {
      const stats = await fs.stat(audioPath);
      
      if (stats.size === 0) {
        throw new Error('File âm thanh rỗng');
      }

      const duration = await this.getAudioDuration(audioPath);
      
      if (duration < 1) {
        throw new Error('File âm thanh quá ngắn');
      }

      console.log(`✅ File âm thanh hợp lệ: ${Math.round(duration)}s, ${Math.round(stats.size / 1024)}KB`);
      return true;

    } catch (error) {
      console.error('❌ File âm thanh không hợp lệ:', error);
      return false;
    }
  }
}

module.exports = AudioExtractor;
