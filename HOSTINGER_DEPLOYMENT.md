
# نقل المشروع إلى Hostinger

هذا الدليل يوضح كيفية نقل مشروع API إلى استضافة Hostinger باستخدام Docker.

## المتطلبات الأساسية

1. حساب على Hostinger مع خطة تدعم Docker (عادة خطة Business أو أعلى)
2. الوصول إلى SSH على الخادم
3. Docker و Docker Compose مثبتان على الخادم
4. Git مثبت على الخادم

## الخطوات

### 1. إعداد المستودع (Repository)

1. انقل الكود إلى مستودع Git (GitHub/GitLab/Bitbucket)
2. تأكد من إضافة ملف `.dockerignore` لاستبعاد الملفات غير الضرورية

### 2. إعداد الخادم

1. اتصل بالخادم عبر SSH
2. قم بتثبيت Docker و Docker Compose إذا لم تكونا مثبتين:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# تثبيت Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

3. أعد تشغيل الجلسة لتطبيق تغييرات المجموعة

### 3. استنساخ المشروع

```bash
git clone https://github.com/username/database-api.git
cd database-api
```

### 4. إعداد متغيرات البيئة

1. انسخ ملف `.env.example` إلى `.env`:
```bash
cp .env.example .env
```

2. عدّل قيم المتغيرات في ملف `.env`:
```bash
nano .env
```

3. تأكد من تعيين قيم آمنة لكلمات المرور والمفاتيح

### 5. بناء وتشغيل الحاويات

```bash
docker-compose up -d --build
```

### 6. التحقق من التشغيل

1. تحقق من حالة الحاويات:
```bash
docker-compose ps
```

2. تحقق من سجلات التشغيل:
```bash
docker-compose logs -f
```

### 7. إعداد Nginx (اختياري)

إذا كنت تستخدم Hostinger مع Nginx، قد تحتاج إلى إعداد 反向代理:

```nginx
server {
    listen 80;
    server_name redme.cfd;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 8. تجديد SSL (اختياري)

إذا كنت تستخدم SSL مع Hostinger:

```bash
sudo certbot --nginx -d redme.cfd
```

### 9. التحديثات المستقبلية

لتحديث التطبيق:

```bash
git pull origin main
docker-compose down
docker-compose up -d --build
```

## استكشاف الأخطاء وإصلاحها

### مشاكل شائعة

1. **فشل الاتصال بقاعدة البيانات**
   - تحقق من متغيرات البيئة في ملف `.env`
   - تأكد من أن قاعدة بيانات MySQL تعمل بشكل صحيح

2. **أخطاء المنفذ**
   - تأكد من أن المنفذ المحدد في `docker-compose.yml` متاح
   - تحقق من وجود خدمات أخرى تستخدم نفس المنفذ

3. **مشاكل الأذونات**
   - تأكد من أن المجلدات المستخدمة من قبل الحاويات لديها الأذونات الصحيحة

### سجلات مفيدة

- سجلات التطبيق: `docker-compose logs app`
- سجلات قاعدة البيانات: `docker-compose logs mysql`

## ملاحظات هامة

1. لا تقم أبداً بإضافة ملف `.env` إلى المستودع العام
2. استخدم كلمات مرور قوية لقاعدة البيانات
3. قم بعمل نسخ احتياطية منتظمة لقاعدة البيانات
4. راقب استخدام الموارد على الخادم لضمان الأداء الجيد
