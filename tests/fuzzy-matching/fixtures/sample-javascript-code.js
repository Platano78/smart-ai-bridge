function processData(input) {
  if (!input || typeof input !== 'string') {
    throw new TypeError('Input must be a string');
  }

  const normalized = input
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  return normalized;
}

module.exports = { processData };
