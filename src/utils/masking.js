export const maskEmail = (email) => {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : name;
  return `${maskedName}@${domain}`;
};

export const maskMobileNumber = (mobile) => {
  if (!mobile) return '';
  if (mobile.length <= 4) return mobile;
  return `******${mobile.substring(mobile.length - 4)}`;
};

export const maskCardNumber = (cardNumber) => {
  if (!cardNumber) return '';
  if (cardNumber.length <= 4) return cardNumber;
  return `************${cardNumber.substring(cardNumber.length - 4)}`;
};