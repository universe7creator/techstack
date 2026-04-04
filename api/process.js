// TechStack Analyzer - API Endpoint
// Detects technologies used by any website

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-License-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  try {
    const { url, license_key } = req.body || {};

    // License validation (stateless)
    if (!license_key) {
      return res.status(401).json({
        error: 'License key required',
        code: 'NO_LICENSE_KEY'
      });
    }

    // Validate license key
    try {
      const licenseResponse = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          'Accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${process.env.LEMON_API_KEY || ''}`
        },
        body: JSON.stringify({ license_key })
      });

      if (licenseResponse.ok) {
        const licenseData = await licenseResponse.json();
        if (licenseData.data?.attributes?.status !== 'valid') {
          return res.status(401).json({
            error: 'License key is not valid or expired',
            code: 'LICENSE_EXPIRED'
          });
        }
      }
    } catch (e) {
      // Allow if LemonSqueezy is down - demo mode
      console.log('License check failed, allowing demo:', e.message);
    }

    // URL validation
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    let targetUrl;
    try {
      targetUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format. Must include http:// or https://' });
    }

    // Fetch the website
    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'TechStack-Analyzer/1.0 (https://techstack-analyzer.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    const html = await response.text();

    // Analyze technologies
    const technologies = analyzeTechnologies(html, targetUrl);

    // Get screenshot/meta info
    const metaInfo = extractMetaInfo(html);

    res.status(200).json({
      url: targetUrl.toString(),
      technologies,
      meta: metaInfo,
      analyzed_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('TechStack analysis error:', error);

    if (error.message.includes('fetch failed') || error.code === 'ECONNREFUSED') {
      return res.status(502).json({
        error: 'Could not reach the target website. It may be down or blocking requests.',
        code: 'TARGET_UNREACHABLE'
      });
    }

    res.status(500).json({
      error: 'Analysis failed: ' + error.message,
      code: 'ANALYSIS_ERROR'
    });
  }
};

function analyzeTechnologies(html, url) {
  const technologies = [];
  const htmlLower = html.toLowerCase();

  // Framework detection patterns
  const frameworkPatterns = [
    // JavaScript Frameworks
    { name: 'React', category: 'Frontend', patterns: ['react', 'react-dom', 'create-react-app', '/react/', 'reactjs'] },
    { name: 'Vue.js', category: 'Frontend', patterns: ['vue', 'vuejs', 'nuxt', '/vue/', 'vue.js'] },
    { name: 'Angular', category: 'Frontend', patterns: ['angular', '@angular', 'ng-app', '/angular/'] },
    { name: 'Svelte', category: 'Frontend', patterns: ['svelte', 'sveltekit', '/svelte/'] },
    { name: 'Next.js', category: 'Frontend', patterns: ['next', 'nextjs', '/_next/', '__next'] },
    { name: 'Nuxt.js', category: 'Frontend', patterns: ['nuxt', 'nuxtjs', '__nuxt'] },
    { name: 'SolidJS', category: 'Frontend', patterns: ['solid', 'solidjs', 'solid-js'] },
    { name: 'Alpine.js', category: 'Frontend', patterns: ['alpinejs', 'alpine.js'] },
    { name: 'Preact', category: 'Frontend', patterns: ['preact', 'preact-compat'] },

    // CSS Frameworks
    { name: 'Tailwind CSS', category: 'CSS', patterns: ['tailwind', 'tailwindcss', 'tailwind.min', 'postcss'] },
    { name: 'Bootstrap', category: 'CSS', patterns: ['bootstrap', 'bootstrap.min', '/bootstrap/'] },
    { name: 'Foundation', category: 'CSS', patterns: ['foundation', 'foundation.min'] },
    { name: 'Bulma', category: 'CSS', patterns: ['bulma', 'bulma.min'] },
    { name: 'Materialize', category: 'CSS', patterns: ['materialize', 'materialize.min'] },
    { name: 'Semantic UI', category: 'CSS', patterns: ['semantic', 'semantic.min'] },
    { name: 'Ant Design', category: 'CSS', patterns: ['ant.design', 'antd', 'ant-design'] },
    { name: 'Chakra UI', category: 'CSS', patterns: ['chakra-ui', '@chakra-ui'] },
    { name: 'Radix UI', category: 'CSS', patterns: ['@radix-ui', 'radix-ui'] },

    // Backend & Server
    { name: 'Node.js', category: 'Backend', patterns: ['node', 'express', 'koa', 'fastify', 'hapi'] },
    { name: 'Python', category: 'Backend', patterns: ['django', 'flask', 'fastapi', 'py/', '.py'] },
    { name: 'Ruby on Rails', category: 'Backend', patterns: ['rails', 'ruby-on-rails', 'actionpack'] },
    { name: 'PHP', category: 'Backend', patterns: ['php', 'laravel', 'symfony', 'wordpress', 'wp-content'] },
    { name: 'ASP.NET', category: 'Backend', patterns: ['asp.net', 'aspnet', '__viewstate', 'webforms'] },
    { name: 'Go', category: 'Backend', patterns: ['golang', 'go-', '/go/'] },
    { name: 'Laravel', category: 'Backend', patterns: ['laravel', 'vendor/laravel'] },

    // CMS
    { name: 'WordPress', category: 'CMS', patterns: ['wp-content', 'wp-includes', 'wordpress', 'wp-json'] },
    { name: 'Shopify', category: 'CMS', patterns: ['shopify', 'cdn.shopify', 'shopify.com'] },
    { name: 'Webflow', category: 'CMS', patterns: ['webflow', 'webflow.io', 'wfuuid'] },
    { name: 'Wix', category: 'CMS', patterns: ['wix', 'wixsite', 'wixapps'] },
    { name: 'Squarespace', category: 'CMS', patterns: ['squarespace', 'static.squarespace'] },
    { name: 'Ghost', category: 'CMS', patterns: ['ghost', 'ghost.org', '/ghost/'] },
    { name: 'Strapi', category: 'CMS', patterns: ['strapi', '/api/', '-strapi'] },
    { name: 'Contentful', category: 'CMS', patterns: ['contentful', 'contentful.com'] },
    { name: 'Sanity', category: 'CMS', patterns: ['sanity', 'sanity.io'] },

    // E-commerce
    { name: 'Shopify', category: 'E-commerce', patterns: ['shopify', 'cdn.shopify'] },
    { name: 'WooCommerce', category: 'E-commerce', patterns: ['woocommerce', 'wc-', 'wp-json/wc'] },
    { name: 'Magento', category: 'E-commerce', patterns: ['magento', '/media/', 'block-cache'] },
    { name: 'BigCommerce', category: 'E-commerce', patterns: ['bigcommerce', 'bigcommerce.com'] },
    { name: 'Gumroad', category: 'E-commerce', patterns: ['gumroad', 'gumroad.com', 'gum.co'] },

    // Analytics & Tracking
    { name: 'Google Analytics', category: 'Analytics', patterns: ['googletagmanager', 'gtag', 'google-analytics', 'ga('] },
    { name: 'Hotjar', category: 'Analytics', patterns: ['hotjar', 'static.hotjar'] },
    { name: 'Mixpanel', category: 'Analytics', patterns: ['mixpanel', 'cdn.mxpnl'] },
    { name: 'Segment', category: 'Analytics', patterns: ['segment', 'cdn.segment', 'analytics.js'] },
    { name: 'Plausible', category: 'Analytics', patterns: ['plausible', 'plausible.io'] },
    { name: 'Fathom', category: 'Analytics', patterns: ['usefathom', 'fathomcdn'] },

    // CDN & Hosting
    { name: 'Vercel', category: 'Hosting', patterns: ['vercel', 'vercel.app', '__next_data'] },
    { name: 'Netlify', category: 'Hosting', patterns: ['netlify', 'netlify.app', '_netlify'] },
    { name: 'Cloudflare', category: 'CDN', patterns: ['cloudflare', '__cf', 'cloudflare.com'] },
    { name: 'AWS', category: 'Hosting', patterns: ['amazonaws', 's3.', 'cloudfront'] },
    { name: 'Firebase', category: 'Hosting', patterns: ['firebase', 'firebaseapp', 'firebaseio'] },
    { name: 'Heroku', category: 'Hosting', patterns: ['heroku', 'herokuapp', '.herokuapp'] },

    // Font & Icons
    { name: 'Google Fonts', category: 'Fonts', patterns: ['fonts.googleapis', 'fonts.gstatic'] },
    { name: 'Font Awesome', category: 'Icons', patterns: ['font-awesome', 'fontawesome', 'fa-', 'fa-brands'] },
    { name: 'IconFont', category: 'Icons', patterns: ['iconfont', 'iconfont.cn'] },

    // Marketing & SEO
    { name: 'HubSpot', category: 'Marketing', patterns: ['hs-scripts', 'hubspot', 'hs-analytics'] },
    { name: 'Mailchimp', category: 'Marketing', patterns: ['mailchimp', 'mailchi.mp', 'mc-validate'] },
    { name: 'Intercom', category: 'Support', patterns: ['intercom', 'intercomcdn', 'widget.intercom'] },
    { name: 'Drift', category: 'Support', patterns: ['drift', 'driftt', 'drift.com'] },
    { name: 'Zendesk', category: 'Support', patterns: ['zendesk', 'zdassets', 'zendesk.com'] },

    // Search
    { name: 'Algolia', category: 'Search', patterns: ['algolia', 'algoliasearch', 'instantsearch'] },
    { name: 'MeiliSearch', category: 'Search', patterns: ['meilisearch', 'meili'] },
    { name: 'Typesense', category: 'Search', patterns: ['typesense', 'typesense.org'] },

    // Databases
    { name: 'MongoDB', category: 'Database', patterns: ['mongodb', 'mongo', 'mongoose'] },
    { name: 'PostgreSQL', category: 'Database', patterns: ['postgresql', 'postgres', 'pg-'] },
    { name: 'Redis', category: 'Database', patterns: ['redis', 'ioredis'] },
    { name: 'Supabase', category: 'Database', patterns: ['supabase', 'supabase.co'] },

    // Other
    { name: 'jQuery', category: 'JavaScript', patterns: ['jquery', 'jquery-ui', 'jQuery'] },
    { name: 'Three.js', category: '3D', patterns: ['three', 'three.js', 'threejs'] },
    { name: 'WebGL', category: '3D', patterns: ['webgl', 'three'] },
    { name: 'PWA', category: 'Progressive Web App', patterns: ['service-worker', 'manifest.json', 'pwa'] },
  ];

  const detectedCategories = {};

  for (const framework of frameworkPatterns) {
    for (const pattern of framework.patterns) {
      if (htmlLower.includes(pattern.toLowerCase())) {
        if (!detectedCategories[framework.category]) {
          detectedCategories[framework.category] = [];
        }
        if (!detectedCategories[framework.category].includes(framework.name)) {
          detectedCategories[framework.category].push(framework.name);
        }
        break;
      }
    }
  }

  // Convert to array format
  for (const [category, items] of Object.entries(detectedCategories)) {
    for (const item of items) {
      technologies.push({ name: item, category });
    }
  }

  // Detect server from headers
  const serverHeader = html.match(/<meta name="generator" content="([^"]+)"/i);
  if (serverHeader) {
    technologies.push({ name: serverHeader[1], category: 'Generator' });
  }

  return technologies;
}

function extractMetaInfo(html) {
  const meta = {};

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    meta.title = titleMatch[1].trim();
  }

  // Extract meta description
  const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
                    html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i);
  if (descMatch) {
    meta.description = descMatch[1].trim();
  }

  // Extract meta keywords
  const keywordsMatch = html.match(/<meta[^>]+name="keywords"[^>]+content="([^"]+)"/i);
  if (keywordsMatch) {
    meta.keywords = keywordsMatch[1].trim();
  }

  // Extract og:image
  const ogImageMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (ogImageMatch) {
    meta.ogImage = ogImageMatch[1];
  }

  // Extract favicon
  const faviconMatch = html.match(/<link[^>]+rel="(?:shortcut )?icon"[^>]+href="([^"]+)"/i);
  if (faviconMatch) {
    meta.favicon = faviconMatch[1];
  }

  // Extract viewport
  const viewportMatch = html.match(/<meta[^>]+name="viewport"[^>]+content="([^"]+)"/i);
  if (viewportMatch) {
    meta.viewport = viewportMatch[1];
  }

  // Extract theme color
  const themeColorMatch = html.match(/<meta[^>]+name="theme-color"[^>]+content="([^"]+)"/i);
  if (themeColorMatch) {
    meta.themeColor = themeColorMatch[1];
  }

  return meta;
}