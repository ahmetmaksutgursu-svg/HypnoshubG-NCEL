# Arayüz bölüm kapakları

Bu klasör **oyunlar için değil**, sitenin bölümleri için: Sıralamalar,
Meta Desteler, Son Maçlar gibi. Oyun kapakları `assets/img/oyunlar/`
klasöründe duruyor.

Buraya bir görsel koyduğunuzda site onu **kendiliğinden** kullanmaya
başlar. Kod değiştirmek, sunucuyu yeniden başlatmak ya da yeni dağıtım
yapmak gerekmez — en fazla bir dakika içinde görünür.

## Dosya adı = sayfanın adı

Dosyanın adı, o bölümün **sayfa adı** olmalı — uzantısız hâli.
Örneğin Sıralamalar bölümü `siralamalar.html` sayfası olduğu için
dosya `siralamalar.png` olacak.

Görünen ad değil sayfa adı kullanılıyor. Türkçe adla eşleştirmek daha
kolay görünüyor ama kırılgan: ad değiştiğinde ya da iki dilde farklı
yazıldığında eşleşme sessizce bozuluyor. (Kahraman portrellerinde tam
bunun yüzünden yanlış kart gösterilmişti.)

| Dosya adı | Bölüm | Şu anki simge |
|---|---|---|
| `siralamalar` | Sıralamalar — Nihai Kademe & Türkiye | 🏆 |
| `klanlar` | Klan Liderlik Tablosu | 🛡️ |
| `canli` | Son Maçlar | 🔴 |
| `meta` | Meta Desteler | 🃏 |
| `anti` | Anti Deste | 🛡️ |
| `kartlar` | Kartlar | 📇 |
| `oyuncu` | Oyuncu Analizi | 👤 |
| `klan` | Klan Arama | 🔍 |
| `guncellemeler` | Güncellemeler | 📢 |
| `hakkinda` | Hakkımızda | ℹ️ |
| `index` | Ana Sayfa | 🏠 |

Örnek: Meta Desteler için `meta.png`, Son Maçlar için `canli.webp`.

Hepsini birden koymak zorunda değilsiniz. Koymadığınız bölüm eski
simgesiyle kalır.

## Kabul edilen uzantılar

`png` · `webp` · `jpg` · `jpeg` · `gif` — bu sırayla bakılır. Aynı bölüm
için birden fazla uzantı varsa listedeki ilk bulunan kullanılır, o yüzden
tek dosya bırakmak en temizi.

## Görsel nasıl olmalı

- **Kare** olsun. Kutular kare; dikey bir görsel sığar ama çok küçük
  kalır.
- **256×256 piksel yeterli, daha büyüğünü yüklemeyin.** Görseller ekranda
  40–46 piksellik kutularda çiziliyor. Oyun kapaklarında bir kez
  1254×1254 ve tanesi 1,2–2,3 MB dosyalar konmuştu: on kapak için 8,8 MB,
  yani her ziyaretçiye boşuna inen megabaytlar. 256×256'ya küçültülünce
  toplam 914 KB'a düştü — aynı görüntü, onda bir yük.
- Arka planı **saydam PNG** ya da koyu zemine uyan bir renk olsun;
  sitenin varsayılan teması koyu.
- Bu kapaklar oyun kapaklarının yanında görünüyor (ana sayfadaki aynı
  ızgarada). Aynı üslupta olmaları listeyi derli toplu tutar.

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

Dosyayı klasörden silin. Site o bölümün eski simgesine kendiliğinden
geri döner.

## Nerede görünür

Bir bölümün görseli **üç yerde birden** çıkar: ana sayfadaki bölüm
kutucukları, soldaki çekmece menüsü ve üst menüdeki açılır listeler.

Hiçbirine dosya adı gömülü değil: hepsi bağlantı adresinden gidiyor.
Bu yüzden klasöre tek dosya bırakmak üçü için de yeterli, HTML'e
dokunmak gerekmiyor.
