const { syncPost } = require('../src/lib/wp-sync.ts');

// Giả lập config và post dữ liệu bài "Lịch thi đấu hôm nay" để debug xem nó lỗi ở bước nào
// (Nhưng vì wp-sync.ts viết bằng TypeScript, ta cần dùng ts-node hoặc compile, hoặc đơn giản copy hàm logic ra chạy debug).
// Thay vì chạy code phức tạp, hãy đọc lại kỹ đoạn code wp-sync.ts ở khu vực gửi batchUpdate.
