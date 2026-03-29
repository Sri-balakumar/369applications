import { fetchProductCostsOdoo } from '@api/services/generalApi';

/**
 * Check if any order lines have prices below cost.
 * Always checks — no settings dependency. Forces popup whenever price < cost.
 * @param {Array} lines - Array of { product_id, product_name, price_unit, qty }
 * @returns {{ hasBelowCost: boolean, belowCostLines: Array }}
 */
export const checkBelowCostLines = async (lines) => {
  // Get product IDs
  const productIds = lines.map(l => l.product_id).filter(Boolean);
  if (productIds.length === 0) {
    return { hasBelowCost: false, belowCostLines: [] };
  }

  // Fetch costs from Odoo
  const costMap = await fetchProductCostsOdoo(productIds);

  // Check each line: if selling price < cost price, flag it
  const belowCostLines = [];
  for (const line of lines) {
    if (!line.product_id) continue;
    const cost = costMap[line.product_id] || 0;
    if (cost <= 0) continue; // Skip products with no cost set

    const unitPrice = Number(line.price_unit) || 0;

    if (unitPrice < cost) {
      const marginPct = ((unitPrice - cost) / cost) * 100;
      belowCostLines.push({
        productId: line.product_id,
        productName: line.product_name || 'Unknown',
        unitPrice,
        costPrice: cost,
        minPrice: cost,
        marginPercent: marginPct,
        qty: Number(line.qty) || 1,
      });
    }
  }

  return {
    hasBelowCost: belowCostLines.length > 0,
    belowCostLines,
  };
};

/**
 * Generate below cost details text for audit log
 */
export const generateBelowCostDetailsText = (belowCostLines) => {
  return belowCostLines.map(l =>
    `Product: ${l.productName} | Price: ${l.unitPrice.toFixed(3)} | Cost: ${l.costPrice.toFixed(3)} | Min Required: ${l.minPrice.toFixed(3)} | Margin: ${l.marginPercent.toFixed(2)}% | Qty: ${l.qty}`
  ).join('\n');
};
