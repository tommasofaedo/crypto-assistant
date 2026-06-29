const axios = require('axios');

async function getFearGreedIndex() {
  const response = await axios.get('https://api.alternative.me/fng/?limit=1');
  const data = response.data.data[0];
  const value = parseInt(data.value);
  return {
    value,
    label: data.value_classification,
    score: fearGreedToScore(value),
  };
}

function fearGreedToScore(value) {
  if (value <= 10) return +10;
  if (value <= 25) return +7;
  if (value <= 45) return +4;
  if (value <= 55) return 0;
  if (value <= 75) return -4;
  if (value <= 90) return -7;
  return -10;
}

module.exports = { getFearGreedIndex };
