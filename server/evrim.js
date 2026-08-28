/* ============================================================
   HYPNOSHUB — "BU KARTIN EVRİMİ VAR MI?"
   ------------------------------------------------------------
   TEK DOĞRU BURADA. Bu soru üç ayrı yerde ayrı ayrı cevaplanıyordu
   ve kopyalar birbirinden ayrışıyordu; ölçüt tek yere alındı.

   ------------------------------------------------------------
   maxEvolutionLevel BİR SAYI DEĞİL, BİT MASKESİ

   Bu alan "kaçıncı evrim seviyesi" sanılıyor; DEĞİL. ÖLÇÜLDÜ,
   122 kartın tamamında:

     değer │ kart │ evrim çizimi │ kahraman çizimi
       1   │  37  │      37      │       0
       2   │  12  │       0      │      12
       3   │   4  │       4      │       4

   Yani 1. bit EVRİM, 2. bit KAHRAMAN. Üçü olan kartta ikisi de var.
   `maxEvolutionLevel & 1` ile evrim çizimi BİREBİR örtüşüyor (41=41).

   ------------------------------------------------------------
   BU DOSYA BİR KEZ YANLIŞ YAZILDI — sebebi burada dursun

   Kısa bir süre ölçüt "maxEvolutionLevel >= 1" yapıldı. Gerekçe:
   oyuncu verisindeki `evolutionLevel` alanı 54 kartta doluydu, oysa
   evrim çizimi 41 kartta vardı; aradaki 13 kart "çizimi gecikmiş
   evrimler" sanıldı.

   YANLIŞTI. `evolutionLevel` oyuncunun o kartta bu mekaniği açtığını
   söylüyor — ve mekanik EVRİM DE OLABİLİR KAHRAMAN DA. Yaramaz,
   Mega Minyon, Balon gibi kartlarda o alan doluydu ama kartların
   evrimi yok, KAHRAMANI var (maxEvolutionLevel = 2).

   Kullanıcı yakaladı: "evrim slotunda Yaramaz gibi kahraman olan
   kartlar çıkıyor". Sayının 54 çıkması gerçekti, yorumu yanlıştı.

   DERS: `evolutionLevel` tek başına evrim kanıtı değil. Kartın
   evrimi olup olmadığı KART verisinden okunur, oyuncu verisinden
   yalnızca "açmış mı" sorusu cevaplanır — ve o soru ancak kartın
   evrimi olduğu bilindikten sonra anlamlı.

   ------------------------------------------------------------
   ELLE EKLENENLER

   Elit Barbarlar'da `maxEvolutionLevel` hiç gelmiyor ve çizim de
   yok, ama evrim yayımlanmış (oyuncu verisinde `evolutionLevel`
   var ve kartın kahramanı YOK — yani o alan ancak evrimden
   gelebilir). Fırın'ın tür değişikliğinde de benzer bir gecikme
   yaşanmıştı.

   Buraya yazılan kart evrimli sayılır. API yetişince satır
   silinebilir. API adı yazılıyor (Türkçesi değil).
   ============================================================ */

const ELLE = new Set([
  "Elite Barbarians",        // Elit Barbarlar — evrim yayımlandı, kart listesi yetişmedi
]);

/* Bit maskesindeki EVRİM biti. */
const EVRIM_BIT = 1;
/* Bit maskesindeki KAHRAMAN biti — evrimle karışmasın diye adı konuldu. */
const KAHRAMAN_BIT = 2;

/* CR API'nin /cards ya da /players yanıtındaki bir kart nesnesi. */
function evrimiVar(c) {
  if (!c) return false;
  if (ELLE.has(c.name)) return true;
  return (Number(c.maxEvolutionLevel) & EVRIM_BIT) === EVRIM_BIT;
}

/* Kartın KAHRAMANI var mı — ayrı bir soru, ayrı bit. */
function kahramaniVar(c) {
  if (!c) return false;
  if (c.iconUrls && c.iconUrls.heroMedium) return true;
  return (Number(c.maxEvolutionLevel) & KAHRAMAN_BIT) === KAHRAMAN_BIT;
}

/* Oyuncu bu kartın EVRİMİNİ açmış mı?

   İki şart birden: kartın evrimi OLACAK ve oyuncuda `evolutionLevel`
   bulunacak. Tek başına ikincisi yetmiyor — kahraman açılışında da
   doluyor (yukarıdaki ders). */
function evrimAcik(oyuncuKarti) {
  return evrimiVar(oyuncuKarti) && Number(oyuncuKarti && oyuncuKarti.evolutionLevel) >= 1;
}

/* Evrim ÇİZİMİ yayımlanmış mı — görsel seçerken buna bakılır,
   "evrimi var mı" sorusuna DEĞİL. */
const evrimCizimi = (c) => (c && c.iconUrls && c.iconUrls.evolutionMedium) || "";

module.exports = { evrimiVar, kahramaniVar, evrimAcik, evrimCizimi, ELLE };
