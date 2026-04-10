import React from 'react';

export default function CreditGauge({ score = 300 }) {
  const min = 300, max = 850;
  const clamped = Math.max(min, Math.min(max, score));
  const pct = ((clamped - min) / (max - min)) * 100;
  const arcLen = 251;
  const offset = arcLen - (arcLen * pct) / 100;

  const label = clamped >= 750 ? 'Excellent' : clamped >= 650 ? 'Good' : clamped >= 550 ? 'Fair' : clamped >= 450 ? 'Poor' : 'Very Poor';
  const color = clamped >= 750 ? '#10b981' : clamped >= 650 ? '#6366f1' : clamped >= 550 ? '#f59e0b' : '#f43f5e';

  return (
    <div className="gauge-wrap">
      <svg className="gauge-svg" viewBox="0 0 200 120">
        <defs>
          <linearGradient id="gGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="33%" stopColor="#f59e0b" />
            <stop offset="66%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <path className="gauge-track" d="M 20 100 A 80 80 0 0 1 180 100" />
        <path className="gauge-bar" d="M 20 100 A 80 80 0 0 1 180 100"
          stroke="url(#gGrad)" strokeDasharray={arcLen} strokeDashoffset={offset} />
      </svg>
      <div className="gauge-num" style={{ color }}>{clamped}</div>
      <div className="gauge-rating" style={{ color }}>{label}</div>
      <div className="gauge-labels"><span>300</span><span>850</span></div>
    </div>
  );
}
