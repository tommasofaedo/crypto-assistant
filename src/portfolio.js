const { privateRequest } = require('./cryptoClient');

async function getBalance() {
  const result = await privateRequest('private/user-balance');
  const data = result.data[0];

  return {
    totalAvailable: data.total_available_balance,
    totalMargin: data.total_margin_balance,
    totalCash: data.total_cash_balance,
    isLiquidating: data.is_liquidating,
    positions: (data.position_balances || []).map(p => ({
      currency: p.instrument_name,
      quantity: p.quantity,
      marketValue: p.market_value,
      collateralEligible: p.collateral_eligible,
    })),
  };
}

async function getOpenPositions(instrumentName = null) {
  const params = instrumentName ? { instrument_name: instrumentName } : {};
  const result = await privateRequest('private/get-positions', params);
  const positions = result.data || [];

  return positions.map(p => ({
    instrument: p.instrument_name,
    side: p.side,
    quantity: p.quantity,
    entryPrice: p.avg_entry_price,
    markPrice: p.mark_price,
    unrealizedPnl: p.session_unrealized_pnl,
    leverage: p.leverage,
  }));
}

module.exports = { getBalance, getOpenPositions };
