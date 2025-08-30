# YouTube Analysis Service

Dịch vụ phân tích video YouTube với AI - trích xuất transcript, chụp screenshot, và kiểm tra AI probability.

## 🚀 Tính năng

- **Phân tích video YouTube**: Sử dụng Puppeteer để chụp screenshot và kiểm tra video
- **Trích xuất âm thanh**: Tải và chuyển đổi âm thanh sang WAV 16kHz mono
- **Transcription**: Sử dụng ElevenLabs Scribe API với word-level timestamps và speaker diarization
- **AI Detection**: Kiểm tra AI probability cho từng câu bằng GPTZero API
- **Job ID System**: Hệ thống quản lý job riêng biệt cho mỗi yêu cầu phân tích
- **REST API**: Giao diện API đầy đủ để tích hợp
- **Web Interface**: Giao diện web thân thiện với người dùng
- **Docker Support**: Containerized với Docker và docker-compose

## 📋 Yêu cầu hệ thống

- Node.js 18+
- FFmpeg
- Docker (tùy chọn)
- API Keys:
  - ElevenLabs API Key
  - GPTZero API Key

## 🛠️ Cài đặt

### 1. Clone repository

```bash
git clone https://github.com/hathucvietphu-oss/youtube-analysis-service.git
cd youtube-analysis-service
```

### 2. Cài đặt dependencies

```bash
npm install
```

### 3. Cấu hình environment variables

Tạo file `.env` từ template:

```bash
cp env.example .env
```

Chỉnh sửa file `.env`:

```env
# API Keys
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
GPTZERO_API_KEY=your_gptzero_api_key_here

# Server Configuration
PORT=8080
NODE_ENV=production

# Storage Configuration
STORAGE_PATH=./storage
SCREENSHOTS_PATH=./storage/screenshots
AUDIO_PATH=./storage/audio

# Puppeteer Configuration
PUPPETEER_HEADLESS=true
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage

# FFmpeg Configuration
FFMPEG_PATH=/usr/bin/ffmpeg

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=10
```

### 4. Cài đặt FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Tải từ [FFmpeg official website](https://ffmpeg.org/download.html)

## 🚀 Chạy ứng dụng

### Development mode

```bash
npm run dev
```

### Production mode

```bash
npm start
```

### Docker

```bash
# Build và chạy với docker-compose
docker-compose up -d

# Hoặc build và chạy Docker container
docker build -t youtube-analysis-service .
docker run -p 8080:8080 --env-file .env youtube-analysis-service
```

## 📖 Sử dụng API

### 1. Phân tích video

**POST** `/api/analyze`

```bash
curl -X POST http://localhost:8080/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

Response:
```json
{
  "status": "processing",
  "job_id": "job_1703123456789_abc123def",
  "message": "Đã nhận yêu cầu phân tích. Vui lòng chờ kết quả."
}
```

### 2. Lấy kết quả theo Job ID

**GET** `/api/result/:jobId`

```bash
curl http://localhost:8080/api/result/job_1703123456789_abc123def
```

Response:
```json
{
  "status": "completed",
  "job_id": "job_1703123456789_abc123def",
  "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "created_at": "2023-12-21T10:30:45.123Z",
  "completed_at": "2023-12-21T10:32:15.456Z",
  "result": {
    "transcript": {
      "sentences": [
        {
          "speaker": "Speaker 1",
          "start": 0.0,
          "end": 5.2,
          "text": "Hello, welcome to this video...",
          "ai_probability": 0.15
        }
      ]
    },
    "screenshot_url": "/api/result/job_1703123456789_abc123def/screenshot",
    "audio_url": "/api/result/job_1703123456789_abc123def/audio",
    "metadata": {
      "total_sentences": 25,
      "total_speakers": 2,
      "average_ai_probability": 0.23,
      "processing_time": 90000
    }
  }
}
```

### 3. Lấy screenshot

**GET** `/api/result/:jobId/screenshot`

```bash
curl http://localhost:8080/api/result/job_1703123456789_abc123def/screenshot
```

### 4. Lấy audio file

**GET** `/api/result/:jobId/audio`

```bash
curl http://localhost:8080/api/result/job_1703123456789_abc123def/audio
```

### 5. Health check

**GET** `/health`

```bash
curl http://localhost:8080/health
```

## 🌐 Web Interface

### Trang chủ - Phân tích video
Truy cập `http://localhost:8080/app/analyzer` để sử dụng giao diện phân tích video.

**Tính năng:**
- Nhập URL YouTube để phân tích
- Hiển thị trạng thái xử lý với thông báo thân thiện
- Tự động hiển thị link kết quả sau 20 giây
- Giao diện responsive và dễ sử dụng

### Trang kết quả
Truy cập `http://localhost:8080/app/result/:jobId` để xem kết quả chi tiết.

**Tính năng:**
- Hiển thị đầy đủ thông tin phân tích
- Transcript với AI probability cho từng câu
- Screenshot video (hiển thị cuối trang)
- Audio player và download links
- Thống kê tổng hợp

## 📊 Cấu trúc dữ liệu kết quả

Kết quả bao gồm:

- **Transcript**: Văn bản với timestamps và speaker diarization
- **AI Analysis**: Probability AI cho từng câu (Cao/Trung bình/Thấp)
- **Screenshot**: Ảnh chụp màn hình video
- **Audio**: File âm thanh WAV
- **Metadata**: Thông tin tổng hợp (số câu, số người nói, AI probability trung bình)

Xem file `sample_output.json` để biết chi tiết cấu trúc.

## 🏗️ Kiến trúc hệ thống

```
youtube-analysis-service/
├── src/
│   ├── api/              # Express routes
│   │   ├── analyze.js    # POST /analyze endpoint với job ID system
│   │   └── result.js     # GET /result/:jobId endpoints
│   ├── services/
│   │   ├── analyzer.js   # Puppeteer video analysis
│   │   ├── audio.js      # ytdl + ffmpeg audio extraction
│   │   ├── transcriber.js# ElevenLabs Scribe API
│   │   ├── aiChecker.js  # GPTZero AI detection
│   │   └── storage.js    # File storage management
│   └── index.js          # Main application entry
├── public/               # Static files
│   ├── analyzer.html     # Giao diện phân tích video
│   └── result.html       # Giao diện hiển thị kết quả
├── storage/              # Generated files
│   ├── screenshots/      # Video screenshots
│   ├── audio/           # Extracted audio files
│   ├── results/         # JSON transcripts
│   └── metadata/        # Job metadata
├── docker-compose.yml   # Docker orchestration
├── Dockerfile          # Container definition
└── README.md           # Documentation
```

## 🔧 Quyết định thiết kế

### 1. Job ID System
- Mỗi yêu cầu phân tích được gán một job ID duy nhất
- Format: `job_[timestamp]_[random_string]`
- Cho phép xử lý nhiều yêu cầu đồng thời
- Tracking và quản lý kết quả riêng biệt

### 2. Asynchronous Processing
- Sử dụng async/await cho tất cả I/O operations
- Non-blocking API responses với status 202
- Background processing cho các tác vụ nặng

### 3. User Experience
- Thông báo thân thiện: "⏰ Xin đợi kết quả..." thay vì thông báo lỗi
- Timer 20 giây tự động hiển thị link kết quả
- Giao diện responsive và intuitive

### 4. Error Handling
- Comprehensive error handling ở mọi layer
- Graceful degradation khi API external fails
- Detailed error messages và logging

### 5. Rate Limiting
- Built-in rate limiting để tránh abuse
- Configurable limits qua environment variables

### 6. File Management
- Organized storage structure theo job ID
- Automatic cleanup của old files
- Backup capabilities

### 7. Security
- Non-root Docker container
- Input validation
- CORS configuration
- Helmet security headers

## 🚀 Triển khai trên Google Cloud (GCE)

### 1. Tạo VM Instance

```bash
# Tạo VM với Ubuntu 20.04
gcloud compute instances create youtube-analysis-vm \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2004-lts \
  --image-project=ubuntu-os-cloud \
  --tags=http-server,https-server
```

### 2. Cấu hình Firewall

```bash
# Mở port 8080
gcloud compute firewall-rules create allow-youtube-analysis \
  --allow tcp:8080 \
  --target-tags=http-server \
  --description="Allow YouTube Analysis Service"
```

### 3. SSH vào VM và setup

```bash
# SSH vào VM
gcloud compute ssh youtube-analysis-vm --zone=us-central1-a

# Cài đặt Docker
sudo apt update
sudo apt install docker.io docker-compose

# Clone repository
git clone https://github.com/hathucvietphu-oss/youtube-analysis-service.git
cd youtube-analysis-service

# Tạo .env file
cp env.example .env
# Chỉnh sửa .env với API keys

# Chạy service
sudo docker-compose up -d
```

### 4. Fallback SSH Port Forwarding

Nếu firewall không hoạt động:

```bash
# Từ máy local
ssh -L 8080:localhost:8080 username@VM_IP
```

Sau đó truy cập `http://localhost:8080/app/analyzer`

## 📝 API Documentation

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Bắt đầu phân tích video (trả về job ID) |
| GET | `/api/result/:jobId` | Lấy kết quả hoàn chỉnh theo job ID |
| GET | `/api/result/:jobId/screenshot` | Lấy screenshot theo job ID |
| GET | `/api/result/:jobId/audio` | Lấy audio file theo job ID |
| GET | `/health` | Health check |

### Web Interface Routes

| Route | Description |
|-------|-------------|
| `/app/analyzer` | Giao diện phân tích video |
| `/app/result/:jobId` | Giao diện hiển thị kết quả |

### Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - URL không hợp lệ |
| 404 | Not Found - Job ID không tồn tại |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Lỗi server |

## 🔍 Troubleshooting

### Common Issues

1. **Job ID không tìm thấy**
   - Kiểm tra job ID có đúng format không
   - Đảm bảo job đã được tạo thành công
   - Kiểm tra storage permissions

2. **Puppeteer không chạy trong Docker**
   - Đảm bảo đã cài đúng dependencies trong Dockerfile
   - Kiểm tra environment variables

3. **FFmpeg không tìm thấy**
   - Cài đặt FFmpeg: `sudo apt install ffmpeg`
   - Kiểm tra PATH trong environment

4. **API keys không hoạt động**
   - Verify API keys với providers
   - Kiểm tra rate limits

5. **Storage permissions**
   - Đảm bảo thư mục storage có quyền write
   - Trong Docker: kiểm tra volume mounts

### Logs

```bash
# Docker logs
docker-compose logs -f youtube-analysis-service

# Application logs
tail -f logs/app.log
```

## 🎯 Workflow sử dụng

### 1. Phân tích video
1. Truy cập `http://localhost:8080/app/analyzer`
2. Nhập URL YouTube
3. Click "Phân tích"
4. Nhận thông báo "⏰ Xin đợi kết quả..."
5. Sau 20 giây, link kết quả sẽ xuất hiện

### 2. Xem kết quả
1. Click link "📊 Xem kết quả chi tiết →"
2. Xem thống kê tổng hợp
3. Nghe audio và tải xuống
4. Xem transcript với AI analysis
5. Xem screenshot (cuối trang)

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push branch: `git push origin feature/new-feature`
5. Tạo Pull Request

## 📄 License

MIT License - xem file LICENSE để biết chi tiết.

## 📞 Support

- Issues: [GitHub Issues](https://github.com/hathucvietphu-oss/youtube-analysis-service/issues)
- Email: hathucvietphu@gmail.com

---

**Lưu ý**: Dịch vụ này chỉ sử dụng cho mục đích giáo dục và nghiên cứu. Tuân thủ Terms of Service của YouTube, ElevenLabs, và GPTZero.