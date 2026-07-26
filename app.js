const { useState, useEffect, useMemo, useCallback, useRef } = React;
const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = Recharts;

// ==================== Utilities ====================

function sma(values, window, idx) {
  if (idx < window - 1) return null;
  let sum = 0;
  for (let i = idx - window + 1; i <= idx; i++) sum += values[i];
  return sum / window;
}

function backtest(rates) {
  const values = rates.map((r) => r.value);
  const points = [];
  let correct = 0;
  let total = 0;
  let lastSignal = null;
  let upCount = 0, downCount = 0;

  for (let i = 0; i < values.length; i++) {
    const shortMA = sma(values, CONFIG.ANALYSIS.SHORT_WINDOW, i);
    const longMA = sma(values, CONFIG.ANALYSIS.LONG_WINDOW, i);
    let signal = null;
    if (shortMA !== null && longMA !== null) {
      signal = shortMA > longMA ? 'up' : shortMA < longMA ? 'down' : 'flat';
      if (signal === 'up') upCount++;
      if (signal === 'down') downCount++;
    }
    if (i > 0 && lastSignal && lastSignal !== 'flat') {
      const actualMove = values[i] > values[i - 1] ? 'up' : values[i] < values[i - 1] ? 'down' : 'flat';
      if (actualMove !== 'flat') {
        total += 1;
        if (actualMove === lastSignal) correct += 1;
      }
    }
    points.push({ date: rates[i].date, rate: values[i], shortMA, longMA, signal });
    lastSignal = signal;
  }

  return {
    points,
    accuracy: total > 0 ? correct / total : null,
    correct,
    total,
    latestSignal: points[points.length - 1]?.signal ?? null,
    volatility: calculateVolatility(values),
    upSignals: upCount,
    downSignals: downCount
  };
}

function calculateVolatility(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b) / values.length;
  const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function formatDate(d) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url, timeout = CONFIG.API.TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('درخواست زمان‌شناس (تایم‌اوت)');
    }
    throw e;
  }
}

async function fetchPairData(pair, attempt = 0) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - CONFIG.ANALYSIS.DAYS_BACK);
  const fmt = (d) => d.toISOString().slice(0, 10);

  let lastErr = null;
  for (const baseUrl of CONFIG.API.BASE_URLS) {
    try {
      const url = `${baseUrl}/${fmt(start)}..${fmt(end)}?base=${pair.base}&symbols=${pair.quote}`;
      const json = await fetchJsonWithTimeout(url);
      const entries = Object.entries(json.rates || {})
        .map(([date, obj]) => ({ date, value: obj[pair.quote] }))
        .filter((e) => typeof e.value === 'number')
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      if (entries.length < CONFIG.ANALYSIS.MIN_DATA_POINTS) {
        throw new Error(`فقط ${entries.length} داده دریافت شد`);
      }
      return entries;
    } catch (e) {
      lastErr = e;
      console.warn(`URL ناموفق:`, e.message);
    }
  }

  if (attempt < CONFIG.API.RETRY_ATTEMPTS) {
    await sleep(CONFIG.API.RETRY_DELAY + Math.random() * 600);
    return fetchPairData(pair, attempt + 1);
  }
  throw lastErr || new Error('خطای نامشخص در دریافت داده');
}

// ==================== Components ====================

function MiniChart({ chartData, signal }) {
  const lineColor = signal === 'up' ? '#4ade80' : signal === 'down' ? '#f87171' : '#94a3b8';
  return React.createElement(
    ResponsiveContainer,
    { width: '100%', height: 90 },
    React.createElement(
      LineChart,
      { data: chartData, margin: { top: 4, right: 4, left: 4, bottom: 0 } },
      React.createElement(Line, {
        type: 'monotone',
        dataKey: 'rate',
        stroke: lineColor,
        strokeWidth: 1.75,
        dot: false,
        isAnimationActive: false
      }),
      React.createElement(Line, {
        type: 'monotone',
        dataKey: 'longMA',
        stroke: '#475569',
        strokeWidth: 1,
        dot: false,
        isAnimationActive: false
      })
    )
  );
}

function BigChart({ pairLabel, chartData }) {
  return React.createElement(
    ResponsiveContainer,
    { width: '100%', height: 360 },
    React.createElement(
      LineChart,
      { data: chartData, margin: { top: 8, right: 16, left: 0, bottom: 0 } },
      React.createElement(CartesianGrid, {
        strokeDasharray: '2 5',
        stroke: '#1e293b',
        vertical: false
      }),
      React.createElement(XAxis, {
        dataKey: 'date',
        tick: { fontSize: 11, fill: '#64748b' },
        axisLine: { stroke: '#1e293b' },
        tickLine: false,
        interval: 'preserveStartEnd',
        minTickGap: 40
      }),
      React.createElement(YAxis, {
        tick: { fontSize: 11, fill: '#64748b' },
        axisLine: false,
        tickLine: false,
        domain: ['auto', 'auto'],
        width: 62
      }),
      React.createElement(Tooltip, {
        contentStyle: {
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 8,
          fontSize: 12,
          color: '#e2e8f0'
        },
        labelStyle: { color: '#94a3b8' }
      }),
      React.createElement(Line, {
        type: 'monotone',
        dataKey: 'rate',
        stroke: '#e2e8f0',
        strokeWidth: 1.75,
        dot: false,
        name: pairLabel
      }),
      React.createElement(Line, {
        type: 'monotone',
        dataKey: 'shortMA',
        stroke: '#fb923c',
        strokeWidth: 1.5,
        dot: false,
        name: '5-day MA'
      }),
      React.createElement(Line, {
        type: 'monotone',
        dataKey: 'longMA',
        stroke: '#38bdf8',
        strokeWidth: 1.5,
        dot: false,
        name: '20-day MA'
      })
    )
  );
}

function TrendIcon({ signal, size = 16 }) {
  const color = signal === 'up' ? '#4ade80' : signal === 'down' ? '#f87171' : '#94a3b8';
  if (signal === 'up') {
    return React.createElement(
      'svg',
      { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2.5 },
      React.createElement('polyline', { points: '23 6 13.5 15.5 8.5 10.5 1 18' }),
      React.createElement('polyline', { points: '17 6 23 6 23 12' })
    );
  }
  if (signal === 'down') {
    return React.createElement(
      'svg',
      { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2.5 },
      React.createElement('polyline', { points: '23 18 13.5 8.5 8.5 13.5 1 6' }),
      React.createElement('polyline', { points: '17 18 23 18 23 12' })
    );
  }
  return React.createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2.5 },
    React.createElement('line', { x1: '5', y1: '12', x2: '19', y2: '12' })
  );
}

function LoadingSpinner() {
  return React.createElement(
    'div',
    { className: 'spinner-container' },
    React.createElement('div', { className: 'spinner' })
  );
}

// ==================== Main App ====================

function App() {
  const [dataMap, setDataMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({});
  const [errorMap, setErrorMap] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem(CONFIG.STORAGE.THEME) || 'dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // name, accuracy, volatility

  useEffect(() => {
    document.body.className = theme === 'light' ? 'light-theme' : '';
    localStorage.setItem(CONFIG.STORAGE.THEME, theme);
  }, [theme]);

  const loadAll = useCallback(() => {
    CONFIG.PAIRS.forEach((pair, i) => {
      setLoadingMap((m) => ({ ...m, [pair.label]: true }));
      setErrorMap((m) => ({ ...m, [pair.label]: null }));
      sleep(i * CONFIG.UI.ANIMATION_DELAY)
        .then(() => fetchPairData(pair))
        .then((entries) => {
          setDataMap((m) => ({ ...m, [pair.label]: entries }));
        })
        .catch((e) => {
          console.error(`خطا برای ${pair.label}:`, e);
          setErrorMap((m) => ({ ...m, [pair.label]: e.message || 'بارگذاری ناموفق' }));
        })
        .finally(() => {
          setLoadingMap((m) => ({ ...m, [pair.label]: false }));
        });
    });
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshTick]);

  const results = useMemo(() => {
    const out = {};
    for (const pair of CONFIG.PAIRS) {
      const raw = dataMap[pair.label];
      if (raw) out[pair.label] = backtest(raw);
    }
    return out;
  }, [dataMap]);

  const filteredAndSortedPairs = useMemo(() => {
    let filtered = CONFIG.PAIRS.filter((p) =>
      p.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filtered.sort((a, b) => {
      if (sortBy === 'accuracy') {
        const accA = results[a.label]?.accuracy || 0;
        const accB = results[b.label]?.accuracy || 0;
        return accB - accA;
      } else if (sortBy === 'volatility') {
        const volA = results[a.label]?.volatility || 0;
        const volB = results[b.label]?.volatility || 0;
        return volB - volA;
      }
      return a.label.localeCompare(b.label);
    });

    return filtered;
  }, [searchQuery, sortBy, results]);

  const anyLoading = Object.values(loadingMap).some(Boolean);
  const loadedCount = Object.keys(dataMap).length;

  const expandedPair = expanded ? CONFIG.PAIRS.find((p) => p.label === expanded) : null;
  const expandedResult = expanded ? results[expanded] : null;
  const expandedChartData = expandedResult
    ? expandedResult.points
        .filter((p) => p.longMA !== null)
        .map((p) => ({
          date: formatDate(p.date),
          rate: Number(p.rate.toFixed(4)),
          shortMA: p.shortMA !== null ? Number(p.shortMA.toFixed(4)) : null,
          longMA: p.longMA !== null ? Number(p.longMA.toFixed(4)) : null
        }))
    : [];

  // Export functions
  const exportToCSV = () => {
    if (!expandedResult) return;
    let csv = 'Date,Rate,Short MA,Long MA,Signal\n';
    expandedChartData.forEach((p) => {
      csv += `${p.date},${p.rate},${p.shortMA || ''},${p.longMA || ''},${expandedResult.latestSignal}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${expanded}-export.csv`;
    a.click();
  };

  const exportToJSON = () => {
    if (!expandedResult) return;
    const data = {
      pair: expanded,
      signal: expandedResult.latestSignal,
      accuracy: expandedResult.accuracy,
      volatility: expandedResult.volatility,
      data: expandedChartData
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${expanded}-export.json`;
    a.click();
  };

  return React.createElement(
    'div',
    { className: 'page' },
    React.createElement(
      'div',
      { className: 'container' },
      React.createElement(
        'header',
        { className: 'header' },
        React.createElement(
          'div',
          { className: 'header-top' },
          React.createElement('div', { className: 'wordmark' }, '⇄ DRIFT'),
          React.createElement(
            'div',
            { className: 'controls' },
            React.createElement(
              'button',
              {
                className: 'btn',
                onClick: () => setRefreshTick((t) => t + 1),
                disabled: anyLoading,
                title: 'تازه‌سازی تمام داده‌ها'
              },
              anyLoading ? '✓ در حال بروزرسانی…' : '↻ بروزرسانی'
            ),
            React.createElement(
              'button',
              {
                className: `btn ${theme === 'light' ? 'primary' : ''}`,
                onClick: () => setTheme(theme === 'light' ? 'dark' : 'light'),
                title: 'تغیر تم'
              },
              theme === 'light' ? '🌙 تم تاریک' : '☀️ تم روشن'
            )
          )
        ),
        React.createElement('h1', {}, 'دوازده جفت‌ارز. یک سیگنال صادقانه.'),
        React.createElement(
          'p',
          { className: 'subhead' },
          'هر کارت روند تقاطع میانگین متحرک ۵ روزه و ۲۰ روزه را روی داده‌ی واقعی نرخ ارز بانک مرکزی اروپا نشان می‌دهد. روی هر کارت کلیک کن تا چارت کامل باز شود.'
        ),
        React.createElement('div', { className: 'status-line' }, `${loadedCount} / ${CONFIG.PAIRS.length} جفت‌ارز بارگذاری شد`)
      ),
      React.createElement(
        'div',
        { className: 'toolbar' },
        React.createElement('input', {
          type: 'text',
          className: 'search-box',
          placeholder: 'جستجو در جفت‌ارز…',
          value: searchQuery,
          onChange: (e) => setSearchQuery(e.target.value)
        }),
        React.createElement(
          'select',
          {
            className: 'btn',
            value: sortBy,
            onChange: (e) => setSortBy(e.target.value),
            style: { padding: '8px 12px', fontSize: '12px' }
          },
          React.createElement('option', { value: 'name' }, 'نام'),
          React.createElement('option', { value: 'accuracy' }, 'دقت'),
          React.createElement('option', { value: 'volatility' }, 'نوسان')
        )
      ),
      React.createElement(
        'div',
        { className: 'grid' },
        filteredAndSortedPairs.map((pair) => {
          const raw = dataMap[pair.label];
          const result = results[pair.label];
          const err = errorMap[pair.label];
          const isLoading = loadingMap[pair.label];
          const latest = raw ? raw[raw.length - 1] : null;
          const prev = raw && raw.length > 1 ? raw[raw.length - 2] : null;
          const changePct = latest && prev ? ((latest.value - prev.value) / prev.value) * 100 : null;
          const signal = result?.latestSignal;
          const accuracyPct =
            result?.accuracy !== null && result?.accuracy !== undefined
              ? Math.round(result.accuracy * 1000) / 10
              : null;
          const chartData = result
            ? result.points
                .filter((p) => p.longMA !== null)
                .map((p) => ({
                  date: formatDate(p.date),
                  rate: Number(p.rate.toFixed(4)),
                  longMA: p.longMA !== null ? Number(p.longMA.toFixed(4)) : null
                }))
            : [];

          return React.createElement(
            'div',
            {
              key: pair.label,
              className: `card ${isLoading && !raw ? 'loading' : ''} ${err ? 'error' : ''}`,
              onClick: () => raw && !err && setExpanded(pair.label)
            },
            React.createElement(
              'div',
              { className: 'card-header' },
              React.createElement('span', { className: 'card-pair' }, pair.label),
              signal && React.createElement(TrendIcon, { signal })
            ),
            err && React.createElement('div', { className: 'card-error' }, `⚠️ ${err}`),
            isLoading && !raw && !err && React.createElement(LoadingSpinner),
            raw &&
              result &&
              React.createElement(
                React.Fragment,
                null,
                React.createElement(
                  'div',
                  { className: 'card-rate-row' },
                  React.createElement('span', { className: 'card-rate' }, latest.value.toFixed(4)),
                  changePct !== null &&
                    React.createElement(
                      'span',
                      {
                        className: 'card-delta',
                        style: { color: changePct >= 0 ? '#4ade80' : '#f87171' }
                      },
                      `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
                    )
                ),
                React.createElement(MiniChart, { chartData, signal }),
                React.createElement(
                  'div',
                  { className: 'card-footer' },
                  React.createElement('span', null, 'دقت'),
                  React.createElement(
                    'span',
                    { className: 'card-accuracy' },
                    accuracyPct !== null ? `${accuracyPct}%` : '—'
                  )
                ),
                React.createElement('div', { className: 'expand-hint' }, 'کلیک برای بزرگ‌نمایی ↗')
              )
          );
        })
      ),
      React.createElement(
        'div',
        { className: 'honest-card' },
        React.createElement('div', { className: 'honest-title' }, 'چرا هیچ‌جای این سایت ادعای دقت ۸۰٪ نمی‌کند'),
        React.createElement(
          'p',
          { className: 'honest-text' },
          'بازار ارز در عرض چند ثانیه اخبار و احساسات معامله‌گران را در ��ود جذب می‌کند. تقاطع میانگین متحرک فقط جایی که قیمت قبلاً بوده را توصیف می‌کند. به همین دلیل این سیگنال، مثل هر سیگنال معاملاتی دیگر، معمولاً نزدیک به ۵۰٪ می‌ماند.'
        )
      ),
      React.createElement('footer', {}, 'منبع داده: بانک مرکزی اروپا (ECB) از طریق Frankfurter.dev')
    ),
    expandedPair &&
      expandedResult &&
      React.createElement(
        'div',
        {
          className: 'modal-overlay',
          onClick: () => setExpanded(null)
        },
        React.createElement(
          'div',
          {
            className: 'modal',
            onClick: (e) => e.stopPropagation()
          },
          React.createElement(
            'div',
            { className: 'modal-header' },
            React.createElement('span', { className: 'modal-title' }, expandedPair.label),
            React.createElement(
              'button',
              {
                className: 'close-btn',
                onClick: () => setExpanded(null),
                title: 'بستن'
              },
              '✕'
            )
          ),
          React.createElement(
            'div',
            { className: 'modal-stats' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'modal-stat-label' }, 'سیگنال'),
              React.createElement(
                'div',
                {
                  className: 'modal-stat-value',
                  style: {
                    color:
                      expandedResult.latestSignal === 'up'
                        ? '#4ade80'
                        : expandedResult.latestSignal === 'down'
                        ? '#f87171'
                        : '#94a3b8'
                  }
                },
                expandedResult.latestSignal === 'up'
                  ? 'روند صعودی ↗'
                  : expandedResult.latestSignal === 'down'
                  ? 'روند نزولی ↘'
                  : 'خنثی →'
              )
            ),
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'modal-stat-label' }, 'دقت'),
              React.createElement(
                'div',
                { className: 'modal-stat-value' },
                expandedResult.accuracy !== null ? `${Math.round(expandedResult.accuracy * 1000) / 10}%` : '—'
              )
            ),
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'modal-stat-label' }, 'نوسان'),
              React.createElement(
                'div',
                { className: 'modal-stat-value' },
                `${expandedResult.volatility.toFixed(4)}`
              )
            )
          ),
          React.createElement(BigChart, {
            pairLabel: expandedPair.label,
            chartData: expandedChartData
          }),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' } },
            React.createElement(
              'button',
              {
                className: 'btn',
                onClick: exportToCSV
              },
              '⬇️ دانلود CSV'
            ),
            React.createElement(
              'button',
              {
                className: 'btn',
                onClick: exportToJSON
              },
              '⬇️ دانلود JSON'
            )
          ),
          React.createElement(
            'div',
            { className: 'legend' },
            React.createElement(
              'span',
              { className: 'legend-item' },
              React.createElement('i', { className: 'dot', style: { background: '#e2e8f0' } }),
              ' نرخ'
            ),
            React.createElement(
              'span',
              { className: 'legend-item' },
              React.createElement('i', { className: 'dot', style: { background: '#fb923c' } }),
              ' میانگین ۵ روزه'
            ),
            React.createElement(
              'span',
              { className: 'legend-item' },
              React.createElement('i', { className: 'dot', style: { background: '#38bdf8' } }),
              ' میانگین ۲۰ روزه'
            )
          )
        )
      )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));