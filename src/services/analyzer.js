const puppeteer = require('puppeteer');
const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');

class AnalyzerService {
  constructor() {
    this.browser = null;
    this.screenshotsPath = process.env.SCREENSHOTS_PATH || './storage/screenshots';
  }

  async init() {
    if (!this.browser) {
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ];

      // Thêm tham số tuỳ chỉnh từ biến môi trường
      if (process.env.PUPPETEER_ARGS) {
        args.push(...process.env.PUPPETEER_ARGS.split(','));
      }

      this.browser = await puppeteer.launch({
        headless: process.env.PUPPETEER_HEADLESS !== 'false',
        args,
        defaultViewport: {
          width: 1280,
          height: 720
        }
      });
    }
  }

  async analyzeVideo(youtubeUrl, jobId) {
    try {
      await this.ensureDirectories();

      console.log(`🔍 Bắt đầu phân tích video: ${youtubeUrl}`);

      // Tải thumbnail gốc của YouTube thay vì chụp màn hình
      const videoId = this.extractVideoId(youtubeUrl);
      if (!videoId) {
        throw new Error('Không thể trích xuất videoId từ URL');
      }

      const screenshotPath = await this.downloadThumbnail(videoId, jobId);

      // (Tùy chọn) Có thể bổ sung lấy metadata sau nếu cần
      const metadata = { videoId };

      console.log(`✅ Phân tích video hoàn thành. Thumbnail: ${screenshotPath}`);
      
      return screenshotPath;

    } catch (error) {
      console.error('❌ Lỗi trong quá trình phân tích video:', error);
      throw error;
    }
  }

  async checkVideoAvailability(page) {
    try {
      // Kiểm tra các thông báo lỗi thường gặp
      const errorSelectors = [
        'ytd-player-error-message-renderer',
        '.ytp-error',
        '[data-error-code]'
      ];

      for (const selector of errorSelectors) {
        const errorElement = await page.$(selector);
        if (errorElement) {
          const errorText = await page.evaluate(el => el.textContent, errorElement);
          console.log(`⚠️ Phát hiện lỗi video: ${errorText}`);
          return false;
        }
      }

      // Kiểm tra phần tử video có tồn tại/nguồn phát
      const videoElement = await page.$('video');
      if (!videoElement) {
        console.log('⚠️ Không tìm thấy video element');
        return false;
      }

      // Kiểm tra video không private hoặc đã xoá
      const titleElement = await page.$('h1.ytd-video-primary-info-renderer');
      if (!titleElement) {
        console.log('⚠️ Không tìm thấy tiêu đề video');
        return false;
      }

      const title = await page.evaluate(el => el.textContent, titleElement);
      if (title.includes('Video không khả dụng') || 
          title.includes('Video unavailable') ||
          title.includes('Private video') ||
          title.includes('Deleted video')) {
        console.log(`⚠️ Video không khả dụng: ${title}`);
        return false;
      }

      return true;

    } catch (error) {
      console.error('❌ Lỗi khi kiểm tra tính khả dụng của video:', error);
      return false;
    }
  }

  async captureScreenshot(page, jobId) {
    try {
      // Chờ phần tiêu đề/metadata hiển thị (ưu tiên chụp metadata)
      await page.waitForSelector('h1, #title, ytd-watch-metadata', { timeout: 15000 });

      // Cuộn tới vùng tiêu đề để chụp rõ nội dung khác biệt
      await page.evaluate(() => {
        const title = document.querySelector('h1, #title, ytd-watch-metadata');
        if (title) title.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      // Chờ cuộn xong
      await page.waitForTimeout(1000);

      // Chụp vùng metadata nếu có, fallback sang player
      const screenshotPath = path.join(this.screenshotsPath, `screenshot_${jobId}.png`);
      
      await page.screenshot({
        path: screenshotPath,
        type: 'png',
        fullPage: false,
        clip: await this.getPreferredClipArea(page)
      });

      console.log(`📸 Screenshot đã được chụp: ${screenshotPath}`);
      return screenshotPath;

    } catch (error) {
      console.error('❌ Lỗi khi chụp screenshot:', error);
      
      // Dự phòng: chụp toàn bộ trang
      const screenshotPath = path.join(this.screenshotsPath, `screenshot_${jobId}.png`);
      await page.screenshot({
        path: screenshotPath,
        type: 'png',
        fullPage: true
      });
      
      return screenshotPath;
    }
  }

  async ensurePlayback(page, jobId) {
    try {
      await page.evaluate((seed) => {
        const video = document.querySelector('video');
        if (!video) return;
        // Tắt tiếng để được phép play trong headless
        video.muted = true;
        const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        // Tạo offset dựa trên seed để tránh luôn chụp khung đầu
        let offset = 2;
        if (duration > 10) {
          // hash đơn giản từ seed để chọn mốc 10%–30% duration
          let h = 0;
          for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
          const ratio = 0.1 + (h % 21) / 100; // 0.10 .. 0.31
          offset = Math.min(duration * ratio, duration - 1);
        }
        try {
          video.currentTime = offset;
        } catch {}
        try { video.play(); } catch {}
      }, String(jobId));
    } catch (e) {
      // Bỏ qua, fallback vẫn chụp được
    }
  }

  async getPreferredClipArea(page) {
    try {
      const clipArea = await page.evaluate(() => {
        const withinViewport = (r) => {
          const vw = window.innerWidth, vh = window.innerHeight;
          return {
            x: Math.max(0, r.x),
            y: Math.max(0, r.y),
            width: Math.min(vw - Math.max(0, r.x), r.width),
            height: Math.min(vh - Math.max(0, r.y), r.height)
          };
        };
        // Ưu tiên title + meta
        const titleCandidates = ['h1.ytd-watch-metadata','#title h1','#title','h1'];
        for (const s of titleCandidates) {
          const t = document.querySelector(s);
          if (t) {
            const r = t.getBoundingClientRect();
            if (r && r.width > 100 && r.height > 20) {
              // mở rộng bao gồm khu vực thông tin bên dưới nếu có
              const info = document.querySelector('#owner, #upload-info, #info, ytd-watch-metadata');
              if (info) {
                const b = info.getBoundingClientRect();
                const minX = Math.min(r.x, b.x);
                const minY = Math.min(r.y, b.y);
                const maxX = Math.max(r.right, b.right);
                const maxY = Math.max(r.bottom, b.bottom);
                return withinViewport({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
              }
              return withinViewport(r);
            }
          }
        }

        // Fallback: player
        const sel = ['#player-container','ytd-player','.html5-video-container','video'];
        for (const s of sel) {
          const el = document.querySelector(s);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r && r.width > 100 && r.height > 100) return withinViewport(r);
          }
        }
        return null;
      });

      if (clipArea) {
        return clipArea;
      }

      // Dự phòng: dùng kích thước viewport
      const viewport = await page.viewport();
      return {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height
      };

    } catch (error) {
      console.error('❌ Lỗi khi lấy kích thước video:', error);
      
      // Dự phòng mặc định
      return {
        x: 0,
        y: 0,
        width: 1280,
        height: 720
      };
    }
  }

  async extractVideoMetadata(page) {
    try {
      const metadata = await page.evaluate(() => {
        const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer');
        const channelElement = document.querySelector('ytd-channel-name yt-formatted-string.ytd-channel-name');
        const durationElement = document.querySelector('.ytp-time-duration');
        const viewCountElement = document.querySelector('span.view-count');

        return {
          title: titleElement ? titleElement.textContent.trim() : null,
          channel: channelElement ? channelElement.textContent.trim() : null,
          duration: durationElement ? durationElement.textContent.trim() : null,
          viewCount: viewCountElement ? viewCountElement.textContent.trim() : null
        };
      });

      console.log('📊 Metadata video:', metadata);
      return metadata;

    } catch (error) {
      console.error('❌ Lỗi khi trích xuất metadata:', error);
      return {};
    }
  }

  async ensureDirectories() {
    try {
      await fs.ensureDir(this.screenshotsPath);
      console.log(`📁 Đã tạo thư mục screenshots: ${this.screenshotsPath}`);
    } catch (error) {
      console.error('❌ Lỗi khi tạo thư mục screenshots:', error);
      throw error;
    }
  }

  extractVideoId(youtubeUrl) {
    try {
      const url = new URL(youtubeUrl);
      if (url.hostname.includes('youtu.be')) {
        return url.pathname.replace('/', '').trim();
      }
      const v = url.searchParams.get('v');
      if (v) return v.trim();
      // Fallback: regex
      const m = youtubeUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
      return m ? m[1] : null;
    } catch {
      const m = youtubeUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
      return m ? m[1] : null;
    }
  }

  async downloadThumbnail(videoId, jobId) {
    const candidates = [
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    ];
    const targetPath = path.join(this.screenshotsPath, `screenshot_${jobId}.jpg`);

    for (const url of candidates) {
      try {
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, validateStatus: () => true });
        if (resp.status >= 200 && resp.status < 300 && resp.data && resp.data.byteLength > 0) {
          await fs.writeFile(targetPath, Buffer.from(resp.data));
          return targetPath;
        }
      } catch (_) {
        // thử url tiếp theo
      }
    }
    throw new Error('Không thể tải thumbnail YouTube');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🔒 Đã đóng browser Puppeteer');
    }
  }
}

module.exports = AnalyzerService;
