# HƯỚNG DẪN CÀI ĐẶT ỨNG DỤNG LÊN IPHONE (iOS NATIVE)
*(Hỗ trợ ghi GPS liên tục 100% khi bấm nút nguồn tắt màn hình)*

Dự án này đã được đóng gói sẵn dưới dạng **Capacitor Native iOS Project** với cấu hình quyền Apple Background Location:
* `UIBackgroundModes: ["location", "audio"]`
* `allowsBackgroundLocationUpdates = true`
* `pausesLocationUpdatesAutomatically = false`

---

### CÁCH 1: Cài đặt trực tiếp qua Xcode (Dành cho máy Mac)
1. Giải nén file `speedometer-ios-native.zip`.
2. Mở Terminal tại thư mục vừa giải nén và gõ lệnh:
   ```bash
   npm install
   npx cap sync ios
   npx cap open ios
   ```
3. Cửa sổ Xcode sẽ tự động mở ra:
   * Kết nối iPhone với máy Mac bằng cáp USB / Type-C.
   * Chọn iPhone của bạn ở thanh mục tiêu thiết bị trên cùng.
   * Tại tab **Signing & Capabilities**, chọn mục Team và đăng nhập Apple ID của bạn (tài khoản cá nhân miễn phí).
   * Nhấn nút **Run (▶️)** để cài trực tiếp ứng dụng lên iPhone.

---

### CÁCH 2: Cài qua Sideloadly hoặc AltStore (Dành cho Windows hoặc Mac)
1. Tải công cụ **Sideloadly** (miễn phí tại https://sideloadly.io/).
2. Cắm cáp iPhone vào máy tính.
3. Kéo thả file `.ipa` hoặc xuất file từ Xcode vào Sideloadly.
4. Nhập Apple ID để ký chứng chỉ và nhấn **Start** để cài ứng dụng vào điện thoại.

---

### CÁCH 3: Phân phối qua TestFlight / App Store (Dành cho nhà phát triển)
* Nếu có tài khoản Apple Developer ($99/năm), bạn chọn **Product -> Archive** trong Xcode và tải lên App Store Connect để gửi link TestFlight cho người khác sử dụng.
