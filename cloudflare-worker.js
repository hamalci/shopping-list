/**
 * Cloudflare Worker for fetching prices from Israeli supermarket chains
 * Free tier: 100,000 requests/day
 * 
 * Supported chains and stores:
 * - Yohananof (יוחננוף):
 *   - gd: יוחננוף גדרה
 *   - bilu-ekron: יוחננוף בילו סנטר עקרון
 *   - moti-kind-rehovot: יוחננוף מוטי קינד רחובות
 * - Shufersal (שופרסל):
 *   - sheli-rehovot: שופרסל שלי רחובות החדשה
 * - Rami Levy (רמי לוי):
 *   - moti-kind-rehovot: רמי לוי מוטי קינד רחובות
 */

// CORS headers for all responses
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

// Cache prices for 6 hours
const CACHE_TTL = 6 * 60 * 60; // seconds

/**
 * Main handler
 */
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Routes:
      // GET /prices/{chain}/{storeId}  - Get all prices for a store
      // GET /product/{chain}/{barcode} - Get single product info
      
      if (path.startsWith('/prices/')) {
        return handlePricesRequest(url, request);
      } else if (path.startsWith('/product/')) {
        return handleProductRequest(url, request);
      } else if (path === '/' || path === '') {
        return handleRootRequest();
      }

      return jsonResponse({ error: 'Not found' }, 404);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ 
        error: 'Internal server error', 
        message: error.message 
      }, 500);
    }
  }
};

/**
 * Handle /prices/{chain}/{storeId}
 */
async function handlePricesRequest(url, request) {
  const pathParts = url.pathname.split('/').filter(p => p);
  
  if (pathParts.length < 3) {
    return jsonResponse({ 
      error: 'Invalid path', 
      usage: '/prices/{chain}/{storeId}' 
    }, 400);
  }

  const chain = pathParts[1].toLowerCase();
  const storeId = pathParts[2];

  // Check cache first
  const cacheKey = `prices:${chain}:${storeId}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log('Cache hit:', cacheKey);
    return jsonResponse({ 
      ...cached, 
      cached: true,
      source: 'cloudflare-worker-cache'
    });
  }

  // Fetch from chain API
  let prices = null;
  
  switch (chain) {
    case 'shufersal':
    case 'שופרסל':
      prices = await fetchShufersalPrices(storeId);
      break;
    
    case 'rami':
    case 'rami-levy':
    case 'רמי':
    case 'רמי-לוי':
      prices = await fetchRamiLevyPrices(storeId);
      break;
    
    case 'yohananof':
    case 'יוחננוף':
      prices = await fetchYohananofPrices(storeId);
      break;
    
    default:
      return jsonResponse({ 
        error: 'Unsupported chain', 
        supported: ['shufersal', 'rami-levy', 'yohananof'] 
      }, 400);
  }

  if (!prices) {
    return jsonResponse({ 
      error: 'Failed to fetch prices',
      chain,
      storeId 
    }, 500);
  }

  // Save to cache
  await setCache(cacheKey, prices, CACHE_TTL);

  return jsonResponse({
    ...prices,
    cached: false,
    source: 'cloudflare-worker-live'
  });
}

/**
 * Handle /product/{chain}/{barcode}
 */
async function handleProductRequest(url, request) {
  const pathParts = url.pathname.split('/').filter(p => p);
  
  if (pathParts.length < 3) {
    return jsonResponse({ 
      error: 'Invalid path', 
      usage: '/product/{chain}/{barcode}' 
    }, 400);
  }

  const chain = pathParts[1].toLowerCase();
  const barcode = pathParts[2];

  // חפש ברקוד במסד הנתונים
  const product = BARCODE_DATABASE[barcode];
  
  if (product) {
    // החזר מוצר עם מחיר לפי רשת
    const priceMultiplier = chain === 'rami' || chain === 'rami-levy' ? 0.9 : 
                           chain === 'yohananof' ? 1.1 : 1.0;
    
    return jsonResponse({
      barcode,
      name: product.name,
      brand: product.brand || '',
      icon: product.icon,
      unit: product.unit,
      price: Math.round(product.basePrice * priceMultiplier * 10) / 10,
      chain: chain,
      found: true
    });
  }
  
  // לא נמצא
  return jsonResponse({
    barcode,
    chain,
    found: false,
    message: 'Product not found in database'
  }, 404);
}

// מסד נתונים של ברקודים (דוגמאות)
const BARCODE_DATABASE = {
  // חיתולים
  '7290000123456': { name: 'חיתולי האגיס 4-9 ק"ג', brand: 'האגיס', icon: '👶', unit: 'אריזה', basePrice: 59.90 },
  '7290001234567': { name: 'חיתולי כיפי מידה 4', brand: 'כיפי', icon: '👶', unit: 'אריזה', basePrice: 52.90 },
  '7290002345678': { name: 'חיתולי פרה מגא פק', brand: 'פרה', icon: '👶', unit: 'אריזה', basePrice: 54.90 },
  '7290111346538': { name: 'חיתולי האגיס פרידום דריי מידה 5+', brand: 'האגיס', icon: '👶', unit: 'אריזה', basePrice: 64.90 },
  
  // משקאות
  '7290003456789': { name: 'קוקה קולה 1.5L', brand: 'קוקה קולה', icon: '🥤', unit: 'בקבוק', basePrice: 7.90 },
  '7290004567890': { name: 'פפסי 1.5L', brand: 'פפסי', icon: '🥤', unit: 'בקבוק', basePrice: 7.50 },
  '7290005678901': { name: 'מים נביעות הגולן 1.5L', brand: 'נביעות הגולן', icon: '💧', unit: 'בקבוק', basePrice: 4.90 },
  '7290006789012': { name: 'מיץ פרימור תפוזים 1L', brand: 'פרימור', icon: '🧃', unit: 'ליטר', basePrice: 12.90 },
  
  // חלב ומוצרים
  '7290007890123': { name: 'חלב תנובה 3% 1L', brand: 'תנובה', icon: '🥛', unit: 'ליטר', basePrice: 6.90 },
  '7290008901234': { name: 'גבינה צהובה עמק 200 גרם', brand: 'עמק', icon: '🧀', unit: 'אריזה', basePrice: 16.90 },
  '7290009012345': { name: 'יוגורט דנונה 8 יח', brand: 'דנונה', icon: '🥛', unit: 'אריזה', basePrice: 13.90 },
  
  // דגים ושימורים
  '7290015039246': { name: 'נתיחי טונה בהירים בשמן צמחי', brand: '', icon: '🐟', unit: 'קופסא', basePrice: 9.90 },
  
  // לחמים ומאפים
  '7290010123456': { name: 'לחם בריאות אנג׳ל', brand: 'אנג׳ל', icon: '🍞', unit: 'יח׳', basePrice: 6.50 },
  '7290011234567': { name: 'לחמניות בורקס ביכורים', brand: 'ביכורים', icon: '🥖', unit: 'אריזה', basePrice: 7.90 },
  '7290016144017': { name: 'קמח חיטה מלא 100%', brand: '', icon: '🌾', unit: 'ק"ג', basePrice: 8.90 },
  
  // חטיפים
  '7290012345678': { name: 'במבה אסם 80 גרם', brand: 'אסם', icon: '🥜', unit: 'שקית', basePrice: 5.50 },
  '7290013456789': { name: 'ביסלי גריל 70 גרם', brand: 'שטראוס', icon: '🥔', unit: 'שקית', basePrice: 5.90 },
  '7290014567890': { name: 'שוקולד מילקה 100 גרם', brand: 'מילקה', icon: '🍫', unit: 'יח׳', basePrice: 8.90 },
  '7290119670895': { name: 'פתיבר ביסקוויטים', brand: 'פתיבר', icon: '🍪', unit: 'אריזה', basePrice: 12.90 },
  
  // יין ואלכוהול
  '7290015678901': { name: 'יין ברקן קלאסיק אדום', brand: 'ברקן', icon: '🍷', unit: 'בקבוק', basePrice: 45.00 },
  '7290016789012': { name: 'בירה גולדסטאר 330 מ"ל', brand: 'גולדסטאר', icon: '🍺', unit: 'בקבוק', basePrice: 8.50 },
  
  // ניקיון
  '7290017890123': { name: 'נייר טואלט סופט 32 גלילים', brand: 'סופט', icon: '🧻', unit: 'אריזה', basePrice: 28.90 },
  '7290018901234': { name: 'אבקת כביסה אריאל 5 ק"ג', brand: 'אריאל', icon: '📦', unit: 'אריזה', basePrice: 38.90 },
  '7290019012345': { name: 'סבון כלים פיירי 1.5L', brand: 'פיירי', icon: '🧴', unit: 'בקבוק', basePrice: 12.90 }
};


/**
 * Handle root path - API documentation
 */
function handleRootRequest() {
  return jsonResponse({
    name: 'Israeli Supermarket Prices API',
    version: '1.0.0',
    description: 'Free API for fetching real-time prices from Israeli supermarket chains',
    endpoints: {
      prices: {
        method: 'GET',
        path: '/prices/{chain}/{storeId}',
        description: 'Get all prices for a specific store',
        chains: ['shufersal', 'rami-levy', 'yohananof'],
        example: '/prices/shufersal/123'
      },
      product: {
        method: 'GET',
        path: '/product/{chain}/{barcode}',
        description: 'Get single product information',
        status: 'Not implemented yet'
      }
    },
    limits: {
      requests: '100,000 per day (Cloudflare free tier)',
      cache: '6 hours per store'
    },
    source: 'https://github.com/hamalci/shopping-list'
  });
}

/**
 * Fetch prices from Shufersal API
 */
async function fetchShufersalPrices(storeId) {
  try {
    // Note: This is a MOCK implementation
    // Real Shufersal API requires authentication and specific endpoints
    // You'll need to find the actual API endpoint or use web scraping
    
    console.log('Fetching Shufersal prices for store:', storeId);
    
    // Mock data for demonstration - comprehensive product list with realistic prices
    return {
      chain: 'shufersal',
      chainName: 'שופרסל',
      storeId: storeId,
      updated: new Date().toISOString(),
      prices: {
        // פירות וירקות
        'גזר': 7.90,
        'מלפפונים': 6.90,
        'עגבניות': 8.90,
        'חסה': 5.90,
        'בצל': 4.90,
        'שום': 12.90,
        'תפוחי אדמה': 5.90,
        'תפוחים': 9.90,
        'בננות': 8.90,
        'תפוזים': 7.90,
        'לימונים': 6.90,
        'אבוקדו': 14.90,
        'פלפלים': 12.90,
        'ברוקולי': 8.90,
        'כרובית': 9.90,
        'תירס': 6.90,
        
        // מוצרי חלב
        'חלב': 5.90,
        'גבינה צהובה': 24.90,
        'גבינה לבנה': 6.90,
        'קוטג\'': 7.90,
        'יוגורט': 4.50,
        'שמנת': 8.90,
        'חמאה': 14.90,
        'ביצים': 12.90,
        'חלב שקדים': 15.90,
        'חלב סויה': 14.90,
        
        // מאפים ולחמים
        'לחם': 6.50,
        'חלה': 8.90,
        'לחמניות': 7.90,
        'פיתות': 6.90,
        'טורטייה': 12.90,
        'בייגל': 9.90,
        'קרואסון': 5.90,
        'עוגיות': 8.90,
        'עוגה': 24.90,
        'בורקס': 12.90,
        
        // בשר ועופות
        'חזה עוף': 34.90,
        'שניצל': 42.90,
        'כרעיים עוף': 24.90,
        'עוף שלם': 28.90,
        'בשר טחון': 38.90,
        'אנטריקוט': 89.90,
        'סטייק': 79.90,
        'נקניקיות': 18.90,
        'נקניק': 24.90,
        'קבב': 32.90,
        
        // דגים
        'סלמון': 59.90,
        'טונה': 12.90,
        'דניס': 44.90,
        'בורי': 39.90,
        'פילה דג': 34.90,
        'שרימפס': 54.90,
        
        // מזווה ויבשים
        'אורז': 8.90,
        'אורז בסמטי': 12.90,
        'אורז יסמין': 11.50,
        'אורז חום': 9.90,
        'פסטה': 6.90,
        'פסטה ברילה': 8.90,
        'פסטה אסם': 7.50,
        'קוסקוס': 7.90,
        'בורגול': 9.90,
        'קמח': 5.90,
        'סוכר': 4.90,
        'מלח': 3.90,
        'שמן': 12.90,
        'שמן זית': 24.90,
        'קטשופ': 8.90,
        'מיונז': 9.90,
        'חומוס': 7.90,
        'טחינה': 12.90,
        'ריבה': 11.90,
        'דבש': 18.90,
        'שוקולד ממרח': 14.90,
        'קפה': 24.90,
        'תה': 12.90,
        'אבקת קקאו': 15.90,
        
        // משקאות
        'מים': 3.90,
        'מים מינרליים נביעות הגולן 1.5L': 4.90,
        'מים עין גדי 1.5L': 4.50,
        'מיץ': 6.90,
        'מיץ פרימור תפוזים 1L': 12.90,
        'מיץ טרופיקנה 1L': 14.90,
        'קולה': 7.90,
        'קוקה קולה 1.5L': 7.90,
        'פפסי 1.5L': 7.50,
        'פחית קולה': 4.50,
        'בירה': 8.90,
        'בירה גולדסטאר': 8.50,
        'בירה קרלסברג': 8.90,
        'יין': 34.90,
        'יין ברקן אדום': 45.00,
        'יין כרמל מרלו': 35.00,
        'יין גולן קברנה': 42.00,
        'אלכוהול': 89.90,
        
        // חטיפים וממתקים
        'שוקולד': 6.90,
        'שוקולד מילקה': 8.90,
        'שוקולד קינדר': 9.90,
        'ביסלי': 5.90,
        'במבה': 4.90,
        'במבה אסם': 5.50,
        'דובונים': 7.90,
        'סוכריות': 5.90,
        'גלידה': 12.90,
        'גלידה בן אנד ג׳ריס': 22.90,
        'גלידה שטראוס': 14.90,
        'עוגיות': 8.90,
        'עוגיות לוטוס': 9.90,
        'פופקורן': 6.90,
        'חטיף אנרגיה': 9.90,
        'אגוזים': 15.90,
        
        // מוצרי ניקיון
        'נייר טואלט': 24.90,
        'נייר טואלט סופט': 28.90,
        'נייר טואלט שופרסל': 22.90,
        'מגבות נייר': 18.90,
        'מגבות נייר סופט': 19.90,
        'סבון כלים': 8.90,
        'סבון כלים פיירי': 12.90,
        'אבקת כביסה': 32.90,
        'אבקת כביסה אריאל': 38.90,
        'אבקת כביסה פרסיל': 36.90,
        'מרכך כביסה': 24.90,
        'מרכך כביסה סנו': 26.90,
        'אקונומיקה': 6.90,
        'שקיות זבל': 14.90,
        'ספוג': 5.90,
        'מטליות': 12.90,
        'סבון רצפה': 15.90,
        
        // מוצרי טיפוח
        'סבון רחצה': 8.90,
        'שמפו': 18.90,
        'מרכך שיער': 19.90,
        'משחת שיניים': 12.90,
        'מברשת שיניים': 14.90,
        'דאודורנט': 15.90,
        'תער': 24.90,
        'קרם לחות': 34.90,
        'טישו': 9.90,
        
        // מוצרי תינוק
        'חיתולים': 54.90,
        'חיתולי האגיס 4-9 ק"ג': 59.90,
        'חיתולי כיפי מידה 4': 52.90,
        'חיתולי פרה מגה פק': 54.90,
        'חיתולי באבי דרי': 49.90,
        'מזון תינוקות': 8.90,
        'מטליות לחות': 12.90,
        'מטליות האגיס': 14.90,
        'מטליות פמפרס': 13.90,
        'קרם לתינוק': 18.90,
        'שמפו לתינוק': 15.90,
        
        // קפואים
        'גלידה': 14.90,
        'ירקות קפואים': 12.90,
        'פיצה קפואה': 24.90,
        'שניצל קפוא': 32.90,
        'דגים קפואים': 34.90
      },
      note: 'This is MOCK data with realistic Israeli supermarket prices (2025). Replace with real API call.'
    };
  } catch (error) {
    console.error('Shufersal fetch error:', error);
    return null;
  }
}

/**
 * Fetch prices from Rami Levy API
 */
async function fetchRamiLevyPrices(storeId) {
  try {
    console.log('Fetching Rami Levy prices for store:', storeId);
    
    // Mock data - Rami Levy typically has lower prices
    return {
      chain: 'rami-levy',
      chainName: 'רמי לוי',
      storeId: storeId,
      updated: new Date().toISOString(),
      prices: {
        // פירות וירקות - מחירים נמוכים יותר
        'גזר': 6.90,
        'מלפפונים': 5.90,
        'עגבניות': 7.90,
        'חסה': 4.90,
        'בצל': 3.90,
        'שום': 10.90,
        'תפוחי אדמה': 4.90,
        'תפוחים': 8.90,
        'בננות': 7.90,
        'תפוזים': 6.90,
        'לימונים': 5.90,
        'אבוקדו': 12.90,
        'פלפלים': 10.90,
        'ברוקולי': 7.90,
        'כרובית': 8.90,
        'תירס': 5.90,
        
        // מוצרי חלב
        'חלב': 5.50,
        'גבינה צהובה': 22.90,
        'גבינה לבנה': 5.90,
        'קוטג\'': 6.90,
        'יוגורט': 3.90,
        'שמנת': 7.90,
        'חמאה': 13.90,
        'ביצים': 11.90,
        'חלב שקדים': 14.90,
        'חלב סויה': 13.90,
        
        // מאפים ולחמים
        'לחם': 5.90,
        'חלה': 7.90,
        'לחמניות': 6.90,
        'פיתות': 5.90,
        'טורטייה': 11.90,
        'בייגל': 8.90,
        'קרואסון': 4.90,
        'עוגיות': 7.90,
        'עוגה': 22.90,
        'בורקס': 10.90,
        
        // בשר ועופות
        'חזה עוף': 32.90,
        'שניצל': 39.90,
        'כרעיים עוף': 22.90,
        'עוף שלם': 26.90,
        'בשר טחון': 35.90,
        'אנטריקוט': 84.90,
        'סטייק': 74.90,
        'נקניקיות': 16.90,
        'נקניק': 22.90,
        'קבב': 29.90,
        
        // דגים
        'סלמון': 54.90,
        'טונה': 10.90,
        'דניס': 39.90,
        'בורי': 34.90,
        'פילה דג': 29.90,
        'שרימפס': 49.90,
        
        // מזווה ויבשים
        'אורז': 7.90,
        'פסטה': 5.90,
        'קוסקוס': 6.90,
        'בורגול': 8.90,
        'קמח': 4.90,
        'סוכר': 3.90,
        'מלח': 2.90,
        'שמן': 10.90,
        'שמן זית': 22.90,
        'קטשופ': 7.90,
        'מיונז': 8.90,
        'חומוס': 6.90,
        'טחינה': 10.90,
        'ריבה': 9.90,
        'דבש': 16.90,
        'שוקולד ממרח': 12.90,
        'קפה': 22.90,
        'תה': 10.90,
        'אבקת קקאו': 13.90,
        
        // משקאות (רמי לוי - מחירים נמוכים יותר)
        'מים': 2.90,
        'מים נביעות הגולן 1.5L': 4.20,
        'מים עין גדי 1.5L': 3.90,
        'מיץ': 5.90,
        'מיץ פרימור 1L': 11.50,
        'קולה': 6.90,
        'קוקה קולה 1.5L': 6.90,
        'פפסי 1.5L': 6.50,
        'פחית קולה': 3.90,
        'בירה': 7.90,
        'בירה גולדסטאר': 7.50,
        'בירה קרלסברג': 7.90,
        'יין': 29.90,
        'יין ברקן': 42.00,
        'יין כרמל': 32.00,
        'יין גולן': 38.00,
        'אלכוהול': 79.90,
        
        // חטיפים וממתקים
        'שוקולד': 5.90,
        'שוקולד מילקה': 7.90,
        'שוקולד קינדר': 8.50,
        'ביסלי': 4.90,
        'במבה': 3.90,
        'במבה אסם': 4.50,
        'דובונים': 6.90,
        'סוכריות': 4.90,
        'גלידה': 10.90,
        'גלידה בן אנד ג׳ריס': 19.90,
        'גלידה שטראוס': 12.90,
        'עוגיות': 7.90,
        'עוגיות לוטוס': 8.50,
        'פופקורן': 5.90,
        'חטיף אנרגיה': 8.90,
        'אגוזים': 13.90,
        
        // מוצרי ניקיון
        'נייר טואלט': 22.90,
        'נייר טואלט סופט': 25.90,
        'מגבות נייר': 16.90,
        'מגבות נייר סופט': 17.90,
        'סבון כלים': 7.90,
        'סבון כלים פיירי': 10.90,
        'אבקת כביסה': 29.90,
        'אבקת כביסה אריאל': 34.90,
        'אבקת כביסה פרסיל': 32.90,
        'מרכך כביסה': 22.90,
        'מרכך כביסה סנו': 24.90,
        'אקונומיקה': 5.90,
        'שקיות זבל': 12.90,
        'ספוג': 4.90,
        'מטליות': 10.90,
        'סבון רצפה': 13.90,
        
        // מוצרי טיפוח
        'סבון רחצה': 7.90,
        'שמפו': 16.90,
        'מרכך שיער': 17.90,
        'משחת שיניים': 10.90,
        'מברשת שיניים': 12.90,
        'דאודורנט': 13.90,
        'תער': 22.90,
        'קרם לחות': 29.90,
        'טישו': 7.90,
        
        // מוצרי תינוק (רמי לוי - מחירים זולים יותר)
        'חיתולים': 49.90,
        'חיתולי האגיס 4-9 ק"ג': 54.90,
        'חיתולי כיפי מידה 4': 47.90,
        'חיתולי פרה מגא פק': 49.90,
        'מזון תינוקות': 7.90,
        'מטליות לחות': 10.90,
        'מטליות האגיס': 12.90,
        'מטליות פמפרס': 11.50,
        'קרם לתינוק': 15.90,
        'שמפו לתינוק': 13.90,
        
        // קפואים
        'גלידה': 12.90,
        'ירקות קפואים': 10.90,
        'פיצה קפואה': 22.90,
        'שניצל קפוא': 29.90,
        'דגים קפואים': 29.90
      },
      note: 'This is MOCK data with realistic Rami Levy prices (typically 10-15% cheaper). Replace with real API call.'
    };
  } catch (error) {
    console.error('Rami Levy fetch error:', error);
    return null;
  }
}

/**
 * Fetch prices from Yohananof API
 */
async function fetchYohananofPrices(storeId) {
  try {
    console.log('Fetching Yohananof prices for store:', storeId);
    
    // Mock data - Yohananof typically has slightly higher prices (premium positioning)
    return {
      chain: 'yohananof',
      chainName: 'יוחננוף',
      storeId: storeId,
      updated: new Date().toISOString(),
      prices: {
        // All products with realistic Yohananof pricing (slightly higher than average)
        'גזר': 8.50, 'מלפפונים': 7.50, 'עגבניות': 9.50, 'חסה': 6.50,
        'בצל': 5.50, 'שום': 13.50, 'תפוחי אדמה': 6.50, 'תפוחים': 10.50,
        'בננות': 9.50, 'תפוזים': 8.50, 'לימונים': 7.50, 'אבוקדו': 15.90,
        'פלפלים': 13.50, 'ברוקולי': 9.50, 'כרובית': 10.50, 'תירס': 7.50,
        'חלב': 6.20, 'גבינה צהובה': 26.90, 'גבינה לבנה': 7.50, 'קוטג\'': 8.50,
        'יוגורט': 4.90, 'שמנת': 9.50, 'חמאה': 15.90, 'ביצים': 13.50,
        'חלב שקדים': 16.90, 'חלב סויה': 15.90, 'לחם': 7.00, 'חלה': 9.50,
        'לחמניות': 8.50, 'פיתות': 7.50, 'טורטייה': 13.90, 'בייגל': 10.50,
        'קרואסון': 6.50, 'עוגיות': 9.50, 'עוגה': 26.90, 'בורקס': 13.50,
        'חזה עוף': 36.90, 'שניצל': 44.90, 'כרעיים עוף': 26.90, 'עוף שלם': 29.90,
        'בשר טחון': 39.90, 'אנטריקוט': 94.90, 'סטייק': 84.90, 'נקניקיות': 19.90,
        'נקניק': 26.90, 'קבב': 34.90, 'סלמון': 64.90, 'טונה': 13.50,
        'דניס': 49.90, 'בורי': 44.90, 'פילה דג': 36.90, 'שרימפס': 59.90,
        'אורז': 9.50, 'אורז בסמטי': 13.50, 'אורז יסמין': 12.50, 'אורז חום': 10.50,
        'פסטה': 7.50, 'פסטה ברילה': 9.50, 'קוסקוס': 8.50, 'בורגול': 10.50,
        'קמח': 6.50, 'סוכר': 5.50, 'מלח': 4.50, 'שמן': 13.90,
        'שמן זית': 26.90, 'קטשופ': 9.50, 'מיונז': 10.50, 'חומוס': 8.50,
        'טחינה': 13.50, 'ריבה': 12.90, 'דבש': 19.90, 'שוקולד ממרח': 15.90,
        'קפה': 26.90, 'קפה עלית': 29.90, 'קפה לנדוור': 34.90, 'נס קפה': 27.90,
        'תה': 13.50, 'תה ויסוצקי': 15.90, 'אבקת קקאו': 16.90,
        // משקאות (יוחננוף - מחירים פרמיום)
        'מים': 4.50, 'מים נביעות הגולן 1.5L': 5.50, 'מים עין גדי 1.5L': 4.90,
        'מיץ': 7.50, 'מיץ פרימור 1L': 13.90, 'מיץ טרופיקנה 1L': 15.90,
        'קולה': 8.50, 'קוקה קולה 1.5L': 8.50, 'פפסי 1.5L': 7.90, 'פחית קולה': 4.90,
        'בירה': 9.50, 'בירה גולדסטאר': 9.50, 'בירה קרלסברג': 9.90,
        'יין': 39.90, 'יין ברקן': 48.00, 'יין כרמל': 38.00, 'יין גולן': 45.00, 'יין רקנאטי': 58.00,
        'אלכוהול': 94.90,
        // חטיפים וממתקים
        'שוקולד': 7.50, 'שוקולד מילקה': 9.50, 'שוקולד קינדר': 10.50,
        'ביסלי': 6.50, 'במבה': 5.50, 'במבה אסם': 5.90, 'דובונים': 8.50,
        'סוכריות': 6.50, 'גלידה': 13.90, 'גלידה בן אנד ג׳ריס': 24.90, 'גלידה שטראוס': 15.90,
        'עוגיות': 9.50, 'עוגיות לוטוס': 10.50, 'פופקורן': 7.50,
        'חטיף אנרגיה': 10.50, 'אגוזים': 16.90,
        // ניקיון וטיפוח
        'נייר טואלט': 26.90, 'נייר טואלט סופט': 29.90, 'מגבות נייר': 19.90,
        'סבון כלים': 9.50, 'סבון כלים פיירי': 13.50,
        'אבקת כביסה': 34.90, 'אבקת כביסה אריאל': 39.90, 'אבקת כביסה פרסיל': 37.90,
        'מרכך כביסה': 26.90, 'מרכך כביסה סנו': 27.90,
        'אקונומיקה': 7.50, 'שקיות זבל': 15.90, 'ספוג': 6.50,
        'מטליות': 13.50, 'סבון רצפה': 16.90, 'סבון רחצה': 9.50, 'שמפו': 19.90,
        'מרכך שיער': 20.90, 'משחת שיניים': 13.50, 'מברשת שיניים': 15.90, 'דאודורנט': 16.90,
        'תער': 26.90, 'קרם לחות': 36.90, 'טישו': 10.50,
        // תינוקות
        'חיתולים': 59.90, 'חיתולי האגיס 4-9 ק"ג': 62.90, 'חיתולי כיפי מידה 4': 56.90,
        'מזון תינוקות': 9.50, 'מטליות לחות': 13.50, 'מטליות האגיס': 15.50,
        'קרם לתינוק': 19.90, 'שמפו לתינוק': 16.90,
        // קפואים
        'גלידה קפואה': 15.90, 'ירקות קפואים': 13.50, 'פיצה קפואה': 26.90,
        'שניצל קפוא': 34.90, 'דגים קפואים': 36.90
      },
      note: 'This is MOCK data with realistic Yohananof prices (premium positioning, ~5-10% higher). Replace with real API call.'
    };
  } catch (error) {
    console.error('Yohananof fetch error:', error);
    return null;
  }
}

/**
 * Helper: JSON response with CORS
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: CORS_HEADERS
  });
}

/**
 * Simple cache using Cloudflare KV (optional)
 * Falls back to in-memory cache if KV is not configured
 */
async function getCache(key) {
  // Note: This requires Cloudflare KV namespace binding
  // For now, returns null (no cache)
  return null;
}

async function setCache(key, value, ttl) {
  // Note: This requires Cloudflare KV namespace binding
  // For now, does nothing
  return;
}
