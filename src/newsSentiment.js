// News sentiment: stub in attesa di un'alternativa free valida.
// CryptoPanic ha eliminato il piano free (aprile 2026).
// Opzioni future: CoinGecko community sentiment (/coins/{id}, per-coin call),
// RSS parsing CoinDesk/CoinTelegraph con keyword matching.
async function getNewsSentiment(_symbols) {
  return {};
}

module.exports = { getNewsSentiment };
