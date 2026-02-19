// src/services/printerService.js
import { Alert } from 'react-native';

/**
 * A dummy print function that shows an alert.
 * This should be replaced with actual Bluetooth printing logic.
 * 
 * @param {object} orderDetails - The details of the order to print.
 */
const printReceipt = (orderDetails) => {
  console.log('Printing order:', orderDetails);

  // Dummmy receipt format
  const receiptText = `
    *** Order Receipt ***
    Order ID: ${orderDetails.id}
    Date: ${new Date(orderDetails.created_at).toLocaleString()}
    
    Items:
    ${orderDetails.order_items.map(item => 
      `${item.quantity}x ${item.product_variant_combinations.products.product_name} (${item.product_variant_combinations.combination_string}) - ₹${item.price}`
    ).join('\n    ')}
    
    Total: ₹${orderDetails.total_amount}
    
    Thank you!
  `;

  Alert.alert(
    "Print Receipt",
    `This is a placeholder for printing. In a real app, this would be sent to a Bluetooth printer.

${receiptText}`,
    [{ text: "OK" }]
  );
  // Here you would implement the logic to connect to a bluetooth printer
  // and send the `receiptText` data for printing.
};

export {
  printReceipt,
  printPreBill,
};

/**
 * A dummy print function for pre-bills that shows an alert.
 * This should be replaced with actual Bluetooth printing logic.
 * 
 * @param {object} cart - The cart object to print a pre-bill for.
 */
const printPreBill = (cart) => {
  console.log('Printing pre-bill for cart:', cart);

  const totalAmount = cart.cart_items.reduce(
    (total, item) => total + item.product_variant_combinations.price * item.quantity,
    0
  );

  const preBillText = `
    *** Pre-Bill / Estimate ***
    Date: ${new Date().toLocaleString()}
    
    Items:
    ${cart.cart_items.map(item => 
      `${item.quantity}x ${item.product_variant_combinations.products.product_name} (${item.product_variant_combinations.combination_string}) - ₹${item.product_variant_combinations.price}`
    ).join('\n    ')}
    
    Total Estimate: ₹${totalAmount.toFixed(2)}
    
    This is not a final bill.
  `;

  Alert.alert(
    "Print Pre-Bill",
    `This is a placeholder for printing. In a real app, this would be sent to a Bluetooth printer.\n\n${preBillText}`,
    [{ text: "OK" }]
  );
};
