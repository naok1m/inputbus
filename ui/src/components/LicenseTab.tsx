import { useState } from 'react';

export function LicenseTab() {
  const [key, setKey] = useState('');

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">License</span>
        <span className="card-badge">Inactive</span>
      </div>

      <div className="license-notice">
        <div className="license-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="8" y="20" width="32" height="22" rx="4" stroke="#7a7f94" strokeWidth="2" fill="none" />
            <path d="M16 20V14a8 8 0 1 1 16 0v6" stroke="#7a7f94" strokeWidth="2" fill="none" />
            <circle cx="24" cy="31" r="3" fill="#7a7f94" />
            <line x1="24" y1="34" x2="24" y2="38" stroke="#7a7f94" strokeWidth="2" />
          </svg>
        </div>
        <h3 className="license-title">License Protection</h3>
        <p className="license-desc">
          Per-user encryption will prevent unauthorized access to the application.
          This feature is currently under development and will be activated in a future release.
        </p>
      </div>

      <div className="license-form">
        <label className="license-label">License Key</label>
        <div className="profile-row">
          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            disabled
          />
          <button className="btn btn-primary" disabled>
            Activate
          </button>
        </div>
        <p className="license-hint">Contact the developer to obtain a license key.</p>
      </div>
    </div>
  );
}
