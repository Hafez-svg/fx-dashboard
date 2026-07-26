const CONFIG = {
  // API Configuration
  API: {
    TIMEOUT: 8000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 800,
    BASE_URLS: [
      'https://api.frankfurter.dev/v1',
      'https://api.frankfurter.app/v1',
      'https://api.frankfurter.dev/v2'
    ]
  },

  // Analysis Configuration
  ANALYSIS: {
    SHORT_WINDOW: 5,
    LONG_WINDOW: 20,
    DAYS_BACK: 130,
    MIN_DATA_POINTS: 25
  },

  // Currency Pairs
  PAIRS: [
    { base: 'EUR', quote: 'USD', label: 'EUR/USD' },
    { base: 'GBP', quote: 'USD', label: 'GBP/USD' },
    { base: 'USD', quote: 'JPY', label: 'USD/JPY' },
    { base: 'USD', quote: 'CHF', label: 'USD/CHF' },
    { base: 'AUD', quote: 'USD', label: 'AUD/USD' },
    { base: 'USD', quote: 'CAD', label: 'USD/CAD' },
    { base: 'NZD', quote: 'USD', label: 'NZD/USD' },
    { base: 'USD', quote: 'CNY', label: 'USD/CNY' },
    { base: 'USD', quote: 'INR', label: 'USD/INR' },
    { base: 'USD', quote: 'TRY', label: 'USD/TRY' },
    { base: 'USD', quote: 'SEK', label: 'USD/SEK' },
    { base: 'USD', quote: 'ZAR', label: 'USD/ZAR' }
  ],

  // UI Configuration
  UI: {
    ANIMATION_DELAY: 150,
    DEBOUNCE_DELAY: 300,
    NOTIFICATION_DURATION: 3000
  },

  // Storage Keys
  STORAGE: {
    THEME: 'drift-theme',
    DATA_CACHE: 'drift-data-cache',
    SETTINGS: 'drift-settings',
    CACHE_DURATION: 60 * 60 * 1000 // 1 hour
  }
};