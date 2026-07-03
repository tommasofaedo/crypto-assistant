const axios = require('axios');

const CRYPTOPANIC_API = 'https://cryptopanic.com/api/free/v1/posts/';

// Punteggio da -1 a +1 basato sui voti di un singolo post
function scorePost(post) {
  const v = post.votes ?? {};
  const bullish = (v.positive ?? 0) + (v.liked ?? 0) + (v.important ?? 0);
  const bearish = (v.negative ?? 0) + (v.disliked ?? 0) + (v.toxic ?? 0);
  const total = bullish + bearish;
  return total === 0 ? 0 : (bullish - bearish) / total;
}

async function getNewsSentiment(symbols) {
  const apiKey = process.env.CRYPTOPANIC_API_KEY;
  if (!apiKey) return {};

  try {
    const r = await axios.get(CRYPTOPANIC_API, {
      params: {
        auth_token: apiKey,
        currencies: symbols.join(','),
        kind: 'news',
      },
      timeout: 10000,
    });

    const posts = r.data?.results ?? [];
    const bySymbol = {};

    for (const post of posts) {
      for (const currency of post.currencies ?? []) {
        const sym = currency.code;
        if (!symbols.includes(sym)) continue;
        if (!bySymbol[sym]) bySymbol[sym] = [];
        bySymbol[sym].push(post);
      }
    }

    const result = {};
    for (const [sym, symPosts] of Object.entries(bySymbol)) {
      const scores = symPosts.map(scorePost);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const newsScore = Math.max(-5, Math.min(5, Math.round(avg * 5)));
      result[sym] = {
        score: newsScore,
        label: newsScore > 1 ? 'positivo' : newsScore < -1 ? 'negativo' : 'neutro',
        headlines: symPosts.slice(0, 3).map(p => p.title),
        count: symPosts.length,
      };
    }

    return result;
  } catch (err) {
    console.warn('[CryptoPanic] Skip:', err.message);
    return {};
  }
}

module.exports = { getNewsSentiment };
