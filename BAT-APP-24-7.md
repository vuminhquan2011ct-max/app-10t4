
# Bật app 24/7 chỉ với vài cú bấm

Mở được ở bất kỳ đâu, bất kỳ lúc nào, ai có link cũng vào được.

## Cách 1: Kéo thả (dễ nhất, không cần cài gì)

1. Mở trình duyệt, vào **https://app.netlify.com/drop**
2. Kéo thả file **`app-10t4-web.zip`** (nằm trong thư mục `app-10t4`) vào ô giữa trang
3. Đợi khoảng 10 giây, Netlify trả về link dạng `https://ten-ngau-nhien.netlify.app`
4. Bấm **Sign up** (miễn phí) để giữ link vĩnh viễn. Không đăng ký thì link sẽ bị xoá sau vài giờ.

Xong. Link đó dùng được 24/7, gửi cho cả lớp.

Muốn link dễ nhớ hơn: trong Netlify vào **Site configuration → Change site name**, đổi thành ví dụ `lop10t4`.

## Cách 2: Dùng dòng lệnh

```powershell
cd "d:\Quản Lý lớp 10T4\app-10t4"
npx netlify-cli deploy --dir=dist --prod
```

Lần đầu sẽ mở trình duyệt để bạn đăng nhập Netlify, sau đó tự đăng lên.

## Cách 3: Tự cập nhật mỗi khi sửa code

Làm Cách 1 hoặc 2 trước, sau đó nối với GitHub:

```powershell
git remote add origin https://github.com/TEN-BAN/TEN-KHO.git
git add .
git commit -m "Quan ly lop 10T4"
git push -u origin master
```

Trong Netlify: **Add new site → Import from Git → chọn kho**. Từ đó mỗi lần `git push`, app tự cập nhật sau 1-3 phút.

## Đăng nhập bằng mật khẩu lớp

App sử dụng màn hình đăng nhập bằng mật khẩu truy cập:
- **Mật khẩu mặc định**: `vuquan` (có thể đổi trong [auth-store.tsx](file:///d:/Quản Lý lớp 10T4/app-10t4/src/store/auth-store.tsx) ở hằng số `APP_ACCESS_PASSWORD`).
- Sau khi nhập đúng mật khẩu, thiết bị tự ghi nhớ phiên đăng nhập và vào thẳng không gian lớp 10T4 (có thể đổi tên hiển thị hoặc bấm **Đăng xuất** trong mục **Cài đặt**).

## Lưu ý

- Sau khi sửa code, chạy lại `npm run build:web` rồi nén thư mục `dist` thành ZIP (hoặc dùng `npm run deploy`).
