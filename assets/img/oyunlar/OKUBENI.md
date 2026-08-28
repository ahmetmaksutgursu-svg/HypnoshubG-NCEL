# Oyun kapak görselleri

Bu klasöre bir oyunun görselini koyduğunuzda site onu **kendiliğinden**
kullanmaya başlar. Kod değiştirmek ya da sunucuyu yeniden başlatmak
gerekmez — en fazla bir dakika içinde görünür.

> **Canlı site için dağıtım GEREKİR.** Yukarıdaki "kendiliğinden" cümlesi
> bu klasörü doğrudan okuyan sunucu için geçerli: geliştirme makinesi ya da
> kalıcı diski olan bir kurulum. Railway kabı dosyalarını her dağıtımda
> yüklenen kopyadan aldığı için buraya konan dosya `railway up`
> çalıştırılmadan canlıya **ulaşmaz**. Eski metin bunu atlıyordu.

## Dosya adı = oyunun kimliği

Dosyanın adı aşağıdaki **kimlik** sütunundaki yazının aynısı olmalı.
Oyunun görünen adı değil, kimliği. (Kahraman portrelerinde Türkçe ada göre
adlandırma yüzünden yanlış kart gösterilmişti; burada aynı hataya düşmemek
için kimlik kullanılıyor.)

| Kimlik → dosya adı | Oyun | Kapak yüklendi mi |
|---|---|---|
| `gunun` | Günün Kartı | ✅ `gunun.png` |
| `yarisma` | Tokmak Yarışması | ❌ hâlâ eski tokmak logosu |
| `duello` | Deste Düellosu | ✅ `duello.png` |
| `eksik` | Eksik Kartı Bul | ✅ `eksik.png` |
| `kapisma` | Kart Kapışması | ✅ `kapisma.jpeg` |
| `iksir` | İksir Hesabı | ✅ `iksir.png` |
| `deste` | Deste Jeneratörü | ✅ `deste.jpeg` |
| `siralama` | Kart Sıralama Oyunu | ✅ `siralama.png` |
| `tahmin` | Kart Tahmin Oyunu | ✅ `tahmin.png` |
| `cark` | Rastgele Deste Çarkı | ✅ `cark.png` |
| `cenabet` | Cenabet Buton | ✅ `cenabet.png` |

Örnek: Günün Kartı için `gunun.png`, Deste Düellosu için `duello.webp`.

## Kabul edilen uzantılar

`png` · `webp` · `jpg` · `jpeg` · `gif` — bu sırayla bakılır. Aynı oyun için
birden fazla uzantı varsa listedeki ilk bulunan kullanılır, o yüzden tek
dosya bırakmak en temizi.

## Görsel nasıl olmalı

- **Kare** olsun. Kutular kare; dikey bir görsel (ör. 738×1600) sığar ama
  çok küçük kalır.
- **256×256 piksel yeterli, daha büyüğünü yüklemeyin.** Görseller ekranda
  40–46 piksellik kutularda çiziliyor. Bir kez 1254×1254 ve tanesi
  1,2–2,3 MB olan kapaklar konmuştu: on oyun için 8,8 MB, yani her
  ziyaretçiye boşuna inen megabaytlar. 256×256'ya küçültülünce toplam
  914 KB'a düştü — aynı görüntü, onda bir yük.
- Arka planı **saydam PNG** ya da koyu zemine uyan bir renk olsun; sitenin
  varsayılan teması koyu.

## Görseli değiştirdim ama site eskisini gösteriyor

Göstermez. Görseller bir gün önbelleğe alınıyor (46 piksellik simgeler
için her ziyarette yeniden indirmek israf olurdu), ama adrese dosyanın
değişim zamanı ekleniyor. Dosya değiştiği anda adres de değişiyor ve yeni
kapak hemen iniyor. En fazla bir dakika (sunucunun klasörü tazeleme
aralığı) beklemek gerekebilir.

Buna rağmen eskisini görüyorsanız dosya klasöre gerçekten düşmemiştir —
klasör OneDrive altında olduğu için eşitleme takılmış olabilir. Dosyanın
tarihine ve boyutuna bakın.

## Bir görseli geri almak

Dosyayı klasörden silin. Site o oyunun eski simgesine (emoji ya da mevcut
görsele) kendiliğinden geri döner.

## Nerede görünür

Bir oyunun görseli **altı yerde birden** çıkar: Eğlence sayfasındaki oyun
listesi, açılan oyunun başlık çubuğu, oyunun kendi turuncu şeridi, ana
sayfadaki oyun kutucukları, üst menüdeki "EĞLENCE" açılır listesi ve
soldaki çekmece menüsü.

Hiçbirine dosya adı gömülü değil: hepsi oyunun kimliğinden gidiyor (ana
sayfa kutucukları bağlantıdaki çengelden, `eglence.html#duello`; oyun
şeritleri bölümün `id` özniteliğinden). Bu yüzden klasöre tek dosya
bırakmak altısı için de yeterli, HTML'e dokunmak gerekmiyor.
