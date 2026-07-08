const fs = require('fs');
const path = require('path');

// Giả lập downloadImageAsBuffer
async function testDownload(url) {
  let referer = '';
  try {
    const urlObj = new URL(url);
    referer = urlObj.origin + '/';
  } catch (e) {}

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };
  if (referer) {
    headers['Referer'] = referer;
  }

  console.log('Sending request to:', url);
  console.log('Headers:', headers);

  try {
    const response = await fetch(url, { headers, cache: 'no-store' });
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Headers returned:', Object.fromEntries(response.headers.entries()));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('Download success, buffer size:', buffer.length);
  } catch (e) {
    console.error('Download failed:', e.message);
  }
}

testDownload('https://keonhacai888.it.com/wp-content/uploads/2026/06/ty-le-keo-nha-cai-va-chien-luoc-ca-cuoc-hieu-qua-1782554499.webp');
