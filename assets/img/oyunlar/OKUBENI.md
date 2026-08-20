# Oyun kapak görselleri

Bu klasöre bir oyunun görselini koyduğunuzda site onu **kendiliğinden**
kullanmaya başlar. Kod değiştirmek, sunucuyu yeniden başlatmak ya da yeni
dağıtım yapmak gerekmez — en fazla bir dakika içinde görünür.

## Dosya adı = oyunun kimliği

Dosyanın adı aşağıdaki **kimlik** sütunundaki yazının aynısı olmalı.
Oyunun görünen adı değil, kimliği. (Kahraman portrelerinde Türkçe ada göre
adlandırma yüzünden yanlış kart gösterilmişti; burada aynı hataya düşmemek
için kimlik kullanılıyor.)

| Kimlik → dosya adı | Oyun | Şu anki simge |
|---|---|---|
| `gunun` | Günün Kartı | 🎯 |
| `yarisma` | Tokmak Yarışması | tokmak logosu |
| `duello` | Deste Düellosu | ⚔️ |
| `eksik` | Eksik Kartı Bul | 🧩 |
| `kapisma` | Kart Kapışması | 🥊 |
| `deste` | Deste Jeneratörü | 🧪 |
| `siralama` | Kart Sıralama Oyunu | 🎲 |
| `tahmin` | Kart Tahmin Oyunu | 🔮 |
| `cark` | Rastgele Deste Çarkı | 🎡 |
| `cenabet` | Cenabet Buton | yeşil düğme çizimi |

Örnek: Günün Kartı için `gunun.png`, Deste Düellosu için `duello.webp`.

## Kabul edilen uzantılar

`png` · `webp` · `jpg` · `jpeg` · `gif` — bu sırayla bakılır. Aynı oyun için
birden fazla uzantı varsa listedeki ilk bulunan kullanılır, o yüzden tek
dosya bırakmak en temizi.

## Görsel nasıl olmalı

- **Kare ya da kareye yakın** en iyisi. Oyun listesindeki kutu kare;
  geniş bir görsel de bozulmadan sığar ama küçük görünür.
- Arka planı **saydam PNG** ya da koyu zemine uyan bir renk olsun; sitenin
  varsayılan teması koyu. Beyaz zeminli bir görsel kutu gibi durur.
- 256×256 piksel fazlasıyla yeterli; daha büyüğü boşuna yer kaplar.

## Bir görseli geri almak

Dosyayı klasörden silin. Site o oyunun eski simgesine (emoji ya da mevcut
görsele) kendiliğinden geri döner.

## Nerede görünür

Bir oyunun görseli dört yerde birden çıkar: Eğlence sayfasındaki oyun
listesi, açılan oyunun başlığı, üst menüdeki "EĞLENCE" açılır listesi ve
soldaki çekmece menüsü. Hepsi aynı kaynaktan okuduğu için tek dosya
koymanız yeterli.
