export type KeywordCategory = 'silhouette' | 'material' | 'print' | 'color' | 'style' | 'item';

export interface FashionKeyword {
  keyword: string;
  category: KeywordCategory;
  aliases?: string[]; // 동의어/변형
}

export const FASHION_KEYWORDS: FashionKeyword[] = [
  // ── 실루엣 (Silhouette) ──
  { keyword: 'oversized', category: 'silhouette', aliases: ['oversize', 'oversizedfit', 'oversizedlook'] },
  { keyword: 'slim', category: 'silhouette', aliases: ['slimfit', 'slim-fit'] },
  { keyword: 'fitted', category: 'silhouette', aliases: ['fittedstyle', 'bodyfit'] },
  { keyword: 'relaxed', category: 'silhouette', aliases: ['relaxedfit'] },
  { keyword: 'boxy', category: 'silhouette', aliases: ['boxyfit', 'boxystyle'] },
  { keyword: 'cropped', category: 'silhouette', aliases: ['croptop', 'cropstyle'] },
  { keyword: 'flared', category: 'silhouette', aliases: ['flare', 'flaredpants', 'flaredskirt'] },
  { keyword: 'wide-leg', category: 'silhouette', aliases: ['wideleg', 'widelegpants', 'wideleg'] },
  { keyword: 'straight', category: 'silhouette', aliases: ['straightleg', 'straightcut', 'straightfit'] },
  { keyword: 'tapered', category: 'silhouette', aliases: ['taperedpants', 'taperedleg'] },
  { keyword: 'balloon', category: 'silhouette', aliases: ['balloonsleeve', 'balloonpants'] },
  { keyword: 'a-line', category: 'silhouette', aliases: ['aline', 'alineskirt', 'alinedress'] },
  { keyword: 'bodycon', category: 'silhouette', aliases: ['bodycon', 'bodyconfit', 'bodycondress'] },
  { keyword: 'wrap', category: 'silhouette', aliases: ['wrapstyle', 'wrapdress', 'wrapskirt'] },
  { keyword: 'mini', category: 'silhouette', aliases: ['miniskirt', 'minidress', 'minilength'] },
  { keyword: 'midi', category: 'silhouette', aliases: ['midiskirt', 'mididress', 'midilength'] },
  { keyword: 'maxi', category: 'silhouette', aliases: ['maxiskirt', 'maxidress', 'maxilength'] },

  // ── 소재 (Material) ──
  { keyword: 'denim', category: 'material', aliases: ['jeans', 'denimjacket', 'denimskirt'] },
  { keyword: 'leather', category: 'material', aliases: ['faux leather', 'leatherpants', 'leatherjacket', 'fauxleather', 'veganleather'] },
  { keyword: 'velvet', category: 'material', aliases: ['velvetdress', 'velvetblazor'] },
  { keyword: 'linen', category: 'material', aliases: ['linenset', 'linenshirt', 'linenpants'] },
  { keyword: 'cotton', category: 'material', aliases: ['cottonbasic', 'cottonshirt'] },
  { keyword: 'silk', category: 'material', aliases: ['silkdress', 'silkblouse', 'silkskirt'] },
  { keyword: 'satin', category: 'material', aliases: ['satindress', 'satinblouse', 'satinslip'] },
  { keyword: 'chiffon', category: 'material', aliases: ['chiffondress', 'chiffonblouse'] },
  { keyword: 'knit', category: 'material', aliases: ['knitwear', 'knitsweater', 'knitdress', 'knitset'] },
  { keyword: 'wool', category: 'material', aliases: ['woolcoat', 'woolen', 'woolblend'] },
  { keyword: 'fleece', category: 'material', aliases: ['fleecejacket', 'polarfleece'] },
  { keyword: 'nylon', category: 'material', aliases: ['nylonbag', 'nylonpants'] },
  { keyword: 'mesh', category: 'material', aliases: ['meshtop', 'meshdress', 'meshlayer'] },
  { keyword: 'tweed', category: 'material', aliases: ['tweedjacket', 'tweedskirt', 'tweedset'] },
  { keyword: 'corduroy', category: 'material', aliases: ['corduroypants', 'corduroy'] },
  { keyword: 'suede', category: 'material', aliases: ['suedeboots', 'suedecoat'] },
  { keyword: 'cashmere', category: 'material', aliases: ['cashmeresweater', 'cashmereknit'] },
  { keyword: 'sequin', category: 'material', aliases: ['sequindress', 'sequintop', 'sequinoutfit'] },
  { keyword: 'lace', category: 'material', aliases: ['lacedress', 'lacetop', 'lacetrim'] },
  { keyword: 'sheer', category: 'material', aliases: ['sheertop', 'sheerdress', 'sheerfabric'] },

  // ── 프린트 (Print) ──
  { keyword: 'floral', category: 'print', aliases: ['floralprint', 'flowerprint', 'floraldress', 'floralskirt'] },
  { keyword: 'stripe', category: 'print', aliases: ['stripes', 'striped', 'stripedshirt', 'stripedtop'] },
  { keyword: 'plaid', category: 'print', aliases: ['tartan', 'plaidskirt', 'plaidpants'] },
  { keyword: 'check', category: 'print', aliases: ['checked', 'checkered', 'gingham', 'ginghamprint'] },
  { keyword: 'animal print', category: 'print', aliases: ['animalprint', 'leopardprint', 'snakeskin', 'zebraprint'] },
  { keyword: 'leopard', category: 'print', aliases: ['leopardspot', 'leopardpattern'] },
  { keyword: 'zebra', category: 'print', aliases: ['zebrastripe', 'zebrapattern'] },
  { keyword: 'paisley', category: 'print', aliases: ['paisleyprint', 'paisleypattern'] },
  { keyword: 'abstract', category: 'print', aliases: ['abstractprint', 'abstractpattern'] },
  { keyword: 'graphic', category: 'print', aliases: ['graphictee', 'graphicprint', 'graphicshirt'] },
  { keyword: 'tie-dye', category: 'print', aliases: ['tiedye', 'tiedyeprint'] },
  { keyword: 'camouflage', category: 'print', aliases: ['camo', 'camoprint', 'camoflage'] },
  { keyword: 'polka dot', category: 'print', aliases: ['polkadot', 'dots', 'dotprint'] },
  { keyword: 'houndstooth', category: 'print', aliases: ['houndstoothprint', 'houndstoothpattern'] },
  { keyword: 'geometric', category: 'print', aliases: ['geometricprint', 'geometricpattern'] },

  // ── 컬러 (Color) ──
  { keyword: 'black', category: 'color', aliases: ['allblack', 'blackoutfit', 'blackstyle', 'blackfashion'] },
  { keyword: 'white', category: 'color', aliases: ['allwhite', 'whiteoutfit', 'cleanwhite'] },
  { keyword: 'beige', category: 'color', aliases: ['beigelook', 'neutralbeige', 'beigestyle'] },
  { keyword: 'brown', category: 'color', aliases: ['brownstyle', 'chocolate', 'caramel'] },
  { keyword: 'camel', category: 'color', aliases: ['camelcoat', 'camelcolor', 'cameloutfit'] },
  { keyword: 'navy', category: 'color', aliases: ['navyblue', 'navyoutfit'] },
  { keyword: 'blue', category: 'color', aliases: ['bluedress', 'bluestyle'] },
  { keyword: 'red', category: 'color', aliases: ['redoutfit', 'reddress', 'redstyle'] },
  { keyword: 'pink', category: 'color', aliases: ['pinkoutfit', 'pinkstyle', 'hotpink', 'babypink', 'dustypink'] },
  { keyword: 'green', category: 'color', aliases: ['greenoutfit', 'sage', 'emerald', 'forest green', 'forestgreen'] },
  { keyword: 'yellow', category: 'color', aliases: ['yellowoutfit', 'butteryellow', 'pastel yellow'] },
  { keyword: 'orange', category: 'color', aliases: ['orangestyle', 'terracotta', 'rust'] },
  { keyword: 'purple', category: 'color', aliases: ['purpleoutfit', 'lavender', 'lilac', 'violet', 'mauve'] },
  { keyword: 'grey', category: 'color', aliases: ['gray', 'greyoutfit', 'greystone', 'charcoal'] },
  { keyword: 'burgundy', category: 'color', aliases: ['wine', 'bordeaux', 'marsala'] },
  { keyword: 'olive', category: 'color', aliases: ['olivedrab', 'olivestyle', 'militarygreen'] },
  { keyword: 'cream', category: 'color', aliases: ['ivory', 'offwhite', 'creamy', 'eggshell'] },
  { keyword: 'nude', category: 'color', aliases: ['nudelook', 'nudeshade', 'skintone'] },
  { keyword: 'coral', category: 'color', aliases: ['coralpink', 'coraloutfit'] },
  { keyword: 'mint', category: 'color', aliases: ['mintgreen', 'mintstyle', 'seafoam'] },

  // ── 스타일 (Style) ──
  { keyword: 'casual', category: 'style', aliases: ['casualstyle', 'casuallook', 'casualoutfit', 'casualwear'] },
  { keyword: 'streetwear', category: 'style', aliases: ['streetstyle', 'streetfashion', 'streetwear'] },
  { keyword: 'minimalist', category: 'style', aliases: ['minimalism', 'minimalstyle', 'minimalfashion', 'minimalisticstyle'] },
  { keyword: 'bohemian', category: 'style', aliases: ['boho', 'bohostyle', 'bohofashion', 'bohochic'] },
  { keyword: 'vintage', category: 'style', aliases: ['vintagestyle', 'vintagefashion', 'retro', 'retrostyle', 'thrifted'] },
  { keyword: 'preppy', category: 'style', aliases: ['preppystyle', 'preppylook', 'campusstyle'] },
  { keyword: 'athleisure', category: 'style', aliases: ['sporty', 'sportychic', 'athleticwear', 'fitcheck'] },
  { keyword: 'romantic', category: 'style', aliases: ['romantickstyle', 'feminine', 'femininelook', 'girly', 'girlyfashion'] },
  { keyword: 'edgy', category: 'style', aliases: ['edgystyle', 'darkfashion', 'alternativestyle'] },
  { keyword: 'chic', category: 'style', aliases: ['chicstyle', 'chicoutfit', 'chiclook'] },
  { keyword: 'Y2K', category: 'style', aliases: ['y2kfashion', 'y2kstyle', '2000sfashion', '90sfashion', '00sfashion'] },
  { keyword: 'cottagecore', category: 'style', aliases: ['cottagestyle', 'cottagefashion', 'fairycore'] },
  { keyword: 'dark academia', category: 'style', aliases: ['darkacademia', 'academia', 'academicstyle'] },
  { keyword: 'gorpcore', category: 'style', aliases: ['gorpcorestye', 'outdoorstyle', 'techoutdoor'] },
  { keyword: 'quiet luxury', category: 'style', aliases: ['quietluxury', 'oldmoney', 'oldmoneystyle', 'luxurystyle', 'understatedluxury'] },
  { keyword: 'coastal grandmother', category: 'style', aliases: ['coastalgrandmother', 'coastalstyle', 'summerstyle'] },
  { keyword: 'coquette', category: 'style', aliases: ['coquettestyle', 'coquettefashion', 'babygirlstyle'] },
  { keyword: 'clean girl', category: 'style', aliases: ['cleangirl', 'cleangirlstyle', 'cleangirlesthetic', 'no-makeup-makeup'] },
  { keyword: 'mob wife', category: 'style', aliases: ['mobwife', 'mobwifestyle', 'mobwifeaesthetic', 'glamourous'] },
  { keyword: 'balletcore', category: 'style', aliases: ['ballet', 'ballerina', 'balletinspired'] },
  { keyword: 'western', category: 'style', aliases: ['westernstyle', 'cowgirl', 'cowboystyle', 'cowboyboots'] },

  // ── 아이템 (Item) ──
  { keyword: 'dress', category: 'item', aliases: ['dresses', 'summerdress', 'casualdress'] },
  { keyword: 'skirt', category: 'item', aliases: ['miniskirt', 'maxiskirt', 'midiskirt', 'skirtoutfit'] },
  { keyword: 'pants', category: 'item', aliases: ['trousers', 'widelegpants', 'tailoredpants'] },
  { keyword: 'jeans', category: 'item', aliases: ['denim', 'skinnjeans', 'widelegjeans', 'straightjeans', 'momjeans'] },
  { keyword: 'shorts', category: 'item', aliases: ['shortshorts', 'denimsshorts', 'cyclingshorts', 'bermuda'] },
  { keyword: 'blazer', category: 'item', aliases: ['blazerstyle', 'oversziedblazer', 'powerblazer'] },
  { keyword: 'jacket', category: 'item', aliases: ['deniimjacket', 'leatherjacket', 'bombjacket', 'bomberjacket', 'cropedjacket'] },
  { keyword: 'coat', category: 'item', aliases: ['trenchcoat', 'woolcoat', 'overcoat', 'coatseason', 'longcoat'] },
  { keyword: 'shirt', category: 'item', aliases: ['buttondown', 'oxfordshirt', 'overshirt', 'checkshirt'] },
  { keyword: 'blouse', category: 'item', aliases: ['blousestyle', 'silkblouse', 'peasantblouse'] },
  { keyword: 'sweater', category: 'item', aliases: ['pullover', 'knitwear', 'crewneck', 'vnecksweater'] },
  { keyword: 'hoodie', category: 'item', aliases: ['hoodiestyle', 'zipuphoodie', 'oversizedhoodie'] },
  { keyword: 'cardigan', category: 'item', aliases: ['cardiganstyle', 'longcardigan', 'crochetcardigan'] },
  { keyword: 'tank top', category: 'item', aliases: ['tanktop', 'sleeveless', 'camisole', 'spaghetti'] },
  { keyword: 'crop top', category: 'item', aliases: ['croptop', 'corset', 'bustier', 'bandeau'] },
  { keyword: 'bodysuit', category: 'item', aliases: ['bodysuitoutfit', 'bodysuitlook'] },
  { keyword: 'jumpsuit', category: 'item', aliases: ['jumpsuitoutfit', 'romper', 'playsuit', 'overalls'] },
  { keyword: 'trench coat', category: 'item', aliases: ['trenchcoat', 'trenchstyle'] },
  { keyword: 'puffer jacket', category: 'item', aliases: ['puffer', 'pufferjacket', 'downcoat', 'paddedjacket'] },
  { keyword: 'boots', category: 'item', aliases: ['ankleboot', 'kneehighboots', 'cowboyboots', 'chelseaboots'] },
  { keyword: 'sneakers', category: 'item', aliases: ['trainers', 'sneakerstyle', 'kicks', 'sneakerhead'] },
  { keyword: 'heels', category: 'item', aliases: ['stiletto', 'kitten heel', 'blockheels', 'pumps', 'mules'] },
  { keyword: 'loafers', category: 'item', aliases: ['loafershoes', 'pennyloafer', 'horsebitloafer'] },
  { keyword: 'sandals', category: 'item', aliases: ['strapadnals', 'flatshoes', 'sandalsseason'] },
  { keyword: 'bag', category: 'item', aliases: ['handbag', 'shoulderbag', 'minibag', 'bucketbag', 'sachet'] },
  { keyword: 'tote bag', category: 'item', aliases: ['totebag', 'canvastote', 'carryall'] },
  { keyword: 'crossbody', category: 'item', aliases: ['crossbodybag', 'shoulderstrap', 'messengerbag'] },
  { keyword: 'vest', category: 'item', aliases: ['waistcoat', 'puffervest', 'knitvest', 'denimvest'] },
  { keyword: 'co-ord', category: 'item', aliases: ['coord', 'matchingset', 'twopieces', 'twinset', 'coordinatedset'] },
];

// 빠른 검색을 위한 플랫 맵 (소문자 키 → keyword 객체)
export const KEYWORD_LOOKUP = new Map<string, FashionKeyword>();
for (const kw of FASHION_KEYWORDS) {
  KEYWORD_LOOKUP.set(kw.keyword.toLowerCase(), kw);
  for (const alias of kw.aliases ?? []) {
    KEYWORD_LOOKUP.set(alias.toLowerCase(), kw);
  }
}

/**
 * 텍스트에서 매칭된 패션 키워드들을 반환한다.
 * @param texts 검색할 텍스트 배열 (hashtags, caption, trend_name 등)
 * @returns 매칭된 FashionKeyword 배열 (중복 제거, keyword 기준)
 */
export function matchKeywords(texts: (string | null | undefined)[]): FashionKeyword[] {
  const combined = texts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[#@]/g, ' '); // 해시태그/멘션 기호 제거

  const found = new Map<string, FashionKeyword>();

  for (const [term, kw] of KEYWORD_LOOKUP) {
    // 단어 경계 또는 연속된 문자열 안에서 매칭 (해시태그는 붙어있는 경우가 많음)
    if (combined.includes(term)) {
      found.set(kw.keyword, kw);
    }
  }

  return Array.from(found.values());
}
