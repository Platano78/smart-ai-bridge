/**
 * String utilities
 */

/**
 * Capitalizes the first letter of a given string.
 * @example
 * capitalize('hello'); // Returns: 'Hello'
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Reverses the order of characters in a given string.
 * @example
 * reverse('world'); // Returns: 'dlrow'
 */
function reverse(str) {
  return str.split('').reverse().join('');
}

module.exports = { capitalize, reverse };
