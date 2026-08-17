# 🔨 HYPNOSHUB

Türkçe Clash Royale analiz platformu. Oyuncu ve klan arama, canlı sıralamalar,
meta desteleri, kart kütüphanesi ve puanlı mini oyunlar. Veriler resmî
**Clash Royale API**'sinden, küçük bir Node/Express vekili üzerinden geliyor.

Sunucu hem siteyi hem API'yi **aynı adresten** veriyor, yani CORS ayarı yok.

---

## Kurulum

Gereken: Node.js 18 veya üstü.

```bash
git clone https://github.com/<kullanıcı>/Hypnoshub.git
cd Hypnoshub
npm install
```

### API anahtarı

Resmî API tarayıcıdan çağrılamaz: gizli bir anahtar ister ve istekleri
**sunucunun IP'sine** göre kısıtlar. Vekilin işi bu ikisini halletmek.

1. <https://developer.clashroyale.com> adresinden bir **Key** oluşturun.
2. Anahtarı oluştururken izin verilen **IP adreslerini** girmeniz istenir:
   - **Yerelde geliştirmek için** kendi genel IP'nizi ekleyin
     (arama motoruna "what is my ip" yazın). IP'niz değişirse anahtarı güncelleyin.
   - **Yayına almak için** aşağıdaki *Yayın* bölümüne bakın — bulut
     sağlayıcılarında IP sabit olmadığı için ayrı bir yol gerekiyor.
   - İkisini birden eklemek serbest; en pratiği budur.
3. `server/.env.example` dosyasını `server/.env` adıyla kopyalayın ve
   anahtarı `CR_API_TOKEN` satırına yapıştırın.

Windows'ta anahtarı ekrana yazmadan girmek için:

```powershell
powershell -ExecutionPolicy Bypass -File server\anahtar-degistir.ps1
```

### Çalıştırma

```bash
npm start          # → http://localhost:8787
```

Kontrol: <http://localhost:8787/api/health> → `{ "ok": true, "hasToken": true }`

Anahtar yoksa site yine açılır ama **demo veri** gösterir; durum rozeti
"Canlı API" yerine uyarıya döner.

---

## Ayarlar

Hepsi `server/.env` içinde (ayrıntılı açıklamalar `server/.env.example` dosyasında).

| Değişken | Ne işe yarar |
|---|---|
| `CR_API_TOKEN` | Clash Royale API anahtarı. **Zorunlu.** |
| `DATA_DIR` | Hesapların, puan tablosunun ve mesajların yazılacağı klasör. Boşsa `server/.cache`. **Bulutta zorunlu** — aşağı bakın. |
| `CR_API_BASE` | API adresi. Boşsa doğrudan Supercell. Bulutta vekil adresi girilir. |
| `CRAWL_CLANS` | Oyuncu **adıyla** arama için taranacak klan sayısı. `0` = kapalı; bellek ~1,6 GB'tan ~86 MB'a iner, arama yalnız `#etiket` ve sıralamalardaki oyuncularla sınırlı kalır. |
| `ADMIN_USERS` | Yönetici kullanıcı adları (virgülle). Boşsa ilk kayıt olan hesap. |
| `PORT` | Dinlenecek port. Bulutta sağlayıcı atar, dokunmayın. |

---

## Yayın (Railway, Render, Fly…)

Bulut sağlayıcılarında iki tuzak var; ikisi de sessizce veri kaybettirir.

**1. Disk geçicidir.** Uygulamanın dosya sistemi her yeni sürümde sıfırlanır.
Hesaplar, parolalar, puan tablosu ve mesajlar orada durur. Kalıcı bir disk
(Railway'de *Volume*) bağlayıp yolunu `DATA_DIR` ile verin:

```
DATA_DIR=/data
```

**2. Dışa çıkış IP'si sabit değildir.** IP'ye bağlı anahtar bulutta 403 alır.
Çözüm RoyaleAPI'nin vekili: anahtarı **`45.79.218.79`** IP'sine kayıtlı açın ve

```
CR_API_BASE=https://proxy.royaleapi.dev/v1
```

Sunucu açılışta bu ikisini denetler ve eksikse günlüğe uyarı yazar:

```
Veri klasörü: /data
CR API: https://proxy.royaleapi.dev/v1  (vekil)
```

Küçük bir planla başlıyorsanız `CRAWL_CLANS=0` girin — bellek 19 kat düşer.

---

## Yapı

```
Hypnoshub/
├── index.html            Ana sayfa · arama · Tokmakçılar puan tablosu
├── siralamalar.html      Global sıralamalar
├── canli.html            Son maçlar (Nihai Kademe ilk 100)
├── meta.html             Meta desteleri
├── kartlar.html          Kart kütüphanesi
├── eglence.html          Oyunlar (yarışma, düello, deste jeneratörü…)
├── oyuncu.html           Oyuncu profili
├── klan.html             Klan profili
├── assets/
│   ├── css/styles.css
│   ├── js/app.js         Tema, i18n, API istemcisi, çizim yardımcıları
│   └── img/
│       ├── ligler/       Lig rozetleri (klasörden okunur)
│       ├── heroes/       Kahraman portreleri
│       └── filigran/     Arka plan filigranları
└── server/
    ├── server.js         Vekil + statik sunum + oyuncu indeksi
    ├── auth.js           Kayıt/giriş (scrypt), oturum, yasaklama
    ├── board.js          Tokmakçılar puan tablosu
    ├── quiz.js           Tokmak Yarışması + bot koruması
    ├── games.js          Diğer oyunlar
    ├── messages.js       Kullanıcı–yönetici mesajlaşma
    └── veriyolu.js       Veri klasörü (DATA_DIR)
```

`assets/img/ligler`, `heroes` ve `filigran` klasörleri **koda dokunmadan**
değiştirilebilir: dosyayı atın, sayfayı yenileyin. Her birinin içinde
açıklama dosyası var.

---

## Güvenlik

- Şifreler **scrypt** ile saklanır; karşılaştırma sabit zamanlıdır.
- Oturum çerezi `HttpOnly` + `SameSite=Lax`. Bağlantı HTTPS ise `Secure`
  bayrağı **kendiliğinden** eklenir.
- Giriş denemesi (15 dk / 8) ve hesap açma (1 saat / 5) hız sınırlı.
- Yarışmada bot koruması: insan hızının altında cevaplayan hesap 3 gün askıya alınır.
- `server/.env` ve `server/.cache/` **git'e girmez** (`.gitignore`).
  Anahtarınızı asla depoya, sohbete veya ekran görüntüsüne koymayın —
  koyduysanız yenileyin.

---

## Lisans

Kişisel proje. Clash Royale ve ilgili tüm varlıklar Supercell'e aittir;
bu proje Supercell tarafından desteklenmemektedir.
