const https = require('https');

function downloadImageAsBuffer(url) {
  return new Promise((resolve, reject) => {
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

    const options = {
      headers,
      timeout: 15000
    };

    console.log('Sending https.get request to:', url);
    console.log('Options headers:', options.headers);

    https.get(url, options, (res) => {
      console.log('Status code:', res.statusCode);
      console.log('Response headers:', res.headers);
      if (res.statusCode !== 200) {
        reject(new Error(`Không thể tải ảnh từ URL (HTTP ${res.statusCode}): ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

downloadImageAsBuffer('https://keonhacai888.it.com/wp-content/uploads/2026/06/ty-le-keo-nha-cai-va-chien-luoc-ca-cuoc-hieu-qua-1782554499.webp')
  .then(buf => console.log('Downloaded buffer length:', buf.length))
  .catch(err => console.error('Error:', err.message));
