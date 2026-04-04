import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useBindingStore } from '../store/mappingStore';

export function ProfileSelector() {
  const { activeProfile, savedProfiles, saveProfile, loadProfile, refreshProfiles, resetFpsDefaults } = useBindingStore();
  const [newName, setNewName]   = useState('');
  const [selected, setSelected] = useState(activeProfile || '');

  useEffect(() => { refreshProfiles(); }, [refreshProfiles]);
  useEffect(() => { setSelected(activeProfile); }, [activeProfile]);

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim() || activeProfile;
    if (!name) return;
    saveProfile(name);
    setNewName('');
    refreshProfiles();
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Profiles</span>
        <span className="card-badge">{savedProfiles.length} saved</span>
      </div>

      <form className="profile-row" onSubmit={onSave}>
        <input
          type="text"
          value={newName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
          placeholder={activeProfile || 'profile name…'}
        />
        <button type="submit" className="btn btn-primary">Save</button>
      </form>

      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%', marginBottom: 12 }}
        onClick={resetFpsDefaults}
      >
        Load FPS Defaults
      </button>

      {savedProfiles.length > 0 && (
        <div className="profile-list">
          {savedProfiles.map(name => (
            <div
              key={name}
              className={`profile-item ${name === activeProfile ? 'active-profile' : ''}`}
            >
              <span className="profile-name">{name}</span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '3px 10px', fontSize: 11 }}
                onClick={() => {
                  setSelected(name);
                  loadProfile(name);
                }}
              >
                Load
              </button>
            </div>
          ))}
        </div>
      )}

      {savedProfiles.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
          No saved profiles yet.
        </p>
      )}
    </div>
  );
}
