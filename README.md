# Dua Mustajab — Azkar & Dua Reader (PWA)

แอปพลิเคชันเว็บ (PWA) สำหรับอ่าน **ดุอามุสตาญาบ** และ **อัซการยามเช้า-เย็น** ภาษาไทย
อ่านได้ลื่นไหลทั้งบนมือถือ, iPad และเดสก์ท็อป ติดตั้งลงหน้าจอหลักและใช้งานออฟไลน์ได้

🔗 **Live:** https://nusofwan.github.io/azkar-duamustajab-reader/

---

## ✨ ฟีเจอร์หลัก

| หมวด | รายละเอียด |
|------|-----------|
| 📖 อ่าน PDF | เรนเดอร์ด้วย pdf.js, เลื่อนหน้า, เลือกหน้า, ปัด/สครอลล์เปลี่ยนหน้า |
| 🔍 ซูม | ปุ่มขยาย/ย่อ และ pinch-to-zoom 2 นิ้วบนมือถือ |
| 🔖 บุ๊กมาร์ก | คั่นหน้าและกลับมาอ่านต่อ (เก็บแยกตามเล่ม) |
| 📝 จดบันทึก | โน้ตต่อหน้า + ประวัติโน้ตทั้งหมด |
| 🖍️ ไฮไลต์ | วาดมือบนหน้า เลือกสี/ขนาดเส้น, ยางลบ, undo |
| 📿 ตัสบีห์ | ตัวนับซีกิร พร้อมวงแหวนความคืบหน้า + สั่น |
| 🔥 Streak | นับวันอ่านต่อเนื่อง |
| 🔔 แจ้งเตือน | เตือนอ่านอัซการเช้า/เย็น (ผ่าน Service Worker) |
| 🎨 ธีม | สว่าง / มืด / ซีเปีย (อ่านสบายตา) |
| 📲 PWA | ติดตั้งลงหน้าจอหลัก, ใช้งานออฟไลน์, มี shortcuts |

---

## 🗂️ โครงสร้างไฟล์

```
.
├── index.html        # หน้าแอปหลัก (reader)
├── install.html      # คู่มือติดตั้ง PWA (Android/iOS) — เป็น landing page
├── style.css         # สไตล์ทั้งหมด (ธีม, responsive, safe-area)
├── script.js         # ตรรกะหลัก (pdf.js, bookmark, note, highlight, tasbih…)
├── sw.js             # Service Worker (offline cache)
├── manifest.json     # PWA manifest
├── icon.svg / icon.png
├── th_athkar_assabah_walmasaa.pdf   # อัซการเช้า-เย็น (~0.5 MB)
├── dua_mustajab_th.pdf              # ดุอามุสตาญาบ (~69 MB)
├── 404.html / robots.txt / sitemap.xml / .nojekyll
└── .github/workflows/deploy.yml     # CI/CD → GitHub Pages
```

> ⚠️ `dua_mustajab_th.pdf` มีขนาดใหญ่ (~69 MB) pdf.js ใช้ HTTP Range เพื่อโหลดเฉพาะหน้าที่ดู
> ดังนั้นห้าม cache ทั้งไฟล์ล่วงหน้าใน Service Worker (จะดาวน์โหลดทั้งก้อน)

---

## 🚀 การรัน (Local Development)

ต้องเสิร์ฟผ่าน HTTP (ไม่ใช่ `file://`) เพราะ Service Worker และ pdf.js range requests
ทำงานไม่ได้บนโปรโตคอล `file://`

```bash
# Python 3
python -m http.server 8000
# แล้วเปิด http://localhost:8000/

# หรือ Node
npx serve .
```

บน Windows ดับเบิลคลิก `start_server.bat` ได้

---

## 📦 การ Deploy (GitHub Pages)

Deploy อัตโนมัติผ่าน GitHub Actions ทุกครั้งที่ push ขึ้น `main`
ดู `.github/workflows/deploy.yml`

ตั้งค่าครั้งแรก: **Settings → Pages → Build and deployment → Source = GitHub Actions**

---

## 🛠️ งานที่วางแผนต่อ

ดูแผนงานละเอียดทั้งหมด (บั๊ก, ฟีเจอร์ระดับมืออาชีพ, asset ที่ต้องสร้างด้วย AI image)
ได้ที่ **[WORKFLOW.md](WORKFLOW.md)**

---

## 📄 License / เครดิต

เนื้อหาดุอาและอัซการเพื่อการเผยแผ่ความรู้ • สร้างด้วย pdf.js, Font Awesome, Google Fonts
