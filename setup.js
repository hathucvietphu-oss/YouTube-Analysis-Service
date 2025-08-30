#!/usr/bin/env node

/**
 * Setup script cho YouTube Analysis Service
 * Chạy: node setup.js
 */

const fs = require('fs-extra');
const path = require('path');

async function createDirectories() {
  console.log('📁 Tạo thư mục cần thiết...');
  
  const directories = [
    'storage',
    'storage/screenshots',
    'storage/audio',
    'storage/results',
    'storage/metadata',
    'logs'
  ];
  
  for (const dir of directories) {
    try {
      await fs.ensureDir(dir);
      console.log(`✅ Đã tạo thư mục: ${dir}`);
    } catch (error) {
      console.error(`❌ Lỗi tạo thư mục ${dir}:`, error.message);
    }
  }
}

async function checkEnvironment() {
  console.log('\n🔧 Kiểm tra môi trường...');
  
  // Check Node.js version
  const nodeVersion = process.version;
  const requiredVersion = '18.0.0';
  
  if (parseInt(nodeVersion.slice(1).split('.')[0]) < 18) {
    console.error(`❌ Node.js version ${nodeVersion} không đủ. Yêu cầu Node.js 18+`);
    return false;
  }
  
  console.log(`✅ Node.js version: ${nodeVersion}`);
  
  // Check if .env exists
  const envExists = await fs.pathExists('.env');
  if (!envExists) {
    console.log('⚠️ File .env không tồn tại. Vui lòng tạo từ env.example');
    console.log('   cp env.example .env');
    console.log('   Sau đó chỉnh sửa .env với API keys của bạn');
  } else {
    console.log('✅ File .env đã tồn tại');
  }
  
  // Check package.json
  const packageExists = await fs.pathExists('package.json');
  if (!packageExists) {
    console.error('❌ package.json không tồn tại');
    return false;
  }
  
  console.log('✅ package.json đã tồn tại');
  
  return true;
}

async function installDependencies() {
  console.log('\n📦 Cài đặt dependencies...');
  
  try {
    const { execSync } = require('child_process');
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies đã được cài đặt');
    return true;
  } catch (error) {
    console.error('❌ Lỗi cài đặt dependencies:', error.message);
    return false;
  }
}

async function checkFFmpeg() {
  console.log('\n🎵 Kiểm tra FFmpeg...');
  
  try {
    const { execSync } = require('child_process');
    const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8' });
    console.log('✅ FFmpeg đã được cài đặt');
    console.log(`📝 Version: ${ffmpegVersion.split('\n')[0]}`);
    return true;
  } catch (error) {
    console.log('⚠️ FFmpeg không được tìm thấy');
    console.log('📋 Hướng dẫn cài đặt FFmpeg:');
    console.log('   Ubuntu/Debian: sudo apt install ffmpeg');
    console.log('   macOS: brew install ffmpeg');
    console.log('   Windows: Tải từ https://ffmpeg.org/download.html');
    return false;
  }
}

async function createSampleEnv() {
  console.log('\n📝 Tạo file .env mẫu...');
  
  const envExample = `# API Keys
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
`;
  
  try {
    await fs.writeFile('.env', envExample);
    console.log('✅ Đã tạo file .env mẫu');
    console.log('⚠️ Vui lòng chỉnh sửa .env với API keys thực của bạn');
  } catch (error) {
    console.error('❌ Lỗi tạo file .env:', error.message);
  }
}

async function displayNextSteps() {
  console.log('\n🚀 Bước tiếp theo:');
  console.log('==================');
  console.log('1. Chỉnh sửa file .env với API keys:');
  console.log('   - ELEVENLABS_API_KEY: Lấy từ https://elevenlabs.io/');
  console.log('   - GPTZERO_API_KEY: Lấy từ https://gptzero.me/');
  console.log('');
  console.log('2. Chạy ứng dụng:');
  console.log('   npm start');
  console.log('');
  console.log('3. Hoặc chạy với Docker:');
  console.log('   docker-compose up -d');
  console.log('');
  console.log('4. Test ứng dụng:');
  console.log('   node test.js');
  console.log('');
  console.log('5. Truy cập web interface:');
  console.log('   http://localhost:8080');
  console.log('');
  console.log('📚 Xem README.md để biết thêm chi tiết');
}

async function main() {
  console.log('🎯 YouTube Analysis Service Setup');
  console.log('================================\n');
  
  try {
    // Create directories
    await createDirectories();
    
    // Check environment
    const envOk = await checkEnvironment();
    if (!envOk) {
      console.log('\n❌ Setup không thành công. Vui lòng kiểm tra lỗi trên.');
      process.exit(1);
    }
    
    // Install dependencies
    const depsOk = await installDependencies();
    if (!depsOk) {
      console.log('\n❌ Không thể cài đặt dependencies.');
      process.exit(1);
    }
    
    // Check FFmpeg
    await checkFFmpeg();
    
    // Create sample .env if it doesn't exist
    const envExists = await fs.pathExists('.env');
    if (!envExists) {
      await createSampleEnv();
    }
    
    // Display next steps
    await displayNextSteps();
    
    console.log('\n✅ Setup hoàn thành!');
    
  } catch (error) {
    console.error('\n💥 Setup failed:', error);
    process.exit(1);
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  createDirectories,
  checkEnvironment,
  installDependencies,
  checkFFmpeg,
  createSampleEnv,
  displayNextSteps,
  main
};
