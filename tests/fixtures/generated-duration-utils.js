/**
 * @file duration-utils.js
 * @description Utility module for formatting durations in milliseconds to human-readable strings and parsing human-readable strings to milliseconds.
 * @author [Your Name]
 */

/**
 * @function formatDuration
 * @description Formats a duration in milliseconds to a human-readable string.
 * @param {number} milliseconds - The duration in milliseconds.
 * @returns {string} A human-readable string representing the duration (e.g., '1d 2h 30m 15s').
 * @throws {TypeError} If the input is not a number.
 * @throws {RangeError} If the input is a negative number.
 * @example
 * const durationString = formatDuration(86400000 + 7200000 + 1800000 + 15000);
 * console.log(durationString); // Output: '1d 2h 30m 15s'
 */
export function formatDuration(milliseconds) {
  if (typeof milliseconds !== 'number') {
    throw new TypeError('Input must be a number');
  }

  if (milliseconds < 0) {
    throw new RangeError('Input must be a non-negative number');
  }

  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const hoursRemaining = hours % 24;
  const minutesRemaining = minutes % 60;
  const secondsRemaining = seconds % 60;

  const parts = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hoursRemaining > 0) {
    parts.push(`${hoursRemaining}h`);
  }
  if (minutesRemaining > 0) {
    parts.push(`${minutesRemaining}m`);
  }
  if (secondsRemaining > 0) {
    parts.push(`${secondsRemaining}s`);
  }

  if (parts.length === 0) {
    return '0s';
  }

  return parts.join(' ');
}

/**
 * @function parseDuration
 * @description Parses a human-readable duration string to milliseconds.
 * @param {string} duration - A human-readable string representing the duration (e.g., '1d 2h 30m 15s').
 * @returns {number} The duration in milliseconds.
 * @throws {TypeError} If the input is not a string.
 * @throws {Error} If the input string is not a valid duration.
 * @example
 * const milliseconds = parseDuration('1d 2h 30m 15s');
 * console.log(milliseconds); // Output: 95415000
 */
export function parseDuration(duration) {
  if (typeof duration !== 'string') {
    throw new TypeError('Input must be a string');
  }

  const parts = duration.split(' ');
  let milliseconds = 0;

  for (const part of parts) {
    const match = part.match(/^(\d+)([dhms])$/);
    if (!match) {
      throw new Error(`Invalid duration part: ${part}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'd':
        milliseconds += value * 24 * 60 * 60 * 1000;
        break;
      case 'h':
        milliseconds += value * 60 * 60 * 1000;
        break;
      case 'm':
        milliseconds += value * 60 * 1000;
        break;
      case 's':
        milliseconds += value * 1000;
        break;
      default:
        throw new Error(`Unsupported unit: ${unit}`);
    }
  }

  return milliseconds;
}